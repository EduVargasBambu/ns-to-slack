# Centro de Autorización: más datos por factura y orden por subsidiaria — Diseño

Fecha: 25 nov 2026. Estado: aprobado por el usuario (25 nov).

## Intención

Los usuarios del negocio pidieron que el Centro de Autorización se parezca a la interfaz anterior (el prototipo `../../NS to Slack/SL_Aprobaciones_P2P.js`), que mostraba todas las columnas de una búsqueda guardada. Hay dos posturas:

- **El administrador** quiere ver todo.
- **El usuario (dueño del proyecto)** advierte que una tabla con muchas columnas se ve mal en el celular y los aprobadores terminarán rechazándola.

Se acordó **una sola página con dos niveles de detalle**: una vista compacta con lo necesario para decidir, y el resto disponible sin salir de la página. Además, los CEOs revisan por empresa, así que la **subsidiaria es el primer orden** dentro de cada nivel.

Ahora importa más que antes: los CEOs aprueban por enlace externo y **no pueden abrir la factura en NetSuite**. Todo lo que necesiten para decidir tiene que estar en la página.

## Objetivos

1. Dentro de cada grupo (concentrado → nivel), separar por **subsidiaria** y, dentro de cada una, por moneda (USD → MXN → otras), con subtotales.
2. Mostrar en cada factura, a la vista: proveedor, **descripción del proveedor**, prioridad, **folio** (`tranid`, que ya incluye la serie), **fecha de la factura**, vencimiento, **nota** (memo de la factura) y monto.
3. **"Ver detalle"** por factura: todas las columnas de la búsqueda guardada de pendientes (`customsearch_gpv_slack_pending_bills`) con sus etiquetas, igual que el CSV del lunes.
4. **"Vista completa"** solo en escritorio: un botón que cambia las tablas a una tabla ancha con todas las columnas de la búsqueda, como el prototipo. Es la versión para mostrarle al administrador.
5. Que funcione igual en el Centro interno y en el modo externo de los CEOs.

## Fuera de alcance

- Que cada CEO vea solo su empresa. **Los dos ven todo**: la subsidiaria solo ordena, la cadena de aprobación no cambia.
- Ver el PDF o las líneas de la factura.
- Cambiar el CSV del lunes.
- Botones de aprobación dentro de Slack.

## Lo que haría fracasar el cambio

- Que en el celular haya que deslizar de lado para leer una fila de la vista compacta.
- Que el orden o los datos de arriba dependan de columnas que alguien puede quitar de la búsqueda guardada.
- Que el detalle muestre en modo externo algo que lleve a NetSuite, como un enlace a la factura.

## Restricciones

- Las del proyecto: código en inglés y textos en español, SuiteScript 2.1 AMD, JSDoc + checkJs, Jest, ESLint/Prettier, SDF Account Customization.
- La página sigue en HTML + JS sin framework (`ui/gpv_approval_center.html`). Preact se descartó por ahora.
- La búsqueda guardada se crea en la UI y no viaja con SDF. Si no está configurada, el Centro no falla: solo no aparecen el detalle ni la vista completa.
- Gobernanza: hoy la carga del Centro hace una búsqueda de líneas, más la de prioridades y la de niveles. Este cambio agrega como máximo **una** búsqueda (la guardada, filtrada a las facturas mostradas).

## Enfoques considerados

- **A. Datos fijos por código y detalle desde la búsqueda guardada (elegido).** La subsidiaria, el folio, las fechas, la nota y la descripción se leen directo de la factura y del proveedor, como hoy la prioridad. La búsqueda guardada alimenta solo "Ver detalle" y la "Vista completa". El orden nunca se rompe y el administrador agrega columnas sin pedir código.
- **B. Todo desde la búsqueda guardada,** incluidos el orden y los datos de arriba. Es más flexible, pero si alguien quita o renombra una columna se rompe el orden sin aviso, y el código tendría que adivinar qué columna es cuál. Era el problema del prototipo.
- **C. Solo datos fijos,** sin búsqueda guardada. Es lo más simple, pero no cumple lo que pide el administrador y cada dato nuevo requiere código.

El usuario eligió A.

## Lo decidido

### Datos

- **Campo nuevo en el proveedor:** "Descripción de proveedor", `custentity_gpv_vendor_description`, de tipo texto. Se crea con SDF junto a `custentity_gpv_vendor_priority`, en `src/Objects/Fields/Entity/`. Se lee en la misma búsqueda de líneas, con un join al proveedor.
- Cada línea del Centro (`PendingLine`) suma: `subsidiary` (nombre de la subsidiaria de la factura), `billDate` (`trandate`), `memo` (memo de la línea principal) y `vendorDescription`. Todo sale del join a la factura y al proveedor en `searchLines` (`gpv_pending_lines_lib.js`). Esa búsqueda ya filtra `mainline = T`.
- **Detalle:** `gpv_pending_lines_lib` agrega una función que carga la búsqueda guardada de la Configuración (`configLib.getConfig().pendingSearch`), le reemplaza los filtros por `mainline = T` y `internalid anyof <facturas mostradas>` (lo mismo que hace `saveCsv`) y devuelve:
  - `detailColumns`: las etiquetas, en el orden de la búsqueda.
  - Por cada factura, `details`: los valores en ese mismo orden (texto si lo hay; si no, valor).

  La respuesta de `pending` (y de `authorized`) incluye `detailColumns` una sola vez, y en cada línea sus `details`. Si la búsqueda no está configurada o falla, `detailColumns` queda vacío y se registra en el log; la página funciona igual.

### Orden y agrupación

- El servidor sigue agrupando por concentrado → nivel (`groupLines`). La página ya separa cada grupo en tablas por moneda; ahora primero separa por **subsidiaria** y dentro de cada una por moneda.
- **Orden de las subsidiarias:** alfabético por el nombre que se muestra (decisión mía). En OneWorld el join trae el nombre jerárquico ("Matriz : Hija"); se muestra y ordena solo el último tramo. Las facturas sin subsidiaria van al final.
- Dentro de cada tabla no cambia: prioridad → USD antes que MXN → monto mayor a menor (`sortLines`).
- Subtotales por subsidiaria y moneda. La casilla "todas" sigue siendo por tabla.
- La vista de Tesorería (`?view=authorized`) usa el mismo orden por subsidiaria, por consistencia (decisión mía): concentrado → subsidiaria → moneda. Su detalle sale de la misma búsqueda; una columna que dependa de que la factura esté pendiente puede salir vacía, y se acepta.
- Los `details` se indexan por **factura** (`billId`), no por línea: una factura puede estar en más de un concentrado.

### Presentación

- **Vista compacta, la normal:** en cada fila, el proveedor con su etiqueta de prioridad y, debajo y más tenue, la descripción del proveedor. Luego folio, fecha, vencimiento, nota y monto. En el celular, cada factura es una tarjeta: arriba el proveedor y la prioridad con el monto a la derecha; abajo la descripción, el folio, las fechas y la nota.
- **"Ver detalle"** se despliega debajo de la fila o tarjeta como una lista de etiqueta: valor, con todas las columnas de la búsqueda. Solo aparece si hay `detailColumns`.
- **"Vista completa"**, solo en escritorio: **un solo interruptor para toda la página** (decisión mía) que cambia todas las tablas a una tabla con una columna por cada `detailColumns`, con la casilla de selección y el monto fijos. Se recuerda en `localStorage` (envuelto en try/catch). Por debajo del ancho de tableta no se muestra.
- En modo externo (con token), el folio sigue como texto sin enlace y los valores del detalle se muestran como texto plano (`textContent`), nunca como HTML.

- **Descripción vacía:** al salir, el campo estará vacío en todos los proveedores; la segunda línea simplemente no aparece. Llenarlo es tarea del negocio, sin carga de datos en este alcance.
- **Permisos de la búsqueda:** en el Centro interno la búsqueda guardada corre con los permisos de quien abre la página. En la puesta en marcha se comparte la búsqueda con los roles que usan el Centro (Audiencia). Si aun así falla, el detalle no aparece y queda en el log.

- **Una sola búsqueda para todos** (decidido por el usuario, 25 nov): el detalle y la vista completa muestran las mismas columnas en el Centro interno y en el enlace externo de los CEOs. Regla escrita en la guía del administrador y en el manual: **nada sensible en la búsqueda** (datos bancarios, notas internas, fórmulas con enlaces), porque lo ve quien tenga un enlace vigente. Se descartó una segunda búsqueda solo para el modo externo.

## Lo que queda al implementador

- Los nombres de los campos nuevos en JS y en los tipos (`PendingLine`), siguiendo las convenciones.
- Los detalles de estilo y los cortes de ancho, usando los tokens y el estilo de marca que ya tiene la página.
- Cómo se dividen los tests. Como mínimo:
  - el orden por subsidiaria (incluida la que no tiene);
  - el detalle cuando falta la búsqueda guardada;
  - que `details` respete el orden de `detailColumns`.
