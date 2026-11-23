# Autorización de Pagos desde Slack — Manual de usuario

> Borrador vivo. Las secciones marcadas **(pendiente)** se completan cuando la función esté lista, con capturas de pantalla.

## 1. ¿Qué es?

Una forma de autorizar el pago de facturas de proveedor desde Slack o desde NetSuite, sin WhatsApp ni correos. Cada autorización queda registrada: quién, cuándo y desde dónde.

## 2. ¿Quién participa?

| Rol | Qué hace |
|---|---|
| **CXP** | Revisa que las facturas estén listas para pago. Recibe el concentrado de la semana. |
| **Director** | Primer nivel de aprobación. Puede aprobar antes de la junta. |
| **CFO** | Segundo nivel. |
| **CEO 1 y CEO 2** | Tercer y cuarto nivel. |
| **Tesorería** | Recibe el aviso cuando una factura queda autorizada y programa el pago. |

## 3. La semana, paso a paso

1. **Lunes:** se genera el **concentrado**, la lista de facturas pendientes de autorizar, y se publica en Slack.
2. **Durante la semana:** cada aprobador recibe en Slack las facturas que le tocan. Las aprueba o las descarta. Una factura pasa al siguiente nivel solo cuando el anterior la aprobó.
3. **Cuando el último nivel aprueba:** la factura queda **Autorizada** y Tesorería recibe el aviso.
4. **Sábado:** las facturas que nadie terminó de aprobar quedan **Vencidas** y regresan a pendientes para la siguiente semana.

## 4. Estados de una factura

| Estado | Significa |
|---|---|
| *(vacío)* | Nunca ha entrado a un concentrado |
| **Pendiente** | Está en el concentrado de esta semana esperando aprobación |
| **Autorizada** | Ya la aprobaron todos los niveles; Tesorería puede pagarla |
| **Descartada** | Algún aprobador la sacó; vuelve a pendientes |
| **Vencida** | Terminó la semana sin autorización completa; vuelve a pendientes |
| **Pagada** | Tesorería ya aplicó el pago |

Se ve en la factura, en el campo **Estado de autorización de pago**.

## 5. Para los aprobadores

### Aprobar desde Slack **(pendiente)**

### Aprobar o descartar desde NetSuite (Centro de Autorización)

1. Abre el **Centro de Autorización** (desde el botón "Ver en NetSuite" del mensaje de Slack, o desde NetSuite). Funciona en el celular.
2. Verás solo las facturas que esperan **tu** aprobación, agrupadas por concentrado, con totales en MXN y USD. El número de factura abre la factura con sus adjuntos.
3. Marca las facturas (o "seleccionar todas" del grupo). Abajo verás cuántas y por cuánto.
4. **Aprobar:** confirma el total. Cada factura pasa al siguiente nivel; en el último queda Autorizada.
5. **Descartar…:** escribe el motivo. La factura regresa a pendientes y, si vuelve en otro concentrado, empieza otra vez desde el Director.
6. Si seleccionas muchas facturas, puede que se procesen por partes: el mensaje te dirá cuántas faltan para que des clic otra vez.

### Aprobar antes de la junta (Director)

En la factura, marca la casilla **Aprobación Director TI**. Cuando entre al concentrado, pasará directo al CFO.

## 6. Para CXP

- **Cada lunes** llega al canal de CXP en Slack el resumen del concentrado: cuántas facturas, los totales en MXN y USD, y cuántas esperan a cada nivel.
- **El archivo del concentrado** (CSV, se abre en Excel) queda adjunto al registro del concentrado en NetSuite, con las mismas columnas de la búsqueda de pendientes.
- **Si hace falta generarlo a mano**, se puede ejecutar el script desde NetSuite. Si ya existe el concentrado de ese día, no se crea otro: se completa el mismo.

## 7. Para Tesorería **(pendiente)**

## 8. Preguntas frecuentes

**¿Puedo aprobar una factura que todavía no le toca a mi nivel?**
No. La app solo te muestra las facturas que esperan tu aprobación.

**Descarté una factura por error, ¿qué pasa?**
Regresa a pendientes y entra en un concentrado futuro, empezando otra vez desde el Director.

**¿Qué pasa si no apruebo a tiempo?**
El sábado la factura queda Vencida y regresa a pendientes para la semana siguiente.
