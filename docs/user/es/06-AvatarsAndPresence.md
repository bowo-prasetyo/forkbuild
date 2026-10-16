<!-- translation-of: docs/user/06-AvatarsAndPresence.md source-hash: 3b81c1f78e8542a3 -->
# 06 — Avatares y presencia

<!-- languages -->
[English](../06-AvatarsAndPresence.md) · [Deutsch](../de/06-AvatarsAndPresence.md) · **Español** · [Français](../fr/06-AvatarsAndPresence.md) · [Bahasa Indonesia](../id/06-AvatarsAndPresence.md) · [日本語](../ja/06-AvatarsAndPresence.md) · [한국어](../ko/06-AvatarsAndPresence.md) · [Português (Brasil)](../pt-BR/06-AvatarsAndPresence.md)
<!-- /languages -->

Su **avatar** es cómo lo ven las demás personas en la Vista del mundo: su
apariencia, su posición y cómo se mueve. Esta guía cubre cómo
personalizarlo, cómo controlar quién puede verlo y cómo interactuar con los
de todos los demás.

## Personalizar su avatar

Abra **Más → Mi avatar** (o haga clic en su nombre en la barra superior):

1. Elija una **Plantilla** (un tipo de cuerpo, por ejemplo “Humanoid 01”)
   en el menú desplegable. Una vista previa plana se actualiza en vivo
   mientras elige.
2. Para cada parte que declara la plantilla (las plantillas integradas
   ofrecen **piel, cabello, camisa, pantalones**), elija una opción en su
   menú desplegable, y un color donde la plantilla lo permita.
3. Active los **accesorios** que ofrezca la plantilla, desde una lista de
   casillas. (Cualquier parte que permita varias opciones a la vez aparece
   como una lista de casillas como esta; la página muestra exactamente las
   partes que declara la plantilla elegida).
4. Configure su **Nombre visible** (hasta 60 caracteres): es el nombre que
   se muestra con su avatar y en Pares y Conversaciones.
5. Haga clic en **Guardar**.

Cambiar de plantilla restablece la apariencia a los valores
predeterminados de esa plantilla: las elecciones no se trasladan de una
plantilla a otra. Aquí no hay vista previa en 3D; ve su avatar real la
primera vez que usted (u otra persona) lo mira en la Vista del mundo.

## Quién puede verlo: dos opciones independientes

La página Mi avatar tiene dos controles de visibilidad separados. Es fácil
confundirlos, así que manténgalos bien diferenciados:

| Opción | Controla |
|---|---|
| **Visibilidad de la presencia** | Quién recibe su *posición en vivo*: si aparece, y dónde, mientras se mueve por la Vista del mundo |
| **Visibilidad del perfil** | Quién recibe su *apariencia*: plantilla, colores, accesorios, nombre visible |

Ambas ofrecen los mismos cuatro niveles, y ambas empiezan en **Pública**:

- **Pública**: cualquiera que esté conectado puede verla.
- **Amigos**: los amigos mutuos, más las identidades que indique
  explícitamente (pegue los ID de identidad, uno por línea). Es una simple
  lista de permitidos, no un flujo de solicitud y aprobación: consulte
  [Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md) para
  saber qué significa “amigo”.
- **Local**: solo otras pestañas de ForkBuild abiertas en este mismo
  navegador; nunca se envía a ningún par, ni siquiera a un amigo.
- **Oculta**: nunca se anuncia, a nadie. Así es como se vuelve invisible.

Cada sección tiene su propio botón **Guardar**: guardar una nunca guarda la
otra. “Guardado.” aparece después de guardar y desaparece en cuanto vuelve
a cambiar esa sección, así que siempre describe lo que está mirando.

Ser amigo de alguien **no** revela por sí solo su avatar: estas dos
opciones deciden lo que realmente se comparte, de forma independiente entre
sí. Y solo afectan a las actualizaciones *futuras*: alguien que ya recibió
su posición o su apariencia conserva lo que tiene; no hay un “olvídame” a
distancia.

También puede activar o desactivar **Mostrar mi avatar** y **Mostrar otros
avatares** directamente en la Vista del mundo, como simples interruptores
de visualización en su propio dispositivo. Hasta que tenga un avatar
propio, la sección Avatar de la Vista del mundo solo muestra **Mostrar
otros avatares** y una nota sobre cómo crear uno; los controles que
necesitan su avatar aparecen cuando lo tiene.

## Ver a otras personas en la Vista del mundo

Cualquier persona cuya presencia usted pueda recibir (según su propia
Visibilidad de la presencia) aparece automáticamente mientras se mueve: no
hace falta una solicitud de amistad para ver un avatar público. Haga clic
en un avatar (o en una entrada del panel **Avatares cercanos**, una simple
lista de todos los que están cerca, con su distancia y su animación
actual) para abrir su **panel de información del avatar**:

- Nombre visible y plantilla del avatar
- Una línea de estado (**Presente / Desactualizado / Ausente**) y una
  etiqueta de confianza (**De confianza / Sin firmar / Contradictorio**)
  que describe qué tan bien verificados están los datos de este avatar
- Posición, distancia (en unidades del Mundo) y animación actual
  (Caminando, Inactivo, …)
- **Seguir avatar**: fija su cámara a sus movimientos
- **Saludar / Agitar la mano / Señalar**: envía un gesto puntual a ese
  avatar
- **Seguir su trabajo**: sigue a la identidad que hay detrás del avatar,
  para que sus nuevas construcciones aparezcan en la página **Siguiendo**
  (consulte
  [Seguir a personas](07-PeerConnectionsAndFriends.md#seguir-a-personas)).
  Solo aparece cuando la presencia del avatar está firmada, porque una
  firma es lo que prueba de quién es el avatar.

Por lo demás, un avatar remoto es solo para mirar: no hay forma de mover,
editar ni eliminar el avatar de otra persona, solo de mirarlo, seguirlo y
hacerle gestos.

Que un avatar cercano aparezca o no depende de hacia dónde está mirando su
**cámara** en ese momento, no de hacia dónde camina su propio avatar: los
dos pueden apuntar en direcciones distintas, sobre todo justo después de
orbitar libremente la cámara. Alguien parado justo en su camino puede ser
completamente invisible mientras su cámara mira hacia otro lado; gire u
orbite la cámara de vuelta hacia esa persona y reaparece.

## Caminar con su avatar

Volar con la cámara ([Vista del mundo](03-WorldView.md#volar-por-el-mundo)) es una
forma de moverse, pero también puede caminar con su avatar directamente con
el **Modo de control del avatar**, que está activado al abrir la Vista del
mundo (**Controlar mi avatar (WASD, Mayús, Espacio)** en **Ajustes del
avatar**). Las teclas se ignoran mientras un campo de texto tiene el foco:
haga clic primero en la vista 3D.

No necesita un nombre para caminar. Hasta que elija uno, camina como
**invitado**: un avatar con el aspecto predeterminado que solo ve usted y
del que no se informa a nadie más. Un invitado puede hablar con los
residentes, pero no puede añadirlos ni quitarlos ni decorar un mundo con un
animal, porque son cambios firmados con un nombre. Elija un nombre (al
publicar, con **Pasear aquí conmigo** o con **Elegir un nombre** en la barra
superior) y el avatar pasa a ser suyo allí donde está, con el aspecto
guardado en **Mi avatar**, y los demás pueden verlo. **Cambiar de nombre →
Seguir sin nombre** lo vuelve a convertir en invitado.

| Tecla | Acción |
|---|---|
| **W / A / S / D** | Moverse / girar |
| **Mayús** | Correr (movimiento más rápido) |
| **Espacio** | Saltar; en aguas profundas, subir nadando |
| **C** (mantenida, en aguas profundas) | Bucear |
| **Alt + W / S** | Caminata continua sin manos hacia adelante/atrás: sigue avanzando después de soltar las teclas |
| **Alt + Mayús + W / S** | Lo mismo, pero corriendo en lugar de caminar |

En un teléfono o una tableta, un joystick en pantalla y unos botones
reemplazan estas teclas: empuje el joystick para caminar y hasta el borde
para correr, y toque **Saltar**. Consulte
[Pantallas táctiles](ControlsReference.md#caminar-vista-del-mundo).

Al caminar se respetan las colisiones con los edificios, árboles y
animales cercanos que están cargados: no puede atravesar las estructuras
cargadas a su alrededor, ni los árboles que se generan como parte del
terreno, ni un venado o un conejo que pasta cerca (consulte
[Vista del mundo](03-WorldView.md#volar-por-el-mundo)). La fauna solo le
bloquea el paso como un árbol, dondequiera que haya deambulado un animal:
puede girar la cabeza para mirarlo, pero nunca se aparta de su camino ni
sufre daño, y un vehículo pasa directamente a través de ella; solo se
detiene la caminata a pie. Un animal que haya atrapado ya no bloquea nada.
Su avatar puede caminar sobre estructuras colocadas, trepar superficies
verticales y recorrer terreno irregular. La cámara sigue a su avatar con
naturalidad mientras se mueve.

Las puertas y los arcos son entradas. Una puerta se abre, alejándose de
usted, cuando se acerca, y se cierra a su paso; también se abre para los
residentes y para las personas que ve, y nadie más ve las puertas que usted
abre. Por la abertura de un arco se pasa, y sus lados y su parte superior son
tan sólidos como parecen. Un arco pequeño es demasiado bajo para pasar, y una
puerta o un arco inclinado de lado le bloquea como cualquier otro bloque.

**Seguir avatar** mantiene la cámara fija en su avatar mientras se mueve,
en lugar de orbitar libremente. También puede seguir los avatares de otros
jugadores para ver adónde van.

### Nadar y bucear

El agua de hasta la mitad de la altura de su avatar se cruza vadeando, más
despacio cuanto más honda es. Si es más profunda, su avatar nada: flota con
la cabeza sobre la superficie y se mueve como en tierra, solo que más
despacio. Mantenga **C** para bucear y **Espacio** para volver a subir; si
suelta ambas, sube despacio hasta la superficie. En primera persona ve el
mundo sobre el agua mientras flota, y el mundo bajo ella cuando bucea.

Bajo el agua su avatar contiene la respiración. Una barra de **Aire** en la
parte superior de la vista muestra cuánto le queda: dos minutos y medio con
los pulmones llenos. Cuando se acaba, su avatar sube a la superficie y se
queda allí unos segundos para recuperar el aliento antes de poder bucear de
nuevo. Nade hasta la orilla y se pondrá de pie y saldrá caminando.

Los demás también lo ven nadar y bucear: cómo se mueve su avatar en el agua
se deduce de dónde está, así que no se envía nada más.

### Perspectiva de la cámara

Junto a Seguir avatar está **Cámara**, una fila de cuatro botones
(**Libre**, **Primera persona**, **Tercera persona** y **Vista de pájaro**)
para fijar su cámara a una distancia fija de su propio avatar en lugar de
volarla usted mismo. Igual que Seguir avatar, requieren un avatar local
(Mi avatar) para habilitarse.

- **Libre** es la cámara orbital común: la predeterminada de la Vista del
  mundo, y la que suponen todos los demás controles de cámara de esta
  guía.
- **Primera persona** pone la cámara a la altura de los ojos de su avatar,
  mirando hacia donde mira él.
- **Tercera persona** se ubica detrás y por encima de su avatar, mirando un
  poco hacia abajo: el clásico encuadre de “ver a su propio personaje”.
- **Vista de pájaro** mira directamente hacia abajo desde muy arriba,
  siguiendo la posición de su avatar pero ignorando a propósito hacia dónde
  mira, para que la vista nunca gire cuando usted gira.

Hacer clic en el botón que ya está activo vuelve a **Libre**. Una
perspectiva de cámara es puramente local: nunca se comparte con un
colaborador y nunca afecta lo que ve otra persona.

Los dos modos se comportan de forma distinta cuando gira: con una
perspectiva fijada (Primera persona o Tercera persona), la cámara se vuelve
a encuadrar según la orientación actual de su avatar en cada movimiento,
así que su vista gira exactamente como usted. Con **Libre** seleccionada,
la cámara ignora a propósito la orientación: girar en el lugar, caminar o
subirse a un vehículo nunca la mueve ni la rota por sí solo; solo lo hacen
sus propios arrastres, desplazamientos y zoom. Si orbita libremente para
mirar hacia un lado y luego se va caminando hacia otro, la cámara sigue
mirando hacia donde la apuntó por última vez, en lugar de seguirlo.

### Movimiento continuo sin manos

Mantener presionada **Alt** mientras toca **W** o **S** hace que su avatar
camine (o, si además mantiene **Mayús**, corra) en esa dirección de forma
continua: sigue avanzando incluso después de soltar todas las teclas,
exactamente como un control de crucero. Tocar **W** o **S** otra vez *sin*
Alt lo cancela y vuelve al movimiento normal con la tecla presionada; tocar
la dirección contraria de la misma forma también lo cancela, en lugar de
invertirlo. En un teclado no hay ningún indicador en pantalla de que está
activo: la única señal es que su avatar sigue caminando por su cuenta.

En un teléfono o una tableta, el botón **Crucero** del panel táctil hace lo
mismo: tóquelo una vez para caminar hacia adelante sin manos, otra vez para
correr y una tercera vez para detenerse. Mientras está activo, indica
**Crucero: caminar** o **Crucero: correr**. Empujar el joystick hacia
adelante o hacia atrás también lo detiene, igual que tocar **W** o **S**;
empujarlo hacia los costados solo lo hace girar, así que puede dirigir
mientras va en crucero.

### Vehículos

Algunos mundos colocan una bicicleta, un biciclo, una carreta de heno o un globo aerostático que su avatar puede conducir en lugar de caminar. Acérquese lo suficiente
a uno y aparece un aviso que le indica con qué tecla subirse:

| Tecla | Acción |
|---|---|
| **E** (cerca de un vehículo) | Subirse |
| **E** (mientras conduce) | Bajarse |
| **W / S** | Acelerar / marcha atrás |
| **A / D** | Girar: un giro suave y continuo del vehículo, con usted encima |
| **← / →** (presionar) | Dirigir: un solo giro de 45° del vehículo por cada pulsación; mantener presionada la tecla no sigue girando, y cada giro necesita una pulsación nueva |
| **Ctrl** (mantener) | Frenar |

Una vez arriba, **W/S** y **Ctrl** manejan el vehículo, mientras que
**A/D** y **←/→** lo giran: no hay un “modo de conducción” aparte que
activar. Usted siempre mira hacia donde apunta su vehículo, y los demás
jugadores lo ven igual. Un vehículo solo gira mientras se mueve, así que
girar estando detenido no hace nada; al retroceder, se mueve hacia atrás
sin darse la vuelta. Al bajarse, su avatar vuelve a estar a
pie en un lugar despejado junto al vehículo. La velocidad máxima, la
aceleración, el frenado y el giro de un vehículo dependen del tipo de
vehículo, y su huella de colisión tiene el tamaño correspondiente: hoy son la bicicleta, el biciclo, la carreta de heno y el globo aerostático, los cuatro vehículos que
los mundos realmente colocan y dibujan. Un biciclo es más rápido que una bicicleta y más difícil de encontrar, una carreta de heno es todavía más rápida y todavía más rara, y un globo aerostático es el más rápido y el más raro de todos.

Un globo aerostático está en el suelo, quieto, exactamente como los otros tres, hasta
que se sube a él y empieza a moverse: mantener **W** o **S** lo levanta del
suelo; soltarlas lo hace bajar. Una vez en el aire, vuela por encima de los
árboles, pero un edificio alto lo bloquea igual que a una carreta, así que
volar no significa ignorar la geometría del mundo. No puede bajarse de un globo en el aire: primero tráigalo de vuelta al suelo.

Las bicicletas, biciclos y carretas se detienen en la orilla. Un globo sigue volando sobre lagos y el mar, y lo deja sobre el agua: aterrícelo,
bájese y su avatar estará nadando. No puede sacar un vehículo con ruedas
de su inventario mientras está en el agua.

#### Llevar un vehículo

¿Encontró un vehículo lejos de donde lo va a necesitar después? Mientras lo
conduce, presione **Q** para guardarlo en su inventario: desaparece del
mundo y usted se baja en el mismo movimiento. Camine a cualquier otro
lugar, presione **Q** otra vez sin estar subido a nada y el vehículo
guardado seleccionado aparece justo donde está parado, con usted ya
arriba. Hoy no hay límite de cuántos vehículos puede llevar a la vez, y un
vehículo guardado nunca reaparece donde lo encontró.

De forma predeterminada, **Q** saca el vehículo que guardó más
recientemente. Si lleva más de uno, presione **[** o **]** para recorrer la
selección hacia atrás o hacia adelante entre todo lo que lleva: el aviso
muestra cuál está seleccionado y su posición (por ejemplo, “Sacar
Bicicleta (1/3)”), para que pueda encontrar uno más antiguo sin tener que
sacar y volver a guardar los demás. Recorrer la selección solo cambia lo
que **Q** sacará después; nunca hace aparecer ni quita nada por sí solo.

#### Conducir con otras personas alrededor

Las personas que pueden ver su avatar también ven lo que conduce: su
bicicleta, biciclo, carreta o globo se dibuja debajo de usted en su
pantalla, mirando hacia donde va, y lo oyen rodar o rugir, cuando se sube y se baja
y cuando frena (consulte “Sonido” en
[03 — Vista del mundo](03-WorldView.md)). Usted ve y oye los de ellas de la
misma forma. Sigue su opción de presencia: quien no puede verlo tampoco se
entera de lo que conduce.

Mientras otra persona conduce un vehículo, su propia copia de ese vehículo
desaparece y no puede subirse a él; el vehículo que usted mismo conduce
siempre sigue siendo suyo. Sin embargo, dónde está un vehículo cuando nadie
lo conduce no se comparte: cuando la otra persona se baja, reaparece en su
pantalla donde lo vio quieto por última vez, que puede no ser donde lo
dejó. Un vehículo guardado con **Q** o sacado en otro lugar también está
solo en la pantalla de su dueño hasta que lo conduce.

### Animales

Algunos mundos tienen fauna: venados en los bosques, conejos en la pradera
abierta. Los animales salvajes deambulan despacio alrededor de donde los
colocó el mundo, sin alejarse nunca más de unos pasos. Acérquese lo
suficiente a uno y aparece un aviso que le indica que presione **F** para
atraparlo. Atraparlo lo agrega a su inventario (el mismo inventario donde
vive un vehículo guardado) y lo quita del mundo.

Camine a cualquier otro lugar y presione **F** otra vez: si no hay nada
que atrapar cerca, esto suelta el animal atrapado más recientemente justo
donde está parado, y se puede volver a atrapar de inmediato si lo quiere de
vuelta. Un animal soltado se queda justo donde lo soltó, pero no queda
congelado: pasta, mira alrededor y de vez en cuando gira hacia otro lado, y
gira la cabeza para mirarlo cuando usted se acerca.
Hoy no hay límite de cuántos animales puede llevar, y atrapar uno nunca
afecta a un vehículo que también lleve, ni al revés: comparten la misma
mochila pero nunca se mezclan.

#### Decorar un Mundo con un animal

Un animal soltado solo vive en su propia sesión. Para que forme parte
duradera del Mundo (por ejemplo, un conejo sentado encima de algo que
construyó), párese junto a un animal que soltó y presione **G**. Se
convierte en una **decoración animal**: se guarda en el contenido propio
del Mundo, así que se incluye cuando ese Mundo se publica o se distribuye,
y todos los que lo abren la ven, exactamente igual que el animal del que
salió. Se queda en el lugar que eligió (así que un conejo en un techo nunca
se va caminando), pero pasta, mira alrededor y gira en el lugar, y todos
los que abren el Mundo la ven hacer lo mismo en el mismo momento.

Una decoración es solo decorativa: no se puede atrapar con **F**. ¿Cambió
de opinión? Párese junto a ella y presione **G** otra vez: la decoración se
quita del Mundo y vuelve a ser un animal vivo que se puede atrapar. Cuando
hay de los dos cerca, **G** primero decora un animal recién soltado, igual
que **F** prefiere atrapar antes que soltar. Solo se pueden decorar los
animales que usted soltó: la fauna que colocó el mundo por sí solo no. Un
aviso aparece cuando **G** decoraría o desharía algo cercano. Igual que
agregar un [hito](03-WorldView.md#hitos--marcar-un-lugar-que-vale-la-pena-recordar),
decorar requiere un nombre y acceso de EDICIÓN al Mundo en el
que está. En el Mundo publicado de otra persona, la decoración va a su
propia copia de él, siempre que su licencia permita remezclarlo. Si nada de
eso se cumple, **G** simplemente no hace nada; el botón **Decorar** del
panel táctil le dice en cambio por qué.

### Habitantes

Un Mundo puede tener **habitantes**: personas que viven allí y pasean
alrededor de su casa, entre sus edificios.

**Agregar y quitar uno.** Párese en suelo abierto donde quiera que viva y
presione **R**, o haga clic en **Agregar habitante aquí** en la sección
**Avatar**. Aparece justo a su lado. Para quitar uno, párese junto a él y
presione **R** otra vez (aparece el aviso **[R] Quitar habitante**), o
deshaga con **Ctrl/Cmd+Z**.

- Tiene que poder editar el Mundo en el que está. En el Mundo publicado de
  otra persona, el habitante va a su propia copia.
- Un habitante necesita suelo seco y abierto: no un tejado ni el agua, y
  no mientras usted va en un vehículo. Cuando no se puede agregar, la
  sección Avatar dice por qué.
- Los habitantes forman parte del Mundo, como un
  [hito](03-WorldView.md#hitos--marcar-un-lugar-que-vale-la-pena-recordar):
  se guardan, se publican y se copian con él.

**Cómo se mueven.** Los habitantes se quedan a unos seis pasos de su casa.
Rodean paredes, árboles y agua, nunca los atraviesan, y de vez en cuando se
detienen a mirar alrededor. Todos ven a cada habitante en el mismo lugar en
el mismo momento, porque dónde está sale del Mundo y del reloj. No se envía
nada entre jugadores. Usted choca con un habitante como con un árbol, pero
él no se aparta, así que uno puede atravesarlo mientras usted está quieto.

**Lo notan.** Cuando se acerca a unos pocos pasos, delante de un habitante
o a su lado, se vuelve hacia usted. Si llega justo a su lado, saluda con la
mano, una vez cada vez que usted se acerca. Como con los animales, esto
solo pasa en su pantalla, y solo con su propio avatar.

**Hablar con un habitante.** Párese junto a uno y presione **T** (aparece
el aviso **[T] Hablar**; la sección Avatar y el panel táctil también tienen
un botón **Hablar**). Le cuenta algo de lo que hay cerca en un globo de
diálogo: una bicicleta o un ciervo, un hito, una construcción y quién la
hizo, alguien que anda por ahí, el lugar donde vive, o una construcción más
lejos. Por ejemplo: *“Hay una construcción
llamada “Hill Fort”, de bob, a unos 3,6 km al noreste.”*

- Las distancias están redondeadas. Las direcciones se dan desde donde
  está el habitante, con el norte hacia donde apunta la brújula.
- Hable otra vez y menciona otra cosa. El globo desaparece a los pocos
  segundos, o cuando usted se aleja.
- Para lo que no se mueve (un hito, una construcción o un vehículo),
  aparece un botón **Enfocar** en la parte inferior de la vista. Lleva la
  cámara a mirarlo, como **Enfocar** en Ubicaciones. Su avatar se queda
  donde está, y al caminar la cámara vuelve si Seguir avatar está activado.

**Ideas para el vecindario.** Una de cada tres veces, o cuando no tiene
otra cosa que decir, un habitante puede preguntarse en voz alta por algo
que el terreno cercano nunca tuvo: un puente sobre un río, un muelle en el
agua, un mirador en lo alto, o un pozo, un pabellón con sombra, un puesto
de mercado o una casita en suelo abierto. Por ejemplo: *«Nadie ha construido nunca un puente sobre el río que está a unos
30 m al este.»*

- Mientras lo dice, aparece un botón como **Construir un puente allí**.
  Abre en el Editor una construcción nueva suya para ese lugar, empezada a
  partir de la estructura de Aldea ya hecha, igual que **Construir aquí**
  en la Vista del mundo. Cuando la publica, queda allí.
- Es solo un pensamiento, nunca una tarea: no se recuerda nada, nadie lo
  comprueba y no hay recompensa.
- El mismo terreno les da a todos el mismo pensamiento. Un lugar que ya
  tiene una construcción cerca no tiene nada que desear.
- Cuando algo ya está allí, el habitante lo dice en su lugar, nombrando la
  construcción si tiene título, con un botón para verla. Por ejemplo:
  *«Alguien ha construido a unos 14 m al este, justo donde siempre
pensé que iría un pozo.»*

**Lo que sabe un habitante** es lo que sabe *su* ForkBuild: las
construcciones de su catálogo, las personas que están aquí con usted, y
los vehículos y animales que nadie se llevó. Otra persona que hable con el
mismo habitante puede oír algo distinto, y nadie más ve lo que le dijo a
usted. Nunca menciona un vehículo que usted guardó o que alguien está
usando, ni un animal que usted atrapó. Las construcciones se nombran con su
título y autor, como en toda la aplicación.

Los habitantes no son personas. No tienen perfil, nunca aparecen en
Personas ni en Cerca, y no se puede hacer clic en ellos para ver
información. Nunca le dan misiones, tareas ni recompensas: simplemente
viven allí, y le cuentan qué hay cerca cuando pregunta.

#### Qué se conserva al recargar

Su inventario (cada vehículo y animal que lleva) se guarda en este
dispositivo, igual que los vehículos que colocó o condujo en algún lugar y
los animales que soltó, justo donde los dejó. Recargar la página o volver
más tarde continúa exactamente donde estaba.

### Percepción espacial y actividad

Cuando hay otras personas presentes, verá indicadores según el contexto
que muestran lo que están haciendo:

- “**Beto: explorando cerca**” aparece junto a su avatar mientras vuela o
  camina.
- “**Alicia: inspeccionando un bloque**” indica que alguien está mirando
  algo de cerca, sin cambiarlo.

Estos indicadores de actividad se derivan de los datos de presencia
espacial y lo ayudan a entender qué están mirando los demás sin necesidad
de comunicarse explícitamente.

Los indicadores de actividad solo describen lo que hace alguien; nunca
cambian nada: consulte
[Ver a otros colaboradores](03-WorldView.md#ver-a-otros-colaboradores).

## ¿Y ahora qué?

Encuentre personas con las que conectarse en
**[Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md)**, y
luego chatee con sus amigos en
**[Chat y conversaciones](08-ChatAndConversations.md)**.
