<!-- translation-of: docs/user/Distribution.md source-hash: 9c6ca1cfed3b4863 -->
# Distribuir su trabajo

<!-- languages -->
[English](../Distribution.md) · [Deutsch](../de/Distribution.md) · **Español** · [Français](../fr/Distribution.md) · [Bahasa Indonesia](../id/Distribution.md) · [日本語](../ja/Distribution.md) · [Português (Brasil)](../pt-BR/Distribution.md)
<!-- /languages -->

Todo lo que crea ForkBuild empieza en su propio dispositivo. **Distribuir**
es el paso aparte y opcional que lleva su trabajo a redes descentralizadas,
para que personas que no están conectadas con usted puedan encontrarlo,
recuperarlo y comprobarlo. Esta página reúne en un solo lugar lo que puede
distribuir, adónde puede ir y lo que necesita. Cada sección enlaza con la
guía que explica los detalles.

## Publicar, compartir, distribuir: tres cosas distintas

| Acción | Adónde va | Quién lo recibe | Guía |
|---|---|---|---|
| **Publicar** | Solo a este dispositivo | Nadie más, por ahora | [Publicar su creación](04-PublishingAndForking.md#publicar-su-creación) |
| **Compartir con pares** | Directamente a las personas con las que está conectado | Sus pares conectados, mientras usted esté en línea | [Compartir con pares conectados](04-PublishingAndForking.md#compartir-con-pares-conectados) |
| **Distribuir** | Redes descentralizadas (IPFS, Arweave, Nostr, Steem) | Cualquiera, sin necesidad de estar conectado con usted | Esta página |

Publicar nunca envía nada a ningún lugar por sí solo, y compartir con pares
no es distribuir: los pares guardan una copia solo mientras quieran, y nadie
más puede encontrarla. Cada distribución es un clic propio y explícito.

## Los tres papeles que puede cumplir una red

Distribuir usa hasta tres tipos de red, cada uno elegido por separado:

| Papel | Como… | Qué hace | Opciones |
|---|---|---|---|
| **Contenido** (almacenamiento) | El lugar donde se guardan los ejemplares impresos | Guarda los bytes, como los bloques de su Mundo, para que otros puedan recuperarlos | **Arweave**, **IPFS (Local Kubo)**, **IPFS (Remote Pinning)**, **Steem** *(experimental)* |
| **Anuncio / descubrimiento** | Una ficha del catálogo de una biblioteca | Publica un pequeño aviso firmado que dice que su trabajo existe y dónde está su copia, para que otros puedan encontrarlo | **Nostr**, **Arweave**, **Steem** *(experimental)* |
| **Prueba / anclaje** *(experimental, opcional)* | El sello de un notario | Escribe el hash de su contenido en una cadena de bloques, como evidencia de que existía en ese momento. No guarda ni anuncia nada. | **Bitcoin**, **Arweave**, **Base**, **Steem** |

Guardar sin anunciar significa que nadie sabe dónde buscar; un anuncio sin
almacenamiento no apunta a nada. **Distribuir** hace ambas cosas con un solo
clic. Anclar es un extra, y se hace por separado en la página
**Publicaciones**.

Configure su opción habitual para cada papel en
[Configuración de red](10-NetworkSettings.md):
[Proveedor de contenido](10-NetworkSettings.md#proveedor-de-contenido),
[Proveedor de anuncio / descubrimiento](10-NetworkSettings.md#proveedor-de-anuncio--descubrimiento)
y [Proveedor de prueba / anclaje](10-NetworkSettings.md#proveedor-de-prueba--anclaje).
Solo rellenan la primera opción de cada selector; guardarlos nunca envía
nada.

## Lo que puede distribuir

| Qué | Contenido | Anuncio / descubrimiento | Prueba / anclaje | Dónde se hace |
|---|---|---|---|---|
| **La Declaración firmada de su Mundo** (el registro firmado de un Mundo publicado, llamado Mundo compartido) | Arweave, IPFS o Steem | Nostr, Arweave o Steem | — | **Distribuir** después de publicar en el Editor; **Mi Mundo compartido** en la Vista del mundo; la página **Publicaciones** |
| **El Snapshot de su Mundo** (sus bloques), con el lugar donde lo colocó | Arweave, IPFS o Steem | Nostr, Arweave o Steem | — | Los mismos diálogos de **Distribuir** (**Distribuir solo el Snapshot** para solo esta mitad) |
| **El hash del contenido de cualquier publicación** (un Mundo, una declaración de autoría o un nombre de lugar) | — | — | Bitcoin, Arweave, Base o Steem | La tarjeta de la publicación en la página **Publicaciones** |
| **La autoría de una estructura** (Atribución de plano) | Arweave, IPFS o Steem | Nostr, Arweave o Steem | — | **Distribuir** en el panel **Información** de la estructura, que se ofrece en cuanto usa **Publicar en la red**; la página **Publicaciones** |
| **Un nombre de lugar** (Declaración de nombre de lugar) | Arweave, IPFS o Steem | Nostr, Arweave o Steem | — | **Distribuir** en el panel de nombres de la Vista del mundo, que se ofrece en cuanto usa **Publicar un nombre** (anuncia el nombre en la red que elija); la página **Publicaciones** para cualquiera de estas opciones |
| **Un comentario** sobre una publicación | — | Nostr, Arweave o Steem | — | **Publicar comentario**, en el Repositorio o en la Vista del mundo, en la red elegida junto al botón |

El Snapshot de un Mundo lleva consigo su ubicación firmada, así que quienes
lo recuperan ven la construcción exactamente donde usted la puso.

Detalles:

- Declaración firmada y Snapshot:
  [Distribuir directamente desde el Editor](04-PublishingAndForking.md#distribuir-directamente-desde-el-editor),
  [Mi Mundo compartido](03-WorldView.md#mi-mundo-compartido--distribuir-su-propio-snapshot-sin-necesidad-de-pares)
  y el propio [diálogo Distribuir](03-WorldView.md#encuentros-en-el-mundo--publicaciones-y-avatares-que-comparten-sus-pares).
- La página Publicaciones:
  [Distribuir desde la página Publicaciones](09-PublicationsAndEvidence.md#distribuir-desde-la-página-publicaciones),
  [Ubicaciones de Snapshots](11-EvidenceAndStorage.md#ubicaciones-de-snapshots) y
  [Publicación en IPFS](11-EvidenceAndStorage.md#publicación-en-ipfs).
- Anclaje: [Evidencia externa](11-EvidenceAndStorage.md#evidencia-externa),
  [El flujo de anclaje en Bitcoin](11-EvidenceAndStorage.md#el-flujo-de-anclaje-en-bitcoin)
  y [El flujo de anclaje en Base](11-EvidenceAndStorage.md#el-flujo-de-anclaje-en-base).
- Autoría: [Declarar la autoría de una estructura](09-PublicationsAndEvidence.md#declarar-la-autoría-de-una-estructura).
- Nombres de lugares: [Nombrar un lugar](09-PublicationsAndEvidence.md#nombrar-un-lugar).
- Comentarios: [Cómo viajan los comentarios](09-PublicationsAndEvidence.md#cómo-viajan-los-comentarios).

## Lo que se queda con usted o con sus pares

No todo lo que crea se distribuye. Esto nunca va a las redes de arriba:

| Qué | Adónde va | Guía |
|---|---|---|
| Un Mundo que **comparte con pares** | Solo a sus pares conectados | [Compartir con pares conectados](04-PublishingAndForking.md#compartir-con-pares-conectados) |
| La posición en vivo y el aspecto de su avatar | Pares conectados, según lo permitan sus opciones de visibilidad | [Quién puede verlo](06-AvatarsAndPresence.md#quién-puede-verlo-dos-opciones-independientes) |
| Mensajes de chat y llamadas de voz | Directamente al amigo con quien habla | [Chat y conversaciones](08-ChatAndConversations.md) |
| Anclas y ubicaciones que intercambia con **Sincronizar con los pares** | Solo a sus pares conectados | [La descentralización de un vistazo](09-PublicationsAndEvidence.md#la-descentralización-de-un-vistazo) |
| Su identidad, estructuras guardadas, vehículos y animales que lleva, amigos, configuración | Este dispositivo, a menos que los exporte o haga una copia de seguridad | [Sus datos](13-YourData.md) |

Para llevarlos a otro dispositivo, o dárselos a alguien, use las
exportaciones y la copia de seguridad completa de [Sus datos](13-YourData.md).

## Lo que necesita cada red

Distribuir lo firma una extensión del navegador o una billetera que usted
mismo instala; ForkBuild nunca ve sus claves. Sin la extensión
correspondiente, el intento termina con un aviso de que no se pudo
completar.

| Red | Papeles | Lo que necesita | Límites y notas |
|---|---|---|---|
| **Nostr** | Anuncio / descubrimiento | Una extensión de firma de Nostr, como nos2x | Anuncia a la vez en todos los relays de [Relays de Nostr](10-NetworkSettings.md#relays-de-nostr); cuantos más relays, más personas pueden encontrarlo |
| **Arweave** | Contenido, anuncio / descubrimiento, prueba / anclaje | Una extensión de billetera de Arweave, como Wander | Guarda hasta 256 KB por Snapshot, unos ocho mil bloques; todo lo que sea más grande se rechaza antes de firmar. Permanente: sigue disponible con su computadora apagada. Una subida nueva puede tardar unos minutos en llegar a los gateways. |
| **IPFS (Local Kubo)** | Contenido | Su propio nodo de IPFS, por defecto en `http://127.0.0.1:5001` | Sin límite de tamaño. Disponible solo mientras su nodo esté en línea, a menos que alguien más lo fije. |
| **IPFS (Remote Pinning)** *(experimental)* | Contenido | Una cuenta en un servicio de pinning compatible con Pinata | Sin límite de tamaño. Escriba el endpoint y la credencial cada vez; nunca se guardan. |
| **Steem** *(experimental)* | Contenido, anuncio / descubrimiento, prueba / anclaje | La extensión Steem Keychain con su clave de publicación, y su cuenta en [Configuración de red → Steem](10-NetworkSettings.md#steem) | Las publicaciones son respuestas a los hilos mensuales de ForkBuild; una aprobación por publicación. Guarda unos 2.500 bloques por publicación, hasta unos 30.000 bloques en 20 publicaciones. Usa Resource Credits, que se recargan. |
| **Bitcoin** *(experimental)* | Prueba / anclaje | La extensión UniSat, con bitcoin en una dirección SegWit nativa (`bc1q…`) para la comisión | Se hace con los pasos de billetera de la página Publicaciones |
| **Base** *(experimental)* | Prueba / anclaje | Una billetera del navegador como MetaMask o Coinbase Wallet, en Base | Cada ancla es una transacción que usted revisa y firma |

Un ancla en Steem es rápida y gratuita, pero la atestiguan los witnesses de
Steem en lugar de una prueba de trabajo: úsela junto con un ancla en
Bitcoin, no en su lugar. Consulte [Steem](11-EvidenceAndStorage.md#steem).

## Un recorrido típico

1. **Publique** su Mundo en el Editor (consulte
   [Publicar su creación](04-PublishingAndForking.md#publicar-su-creación)).
2. Haga clic en **Distribuir** en el aviso que aparece, o más tarde en
   **Mi Mundo compartido** en la Vista del mundo.
3. Elija un **Almacenamiento** y un **Sustrato de anuncio /
   descubrimiento**, por ejemplo IPFS y Nostr, o Arweave para ambos, y haga
   clic en **Distribuir**. Distribuye el Snapshot, luego la Declaración
   firmada, e informa de cada uno por separado. Si una mitad falla, vuelva a
   intentar solo esa mitad con su propio botón **Distribuir solo …**.
4. Si quiere, en la página **Publicaciones**, ancle la publicación (por
   ejemplo **Anclar en Arweave**) para registrar cuándo existía.
5. Haga clic en **Compartir…** o **Copiar enlace** debajo del resultado para
   dar a otros un enlace que abre su construcción en la Vista del mundo en
   cualquier dispositivo.

Para una construcción de más de los 256 KB de Arweave, elija IPFS. Los pares
con los que está conectado pueden seguir recuperando construcciones de hasta
64 MB directamente de usted.

## Comprobar que funcionó

- La tarjeta del Repositorio de su construcción indica dónde registró este
  dispositivo su distribución, por ejemplo **Guardado en IPFS · Anunciado en
  Nostr**, o **No hay ninguna distribución registrada en este
  dispositivo.** Consulte [Sus publicaciones](13-YourData.md#sus-publicaciones).
- **Descubrir Mundo compartido** en la Vista del mundo busca su Mundo
  compartido directamente en Arweave y Nostr y lo comprueba, respondiendo a
  «¿mi publicación está realmente ahí fuera, intacta?». Consulte
  [Descubrir Mundo compartido](03-WorldView.md#descubrir-mundo-compartido--buscar-directamente-en-redes-descentralizadas).
- En la página Publicaciones, **Verificar contenido de IPFS** vuelve a
  recuperar una subida a IPFS y la compara con su hash, y
  **Verificar evidencia** comprueba un ancla.

La distribución no se puede deshacer: una vez que algo se anuncia o se
guarda, otras personas quizá ya tengan una copia. **Retirar publicación**
quita un Mundo solo de su propio catálogo.
