# Autorización de Pagos NetSuite ↔ Slack — Documentación técnica

> Creado el 23 nov 2026. Borrador vivo. Se actualiza al cerrar cada pieza. Las secciones marcadas **(pendiente)** aún no están construidas.

## 1. Propósito

Que los directivos autoricen el pago de facturas de proveedor (CXP aceptadas) desde Slack o desde NetSuite, en orden y con bitácora, en lugar de WhatsApp y correo.

## 2. Arquitectura

- **Tipo de proyecto:** SDF Account Customization (un solo cliente), SuiteScript 2.1 con JSDoc.
- **Una sola lógica de negocio** en `lib/`. Slack y NetSuite solo traducen entradas hacia ella.
- **El nivel y el aprobador nunca salen de parámetros:** se derivan del estado de la línea y del empleado autenticado (sesión de NS o usuario de Slack mapeado).
- **Secretos** (bot token, Signing Secret, clave de enlaces) en API Secrets, nunca en el código.
- **Dos vías de acceso al Centro:** sesión de NetSuite (Director, CFO, Tesorería) y **enlace externo firmado** para los niveles marcados con "Aprueba por enlace externo" (CEOs sin usuario de NetSuite). Ver 4.7.

## 3. Flujo

1. **Lunes (`customscript_gpv_weekly_proposal_ss`):** genera el concentrado con la búsqueda de pendientes, guarda un CSV con las columnas de la búsqueda y publica un resumen (totales por moneda y facturas por nivel) en el canal de CXP. Ver 4.1.
2. Cada nivel aprueba o descarta sus facturas en el Centro de Autorización, en orden: Director → CFO → CEO 1 → CEO 2. Ver 4.5 y 4.6.
3. Al aprobar el último nivel, la factura queda **Autorizada** y se avisa a Tesorería.
4. **Sábado (`customscript_gpv_weekly_expiry_ss`):** las líneas aún Pendientes pasan a **Vencida**, la factura queda disponible para otro concentrado y el concentrado se cierra.

### Reglas

- **Aprobaciones previas:** si la factura ya trae marcadas las casillas de aprobación en orden desde el nivel 1, arranca en el nivel siguiente; si todas están marcadas, nace Autorizada. Si hay huecos (p. ej. CFO marcado sin Director), arranca en nivel 1 y se limpian las casillas marcadas, **salvo la del Director**: si el Director estaba marcado, se conserva y arranca en nivel 2.
- **Descartar:** la factura vuelve a pendientes y se limpian sus casillas, salvo la del Director; si vuelve a un concentrado, arranca en nivel 2 si el Director ya había aprobado, o en nivel 1 si no.
- **Aprobación permanente del Director:** la casilla del nivel 1 nunca se limpia, ni al descartar, ni al vencer, ni por huecos. El nivel está fijo en el código (`PERMANENT_APPROVAL_LEVEL = 1` en `gpv_constants_lib`). Motivo: si el Director ya dio el visto bueno de su área, la factura está bien; donde se traba o se rechaza es en CFO, CO-CEO 1 y CO-CEO 2.
- **Una factura no puede estar en dos concentrados activos:** la app agrega el filtro "fuera de un concentrado activo" a la búsqueda.

### Estados de la línea

Una línea es una factura dentro de un concentrado. Pendiente lleva nivel (1 a 4); los demás estados no. Autorizada, Descartada y Vencida son finales para esa línea. Si la factura descartada o vencida vuelve a entrar a la búsqueda, el lunes nace una **línea nueva**. Lógica pura en `gpv_line_state_machine_lib` (transiciones) y `gpv_approval_lib` (qué escribir).

| Desde | Evento | Quién | Hacia | Estado de la factura | Slack |
|---|---|---|---|---|---|
| (no existe) | Lunes, casillas previas vacías o en orden incompleto | Script del lunes | Pendiente en el primer nivel sin aprobar | Pendiente | DM al aprobador de ese nivel |
| (no existe) | Lunes, las 4 casillas ya marcadas | Script del lunes | Autorizada | Autorizada | Aviso a Tesorería |
| Pendiente, nivel 1 a 3 | Aprobar | Aprobador o suplente del nivel | Pendiente, nivel siguiente | Sin cambio (Pendiente) | Confirmación a quien aprobó y DM al siguiente nivel |
| Pendiente, nivel 4 | Aprobar | Aprobador o suplente del nivel | Autorizada | Autorizada | Confirmación a quien aprobó y aviso a Tesorería |
| Pendiente | Descartar | Aprobador o suplente del nivel | Descartada | Descartada | Aviso a CXP |
| Pendiente | Sábado | Script del sábado | Vencida | Vencida | Ninguno |
| Pendiente | Aprobar o descartar alguien que no es aprobador ni suplente | Cualquiera | Sin cambio | Sin cambio | Ninguno; queda en bitácora ("Intento no autorizado") |
| Autorizada, Descartada o Vencida | Aprobar o descartar (doble clic, otra vía) | Cualquiera | Sin cambio | Sin cambio | Ninguno (`NOT_PENDING`) |

El estado **Pagada** existe en la lista (`val_gpv_paid`) pero la app nunca lo pone: una Autorizada sale de la vista de Tesorería cuando su factura se paga completa.

### Casillas de aprobación por evento

Casillas `custbody_gpv_*_approval` de la factura. La del nivel 1 (Director) es permanente (`PERMANENT_APPROVAL_LEVEL`).

| Evento | Nivel 1 (Director) | Niveles 2 a 4 | Bitácora | Si la factura vuelve a un concentrado |
|---|---|---|---|---|
| Lunes, casillas en orden desde el nivel 1 | Sin cambio | Sin cambio | — | (no aplica: arranca en el nivel siguiente a la última marcada) |
| Lunes, con huecos (p. ej. CFO sin Director) | Se conserva | Se limpian las marcadas | "Limpieza de aprobaciones previas" | (no aplica: arranca en nivel 2 si el Director estaba marcado, si no en nivel 1) |
| Aprobar | Se marca la del nivel que aprobó | Se marca la del nivel que aprobó | "Aprobar" | — |
| Descartar | Se conserva | Se limpian | "Descartar" | Nivel 2 si el Director aprobó; si no, nivel 1 |
| Vencer (sábado) | Se conserva | Se limpian | "Vencimiento semanal" | Nivel 2 si el Director aprobó; si no, nivel 1 |

## 4. Objetos SDF

### Registros personalizados

| Registro | Para qué |
|---|---|
| `customrecord_gpv_config` | Configuración única: búsqueda de pendientes, canales de Tesorería y CXP, motivo obligatorio al descartar |
| `customrecord_gpv_approval_level` | Un registro por nivel: orden, aprobador, suplente, campo de aprobación, SLA y casilla "Aprueba por enlace externo" (`custrecord_gpv_lvl_external_link`) |
| `customrecord_gpv_payment_proposal` | Concentrado (una junta) |
| `customrecord_gpv_proposal_line` | Línea del concentrado (una factura), con su estado y nivel |
| `customrecord_gpv_audit_log` | Bitácora de cada acción |

### Campos de la factura de proveedor

| Campo | Etiqueta | Uso |
|---|---|---|
| `custbody_gpv_authorization_status` | Estado de autorización de pago | Estado de la última línea (solo lectura) |
| `custbody_gpv_dir_approval` | Aprobación Director TI | Casilla del nivel 1 |
| `custbody_gpv_cfo_approval` | CFO | Casilla del nivel 2 |
| `custbody_gpv_ceo1_approval` | CO - CEO - BB | Casilla del nivel 3 |
| `custbody_gpv_ceo2_approval` | CO - CEO - ECOVALLAS | Casilla del nivel 4 |

### Otros

- `custentity_gpv_slack_user`: ID de Slack del empleado (liga empleado NS ↔ usuario Slack).
- `custentity_gpv_vendor_priority` ("Prioridad de Proveedor", en el proveedor): lista `customlist_gpv_vendor_priority` con Alto, Medio y Bajo (`val_gpv_high/medium/low`). Opcional; ordena las facturas en el Centro.
- `custentity_gpv_vendor_description` ("Descripción de proveedor", en el proveedor): texto libre que el Centro muestra bajo el nombre; vacío, no muestra renglón. Llenarlo es tarea del negocio.
- Listas: estado de línea, estado de concentrado, acción de bitácora, canal (incluye "Enlace externo"), prioridad de proveedor.

### Scripts

| Script | Tipo | Estado |
|---|---|---|
| `customscript_gpv_slack_smoke_test_ss` | Scheduled | Prueba de salida a Slack |
| `customscript_gpv_weekly_proposal_ss` | Scheduled | Concentrado semanal (lunes). Probado en el sandbox |
| `customscript_gpv_weekly_expiry_ss` | Scheduled | Vencimiento semanal (sábado). Probado en el sandbox |
| `customscript_gpv_slack_gateway_sl` | Suitelet externo | Verifica la firma de Slack. Slack no puede llegar directo (ver 4.3); queda para usarse detrás del Worker |
| `customscript_gpv_approval_center_sl` | Suitelet | Centro de Autorización (v1). Dos deployments: interno (probado en el sandbox) y externo `customdeploy_gpv_approval_center_ext` (probado en el sandbox; ver 4.7) |

### 4.1 Concentrado semanal

- **La búsqueda del cliente** define qué facturas entran y las columnas del CSV. La app le agrega por código: línea principal, "fuera de un concentrado activo" (estado vacío, Descartada o Vencida) y sus propias columnas (proveedor, `fxamount`, moneda, vencimiento y las casillas). Si alguien cambia las columnas de la búsqueda, la app no se rompe.
- **Una factura = una línea.** El nivel inicial sale de las casillas (`gpv_legacy_lib`). Si había huecos, se limpian las casillas y se registra "Limpieza de aprobaciones previas" en la bitácora.
- **Reanudable:** cada factura queda Pendiente en cuanto se crea su línea y sale de la búsqueda. Si se acaban las unidades (se reservan 500 para el cierre), el script se reprograma solo y continúa en el mismo concentrado. Un segundo run el mismo día nunca crea otro concentrado.
- **Cierre:** totales MXN y USD en el concentrado, CSV en `SuiteScripts/gpv_payment_authorization/proposals/` (`concentrado_AAAA-MM-DD.csv`, UTF-8 con BOM para Excel, casillas como Sí/No igual que en el Centro) ligado al concentrado, y resumen en Slack.
- **Sin facturas:** no crea concentrado; publica "No hay facturas pendientes".
- **Límites conocidos:** si una ejecución reprogramada arranca después de medianoche, abre un concentrado con la fecha nueva. Si el script se cae entre crear la línea y marcar la factura, la factura puede quedar con dos líneas.

### 4.2 Vencimiento semanal

- Toma todas las líneas en **Pendiente**. Por cada una: la factura pasa a Vencida y se limpian sus casillas de aprobación, salvo la del Director; se registra "Vencimiento semanal" en la bitácora; la línea pasa a Vencida y se queda sin nivel.
- **Orden:** primero la factura y después la línea. Si el script se corta, la línea sigue Pendiente y el siguiente intento repite la factura (mismos valores) y la bitácora (idempotente). Nunca queda una factura atorada en Pendiente.
- Una línea Pendiente sin nivel válido también se vence, para no dejar su factura fuera de los concentrados futuros.
- **Reanudable:** se reprograma si quedan menos de 200 unidades. Los concentrados abiertos se cierran solo cuando ya no queda ninguna línea Pendiente.
- Las líneas Autorizadas no se tocan. No publica nada en Slack.

### 4.3 Entrada desde Slack

- NetSuite rechaza con **405**, en su borde, los POST externos cuyo User-Agent es el de Slack (`Slackbot 1.0`). Pasan sin User-Agent o con uno de navegador. No está documentado por NetSuite; se comprobó en el sandbox.
- Por eso la vía principal es: DM de Slack con enlace → **Centro de Autorización interno** (el aprobador entra con su sesión de NS).
- Botones nativos de Slack (futuro): un **Cloudflare Worker** recibe el clic y lo reenvía tal cual al gateway (cuerpo y encabezados de firma, sin el User-Agent de Slack). El Worker no guarda secretos; NetSuite verifica la firma. Alternativa si NetSuite cambia el filtro: Worker → RESTlet con TBA.
- Configuración del gateway: Socket Mode **apagado** en la Slack app; deployment "Disponible sin inicio de sesión", Audiencia con todos los roles y **Subsidiarias vacías** (con subsidiarias, NetSuite responde "no tienes privilegios"); ejecuta como Administrador (pendiente: rol mínimo).

### 4.4 Aprobar y descartar

- `gpv_approval_service_lib` (`approve`, `discard`) es el núcleo de todas las vías. El nivel y el aprobador salen de la línea y de los niveles configurados, nunca de la petición. Puede aprobar el aprobador o el suplente del nivel en que va la línea.
- Aprobar: marca la casilla del nivel en la factura y avanza la línea; en el último nivel la factura y la línea quedan **Autorizadas**.
- Descartar: la factura queda Descartada y se limpian sus casillas, salvo la del Director; la línea guarda motivo y quién descartó. El motivo es obligatorio si así lo dice la Configuración.
- Orden de escritura: factura → bitácora (con llave de idempotencia) → línea. Un doble clic o una línea que ya avanzó no escribe nada. Un intento de alguien que no es el aprobador se registra en la bitácora ("Intento no autorizado") y no cambia nada.
- Gobernanza: ~30 unidades por línea; un Suitelet tiene 1,000. El llamador pasa `hasBudget`: si se acaban las unidades, el servicio se detiene limpio y devuelve las líneas restantes como `NOT_PROCESSED` ("faltan N, da clic otra vez"). Nunca queda una línea a medias. Hoy el Centro procesa lo que alcance (~25-30 líneas) y el usuario da clic otra vez por el resto; mandar el excedente a segundo plano (Map/Reduce) es una idea, **no está construida**.

### 4.5 Centro de Autorización

- Suitelet con sesión de NS (el deployment externo se describe en 4.7). `GET` sirve `ui/gpv_approval_center.html`; la página llama a `GET ?action=pending` y a `POST ?action=approve|discard`.

| Petición | Deployments | Identidad y requisitos | Respuesta |
|---|---|---|---|
| `GET` sin `action` | Interno y externo | Ninguno: la página es pública; los datos se piden aparte | HTML de la página |
| `GET ?action=pending` | Interno y externo | Interno: sesión de empleado. Externo: encabezado `X-GPV-Token` | `{ ok, userName, groups, detailColumns }`: líneas Pendientes donde es aprobador o suplente |
| `GET ?action=authorized` | Solo interno | Sesión de empleado | Igual que `pending`, con las Autorizadas cuya factura sigue abierta (vista de Tesorería) |
| `POST ?action=approve` | Interno y externo | Lo de arriba y, en el interno, `X-GPV-Request: 1` (CSRF). Cuerpo JSON `{ lineIds }` | `{ ok, counts }`: cuántas líneas por resultado |
| `POST ?action=discard` | Interno y externo | Igual que `approve`. Cuerpo `{ lineIds, reason }` | Igual que `approve` |

- Cuerpo: `lineIds` son IDs numéricos de línea, de 1 a 500; `reason` se corta a 1,000 caracteres. Fuera de eso: `GPV_INVALID_REQUEST`.
- Resultados por línea (`counts`): `ADVANCED` (pasó al siguiente nivel), `AUTHORIZED`, `DISCARDED`, `NOT_PENDING` (ya no estaba pendiente), `UNAUTHORIZED` (no es su nivel; queda en bitácora) y `NOT_PROCESSED` (se acabaron las unidades; volver a dar clic).
- Cualquier rechazo responde `{ ok: false, error }` con HTTP 200. En el externo, todo rechazo de identidad da el mismo mensaje de enlace caducado (4.7).
- Cada aprobador ve solo las líneas Pendientes en los niveles donde es aprobador o suplente (`gpv_pending_lines_lib`), agrupadas por concentrado y nivel, con totales por moneda y enlace a la factura.
- **Orden** (`sortLines`): dentro de cada concentrado/nivel, subsidiaria (alfabético por el último segmento del nombre jerárquico; sin subsidiaria al final) → prioridad del proveedor (Alto → Medio → Bajo → sin prioridad) → moneda (USD, MXN, otras) → monto de mayor a menor; los empates conservan el vencimiento. La página separa cada subsidiaria en una tabla por moneda, así que en pantalla se ve subsidiaria → moneda → prioridad → monto. En la vista de Tesorería: concentrado → subsidiaria → moneda. La prioridad se lee del proveedor al momento, así que cambiarla reordena sin tocar el concentrado. El CSV del lunes sigue el orden de la búsqueda guardada. Dos subsidiarias con el mismo último segmento quedarían en una sola sección.
- **Presentación:** la página parte cada grupo en una tabla por moneda (USD, MXN y luego otras), con subtotal y "seleccionar todas" por tabla; en el celular el "seleccionar todas" es del grupo. La prioridad (`priority`, texto de la lista) se muestra como etiqueta junto al proveedor.
- **Identidad visual** (probada en el sandbox en móvil): colores de Grupo Vallas (gris carbón, fondo blanco cálido, naranja solo en las acciones), definidos como variables CSS en `:root`. Tipografía Avenir; si no está, Nunito Sans desde Google Fonts y luego la del sistema (si la red bloquea Google Fonts, solo cambia la letra). El brief de diseño está en `PRODUCT.md`.
- El empleado sale de `runtime.getCurrentUser()`, nunca de la petición; el servicio vuelve a validar el nivel.
- CSRF: los POST exigen JSON y el encabezado `X-GPV-Request: 1`. XSS: la página pinta todo con `textContent`.
- Errores: solo `GPV_INVALID_REQUEST` y `GPV_DISCARD_REASON_REQUIRED` se muestran tal cual; lo demás se registra en el log y el usuario ve un mensaje genérico.
- Lotes: ~25-30 líneas por clic; el resto vuelve como "faltan N, da clic otra vez" (`NOT_PROCESSED`).
- **Vista de Tesorería** (`?view=authorized`): la misma página en solo lectura, sin casillas ni botones. Llama a `GET ?action=authorized` (`findAuthorized`): líneas Autorizadas cuya factura sigue abierta (`VendBill:A`; con pago parcial sigue abierta, pagada completa sale sola), agrupadas por concentrado, con enlace a cada factura. Cualquiera con acceso al Centro puede abrirla.
- **Datos de la factura:** cada factura muestra proveedor + prioridad + descripción del proveedor, folio (`tranid`, ya incluye la serie), fecha de la factura, vencimiento, memo (nota del encabezado) y monto. Los datos vienen de `gpv_pending_lines_lib` (subsidiaria, memo, fechas, descripción).
- **Subsidiarias plegables:** cada subsidiaria es un `<details open>`; todas empiezan abiertas. Plegar no quita la selección: el encabezado muestra "✓ N seleccionadas" y esas facturas entran al aprobar o descartar. En el celular cada subsidiaria tiene su propio "Seleccionar todas" (en escritorio, la casilla de cada tabla de moneda).
- **Tarjetas:** a ≤900 px (celulares y tabletas verticales) la tabla se cambia por tarjetas.
- **"Ver detalle"** (`attachDetails`): por factura, todas las columnas de la búsqueda de pendientes configurada en Configuración GPV (la misma del CSV del lunes), filtrada a las facturas mostradas; omite los valores iguales a los ya visibles (proveedor, folio, fecha de factura, vencimiento y un importe igual al Monto); las casillas se muestran como Sí/No. Sin búsqueda (no configurada, borrada o sin permiso) el Centro funciona sin detalle y registra el error en el log; nunca lanza.
- **"Vista completa":** solo en escritorio (≥1024 px); fijos la casilla, el proveedor, el folio (con enlace a la factura, salvo por enlace externo) y el monto, más una columna por columna de la búsqueda (se omiten las que solo repiten proveedor, folio o Monto); con muchas columnas la tabla se desplaza de lado; se recuerda en el navegador (`localStorage`).
- **Una sola búsqueda para todos**, incluido el enlace externo de los CEOs: quien tenga un enlace válido ve esas columnas. Regla: nada sensible en la búsqueda (datos bancarios, notas internas, fórmulas con enlaces). Compartir la búsqueda (Audiencia) con los roles que usan el Centro. Evitar columnas de resumen (agrupadas/total): el detalle podría no aparecer.
- Página v1 en HTML + JS sin framework. Si crece, se puede cambiar por la SPA (Preact) sin tocar el API.
- **Probado en el sandbox:** datos de la factura, orden y pliegue por subsidiaria, "Ver detalle" (casillas como Sí/No, sin importe repetido) y "Vista completa". Falta Safari/iPhone reales (ver 8).

### 4.6 Avisos en Slack

| Cuándo | A quién | Dónde | Botón | Función |
|---|---|---|---|---|
| Lunes, al cerrar el concentrado | CXP | Canal de CXP | — | `buildProposalSummary` (en el script del lunes) |
| Lunes | Todos los aprobadores con algo pendiente en cualquier concentrado (y el suplente, si el nivel aprueba por enlace) | DM | "Ver en NetSuite" o "Revisar y autorizar" (enlace externo) | `notifyAllApprovers` |
| Lunes, facturas que nacieron autorizadas | Tesorería | Canal de Tesorería | "Ver autorizadas" | `notifyTreasury` |
| Aprobar en el Centro | Quien aprobó | DM | — | `notifyApprover` |
| Aprobar, líneas que avanzan | Aprobador del siguiente nivel (y suplente, si aprueba por enlace) | DM | Igual que el lunes | `notifyLevels` |
| Aprobar en el último nivel | Tesorería | Canal de Tesorería | "Ver autorizadas" | `notifyTreasury` |
| Descartar en el Centro | CXP | Canal de CXP | — | `notifyDiscarded` |
| Sábado (vencimiento) | Nadie | — | — | — |

Desde el Centro, los cuatro avisos de aprobar y descartar salen de `notifyAfterAction`.

- **DM al aprobador** (`gpv_notifier_lib.notifyLevels`): el lunes, a **todos** los aprobadores con algo pendiente en cualquier concentrado (`notifyAllApprovers`); y desde el Centro, al aprobador del siguiente nivel cuando unas líneas avanzan. El DM resume todo lo que esa persona tiene pendiente (la misma búsqueda del Centro) y trae el botón "Ver en NetSuite" al Centro. Un DM por persona aunque tenga varios niveles.
- **Aviso a Tesorería** (`notifyTreasury`): cuando líneas quedan Autorizadas (en el Centro o al nacer autorizadas el lunes). El lunes solo avisa de las que **nacieron** autorizadas: las que tienen aprobación en la bitácora ya tuvieron su aviso, así que volver a correr el script no lo repite. Mensaje corto: cuántas facturas se autorizaron, total por moneda y botón "Ver autorizadas" a la vista de Tesorería del Centro, donde está el detalle.
- **Aviso a CXP de descartes** (`notifyDiscarded`): al descartar en el Centro, mensaje al canal de CXP con quién descartó, el motivo (si lo hay) y hasta 20 facturas (proveedor, folio, monto); el resto como "…y N más". Las facturas regresan a pendientes para un concentrado futuro.
- **Confirmación al aprobador** (`notifyApprover`): tras aprobar en el Centro, DM a quien aprobó con cuántas facturas, total por moneda, cuántas pasan a cada nivel y cuántas quedaron autorizadas. No se manda por descartes.
- Requisitos: el **Usuario de Slack** (`custentity_gpv_slack_user`) capturado en el empleado; si falta, se registra en el log y no se le avisa. La app de Slack necesita `chat:write`.
- Un aviso que falla se registra en el log y **nunca** deshace ni bloquea la aprobación. Los textos de NetSuite se escapan para que no generen menciones ni enlaces en Slack.
- El botón es solo un enlace, pero si la app de Slack tiene **Interactivity** encendida, Slack manda el clic a la Request URL; NetSuite la rechaza (405) y Slack muestra un ⚠️ junto al botón. Mantener Interactivity apagada hasta que exista el Cloudflare Worker.
- **Aprobadores por enlace externo:** si el nivel tiene la casilla "Aprueba por enlace externo", el aprobador **y el suplente** reciben el DM con el botón "Revisar y autorizar", que apunta a la URL externa con `&t=<token>` (el lunes y tras cada avance). Los suplentes de niveles internos siguen sin DM.
- Pendiente: avisar al suplente de niveles internos; actualizar el DM anterior (`chat.update`) en lugar de mandar uno nuevo.

### 4.7 Aprobación por enlace externo (CEOs)

Para los niveles cuyo aprobador no tiene usuario de NetSuite. Se activa con la casilla `custrecord_gpv_lvl_external_link` del nivel (niveles 3 y 4).

- **Token** (`gpv_link_token_lib`): `{employeeId}.{exp}.{hmac}`, HMAC-SHA256 con el API Secret `custsecret_gpv_link_key`. Vale 7 días desde que se manda el DM. Se verifica la firma en tiempo constante **antes** de revisar la caducidad y solo se acepta la forma canónica. **No se guarda en ningún lado** (sin estado). Cambiar el secreto invalida todos los enlaces.
- **Deployment externo** `customdeploy_gpv_approval_center_ext`: mismo script que el interno, "Disponible sin inicio de sesión", ejecuta como Administrador. Audiencia: todos los roles, todos los empleados, rol `ONLINE_FORM_USER` (Online Form User) y **Subsidiarias vacías** (mismo hallazgo que el gateway, ver 4.3). Así está en el sandbox y así quedó en el XML para que un deploy de SDF no lo pise. La audiencia no da identidad: el empleado sale solo del token.
- **Identidad:** en el deployment externo el empleado sale **solo** del encabezado `X-GPV-Token`, nunca de la petición ni de la sesión. En cada petición se revisa: token válido y vigente, empleado activo y que sea aprobador o suplente de un nivel con la casilla marcada. Cualquier falla devuelve el mismo mensaje: "Este enlace ya caducó o no es válido. El lunes recibirás uno nuevo en Slack."
- **Cortar acceso:** desmarcar la casilla del nivel corta de inmediato los enlaces ya mandados; cambiar la clave los corta todos.
- **Modo externo de la página:** el token viaja solo en el encabezado, el folio de la factura es texto (sin enlace a la factura) y no hay vista de Tesorería (`?view=authorized` solo funciona con sesión).
- **Bitácora:** las acciones salen con canal "Enlace externo".
- Una sesión que no es un empleado real (p. ej. el usuario anónimo del deployment externo) se rechaza siempre en el deployment interno.
- **Verificado en el sandbox:** el borde de NetSuite deja al navegador mandar el encabezado propio `X-GPV-Token` en el dominio externo (GET y POST), y `runtime.getCurrentScript().deploymentId` viene con valor en el deployment externo. Aprobar, descartar y cortar el acceso desmarcando la casilla funcionaron.
- **Alcance por empleado** (nota de revisión): quien es externo en algún nivel ve y puede actuar en **todas** sus líneas pendientes por esa vía, también las de niveles sin la casilla (p. ej. alguien que es CEO 1 y también aprobador del CFO). Es aceptable porque la persona sigue siendo aprobador de esos niveles; si no se quiere, no mezclar niveles.

## 5. Puesta en marcha (sandbox o PROD)

Guía para instalar la app en una cuenta nueva. Seguir los pasos en orden: varios dependen del anterior. Lo marcado **(a confirmar)** no se ha probado con un rol distinto de Administrador.

### 5.1 Antes de empezar

- [ ] Workspace de Slack del cliente y una persona con permiso para instalar apps en él.
- [ ] Canales creados: uno de **Tesorería** y uno de **CXP**.
- [ ] Usuarios de NetSuite para los 4 aprobadores (Director, CFO, CO-CEO 1, CO-CEO 2) y para Tesorería.
- [ ] Definida con CXP la búsqueda guardada de facturas pendientes (qué facturas entran y qué columnas lleva el CSV).
- [ ] Acceso a la cuenta de NetSuite con rol Administrador y la extensión SuiteCloud de VS Code configurada para esa cuenta.

### 5.2 Slack app

1. En api.slack.com/apps: **Create New App → From scratch**, en el workspace del cliente.
2. **Basic Information → Display Information:**
   - Nombre: "Asistente NetSuite" (o el que elija el cliente).
   - Descripción corta: *Avisa a los aprobadores las facturas por autorizar y a Tesorería las listas para pago, con enlace a NetSuite.*
3. **OAuth & Permissions → Bot Token Scopes:** `chat:write`. Es lo único que usa la app hoy.
4. **Socket Mode: apagado. Interactivity: apagada.** Si Interactivity queda encendida, Slack muestra un ⚠️ en los botones (ver 4.6).
5. **Install to Workspace.** Copiar el **Bot User OAuth Token** (`xoxb-…`) y, en Basic Information, el **Signing Secret**. No pegarlos en ningún documento ni chat: van directo a NetSuite (5.4).
6. Obtener el **ID de cada canal**: abrir el canal → nombre del canal → al final de la pestaña "Acerca de" aparece el ID (`C0…`).

### 5.3 Desplegar el proyecto SDF

1. En VS Code, con la cuenta destino seleccionada: **SuiteCloud: Validate Project** (con servidor) y luego **SuiteCloud: Deploy Project**.
2. Se crean: listas, registros personalizados, campos de factura, proveedor y empleado, scripts con sus deployments y los archivos del File Cabinet.
3. Los deployments del lunes y del sábado llegan como **No programado**; se activan al final (5.9).
4. **Gateway de Slack** (`customscript_gpv_slack_gateway_sl`): hoy no se usa (Slack no llega directo a NetSuite, ver 4.3) y ejecuta como Administrador. **Recomendación para PROD:** dejar su deployment sin desplegar hasta que exista el Worker y el rol mínimo. **(decisión pendiente)**
5. **Prueba de humo** (`customscript_gpv_slack_smoke_test_ss`): útil para el paso 5.8; después se puede dejar sin programar.

### 5.4 API Secrets

En **Configuración > Empresa > API Secrets**, crear:

| ID | Valor |
|---|---|
| `custsecret_gpv_slack_bot_token` | Bot User OAuth Token (`xoxb-…`) |
| `custsecret_gpv_slack_signing_secret` | Signing Secret |

Permitir su uso a los scripts de la app (o a todos los scripts). Los avisos de Slack salen tanto de los scripts programados como del Centro de Autorización.

**Clave de enlaces externos** (solo si algún nivel aprueba por enlace):

1. Generarla con `openssl rand -hex 32`. Una **distinta por cuenta** (sandbox y PROD).
2. Crear el API Secret `custsecret_gpv_link_key` con ese valor. Scripts permitidos: **Centro de Autorización** (los dos deployments son el mismo script) y **Concentrado semanal** (el lunes firma los enlaces).
3. Para **invalidar todos los enlaces**: cambiar la clave.

### 5.5 Búsqueda de pendientes

La búsqueda **no viaja con SDF**: se crea a mano en cada cuenta (o se importa).

1. Búsqueda guardada de **Transacción**, tipo **Factura de proveedor**, con los criterios de CXP (aceptadas, listas para pago, etc.).
2. **No** filtrar por las casillas de aprobación ni por el estado de autorización: la app agrega sus propios filtros (ver 4.1).
3. Columnas: las que CXP quiera ver en el CSV. Recomendado agregar las 4 casillas de aprobación, moneda e importe.
4. Anotar su ID (en el sandbox: `customsearch_gpv_slack_pending_bills`).
5. **Es también el "Ver detalle" del Centro** (4.5): todas sus columnas salen ahí, para todos, incluidos los CEOs por enlace externo. Nada sensible (bancos, notas internas, fórmulas con enlaces), sin columnas de resumen (agrupadas/total), y **compartirla** (Audiencia) con los roles que usan el Centro; si un rol no la ve, su Centro queda sin detalle.

### 5.6 Configuración y niveles

1. **Configuración GPV** (`customrecord_gpv_config`): crear **un solo** registro con:
   - Búsqueda de pendientes: la del paso 5.5.
   - Canal de Slack de Tesorería y Canal de Slack de CXP: los IDs del paso 5.2.
   - Motivo obligatorio al descartar: según decida el cliente (recomendado: sí).
2. **Niveles de aprobación** (`customrecord_gpv_approval_level`): un registro por nivel.

| Nombre | Orden | Campo de aprobación | Aprobador |
|---|---|---|---|
| Director | 1 | `custbody_gpv_dir_approval` | Director |
| CFO | 2 | `custbody_gpv_cfo_approval` | CFO |
| CEO 1 | 3 | `custbody_gpv_ceo1_approval` | CO-CEO 1 (casilla "CO - CEO - BB") |
| CEO 2 | 4 | `custbody_gpv_ceo2_approval` | CO-CEO 2 (casilla "CO - CEO - ECOVALLAS") |

   - El **Suplente** es opcional; puede aprobar en lugar del aprobador (recibe DM solo si el nivel aprueba por enlace externo).
   - **Aprueba por enlace externo:** marcarla en los niveles 3 y 4 (CEOs sin usuario de NetSuite). Ver 4.7.
   - El nivel con **Orden 1** conserva su aprobación siempre (ver 3, Reglas).

### 5.7 Empleados, proveedores y permisos

1. **Usuario de Slack** en el registro de empleado de cada aprobador: en Slack, abrir su perfil → ⋮ → **Copiar ID de miembro** (`U0…`). Sin este dato no recibe DMs (se registra en el log).
2. **Prioridad de Proveedor** (opcional): capturar Alto, Medio o Bajo en los proveedores que CXP quiera ordenar primero.
   **Descripción de proveedor** (opcional): a qué se dedica o qué suministra; se ve bajo el nombre en el Centro. La captura es del negocio.
3. **Permisos de los roles** de aprobadores y Tesorería **(a confirmar)**. El Centro ejecuta con el rol del usuario y los registros de la app exigen permiso por registro, así que el rol necesita al menos:
   - Factura de proveedor: **Editar** (aprobadores; la app marca las casillas y el estado).
   - Proveedor y Empleado: **Ver**.
   - Registros personalizados: Concentrado, Nivel de aprobación y Configuración GPV **Ver**; Línea de concentrado **Editar**; Bitácora **Crear**.
   - Alternativa si no se quiere tocar los roles: que el deployment del Centro ejecute con un rol dedicado.
4. El deployment del Centro está publicado para todos los roles y empleados; Tesorería entra a su vista con el botón del aviso (`?view=authorized`).
5. **CEOs por enlace externo:** darlos de alta como empleados **sin acceso** a NetSuite, con su Usuario de Slack. El empleado debe estar activo.

### 5.8 Pruebas de humo

1. Invitar al bot (`/invite @<nombre de la app>`) a los canales de **Tesorería** y **CXP**.
2. Ejecutar la prueba de humo: debe llegar "Hola desde NetSuite" al canal de Tesorería.
3. Ejecutar a mano el concentrado semanal (deployment del lunes → **Guardar y ejecutar**) y revisar:
   - Resumen en el canal de CXP y CSV en `SuiteScripts/gpv_payment_authorization/proposals/`.
   - DM a cada aprobador con pendientes; en el log, `DMs a aprobadores: N`.
4. Con el usuario de cada aprobador: abrir el Centro desde el DM, aprobar una factura y confirmar el DM de confirmación, el DM al siguiente nivel y, al final, el aviso a Tesorería. Descartar una y confirmar el aviso a CXP.
5. **Datos de la factura y detalle** (la hace el usuario en el sandbox):
   1. Desplegar.
   2. Capturar la descripción en dos proveedores.
   3. Compartir la búsqueda de pendientes con los roles del Centro.
   4. Abrir el Centro en el celular y en escritorio: orden por subsidiaria, datos nuevos, "Ver detalle" y "Vista completa".
   5. Abrir un enlace externo y confirmar lo mismo, sin enlace a la factura.
6. **Enlace externo** (la hace el usuario en el sandbox):
   1. Desplegar el proyecto y crear el secreto `custsecret_gpv_link_key` (5.4).
   2. Marcar la casilla en el nivel 3 y poner como aprobador a un empleado de prueba sin acceso a NetSuite, con su Usuario de Slack.
   3. Correr el script del lunes y verificar que llega el DM con "Revisar y autorizar".
   4. Abrir el enlace en un navegador **sin sesión de NetSuite**; aprobar una factura y revisar que la bitácora la registre con canal "Enlace externo".
      - Aprobar una factura en el nivel 3 por enlace y confirmar que el aprobador del nivel 4 recibe el DM con "Revisar y autorizar". Esto prueba que el token se firma dentro del Suitelet sin sesión; si el API Secret no está permitido ahí, el DM falla en silencio y solo aparece en el log del script.
   5. Desmarcar la casilla del nivel y recargar: debe salir el mensaje de enlace caducado.
   6. Cambiar a mano un dígito de `t=` en la URL: debe salir el mismo mensaje.

### 5.9 Programar y cerrar

1. Deployment del lunes (`customdeploy_gpv_weekly_proposal_ss`): estado **Programado**, día y hora de la junta (ya trae la recurrencia semanal del lunes).
2. Deployment del sábado (`customdeploy_gpv_weekly_expiry_ss`): estado **Programado** (ya trae la recurrencia del sábado).
3. Bajar el nivel de log de los deployments de **Depuración** a **Auditoría** para no llenar el log.
4. Dejar sin programar la prueba de humo.
5. Avisar a los aprobadores y a Tesorería; compartirles el manual de usuario.

## 6. Desarrollo

- Requisitos: Node 22, extensión SuiteCloud de VS Code.
- `npm test` (Jest), `npm run lint`, `npm run typecheck`, `npm run format:check`.
- Convenciones de nombres e IDs: `CONVENTIONS.md`.
- Tests en `__tests__/`, con la misma estructura que el código. Tipos compartidos de JSDoc en `types/gpv.d.ts`.

### Mapa de módulos

En `src/FileCabinet/SuiteScripts/gpv_payment_authorization/`. "Pura" quiere decir que no lee ni escribe registros (como mucho usa `N/error`); se prueba sin mocks de NetSuite.

| Archivo | Qué hace | Pura | Test |
|---|---|---|---|
| `lib/gpv_constants_lib` | IDs de NetSuite y valores fijos (`PERMANENT_APPROVAL_LEVEL`, listas, campos) | Sí | — |
| `lib/gpv_line_state_machine_lib` | Transiciones de la línea (aprobar, descartar, vencer) | Sí | Sí |
| `lib/gpv_legacy_lib` | Nivel inicial según las casillas previas y cuáles limpiar | Sí | Sí |
| `lib/gpv_approval_lib` | Qué hace aprobar o descartar a una línea (`planLineAction`) y si un empleado aprueba por enlace externo | Sí | Sí |
| `lib/gpv_proposal_lib` | Reglas del concentrado: cadena de niveles, línea inicial por factura, totales por moneda y CSV | Sí | Sí |
| `lib/gpv_approval_service_lib` | Aprobar y descartar: escribe factura → bitácora → línea | No | Sí |
| `lib/gpv_proposal_service_lib` | Arma el concentrado del lunes y su CSV | No | — |
| `lib/gpv_expiry_service_lib` | Vencimiento del sábado y cierre de concentrados | No | Sí |
| `lib/gpv_pending_lines_lib` | Líneas del Centro (pendientes y autorizadas), su orden (`sortLines`) y "Ver detalle" | No | Sí |
| `lib/gpv_audit_log_lib` | Escribe la bitácora, con llave de idempotencia | No | Sí |
| `lib/gpv_approval_level_lib` | Lee los niveles configurados | No | — |
| `lib/gpv_config_lib` | Lee la Configuración GPV | No | — |
| `lib/gpv_list_lib` | Valor de lista: scriptid → ID interno | No | Sí |
| `lib/gpv_currency_lib` | Moneda: ID interno → código ISO | No | — |
| `lib/gpv_link_token_lib` | Crea y verifica el token del enlace externo | No (`N/crypto`) | Sí |
| `slack/gpv_slack_client_lib` | Cliente mínimo de la API de Slack; lee el bot token de API Secrets | No | Sí |
| `slack/gpv_slack_signature_lib` | Verifica la firma de Slack (v0) | No (`N/crypto`) | Sí |
| `slack/gpv_notifier_lib` | Decide a quién avisar y manda los avisos (4.6) | No | Sí |
| `slack/gpv_notification_message_lib` | Textos de DM, Tesorería, confirmación y descartes | Sí | Sí |
| `slack/gpv_proposal_message_lib` | Texto del resumen del lunes | Sí | Sí |
| `scripts/gpv_approval_center_sl` | Suitelet del Centro (interno y externo) | No | Sí |
| `scripts/gpv_weekly_proposal_ss` | Scheduled del lunes | No | — |
| `scripts/gpv_weekly_expiry_ss` | Scheduled del sábado | No | — |
| `scripts/gpv_slack_gateway_sl` | Gateway de Slack (solo verifica la firma) | No | — |
| `scripts/gpv_slack_smoke_test_ss` | Prueba de salida a Slack | No | — |
| `ui/gpv_approval_center.html` | Página del Centro (HTML + JS) | — | — |

## 7. Decisiones

| Decisión |
|---|
| Aprobaciones previas fuera de orden → arranca en nivel 1 y se limpian |
| Ciclo semanal: concentrado el lunes, vencimiento el sábado |
| Al descartar se limpian las casillas de la factura |
| Casillas de aprobación propias en SDF (los campos del prototipo solo existían en el sandbox) |
| El Director es el nivel 1, con un aprobador general (no por área) |
| Slack no puede llamar directo a NetSuite (405 por User-Agent). Vía principal: DM con enlace al Centro de Autorización interno; botones nativos después, con un Cloudflare Worker |
| Worker, opción A: reenvía el clic tal cual al gateway, sin guardar secretos (NetSuite verifica la firma). Opción B, solo si NetSuite cambia el filtro: Worker → RESTlet con TBA |
| Centro v1 en HTML + JS sin framework en lugar de la SPA. Preact se descartó por ahora; migrar si llega a 3-4 vistas |
| La aprobación del Director (nivel 1, fijo en código) es permanente: no se limpia al descartar, vencer ni por huecos |
| Orden en el Centro por prioridad del proveedor → moneda → monto, leída del proveedor al momento; el CSV del lunes no cambia |
| Vista de Tesorería (`?view=authorized`) abierta a cualquiera con acceso al Centro |
| El lunes se manda DM a todos los aprobadores con pendientes de cualquier concentrado, no solo del recién generado |
| Los CEOs (sin usuario de NetSuite) aprueban por enlace externo firmado (token HMAC de 7 días, sin estado) en un segundo deployment del Centro; se activa con una casilla por nivel. Ver 4.7 |
| No se agrega descarga del CSV del concentrado en el Centro ni en Slack: se queda como propuesta para que la operación se haga en NetSuite y no regrese a Excel |
| El Centro muestra más datos de la factura, ordena por subsidiaria y ofrece "Ver detalle" y "Vista completa" con las columnas de la búsqueda de pendientes (una sola para todos, también CEOs por enlace: nada sensible en ella) |

## 8. Pendientes y riesgos

- Contraloría debe aceptar la aprobación electrónica en lugar de la firma autógrafa.
- "Expediente completo" (XML, PDF, Constancia) como filtro de entrada: por definir.
- Director por área: por ahora un solo aprobador.
- La búsqueda de pendientes definitiva aún no existe (la del sandbox es de prueba).
- El gateway ejecuta como Administrador: crear un rol mínimo antes de PROD, o no desplegarlo hasta tener el Worker (ver 5.3).
- Permisos mínimos de los roles de aprobadores y Tesorería para el Centro: por confirmar (ver 5.7).
- El deployment externo ejecuta como Administrador: crear un rol mínimo antes de PROD.
- El prototipo `../../NS to Slack/MR_Notificaciones_Slack_P2P.js` tiene el bot token de Slack escrito en el código: **revocarlo** y rotarlo.
- Cuenta de Cloudflare de Grupo Vallas para el Worker (botones nativos en Slack).
- Propuesta (no aprobada): botón "Descargar CSV" del concentrado en el Centro y en el resumen de CXP, con una ruta `?action=csv&proposal=N` del Suitelet que sirve el archivo ya ligado al concentrado. Se pospuso para no fomentar volver a Excel.
- Safari/iPhone reales aún sin probar para tarjetas y "Ver detalle".
- Avisos: DM al suplente de niveles internos; actualizar el DM anterior (`chat.update`) en lugar de mandar uno nuevo (ver 4.6).
- Centro: vista de seguimiento para CXP y buscador.
