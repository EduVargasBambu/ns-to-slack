# Convenciones — GPV Autorización de Pagos (NetSuite ↔ Slack)

> v0.2 · 17 nov 2026 (patrón de IDs y glosario confirmados). Contexto de negocio y diseño: `../../NS to Slack/CONTEXTO-proyecto-netsuite-slack.md` y `../../NS to Slack/PLAN-suiteapp-autorizacion-pagos.md`.

## 1. Tipo de proyecto

- Proyecto SDF **Account Customization** (`projecttype="ACCOUNTCUSTOMIZATION"`). Es para un solo cliente, así que no es SuiteApp y no usa Publisher ID.
- Los scripts viven en `src/FileCabinet/SuiteScripts/gpv_payment_authorization/`.
- Todos los objetos llevan el prefijo **`_gpv_`** para no chocar con objetos que ya existan en la cuenta. Un deploy de Account Customization puede sobrescribirlos.

## 2. Idioma

| Qué | Idioma |
|---|---|
| Identificadores (variables, funciones, archivos, IDs de NS) | **Inglés** |
| Comentarios y JSDoc | **Inglés** |
| Textos que ven los usuarios (mensajes de Slack, etiquetas de campos y registros, Excel, PDF) | **Español** |
| Documentación del proyecto (`.md`) | Español |

Los términos del negocio se traducen **siempre** con el glosario (sección 7). No se mezcla español en los identificadores.

## 3. Lenguaje y versión

| Tema | Convención |
|---|---|
| SuiteScript | **2.1** (`@NApiVersion 2.1`) |
| Módulos | AMD: `define([...], (...) => { ... })` |
| Scope | `@NModuleScope SameAccount` |
| Sintaxis | `const`/`let` (nunca `var`), arrow functions, template literals, desestructuración |
| Tipado | **JSDoc + `checkJs`** en `jsconfig.json`, con los tipos de `@hitc/netsuite-types`. Sin compilar TypeScript en SuiteScript |
| SPA (Centro de Autorización) | **TypeScript + Vite + Preact**, en `ui-src/` |

Para que `checkJs` revise el uso de los módulos de NetSuite, cada parámetro del factory que recibe un módulo `N/*` se anota inline:

```js
define(['N/record', './gpv_constants_lib'], (
  /** @type {typeof import('N/record')} */ record,
  constants,
) => { ... });
```

Las librerías propias (`./gpv_*_lib`) no se pueden anotar así, porque TypeScript no reconoce los módulos AMD. Quedan como `any` y las cubren los tests.

Encabezado mínimo de un script:

```js
/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 * @description Public gateway for Slack interactivity. Verifies signature, acks, routes.
 */
```

## 4. Nomenclatura de archivos

Patrón: **`gpv_<name_in_snake_case>_<type>.js`**

| Sufijo | Tipo de script | `@NScriptType` |
|---|---|---|
| `_ue` | User Event | `UserEventScript` |
| `_cs` | Client Script | `ClientScript` |
| `_sl` | Suitelet | `Suitelet` |
| `_rl` | RESTlet | `Restlet` |
| `_mr` | Map/Reduce | `MapReduceScript` |
| `_ss` | Scheduled | `ScheduledScript` |
| `_lib` | Librería / módulo compartido | (sin `@NScriptType`) |

El sufijo del archivo **debe coincidir** con `@NScriptType`.

Ejemplos: `gpv_line_state_machine_lib.js`, `gpv_slack_gateway_sl.js`, `gpv_dispatcher_mr.js`, `gpv_vendor_bill_ue.js`.

Tests: mismo nombre más `.test.js`. Ejemplo: `gpv_line_state_machine_lib.test.js`.

Archivos que no son JS: mismo prefijo, `gpv_<name>.<ext>`. Ejemplo: `gpv_authorization_pdf.xml`. El build de la SPA conserva los nombres que genera Vite.

## 5. IDs de objetos en NetSuite

| Objeto | Patrón | Ejemplo |
|---|---|---|
| Script | `customscript_gpv_<name>_<type>` | `customscript_gpv_slack_gateway_sl` |
| Deployment | `customdeploy_gpv_<name>_<type>` | `customdeploy_gpv_slack_gateway_sl` |
| Deployment adicional | `customdeploy_gpv_<name>_<type>_<variant>` | `customdeploy_gpv_dispatcher_mr_ondemand`, `customdeploy_gpv_dispatcher_mr_sched` |
| Custom record | `customrecord_gpv_<name>` | `customrecord_gpv_payment_proposal` |
| Campo de custom record | `custrecord_gpv_<record_abbr>_<field>` | `custrecord_gpv_pp_meeting_date` |
| Campo de transacción | `custbody_gpv_<field>` | `custbody_gpv_authorization_status` |
| Campo de entidad | `custentity_gpv_<field>` | `custentity_gpv_slack_user` |
| Lista | `customlist_gpv_<name>` | `customlist_gpv_line_status` |
| Valor de lista | `val_gpv_<code>` (el código del glosario en minúsculas) | `val_gpv_pending` |
| Rol | `customrole_gpv_<name>` | `customrole_gpv_slack_gateway` |
| Archivo XML de SDF | Igual al ID del objeto | `src/Objects/customscript_gpv_slack_gateway_sl.xml` |

- Archivo, script y deployment comparten nombre. Con una sola búsqueda se encuentra la pieza en el repo, en el File Cabinet y en la lista de scripts.
- Los valores de lista se identifican en código por su scriptid, **nunca por internal ID**, porque el internal ID cambia entre sandbox y producción.
- **Límite: 40 caracteres por ID, prefijo incluido.** Si un nombre no cabe, se abrevia y la abreviatura se agrega al glosario.
- Abreviaturas de record para campos: `pp` (payment proposal), `pl` (proposal line), `al` (audit log), `oq` (outbound queue), `sm` (slack message), `lvl` (approval level), `cfg` (config).

## 6. Estructura de carpetas

```
Gpo_Vallas_NS_to_Slack/
  src/
    manifest.xml
    deploy.xml
    Objects/                                  # XML de SDF, una subcarpeta por tipo de objeto
      Lists/                                  # customlist_*
      Records/                                # customrecord_* (con sus campos custrecord_*)
      Fields/                                 # campos de registros nativos (custbody_*, custentity_*)
      Scripts/                                # customscript_* (con sus deployments)
    FileCabinet/SuiteScripts/gpv_payment_authorization/
      lib/        # núcleo: lógica de negocio, sin dependencia del canal
      slack/      # cliente, verificación de firma, Block Kit, router de interacciones
      scripts/    # entry points (sl, mr, ue, ...)
      render/     # plantillas PDF (fase 5)
      ui/         # build de la SPA (generado, no se edita a mano)
  ui-src/          # código fuente de la SPA (TS + Vite + Preact)
  __tests__/       # replica la estructura de lib/ y slack/
  types/           # declaraciones globales para checkJs (p. ej. define de AMD)
  slack/manifest.yml   # Slack App Manifest versionado
  CONVENTIONS.md
```

### Reglas de arquitectura

1. **Los entry points son delgados.** Leen la entrada, llaman a `lib/` o a `slack/` y responden. No tienen lógica de negocio.
2. **`lib/` no sabe de canales.** No importa nada de `slack/` ni genera HTML. Slack y la SPA solo traducen entradas hacia el núcleo.
3. **El nivel y el aprobador nunca salen de parámetros.** Se derivan del estado de la línea y del empleado autenticado.
4. **Los IDs de NS se definen en un solo lugar:** `gpv_constants_lib.js`. Ningún script repite un ID de campo o de record como string.
5. **Los valores que cambian se configuran en `customrecord_gpv_config` y `customrecord_gpv_approval_level`, nunca en el código:** IDs de búsqueda, canales, umbrales, aprobadores.
6. **Los secretos (bot token, Signing Secret) van en API Secrets**, nunca en el código ni en el repo.
7. **Las funciones puras se escriben aparte de las que tocan `N/record` o `N/search`**, para probarlas con Jest sin mocks pesados.

## 7. Glosario de dominio

| Negocio (español) | Código (inglés) | ID en NS |
|---|---|---|
| Concentrado | `PaymentProposal` | `customrecord_gpv_payment_proposal` |
| Línea del concentrado | `ProposalLine` | `customrecord_gpv_proposal_line` |
| Junta | `meeting` | `custrecord_gpv_pp_meeting_date` |
| Nivel de aprobación (Director, CFO, CEO 1, CEO 2) | `ApprovalLevel` | `customrecord_gpv_approval_level` |
| Aprobar / Descartar (acciones de bitácora: también Intento no autorizado / Limpieza de aprobaciones previas) | `approve` / `discard` (`unauthorized` / `clear_legacy`) | `customlist_gpv_action` |
| Estado de la línea | `LineStatus` (`PENDING`, `AUTHORIZED`, `DISCARDED`, `PAID`) | `customlist_gpv_line_status` |
| Estado del concentrado (Abierto / Cerrado / Cancelado) | `ProposalStatus` (`OPEN`, `CLOSED`, `CANCELLED`) | `customlist_gpv_proposal_status` |
| Estado de autorización en la factura | `authorizationStatus` | `custbody_gpv_authorization_status` |
| Factura de proveedor | `vendorBill` | (nativo) |
| Bitácora | `AuditLog` | `customrecord_gpv_audit_log` |
| Canal de la acción (Slack / NetSuite) | `Channel` (`SLACK`, `NETSUITE`) | `customlist_gpv_channel` |
| Cola saliente | `OutboundQueue` | `customrecord_gpv_outbound_queue` |
| Mensaje de Slack | `SlackMessage` | `customrecord_gpv_slack_message` |
| Configuración | `Config` | `customrecord_gpv_config` |
| Casillas de aprobación por nivel en la factura | `legacy` | `custbody_gpv_dir_approval`, `custbody_gpv_cfo_approval`, `custbody_gpv_ceo1_approval`, `custbody_gpv_ceo2_approval` |
| Centro de Autorización | `ApprovalCenter` | `customscript_gpv_approval_center_sl` |
| Despachador | `dispatcher` | `customscript_gpv_dispatcher_mr` |
| Recordatorios | `reminders` | `customscript_gpv_reminders_mr` |
| Tesorería | `treasury` | |
| CXP (cuentas por pagar) | `accountsPayable` / `ap` | |
| Expediente completo | `completeFile` | (fase 5) |

"Discard" y no "reject": la factura descartada **vuelve a pendientes** y no se rechaza en definitiva.

## 8. Mapa inicial de archivos

| Carpeta | Archivos |
|---|---|
| `lib/` | `gpv_constants_lib.js`, `gpv_config_lib.js`, `gpv_line_state_machine_lib.js`, `gpv_legacy_lib.js`, `gpv_approval_service_lib.js`, `gpv_proposal_service_lib.js`, `gpv_audit_log_lib.js`, `gpv_outbound_queue_lib.js` |
| `slack/` | `gpv_slack_client_lib.js`, `gpv_slack_verify_lib.js`, `gpv_slack_block_builder_lib.js`, `gpv_slack_interaction_router_lib.js` |
| `scripts/` | `gpv_approval_center_sl.js`, `gpv_slack_gateway_sl.js`, `gpv_dispatcher_mr.js`, `gpv_reminders_mr.js`, `gpv_vendor_bill_ue.js` |

## 9. Estilo de código

- **ESLint + Prettier** con reglas mínimas. Prettier define el formato; no se discute a mano.
- Comillas simples, punto y coma, 2 espacios, ancho de 100.
- JSDoc obligatorio en las funciones exportadas de `lib/` y `slack/`: `@param`, `@returns` y `@throws` si aplica.
- Errores de negocio con `error.create({ name: 'GPV_<CODE>', message })`, con códigos en `UPPER_SNAKE`. Ejemplo: `GPV_NOT_CURRENT_APPROVER`.
- Logs con el objeto global `log` (`log.debug`, `log.audit`, `log.error`, `log.emergency`). **No se importa `N/log`**: NetSuite lo carga por defecto en todos los scripts. Título fijo por módulo: `log.audit('gpv_dispatcher_mr', ...)`. **Nunca se registran tokens ni payloads completos de Slack.**
- `log.error` registra un error; `error.create` (de `N/error`) lo lanza. Son cosas distintas: `N/error` sí se importa.

## 10. Tests

- **Jest + `@oracle/suitecloud-unit-testing`.**
- Prioridad: máquina de estados, `legacy`, verificación de firma de Slack (vector oficial de la documentación), snapshots de Block Kit, y servicio de aprobación con `N/record` simulado.
- Antes de cada deploy: `npm test` y validar el proyecto contra la cuenta (extensión SuiteCloud de VS Code: *Validate Project* en el servidor). Todo se despliega primero al **sandbox**.

## 11. Git

- Remoto: `https://github.com/EduVargasBambu/ns-to-slack` (`origin`), rama principal `main`.
- No se suben al repo: secretos, `node_modules/`, `ui/` generado (se construye antes del deploy) ni archivos de cuenta de `suitecloud`.
- Mensajes de commit en inglés, en imperativo: `Add line state machine`.

## Decisiones confirmadas (17 nov 2026)

- Patrón de IDs de la sección 5 con el tipo al final (`customscript_gpv_<name>_<type>`), simétrico con el nombre del archivo. Variante para deployments múltiples: `customdeploy_gpv_<name>_<type>_<variant>`.
- Concentrado → `PaymentProposal` (abreviatura `pp`). Frente al cliente se dice "concentrado".
- Se agregan `ProposalStatus` y `Channel` al glosario.
