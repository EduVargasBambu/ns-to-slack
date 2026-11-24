# GPV · Autorización de Pagos (NetSuite ↔ Slack)

Los directivos de Grupo Vallas autorizan el pago de facturas de proveedor en orden (Director → CFO → CO-CEO 1 → CO-CEO 2), con avisos en Slack y una bitácora de cada acción. Sustituye la autorización por WhatsApp y correo.

Proyecto **SDF Account Customization** (un solo cliente), SuiteScript 2.1 con JSDoc.

## Cómo funciona

```
Lunes (script programado)
  Búsqueda de pendientes ─► Concentrado + CSV ─► Resumen al canal de CXP
                                              └► DM a cada aprobador con lo que tiene pendiente

Durante la semana
  DM ─► "Ver en NetSuite" ─► Centro de Autorización (sesión de NS)
          ├─ Aprobar  ─► confirmación al aprobador · DM al siguiente nivel
          │               └─ último nivel: Autorizada ─► aviso a Tesorería ─► vista "Autorizadas por pagar"
          └─ Descartar ─► aviso al canal de CXP · la factura regresa a pendientes

Sábado (script programado)
  Lo que siga Pendiente pasa a Vencida y regresa a pendientes; el concentrado se cierra.
```

Reglas principales:

- Una factura avanza de nivel solo cuando el anterior la aprobó. Las casillas de aprobación que ya traiga la factura cuentan si están en orden.
- La aprobación del **Director es permanente**: si la factura se descarta o vence, vuelve directo al CFO.
- En el Centro, las facturas se ordenan por **Prioridad de Proveedor** (Alto → Medio → Bajo → sin prioridad), luego USD antes que MXN y luego monto de mayor a menor, en una tabla por moneda.
- Un aviso de Slack que falla se registra en el log y nunca bloquea la aprobación.

## Estructura

```
src/
  Objects/                       XML de SDF
    Lists/                       listas (estado de línea, acción, prioridad…)
    Records/                     registros personalizados (config, niveles, concentrado, línea, bitácora)
    Fields/Body/, Fields/Entity/ campos de la factura, del proveedor y del empleado
    Scripts/SL/, Scripts/SS/     Suitelets y Scheduled Scripts con sus deployments
  FileCabinet/SuiteScripts/gpv_payment_authorization/
    lib/        lógica de negocio (sin dependencia de Slack)
    slack/      cliente de Slack, mensajes y avisos
    scripts/    puntos de entrada (Suitelets y Scheduled Scripts)
    ui/         página del Centro de Autorización (HTML + JS)
__tests__/      pruebas con Jest
docs/           documentación técnica y manual de usuario
types/          tipos compartidos de JSDoc
```

## Desarrollo

Requisitos: Node 22 y la extensión SuiteCloud de VS Code.

```bash
npm install
npm test               # pruebas (Jest)
npm run lint           # ESLint
npm run typecheck      # TypeScript sobre el JSDoc de src/
npm run format:check   # Prettier
```

Validación y despliegue con la extensión SuiteCloud de VS Code (**Validate Project** y **Deploy Project**). No se usa la CLI global.

Antes de escribir código, leer [`CONVENTIONS.md`](CONVENTIONS.md): idioma (código en inglés, documentación en español), nomenclatura de archivos e IDs y glosario.

## Documentación

- [Documentación técnica](docs/documentacion-tecnica.md): arquitectura, objetos, scripts, decisiones y la **guía de puesta en marcha** (sección 5).
- [Manual de usuario](docs/manual-usuario.md): para aprobadores, CXP y Tesorería.

## Pendientes

- Probar los permisos con roles distintos de Administrador y definir el rol mínimo del gateway antes de PROD.
- Vista de seguimiento para CXP, buscador en el Centro y avisos al suplente.
- Botones nativos en Slack mediante un Cloudflare Worker (requiere cuenta de Cloudflare de Grupo Vallas).
