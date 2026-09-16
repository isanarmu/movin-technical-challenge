# A3 — Growing the Taxonomy

## 1. Propuesta de esquema de etiquetas

Usaría un enfoque jerárquico en lugar de crear una clase de detección distinta para cada posible variante.

El detector principal mantendría clases amplias y estables como `table`, `sofa`, `bed` o `wardrobe`. Después, una segunda etapa se encargaría de predecir atributos o variantes del objeto detectado.

Por ejemplo:

- `table`
  - forma: redonda / rectangular / desconocida
  - tamaño: pequeña / mediana / grande
  - plazas: 4 / 6 / desconocido
- `sofa`
  - tipo: estándar / seccional
  - estilo: moderno / vintage / desconocido
  - fragilidad: normal / especial / desconocido

Elegiría este enfoque porque evita que el número de clases crezca de forma combinatoria. Si cada combinación se convierte en una clase independiente, acabaríamos teniendo etiquetas como `round_wooden_4_seat_table` o `vintage_sectional_sofa`, y cada una necesitaría suficientes ejemplos propios.

Separar objeto y atributos también permite que el sistema siga detectando una `table` incluso cuando no tiene suficiente confianza para decidir su forma o tamaño.

En esos casos prefiero devolver `unknown` antes que forzar una clasificación incorrecta.

---

### Contrato y reglas de etiquetado

Un registro propuesto sería `object_class: table`, `attributes.shape: round`, `attribute_source: model`, `schema_version: 1`. Cada atributo tendría su estado desconocido y procedencia (modelo, cliente o anotador). La forma y las plazas serían campos independientes; una corrección humana se conservaría separada de la predicción. No deduciría fragilidad de la palabra vintage.

En este experimento, round significa tablero circular; rectangular, tablero rectangular alargado. Excluimos cuadrados, ovalados y casos ambiguos. Etiquetamos la mesa del recorte, no todos los objetos de la habitación. En producción, esos casos exigirían ampliar el esquema o responder unknown. Una muestra con dos anotadores permitiría medir desacuerdos y revisar las reglas antes de ampliar el etiquetado; aquí no se realizó esa medición.

Las clases planas son sencillas para pocas variantes, pero multiplican combinaciones. Un modelo conjunto de detección y atributos podría compartir cálculo, a cambio de acoplar entrenamiento y despliegue. La propuesta de dos etapas permite actualizar atributos por separado, pero añade latencia y hereda los errores de localización del detector. Esta prueba solo evalúa la segunda etapa con recortes humanos.

## 2. Proceso para añadir una nueva clase o variante

Cuando negocio solicita una nueva categoría, primero comprobaría si la distinción es realmente útil para el presupuesto y si puede reconocerse visualmente de forma consistente.

Después seguiría este proceso:

1. Definir claramente la nueva clase o atributo.
2. Confirmar con negocio qué impacto tiene sobre el presupuesto o la operativa.
3. Revisar el dataset existente para localizar ejemplos relevantes.
4. Crear unas reglas de etiquetado claras.
5. Etiquetar una muestra pequeña y equilibrada.
6. Hacer primero un experimento de viabilidad.
7. Evaluar el resultado con imágenes reservadas.
8. Analizar los errores y casos ambiguos.
9. Ampliar el dataset solamente si el experimento muestra que la distinción es aprendible.
10. Comparar la nueva versión con la anterior para comprobar que no degrada otras clases.
11. Desplegarla progresivamente.
12. Seguir recogiendo casos reales para mejorarla.

No desplegaría una nueva variante únicamente porque tenga una accuracy alta. También comprobaría si los errores son aceptables para el negocio.

Por ejemplo, confundir una mesa redonda con una rectangular puede afectar a la planificación, pero probablemente tenga menos impacto que no detectar un piano o un armario grande.

---

Antes de publicar, acordaría con negocio límites de falsos positivos, omisiones y coste de revisión por clase. Los comprobaría sobre viviendas distintas de las usadas para entrenar, junto con regresiones en las clases antiguas. El piloto empezaría con revisión humana y una versión anterior disponible para revertirlo. Este experimento no fija ni valida umbrales de aceptación automática. La similitud de CLIP tampoco equivale directamente a una probabilidad calibrada.

## 3. Experimento realizado

Para comprobar si una variante concreta era visualmente distinguible, elegí la clase `table` y la dividí en dos variantes:

- `round`
- `rectangular`

Preparé una pequeña muestra a partir del dataset proporcionado.

El conjunto utilizado finalmente contenía:

- 58 imágenes para entrenamiento.
- 20 imágenes reservadas para test.
- 10 mesas redondas y 10 rectangulares en test.

Los objetos fueron recortados manualmente para que el experimento evaluase principalmente la capacidad de distinguir la forma de la mesa, y no la capacidad de localizarla dentro de una habitación.

El reparto se hizo por categoría con semilla 42: 28 redondas y 30 rectangulares en train, y 10 de cada clase en test. Se comprobaron duplicados exactos mediante SHA-256. La separación de habitaciones se basa en la revisión de la candidata; no hubo una auditoría automática de imágenes parecidas. La selección de casos claros introduce un sesgo respecto a fotos reales difíciles.

Utilicé CLIP ViT-B/32 con los pesos congelados y comparé tres enfoques. Los recortes se ajustan a 224 × 224 con márgenes, conservando proporciones; se normalizan los vectores. La regresión logística usa C=1 y máximo 1.000 iteraciones, sin optimización sobre test. Los prompts se fijaron antes de evaluar. Macro F1 resume precisión y sensibilidad de ambas clases por igual; acompaña al recuento de aciertos para mostrar desequilibrios.

### Baseline

Como referencia utilicé una clasificación por clase mayoritaria.

Resultado:

- Accuracy: 50 %
- Macro F1: 0,333

El baseline siempre elige rectangular, la clase mayoritaria en entrenamiento (30 frente a 28). Es una referencia de comparación, no un límite inferior garantizado.

### CLIP zero-shot

Utilicé los prompts:

- `a photo of a round table`
- `a photo of a rectangular table`

CLIP compara la representación de la imagen con ambas descripciones y selecciona la más cercana.

Resultado:

- 16 de 20 imágenes correctas.
- Accuracy: 80 %
- Macro F1: 0,792

Las 10 mesas rectangulares fueron clasificadas correctamente.

De las 10 mesas redondas, 6 fueron clasificadas correctamente y 4 fueron confundidas con rectangulares.

### CLIP + regresión logística

También extraje los embeddings de CLIP y entrené una regresión logística sobre las 58 imágenes de entrenamiento.

Resultado:

- 12 de 20 correctas.
- Accuracy: 60 %
- Macro F1: 0,524

En esta muestra, entrenar un clasificador adicional con pocos ejemplos no mejoró el zero-shot de CLIP.

Esto me parece un resultado útil porque demuestra que añadir entrenamiento no implica necesariamente mejorar el sistema cuando el dataset es pequeño.

---

## 4. Análisis de errores

Al revisar los cuatro errores de CLIP zero-shot observé problemas relacionados con la calidad de entrada.

En varias imágenes:

- la mesa ocupaba una parte pequeña de la imagen;
- aparecían numerosos muebles alrededor;
- la forma del tablero no quedaba suficientemente clara;
- elementos como manteles dificultaban ver su geometría.

Hice una segunda ejecución modificando únicamente los recortes de esas cuatro imágenes.

No cambié los prompts, el modelo ni los hiperparámetros.

Resultados exploratorios:

- CLIP zero-shot: 85 %
- CLIP + regresión logística: 70 %

CLIP pasó de 16/20 a 17/20 aciertos.

La regresión logística pasó de 12/20 a 14/20.

No considero esta segunda ejecución una evaluación independiente porque los recortes fueron modificados después de observar los errores del primer test.

Por eso mantengo el 80 % de la primera ejecución como resultado principal.

La segunda prueba sugiere sensibilidad al aislamiento del objeto. Son cambios sobre errores conocidos; no constituyen una mejora validada sobre fotos nuevas.

En producción, esto sugiere que una buena detección inicial del objeto puede ser tan importante como el propio clasificador de atributos.

---

### Trazabilidad y límites de reproducción

Los cuatro archivos revisados son `3398.jpg`, `2438.jpg`, `5069.jpg` y `5263.jpg`. Los JSON conservan predicciones por imagen y los hashes anteriores y posteriores. La entrega contiene los recortes revisados; no se han localizado copias con los hashes de los cuatro recortes originales. Por ello, la primera ejecución se conserva como evidencia registrada, pero no es exactamente reproducible con las imágenes entregadas. El script inicial rechaza esos cambios intencionadamente.

La segunda ejecución puede repetirse con el conjunto actual. Los scripts de entrega se adaptaron para facilitar la carga de pesos y la elección de un archivo de salida nuevo; no se ha repetido la inferencia tras esos ajustes. Las métricas registradas se han contrastado con sus predicciones. Con solo 20 fotos, cada error cambia cinco puntos porcentuales: no afirmo fiabilidad de producción ni superioridad estadística concluyente. Tampoco puedo descartar solapamiento con los datos públicos del preentrenamiento de CLIP.

## 5. ¿Cuántos ejemplos necesita una nueva clase?

No creo que exista un número único válido para todas las clases.

Una silla corriente puede tener mucha menos variación visual que una categoría como `vintage sofa`.

Por eso utilizaría un proceso progresivo.

### Fase de viabilidad

Empezaría con aproximadamente 50–100 ejemplos claramente etiquetados.

El objetivo no sería crear un modelo de producción, sino responder una pregunta:

> ¿Existe suficiente señal visual para que esta distinción sea aprendible?

Si el resultado es malo incluso con ejemplos claros, revisaría primero la definición de la clase antes de invertir en más etiquetado.

### Primera versión candidata

Si el experimento es prometedor, ampliaría progresivamente hasta varios cientos de ejemplos, intentando cubrir:

- diferentes ángulos;
- iluminación;
- tamaños;
- habitaciones;
- oclusiones;
- estilos;
- fondos diferentes.

También buscaría equilibrio entre variantes.

No entrenaría una clase con 500 ejemplos casi idénticos de un mismo tipo de habitación.

### Coste

El coste depende principalmente del tiempo de selección, anotación y revisión.

Como estimación de planificación, asumiría que revisar y etiquetar correctamente una imagen puede llevar aproximadamente entre medio minuto y varios minutos dependiendo de la tarea.

Por ejemplo, si una nueva variante necesitase 300 imágenes y el proceso medio costase un minuto por imagen, serían unas 5 horas de etiquetado puro.

Después habría que añadir:

- revisión de calidad;
- preparación del dataset;
- entrenamiento;
- evaluación;
- análisis de errores.

Por eso, para una variante sencilla, estimaría inicialmente uno o dos días de trabajo para obtener una primera evaluación útil, no una versión definitiva de producción.

Para concretar dinero, usaría este supuesto interno de planificación, no una tarifa de mercado: 20 €/hora de anotación y revisión, y 35 €/hora de ingeniería. Para 300 imágenes: selección y anotación, 5 h × 20 € = 100 €; revisión, 2 h × 20 € = 40 €; preparación, experimento y análisis, 6 h × 35 € = 210 €. Total de trabajo: 350 € y 13 horas-persona. Reservaría además 0–20 € de cómputo, un presupuesto hipotético, no un gasto medido. Calendario estimado: dos jornadas con datos disponibles. Buscar una clase rara, revisar el histórico o entrenar un detector requiere presupuesto adicional. Nada de esto garantiza un volumen suficiente para producción.

La decisión de seguir invirtiendo debería depender del valor que esa variante aporte al negocio.

---

## 6. Añadir una clase nueva como `piano`

Existe un problema importante si añadimos `piano` después de haber etiquetado miles de imágenes.

Es posible que las 5.000 imágenes históricas contengan pianos que nunca fueron etiquetados porque esa clase todavía no existía.

Si entrenamos directamente con esos datos, el modelo puede interpretar esos pianos sin etiqueta como fondo.

Eso introduce señales contradictorias.

No revisaría manualmente las 5.000 imágenes desde cero.

Primero intentaría localizar posibles pianos automáticamente utilizando un modelo existente, búsqueda mediante embeddings o un modelo open-vocabulary.

Después:

1. generar candidatos;
2. revisar manualmente esos candidatos;
3. añadir las etiquetas correctas;
4. incluir ejemplos negativos;
5. entrenar la nueva versión;
6. comparar resultados con la versión anterior.

La búsqueda de candidatos puede omitir pianos. Auditaría también una muestra aleatoria de los no seleccionados para estimar omisiones. Las imágenes no revisadas no deberían tratarse sin más como negativos fiables para piano: marcaría su anotación como incompleta y usaría soporte de etiquetas parciales o las excluiría de esa supervisión hasta revisarlas. Versionaría la taxonomía y el estado de revisión por imagen.

También mantendría ejemplos de las clases antiguas para comprobar que introducir `piano` no deteriora el rendimiento del resto del sistema.

---

## 7. Qué debería resolver la visión artificial y qué debería preguntarse al cliente

No intentaría resolver todos los atributos mediante Computer Vision.

Cada nueva clasificación visual aumenta:

- coste de etiquetado;
- complejidad;
- posibilidad de errores;
- mantenimiento del sistema.

Usaría visión artificial cuando la información sea visual, relativamente objetiva y costosa para el cliente de introducir manualmente.

Por ejemplo:

### Buenos candidatos para visión artificial

- mesa redonda o rectangular;
- sofá estándar o seccional;
- cama individual o doble;
- presencia de objetos grandes;
- número aproximado de sillas.

### Mejores candidatos para preguntar al cliente

- si un objeto es especialmente frágil;
- si tiene valor sentimental;
- si necesita embalaje especial;
- si un mueble se desmonta;
- si un sofá debería considerarse vintage;
- información que no puede deducirse de una fotografía.

También combinaría ambos sistemas.

Si el modelo tiene alta confianza, puede completar el atributo automáticamente.

Si tiene baja confianza, podría preguntar al cliente algo sencillo como:

> ¿Esta mesa es redonda o rectangular?

Esto convierte al propio cliente en una fuente de corrección del sistema sin obligarle a completar todo el inventario manualmente.

---

## 8. Uso del tráfico de producción para mejorar el modelo

Utilizaría un enfoque de active learning.

No enviaría todas las fotografías nuevas a etiquetado.

Priorizaría casos como:

- baja confianza;
- desacuerdo entre modelos;
- objetos desconocidos;
- clases poco frecuentes;
- imágenes muy diferentes de las vistas durante entrenamiento;
- correcciones realizadas por clientes.

El flujo podría ser:

1. cliente sube fotografías;
2. el sistema genera inventario y atributos;
3. el cliente corrige errores;
4. esas correcciones se almacenan;
5. se seleccionan los casos más útiles;
6. una persona revisa las etiquetas;
7. se incorporan al siguiente ciclo de entrenamiento.

También mantendría un conjunto de test estable que no se utilizase para tomar decisiones de entrenamiento.

De esta forma podríamos comprobar si las nuevas versiones mejoran realmente y evitar adaptar el sistema únicamente a los errores que acabamos de observar.

---

## 9. Conclusiones

El pequeño experimento no demuestra que el sistema esté preparado para producción.

La muestra es demasiado pequeña y además los recortes fueron realizados manualmente.

Sin embargo, sí aporta evidencia de que la forma `round` frente a `rectangular` es una variante razonablemente aprendible.

CLIP zero-shot alcanzó un 80 % de accuracy en el primer test independiente, claramente por encima del baseline del 50 %.

Añadir una regresión logística con esta pequeña muestra no mejoró el resultado, Esto no identifica la causa: podrían influir la muestra, la regularización o la representación. Compararía alternativas usando únicamente validación interna de entrenamiento antes de obtener un nuevo test.

El análisis posterior sugiere sensibilidad al recorte; la mejora de uno y dos aciertos no permite cuantificar su efecto general.

Mi propuesta para hacer crecer la taxonomía sería por tanto:

1. Mantener clases principales estables.
2. Representar variantes mediante atributos.
3. Hacer experimentos pequeños antes de invertir en etiquetado masivo.
4. Permitir `unknown` cuando el modelo no tenga suficiente confianza.
5. Preguntar al cliente cuando sea más barato y fiable que inferir.
6. Utilizar correcciones reales y active learning para mejorar el sistema progresivamente.

El objetivo no sería que el modelo respondiese siempre, sino que supiese cuándo su respuesta es suficientemente fiable y cuándo necesita ayuda humana.