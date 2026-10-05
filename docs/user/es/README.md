<!-- translation-of: docs/user/README.md source-hash: 0137e01d1cbcedd8 -->
# Documentación para usuarios de ForkBuild

<!-- languages -->
[English](../README.md) · [Deutsch](../de/README.md) · **Español** · [Français](../fr/README.md) · [Bahasa Indonesia](../id/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Português (Brasil)](../pt-BR/README.md)
<!-- /languages -->

Guías prácticas para usar ForkBuild en el navegador. Todo lo que hay aquí
describe el producto tal como funciona hoy; el funcionamiento interno del
motor está en [docs/Architecture.md](../../Architecture.md) y en el resto
de la carpeta [docs/](../..) de nivel superior (en inglés).

## Empiece aquí (léalas en orden)

1. **[Primeros pasos](01-GettingStarted.md)**: abrir la app, iniciar
   sesión y colocar su primer bloque.
2. **[El Editor](02-TheEditor.md)**: el kit de construcción: herramientas,
   selección, transformaciones, colores de bloques, grupos, las
   estructuras de la Biblioteca de construcción y sus propios planos,
   instancias de estructuras, y el título, la descripción y la licencia de
   una creación.
3. **[Vista del mundo](03-WorldView.md)**: el espacio 3D compartido y de
   solo lectura donde vive cada creación publicada: volar por él,
   encontrar e inspeccionar cosas, **Editar una copia** para llevar algo
   al Editor, los Encuentros en el Mundo que comparten sus pares,
   distribuir su propia publicación desde **Mi Mundo compartido**,
   comentarios y notificaciones.
4. **[Publicar y bifurcar](04-PublishingAndForking.md)**: publicar,
   licencias, bifurcar, el catálogo del Repositorio y distribuir una
   publicación directamente desde el Editor.
   Para todo lo que puede distribuir y adónde puede ir, consulte
   [Distribuir su trabajo](Distribution.md).
5. **[Identidad e inicio de sesión](05-IdentityAndLogin.md)**: su
   identidad criptográfica, la bóveda (bloquear y desbloquear), hacer una
   copia de seguridad con exportar/importar y administrar identidades
   desde **Mis identidades**.
6. **[Avatares y presencia](06-AvatarsAndPresence.md)**: personalizar su
   avatar, quién puede verlo, caminar, perspectivas de cámara, vehículos,
   animales y su inventario.
7. **[Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md)**:
   conectarse directamente con otras personas, recordarlas, hacerse
   amigos, seguir, bloquear, la reconexión automática y su propio relay
   TURN.
8. **[Chat y conversaciones](08-ChatAndConversations.md)**: mensajes
   directos solo entre amigos, entrega sin conexión, confirmaciones de
   lectura y llamadas de voz.
9. **[Publicaciones y evidencia externa](09-PublicationsAndEvidence.md)**:
   la capa técnica y opcional: declaraciones firmadas de autoría y de
   nombres de lugares, la página Publicaciones, los comentarios y lo que
   tiene su dispositivo (Snapshot local). Partes de la página son
   *experimentales*, y así se indica.
10. **[Configuración de red](10-NetworkSettings.md)**: gateways, relays,
    proveedores de almacenamiento y de anuncios, y servidores de conexión
    entre pares.
    Lo que necesita cada red se resume en
    [Distribuir su trabajo](Distribution.md#lo-que-necesita-cada-red).
11. **[Evidencia y almacenamiento](11-EvidenceAndStorage.md)**: guardar
    contenido en IPFS o Arweave y, de forma *experimental*, la evidencia
    externa, los flujos de billetera de Bitcoin y Base, las ubicaciones de
    Snapshots, el pinning remoto de IPFS, Steem y Blurt.
    [Distribuir su trabajo](Distribution.md) muestra cómo
    encaja todo esto.
12. **[Archivo y clasificaciones](12-ArchiveAndLeaderboards.md)**:
    *experimental*. El archivo de observaciones, las referencias entre
    publicaciones, los logros, las etiquetas de editor y las páginas de
    Clasificación.
13. **[Sus datos](13-YourData.md)**: hacer una copia de seguridad de todo
    lo que tiene este navegador en un solo archivo cifrado y restaurarla,
    las exportaciones más pequeñas y dónde registró este dispositivo la
    distribución de sus publicaciones.

## Referencia

- **[Distribuir su trabajo](Distribution.md)**: todo lo que
  puede poner en redes descentralizadas (sus Mundos, declaraciones de
  autoría y de nombres de lugares, comentarios, anclajes), los tres papeles
  que cumple una red (Contenido, Anuncio / descubrimiento, Prueba /
  anclaje), qué necesita cada red y enlaces a las guías con los detalles.
- **[Preguntas frecuentes](FAQ.md)**: respuestas breves a las preguntas
  con las que más se encuentra la gente: compartir, licencias, frases de
  contraseña perdidas, mudarse a otro dispositivo, caminar con su avatar y
  volver a conectarse con amigos.
- **[Referencia de controles](ControlsReference.md)**: cada interacción
  con el mouse y el teclado en el Editor y en la Vista del mundo, en una
  sola tabla de consulta. Si alguna vez esta página y la Paleta de
  comandos de la app (`Ctrl/Cmd+K`) no coinciden, la Paleta tiene razón y
  esta página tiene un error: por favor, infórmelo.
- **[Gizmo de transformación interactivo](InteractiveTransformGizmo.md)**:
  cómo mover y rotar su selección arrastrando directamente en la ventana
  gráfica: los controles, el pivote, el ajuste, confirmar, cancelar,
  deshacer y cómo se comportan los grupos.

## Dónde construye, dónde explora

El Editor es el único lugar donde se construye en ForkBuild; la Vista del
mundo es una superficie de exploración de solo lectura:

- **Editor** (`/editor`): su espacio de trabajo privado. Coloque bloques
  desde la paleta, selecciónelos y transfórmelos con el teclado o con el
  gizmo. Guarde, cargue y publique documentos desde la barra de
  herramientas.
- **Vista del mundo** (`/world/:id`): el mundo espacial compartido. Vuele
  entre mundos publicados, busque y explore lo que hay a su alrededor,
  inspeccione bloques y estructuras colocadas, camine con su avatar sobre
  estructuras y terreno, y use **Editar una copia** para abrir en el
  Editor lo que haya encontrado, listo para seguir construyendo.

Haga lo que haga en el Editor, cada cambio es un paso que se puede
deshacer, y `Ctrl/Cmd+Z` lo revierte.

## Colaboración y exploración

ForkBuild le ofrece colaboración encarnada y descubrimiento del mundo:

- **Caminar y navegar**: use las teclas WASD para caminar con su avatar
  sobre edificios y terreno, saltar, trepar y explorar espacios en altura.
- **Construir en conjunto**: vea los avatares de otros constructores y
  entienda en qué están trabajando gracias a la percepción espacial;
  luego use **Editar una copia** para llevar algo que encontró al Editor
  y seguir construyendo usted mismo.
- **Descubrir el mundo**: use la brújula, con marcadores de ubicación
  según el contexto, para encontrar estructuras cercanas y elementos del
  terreno como bosques, ríos y praderas.
- **Seguir a colaboradores**: fije su cámara para seguir el avatar de
  alguien mientras se mueve por el mundo.

Todo lo que ve se deriva de la semilla determinista del mundo: el
terreno, la ecología y la hidrología se calculan de forma idéntica para
todos, lo que crea un lugar compartido coherente sin guardar datos
adicionales.

## Estructuras y planos reutilizables

Más allá de los bloques individuales, la Biblioteca de construcción del
Editor le permite construir con estructuras completas de una vez: veinte
ya hechas en cinco categorías, más todo lo que usted mismo guarde:

- **Coloque** una estructura directamente en lo que está construyendo, o
  **bifurque** una en un documento propio completamente nuevo.
- **Guarde sus propias** construcciones como estructuras reutilizables en
  **Mis estructuras**, su biblioteca personal de planos.
- **Exporte e importe** un plano como un archivo portátil para
  compartirlo con otra persona o llevarlo a otro dispositivo.

Consulte [El Editor](02-TheEditor.md#estructuras-componer-bifurcar-y-su-biblioteca-personal)
para ver la guía completa.
