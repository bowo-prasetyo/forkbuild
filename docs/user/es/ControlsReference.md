<!-- translation-of: docs/user/ControlsReference.md source-hash: 15773095004fb495 -->
# Referencia de controles

<!-- languages -->
[English](../ControlsReference.md) · [Deutsch](../de/ControlsReference.md) · **Español** · [Français](../fr/ControlsReference.md) · [Bahasa Indonesia](../id/ControlsReference.md) · [日本語](../ja/ControlsReference.md) · [한국어](../ko/ControlsReference.md) · [Português (Brasil)](../pt-BR/ControlsReference.md)
<!-- /languages -->

Todas las interacciones con el mouse y el teclado en ForkBuild; los
teléfonos y las tabletas se cubren en
[Pantallas táctiles](#pantallas-táctiles). La Vista del mundo sirve para
mirar alrededor y navegar; todos los controles de construcción (la
selección para editar, las transformaciones, los grupos, el portapapeles,
la colocación y la Paleta de comandos) funcionan solo en el Editor. Los
atajos del Editor son los mismos que aparecen en su Paleta de comandos y
en la superposición **⌨ Atajos**: si alguna vez esta página y la paleta no
coinciden, la paleta tiene razón y esta página tiene un error.

Abra la **Paleta de comandos** con `Ctrl/Cmd+K` en el Editor para buscar
por su nombre todas las operaciones de edición de abajo.

## Cámara (ambas vistas)

| Entrada | Acción |
|---|---|
| Arrastrar con el botón izquierdo en un espacio vacío | Orbitar |
| Arrastrar con el botón derecho | Desplazar la vista |
| Rueda del mouse | Zoom |
| `Inicio` | Editor: restablecer la cámara (se ignora mientras se arrastra un gizmo). Vista del mundo: devolver la cámara y el avatar a su propio mundo actual; consulte la [Vista del mundo](03-WorldView.md#orientación-y-ubicaciones) |

## Superficie de comandos (solo en el Editor)

| Entrada | Acción |
|---|---|
| `Ctrl/Cmd+K` | Paleta de comandos |
| `?` | Superposición Atajos de teclado (también desde el botón “⌨ Atajos” de la barra de herramientas): todos los atajos del Editor |

## Descubrimiento (Vista del mundo)

No son atajos de teclado, sino la forma propia de la Vista del mundo de
encontrar cosas: consulte la
[Vista del mundo](03-WorldView.md#encontrar-mundos) para ver la explicación
completa.

| Control | Acción |
|---|---|
| Panel Buscar, **Buscar** | Buscar publicaciones por título o autor, opcionalmente dentro de un radio alrededor de una coordenada |
| **Explorar aquí** | Abrir el diálogo Explorar ubicación centrado en la posición actual de la cámara |
| **¿Qué hay aquí?** | Lo mismo, con un radio fijo pequeño: “qué hay justo aquí” |
| **Enfocar** en un resultado | Llevar la cámara hasta allí y convertirlo en el documento activo (en edición) |
| **Seleccionar** en un resultado | Convertirlo en el documento activo, sin mover la cámara |
| **Inspeccionar** en un resultado | Desplegar en el lugar un resumen de solo lectura |

## Orientación y navegación (Vista del mundo)

Solo navegación de la cámara: ninguno de estos carga un documento, cambia
la selección ni edita nada. Consulte la
[Vista del mundo](03-WorldView.md#orientación-y-ubicaciones).

| Control | Acción |
|---|---|
| Indicador de brújula | Orientación de solo lectura con marcadores según el contexto para las estructuras y los elementos del terreno cercanos |
| **Inicio** | Devolver la cámara y el avatar a su propio mundo actual (vuelve al origen compartido si todavía no enfocó uno propio en esta sesión); consulte la [Vista del mundo](03-WorldView.md#orientación-y-ubicaciones) |
| **Ubicaciones** | Abrir una lista del Mundo, sus estructuras, hitos y lugares, cada uno con un botón **Enfocar** |
| **?** | Mostrar u ocultar los controles de cámara y de caminata |
| 🔔 **Notificaciones** (encabezado de la app, en todas las páginas) | Abrir su **Historial de notificaciones**, un registro de solo lectura, no una acción de cámara; consulte la [Vista del mundo](03-WorldView.md#orientación-y-ubicaciones) |
| **Cámara**: Libre / Primera persona / Tercera persona / Vista de pájaro | Fijar la cámara a una distancia fija de su propio avatar en lugar de volarla usted mismo; haga clic otra vez en la activa para volver a Libre; consulte [Avatares y presencia](06-AvatarsAndPresence.md#perspectiva-de-la-cámara) |

### Descripciones de ubicación según el contexto

Mientras se mueve por el mundo, la interfaz muestra un contexto derivado
como:

- “**Bosque · cerca de Casa**”: está en un bosque, a menos de 50 unidades
  de una estructura
- “**Pradera · río**”: terreno abierto junto a un río
- “**Pradera · lago · cerca de Granero**”: terreno, agua y la estructura
  más cercana

Estas descripciones se calculan a partir de su posición, la ecología del
terreno, la hidrología y las colocaciones de estructuras: no se guarda
nada en el mundo.

## Sonido (ambas vistas)

| Entrada | Acción | Notas |
|---|---|---|
| `M` | Desactivar o activar el sonido | Igual que el botón **Sonido**; una sola configuración para ambas vistas, que se recuerda en este dispositivo. Consulte la [Vista del mundo](03-WorldView.md#sonido) y [el Editor](02-TheEditor.md#sonido) |

## Movimiento del avatar (Vista del mundo)

Caminar directamente con su avatar, en lugar de volar con la cámara:
consulte [Avatares y presencia](06-AvatarsAndPresence.md#caminar-con-su-avatar).

| Entrada | Acción | Notas |
|---|---|---|
| `W` / `A` / `S` / `D` | Moverse / girar | Lo bloquean los edificios, árboles, animales y habitantes cercanos, igual que una pared |
| `Mayús` (mantener) | Correr | |
| `Espacio` | Saltar | En aguas profundas: subir nadando |
| `C` (mantenida) | Bucear | Solo en agua lo bastante honda para nadar |
| `Alt` + `W` / `S` | Empezar a caminar de forma continua hacia adelante/atrás | Sigue avanzando después de soltar las teclas; un toque normal de `W`/`S` sin Alt lo cancela |
| `Alt` + `Mayús` + `W` / `S` | Empezar a correr de forma continua hacia adelante/atrás | La misma regla de cancelación de arriba |

## Vehículos (Vista del mundo)

Consulte [Avatares y presencia](06-AvatarsAndPresence.md#vehículos).
Requiere el modo de control del avatar; aparece un aviso automáticamente
cuando está lo bastante cerca de un vehículo como para subirse.

| Entrada | Acción | Notas |
|---|---|---|
| `E` | Subirse al vehículo cercano, o bajarse del que conduce | Solo se muestra o funciona cuando hay un vehículo al alcance o usted está arriba de uno |
| `W` / `S` | Acelerar / marcha atrás | Reemplaza la caminata a pie mientras conduce |
| `A` / `D` | Girar la orientación de su propio avatar | El mismo giro que a pie, no la dirección del vehículo |
| `←` / `→` (presionar) | Girar a la izquierda/derecha la dirección en la que intenta avanzar el vehículo | Un solo giro de 45° por pulsación: mantener presionada la tecla no sigue girando |
| `Ctrl` (mantener) | Frenar | |
| `Q` (mientras conduce) | Guardar en su inventario el vehículo que conduce | Lo quita del mundo; al mismo tiempo, usted se baja |
| `Q` (sin conducir, llevando un vehículo) | Sacar el vehículo guardado seleccionado | Aparece en su posición actual con usted arriba; de forma predeterminada, el guardado más recientemente |
| `[` / `]` (llevando 2 o más vehículos) | Pasar la selección para sacar a un vehículo guardado más antiguo / más nuevo | Solo cambia cuál sacará `Q` después: nunca sube ni quita nada por sí solo |

## Animales (Vista del mundo)

Consulte [Avatares y presencia](06-AvatarsAndPresence.md#animales).
Requiere el modo de control del avatar; aparece un aviso automáticamente
cuando hay un animal que se puede atrapar cerca o cuando lleva uno.

| Entrada | Acción | Notas |
|---|---|---|
| `F` (cerca de un animal que se puede atrapar) | Atraparlo | Lo agrega a su inventario y lo quita del mundo |
| `F` (sin un animal que atrapar cerca, llevando uno) | Soltar el animal atrapado más recientemente | Aparece en su posición actual, y se puede volver a atrapar |
| `G` (cerca de un animal que soltó) | Decorar el Mundo con él | Lo guarda en el contenido del Mundo como decoración: ya no se puede atrapar; requiere acceso de EDICIÓN. Aparece un aviso cuando `G` haría algo |
| `G` (cerca de una decoración animal, sin ningún animal soltado cerca) | Deshacer la decoración | La quita del Mundo y la vuelve a convertir en un animal vivo que se puede atrapar |

## Habitantes (Vista del mundo)

Consulte [Avatares y presencia](06-AvatarsAndPresence.md#habitantes).
Requiere el modo de control del avatar; los botones **Agregar habitante
aquí** / **Quitar habitante** y **Hablar** de la sección Avatar hacen lo
mismo sin él.

| Entrada | Acción | Notas |
|---|---|---|
| `R` (en terreno abierto, sin ningún habitante justo al lado) | Agregar un habitante cuyo hogar es donde está parado | Se guarda en el contenido del Mundo; requiere acceso de EDICIÓN. No en un techo, en el agua ni mientras conduce |
| `R` (junto a un habitante) | Quitarlo de su Mundo | Aparece el aviso **[R] Quitar habitante**; deshaga con `Ctrl/Cmd+Z` |
| `T` (junto a un habitante) | Hablar: le cuenta qué hay alrededor | Se muestra en un globo sobre su cabeza; háblele otra vez para que diga otra cosa. El botón **Hablar** de la sección Avatar y del panel táctil hace lo mismo |
| Botón **Enfocar: …** (mientras se ven las palabras de un habitante) | Mirar lo que mencionó | Solo la cámara; su avatar se queda donde está. Se ofrece para hitos, estructuras, construcciones y vehículos |

Su inventario, los vehículos colocados y los animales soltados se guardan
en este dispositivo y se conservan al recargar: consulte
[Avatares y presencia](06-AvatarsAndPresence.md#qué-se-conserva-al-recargar).

## Selección (Editor; hacer clic en un bloque en la Vista del mundo solo lo inspecciona)

| Entrada | Acción | Notas |
|---|---|---|
| Clic en un bloque | Seleccionarlo (reemplaza la selección) | en la Vista del mundo esto solo abre el panel Inspección; consulte la [Vista del mundo](03-WorldView.md#la-vista-del-mundo-es-de-solo-lectura--se-construye-en-el-editor) |
| `Mayús` + clic | Agregar el bloque a la selección | |
| `Ctrl/Cmd` + clic | Agregar el bloque a la selección o quitarlo | |
| `Mayús` + arrastrar | Selección con recuadro (reemplaza la selección) | `Ctrl/Cmd+Mayús` + arrastrar agrega a la selección; arrastrar sin teclas orbita la cámara |
| `Ctrl/Cmd+A` | Seleccionar todo | |
| `Esc` | Borrar la selección | La cadena propia de Escape del Editor, abajo; el Escape propio de la Vista del mundo solo cierra el panel que esté abierto |
| `Supr` / `Retroceso` | Eliminar la selección: **solo en el Editor** | un paso de deshacer; en la Vista del mundo no tiene ninguna tecla asignada |
| Botón **Enfocar** del panel Selección: **solo en el Editor** | Encuadrar la cámara en los bloques seleccionados, al instante | sin atajo de teclado; solo la cámara: nunca toca el documento, la selección ni el historial de deshacer; solo para selecciones de bloques, no de colocaciones de estructuras |

## Transformar — teclado (solo en el Editor)

| Entrada | Acción |
|---|---|
| `→` / `←` | Mover la selección a lo largo del eje X del mundo |
| `↑` / `↓` | Mover la selección a lo largo del eje Z del mundo |
| `RePág` / `AvPág` | Mover la selección a lo largo del eje Y del mundo |
| `R` | Girar +90° alrededor del pivote de la selección |
| `Mayús+R` | Girar −90° |
| `Mayús` mientras arrastra el gizmo | Modo de precisión (incrementos de 0,1×) |

## Transformar — gizmo (solo en el Editor)

| Entrada | Acción |
|---|---|
| Pasar el cursor sobre un control | Lo resalta |
| Arrastrar un control de eje (X rojo / Y verde / Z azul) | Mover a lo largo de ese eje (con ajuste) |
| Arrastrar el control central (ámbar) | Mover libremente sobre el plano del suelo |
| Arrastrar el anillo de rotación (violeta) | Girar alrededor del pivote (con ajuste) |
| Soltar | Confirmar: exactamente un paso de deshacer |
| `Esc` a mitad del arrastre | Cancelar: no cambia nada, sin historial |

Si un miembro de un arrastre o desplazamiento de varios bloques quedara
sobre un bloque fuera de la selección, soltar allí cancela el gesto en
lugar de confirmarlo: todos los bloques vuelven exactamente adonde
empezaron, sin una nueva entrada de deshacer. Reorganizar bloques dentro
de la misma selección nunca se trata como una colisión.

## Transformar — panel numérico (solo en el Editor)

En la sección **Posición y rotación exactas** del panel Selección.

| Entrada | Acción |
|---|---|
| Escribir en los campos X/Y/Z/R | Valores exactos; campo vacío = sin cambios |
| Interruptor Absoluto / Desplazamiento | Apuntar el pivote o sumar una diferencia simple |
| `Enter` o Aplicar | Una operación, un paso de deshacer: nunca con ajuste |
| `Esc` en un campo, o **Restablecer campos** | Vaciar los campos (nunca borra la selección) |

## Alineación y distribución (solo en el Editor)

Disponible en la sección **Alinear, distribuir, repetir** del panel
Selección y desde la paleta. Alinear requiere **2 o más bloques**;
distribuir requiere **3 o más**. Ambas operan sobre los límites de toda la
selección en los **ejes del mundo** y confirman un solo comando.

## Repetir (solo en el Editor)

También en la sección **Alinear, distribuir, repetir** del panel Selección.
Crea **N** copias adicionales de la selección, desplazadas de forma pareja
a lo largo de un eje, como **un solo paso de deshacer**: se comprueban las
colisiones de todo el lote antes de crear nada, así que una colisión a
mitad del lote bloquea toda la repetición en lugar de crear algunas copias
y otras no.

| Entrada | Acción |
|---|---|
| Campo **Copias** | Cuántas copias adicionales (el original nunca se toca) |
| Campo **Desplazamiento** | Distancia entre cada copia |
| **Repetir X / Y / Z** | Repetir a lo largo de ese eje del mundo |

## Estructuras (Biblioteca de construcción) — solo en el Editor

Componer, bifurcar y su biblioteca personal: consulte
[El Editor](02-TheEditor.md#estructuras-componer-bifurcar-y-su-biblioteca-personal).

| Entrada | Acción | Notas |
|---|---|---|
| Clic en una tarjeta de la pestaña **Estructuras** | Entrar en el modo de colocación de estructuras; la vista previa fantasma sigue al puntero | funciona con una estructura integrada o con una de sus propias **Mis estructuras** |
| `R` / `Mayús+R` mientras coloca | Girar ±90° el fantasma pendiente | las mismas teclas de vista previa de colocación que un bloque |
| Clic | Confirmar: todos los bloques de la estructura se colocan como un solo paso de deshacer | se rechaza en una posición ocupada (roja) |
| `Esc` mientras coloca | Cancelar: no se agrega nada | |
| Menú **⋮** de la tarjeta, **Bifurcar como documento nuevo** | Empezar un documento completamente nuevo que comienza como una copia de esa estructura | nunca modifica la entrada de la biblioteca |
| Menú **⋮** de una tarjeta integrada, **Bifurcar a Mis estructuras** | Agregarla a Mis estructuras tal como está | no se crea ningún documento ni se extrae nada |
| Menú **⋮** de cualquier tarjeta, **Información** | Mostrar un panel de solo lectura con nombre, categoría, bloques, superficie, altura, origen y descripción | nunca se puede editar |
| Selección con **1 o más bloques**, y luego **Crear plano** (sección **Grupos y plano** del panel Selección, o la Paleta de comandos) | Abrir un pequeño diálogo (nombre / categoría / descripción + vista previa); guardar la selección como una entrada nueva en **Mis estructuras** | |
| Menú **⋮** de una tarjeta de **Mis estructuras**, **Cambiar nombre** | Cambiar el nombre de una estructura personal | solo estructuras personales |
| Menú **⋮** de una tarjeta de **Mis estructuras**, **Quitar** | Eliminarla de su biblioteca | nunca toca los bloques ya compuestos o bifurcados a partir de ella |
| Menú **⋮** de cualquier tarjeta, **Exportar plano** | Descargarla como un archivo JSON portátil | integrada o personal |
| Botón **Importar plano** (junto al título Mis estructuras) | Agregar un archivo de plano a su biblioteca como una entrada nueva | identidad nueva, incluso para un archivo reimportado |

## Instancias de estructuras (Editor)

Una **instancia de estructura** coloca un documento guardado entero como
una sola unidad seleccionable (una referencia viva, no una copia): consulte
[El Editor](02-TheEditor.md#instancias-de-estructuras-una-referencia-viva).

| Entrada | Acción | Notas |
|---|---|---|
| Menú desplegable **Recientes** de la barra de herramientas, botón **Colocar** de un documento | Entrar en el modo Colocar estructura con ese documento | hacer clic en el nombre del documento, en cambio, lo abre |
| `R` / `Mayús+R` mientras coloca | Girar ±90° la instancia pendiente | las mismas teclas de vista previa de colocación que un bloque |
| Clic en una instancia colocada (herramienta Seleccionar) | Seleccionarla como una sola unidad, distinta de una selección de bloques | |
| Arrastrar en la ventana gráfica, o el gizmo | Mover / girar la instancia | |
| `Ctrl/Cmd+D` | Duplicar: coloca otra instancia del mismo documento | consulte [Duplicar](#duplicar-solo-en-el-editor): las selecciones de instancias obtienen una instancia nueva en lugar de una copia nueva de bloques |
| Campos **X / Z / Rotación** del panel de la instancia, y luego Aplicar | Fijar una posición y una orientación exactas | Y (la elevación) siempre se deriva del terreno, nunca es un objetivo |
| **Editar documento de origen** en el panel de la instancia | Abrir el documento referenciado para cambiar sus bloques | todas las instancias se actualizan, ya que una instancia es una referencia viva |
| `Supr` / `Retroceso` | Quitar la instancia | nunca toca el documento referenciado |

## Grupos (solo en el Editor)

En la sección **Grupos y plano** del panel Selección; sin nada
seleccionado, el panel muestra sus grupos para que pueda hacer clic en uno
y seleccionarlo.

| Operación | Disponibilidad |
|---|---|
| Grupo nuevo | bloques seleccionados |
| Cambiar nombre / Duplicar / Eliminar grupo | un grupo seleccionado |
| Agregar al grupo / Quitar del grupo | bloques seleccionados y un grupo seleccionado |

Las transformaciones de grupo (mover/girar/alinear/distribuir/numéricas)
operan sobre los bloques miembros resueltos; una transformación nunca
cambia la pertenencia en sí.

## Portapapeles (solo en el Editor)

| Entrada | Acción | Notas |
|---|---|---|
| `Ctrl/Cmd+C`, o **Copiar** en el panel Selección | Copiar | requiere una selección |
| `Ctrl/Cmd+V`, o **Pegar** en el panel Selección | Pegar | el botón aparece cuando el portapapeles tiene algo |

## Duplicar (solo en el Editor)

| Entrada | Acción | Notas |
|---|---|---|
| `Ctrl/Cmd+D` | Duplicar la selección actual en su lugar: un paso de deshacer | funciona con bloques sueltos o un grupo resuelto; una selección de instancia de estructura también se duplica (consulte [Instancias de estructuras](#instancias-de-estructuras-editor)). No toca el portapapeles (ni ningún desplazamiento de pegado pendiente) |

El duplicado pasa a ser la selección activa, así que está listo para
arrastrarlo o desplazarlo de inmediato.

## Historial

| Entrada | Acción | Dónde |
|---|---|---|
| `Ctrl/Cmd+Z` | Deshacer | Editor y Vista del mundo |
| `Ctrl/Cmd+Mayús+Z` o `Ctrl/Cmd+Y` | Rehacer | Editor y Vista del mundo |

En la Vista del mundo, deshacer y rehacer se aplican a sus ediciones de
anotación: hitos, nombres de regiones y decoraciones animales. Su panel
Historial (consulte la
[Vista del mundo](03-WorldView.md#historial--previsualizar-y-restaurar-estados-anteriores))
también puede previsualizarlas y restaurarlas.

## Solo en el Editor

| Entrada | Acción |
|---|---|
| `1` / `2` | Cambiar a la herramienta Seleccionar / Colocar |
| `Ctrl/Cmd+S` | Guardar el documento |

## Colocación (solo en el Editor)

Estas teclas pertenecen a la herramienta Colocar, así que no aparecen en
la Paleta de comandos (allí, `R`/`Mayús+R` giran una *selección*). La Vista
del mundo no tiene herramienta Colocar.

| Entrada | Acción | Notas |
|---|---|---|
| Mover el puntero | La vista previa sigue el suelo o la cara del bloque bajo el cursor | se tiñe de rojo cuando la posición está ocupada |
| `R` | Girar +90° la vista previa pendiente | se mantiene al cambiar de bloque; se restablece al salir del modo Colocar. Si se presiona antes de pasar el cursor por algo, gira la próxima vista previa |
| `Mayús+R` | Girar −90° la vista previa pendiente | |
| Clic | Confirmar la vista previa como un bloque real | se rechaza en una posición ocupada (roja) |
| Muestra de **Color** de la Biblioteca de construcción | Elegir el color de los próximos bloques que coloque | vuelve al color predeterminado del tipo de bloque cuando elige otro tipo; consulte [Colores de los bloques](02-TheEditor.md#colores-de-los-bloques) |

Para cambiar el color de bloques que ya colocó, selecciónelos y use la
muestra de **Color** de la sección Selección: un paso de deshacer por
cambio.

## Pantallas táctiles

En un teléfono o una tableta, las mismas acciones tienen controles en
pantalla. Aparecen siempre que el dispositivo tiene pantalla táctil, así
que una laptop táctil los muestra junto a su teclado y su mouse. En una
pantalla de 720 píxeles de ancho o menos, la página además se reorganiza:
los enlaces de la página se pliegan detrás de un botón **Menú**, el panel
lateral de la Vista del mundo se abre desde un botón **Panel**, y la barra
lateral del Editor se convierte en un cajón que se abre desde un botón
**Herramientas**.

### Cámara (ambas vistas)

| Toque | Acción |
|---|---|
| Arrastrar con un dedo | Orbitar |
| Arrastrar con dos dedos | Desplazar la vista |
| Pellizcar | Zoom |
| Tocar | Vista del mundo: inspeccionar lo que tocó. Editor: lo mismo que un clic con la herramienta actual |

### Caminar (Vista del mundo)

El panel táctil aparece mientras el modo de control del avatar está
activado; el botón **Caminar**, encima del joystick, activa y desactiva el
modo y, con él, el panel.

| Control | Teclas que reemplaza | Notas |
|---|---|---|
| Joystick | `W` / `A` / `S` / `D` | Empuje hacia arriba para caminar hacia adelante, hacia los costados para girar; las diagonales presionan ambas teclas |
| Joystick empujado hasta el borde | `Mayús` | Correr |
| **Saltar** | `Espacio` | En aguas profundas dice **Subir** |
| **Bucear** | `C` | Aparece mientras nada |
| **Crucero** | `Alt` + `W`, luego `Alt` + `Mayús` + `W`, luego `W` | Cada toque: caminar hacia adelante sin manos, luego correr, luego detenerse. Muestra **Crucero: caminar** / **Crucero: correr** mientras está activo. Empujar el joystick hacia adelante o hacia atrás también lo detiene; hacia los costados solo dirige |
| **Subirse** / **Bajarse** | `E` | Aparece cuando hay un vehículo al alcance, o mientras conduce |
| **Guardar** / **Sacar** | `Q` | Aparece cuando puede guardar el vehículo que conduce, o sacar uno guardado. Sacar nombra el vehículo, y su lugar en la lista (como 2/3) cuando lleva más de uno |
| **‹** / **›** junto a Sacar | `[` / `]` | Llevando 2 o más vehículos: elegir uno más antiguo o más nuevo para sacar |
| **Atrapar** / **Soltar** | `F` | Aparece cuando hay un animal que se puede atrapar cerca, o mientras lleva uno |
| **Decorar** / **Deshacer decoración** | `G` | Aparece cerca de un animal que soltó, o cerca de una decoración. A diferencia de `G`, una decoración rechazada (sin sesión iniciada, sin acceso de EDICIÓN) dice por qué |
| **↶** / **↷** | `←` / `→` | Mientras conduce: un giro de 45° por toque |
| **Frenar** | `Ctrl` (mantener) | Mientras conduce |

Los botones del panel reemplazan los avisos del teclado, que se ocultan
mientras se muestra. Una caminata sin manos hacia atrás (`Alt` + `S`) no
tiene botón táctil; una iniciada desde un teclado aparece como **Crucero:
atrás**, y tocarla la detiene.

### Editar (Editor)

Un toque hace lo mismo que un clic: selecciona con la herramienta
Seleccionar, coloca con la herramienta Colocar. Arrastrar solo mueve la
cámara, así que orbitar nunca coloca un bloque ni borra la selección por
accidente. El tacto no tiene cursor flotante, así que la herramienta
Colocar no muestra vista previa antes del toque; el bloque va donde toca.
Elegir un bloque o una estructura para colocar cierra el cajón
Herramientas, para que el siguiente toque llegue a la escena. La barra al
pie de la ventana gráfica reemplaza las teclas:

| Botón | Igual que | Notas |
|---|---|---|
| **Deshacer** / **Rehacer** | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Mayús+Z` | |
| **Girar** | `R` | Mientras coloca, gira el próximo bloque o estructura antes de que toque; si no, gira la selección |
| **Eliminar** | `Supr` | |
| **Múltiple** | `Ctrl/Cmd` + clic | Mientras está activado, cada toque agrega un bloque a la selección o lo quita |
| **Recuadro** | `Mayús` + arrastrar | Mientras está activado, arrastrar con un dedo dibuja un recuadro de selección en lugar de mover la cámara; con **Múltiple** también activado, el recuadro agrega a la selección (`Ctrl/Cmd+Mayús` + arrastrar). La cámara queda quieta mientras Recuadro está activado (un segundo dedo cancela el recuadro en lugar de hacer zoom), así que desactívelo para volver a moverse |
| **Más** | `Ctrl/Cmd+K` | La Paleta de comandos, que llega a todas las demás acciones de edición |

Los controles del gizmo funcionan con el tacto igual que con un mouse, con
**Recuadro** activado o no: arrastre un control.

## Prioridad de Escape (Editor)

Escape depende del contexto, exactamente en este orden:

1. **Campo de texto activo**: lo borra o le quita el foco.
2. **Superposición Atajos de teclado**: la cierra (`?` también la cierra).
3. **Paleta de comandos**: cierra la paleta.
4. **Gesto activo del gizmo**: cancela el arrastre (sin historial).
5. **Selección con recuadro activa**: cancela el recuadro.
6. **En cualquier otro caso**: borra la selección (en el modo Colocar: sale
   de la colocación).

### Escape en la Vista del mundo

Un campo de texto activo sigue teniendo prioridad sobre Escape de la misma
forma; si no, Escape cierra el panel de la Vista del mundo que esté abierto
(el panel Enfocar, un panel de nombres, etc.).
