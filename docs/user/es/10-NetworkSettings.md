<!-- translation-of: docs/user/10-NetworkSettings.md source-hash: b4db56909f354d27 -->
# 10 — Configuración de red

<!-- languages -->
[English](../10-NetworkSettings.md) · [Deutsch](../de/10-NetworkSettings.md) · **Español** · [Français](../fr/10-NetworkSettings.md) · [Bahasa Indonesia](../id/10-NetworkSettings.md) · [日本語](../ja/10-NetworkSettings.md) · [한국어](../ko/10-NetworkSettings.md) · [Português (Brasil)](../pt-BR/10-NetworkSettings.md)
<!-- /languages -->

**Configuración de red**, en la barra superior, enlaza todas las páginas
que controlan con qué servidores habla ForkBuild. La mayoría de las
personas nunca necesita cambiar nada aquí: los valores predeterminados
funcionan desde el principio. Venga aquí cuando un servidor no funcione,
cuando administre uno propio, o para elegir dónde se guardan y se anuncian
sus publicaciones.

Para saber qué averigua cada servidor sobre usted, consulte
[Privacidad](Privacy.md).

## Las páginas

| Página | Ruta | Qué configura |
|---|---|---|
| **Proveedor de contenido** | `/settings/content-provider` | Dónde guardan contenido nuevo **Guardar en …** y **Usar el proveedor preferido**, y a qué nodo IPFS va: consulte [más abajo](#proveedor-de-contenido) |
| **Proveedor de anuncio / descubrimiento** | `/settings/announcement-discovery-provider` | Adónde van sus anuncios de forma predeterminada: Nostr, Arweave, Steem o Blurt; consulte [más abajo](#proveedor-de-anuncio--descubrimiento) |
| **Proveedor de prueba / anclaje** | `/settings/anchor-provider` | Dónde ancla **Anclar en …**: consulte [más abajo](#proveedor-de-prueba--anclaje) |
| **Gateway de Arweave** | `/settings/arweave-gateway` | Gateways para leer contenido de Arweave: consulte [más abajo](#gateway-de-arweave) |
| **Gateway de IPFS** | `/settings/ipfs-gateway` | Gateways para leer contenido de IPFS: consulte [más abajo](#gateway-de-ipfs) |
| **Endpoint de Bitcoin** *(experimental)* | `/settings/bitcoin-esplora` | El servicio que usa el anclaje en Bitcoin: consulte [más abajo](#endpoint-de-bitcoin) |
| **Relays de Nostr** | `/settings/nostr-relay` | Relays para publicar y descubrir a través de Nostr: consulte [más abajo](#relays-de-nostr) |
| **Steem** *(experimental)* | `/settings/steem` | Su cuenta de Steem, y de dónde se lee Steem: consulte [más abajo](#steem) |
| **Blurt** *(experimental)* | `/settings/blurt` | Su cuenta de Blurt, y de dónde se lee Blurt: consulte [más abajo](#blurt) |
| **Servidores STUN** / **Servidor TURN** | `/settings/stun`, `/settings/turn-server` | Ayuda para las conexiones entre pares: consulte [TURN](07-PeerConnectionsAndFriends.md#turn-retransmitir-conexiones-entre-pares-que-no-encuentran-un-camino-directo) |
| **Servidores de encuentro** | `/settings/rendezvous` | Cómo se encuentran los pares: consulte [Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md) |

## Cómo se comporta cada página

- **Recargue después de guardar.** Los cambios tienen efecto la próxima vez
  que se carga la app (las cuentas de Steem y Blurt son las excepciones). Una
  Vista del mundo o un Editor abiertos siguen usando la configuración
  anterior hasta que recargue.
- Cada página tiene su propio **Guardar**. Un guardado que falla muestra el
  motivo y deja la configuración anterior como estaba; uno que funciona
  muestra “Guardado.”.
- Las listas de opciones se muestran en orden alfabético.
- **Las listas de servidores vienen con valores predeterminados.** Las
  páginas Gateway de Arweave, Gateway de IPFS, Endpoint de Bitcoin, Relays
  de Nostr, Steem, Blurt, STUN y Servidores de encuentro empiezan con varios
  servidores públicos gratuitos, para que todo siga funcionando cuando uno
  falla. La página dice si “Se usan los … predeterminados” o “Se usan sus
  … guardados”. Sin nada guardado, el cuadro de texto contiene los valores
  predeterminados, uno por línea, listos para editar. **Guardar** sigue
  deshabilitado hasta que cambie algo, así que sigue recibiendo los valores
  predeterminados mejorados de las versiones futuras. **Restablecer valores
  predeterminados** quita su lista.
- **La validación solo comprueba el formato.** Guardar rechaza todo lo que
  no sea una URL bien formada del tipo correcto, pero no comprueba que el
  servidor funcione; un servidor equivocado aparece más tarde como una
  lectura fallida.
- **Los valores predeterminados son servicios de terceros.** Cada uno ve su
  dirección IP y lo que la app le pide. El contenido leído a través de un
  gateway se comprueba contra su hash de contenido, así que un gateway no
  puede colar otros bytes.

## Proveedor de contenido

Elija en qué almacenamiento crean una Ubicación de Snapshot **Guardar en
…** (el primer botón del bloque **Contenido** de una publicación) y **Usar
el proveedor preferido** (consulte
[Usar un proveedor preferido](11-EvidenceAndStorage.md#usar-un-proveedor-preferido)),
entre los backends que registró este dispositivo, y haga clic en
**Guardar**. **Local** no se ofrece, ya que cada publicación ya está
guardada en este dispositivo.

**IPFS (pinning remoto)** siempre se ofrece. Elegirlo preselecciona el
pinning remoto como almacenamiento en todos los diálogos **Distribuir**;
igual tiene que escribir el endpoint y la credencial cada vez. Los botones
de proveedor preferido no pueden usar el pinning remoto: con él guardado,
el bloque **Contenido** muestra todos los backends en lugar de **Guardar en
…**, y **Usar el proveedor preferido** informa **No se encontró el
proveedor preferido**.

Una segunda sección, **Nodo de IPFS**, configura el nodo al que se envían
las nuevas ubicaciones en IPFS. El predeterminado es un nodo Kubo local en
`http://127.0.0.1:5001`. Ingrese la URL de la API de otro nodo y use
**Guardar**, o **Usar el valor predeterminado de la implementación** para
volver. No afecta la lectura de contenido de IPFS, que usa la lista de
[Gateway de IPFS](#gateway-de-ipfs).

## Proveedor de anuncio / descubrimiento

Elija **Arweave**, **Blurt** (experimental), **Nostr** o **Steem** (experimental) como el lugar
predeterminado donde se anuncian sus publicaciones (Mundos compartidos,
Atribuciones de plano y declaraciones de nombres de lugares), Snapshots y
comentarios. Es solo un valor predeterminado: todos los diálogos
**Distribuir**, el selector de Distribución de cada tarjeta del Repositorio
y el selector de red junto a **Publicar comentario** empiezan en él, y
puede cambiarlos para una acción concreta.
Para encontrar contenido de otras personas siempre se busca en todos.

Una segunda sección, **Comentarios**, da a los comentarios un valor
predeterminado propio. **Igual que el proveedor de anuncio / descubrimiento
de arriba**, la opción inicial, los mantiene en la elección de arriba. Elija
en su lugar una red, o **Solo local y pares** para que los comentarios no
lleguen a ninguna red, sin necesitar cuenta en ninguna. Todos los
formularios de comentarios empiezan con ella, y puede cambiarla en un
comentario junto a **Publicar comentario**.

## Proveedor de prueba / anclaje

Elija dónde crea evidencia externa **Anclar en …** (el
primer botón del bloque **Prueba / anclaje** de una publicación):
**Arweave**, **Bitcoin** *(experimental)*, **Blurt** *(experimental)* o **Steem** *(experimental)*, según los que haya registrado este
dispositivo. Base nunca se ofrece, porque cada anclaje en Base requiere que
usted revise y firme una transacción de billetera. Con Bitcoin elegido no
hay botón **Anclar en …**: el bloque muestra todas las opciones y remite a
los pasos de billetera; consulte
[El flujo de anclaje en Bitcoin](11-EvidenceAndStorage.md#el-flujo-de-anclaje-en-bitcoin)
para hacer anclajes reales en Bitcoin.

## Gateway de Arweave

Gateways para leer contenido de Arweave, una URL `http://` o `https://` por
línea. Los predeterminados son `https://arweave.net`, `https://ardrive.net`
y `https://permagate.io`.

Se prueban en orden: una lectura pasa al siguiente gateway solo si el
actual no se puede alcanzar o devuelve un error. El contenido de Arweave se
identifica por su id de transacción, así que todos los gateways devuelven
los mismos bytes.

Esta lista se usa al recuperar el material de una publicación desde una
fuente descentralizada y al resolver o materializar una Ubicación de
Snapshot en Arweave. No cambia adónde se sube su propio contenido. Los
anclajes en Arweave usan el primer gateway de la lista para crear y
verificar.

## Gateway de IPFS

Gateways para leer contenido de IPFS, una URL por línea, que se prueban en
orden como los de Arweave. Los predeterminados son `https://ipfs.io`,
`https://dweb.link`, `https://4everland.io` y `https://ipfs.filebase.io`.

Esta lista se usa al resolver o materializar una Ubicación de Snapshot en
IPFS, para **Verificar contenido de IPFS** y para abrir enlaces compartidos
a contenido en IPFS. No cambia dónde se fija su propio contenido.

Algunos gateways, entre ellos `https://ipfs.io`, bloquean las solicitudes
automatizadas de algunas personas detrás de una comprobación antibots; los
demás predeterminados los administran otros operadores, así que una
lectura pasa a ellos. Si **Verificar** o **Resolver** siguen fallando con
“Failed to fetch” para contenido que sabe que está ahí, agregue arriba el
gateway de su proveedor de pinning (por ejemplo,
`https://gateway.pinata.cloud`).

## Endpoint de Bitcoin

*Experimental.* La API compatible con Esplora que usa el anclaje en
Bitcoin para transmitir transacciones, comprobar confirmaciones, consultar
los fondos de la billetera y verificar la prueba OP_RETURN de un anclaje.
Una URL `http://` o `https://` por línea; los predeterminados son
`https://blockstream.info/api` y `https://mempool.space/api`.

Una consulta usa el primer endpoint que responde. Una transmisión pasa al
siguiente endpoint solo si el anterior no se pudo alcanzar, nunca después
de que uno rechazara la transacción.

## Relays de Nostr

Relays para todo lo que ForkBuild publica o descubre a través de Nostr:
publicaciones (Mundos compartidos, Atribuciones de plano y declaraciones de
nombres de lugares), Snapshots y comentarios. Una URL `ws://` o `wss://`
por línea; los predeterminados son `wss://relay.damus.io`, `wss://nos.lol`
y `wss://relay.primal.net`. **Guardar** reemplaza toda la lista, y la
rechaza si alguna línea no es una URL válida.

A diferencia de los gateways, los relays no se prueban en orden: los
anuncios van a todos los relays a la vez y el descubrimiento les pregunta a
todos, así que cada relay adicional hace que más personas puedan encontrar
su contenido, incluso mientras otro no funciona. Aquí no hay un estado por
relay; el resultado de **Distribuir** muestra una fila de
**Descubrimiento** por relay.

## Steem

*Experimental.* Configure **Su cuenta de Steem** en **Publicación** (se
aplica de inmediato, sin recargar); se necesita para publicar o guardar en
Steem: consulte [Steem](11-EvidenceAndStorage.md#steem). Leer de Steem no
requiere ninguna cuenta. El resto de la página configura de dónde se lee
Steem:

- **Nodos de API**, una URL `https://` por línea (predeterminados
  `https://api.steemit.com`, `https://api.justyy.com` y `https://steemd.steemworld.org`), que se prueban en
  orden.
- **Cuentas de los hilos**, una por línea (predeterminada `forkbuild`): de
  quién son los hilos de descubrimiento mensuales que se leen. Agregue otra
  si una comunidad tiene sus propios hilos.
- **Primer mes que se lee** (predeterminado: septiembre de 2026): ForkBuild
  lee cada mes desde ese hasta hoy, hasta los últimos 36 meses.

Cuando no se puede alcanzar ningún nodo de Steem, **Buscar comentarios
nuevos** y el descubrimiento de Snapshots indican que Steem no está
disponible, en lugar de informar que no se encontró nada.

## Blurt

*Experimental.* Configure **Su cuenta de Blurt** en **Publicar** (se aplica
de inmediato, sin recargar); se necesita para publicar, guardar o anclar
en Blurt: consulte [Blurt](11-EvidenceAndStorage.md#blurt). Leer de Blurt
no requiere ninguna cuenta. El resto de la página configura de dónde se
lee Blurt:

**Nodos de API**, una URL `https://` por línea (predeterminados
`https://rpc.blurt.blog`, `https://rpc.beblurt.com` y `https://rpc.drakernoise.com`), que se prueban en
orden. ForkBuild encuentra las publicaciones a través de Nexus, el índice
de búsqueda de Blurt, que conserva cada publicación por antigua que sea, y
omite un nodo que no lo ofrece. Cuando ningún nodo ofrece Nexus, recurre a
la lista de etiquetas propia de Blurt, que conserva una publicación solo
hasta que paga, a los siete días, y encuentra las publicaciones más
antiguas en el historial de las cuentas que vio publicar con la etiqueta
en este dispositivo. Aunque Nexus responda, ForkBuild lee también la lista
de etiquetas, por si Nexus omite una publicación; si la omite, lee además
el historial de esa cuenta, para que tampoco falten sus publicaciones más
antiguas.

Cuando no se puede alcanzar ningún nodo de Blurt, **Buscar comentarios
nuevos** y el descubrimiento de Snapshots indican que Blurt no está
disponible, en lugar de informar que no se encontró nada.
