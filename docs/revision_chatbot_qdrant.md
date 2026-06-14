# Revision del flujo CHATBOT Y QDRANT

## Problemas encontrados

1. El webhook activo no usa el nodo AI Agent.

El nodo `When chat message received` esta conectado a `Question and Answer Chain`, no a `AI Agent`. Por eso el nodo `Simple Memory`, el modelo del agente y la herramienta `Qdrant Vector Store1` no participan en las respuestas reales del chat.

Impacto: aunque el flujo tenga memoria y agente configurados, el chat real funciona como una cadena RAG simple sin esa memoria.

2. El prompt del `Question and Answer Chain` obligaba a usar solo contexto recuperado.

El prompt decia que la respuesta debia basarse en el contexto recuperado desde Qdrant. Esto choca con los datos directos que manda la aplicacion desde la ficha del negocio.

Impacto: si Qdrant no recupera el documento exacto, el modelo puede decir que no tiene datos directos aunque la app se los haya enviado en la pregunta.

Correccion aplicada: el prompt ahora prioriza los datos directos del negocio seleccionado y usa Qdrant como complemento.

3. Los metadatos de ingesta estaban mal mapeados.

El nodo `Default Data Loader` buscaba:

- `$json.metadata.city.name`
- `$json.metadata.category`
- `$json.metadata.name`

Pero el nodo `Code in JavaScript` generaba:

- `metadata.barrio`
- `metadata.sector`
- `metadata.nombre`

Impacto: los metadatos guardados en Qdrant podian quedar vacios o incorrectos, dificultando encontrar negocios por barrio, categoria o nombre.

Correccion aplicada: el loader ahora usa `metadata.barrio`, `metadata.sector` y `metadata.nombre`.

4. El codigo de ingesta podia fallar si un negocio no tenia barrio.

Antes usaba `b.barrio.name` directamente.

Impacto: si algun documento no trae `barrio`, la ingesta puede romperse.

Correccion aplicada: ahora usa `b.barrio?.name || ''`.

5. El contenido indexado en Qdrant era demasiado pobre.

Antes se indexaban pocos campos: nombre, ciudad, categoria, tipo, direccion, telefono, horario y score.

Impacto: preguntas sobre web, reseñas, gap o comentarios tenian poca base documental.

Correccion aplicada: se añadieron al contenido indexado `category`, `subcategory`, `has_website`, `reviews`, `gap` y hasta 5 comentarios.

6. Hay nodos de borrar y crear coleccion que no estan conectados al flujo manual de ingesta.

Los nodos `Delete Collection` y `HTTP Request` existen, pero no forman parte de la cadena que empieza en `When clicking Execute workflow`.

Impacto: si la coleccion no existe, o si quieres regenerarla desde cero, hay que ejecutar esos nodos manualmente o conectarlos en orden.

Recomendacion: para reindexar desde cero, ejecutar o conectar: `Delete Collection` -> `HTTP Request` -> `Find documents` -> `Loop Over Items` -> `Code in JavaScript` -> `Qdrant Vector Store`.

7. El nombre de la coleccion tiene una errata: `shops_embbeding`.

No rompe si todos los nodos usan el mismo nombre, pero puede causar confusion.

Recomendacion: mantenerlo si ya hay datos cargados, o renombrar a `shops_embedding` en todos los nodos y recrear la coleccion.

## Cambios aplicados en el JSON

- Corregido el mapeo de metadatos del `Default Data Loader`.
- Mejorado el nodo `Code in JavaScript` para indexar mas datos del negocio.
- Evitado fallo por `b.barrio.name` cuando falta barrio.
- Ajustado el prompt del `Question and Answer Chain` para priorizar datos directos de la ficha y usar Qdrant como complemento.
- Validado que el JSON resultante sigue siendo valido.

## Recomendacion principal

Despues de importar este workflow corregido en n8n, conviene regenerar la coleccion de Qdrant para que los documentos queden indexados con los nuevos campos.

Si no se reindexa, el prompt mejorara las respuestas con los datos directos que envia la app, pero Qdrant seguira teniendo documentos antiguos con menos informacion.
