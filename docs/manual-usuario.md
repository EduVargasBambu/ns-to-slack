# Autorización de Pagos desde Slack — Manual de usuario

> Borrador vivo. Donde dice **📷 Captura** va una imagen de pantalla por agregar.

## 1. ¿Qué es?

Una forma de autorizar el pago de facturas de proveedor sin WhatsApp ni correos. **Slack avisa** a cada persona lo que le toca y la lleva al **Centro de Autorización en NetSuite**, donde se aprueba o se descarta. Cada acción queda registrada: quién, cuándo, desde dónde y, al descartar, por qué.

## 2. ¿Quién participa?

| Rol | Qué hace |
|---|---|
| **CXP** | Revisa que las facturas estén listas para pago. Recibe el resumen del concentrado de la semana y los avisos de facturas descartadas. |
| **Director** | Primer nivel de aprobación. Puede aprobar antes de la junta. Su aprobación se conserva siempre. |
| **CFO** | Segundo nivel. |
| **CO-CEO 1 y CO-CEO 2** | Tercer y cuarto nivel. En la factura sus casillas se llaman **CO - CEO - BB** y **CO - CEO - ECOVALLAS**. Pueden aprobar **sin usuario de NetSuite**, con un enlace que reciben en Slack (ver sección 5). |
| **Tesorería** | Recibe el aviso cuando hay facturas autorizadas y consulta la lista de autorizadas por pagar. |
| **Administrador de NetSuite** | Mantiene aprobadores, canales y la programación semanal (ver sección 8). |

## 3. La semana, paso a paso

1. **Lunes:** se genera el **concentrado**, la lista de facturas pendientes de autorizar. Llega el resumen al canal de CXP y un mensaje a cada aprobador que tenga facturas pendientes.
2. **Durante la semana:** cada aprobador abre el Centro de Autorización desde su mensaje de Slack y aprueba o descarta sus facturas. Una factura pasa al siguiente nivel solo cuando el anterior la aprobó.
3. **Cuando el último nivel aprueba:** la factura queda **Autorizada** y Tesorería recibe el aviso.
4. **Sábado:** las facturas que nadie terminó de aprobar quedan **Vencidas** y regresan a pendientes para la siguiente semana. La aprobación del Director se conserva.

## 4. Estados de una factura

| Estado | Significa |
|---|---|
| *(vacío)* | Nunca ha entrado a un concentrado |
| **Pendiente** | Está en un concentrado esperando aprobación |
| **Autorizada** | Ya la aprobaron todos los niveles; Tesorería puede pagarla |
| **Descartada** | Algún aprobador la sacó; vuelve a pendientes |
| **Vencida** | Terminó la semana sin autorización completa; vuelve a pendientes |

Se ve en la factura, en el campo **Estado de autorización de pago**. Cuando Tesorería paga la factura, el estado se queda en **Autorizada**; lo que cambia es que la factura deja de aparecer en la lista de autorizadas por pagar.

> 📷 **Captura:** una factura de proveedor con el campo "Estado de autorización de pago" y las 4 casillas de aprobación visibles.

## 5. Para los aprobadores

### El aviso en Slack

Cuando tienes facturas esperando tu aprobación, te llega un mensaje directo de la app en Slack: cuántas son, de qué concentrado y por cuánto. El botón **Ver en NetSuite** abre el Centro de Autorización. Te llega el lunes (con todo lo que tengas pendiente, también de concentrados anteriores) y cada vez que el nivel anterior te pasa facturas nuevas.

Para recibirlo, tu usuario de Slack debe estar capturado en tu registro de empleado en NetSuite (lo hace el administrador).

> 📷 **Captura:** el mensaje directo "Tienes N facturas por autorizar" en Slack, con el botón "Ver en NetSuite".

### Aprobar o descartar en el Centro de Autorización

1. Abre el **Centro de Autorización** desde el botón "Ver en NetSuite" del mensaje de Slack (o desde el acceso directo en NetSuite, si el administrador lo configuró). Funciona en el celular.
2. Verás solo las facturas que esperan **tu** aprobación, agrupadas por concentrado. El número de factura abre la factura con sus adjuntos.
   - **Por moneda:** cada concentrado muestra primero la tabla de **Dólares (USD)** y luego la de **Pesos (MXN)**, cada una con su número de facturas y su total.
   - **Orden dentro de cada tabla:** primero los proveedores con prioridad **Alto**, luego **Medio**, **Bajo** y al final los que no tienen prioridad; dentro de cada prioridad, de la factura más grande a la más chica. La prioridad aparece como etiqueta junto al nombre del proveedor.
   - La casilla del encabezado de cada tabla selecciona todas las de esa moneda. En el celular, "Seleccionar todas" marca las del concentrado completo.

   > 📷 **Captura:** el Centro de Autorización con un concentrado, la tabla de USD y la de MXN, y las etiquetas de prioridad.

3. Marca las facturas. Abajo verás cuántas seleccionaste y por cuánto.
4. **Aprobar:** confirma el total. Cada factura pasa al siguiente nivel; en el último queda Autorizada. Te llega un mensaje en Slack confirmando cuántas aprobaste, por cuánto y a quién pasaron.

   > 📷 **Captura:** la barra de abajo con facturas seleccionadas y el botón "Aprobar".
   >
   > 📷 **Captura:** el mensaje de Slack "✅ Aprobaste N facturas".

5. **Descartar…:** escribe el motivo. La factura regresa a pendientes y, si vuelve en otro concentrado, empieza otra vez: desde el CFO si el Director ya la había aprobado, o desde el Director si no.

   > 📷 **Captura:** la ventana "Descartar facturas" con el campo de motivo.

6. Si seleccionas muchas facturas, puede que se procesen por partes: el mensaje te dirá cuántas faltan para que des clic otra vez.

### Aprobar con enlace (sin usuario de NetSuite)

Si tu nivel aprueba por enlace (normalmente los CO-CEO), no necesitas usuario de NetSuite:

1. Te llega un mensaje directo en Slack con el botón **Revisar y autorizar**. Llega el lunes y cada vez que el nivel anterior te pasa facturas.
2. El botón abre el Centro de Autorización en tu navegador, sin pedir usuario ni contraseña. Funciona en el celular.
3. Se aprueba y se descarta igual que en la sección anterior. En esta vista el número de factura es solo texto (no abre la factura) y no está la lista de autorizadas de Tesorería.
4. El enlace **sirve 7 días** desde que llega el mensaje. Cada lunes (y con cada aviso nuevo) llega uno nuevo. Si abres uno vencido verás "Este enlace ya caducó o no es válido. El lunes recibirás uno nuevo en Slack."
5. El enlace es personal: **no lo reenvíes**. Quien lo tenga puede aprobar en tu nombre mientras sea válido.

> 📷 **Captura:** el mensaje directo con el botón "Revisar y autorizar".
>
> 📷 **Captura:** el Centro de Autorización abierto por enlace, sin sesión de NetSuite.

### Aprobar antes de la junta (Director)

En la factura, marca la casilla **Aprobación Director TI**. Cuando entre al concentrado, pasará directo al CFO. Esa aprobación se conserva aunque después la factura se descarte o venza.

## 6. Para CXP

- **Cada lunes** llega al canal de CXP en Slack el resumen del concentrado: cuántas facturas tiene, los totales en MXN y USD, y cuántas esperan a cada nivel.

  > 📷 **Captura:** el resumen "Concentrado de la junta del …" en el canal de CXP.

- **El archivo del concentrado** (CSV, se abre en Excel) queda adjunto al registro del concentrado en NetSuite, con las mismas columnas de la búsqueda de pendientes. Es una foto del lunes: el avance de las aprobaciones se consulta en NetSuite.
- **Facturas descartadas:** cuando un directivo descarta facturas, llega un aviso al canal de CXP con quién las descartó, el motivo y la lista de facturas (proveedor, folio y monto). Esas facturas regresan a pendientes y pueden entrar a un concentrado futuro. Si el Director ya las había aprobado, empiezan desde el CFO.

  > 📷 **Captura:** el aviso "🚫 N facturas descartadas por …" en el canal de CXP.

- **Prioridad de Proveedor:** en el registro del proveedor, el campo **Prioridad de Proveedor** (Alto, Medio o Bajo) define en qué orden salen sus facturas en el Centro de Autorización. Es opcional: los proveedores sin prioridad salen al final. Si cambias la prioridad, el orden se ajusta solo, incluso en concentrados que ya se generaron.

  > 📷 **Captura:** el registro de un proveedor con el campo "Prioridad de Proveedor".

## 7. Para Tesorería

Cuando una factura recibe la última aprobación, llega un aviso al canal de Tesorería en Slack con cuántas facturas se autorizaron y el total por moneda. Ese aviso sustituye al correo y al "paguen" informal.

> 📷 **Captura:** el aviso "N facturas autorizadas para pago" con el botón "Ver autorizadas".

El botón **Ver autorizadas** abre en NetSuite la lista de todas las facturas autorizadas que aún no se pagan, agrupadas por concentrado, con enlace a cada factura. Es solo de consulta. Cuando una factura se paga completa, desaparece de la lista; si tiene un pago parcial, sigue apareciendo.

> 📷 **Captura:** la pantalla "Facturas autorizadas por pagar".

Para entrar necesitas usuario de NetSuite.

## 8. Para el administrador de NetSuite

Tareas del día a día. La instalación inicial está en la documentación técnica (sección 5, "Puesta en marcha").

Los registros de la app están en **Personalización > Listas, registros y campos > Tipos de registro**, y sus nombres empiezan con **GPV**. Los scripts están en **Personalización > Creación de scripts > Implementaciones de scripts**. Los nombres del menú pueden variar un poco según el idioma de la cuenta.

### Cambiar un aprobador o su suplente

1. Abre **GPV - Nivel de aprobación** y edita el nivel (Director, CFO, CO-CEO 1 o CO-CEO 2).
2. Cambia **Aprobador** o **Suplente** y guarda.
3. El cambio aplica de inmediato, también para las facturas que ya están esperando en ese nivel: las ve y las aprueba la persona nueva, no la anterior. Le llega el mensaje en Slack en el siguiente aviso (el lunes, o cuando el nivel anterior le pase facturas).
4. El suplente puede aprobar en lugar del aprobador, pero por ahora no recibe mensajes en Slack.

> 📷 **Captura:** un registro de "GPV - Nivel de aprobación" con los campos Orden, Aprobador, Suplente y Campo de aprobación.

### Dar de alta a alguien en Slack

Para que una persona reciba mensajes, su registro de **empleado** en NetSuite debe tener el campo **Usuario de Slack**:

1. En Slack, abre el perfil de la persona → **⋮** → **Copiar ID de miembro** (empieza con U).
2. En NetSuite, edita su registro de empleado y pega el ID en **Usuario de Slack**.

> 📷 **Captura:** el menú de perfil de Slack con "Copiar ID de miembro".
>
> 📷 **Captura:** el registro de empleado con el campo "Usuario de Slack".

### Cambiar canales o el motivo obligatorio

En **GPV - Configuración de autorización** (hay un solo registro) se cambian:

- **Canal de Slack de Tesorería** y **Canal de Slack de CXP** (el ID del canal, que aparece en Slack al final de "Acerca de" del canal). Al cambiar de canal, hay que invitar a la app al canal nuevo.
- **Motivo obligatorio al descartar.**
- **Búsqueda de pendientes:** qué búsqueda guardada define las facturas que entran al concentrado.

> 📷 **Captura:** el registro "GPV - Configuración de autorización".

### Generar el concentrado a mano o cambiar el día de la junta

- **A mano:** abre la implementación **GPV - Concentrado semanal** y usa **Guardar y ejecutar**. Si ya existe el concentrado de ese día, no se crea otro: se completa el mismo y se vuelven a mandar los avisos.
- **Día y hora:** en la misma implementación, pestaña de programación. El vencimiento se programa igual en **GPV - Vencimiento semanal** (sábado).

> 📷 **Captura:** la implementación "GPV - Concentrado semanal" con su programación.

### "No me llegó el aviso"

Revisa en este orden:

1. Que la persona tenga capturado su **Usuario de Slack** en el empleado.
2. Que la app esté invitada al canal (Tesorería o CXP): en el canal, escribe `/invite` y el nombre de la app.
3. Que la persona tenga algo pendiente: si no tiene facturas esperando, no se manda mensaje.
4. El **registro de ejecución** del script: en la implementación (**GPV - Concentrado semanal** o **GPV - Centro de Autorización**), pestaña de registro de ejecución. Ahí aparecen los avisos que no se pudieron mandar y el motivo. Un aviso que falla nunca deshace una aprobación.

> 📷 **Captura:** el registro de ejecución con la línea "DMs a aprobadores: N".

### Consultar quién aprobó o descartó

En **GPV - Bitácora de autorización** queda cada acción: concentrado, línea, nivel, acción (Aprobar, Descartar, Vencimiento semanal, etc.), empleado, desde dónde y motivo. Se puede filtrar o crear una búsqueda guardada para contraloría.

> 📷 **Captura:** la lista de "GPV - Bitácora de autorización".

### Aprobadores por enlace (CEOs)

- **Activar:** en **GPV - Nivel de aprobación**, marca **Aprueba por enlace externo** en los niveles de CO-CEO 1 y CO-CEO 2. Ese nivel (aprobador y suplente) recibirá el enlace por Slack.
- **Alta de la persona:** registro de empleado activo, sin acceso a NetSuite, con su **Usuario de Slack** capturado.
- **Cortar el acceso a una persona:** desactiva su empleado o cámbialo en el nivel; el enlace deja de funcionar al instante.
- **Cortar todos los enlaces de un nivel:** desmarca la casilla del nivel. Surte efecto de inmediato, también en enlaces ya mandados.
- **Cortar todos los enlaces de la app:** pide a TI cambiar la clave de enlaces (ver documentación técnica, 5.4). Todos los enlaces mandados dejan de servir y el siguiente aviso trae uno nuevo.
- Las aprobaciones por enlace quedan en la bitácora con canal **Enlace externo**.

> 📷 **Captura:** el nivel de aprobación con la casilla "Aprueba por enlace externo".

### Accesos

- Los aprobadores (salvo los que aprueban por enlace) y Tesorería necesitan **usuario de NetSuite**: el Centro de Autorización se abre con su sesión.
- Su rol debe poder ver y editar las facturas de proveedor y los registros GPV. El detalle de permisos está en la documentación técnica (sección 5.7).
- Opcional: agrega el Centro de Autorización como acceso directo para quien quiera entrar sin el mensaje de Slack (la URL está en la implementación **GPV - Centro de Autorización**).

## 9. Preguntas frecuentes

**¿Puedo aprobar desde Slack, sin abrir NetSuite?**
Por ahora no. Slack te avisa y te lleva al Centro de Autorización; ahí apruebas. Aprobar con botones dentro de Slack está planeado para una siguiente etapa.

**Me llegó un enlace y ya caducó, ¿qué hago?**
Espera el mensaje del siguiente lunes: trae un enlace nuevo. Si es urgente, pide al administrador que genere el concentrado a mano para que se manden los avisos otra vez.

**¿Puedo aprobar una factura que todavía no le toca a mi nivel?**
No. La app solo te muestra las facturas que esperan tu aprobación.

**Descarté una factura por error, ¿qué pasa?**
Regresa a pendientes y entra en un concentrado futuro. Si el Director ya la había aprobado, su aprobación se conserva y empieza desde el CFO; las aprobaciones de CFO, CO-CEO 1 y CO-CEO 2 se tienen que volver a dar.

**¿Qué pasa si no apruebo a tiempo?**
El sábado la factura queda Vencida y regresa a pendientes para la semana siguiente. La aprobación del Director se conserva; las de CFO, CO-CEO 1 y CO-CEO 2 se tienen que volver a dar.
