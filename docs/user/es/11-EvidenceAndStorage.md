<!-- translation-of: docs/user/11-EvidenceAndStorage.md source-hash: bab90f7325291119 -->
# 11 — Evidencia y almacenamiento

<!-- languages -->
[English](../11-EvidenceAndStorage.md) · [Deutsch](../de/11-EvidenceAndStorage.md) · **Español** · [Français](../fr/11-EvidenceAndStorage.md) · [Bahasa Indonesia](../id/11-EvidenceAndStorage.md) · [日本語](../ja/11-EvidenceAndStorage.md) · [한국어](../ko/11-EvidenceAndStorage.md) · [Português (Brasil)](../pt-BR/11-EvidenceAndStorage.md)
<!-- /languages -->

> **En su mayor parte experimental.** Guardar contenido en IPFS o Arweave
> desde el bloque **Distribución → Contenido** de una tarjeta
> ([Crear una ubicación](#crear-una-ubicación) y
> [Usar un proveedor preferido](#usar-un-proveedor-preferido)) es una
> función habitual, igual que los anclajes en Arweave y la lista de
> evidencia. Todo lo demás aquí es **Experimental**: los demás tipos de
> evidencia externa y los dos flujos de billetera, la lista de Ubicaciones
> de Snapshots, el pinning remoto de IPFS y Steem. Puede cambiar o
> eliminarse en una versión futura, y lo que produce podría no
> conservarse. La página marca estas partes con una insignia
> **Experimental**.

Cada tarjeta de la página **Publicaciones** (consulte
[Publicaciones y evidencia externa](09-PublicationsAndEvidence.md)) tiene
secciones para demostrar *cuándo* existía una publicación y para poner su
contenido en algún lugar donde otras personas puedan obtenerlo:

- **[Evidencia externa](#evidencia-externa)**: registros en Bitcoin, Base,
  Arweave, Steem o Blurt de que el hash de contenido de una publicación existía en
  cierto momento.
- **[El flujo de anclaje en Bitcoin](#el-flujo-de-anclaje-en-bitcoin)** y
  **[El flujo de anclaje en Base](#el-flujo-de-anclaje-en-base)**: flujos
  paso a paso que usan su propia billetera para escribir una transacción
  real.
- **[Ubicaciones de Snapshots](#ubicaciones-de-snapshots)**: punteros
  firmados a dónde se puede obtener el contenido: IPFS, Arweave o este
  dispositivo.
- **[Publicación en IPFS](#publicación-en-ipfs)**: subir a un servicio de
  pinning remoto.
- **[Steem](#steem)**: publicar, guardar y compartir enlaces en Steem.
- **[Blurt](#blurt)**: publicar, guardar y anclar en Blurt, desde su propia
  cuenta, con recompensas.

La evidencia y las ubicaciones responden a preguntas distintas. Un anclaje
muestra que un hash se registró en algún momento; no dice nada sobre si
los bytes todavía se pueden obtener. Una ubicación dice dónde se pueden
obtener los bytes; no dice nada sobre cuándo se hizo por primera vez la
declaración.

## Evidencia externa

Los anclajes en Arweave y la lista de evidencia son una función habitual.
Los anclajes en Bitcoin, Base, Steem y Blurt son *Experimentales*, y cada
uno está marcado así.

Que un anclaje aparezca aquí solo significa que este dispositivo tiene un
registro firmado válidamente que dice “esto se registró externamente”. Si
el registro realmente ocurrió se comprueba solo cuando hace clic en
**Verificar evidencia**. Nada en la página se verifica automáticamente: ni
al cargar, ni cuando llega evidencia, ni cuando despliega la lista.

### Crear evidencia

En la sección **Distribución** de la tarjeta de una publicación, el bloque
**Prueba / anclaje** (con Steem y Blurt marcados como **Experimental**) tiene una tarjeta por
cada tipo de evidencia que se puede crear con un clic, cada una con su
propio botón: **Crear anclaje en Arweave** y **Crear anclaje en Steem**.
Los anclajes en Bitcoin y Base no tienen una tarjeta así: se hacen
mediante sus pasos de billetera en la pestaña **Detalles →
Descentralización y evidencia** de la tarjeta, y el bloque lo indica.
Cuando guardó un proveedor preferido, estas tarjetas quedan plegadas en
**Otras opciones de anclaje**, debajo del botón propio de ese proveedor
(consulte
[Anclar en un proveedor preferido](#anclar-en-un-proveedor-preferido)).
Cada una registra el hash de contenido de la publicación en una
transacción en esa red, con uno de tres resultados:

| Resultado | Significado |
|---|---|
| **Anclaje creado** | Funcionó. El nuevo anclaje aparece en la lista, todavía sin verificar. |
| **Registro rechazado** | Se alcanzó la red y se negó. |
| **No se creó ningún anclaje** | No se pudo alcanzar la red, o este dispositivo no puede firmar para ella. |

- Para Bitcoin, use
  [El flujo de anclaje en Bitcoin](#el-flujo-de-anclaje-en-bitcoin); para
  Base,
  [Crear un anclaje en Base en un solo paso](#crear-un-anclaje-en-base-en-un-solo-paso).
- **Crear anclaje en Arweave** necesita una extensión de billetera de
  Arweave, como Wander.
- **Crear anclaje en Steem** necesita la extensión Steem Keychain, y su
  cuenta de Steem configurada en
  [Configuración de red → Steem](10-NetworkSettings.md#steem).
- **Crear anclaje en Blurt** necesita la extensión Blurt Keychain (o
  WhaleVault), y su cuenta de Blurt configurada en
  [Configuración de red → Blurt](10-NetworkSettings.md#blurt).

Una publicación hecha antes de que los hashes de contenido pasaran a ser
SHA-256 nunca se ancla, ni con estos botones, ni con los pasos de Bitcoin o
Base, ni con **Anclar varias publicaciones**: nadie más puede comprobar
contenido contra su hash antiguo, así que un registro de ella no probaría
nada. Obtiene **Registro rechazado** (o, para Bitcoin y Base, un paso de
transacción fallido) indicando que la vuelva a publicar, antes de que se le
pregunte nada a ninguna billetera. Lo mismo vale para las ubicaciones, que
terminan en **No se creó ninguna ubicación**.

Después de que funciona, el botón dice **Crear otro anclaje en …**, que crea
un segundo anclaje independiente. Los anclajes en Base se hacen de otra
forma; consulte
[Crear un anclaje en Base en un solo paso](#crear-un-anclaje-en-base-en-un-solo-paso).

**Los anclajes en Steem son más débiles que los de Bitcoin.** No cuestan
ninguna comisión, solo Resource Credits (que se recargan), y el bloque es
definitivo alrededor de un minuto después. Hasta entonces, la tarjeta dice
**Waiting for finality** (esperando que sea definitivo), luego
**Anchored** (anclado) (o, en raras ocasiones, **Not anchored**, no
anclado, si la cadena lo descartó: créelo de nuevo). **Verificar
evidencia** informa **Verificación no disponible** durante ese primer
minuto, y después dice cuándo, y por qué testigo, se registró el bloque.
**Inspeccionar evidencia** muestra la hora del bloque de inmediato, a partir
de una copia del encabezado firmado del bloque que su dispositivo comprueba
sin conexión. Un bloque de Steem lo firman unos 21 testigos elegidos por
participación, no lo protege una prueba de trabajo, así que suficientes de
ellos juntos podrían reescribir la historia; la tarjeta dice “Attested by
Steem witnesses” (certificado por testigos de Steem). Use un anclaje en
Steem como evidencia rápida y gratuita junto a uno en Bitcoin, no en su
lugar.

**Los anclajes en Blurt** los certifican los testigos de Blurt de la misma
manera, y son igual de más débiles que los de Bitcoin. Cuando este
dispositivo ya publicó el Snapshot de su construcción en Blurt (lo anunció
o lo guardó allí), esa publicación es el anclaje: **Crear anclaje en
Blurt** no publica nada y no cuesta nada. Si no, agrega el hash de
contenido de la construcción a su publicación actual en Blurt, o crea una
nueva, por una pequeña comisión en BLURT. La finalidad, **Verificar
evidencia** e **Inspeccionar evidencia** funcionan como en Steem, y la
tarjeta enlaza a la publicación.

**Anclar varias publicaciones a la vez en Steem.** En **Herramientas de
billetera, archivo y editor → Anclaje en blockchain**, **Anclar varias
publicaciones en Steem** muestra sus publicaciones catalogadas. Marque las
que quiera (o use **Seleccionar las no ancladas**) y haga clic en **Anclar
N publicaciones en Steem**. Una sola aprobación de Keychain ancla hasta 64.
Cada publicación igual recibe su propio anclaje, que se verifica por
separado. **Anclar varias publicaciones en Blurt** funciona igual, con una
sola aprobación de Blurt Keychain.

### Anclar en un proveedor preferido

El enlace **Configurar** del bloque **Prueba / anclaje** abre
[Proveedor de prueba / anclaje](10-NetworkSettings.md#proveedor-de-prueba--anclaje),
donde elige uno predeterminado. Una vez elegido, el bloque empieza con un
botón con su nombre, como **Anclar en Steem**, que ancla allí con los
mismos resultados que los botones de arriba. Dice **Anclando…** mientras
trabaja y muestra la transacción y el hash de contenido del nuevo anclaje
cuando termina. Todos los demás tipos siguen a un clic de distancia en
**Otras opciones de anclaje**. Guardar una preferencia no cambia esos
botones ni los anclajes existentes.

No hay un botón así, y se muestran todas las opciones, cuando no hay nada
guardado, cuando el proveedor guardado no está registrado en este
dispositivo, o cuando es Bitcoin: un anclaje en Bitcoin se hace mediante
sus pasos de billetera (consulte
[El flujo de anclaje en Bitcoin](#el-flujo-de-anclaje-en-bitcoin)), y el
bloque lo indica.

### Descubrir de los pares

Los pares conectados solo transmiten la evidencia creada o anunciada de
nuevo mientras usted está conectado. **Descubrir de los pares** cubre ese
hueco: les pide a los pares conectados, uno por uno, todos los anclajes que
conocen para esta publicación, incluidos los que conocieron por otros. Nada
más en la página contacta a un par.

| Mensaje | Significado |
|---|---|
| *Se descubrieron N declaraciones de evidencia nuevas de los pares.* | Ahora están en la lista de abajo. |
| *No se descubrieron declaraciones de evidencia nuevas de los pares.* | Estos pares no tenían nada nuevo. No significa que no exista evidencia. |
| *No había ningún par autenticado disponible a quien preguntar.* | Primero conéctese con un par (consulte [Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md)). |
| *No se pudo completar la operación de descubrimiento entre pares solicitada.* | Algo falló localmente antes de preguntarle a ningún par. |

Los anclajes descubiertos llegan sin verificar, se conservan sus
resultados de verificación anteriores y el mismo anclaje nunca se agrega
dos veces.

### La lista de evidencia

En la pestaña **Descentralización y evidencia** de la tarjeta, **Evidencia
externa** muestra cuántos anclajes se conocen y ofrece **Descubrir de los
pares** (arriba). **Mostrar evidencia** muestra todos los anclajes que se
conocen para la publicación, uno al lado del otro, incluso los que no
coinciden. Con más de un anclaje, primero aparece un resumen **Vínculo con
el contenido**, que cuenta los anclajes por hash de contenido y advierte
cuando declaran hashes distintos. No dice cuál es el correcto.

Cada anclaje muestra:

| Campo | Significado |
|---|---|
| **Localizador** | Dónde dice el sistema externo que se encuentra el registro. |
| **Registrado** | La hora de registro declarada (declarada hasta que la verifique). |
| **Publicación / Hash del contenido** | Lo que une la firma de este anclaje. |
| **Certificado por** | La identidad que firmó el anclaje. |

- **Verificar evidencia** (y luego **Verificar de nuevo**) consulta ahora
  al sistema externo; consulte
  [Resultados de la verificación](#resultados-de-la-verificación).
- **Inspeccionar evidencia** muestra la declaración sin procesar: la hora
  exacta, el localizador y, para Bitcoin, un enlace a un explorador de
  bloques y la prueba sin procesar. Solo lee lo que está en su
  dispositivo. Al final, **Conocimiento local** dice cómo conoció este
  dispositivo el anclaje: **Adquisición** (*Conocido localmente*,
  *Conocido mediante la importación de un paquete* o *Conocido mediante
  intercambio entre pares*) y **Visto por primera vez por esta réplica**.
  Nunca nombra al par y no es una señal de confianza.

### Resultados de la verificación

| Etiqueta | Significado |
|---|---|
| **Verificado de forma independiente** | El sistema externo confirma exactamente lo que se declaró. |
| **Prueba no verificada de forma independiente** | Está firmado de verdad, pero este dispositivo no puede comprobar externamente este tipo de anclaje. |
| **Verificación no disponible** | No se pudo alcanzar el sistema externo. No es lo mismo que no válido. |
| **Evidencia no válida** / **Firma no válida** | El registro está mal formado o no se firmó de verdad. |
| **El contenido no coincide** | El anclaje no coincide con esta publicación. |
| **Prueba externa no válida** | El sistema externo dice que la declaración es falsa. |

Si un anclaje se verificó antes durante esta visita y una comprobación
posterior no puede alcanzar la red, conserva una nota: “Esta evidencia se
verificó antes de forma independiente; en este momento la verificación no
está disponible.”

Los anclajes en Base, se hayan creado aquí o recibido, se verifican con el
mismo botón **Verificar evidencia**.

### Conciliación de anclajes en Bitcoin

La tarjeta de un anclaje en Bitcoin también tiene una sección **Anclaje en
Bitcoin**. **Conciliar** (y luego **Conciliar de nuevo**) hace dos
preguntas separadas y muestra ambas respuestas:

| Confirmación | Significado |
|---|---|
| **Transacción confirmada** | Minada; muestra la altura del bloque, el hash del bloque y las confirmaciones. |
| **Transacción sin confirmar** | No se encontró, o todavía no se minó (no se distingue entre los dos casos). |
| **Estado de confirmación no disponible** | No se pudo comprobar. |

| Prueba de contenido | Significado |
|---|---|
| **El hash coincide con OP_RETURN** | La transacción lleva el hash de contenido declarado. |
| **El hash no coincide con OP_RETURN** | No lo lleva, o la prueba está mal formada. |
| **Prueba de contenido no disponible** | No se pudo comprobar. |

Una transacción confirmada cuyo OP_RETURN no coincide se muestra tal como
es. La confirmación de cada conciliación se agrega a **Mostrar historial de
confirmaciones**, de la más antigua a la más reciente; la prueba de
contenido solo muestra el resultado más reciente.

## El flujo de anclaje en Bitcoin

Un flujo paso a paso que usa su propia billetera de Bitcoin para escribir
el hash de contenido de una publicación en una transacción real. Cada paso
es su propio clic.

> **Esto gasta bitcoin real en la red principal de Bitcoin.** Desde
> **Crear plan de transacción** en adelante, trabaja con los fondos reales
> de su billetera, y **Transmitir transacción** envía una transacción real.
> No hay un modo de prueba.

Todos sus paneles para toda la página están en **Herramientas de
billetera, archivo y editor → Anclaje en blockchain**, el panel plegado al
final de la página Publicaciones; los pasos de cada publicación están en su
tarjeta. Cuando un paso necesita que antes se observe una billetera o sus
fondos, su enlace abre ese panel por usted.

### Qué necesita

- La extensión de navegador **UniSat** (`window.unisat`); todavía no se
  admite ninguna otra billetera de Bitcoin.
- Una cuenta con bitcoin gastable en una dirección **SegWit nativa** (que
  empieza con `bc1q…`). Los fondos en direcciones Taproot (`bc1p…`) o
  heredadas (`1…`, `3…`) se pueden observar pero no firmar; la revisión
  informa que no se pueden revisar.
- Una publicación en su página Publicaciones; la transacción ancla su hash
  de contenido.

### Conectar una billetera

Haga clic en **Conectar billetera de Bitcoin** en la tarjeta **Billetera de
Bitcoin** y apruebe la conexión en la extensión. ForkBuild nunca ve sus
claves, su frase semilla ni su contraseña; obtiene su dirección, su red y
una capacidad de firma mientras está conectada.

| Estado | Significado |
|---|---|
| **Conectada** | Muestra la **Cuenta** y la **Red**. |
| **Desconectada** | Todavía no está conectada, o usted lo rechazó. |
| **Billetera no disponible** | No hay extensión, está bloqueada o no se puede alcanzar. |

La conexión se usa en toda la página. **Desconectar** la quita, y recargar
la olvida. Una billetera en una red que no sea la principal se informa como
una discrepancia; ForkBuild nunca cambia de red por usted.

### Observar los fondos

Una vez conectada, aparece la tarjeta **Fondos de Bitcoin**. **Observar los
fondos de la billetera** (y luego **Actualizar fondos**) lee lo que la
cuenta puede gastar en ese momento. No gasta ni reserva nada, y no se
actualiza por sí solo.

| Estado | Significado |
|---|---|
| **Fondos observados** | Cantidad de UTXO (**Mostrar entradas de fondos** los muestra), su total, el tipo de script y la dirección de cambio (siempre su propia cuenta). |
| **Formato de dirección no compatible** | Un tipo de dirección que todavía no admite comisiones, como las heredadas `3…`. |
| **Fondos no disponibles** | No se pudo alcanzar la fuente de los fondos. |

Si después se vuelve a conectar en otra red, una advertencia indica que la
observación está desactualizada.

### Armar un plan de transacción

En la pestaña **Descentralización y evidencia** de la tarjeta de la
publicación, **Transacción de anclaje en Bitcoin → Crear plan de
transacción** se habilita una vez que observó los fondos. Planifica a
partir de la observación más reciente, eligiendo los UTXO de mayor a menor,
y calcula la comisión.

| Estado | Significado |
|---|---|
| **Plan de transacción construido** | Red, hash del contenido, entradas, comisión, cambio, entrada total, la lista completa de entradas y salidas, y cuándo se observaron los fondos y se armó el plan. |
| **No se puede construir la transacción** | Normalmente, los fondos no alcanzan para cubrir la comisión. |

Un plan nuevo reemplaza todo lo que se haya revisado, firmado o transmitido
antes.

### Revisar y firmar

Un plan completa de inmediato el panel **Revisar la transacción de anclaje
en Bitcoin**: red, hash del contenido, comisión, cambio, entrada total,
entradas y salidas, y si la red de su billetera coincide con la de esta
transacción. **Firmar la transacción revisada** (se habilita cuando hay
conectada una billetera de la red correspondiente) le pide a la billetera
que firme. ForkBuild comprueba primero que lo que se firma siga siendo
exactamente lo que revisó; si no, no se le pregunta nada a la billetera.

| Estado | Significado |
|---|---|
| **La billetera devolvió un PSBT firmado** | La respuesta lleva material de firma para esta transacción. Todavía no está verificado; ese es el paso siguiente. |
| **Firma rechazada** | Usted o la billetera la rechazaron. |
| **Billetera no disponible** | No hay ninguna billetera conectada, o no se puede alcanzar. |
| **La firma falló** | La billetera devolvió algo que no se puede usar. |

### Verificar y finalizar

**Verificar y finalizar transacción** comprueba criptográficamente la
firma, sin conexión.

| Estado | Significado |
|---|---|
| **Transacción finalizada** | La firma es válida. Muestra el ID de la transacción y, en **Bytes sin procesar de la transacción**, la transacción finalizada. |
| **La firma no se pudo verificar** | Clave equivocada, firma equivocada o firmada sobre datos equivocados. |
| **La finalización falló** | Algún otro resultado que no se puede usar. |

Solo se pueden finalizar entradas SegWit nativas (P2WPKH). Finalizar
también registra una
[Publicación de anclaje en Bitcoin](#publicaciones-de-anclaje-en-bitcoin).

### Transmitir

**Transmitir transacción** envía los bytes finalizados, sin cambios, a la
red de Bitcoin.

| Estado | Significado |
|---|---|
| **Transacción transmitida** | La red la aceptó, pero todavía no se minó. |
| **Transacción rechazada** | Se rechazó. |
| **Transmisión no disponible** | No se pudo alcanzar la red. |

**Transmitir de nuevo** vuelve a enviar los mismos bytes. Nada se reintenta
por sí solo.

### Observar la confirmación

Después de una transmisión, **Observar confirmación** comprueba si se minó,
con los mismos tres resultados que la
[Conciliación de anclajes en Bitcoin](#conciliación-de-anclajes-en-bitcoin).
Cada comprobación se agrega al **Mostrar historial de confirmaciones** de
esta transmisión. Esa lista se borra al recargar, pero cada resultado
también se conserva en el
[Archivo de observaciones de publicaciones](12-ArchiveAndLeaderboards.md#el-archivo-de-observaciones-de-publicaciones).

### Lo que no hace el flujo

Cuando **Transmitir transacción** funciona, la transacción se añade a la
lista de **Evidencia externa** de la publicación como un anclaje nuevo, sin
verificar hasta que haga clic en **Verificar evidencia**; los pares pueden
encontrarla con **Descubrir de los pares**. Una transmisión rechazada o que
no llega no añade nada. El flujo no conserva sus pantallas: las de
revisión, firma y transmisión se borran con un plan nuevo, una firma nueva
o al recargar. Lo que se conserva es el registro de publicación
creado al finalizar, y cada resultado de transmisión y de confirmación en el
Archivo de observaciones.

### Publicaciones de anclaje en Bitcoin

La tarjeta **Publicaciones de anclaje en Bitcoin** muestra un registro por
cada transacción que finalizó este dispositivo: `{ ID del anclaje, hash del
contenido, txid, red, fecha de creación }`. Se crea cuando **Verificar y
finalizar transacción** funciona, funcione o no la transmisión después, y
no tiene ningún estado propio de confirmado o válido. **Mostrar
publicaciones** las muestra. Cada fila tiene:

- **Inspeccionar observaciones**: el conteo de cada hecho de transmisión,
  confirmación, prueba de contenido, ubicación en la cadena y coherencia
  que tiene el archivo para ese ID de anclaje.
- **Mostrar ciclo de vida de la publicación**: los mismos hechos en orden
  cronológico, empezando por **Registro de publicación creado**. Un paso
  sin nada registrado simplemente no aparece. Abrirlo no contacta ninguna
  red.

## El flujo de anclaje en Base

La misma idea en **Base**, una red compatible con Ethereum. Es aparte de
Bitcoin: su propia billetera, su propia transacción (una transferencia a sí
misma que lleva el hash de contenido como datos), sus propios términos.

> **Esto gasta fondos reales en la red principal de Base, o fondos de
> prueba en Base Sepolia, según la red en la que esté su billetera.**
> ForkBuild nunca elige la red por usted.

### Qué necesita

- Una billetera de navegador que use la interfaz estándar
  [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) `window.ethereum`,
  como Coinbase Wallet o MetaMask.
- Una cuenta en el ID de cadena **8453** (red principal de Base) o
  **84532** (Base Sepolia). Cualquier otra cadena se informa como una
  discrepancia.
- Una publicación en su página Publicaciones.

### Conectar una billetera y observar una cuenta

En la tarjeta **Red de Base** (en **Herramientas de billetera, archivo y
editor → Anclaje en blockchain**), haga clic en **Conectar billetera de
Base** y apruébelo. Los estados son **Conectada**, **Desconectada** y
**Billetera no disponible**, igual que para Bitcoin; **Desconectar** la
quita y recargar la olvida.

Luego, **Observar cuenta de Base** (más tarde, **Actualizar observación**)
lee la cadena y el saldo de la cuenta:

| Insignia | Significado |
|---|---|
| **Cuenta de Base observada** | **Red**, **ID de la cadena**, **Cuenta**, **Saldo nativo** (en wei) y cuándo se observó. |
| **La red conectada no es Base** | Muestra el ID de cadena que realmente se encontró. |
| **Cuenta de Base no disponible** | No se pudo alcanzar la billetera. |

### Armar un plan de transacción

En la pestaña **Descentralización y evidencia** de la tarjeta de la
publicación, **Transacción de publicación en Base → Crear plan de
transacción de Base** (se habilita una vez que observó una cuenta) arma
una transferencia sin firmar de su cuenta a sí misma, que lleva el hash de
contenido como datos.

| Estado | Significado |
|---|---|
| **Plan de transacción construido** | Red, ID de la cadena, hash del contenido, de/para (la misma dirección), valor, nonce, límite de gas, comisión máxima y comisión de prioridad (en wei), los datos, y cuándo se observó la cuenta y se armó el plan. |
| **Red de Base no disponible** | No se pudo leer la cuenta, la comisión o el nonce. |
| **No se puede construir la transacción** | Algún otro fallo. |

Un plan nuevo reemplaza todo lo que se haya revisado, firmado o transmitido
antes.

### Revisar y firmar

Un plan completa de inmediato la **Revisión de la transacción de Base** de
la tarjeta: de, para, valor, nonce, cifras de gas, hash del contenido y
datos de la transacción. **Firmar la transacción revisada** le pide a la
billetera que firme exactamente ese plan.

| Estado | Significado |
|---|---|
| **La billetera devolvió una transacción firmada** | Firmada, pero todavía sin verificar. |
| **Firma rechazada** | Usted o la billetera la rechazaron. |
| **Billetera no disponible** | No hay ninguna billetera conectada, o no se puede alcanzar. |
| **La firma falló** | La billetera devolvió algo que no se puede usar. |

### Crear un anclaje en Base en un solo paso

En la misma tarjeta de revisión, **Crear anclaje en Base** firma, finaliza
y transmite la transacción revisada con un solo clic, y luego la agrega a
la lista de evidencia de la publicación. Es una alternativa a los botones
paso a paso, que siguen funcionando.

| Insignia | Significado |
|---|---|
| **Anclaje creado** | Transmitida; el nuevo anclaje aparece, desplegado, en la [lista de evidencia](#la-lista-de-evidencia). |
| **Registro rechazado** | Se rechazó la firma, la finalización o la transmisión. |
| **No se creó ningún anclaje** | No se pudo alcanzar la billetera o la red. |

Luego dice **Crear otro anclaje en Base**. Usa su billetera y envía una
transacción real.

### Verificar, finalizar y transmitir

**Verificar y finalizar transacción** comprueba la firma sin conexión
contra el plan revisado y recupera al firmante.

| Estado | Significado |
|---|---|
| **Transacción finalizada** | Válida; muestra el firmante recuperado y el hash de la transacción. |
| **La firma no se pudo verificar** | Clave equivocada, firma equivocada o datos equivocados. |
| **Finalización no disponible** / **La finalización falló** | No se pudo comprobar, o algún otro resultado que no se puede usar. |

Finalizar registra una
[Publicación de anclaje en Base](#publicaciones-de-anclaje-en-base). Luego,
**Transmitir transacción** la envía: **Transacción transmitida** (con el
**ID de la transacción**; todavía no está incluida en un bloque),
**Transacción rechazada** o **Transmisión no disponible**. **Transmitir de
nuevo** vuelve a enviar los mismos bytes.

### Observar la inclusión

Después de una transmisión, **Observar transacción**, en la sección
**Inclusión de la transacción de Base**, comprueba si está en un bloque:

| Insignia | Significado |
|---|---|
| **Transacción incluida** | Base informa un recibo: hash del bloque, número de bloque, índice de la transacción, confirmaciones. Una reorganización de la cadena sigue siendo posible y no se detecta. |
| **Transacción no incluida** | Todavía no hay recibo (no se distingue entre pendiente y nunca enviada). |
| **Estado de inclusión no disponible** | No se pudo comprobar. |

**Observar la transacción de nuevo** agrega al **Mostrar historial de
observaciones**. Esa lista se borra al recargar, pero cada observación
también se conserva en el
[Archivo de observaciones de publicaciones](12-ArchiveAndLeaderboards.md#el-archivo-de-observaciones-de-publicaciones).

### Publicaciones de anclaje en Base

Igual que la de Bitcoin, la tarjeta **Publicaciones de anclaje en Base**
conserva un registro por cada transacción finalizada: `{ hash del
contenido, txid, red, fecha de creación }`. **Mostrar publicaciones** las
muestra, y **Mostrar ciclo de vida de la publicación** muestra **Registro
de publicación creado** seguido de cada **Observación de inclusión n.º N**.
Los resultados de transmisión de Base no se guardan, así que no hay
ninguna entrada de transmisión.

Solo **Crear anclaje en Base** agrega una entrada de Evidencia externa; el
flujo paso a paso nunca lo hace.

## Ubicaciones de Snapshots

Crear una ubicación en IPFS, Arweave o Local es una función habitual; la
lista de la pestaña **Colocaciones e IPFS** y todo lo que viene después de
[Usar un proveedor preferido](#usar-un-proveedor-preferido) es
*Experimental*.

Una **ubicación de Snapshot** es una declaración firmada de que un backend
de almacenamiento (**IPFS**, **Arweave** o el almacenamiento **Local**
propio de este dispositivo) puede servir los bytes del hash de contenido de
una publicación. No es una garantía de que estén ahí mañana. Pueden existir
varias ubicaciones una al lado de otra, en distintos backends y de distintas
personas; ninguna tiene preferencia.

### Crear una ubicación

En la sección **Distribución** de la tarjeta de una publicación, el bloque
**Contenido** tiene una tarjeta por backend, con **Crear ubicación en
Local**, **Crear ubicación en IPFS** o **Crear ubicación en Arweave**.
Cuando guardó un almacenamiento preferido, el bloque empieza con un botón
para él, como **Guardar en IPFS**, y pliega estas tarjetas en **Otras
opciones de almacenamiento**. Cada una toma los bytes que este dispositivo
tiene para la publicación y se los entrega a ese backend:

- **Ubicación creada**: se aceptó; abajo aparece una nueva ubicación
  firmada.
- **No se creó ninguna ubicación**: no se pudo alcanzar el backend, o este
  dispositivo no tiene el contenido.

Luego el botón dice **Crear otra ubicación en …**. Crear una solo significa
que un backend aceptó los bytes en ese momento.

- **IPFS** necesita la API de su propio nodo IPFS, de forma predeterminada
  en `http://127.0.0.1:5001` (cámbiela en
  [Proveedor de contenido](10-NetworkSettings.md#proveedor-de-contenido)).
  Sin un nodo en funcionamiento, obtendrá **No se creó ninguna
  ubicación**.
- **Arweave** necesita una extensión de billetera, como Wander.

No necesita un nodo para *leer* ubicaciones en IPFS: **Resolver Snapshot** y
**Materializar Snapshot** usan gateways públicos (consulte
[Gateway de IPFS](10-NetworkSettings.md#gateway-de-ipfs)), así que puede
obtener contenido que ubicaron otras personas.

### Usar un proveedor preferido

**Guardar en …**, arriba del bloque **Contenido**, y **Usar el proveedor
preferido**, en la pestaña **Detalles → Colocaciones e IPFS** de la tarjeta,
crean una ubicación en el backend guardado en
[Proveedor de contenido](10-NetworkSettings.md#proveedor-de-contenido).
Guardar una preferencia no cambia los botones explícitos ni las ubicaciones
existentes. Sin nada guardado, el bloque **Contenido** muestra todos los
backends en lugar de **Guardar en …**. Con IPFS (pinning remoto) guardado,
**Guardar en …** usa el servicio configurado en
[Proveedor de contenido](10-NetworkSettings.md#proveedor-de-contenido).

| Etiqueta | Significado |
|---|---|
| **Ubicación creada** | Lo mismo que hacer clic en el botón de ese backend. |
| **No se creó ninguna ubicación** | No hay ninguna preferencia guardada. |
| **No se encontró el proveedor preferido** | El backend guardado no está registrado en este dispositivo, o es IPFS (pinning remoto) sin un servicio configurado en Proveedor de contenido. |

### La lista de Ubicaciones de Snapshots

En la pestaña **Colocaciones e IPFS** de la tarjeta, **Mostrar
ubicaciones** muestra todas las ubicaciones que se conocen para la
publicación: las que hizo usted, las que envió un par y las que venían
dentro de un paquete de plano importado.

| Campo | Significado |
|---|---|
| **Localizador** | Dónde dice el backend que se encuentran los bytes. |
| **Ubicado** | La hora de ubicación declarada. |
| **Publicación** / **Hash del contenido** | Lo que une la firma de la ubicación. |
| **Ubicado por** | La identidad que la firmó. |

Cada una tiene hasta tres botones:

- **Inspeccionar ubicación**: los campos propios de la ubicación y, para
  IPFS, un enlace a un gateway. No contacta ninguna red. Debajo,
  **Conocimiento local** muestra cómo la conoció este dispositivo
  (*Conocido localmente*, *mediante la importación de un paquete* o
  *mediante intercambio entre pares*) y cuándo fue **Visto por primera vez
  por esta réplica**.
- **Resolver Snapshot** (y luego **Resolver de nuevo**): consulta al
  backend si los bytes se pueden recuperar ahora, sin guardarlos.
- **Materializar Snapshot** (y luego **Materializar de nuevo**): resuelve y,
  si funciona, guarda los bytes en este dispositivo (consulte
  [Snapshot local](09-PublicationsAndEvidence.md#snapshot-local)). Usted
  elige la ubicación; nunca prueba otra por usted.

| Resultado de materializar | Significado |
|---|---|
| **Materializado** | Se obtuvo, coincidió y se guardó aquí. |
| **Ya disponible** | Este dispositivo ya tenía bytes que coinciden. |
| **No disponible en este momento** | No se pudo alcanzar el backend, o no los tiene. |
| **Rechazado** | Los bytes no coincidieron con el hash de la ubicación. |
| **Ubicación no válida** | El registro está mal formado o no se firmó de verdad. |

### Resultados de la resolución

| Insignia | Significado |
|---|---|
| **Contenido disponible** | El backend sirvió bytes que coinciden con el hash del contenido. |
| **No hay ningún backend de almacenamiento configurado** | Este dispositivo no tiene ningún backend para este tipo de almacenamiento. |
| **Contenido no disponible** | Se alcanzó, pero ahora no tiene los bytes. |
| **El contenido recuperado no coincide con esta ubicación** | El backend sirvió bytes equivocados. |
| **Ubicación no válida** / **Firma no válida** | El registro está mal formado o no se firmó de verdad. |

Los resultados se quedan en esta página durante esta visita y no se
comparten. Dos personas pueden obtener resultados distintos para la misma
ubicación (por ejemplo, si solo una tiene un nodo IPFS). Si una ubicación
se resolvió antes durante la visita y después no se puede alcanzar, lo
indica: “Este Snapshot se resolvió correctamente antes; en este momento no
está disponible.” Una discrepancia nunca se suaviza de esta forma.

### Relaciones de ubicación

Con más de una ubicación, una tarjeta **Relaciones de ubicación** muestra
cuántos backends y lugares distintos hay, cuenta las ubicaciones por hash
de contenido e indica **Vínculo con el contenido: Acuerdo** o **Conflicto**
(con una advertencia). Se basa solo en las declaraciones, no en si las
resolvió, y un grupo más grande no se considera más probablemente
correcto.

## Publicación en IPFS

*Experimental.* La sección **Publicación en IPFS**, debajo de Ubicaciones de
Snapshots en la pestaña **Colocaciones e IPFS** de la tarjeta, sube el
contenido a un servicio de pinning que usted elige. (Como dice la sección:
un Kubo local puede resolver y publicar, un gateway remoto solo puede
resolver, y el pinning remoto solo puede publicar). A diferencia de una
ubicación, el resultado no es una declaración firmada que otros puedan
descubrir: es un registro de que un proveedor aceptó estos bytes. Los
resultados en pantalla se borran al recargar, pero cada publicación
correcta y cada verificación también se conservan en el
[Archivo de observaciones de publicaciones](12-ArchiveAndLeaderboards.md#el-archivo-de-observaciones-de-publicaciones).

### Configurar un proveedor de pinning remoto

ForkBuild no incluye ningún proveedor de pinning. La tarjeta empieza con el
servicio configurado en
[Proveedor de contenido](10-NetworkSettings.md#proveedor-de-contenido), si
hay uno, y con el token que introdujo en esta visita. Para usar otro, haga
clic en **Configurar la publicación remota** (más tarde, **Volver a
configurar la publicación remota**):

| Campo | Significado |
|---|---|
| **Endpoint** | La URL de subida del servicio. Obligatorio. |
| **Credencial (opcional)** | Se envía como un encabezado `Authorization` de tipo bearer. Nunca se vuelve a mostrar; la tarjeta solo dice si está configurada o **sin configurar**. |
| **Campo de la solicitud (opcional)** | El campo del formulario para el archivo. Predeterminado: `file`. |
| **Campo de la respuesta (opcional)** | El campo de la respuesta que contiene el CID. Predeterminado: `cid`. |

**Guardar configuración** la conserva solo durante esta visita; nunca se
guarda, y **Borrar configuración** la descarta; al recargar se vuelve al servicio
guardado. Cancelar deja
la configuración anterior. Volver a configurar empieza de cero, sin nada
publicado con el nuevo proveedor.

### Publicar

**Publicar en IPFS remoto** (y luego **Publicar de nuevo**) comprueba la
copia de este dispositivo contra el hash del contenido y la sube.

| Insignia | Significado |
|---|---|
| **Publicado** | Se aceptó; el proveedor devolvió un CID. |
| **Publicación rechazada** | Se rechazó, por ejemplo por una credencial incorrecta, una solicitud mal formada o una cuota. Cambie la configuración antes de reintentar. |
| **Publicación no disponible** | No se pudo alcanzar el proveedor. Inténtelo más tarde. |
| **La publicación falló** | Cualquier otra cosa, incluida una comprobación de integridad local que falla antes. |

Un resultado publicado muestra el hash del contenido, el localizador
(`ipfs://<cid>`), el endpoint y la hora. Una insignia como **Nostr:
Anunciado** o **Steem: No anunciado**, con el nombre de su
[Proveedor de anuncio / descubrimiento](10-NetworkSettings.md#proveedor-de-anuncio--descubrimiento),
indica si la publicación también se anunció para el descubrimiento de
Snapshots, para que otros puedan encontrarla como encontrarían una
publicada desde un nodo local. **No anunciado** significa que solo falló el
anuncio.

### Verificar lo que se publicó

Después de publicar correctamente, **Recuperación del contenido →
Verificar contenido de IPFS** (y luego **Verificar de nuevo**) obtiene los
bytes a través de sus
[gateways de IPFS](10-NetworkSettings.md#gateway-de-ipfs) y los compara con
el hash registrado:

| Insignia | Significado |
|---|---|
| **El contenido recuperado coincide con el hash de contenido registrado** | Coincide. |
| **El contenido recuperado no coincide con el hash de contenido registrado** | No coincide. |
| **Recuperación de contenido no disponible** | No se pudo alcanzar el gateway, o no lo tiene. No es una discrepancia. |
| **La verificación falló** | Salió mal otra cosa. |

### Historial de publicación

Publicar de nuevo nunca sobrescribe los registros anteriores. **Mostrar
historial de publicación** muestra cada publicación, de la más antigua a la
más reciente, con su localizador y su hora; **Inspeccionar** muestra su
localizador, su hash de contenido, su hora y su método (hoy siempre
**Proveedor de pinning remoto**). Cada entrada tiene su propio botón
**Verificar contenido** y **Mostrar historial de verificación**, una lista
en orden cronológico de cada comprobación de ese registro.

## Steem

*Experimental.* ForkBuild puede anunciar, guardar y compartir a través de
la blockchain de Steem. Los anuncios (de publicaciones, Snapshots y
comentarios) son respuestas a hilos de descubrimiento mensuales como
[`@forkbuild/forkbuild-snapshot-2026-09`](https://steemit.com/forkbuild/@forkbuild/forkbuild-snapshot-2026-09).
Leer no requiere ninguna cuenta. Lo que se encuentra se verifica igual que
un anuncio de Nostr o Arweave; los votos, los pagos y la reputación no lo
afectan. La configuración está en
[Configuración de red → Steem](10-NetworkSettings.md#steem).

### Publicar en Steem

Elija **Steem** en un diálogo Distribuir, en la página Publicaciones o junto
a **Publicar comentario**, o hágalo su opción predeterminada en
[Proveedor de anuncio / descubrimiento](10-NetworkSettings.md#proveedor-de-anuncio--descubrimiento).
Necesita la extensión Steem Keychain con la clave de **publicación**
(posting) de su cuenta, y el nombre de su cuenta guardado en la página de
configuración de Steem. ForkBuild nunca ve la clave. Cada publicación es
una respuesta al hilo de este mes con el pago rechazado, y Keychain le pide
que la apruebe. Si el hilo de este mes todavía no existe, no se publica
nada y se le avisa. Un comentario siempre se guarda primero en este
dispositivo, y su formulario le advierte si falta la cuenta o Keychain.

### Guardar en Steem

Elija **Steem** como almacenamiento en un diálogo Distribuir o en la página
Publicaciones. El Snapshot se comprime y se guarda como respuestas al hilo
de contenido de este mes (como `@forkbuild/forkbuild-content-2026-10`), sin
pinning ni costo de subida. Los datos van en los metadatos de cada
publicación; el texto de la publicación es una nota de una línea. Las
publicaciones antiguas con los datos en el texto se siguen cargando.

- **Tamaño.** En una publicación caben unos 2.500 bloques. Una
  construcción más grande es una publicación índice más hasta 20
  publicaciones de unos 48 KB, hasta unos 30.000 bloques. Todo lo que sea
  más grande se rechaza antes de publicar, con la sugerencia de usar IPFS o
  Arweave.
- **Aprobar.** Keychain pregunta por cada publicación, con al menos 4,5
  segundos de diferencia, y el diálogo muestra el progreso (“Guardando en
  Steem: 3 de 9 publicaciones hechas”).
- **Resource Credits.** Publicar usa los Resource Credits de su cuenta, que
  se recargan en cinco días. Si no tiene suficientes, no se publica nada y
  se le indica cuántos se necesitan. El progreso muestra la parte usada.
- **Si se detiene a mitad de camino** (usted rechaza, se queda sin créditos
  o pierde la conexión), se le indica cuántas publicaciones se guardaron.
  Distribuya de nuevo con la misma cuenta y solo se hacen las publicaciones
  que faltan. No se anuncia nada hasta que se guardan todas.

La Declaración firmada también se puede guardar en Steem: una publicación
(y una aprobación) más en el mismo hilo, después del Snapshot cuando
distribuye ambos. Se vuelve a leer y se comprueba su firma igual que una de
Arweave.

### Compartir un enlace

**En Steem.** La publicación de una Declaración firmada muestra una imagen
de su construcción, su título, su nombre y su descripción (completa, hasta 2000 caracteres, con su [formato](02-TheEditor.md)), y un enlace
“See it in 3D” (verla en 3D). Keychain le pide que apruebe firmar la
imagen, que se sube al alojamiento de imágenes de Steemit sin costo de
Resource Credits; si lo rechaza o no se puede crear, la publicación sale
sin ella. Las menciones, etiquetas y enlaces de su título o su descripción
se muestran como texto simple, así que no le notifican a nadie. Cualquiera
que haga clic en el enlace, incluso sin haber usado ForkBuild antes, llega a
la Vista del mundo con su construcción, después de que ForkBuild compruebe
la firma del Mundo compartido y que la construcción coincida con su
anuncio (si no, la página dice por qué). Luego la construcción se guarda en
su navegador. El enlace necesita que la construcción esté anunciada además
de guardada, lo que hace Distribuir.

**En cualquier lugar.** Una vez que una Declaración firmada está guardada
en Steem, Arweave o IPFS, aparecen debajo **Compartir…** y **Copiar
enlace**: en el panel de la publicación de la Vista del mundo, en el
resultado del diálogo Distribuir y en la página Publicaciones.
**Compartir…** abre el menú para compartir de su dispositivo, cuando está
disponible; **Copiar enlace** copia el enlace, que también se muestra para
copiarlo a mano. El enlace se abre en cualquier dispositivo, siempre que
el Snapshot también se haya distribuido, y muestra la construcción donde usted la colocó: su colocación firmada viaja con el Snapshot y el enlace la recoge. La dirección `#/world/…` de su
barra de direcciones solo funciona en su propio navegador.

- **Arweave:** justo después de distribuir, el enlace puede tardar unos
  minutos en abrirse mientras la subida llega a los gateways. La página
  ofrece **Intentar de nuevo**.
- **IPFS en su propio nodo:** solo se abre mientras su nodo está en línea y
  se puede alcanzar desde gateways públicos. Un servicio de pinning o
  Arweave lo mantienen disponible cuando su computadora está apagada.
- Sus amigos leen a través de los gateways de su propia Configuración de
  red. Un gateway de IPFS tiene hasta 30 segundos para encontrar la
  declaración.

## Blurt

*Experimental.* Blurt es una blockchain que surgió de Steem, sin votos
negativos. ForkBuild puede anunciar, guardar y anclar en ella, y todo sale
desde **su propia cuenta** como publicaciones normales de Blurt que
conservan su pago: cuando la gente vota a favor de la publicación de su
construcción, usted gana BLURT. No hay ninguna cuenta de ForkBuild ni
ningún hilo compartido. La configuración está en
[Configuración de red → Blurt](10-NetworkSettings.md#blurt).

### Publicar en Blurt

Elija **Blurt** en un diálogo de Distribuir, en la página Publicaciones,
junto a **Publicar comentario** o en el panel de nombres, o conviértalo en
su opción predeterminada en
[Proveedor de anuncio / descubrimiento](10-NetworkSettings.md#proveedor-de-anuncio--descubrimiento).
Necesita la extensión Blurt Keychain (o WhaleVault) con la clave de
**publicación** de su cuenta, y el nombre de su cuenta guardado en la
página de configuración de Blurt. ForkBuild nunca ve la clave, y Keychain
le pide que apruebe cada publicación.

- **Una publicación por construcción.** Distribuir crea una publicación
  principal desde su cuenta, con las etiquetas `forkbuild` y
  `forkbuild-snapshot` o `forkbuild-publication` y luego las [etiquetas](02-TheEditor.md) propias de su construcción, con una imagen de su
  construcción, su título, su nombre y descripción (completa, hasta 2000 caracteres, con su [formato](02-TheEditor.md)), y un enlace “See it in
  3D” (verla en 3D). Lo que sigue en la próxima media hora (el anuncio de
  la publicación, un comentario, un anclaje) se agrega a la misma
  publicación editándola, para que sus seguidores vean una publicación, no
  varias.
- **La imagen necesita su propia aprobación.** Para una Declaración
  firmada, Keychain primero le pide que firme la imagen de la
  construcción y luego que apruebe la publicación. Su segunda ventana
  puede abrirse detrás del navegador; ForkBuild espera hasta dos minutos
  por cada una. La imagen va al alojamiento de imágenes de Blurt, a través
  del servidor de encuentro de ForkBuild cuando el navegador no puede
  alcanzarlo directamente; si no se puede subir, la publicación sale sin
  ella.
- **Cinco minutos entre publicaciones.** Blurt acepta una publicación
  principal por cuenta cada cinco minutos. Si su cuenta publicó una hace
  poco (desde otra app, por ejemplo), ForkBuild espera, y el diálogo dice
  cuánto tiempo.
- **Comisiones.** Cada transacción de Blurt cuesta una pequeña comisión en
  BLURT, fijada por los testigos de Blurt. Si su cuenta no puede pagarla,
  no se publica nada y se le avisa.
- **Otros la encuentran** a través de Nexus, el índice de búsqueda de
  Blurt, que lista cada publicación con las etiquetas de ForkBuild, por
  antigua que sea. Si ningún nodo de Blurt ofrece Nexus, ForkBuild lee la
  etiqueta, que lista una publicación durante una semana, y luego el
  historial de su cuenta: una vez que el ForkBuild de alguien vio una de
  sus publicaciones, sigue leyendo las posteriores y las anteriores.

### Guardar en Blurt

Elija **Blurt** como almacenamiento en un diálogo de Distribuir o en la
página Publicaciones. La construcción se guarda como en Steem, en
respuestas debajo de la publicación de su construcción: hasta unos 2.500
bloques en una respuesta, o hasta 20 respuestas más para hasta unos 30.000
bloques. Antes de publicar, ForkBuild calcula las comisiones y se niega si
su saldo no alcanza (“Guardar esta construcción en Blurt cuesta unos 0,632
BLURT en comisiones, y su cuenta tiene 0,100 BLURT”). El diálogo muestra
el progreso y las comisiones. Si se detiene a mitad de camino, vuelva a
distribuir con la misma cuenta y solo se crean las respuestas que faltan.

La Declaración firmada también se puede guardar en Blurt, como una
respuesta más. Su enlace funciona como uno de Steem: quien haga clic en
“See it in 3D” llega a la Vista del mundo en su construcción, después de
que ForkBuild la compruebe. **Compartir…** y **Copiar enlace** aparecen
una vez que está guardada.
