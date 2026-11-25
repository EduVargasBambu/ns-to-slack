# Aprobación de CEOs por enlace externo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que los aprobadores sin usuario de NetSuite (CEOs, niveles 3 y 4, y sus suplentes) revisen y aprueben desde el DM de Slack con un enlace firmado que caduca a los 7 días.

**Architecture:** una segunda implementación (deployment) **externa** del Suitelet del Centro (`customscript_gpv_approval_center_sl`), que ejecuta como Administrador. En esa implementación el empleado sale de un token firmado (HMAC-SHA256 con un API Secret), nunca de la sesión. El token no se guarda: es `{empleado}.{caducidad}.{firma}`. El notificador decide por nivel (casilla nueva) si el DM lleva el enlace externo o el botón al Centro. La página es la misma (`gpv_approval_center.html`) en modo externo.

**Tech Stack:** SuiteScript 2.1 (AMD, JSDoc + checkJs), SDF Account Customization, Jest con `@oracle/suitecloud-unit-testing`, `N/crypto`.

**Spec:** decisiones del 24 y 25 nov 2026 (memoria `ceo-external-link-approval` y `CLAUDE.md`). Resumen en "Decisiones" abajo.

## Decisiones (spec)

- Solo los niveles con la casilla **"Aprueba por enlace externo"** (`custrecord_gpv_lvl_external_link`) usan el enlace; se marcará en los niveles 3 y 4. El aprobador **y el suplente** de esos niveles reciben el DM con el enlace.
- Desmarcar la casilla invalida al momento los enlaces ya enviados (se revisa en cada petición).
- Token: `{employeeId}.{expSeconds}.{hmacHex}`; HMAC-SHA256 de `{employeeId}.{expSeconds}` con `custsecret_gpv_link_key`. Caduca **7 días** después de enviarse el DM.
- El token viaja **solo en el encabezado `X-GPV-Token`** (también sirve de protección CSRF). En la URL del DM va como `t=`, la página lo lee y lo pone en el encabezado; el servidor ignora el parámetro de la URL.
- Enlace caducado o inválido: la página muestra "Este enlace ya caducó o no es válido. El lunes recibirás uno nuevo en Slack." (sin detalle técnico).
- Bitácora: canal `EXTERNAL_LINK` (ya existe, commit `defa14a`).
- Modo externo de la página: sin enlaces a la factura y sin vista de Tesorería.
- Los CEOs son empleados **sin acceso** a NetSuite, con `custentity_gpv_slack_user`, y son aprobador o suplente del nivel.
- Fuera de alcance: PDF de la factura, "Sign in with Slack", rol mínimo (se usa Administrador como el gateway).

## Global Constraints

- Código, nombres y JSDoc en inglés; mensajes al usuario y documentación en español.
- SuiteScript `@NApiVersion 2.1`, `@NModuleScope SameAccount`, módulos AMD `define([...])`.
- IDs nuevos: `custrecord_gpv_lvl_external_link`, `custsecret_gpv_link_key`, `customdeploy_gpv_approval_center_ext`. No hay más IDs nuevos.
- Antes de cada commit pasan `npm test`, `npm run lint`, `npm run typecheck` y `npm run format:check`.
- Commits: mensaje en inglés, en imperativo, como los del repo (`git log`). **Sin** línea `Co-Authored-By`. Proponer el mensaje al usuario y esperar su OK antes de cada commit; push solo si lo pide aparte.
- Validación y deploy los hace el usuario con la extensión SuiteCloud de VS Code; no usar la CLI.

## Review Focus

1. Una petición a la implementación externa **sin token, con token basura o con el token solo en la URL** nunca debe llegar a `pendingLines` ni a `approvalService` → Task 3, tests `rejects external request without header token` y `ignores token in query string`.
2. Token válido de un empleado cuyo nivel ya **no** tiene la casilla, o de un empleado **inactivo** → rechazado → Task 3, tests `rejects when level no longer uses external link` y `rejects inactive employee`.
3. La implementación interna **sigue usando la sesión** aunque le manden `X-GPV-Token` (no se debe poder suplantar a nadie desde dentro) → Task 3, test `internal deployment ignores token header`.
4. La casilla en resultados de búsqueda puede llegar como `true` o como `'T'` → Task 1, se lee con `value === true || value === 'T'`; test en `isExternalLinkEmployee` con ambos.
5. Un empleado que es aprobador en un nivel interno **y** suplente en uno externo recibe el enlace y en la página ve todo lo suyo (las dos cosas). Es el comportamiento esperado; queda en la documentación (Task 5).

---

### Task 1: Casilla del nivel y regla "usa enlace externo"

**Files:**
- Modify: `src/Objects/Records/customrecord_gpv_approval_level.xml` (campo nuevo, después de `custrecord_gpv_lvl_substitute`)
- Modify: `src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_constants_lib.js` (`ApprovalLevel.EXTERNAL_LINK`)
- Modify: `src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_approval_level_lib.js` (leer la columna)
- Modify: `types/gpv.d.ts` (`GpvLevel.externalLink: boolean`)
- Modify: `src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_approval_lib.js` (función pura)
- Test: `__tests__/lib/gpv_approval_lib.test.js`
- Fix fixtures: los `getLevels` simulados en `__tests__/slack/gpv_notifier_lib.test.js` y `__tests__/lib/gpv_pending_lines_lib.test.js` agregan `externalLink: false` si el typecheck lo pide.

**Interfaces:**
- Produces: `ApprovalLevel.EXTERNAL_LINK = 'custrecord_gpv_lvl_external_link'`; `GpvLevel.externalLink: boolean`; `approvalLib.isExternalLinkEmployee(levels: GpvLevel[], employeeId: string): boolean`.

- [ ] **Step 1: Write the failing test** en `gpv_approval_lib.test.js`:

```js
describe('isExternalLinkEmployee', () => {
  const levels = [
    { id: '1', order: 1, approverId: '10', substituteId: '', externalLink: false },
    { id: '3', order: 3, approverId: '30', substituteId: '31', externalLink: true },
  ];
  it('is true for the approver and the substitute of a level with the checkbox', () => {
    expect(isExternalLinkEmployee(levels, '30')).toBe(true);
    expect(isExternalLinkEmployee(levels, '31')).toBe(true);
  });
  it('is false for approvers of other levels and unknown employees', () => {
    expect(isExternalLinkEmployee(levels, '10')).toBe(false);
    expect(isExternalLinkEmployee(levels, '99')).toBe(false);
    expect(isExternalLinkEmployee(levels, '')).toBe(false);
  });
});
```

- [ ] **Step 2:** `npx jest __tests__/lib/gpv_approval_lib.test.js` → FAIL (`isExternalLinkEmployee is not a function`).
- [ ] **Step 3: Implement.** `isExternalLinkEmployee` en `gpv_approval_lib.js` y exportarla. El campo XML: `CHECKBOX`, etiqueta "Aprueba por enlace externo", `defaultchecked` F, `help` en español ("Márcala en los niveles cuyos aprobadores no tienen usuario de NetSuite (CEOs). El DM de Slack llevará un enlace firmado que caduca en 7 días. Al desmarcarla, los enlaces ya enviados dejan de funcionar."); copiar el resto de etiquetas del campo `custrecord_gpv_lvl_substitute`. En `getLevels`: columna `ApprovalLevel.EXTERNAL_LINK` y `externalLink: v === true || v === 'T'`.
- [ ] **Step 4:** `npm test && npm run lint && npm run typecheck && npm run format:check` → todo verde.
- [ ] **Step 5: Commit** (proponer y esperar OK): `Add "approves by external link" checkbox to approval levels`.

### Task 2: Token firmado

**Files:**
- Create: `src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_link_token_lib.js`
- Modify: `gpv_constants_lib.js` (`Secret.LINK_KEY = 'custsecret_gpv_link_key'`)
- Test: `__tests__/lib/gpv_link_token_lib.test.js` (simular `N/crypto` con Node como en `__tests__/slack/gpv_slack_signature_lib.test.js`; el secreto `custsecret_gpv_link_key` resuelve a `'test-link-key'`)

**Interfaces:**
- Consumes: `safeEqual(a, b)` de `../slack/gpv_slack_signature_lib`.
- Produces:
  - `TTL_SECONDS = 7 * 24 * 60 * 60`
  - `create({ employeeId: string, nowSeconds?: number }): string` → `'{employeeId}.{nowSeconds + TTL_SECONDS}.{hmacHexLowercase}'`
  - `verify(token: string, nowSeconds?: number): { valid: boolean, employeeId: string, reason: string }` — `employeeId` es `''` si no es válido; `reason` es para la bitácora del script: `'formato inválido'`, `'firma inválida'`, `'caducado'`.

- [ ] **Step 1: Write the failing tests:**

```js
const NOW = 1_800_000_000;
it('round-trips: a fresh token is valid and carries the employee', () => {
  expect(verify(create({ employeeId: '30', nowSeconds: NOW }), NOW)).toEqual({ valid: true, employeeId: '30', reason: '' });
});
it('is valid on the last second and expired one second later', () => {
  const t = create({ employeeId: '30', nowSeconds: NOW });
  expect(verify(t, NOW + TTL_SECONDS).valid).toBe(true);
  expect(verify(t, NOW + TTL_SECONDS + 1)).toEqual({ valid: false, employeeId: '', reason: 'caducado' });
});
it('rejects a token whose employee or expiry was changed', () => {
  const [, exp, sig] = create({ employeeId: '30', nowSeconds: NOW }).split('.');
  expect(verify(`31.${exp}.${sig}`, NOW).reason).toBe('firma inválida');
  expect(verify(`30.${Number(exp) + 999}.${sig}`, NOW).reason).toBe('firma inválida');
});
it.each(['', 'abc', '30.1', '30.x.ff', `30.${NOW}.${'g'.repeat(64)}`])('rejects malformed %p', (t) => {
  expect(verify(t, NOW)).toEqual({ valid: false, employeeId: '', reason: 'formato inválido' });
});
```

- [ ] **Step 2:** `npx jest __tests__/lib/gpv_link_token_lib.test.js` → FAIL (módulo no existe).
- [ ] **Step 3: Implement** con el mismo patrón de `sign()` de `gpv_slack_signature_lib` (`crypto.createSecretKey({ secret: Secret.LINK_KEY, ... })`, HMAC-SHA256, salida HEX en minúsculas). Formato validado con `/^(\d+)\.(\d+)\.([0-9a-f]{64})$/`; la firma se compara con `safeEqual` antes de mirar la caducidad.
- [ ] **Step 4:** checks completos → verde.
- [ ] **Step 5: Commit**: `Add signed external link token`.

### Task 3: Implementación externa del Centro

**Files:**
- Modify: `src/Objects/Scripts/SL/customscript_gpv_approval_center_sl.xml` (segundo `scriptdeployment`)
- Modify: `gpv_constants_lib.js` (`ApprovalCenter.EXTERNAL_DEPLOYMENT = 'customdeploy_gpv_approval_center_ext'`)
- Modify: `src/FileCabinet/SuiteScripts/gpv_payment_authorization/scripts/gpv_approval_center_sl.js`
- Test: `__tests__/scripts/gpv_approval_center_sl.test.js` (nuevo; simular `N/runtime`, `N/file`, `N/search`, `gpv_link_token_lib`, `gpv_approval_level_lib`, `gpv_pending_lines_lib`, `gpv_approval_service_lib`, `gpv_notifier_lib`)

**Interfaces:**
- Consumes: `linkToken.verify` (Task 2), `approvalLib.isExternalLinkEmployee` y `GpvLevel.externalLink` (Task 1), `signatureLib.getHeader`, `auditLog.AuditChannel.EXTERNAL_LINK`.
- Produces: implementación `customdeploy_gpv_approval_center_ext` que acepta `GET ?action=pending` y `POST ?action=approve|discard` con el encabezado `X-GPV-Token`. Las respuestas tienen la misma forma que la implementación interna.

- [ ] **Step 1: Write the failing tests** (un `onRequest` con `request.headers`, `parameters`, `method`, `body` y una `response` simulada que guarda `write`):
  - `rejects external request without header token`: implementación externa, sin encabezado → respuesta `{ ok: false, error: EXPIRED_MESSAGE }`; `findForEmployee`, `approve` y `discard` no se llaman.
  - `ignores token in query string`: token válido solo en `parameters.t` → igual que arriba.
  - `rejects when level no longer uses external link`: token válido, `getLevels` sin casilla para ese empleado → rechazo.
  - `rejects inactive employee`: `search.lookupFields` devuelve `isinactive: true` → rechazo.
  - `rejects the authorized view externally`: `GET ?action=authorized` con token válido → `{ ok: false, error: 'Acción no válida.' }`.
  - `approves as the token's employee through the external channel`: token válido de `'30'`, `POST ?action=approve` con `{"lineIds":["5"]}` → `approve` se llama con `employeeId: '30'` y `channel: 'EXTERNAL_LINK'`; `notifyAfterAction` recibe `employeeName` del empleado.
  - `internal deployment ignores token header`: implementación interna, sesión del usuario `'10'` y un `X-GPV-Token` válido de `'30'` → `findForEmployee('10')`.
  - `EXPIRED_MESSAGE = 'Este enlace ya caducó o no es válido. El lunes recibirás uno nuevo en Slack.'`
- [ ] **Step 2:** `npx jest __tests__/scripts` → FAIL.
- [ ] **Step 3: Implement.** En `onRequest`, sacar `{ employeeId, employeeName }` de una de dos vías según `runtime.getCurrentScript().deploymentId`. **Nunca** decidir la vía por algo que venga en la petición.
  - Interna (cualquier otra implementación): igual que hoy, `runtime.getCurrentUser()`.
  - Externa: `linkToken.verify(getHeader(headers, 'X-GPV-Token'))`, luego `search.lookupFields(EMPLOYEE, id, ['isinactive', 'firstname', 'lastname'])` (inactivo o error → rechazo), luego `isExternalLinkEmployee(levelLib.getLevels(), id)`. Cualquier fallo → `log.audit` con el motivo y `{ ok: false, error: EXPIRED_MESSAGE }`. `GET` sin `action` sirve la página sin validar (el error aparece cuando la página pide `pending`). En la externa, `authorized` es "Acción no válida". En POST, el token en el encabezado cumple la función de `X-GPV-Request`, así que no se pide.
  - Canal: `EXTERNAL_LINK` en la externa y `NETSUITE` en la interna.
  - XML: segundo `scriptdeployment` copiado del de `customscript_gpv_slack_gateway_sl` (`isonline` T, `runasrole` ADMINISTRATOR, `allemployees` F, `allroles` T), con título "GPV - Centro de Autorización (enlace externo)".
- [ ] **Step 4:** checks completos → verde.
- [ ] **Step 5: Commit**: `Serve the Approval Center to external-link approvers with a signed token`.

### Task 4: Modo externo de la página y DM con el enlace

**Files:**
- Modify: `src/FileCabinet/SuiteScripts/gpv_payment_authorization/ui/gpv_approval_center.html`
- Modify: `src/FileCabinet/SuiteScripts/gpv_payment_authorization/slack/gpv_notification_message_lib.js`
- Modify: `src/FileCabinet/SuiteScripts/gpv_payment_authorization/slack/gpv_notifier_lib.js`
- Test: `__tests__/slack/gpv_notification_message_lib.test.js`, `__tests__/slack/gpv_notifier_lib.test.js`

**Interfaces:**
- Consumes: `linkToken.create` (Task 2), `isExternalLinkEmployee` (Task 1), `ApprovalCenter.EXTERNAL_DEPLOYMENT` (Task 3).
- Produces: `buildApproverDm(groups, centerUrl, buttonText = 'Ver en NetSuite')`.

- [ ] **Step 1: Write the failing tests:**
  - message lib: `buildApproverDm(groups, 'https://x', 'Revisar y autorizar')` → el botón tiene `text.text === 'Revisar y autorizar'` y `url === 'https://x'`; sin tercer parámetro sigue siendo `'Ver en NetSuite'`.
  - notifier: niveles simulados donde el `'13'` (CEO) tiene `approverId '30'`, `substituteId '31'` y `externalLink: true`, y `linkToken.create` simulado devuelve `'TOKEN-<id>'`. `notifyLevels(['13'])` manda 2 DMs. Cada uno tiene un botón cuyo `url` empieza con la URL externa simulada de `resolveScript({ returnExternalUrl: true })`, termina en `&t=TOKEN-30` (o `TOKEN-31`) y dice `'Revisar y autorizar'`. El DM a un aprobador de nivel sin casilla no cambia (botón al Centro, sin `t=`). El suplente de un nivel **sin** casilla sigue sin recibir DM.
- [ ] **Step 2:** `npx jest __tests__/slack` → FAIL.
- [ ] **Step 3: Implement.**
  - notifier: en `notifyLevels`, los destinatarios son el aprobador de cada nivel más el suplente de los niveles con `externalLink`. Actualizar el comentario `shortcut:`: los suplentes de niveles internos siguen sin aviso. Por empleado, si `isExternalLinkEmployee(levels, id)`, el botón va a `getExternalUrl()` + `'&t=' + encodeURIComponent(linkToken.create({ employeeId: id }))` con el texto `'Revisar y autorizar'`. `getExternalUrl` usa `url.resolveScript({ scriptId: ApprovalCenter.SCRIPT, deploymentId: ApprovalCenter.EXTERNAL_DEPLOYMENT, returnExternalUrl: true })`, que ya devuelve la URL completa.
  - página: `const token = new URLSearchParams(location.search).get('t')`. Si hay token: (a) los dos `fetch` agregan el encabezado `'X-GPV-Token': token`; (b) se ignora `view=authorized`; (c) `renderLine` pone el folio como texto (`span`) en lugar del enlace a `vendbill.nl`. Revisar que el `catch` de `load()` muestre `data.error` (es el mensaje de caducado).
- [ ] **Step 4:** checks completos → verde.
- [ ] **Step 5: Commit**: `Send external-link approvers a signed link in their Slack DM`.

### Task 5: Documentación y prueba en el sandbox

**Files:**
- Modify: `docs/documentacion-tecnica.md` (arquitectura, objetos, sección 5 de puesta en marcha)
- Modify: `docs/manual-usuario.md` (sección para CEOs y sección 8 del administrador)
- Modify: `CLAUDE.md` (línea de estado)

- [ ] **Step 1: Técnica.** Token, implementación externa, casilla, canal `Enlace externo` y Review Focus 5. En la sección 5, agregar los pasos:
  1. Generar la clave con `openssl rand -hex 32` (una distinta por cuenta: sandbox y PROD).
  2. Crear el API Secret `custsecret_gpv_link_key`, con scripts permitidos: Centro de Autorización y Concentrado semanal.
  3. Implementación externa: Audiencia con todos los roles y **Subsidiarias vacías**.
  4. Marcar la casilla en los niveles 3 y 4.
  5. Dar de alta a los CEOs como empleados sin acceso, con su Usuario de Slack.
  6. Para invalidar todos los enlaces: cambiar la clave.
- [ ] **Step 2: Manual.** Para el CEO: llega un DM con "Revisar y autorizar"; el enlace sirve 7 días y cada lunes llega uno nuevo; sin enlace a la factura; poner un marcador "📷 Captura". Para el administrador: la casilla del nivel y cómo cortar los enlaces (desmarcar la casilla o cambiar la clave). Sin IDs ni código.
- [ ] **Step 3: Prueba en el sandbox** (la hace el usuario):
  1. Desplegar.
  2. Crear el secreto.
  3. Marcar el nivel 3 y poner como aprobador a un empleado de prueba sin acceso.
  4. Correr el script del lunes y recibir el DM.
  5. Abrir el enlace en un navegador sin sesión de NetSuite; aprobar una factura y revisar que la bitácora tenga canal "Enlace externo".
  6. Desmarcar la casilla y recargar: debe salir el mensaje de caducado.
  7. Cambiar a mano un dígito del `t=` en la URL: debe salir el mismo mensaje.
- [ ] **Step 4: Commit** (proponer y esperar OK): `Document external link approval for the CEOs`.
