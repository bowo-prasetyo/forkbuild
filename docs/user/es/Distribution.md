<!-- translation-of: docs/user/Distribution.md source-hash: f97c16f677fc5882 -->
# Distribuir su trabajo

<!-- languages -->
[English](../Distribution.md) · [Deutsch](../de/Distribution.md) · **Español** · [Français](../fr/Distribution.md) · [Bahasa Indonesia](../id/Distribution.md) · [日本語](../ja/Distribution.md) · [한국어](../ko/Distribution.md) · [Português (Brasil)](../pt-BR/Distribution.md)
<!-- /languages -->

Todo lo que hace en ForkBuild empieza en su propio dispositivo.
**Distribuir** lo lleva a redes descentralizadas, para que personas que no
están conectadas con usted puedan encontrarlo, obtenerlo y comprobar que es
suyo. Es opcional, y es distinto de publicar.

Esta página muestra qué puede distribuir, adónde puede ir y qué necesita.
Cada sección enlaza con la guía que tiene los detalles.

## Publicar, compartir, distribuir: tres cosas distintas

| Acción | Adónde va | Quién lo recibe | Guía |
|---|---|---|---|
| **Publicar** | Este dispositivo y, cuando haya elegido a dónde van sus construcciones, también allí | Nadie más hasta entonces; después, cualquiera | [Publicar su construcción](04-PublishingAndForking.md#publicar-su-construcción), [A dónde va](04-PublishingAndForking.md#a-dónde-va--enviar-una-construcción-al-publicar) |
| **Compartir con pares** | Directamente a las personas con las que está conectado | Sus pares conectados, mientras usted esté en línea | [Compartir con pares conectados](04-PublishingAndForking.md#compartir-con-pares-conectados) |
| **Distribuir** | Redes descentralizadas (IPFS, Arweave, Nostr, Steem, Blurt) | Cualquiera, sin necesidad de estar conectado con usted | Esta página |

Publicar no envía nada a ninguna parte por sí solo hasta que usted elige
adónde van sus construcciones. Lo elige en **A dónde va**, en el Editor: con
**Enviar aquí cada vez que publique** marcado, cada vez que publica una
construcción firmada también se distribuye allí. Desmarque la casilla para
dejar de hacerlo.

Compartir con pares no es distribuir. Los pares guardan una copia solo
mientras quieran, y nadie más puede encontrarla.

## Los tres papeles que puede cumplir una red

Distribuir usa hasta tres tipos de red, cada uno elegido por separado:

| Papel | Como… | Qué hace | Opciones |
|---|---|---|---|
| **Contenido** (almacenamiento) | El lugar donde se guardan los ejemplares impresos | Guarda los bytes, como los bloques de su Mundo, para que otros puedan recuperarlos | **Arweave**, **Blurt** *(experimental)*, **IPFS (Local Kubo)**, **IPFS (Remote Pinning)**, **Steem** *(experimental)* |
| **Anuncio / descubrimiento** | Una ficha del catálogo de una biblioteca | Publica un pequeño aviso firmado que dice que su trabajo existe y dónde está su copia, para que otros puedan encontrarlo | **Nostr**, **Arweave**, **Steem** *(experimental)*, **Blurt** *(experimental)* |
| **Prueba / anclaje** *(experimental, opcional)* | El sello de un notario | Escribe el hash de su contenido en una cadena de bloques, como evidencia de que existía en ese momento. No guarda ni anuncia nada. | **Bitcoin**, **Arweave**, **Base**, **Steem**, **Blurt** |

Necesita los dos primeros juntos. Un trabajo guardado sin anunciar es
difícil de encontrar, y un anuncio sin nada guardado no apunta a nada.
**Distribuir** hace ambas cosas con un solo clic. Anclar es un extra, y se
hace por separado en la página **Registros firmados**.

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
| **La Declaración firmada de su Mundo** (el registro firmado de un Mundo publicado, llamado Mundo compartido) | Arweave, IPFS, Steem o Blurt | Nostr, Arweave, Steem o Blurt | — | **Distribuir** después de publicar en el Editor; **Mi Mundo compartido** en la Vista del mundo; la página **Registros firmados** |
| **El Snapshot de su Mundo** (sus bloques), con el lugar donde lo colocó | Arweave, IPFS, Steem o Blurt | Nostr, Arweave, Steem o Blurt | — | Los mismos diálogos de **Distribuir** (**Distribuir solo el Snapshot** para solo esta mitad) |
| **El hash del contenido de cualquier registro** (un Mundo, una declaración de autoría o un nombre de lugar) | — | — | Bitcoin, Arweave, Base, Steem o Blurt | La tarjeta del registro en la página **Registros firmados** |
| **La autoría de una estructura** (Atribución de plano) | Arweave, IPFS, Steem o Blurt | Nostr, Arweave, Steem o Blurt | — | **Distribuir** en el panel **Información** de la estructura, que se ofrece en cuanto usa **Publicar en la red**; la página **Registros firmados** |
| **Un nombre de lugar** (Declaración de nombre de lugar) | Arweave, IPFS, Steem o Blurt | Nostr, Arweave, Steem o Blurt | — | **Distribuir** en el panel de nombres de la Vista del mundo, que se ofrece en cuanto usa **Publicar un nombre** (anuncia el nombre en la red que elija); la página **Registros firmados** para cualquiera de estas opciones |
| **Un comentario** sobre una publicación | — | Nostr, Arweave, Steem o Blurt, o ninguna (**Solo local y pares**) | — | **Publicar comentario**, en Explorar o en la Vista del mundo, en la red elegida junto al botón; más tarde, **Distribuir** bajo su propio comentario |

El Snapshot de un Mundo lleva consigo su ubicación firmada, así que quienes
lo recuperan ven la construcción exactamente donde usted la puso.

### Declaración firmada y Snapshot: dos mitades de un mismo Mundo

Un Mundo publicado se distribuye en dos piezas separadas:

| | Declaración firmada | Snapshot |
|---|---|---|
| **Como…** | Una ficha de catálogo notariada | El ejemplar impreso en la estantería, etiquetado con el lugar donde está |
| **Qué contiene** | El título del Mundo, usted como autor, su licencia, el Mundo del que se remezcló (si lo hay) y su **hash del contenido**, una huella de los bloques, todo firmado con su identidad | Cada bloque del Mundo, más su ubicación firmada: dónde lo puso en la Vista del mundo |
| **Tamaño** | Unos pocos kilobytes | Tan grande como la construcción: hasta 256 KB en Arweave, sin límite en IPFS |
| **Qué demuestra** | Que usted publicó este Mundo, con exactamente esta huella | Nada por sí solo; quien lo recupera comprueba los bloques contra el hash del contenido |
| **Para qué sirve** | Los enlaces para compartir, y **Descubrir Mundo compartido**, que busca su Mundo y lo comprueba | Mostrar su construcción en la Vista del mundo, donde la colocó, a quienes caminan cerca |

El hash del contenido une las dos: quien tenga los bloques puede comprobar
que coinciden con la huella de su registro firmado.

Las dos mitades usan los dos papeles: cada una se guarda en la red de
Contenido que elija y se anuncia en la red de Anuncio / descubrimiento que
elija. Con IPFS y Nostr, por ejemplo, **Distribuir** guarda el Snapshot en
IPFS y lo anuncia en Nostr, y luego guarda la Declaración firmada en IPFS y
también la anuncia en Nostr.

Cada mitad es útil por sí sola, por eso los diálogos de **Distribuir**
informan de cada una por separado y le permiten reintentar una con
**Distribuir solo el Snapshot** o **Distribuir solo la Declaración
firmada**:

- **Solo el Snapshot:** su construcción aparece en la Vista del mundo para
  quienes están cerca, pero ningún registro firmado de la publicación la
  respalda.
- **Solo la Declaración firmada:** se puede encontrar su Mundo y confirmar
  que es suyo, pero no recuperar sus bloques de las redes. Los pares con los
  que está conectado aún pueden obtenerlos directamente de usted mientras
  esté en línea.

Detalles:

- Declaración firmada y Snapshot:
  [A dónde va](04-PublishingAndForking.md#a-dónde-va--enviar-una-construcción-al-publicar),
  [Mi Mundo compartido](WorldViewAdvancedTools.md#mi-mundo-compartido--distribuir-su-propio-snapshot-sin-necesidad-de-pares)
  y el propio [diálogo Distribuir](WorldViewAdvancedTools.md#encuentros-en-el-mundo--publicaciones-y-avatares-que-comparten-sus-pares).
- La página Registros firmados:
  [Distribuir desde la página Registros firmados](09-PublicationsAndEvidence.md#distribuir-desde-la-página-registros-firmados),
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
| **IPFS (Remote Pinning)** *(experimental)* | Contenido | Una cuenta en un servicio de pinning compatible con Pinata | Sin límite de tamaño. Configure el servicio una vez en [Proveedor de contenido](10-NetworkSettings.md#proveedor-de-contenido); el token se pide una vez por visita y nunca se guarda. |
| **Steem** *(experimental)* | Contenido, anuncio / descubrimiento, prueba / anclaje | La extensión Steem Keychain con su clave de publicación, y su cuenta en [Configuración de red → Steem](10-NetworkSettings.md#steem) | Las publicaciones son respuestas a los hilos mensuales de ForkBuild; una aprobación por publicación. Guarda unos 2.500 bloques por publicación, hasta unos 30.000 bloques en 20 publicaciones. Usa Resource Credits, que se recargan. |
| **Blurt** *(experimental)* | Contenido, anuncio / descubrimiento, prueba / anclaje | La extensión Blurt Keychain (o WhaleVault) con su clave de publicación, y su cuenta en [Configuración de red → Blurt](10-NetworkSettings.md#blurt) | Una publicación principal desde su propia cuenta por construcción, que conserva su pago; los datos guardados van en respuestas debajo de ella. Guarda unos 2.500 bloques por respuesta, hasta unos 30.000 bloques. Cada transacción cuesta una pequeña comisión en BLURT. |
| **Bitcoin** *(experimental)* | Prueba / anclaje | La extensión UniSat, con bitcoin en una dirección SegWit nativa (`bc1q…`) para la comisión | Se hace con los pasos de billetera de la página Registros firmados |
| **Base** *(experimental)* | Prueba / anclaje | Una billetera del navegador como MetaMask o Coinbase Wallet, en Base | Cada ancla es una transacción que usted revisa y firma |

Un ancla en Steem es rápida y gratuita, pero la atestiguan los witnesses de
Steem en lugar de una prueba de trabajo: úsela junto con un ancla en
Bitcoin, no en su lugar. Consulte [Steem](11-EvidenceAndStorage.md#steem). Lo mismo vale para
un ancla en Blurt, que no cuesta nada cuando la publicación de su construcción
en Blurt ya lleva su hash de contenido; consulte [Blurt](11-EvidenceAndStorage.md#blurt).

## Un recorrido típico

1. **Publique** su Mundo en el Editor (consulte
   [Publicar su construcción](04-PublishingAndForking.md#publicar-su-construcción)).
2. Haga clic en **Distribuir** en el aviso que aparece. También puede
   hacerlo después, en **Mi Mundo compartido** dentro de la Vista del mundo.
3. Elija un **Almacenamiento** y un **Sustrato de anuncio /
   descubrimiento**: por ejemplo IPFS y Nostr, o Arweave para ambos. Haga
   clic en **Distribuir**.
4. Envía el Snapshot, luego la Declaración firmada, y muestra un resultado
   para cada uno. Si una mitad falla, reintente solo esa con su propio
   botón **Distribuir solo …**.
5. *Opcional:* en la página **Registros firmados**, ancle el registro (por
   ejemplo con **Anclar en Arweave**) para dejar constancia de cuándo
   existía.
6. Haga clic en **Compartir…** o **Copiar enlace** bajo el resultado. El
   enlace abre su construcción en cualquier dispositivo, lista para
   remezclarla o recorrerla.

Una construcción demasiado grande para Arweave (más de 256 KB) puede ir a
IPFS. Los pares con los que está conectado pueden obtener construcciones de
hasta 64 MB directamente de usted.

## Comprobar que funcionó

- **En su propia tarjeta.** La tarjeta de su construcción en **Explorar**
  indica dónde registró este dispositivo la distribución: por ejemplo
  **Guardado en IPFS · Anunciado en Nostr**, o **No hay ninguna
  distribución registrada en este dispositivo.** Consulte
  [Sus publicaciones](13-YourData.md#sus-publicaciones).
- **Para otras personas.** Su **Explorar** encuentra su construcción en
  Nostr, Arweave, Steem o Blurt la próxima vez que lo abren, siempre que se
  haya anunciado con la etiqueta de descubrimiento habitual,
  `forkbuild-publication`. Consulte
  [Construcciones que otros distribuyeron](04-PublishingAndForking.md#construcciones-que-otros-distribuyeron).
- **Directamente en las redes.** **Descubrir Mundo compartido**, en la
  Vista del mundo, busca su Mundo en Arweave y Nostr y lo comprueba: ¿de
  verdad está allá afuera, intacto? Consulte
  [Descubrir Mundo compartido](WorldViewAdvancedTools.md#descubrir-mundo-compartido--buscar-directamente-en-redes-descentralizadas).
- **En la página Registros firmados.** **Verificar contenido de IPFS** recupera
  algo subido a IPFS y lo compara con su hash. **Verificar evidencia**
  comprueba un anclaje.

Distribuir no se puede deshacer: en cuanto algo se guarda o se anuncia,
otras personas pueden tener ya una copia. **Retirar publicación** solo
quita un Mundo de su propio catálogo. Este dispositivo recuerda entonces no
volver a listar las copias que distribuyó cuando Explorar busca en las
redes.
