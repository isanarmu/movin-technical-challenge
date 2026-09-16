# NOTES — B3 Inventory Confirmation Screen

## Qué hice

Construí una pantalla en React + TypeScript para que el cliente pueda revisar el inventario detectado antes de confirmar su mudanza.

El usuario puede:

- revisar los objetos agrupados por habitación;
- modificar cantidades;
- eliminar y recuperar objetos;
- añadir objetos que falten;
- añadir una foto;
- identificar elementos que necesitan revisión;
- ver el volumen actualizado en todo momento;
- confirmar y visualizar exactamente qué datos se enviarían.

También añadí estados de carga, error y contenido vacío, y adapté la interfaz para móvil siguiendo la identidad visual de MOVIN.

Una decisión sobre la que dudé fue cómo mostrar la confianza del modelo. Decidí no enseñar porcentajes al cliente y utilizar simplemente `Needs review` cuando la confianza es inferior a 0.8. El umbral es provisional y debería validarse con datos reales.

## Qué dejé fuera deliberadamente

No añadí backend, autenticación ni persistencia porque no formaban parte del ejercicio.

Las modificaciones y las fotos añadidas existen únicamente durante la sesión y se pierden al recargar la página.

Tampoco intenté calcular automáticamente el volumen de los objetos añadidos por el usuario.

## Elementos incompletos o limitaciones

El sistema utiliza un umbral de confianza fijo de 0.8 que no ha sido calibrado con datos reales.

Las fotografías añadidas sirven únicamente como parte de la interfaz y no se almacenan.

El ejercicio utiliza un fixture estático y no una respuesta real del modelo de Computer Vision.

---

## Objeto sin volumen

Si un objeto tiene `volumeM3: null`, no lo trato como volumen cero porque eso produciría un total engañoso.

Muestro el volumen conocido y aviso claramente de que el total está incompleto.

Por ejemplo:

`Known volume: 10.30 m³`

`1 item needs a volume estimate · Total is incomplete`

Preferí esto a ocultar el problema o dejar de mostrar por completo el volumen disponible.

## Eliminación de objetos

Elegí un sistema de **Remove + Undo**.

Cuando el usuario elimina un objeto, este permanece visible como eliminado y puede recuperarlo inmediatamente.

Preferí esto frente a mostrar una ventana de confirmación cada vez porque permite corregir errores sin interrumpir continuamente la revisión del inventario.

Los objetos eliminados no se incluyen en el volumen ni en la confirmación final.

## Qué comprobaría antes de llevarlo a producción

Antes de utilizarlo con clientes reales comprobaría principalmente:

- accesibilidad con lectores de pantalla;
- funcionamiento en más dispositivos y navegadores;
- comportamiento con inventarios mucho más grandes;
- calibración del umbral de confianza;
- persistencia de cambios y fotografías;
- validación de los cálculos de volumen;
- pruebas con usuarios reales para comprobar si entienden claramente `Needs review` y el volumen incompleto.

La interfaz se ha probado también a 375 px de ancho para comprobar el comportamiento móvil.

## Parte más débil

La parte más débil es el tratamiento de objetos sin volumen.

La interfaz avisa correctamente de que el total está incompleto, pero el usuario no tiene todavía una forma sencilla de resolver ese problema salvo añadir o modificar información manualmente.

En un producto real intentaría obtener esa estimación automáticamente o pedir al usuario únicamente la información mínima necesaria para calcularla.