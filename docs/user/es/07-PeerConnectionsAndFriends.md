<!-- translation-of: docs/user/07-PeerConnectionsAndFriends.md source-hash: 25e078a7afa72b20 -->
# 07 — Conexiones entre pares y amigos

<!-- languages -->
[English](../07-PeerConnectionsAndFriends.md) · [Deutsch](../de/07-PeerConnectionsAndFriends.md) · **Español** · [Bahasa Indonesia](../id/07-PeerConnectionsAndFriends.md) · [日本語](../ja/07-PeerConnectionsAndFriends.md)
<!-- /languages -->

ForkBuild lo conecta directamente con los navegadores de otras personas:
no hay ningún servidor central que guarde una lista de amigos. Abra
**Pares** en la barra superior para administrar con quién está conectado,
a quién conoce y quiénes son sus amigos.

## La página de un vistazo

```
Pares                                   Su ID …N6KbN  [Copiar ID completo]

Requiere su atención      conexiones que lo esperan, solicitudes de amistad
Personas  [Todos|Amigos|Siguiendo|En línea]   una fila por persona
Conectarse con alguien nuevo  [Invitar|Pegar una invitación|Buscar por ID|Sala pública]
▸ Bloqueados (N)          solo cuando bloqueó a alguien
```

- **Requiere su atención** aparece solo cuando algo está esperando: una
  conexión en curso (con su paso, por ejemplo “paso 2 de 5: Conectando
  WebRTC”), una conexión que espera que pegue la respuesta del otro lado,
  una que falló y que puede descartar, o alguien que le pide ser su amigo
  (**Aceptar** / **Rechazar**).
- **Personas** tiene una fila por persona, sin importar cuántas cosas sepa
  de ella. Las etiquetas dicen qué es para usted (**Amigo**,
  **Recordado**, **Siguiendo**, **Bloqueado**, **Solicitud enviada**,
  **Quiere ser su amigo**) y un punto verde significa que está en línea.
  Primero aparecen las personas en línea, luego los amigos y luego todos
  los demás. Cada fila tiene su acción principal (**Chat** para un amigo,
  **Volver a conectar** cuando está desconectado, **Agregar amigo** para
  alguien con quien está conectado), y el menú **⋯** tiene el resto:
  **Renombrar** (o **Nombrar y recordar**), **Recordar** / **Olvidar**,
  **Quitar de amigos**, **Seguir** / **Dejar de seguir**, **Detalles de la
  conexión**, **Desconectar** y **Bloquear** / **Desbloquear**. El filtro
  **Siguiendo** muestra a las personas de aquí que usted sigue.
- **Bloqueados** está plegado al final y solo aparece cuando bloqueó a
  alguien.

Detrás de la lista hay cinco registros independientes: las conexiones en
vivo, los Pares conocidos (personas que eligió **Recordar**, una nota
privada que nunca se comparte con ellas), los Amigos (mutuos y firmados),
Siguiendo (consulte [Seguir a personas](#seguir-a-personas)) y los
Bloqueados. Una persona puede ser Amigo sin estar Recordada, y así
sucesivamente; la fila solo muestra lo que corresponda. Alguien a quien
sigue pero con quien nunca se conectó no aparece aquí; la página
**Siguiendo** muestra a todas las personas que sigue.

## Encontrar a alguien y conectarse

No hay nombres de usuario que buscar: a cada par se lo identifica por su
identidad criptográfica, así que conectarse siempre empieza por
intercambiar información de identidad por algún canal en el que ya confíe
(chat, correo electrónico, en persona). **Conectarse con alguien nuevo**
muestra una forma a la vez:

- **Invitar**: **Crear invitación**, luego cópiela y envíesela a alguien.
  La conexión espera en **Requiere su atención**; cuando esa persona
  responda, pegue allí su respuesta y haga clic en **Terminar de
  conectar**.
- **Pegar una invitación**: el lado que recibe: pegue una invitación que
  alguien le envió, haga clic en **Conectar** y devuélvale la respuesta que
  se le da.
- **Buscar por ID**: busque por el ID de identidad completo de alguien
  entre los candidatos que usted u otras personas publicaron, y luego
  **Conectar**. Su respuesta vuelve a través del servidor de encuentro, así
  que la conexión se completa por sí sola; solo copia una respuesta a mano
  cuando eso no es posible (su identidad está bloqueada, o el candidato
  vino de una invitación guardada). **Guardar una invitación para más
  tarde**, plegado debajo, agrega una invitación a estos resultados de
  búsqueda sin conectarse.
- **Ser descubrible** (en la misma pestaña, en **Dejar que otras personas
  lo encuentren**): publica su propia identidad en una red de encuentro
  para que alguien que ya conoce su ID de identidad pueda encontrarlo y
  conectarse con usted sin una invitación directa. Una publicación
  responde a un solo intento de conexión: actívelo de nuevo para que lo
  vuelvan a encontrar. El botón dice **Dejar de ser descubrible** mientras
  su publicación sigue esperando que alguien la responda; vuelve solo a
  **Ser descubrible** cuando alguien se conecta, o cuando la oferta se
  cierra o su invitación vence. Su identidad debe estar desbloqueada para
  publicar: el servidor de encuentro solo acepta una publicación firmada
  por la identidad que nombra, así que nadie más puede publicar ni retirar
  una por usted. El servidor de encuentro predeterminado solo atiende al
  sitio alojado de ForkBuild; si ejecuta ForkBuild desde su propia
  dirección (incluido `localhost`), use invitaciones o agregue su propio
  servidor en **Servidores de encuentro**, dentro de **Configuración de
  red**. Ese estado se mantiene en toda la app, así que salir de la página
  Pares y volver no lo restablece.
- **Sala pública**: conozca a personas cuyo ID no tiene; consulte más
  abajo.

**Su ID**, arriba en la página, con **Copiar ID completo**, es lo que
alguien necesita para **Buscar por ID**. El `…últimos14caracteres`
abreviado que aparece en las filas solo sirve para distinguir a las
personas de un vistazo y nunca coincidirá con una búsqueda real.

Use el camino que use, una conexión pasa por los mismos pasos:
**Descubierto mediante encuentro → Conectando WebRTC → Par conectado →
Autenticando la identidad → Autenticado** (o **Falló**). **Detalles de la
conexión**, en el menú **⋯** de una persona conectada, muestra su
identidad, su clave pública y un recordatorio de que la *conexión* en sí
solo dura la sesión, aunque un registro de Par conocido o de Amigo
sobreviva a ella. Los contadores “en línea desde hace …” e “iniciado hace
…” cuentan desde el momento en que realmente se hizo esa conexión, así que
siguen contando bien si sale de la página y vuelve.

## La sala pública: conocer a personas que todavía no conoce

Buscar por ID necesita el ID de identidad completo de alguien. La **Sala
pública** es para conocer a personas cuyo ID no tiene. Hay una sala para
todos, en la página **Pares**, en **Conectarse con alguien nuevo → Sala
pública**, y una para cada Mundo, en **Sala** en la Vista del mundo.

- **Unirse a la sala** lo muestra allí con un nombre visible que usted
  elige, junto al final de su ID de identidad. Cualquiera puede elegir
  cualquier nombre; lo que realmente comprueba una conexión es la
  identidad. El nombre se recuerda para la próxima vez.
- Mientras está en una sala, este dispositivo sigue siendo descubrible:
  cualquiera que esté en ella puede hacer clic en **Conectar** sobre
  usted, y cuando alguien lo hace, queda listo de inmediato para la
  siguiente persona.
- **Conectar** sobre alguien de la lista se conecta con esa persona igual
  que Buscar por ID, sin nada que copiar. Su tarjeta muestra
  **Conectando…** y luego **Conectado** cuando el intercambio inicial
  demuestra quién es. Ver a alguien en la sala nunca lo conecta con esa
  persona por sí solo.
- **Bloquear** oculta a alguien de sus listas de la sala y lo bloquea como
  en el resto de esta página.
- **Salir de la sala** lo saca de inmediato. Unirse dura solo esta visita:
  cerrar la app lo saca de todas las salas (su entrada puede tardar hasta
  10 minutos en desaparecer de las listas de otras personas), y nunca se
  lo vuelve a poner en una cuando abre la app de nuevo.

**Qué obtiene alguien que se conecta con usted desde una sala.** Una
conexión de sala es un par conectado común, incluso antes de que lo
Recuerde o se hagan amigos. Esa persona conoce su dirección IP, ve su
avatar y su presencia según lo permita su configuración de visibilidad, y
sus dispositivos **intercambian anuncios de Snapshots y de nombres de
lugares y metadatos de publicaciones**, exactamente como con cualquier par
conectado (consulte [Privacidad](Privacy.md)). El chat y la voz siguen
requiriendo una amistad. Los Mundos que compartió con sus pares también se
le ofrecen, pero su dispositivo solo obtiene uno si hace clic en
**Recuperar** (consulte
[Compartir con pares conectados](04-PublishingAndForking.md#compartir-con-pares-conectados)).
Los Mundos que comparten sus Amigos y Pares conocidos se obtienen para
usted automáticamente; los de un desconocido de la sala, nunca.

**Relays solo cuando hacen falta.** Cada conexión intenta primero un camino
directo y usa el relay TURN del servidor de encuentro solo cuando ningún
camino directo funciona. Mientras espera en una sala, su dispositivo nunca
pide credenciales de relay; la persona que se conecta con usted pide una
solo si la necesita. Así se reserva la cuota mensual del relay para las
conexiones que realmente ocurren.

La sala necesita un servidor de encuentro (consulte **Servidores de
encuentro** en **Configuración de red**) y una identidad desbloqueada.

## Recordar, hacerse amigos, bloquear

- **Recuerde** a alguien (en su menú **⋯**) para guardar una nota privada
  y local sobre esa persona, sin necesidad de su consentimiento.
  **Renombrar** le da un nombre que solo usted ve; para alguien a quien no
  recordó, **Nombrar y recordar** hace ambas cosas. **Olvidar** quita la
  nota, solo localmente.
- **Agregar amigo** en la fila de una persona conectada pide una relación
  mutua; esa persona la ve en **Requiere su atención** con **Aceptar** /
  **Rechazar**, y usted puede usar **Cancelar solicitud de amistad** desde
  el menú **⋯** mientras espera. **Quitar de amigos** la termina; requiere
  que esa persona esté conectada, porque tiene que recibirlo. Los amigos
  tienen un botón **Chat**: consulte
  [Chat y conversaciones](08-ChatAndConversations.md).
- **Bloquear** detiene todo lo que viene de esa identidad (presencia,
  perfil, chat, incluso solicitudes de amistad) sin avisarle. Bloquear a
  un amigo no elimina la amistad, solo la silencia; **Desbloquear** (en el
  menú **⋯**, o en la lista **Bloqueados**) le permite volver a recibir
  noticias de esa persona, pero nunca restaura nada de lo que el bloqueo
  silenció mientras tanto.

## Seguir a personas

**Seguir** lo mantiene al tanto de las creaciones de alguien, como seguir
una cuenta en una red social, sin que ninguno de los dos le pida nada al
otro.

- **Dónde seguir.** **Seguir** aparece en las tarjetas de publicaciones del
  Repositorio, junto a **Firmado por …** en la página de un autor, en el
  menú **⋯** de una persona en esta página, y como **Seguir su trabajo** en
  un avatar en la Vista del mundo. Usted sigue una *identidad*, nunca un
  nombre de autor escrito: varias personas pueden publicar con el mismo
  nombre, así que la página de un autor muestra un **Seguir** por cada
  identidad que firmó trabajos con ese nombre.
- **La página Siguiendo** (**Siguiendo** en la barra superior) muestra a
  las personas que sigue, cada una con **Dejar de seguir**, y debajo, el
  trabajo más reciente de ellas que llegó a este dispositivo, del más nuevo
  al más antiguo. Haga clic en un nombre para ver solo el trabajo de esa
  persona.
- **Notificaciones.** Cuando una creación nueva de alguien a quien sigue
  llega a este dispositivo, el panel 🔔 recibe una entrada **Publication
  followed author published** (un autor que sigue publicó), una vez por
  creación, con **Explorar** para abrirla.
- **Sus Mundos compartidos se obtienen para usted.** Los Mundos que alguien
  a quien sigue comparte con sus pares conectados se recuperan
  automáticamente, como ya ocurre con los Amigos y los pares Recordados.
- **Sus anuncios se conservan más tiempo.** Este dispositivo guarda un
  registro de los anuncios que vio, hasta un límite por etiqueta de
  descubrimiento. Cuando una etiqueta está llena, primero se descartan los
  registros vistos hace más tiempo, pero las colocaciones de construcciones
  y los nombres de lugares firmados por personas que sigue se conservan
  antes que el resto.

**Seguir es privado y unilateral.** La lista se guarda en este dispositivo,
para la identidad con la que inició sesión. Nunca se envía a ningún lugar,
nunca se les avisa a las personas que sigue, y no hay contadores de
seguidores: sin un servidor, nadie podría contarlos de forma honesta.
Seguir tampoco le da nada a la otra persona: ni chat, ni ver su avatar, ni
una forma de contactarlo. Para eso sigue estando la amistad.

**Lo que no hace seguir.** Seguir selecciona el trabajo de las personas que
sigue entre lo que llega a este dispositivo; no va a buscar su trabajo por
sí solo. Las creaciones siguen llegando por las vías habituales: el
descubrimiento de Mundos en la Vista del mundo, los Mundos compartidos por
pares conectados y los enlaces que usted abre. Solo cuenta el trabajo cuya
firma pasa la comprobación, así que nadie puede entrar a su página
Siguiendo escribiendo en su trabajo el nombre o la identidad de otra
persona. El trabajo de alguien a quien **bloqueó** sigue oculto aunque lo
siga.

## TURN: retransmitir conexiones entre pares que no encuentran un camino directo

Cada conexión entre pares empieza intentando negociar un camino directo
entre dos navegadores, con los servidores STUN públicos predeterminados de
ForkBuild ayudando a cada lado a descubrir su propia dirección alcanzable.
Eso alcanza para la mayoría de las conexiones, pero algunas redes (un NAT
simétrico, un firewall corporativo restrictivo) nunca exponen un camino que
STUN pueda encontrar por sí solo. Si su servidor de encuentro ofrece un
relay TURN, ForkBuild le pide credenciales de relay de corta duración
cuando usted inicia una conexión (nunca solo por abrir la app) y las usa
automáticamente. El servidor entrega una cantidad limitada de credenciales
de relay por mes; cuando se agotan, las conexiones se siguen intentando,
solo que sin relay, hasta el mes siguiente. Para usar un relay propio,
abra **Servidor TURN** desde **Configuración de red** en la barra superior
(`/settings/turn-server`) y configure su propio relay TURN: un servidor que
realmente reenvía los datos de la conexión cuando no se puede establecer
un camino directo.

```
Servidor TURN

Su propio relay TURN, que se usa para conexiones entre pares que no pueden
establecer una ruta directa o negociada por STUN. Esta configuración solo
afecta al establecimiento de la conexión; no cambia la identidad de los
pares, la autenticación ni ninguna conexión existente.

No necesita completar esto para tener un relay: cuando se inicia una
conexión, ForkBuild ya les pide a sus servidores de encuentro (vea
Servidores de encuentro) un relay TURN de corta duración y lo usa cuando
lo ofrecen. Agregue un relay aquí solo si usted mismo administra o paga
uno; se usa junto con los de ellos, nunca en su lugar.

[ Una URL turn:/turns: por línea (p. ej., turn:relay.example:3478) ]

Nombre de usuario [______________]
Credencial [______________]

[Guardar]   [Borrar]
```

Ingrese una o más URL `turn:`/`turns:` (una por línea), un **Nombre de
usuario** y una **Credencial** (se envía el mismo par de credenciales
compartido para cada URL que indique, nunca uno distinto por servidor) y
haga clic en **Guardar**. Una vez configurado, el relay actual aparece como
“Relay TURN actual (*N* URL): `<sus URL>` — nombre de usuario: `<su nombre
de usuario>`”; la credencial en sí nunca se le vuelve a mostrar después de
guardarla, solo que hay una configurada. Haga clic en **Borrar** para
quitarlo por completo.

**A propósito, aquí no hay un botón “Restablecer valores
predeterminados”.** El relay predeterminado viene de los servidores de
encuentro, como se describe arriba, así que esta página no tiene nada
integrado a lo que volver: incluir aquí un servidor TURN significaría
publicar su credencial en la app para que cualquiera la lea y la gaste.
Dejar la página vacía igual le da el relay de los servidores de encuentro,
cuando lo ofrecen; sin relay de ninguno de los dos, las conexiones dependen
solo de STUN y de la conectividad directa. Su propio relay es opcional, y
algo que solo aportaría usted mismo (muchos proveedores de alojamiento de
WebRTC ofrecen uno) si las conexiones con ciertos pares siguen fallando
aun así. Como en todas las demás páginas de Configuración de red, un cambio
aquí solo tiene efecto la próxima vez que se carga la app.

## Volver a conectarse

Un Par conocido o un Amigo que no está en línea muestra un botón **Volver
a conectar**, incluso un amigo al que nunca recordó. Abre el mismo
intercambio de invitaciones que **Invitar** / **Pegar una invitación**, ahí
mismo en su fila, y siempre hace un intercambio inicial completo y nuevo,
en lugar de reutilizar datos de conexión antiguos. Si un intento de volver
a conectarse se autentica como una identidad *distinta* de la esperada,
ForkBuild lo rechaza y cierra la conexión con un error explícito, en lugar
de confiar en silencio en quien haya respondido.

ForkBuild también intenta esto por usted, automáticamente, para cada
identidad de Pares conocidos: en cuanto se inicia la app, cada vez que
Recuerda, Olvida o cambia de otra forma una relación de Par conocido, y
cada vez que usted mismo hace clic en **Ser descubrible**, comprueba en
silencio si cada uno de ellos es **descubrible** en ese momento y, si lo
es, se conecta sin que usted tenga que hacer clic en Volver a conectar.
Así, dos amigos que hacen clic en **Ser descubrible** se conectan: el
segundo clic encuentra al primero. Un Par conocido que no es descubrible
en ese momento, o que no se puede alcanzar, simplemente se deja en paz: no
hay ningún ciclo de reintentos que lo persiga, ninguna notificación sobre
el intento, y que una identidad falle nunca afecta a otra. Use **Volver a
conectar** cuando quiera que ocurra ahora mismo en lugar de esperar a la
siguiente pasada automática.

## ¿Y ahora qué?

Cuando tenga un amigo, chatee con él en
**[Chat y conversaciones](08-ChatAndConversations.md)**.
