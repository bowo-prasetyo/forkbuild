<!-- translation-of: docs/user/04-PublishingAndForking.md source-hash: 3716d8f23c114fbb -->
# 04 — Publicar y remezclar

<!-- languages -->
[English](../04-PublishingAndForking.md) · [Deutsch](../de/04-PublishingAndForking.md) · **Español** · [Français](../fr/04-PublishingAndForking.md) · [Bahasa Indonesia](../id/04-PublishingAndForking.md) · [日本語](../ja/04-PublishingAndForking.md) · [한국어](../ko/04-PublishingAndForking.md) · [Português (Brasil)](../pt-BR/04-PublishingAndForking.md)
<!-- /languages -->

Este es el corazón de ForkBuild. **Publicar** comparte su construcción con
el mundo. **Remezclar** permite que cualquiera haga su propia copia de una
construcción y la lleve más lejos, conservando todo su historial. (Los
documentos para desarrolladores llaman *fork* a una remezcla,
como en ForkBuild.)

## Publicar su construcción

1. Construya algo en el Editor.
2. Tenga un nombre y asegúrese de que esté desbloqueado (consulte
   [Su nombre y su identidad](05-IdentityAndLogin.md)). Publicar firma
   la construcción con él. Si todavía no tiene nombre, **Publicar** le pide
   elegir uno primero; **Publicar sin firmar** la publica ahí sin autor y
   sin enlace.
3. Póngale un título (Publicar rechaza una construcción sin título o vacía) y,
   si quiere, una descripción y una licencia: haga clic en **✎** junto al
   título de la construcción en la barra lateral para abrir **Propiedades de la
   construcción**. Una construcción nueva no tiene licencia; la primera vez que
   lo publique, ForkBuild le preguntará si otros pueden remezclarlo (vea
   [Dejar que otros la remezclen](#dejar-que-otros-la-remezclen)).
4. Presione **Guardar** para que quede guardado.
5. Haga clic en **Publicar**. La primera vez, ForkBuild también pregunta
   [¿Quién puede encontrarla?](#quién-puede-encontrarla)

Su construcción aparece ahora en **Explorar** en este dispositivo, donde puede
buscarla, abrirla y remezclarla, con su nombre como autor. Otras personas la
ven cuando comparte su enlace, o enseguida si eligió **Todos** en
[¿Quién puede encontrarla?](#quién-puede-encontrarla). También recibe un
lugar en el mundo compartido, junto a aquello con lo que va (consulte
[Dónde se alza una construcción](#dónde-se-alza-una-construcción)), así que **Explorar** siempre tiene adónde llevar a la
gente: consulte [Encontrar mundos](03-WorldView.md#encontrar-mundos).

### Entrar caminando

Junto al enlace, el aviso que muestra Publicar tiene **Entrar caminando**
(**Caminar alrededor** en una construcción sin puerta). Abre la Vista del
mundo con su avatar en el suelo frente a la puerta de la construcción,
mirándola; la puerta se abre al acercarse, y entrar (**W**, o el joystick en
un teléfono) marca el último paso de
[Su primera construcción](02-TheEditor.md#su-primera-construcción). La puerta
es la entrada principal: una puerta en una pared o torre maciza, sin sitio
donde pararse detrás, no cuenta, y a una construcción sin puerta se llega por
delante. La tarjeta **Su primera construcción** ofrece el mismo botón cuando
la construcción está publicada.

> **Nota:** Publicar guarda su construcción en este dispositivo. Su
> tarjeta en **Explorar** indica dónde registró este dispositivo su
> distribución (por ejemplo, **Guardado en IPFS · Anunciado en Nostr**), o
> **No hay ninguna distribución registrada en este dispositivo.** Mientras
> tanto, haga una copia de seguridad en [Sus datos](13-YourData.md) para
> conservar una copia.
> Hasta que elija a dónde van sus construcciones, publicar no envía nada a
> ningún lugar por sí solo. Un [enlace](#compartir-un-enlace) que usted copie lleva la
> construcción a quien se lo dé. Cuando elige una red (vea
> [A dónde va](#a-dónde-va--enviar-una-construcción-al-publicar)), cada Publicar envía también la construcción allí,
> para que otras personas la encuentren sin estar conectadas con usted.
> [**Compartir con pares**](#compartir-con-pares-conectados) se la ofrece a las personas con las que
> está conectado.

## Compartir un enlace

En cuanto **Publicar** se completa, el aviso del Editor también muestra
**Compartir…** (donde su dispositivo tiene un menú para compartir), **Copiar
enlace**, **Guardar imagen** e **Insertar**, con el enlace debajo. Los mismos botones
están en **Mi Mundo compartido** en la Vista de mundo.

- **La construcción viaja dentro del enlace.** No hace falta distribuir nada
  antes, y no interviene ninguna billetera ni cuenta: el enlace
  lleva su Mundo compartido firmado y la construcción misma. Quien lo abra,
  en cualquier dispositivo, llega a su construcción (vea
  [Lo que abre un enlace](#lo-que-abre-un-enlace)). ForkBuild comprueba la firma, y que la
  construcción coincida con ella, antes de mostrar nada; un enlace
  modificado o incompleto lo indica.
- **Muestra lo que es.** Pegado en una aplicación de chat, un correo o una
  publicación, el enlace muestra el título de su construcción, su nombre y
  una imagen de la construcción, dibujada por el servidor de enlaces de
  ForkBuild, que luego lleva a quien lo abra a ForkBuild. Un enlace
  modificado solo muestra “A shared build”.
- **Necesita una firma.** Publique con un nombre; una construcción
  publicada sin nombre (**Publicar sin firmar**) no recibe enlace.
- **Un enlace corto en cuanto se envía a todos.** Si la construcción se
  envió a **Todos** (vea [¿Quién puede encontrarla?](#quién-puede-encontrarla)),
  los botones ofrecen en su lugar un enlace corto, de unos 90 caracteres,
  que nombra la construcción en vez de llevarla: quien lo abre recibe la
  construcción de los relays públicos de Nostr a los que se envió, y se
  comprueba como un enlace. Cabe en cualquier chat, Discord y Telegram
  incluidos, y sirve para construcciones de hasta unos 2000 bloques. Las
  construcciones que se quedan en su enlace conservan el enlace largo,
  porque la construcción no está en ningún otro sitio. Un enlace corto
  funciona mientras algún relay guarde la construcción; si ninguno
  responde, la página lo dice y ofrece **Intentar de nuevo**.
- **Tamaño.** Cabe una construcción de hasta unos 500 bloques; el enlace del
  castillo listo para usar tiene unos 3.700 caracteres. El correo y la
  mayoría de las aplicaciones de chat y redes sociales conservan un enlace
  así de largo, pero Discord y Telegram limitan la longitud de un mensaje.
  Una construcción más grande indica que es demasiado grande para un
  enlace: distribúyala para obtener uno.
- **Una vez distribuida**, los botones ofrecen el enlace más corto que
  indica dónde está guardado el Mundo compartido, y que también lleva su
  colocación (consulte [Distribución](Distribution.md)). Un enlace que lleva
  su construcción no lleva su colocación, así que la Vista de mundo pone la
  construcción donde pone las que no tienen una.
- **Guardar imagen** descarga un PNG de 1200 × 630 de la construcción, con
  su título y “Haga su propia versión en ForkBuild” en la parte inferior,
  para publicar donde un enlace por sí solo no muestra ninguna imagen.
- **Hacer un video** graba un video corto de la construcción para que usted
  lo suba a YouTube, Shorts, TikTok o Reels: un **Time-lapse de la
  construcción**, en el que se levanta bloque a bloque desde el suelo, o un
  **Plato giratorio**, en el que da una vuelta, en **Horizontal (16:9)** o
  **Vertical (9:16)**. Su nombre va en la parte inferior, y termina con una
  tarjeta que dice quién la construyó, con todos los que la construyeron con
  usted, y dónde remezclarla. El video se hace en su dispositivo, durante lo
  que dura (medio minuto como mucho), y se guarda en sus descargas; no se sube
  nada. Después, **Copiar título** y **Copiar descripción** le dan el texto
  para pegar junto a él: quién la construyó, el enlace a su construcción, un
  enlace a ForkBuild y la licencia. Deje la pestaña al frente mientras graba;
  la grabación se pausa mientras está oculta.

Copiar o compartir un enlace, y abrir uno, se cuentan de forma anónima,
como la visita diaria; consulte
[Recuento diario de visitantes](13-YourData.md#recuento-diario-de-visitantes).

### Lo que abre un enlace

Un enlace a una construcción, tanto si la lleva dentro como si indica
dónde está guardada, abre la página propia de esa construcción:

- la construcción, girando despacio;
- su título y quién la hizo, y **Construida con …** y sus nombres cuando
  unos amigos la construyeron junto con su autor (consulte
  [Construir conmigo](02-TheEditor.md#construir-conmigo-construir-juntos-en-vivo)).
  El nombre del autor y el de cada coconstructor abren la página de esa
  persona: las construcciones que firmó su identidad y aquellas en las que
  otros le dan crédito;
- **Remezcla de “…” de …** cuando es una remezcla, y **Remezclada N veces**
  cuando este dispositivo ha encontrado remezclas de ella (vea
  [Recuentos de remezclas](#recuentos-de-remezclas));
- su **Árbol familiar**: las construcciones de las que se remezcló,
  hasta la original, y las remezclas hechas de ella y de esas, cada una
  como enlace cuando este dispositivo puede abrirla;
- **Editar una copia**, el botón grande: su propia copia se abre en el
  Editor, lista para cambiarla, sin necesidad de cuenta. Recuerda de dónde
  viene, así su autor conserva el reconocimiento, y **Volver al mundo** lo
  lleva al original;
- **Recorrerla en el Mundo**, para verla en la Vista de mundo.

Cuando la licencia permite copias, la página también ofrece **Descargarla
como modelo 3D** (glTF, STL para impresión 3D u OBJ; consulte
[Descargar un modelo 3D](02-TheEditor.md#descargar-un-modelo-3d)). Si la licencia de la construcción no permite
copias, la página lo dice y
solo ofrece recorrerla.

### Insertar una construcción en una página web

Una construcción cuyo enlace la lleva también se puede mostrar dentro de una
entrada de blog o una página web, donde los lectores la ven girar sin salir
de la página:

1. Debajo del enlace, elija **Insertar**. El código para pegar aparece
   debajo.
2. Elija **Copiar código para insertar** y péguelo donde la página acepte
   HTML o contenido insertado (un `<iframe>`).

En la página, la construcción gira despacio, y arrastrar hacia los lados la
gira a mano. Su título y quién la hizo aparecen abajo, junto a **Remezclar
en ForkBuild** (**Abrir en ForkBuild** cuando su licencia no permite
copias), que abre la página propia de la construcción en ForkBuild en una
pestaña nueva (consulte [Lo que abre un enlace](#lo-que-abre-un-enlace)).

- **La construcción viaja dentro del código**, como en su enlace: no hace
  falta distribuir nada, y la inserción comprueba la firma y la construcción
  antes de mostrarla.
- **Es discreta.** La inserción no inicia ninguna de las conexiones de
  ForkBuild y no guarda nada en el navegador del lector; consulte
  [Privacidad](Privacy.md).
- **Los sitios que insertan enlaces por sí mismos** (los que admiten
  oEmbed, como Notion y Ghost) pueden recibir en su lugar el enlace de
  **Copiar enlace**: piden la inserción al servidor de enlaces de ForkBuild.
- **Los sitios que eliminan el código `<iframe>`**, como la mayoría de las
  redes sociales, no pueden mostrarla; comparta allí el enlace o la imagen.

Copiar el código, y que una inserción se muestre o se abra en ForkBuild,
también se cuentan de forma anónima.

## ¿Quién puede encontrarla?

La primera vez que hace clic en **Publicar**, ForkBuild pregunta
**¿Quién puede encontrarla?**:

- **Todos**: cada construcción que publique también se envía a todos.
  Aparece en **Explorar**, en el reto de la semana y su plaza, y en el
  Mundo, para cualquiera que use ForkBuild, sin enlace, monedero ni cuenta
  por ninguna de las partes. Justo después de Publicar, el Editor dice
  «¡Publicada! Enviándola a todos…» y luego «¡Publicada! Ahora cualquiera
  puede encontrarla en Explorar, en el desafío y en el Mundo.». Si no se
  pudo llegar a las redes, lo dice y ofrece **Intentar de nuevo**; el
  enlace funciona de todos modos.
- **Solo quien reciba mi enlace**: la construcción se queda en este
  dispositivo y dentro de su enlace. El aviso dice «Solo quien reciba su
  enlace puede verla.» con **Que todos la encuentren**, que envía esta
  construcción y hace de **Todos** la elección a partir de entonces.

La respuesta se recuerda en este dispositivo. Después de que una
construcción se haya enviado a todos, **Desde ahora, solo por enlace** en el
mismo aviso deja sus próximas construcciones solo en sus enlaces.

Cómo funciona: la construcción, firmada por usted, se envía como *nota de
construcción* a los relays públicos de Nostr de **Configuración de red**,
junto con sus etiquetas y el lugar que ocupa en el Mundo. La nota se firma
con una clave que este dispositivo crea para ello (su *clave portadora*), no
con su identidad, así que no hace falta instalar nada. Quien encuentra la
nota la abre exactamente como abriría su enlace: primero se comprueban su
firma y el contenido de la construcción, y una nota que no coincide se
ignora. Una construcción demasiado grande para una nota (unos 2000
bloques) lo dice; comparta su enlace o elija a dónde va, más abajo. Las
construcciones publicadas sin nombre no se pueden enviar. Consulte
[Privacidad](Privacy.md).

### Dónde se alza una construcción

Una construcción publicada se alza en el Mundo compartido junto a aquello
con lo que va:

- **un remix** se alza junto a la construcción que remezcla, así que un
  árbol genealógico se convierte en una calle;
- **todo lo demás** se suma al pueblo que crece alrededor de la plaza del
  reto, anillo a anillo de dentro hacia fuera, empezando justo fuera de las
  construcciones ya hechas que rodean su plaza, así que las construcciones
  publicadas más o menos al mismo tiempo son vecinas, y las primeras se ven
  desde la plaza;
- **Construir aquí** sigue poniendo una construcción en el lugar que eligió,
  y volver a publicar una construcción nunca la mueve.

Todos los que encuentran la construcción la ven en el mismo lugar, porque su
sitio viaja con ella, firmado por usted.

## A dónde va — enviar una construcción al publicar

**Publicar** guarda su construcción en este dispositivo y en sus enlaces
hasta que usted elija a dónde va, salvo el envío a todos (arriba). Justo
después de Publicar, el aviso ofrece **Elegir a dónde va** (o **Más redes**,
si ya se envió a todos) junto al enlace, y **Descartar**.

**Elegir a dónde va** abre el diálogo **A dónde va**: elija un
**Almacenamiento** (dónde se guarda la construcción misma: Arweave, IPFS, o
Steem o Blurt cuando sus escritores están activados) y un **Sustrato de
anuncio / descubrimiento** (dónde se anuncia: Nostr, Arweave, Steem o
Blurt), y haga clic en **Enviar**. **Enviar aquí cada vez que publique**
empieza marcado: cuando un envío funciona con la casilla marcada, este
dispositivo guarda la elección, y **cada Publicar después de eso envía la
construcción allí por sí solo**. El aviso dice entonces «Enviándola a
Nostr…», después «Publicada y enviada a Nostr: ya cualquiera puede
encontrarla.» o, si un envío falla, qué salió mal, con **Intentar de nuevo**
y **Cambiar a dónde va**. Desmarque la casilla (en el diálogo, desde
**Cambiar a dónde va**) para dejar de hacerlo, y Publicar vuelve a guardar
las construcciones en este dispositivo. El anclaje remoto nunca se guarda,
porque su token dura solo la visita; elíjalo en el diálogo cada vez.

Solo una construcción firmada se envía por sí sola; **Publicar sin firmar**
no envía nada. La billetera o extensión de su navegador para esa red (una
billetera de Arweave como Wander, una extensión de Nostr como nos2x, Steem o
Blurt Keychain) le pide aprobar cada envío, y Arweave y Blurt cobran una
pequeña tarifa por cada uno. Sin ninguna, el envío termina con un simple
aviso «…no se pudo completar» y la construcción sigue publicada aquí.

El diálogo es el mismo que usa la Vista del mundo: sus ajustes
**Almacenamiento** y **Sustrato de anuncio / descubrimiento** y los botones
separados **Distribuir solo el Snapshot** / **Distribuir solo la
Declaración firmada** funcionan como se describe en
[Encuentros en el Mundo](WorldViewAdvancedTools.md#encuentros-en-el-mundo--publicaciones-y-avatares-que-comparten-sus-pares). Hay dos diferencias: siempre actúa sobre el
Mundo compartido exacto que acaba de producir su clic en Publicar, y el
**Snapshot** va primero, así que **Enviar** envía el Snapshot y luego la
Declaración firmada. Cerrar el diálogo (**Cerrar**, un clic fuera o Escape)
nunca pierde nada de lo que produjo.

El resultado de la Declaración firmada aparece en su propia sección:

| Campo | Significado |
|---|---|
| **Mundo compartido** | El id propio del Mundo compartido: confirma de qué Mundo compartido trata este resultado. |
| **Material** | La ubicación que produjo la subida, o “Aún no subido” si no se completó. |
| **Descubrimiento** | El id del anuncio, o “Aún no anunciado” si no se completó: una fila por relay cuando hay varios configurados. |
| **Su construcción** | Un botón **Explorar** que lleva directamente a la página de esta publicación en la Vista del mundo: aparece siempre que la publicación tenga adónde explorar, lo que en la práctica es siempre. |

**Construcciones grandes.** El almacenamiento en Arweave acepta un
Snapshot de hasta 256 KB, unos ocho mil bloques. Para algo más grande,
elija almacenamiento en IPFS (un nodo IPFS local o pinning remoto), que no
tiene límite de tamaño; si elige Arweave de todos modos, la sección
Snapshot indica qué tan grande es la construcción y le pide que elija IPFS,
y no se sube nada. Los pares con los que está conectado pueden obtener
construcciones de hasta 64 MB directamente de usted, sin necesidad de
almacenamiento.

El resultado propio del Snapshot (un **Hash del contenido**, un
**Localizador** y un id de **Anuncio**, o “Sin anuncio” para una ubicación
que funcionó sin anuncio) es totalmente aparte, ya que los Snapshots se
ubican y descubren independientemente de la distribución de la
Declaración firmada; consulte
[Snapshot local](09-PublicationsAndEvidence.md#snapshot-local) para saber
qué significa esa distinción.

Publicar de nuevo reemplaza todo el aviso por uno nuevo para la nueva
publicación; descartarlo, o salir de la página, lo borra. Ni el aviso ni el
resultado de ninguna sección se recuerdan en ningún lugar; solo a dónde van
sus construcciones.

## Compartir con pares conectados

Una construcción que publica aparece solo en *su* **Explorar**, hasta que
se envía a todos (consulte [¿Quién puede encontrarla?](#quién-puede-encontrarla))
o la distribuye en Nostr, Arweave, Steem o Blurt (consulte
[Distribución](Distribution.md)): entonces el **Explorar** de cualquiera la
encuentra (consulte
[Construcciones que otros distribuyeron](#construcciones-que-otros-distribuyeron)).
Para ponerla en el **Explorar** de alguien con quien está conectado
(consulte [Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md)),
haga clic en **Compartir con pares** debajo de ella en **Explorar**. El botón
solo aparece en sus propios Mundos publicados.

- Compartir ofrece el Mundo a todos los que están conectados en ese
  momento, y a cualquiera que se conecte después. **Compartido ✓ ·
  Compartir de nuevo** lo vuelve a anunciar a las personas conectadas
  ahora.
- Del lado de ellos, un Mundo compartido por uno de sus **Amigos** o
  **Pares conocidos** se agrega solo a su **Explorar**, junto con todo lo
  necesario para **Explorarlo**. Un Mundo compartido por cualquier otra
  persona espera en **Compartido con usted**, arriba en su **Explorar**,
  hasta que haga clic en **Recuperar**. El dispositivo de nadie descarga el
  Mundo de un desconocido sin que se lo pidan. Cada uno aparece con su
  título, para que puedan elegir; su dispositivo se asegura de que el Mundo
  que recuperan sea el que nombra ese título. Un Mundo que compartió antes
  de que se incluyeran los títulos aparece como "Un Mundo compartido por …"
  hasta que haga clic en **Compartir de nuevo**.
- El Mundo se obtiene solo de usted, y solo mientras esté conectado: si
  está desconectado, **Recuperar** espera hasta que vuelva, y un Amigo o
  Par conocido lo recibe en cuanto usted se vuelve a conectar. Su
  dispositivo comprueba que el Mundo esté firmado por usted antes de
  agregarlo, así que nadie puede hacer pasar una copia como suya.
- Como con cualquier publicación, compartir no se puede revertir para las
  personas que ya lo recibieron.

## Elegir una licencia

### Dejar que otros la remezclen

La primera vez que publica una construcción sin licencia, ForkBuild
pregunta **¿Dejar que otros la remezclen?** antes de publicar nada:

- **Sí, permitir remezclas** pone **CC BY 4.0**: cualquiera puede copiarla
  y cambiarla, siempre que le dé crédito, y cada remezcla muestra que viene
  de la suya.
- **No, solo dejar mirar** pone **Todos los derechos reservados**: se puede
  recorrer, pero no copiar.
- **Ahora no** no publica nada.

Su respuesta se guarda como la licencia de la construcción, así que solo se
le pregunta una vez; cámbiela cuando quiera en **Propiedades de la
construcción**. Una remezcla ya lleva la licencia de su original, así que
publicar una nunca pregunta.

### Todas las licencias

Una construcción publicada siempre se muestra con una licencia, elegida en el
diálogo **Propiedades de la construcción**:

| Licencia | Significado |
|---|---|
| **CC0 1.0 — Dominio público** | Sin derechos reservados: cualquiera puede hacer cualquier cosa con ella |
| **CC BY 4.0 — Atribución** | Cualquiera puede remezclarla y reutilizarla, dándole crédito a usted |
| **CC BY-SA 4.0 — Atribución, Compartir igual** | Las remezclas deben llevar la misma licencia |
| **CC BY-NC 4.0 — Atribución, No comercial** | Se permite remezclar, no el uso comercial |
| **CC BY-ND 4.0 — Atribución, Sin derivadas** | Se puede ver, pero **no se permite remezclar** |
| **Todos los derechos reservados** | Se puede ver, pero no se permite remezclar |
| **Sin licencia especificada** | No se permite remezclar hasta que elija una |

Si deja una construcción sin licencia, la gente igual puede abrirla y
explorarla; solo que no puede remezclarla hasta que elija una licencia que
lo permita.

## Elegir quién puede colocarlo

Normalmente, otras personas pueden colocar su construcción publicada en sus
propios Mundos. Eso agrega una colocación de su construcción, nunca una
copia, y nunca mueve ni cambia la suya (consulte
[¿Por qué puedo colocar construcciones de otras personas?](WorldViewAdvancedTools.md#por-qué-puedo-colocar-construcciones-de-otras-personas)).
Remezclar es aparte y lo rige la licencia (consulte
[Colocar o remezclar](WorldViewAdvancedTools.md#colocar-o-remezclar)).
Si prefiere que no la coloquen, abra **Propiedades de la construcción** y
configure **Quién puede colocarlo en el Mundo**:

| Opción | Significado |
|---|---|
| **Cualquiera puede colocarlo** | La predeterminada. Cualquiera puede colocarlo donde quiera en su propio Mundo |
| **Solo yo puedo colocarlo** | Solo usted puede colocarlo. Otras personas igual pueden encontrarlo, verlo y (si la licencia lo permite) remezclarlo, pero ForkBuild no les deja colocarlo |

La opción se firma como parte de la publicación al publicar, así que nadie
puede quitarla ni cambiarla después. Eso también significa que solo se
aplica a lo que publique después de elegirla. Una publicación que ya está
disponible conserva la opción con la que se publicó, así que vuelva a
publicar si quiere que se aplique la nueva.

Funciona igual que el permiso de remezclar de la licencia: todas las copias
de ForkBuild lo respetan, pero no es un candado. Alguien que modificara el
código de la app podría ignorarlo, y no puede deshacer una colocación que
alguien hizo antes de que usted lo eligiera.

En cualquier caso, otras personas ven su construcción donde *usted* la
puso en cuanto envía su Snapshot, como hace Publicar cuando ya eligió a
dónde van sus construcciones, o con **Distribuir** en la Vista del mundo: el
anuncio lleva su colocación firmada, y su ForkBuild muestra la construcción
allí en cuanto conoce su Mundo compartido. Muévala y distribúyala de nuevo, y
también se mueve para ellos.

## Editar una construcción publicada

Una construcción publicada es **inmutable**: nunca puede cambiar después. Para
construir sobre una, **bifúrquela** (abajo) o use **Editar una copia** en
la Vista del mundo. En la Vista del mundo, hacer su primer cambio en un
mundo publicado (sus metadatos, el nombre de un hito o una región, o una
decoración con un animal) crea automáticamente su propia copia, titulada
*“Remezcla de &lt;nombre original&gt;”*, con una breve confirmación
(“Se creó su propia copia editable; “…” no cambia”); consulte
[Guardar y publicar también aquí](03-WorldView.md#guardar-y-publicar-también-aquí).

El original nunca se toca, por mucho que cambie su copia.

## Explorar

**Explorar**, en la barra superior (llamado *Repositorio* en versiones
anteriores), es el catálogo, con búsqueda,
de todas las construcciones publicadas que conoce este dispositivo: las suyas, las que le compartieron
sus pares y las que se encontraron en redes descentralizadas. Está hecho
para seguir siendo útil tanto si tiene diez construcciones como diez mil.

### Construcciones ya hechas

Arriba, **Empiece con una construcción ya hecha** muestra las
construcciones que vienen con ForkBuild: un castillo, una isla del puerto,
una plaza del pueblo, una casa, un molino y un puente. Están ahí incluso
antes de que se publique o se encuentre algo. Haga clic en una
(**Remezclar**) para abrir su propia copia en el Editor; nada se publica
hasta que usted lo publique. Haga clic en el título para plegar la fila.

Debajo, **Cómo crecen las remezclas** muestra tres familias de ejemplo
que vienen con ForkBuild, cada una una cadena de remezclas de una
construcción ya hecha: la Casa, remezclada en Casa con porche, que se
remezcló dos veces más (Casa con jardín y Casa con torre); la Atalaya,
remezclada en Faro y luego en Faro y casa del farero; y el Molino,
remezclado en Molino y granero y luego en Granja. Cada una es la anterior
con algo más, como lo sería una remezcla suya. Haga clic en un nombre para
abrir su propia copia. Son ejemplos de la aplicación, nunca publicaciones de
nadie; también están en **Estructuras** de la Biblioteca de construcción,
en *colección*.

### Construcciones que otros distribuyeron

Cada vez que abre **Explorar** (o la página de un autor), busca en Nostr,
Arweave, Steem y Blurt construcciones que otras personas distribuyeron allí, y agrega
las que puede verificar. Una línea encima de la lista dice lo que está
haciendo y luego cuántas construcciones nuevas encontró; **Volver a buscar**
busca una vez más.

- Solo se agrega una construcción cuyo registro firmado se verifica: firmado
  por la clave que nombra y exactamente la construcción que se anunció.
  Cualquier otra cosa se omite, y un registro que falló no se vuelve a
  obtener.
- Verifica hasta 20 construcciones nuevas a la vez. Si hay más, la línea dice
  cuántas quedan para la próxima vez.
- Una construcción encontrada así permanece en su **Explorar** después de
  recargar.
- Su compilación todavía no está en su dispositivo. **Explorar** la obtiene
  de donde se almacenó y la verifica, y luego la abre en la Vista del
  mundo, igual que al abrir un enlace compartido.

```
Buscar [________________]  ☐ Incluir descripciones  [Buscar]

Ordenar: [Publicados recientemente ▾]   Agrupar: [Ninguno ▾]   [Tarjetas] [Lista]

1.248 publicaciones

┌─────────────────────────────────────────┐
│  [vista]    Ciudad antigua               │
│             Una reconstrucción de una    │
│             ciudad romana que muestra…   │
│             🔒 Publicado  de alicia      │
│             16/8/2026 · CC BY 4.0        │
│             [Abrir] [Bifurcar] [Explorar]│
└─────────────────────────────────────────┘

        [← Anterior]  1 2 3 4 5 … 125  [Siguiente →]
```

- **Buscar** mira el título y el autor de forma predeterminada. Marque
  **Incluir descripciones** para buscar también dentro de las
  descripciones; puede tardar un poco más, ya que tiene que leer más de lo
  que normalmente necesita la lista.
- **Ordenar** ofrece cinco órdenes: Publicados recientemente, Publicados
  hace más tiempo, Título A–Z, Título Z–A y Autor A–Z.
- **Agrupar** reúne los resultados de la página actual por Autor, Fecha o
  Licencia; es solo para explorar: no cambia lo que se encuentra ni
  cuántas páginas hay.
- **Tarjetas** es lo mejor para explorar visualmente; **Lista** es una
  tabla compacta: cámbiese a ella cuando esté revisando muchos resultados
  rápidamente.
- La paginación es explícita, página por página, en lugar de un
  desplazamiento infinito: así “la página 5” siempre significa lo mismo si
  vuelve a ella más tarde.

Cada construcción ofrece tres acciones:

| Botón | Qué hace |
|---|---|
| **Abrir** | Carga esa construcción en el Editor |
| **Remezclar** | Lo copia en una construcción editable propia |
| **Explorar** | Vuela hasta él en la Vista del mundo |

(El botón **Seguir explorando** de **Mis mundos** (consulte
[Mis mundos](03-WorldView.md#mis-mundos--los-mundos-que-realmente-visitó))
hace lo mismo que **Explorar** aquí, solo que redactado para un Mundo que
ya visitó en lugar de uno que encuentra por primera vez).

Haga clic en el **nombre de cualquier autor** para visitar su **Vista del
autor**: un portafolio de todo lo que hizo, incluidos sus originales y
todas las remezclas que surgieron de ellos, con exactamente el mismo
catálogo de búsqueda, orden y paginación que **Explorar**, solo que
limitado a ese autor.

Una tarjeta cuya firma pasa la comprobación también tiene un botón
**Seguir**, y una Vista del autor muestra **Firmado por …** con **Seguir**
para cada identidad que publicó con ese nombre. Seguir a alguien pone su
trabajo nuevo en su página **Siguiendo** y en sus notificaciones; consulte
[Seguir a personas](07-PeerConnectionsAndFriends.md#seguir-a-personas).

**Explorar** tampoco se limita a lo que se publicó desde este dispositivo
o se descubrió directamente: una construcción descentralizada que un par le mostró en el mapa de
[Encuentros en el Mundo](WorldViewAdvancedTools.md#encuentros-en-el-mundo--publicaciones-y-avatares-que-comparten-sus-pares)
de la Vista del mundo, una vez que su contenido realmente se resuelve,
también se suma a esta misma búsqueda y a la Vista del autor de su autor, y
sigue allí después de recargar. No se muestra de ninguna forma distinta de
todo lo demás.

## Remezclar: hágalo suyo

**Remezclar** es lo que hace especial a ForkBuild. Cuando remezcla una
construcción:

- Obtiene una **copia completamente nueva e independiente** para editar
  libremente.
- El **original no se toca**: sus cambios nunca lo afectan.
- La copia **recuerda de dónde vino**, así que el crédito nunca se pierde.

Funciona igual que bifurcar un proyecto en Git: usted se separa, hace lo
suyo, y el árbol genealógico lleva la cuenta de todos. (En la Vista del
mundo también ocurre automáticamente en el momento en que cambia un mundo
publicado: consulte
[Editar una construcción publicada](#editar-una-construcción-publicada) arriba).

> **En la Vista del mundo también se llama “Editar una copia”.** Es la
> misma operación de fondo en ambos casos, con las mismas reglas de
> licencia y el mismo manejo de
> [No se puede hacer una copia](#cuando-una-remezcla-no-se-puede-completar).
> Consulte
> [Editar una copia](03-WorldView.md#editar-una-copia--llevar-algo-al-editor)
> para ver cómo funciona en la Vista del mundo.

### Cómo remezclar

1. Encuentre una construcción en **Explorar** (o en la Vista del mundo).
2. Haga clic en **Remezclar**.
3. La copia se abre en el Editor, titulada *“Remezcla de &lt;nombre
   original&gt;”*.
4. Construya sobre ella y luego guárdela y publíquela como propia.

Su remezcla publicada aparece con una nota **Remezcla de “…” de …**,
que la vincula con el original.

### Recuentos de remezclas

La página de una construcción y su tarjeta en **Explorar** dicen cuántas
veces se remezcló (**Remezclada 3 veces**): cuántas construcciones
distintas, remezcladas de ella y publicadas, ha encontrado este
dispositivo. Una remezcla publicada dos veces cuenta una vez, y una
construcción que nadie ha remezclado no muestra nada. El recuento es solo
lo que este dispositivo conoce, así que otro dispositivo puede mostrar un
número distinto, y nunca decide qué se muestra primero.

Cuando este dispositivo encuentra la remezcla de otra persona de una de
sus construcciones, su 🔔 recibe una entrada **… remezcló su
construcción**, una vez por remezcla (y su dispositivo también la muestra,
si activó [Notificaciones en este dispositivo](03-WorldView.md#notificaciones-en-este-dispositivo)).

### Cuando una remezcla no se puede completar

A veces una remezcla no puede completarse; la mayoría de las veces al
remezclar un Mundo compartido encontrado mediante un par o una red
descentralizada (consulte
[Publicaciones y evidencia externa](09-PublicationsAndEvidence.md)) en
lugar de una construcción común de **Explorar**. En lugar de dejarlo en
una construcción del Editor vacío y sin relación, ForkBuild muestra un diálogo
**No se puede hacer una copia** que indica exactamente qué salió mal:

- **La licencia de esta construcción no permite copias.** Consulte
  [Elegir una licencia](#elegir-una-licencia) arriba.
- **Ahora mismo no se puede obtener esta construcción.** La licencia
  permite copias, pero la construcción en sí todavía no está en este
  dispositivo (ni se puede alcanzar mediante un par conectado).

En ambos casos, el único botón del diálogo, **Volver a la construcción**,
lo lleva de vuelta a donde lo encontró (el Mundo en el que estaba colocado,
o el Mundo compartido en sí), en lugar de dejarlo varado en el Editor sin
nada sobre lo que construir.

## El desafío de construcción semanal

Cada semana ForkBuild propone un tema para construir (un faro, un puente,
una casa diminuta, …), de lunes al final del domingo (UTC). Inicio lo
muestra, y **Desafío** en la barra de arriba abre su página.

Hay 26 temas, así que pasa medio año antes de que uno se repita, cada uno con ideas para empezar y un giro que hace distintas las
participaciones de la semana, como *«Hágalo lo bastante ancho para que pase
el carro de heno.»* Una de cada cuatro semanas es una semana de remezcla
(vea más abajo).

1. **Unirse al desafío** abre en el Editor un terreno vacío propio, con el
   nombre del tema y ya con la etiqueta de la semana (por ejemplo
   `#lighthouse-20261012`: el tema y el lunes en que empezó), y las
   estructuras de la semana fijadas arriba en **Estructuras** de la
   Biblioteca de construcción. El desafío también es la primera opción de
   **Nuevo** en el Editor, y las **Ideas para empezar** de la página abren
   en cambio una de esas construcciones como su propia copia.
2. Constrúyalo a su manera: agregue una idea si quiere y hágala suya.
   Construya lo que construya, participa mientras conserve la etiqueta de
   la semana (añádala en **Propiedades de la construcción → Etiquetas** si
   empezó de otra forma).
3. Publíquela antes de que acabe la semana y comparta su enlace. El texto
   del enlace nombra el desafío y su etiqueta, listo para una publicación.

**Semanas de remezcla.** Una de cada cuatro semanas, empezando por la del
2 de noviembre de 2026, es una semana de remezcla (`#remix-20261102`): en
lugar de un tema, una participación empieza como su propia copia de una de
las participaciones de la semana anterior. **Unirse** lleva a la página del
desafío, que muestra las participaciones de la semana pasada; **Remezclar**
en una abre su copia en el Editor, con la etiqueta de la semana. Su copia
recuerda de quién era, así su autor aparece en el árbol familiar. Si la
semana pasada no tuvo participaciones, se ofrecen en cambio las familias
de remezclas de ejemplo.

La página del desafío muestra las participaciones que este dispositivo
conoce: sus propias construcciones publicadas con la etiqueta y las de
otras personas encontradas en las redes. Cuando una construcción se distribuye en Nostr, Arweave, Steem o Blurt, su anuncio (en Blurt, su publicación) enumera sus etiquetas, y la
página pregunta a esas redes por la etiqueta de la semana cada vez que se
abre (**Volver a buscar** vuelve a preguntar). Cada participación
encontrada se comprueba como todo lo que encuentra **Explorar**, y
aparece también en **Explorar**. Una construcción compartida solo por su enlace no se encuentra así, ni una anunciada solo en Steem antes del 8 de octubre de 2026, cuando los anuncios en Steem empezaron a incluir etiquetas. Las
semanas anteriores siguen disponibles por su lunes (**La semana pasada:
…**), sin **Unirse**.

Las participaciones se muestran de la más reciente a la más antigua, con
sus recuentos de remezclas. Nadie las juzga y nada se clasifica: el
desafío es un motivo para construir algo esta semana y ver qué hicieron
otras personas con la misma idea.

Cuando hay participaciones remezcladas unas de otras, o de otras
construcciones, **Árboles familiares** bajo las participaciones muestra de
dónde vienen, un árbol por cada cadena de remezclas.
Una semana sin entradas todavía muestra en su lugar las familias de ejemplo (vea [Construcciones ya hechas](#construcciones-ya-hechas)).

### La plaza del reto

**Pasear**, en el menú principal, te lleva a la plaza de esta semana, y
también **Recorrer la plaza** en la página del reto en cuanto una semana
tiene participaciones. Es la plaza del pueblo del mundo compartido: las seis
construcciones ya hechas se alzan a su alrededor para todos, siempre, cada
una con **Remezclar**, y el pueblo de construcciones publicadas crece justo
fuera de ellas, con las participaciones de la semana entre ellas. Pasea entre ellas o elige una en el panel: **Navegar** vuela hasta
ella, **Abrir** la abre como lo haría **Explorar**, y **Editar una copia**
empieza tu propia copia.

- Cada participación se alza en el pueblo. Una cuyo lugar sabe este
  dispositivo que está en el pueblo se alza allí, donde se asentó al
  publicarse. Cualquier otra (una colocada lejos, como las construcciones
  publicadas antes de que se asentaran en el pueblo, o una cuyo lugar este
  dispositivo no conoce) se muestra, mientras estás en la plaza, en el lugar
  donde se asentaría en el pueblo; su propio lugar sigue donde está.
- El panel enumera las primeras 24 participaciones publicadas. El resto
  está en la página del reto.
- Las participaciones encontradas en las redes se obtienen y comprueban
  como al abrir su enlace. Si una no se puede obtener, se deja fuera, y el
  panel dice cuántas fueron.
- Una participación cuyo autor eligió **Solo yo puedo colocarlo** no se
  alza en la plaza, porque ponerla allí sería colocarla. Sigue en la página
  del reto.
- Una participación mostrada en su lugar es una pieza expuesta, no una
  colocación: no se firma ni se guarda nada para nadie, y desaparece al
  salir. Como el resto de la
  vista del mundo, la plaza muestra lo que conoce este dispositivo, así que
  dos visitantes pueden ver conjuntos distintos.

## El árbol genealógico

Como cada remezcla registra a su antecesor, ForkBuild puede dibujar todo
el linaje de una construcción. En una **Vista del autor**, verá un **árbol de
remezclas**:

```
Casa medieval (original)
└─ Remezcla de Casa medieval (de Beto)
   └─ Remezcla de Remezcla de… (de Carola)
```

Esto significa que una gran construcción puede inspirar todo un ecosistema de
variaciones, y que todos en la cadena reciben crédito.

La página propia de una construcción, abierta desde un enlace compartido,
muestra el mismo linaje como **Árbol familiar**: de qué se remezcló, hasta
la original, luego la construcción misma y después las remezclas hechas de
ella, hasta donde sabe este dispositivo. La página del desafío muestra uno
por cada cadena de participaciones. Cada construcción del árbol nombra a su
autor y a los amigos que la construyeron con él; su título abre la
construcción, y cada nombre abre la página de esa persona.

## Un ciclo creativo típico

Este es todo el recorrido en un solo flujo:

1. **Construya** algo en el Editor.
2. **Guárdelo**.
3. **Publíquelo**, y envíelo a todos o comparta su enlace.
4. Alguien lo **encuentra** (buscando, explorando cerca en la Vista del
   mundo o recorriendo su página de autor) y lo **remezcla**.
5. Esa persona **publica** su remezcla.
6. Otras personas **exploran** ambas en la Vista del mundo, y el árbol
   crece.

Ese es el ecosistema de construcción abierta para el que se hizo
ForkBuild.

## ¿Y ahora qué?

Tenga a mano la [Referencia de controles](ControlsReference.md) mientras
construye, o vuelva a explorar la [Vista del mundo](03-WorldView.md) con
más detalle.
