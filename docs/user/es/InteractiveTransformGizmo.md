<!-- translation-of: docs/user/InteractiveTransformGizmo.md source-hash: abe609dc8dec857e -->
# Gizmo de transformación interactivo

<!-- languages -->
[English](../InteractiveTransformGizmo.md) · [Deutsch](../de/InteractiveTransformGizmo.md) · **Español** · [Bahasa Indonesia](../id/InteractiveTransformGizmo.md) · [日本語](../ja/InteractiveTransformGizmo.md) · [Português (Brasil)](../pt-BR/InteractiveTransformGizmo.md)
<!-- /languages -->

Siempre que hay bloques seleccionados en el Editor, aparece un gizmo en el
pivote de la selección. Arrastrar sus controles mueve o gira la selección
con una vista previa en vivo; soltar confirma el cambio como **un solo paso
de deshacer**. Seleccionar una sola
[instancia de estructura](02-TheEditor.md#instancias-de-estructuras-una-referencia-viva)
en el Editor muestra exactamente el mismo gizmo, con una diferencia: el
control verde del eje Y no hace nada. La elevación de una colocación
siempre sigue el terreno que tiene debajo: nunca es un control que se
arrastra ni un valor que se escribe.

El gizmo es solo del Editor. La [Vista del mundo](03-WorldView.md) es una
superficie de exploración de solo lectura; para construir sobre algo que
encuentre allí, use su botón **Editar una copia** para abrirlo aquí, en el
Editor.

## El gizmo

```
    Y
    ↑
    │
    │
    ●──────→ X        ●  pivote
   /
  /
 Z

    ◯
  ◯ ● ◯               anillo de rotación (eje Y)
    ◯
```

| Control | Color | Qué hace |
|---|---|---|
| Flecha de eje | Rojo (X) | Arrástrela para mover solo a lo largo de X |
| Flecha de eje | Verde (Y) | Arrástrela para mover solo a lo largo de Y |
| Flecha de eje | Azul (Z) | Arrástrela para mover solo a lo largo de Z |
| Control central | Ámbar | Movimiento libre sobre el plano del suelo (X + Z) |
| Anillo de rotación | Violeta | Arrástrelo para girar alrededor del pivote |

Los controles se resaltan cuando pasa el cursor sobre ellos, y brillan más
mientras los arrastra. El gizmo mantiene un tamaño cómodo en la pantalla
sin importar cuánto se aleje.

## El pivote

El marcador blanco en el centro del gizmo es el **pivote**:

```
┌───────────────┐
│ ■           ■ │
│               │
│       +       │ ← pivote (centro de los límites de la selección)
│               │
│ ■           ■ │
└───────────────┘
```

- Seleccione un bloque → el pivote queda en el centro de ese bloque.
- Seleccione varios bloques → el pivote queda en el centro del recuadro que
  los rodea a todos.
- La rotación siempre ocurre alrededor del pivote.

El pivote sigue automáticamente a su selección: seleccione A, luego
agregue B, luego deshaga un movimiento: el gizmo se reubica cada vez.

## Mover

1. Seleccione uno o más bloques.
2. Tome un control de eje para mover a lo largo de ese eje, o el control
   central para moverse libremente sobre el suelo.
3. La selección sigue al puntero en vivo.
4. Suelte para confirmar.

## Girar

1. Seleccione uno o más bloques.
2. Arrastre el anillo violeta. La selección gira alrededor del pivote
   mientras arrastra.
3. Suelte para confirmar.

En las selecciones múltiples, cada bloque orbita alrededor del pivote común
*y* gira el mismo ángulo: la disposición conserva su forma.

## Confirmar, cancelar, no hacer nada

| Usted… | Resultado |
|---|---|
| Suelta el mouse | Cambio confirmado: **exactamente una** entrada en el historial de deshacer, sin importar cuántos bloques se movieron |
| Presiona `Escape` a mitad del arrastre | Cancelar: todo vuelve exactamente a su lugar; el historial no se toca |
| Hace clic y suelta sin mover | Nada: ningún comando, ninguna entrada en el historial |

`Ctrl/Cmd+Z` deshace todo el gesto en un solo paso; `Ctrl/Cmd+Y` (o
`Ctrl/Cmd+Mayús+Z`) lo rehace.

## Mientras arrastra, el gesto controla el puntero

Durante un arrastre, la cámara no orbita, no se puede seleccionar nada más
y se ignoran los atajos: el arrastre no puede pelear por accidente con la
cámara. Soltar (confirmar) o `Escape` (cancelar) devuelve todo a la
normalidad. Soltar el mouse *fuera* de la ventana gráfica igual confirma
sin problemas.

## Grupos

Seleccionar un grupo selecciona sus bloques miembros, y el gizmo los trata
exactamente como cualquier selección múltiple:

- Arrastrar mueve a todos los miembros; girar hace girar a todos los
  miembros alrededor del pivote común.
- El grupo en sí no se toca: la pertenencia nunca cambia por una
  transformación. (El gizmo ni siquiera sabe que existen los grupos).
- Un solo deshacer devuelve a cada miembro a donde estaba.

## Ajuste

Los arrastres se ajustan de forma predeterminada: 1 unidad del Mundo para
el movimiento (el mismo paso que desplaza una tecla de flecha) y 15° para
la rotación (más fino que el giro de 90° que hace `R`). Mantenga **Mayús**
mientras arrastra para el **modo de precisión**: 0,1× el incremento normal
(0,1 unidades del Mundo, 1,5°), para ajustes finos para los que la
cuadrícula predeterminada es demasiado gruesa.

El **panel de transformación numérica** y la **alineación/distribución**
son la excepción a propósito: siempre aplican el valor exacto o el
resultado geométrico exacto que pidió, nunca con ajuste, ya que usted ya
escribió (o pidió) algo preciso.

## Una colisión bloquea la confirmación

Mover o girar una selección compara el resultado con todos los bloques
*fuera* de la selección antes de permitir que se coloque. Si algún miembro
se superpusiera con algo que ya está allí, soltar no confirma: todos los
bloques de la selección vuelven exactamente adonde estaban, sin una nueva
entrada de deshacer, igual que soltar un solo bloque sobre una celda
ocupada rechaza el clic. Reorganizar bloques *dentro* de la misma
selección (por ejemplo, dos miembros que intercambian lugares con una
rotación) nunca se trata como una colisión. Esta comprobación se aplica a
los arrastres del gizmo, a los desplazamientos con el teclado y a la
rotación por igual; la alineación, la distribución y el panel de
transformación numérica no están sujetos a ella, ya que calculan un
resultado exacto y deliberado en lugar de un movimiento libre.

## Lo que no hace el gizmo

- **Escalar**: los bloques no se pueden cambiar de tamaño, así que no hay
  controles de escala.
- **Duplicar arrastrando**: no hay ninguna tecla modificadora para copiar
  mientras arrastra; use `Ctrl/Cmd+D` para duplicar primero la selección
  en su lugar (consulte
  [El Editor](02-TheEditor.md#copiar-pegar-y-duplicar)) y luego arrastre
  la copia.

## Consejos

- Pase el cursor sobre el anillo de rotación y arrastre despacio para un
  control fino: los arcos pequeños del puntero cerca del pivote siguen
  siendo precisos, porque la rotación se mide como un ángulo, no como una
  distancia.
- Use un control de eje cuando quiera mantener dos coordenadas
  perfectamente fijas: la restricción es exacta, no visual.
- Combine superficies: desplace con las teclas de flecha en pasos de
  unidades enteras y luego termine con un arrastre con Mayús para el
  posicionamiento fino. Deshacer y rehacer tratan ambos igual: un paso por
  gesto.
