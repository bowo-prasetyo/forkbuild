<!-- translation-of: docs/user/04-PublishingAndForking.md source-hash: e2f44cb736080f44 -->
# 04 — Publicar y bifurcar

<!-- languages -->
[English](../04-PublishingAndForking.md) · [Deutsch](../de/04-PublishingAndForking.md) · **Español** · [Français](../fr/04-PublishingAndForking.md) · [Bahasa Indonesia](../id/04-PublishingAndForking.md) · [日本語](../ja/04-PublishingAndForking.md) · [한국어](../ko/04-PublishingAndForking.md) · [Português (Brasil)](../pt-BR/04-PublishingAndForking.md)
<!-- /languages -->

Este es el corazón de ForkBuild. **Publicar** comparte su creación con el
mundo. **Bifurcar** permite que cualquiera copie una creación y la haga
evolucionar, conservando todo el historial.

## Publicar su creación

1. Construya algo en el Editor.
2. Inicie sesión y asegúrese de que su identidad esté desbloqueada
   (consulte [Identidad e inicio de sesión](05-IdentityAndLogin.md)).
   Publicar firma la creación con ella; si se publica sin haber iniciado
   sesión, no tiene autor.
3. Póngale un título (Publicar rechaza una creación sin título o vacía) y,
   si quiere, una descripción y una licencia: haga clic en **✎** junto al
   título del documento en la barra lateral para abrir **Propiedades del
   documento**. Un documento nuevo no tiene licencia, así que nadie puede
   bifurcarlo hasta que elija una.
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
enlace** y **Guardar imagen**, con el enlace debajo. Los mismos botones
están en **Mi Mundo compartido** en la Vista de mundo.

- **La construcción viaja dentro del enlace.** No hace falta distribuir nada
  antes, y no interviene ninguna billetera, cuenta ni servidor: el enlace
  lleva su Mundo compartido firmado y la construcción misma. Quien lo abra,
  en cualquier dispositivo, llega a la Vista de mundo con su construcción, y
  **Editar una copia** la hace suya. ForkBuild comprueba la firma, y que la
  construcción coincida con ella, antes de mostrar nada; un enlace
  modificado o incompleto lo indica.
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

## Distribuir directamente desde el Editor

En cuanto **Publicar** funciona, el Editor muestra ahí mismo un pequeño
aviso (“Mundo compartido publicado correctamente.”) con un botón
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
| **Bifurcar** | Lo copia en una creación editable propia |
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

**Bifurcar** es lo que hace especial a ForkBuild. Cuando bifurca una
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
2. Haga clic en **Bifurcar**.
3. La copia se abre en el Editor, titulada *“Bifurcación de &lt;nombre
   original&gt;”*.
4. Construya sobre ella y luego guárdela y publíquela como propia.

Su bifurcación publicada aparece con una nota **“↳ Bifurcación de …”**,
que la vincula con el original.

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
