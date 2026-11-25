# Centro de Autorización: más datos por factura y orden por subsidiaria — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que el Centro muestre por factura los datos para decidir (descripción del proveedor, fecha, nota, subsidiaria), ordenados por subsidiaria, con "Ver detalle" y "Vista completa" alimentados por la búsqueda guardada.

**Architecture:** `gpv_pending_lines_lib` agrega a cada línea los datos de la factura y del proveedor (joins en `searchLines`) y ordena primero por subsidiaria (`sortLines`). Una función nueva lee la búsqueda guardada de la Configuración, filtrada a las facturas mostradas, y agrega `details` por línea y `detailColumns` a la respuesta. La página separa cada grupo por subsidiaria y luego por moneda, y dibuja la vista compacta, el detalle desplegable y la vista completa.

**Tech Stack:** SuiteScript 2.1 (AMD, JSDoc + checkJs), SDF Account Customization, Jest con `@oracle/suitecloud-unit-testing`, HTML + JS sin framework.

**Spec:** `docs/superpowers/specs/2026-11-25-approval-center-bill-data-design.md`

## Global Constraints

- Código, nombres y JSDoc en inglés; textos de la interfaz y documentación en español.
- SuiteScript `@NApiVersion 2.1`, `@NModuleScope SameAccount`, AMD `define([...])`.
- Único ID nuevo: `custentity_gpv_vendor_description` (etiqueta "Descripción de proveedor", texto).
- La búsqueda guardada es la de la Configuración (`configLib.getConfig().pendingSearch`); si falta o falla, el Centro funciona igual sin detalle (se registra en el log). Como máximo **una** búsqueda adicional por petición.
- Valores del detalle siempre como texto (`textContent`), nunca HTML; en modo externo (token) nada enlaza a NetSuite.
- El CSV del lunes no cambia.
- Antes de cada commit pasan `npm test`, `npm run lint`, `npm run typecheck` y `npm run format:check`.
- Commits: mensaje en inglés, imperativo, **sin** `Co-Authored-By`; proponer el mensaje al usuario y esperar su OK antes de cada commit; push solo si lo pide aparte. Los implementadores no hacen commit.

## Review Focus

1. Factura **sin subsidiaria** (o subsidiaria sin nombre jerárquico) → va al final, sin romper el orden → Task 1, test `puts lines without subsidiary last`.
2. **Búsqueda guardada sin configurar, borrada o sin permiso** para el rol → `detailColumns: []`, líneas sin `details`, la respuesta `pending` sigue `ok: true` → Task 2, test `returns no details when the saved search is missing or fails`.
3. Una factura que la búsqueda **no devuelve** (por ejemplo, columna con join que la excluye) → esa línea sin `details`, las demás con los suyos → Task 2, test `leaves lines without details when the search does not return their bill`.
4. La **misma factura en dos concentrados** → las dos líneas reciben los mismos `details` (indexados por factura) → Task 2, test `gives the same details to two lines of the same bill`.
5. Muchas columnas en la búsqueda en el **celular** → la vista compacta no cambia (el detalle es una lista vertical) y la vista completa no aparece por debajo de 1024 px → Task 3, revisión manual en el navegador.

---

### Task 1: Datos nuevos por línea y orden por subsidiaria

**Files:**
- Create: `src/Objects/Fields/Entity/custentity_gpv_vendor_description.xml` (copiar el patrón de `custentity_gpv_vendor_priority.xml`; tipo `TEXT`, aplica a proveedor, etiqueta "Descripción de proveedor", `help`: "Descripción breve de qué hace el proveedor. Se muestra en el Centro de Autorización debajo de su nombre.")
- Modify: `src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_constants_lib.js` (`Vendor.DESCRIPTION`)
- Modify: `src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_pending_lines_lib.js` (`PendingLine`, `searchLines`, `sortLines`, nueva `shortSubsidiaryName`)
- Test: `__tests__/lib/gpv_pending_lines_lib.test.js`

**Interfaces:**
- Produces: `PendingLine` gana `subsidiary: string` (ya en forma corta; `''` si no hay), `billDate: string`, `memo: string`, `vendorDescription: string`. `shortSubsidiaryName(name: string): string` exportada. `sortLines` ordena subsidiaria (alfabética, `localeCompare` con `'es'`, vacía al final) → prioridad → moneda → monto.

- [ ] **Step 1: Write the failing tests:**

```js
describe('shortSubsidiaryName', () => {
  it('keeps only the last segment of a hierarchical name', () => {
    expect(shortSubsidiaryName('Grupo Vallas : Ecovallas')).toBe('Ecovallas');
    expect(shortSubsidiaryName('Ecovallas')).toBe('Ecovallas');
    expect(shortSubsidiaryName('')).toBe('');
  });
});
// en describe('sortLines'), con line(...) extendido con subsidiary:
it('orders by subsidiary first, alphabetically', () => {
  // B (Alto) antes que A (Bajo) por prioridad, pero 'Bambú' va antes que 'Ecovallas'
  expect(sortLines([ecovallasAlto, bambuBajo]).map((l) => l.subsidiary)).toEqual(['Bambú', 'Ecovallas']);
});
it('puts lines without subsidiary last', () => {
  expect(sortLines([sinSubsidiaria, ecovallas]).map((l) => l.subsidiary)).toEqual(['Ecovallas', '']);
});
```
Los tests existentes de `sortLines` siguen pasando con `subsidiary` igual en todas sus líneas (agregar `subsidiary: 'Ecovallas'` al helper `line`).

- [ ] **Step 2:** `npx jest __tests__/lib/gpv_pending_lines_lib.test.js` → FAIL.
- [ ] **Step 3: Implement.** En `searchLines`, columnas con join a la factura (`ProposalLine.VENDOR_BILL`): `subsidiary` (texto, pasado por `shortSubsidiaryName`), `trandate`, `memo`; y al proveedor (`ProposalLine.VENDOR`): `Vendor.DESCRIPTION`. Todos con `|| ''`.
- [ ] **Step 4:** checks completos → verde.
- [ ] **Step 5: Commit** (proponer y esperar OK): `Add bill date, memo, subsidiary and vendor description to Approval Center lines`.

### Task 2: Detalle desde la búsqueda guardada

**Files:**
- Modify: `src/FileCabinet/SuiteScripts/gpv_payment_authorization/lib/gpv_pending_lines_lib.js` (nueva `attachDetails`; agrega dependencia `./gpv_config_lib`)
- Modify: `src/FileCabinet/SuiteScripts/gpv_payment_authorization/scripts/gpv_approval_center_sl.js` (respuestas `pending` y `authorized`)
- Test: `__tests__/lib/gpv_pending_lines_lib.test.js`, `__tests__/scripts/gpv_approval_center_sl.test.js`

**Interfaces:**
- Consumes: grupos de `findForEmployee` / `findAuthorized` (cada uno con `lines: PendingLine[]`).
- Produces: `attachDetails(groups: { lines: PendingLine[] }[]): string[]` — devuelve `detailColumns` (etiquetas de la búsqueda, `label || name`, en orden) y pone en cada línea `details: string[]` (mismo orden; `getText || getValue`, como `String`) cuando la búsqueda devolvió su factura. `PendingLine.details?: string[]`. Las respuestas JSON de `pending` y `authorized` agregan `detailColumns`.

- [ ] **Step 1: Write the failing tests** (simular `search.load` devolviendo un objeto con `columns`, `filterExpression` asignable y `run().each` sobre filas con `id`, `getText`, `getValue`; simular `configLib.getConfig`):
  - `applies the saved search columns to each line by bill`: columnas `[{label:'Serie'}, {name:'terms'}]` → devuelve `['Serie', 'terms']`; la línea con `billId '7'` recibe `['A', '30 días']`.
  - `replaces the saved search filters with the shown bills`: `filterExpression` queda `[['mainline','is','T'],'AND',['internalid','anyof',['7','8']]]` (facturas sin repetir).
  - `gives the same details to two lines of the same bill`.
  - `leaves lines without details when the search does not return their bill`.
  - `returns no details when the saved search is missing or fails`: `pendingSearch: ''` → `[]` sin llamar `search.load`; `search.load` que lanza → `[]` y `log.error`, sin lanzar.
  - `does not search when there are no lines` → `[]`, sin `search.load`.
  - En el Suitelet: `pending` responde `{ ok: true, userName, groups, detailColumns }` (interno y externo); `authorized` también.
- [ ] **Step 2:** `npx jest __tests__/lib __tests__/scripts` → FAIL.
- [ ] **Step 3: Implement** `attachDetails` siguiendo el patrón de `saveCsv` en `gpv_proposal_service_lib.js` (mismo reemplazo de filtros). En el Suitelet, después de obtener los grupos: `const detailColumns = pendingLines.attachDetails(groups)`.
- [ ] **Step 4:** checks completos → verde.
- [ ] **Step 5: Commit**: `Show the saved search columns as bill details in the Approval Center`.

### Task 3: Página — subsidiaria, vista compacta, detalle y vista completa

**Files:**
- Modify: `src/FileCabinet/SuiteScripts/gpv_payment_authorization/ui/gpv_approval_center.html`

**Interfaces:**
- Consumes: `data.detailColumns: string[]`; por línea `subsidiary`, `billDate`, `memo`, `vendorDescription`, `details?` (Tasks 1-2). Las líneas ya llegan ordenadas por subsidiaria → prioridad → moneda → monto.

- [ ] **Step 1: Subsidiaria.** En `renderGroup`, separar las líneas por `subsidiary` (en el orden en que llegan) y, dentro de cada una, por moneda como hoy. Encabezado de subsidiaria con su nombre ("Sin subsidiaria" si está vacía), número de facturas y subtotal por moneda. La casilla "todas" sigue por tabla de moneda; "Seleccionar todas" del celular sigue por grupo. Si un grupo tiene una sola subsidiaria, igual se muestra su encabezado.
- [ ] **Step 2: Vista compacta.** Columnas: [casilla] · Proveedor (nombre + etiqueta de prioridad; debajo, más tenue, `vendorDescription` si hay) · Factura (folio; enlace solo sin token) · Fecha · Vence · Nota (`memo`, recortada con `text-overflow: ellipsis` y `title` con el texto completo) · Monto. En ≤ 640 px cada fila se ve como tarjeta (ampliar el estilo móvil existente): proveedor y prioridad con el monto a la derecha; debajo la descripción; luego "Folio · Fecha · Vence" y la nota en su línea.
- [ ] **Step 3: Ver detalle.** Si `detailColumns.length` y la línea tiene `details`, botón "Ver detalle" (`aria-expanded`) en la fila o tarjeta; al abrirlo agrega debajo una fila (`<tr>` con `colspan` completo) con una lista `<dl>` de etiqueta: valor. El clic en el botón no marca la casilla de la fila (extender el `closest('a, input')` a `button`).
- [ ] **Step 4: Vista completa.** Solo si hay `detailColumns`: interruptor "Vista completa" en la barra superior, visible solo a ≥ 1024 px (`@media`). Activado, cada tabla de moneda muestra [casilla] · columnas de `detailColumns` · Monto, sin el botón "Ver detalle". Estado en `localStorage` clave `gpv-full-view`, leído y escrito con try/catch; por debajo de 1024 px se ignora.
- [ ] **Step 5: Verify.** `npm run format:check`. Revisión manual: abrir el HTML con datos de ejemplo (un archivo temporal en el scratchpad que asigne `fetch` simulado, sin tocar el repo) a 375 px y a 1280 px: sin scroll horizontal en 375 px; detalle abre y cierra; vista completa aparece solo en escritorio; seleccionar y aprobar no cambia.
- [ ] **Step 6: Commit**: `Group the Approval Center by subsidiary and add bill details and full view`.

### Task 4: Documentación

**Files:**
- Modify: `docs/documentacion-tecnica.md` (4.5 Centro, objetos/campos, 5.5 Búsqueda de pendientes: compartir con los roles del Centro y regla "nada sensible", 5.7 proveedores: la descripción)
- Modify: `docs/manual-usuario.md` (sección 5: cómo leer el Centro, orden por subsidiaria, "Ver detalle", "Vista completa"; sección 8: llenar la descripción del proveedor, qué columnas poner en la búsqueda y la regla "nada sensible porque lo ven los CEOs por enlace"; marcadores "📷 Captura"; sin IDs ni código)
- Modify: `CLAUDE.md` (una línea de estado, 25 nov)

- [ ] **Step 1:** Técnica. **Step 2:** Manual. **Step 3:** `CLAUDE.md`.
- [ ] **Step 4: Prueba en el sandbox** (la hace el usuario), documentada en 5.8:
  1. Desplegar.
  2. Capturar la descripción en dos proveedores.
  3. Compartir la búsqueda con los roles del Centro.
  4. Abrir el Centro en el celular y en escritorio: orden por subsidiaria, datos nuevos, "Ver detalle" y "Vista completa".
  5. Abrir un enlace externo y confirmar lo mismo, sin enlace a la factura.
- [ ] **Step 5: Commit**: `Document bill details and subsidiary order in the Approval Center`.
