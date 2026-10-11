<!-- translation-of: docs/user/04-PublishingAndForking.md source-hash: c03b4c493f0a5c98 -->
# 04 — Publicar y bifurcar

<!-- languages -->
[English](../04-PublishingAndForking.md) · [Deutsch](../de/04-PublishingAndForking.md) · **Español** · [Français](../fr/04-PublishingAndForking.md) · [Bahasa Indonesia](../id/04-PublishingAndForking.md) · [日本語](../ja/04-PublishingAndForking.md) · [한국어](../ko/04-PublishingAndForking.md) · [Português (Brasil)](../pt-BR/04-PublishingAndForking.md)
<!-- /languages -->

Este es el corazón de ForkBuild. **Publicar** comparte su creación con el
mundo. **Remezclar** permite que cualquiera copie una creación y la haga
evolucionar, conservando todo el historial.

## Publicar su creación

1. Construya algo en el Editor.
2. Inicie sesión y asegúrese de que su identidad esté desbloqueada
   (consulte [Identidad e inicio de sesión](05-IdentityAndLogin.md)).
   Publicar firma la creación con ella. Si no inició sesión, **Publicar** le
   pide iniciar sesión o crear una identidad primero; **Publicar sin
   firmar** la publica ahí sin autor y sin enlace.
3. Póngale un título (Publicar rechaza una creación sin título o vacía) y,
   si quiere, una descripción y una licencia: haga clic en **✎** junto al
   título del documento en la barra lateral para abrir **Propiedades del
   documento**. Un documento nuevo no tiene licencia; la primera vez que
   lo publique, ForkBuild le preguntará si otros pueden remezclarlo (vea
   [Dejar que otros la remezclen](#dejar-que-otros-la-remezclen)).
4. Presione **Guardar** para que quede guardado.
5. Haga clic en **Publicar**.

Su creación aparece ahora en **su propio Repositorio** en este
dispositivo, donde puede buscarla, abrirla y bifurcarla, con su nombre como
autor. Otras personas solo la ven cuando usted la comparte o la distribuye
(consulte la nota de abajo). También recibe automáticamente una posición en
el mundo compartido, así que **Explorar** siempre tiene adónde llevar a la
gente: consulte [Encontrar mundos](03-WorldView.md#encontrar-mundos).

> **Nota:** Publicar guarda su documento/Mundo solo en este dispositivo. Su
> tarjeta del Repositorio indica dónde registró este dispositivo su
> distribución (por ejemplo, **Guardado en IPFS · Anunciado en Nostr**), o
> **No hay ninguna distribución registrada en este dispositivo.** Mientras
> tanto, haga una copia de seguridad en [Sus datos](13-YourData.md) para
> conservar una copia.
> Publicar nunca envía nada a ningún lugar por sí solo. Un
> [enlace](#compartir-un-enlace) que usted copie lleva la construcción a
> quien se lo dé. Lo hacen dos pasos
> aparte y opcionales: **Distribuir**, que se describe más abajo,
> envía la publicación a Arweave o IPFS y la anuncia en Nostr o Arweave
> para que otras personas la encuentren sin estar conectadas con usted; y
> [**Compartir con pares**](#compartir-con-pares-conectados) se la ofrece
> a las personas con las que está conectado.

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
- **Necesita una firma.** Publique con la sesión iniciada; una creación
  publicada sin sesión no recibe enlace.
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

Copiar o compartir un enlace, y abrir uno, se cuentan de forma anónima,
como la visita diaria; consulte
[Recuento diario de visitantes](13-YourData.md#recuento-diario-de-visitantes).

### Lo que abre un enlace

Un enlace a una construcción, tanto si la lleva dentro como si indica
dónde está guardada, abre la página propia de esa construcción:

- la construcción, girando despacio;
- su título y quién la hizo;
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

## Distribuir directamente desde el Editor

En cuanto **Publicar** funciona, el Editor muestra ahí mismo un pequeño
aviso (“¡Publicada! Comparta su enlace, o use Distribuir para enviarla a las redes abiertas y que cualquiera pueda encontrarla.”) con un botón
**Distribuir** al lado, y un **Descartar** para cerrarlo sin hacer nada.
Hacer clic en **Distribuir** abre un diálogo **Distribuir**, en lugar de
llenar la superposición de selectores y resultados que solo necesita de
vez en cuando; cerrarlo (**Cerrar**, hacer clic fuera de él o Escape) nunca
pierde nada de lo que produjo: al volver a abrirlo muestra exactamente el
mismo resultado, error o estado en curso en que lo dejó.

El diálogo es el mismo que usa la Vista del mundo: su configuración de
**Almacenamiento** y de **Sustrato de anuncio / descubrimiento**, el botón
combinado **Distribuir** y los botones aparte **Distribuir solo el
Snapshot** / **Distribuir solo la Declaración firmada** funcionan como se
describe en
[Encuentros en el Mundo](03-WorldView.md#encuentros-en-el-mundo--publicaciones-y-avatares-que-comparten-sus-pares).
Aquí cambian dos cosas: siempre actúa sobre el Mundo compartido exacto que
acaba de producir su clic en Publicar, y la sección **Snapshot** va
primero, así que el botón combinado ejecuta primero el Snapshot y luego la
Declaración firmada.

El resultado de la Declaración firmada aparece en su propia sección:

| Campo | Significado |
|---|---|
| **Mundo compartido** | El id propio del Mundo compartido: confirma de qué Mundo compartido trata este resultado. |
| **Material** | La ubicación que produjo la subida, o “Aún no subido” si no se completó. |
| **Descubrimiento** | El id del anuncio, o “Aún no anunciado” si no se completó: una fila por relay cuando hay varios configurados. |
| **Repositorio** | Un botón **Explorar** que lleva directamente a la página de esta publicación en la Vista del mundo: aparece siempre que la publicación tenga adónde explorar, lo que en la práctica es siempre. |

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

Como cualquier otro botón de distribución de esta app, distribuir requiere
una extensión de firma en el navegador: una billetera de Arweave (como
Wander) o una extensión de Nostr (como nos2x); sin ella, termina con un
simple aviso “No se pudo completar…”. Publicar en sí nunca distribuye nada
por su cuenta: la distribución solo ocurre con este clic posterior, aparte
y explícito. Publicar de nuevo reemplaza toda la superposición por una
nueva para la nueva publicación; descartarla, o salir de la página, la
borra: ni el aviso ni el resultado de ninguna de las dos secciones se
recuerdan en ningún lugar.

## Compartir con pares conectados

Un Mundo que publica aparece solo en *su* Repositorio, hasta que lo
distribuye en Nostr, Arweave, Steem o Blurt (consulte
[Distribución](Distribution.md)): entonces el Repositorio de cualquiera lo
encuentra (consulte
[Creaciones que otros distribuyeron](#creaciones-que-otros-distribuyeron)).
Para ponerlo en el
Repositorio de alguien con quien está conectado (consulte
[Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md)), haga
clic en **Compartir con pares** debajo de él en el Repositorio. El botón
solo aparece en sus propios Mundos publicados.

- Compartir ofrece el Mundo a todos los que están conectados en ese
  momento, y a cualquiera que se conecte después. **Compartido ✓ ·
  Compartir de nuevo** lo vuelve a anunciar a las personas conectadas
  ahora.
- Del lado de ellos, un Mundo compartido por uno de sus **Amigos** o
  **Pares conocidos** se agrega solo a su Repositorio, junto con todo lo
  necesario para **Explorarlo**. Un Mundo compartido por cualquier otra
  persona espera en **Compartido con usted**, arriba en su Repositorio,
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
le pregunta una vez; cámbiela cuando quiera en **Propiedades del
documento**. Una bifurcación ya lleva la licencia de su original, así que
publicar una nunca pregunta.

### Todas las licencias

Una creación publicada siempre se muestra con una licencia, elegida en el
diálogo **Propiedades del documento**:

| Licencia | Significado |
|---|---|
| **CC0 1.0 — Dominio público** | Sin derechos reservados: cualquiera puede hacer cualquier cosa con ella |
| **CC BY 4.0 — Atribución** | Cualquiera puede bifurcarla y reutilizarla, dándole crédito a usted |
| **CC BY-SA 4.0 — Atribución, Compartir igual** | Las bifurcaciones deben llevar la misma licencia |
| **CC BY-NC 4.0 — Atribución, No comercial** | Se permite bifurcar, no el uso comercial |
| **CC BY-ND 4.0 — Atribución, Sin derivadas** | Se puede ver, pero **no se permite bifurcar** |
| **Todos los derechos reservados** | Se puede ver, pero no se permite bifurcar |
| **Sin licencia especificada** | No se permite bifurcar hasta que elija una |

Si deja una creación sin licencia, la gente igual puede abrirla y
explorarla; solo que no puede bifurcarla hasta que elija una licencia que
lo permita.

## Elegir quién puede colocarlo

Normalmente, otras personas pueden colocar su creación publicada en sus
propios Mundos. Eso agrega una colocación de su construcción, nunca una
copia, y nunca mueve ni cambia la suya (consulte
[¿Por qué puedo colocar construcciones de otras personas?](03-WorldView.md#por-qué-puedo-colocar-construcciones-de-otras-personas)).
Bifurcar es aparte y lo rige la licencia (consulte
[Colocar o bifurcar](03-WorldView.md#colocar-o-bifurcar)).
Si prefiere que no la coloquen, abra **Propiedades del documento** y
configure **Quién puede colocarlo en el Mundo**:

| Opción | Significado |
|---|---|
| **Cualquiera puede colocarlo** | La predeterminada. Cualquiera puede colocarlo donde quiera en su propio Mundo |
| **Solo yo puedo colocarlo** | Solo usted puede colocarlo. Otras personas igual pueden encontrarlo, verlo y (si la licencia lo permite) bifurcarlo, pero ForkBuild no les deja colocarlo |

La opción se firma como parte de la publicación al publicar, así que nadie
puede quitarla ni cambiarla después. Eso también significa que solo se
aplica a lo que publique después de elegirla. Una publicación que ya está
disponible conserva la opción con la que se publicó, así que vuelva a
publicar si quiere que se aplique la nueva.

Funciona igual que el permiso de bifurcar de la licencia: todas las copias
de ForkBuild lo respetan, pero no es un candado. Alguien que modificara el
código de la app podría ignorarlo, y no puede deshacer una colocación que
alguien hizo antes de que usted lo eligiera.

En cualquier caso, otras personas ven su construcción donde *usted* la
puso una vez que **distribuye** su Snapshot desde la Vista del mundo o justo después de publicar en el Editor: el
anuncio lleva su colocación firmada, y su ForkBuild muestra la construcción
allí en cuanto conoce su Mundo compartido. Muévala y vuelva a distribuirla,
y también se moverá para ellos.

## Editar una creación publicada

Una creación publicada es **inmutable**: nunca puede cambiar después. Para
construir sobre una, **bifúrquela** (abajo) o use **Editar una copia** en
la Vista del mundo. En la Vista del mundo, hacer su primer cambio en un
mundo publicado (sus metadatos, el nombre de un hito o una región, o una
decoración con un animal) crea automáticamente su propia copia, titulada
*“Bifurcación de &lt;nombre original&gt;”*, con una breve confirmación
(“Se creó su propia copia editable; “…” no cambia”); consulte
[Guardar y publicar también aquí](03-WorldView.md#guardar-y-publicar-también-aquí).

El original nunca se toca, por mucho que cambie su copia.

## El Repositorio

El **Repositorio** es el catálogo, con búsqueda, de todas las creaciones
publicadas que conoce este dispositivo: las suyas, las que le compartieron
sus pares y las que se encontraron en redes descentralizadas. Está hecho
para seguir siendo útil tanto si tiene diez creaciones como diez mil.

### Construcciones ya hechas

Arriba, **Empiece con una construcción ya hecha** muestra las
construcciones que vienen con ForkBuild: un castillo, una isla del puerto,
una plaza del pueblo, una casa, un molino y un puente. Están ahí incluso
antes de que se publique o se encuentre algo. Haga clic en una
(**Remezclar**) para abrir su propia copia en el Editor; nada se publica
hasta que usted lo publique. Haga clic en el título para plegar la fila.

### Creaciones que otros distribuyeron

Cada vez que abre el Repositorio (o la página de un autor), busca en Nostr,
Arweave, Steem y Blurt creaciones que otras personas distribuyeron allí, y agrega
las que puede verificar. Una línea encima de la lista dice lo que está
haciendo y luego cuántas creaciones nuevas encontró; **Volver a buscar**
busca una vez más.

- Solo se agrega una creación cuyo registro firmado se verifica: firmado
  por la clave que nombra y exactamente la creación que se anunció.
  Cualquier otra cosa se omite, y un registro que falló no se vuelve a
  obtener.
- Verifica hasta 20 creaciones nuevas a la vez. Si hay más, la línea dice
  cuántas quedan para la próxima vez.
- Una creación encontrada así permanece en su Repositorio después de
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

Cada creación ofrece tres acciones:

| Botón | Qué hace |
|---|---|
| **Abrir** | Carga ese documento en el Editor |
| **Remezclar** | Lo copia en una creación editable propia |
| **Explorar** | Vuela hasta él en la Vista del mundo |

(El botón **Seguir explorando** de **Mis mundos** (consulte
[Mis mundos](03-WorldView.md#mis-mundos--los-mundos-que-realmente-visitó))
hace lo mismo que **Explorar** aquí, solo que redactado para un Mundo que
ya visitó en lugar de uno que encuentra por primera vez).

Haga clic en el **nombre de cualquier autor** para visitar su **Vista del
autor**: un portafolio de todo lo que hizo, incluidos sus originales y
todas las bifurcaciones que surgieron de ellos, con exactamente el mismo
catálogo de búsqueda, orden y paginación que el Repositorio, solo que
limitado a ese autor.

Una tarjeta cuya firma pasa la comprobación también tiene un botón
**Seguir**, y una Vista del autor muestra **Firmado por …** con **Seguir**
para cada identidad que publicó con ese nombre. Seguir a alguien pone su
trabajo nuevo en su página **Siguiendo** y en sus notificaciones; consulte
[Seguir a personas](07-PeerConnectionsAndFriends.md#seguir-a-personas).

El Repositorio tampoco se limita a lo que se publicó desde este dispositivo
o se descubrió directamente: una creación descentralizada del Repositorio
que un par le mostró en el mapa de
[Encuentros en el Mundo](03-WorldView.md#encuentros-en-el-mundo--publicaciones-y-avatares-que-comparten-sus-pares)
de la Vista del mundo, una vez que su contenido realmente se resuelve,
también se suma a esta misma búsqueda y a la Vista del autor de su autor, y
sigue allí después de recargar. No se muestra de ninguna forma distinta de
todo lo demás.

## Bifurcar: hágalo suyo

**Remezclar** es lo que hace especial a ForkBuild. Cuando bifurca una
creación:

- Obtiene una **copia completamente nueva e independiente** para editar
  libremente.
- El **original no se toca**: sus cambios nunca lo afectan.
- La copia **recuerda de dónde vino**, así que el crédito nunca se pierde.

Funciona igual que bifurcar un proyecto en Git: usted se separa, hace lo
suyo, y el árbol genealógico lleva la cuenta de todos. (En la Vista del
mundo también ocurre automáticamente en el momento en que cambia un mundo
publicado: consulte
[Editar una creación publicada](#editar-una-creación-publicada) arriba).

> **En la Vista del mundo también se llama “Editar una copia”.** Es la
> misma operación de fondo en ambos casos, con las mismas reglas de
> licencia y el mismo manejo de
> [Bifurcación no disponible](#cuando-una-bifurcación-no-se-puede-completar).
> Consulte
> [Editar una copia](03-WorldView.md#editar-una-copia--llevar-algo-al-editor)
> para ver cómo funciona en la Vista del mundo.

### Cómo bifurcar

1. Encuentre una creación en el **Repositorio** (o en la Vista del mundo).
2. Haga clic en **Remezclar**.
3. La copia se abre en el Editor, titulada *“Bifurcación de &lt;nombre
   original&gt;”*.
4. Construya sobre ella y luego guárdela y publíquela como propia.

Su bifurcación publicada aparece con una nota **Remezcla de “…” de …**,
que la vincula con el original.

### Recuentos de remezclas

La página de una construcción y su tarjeta del Repositorio dicen cuántas
veces se remezcló (**Remezclada 3 veces**): cuántas construcciones
distintas, bifurcadas de ella y publicadas, ha encontrado este
dispositivo. Una remezcla publicada dos veces cuenta una vez, y una
construcción que nadie ha remezclado no muestra nada. El recuento es solo
lo que este dispositivo conoce, así que otro dispositivo puede mostrar un
número distinto, y nunca decide qué se muestra primero.

Cuando este dispositivo encuentra la remezcla de otra persona de una de
sus construcciones, su 🔔 recibe una entrada **… remezcló su
construcción**, una vez por remezcla (y su dispositivo también la muestra,
si activó [Notificaciones en este dispositivo](03-WorldView.md#notificaciones-en-este-dispositivo)).

### Cuando una bifurcación no se puede completar

A veces una bifurcación no puede completarse; la mayoría de las veces al
bifurcar un Mundo compartido encontrado mediante un par o una red
descentralizada (consulte
[Publicaciones y evidencia externa](09-PublicationsAndEvidence.md)) en
lugar de una entrada común del Repositorio. En lugar de dejarlo en un
documento del Editor vacío y sin relación, ForkBuild muestra un diálogo
**Bifurcación no disponible** que indica exactamente qué salió mal:

- **Este Mundo compartido no se puede bifurcar bajo su licencia.** La
  licencia de lo que intentaba bifurcar no lo permite (consulte
  [Elegir una licencia](#elegir-una-licencia) arriba).
- **El material de este Mundo compartido no está disponible por
  ahora.** La licencia permite bifurcar, pero el contenido en sí todavía
  no está en este dispositivo (ni se puede alcanzar mediante un par
  conectado).

En ambos casos, el único botón del diálogo, **Volver al Mundo compartido**,
lo lleva de vuelta a donde lo encontró (el Mundo en el que estaba colocado,
o el Mundo compartido en sí), en lugar de dejarlo varado en el Editor sin
nada sobre lo que construir.

## El desafío de construcción semanal

Cada semana ForkBuild propone un tema para construir (un faro, un puente,
una casa diminuta, …), de lunes al final del domingo (UTC). Inicio lo
muestra, y **Desafío** en la barra de arriba abre su página.

1. **Unirse al desafío** abre una construcción inicial en el Editor como
   su propia copia, ya con la etiqueta de la semana (por ejemplo
   `#lighthouse-20261012`: el tema y el lunes en que empezó). El desafío
   también es la primera opción de **Nuevo** en el Editor, y las **Ideas
   para empezar** de la página abren otras construcciones adecuadas de la
   misma manera.
2. Hágala suya o empiece de nuevo en un terreno vacío: construya lo que
   construya, participa mientras conserve la etiqueta de la semana
   (añádala en **Propiedades del documento → Etiquetas** si empezó de otra
   forma).
3. Publíquela antes de que acabe la semana y comparta su enlace. El texto
   del enlace nombra el desafío y su etiqueta, listo para una publicación.

La página del desafío muestra las participaciones que este dispositivo
conoce: sus propias construcciones publicadas con la etiqueta y las de
otras personas encontradas en las redes. Cuando una construcción se distribuye en Nostr, Arweave, Steem o Blurt, su anuncio (en Blurt, su publicación) enumera sus etiquetas, y la
página pregunta a esas redes por la etiqueta de la semana cada vez que se
abre (**Volver a buscar** vuelve a preguntar). Cada participación
encontrada se comprueba como todo lo que encuentra el Repositorio, y
aparece también en el Repositorio. Una construcción compartida solo por su enlace no se encuentra así, ni una anunciada solo en Steem antes del 8 de octubre de 2026, cuando los anuncios en Steem empezaron a incluir etiquetas. Las
semanas anteriores siguen disponibles por su lunes (**La semana pasada:
…**), sin **Unirse**.

Las participaciones se muestran de la más reciente a la más antigua, con
sus recuentos de remezclas. Nadie las juzga y nada se clasifica: el
desafío es un motivo para construir algo esta semana y ver qué hicieron
otras personas con la misma idea.

Cuando hay participaciones remezcladas unas de otras, o de otras
construcciones, **Árboles familiares** bajo las participaciones muestra de
dónde vienen, un árbol por cada cadena de remezclas.

### La plaza del reto

En cuanto una semana tiene participaciones, **Recorrer la plaza** en su
página te lleva a la vista del mundo, a un claro del mundo compartido donde
las participaciones de la semana se alzan en anillos alrededor de una plaza
abierta. Pasea entre ellas o elige una en el panel: **Navegar** vuela hasta
ella, **Abrir** la abre como lo haría **Explorar**, y **Editar una copia**
empieza tu propia copia.

- Se alzan allí las primeras 24 participaciones publicadas, las más
  antiguas más cerca del centro, así que una nueva se suma al borde
  exterior. El resto está en la página del reto.
- Las participaciones encontradas en las redes se obtienen y comprueban
  como al abrir su enlace. Si una no se puede obtener, se deja fuera, y el
  panel dice cuántas fueron.
- Una participación cuyo autor eligió **Solo yo puedo colocarlo** no se
  alza en la plaza, porque ponerla allí sería colocarla. Sigue en la página
  del reto.
- Las participaciones son piezas expuestas, no colocaciones: no se firma
  ni se guarda nada para nadie, y desaparecen al salir. Como el resto de la
  vista del mundo, la plaza muestra lo que conoce este dispositivo, así que
  dos visitantes pueden ver conjuntos distintos.

## El árbol genealógico

Como cada bifurcación registra a su antecesor, ForkBuild puede dibujar todo
el linaje de una creación. En una **Vista del autor**, verá un **árbol de
bifurcaciones**:

```
Casa medieval (original)
└─ Bifurcación de Casa medieval (de Beto)
   └─ Bifurcación de Bifurcación de… (de Carola)
```

Esto significa que una gran creación puede inspirar todo un ecosistema de
variaciones, y que todos en la cadena reciben crédito.

La página propia de una construcción, abierta desde un enlace compartido,
muestra el mismo linaje como **Árbol familiar**: de qué se remezcló, hasta
la original, luego la construcción misma y después las remezclas hechas de
ella, hasta donde sabe este dispositivo.

## Un ciclo creativo típico

Este es todo el recorrido en un solo flujo:

1. **Construya** una creación en el Editor.
2. **Guárdela**.
3. **Publíquela** en el Repositorio.
4. Alguien la **encuentra** (buscando, explorando cerca en la Vista del
   mundo o recorriendo su página de autor) y la **bifurca**.
5. Esa persona **publica** su bifurcación.
6. Otras personas **exploran** ambas en la Vista del mundo, y el árbol
   crece.

Ese es el ecosistema de construcción abierta para el que se hizo
ForkBuild.

## ¿Y ahora qué?

Tenga a mano la [Referencia de controles](ControlsReference.md) mientras
construye, o vuelva a explorar la [Vista del mundo](03-WorldView.md) con
más detalle.
