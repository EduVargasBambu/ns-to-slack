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
2. Cada nivel aprueba o descarta sus facturas, en orden: Director → CFO → CEO 1 → CEO 2. **(pendiente: Fase 4)**
3. Al aprobar el último nivel, la factura queda **Autorizada** y se avisa a Tesorería. **(pendiente)**
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
- Listas: estado de línea, estado de concentrado, acción de bitácora, canal.

### Scripts

| Script | Tipo | Estado |
|---|---|---|
| `customscript_gpv_slack_smoke_test_ss` | Scheduled | Prueba de salida a Slack |
| `customscript_gpv_weekly_proposal_ss` | Scheduled | Concentrado semanal (lunes). Probado en el sandbox (23 nov) |
| `customscript_gpv_weekly_expiry_ss` | Scheduled | Vencimiento semanal (sábado). Probado en el sandbox (23 nov) |
| Gateway de Slack | Suitelet | **(pendiente: Fase 4)** |

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

## 8. Pendientes y riesgos

- Contraloría debe aceptar la aprobación electrónica en lugar de la firma autógrafa.
- "Expediente completo" (XML, PDF, Constancia) como filtro de entrada: por definir.
- Director por área: por ahora un solo aprobador.
- La búsqueda de pendientes definitiva aún no existe (la del sandbox es de prueba).
