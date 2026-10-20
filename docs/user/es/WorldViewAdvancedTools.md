<!-- translation-of: docs/user/WorldViewAdvancedTools.md source-hash: 49b3a123cec42c7e -->
# Vista del mundo: herramientas avanzadas

<!-- languages -->
[English](../WorldViewAdvancedTools.md) · [Deutsch](../de/WorldViewAdvancedTools.md) · **Español** · [Français](../fr/WorldViewAdvancedTools.md) · [Bahasa Indonesia](../id/WorldViewAdvancedTools.md) · [日本語](../ja/WorldViewAdvancedTools.md) · [한국어](../ko/WorldViewAdvancedTools.md) · [Português (Brasil)](../pt-BR/WorldViewAdvancedTools.md)
<!-- /languages -->

Esta página trata de las partes de la [Vista del mundo](03-WorldView.md)
que solo aparecen cuando marca **Mostrar herramientas avanzadas** al final
del panel lateral. Son para las redes que hay detrás del Mundo: dónde está
colocada una construcción, dónde se guarda y qué anunciaron otras personas
cerca.

No necesita ninguna para caminar, construir, remezclar o compartir un
enlace. La casilla se recuerda en este dispositivo y no cambia nada para
nadie más.

**Con las herramientas avanzadas obtiene:**

| Herramienta | Dónde está | Para qué sirve |
|---|---|---|
| [Inspeccionar](#inspeccionar-un-bloque--o-una-estructura-colocada) | Clic en un bloque o una estructura colocada | Ver qué es y de dónde viene |
| [Cámara y edición](#cámara-y-edición) | Una línea en el encabezado del panel | Ver a qué construcción se aplica su próximo cambio |
| [Sobre esta construcción, y Colocación](#información-de-la-construcción-y-colocación) | Bajo el encabezado | Los datos de una construcción y dónde está |
| Coordenadas y búsqueda por **Ubicación** | Sobre la vista, y en **Buscar** | Encontrar cosas por su posición X/Y/Z |
| [Encuentros en el Mundo](#encuentros-en-el-mundo--publicaciones-y-avatares-que-comparten-sus-pares) | **Cerca**, en Explorar | Lo que comparten las personas conectadas |
| [Nombres de lugares](#nombres-de-lugares-cercanos--descubrir-declaraciones-de-cualquier-persona) | **Cerca**, en Explorar | Nombres que otras personas dieron a los lugares a su alrededor |
| [Construcciones declaradas](#construcciones-declaradas--las-construcciones-de-otros-donde-sus-editores-dicen-que-están) | **Cerca**, en Explorar | Construcciones anunciadas cerca de usted, como fantasmas |
| [Mi Mundo compartido](#mi-mundo-compartido--distribuir-su-propio-snapshot-sin-necesidad-de-pares) | Más abajo en el panel | Las colocaciones de su propia construcción, su distribución y sus comentarios |

Las herramientas avanzadas también agregan la lista de Mundos que no se
pudieron cargar y, en **Ajustes del avatar**, el diagnóstico de avatares.

## Inspeccionar un bloque — o una estructura colocada

Haga clic en un bloque para abrir el panel **Inspección**. (Sin las
herramientas avanzadas, un clic solo elige otro avatar.) Muestra:

- qué tipo de bloque es;
- su posición y su rotación;
- a qué Mundo y a qué construcción pertenece;
- quién hizo ese Mundo.

**Enfocar bloque** acerca la cámara al bloque. **Enfocar Mundo** lo lleva
a la posición inicial del Mundo. **Editar una copia** hace su propia copia
del Mundo y la abre en el Editor; el original queda como está.

Hacer clic en suelo vacío dentro de un Mundo abre el mismo panel, con la
posición y el Mundo pero sin datos de bloque. También tiene **Editar una
copia**, así que puede copiar un Mundo haciendo clic en cualquier parte de
él.

Una **estructura colocada** es una construcción entera puesta en un Mundo
desde el Editor (consulte
[Instancias de estructuras](02-TheEditor.md#instancias-de-estructuras-una-referencia-viva)).
Haga clic en una y el panel muestra la construcción a la que remite: su
título, su posición y rotación, la altura del suelo y el Mundo donde está.
Aquí no puede moverla. Tiene dos botones:

- **Abrir fuente** abre en el Editor la construcción a la que remite. Cada
  copia de esa estructura, dondequiera que esté colocada, muestra lo que
  usted cambie allí.
- **Editar una copia** hace en cambio su propia copia de esa construcción,
  y deja sin cambios el original y cada copia colocada.

Cada **Editar una copia** de la Vista del mundo hace lo mismo; consulte
[Editar una copia](03-WorldView.md#editar-una-copia--llevar-algo-al-editor).

## Cámara y edición

El encabezado muestra una línea como esta:

```
Cámara: Castillo de Alicia · Edición: Castillo de Beto
```

- **Cámara** es lo que está mirando. Volar a un Mundo, o hacer clic en
  **Enfocar** o en **Ir**, la cambia.
- **Edición** es la construcción a la que se aplica su próximo cambio: un
  hito, una región, sus datos o la publicación. Hacer clic en un bloque o
  una colocación, o en **Seleccionar** en un resultado de búsqueda, la
  cambia sin mover la cámara.

Normalmente son la misma, porque **Enfocar** cambia las dos. Difieren
cuando seleccionó una construcción y está mirando otra, o cuando dos
construcciones están exactamente en el mismo lugar: enfocar la segunda no
mueve la cámara, pero la línea muestra que ahora edita la otra. Mirar
alrededor nunca cambia lo que edita; solo seleccionar lo hace.

**Ir** y **Enfocar** son lo mismo con dos nombres: los dos mueven la
cámara. Que además cambien lo que edita depende del panel (en
[Buscar](03-WorldView.md#buscar--qué-publicaciones-coinciden), Enfocar lo
hace).

## Información de la construcción y colocación

**Sobre esta construcción** muestra la construcción que está editando en
cuanto llega a ella, antes de hacer clic en nada.

Haga clic en un bloque, en suelo vacío o en una estructura colocada y se
abren dos paneles bajo el encabezado, para la construcción en la que hizo
clic:

- **Sobre esta construcción**: su título, descripción, etiquetas,
  licencia, estado, autor y de qué es remezcla. **Editar metadatos**
  cambia el título, la descripción, la licencia y quién puede colocarla.
  De una descripción larga se ve aquí el principio; **Leer más** la abre
  entera en un panel más ancho al lado (desde abajo, en un móvil), con el
  Mundo aún a la vista. **Esc** o **✕** lo cierra.
  Una construcción publicada muestra también **💬 Comentarios**: se abren en
  el mismo panel, bajo la descripción, donde los lee y añade los suyos, igual
  que en su tarjeta de **Explorar**.
  Una construcción publicada muestra también sus corazones (**♡**, y a
  quién le encanta); consulta [Corazones](04-PublishingAndForking.md#corazones).
  Cuando construcciones de otras personas, publicadas antes, se le parecen
  mucho, un panel debajo las enumera, como la página de la construcción;
  consulte
  [Construcciones parecidas publicadas antes](04-PublishingAndForking.md#construcciones-parecidas-publicadas-antes).
- **Colocación**: dónde está la construcción en el Mundo, en **unidades
  del Mundo**. Son las coordenadas propias de ForkBuild, no GPS; una unidad
  del Mundo es un metro. **Enfocar** lo lleva allí. **Mover** abre **Mover
  colocación**, donde escribe nuevos valores de X, Y y Z o empuja la
  construcción 1, 10 o 100 unidades. **Mover a su lugar en la cuadrícula**
  rellena el lugar propio de la construcción en la cuadrícula del Mundo,
  donde se colocan las construcciones al publicarse; haga clic en **Mover**
  para ir allí. **Quitar del Mundo** retira esta colocación.

Son dos paneles porque *qué* es una construcción y *dónde* está son cosas
distintas. Mover una colocación nunca cambia la construcción, y cambiar la
construcción nunca la mueve.

### Posición en el Mundo

Para devolver una construcción a su lugar propio en la cuadrícula del Mundo
(una publicada del 12 al 17 de octubre de 2026 se colocó en cambio
alrededor de la plaza del reto), abra **Mover colocación**, haga clic en
**Mover a su lugar en la cuadrícula** y luego en **Mover**. Después vuelva
a enviarla con **Distribuir** en **Mi Mundo compartido**, para que otros
dispositivos también la muevan.

Si otra construcción ya está exactamente donde la va a mover, **Mover
colocación** le avisa y lista lo que hay antes de que confirme. Compartir
un lugar está permitido: una escena de patio y el edificio que la rodea
pueden estar en el mismo sitio. ForkBuild solo se asegura de que usted lo
sepa.

### Colocaciones que no son suyas

Cuando otra persona colocó una construcción, el panel Colocación dice
**🔒 Colocado por &lt;nombre&gt;: puede ver esta colocación, pero no
moverla**, y **Mover** está desactivado. Aún puede enfocarla,
inspeccionarla y usar **Editar una copia** para construir sobre ella. Solo
dónde está es cosa de esa persona.

### Construcciones aquí

Cuando el panel Colocación dice que otras construcciones comparten este
lugar, haga clic en **Ver** para abrir **Construcciones aquí**: una lista de
todas las construcciones en ese lugar, cada una con un botón **Enfocar**.
Las construcciones cuya publicación se retiró no aparecen.

### ¿Por qué puedo colocar construcciones de otras personas?

Un edificio real no se puede levantar y llevar a otro lado, así que puede
parecer raro que pueda colocar cualquier construcción publicada donde
quiera. Pero una construcción publicada no es un único objeto físico. Es
contenido fijo, reconocido por su hash de contenido, como un archivo. Una
**colocación** es una nota aparte y firmada que dice “muestra esta
construcción aquí”. Remite a la construcción; no la copia. Una
construcción puede tener muchas colocaciones, y cada una muestra
exactamente el mismo contenido.

Así que colocar la construcción de otra persona nunca mueve ni cambia la
suya:

- **Su colocación queda donde la puso.** Solo esa persona puede moverla
  (consulte
  [Colocaciones que no son suyas](#colocaciones-que-no-son-suyas)).
- **Su propia colocación la firma usted.** Solo dice dónde muestra *usted*
  esa construcción.
- **La construcción conserva su autor y su historia.** Sigue siendo
  exactamente lo que se publicó, y cualquiera puede comprobarlo con su hash
  y su firma.

No hay un mapa central que diga de quién es cada terreno. Cada Mundo
muestra las colocaciones que aceptó. Por eso una construcción que alguien
anuncia cerca de usted solo aparece como fantasma hasta que elige
**Aceptar posición** (consulte
[Construcciones declaradas](#construcciones-declaradas--las-construcciones-de-otros-donde-sus-editores-dicen-que-están)).
Nadie puede poner una construcción en su Mundo sin su permiso.

Algunas razones para colocar una construcción que usted no hizo:

- **Curar**, como un Mundo galería con construcciones que le gustan.
- **Armar una escena**, como poner el castillo de un amigo junto a su
  pueblo.
- **Usarla tal cual.** Colóquela cuando la quiera sin cambios, y use
  [Editar una copia](03-WorldView.md#editar-una-copia--llevar-algo-al-editor)
  cuando quiera cambiarla.

Quien no quiera esto puede elegir **Solo yo puedo colocarlo** al publicar
(consulte
[Elegir quién puede colocarlo](04-PublishingAndForking.md#elegir-quién-puede-colocarlo)).
Usted aún puede encontrar y mirar la construcción, y remezclarla si la
licencia lo permite, pero no colocarla.

### ¿Por qué dos construcciones pueden estar en el mismo lugar?

Dos edificios reales no pueden estar en el mismo sitio. En ForkBuild sí,
porque una colocación no ocupa terreno. Es solo una nota firmada que dice
“muestra esta construcción aquí”, y dos notas pueden nombrar el mismo
lugar.

ForkBuild lo permite a propósito:

- **Nadie reparte terreno.** Ningún servidor central decide quién llegó
  primero a un lugar, y ForkBuild nunca elige un ganador entre dos
  colocaciones firmadas. Las dos siguen siendo válidas.
- **Cada dispositivo conoce colocaciones distintas.** Un lugar ocupado en
  el dispositivo de su amigo puede seguir vacío en el suyo hasta que le
  lleguen sus colocaciones. Una regla estricta de “una construcción por
  lugar” daría respuestas distintas en dispositivos distintos, así que
  ForkBuild no finge tener una.
- **A veces usted lo quiere.** Una escena de patio dentro de un edificio,
  o una versión anterior mostrada en lugar de la nueva, van en el mismo
  sitio.

Eso no quiere decir que cualquiera pueda amontonarse sobre sus
construcciones:

- **Se le avisa antes.** **Mover colocación** lista lo que ya hay en un
  lugar antes de que confirme, y nunca mueve su construcción a otro sitio
  sin decírselo (consulte [Posición en el Mundo](#posición-en-el-mundo)).
- **Sin duplicados por accidente.** **Agregar colocación aquí** se niega
  si ya hay una colocación exactamente donde está.
- **La declaración de otro es solo un fantasma.** Una posición anunciada
  por alguien que no es el editor de la construcción solo se muestra como
  un fantasma transparente, y nunca en un lugar donde este dispositivo ya
  conoce una colocación real (consulte
  [Construcciones declaradas](#construcciones-declaradas--las-construcciones-de-otros-donde-sus-editores-dicen-que-están)).
- **Solo el propietario puede mover o quitar una colocación** (consulte
  [Colocaciones que no son suyas](#colocaciones-que-no-son-suyas)).

ForkBuild solo comprueba si hay construcciones exactamente en el mismo
punto. Dos construcciones un poco separadas cuyos bloques se tocan no se
señalan. Para las razones de este diseño, consulte
[Overlap Is A Fact; Collision Is A Policy Decision](../../principles/placement.md#overlap-is-a-fact-collision-is-a-policy-decision-0225)
(en inglés) y las reglas que le siguen.

### Colocar o remezclar

Las dos cosas ponen la construcción de otra persona en un Mundo suyo, pero
son distintas:

| | Colocar | Remezclar (o Editar una copia) |
|---|---|---|
| Qué se crea | Una colocación: una pequeña nota firmada de dónde mostrar la construcción | Una construcción nueva, con ids nuevos, que es suya |
| La construcción | El mismo Mundo compartido, tal como se publicó | Su propia copia, con una nota que remite al original |
| ¿Puede cambiar los bloques? | No | Sí, en el Editor |
| Quién es el autor | El editor original | Usted, con el original registrado como su padre |
| Lo controla | La opción **Quién puede colocarlo** del editor | La licencia |
| Al publicarla | No se publica nada nuevo | Crea un Mundo compartido nuevo con su nombre |

Colocar es como enlazar a un archivo; remezclar es como hacer su propia
copia para cambiarla. Quien eligió **Solo yo puedo colocarlo** aún puede
permitir remezclas con su licencia, y una remezcla es suya para colocarla
donde quiera.

## Encuentros en el Mundo — publicaciones y avatares que comparten sus pares

**Encuentros en el Mundo** es un grupo de **Cerca**, en Explorar. Es un
pequeño mapa propio (no el Mapa del mundo) que muestra lo que le contaron
sus [pares conectados](07-PeerConnectionsAndFriends.md):

- **publicaciones** colocadas cerca (consulte
  [Publicaciones y evidencia externa](09-PublicationsAndEvidence.md));
- los **avatares** de otras personas;
- un marcador para usted.

Hasta que un par conectado comparta algo, el grupo dice **Todavía no hay
nada que encontrar aquí.**

Haga clic en un marcador para inspeccionarlo:

- Una **publicación** muestra su título, su editor, si está firmada, su
  posición y cuántos anclajes y ubicaciones de Snapshot tiene.
- Un **avatar** muestra su nombre, su propietario y su posición.

Si más de un par ofrece lo mismo, **Elegir fuente** le deja escoger de
quién es la copia que mira. Nada de esto mueve su cámara ni cambia nada.

### Material y verificación

Al seleccionar una publicación aparecen dos líneas más:

- **Material**: ¿se puede cargar su contenido? **Available** (disponible)
  o **Unavailable** (no disponible).
- **Verificación**: ¿coincide el contenido con lo que se declaró de él?
  **Verified** (verificado) o **Unverifiable** (no verificable).

El contenido que ya está en este dispositivo se carga y se comprueba de
inmediato. Lo que un par solo le mostró suele indicar **Unavailable** /
**Unverifiable** hasta que lo busque con
[Descubrir Mundo compartido](#descubrir-mundo-compartido--buscar-directamente-en-redes-descentralizadas).
Si eso lo encuentra en Arweave o en Nostr, se usa también aquí. Cuando
encuentra más de un sitio, **Elegir ubicación** le deja escoger uno; no se
carga nada hasta que lo haga, y la elección solo vale para esta
publicación.

Una línea **Origen** dice de dónde vino el contenido: **Local** (este
dispositivo) o **Decentralized** (descentralizado: Arweave o Nostr). Es un
hecho simple, no una puntuación de confianza.

En cuanto la publicación de un par indica **Available**, se agrega a
Explorar y a la página de su autor como si la hubiera encontrado allí, y
se queda tras recargar. Nada la marca como encontrada a través de un par:
su propio dispositivo comprobó el contenido, así que es como cualquier
otra.

### El diálogo Distribuir

Cuando este dispositivo tiene el contenido de una publicación, un botón
**Distribuir** abre el diálogo **Distribuir**. El mismo diálogo se abre
desde
[Mi Mundo compartido](#mi-mundo-compartido--distribuir-su-propio-snapshot-sin-necesidad-de-pares)
para su propia construcción. Para saber qué hace cada red, consulte
[Distribuir su trabajo](Distribution.md).

Arriba hay dos opciones que valen para todo el diálogo. Las dos empiezan
con sus preferencias guardadas:

- **Almacenamiento**: adónde va el contenido. **Arweave**, **IPFS (Kubo
  local)**, **IPFS (pinning remoto)** o, de forma experimental, **Steem** o
  **Blurt** (consulte [Steem](11-EvidenceAndStorage.md#steem) y
  [Blurt](11-EvidenceAndStorage.md#blurt)). El pinning remoto pide un
  endpoint y una credencial cada vez y nunca los guarda. Solo se lista el
  almacenamiento que este dispositivo puede usar de verdad.
- **Sustrato de anuncio / descubrimiento**: dónde se anuncia para que
  otros lo encuentren. **Arweave**, **Blurt**, **Nostr** o **Steem**.

El diálogo puede enviar dos cosas:

- la **Declaración firmada**, que dice que usted publicó esto, y
- el **Snapshot**, una copia de la construcción misma (consulte
  [Snapshot local](09-PublicationsAndEvidence.md#snapshot-local)).

Cuando se pueden enviar las dos, el botón principal **Distribuir** las
envía una tras otra, porque las dos pueden pedir la firma a la misma
extensión de billetera. Cada una tiene su sección con su propio resultado,
y que una falle nunca oculta ni detiene la otra. **Distribuir solo la
Declaración firmada** y **Distribuir solo el Snapshot** envían solo una,
por ejemplo para reintentar la mitad que falló. Cuando solo se puede
enviar una, su botón es simplemente **Distribuir Declaración firmada** o
**Distribuir Snapshot**.

Para firmar necesita una extensión del navegador: una billetera de Arweave
(como Wander) para Arweave, y un firmante de Nostr (como nos2x) para
Nostr. Sin ella, la sección dice “No se pudo completar la distribución.” y
por qué.

- La sección **Declaración firmada** indica **Absent** (ausente) en
  **Material** y **Descubrimiento** hasta que se envía. Después muestra el
  id de la publicación, dónde está su material y el id del anuncio, con una
  fila por [relay de Nostr](10-NetworkSettings.md#relays-de-nostr).
- La sección **Snapshot** muestra un **Hash del contenido**, un
  **Localizador** y un id de **Anuncio**. “Sin anuncio” significa que la
  copia se guardó pero no se anunció; es un resultado parcial, no un
  error. Un fallo real dice “No se pudo completar la distribución del
  Snapshot.”

Cerrar el diálogo no pierde nada: ábralo otra vez y los resultados siguen
allí. Se olvidan cuando selecciona otra publicación o sale de la página.

## Descubrir Mundo compartido — buscar directamente en redes descentralizadas

Dentro de Encuentros en el Mundo, **Descubrimiento de Mundos compartidos**
abre el panel **Descubrir Mundo compartido**. No necesita un par ni un
marcador. Escriba un **id del Mundo compartido**, deje la **etiqueta de
descubrimiento** (empieza con la etiqueta propia de ForkBuild, que casi
siempre es la correcta) y haga clic en **Descubrir Mundo compartido**.
ForkBuild pregunta directamente a Arweave y a Nostr.

La línea **Descubrimiento** indica entonces **Unavailable** (no
disponible), **Resolved** (resuelto) o **Ambiguous** (ambiguo: más de una
pista para la misma ubicación). Una vez resuelto, muestra las mismas líneas
Material, Origen y Verificación que arriba.

Hoy solo resuelve sus propias publicaciones: las que usted firmó y todavía
tiene en este dispositivo. Piénselo como “¿mi construcción está de verdad
allá afuera, intacta?”, no como una búsqueda en el trabajo de todos.

Cuando un resultado indica **Verified**, **Seleccionar Mundo compartido**
lo marca como aquel con el que está trabajando, en una nota debajo. Es
todo lo que hace: no envía ni comprueba nada de nuevo. Se queda hasta que
seleccione otro o salga de la página. Cerrar el panel conserva lo que
escribió y encontró.

## Nombres de lugares cercanos — descubrir declaraciones de cualquier persona

**Nombres de lugares**, un grupo de **Cerca** en Explorar, muestra los
nombres que la gente publicó para las regiones del Mundo a su alrededor.
Los busca en Nostr, así que no necesita un par conectado. Empieza plegado,
porque esos nombres todavía no se comprobaron.

Cada fila muestra el nombre, más o menos dónde está, quién lo puso y
cuándo:

- **Navegar** mueve su cámara a esa región, como **Ir**. No renombra ni
  acepta nada.
- **Adoptar** guarda el nombre en este dispositivo, tras la misma
  comprobación de firma que un nombre de un par conectado (consulte
  [Recibir una de un par](09-PublicationsAndEvidence.md#recibir-una-de-un-par)).
  El botón pasa a decir **✓ Ya guardado**.

Cuando dos personas nombraron el mismo terreno, aparecen los dos nombres.
ForkBuild nunca elige un ganador, y adoptar uno no significa que sea más
correcto. Si la búsqueda falla, un aviso lo dice y los nombres que ya vio
se quedan. Para publicar un nombre usted mismo, consulte
[Nombrar un lugar](09-PublicationsAndEvidence.md#nombrar-un-lugar).

## Construcciones declaradas — las construcciones de otros, donde sus editores dicen que están

Mientras camina, ForkBuild descarga los Snapshots anunciados cerca de
usted (consulte
[Mi Mundo compartido](#mi-mundo-compartido--distribuir-su-propio-snapshot-sin-necesidad-de-pares)).
Un anuncio puede decir dónde está la construcción, pero eso es solo una
**declaración**: confiar en ella a ciegas dejaría que cualquiera pusiera
una construcción encima de la suya. Por eso una construcción declarada se
muestra como un **fantasma**, con sus bloques transparentes en el lugar
declarado, y nunca se convierte sola en una colocación real.

**Una excepción no necesita ningún clic.** Cuando los editores distribuyen
su propio Snapshot, el anuncio lleva su **colocación firmada**. En cuanto
este dispositivo conoce el Mundo compartido de esa construcción (está en
Explorar, o usted hace clic en **Verificar**), ForkBuild comprueba que la
colocación esté firmada con la clave de ese Mundo compartido. Si lo está,
la construcción se muestra sólida, justo donde la pusieron. Sigue siendo su
colocación, así que usted no puede moverla ni quitarla, y si la mueven y
la vuelven a distribuir, también se mueve para usted. Una posición firmada
por cualquier otra persona sigue siendo un fantasma.

Un fantasma solo se dibuja cuando:

- está cerca de usted (su celda del mapa o las de al lado, unas 1000
  unidades en cada dirección), y desaparece de nuevo cuando se aleja;
- su contenido se descargó y coincide con su hash de contenido;
- este dispositivo todavía no tiene una colocación de esa construcción
  (cuando la tiene, se muestra la construcción real);
- nada de lo que conoce este dispositivo está ya exactamente en ese lugar.

No puede seleccionar, inspeccionar, editar ni copiar un fantasma. Las
construcciones muy grandes solo se dibujan en parte (los primeros miles de
bloques).

Cada fantasma tiene una fila en **Construcciones declaradas**, el más
cercano primero: su título, distancia, posición y “declarado por …”. El
título y el autor vienen de la construcción misma y están tan sin comprobar
como su posición. Cada fila tiene:

- **Navegar**: mueve la cámara al lugar declarado. No cambia nada más.
- **Verificar**: aparece mientras este dispositivo no tiene el Mundo
  compartido firmado de la construcción. Lo busca en Nostr y en Arweave y
  comprueba que esté bien firmado, que sea el Mundo compartido de esta
  construcción y que nombre exactamente el contenido que muestra el
  fantasma. Si todo cuadra, se agrega a Explorar y la fila dice “firmado
  por *nombre* (clave did:key:…)”. Si no, la fila dice por qué: no se
  anunció nada (puede que el editor solo distribuyera el Snapshot), ninguna
  copia estaba bien firmada, o nombra otro contenido. Verificar no acepta
  la posición, pero si llegó con ella la colocación firmada del propio
  editor, la construcción ahora se muestra sólida donde la puso.
- **Aceptar posición**: la única forma de confiar en una declaración.
  Coloca la construcción en el lugar declarado con una colocación *suya*,
  firmada por usted, y desde entonces es una construcción normal de su
  Mundo. Solo funciona cuando este dispositivo tiene el Mundo compartido
  firmado y comprobado del editor, y solo si nombra exactamente el
  contenido que muestra el fantasma. Lo obtiene con **Verificar**, cuando
  [comparten el Mundo con usted](04-PublishingAndForking.md#compartir-con-pares-conectados),
  o cuando el
  [Encuentro](#encuentros-en-el-mundo--publicaciones-y-avatares-que-comparten-sus-pares)
  de un par indica **Available**. También sigue desactivado si el editor
  eligió **Solo yo puedo colocarlo** (consulte
  [Elegir quién puede colocarlo](04-PublishingAndForking.md#elegir-quién-puede-colocarlo)).
  Cuando está desactivado, la fila dice por qué.

  **Qué significa “verificado”.** La construcción es exactamente el
  contenido de un Mundo compartido firmado con la clave que se muestra. No
  prueba quién tiene esa clave (cualquiera puede crear una y llamarse
  “bob”), ni prueba la posición, que sigue siendo solo declarada. Aceptar
  posición también funciona con claves que no conoce; confiar en una es
  decisión suya.
- **Ocultar**: quita ese fantasma y su fila hasta que salga de la Vista del
  mundo. No se informa ni se borra nada.

## Mi Mundo compartido — distribuir su propio Snapshot, sin necesidad de pares

**Mi Mundo compartido**, más abajo en el panel, bajo Buscar y Avatar,
trata de la construcción que tiene abierta. Muestra su título y su autor
cuando está publicada, y funciona haya o no alguien más cerca.

Delante están **Distribuir** y el enlace para compartir. **Distribuir**
abre el mismo [diálogo Distribuir](#el-diálogo-distribuir) que
Encuentros en el Mundo, pero para su propia construcción. Hasta que la
construcción esté publicada, el botón está desactivado, con una nota que
dice que todavía no hay nada que enviar. El pinning remoto de IPFS y el
anclaje en Bitcoin o Base no están aquí: primero necesitan una cuenta o una
billetera, así que están en la página Publicaciones (consulte
[Publicación en IPFS](11-EvidenceAndStorage.md#publicación-en-ipfs) y
[El flujo de anclaje en Bitcoin](11-EvidenceAndStorage.md#el-flujo-de-anclaje-en-bitcoin)).

**Más ▾** guarda las acciones menos frecuentes:

- **Exportar Snapshot** y **Comprobar coincidencia del Snapshot**. Sus
  resultados se quedan en el panel después de cerrar el menú.
- **Herramientas de diagnóstico** (consulte
  [más abajo](#herramientas-de-diagnóstico)).
- **Retirar publicación…** pregunta una vez y luego saca el Mundo del
  catálogo. Sus colocaciones, la construcción y las copias que ya envió se
  quedan; las copias enviadas no se pueden recuperar, pero este
  dispositivo recuerda lo que retiró, así que Explorar no vuelve a
  listarlas. **Cancelar** se echa atrás.

Cuando el Mundo que tiene abierto lo publicó otra persona (por ejemplo, un
par lo compartió con usted), el panel se llama **Mundo compartido** y no
tiene **Retirar publicación** ni **Distribuir**: solo el editor de un Mundo
puede hacer eso. Todo lo demás se queda, comentarios incluidos.

**▸ Comentarios (N)** abre los comentarios de la construcción; el número
se mantiene al día mientras está plegado. Puede escribir cuando la
construcción esté publicada. Quién puede comentar se explica en
[Comentarios](09-PublicationsAndEvidence.md#comentarios).

### Colocaciones

**Colocaciones (N)** lista todos los lugares donde está este Mundo
compartido: posición, revisión y, cuando se conoce, propietario. Una
construcción puede estar en más de un lugar, y se lista cada colocación
que conoce este dispositivo.

- **Mover…** abre **Mover colocación** para esa colocación, con su aviso
  sobre las construcciones que ya están en el nuevo lugar.
- **Quitar…** pregunta una vez y luego saca esa colocación del Mundo. La
  construcción y sus otras colocaciones se quedan. Sin ninguna colocación,
  la construcción simplemente no se muestra en ningún lado hasta que la
  coloque de nuevo.

Los dos están desactivados en una colocación que hizo otra persona.

**Agregar colocación aquí**, bajo la lista, coloca la misma construcción
*otra vez* donde está su avatar (o bajo la cámara, si no tiene uno). No
mueve una colocación existente ni hace una copia: sigue siendo un solo
Mundo compartido (consulte [Colocar o remezclar](#colocar-o-remezclar)). Dice
dónde colocó la construcción y cuántas colocaciones tiene ahora. Si ya hay
una colocación exactamente donde está, le pide que se mueva primero, así
que hacer clic dos veces no apila dos en un mismo lugar.

### Herramientas de diagnóstico

ForkBuild encuentra Snapshots por sí solo mientras camina (vea abajo).
**Herramientas de diagnóstico**, en **Más**, hace los mismos pasos a mano,
para cuando eso no encuentra lo que espera. Cada paso es su propio clic, y
nada se ejecuta solo:

1. **Descubrir Snapshots** lista todo lo anunciado con la etiqueta
   compartida de ForkBuild. Funciona sin pares y sin una construcción
   publicada propia.
2. **Resolver el Snapshot seleccionado** comprueba que el que eligió se
   pueda obtener.
3. **Atribuir el Snapshot seleccionado** comprueba que coincida con el
   hash de contenido de este Mundo compartido. **Materializar el Snapshot
   seleccionado** lo guarda en este dispositivo. Puede hacer cualquiera de
   los dos, en cualquier orden.
4. **Colocar el Snapshot materializado** y luego **Registrar el Snapshot
   colocado** lo agregan al Mundo en el que está, sin recargar.

**Usar la posición declarada**, en cualquier momento después de elegir
uno, usa la posición que declara el propio Snapshot, si tiene una.

**Lo que pasa automáticamente.** Mientras camina, ForkBuild busca
Snapshots de vez en cuando, igual que **Descubrir Snapshots**. Mira lo que
tiene este dispositivo, lo que los pares conectados comparten solo por
estar conectados y lo que informa Nostr. Uno que pasa la comprobación
recorre los mismos pasos por sí solo y aparece como un marcador de
[Encuentros en el Mundo](#encuentros-en-el-mundo--publicaciones-y-avatares-que-comparten-sus-pares);
no hay una lista ni una notificación aparte.

Solo descarga Snapshots cerca de usted: los colocados, o anunciados como
colocados, en su celda del mapa o las de al lado (unas 1000 unidades en
cada dirección), más los 20 más nuevos que no dicen adónde pertenecen. Los
más lejanos se descargan cuando se acerca a ellos. Como máximo se
descargan cuatro a la vez. Uno que este dispositivo ya tiene se lee de su
propio almacenamiento, tras la misma comprobación de contenido.

## ¿Y ahora qué?

Vuelva a la **[Vista del mundo](03-WorldView.md)**, o siga con
**[Distribuir su trabajo](Distribution.md)** para ver todos los lugares adonde
se puede enviar una construcción.
