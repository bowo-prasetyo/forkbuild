<!-- translation-of: docs/user/03-WorldView.md source-hash: bf4c383f3135e813 -->
# 03 — Vista del mundo

<!-- languages -->
[English](../03-WorldView.md) · [Deutsch](../de/03-WorldView.md) · **Español** · [Français](../fr/03-WorldView.md) · [Bahasa Indonesia](../id/03-WorldView.md) · [日本語](../ja/03-WorldView.md) · [한국어](../ko/03-WorldView.md) · [Português (Brasil)](../pt-BR/03-WorldView.md)
<!-- /languages -->

La Vista del mundo es el espacio 3D compartido donde **todas las
construcciones publicadas están una junto a otra**. Vuele por él, busque lo
que necesita, descubra lo que otras personas construyeron cerca e
inspeccione sus bloques: la Vista del mundo es una superficie de
exploración de solo lectura, nunca un segundo lugar para construir. En
cuanto quiera cambiar algo, **Editar una copia** le entrega una copia
independiente en el Editor, el único lugar donde se construye en
ForkBuild: consulte
[Editar una copia](#editar-una-copia--llevar-algo-al-editor) más abajo.

Las únicas excepciones son anotaciones, no construcción: nombrar Regiones
del Mundo e [Hitos](#hitos--marcar-un-lugar-que-vale-la-pena-recordar), e
incorporar al Mundo como decoración un animal soltado, con **G**
(consulte
[Avatares y presencia](06-AvatarsAndPresence.md#decorar-un-mundo-con-un-animal)).

**La versión corta:**

| Para… | Haga esto |
|---|---|
| Llegar aquí | **Pasear** en la barra superior, o **Explorar** en cualquier construcción |
| Caminar | `W` `A` `S` `D` para moverse, `Mayús` para correr, `Espacio` para saltar (en un teléfono, el joystick) |
| Mirar alrededor | Arrastre para girar la cámara, use la rueda para hacer zoom |
| Cambiar lo que ve | **Editar una copia** abre su propia copia en el Editor |
| Empezar una construcción justo aquí | **Construir aquí** |
| Traer amigos | **Pasear aquí conmigo** crea un enlace para enviarles |
| Silenciar o activar el sonido | El botón **Sonido**, o `M` |

Todos los controles están en la [Referencia de controles](ControlsReference.md).
Las herramientas de red que hay detrás del Mundo se describen al final, en
[Herramientas avanzadas](#herramientas-avanzadas).

## Abrir la Vista del mundo

![La Vista del mundo en la plaza del desafío](../img/es/world-view.jpg)
*La Vista del mundo en la plaza del desafío: el panel lateral a la izquierda, su avatar en la plaza, y el sonido y la brújula arriba a la derecha.*

**Pasear**, en el menú principal, abre la Vista del mundo en la plaza del
reto de esta semana, sin necesidad de una construcción propia. La plaza es
la plaza del pueblo: las seis construcciones ya hechas se alzan a su
alrededor para todos, cada vez que abre la Vista del mundo, listas para
remezclar, y el pueblo de construcciones publicadas crece justo fuera de
ellas (vea [La plaza del reto](04-PublishingAndForking.md#la-plaza-del-reto)).

Desde **Explorar**, haga clic en **Explorar** en cualquier creación, o vaya
directamente a la URL de un mundo. Aparecerá junto a esa creación en el
mundo compartido. Las construcciones que otros enviaron a todos se
encuentran allí y en el reto (vea
[¿Quién puede encontrarla?](04-PublishingAndForking.md#quién-puede-encontrarla)),
y se alzan donde las pusieron quienes las construyeron: los remixes junto a
lo que remezclan, el resto en el pueblo alrededor de la plaza.

## Una vista de visitante, y Avanzado

La Vista del mundo se abre como vista de visitante. Lo que vino a hacer está
en una barra en la parte inferior del Mundo: **Construir aquí**, **Pasear
aquí conmigo** y **Editar una copia** cuando la construcción no es suya. El
panel lateral tiene el nombre de la construcción y quién la hizo (el mismo
nombre en todos los lugares donde se acredita una construcción), y luego
adónde ir y lo que hay a su alrededor. En un teléfono el panel empieza
cerrado, para que el Mundo llene la pantalla; **Panel** lo abre. En la
plaza, un teléfono muestra en su lugar una línea sobre el Mundo,
**Plaza: …** y cuántas construcciones hay allí, que abre el panel. Quién se
dibuja, y si las teclas mueven su avatar y la cámara lo sigue, están
activados para todos y esperan en **Ajustes del avatar**; la elección de
cámara sigue a su lado. Las herramientas de las redes que hay
detrás del Mundo esperan al final del panel, en **Mostrar herramientas
avanzadas**:

- las coordenadas sobre la vista, los campos **Ubicación** de Buscar y la
  línea **Cámara · Edición** de la
  cabecera (vea [Cámara y edición](#cámara-y-edición));
- los grupos **Nombres de lugares**, **Construcciones declaradas** y
  **Encuentros en el Mundo** de Cerca, con **Descubrimiento de Mundos
  compartidos** dentro de los Encuentros;
- **Mi Mundo compartido**, el panel de red de su publicación, y **Mover
  colocación** a su lado;
- la lista de Mundos que no se pudieron cargar y los diagnósticos de avatares;
- seleccionar con un clic: como visitante, hacer clic en la vista (para
  empezar a caminar, por ejemplo) no selecciona nada salvo otro avatar, así
  que no se abren los detalles de ningún bloque; con Avanzado activado, un
  clic abre
  [Inspeccionar un bloque](#inspeccionar-un-bloque--o-una-estructura-colocada).

La elección se recuerda en este dispositivo y no cambia nada para nadie más.
La brújula, los nombres de lugares de abajo, Buscar, Ubicaciones, el Mapa y
Lugares, su avatar y Guardar y Publicar de la construcción siguen en ambas
vistas. Las construcciones cuyos editores declaran un lugar cercano se siguen
dibujando como fantasmas tenues; su lista está en Avanzado.

## Volar por el mundo

- **Arrastrar con el botón izquierdo**: orbitar la cámara
- **Arrastrar con el botón derecho**: desplazar la vista
- **Rueda**: acercar y alejar
- **Inicio** (la tecla, o el botón del panel): volver a su propio mundo
  (consulte más abajo)

A medida que se mueve, los mundos cercanos **se cargan y descargan**
automáticamente. El panel de la izquierda se lee de arriba abajo: lo que
está mirando (el encabezado), adónde puede ir (Inicio, Ubicaciones y las
pestañas Explorar / Mapa / Lugares), lo que hay a su alrededor (Cerca) y
luego sus propias herramientas: Buscar, Avatar y Mi Mundo compartido. Al
final muestra:

- **Mundos a la vista**: los demás mundos cargados a su alrededor en este
  momento (se oculta mientras el único cargado es el mundo en el que está,
  que el encabezado ya nombra)
- **Mundos cercanos**: haga clic en uno para volar directamente hasta él

Arriba de la sección **Cerca** de Explorar también encontrará dos botones,
**Explorar aquí** y **¿Qué hay aquí?**: consulte
[Encontrar mundos](#encontrar-mundos) más abajo.

Al pasar el cursor por el Mundo, lo que está debajo del puntero aparece en
una pequeña tarjeta en la esquina inferior derecha de la vista, así que el
panel en sí nunca salta mientras mueve el mouse.

El suelo en sí se genera de la misma forma para todos a partir de una
semilla compartida: pasto, playa, roca, bosque y tierras de cultivo, lagos,
ríos sinuosos y el mar abierto siguen la elevación y la humedad propias del
terreno, no una ubicación al azar. La tierra alrededor del origen siempre
está seca; si se aleja unas mil unidades llegará a una costa, donde el
suelo desciende por una plataforma hacia un mar profundo, de un azul más
oscuro. Su avatar se adentra en un lago o en el mar, cada vez más despacio
a medida que sube el agua, y cuando el agua supera la mitad de su altura,
nada (vea [Nadar y bucear](06-AvatarsAndPresence.md#nadar-y-bucear)).
Sumérjase y la vista se vuelve de un agua verde azulada: las algas se mecen
en el fondo y pequeños bancos de peces dan vueltas en aguas abiertas, los
mismos peces en los mismos lugares para todos. Es escenografía: nada de ella se
puede editar, y se ve idéntica sin importar quién la mire ni cuándo.

El suelo del bosque tiene su propia mezcla de especies de árboles, a
partir de esa misma semilla: coníferas donde hay más humedad, árboles de
hoja ancha donde es más seco y arbustos en el borde de la pradera; y
venados (en el bosque) y conejos (en la pradera) aparecen junto a ellos
como más escenografía determinada por la semilla. Los árboles se quedan
exactamente donde están. Los animales deambulan despacio alrededor del
lugar donde se los ubicó, nunca a más de unos pasos de él, y se detienen y
giran mientras avanzan: los conejos saltan y los venados caminan
cabeceando. Mientras están quietos, pastan con la cabeza baja en el pasto,
o levantan la vista y miran alrededor (un conejo se sienta sobre las patas
traseras). Acérquese a uno y girará la cabeza para mirarlo: un venado que
pasta se detiene y levanta la cabeza, y un conejo se sienta si usted se
acerca, aunque no lo ven si está justo detrás. Los animales nunca huyen ni
cambian de lugar por usted: la reacción ocurre solo en su pantalla, y los
animales de otras personas las miran a ellas.
Los conejos tienen orejas largas y erguidas y una cola de algodón; los
venados tienen las orejas hacia los costados y una cola corta. Sus
recorridos salen de la misma semilla y del reloj, así que todos los que
miran el mismo lugar en el mismo momento ven los mismos animales en los
mismos lugares. La fauna le bloquea el paso a pie exactamente como un
árbol, dondequiera que haya deambulado un animal (consulte
[Caminar con su avatar](06-AvatarsAndPresence.md#caminar-con-su-avatar)), y
nada de ella se puede editar.

Un Mundo también puede tener **habitantes**: personas que viven allí y
pasean alrededor de sus casas, rodeando los edificios en lugar de
atravesarlos, y que se giran para saludarlo cuando se acerca; hable con uno
y le contará qué hay alrededor. A diferencia de la fauna, forman parte del
contenido propio del Mundo: los agrega su autor. Las casas ya hechas vienen
habitadas: una copia de la Casa, de una cabaña o de otra vivienda ya hecha
empieza con un habitante que vive justo al lado de su puerta principal, y
las que se alzan alrededor de la plaza del reto también tienen el suyo;
quite el suyo con **R** como cualquier otro. Consulte
[Habitantes](06-AvatarsAndPresence.md#habitantes).

### Dentro de una construcción

Entre por una puerta y la construcción que tiene sobre la cabeza se corta,
para que vea la habitación en la que está y no la pared que tiene detrás: su
techo y todo lo que esté más alto que su cabeza, solo de esa construcción,
mientras las paredes se mantienen hasta justo por encima de su estatura.
Con la cámara siguiéndolo, o en **Tercera persona**, la cámara también
entra, detrás y por encima de usted, mirando hacia la habitación, y sube en
lugar de atravesar una pared cuando tiene una justo detrás. **Vista de
pájaro** mira directamente hacia abajo a la habitación; **Primera persona**
la ve con sus propios ojos, sin cortar nada. Vuelva a salir y la
construcción entera se dibuja de nuevo. Solo cambia lo que se dibuja: el
techo sigue ahí, para todos y para caminar.

## Día y noche

El cielo de la Vista del mundo pasa del día a la noche y vuelve cada 40
minutos: un atardecer cálido, una noche azul y con luna, un amanecer rosado
y otra vez el día. Sigue al reloj, así que todas las personas que están en
una construcción ven el mismo cielo en el mismo momento. Al oscurecer, las
ventanas de cristal brillan con luz de lámpara y los **Faroles** se
encienden con su propio color, de modo que un faro indica el camino a puerto
y una aldea parece habitada; los pájaros callan y empiezan los grillos. La
noche nunca es tan oscura que usted no encuentre el camino. Solo la Vista
del mundo tiene noche: el Editor, las imágenes de las construcciones y las
vistas previas de enlaces siempre están a pleno día.

El sol sale por el este, cruza el cielo del sur y se pone por el oeste,
anaranjado cerca del horizonte; cuando se pone, la luna hace el mismo
recorrido durante la noche. La luz sobre las construcciones viene del que
esté en el cielo, así que las paredes que miran al este reciben la mañana y
las que miran al oeste, la tarde.

El sol y la luna proyectan sombras: la suya, la de los árboles, la de los
animales y la de cada construcción, largas por la mañana y por la tarde,
cortas a mediodía y más tenues a la luz de la luna. Caen a unos 45 metros a
su alrededor y se desvanecen un momento mientras el sol cede el cielo a la
luna y al revés. Las sombras le cuestan más a un teléfono que a un
ordenador, así que empiezan activadas con ratón y desactivadas en un teléfono
o tableta; marque o desmarque **Sombras** al final del panel para cambiarlo
en este dispositivo.

De noche, a medida que oscurece, salen las estrellas, con la Vía Láctea
cruzándolas, y se apagan de nuevo al amanecer. Todo el cielo estrellado gira
despacio alrededor de un punto alto en el norte, así que las estrellas salen
por el este y se ponen por el oeste con la luna, y todos ven las mismas
estrellas en el mismo momento.

Si prefiere que siempre sea de día, marque **Siempre de día** al final del
panel, justo encima de **Sombras**. Se recuerda en
este dispositivo y no cambia nada para nadie más.

## Sonido

**Controles:** el botón **Sonido**, arriba a la derecha de la vista (abajo
a la derecha en un teléfono), o `M`, activa o desactiva todo el sonido; el
control deslizante de al lado ajusta el volumen (en un teléfono o una
tableta, use los botones de volumen del dispositivo). **♪ Música** activa o
desactiva solo la música, y **3D** cambia entre sonido 3D y **Estéreo**
simple. El sonido empieza con su primer clic, toque o tecla, como exigen
los navegadores, y se pausa mientras la pestaña está oculta. ForkBuild
recuerda estas preferencias en este dispositivo, para ambas vistas.

La Vista del mundo reproduce un suave sonido de fondo acorde con el lugar
donde está: viento en terreno alto y rocoso, cantos de pájaros en los
bosques, grillos en los campos y la pradera, agua que golpea suavemente en
un lago y agua que corre junto a un río. Los árboles que lo rodean se oyen
según su tipo: hojas que susurran en bosques de hoja ancha y matorrales,
viento que silba entre las coníferas, más fuerte cuanto más cerca están.
Todo se desvanece a medida que camina de un tipo de terreno a otro.

Su avatar también hace sus propios sonidos. Los pasos siguen el ritmo de
su caminata o su carrera y cambian según lo que pisa: pasto, hojas que
crujen en un bosque, arena blanda en una playa, piedra en terreno alto y
rocoso, chapoteos en un lago o un río, y un golpe hueco sobre bloques.
Saltar hace un silbido, y aterrizar un golpe sordo, más fuerte tras una
caída más larga. Al conducir un vehículo, lo oye: las ruedas y el piñón libre de una bicicleta o un biciclo, el traqueteo de las ruedas de madera de una carreta de heno o el quemador de un globo aerostático, que suben al acelerar y se desvanecen al bajarse; los de ruedas callan cuando están quietos. Subirse y bajarse también tiene su propio sonido (el timbre y la pata de una bicicleta, el crujido y el timbre de un biciclo, las tablas que crujen y el heno que susurra en una carreta, el quemador que ruge y se apaga), y frenar a velocidad hace chirriar, raspar o rechinar los frenos,
más fuerte cuanto más rápido iba.

Los cambios que hace aquí en un Mundo tienen los mismos sonidos breves que
en el Editor: nombrar un hito o una región, agregar o quitar un habitante,
convertir un animal en decoración o deshacerlo, y deshacer y rehacer. Los
cambios que hace un colaborador son silenciosos.

También se oyen los animales y las personas que lo rodean, desde la
dirección en que están y más bajo cuanto más lejos. Un venado resopla y un
conejo golpea el suelo con la pata cuando levanta la vista alerta, y otra
vez, sobresaltado, cuando usted se acerca; puede oír sus pasos cuando pasan
deambulando. Atrapar uno hace un susurro y un pellizco ascendente, y
soltarlo, el mismo descendente. Un habitante tararea un amistoso
“mm-mm” cuando se gira para saludarlo, murmura con una voz propia cuando
le habla, y se oyen sus pasos cuando pasa paseando. Todos los visitantes
oyen al mismo venado levantar la vista en el mismo momento, porque cuándo
lo hace un animal es parte del Mundo.

También se oyen los avatares de otras personas: sus pasos sobre lo que
estén pisando, y sus saltos y aterrizajes, desde donde están. Solo se oye a
las personas que puede ver; oculte los demás avatares y se quedan en
silencio. A alguien que conduce un vehículo se lo oye conducirlo, hasta a
40 m de distancia: las ruedas o el quemador suben y bajan con su velocidad, se oye cuando se
sube y se baja, y un chirrido cuando frena bruscamente (el frenado en sí no
se envía, así que una parada brusca se toma como tal). Solo suenan los vehículos de los tres conductores más cercanos, para que una multitud no tape
todo lo demás.

Los sonidos a su alrededor se ubican en **3D**: adelante o atrás, arriba o
abajo, además de a la izquierda o a la derecha, y giran cuando usted gira
la cámara. Funciona mejor con auriculares. El botón **3D** junto al control
de volumen cambia a izquierda y derecha simples (**Estéreo**), lo que puede
convenir más a un dispositivo lento o a parlantes.

Todo se genera en su navegador, así que no se descarga nada y nunca se
envía ningún sonido. Otras personas oyen sus pasos y su vehículo igual que
usted oye los de ellas: su navegador los produce a partir de donde ya ve a
su avatar caminar o conducir.

La **música** suena suave bajo los sonidos: una melodía tranquila que su
navegador va inventando, cálida de día y más lenta y grave al anochecer,
con pausas silenciosas entre piezas para que se oigan los sonidos del
propio mundo. Nunca suena dos veces exactamente igual. El botón **Sonido**
y el control deslizante la silencian y ajustan su volumen junto con todo
lo demás.

## Orientación y ubicaciones

Junto a las coordenadas de su cámara, una pequeña **brújula** muestra hacia
dónde mira (es de solo lectura: nunca mueve la cámara). Una fila de
botones cerca de la parte superior del panel se ocupa de los
desplazamientos:

- **Inicio** lo lleva, con la cámara y el avatar, de vuelta a su propio
  mundo actual: el que tiene abierto o el último que enfocó. Llega justo
  afuera, nunca dentro, por lejos que se haya ido. Si todavía no enfocó un
  mundo propio en esta sesión, Inicio lo lleva en cambio al centro del mapa
  compartido (que también aparece en “Mundo” en **Ubicaciones**).
- **Ubicaciones** abre una lista de todos los lugares que esta sesión
  conoce en este momento, agrupados en **Mundo**, **Estructuras**,
  **Hitos** y **Lugares**, cada uno con un botón **Enfocar**. Igual que
  Buscar y Explorar aquí / ¿Qué hay aquí?, Enfocar solo mueve la cámara;
  nunca carga, selecciona ni edita nada.
- **👥 N en línea** es el botón **Miembros**: cuenta quién está aquí, y al
  hacer clic abre el panel Miembros del Mundo. Le sigue un botón **Sala**
  cuando el Mundo tiene una sala pública.
- **?** muestra los controles de cámara y de caminata (arrastrar para
  orbitar, la rueda para hacer zoom, y WASD, Mayús y Espacio mientras
  controla su avatar); haga clic otra vez para ocultarlos.

**Notificaciones** es el botón 🔔 del encabezado de la app, junto a
su nombre (o **Elegir un nombre**), así que está en todas las páginas, no solo en la Vista del
mundo. Abre su **Historial de notificaciones**: un registro duradero de las
notificaciones dirigidas a su identidad, con la actividad más reciente
primero. Tres cosas producen una: que alguien comente una publicación que usted
publicó (consulte [Comentarios](09-PublicationsAndEvidence.md#comentarios)), una obra nueva de alguien a quien sigue
(consulte [Seguir a personas](07-PeerConnectionsAndFriends.md#seguir-a-personas))
y que alguien remezcle una de sus construcciones (consulte
[Recuentos de remezclas](04-PublishingAndForking.md#recuentos-de-remezclas)). Cada
entrada dice qué pasó y cuándo, y un botón **Explorar** lo lleva al
Mundo de esa publicación: dentro de la Vista del mundo lo lleva volando, y
en cualquier otro lugar abre la Vista del mundo allí. Es un simple registro
de solo lectura, no una bandeja de entrada: no hay estado de leído/no
leído, no se puede descartar una entrada y el botón no muestra ningún
contador. Se carga una vez al abrirlo, y otra vez solo si hace clic en
**Actualizar**; nunca se actualiza en vivo en segundo plano. Está
vinculado a la identidad con la que inició sesión, no al Mundo o el
documento que tenga abierto.

La brújula muestra los puntos cardinales (N, E, S, O) y su orientación
actual en grados, además de pequeños puntos para las estructuras, los
colaboradores y los hitos cercanos: pase el cursor sobre uno para ver su
etiqueta, o consulte la lista legible debajo de la brújula.

### Notificaciones en este dispositivo

Arriba en el panel, **Avisarme en este dispositivo** deja que su
dispositivo muestre estas notificaciones por sí mismo, como las de
cualquier aplicación: el navegador le pide permiso, y **Desactivar** lo
detiene. Aparecen mientras ForkBuild está abierto pero no delante, en otra
pestaña o como [aplicación instalada](01-GettingStarted.md#instalar-forkbuild) en
segundo plano; al hacer clic en una, ForkBuild se abre en esa construcción.
No se envía nada a ninguna parte para esto, así que un ForkBuild cerrado no
muestra nada: lo que llegó mientras tanto estará en el panel la próxima
vez. Aparecen unas pocas a la vez como mucho, y el resto espera en el
panel. Si el navegador bloquea las notificaciones de ForkBuild, el panel lo
indica; permítalas en la configuración del sitio del navegador para
activarlas.

### Explorar, Mapa y Lugares — tres formas de recorrer, nunca a la vez

Debajo de los botones de navegación hay tres pestañas: **Explorar**,
**Mapa** y **Lugares**. Solo hay una abierta a la vez.

- **Explorar** es la predeterminada. Muestra quién está aquí y algunos
  destinos sugeridos, y luego una sección **Cerca** con grupos plegables:
  **Lugares**, **Hitos** y **Personas**, cada fila con un nombre, una
  distancia y un botón **Ir**. Un grupo solo aparece cuando tiene algo.
  Haga clic en el título de un grupo para desplegarlo o plegarlo; la Vista
  del mundo recuerda cuáles dejó abiertos. Con **Mostrar herramientas
  avanzadas** activado aparecen tres grupos más: **Nombres de lugares**,
  **Construcciones declaradas** y **Encuentros en el Mundo** (consulte
  [Herramientas avanzadas](#herramientas-avanzadas)).
- **Mapa** abre el mismo Mapa del mundo plano, visto desde arriba, que se
  describe más abajo.
- **Lugares** abre el directorio de lugares geográficos que se describe en
  [Lugares geográficos](#lugares-geográficos) más abajo.

Cambiar de pestaña solo cambia lo que muestra el panel: nunca mueve su
avatar ni cambia nada.

### Información — ¿qué estoy mirando?

Junto a la mayoría de los botones **Ir**, en las filas de Cerca de
Explorar y en el panel Ubicaciones, hay un botón **Información**. **Ir**
lleva su cámara allí; **Información** describe el lugar sin mover nada: qué
es, a qué distancia está y en qué lugar con nombre está (“Está en Aldea de
los Sauces”) o cerca de cuál (“Está cerca de Aldea Kawahara”).

Desde el panel Información puede:

- **Ir**: viajar hasta allí;
- **Mostrar en el mapa**: verlo en el Mapa del mundo;
- **Nombres** (para un lugar con nombre): ver, o publicar, cómo lo llama
  la gente;
- **Editar una copia**: abrir su propia copia en el Editor (consulte más
  abajo).

### Editar una copia — llevar algo al Editor

**Editar una copia** es la forma de cambiar algo que encontró en la Vista
del mundo. Hace su propia copia independiente de la construcción y la abre
en el Editor, lista para seguir construyendo. El original nunca se toca.

La encontrará:

- en la barra de abajo del Mundo, cuando la construcción que visita no es
  suya: copia la construcción entera;
- en el panel **Información** de una región, un hito o una estructura
  colocada;
- en el panel **Inspección**, cuando hace clic en un bloque, en suelo vacío
  o en una estructura colocada con **Mostrar herramientas avanzadas**
  activado.

Lo que se copia depende de lo que eligió:

- Para un **hito**, una **región**, un **bloque** o **suelo vacío**, es el
  documento del Mundo al que pertenecen.
- Para una **estructura colocada**, es el contenido propio de la
  estructura, no el Mundo en el que está.

ForkBuild le avisa en cuanto su copia está lista (consulte
[Publicar y remezclar](04-PublishingAndForking.md)). Si no se puede hacer la
copia, un diálogo **No se puede hacer una copia** explica por qué,
normalmente porque la licencia de la construcción no permite copias o
porque todavía no se puede obtener, y **Volver a la construcción** lo
devuelve a donde estaba (consulte
[Cuando una bifurcación no se puede completar](04-PublishingAndForking.md#cuando-una-bifurcación-no-se-puede-completar)).

Un **lugar geográfico** y una **persona** nunca ofrecen Editar una copia:
un lugar geográfico agrupa las regiones de varias personas, sin una única
construcción que copiar (abra una de sus regiones en su lugar).

Editar una copia es la misma acción que **Remezclar** en **Explorar** y en
la página de un autor: una copia nueva y suya, con las mismas reglas de
licencia (consulte
[Bifurcar: hágalo suyo](04-PublishingAndForking.md#bifurcar-hágalo-suyo)).
Todo lo demás en la Vista del mundo, como Buscar, la brújula, el Mapa e
Información, solo sirve para mirar.

### Construir aquí — empezar una construcción para este lugar

**Construir aquí**, junto a **Inicio**, empieza en el Editor una
construcción nueva y vacía para el lugar donde está su avatar (o, si
vuela, el lugar bajo la cámara). El Editor indica para qué mundo es. Al
publicarla, queda justo allí: su primera ubicación es ese lugar en vez de
un terreno libre que elige ForkBuild, e **Ir a verla** le lleva de vuelta
para mirarla. **Olvidar este lugar** deja que se ubique como siempre. El
lugar es solo su propia nota de dónde mostrar su construcción, guardada en
este dispositivo y en sus copias de seguridad; no reclama el terreno, y
otros también pueden construir allí.

### Pasear aquí conmigo — traer a sus amigos a este Mundo

**Pasear aquí conmigo**, junto a **Construir aquí**, crea un enlace que trae
a sus amigos al Mundo en el que está, para recorrerlo juntos. Envíelo como
prefiera; también aparece como código QR para un móvil. Un amigo que lo abre
inicia sesión si aún no lo ha hecho (pasea con su propio avatar y con su
nombre), pulsa **Unirse** y llega a este Mundo, donde se ven caminando. El
diálogo indica quién está en camino y quién ha llegado.

- Primero el Mundo tiene que estar publicado: el ForkBuild de su amigo
  comprueba su firma y su construcción, como con un enlace compartido, y
  guarda una copia.
- El enlace funciona para cualquiera que lo abra durante 30 minutos,
  mientras usted siga en la vista del mundo. Cerrar el diálogo no lo
  detiene; **Detener el enlace** sí. Los amigos que ya se unieron siguen
  conectados en ambos casos.
- Unirse conecta directamente sus dos dispositivos, como una invitación en
  **Pares**: cada uno puede ver la dirección IP del otro, y sus avatares se
  muestran según lo permita la visibilidad de presencia de cada lado (vea
  [Avatares y presencia](06-AvatarsAndPresence.md)). Nadie pasa a ser un par
  recordado ni un amigo si usted no lo elige.
- Necesita un servidor de encuentro. El sitio oficial tiene uno; una copia
  que usted mismo ejecute necesita el suyo (vea
  [Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md)).

### La plaza del reto

**Recorrer la plaza** en la página del reto de una semana abre la vista del
mundo en la plaza del pueblo: pavimentada, con un pozo, bancos y farolas, y
las seis construcciones ya hechas a su alrededor. La plaza y las
construcciones ya hechas forman parte del Mundo, como sus colinas y sus
árboles: se alzan en todas las vistas del mundo, para todos, y no son de
nadie. El pueblo de construcciones publicadas crece justo fuera de ellas,
así que tu propia casa publicada tiene vecinos. Un panel enumera las
participaciones de la semana y las construcciones ya hechas (ver
[La plaza del reto](04-PublishingAndForking.md#la-plaza-del-reto)). No
crecen árboles alrededor de la plaza, y allí no se ofrece **Construir
aquí**.

### Hitos — marcar un lugar que vale la pena recordar

Un **hito** es un punto con nombre que usted pone en un Mundo, como
“Puente viejo” o “Linda vista”, con una descripción opcional. Se coloca
exactamente donde está parado su avatar.

Si tiene acceso de EDICIÓN al Mundo en el que está, la sección Hitos del
panel **Ubicaciones** muestra un botón **+ Agregar hito**. Póngale un
título (y, si quiere, una descripción) y haga clic en **Colocar aquí**:
aparece de inmediato para usted y, unos momentos después, para todos los
demás colaboradores del mismo Mundo, en la brújula, en su propio panel
Ubicaciones y como destino al que se puede ir. Los hitos pertenecen al
Mundo, no a usted: cualquiera con acceso de EDICIÓN puede cambiar el
nombre, la descripción o quitar cualquier hito, no solo quien lo creó.

### El Mapa del mundo

La pestaña **Mapa** abre una vista plana, desde arriba, de todo lo que esta
sesión conoce en este momento en el Mundo: lugares con nombre, hitos,
estructuras, todas las demás personas que están aquí y un marcador para
usted. Use la rueda o +/− para hacer zoom, haga clic en un espacio vacío
para desplazar el mapa, y haga clic en cualquier lugar o persona para
llevar su cámara directamente allí. Nada del mapa se puede editar, y
mirarlo nunca cambia nada: es simplemente una forma de ver de una vez la
geografía que los colaboradores de un Mundo ya construyeron y nombraron,
en lugar de un hito a la vez.

### Lugares geográficos

La pestaña **Lugares** abre un directorio de todos los **lugares
geográficos** que esta sesión identificó: lugares que varias personas
nombraron o describieron de forma independiente (como una región;
consulte la sección Lugares de Ubicaciones) y que resultan ocupar más o
menos el mismo terreno. Haga clic en una fila para abrir su pantalla de
detalle: cuántas descripciones y Mundos abarca, sus propios **Nombres de
la comunidad** y los botones **Ir al lugar** / **Mostrar en el mapa**.
Haga clic en **← Volver** (o presione Escape) para regresar al directorio:
si pasa a Mapa o Explorar y luego vuelve a Lugares, se abre exactamente la
pantalla que dejó, de detalle o de lista.

Los **Nombres de la comunidad** de un lugar muestran sus primeros
nombres; **Más nombres** muestra la lista completa ordenada. Debajo puede
publicar un nombre propio. Todo lo demás (otras descripciones del lugar, el
historial completo de nombres, importar y exportar) está plegado en
**Más**.

> Publicar un nombre lo anuncia a sus pares conectados de la misma forma
> que declarar la autoría de una estructura: consulte
> [Publicaciones y evidencia externa](09-PublicationsAndEvidence.md) si
> quiere ver en un solo lugar todas las declaraciones que este dispositivo
> publicó o conoció.

## Mis mundos — los Mundos que realmente visitó

Haga clic en **Mis mundos** en la barra superior para ver todos los Mundos
que visitó este dispositivo, del más reciente al más antiguo, con su
título, su autor y cuántas estructuras e hitos tiene. Haga clic en
**Seguir explorando** en una tarjeta para volver a entrar directamente.

La lista se guarda solo en este dispositivo y nadie más la ve. Un Mundo
aparece aquí en cuanto estuvo dentro de él. ¿Todavía no visitó ninguno?
**Explore el Repositorio** abre **Explorar**, donde puede encontrar su
primer Mundo o empezar con una construcción ya hecha.

Debajo de los Mundos, **Construcciones que ayudó a hacer** lista las
construcciones en las que un amigo le dio crédito por haberlas construido
juntos con **Construir conmigo** (consulte
[El Editor](02-TheEditor.md#construir-conmigo-construir-juntos-en-vivo)): el
título de cada una, de quién es (**con** su nombre, que abre la página de esa
persona) y **Aún sin publicar** hasta que su amigo la publique; a partir de
entonces, su título abre su Mundo. Sus otros dispositivos también las
listan, una vez conectados a este. La sección solo aparece cuando hay algo
en ella.

## Encontrar mundos

Hay tres formas de encontrar algo en el mundo compartido, y cada una
responde a una pregunta distinta.

### Buscar — “¿qué publicaciones coinciden?”

El panel **Buscar** busca por **título o autor** en todo lo publicado, no
solo en lo que está cargado a su alrededor en este momento. Escriba un
término y haga clic en **Buscar**.

Si quiere, puede limitarlo a una **Ubicación**: complete X/Y/Z y un
**Radio** (en unidades del Mundo) y la búsqueda solo devuelve resultados a
esa distancia de ese punto como máximo. Deje Ubicación vacía para una
búsqueda de texto simple.
(Los campos de ubicación solo aparecen con **Mostrar herramientas avanzadas**.)

Cada resultado muestra:

- 📍 su posición
- 📏 a qué distancia está (solo en una búsqueda por ubicación)
- una nota si la posición mostrada es una **posición predeterminada** y no
  una que el autor eligió de verdad (consulte
  [Posición en el Mundo](#posición-en-el-mundo) más abajo)

Haga clic en **Enfocar** para volar hasta allí.

### Explorar aquí / ¿Qué hay aquí? — “¿qué hay a mi alrededor ahora mismo?”

Estos dos botones, arriba de la sección Cerca de Explorar, buscan **desde
dondequiera que esté su cámara en ese momento**: no necesita conocer ya un
título ni escribir coordenadas.

- **Explorar aquí** busca en un área bastante amplia alrededor de la
  cámara, y le permite ampliar o reducir ese radio después.
- **¿Qué hay aquí?** revisa solo el área inmediata: útil cuando quiere
  saber “¿hay algo justo donde estoy parado?”

Ambos abren el diálogo **Explorar ubicación**:

```
📍 Centro: 100.0, 50.0, 250.0
⭕ Radio: 25 unidades del Mundo

Se muestran 3 de 3 documentos descubribles

📍 Ayuntamiento         📏 A 4.2 unidades del Mundo
de alicia
[Enfocar] [Seleccionar] [Inspeccionar]
```

Cada resultado le ofrece tres acciones distintas:

| Botón | Qué hace |
|---|---|
| **Enfocar** | Lleva la cámara hasta allí *y* lo convierte en el documento que está editando |
| **Seleccionar** | Lo convierte en el documento que está editando, **sin** mover la cámara |
| **Inspeccionar** | Despliega un resumen en línea (título, autor, estado, posición, propietario) sin mover nada |

Este diálogo nunca mueve una colocación, edita un documento ni publica
nada por sí solo: es solo para mirar alrededor y elegir adónde ir después.

### Documentos aquí

Cuando el panel de información de una colocación le indica que otros
documentos comparten su posición exacta, haga clic en **Ver** para abrir
**Documentos aquí**: una lista simple de todo lo que hay en ese lugar,
cada uno con su propio botón **Enfocar**. Solo aparecen aquí los
documentos que todavía están publicados de verdad: si alguno dejó de estar
publicado, simplemente se omite de la lista en lugar de aparecer como una
fila con la que no se puede hacer nada.

## Información del documento y colocación

Debajo del encabezado encontrará dos paneles para el documento que esté
editando:

- **Información del documento**: título, descripción, licencia, quién
  puede colocarlo, estado y (si es una bifurcación) de qué mundo se
  bifurcó. Haga clic en **Editar metadatos** para cambiar el título, la
  descripción, la licencia o quién puede colocarlo.
- **Colocación**: *dónde* está ese documento en el espacio compartido, en
  **unidades del Mundo** (el sistema de coordenadas propio de ForkBuild, no
  coordenadas GPS; una unidad del Mundo representa un metro de longitud
  real). Haga clic en **Mover** para darle directamente nuevas coordenadas
  X/Y/Z, o use los botones de desplazamiento ± (1 / 10 / 100 unidades del
  Mundo) para correr la posición actual de forma relativa antes de
  confirmar. **Enfocar** lo lleva volando hasta allí.

Son dos paneles separados a propósito: qué *es* una creación y dónde
*está* son dos preguntas distintas, y mover una colocación nunca edita el
documento en sí (ni al revés).

### Posición en el Mundo

Si otro documento ya ocupa exactamente el lugar al que se está moviendo,
verá una advertencia con la lista de lo que hay allí antes de que se le
pida confirmar: compartir una ubicación está permitido (una escena de
patio y el edificio que la rodea pueden estar legítimamente en el mismo
lugar), ForkBuild solo se asegura de que usted lo vea primero.

### Colocaciones que no son suyas

Si una colocación pertenece a otra persona, el panel Colocación muestra
**🔒 Colocado por &lt;nombre&gt;: puede ver esta colocación, pero no
moverla** y el botón **Mover** está deshabilitado. Igual puede
**Enfocarla**, inspeccionarla y usar **Editar una copia** para construir
sobre lo que hay; solo *dónde está en el espacio compartido* le corresponde
moverlo a esa persona.

### ¿Por qué puedo colocar construcciones de otras personas?

Un edificio real no se puede levantar y poner en otro lugar, así que puede
parecer raro que ForkBuild le permita colocar la construcción publicada de
cualquiera donde quiera. Una construcción publicada no es un objeto físico
único. Es contenido fijo, identificado por su hash de contenido, de forma
muy parecida a un archivo o un repositorio de Git. Una **colocación** es un
registro aparte y firmado que dice “mostrar esta construcción aquí”. Apunta
a la construcción; no la copia. La misma construcción puede tener muchas
colocaciones, y cada una muestra exactamente el mismo contenido publicado.

Así que colocar la construcción de otra persona nunca mueve ni cambia la
suya:

- **Su colocación se queda donde la puso.** Solo esa persona puede moverla
  (consulte
  [Colocaciones que no son suyas](#colocaciones-que-no-son-suyas) arriba).
- **Su colocación la firma usted**, y solo dice dónde muestra *usted* la
  construcción de esa persona.
- **La construcción conserva su autor y su historial.** Sigue siendo
  exactamente el contenido que esa persona publicó, y cualquiera puede
  comprobarlo contra su hash y su firma.

Tampoco hay un mundo único y central que decida quién es dueño de cada
terreno. Cada Mundo muestra las colocaciones que aceptó. Por eso una
construcción que alguien anuncia cerca de usted aparece solo como un
fantasma hasta que elija **Aceptar posición** (consulte
[Construcciones declaradas](#construcciones-declaradas--las-construcciones-de-otros-donde-sus-editores-dicen-que-están)).
Nadie puede poner una construcción en su Mundo sin su permiso.

Algunas razones para colocar una construcción que no hizo usted:

- **Curar**, como un Mundo galería que reúne construcciones que le gustan.
- **Componer una escena**, como poner el castillo de un amigo junto a su
  aldea.
- **Reutilizarla tal como está.** Colóquela cuando la quiera sin cambios, y
  use [Editar una copia](#editar-una-copia--llevar-algo-al-editor) solo
  cuando quiera cambiarla.

Un editor que no quiera esto puede elegir **Solo yo puedo colocarlo** al
publicar (consulte
[Elegir quién puede colocarlo](04-PublishingAndForking.md#elegir-quién-puede-colocarlo)).
Usted igual puede encontrar, ver y, si la licencia lo permite, bifurcar su
construcción, pero no puede colocarla.

### ¿Por qué dos construcciones pueden estar en el mismo lugar?

En la vida real dos edificios no pueden estar en el mismo lugar. En
ForkBuild sí, porque una colocación no ocupa terreno. Es solo una nota
firmada que dice “mostrar esta construcción aquí”, y dos notas pueden
nombrar el mismo lugar.

ForkBuild lo permite a propósito:

- **Nadie reparte terreno.** No hay ningún servidor central que decida
  quién llegó primero a un lugar, y ForkBuild nunca elige un ganador entre
  dos colocaciones firmadas. Ambas siguen siendo válidas.
- **Cada dispositivo conoce un conjunto distinto de colocaciones.** Un
  lugar ocupado en el dispositivo de su amigo puede seguir vacío en el
  suyo, hasta que las colocaciones le lleguen. Una regla estricta de “una
  construcción por lugar” daría respuestas distintas en dispositivos
  distintos, así que ForkBuild no finge imponerla.
- **A veces es lo que se quiere.** Una escena de patio dentro de un
  edificio, una versión anterior mostrada en lugar de la nueva o
  exhibiciones superpuestas a propósito son construcciones que deben estar
  en el mismo lugar.

Eso no significa que cualquiera pueda amontonarse sobre sus
construcciones:

- **Se le avisa primero.** **Mover…** muestra lo que ya hay en un lugar
  antes de que confirme, y ForkBuild nunca mueve en silencio su
  construcción a otro lugar (consulte
  [Posición en el Mundo](#posición-en-el-mundo)).
- **Sin duplicados accidentales.** **Agregar colocación aquí** se niega
  cuando ya hay una colocación exactamente donde usted está.
- **La declaración de otra persona es solo un fantasma.** Una posición
  anunciada por cualquiera que no sea el editor propio de la construcción
  solo se muestra como un fantasma translúcido, y nunca en un lugar donde
  este dispositivo ya conoce una colocación real (consulte
  [Construcciones declaradas](#construcciones-declaradas--las-construcciones-de-otros-donde-sus-editores-dicen-que-están)).
- **Solo el propietario puede mover o quitar una colocación** (consulte
  [Colocaciones que no son suyas](#colocaciones-que-no-son-suyas)).

ForkBuild solo comprueba si hay construcciones exactamente en el mismo
punto. Dos construcciones en puntos cercanos cuyos bloques se tocan no se
señalan. Para el razonamiento del diseño, consulte
[Overlap Is A Fact; Collision Is A Policy Decision](../../principles/placement.md#overlap-is-a-fact-collision-is-a-policy-decision-0225)
(en inglés) y las reglas que le siguen.

### Colocar o bifurcar

Ambas cosas le permiten tener la construcción de otra persona en un Mundo
suyo, pero son cosas distintas:

| | Colocar | Bifurcar (Bifurcar o Editar una copia) |
|---|---|---|
| Qué se crea | Una colocación: un pequeño registro firmado de dónde mostrar la construcción | Un documento nuevo, con ids nuevos, que le pertenece |
| La construcción | El mismo Mundo compartido, mostrado tal como se publicó | Su propia copia, con una nota que remite al original |
| ¿Puede cambiar los bloques? | No | Sí, en el Editor |
| Quién es el autor | El editor original | Usted, con el original registrado como su antecesor |
| Lo controla | La opción **Quién puede colocarlo** del editor | La licencia |
| Publicarla | No se publica nada nuevo | Crea un Mundo compartido nuevo a su nombre |

Colocar es como enlazar el mismo archivo desde otra página; bifurcar es
como clonar un repositorio para trabajar en su propia copia. Así que solo
una bifurcación es una copia real. Alguien que eligió **Solo yo puedo
colocarlo** igual puede permitir bifurcaciones con su licencia, y una
bifurcación es entonces suya para colocarla donde quiera.

## La Vista del mundo es de solo lectura — se construye en el Editor

Aquí no hay herramienta Colocar, ni gizmo de transformación, ni
copiar/pegar, ni grupos: hacer clic, arrastrar o presionar una tecla nunca
cambia un bloque. Para construir sobre algo, use
**[Editar una copia](#editar-una-copia--llevar-algo-al-editor)** y continúe
en [El Editor](02-TheEditor.md). Las excepciones de anotación indicadas al
principio de esta guía siguen valiendo.

## Ver a otros colaboradores

Cuando hay varias personas en el mismo Mundo:

- **Ver a otras personas**: sus avatares aparecen con nombres visibles e
  indicadores de actividad (por ejemplo, “**Beto: explorando cerca**”).
- **Actualizaciones en tiempo real**: todo lo que publiquen (un hito, un
  nombre, una bifurcación propia nueva) aparece para usted en el momento.
- **Registro de actividad efímero**: un panel local muestra la actividad
  reciente para ayudarlo a entender qué cambió, incluso fuera de su vista
  actual. Este registro es temporal y no se guarda.

> **La presencia describe la actividad; nunca cambia nada por sí sola.**
> La presencia espacial lo ayuda a entender lo que hacen los demás, pero
> solo un cambio real (hecho en el Editor, o una de las excepciones de
> anotación de la Vista del mundo) cambia el entorno compartido.

## Guardar y publicar también aquí

El encabezado tiene los botones **Guardar**, **Publicar** y **Editar
metadatos** siempre que está editando algo, así que puede capturar y
compartir un mundo sin salir de él. La línea de estado (**🔒 Publicado** o
**✎ Editando su copia**) siempre muestra cuál es el caso.

Un mundo publicado nunca puede cambiar. Si el mundo que está editando está
publicado, su primer cambio aquí (editar sus metadatos, agregar o cambiar
el nombre de un hito o una región, o decorarlo con un animal) crea
automáticamente su propia copia editable, titulada *“Bifurcación de
&lt;nombre original&gt;”*, y un breve aviso (“Se creó su propia copia
editable; “…” no cambia”) se lo indica. Sigue las mismas reglas de licencia
que cualquier otra bifurcación (consulte
[Publicar y remezclar](04-PublishingAndForking.md#bifurcar-hágalo-suyo)).

## Historial — previsualizar y restaurar estados anteriores

Cada cambio que hace aquí (agregar, cambiar el nombre o quitar un hito o
una región) queda registrado en el historial del documento. Haga clic en
**Historial** en el encabezado para abrirlo. Verá una lista numerada con
marcas de tiempo, como:

```
1. Crear hito “Puente viejo”
2. Actualizar región “Aldea de los Sauces”
3. Quitar hito
```

Las entradas que deshizo se marcan como **Deshecho**. Hacer clic en una
entrada solo la selecciona; no cambia nada hasta que presione uno de los
botones:

- **Vista previa**: muestra cómo era el mundo *justo después* del paso
  seleccionado, junto al actual, sin cambiar nada. **Cancelar vista
  previa** vuelve al presente.
- **Restaurar**: convierte el paso seleccionado en su estado **actual**.
  El documento queda con cambios sin guardar, así que todavía puede decidir
  si guardarlo. No hay una confirmación aparte.
- **Cerrar**: cierra el panel.

## Herramientas avanzadas

Todo lo de esta sección aparece solo con **Mostrar herramientas
avanzadas** activado, al final del panel (consulte
[Una vista de visitante, y Avanzado](#una-vista-de-visitante-y-avanzado)).
Son para las redes que hay detrás del Mundo: comprobar dónde está guardada
una construcción, enviar la suya a mano y ver lo que otras personas
anunciaron cerca. No necesita ninguna de ellas para caminar, construir,
remezclar ni compartir un enlace.

### Inspeccionar un bloque — o una estructura colocada

Con **Mostrar herramientas avanzadas** activado, haga clic en cualquier
bloque para abrir el panel **Inspección** (como visitante, un clic no
selecciona nada), que le indica:

- Qué tipo de bloque es
- Su posición y su rotación
- A qué mundo y a qué construcción pertenece
- Quién es el autor del mundo

Use **Enfocar bloque** para acercarse, o **Enfocar Mundo** para saltar a la
posición de inicio de esa creación. Justo al lado, un botón **Editar una
copia** bifurca el Mundo al que pertenece este bloque y abre la copia en el
Editor, sin tocar el original. Hacer clic en terreno vacío dentro de una
creación abre el mismo tipo de panel (la posición y el mundo y el autor que
lo contienen, sin los campos propios de un bloque), con su propio botón
**Editar una copia**, por la misma razón: bifurcar no requiere encontrar
primero algo destacado, basta con hacer clic en cualquier lugar dentro del
Mundo sobre el que quiere construir.

Haga clic en una **estructura colocada** (una instancia de un documento
entero, colocada en una creación desde el Editor; consulte
[El Editor](02-TheEditor.md#instancias-de-estructuras-una-referencia-viva))
y el mismo panel muestra en cambio a qué hace referencia: el título de su
documento de origen, la posición local y en el mundo, la rotación, la
elevación del suelo, y el título y el autor del mundo que la contiene. En
la Vista del mundo esto es de solo lectura: no hay gizmo, ni campos
numéricos, ni nada que arrastrar. Haga clic en **Abrir fuente** para ir
directamente al Editor con el documento referenciado en sí; todas sus
demás instancias, dondequiera que estén colocadas, reflejan lo que edite
allí. Su propio botón **Editar una copia**, justo al lado de Abrir fuente,
apunta a ese mismo documento referenciado y no al Mundo que solo lo
posiciona: si prefiere trabajar en una copia independiente, sin tocar las
demás instancias (ni el original), use ese en lugar de Abrir fuente.

Todos los botones “Editar una copia” de la Vista del mundo (aquí y en el
panel Enfocar propio de una región, un hito o una estructura) son la misma
acción; consulte
[Editar una copia](#editar-una-copia--llevar-algo-al-editor) arriba.

### Cámara y edición

(Se muestra con **Mostrar herramientas avanzadas** activado; vea [Una vista de visitante, y Avanzado](#una-vista-de-visitante-y-avanzado).)

El encabezado muestra dos cosas que realmente pueden ser distintas:

```
Cámara: Castillo de Alicia · Edición: Castillo de Beto
```

**Cámara** es lo que está mirando en ese momento: volar a un mundo, o
hacer clic en el botón **Enfocar** de un resultado de búsqueda, mueve allí
la cámara. **Edición** es el documento al que se aplicaría realmente su
próxima acción (agregar un hito o una región, editar los metadatos,
publicar): hacer clic en un bloque o una colocación, o en el botón
**Seleccionar** de un resultado de búsqueda o de ubicación, lo cambia *sin*
mover la cámara. (Cambiar los bloques en sí solo ocurre en el Editor:
consulte [Editar una copia](#editar-una-copia--llevar-algo-al-editor)
arriba).

Normalmente los dos se mueven juntos (Enfocar hace ambas cosas), pero dos
creaciones pueden compartir exactamente el mismo lugar en el mundo:
enfocar una y después la otra no mueve la cámara la segunda vez, pero el
encabezado igual le dice cuál está editando ahora. Volar y mirar cosas
nunca cambia por sí solo lo que está editando; solo lo cambia seleccionar
de verdad un bloque o un documento.

“Ir”, en las filas de Cerca de Explorar y en el panel Información, designa
el mismo mecanismo de mover la cámara que los botones “Enfocar” de Buscar,
Ubicaciones y Colocación: solo cambia la etiqueta; cada uno mueve la
cámara. Lo que haga además (si también cambia el documento que está
editando, como lo hace el Enfocar propio de
[Buscar](#buscar--qué-publicaciones-coinciden)) sigue dependiendo del
contexto, exactamente como se describe en la sección propia de cada panel;
decir “Ir” en lugar de “Enfocar” no cambia nada de eso.

### Encuentros en el Mundo — publicaciones y avatares que comparten sus pares

(Se muestra con **Mostrar herramientas avanzadas** activado; vea [Una vista de visitante, y Avanzado](#una-vista-de-visitante-y-avanzado).)

El grupo **Encuentros en el Mundo**, dentro de la sección Cerca de
Explorar, es un pequeño mapa plano propio (aparte del Mapa del mundo que
se describe más abajo) que ubica dos tipos de cosas de las que le
informaron sus pares conectados: otras **publicaciones** (consulte
[Publicaciones y evidencia externa](09-PublicationsAndEvidence.md))
colocadas cerca, y los **avatares** de otras personas, cada uno con su
propio marcador junto a un marcador para usted.

Haga clic en un marcador para abrir un panel de inspección:

- Un marcador de **publicación** muestra su título, su editor, si está
  firmada, su posición, y cuántos anclajes de evidencia externa y
  ubicaciones de Snapshots tiene.
- Un marcador de **avatar** muestra su nombre visible, su propietario y su
  posición.

Si más de un par conectado ofrece el mismo encuentro, aparece una lista
**Elegir fuente** para que elija qué copia de qué par inspeccionar. Como
todo lo demás en la Vista del mundo, esto es solo para mirar: nada aquí
mueve su cámara ni edita nada.

Si ejecutó **Descubrir Mundo compartido** (más abajo) y encontró una pista
descentralizada (una ubicación en Arweave o Nostr) para la publicación que
seleccionó, una línea **Ubicación** muestra cuál se usará. Cuando coincide
más de una pista, aparece en cambio una lista **Elegir ubicación**: elija
una, y Material/Verificación (abajo) se cargan desde esa ubicación.
Mientras no elija, no se carga nada de ninguna de ellas, y una elección
hecha para un encuentro nunca se traslada a otro.

Seleccionar una publicación también muestra dos bloques de estado más
debajo. **Material** / **Verificación** intentan cargar realmente el
contenido de esa publicación y comprobarlo criptográficamente contra lo
que se declaró de ella. Para el contenido que este dispositivo ya tiene,
eso funciona directamente; para cualquier cosa que le haya mostrado un
par, normalmente indica **Unavailable** (no disponible) / **Unverifiable**
(no verificable), a menos que haya ejecutado aparte **Descubrir Mundo
compartido** (más abajo) para esa misma publicación, en cuyo caso aquí
también se reutiliza la pista descentralizada resuelta que encontró, y
Material / Verificación pueden indicar **Available** (disponible) /
**Verified** (verificado), igual que con un descubrimiento directo. En
cualquier caso, una línea **Fuente** debajo de Material le indica de dónde
vino realmente el contenido inspeccionado: **Local** (ya estaba en este
dispositivo) o **Decentralized** (descentralizado, recuperado mediante una
pista de Arweave/Nostr resuelta); es un simple hecho sobre esta
observación, nunca una puntuación de confianza. Cuando este dispositivo
tiene el material propio de la publicación, aparece un botón
**Distribuir**: haga clic en él para abrir un diálogo **Distribuir**, en
lugar de dejar en pantalla de forma permanente cada selector de
almacenamiento, botón y resultado. Cerrar el diálogo (**Cerrar**, hacer
clic fuera de él o Escape) nunca pierde nada de lo que produjo: al volver
a abrirlo muestra exactamente el mismo resultado, error o estado en curso
en que lo dejó; el diálogo es solo presentación, y nada en él depende de
si está abierto o no.

El diálogo se abre con un solo conjunto de opciones, que se usa para todo
lo que distribuye: un **Almacenamiento** (**Arweave**, **IPFS (Kubo
local)**, **IPFS (pinning remoto)**, que necesita que se escriban un
Endpoint y una Credencial nuevos cada vez, ya que nada de él se guarda,
**Steem** o **Blurt**, experimentales; consulte
[Steem](11-EvidenceAndStorage.md#steem) y
[Blurt](11-EvidenceAndStorage.md#blurt)) y un **Sustrato de anuncio /
descubrimiento** (**Arweave**, **Blurt**, **Nostr** o **Steem**). Ambos se abren con
sus preferencias de proveedor guardadas. Almacenamiento solo muestra los
backends en los que este dispositivo realmente puede ubicar un Snapshot
(más el pinning remoto), así que no puede elegir uno que solo fallaría a
mitad de camino.

Si los dos protocolos de abajo están disponibles, un botón combinado
**Distribuir** aparece justo debajo de esas opciones: es la acción
principal, que distribuye la Declaración firmada y el Snapshot juntos con
la configuración de arriba. No cambia nada de ninguno de los dos
protocolos: cada uno se sigue ejecutando de forma independiente, cada uno
sigue informando en su propia sección de abajo, y un fallo en uno nunca se
oculta tras el otro ni lo bloquea; eso sí, ejecuta los dos uno después del
otro, nunca al mismo tiempo, ya que ambos pueden terminar pidiéndole a la
misma extensión de billetera conectada que firme, y dos solicitudes de
firma lanzadas a la vez son un caso real de fallo de las extensiones. Cada
sección de abajo también tiene su propio botón, más pequeño, **Distribuir
solo la Declaración firmada** / **Distribuir solo el Snapshot**, con la
misma configuración: útil si solo quiere uno de los dos, o reintentar solo
la mitad que falló. (Si solo hay un protocolo disponible, el botón de su
sección es simplemente **Distribuir Declaración firmada** o **Distribuir
Snapshot**).

La sección **Declaración firmada** indica si la publicación ya se envió
aparte mediante la distribución de Arweave/Nostr, y muestra **Ausente**
tanto en **Material** como en **Descubrimiento** hasta que eso ocurra.
Distribuirla sube el material y lo anuncia. Ambos pasos los firma una
extensión del navegador: una billetera de Arweave (como Wander) para
Arweave, y una extensión de firma de Nostr (como nos2x) para Nostr. Sin la
extensión correspondiente instalada, el intento termina con “No se pudo
completar la distribución.” y el motivo. Un intento correcto muestra el id
de la publicación, la ubicación de su **Material** y el id de su anuncio
de **Descubrimiento**: una fila de Descubrimiento por relay cuando
configuró varios
[relays de Nostr](10-NetworkSettings.md#relays-de-nostr).

La sección **Snapshot**, justo debajo en el mismo diálogo, tiene los
mismos requisitos y necesita las mismas extensiones, pero usa otro
protocolo: los Snapshots (consulte
[Publicaciones y evidencia externa](09-PublicationsAndEvidence.md#snapshot-local))
se ubican y descubren independientemente de la distribución de la
Declaración firmada, así que esta sección nunca comparte estado, historial
ni resultado con la sección Declaración firmada de arriba; solo la
configuración. Al hacer clic muestra exactamente lo que se obtuvo: un
**Hash del contenido**, un **Localizador** y un id de **Anuncio**, o “Sin
anuncio” si la ubicación funcionó pero el anuncio de Nostr no, lo que se
informa como un resultado parcial, nunca como un error. Un fallo real
muestra en cambio un simple aviso “No se pudo completar la distribución
del Snapshot.”. Ni el estado ni el resultado de ninguna de las dos
secciones se recuerdan en ningún lugar: seleccionar otro encuentro, o
salir de la página, los borra.

**Una publicación que le mostró un par aquí no queda varada en Encuentros
en el Mundo una vez que realmente se resuelve.** En cuanto el Material de
una publicación mostrada por un par llega a **Available** (su contenido se
carga de verdad y pasa la comprobación), también se admite en el mismo
catálogo que hay detrás de la búsqueda del
[Repositorio](04-PublishingAndForking.md#el-repositorio) y de cada página
de autor, exactamente como si se hubiera encontrado de la forma habitual:
buscar en el Repositorio, o abrir la página de su autor, ahora también la
muestra, y sigue allí después de recargar.
No hay ninguna insignia ni etiqueta aparte que la marque como “encontrada
mediante un par” una vez que está dentro: una tarjeta del Repositorio o una
entrada en la página de un autor se ve idéntica en ambos casos, ya que para
entonces su propio dispositivo verificó de forma independiente el contenido
en sí; solo cambió *cómo se enteró de ella por primera vez*.

### Descubrir Mundo compartido — buscar directamente en redes descentralizadas

Todavía dentro del grupo Encuentros en el Mundo, pero sin necesidad de
hacer clic en un marcador ni de tener un par conectado, hay un botón
**Descubrimiento de Mundos compartidos** que abre una pequeña ventana
emergente propia. Dentro está el panel **Descubrir Mundo compartido**:
ingrese un **id del Mundo compartido** y la **etiqueta de
descubrimiento** con la que se distribuyó, y luego haga clic en
**Descubrir Mundo compartido** para consultarlo directamente en Arweave y
Nostr. El campo de la etiqueta de descubrimiento empieza rellenado con la
etiqueta de campaña compartida propia de ForkBuild (la que habría usado una
publicación distribuida desde esta app), así que en el caso habitual solo
necesita escribir el id del Mundo compartido; sigue siendo un campo
simple, que puede editar libremente si necesita apuntarlo a otra
etiqueta. El resultado muestra una línea **Descubrimiento**
(**Unavailable**, no disponible; **Resolved**, resuelto; o
**Ambiguous**, ambiguo, cuando aparece más de una pista independiente para
la misma ubicación) y, una vez resuelto, la misma lectura de
Material/Fuente/Verificación descrita arriba, con exactamente los mismos
campos y la misma redacción. Hoy esto solo se resuelve para una de sus
propias publicaciones (una que usted firmó y todavía tiene localmente, y
cuya ubicación declarada coincide con lo que informa la red), así que
piense en ello como “¿mi publicación realmente está ahí afuera, intacta?”,
más que como una búsqueda general en el trabajo de todos los demás.
Cerrar la ventana emergente conserva lo que haya escrito o encontrado: al
volver a abrirla continúa justo donde lo dejó, hasta que busque de nuevo o
salga de la página.

Cuando un resultado descubierto vuelve como **Verified** (verificado),
aparece un botón **Seleccionar Mundo compartido**; al hacer clic, ese
resultado queda registrado como “la publicación con la que está trabajando
ahora”, que después se muestra en su propio pequeño aviso debajo.
Seleccionar es solo esa elección explícita: nunca distribuye, vuelve a
verificar ni alimenta su selección local de arriba, y se mantiene aunque
ejecute otra búsqueda, hasta que seleccione otra cosa o salga de la
página. Solo se puede seleccionar un resultado verificado; lo que esté
**Rejected** (rechazado), **Unverifiable** (no verificable) o todavía sin
resolver nunca ofrece el botón.

Los paneles de Encuentros en el Mundo que dependen de marcadores solo
muestran lo que realmente le informó un par conectado ahora o hace poco;
el grupo en sí indica **Todavía no hay nada que encontrar aquí.** hasta que
al menos uno lo haya hecho. Descubrir Mundo compartido es la única
excepción: funciona incluso sin ningún par conectado, ya que consulta
directamente una red descentralizada. Consulte
[Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md) para
conectarse con alguien.

### Nombres de lugares cercanos — descubrir declaraciones de cualquier persona

(Se muestra con **Mostrar herramientas avanzadas** activado; vea [Una vista de visitante, y Avanzado](#una-vista-de-visitante-y-avanzado).)

**Nombres de lugares**, el cuarto grupo de Cerca, muestra declaraciones
firmadas de nombres para las Regiones del Mundo que lo rodean en este
momento, sin necesidad de ningún par conectado. Igual que Descubrir Mundo
compartido, busca directamente en una red descentralizada (Nostr) las
declaraciones etiquetadas con una región cercana; a diferencia de todo lo
demás en Cerca, empieza plegado de forma predeterminada, ya que una
declaración descubierta y sin verificar es algo nuevo y poco conocido para
ver en esta página.

Cada fila muestra el nombre declarado, más o menos dónde está, quién lo
declaró y cuándo. Se ofrecen dos botones:

- **Navegar** mueve su cámara a la región propia de la declaración,
  exactamente como **Ir** en el resto de Cerca. Nunca adopta, verifica ni
  actúa sobre la declaración de ninguna forma, y nunca cambia el nombre de
  nada.
- **Adoptar** guarda la declaración en su propio dispositivo, pasándola
  por la misma comprobación de firma por la que ya pasa una declaración
  que llega de un par conectado (consulte
  [Recibir una de un par](09-PublicationsAndEvidence.md#recibir-una-de-un-par)).
  Una vez adoptada, es simplemente una declaración conocida, como
  cualquier otra: el botón Adoptar de la fila se reemplaza por **✓ Ya
  guardado**, y adoptar de nuevo la misma declaración solo confirma que no
  cambió nada.

Si dos declaraciones nombran el mismo terreno, ambas aparecen aquí: esta
lista nunca elige un “ganador”, y adoptar una nunca significa afirmar que
es más correcta que otra. Si el descubrimiento en sí falla (sin conexión a
un relay, o un error de consulta), un pequeño aviso lo indica, pero las
declaraciones que ya vio siguen en pantalla; nunca se trata como “no hay
declaraciones cercanas”. Consulte
[Nombrar un lugar](09-PublicationsAndEvidence.md#nombrar-un-lugar) para
saber cómo se publica una declaración en primer lugar.

### Construcciones declaradas — las construcciones de otros, donde sus editores dicen que están

(Se muestra con **Mostrar herramientas avanzadas** activado; vea [Una vista de visitante, y Avanzado](#una-vista-de-visitante-y-avanzado).)

Mientras camina, ForkBuild descarga los Snapshots anunciados cerca de usted
(consulte el camino automático de
[Mi Mundo compartido](#mi-mundo-compartido--distribuir-su-propio-snapshot-sin-necesidad-de-pares)).
El anuncio de un Snapshot puede decir dónde lo colocó quien lo publicó,
pero eso es solo una **declaración**: nadie lo comprobó, y confiar en ella
a ciegas permitiría que cualquiera pusiera una construcción encima de la
suya. Por eso una construcción declarada se muestra como un **fantasma**
(sus bloques dibujados translúcidos en la posición declarada) y nunca se
convierte por sí sola en una colocación real.

Hay una excepción, y no requiere ningún clic. Cuando un editor distribuye
su Snapshot, el anuncio también lleva su propia **colocación firmada**. En
cuanto este dispositivo conoce el Mundo compartido de esa construcción
(está en su Repositorio, o usted lo **verifica**), ForkBuild comprueba que
la colocación esté firmada con la clave propia de ese Mundo compartido y,
si lo está, muestra la construcción sólida, exactamente donde la puso su
editor. Sigue siendo la colocación de esa persona, no la suya: no puede
moverla ni quitarla. Si más adelante la mueve y vuelve a distribuirla,
también se mueve para usted. Una posición firmada por cualquier otra
persona sigue siendo un fantasma.

Un fantasma solo se dibuja cuando:

- su posición está cerca de usted (su celda del mapa o las que la rodean,
  unas 1.000 unidades en cada dirección), y vuelve a desaparecer cuando
  usted se aleja;
- su contenido se descargó y coincidió con su hash de contenido;
- este dispositivo todavía no tiene ninguna colocación de esa
  construcción: cuando la tiene, se muestra en cambio la construcción real;
- nada de lo que conoce este dispositivo está ya colocado exactamente en
  ese lugar: una declaración siempre cede ante una colocación real.

No puede seleccionar, inspeccionar, editar ni bifurcar un fantasma en la
vista 3D. Las construcciones muy grandes solo se dibujan en parte (los
primeros miles de bloques).

Cada fantasma también tiene una fila en el grupo **Construcciones
declaradas**, del más cercano al más lejano: su título, su distancia y su
posición, y “declarado por …”; el título y el autor provienen del
contenido propio de la construcción y están tan sin verificar como su
posición. Cada fila tiene:

- **Navegar**: mueve la cámara para mirar el lugar declarado. No cambia
  nada más.
- **Verificar**: aparece mientras este dispositivo todavía no tiene el
  registro firmado del Mundo compartido de la construcción. Busca el
  registro en Nostr y Arweave, comprueba su firma, y comprueba que sea
  exactamente el Mundo compartido de esta construcción y que indique
  exactamente el contenido que muestra el fantasma. Si todo pasa la
  comprobación, el Mundo compartido se agrega a su Repositorio y la fila
  cambia a “firmado por *nombre* (clave did:key:…)”. Si no, la fila dice
  por qué: no se anunció nada (es posible que el editor haya distribuido
  solo el Snapshot; el botón combinado **Distribuir** anuncia ambos),
  ninguna copia estaba firmada válidamente, o el Mundo compartido firmado
  indica otro contenido. Verificar nunca acepta una declaración por sí
  solo; pero si el anuncio llevaba la colocación firmada del editor, la
  construcción aparece ahora sólida donde la puso (consulte arriba), y el
  fantasma desaparece.
- **Aceptar posición**: la única forma de confiar en una declaración.
  Coloca la construcción en la posición declarada con una colocación
  *suya*, firmada por usted como cualquier otra colocación, y a partir de
  entonces es una construcción normal de su Mundo. Solo se habilita cuando
  este dispositivo tiene el registro firmado y verificado del Mundo
  compartido del editor (mediante **Verificar**, cuando esa persona
  comparte el Mundo con usted (consulte
  [Compartir con pares conectados](04-PublishingAndForking.md#compartir-con-pares-conectados);
  entonces aparece en su Repositorio), o cuando el
  [Encuentro en el Mundo](#encuentros-en-el-mundo--publicaciones-y-avatares-que-comparten-sus-pares)
  de un par conectado para ella llega a **Available**) y solo si ese Mundo
  compartido indica exactamente el contenido que muestra el fantasma.
  También sigue deshabilitado cuando el editor de ese Mundo compartido
  eligió **Solo yo puedo colocarlo** (consulte
  [Elegir quién puede colocarlo](04-PublishingAndForking.md#elegir-quién-puede-colocarlo)).
  Siempre que está deshabilitado, la fila dice por qué.

  **Qué significa verificado.** Prueba que la construcción es exactamente
  el contenido de un Mundo compartido firmado por la clave que se muestra.
  No prueba quién tiene esa clave (cualquiera puede crear una y llamarse
  “bob”), y no prueba la posición, que sigue siendo solo declarada.
  Aceptar posición también funciona con claves que no conoce; decidir si
  confiar en una es cosa suya.
- **Ocultar**: quita ese fantasma y su fila hasta que salga de la Vista del
  mundo. No se denuncia ni se elimina nada.

### Mi Mundo compartido — distribuir su propio Snapshot, sin necesidad de pares

(Se muestra con **Mostrar herramientas avanzadas** activado; vea [Una vista de visitante, y Avanzado](#una-vista-de-visitante-y-avanzado).)

Más abajo en el panel, debajo de Buscar y Avatar, hay un panel **Mi Mundo
compartido**, que muestra el título y el autor de su mundo actual una vez
que está publicado de verdad, además de su propio botón **Distribuir**, que
abre exactamente el mismo tipo de diálogo **Distribuir** descrito arriba
para Encuentros en el Mundo: comparten el mismo componente, así que todo
lo relativo a su disposición, su botón combinado **Distribuir**, su
configuración compartida de Almacenamiento/sustrato, sus secciones
**Declaración firmada**/**Snapshot** y su comportamiento de “cerrar nunca
pierde un resultado” es exactamente como se describe en
[Encuentros en el Mundo](#encuentros-en-el-mundo--publicaciones-y-avatares-que-comparten-sus-pares)
arriba. La única diferencia es *qué* distribuye: el diálogo de Encuentros
en el Mundo siempre actúa sobre la publicación encontrada que haya
seleccionado; este siempre actúa sobre *su propio mundo actual*, y ninguno
comparte estado, historial ni resultado con el otro: aquí **Distribuir solo
la Declaración firmada** distribuye la Declaración firmada que respalda su
mundo de la misma forma que el botón propio de Encuentros en el Mundo;
**Distribuir solo el Snapshot** lo distribuye con el protocolo aparte de
Snapshots: consulte
[Snapshot local](09-PublicationsAndEvidence.md#snapshot-local) para saber
qué significa esa distinción. El pinning remoto de IPFS y el anclaje en
Bitcoin/Base siguen en la página Publicaciones (consulte
[Publicación en IPFS](11-EvidenceAndStorage.md#publicación-en-ipfs) y
[El flujo de anclaje en Bitcoin](11-EvidenceAndStorage.md#el-flujo-de-anclaje-en-bitcoin)):
ambos necesitan primero una cuenta o una billetera conectada, así que
ninguno de los dos es un botón de un solo clic aquí.

La idea de Mi Mundo compartido es que nunca depende de que Encuentros en
el Mundo tenga algo que mostrar. Encuentros en el Mundo solo muestra lo que
le informó un par conectado ahora o hace poco: si no hay nadie más
alrededor, queda vacío. Mi Mundo compartido no necesita nada de eso: está
siempre aquí cuando tiene un mundo abierto, haya o no alguien cerca, y esté
o no publicado en ese momento (hasta que lo publique, el botón simplemente
está deshabilitado, con una nota de que todavía no hay nada que
distribuir).

**Distribuir** y el enlace para compartir están adelante. Las acciones
menos frecuentes esperan detrás de **Más ▾**: **Exportar Snapshot**,
**Comprobar coincidencia del Snapshot**, **Herramientas de diagnóstico**
(abajo) y **Retirar publicación…**. Retirar publicación pregunta una vez
antes de actuar (quita el Mundo del catálogo, mientras que sus
colocaciones, el documento y las copias distribuidas se conservan) y
**Cancelar** da marcha atrás.
Las copias que ya distribuyó no se pueden recuperar, pero este dispositivo
recuerda lo que retiró, así que la búsqueda del Repositorio en las redes no
vuelve a mostrarlas. Los resultados de Exportar y Comprobar siguen
en el panel después de cerrar el menú.

Cuando el Mundo que tiene abierto lo publicó otra persona (uno que un par
compartió con usted, por ejemplo), el panel se titula en cambio **Mundo
compartido** y omite **Retirar publicación** y **Distribuir**: solo el
editor propio de un Mundo puede retirarlo o distribuirlo. Sus
colocaciones, las herramientas de Snapshot, el enlace para compartir y los
**Comentarios** se mantienen, así que igual puede leer y publicar
comentarios en el Mundo de cualquiera.

Debajo de todo eso hay una sección **Comentarios**, plegada en una sola
línea **▸ Comentarios (N)** hasta que haga clic en ella (el número se
mantiene actualizado mientras está plegada) y, como todo lo demás en este
panel, limitada a su mundo actual: consulte
[Comentarios](09-PublicationsAndEvidence.md#comentarios) para ver el
panorama completo de quién puede comentar y qué pasa cuando lo hace. Igual
que Distribuir Snapshot, publicar un comentario requiere que antes su
mundo esté publicado; hasta entonces, el cuadro de redacción queda
deshabilitado.

Una lista **Colocaciones (N)** muestra todas las ubicaciones donde está
colocado realmente este Mundo compartido, en el orden en que se
encontraron: posición, revisión y (cuando se conoce) propietario, una fila
por colocación. Nada aquí se reduce a “la última”: un Mundo compartido
realmente puede estar en más de un lugar, y aparece cada colocación que
este dispositivo puede descubrir, nunca un único sustituto, el actualizado
más recientemente, en lugar de las demás.

Cada fila tiene sus propios **Mover…** y **Quitar…**, que actúan
exactamente sobre esa colocación y ninguna otra. **Mover…** abre el mismo
diálogo Mover colocación con X/Y/Z (con su advertencia de superposición)
para esa colocación. **Quitar…** pregunta una vez antes de sacar esa
colocación del Mundo; el Mundo compartido, su documento y las demás
colocaciones se conservan, y quitar la última colocación solo significa
que la construcción deja de aparecer en algún lugar hasta que la vuelva a
colocar. Ambos están deshabilitados en una colocación que hizo otra
persona: solo su propietario puede moverla o quitarla.

**Agregar colocación aquí**, debajo de la lista, coloca la misma
construcción *otra vez* en la posición de su avatar (o, si no tiene, en la
de la cámara): nunca mueve una colocación existente; para eso, use el
**Mover…** de esa colocación. Agrega una colocación, no una copia: la
construcción sigue siendo un solo Mundo compartido (consulte
[Colocar o bifurcar](#colocar-o-bifurcar)). La confirmación indica dónde
se colocó y cuántas colocaciones tiene ahora el Mundo compartido. Si ya hay
una colocación exactamente donde está usted, el botón se niega y le pide
que se mueva primero, para que los clics repetidos no amontonen duplicados
invisibles en un mismo lugar. Una lista vacía solo significa que este
Mundo compartido todavía no se colocó en ningún lugar; un fallo de lectura
muestra en cambio su propio error simple.

Dentro de **Más**, un botón **Herramientas de diagnóstico** (presente solo
cuando está disponible al menos una de las capacidades que hay detrás)
abre una pequeña ventana emergente con herramientas de recuperación
manuales, paso a paso, para cuando el descubrimiento o la ubicación
automáticos de Snapshots no dan lo que espera: **Descubrir Snapshots**
recorre todo lo anunciado con la etiqueta de descubrimiento de la campaña
compartida (accesible incluso sin pares conectados, sin Encuentros en el
Mundo y sin un Mundo compartido propio todavía); seleccionar uno y hacer
clic en **Resolver el Snapshot seleccionado** comprueba si realmente se
puede recuperar; desde allí puede usar **Atribuir el Snapshot
seleccionado** (¿coincide con el hash de contenido de este Mundo
compartido?) y, de forma independiente, **Materializar el Snapshot
seleccionado** (guardar sus bytes en este dispositivo); y, en cualquier
momento después de seleccionar un candidato, **Usar la posición declarada**
adopta la posición que declara el propio Snapshot, si tiene una. Una vez
materializado, **Colocar el Snapshot materializado** y luego **Registrar el
Snapshot colocado** lo agregan realmente al Mundo que está viendo en ese
momento, sin recargar. Cada uno de estos pasos es su propio clic
explícito: nada aquí encadena, reintenta ni ordena un candidato por usted;
es la misma moderación que ya respetan todos los demás flujos manuales,
de un paso a la vez, de ForkBuild.

**El camino automático del que esta ventana es un respaldo se nutre de
más que este dispositivo.** Mientras camina, ForkBuild busca
periódicamente candidatos de Snapshots en segundo plano (la misma
comprobación que **Descubrir Snapshots** ejecuta a mano), y reúne en un
solo conjunto de candidatos lo que este dispositivo ya tiene localmente, lo
que un par conectado compartió de forma pasiva (solo por estar conectado,
sin hacer nada) y lo que informa Nostr. Un candidato que se resuelve pasa
en silencio por la misma cadena resolver → materializar → colocar →
registrar descrita arriba, y aparece exactamente como cualquier otro
marcador de **Encuentro en el Mundo**: no hay una lista ni una
notificación aparte de “descubierto automáticamente”, y los botones
manuales de Herramientas de diagnóstico siguen funcionando exactamente
como se describe, sin cambios, para cuando este camino pasivo no encuentre
lo que usted busca.

El camino automático solo descarga Snapshots cercanos: los colocados, o
anunciados como colocados, en su celda del mapa o en las que la rodean
(unas 1.000 unidades en cada dirección), más los 20 más recientes que no
dicen dónde van. Un Snapshot más lejano se descarga cuando camina cerca de
él. Se descargan como máximo cuatro a la vez. Un Snapshot que este
dispositivo ya descargó se lee de su propio almacenamiento en lugar de
descargarse de nuevo, tras la misma comprobación del contenido.

## ¿Y ahora qué?

¿Listo para compartir lo que hizo, o para remezclar el trabajo de otra
persona? Continúe con
**[Publicar y remezclar](04-PublishingAndForking.md)**.
