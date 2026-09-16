# MOVIN — A3 Growing the Taxonomy

## Qué leer

- `A3_report.md`: informe principal (aproximadamente 2.500 palabras).
- `experiment_results.json`: primera evaluación registrada: zero-shot 16/20, regresión logística 12/20.
- `experiment_results_v2_exploratory.json`: segunda evaluación, exploratoria: 17/20 y 14/20.
- `experiment.py`: código inicial, con protección frente a cambios de imágenes y sobrescritura.
- `experiment_v2_exploratory.py`: repetición exploratoria con registro de cambios.
- `split_manifest.json`: pertenencia original a train/test, etiquetas y hashes.
- `train/` y `test/`: 58 recortes de entrenamiento y 20 de prueba actuales.
- `round/`: copias auxiliares; los scripts no las usan.
- `requirements.txt`: versiones del entorno utilizado (Python 3.12, Windows, CPU).

## Límite importante

Los cuatro recortes modificados tras analizar errores están en `test/round`.
Sus hashes originales y actuales están en el JSON exploratorio. No se han localizado
copias de los cuatro recortes originales. Por ello, el resultado inicial se conserva
como evidencia registrada, pero no puede reproducirse exactamente con esta entrega.
No cambies los hashes del manifiesto para ocultarlo. La segunda prueba no es independiente.

Los scripts se ajustaron después de las ejecuciones registradas para facilitar su uso.
Se verificaron datos, sintaxis y métricas; no se volvió a ejecutar inferencia durante
la preparación de la entrega. La mejora observada no prueba fiabilidad en producción.

## Comprobar los datos en este ordenador

Abre PowerShell dentro de `A3_submission`. Usa el entorno ya instalado:

```powershell
& '..\A3_experiment\.venv\Scripts\python.exe' -B experiment_v2_exploratory.py --check-only
```

Esta orden comprueba archivos, etiquetas y hashes. No carga CLIP ni evalúa fotos.
El resultado esperado es 78 imágenes y 4 recortes cambiados.

## Repetir únicamente la evaluación exploratoria

Desde la misma carpeta, usa el archivo local de pesos ya descargado:

```powershell
$clipFile = Get-ChildItem -LiteralPath '..\A3_experiment\models' -Recurse -Filter 'open_clip_model.safetensors' | Select-Object -First 1
& '..\A3_experiment\.venv\Scripts\python.exe' -B experiment_v2_exploratory.py --checkpoint $clipFile.FullName --output reproduction_exploratory.json
```

El JSON se escribe junto al programa. No se crean carpetas por estas instrucciones.
Si ese nombre ya existe, el programa se detiene: elige un nombre nuevo sin borrar
las evaluaciones anteriores. Volver a ejecutar no aporta un test independiente.

## Para quien reciba la entrega

Con un entorno Python 3.12 disponible, instala las dependencias en ese entorno:

```powershell
python -m pip install -r requirements.txt
python -B experiment_v2_exploratory.py --check-only
python -B experiment_v2_exploratory.py --output reproduction_exploratory.json
```

Sin `--checkpoint`, OpenCLIP descarga los pesos públicos de OpenAI y su gestor puede
crear una caché local; requiere conexión. Los pesos no se incluyen en la entrega.
También se puede pasar `--checkpoint` apuntando a un archivo local. Los resultados
registrados identifican SHA-256 del checkpoint:
`e6d1bd7789aa45192b3bf90570a789b478bae1b74ebcce7eddd908e83a2b7c31`.
Las dependencias fijadas corresponden a Windows; otras plataformas pueden necesitar
una distribución de PyTorch adecuada a su sistema.

## Qué se evalúa

CLIP congelado transforma los recortes en vectores normalizados. Se compara la
similitud con dos textos fijos frente a una regresión logística entrenada solo en
train (C=1). El baseline siempre predice la clase mayoritaria de train.
No se entrenó ni evaluó un detector: los recortes son manuales.
No se optimizaron parámetros usando este test. No hay backend ni despliegue en A3.
