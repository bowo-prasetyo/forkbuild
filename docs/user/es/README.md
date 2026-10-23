<!-- translation-of: docs/user/README.md source-hash: 8832d9dd4363463e -->
# Documentación para usuarios de ForkBuild

<!-- languages -->
[English](../README.md) · [Deutsch](../de/README.md) · **Español** · [Français](../fr/README.md) · [Bahasa Indonesia](../id/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Português (Brasil)](../pt-BR/README.md)
<!-- /languages -->

Guías prácticas para usar ForkBuild en el navegador. ¿Es nuevo aquí?
Empiece por **[Primeros pasos](01-GettingStarted.md)**: cinco minutos desde
que abre la aplicación hasta que entra caminando en su primera
construcción.

## Quiero…

| Quiero… | Lea |
|---|---|
| Construir mi primera cosa | [Primeros pasos](01-GettingStarted.md#colocar-su-primer-bloque) |
| Aprender las herramientas de construcción | [El Editor](02-TheEditor.md) |
| Compartir una construcción con un amigo | [Compartir un enlace](04-PublishingAndForking.md#compartir-un-enlace) |
| Que todos encuentren mi construcción | [¿Quién puede encontrarla?](04-PublishingAndForking.md#quién-puede-encontrarla) |
| Remezclar la construcción de otra persona | [Remezclar: hágalo suyo](04-PublishingAndForking.md#remezclar-hágalo-suyo) |
| Construir con un amigo, en vivo | [Construir conmigo](02-TheEditor.md#construir-conmigo-construir-juntos-en-vivo) |
| Pasear con amigos | [Pasear aquí conmigo](03-WorldView.md#pasear-aquí-conmigo--traer-a-sus-amigos-a-este-mundo) |
| Cambiar cómo se ve mi avatar | [Avatares y presencia](06-AvatarsAndPresence.md#personalizar-su-avatar) |
| Hacer copia de seguridad de mi trabajo, o llevarlo a otro dispositivo | [Sus datos](13-YourData.md) |
| Consultar una tecla o un control del ratón | [Referencia de controles](ControlsReference.md) |
| Arreglar algo que no funciona | [Preguntas frecuentes](FAQ.md) |

Todo lo que hay aquí describe el producto tal como funciona hoy; los
detalles internos del motor están en
[docs/Architecture.md](../../Architecture.md) y en el resto de la carpeta
[docs/](../..) de nivel superior (solo en inglés).

## Jugar (léalo en orden)

Todo lo que necesita para construir, compartir, remezclar y pasear con
sus amigos.

1. **[Primeros pasos](01-GettingStarted.md)**: abrir la app, orientarse
   en el menú, colocar su primer bloque y elegir un nombre solo al
   publicar.
2. **[El Editor](02-TheEditor.md)**: el kit de construcción: herramientas,
   selección, transformaciones, colores de bloques, grupos, las
   estructuras de la Biblioteca de construcción y sus propios planos,
   instancias de estructuras, y el título, la descripción y la licencia de
   una construcción.
3. **[Vista del mundo](03-WorldView.md)** — el mundo 3D compartido
   donde vive cada construcción publicada: caminar y volar, encontrar y
   mirar cosas, **Construir aquí**, **Pasear aquí conmigo**, los
   residentes y **Editar una copia** para llevar algo al Editor. Sus
   herramientas de red tienen su propia página, más abajo en Avanzado.
4. **[Publicar y remezclar](04-PublishingAndForking.md)** — publicar y
   compartir un enlace, elegir a dónde van sus construcciones,
   licencias, remezclar, **Explorar** y sus construcciones ya hechas,
   el reto semanal y su plaza, y los árboles familiares. Para todo lo
   que puede recibir una construcción, vea [Distribuir su
   trabajo](Distribution.md).
5. **[Avatares y presencia](06-AvatarsAndPresence.md)**: personalizar su
   avatar, quién puede verlo, caminar, perspectivas de cámara, vehículos,
   animales y su inventario.
6. **[Sus datos](13-YourData.md)**: hacer una copia de seguridad de todo
   lo que tiene este navegador en un solo archivo cifrado y restaurarla,
   las exportaciones más pequeñas y dónde registró este dispositivo la
   distribución de sus publicaciones.

## Avanzado

La maquinaria de debajo: su identidad en detalle, las conexiones
directas con otras personas, las redes a las que puede ir una
construcción y las herramientas experimentales. No necesita nada de esto
para jugar.

- **[Vista del mundo: herramientas avanzadas](WorldViewAdvancedTools.md)**:
  lo que agrega **Mostrar herramientas avanzadas**: inspeccionar bloques,
  las colocaciones y por qué se puede colocar la construcción de
  cualquiera, Encuentros en el Mundo, nombres de lugares descubiertos,
  construcciones declaradas y enviar su propia construcción desde
  **Mi Mundo compartido**.
- **[Su nombre y su identidad](05-IdentityAndLogin.md)**: su
  nombre y la identidad criptográfica que hay detrás, la bóveda (bloquear y desbloquear), hacer una
  copia de seguridad con exportar/importar y administrar identidades
  desde **Mis identidades**.
- **[Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md)**:
  conectarse directamente con otras personas, recordarlas, hacerse
  amigos, seguir, bloquear, la reconexión automática y su propio relay
  TURN.
- **[Chat y conversaciones](08-ChatAndConversations.md)**: mensajes
  directos solo entre amigos, entrega sin conexión, confirmaciones de
  lectura y llamadas de voz.
- **[Registros firmados y evidencia externa](09-PublicationsAndEvidence.md)**:
  la capa técnica y opcional: declaraciones firmadas de autoría y de
  nombres de lugares, la página Registros firmados, los comentarios y lo que
  tiene su dispositivo (Snapshot local). Partes de la página son
  *experimentales*, y así se indica.
- **[Configuración de red](10-NetworkSettings.md)**: gateways, relays,
  proveedores de almacenamiento y de anuncios, y servidores de conexión
  entre pares.
  Lo que necesita cada red se resume en
  [Distribuir su trabajo](Distribution.md#lo-que-necesita-cada-red).
- **[Evidencia y almacenamiento](11-EvidenceAndStorage.md)**: guardar
  contenido en IPFS o Arweave, las ubicaciones de Snapshots, anclar en
  Arweave y, de forma *experimental*, el resto de la evidencia externa,
  los flujos de billetera de Bitcoin y Base, el pinning remoto de IPFS,
  Steem y Blurt. [Distribuir su trabajo](Distribution.md) muestra cómo
  encaja todo esto.
- **[Archivo y logros](12-ArchiveAndAchievements.md)**:
  *experimental*. El archivo de observaciones, las referencias entre
  publicaciones y los logros.

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

- **Editor** (**Construir** en el menú): su espacio de trabajo privado.
  Coloque bloques desde la Biblioteca de construcción, selecciónelos y
  muévalos o gírelos con el teclado o con el gizmo. Guarde, abra y
  publique construcciones desde la barra de herramientas.
- **Vista del mundo** (**Pasear** en el menú, o **Explorar** en cualquier
  construcción): el mundo compartido. Camine o vuele entre construcciones
  publicadas, busque y explore lo que hay a su alrededor, camine con su
  avatar sobre edificios y terreno, y use **Editar una copia** para abrir
  en el Editor lo que haya encontrado, listo para seguir construyendo.

Haga lo que haga en el Editor, cada cambio es un paso que se puede
deshacer, y `Ctrl/Cmd+Z` lo revierte.

## Colaboración y exploración

ForkBuild le ofrece colaboración encarnada y descubrimiento del mundo:

- **Caminar y navegar**: use las teclas WASD para caminar con su avatar
  sobre edificios y terreno, saltar, trepar y explorar espacios en altura.
- **Construir en conjunto**: **Construir conmigo**, en el Editor, crea un
  enlace que abre su construcción en el Editor de un amigo, para que la
  construyan juntos, en vivo, y cada uno vea aparecer los bloques del otro y
  adónde apunta (consulte [El
  Editor](02-TheEditor.md#construir-conmigo-construir-juntos-en-vivo)). En
  la Vista del mundo, vea los avatares de otros constructores y en qué están
  trabajando; luego use **Editar una copia** para llevar algo que encontró
  al Editor y seguir construyendo usted mismo.
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
Editor le permite construir con estructuras completas de una vez: veintidós
ya hechas en cinco categorías, más todo lo que usted mismo guarde:

- **Coloque** una estructura directamente en lo que está construyendo, o
  **remezcle** una en una construcción propia completamente nueva.
- **Guarde sus propias** construcciones como estructuras reutilizables en
  **Mis estructuras**, su biblioteca personal de planos.
- **Exporte e importe** un plano como un archivo portátil para
  compartirlo con otra persona o llevarlo a otro dispositivo.

Consulte [El Editor](02-TheEditor.md#estructuras-componer-remezclar-y-su-biblioteca-personal)
para ver la guía completa.
