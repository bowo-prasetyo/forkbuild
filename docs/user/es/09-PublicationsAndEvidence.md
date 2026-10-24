<!-- translation-of: docs/user/09-PublicationsAndEvidence.md source-hash: c9274474de1ec083 -->
# 09 — Registros firmados y evidencia externa

<!-- languages -->
[English](../09-PublicationsAndEvidence.md) · [Deutsch](../de/09-PublicationsAndEvidence.md) · **Español** · [Français](../fr/09-PublicationsAndEvidence.md) · [Bahasa Indonesia](../id/09-PublicationsAndEvidence.md) · [日本語](../ja/09-PublicationsAndEvidence.md) · [한국어](../ko/09-PublicationsAndEvidence.md) · [Português (Brasil)](../pt-BR/09-PublicationsAndEvidence.md)
<!-- /languages -->

> **Avanzado.** No necesita este capítulo para construir, compartir, remezclar
> o pasear con sus amigos: eso está en los
> [capítulos de Jugar](README.md#jugar-léalo-en-orden). Siga leyendo si quiere saber qué
> funciona por debajo.

> **En parte experimental.** La página Registros firmados es una función
> habitual: su lista y sus estados, quitar registros que no se pueden
> usar, anunciar en Nostr o Arweave, guardar en IPFS o Arweave, anclar en
> Arweave, y las cuatro pestañas de una tarjeta: **Snapshot**,
> **Descentralización y evidencia**, **Colocaciones e IPFS** e
> **Historial**. El resto es **Experimental**: funciona, pero puede cambiar
> o eliminarse en una versión futura, y lo que produce podría no
> conservarse. La página marca cada una de esas partes con una insignia
> **Experimental**: todo tipo de anclaje salvo en Arweave, las billeteras y
> sus pasos de Bitcoin y Base, Steem, Blurt, el pinning remoto de IPFS y
> todo el panel **Herramientas de billetera y archivo**. Las guías
> [11](11-EvidenceAndStorage.md) y [12](12-ArchiveAndAchievements.md)
> indican cuáles de sus secciones son Experimentales. Construir, guardar,
> publicar en Explorar, remezclar, las identidades y los pares no
> dependen de nada de esto.

Nada de esto es necesario para usar ForkBuild. Sáltelo si solo quiere
construir, publicar y explorar.

La página **Registros firmados** es una capa más técnica que Explorar.
Explorar trata de construcciones y Mundos; la página Registros firmados trata de
**declaraciones firmadas** como “yo diseñé esta estructura” o “yo llamo X a
este lugar”, y de la profundidad opcional que puede agregarle a una
declaración:

- **Esta guía**: de dónde vienen las declaraciones, la página
  Registros firmados, los [Comentarios](#comentarios) y el
  [Snapshot local](#snapshot-local) (lo que tiene su dispositivo).
- **[Configuración de red](10-NetworkSettings.md)**: gateways, relays,
  proveedores y servidores de conexión entre pares. No es experimental, y
  le sirve a todo el mundo.
- **[Evidencia y almacenamiento](11-EvidenceAndStorage.md)**: evidencia
  externa (Bitcoin, Base, Arweave, Steem, Blurt), los flujos de billetera, las
  Ubicaciones de Snapshots, la publicación en IPFS, Steem y Blurt.
- **[Archivo y logros](12-ArchiveAndAchievements.md)**: el archivo
  duradero de observaciones, las referencias y los logros.

## Dos significados de “publicar”

| | **Publicar** (Explorar) | **Página Registros firmados** |
|---|---|---|
| Qué comparte | Una construcción o un Mundo | Un registro firmado: un Mundo compartido, la autoría de una estructura o un nombre de lugar |
| Dónde lo ve | Explorar, su página (**Mis construcciones**), Vista del mundo | La página **Registros firmados** |
| Qué hace con él | Abrirlo, explorarlo, remezclarlo | Comprobarlo, obtener su contenido, distribuirlo y anclarlo |
| Guía | [Publicar y remezclar](04-PublishingAndForking.md) | Esta |

**Publicar** por sí solo no pone un Mundo en la página Registros firmados. Lo
hace **Compartir con pares**: firma el Mundo como un **Mundo compartido**
que puede viajar a los pares (consulte
[Una construcción de Explorar, descentralizada](#una-construcción-de-explorar-descentralizada)).
Todo lo que publicó está en su propia página, **Más → Mis construcciones**
(las construcciones que firmó su nombre), y en Explorar.

La página Registros firmados no tiene **Abrir**, **Explorar** ni **Remezclar**, ni
siquiera para un Mundo compartido. Muestra el registro firmado, no el
Mundo. Para abrir, explorar o remezclar un Mundo compartido, búsquelo en
Explorar, en la página de su autor o en la Vista del mundo. Uno que
recibió de un par aparece allí cuando su contenido está en este
dispositivo. (La única excepción es **Abrir en el Editor** en su propio
Mundo compartido que necesita volver a publicarse; consulte
[Significado de los estados](#significado-de-los-estados)).

Cada entrada de la página Registros firmados es un *registro*, y cada uno es
de uno de tres tipos:

| Tipo | Qué es |
|---|---|
| **Mundo compartido** | Un Mundo publicado, como un registro firmado que puede viajar entre pares y redes |
| **Atribución de plano** | Una declaración de que usted diseñó una estructura |
| **Declaración de nombre de lugar** | Un nombre para una Región o un Hito |

La Vista del mundo, el Editor y Explorar también llaman **Mundo
compartido** al registro firmado de un Mundo, como en **Mi Mundo
compartido**, **Descubrir Mundo compartido** y **Seleccionar Mundo
compartido**.

## Qué rodea a un registro

Un registro es solo la declaración firmada en sí. Todo lo demás que verá en su
tarjeta, y a su alrededor en la Vista del mundo, es algo que se hace con
él o que se le asocia. Nada de eso es un tipo de registro, y solo el
registro en sí es obligatorio:

| Término | Como… | Qué es |
|---|---|---|
| **Registro** | El libro en sí | Un registro firmado: un Mundo compartido, una Atribución de plano o una Declaración de nombre de lugar. Lleva el hash de su contenido y la firma de su editor. |
| **Contenido** | Donde se guardan los ejemplares impresos | Los bytes de los que trata el registro, como los bloques de un Mundo. Siempre se guardan primero en este dispositivo; **Guardar en …** pone una copia en IPFS, Arweave, Steem o Blurt para que otros puedan obtenerla. Consulte [Proveedor de contenido](10-NetworkSettings.md#proveedor-de-contenido). |
| **Snapshot** | Un ejemplar impreso | Una copia guardada del contenido de un registro, como los bloques de un Mundo, que otros pueden obtener y comprobar contra su hash. Consulte [Snapshot local](#snapshot-local). |
| **Colocación** | Dónde está el ejemplar en el estante | Un registro firmado de dónde está una construcción en el Mundo. Un Mundo compartido puede tener varias. Consulte [Colocar o remezclar](WorldViewAdvancedTools.md#colocar-o-remezclar). |
| **Anuncio / descubrimiento** | Una ficha del catálogo de una biblioteca | Un pequeño aviso firmado en Nostr, Arweave, Steem o Blurt que dice que el registro o el Snapshot existen y dónde está su copia, para que puedan encontrarlo personas que no están conectadas con usted. Consulte [Proveedor de anuncio / descubrimiento](10-NetworkSettings.md#proveedor-de-anuncio--descubrimiento). |
| **Prueba / anclaje** *(Experimental, salvo en Arweave)* | El sello de un notario | El hash del contenido escrito en una transacción de blockchain (Bitcoin, Base, Arweave, Steem o Blurt), como evidencia de que existía en ese momento. No guarda ni anuncia nada. Consulte [Evidencia y almacenamiento](11-EvidenceAndStorage.md). |
| **Comentarios** | Las reseñas de los lectores | Comentarios que cualquiera con un nombre puede asociar a un registro, cada uno firmado por quien comenta, no por el editor. Consulte [Comentarios](#comentarios). |

Así que usted crea un registro; luego, si quiere, guarda su contenido,
lo anuncia, lo ancla y lo coloca (en el caso de un Mundo compartido); y
cualquiera puede comentarlo.

## De dónde viene un registro

Nunca crea una declaración en la página Registros firmados en sí. La página
muestra las declaraciones que hizo en otro lugar, las que le enviaron sus
pares y las construcciones de Explorar que llegaron en forma
descentralizada. Las declaraciones de nombres de lugares también se pueden
encontrar directamente en Nostr, sin ningún par de por medio; consulte
[Nombres de lugares cercanos](WorldViewAdvancedTools.md#nombres-de-lugares-cercanos--descubrir-declaraciones-de-cualquier-persona).

### Declarar la autoría de una estructura

Abra el panel **Información** de una estructura desde **Mis estructuras**,
en la Biblioteca de construcción del Editor. Si tiene una identidad de
plano (la mayoría de las estructuras guardadas la tienen), su sección
**Atribución de la comunidad** ofrece:

- **Declarar autoría**: firma, con su identidad actual, una declaración de
  que usted la diseñó. Aparece hasta que la haya declarado.
- **Exportar atribución**: guarda su declaración como un archivo que puede
  darle a alguien.
- **Publicar en la red**: anuncia su declaración a todos los pares con los
  que está conectado, lo que la pone en su página Registros firmados, y en la
  suya.

Una vez publicada, el panel ofrece **Distribuir**, para que también puedan
encontrarla quienes no están conectados con usted. **Distribuir** abre el
mismo diálogo que ofrece el Editor después de publicar un Mundo, solo con la
mitad de la Declaración firmada (una declaración de autoría no tiene
Snapshot): elija dónde se guarda su contenido y dónde se anuncia, y luego
haga clic en **Distribuir Declaración firmada**. **Ahora no** oculta el
ofrecimiento; puede distribuir la declaración más tarde desde su tarjeta en
la página Registros firmados (consulte [Distribución](Distribution.md)).

### Nombrar un lugar

En la Vista del mundo, abra el panel de nombres de una Región o un Hito y
use **Publicar un nombre** (consulte
[Lugares geográficos](03-WorldView.md#lugares-geográficos)). Esto anuncia
una declaración firmada a sus pares conectados.

Justo después de publicar, el panel ofrece **Distribuir** el nombre, para
que también puedan encontrarlo quienes no están conectados con usted, por
ejemplo mediante
[Nombres de lugares cercanos](WorldViewAdvancedTools.md#nombres-de-lugares-cercanos--descubrir-declaraciones-de-cualquier-persona).
Elija la **Red** (Arweave, Blurt, Nostr o Steem; empieza en su
[Proveedor de anuncio / descubrimiento](10-NetworkSettings.md#proveedor-de-anuncio--descubrimiento))
y haga clic en **Distribuir**, o en **Ahora no** para omitirlo. También puede
distribuir cualquier declaración más tarde: abra **Más** en el panel de
nombres y haga clic en **Distribuir** junto a ella en **Todas las
declaraciones**. Publicar y distribuir siguen siendo pasos aparte: ninguno
hace el otro. Si funciona, indica en qué red se anunció el nombre; si falla,
muestra por qué, la mayoría de las veces porque falta la extensión de Nostr
en el navegador o porque la red no está configurada en este dispositivo.

### Recibir una de un par

Cuando se conecta con un par (consulte
[Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md)), su
dispositivo recibe todo lo que esa persona publicó, no solo lo que publica
mientras están conectados. Una declaración recibida es solo un registro
firmado válidamente: su contenido no está en su dispositivo hasta que lo
obtenga con **Recuperar de los pares** (abajo).

### Una construcción de Explorar, descentralizada

Una tarjeta también puede contener un **Mundo compartido**: el mismo tipo
de objeto que una entrada de Explorar, empaquetado para viajar de forma
descentralizada. **Compartir con pares**, en Explorar, crea uno para
sus propios Mundos (consulte
[Compartir con pares conectados](04-PublishingAndForking.md#compartir-con-pares-conectados)).
Cuando resuelve uno aquí con **Volver a comprobar** o **Recuperar de los
pares**, se suma a la búsqueda de Explorar, a la página de su autor y a
la Vista del mundo, y sigue allí después de recargar.

## La página Registros firmados

Abra **Registros firmados** (**Más → Avanzado**). Muestra todos los
registros firmados que catalogó este dispositivo, suyas o de un par. Al
final, el panel plegado **Herramientas de billetera y archivo**
contiene herramientas para toda la página en tres pestañas: **Anclaje en
blockchain**, **Herramientas de archivo** y **Referencias y logros**
(consulte las guías [11](11-EvidenceAndStorage.md) y
[12](12-ArchiveAndAchievements.md)). El enlace a él en la introducción de
la página, y en cualquier paso que necesite observar antes una billetera,
lo abre por usted.

El panel solo aparece mientras **Mostrar herramientas experimentales**
está activado en [Configuración de red](10-NetworkSettings.md#mostrar-herramientas-experimentales); hasta entonces, la
introducción enlaza a Configuración de red. Un paso que necesite observar
antes una billetera sigue abriendo el panel durante esa visita.

Cada tarjeta de registro muestra:

- Su nombre, una vez que se comprobó su contenido: el título de un Mundo
  compartido o un nombre de lugar. En otro caso, o para una declaración de
  autoría, el tipo de registro.
- El tipo de registro (debajo del nombre, cuando lo hay) y quién lo
  publicó, abreviado a los últimos caracteres de su ID.
- Una **insignia de estado** (consulte
  [Significado de los estados](#significado-de-los-estados)), que se vuelve
  a calcular cada vez que se carga la página o hace clic en **Volver a
  comprobar**.
- Un resumen de una línea de la declaración: la huella y el declarante de
  una atribución, o un nombre de lugar y su declarante.
- **Recuperar de los pares**, mientras el contenido no está disponible
  (deshabilitado si no hay ningún par conectado). Les pide los bytes a los
  pares conectados uno por uno, y los acepta solo después de que su
  dispositivo los compruebe contra el hash del contenido.
- **Volver a comprobar**: vuelve a calcular el estado ahora.

Debajo, dos secciones plegadas:

- **Distribución**: anunciar el registro, guardar su contenido y
  anclarlo. Guardar y anclar empiezan cada uno con un botón para el
  proveedor que guardó en **Configurar** (**Guardar en IPFS**, **Anclar en
  Steem**), con todos los demás proveedores plegados en **Otras opciones
  de …**. Sin un proveedor guardado que pueda usar, se muestran en cambio
  todas las opciones. Steem, Blurt y el pinning remoto de IPFS están marcados
  como **Experimental** dondequiera que se ofrezcan, igual que todo tipo
  de anclaje salvo en Arweave. Consulte
  [Distribuir desde la página Registros firmados](#distribuir-desde-la-página-registros-firmados)
  y [Evidencia y almacenamiento](11-EvidenceAndStorage.md).
- **Detalles**, en cuatro pestañas:

| Pestaña | Qué hay |
|---|---|
| **Snapshot** | [Snapshot local](#snapshot-local): lo que tiene este dispositivo y cómo obtenerlo. |
| **Descentralización y evidencia** | [Descentralización](#la-descentralización-de-un-vistazo), la [lista de evidencia](11-EvidenceAndStorage.md#la-lista-de-evidencia) y los pasos de las transacciones de Bitcoin y Base (Experimental). |
| **Colocaciones e IPFS** | La lista de [Ubicaciones de Snapshots](11-EvidenceAndStorage.md#ubicaciones-de-snapshots) y la [Publicación en IPFS](11-EvidenceAndStorage.md#publicación-en-ipfs) (Experimental). |
| **Historial** | **Mostrar línea de tiempo entre dominios**: todas las observaciones de IPFS, Bitcoin y Base que este dispositivo registró para este registro, en orden cronológico, tomadas del [Archivo de observaciones](12-ArchiveAndAchievements.md), así que se conservan entre visitas; o un aviso de que todavía no hay nada registrado. |

### Significado de los estados

| Insignia | Significado |
|---|---|
| **Disponible** | El contenido está en este dispositivo ahora. |
| **Contenido no disponible** | La declaración es auténtica, pero el contenido todavía no está aquí. Pruebe **Recuperar de los pares**. |
| **Sobre de registro no válido** / **Firma de registro no válida** | El registro está mal formado, o no se firmó de verdad. |
| **El contenido no coincide con su propia referencia** / **Contenido no válido** / **Firma del contenido no válida** | El contenido no coincide con lo que declara el registro. |
| **No pasó una comprobación específica del dominio** | Está bien formado y firmado, pero no pasa una comprobación propia de su tipo. |
| **Tipo de registro no compatible** | Esta versión no puede mostrar este tipo de registro. |

Esto describe si el registro pasa la comprobación, no si el diseño o el
nombre son buenos.

Un registro cuyo estado no sea **Disponible** ni **Contenido no
disponible** no se puede abrir, distribuir ni anclar, así que no recibe una
tarjeta completa. Estos se reúnen al final de la página en un grupo
plegado, “*N* registros que no se pueden usar”, cada uno con su estado,
el motivo, **Volver a comprobar** y **Quitar de este dispositivo**.
También quedan fuera de **Anclar varios registros**. El motivo más
común es un registro hecho antes de que los hashes de contenido
pasaran a ser SHA-256: solo su autor puede arreglarlo, volviendo a
publicarlo.

Si uno de ellos es **suyo** (firmado por una identidad de este
dispositivo) y falló solo por su hash antiguo, aparece primero con una
insignia **Suya**. En lugar de “su autor tiene que volver a publicarlo”, le
dice cómo hacerlo:

| Tipo | Cómo volver a publicarlo |
|---|---|
| **Mundo compartido** | Vuelva a publicar el Mundo desde el Editor; luego use **Compartir con pares** debajo de él en Explorar (**Abrir Explorar**). |
| **Atribución de plano** | En el Editor, abra el panel **Información** de la estructura, **Volver a firmar para este diseño** y luego **Publicar en la red** (**Abrir el Editor**). |
| **Declaración de nombre de lugar** | En la Vista del mundo, abra el panel de nombres del lugar y vuelva a usar **Publicar un nombre**. |

Para un Mundo, la tarjeta va un paso más allá cuando este dispositivo
todavía tiene su propio registro de lo que usted publicó: lleva el nombre
del Mundo (**Mi castillo** en lugar de **Mundo compartido**) y **Abrir en
el Editor** abre ese Mundo, listo para volver a publicarlo. El nombre y el
enlace salen de su propio registro, nunca del contenido de la entrada
antigua, que nadie puede comprobar. Si el registro ya no está (desde
entonces retiró la publicación de ese Mundo), la tarjeta muestra **Abrir
Explorar** como arriba.

La nueva copia recibe su propia tarjeta; luego quite la antigua. La antigua
nunca se acepta, aunque sea suya: este dispositivo también guarda
contenido que recibió de pares, así que el hash antiguo no puede probar qué
bytes publicó usted.

**Quitar de este dispositivo** (o **Quitar las *N* de este dispositivo**,
arriba del grupo) le pide confirmación y luego olvida el registro aquí.
No retira ninguna publicación ni llega a nadie más, y un par conectado que
todavía lo tenga puede volver a anunciarlo. Solo se pueden quitar los
registros de este grupo.

Quitar un registro nunca afecta a sus construcciones. La construcción detrás
de un Mundo compartido sigue en el Editor, en Explorar y en su página
(**Más → Mis construcciones**); solo se va la copia del registro firmado de
este dispositivo. Para volver a compartir esa construcción con los pares,
ábrala, use **Publicar** y luego **Compartir con pares**: eso crea un
registro nuevo.

### Distribuir desde la página Registros firmados

**Distribución → Anuncio / descubrimiento** tiene dos tarjetas:

- **Registro** anuncia el registro firmado en sí en el **Sustrato**
  que elija (Arweave, Nostr, Steem o Blurt; estos dos últimos son Experimentales). Empieza en su
  [Proveedor de anuncio / descubrimiento](10-NetworkSettings.md#proveedor-de-anuncio--descubrimiento).
- **Snapshot** guarda el contenido en **Contenido** y lo anuncia en su
  propio **Sustrato**, que también empieza en ese proveedor. Para un Mundo,
  es el Snapshot propio del Mundo, anunciado junto con el lugar donde lo
  colocó su editor cuando este dispositivo tiene esa colocación firmada,
  igual que **Distribuir** en la Vista del mundo. Para cualquier otro tipo,
  es el contenido del registro, anunciado solo por su hash. Este
  dispositivo necesita los bytes: para un Mundo que no abrió, primero
  ábralo en la Vista del mundo u obténgalo de un par.

El resultado indica el sustrato que usó, como **Steem: Anunciado**, y para
un Mundo dice si la colocación de su editor se envió con él. **No
anunciado** significa que solo falló el anuncio; el contenido se guardó.

## Comentarios

Cualquiera con un nombre puede comentar cualquier
registro que se resuelva: una construcción de Explorar, una declaración
de autoría o un nombre de lugar. No hay comprobación de propiedad, ni
requisito de amistad, ni moderación.

Encontrará los comentarios:

- en **Explorar** y en las páginas de autor: el botón **Comentar** de
  cada tarjeta y de cada fila de la lista;
- en el panel
  [Mi Mundo compartido](WorldViewAdvancedTools.md#mi-mundo-compartido--distribuir-su-propio-snapshot-sin-necesidad-de-pares)
  de la Vista del mundo, en su sección **Comentarios**;
- en un **Encuentro en el Mundo** seleccionado: su botón **Comentar**.

Cada uno muestra los comentarios, del más antiguo al más reciente, con la
identidad de cada autor. Con un nombre elegido, tiene un cuadro de texto y
**Publicar comentario**; si no, una nota para que elija un nombre.

Los comentarios son permanentes: no se pueden editar, eliminar ni
responder.

### Cómo viajan los comentarios

Un comentario publicado desde **Explorar** se guarda en su
dispositivo, se envía a los pares con los que está conectado y se publica
en la red elegida junto a **Publicar comentario** (Nostr, Arweave, Steem o Blurt;
empieza en su
[Proveedor de anuncio / descubrimiento](10-NetworkSettings.md#proveedor-de-anuncio--descubrimiento)),
para que puedan encontrarlo personas que no estaban conectadas. Cerrar la
sección (**Ocultar comentarios**) descarta todo lo que haya escrito sin
publicar. Los comentarios publicados desde **Mi Mundo compartido** o
**Encuentros en el Mundo** de la Vista del mundo viajan de la misma manera,
con la misma elección de red junto a **Publicar comentario**.

Para que un comentario no llegue a ninguna red, elija **Solo local y
pares**. Se guarda en su dispositivo y se envía solo a los pares conectados
en ese momento, así que no necesita cuenta en ninguna red. Quien no esté
conectado cuando lo publique no lo recibirá, y nadie podrá encontrarlo
después en una red.
Para que todos los formularios de comentarios empiecen con ella, elíjala en
**Comentarios** en la página [Proveedor de anuncio /
descubrimiento](10-NetworkSettings.md#proveedor-de-anuncio--descubrimiento).

¿Creó después una cuenta en una red, o quiere un comentario también en otra
red? Bajo cada uno de sus comentarios, una línea indica a qué redes lo envió
este dispositivo, o *Aún no se envió a ninguna red desde este dispositivo.*
**Distribuir** ahí lo envía a la red que elija e indica si funcionó; una red
a la que ya se envió aparece marcada y no se puede volver a elegir. Solo lo
ve el autor del comentario, con ese nombre, porque solo él puede
firmarlo para una red, y la línea solo sabe lo que envió este dispositivo.

Los comentarios de otras personas le llegan:

- de los pares conectados, a medida que se publican;
- de las redes, cuando abre los comentarios de un registro y cada vez
  que hace clic en **Buscar comentarios nuevos**. Así es como ve los
  comentarios publicados mientras estaba desconectado.

La línea junto al botón informa la última búsqueda, como *Se encontraron 2
comentarios nuevos* o *No se encontraron comentarios nuevos* (que solo
abarca las redes que respondieron). Una red que no se puede alcanzar se
nombra (*Arweave no disponible*); si ninguna responde, verá *No se pudo
alcanzar Nostr o Arweave: se muestran los comentarios guardados en este
dispositivo*. Solo se buscan los registros cuyos comentarios abre. Se
comprueba la firma de cada comentario obtenido, y ninguno se cuenta dos
veces.

Cuando alguien comenta un registro que usted publicó, aparece una
entrada **Nuevo comentario en su construcción** en su
[Historial de notificaciones](03-WorldView.md#orientación-y-ubicaciones)
(el botón 🔔 del encabezado).

## Snapshot local

En la pestaña **Snapshot** de una tarjeta, **Snapshot local** responde una
sola pregunta: ¿tiene este dispositivo, en este momento, los bytes del
contenido de este registro? No comprueba firmas ni colocaciones, y solo
contacta a la red cuando hace clic en una de las acciones de recuperación.

### Comprobar lo que tiene

**Comprobar Snapshot local** (y luego **Comprobar de nuevo**):

| Insignia | Significado |
|---|---|
| **Disponible** | Los bytes están aquí y coinciden con el hash del contenido. |
| **No disponible** | Nunca se guardó nada con este hash. |
| **El hash no coincide** | Hay algo guardado con este hash, pero ya no coincide. |

Dos personas con el mismo registro pueden obtener respuestas distintas,
porque su almacenamiento es distinto. Después de una comprobación, una
línea dice *Registro: conocido localmente / no conocido localmente ·
Snapshot: disponible / no disponible*: si este dispositivo catalogó el
registro firmado, y si tiene bytes válidos.

Si la comprobación no encuentra bytes válidos, una indicación señala las
formas de traerlos, más abajo. Nada se reintenta por sí solo.

### Traer los bytes

Tres acciones, cada una con su propio clic:

**Importar Snapshot**: muestra un selector de archivos y un cuadro para
pegar un **Paquete de transferencia de Snapshot de publicación** (un
paquete JSON con el contenido de un registro). Elija o pegue uno y
luego haga clic otra vez en **Importar Snapshot**.

| Insignia | Significado |
|---|---|
| **Importado** | Guardado y comprobado contra su hash. |
| **Ya disponible** | Ya había aquí bytes que coinciden. |
| **Importación rechazada** | Los bytes del paquete no coinciden con su propio hash. |
| **No se importó el Snapshot** | No es un paquete válido. |

**Obtener Snapshot del par**: elija un par conectado y haga clic en
**Obtener Snapshot del par** (y luego **…de nuevo**). Solo le pregunta a
ese par.

| Insignia | Significado |
|---|---|
| **Obtenido** | Los bytes del par coinciden con el hash del contenido. |
| **Ya disponible** | Ya había aquí bytes que coinciden. |
| **No disponible en este momento** | El par no respondió, o no los tiene. |
| **Rechazado** | Los bytes del par no coincidieron. |

**Materializar Snapshot**, desde una ubicación (consulte
[Ubicaciones de Snapshots](11-EvidenceAndStorage.md#ubicaciones-de-snapshots)),
es la tercera forma. Cuando una de las tres funciona, una línea
**Fuente:** nombra la más reciente que funcionó: “Paquete de
transferencia”, “Ubicación” o “Par”.

### ¿Qué pares lo tienen?

**¿Qué pares lo tienen?** pregunta a sus pares conectados si tienen los
bytes, sin traerlos. Cada par conectado aparece en la lista, marcado;
desmarque los que no quiera consultar y luego haga clic en **Preguntar a
los pares seleccionados** (después, **Preguntar de nuevo a los pares
seleccionados**). La última respuesta de cada par aparece con el momento en
que llegó, además de los totales: **Disponible**, **No disponible** o **No
se pudo determinar** (no respondió a tiempo). Una respuesta es lo que ese
par dijo en ese momento, no una promesa.

Un par que respondió **Disponible** tiene su propio botón **Obtener
Snapshot de *par***. Le pide los bytes solo a ese par y los comprueba, como
**Obtener Snapshot del par**; nunca se trae nada de nadie más por usted.
**Mostrar respuestas de esta visita** lista cada respuesta en una fila
(como `20:21:04 — Alice → Disponible`); haga clic en una fila para ver el
informe completo, el registro y el hash del contenido. Una fila nunca se
reescribe.

### Intentos en esta visita

Una vez que haya intentado traer los bytes, **Intentos en esta visita**
cuenta los intentos de esta visita por resultado y por fuente. Un intento
que guardó los bytes no significa que sigan aquí; eso lo dice **Comprobar
Snapshot local**. **Mostrar historial de adquisición** lista cada intento
(como `20:16 — Par → Hash no coincide`); haga clic en uno para ver su
resultado, el registro y el hash del contenido.

## La descentralización de un vistazo

En la pestaña **Descentralización y evidencia**, cuando
un registro tiene un anclaje o una ubicación, **Descentralización**
compara la
[Evidencia externa](11-EvidenceAndStorage.md#evidencia-externa) y las
[Ubicaciones de Snapshots](11-EvidenceAndStorage.md#ubicaciones-de-snapshots):

- **Registro: conocido localmente / no conocido localmente**: si este
  dispositivo catalogó el registro firmado.
- Dos tarjetas con cuántas declaraciones de cada tipo se conocen, y si
  coinciden en el hash del contenido (**Acuerdo**) o no (**Conflicto**). Si
  una coincide y la otra está en conflicto, una frase lo indica; el acuerdo
  en una no garantiza la otra. Sin declaraciones de un tipo todavía, dice
  en cambio **Todavía no hay nada que comparar**.
- **Sincronizar con los pares** (y luego **Sincronizar de nuevo**) les
  pide a todos los pares conectados los anclajes y las ubicaciones que
  usted no tiene, e informa **Declaraciones nuevas** y **Ya conocidas** para
  cada tipo.
- **Mostrar conocimiento de la réplica** muestra, para cada anclaje y cada
  ubicación, cómo lo conoció este dispositivo (**Adquisición**: *Conocido
  localmente*, *mediante la importación de un paquete* o *mediante
  intercambio entre pares*), **Visto por primera vez** y su estado actual
  de **Verificación** / **Resolución**. No contacta ninguna red.

## Qué se conserva al recargar

Las declaraciones firmadas y los hechos registrados se conservan; las
comprobaciones, los intentos y las pantallas en curso no.

| Se conserva en este dispositivo | Se restablece al recargar |
|---|---|
| La evidencia y las ubicaciones catalogadas, y el **Conocimiento local** de cada una | Los resultados de **Verificar evidencia** y **Resolver Snapshot** |
| Los bytes de Snapshots que importó, recuperó o materializó | Todo lo demás en **Snapshot local**: comprobaciones, historial de intentos, la línea **Fuente:**, comprobaciones y comparaciones con pares |
| Los conteos de **Descentralización** (se calculan en cada carga) | Los resultados de **Sincronizar con los pares** |
| — | **Publicación en IPFS**: la configuración del proveedor, los resultados, el historial en pantalla y el historial de verificación |
| Las entradas de **Registros de anclaje en Bitcoin/Base**, creadas al finalizar | La conexión de los flujos de billetera, la observación de fondos o de la cuenta, el plan, la revisión, la firma, la transacción finalizada, el resultado de la transmisión y el historial en pantalla de confirmación o inclusión |
| El **Archivo de observaciones de registros** (cada publicación y verificación en IPFS, cada transmisión, confirmación y prueba de contenido de Bitcoin, y cada inclusión en Base), hasta **Vaciar archivo** | — |
| Las Referencias entre registros | Qué tarjetas y filas tenía abiertas |

Después de recargar, los resultados de un flujo o de una publicación en
IPFS siguen visibles en el
[Archivo de observaciones](12-ArchiveAndAchievements.md#el-archivo-de-observaciones-de-registros),
en el ciclo de vida de un registro o (para Bitcoin) en la Evidencia
histórica de anclajes en Bitcoin. Vuelva a conectar la billetera, o
vuelva a configurar el proveedor de pinning, para continuar.

## ¿Y ahora qué?

Compartir sus construcciones sigue ocurriendo en
[Publicar y remezclar](04-PublishingAndForking.md). Para ir más allá aquí,
continúe con [Evidencia y almacenamiento](11-EvidenceAndStorage.md).
