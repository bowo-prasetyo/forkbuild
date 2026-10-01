<!-- translation-of: docs/Privacy.md source-hash: 91943196a1dbc4fd -->
# Privacidad

<!-- languages -->
[English](../../Privacy.md) · [Deutsch](../de/Privacy.md) · **Español** · [Bahasa Indonesia](../id/Privacy.md) · [日本語](../ja/Privacy.md) · [Português (Brasil)](../pt-BR/Privacy.md)
<!-- /languages -->

ForkBuild no tiene cuentas ni analíticas. Guarda su trabajo en su propio
navegador y habla con otras computadoras solo para las funciones que lo
necesitan. Esta página muestra lo que guarda, y cada servidor con el que
puede comunicarse y cuándo.

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
  **Configuración de red**.

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

## Lo que pueden ver otras personas

- **Todo lo que publica** es público: su contenido, su título, su
  descripción y su licencia, y la clave pública de su identidad, que lo
  firma. Una vez que otras personas tienen una copia, no puede recuperarla.
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

## Servidores con los que se comunica ForkBuild

Cada script, estilo y fuente proviene del sitio desde el que se sirve la
app (consulte [docs/Deployment.md](../../Deployment.md), en inglés). Una
sola cosa empieza por su cuenta: unos 10 segundos después de abrir la app,
y cada pocos minutos mientras su pestaña está visible, lee los anuncios
nuevos de los relays de Nostr, el gateway de Arweave y los nodos de Steem
configurados en **Configuración de red** (docs/AnnouncementIndex.md). Solo
lee anuncios (pequeños punteros y declaraciones firmadas), nunca contenido,
y no publica nada. Todo lo demás ocurre solo cuando usa la función, y cada
servidor se puede cambiar en **Configuración de red**. Cada servidor ve su
dirección IP y lo que usted le pide.

| Cuándo | Servidor (predeterminado) | Qué recibe |
| --- | --- | --- |
| Se vuelve descubrible, o busca a alguien, en **Pares** | el servidor de encuentro (`forkbuild-rendezvous.prazjp.workers.dev`) | la clave pública de su identidad y una oferta de conexión, que se guardan como máximo 15 minutos; la identidad que busca; cuando se conecta con alguien que encontró, su respuesta de conexión (que muestra sus direcciones de red), que solo esa persona puede recoger |
| Se une a una sala pública, o mira una | el mismo servidor de encuentro | su tarjeta de sala firmada (clave pública, nombre visible, qué sala), que se guarda como máximo 15 minutos y se renueva mientras se queda; qué sala mira |
| Se inicia una conexión entre pares | servidores STUN (`stun.l.google.com`) | nada más que una solicitud de su dirección IP pública |
| Inicia una conexión entre pares, si el servidor de encuentro ofrece un relay | `/turn-credentials` del servidor de encuentro, y luego su relay TURN (Cloudflare) | una solicitud de credenciales de relay de corta duración, como máximo una vez por hora aproximadamente; el tráfico retransmitido está cifrado de extremo a extremo por WebRTC |
| La app está abierta y su pestaña visible (sincronización de anuncios en segundo plano) | relays de Nostr (`relay.damus.io`), un gateway de Arweave (`arweave.net`), nodos de Steem (`api.steemit.com`) | consultas por las etiquetas de descubrimiento de ForkBuild: las etiquetas compartidas de Snapshots y de comentarios, y las regiones de nombres de lugares y las celdas del mapa que visitó |
| Distribuye o descubre publicaciones a través de Nostr | relays de Nostr (`relay.damus.io`) | los anuncios firmados que publica; sus consultas |
| Guarda u obtiene contenido en Arweave | un gateway de Arweave (`arweave.net`) | el contenido que publica; lo que obtiene |
| Obtiene contenido de IPFS | un gateway de IPFS (`ipfs.io`), o su propio nodo IPFS (`127.0.0.1:5001`) | lo que obtiene o agrega |
| Fija contenido con un servicio de pinning remoto (*experimental*) | el servicio que ingresa | el contenido, y el token que escribe para esa subida (nunca se guarda) |
| Guarda, anuncia o ancla en Steem, o descubre anuncios de Steem (*experimental*) | nodos de la API de Steem (`api.steemit.com`, luego `api.justyy.com`); la firma pasa por la extensión Steem Keychain | el nombre de su cuenta de Steem; lo que publica (anuncios, contenido guardado, anclajes) es público en la cadena para siempre, y las ediciones dejan la versión anterior en su historial |
| Distribuye en Steem la Declaración firmada de una publicación (*experimental*) | el alojamiento de imágenes de Steem (`steemitimages.com`) | una imagen de 320×200 de la construcción para la vista previa de la publicación, firmada con su clave de publicación de Steem |
| Abre un enlace compartido a una publicación (`#/view/…`) | el nodo de Steem, el gateway de Arweave o el gateway de IPFS que indica el enlace, y luego los sustratos de anuncio para encontrar su construcción | qué publicación, transacción o CID abre |
| Ancla o verifica evidencia en Bitcoin (*experimental*) | una API Esplora (`blockstream.info`) | la transacción que transmite o consulta |
| Verifica evidencia en Base (*experimental*) | un endpoint JSON-RPC de Base (`mainnet.base.org`) | la transacción que consulta |
| Conecta una billetera del navegador (*experimental*) | la extensión de billetera que elija | lo que le pida aprobar |

ForkBuild nunca envía su clave privada, su frase de contraseña ni sus
documentos guardados a ninguno de estos servidores.

**Los relays se usan solo cuando hacen falta.** Una conexión siempre
intenta primero un camino directo, luego uno encontrado mediante STUN, y
recurre al relay TURN solo cuando ninguno funciona. Mientras espera en una
sala, las ofertas que su dispositivo tiene listas nunca piden credenciales
de relay, así que estar en una sala no gasta la cuota de relay que el
servidor de encuentro reparte cada mes; la persona que se conecta con
usted pide una, si la necesita.

## Si ejecuta su propia copia

Una implementación decide los valores predeterminados de arriba: su
servidor de encuentro (`peer/RendezvousConfig.js`), si ese servidor ofrece
un relay TURN (`server/rendezvous-worker/README.md`), y los demás valores
predeterminados de **Configuración de red**. El servidor de encuentro
predeterminado solo acepta el origen del sitio oficial, así que una copia
alojada en otro lugar necesita el suyo (consulte
[docs/Deployment.md](../../Deployment.md), en inglés). Si aloja ForkBuild
para otras personas, actualice esta página para nombrar sus servidores.
