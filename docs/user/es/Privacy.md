<!-- translation-of: docs/Privacy.md source-hash: 65f1e9c30110d299 -->
# Privacidad

<!-- languages -->
[English](../../Privacy.md) · [Deutsch](../de/Privacy.md) · **Español** · [Français](../fr/Privacy.md) · [Bahasa Indonesia](../id/Privacy.md) · [日本語](../ja/Privacy.md) · [한국어](../ko/Privacy.md) · [Português (Brasil)](../pt-BR/Privacy.md)
<!-- /languages -->

ForkBuild no tiene cuentas y no lo rastrea. Guarda su trabajo en su propio
navegador y habla con otras computadoras solo para las funciones que lo
necesitan, además de un recuento anónimo de visitantes, una vez al día, cuando se usa un enlace para compartir y cuando se instala, para que sus creadores sepan
aproximadamente cuántas personas lo usan y comparten construcciones
(consulte «Recuento de visitantes» más abajo, y cómo desactivarlo). Esta página
muestra lo que guarda, y cada servidor con el que puede comunicarse y
cuándo.

## Lo que se queda en su dispositivo

Todo lo de abajo vive en el almacenamiento de este navegador (la base de
datos IndexedDB `forkbuild`; los navegadores sin IndexedDB usan
`localStorage`, con claves que empiezan con `forkbuild:`) y nunca sale del
dispositivo a menos que usted lo publique, lo exporte o lo envíe:

- sus documentos, las copias de recuperación de los cambios sin guardar y
  las estructuras guardadas;
- sus identidades: la clave pública de cada una, y su clave privada,
  cifrada con su frase de contraseña a menos que haya elegido crearla sin
  una;
- los pares conocidos, los amigos, las personas que sigue, los bloqueos, el
  historial de chat y los mensajes en cola (no se le avisa a nadie que
  usted lo sigue, y nunca se envía nada sobre un seguimiento);
- el perfil de su avatar, la configuración (incluido si la Vista del mundo
  reproduce sonido, a qué volumen y en 3D o estéreo, y el idioma que eligió;
  si no eligió ninguno, ForkBuild lee en el dispositivo los idiomas
  preferidos del navegador y no los envía a ningún lugar), y el nombre de
  usuario y la credencial de un servidor TURN si ingresa uno en
  **Configuración de red**;
- si este navegador participa en el recuento diario de visitantes, y el
  último día en que lo hizo;
- las publicaciones de otras personas que este dispositivo encontró y
  verificó, desde pares, enlaces, la Vista del mundo o la búsqueda del
  Repositorio en las redes, y, para las encontradas en las redes, dónde se
  leyó el registro firmado de cada una;
- los identificadores de las publicaciones que retiró en este dispositivo,
  para que la búsqueda del Repositorio en las redes no vuelva a listar
  copias que distribuyó antes.
- a qué redes envió este dispositivo cada uno de sus comentarios, y cuándo,
  para que cada comentario pueda indicar adónde fue.
- para cada semana del desafío de construcción que abre, los identificadores
  de las participaciones encontradas en las redes, para que su página las
  vuelva a mostrar antes de buscar.

Borrar los datos de este sitio en el navegador lo elimina todo, y no hay
ninguna otra copia ni forma de recuperarlo. Haga primero una copia de
seguridad con **Sus datos → Hacer copia de seguridad en un archivo**: el
archivo contiene todo lo anterior excepto con qué identidad se inició
sesión, cifrado con una frase de contraseña que usted elige, y se queda
donde usted lo ponga. ForkBuild nunca lo sube. **Compartir copia de
seguridad** le entrega el archivo a la app que elija en su dispositivo. Si
elige una carpeta de copias de seguridad, el navegador conserva el permiso
de ForkBuild para ella, y ForkBuild conserva la carpeta y, si usted lo
pide, una clave hecha a partir de su frase de contraseña de la copia de
seguridad que solo puede crear copias de seguridad (nunca abrirlas), en una
base de datos IndexedDB aparte, `forkbuild-backup`; cuándo y dónde hizo su
última copia de seguridad se guarda con el resto de los datos, pero se deja
fuera de las copias.

En el sitio oficial, el navegador también guarda los archivos propios de
ForkBuild (su código, su hoja de estilos, sus iconos y el idioma que usa) a
través del service worker del sitio, para que ForkBuild se abra sin conexión
y se pueda instalar como aplicación. Son los mismos archivos para todos y no
contienen nada suyo. Si las notificaciones en este dispositivo están
activadas se guarda con su configuración (consulte «Notificaciones en este
dispositivo» más abajo).

## Lo que pueden ver otras personas

- **Todo lo que publica** es público: su contenido, su título, su
  descripción y su licencia, y la clave pública de su identidad, que lo
  firma. Una vez que otras personas tienen una copia, no puede recuperarla. Cuando lo distribuye en Nostr o Arweave, su anuncio también enumera sus
  etiquetas (como `forkbuild-tag:<tag>`), para que cualquiera encuentre las
  construcciones con una etiqueta, como las participaciones del desafío de
  una semana.
- **Los pares con los que se conecta** conocen la clave pública de su
  identidad y su dirección IP (una conexión directa la necesita; un relay
  TURN la oculta del par, pero no del relay). Los pares conectados pueden
  ver su avatar y su presencia según su opción de visibilidad, incluido qué
  vehículo conduce (su tipo y su id, enviados solo cuando se enviaría la
  presencia; dónde dejó un vehículo nunca se envía), y sus amigos pueden
  enviarle mensajes.
  También reciben los anuncios de Snapshots y de nombres de lugares que
  descubrió su dispositivo, así que se enteran de en qué regiones del Mundo
  buscó nombres de lugares (docs/AnnouncementIndex.md).
- **Los pares, para los Mundos que comparte.** **Compartir con pares**, en
  el Repositorio, ofrece uno de sus Mundos publicados a todas las personas
  con las que está conectado ahora y a cualquiera que se conecte después,
  incluidos los desconocidos de una sala: reciben su listado y pueden
  obtener el Mundo en sí desde su dispositivo mientras usted esté
  conectado. Los dispositivos de sus Amigos y Pares conocidos lo obtienen
  por su cuenta; los de cualquier otra persona, solo cuando hace clic en
  **Recuperar**. Un Mundo que solo **publica** nunca se le envía a nadie.
- **Cualquiera, mientras está en una sala pública.** Unirse a la sala
  pública (**Pares**) o a la sala de un Mundo (**Sala** en la Vista del
  mundo) muestra la clave pública de su identidad y el nombre visible que
  elija a cualquiera que abra esa sala. La sala de un Mundo también le dice
  qué Mundo tiene abierto. Su entrada dura hasta que sale, cierra la app
  (entonces, hasta 10 minutos más) o la tarjeta vence. No contiene ninguna
  dirección de red, pero cualquiera en la sala puede conectarse con usted,
  y un desconocido que se conecta es un par conectado común: conoce su
  dirección IP, ve su avatar y su presencia según lo permita su
  configuración de visibilidad, e **intercambia con usted anuncios de
  Snapshots y de nombres de lugares y metadatos de publicaciones,
  exactamente como cualquier par conectado**, antes de que lo Recuerde o se
  hagan amigos. El chat y la voz siguen requiriendo una amistad mutua.
  **Bloquear** en la sala oculta a alguien de sus listas de la sala y lo
  bloquea igual que en la página Pares (presencia, perfil, chat y
  solicitudes de amistad).

## Recuento de visitantes

Una vez al día, la primera vez que ForkBuild se abre en este dispositivo ese
día del calendario, el sitio oficial
(`https://bowo-prasetyo.github.io/forkbuild/`) carga una imagen diminuta de
GoatCounter (`forkbuild.goatcounter.com`), un contador que no usa cookies.
Esa solicitud es todo lo que envía:

- **Lo que recibe GoatCounter:** su dirección IP y el User-Agent de su
  navegador, como en cualquier solicitud web, más una ruta fija (`/`) y un
  número aleatorio que evita que la imagen quede en caché. No incluye
  ninguna página, documento, mundo, identidad, referente ni nada que
  ForkBuild guarde, así que no puede saber qué hace en la aplicación, ni
  siquiera qué página abrió.
- **Lo que conserva:** solo totales: visitantes por hora y por día, y de qué
  navegadores, sistemas, países e idiomas llegaron, cada cosa contada por
  separado, de modo que no se pueden relacionar entre sí. Su política de
  privacidad (<https://www.goatcounter.com/help/privacy>) dice que nunca
  guarda direcciones IP ni el User-Agent completo: los mantiene en memoria
  hasta 8 horas, solo para reconocer una visita repetida, sin cookies.
- **Cualquiera puede ver los totales** en el panel público,
  <https://forkbuild.goatcounter.com/>.

El mismo contador también se entera de tres momentos al compartir una
construcción, cada uno como una solicitud de imagen más del mismo tipo, con
su propia ruta fija:

- `/e/share-link`: se copió o se compartió un enlace a una construcción con
  **Copiar enlace** o **Compartir…**;
- `/e/opened-shared-link`: un enlace compartido abrió una construcción;
- `/e/remix-from-link`: una construcción abierta desde un enlace compartido
  se copió en el Editor (como mucho una vez por construcción cada vez que la
  aplicación está abierta).

También se entera, de la misma manera, cuando ForkBuild se instala como
aplicación (`/e/installed`).

También se entera, de la misma manera, de las construcciones insertadas en
páginas de otros sitios (consulte «Servidores que ForkBuild contacta» más
abajo):

- `/e/embed-code`: se copió el código para insertar de una construcción con
  **Insertar → Copiar código para insertar**;
- `/e/embed-view`: una construcción insertada se mostró en una página;
- `/e/embed-open`: una construcción insertada se abrió en ForkBuild desde
  esa página.

Y cuando alguien se une al desafío de construcción semanal (**Unirse al
desafío**, o el desafío en **Nuevo** del Editor): `/e/challenge-join`.

Cada una envía solo su ruta y el número aleatorio: nunca el enlace, la
construcción, su título ni quién la hizo. Qué construcciones se abrieron
desde un enlace solo se guarda en la memoria de la página abierta, y se
olvida cuando se cierra.

Ninguna de estas solicitudes se envía nunca:

- cuando su navegador envía Global Privacy Control o Do Not Track;
- cuando desactiva **Sus datos → Recuento diario de visitantes → Contar
  este navegador** (la elección se guarda solo en este navegador);
- desde ninguna copia de ForkBuild servida desde otro lugar que no sea el
  sitio oficial, incluido `localhost`.

Una construcción insertada no puede leer la opción **Contar este
navegador**: no abre ningún almacenamiento, y los navegadores mantienen
aparte el almacenamiento de un sitio dentro de las páginas de otros sitios de
todos modos. Por eso `/e/embed-view` y `/e/embed-open` siguen solo las otras
dos reglas: nunca con Global Privacy Control o Do Not Track, y solo desde el
sitio oficial.

El código está en `core/VisitorCount.js`,
`application/settings/CountDailyVisit.js`,
`application/settings/FunnelEventCounter.js`, `ui/counterHit.js`,
`ui/start.js` y `ui/embed/embedBoot.js`.

## Servidores con los que se comunica ForkBuild

Cada script, estilo y fuente proviene del sitio desde el que se sirve la
app (consulte [docs/Deployment.md](../../Deployment.md), en inglés). Una
sola cosa empieza por su cuenta: unos 10 segundos después de abrir la app,
y cada pocos minutos mientras su pestaña está visible, lee los anuncios
nuevos de los relays de Nostr, el gateway de Arweave y los nodos de Steem y Blurt
configurados en **Configuración de red** (docs/AnnouncementIndex.md). Solo
lee anuncios (pequeños punteros y declaraciones firmadas), nunca contenido,
y no publica nada. Todo lo demás ocurre solo cuando usa la función, y cada
servidor se puede cambiar en **Configuración de red**. Cada servidor ve su
dirección IP y lo que usted le pide.

| Cuándo | Servidor (predeterminado) | Qué recibe |
| --- | --- | --- |
| La aplicación se abre en el sitio oficial, como mucho una vez al día (consulte «Recuento de visitantes») | GoatCounter (`forkbuild.goatcounter.com`) | una solicitud de imagen con una ruta fija, sin referente y sin cookie |
| En el sitio oficial, copia o comparte un enlace a una construcción, abre un enlace compartido o copia en el Editor una construcción abierta desde uno (consulte «Recuento de visitantes») | GoatCounter (`forkbuild.goatcounter.com`) | una solicitud de imagen con una ruta fija que indica cuál de los tres momentos fue, sin referente y sin cookie |
| Instala ForkBuild desde el sitio oficial (consulte «Recuento de visitantes») | GoatCounter (`forkbuild.goatcounter.com`) | una solicitud de imagen con la ruta fija `/e/installed`, sin referente y sin cookie |
| En el sitio oficial, copia el código para insertar de una construcción, o una construcción insertada se muestra o se abre en ForkBuild (consulte «Recuento de visitantes») | GoatCounter (`forkbuild.goatcounter.com`) | una solicitud de imagen con una ruta fija que indica cuál de los tres casos fue, sin referente y sin cookie |
| En el sitio oficial, se une al desafío de construcción semanal (vea «Recuento de visitantes») | GoatCounter (`forkbuild.goatcounter.com`) | una solicitud de imagen con la ruta fija `/e/challenge-join`, sin referente y sin cookie |
| Se vuelve descubrible, o busca a alguien, en **Pares** | el servidor de encuentro (`forkbuild-rendezvous.prazjp.workers.dev`) | la clave pública de su identidad y una oferta de conexión, que se guardan como máximo 15 minutos; la identidad que busca; cuando se conecta con alguien que encontró, su respuesta de conexión (que muestra sus direcciones de red), que solo esa persona puede recoger |
| Se une a una sala pública, o mira una | el mismo servidor de encuentro | su tarjeta de sala firmada (clave pública, nombre visible, qué sala), que se guarda como máximo 15 minutos y se renueva mientras se queda; qué sala mira |
| Se inicia una conexión entre pares | servidores STUN (`stun.l.google.com`) | nada más que una solicitud de su dirección IP pública |
| Inicia una conexión entre pares, si el servidor de encuentro ofrece un relay | `/turn-credentials` del servidor de encuentro, y luego su relay TURN (Cloudflare) | una solicitud de credenciales de relay de corta duración, como máximo una vez por hora aproximadamente; el tráfico retransmitido está cifrado de extremo a extremo por WebRTC |
| La app está abierta y su pestaña visible (sincronización de anuncios en segundo plano) | relays de Nostr (`relay.damus.io`), un gateway de Arweave (`arweave.net`), nodos de Steem (`api.steemit.com`), nodos de Blurt (`rpc.blurt.blog`) | consultas por las etiquetas de descubrimiento de ForkBuild: las etiquetas compartidas de Snapshots y de comentarios, y las regiones de nombres de lugares y las celdas del mapa que visitó |
| Abre el Repositorio o la página de un autor | relays de Nostr (`relay.damus.io`), un gateway de Arweave (`arweave.net`), nodos de Steem (`api.steemit.com`), nodos de Blurt (`rpc.blurt.blog`) | una consulta por la etiqueta compartida de publicaciones (`forkbuild-publication`); luego una solicitud del registro firmado de cada publicación recién anunciada, como máximo 20 por visita o por **Volver a buscar** |
| Abre el desafío de construcción de una semana (**Desafío**) | relés de Nostr (`relay.damus.io`), una pasarela de Arweave (`arweave.net`) | una consulta por la etiqueta de esa semana (`forkbuild-tag:<tag>`); después, una solicitud del registro firmado de cada participación anunciada nueva, como máximo 20 por visita o **Volver a buscar** |
| Distribuye o descubre publicaciones a través de Nostr | relays de Nostr (`relay.damus.io`) | los anuncios firmados que publica; sus consultas |
| Guarda u obtiene contenido en Arweave | un gateway de Arweave (`arweave.net`) | el contenido que publica; lo que obtiene |
| Obtiene contenido de IPFS | un gateway de IPFS (`ipfs.io`), o su propio nodo IPFS (`127.0.0.1:5001`) | lo que obtiene o agrega |
| Fija contenido con un servicio de pinning remoto (*experimental*) | el servicio que ingresa | el contenido, y el token que escribe, que solo se conserva hasta que cierre o recargue la página (nunca se guarda); la dirección del servicio y los nombres de campo se guardan en este dispositivo cuando los guarda en **Proveedor de contenido** |
| Guarda, anuncia o ancla en Steem, o descubre anuncios de Steem (*experimental*) | nodos de la API de Steem (`api.steemit.com`, luego `api.justyy.com`, luego `steemd.steemworld.org`); la firma pasa por la extensión Steem Keychain | el nombre de su cuenta de Steem; lo que publica (anuncios, contenido guardado, anclajes) es público en la cadena para siempre, y las ediciones dejan la versión anterior en su historial |
| Guarda, anuncia o ancla en Blurt, o descubre publicaciones de Blurt (*experimental*) | nodos de la API de Blurt (`rpc.blurt.blog`, luego `rpc.beblurt.com`, luego `rpc.drakernoise.com`); la firma pasa por la extensión Blurt Keychain (o WhaleVault) | el nombre de su cuenta de Blurt, y las cuentas cuyo historial de publicaciones se lee (las que sigue, y cada cuenta que este dispositivo vio publicar con las etiquetas de ForkBuild, recordadas en este dispositivo); lo que publica es público en la cadena para siempre, con su propia cuenta, y las ediciones dejan la versión anterior en su historial. Cada transacción paga una pequeña comisión en BLURT desde su cuenta |
| Distribuye en Blurt la Declaración firmada de una publicación (*experimental*) | el alojamiento de imágenes de Blurt (`img-upload.blurt.blog`), directamente o, cuando el navegador no puede alcanzarlo, a través del relé `/blurt-image` del servidor de encuentro, que no guarda nada | una imagen de 320×200 de la construcción para la vista previa de la publicación, firmada con su clave de publicación de Blurt |
| Distribuye en Steem la Declaración firmada de una publicación (*experimental*) | el alojamiento de imágenes de Steem (`steemitimages.com`), directamente o, cuando el navegador no puede alcanzarlo, a través del relé `/steem-image` del servidor de encuentro, que no guarda nada | una imagen de 320×200 de la construcción para la vista previa de la publicación, firmada con su clave de publicación de Steem |
| Alguien abre, o un sitio muestra la vista previa de, un enlace que lleva su construcción (`/b/…`) | el servidor de encuentro (`forkbuild-rendezvous.prazjp.workers.dev`) | el enlace, que contiene la construcción y su Declaración firmada; no guarda nada |
| Alguien abre una página con una construcción insertada (`embed.html#…`) | el sitio desde el que se sirve ForkBuild (`bowo-prasetyo.github.io`) | solicitudes de los archivos de la inserción, sin referente; nunca la construcción, que va en la parte de la dirección que los navegadores no envían |
| Un sitio o un editor pregunta cómo insertar un enlace `/b/…` (oEmbed) | el `/oembed` del servidor de encuentro (`forkbuild-rendezvous.prazjp.workers.dev`) | el enlace, que contiene la construcción y su Reclamación firmada; no guarda nada |
| Abre un enlace compartido a una publicación (`#/view/…`) | el nodo de Steem o Blurt, el gateway de Arweave o el gateway de IPFS que indica el enlace, y luego los sustratos de anuncio para encontrar su construcción | qué publicación, transacción o CID abre |
| Ancla o verifica evidencia en Bitcoin (*experimental*) | una API Esplora (`blockstream.info`) | la transacción que transmite o consulta |
| Verifica evidencia en Base (*experimental*) | un endpoint JSON-RPC de Base (`mainnet.base.org`) | la transacción que consulta |
| Conecta una billetera del navegador (*experimental*) | la extensión de billetera que elija | lo que le pida aprobar |

ForkBuild nunca envía su clave privada, su frase de contraseña ni sus
documentos guardados a ninguno de estos servidores.

**Un enlace que lleva su construcción** (creado con **Copiar enlace** o
**Compartir…** antes de distribuir una construcción) contiene su Mundo
compartido firmado y la construcción misma. Apunta al servidor de encuentro
(`forkbuild-rendezvous.prazjp.workers.dev/b/…`) para que las aplicaciones de
chat y las redes sociales puedan mostrar el título de la construcción y una
imagen de ella: abrir el enlace, o que un sitio muestre su vista previa, lo
envía, y con él la construcción, a ese servidor, que comprueba la firma,
dibuja la imagen, lleva a las personas a la aplicación (`#/s/…`, una parte de
la dirección que los navegadores nunca envían a un servidor) y no guarda
nada. Cloudflare, que opera el servidor, puede registrar las direcciones
solicitadas. Crear un enlace no contacta nada. Quien tenga el enlace puede
ver la construcción, su título, su descripción y el nombre del autor, y la
clave pública de su identidad, como con cualquier Mundo compartido que
distribuya.

**Una construcción insertada** (el código que copia **Insertar**: un
`<iframe>` de `embed.html#…` en el sitio desde el que se sirve ForkBuild)
lleva lo mismo: su Mundo compartido firmado y la construcción. La página
donde se pega carga la inserción desde ese sitio, que no se entera ni de la
construcción (va en la parte de la dirección que los navegadores nunca
envían a un servidor) ni de la página que la rodea (el marco no envía
referente). En el navegador del lector, la inserción comprueba la firma y la
construcción, la muestra y no guarda nada; no inicia ninguna de las
conexiones de la aplicación, así que no se contacta con pares, relés ni
otras redes. Cualquiera que pueda ver la página puede ver la construcción,
como con su enlace.

**Los relays se usan solo cuando hacen falta.** Una conexión siempre
intenta primero un camino directo, luego uno encontrado mediante STUN, y
recurre al relay TURN solo cuando ninguno funciona. Mientras espera en una
sala, las ofertas que su dispositivo tiene listas nunca piden credenciales
de relay, así que estar en una sala no gasta la cuota de relay que el
servidor de encuentro reparte cada mes; la persona que se conecta con
usted pide una, si la necesita.

## Notificaciones en este dispositivo

Si activa **Avisarme en este dispositivo** (en el panel 🔔), su dispositivo
muestra por sí mismo sus notificaciones nuevas mientras ForkBuild está
abierto en una pestaña en segundo plano o como aplicación instalada. No se
usa ningún servicio push y no se envía nada a ninguna parte para ello: la
página abierta entrega la notificación a su navegador, que la muestra a
través de su sistema operativo. El texto de la notificación (por ejemplo, el
título de una construcción y el nombre de quien la hizo) puede quedar
entonces en el historial de notificaciones de su dispositivo, como con
cualquier aplicación. Desactívelo en el mismo panel, o bloquee las
notificaciones de ForkBuild en la configuración del sitio del navegador.

## Si ejecuta su propia copia

Una implementación decide los valores predeterminados de arriba: su
servidor de encuentro (`peer/RendezvousConfig.js`), si ese servidor ofrece
un relay TURN (`server/rendezvous-worker/README.md`), y los demás valores
predeterminados de **Configuración de red**. El servidor de encuentro
predeterminado solo acepta el origen del sitio oficial, así que una copia
alojada en otro lugar necesita el suyo (consulte
[docs/Deployment.md](../../Deployment.md), en inglés). Si aloja ForkBuild
para otras personas, actualice esta página para nombrar sus servidores.

El recuento de visitantes solo funciona en el sitio oficial, así que una
copia alojada en otro lugar no cuenta nada. Para contar sus propios
visitantes, cambie las direcciones de `core/VisitorCount.js` y la entrada
`img-src` de la Content Security Policy de `index.html`.
