r"""A3: comparar CLIP zero-shot con CLIP + regresión logística.

Ejecutar desde PowerShell, dentro de A3_experiment:
    .\.venv\Scripts\python.exe -B experiment.py

Usa recortes y etiquetas revisados por una persona, NO un detector de mesas.
No crea carpetas. Guarda resultados en experiment_results.json, junto al script.
"""

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
# Fijamos las descripciones y el clasificador ANTES de ver los resultados.
PROMPTS = ["a photo of a round table", "a photo of a rectangular table"]
SEED = 42
OUTPUT = ROOT / "experiment_results.json"


def load_split():
    """Leer el reparto guardado y comprobar que las fotos no han cambiado."""
    manifest = json.loads((ROOT / "split_manifest.json").read_text("utf-8"))
    rows = manifest["files"]
    seen = set()
    for row in rows:
        if row["label"] not in LABELS or row["split"] not in ("train", "test"):
            raise ValueError("Etiqueta o partición no válida en el manifiesto.")
        path = ROOT / row["destination"]
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != row["sha256"]:
            raise ValueError(f"La imagen ha cambiado desde el reparto: {path.name}")
        if digest in seen:
            raise ValueError(f"Imagen duplicada en el reparto: {path.name}")
        seen.add(digest)
    for split in ("train", "test"):
        for label in LABELS:
            if not any(r["split"] == split and r["label"] == label for r in rows):
                raise ValueError(f"Faltan ejemplos en {split}/{label}.")
    return rows


def encode_images(rows, model, preprocess):
    """Convertir cada recorte en un vector, sin modificar los pesos de CLIP."""
    vectors = []
    with torch.inference_mode():
        for index, row in enumerate(rows, start=1):
            with Image.open(ROOT / row["destination"]) as image:
                image = ImageOps.exif_transpose(image).convert("RGB")
                # Añadir márgenes conserva el tablero completo y su proporción.
                image = ImageOps.pad(image, (224, 224),
                                     method=Image.Resampling.BICUBIC,
                                     color=(123, 117, 104))
                tensor = preprocess(image).unsqueeze(0)
            vector = model.encode_image(tensor).float()
            vector = vector / vector.norm(dim=-1, keepdim=True)
            vectors.append(vector.cpu().numpy()[0])
            print(f"  {row['split']}: {index}/{len(rows)}", flush=True)
    return np.stack(vectors)


def metrics(actual, predicted):
    """La matriz usa filas = etiqueta real; columnas = predicción."""
    return {
        "correct": int(np.sum(actual == predicted)),
        "total": len(actual),
        "accuracy": float(accuracy_score(actual, predicted)),
        "macro_f1": float(f1_score(actual, predicted, labels=[0, 1],
                                   average="macro", zero_division=0)),
        "confusion_matrix": confusion_matrix(actual, predicted, labels=[0, 1]).tolist(),
    }


def main():
    # Evitamos sobrescribir una evaluación anterior sin querer.
    if OUTPUT.exists():
        raise FileExistsError(f"Ya existe {OUTPUT.name}. Conserva esa evaluación.")
    torch.manual_seed(SEED)
    np.random.seed(SEED)
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    rows = load_split()
    train = [r for r in rows if r["split"] == "train"]
    test = [r for r in rows if r["split"] == "test"]
    y_train = np.array([LABELS.index(r["label"]) for r in train])
    y_test = np.array([LABELS.index(r["label"]) for r in test])

    print("Cargando CLIP en CPU…", flush=True)
    model, _, preprocess = open_clip.create_model_and_transforms(
        "ViT-B-32", pretrained="openai",
        device="cpu",
    )
    # Las imágenes llegan cuadradas con márgenes, sin deformar el tablero.
    model.eval()
    tokenizer = open_clip.get_tokenizer("ViT-B-32")

    print("Extrayendo vectores de entrenamiento…", flush=True)
    x_train = encode_images(train, model, preprocess)
    classifier = LogisticRegression(C=1.0, max_iter=1000, random_state=SEED)
    classifier.fit(x_train, y_train)

    # Solo ahora se usan las imágenes reservadas. No se ajusta nada con ellas.
    print("Evaluación final sobre las imágenes reservadas…", flush=True)
    x_test = encode_images(test, model, preprocess)
    with torch.inference_mode():
        text_vectors = model.encode_text(tokenizer(PROMPTS)).float()
        text_vectors = text_vectors / text_vectors.norm(dim=-1, keepdim=True)
    # Zero-shot: elegir la descripción más parecida a la imagen.
    similarities = x_test @ text_vectors.cpu().numpy().T
    zero_shot = similarities.argmax(axis=1)
    # Few-shot: el clasificador ha aprendido solo con los vectores de train.
    few_shot = classifier.predict(x_test)
    majority = np.bincount(y_train, minlength=2).argmax()
    baseline = np.full(len(y_test), majority)

    result = {
        "seed": SEED,
        "model": "CLIP ViT-B-32 / OpenAI, frozen",
        "pretrained_weights": "openai",
        "prompts": PROMPTS,
        "preprocessing": "EXIF transpose, RGB, bicubic letterbox to 224x224, padding RGB(123,117,104), OpenCLIP normalization",
        "classifier": "LogisticRegression(C=1.0, max_iter=1000), normalized CLIP vectors",
        "train_count": len(train),
        "test_count": len(test),
        "matrix_label_order": LABELS,
        "majority_baseline": metrics(y_test, baseline),
        "zero_shot": metrics(y_test, zero_shot),
        "few_shot": metrics(y_test, few_shot),
        "predictions": [
            {"file": r["destination"], "actual": r["label"],
             "zero_shot": LABELS[int(z)], "few_shot": LABELS[int(f)]}
            for r, z, f in zip(test, zero_shot, few_shot)
        ],
        "limitations": [
            "Small, manually selected sample: results do not establish production reliability.",
            "Manual crops: evaluates shape classification, not base detection or the full pipeline.",
            "Exact duplicates checked; room separation relies on user review.",
            "Binary task excludes squares and ambiguous shapes; no unknown handling evaluated.",
            "Do not tune prompts or hyperparameters against this test set.",
        ],
    }
    with OUTPUT.open("x", encoding="utf-8") as file:
        json.dump(result, file, indent=2, ensure_ascii=False)
    for name in ("majority_baseline", "zero_shot", "few_shot"):
        score = result[name]
        print(f"{name}: {score['correct']}/{score['total']} correctas "
              f"({score['accuracy']:.1%}), F1 macro = {score['macro_f1']:.3f}")
    print(f"Resultados guardados en {OUTPUT.name}")


if __name__ == "__main__":
    main()
