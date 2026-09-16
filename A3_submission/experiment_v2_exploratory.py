r"""A3 exploratory rerun: CLIP zero-shot vs CLIP + logistic regression.

Run from PowerShell inside A3_experiment:

    .\.venv\Scripts\python.exe -B experiment_v2_exploratory.py

This keeps the original split membership, allows crops to have changed since the
first evaluation, records exactly which files changed, and writes results to a
new JSON without overwriting the original evaluation.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

sys.dont_write_bytecode = True

import numpy as np
import open_clip
from PIL import Image, ImageOps
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
import torch

ROOT = Path(__file__).resolve().parent
LABELS = ["round", "rectangular"]
PROMPTS = ["a photo of a round table", "a photo of a rectangular table"]
SEED = 42
OUTPUT = ROOT / "experiment_results_v2_exploratory.json"


def sha256_file(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load_split():
    """
    Keep the original train/test membership and labels.

    Unlike the first evaluation, changed crops are allowed because this rerun is
    explicitly exploratory. Every changed file is recorded so the report can be
    transparent about test-set contamination.
    """
    manifest = json.loads((ROOT / "split_manifest.json").read_text("utf-8"))
    rows = manifest["files"]

    seen = set()
    changed_files = []

    for row in rows:
        if row["label"] not in LABELS or row["split"] not in ("train", "test"):
            raise ValueError("Etiqueta o partición no válida en el manifiesto.")

        path = ROOT / row["destination"]
        if not path.exists():
            raise FileNotFoundError(f"Falta una imagen del reparto: {path}")

        current_digest = sha256_file(path)
        original_digest = row["sha256"]

        if current_digest != original_digest:
            changed_files.append({
                "file": row["destination"],
                "split": row["split"],
                "label": row["label"],
                "original_sha256": original_digest,
                "current_sha256": current_digest,
            })

        if current_digest in seen:
            raise ValueError(f"Imagen duplicada en el reparto actual: {path.name}")
        seen.add(current_digest)

    for split in ("train", "test"):
        for label in LABELS:
            if not any(r["split"] == split and r["label"] == label for r in rows):
                raise ValueError(f"Faltan ejemplos en {split}/{label}.")

    return rows, changed_files


def encode_images(rows, model, preprocess):
    """Convert each crop into a normalized CLIP embedding."""
    vectors = []

    with torch.inference_mode():
        for index, row in enumerate(rows, start=1):
            with Image.open(ROOT / row["destination"]) as image:
                image = ImageOps.exif_transpose(image).convert("RGB")
                image = ImageOps.pad(
                    image,
                    (224, 224),
                    method=Image.Resampling.BICUBIC,
                    color=(123, 117, 104),
                )
                tensor = preprocess(image).unsqueeze(0)

            vector = model.encode_image(tensor).float()
            vector = vector / vector.norm(dim=-1, keepdim=True)
            vectors.append(vector.cpu().numpy()[0])

            print(f"  {row['split']}: {index}/{len(rows)}", flush=True)

    return np.stack(vectors)


def metrics(actual, predicted):
    """Confusion matrix uses rows=true label, columns=prediction."""
    return {
        "correct": int(np.sum(actual == predicted)),
        "total": len(actual),
        "accuracy": float(accuracy_score(actual, predicted)),
        "macro_f1": float(
            f1_score(
                actual,
                predicted,
                labels=[0, 1],
                average="macro",
                zero_division=0,
            )
        ),
        "confusion_matrix": confusion_matrix(
            actual, predicted, labels=[0, 1]
        ).tolist(),
    }


def main():
    parser = argparse.ArgumentParser(description="Repetición exploratoria; no evaluación independiente.")
    parser.add_argument("--output", default=OUTPUT.name, help="Nombre de un JSON nuevo junto al programa")
    parser.add_argument("--checkpoint", type=Path, help="Pesos locales .safetensors; si falta, descarga OpenAI")
    parser.add_argument("--check-only", action="store_true", help="Verificar datos sin cargar CLIP")
    args = parser.parse_args()
    if Path(args.output).name != args.output or not args.output.endswith(".json"):
        parser.error("--output debe ser un nombre .json sin carpetas")
    output = ROOT / args.output
    if args.check_only:
        rows, changes = load_split()
        print(f"Datos verificados: {len(rows)} imágenes, {len(changes)} recortes cambiados.")
        return
    if output.exists():
        raise FileExistsError(
            f"Ya existe {output.name}. Usa --output con otro nombre."
        )

    torch.manual_seed(SEED)
    np.random.seed(SEED)
    torch.set_num_threads(min(4, os.cpu_count() or 1))

    rows, changed_files = load_split()

    # Verificar los pesos locales contra la ejecución que se entrega.
    checkpoint_hash = None
    if args.checkpoint:
        checkpoint_hash = sha256_file(args.checkpoint)
        reference = json.loads((ROOT / "experiment_results.json").read_text("utf-8"))
        if checkpoint_hash != reference["checkpoint_sha256"]:
            raise ValueError("El checkpoint no coincide con los pesos de la evaluación original.")

    train = [r for r in rows if r["split"] == "train"]
    test = [r for r in rows if r["split"] == "test"]

    y_train = np.array([LABELS.index(r["label"]) for r in train])
    y_test = np.array([LABELS.index(r["label"]) for r in test])

    print("Cargando CLIP en CPU…", flush=True)
    model, _, preprocess = open_clip.create_model_and_transforms(
        "ViT-B-32",
        pretrained=str(args.checkpoint) if args.checkpoint else "openai",
        force_quick_gelu=True,
        device="cpu",
    )

    model.eval()
    tokenizer = open_clip.get_tokenizer("ViT-B-32")

    print(
        f"Rerun exploratorio: {len(changed_files)} imagen(es) cambiaron "
        "desde la evaluación original.",
        flush=True,
    )

    print("Extrayendo vectores de entrenamiento…", flush=True)
    x_train = encode_images(train, model, preprocess)

    classifier = LogisticRegression(
        C=1.0,
        max_iter=1000,
        random_state=SEED,
    )
    classifier.fit(x_train, y_train)

    print("Evaluación exploratoria sobre el mismo split de test…", flush=True)
    x_test = encode_images(test, model, preprocess)

    with torch.inference_mode():
        text_vectors = model.encode_text(tokenizer(PROMPTS)).float()
        text_vectors = text_vectors / text_vectors.norm(dim=-1, keepdim=True)

    similarities = x_test @ text_vectors.cpu().numpy().T
    zero_shot = similarities.argmax(axis=1)

    few_shot = classifier.predict(x_test)

    majority = np.bincount(y_train, minlength=2).argmax()
    baseline = np.full(len(y_test), majority)

    result = {
        "evaluation_type": "exploratory_post_error_analysis",
        "independent_test": False,
        "reason_not_independent": (
            "Some crops were revised after inspecting errors from the first run. "
            "This rerun therefore measures an exploratory preprocessing change, "
            "not an independent estimate of generalisation."
        ),
        "seed": SEED,
        "model": "CLIP ViT-B-32 / OpenAI, frozen",
        "pretrained_weights": "openai",
        "local_checkpoint_sha256": checkpoint_hash,
        "prompts": PROMPTS,
        "preprocessing": (
            "EXIF transpose, RGB, bicubic letterbox to 224x224, "
            "padding RGB(123,117,104), OpenCLIP normalization"
        ),
        "classifier": (
            "LogisticRegression(C=1.0, max_iter=1000), normalized CLIP vectors"
        ),
        "train_count": len(train),
        "test_count": len(test),
        "changed_file_count": len(changed_files),
        "changed_files": changed_files,
        "matrix_label_order": LABELS,
        "majority_baseline": metrics(y_test, baseline),
        "zero_shot": metrics(y_test, zero_shot),
        "few_shot": metrics(y_test, few_shot),
        "predictions": [
            {
                "file": r["destination"],
                "actual": r["label"],
                "zero_shot": LABELS[int(z)],
                "few_shot": LABELS[int(f)],
            }
            for r, z, f in zip(test, zero_shot, few_shot)
        ],
        "limitations": [
            "Exploratory rerun after inspecting first-run errors; test set is not independent.",
            "Small, manually selected sample: results do not establish production reliability.",
            "Manual crops: evaluates shape classification, not base detection or the full pipeline.",
            "Exact duplicates checked; room separation relies on user review.",
            "Binary task excludes squares and ambiguous shapes; no unknown handling evaluated.",
            "Prompts and classifier hyperparameters were kept unchanged from the original run.",
        ],
    }

    with output.open("x", encoding="utf-8") as file:
        json.dump(result, file, indent=2, ensure_ascii=False)

    for name in ("majority_baseline", "zero_shot", "few_shot"):
        score = result[name]
        print(
            f"{name}: {score['correct']}/{score['total']} correctas "
            f"({score['accuracy']:.1%}), F1 macro = {score['macro_f1']:.3f}"
        )

    print(f"Resultados guardados en {output.name}")


if __name__ == "__main__":
    main()
