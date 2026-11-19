# GPV Autorización de Pagos (NetSuite ↔ Slack)

Antes de escribir código, lee:
- `CONVENTIONS.md`: idioma, versión de JS, nomenclatura de archivos e IDs, estructura, glosario.
- `../../NS to Slack/CONTEXTO-proyecto-netsuite-slack.md`: negocio y arquitectura.
- `../../NS to Slack/PLAN-suiteapp-autorizacion-pagos.md`: plan y fases. Ojo: el plan dice SuiteApp, pero este proyecto es **Account Customization** a propósito (un solo cliente).

Responde en español. El código va en inglés.

## Estado (18 nov 2026)
- Convenciones v0.2: patrón de IDs y glosario confirmados.
- Repo: git en `main` con remoto `origin` (GitHub `EduVargasBambu/ns-to-slack`). Configs de ESLint, Prettier y `jsconfig` (checkJs) y estructura de carpetas listas.
- Tooling verificado: Node 22, `npm test` (Jest), `npm run lint` (ESLint 10), `npm run typecheck` (TypeScript 7, solo `src/`), `npm run format:check` (Prettier; los `.md` se excluyen).
- Fase 1, librerías puras listas con tests en verde: `gpv_line_state_machine_lib`, `gpv_legacy_lib`, `gpv_constants_lib`.
- Objetos SDF validados y desplegados en el sandbox (18 nov): listas en `src/Objects/Lists/`, registros en `src/Objects/Records/` (approval_level, config, payment_proposal, proposal_line, audit_log), campos nativos en `src/Objects/Fields/` (`custbody_gpv_authorization_status`, `custentity_gpv_slack_user`). La bitácora registra también intentos no autorizados y limpiezas de legado.
- Validación y deploy con la extensión SuiteCloud de VS Code (no se usa la CLI global). `~/Objects/*` de `deploy.xml` sí incluye las subcarpetas. En SDF, "texto en línea" es `displaytype` `LOCKED` (no `INLINE`).
- Reglas de legado (decididas 17 nov): aprobaciones previas fuera de orden → la línea arranca en nivel 1; las tres aprobadas → nace Autorizada. Con huecos, al generar el concentrado se **limpian** los campos legados aprobados (`getLevelsToClear`) para que la factura vuelva a pasar por cada nivel.
- Ciclo semanal (decidido 18 nov): dos Scheduled Scripts. **Lunes**: genera el concentrado y lo publica en Slack; día/hora en el deployment (no en Configuración), se puede ejecutar a mano y no duplica si ya hay concentrado con esa fecha de junta. **Sábado**: las líneas aún Pendientes pasan a **Vencida** (acción de bitácora "Vencimiento semanal"), la factura queda disponible, se limpian sus campos legados y el concentrado se cierra. Las Autorizadas no se tocan.
- Fase 2b, salida a Slack lista (19 nov): workspace de pruebas, app con bot token y Signing Secret en API Secrets, canales de Tesorería y CXP capturados en Configuración. `customscript_gpv_slack_smoke_test_ss` mandó "Hola desde NetSuite" a Tesorería. La prueba de entrada (interactividad) queda para la Fase 4.
- Búsqueda de pendientes (19 nov, por confirmar con el cliente): hoy hay 4 búsquedas en cadena (Director x Área → CFO → CEO 1 → CEO 2). Propuesta: el Director queda como filtro de entrada y la búsqueda base `customsearch_gpv_pending_bills` es la del CFO sin filtrar CFO/CEO. Falta confirmar el ID interno de "Aprobado" en la lista legada y los IDs de esos campos.
- Al **descartar** también se limpian los campos legados de la factura (decidido 18 nov). Así el legado solo cuenta la primera vez que una factura entra a un concentrado; si vuelve, arranca en nivel 1.
