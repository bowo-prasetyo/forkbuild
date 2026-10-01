<!-- translation-of: docs/user/08-ChatAndConversations.md source-hash: 406b0d8076916c27 -->
# 08 — Chat y conversaciones

<!-- languages -->
[English](../08-ChatAndConversations.md) · [Deutsch](../de/08-ChatAndConversations.md) · **Español** · [Bahasa Indonesia](../id/08-ChatAndConversations.md) · [日本語](../ja/08-ChatAndConversations.md)
<!-- /languages -->

Los mensajes directos en ForkBuild van de par a par y son **solo entre
amigos**: consulte
[Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md) para
saber cómo hacerse amigo de alguien primero.

## Iniciar una conversación

Al chat se llega desde el botón **Chat** de un amigo en la página
**Pares**, o desde la página **Conversaciones** de la barra superior: no
hay acceso al chat desde la Vista del mundo ni desde un avatar. Abrir el
chat con alguien que en ese momento no es amigo suyo (o que está
bloqueado) muestra una explicación en lugar de un cuadro de redacción: lo
que habilita el chat es la amistad, no estar en línea.

## La página Conversaciones

Muestra a todas las personas que vale la pena mostrar (cualquiera con quien
tenga una relación recordada, una amistad, incluida una solicitud
pendiente, o un historial de mensajes), ordenadas por la actividad más
reciente. Cada fila muestra:

- Su nombre visible y una insignia **En línea / Desconectado**
- Su relación: Amigo, Solicitud de amistad pendiente, Par conocido o Sin
  conexiones anteriores
- La cantidad de mensajes sin leer, y “N mensajes esperando para enviarse”
  si hay alguno en cola
- La hora de la última actividad

Solo los amigos actuales que no bloqueó tienen un botón **Abrir chat**; la
fila de todos los demás lo remite en cambio a Pares. Un amigo al que
bloqueó muestra “⛔ Bloqueado: desbloquéelo desde Pares para volver a
chatear.” en lugar del botón, y la fila se actualiza en cuanto lo bloquea o
lo desbloquea.

## La vista del chat

Una sola transcripción desplazable entre usted y un amigo: globos de
mensajes con la etiqueta “Usted” o su nombre, cada uno con su hora, y un
cuadro de redacción debajo (hasta 4.000 caracteres). Haga clic en
**Mostrar detalles** para ver un pequeño panel con su identidad, su
relación, la amistad, el estado de la conexión en vivo y la cantidad de
mensajes y de pendientes. No hay indicador de que está escribiendo, ni
edición, eliminación, reacciones, adjuntos ni chat grupal: a propósito, son
solo mensajes.

## Llamadas de voz

Un botón **📞 Llamar** aparece junto al cuadro de redacción siempre que al
menos uno de los dispositivos de ese amigo que se pueden alcanzar en ese
momento admita voz: no necesita saber cuál de sus dispositivos contestará
realmente; la llamada llega a su identidad, no a una conexión concreta.

- Haga clic en **Llamar** para hacer una llamada: verá **Llamando…** hasta
  que contesten.
- Del lado que recibe, una llamada entrante muestra **Aceptar** /
  **Rechazar**.
- Una vez conectada, la barra muestra **En llamada** más **Silenciar** /
  **Activar sonido** y, cuando su micrófono está realmente conectado,
  selectores para elegir qué **Micrófono** y (si su navegador lo permite)
  qué **Altavoz** usar.
- El botón para terminar dice **Cancelar** mientras todavía espera que
  contesten, y **Colgar** cuando ya están hablando.

Solo puede tener una llamada a la vez en todo este dispositivo: el botón
Llamar está deshabilitado para cualquier otra persona mientras está en una
llamada. Si su micrófono desaparece en medio de la llamada (se desconecta,
o se revoca el permiso), un pequeño aviso lo indica; la llamada en sí sigue
en curso, por si se vuelve a conectar.

Una llamada que termina antes de conectarse explica brevemente por qué:

| Mensaje | Significado |
|---|---|
| **Llamada rechazada.** | Hicieron clic en Rechazar. |
| **Esa persona ya está en otra llamada.** | Está ocupada en otra parte. |
| **No hubo respuesta.** | Nadie contestó a tiempo. |
| **No se pudo acceder a su micrófono.** | Su navegador denegó el acceso al micrófono, o no lo tiene. |
| **No se pudo conectar la llamada.** | Un fallo a nivel de la conexión: vale la pena volver a intentarlo. |

Un corte normal (suyo o de la otra persona) no muestra ningún mensaje: que
la barra de la llamada desaparezca lo dice todo.

## Enviar mientras alguien está desconectado

Puede enviarle un mensaje a un amigo desconectado: no requiere que esté
conectado en ese momento. Se pone en cola localmente y se entrega
automáticamente la próxima vez que ambos estén conectados; no necesita
volver a enviarlo. No hay ningún servidor que lo guarde mientras tanto, así
que espera en *su* dispositivo: ForkBuild tiene que estar abierto en ambos
lados al mismo tiempo para que se envíe. Un mensaje que sigue sin
entregarse después de 7 días se descarta y se marca como **No entregado:
venció**. Cada mensaje saliente muestra su propio estado debajo del globo:

| Estado | Significado |
|---|---|
| **En cola: se enviará cuando esa persona se vuelva a conectar** | Esperando a que se conecte |
| **Enviado** | Entregado a la red: todavía no se confirmó que haya llegado |
| **Entregado** | Se confirmó que llegó a su dispositivo |
| **No entregado: venció** | No se entregó a tiempo y se descartó |
| **Visto** | Abrió la conversación y leyó hasta este mensaje |

**Visto** es totalmente automático: no hay un botón “marcar como leído”.
Simplemente abrir o actualizar una conversación es lo que le indica a quien
envió que usted la leyó.

## Su historial

Las conversaciones se guardan localmente en este dispositivo y continúan
justo donde las dejó después de recargar: mensajes, estado de entrega y
todo lo demás. Este historial es **local, solo de este dispositivo**: no lo
acompaña a otro navegador ni a otra computadora, y no hay ninguna copia en
un servidor. Cada conversación conserva sus 500 mensajes más recientes; los
más antiguos se descartan en silencio para no llenar el almacenamiento.

Quitar a alguien de sus amigos o bloquearlo detiene el chat de inmediato,
aunque técnicamente la conexión de fondo siga activa: no necesita un paso
aparte de “desconectar”.

## ¿Y ahora qué?

Vuelva a **[Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md)**
para encontrar más personas con las que construir y chatear, o regrese a la
**[Vista del mundo](03-WorldView.md)** para ver dónde viven las creaciones
de todos.
