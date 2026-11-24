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

### El aviso en Slack

Cuando tienes facturas esperando tu aprobación, te llega un mensaje directo de la app en Slack: cuántas son, de qué concentrado y por cuánto. El botón **Ver en NetSuite** abre el Centro de Autorización. Te llega el lunes con el concentrado (con todo lo que tengas pendiente, también de concentrados anteriores) y cada vez que el nivel anterior te pasa facturas nuevas.

Para recibirlo, tu usuario de Slack debe estar capturado en tu registro de empleado en NetSuite (lo hace el administrador).

### Aprobar con botones dentro de Slack **(pendiente)**

### Aprobar o descartar desde NetSuite (Centro de Autorización)

1. Abre el **Centro de Autorización** (desde el botón "Ver en NetSuite" del mensaje de Slack, o desde NetSuite). Funciona en el celular.
2. Verás solo las facturas que esperan **tu** aprobación, agrupadas por concentrado, con totales en MXN y USD. El número de factura abre la factura con sus adjuntos.
   - **Por moneda:** cada concentrado muestra primero la tabla de **Dólares (USD)** y luego la de **Pesos (MXN)**, cada una con su número de facturas y su total.
   - **Orden dentro de cada tabla:** primero los proveedores con prioridad **Alto**, luego **Medio**, **Bajo** y al final los que no tienen prioridad; dentro de cada prioridad, de la factura más grande a la más chica. La prioridad aparece como etiqueta junto al nombre del proveedor.
   - La casilla del encabezado de cada tabla selecciona todas las de esa moneda. En el celular, "Seleccionar todas" marca las del concentrado completo.
3. Marca las facturas (o "seleccionar todas" del grupo). Abajo verás cuántas y por cuánto.
4. **Aprobar:** confirma el total. Cada factura pasa al siguiente nivel; en el último queda Autorizada. Te llega un mensaje en Slack confirmando cuántas aprobaste, por cuánto y a quién pasaron.
5. **Descartar…:** escribe el motivo. La factura regresa a pendientes y, si vuelve en otro concentrado, empieza otra vez desde el Director.
6. Si seleccionas muchas facturas, puede que se procesen por partes: el mensaje te dirá cuántas faltan para que des clic otra vez.

### Aprobar antes de la junta (Director)

En la factura, marca la casilla **Aprobación Director TI**. Cuando entre al concentrado, pasará directo al CFO.

## 6. Para CXP

**Facturas descartadas:** cuando un directivo descarta facturas, llega un aviso al canal de CXP en Slack con quién las descartó, el motivo y la lista de facturas (proveedor, folio y monto). Esas facturas regresan a pendientes y pueden entrar a un concentrado futuro, empezando otra vez desde el Director.

**Prioridad de Proveedor:** en el registro del proveedor, el campo **Prioridad de Proveedor** (Alto, Medio o Bajo) define en qué orden salen sus facturas en el Centro de Autorización. Es opcional: los proveedores sin prioridad salen al final. Si cambias la prioridad, el orden se ajusta solo, incluso en concentrados que ya se generaron.

- **Cada lunes** llega al canal de CXP en Slack el resumen del concentrado: cuántas facturas, los totales en MXN y USD, y cuántas esperan a cada nivel.
- **El archivo del concentrado** (CSV, se abre en Excel) queda adjunto al registro del concentrado en NetSuite, con las mismas columnas de la búsqueda de pendientes.
- **Si hace falta generarlo a mano**, se puede ejecutar el script desde NetSuite. Si ya existe el concentrado de ese día, no se crea otro: se completa el mismo.

## 7. Para Tesorería

Cuando una factura recibe la última aprobación, llega un aviso al canal de Tesorería en Slack con cuántas facturas se autorizaron y el total por moneda. Ese aviso sustituye al correo y al "paguen" informal.

El botón **Ver autorizadas** abre en NetSuite la lista de todas las facturas autorizadas que aún no se pagan, agrupadas por concentrado, con enlace a cada factura. Es solo de consulta. Cuando una factura se paga completa, desaparece de la lista; si tiene un pago parcial, sigue apareciendo.

## 8. Preguntas frecuentes

**¿Puedo aprobar una factura que todavía no le toca a mi nivel?**
No. La app solo te muestra las facturas que esperan tu aprobación.

**Descarté una factura por error, ¿qué pasa?**
Regresa a pendientes y entra en un concentrado futuro, empezando otra vez desde el Director.

**¿Qué pasa si no apruebo a tiempo?**
El sábado la factura queda Vencida y regresa a pendientes para la semana siguiente.
