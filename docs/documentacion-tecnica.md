# Autorización de Pagos NetSuite ↔ Slack — Documentación técnica

> Borrador vivo. Se actualiza al cerrar cada pieza. Las secciones marcadas **(pendiente)** aún no están construidas.

## 1. Propósito

Que los directivos autoricen el pago de facturas de proveedor (CXP aceptadas) desde Slack o desde NetSuite, en orden y con bitácora, en lugar de WhatsApp y correo.

## 2. Arquitectura

- **Tipo de proyecto:** SDF Account Customization (un solo cliente), SuiteScript 2.1 con JSDoc.
- **Una sola lógica de negocio** en `lib/`. Slack y NetSuite solo traducen entradas hacia ella.
- **El nivel y el aprobador nunca salen de parámetros:** se derivan del estado de la línea y del empleado autenticado (sesión de NS o usuario de Slack mapeado).
- **Secretos** (bot token, Signing Secret) en API Secrets, nunca en el código.

## 3. Flujo

1. **Lunes (`customscript_gpv_weekly_proposal_ss`):** genera el concentrado con la búsqueda de pendientes, guarda un CSV con las columnas de la búsqueda y publica un resumen (totales por moneda y facturas por nivel) en el canal de CXP. Ver 4.1.
2. Cada nivel aprueba o descarta sus facturas en el Centro de Autorización, en orden: Director → CFO → CEO 1 → CEO 2. Ver 4.5 y 4.6.
3. Al aprobar el último nivel, la factura queda **Autorizada** y se avisa a Tesorería.
4. **Sábado (`customscript_gpv_weekly_expiry_ss`):** las líneas aún Pendientes pasan a **Vencida**, la factura queda disponible para otro concentrado y el concentrado se cierra.

### Reglas

- **Aprobaciones previas:** si la factura ya trae marcadas las casillas de aprobación en orden desde el nivel 1, arranca en el nivel siguiente; si todas están marcadas, nace Autorizada. Si hay huecos (p. ej. CFO marcado sin Director), arranca en nivel 1 y se limpian las casillas marcadas.
- **Descartar:** la factura vuelve a pendientes y se limpian sus casillas; si vuelve a un concentrado, arranca en nivel 1.
- **Una factura no puede estar en dos concentrados activos:** la app agrega el filtro "fuera de un concentrado activo" a la búsqueda.

## 4. Objetos SDF

### Registros personalizados

| Registro | Para qué |
|---|---|
| `customrecord_gpv_config` | Configuración única: búsqueda de pendientes, canales de Tesorería y CXP, motivo obligatorio al descartar |
| `customrecord_gpv_approval_level` | Un registro por nivel: orden, aprobador, suplente, campo de aprobación, SLA |
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
- `custentity_gpv_vendor_priority` ("Prioridad de Proveedor", en el proveedor): lista `customlist_gpv_vendor_priority` con Alto, Medio y Bajo (`val_gpv_high/medium/low`). Opcional; ordena las facturas en el Centro (decidido 24 nov).
- Listas: estado de línea, estado de concentrado, acción de bitácora, canal, prioridad de proveedor.

### Scripts

| Script | Tipo | Estado |
|---|---|---|
| `customscript_gpv_slack_smoke_test_ss` | Scheduled | Prueba de salida a Slack |
| `customscript_gpv_weekly_proposal_ss` | Scheduled | Concentrado semanal (lunes). Probado en el sandbox (23 nov) |
| `customscript_gpv_weekly_expiry_ss` | Scheduled | Vencimiento semanal (sábado). Probado en el sandbox (23 nov) |
| `customscript_gpv_slack_gateway_sl` | Suitelet externo | Verifica la firma de Slack. Slack no puede llegar directo (ver 4.3); queda para usarse detrás del Worker |
| `customscript_gpv_approval_center_sl` | Suitelet interno | Centro de Autorización (v1). Probado en el sandbox (23 nov) |

### 4.1 Concentrado semanal

- **La búsqueda del cliente** define qué facturas entran y las columnas del CSV. La app le agrega por código: línea principal, "fuera de un concentrado activo" (estado vacío, Descartada o Vencida) y sus propias columnas (proveedor, `fxamount`, moneda, vencimiento y las casillas). Si alguien cambia las columnas de la búsqueda, la app no se rompe.
- **Una factura = una línea.** El nivel inicial sale de las casillas (`gpv_legacy_lib`). Si había huecos, se limpian las casillas y se registra "Limpieza de aprobaciones previas" en la bitácora.
- **Reanudable:** cada factura queda Pendiente en cuanto se crea su línea y sale de la búsqueda. Si se acaban las unidades (se reservan 500 para el cierre), el script se reprograma solo y continúa en el mismo concentrado. Un segundo run el mismo día nunca crea otro concentrado.
- **Cierre:** totales MXN y USD en el concentrado, CSV en `SuiteScripts/gpv_payment_authorization/proposals/` (`concentrado_AAAA-MM-DD.csv`, UTF-8 con BOM para Excel) ligado al concentrado, y resumen en Slack.
- **Sin facturas:** no crea concentrado; publica "No hay facturas pendientes".
- **Límites conocidos:** si una ejecución reprogramada arranca después de medianoche, abre un concentrado con la fecha nueva. Si el script se cae entre crear la línea y marcar la factura, la factura puede quedar con dos líneas.

### 4.2 Vencimiento semanal

- Toma todas las líneas en **Pendiente**. Por cada una: la factura pasa a Vencida y se limpian sus casillas de aprobación; se registra "Vencimiento semanal" en la bitácora; la línea pasa a Vencida y se queda sin nivel.
- **Orden:** primero la factura y después la línea. Si el script se corta, la línea sigue Pendiente y el siguiente intento repite la factura (mismos valores) y la bitácora (idempotente). Nunca queda una factura atorada en Pendiente.
- Una línea Pendiente sin nivel válido también se vence, para no dejar su factura fuera de los concentrados futuros.
- **Reanudable:** se reprograma si quedan menos de 200 unidades. Los concentrados abiertos se cierran solo cuando ya no queda ninguna línea Pendiente.
- Las líneas Autorizadas no se tocan. No publica nada en Slack.

### 4.3 Entrada desde Slack

- NetSuite rechaza con **405**, en su borde, los POST externos cuyo User-Agent es el de Slack (`Slackbot 1.0`). Pasan sin User-Agent o con uno de navegador. No está documentado por NetSuite; se comprobó en el sandbox el 23 nov.
- Por eso la vía principal es: DM de Slack con enlace → **Centro de Autorización interno** (el aprobador entra con su sesión de NS).
- Botones nativos de Slack (futuro): un **Cloudflare Worker** recibe el clic y lo reenvía tal cual al gateway (cuerpo y encabezados de firma, sin el User-Agent de Slack). El Worker no guarda secretos; NetSuite verifica la firma. Alternativa si NetSuite cambia el filtro: Worker → RESTlet con TBA.
- Configuración del gateway: Socket Mode **apagado** en la Slack app; deployment "Disponible sin inicio de sesión", Audiencia con todos los roles y **Subsidiarias vacías** (con subsidiarias, NetSuite responde "no tienes privilegios"); ejecuta como Administrador (pendiente: rol mínimo).

### 4.4 Aprobar y descartar

- `gpv_approval_service_lib` (`approve`, `discard`) es el núcleo de todas las vías. El nivel y el aprobador salen de la línea y de los niveles configurados, nunca de la petición. Puede aprobar el aprobador o el suplente del nivel en que va la línea.
- Aprobar: marca la casilla del nivel en la factura y avanza la línea; en el último nivel la factura y la línea quedan **Autorizadas**.
- Descartar: la factura queda Descartada y se limpian todas sus casillas; la línea guarda motivo y quién descartó. El motivo es obligatorio si así lo dice la Configuración.
- Orden de escritura: factura → bitácora (con llave de idempotencia) → línea. Un doble clic o una línea que ya avanzó no escribe nada. Un intento de alguien que no es el aprobador se registra en la bitácora ("Intento no autorizado") y no cambia nada.
- Gobernanza: ~30 unidades por línea; un Suitelet tiene 1,000. El llamador pasa `hasBudget`: si se acaban las unidades, el servicio se detiene limpio y devuelve las líneas restantes como `NOT_PROCESSED` ("faltan N, da clic otra vez"). Nunca queda una línea a medias. Plan para el Centro: hasta ~25 líneas al momento; más, a segundo plano (Map/Reduce).

### 4.5 Centro de Autorización

- Suitelet **interno** (sesión de NS). `GET` sirve `ui/gpv_approval_center.html`; la página llama a `GET ?action=pending` y a `POST ?action=approve|discard`.
- Cada aprobador ve solo las líneas Pendientes en los niveles donde es aprobador o suplente (`gpv_pending_lines_lib`), agrupadas por concentrado y nivel, con totales por moneda y enlace a la factura.
- **Orden dentro de cada grupo** (`sortLines`, decidido 24 nov): prioridad del proveedor (Alto → Medio → Bajo → sin prioridad), luego USD antes que MXN (otras monedas al final), luego monto de mayor a menor; los empates conservan el vencimiento. La prioridad se lee del proveedor al momento, así que cambiarla reordena sin tocar el concentrado. Aplica a la vista de aprobadores y a la de Tesorería; el CSV del lunes sigue el orden de la búsqueda guardada.
- **Presentación** (24 nov): la página parte cada grupo en una tabla por moneda (USD, MXN y luego otras), con subtotal y "seleccionar todas" por tabla; en el celular el "seleccionar todas" es del grupo. La prioridad (`priority`, texto de la lista) se muestra como etiqueta junto al proveedor.
- El empleado sale de `runtime.getCurrentUser()`, nunca de la petición; el servicio vuelve a validar el nivel.
- CSRF: los POST exigen JSON y el encabezado `X-GPV-Request: 1`. XSS: la página pinta todo con `textContent`.
- Errores: solo `GPV_INVALID_REQUEST` y `GPV_DISCARD_REASON_REQUIRED` se muestran tal cual; lo demás se registra en el log y el usuario ve un mensaje genérico.
- Lotes: ~25-30 líneas por clic; el resto vuelve como "faltan N, da clic otra vez" (`NOT_PROCESSED`).
- **Vista de Tesorería** (`?view=authorized`): la misma página en solo lectura, sin casillas ni botones. Llama a `GET ?action=authorized` (`findAuthorized`): líneas Autorizadas cuya factura sigue abierta (`VendBill:A`; con pago parcial sigue abierta, pagada completa sale sola), agrupadas por concentrado, con enlace a cada factura. Cualquiera con acceso al Centro puede abrirla (decidido 24 nov).
- Página v1 en HTML + JS sin framework. Si crece, se puede cambiar por la SPA (Preact) sin tocar el API.

### 4.6 Avisos en Slack

- **DM al aprobador** (`gpv_notifier_lib.notifyLevels`): el lunes, a **todos** los aprobadores con algo pendiente en cualquier concentrado (`notifyAllApprovers`, decidido 24 nov; antes solo los niveles del concentrado recién generado); y desde el Centro, al aprobador del siguiente nivel cuando unas líneas avanzan. El DM resume todo lo que esa persona tiene pendiente (la misma búsqueda del Centro) y trae el botón "Ver en NetSuite" al Centro. Un DM por persona aunque tenga varios niveles.
- **Aviso a Tesorería** (`notifyTreasury`): cuando líneas quedan Autorizadas (en el Centro o al nacer autorizadas el lunes). El lunes solo avisa de las que **nacieron** autorizadas: las que tienen aprobación en la bitácora ya tuvieron su aviso, así que volver a correr el script no lo repite. Mensaje corto: cuántas facturas se autorizaron, total por moneda y botón "Ver autorizadas" a la vista de Tesorería del Centro, donde está el detalle.
- **Confirmación al aprobador** (`notifyApprover`, decidido 24 nov): tras aprobar en el Centro, DM a quien aprobó con cuántas facturas, total por moneda, cuántas pasan a cada nivel y cuántas quedaron autorizadas. No se manda por descartes.
- Requisitos: el **Usuario de Slack** (`custentity_gpv_slack_user`) capturado en el empleado; si falta, se registra en el log y no se le avisa. La app de Slack necesita `chat:write`.
- Un aviso que falla se registra en el log y **nunca** deshace ni bloquea la aprobación. Los textos de NetSuite se escapan para que no generen menciones ni enlaces en Slack.
- El botón es solo un enlace, pero si la app de Slack tiene **Interactivity** encendida, Slack manda el clic a la Request URL; NetSuite la rechaza (405) y Slack muestra un ⚠️ junto al botón. Mantener Interactivity apagada hasta que exista el Cloudflare Worker.
- Pendiente: avisar también al suplente; actualizar el DM anterior (`chat.update`) en lugar de mandar uno nuevo.

## 5. Configuración inicial

1. Desplegar el proyecto SDF.
2. Capturar API Secrets: bot token y Signing Secret de Slack.
3. Crear la búsqueda de pendientes (no viaja con SDF) e incluir como columnas las 4 casillas de aprobación, moneda e importe. No debe filtrar por las casillas.
4. Llenar el registro de Configuración (búsqueda y canales).
5. Crear los 4 registros de nivel:

| Nombre | Orden | Campo de aprobación |
|---|---|---|
| Director | 1 | `custbody_gpv_dir_approval` |
| CFO | 2 | `custbody_gpv_cfo_approval` |
| CEO 1 | 3 | `custbody_gpv_ceo1_approval` |
| CEO 2 | 4 | `custbody_gpv_ceo2_approval` |

6. Capturar el ID de Slack en el registro de empleado de cada aprobador.
7. Invitar al bot de Slack al canal de CXP.
8. Programar el deployment del lunes (`customdeploy_gpv_weekly_proposal_ss`: ya trae la recurrencia semanal del lunes, pero se despliega como No programado) y el del sábado (`customdeploy_gpv_weekly_expiry_ss`, también No programado con la recurrencia del sábado).

## 6. Desarrollo

- Requisitos: Node 22, extensión SuiteCloud de VS Code.
- `npm test` (Jest), `npm run lint`, `npm run typecheck`, `npm run format:check`.
- Convenciones de nombres e IDs: `CONVENTIONS.md`.

## 7. Decisiones

| Fecha | Decisión |
|---|---|
| 17 nov 2026 | Aprobaciones previas fuera de orden → arranca en nivel 1 y se limpian |
| 18 nov 2026 | Ciclo semanal: concentrado el lunes, vencimiento el sábado |
| 18 nov 2026 | Al descartar se limpian las casillas de la factura |
| 23 nov 2026 | Casillas de aprobación propias en SDF (los campos del prototipo solo existían en el sandbox) |
| 23 nov 2026 | El Director es el nivel 1, con un aprobador general (no por área) |
| 23 nov 2026 | Slack no puede llamar directo a NetSuite (405 por User-Agent). Vía principal: DM con enlace al Centro de Autorización interno; botones nativos después, con un Cloudflare Worker |

## 8. Pendientes y riesgos

- Contraloría debe aceptar la aprobación electrónica en lugar de la firma autógrafa.
- "Expediente completo" (XML, PDF, Constancia) como filtro de entrada: por definir.
- Director por área: por ahora un solo aprobador.
- La búsqueda de pendientes definitiva aún no existe (la del sandbox es de prueba).
- El gateway ejecuta como Administrador: crear un rol mínimo antes de PROD.
- Cuenta de Cloudflare de Grupo Vallas para el Worker (botones nativos en Slack).
