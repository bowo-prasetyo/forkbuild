<!-- translation-of: docs/user/02-TheEditor.md source-hash: 651918b44bf2d435 -->
# 02 — El Editor

<!-- languages -->
[English](../02-TheEditor.md) · [Deutsch](../de/02-TheEditor.md) · **Español** · [Bahasa Indonesia](../id/02-TheEditor.md) · [日本語](../ja/02-TheEditor.md) · [Português (Brasil)](../pt-BR/02-TheEditor.md)
<!-- /languages -->

El Editor es donde construye. Esta guía cubre las herramientas, cómo
seleccionar y transformar bloques, y cómo organizar su construcción con
grupos.

## La disposición

```
┌─────────────────────────────────────────────────────────────┐
│ Barra: Guardar · Publicar · Nuevo · Exportar · Importar ·   │
│        Recientes · ⌨ Atajos                                 │
├──────────────────────┬──────────────────────────────────────┤
│ [Seleccionar|Colocar]│                                      │
│ Título del doc.   ✎  │                                      │
│ Selección            │        Ventana gráfica 3D            │
│ Biblioteca de constr.│                                      │
│ [Bloques|Estructuras]│                                      │
│                      │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

- **Barra de herramientas**: guardar, publicar, empezar una creación
  nueva, exportar o importar un documento como archivo, volver a abrir
  documentos recientes y abrir la superposición **⌨ Atajos** (también
  `?`).
- **Herramientas**: alterne entre **Seleccionar** (`1`) y **Colocar**
  (`2`). **Colocar** sigue resaltada mientras coloca un bloque o una
  estructura.
- **Título del documento**: el nombre de la creación abierta. Haga clic en
  **✎** para editar su título, su descripción y su licencia. Si está
  guardada o no se muestra en la barra de herramientas.
- **Selección**: solo muestra lo que puede actuar sobre su selección
  actual; consulte [El panel Selección](#el-panel-selección) más abajo.
- **Biblioteca de construcción**: un cuadro de búsqueda y dos pestañas:
  - **Bloques**: todo lo que puede colocar con la herramienta Colocar,
    como mosaicos en cinco secciones (Básicos, Estructura, Techos y
    escaleras, Aberturas, Detalles). Haga clic en uno para seleccionarlo
    (y pasar a la herramienta Colocar); aparece entonces una muestra de
    **Color** para elegir su color: consulte
    [Colores de los bloques](#colores-de-los-bloques) más abajo.
  - **Estructuras**: veinte estructuras ya hechas en cinco categorías
    (residencial, agrícola, comercial, comunitaria, infraestructura), más
    sus propias **Mis estructuras**. Haga clic en una tarjeta para
    colocarla: consulte
    [Estructuras: componer, bifurcar y su biblioteca personal](#estructuras-componer-bifurcar-y-su-biblioteca-personal)
    más abajo.

### El panel Selección

El panel cambia según lo que tenga seleccionado, así que nunca muestra
botones que todavía no pueden hacer nada:

- **Nada seleccionado**: una breve sugerencia, **Seleccionar todo**,
  **Pegar** cuando haya copiado algo, y sus grupos (haga clic en uno para
  seleccionar sus bloques).
- **Bloques seleccionados**: cuántos hay, dónde están y las acciones de
  todos los días: **Girar ↻ / ↺**, **Duplicar**, **Eliminar**, **Copiar**,
  **Pegar**, **Color**, **Enfocar** y **Deseleccionar**. Las herramientas
  menos frecuentes están plegadas en tres secciones debajo: **Posición y
  rotación exactas**, **Alinear, distribuir, repetir** y **Grupos y
  plano**.
- **Una instancia de estructura seleccionada**: en su lugar, su propia
  tarjeta, con su posición, su rotación y sus acciones (consulte
  [Instancias de estructuras](#instancias-de-estructuras-una-referencia-viva)).

> **Consejo:** Presione `Ctrl/Cmd+K` en cualquier lugar para abrir la
> **Paleta de comandos**: una lista, con búsqueda, de todas las acciones
> de esta guía por su nombre.

## Las dos herramientas

### Herramienta Colocar (`2`)

Elija un bloque de la paleta, pase el cursor por la ventana gráfica y haga
clic para colocarlo. Un fantasma translúcido muestra exactamente dónde
quedará el bloque. Pase el cursor sobre la cara de un bloque existente
para apilarlo o unirlo.

> **Consejo:** Presione **Escape** para volver a la herramienta
> Seleccionar.

### Herramienta Seleccionar (`1`)

Haga clic en los bloques para seleccionarlos y luego muévalos, gírelos o
elimínelos. Aquí es donde pasa la mayor parte del tiempo una vez que la
forma está esbozada.

## Seleccionar bloques

ForkBuild le da un control preciso sobre la selección:

| Acción | Resultado |
|---|---|
| **Clic** en un bloque | Lo selecciona (reemplaza la selección actual) |
| **Ctrl/Cmd + clic** | Agrega ese bloque a la selección o lo quita |
| **Mayús + clic** | Agrega ese bloque a la selección |
| **Mayús + arrastrar** | Dibuja un recuadro: selecciona todo lo que hay dentro |
| **Ctrl/Cmd + Mayús + arrastrar** | Selección con recuadro que se *agrega* a la selección actual |
| **Ctrl/Cmd + A** | Selecciona todos los bloques de la creación |
| **Escape** | Borra la selección |

> **Por qué importa:** Construir algo más grande que un solo bloque
> significa trabajar con *muchos* bloques a la vez. Aprenda pronto la
> selección con Mayús + arrastrar: es la forma más rápida de tomar una
> pared entera.

## Mover, girar y eliminar

Con uno o más bloques seleccionados:

| Tecla | Acción |
|---|---|
| **Flechas** | Desplazar a la izquierda, a la derecha, adelante o atrás |
| **RePág / AvPág** | Desplazar hacia arriba / hacia abajo |
| **R** | Girar 90° en sentido horario |
| **Mayús + R** | Girar 90° en sentido antihorario |
| **Supr / Retroceso** | Quitar los bloques seleccionados |

Cuando selecciona varios bloques, giran alrededor de su **centro común**,
así que toda una sección gira como una sola unidad.

## Colores de los bloques

Cada tipo de bloque tiene su propio color predeterminado, pero usted puede
elegir el suyo:

- **Antes de colocar**: cuando hay un bloque seleccionado en la pestaña
  **Bloques** de la Biblioteca de construcción, haga clic en su muestra de
  **Color** y elija un color. Todos los bloques que coloque a partir de
  entonces lo usan, y el fantasma de colocación lo muestra de antemano.
  Elegir otro tipo de bloque vuelve al color predeterminado de ese tipo
  hasta que elija uno de nuevo.
- **Después de colocar**: seleccione uno o más bloques y use la muestra de
  **Color** de la sección **Selección** para cambiarles el color a todos a
  la vez. Cada cambio se puede deshacer (`Ctrl/Cmd+Z`) como cualquier otra
  edición. La muestra no se ofrece cuando la selección es una instancia de
  estructura: en ese caso, edite el documento propio de la estructura
  (consulte
  [Instancias de estructuras](#instancias-de-estructuras-una-referencia-viva)
  más abajo).

El color de un bloque se guarda con su creación y viaja con ella cuando la
publica o la comparte.

## Transformaciones precisas: valores numéricos, alineación y repetición

Las secciones plegadas del panel Selección le dan formas más exactas de
mover una selección, además del gizmo y las teclas de arriba:

- **Posición y rotación exactas**: escriba valores exactos de X/Y/Z/Rotación
  en lugar de arrastrar. Elija **Absoluto** (los valores son un objetivo
  para el pivote o la orientación de la selección) o **Desplazamiento**
  (los valores se suman como diferencia) y luego presione **Aplicar** (o
  `Enter` en un campo). Un campo vacío significa “dejar esto como está”,
  nunca cero. **Restablecer campos** vacía los campos sin tocar la
  selección.
- **Alineación y distribución** (en **Alinear, distribuir, repetir**):
  nueve botones para alinear los bordes o los centros de toda la selección
  en un eje del mundo (Izquierda/Centro/Derecha, Abajo/Centro/Arriba,
  Frente/Centro/Atrás), más tres para repartirla de forma pareja
  (Distribuir X/Y/Z). Alinear requiere **2 o más bloques** seleccionados;
  distribuir requiere **3 o más**.
- **Repetir** (también en **Alinear, distribuir, repetir**): crea **N**
  copias más de la selección, espaciadas de forma pareja a lo largo de un
  eje. Si alguna copia chocara con algo, no se crea ninguna.

Cada una de estas acciones es **un solo paso de deshacer**, exactamente
igual que arrastrar el gizmo o desplazar con el teclado: consulte la
[Referencia de controles](ControlsReference.md#transformar--panel-numérico-solo-en-el-editor)
para ver el comportamiento completo, campo por campo.

El botón **Enfocar** del panel Selección encuadra la cámara en los bloques
seleccionados sin cambiar nada.

> **Las colisiones se bloquean.** Arrastrar el gizmo o desplazar con el
> teclado compara el resultado con todos los bloques que están fuera de la
> selección. Si al soltar algún miembro quedara encima de uno de ellos, se
> cancela todo el movimiento en lugar de confirmarse: todos los bloques de
> la selección vuelven exactamente adonde empezaron, sin una nueva entrada
> de deshacer. Reorganizar bloques *dentro* de su propia selección (como
> intercambiar el lugar de dos bloques con una rotación) nunca se trata
> como una colisión.

## Copiar, pegar y duplicar

| Tecla | Acción |
|---|---|
| **Ctrl/Cmd + C** | Copiar los bloques seleccionados |
| **Ctrl/Cmd + V** | Pegarlos (un poco desplazados para que se vean) |
| **Ctrl/Cmd + D** | Duplicar la selección en su lugar: copiar y pegar en un solo paso |

Copiar y pegar es ideal para elementos que se repiten: construya una
ventana y luego cópiela y péguela a lo largo de una fachada. **Duplicar**
hace lo mismo en un solo gesto y un solo paso de deshacer, y no toca su
portapapeles: un Ctrl+C anterior sigue ahí para pegarlo después de
duplicar otra cosa. El duplicado pasa a ser su nueva selección, así que el
flujo natural es seleccionar → duplicar → arrastrarlo o desplazarlo a su
lugar. Duplicar funciona con cualquier selección: bloques sueltos, un
grupo completo o una sola
[instancia de estructura](#instancias-de-estructuras-una-referencia-viva).

## Deshacer y rehacer

Cada cambio queda registrado, así que siempre puede volver atrás:

| Tecla | Acción |
|---|---|
| **Ctrl/Cmd + Z** | Deshacer la última acción |
| **Ctrl/Cmd + Y** *(o Ctrl/Cmd+Mayús+Z)* | Rehacerla |

Mover diez bloques cuenta como **un** paso de deshacer, así que deshacer
sigue siendo manejable incluso en construcciones grandes.

## Grupos

Los grupos le permiten nombrar y reutilizar conjuntos de bloques, como
“Techo” o “Ventanas”.

**Crear un grupo:**
1. Seleccione algunos bloques.
2. Abra la sección **Grupos y plano** del panel Selección y haga clic en
   **Grupo nuevo**; luego póngale un nombre con **Cambiar nombre del
   grupo** (abajo).

**Usar un grupo:** haga clic en el nombre de un grupo en la lista para
seleccionarlo (con sus bloques): la lista está en el panel Selección cuando
no hay nada seleccionado, y en **Grupos y plano** en los demás casos. Estos
botones actúan sobre el grupo que esté seleccionado:

| Botón | Qué hace |
|---|---|
| **Cambiar nombre del grupo** | Cambia el nombre del grupo |
| **Duplicar grupo** | Copia el grupo entero *y* sus bloques |
| **Eliminar grupo** | Elimina el grupo (los bloques en sí se conservan) |
| **Agregar al grupo** | Agrega su selección actual al grupo |
| **Quitar del grupo** | Quita su selección actual del grupo |

> **Conviene saberlo:** Seleccionar un grupo solo selecciona sus bloques:
> nunca cambia el grupo. Y eliminar un grupo solo quita la *etiqueta*, no
> los bloques que contiene.

## Estructuras: componer, bifurcar y su biblioteca personal

La pestaña **Estructuras** de la Biblioteca de construcción (consulte
[La disposición](#la-disposición) arriba) le ofrece veinte estructuras ya
hechas (casas, graneros, un pozo, un mercado, un molino, un puente y más,
en cinco categorías), además de **Mis estructuras**, su propia colección
personal de todo lo que haya guardado de una construcción. Hay tres cosas
distintas que puede hacer con cualquiera de ellas, y cada una importa por
razones distintas:

- **Colocar** (haga clic en la tarjeta): copia los bloques de la
  estructura directamente en el documento en el que ya está trabajando,
  para que pase a formar parte de una construcción más grande. Es la
  acción de todos los días.
- **Bifurcar como documento nuevo** (en el menú **⋮** de la tarjeta):
  empieza un documento completamente nuevo e independiente que comienza
  como una copia exacta de esa estructura.
- **Bifurcar a Mis estructuras** (solo tarjetas integradas, en el menú
  **⋮**): agrega la estructura a sus propias **Mis estructuras**, sin
  ningún documento de por medio. Consulte
  [Mis estructuras](#mis-estructuras-su-biblioteca-personal-de-planos) más
  abajo.
- **Información** (en el menú **⋮** de la tarjeta): una vista de solo
  lectura del nombre, la categoría, el número de bloques, la superficie,
  la altura, el origen y la descripción de una estructura.
- Coloque un **documento guardado** propio como **instancia de
  estructura** (una referencia viva y reutilizable, en lugar de una copia)
  desde el menú desplegable **Recientes** de la barra de herramientas, no
  desde la Biblioteca de construcción. Consulte
  [Instancias de estructuras](#instancias-de-estructuras-una-referencia-viva)
  más abajo.

### Colocar una estructura en su documento

Haga clic en cualquier tarjeta de la pestaña **Estructuras** (una
integrada o una de sus propias **Mis estructuras**) y aparece una vista
previa fantasma translúcida de toda la estructura, que sigue a su puntero
sobre el suelo, exactamente como al colocar un solo bloque:

1. Mueva el puntero para ubicar el fantasma.
2. Presione `R` / `Mayús+R` para girarlo en pasos de 90°.
3. Haga clic para confirmar: todos los bloques de la estructura se
   agregan a su documento como un solo **paso de deshacer**. Una posición
   ocupada tiñe el fantasma de rojo y rechaza el clic, igual que un solo
   bloque se niega a colocarse encima de otro.
4. `Escape` cancela: no se agrega nada y vuelve a la herramienta que
   estaba usando antes.

Los bloques que obtiene son bloques comunes de su documento desde el
momento en que se colocan: no se distinguen de nada que haya colocado a
mano, y puede editarlos, seleccionarlos, agruparlos o eliminarlos como
cualquier otra cosa. Colocar varias estructuras es una forma rápida de
armar una escena: haga clic en Casa y colóquela; haga clic en Granero y
colóquelo al lado; haga clic en Pozo y colóquelo en el patio.

### Bifurcar una estructura como documento nuevo

Abra el menú **⋮** de una tarjeta y haga clic en **Bifurcar como documento
nuevo** para empezar una creación completamente nueva y propia que
comienza como una copia exacta de esa estructura: exactamente los mismos
bloques, editables con todas las herramientas de esta guía, en un
documento propio en lugar de mezclados con lo que tenga abierto en ese
momento. Bifurcar nunca cambia la copia de la biblioteca: bifurque Casa
diez veces y cada una será su propia creación independiente desde el
momento en que haga clic en Bifurcar.

### Mis estructuras: su biblioteca personal de planos

¿Construyó algo que vale la pena reutilizar? Seleccione los bloques que lo
forman (un edificio entero o solo una sección) y haga clic en **Crear
plano**: está en la sección **Grupos y plano** del panel Selección cuando
tiene bloques seleccionados, y en la Paleta de comandos (`Ctrl/Cmd+K`) en
cualquier caso. Un pequeño diálogo le pide un **nombre**, una
**categoría** y una **descripción** opcional, con una vista previa en vivo
de lo que está por guardar; haga clic en **Crear plano** y se normaliza
respecto de su propio origen local y se guarda de inmediato en **Mis
estructuras**, una nueva sección al final de la pestaña Estructuras, justo
debajo de las categorías integradas.

Hay una segunda forma de que una estructura termine en Mis estructuras,
sin nada que seleccionar ni construir antes: abra el menú **⋮** de
cualquier tarjeta **integrada** y haga clic en **Bifurcar a Mis
estructuras**. Se agrega exactamente como ya está (no se crea ningún
documento ni se extrae nada), así que queda lista para cambiarle el
nombre, exportarla o colocarla de inmediato, como cualquier otra entrada
de su biblioteca.

Una estructura de **Mis estructuras** funciona exactamente como una
integrada (haga clic para colocarla en su documento actual, o use
Bifurcar como documento nuevo), con dos acciones adicionales en su menú
**⋮**:

| Acción | Qué hace |
|---|---|
| **Cambiar nombre** | Cambia su nombre (su categoría y su descripción quedan como están) |
| **Quitar** | La elimina de su biblioteca |

**Mis estructuras** solo guarda la *estructura en sí*: un nombre y un
conjunto de bloques. Quitar una nunca afecta nada de lo que ya construyó
con ella: cada lugar donde ya la colocó o la bifurcó conserva esos bloques
exactamente como están. Y nunca se edita en su lugar: si quiere cambiar lo
que construye una estructura guardada, colóquela en un documento, edite
ese documento y luego use **Crear plano** de nuevo (si quiere, con un
nombre nuevo, como “Granja de lujo”: pasa a ser su propia entrada aparte
en Mis estructuras, no un reemplazo de la original).

> **Conviene saberlo:** Mis estructuras vive en este dispositivo. No está
> vinculada a su identidad ni se sincroniza automáticamente con ningún
> lugar: consulte
> [Compartir planos](#compartir-planos-exportar-e-importar) más abajo para
> saber cómo llevar una a otro dispositivo o dársela a otra persona.

### Compartir planos: exportar e importar

Cualquier estructura (una integrada o una de las suyas) puede salir del
dispositivo donde está como un archivo portátil, sin llegar a formar parte
nunca del Mundo compartido publicado:

- **Exportar plano** (en el menú **⋮** de cualquier tarjeta) la descarga
  como un pequeño archivo JSON: una instantánea autónoma del nombre, la
  categoría, las etiquetas, la descripción y los bloques de esa
  estructura.
- **Importar plano** (botón junto al título **Mis estructuras**) lee un
  archivo de plano y lo agrega a sus propias Mis estructuras como una
  entrada nueva e independiente: una copia nueva con su propia identidad,
  nunca vinculada al lugar de donde vino. Importar el mismo archivo dos
  veces le da dos entradas separadas, no una que sobrescribe en silencio a
  la otra. Un archivo mal formado o no reconocido se rechaza con una
  explicación, en lugar de producir en silencio algo roto.

Así es como le pasa una construcción a un amigo, o lleva sus propias
estructuras entre sus dispositivos: exporte en un lado, envíe el archivo
como quiera e impórtelo en el otro.

**Exportar todo** (junto a **Importar plano**, cuando tiene estructuras
propias) descarga todas las estructuras de Mis estructuras en un solo
archivo, cada una con sus atribuciones y sus declaraciones de linaje.
**Importar plano** también lee ese archivo, y omite cualquier diseño que
ya esté en Mis estructuras, así que importarlo dos veces no le da
duplicados. Para conservar también una copia de todo lo demás, use
[Sus datos](13-YourData.md).

### Declarar la autoría

Una estructura con una identidad de plano (la mayoría de las guardadas
tienen una) también puede llevar una **Atribución de la comunidad**: un
registro firmado de quién afirma haberla diseñado. Abra el panel
**Información** de la estructura desde su tarjeta y encontrará:

- **Declarar autoría**: firma, con su identidad actual, una declaración de
  que usted es uno de sus autores. Varias personas pueden declarar cada una
  el mismo diseño de forma independiente; la declaración de nadie
  prevalece sobre la de otro ni la reemplaza.
- **Exportar atribución** / **Publicar en la red**: una vez que la haya
  declarado, comparta esa declaración como archivo o anúnciela a sus pares
  conectados.
- **Volver a firmar para este diseño**: las declaraciones hechas antes del
  28 de septiembre de 2026 usaban un tipo más antiguo de huella de diseño
  que otro diseño puede copiar, así que ya no cuentan, y el panel dice
  cuántas hay. Si una de ellas es suya y este realmente es su diseño, este
  botón vuelve a firmar su declaración. Revise primero el diseño: el botón
  aparece para cualquier diseño que comparta la huella antigua.

Esto es opcional, y totalmente aparte de colocar, bifurcar o compartir la
estructura en sí: existe para las situaciones en que quiere asociar su
nombre a un diseño de una forma que otras personas puedan verificar de
manera independiente, no solo creer. Consulte
[Publicaciones y evidencia externa](09-PublicationsAndEvidence.md) para
saber qué pasa con una declaración una vez publicada, y cómo asociarle
evidencia externa independiente.

## Instancias de estructuras: una referencia viva

Colocar (arriba) copia los bloques de una estructura en su documento una
sola vez. A veces lo que quiere, en cambio, es una copia **viva** de algo
que ya construyó (cualquier documento guardado, no solo algo de su
biblioteca) que se mantenga sincronizada con su origen cada vez que la
mira. Eso es una **instancia de estructura**: hace referencia al documento
de origen en lugar de copiar sus bloques, así que editar el origen más
adelante actualiza automáticamente todas sus instancias.

1. Abra el menú desplegable **Recientes** de la barra de herramientas.
   (Aparece cuando guardó al menos un documento).
2. Junto a cualquier documento guardado, haga clic en **Colocar**. Hacer
   clic en el nombre del documento, en cambio, lo abre y reemplaza lo que
   tiene abierto.
3. Pase el cursor por el suelo, presione `R` para girar y haga clic para
   colocarlo, exactamente como al colocar un bloque.

Una instancia es una *referencia* viva a ese documento, no una copia de
sus bloques: el mismo documento se puede colocar cualquier cantidad de
veces, y editar más adelante los bloques del documento de origen actualiza
todas sus instancias. Seleccione una instancia con la herramienta
Seleccionar (`1`) y la barra lateral muestra:

| Control | Qué hace |
|---|---|
| Arrastrar en la ventana gráfica, o el [gizmo](InteractiveTransformGizmo.md) | Mover / girar, igual que un bloque |
| Flechas / RePág / AvPág | Desplazar |
| **Campos X / Z / Rotación °, luego Aplicar** | Fijar una posición y una orientación exactas: la elevación (Y del suelo) siempre sigue el terreno y no es un objetivo que usted fije |
| **Girar ↻ / ↺** | Girar exactamente 90° |
| **Duplicar** (`Ctrl/Cmd+D`) | Colocar otra instancia de la misma estructura |
| **Eliminar** | Quitar esta instancia: el documento de origen no se toca |
| **Editar documento de origen** | Abrir el documento referenciado en sí, para cambiar cómo se ven todas sus instancias |

Editar el *contenido* de una estructura colocada siempre se hace editando
su documento de origen: no hay forma de editar directamente los bloques de
una instancia, y eso es justamente lo que mantiene sincronizadas todas sus
instancias.

## Propiedades del documento

Cada creación tiene un **título**, una **descripción** opcional, una
**licencia** y una opción **Quién puede colocarlo en el Mundo**:
configúrelos en el diálogo **Propiedades del documento**, que se abre con
el botón **✎** junto al título del documento, arriba en la barra lateral
del Editor (en la Vista del mundo, es el botón **Editar metadatos**). Un
documento nuevo empieza sin licencia, lo que significa que nadie más puede
bifurcarlo hasta que usted elija una. La descripción aparece como un
fragmento en su tarjeta del Repositorio y también se puede buscar allí; la
licencia controla si otras personas pueden bifurcarlo, y cómo. Consulte
[Publicar y bifurcar](04-PublishingAndForking.md) para saber qué significa
cada licencia.

## Sonido

Cada cambio que hace tiene su propio sonido breve, así que puede oír lo
que pasó sin mirar: un chasquido cuando se coloca un bloque o una
estructura, un pop cuando se quita uno, un tic para un movimiento y un
doble tic para un giro, una ráfaga rápida de pitidos al pegar o duplicar,
un tintineo brillante para un color nuevo, dos notas al agrupar, una
campana al nombrar un lugar, un pitido descendente para deshacer y uno
ascendente para rehacer, y un pequeño acorde al guardar. Los cambios que
hace un colaborador en el mismo documento son silenciosos.

Active o desactive el sonido con el botón **Sonido**, arriba a la derecha
de la vista, o presionando `M` (aparece en la superposición Atajos de
teclado, `?`); el control deslizante de al lado ajusta el volumen. Es la
misma configuración que la de la Vista del mundo, y se recuerda en este
dispositivo. El sonido empieza con su primer clic o la primera tecla que
presione, como exigen los navegadores.

## Guardar, publicar, empezar de nuevo

- **Guardar** (`Ctrl+S`): conserva su trabajo en este dispositivo.
- **Publicar**: lo comparte con todos (consulte
  [Publicar y bifurcar](04-PublishingAndForking.md)).
- **Nuevo**: empieza una creación nueva y vacía.
- **Exportar**: descarga la creación actual como archivo JSON, para
  conservar una copia o llevarla a otro dispositivo. Los archivos usan un
  formato compacto que guarda los bloques como una tabla.
- **Importar**: abre un archivo exportado como una creación nueva con su
  propia identidad; no se guarda nada hasta que use **Guardar**. Los
  archivos exportados por versiones anteriores siguen abriéndose (se
  convierten al cargarse), pero ForkBuild 1.0.0 y anteriores no pueden
  abrir archivos exportados por esta versión.
- **Recientes**: vuelve a abrir algo que guardó antes (aparece después de
  su primer guardado; haga clic en el nombre de un documento para
  abrirlo). Cuando ya guardó suficientes documentos, aparece un cuadro de
  filtro para ir directamente a uno por su nombre. Cada entrada también
  tiene un botón **Colocar** (consulte
  [Instancias de estructuras](#instancias-de-estructuras-una-referencia-viva))
  para agregarlo a su documento *actual* en lugar de reemplazarlo.
  **Exportar todos los documentos**, al final, descarga todos los
  documentos guardados en un solo archivo; **Importar** lo vuelve a leer:
  guarda los documentos que este dispositivo no tiene (ábralos desde
  Recientes), omite los que tiene sin cambios y guarda una copia al lado de
  cualquiera que tenga en otra versión. Los cambios sin guardar no se
  incluyen, así que guarde primero.

## Controles de cámara

- **Arrastrar**: orbitar alrededor de la escena
- **Rueda**: acercar y alejar
- **Inicio**: restablecer la cámara a la vista predeterminada

## En un teléfono o una tableta

El Editor funciona con el tacto. Arrastre con un dedo para orbitar, con dos
para desplazar la vista y pellizque para hacer zoom. Un toque selecciona o
coloca, y arrastrar nunca lo hace. En una pantalla angosta, la barra
lateral se abre desde el botón **Herramientas**, arriba a la derecha de la
escena. Una barra al pie de la escena tiene **Deshacer**, **Rehacer**,
**Girar**, **Eliminar**, **Múltiple** (cada toque agrega un bloque a la
selección o lo quita), **Recuadro** (arrastre para dibujar un recuadro de
selección; la cámara queda quieta hasta que lo desactive) y **Más**, que
abre la Paleta de comandos. Consulte
[Pantallas táctiles](ControlsReference.md#pantallas-táctiles) para ver los
detalles.
