<!-- translation-of: docs/user/FAQ.md source-hash: d6122c9368a1f486 -->
# Preguntas frecuentes

<!-- languages -->
[English](../FAQ.md) · [Deutsch](../de/FAQ.md) · **Español** · [Français](../fr/FAQ.md) · [Bahasa Indonesia](../id/FAQ.md) · [日本語](../ja/FAQ.md) · [한국어](../ko/FAQ.md) · [Português (Brasil)](../pt-BR/FAQ.md)
<!-- /languages -->

Respuestas breves a las preguntas con las que más se encuentra la gente,
cada una con un enlace a la guía que la explica por completo.

## Publicar y compartir

### Publiqué mi creación, pero mi amigo no la encuentra en su Repositorio

Publicar solo guarda la creación en su propio dispositivo y la muestra en
*su* Repositorio. No se envía nada a ningún lugar hasta que usted lo
decida:

- **Compartir con pares**, debajo de su creación en el Repositorio, se la
  ofrece a las personas con las que está conectado. El dispositivo de un
  Amigo o de un Par conocido la agrega solo; cualquier otra persona la ve
  en **Compartido con usted** y hace clic en **Recuperar**. Tienen que
  estar conectados al mismo tiempo para que llegue.
- **Distribuir** la sube a Arweave o IPFS (o, de forma experimental, a
  Steem o Blurt) y la anuncia, para que la gente pueda encontrarla sin estar
  conectada con usted.

Consulte [Publicar y bifurcar](04-PublishingAndForking.md#compartir-con-pares-conectados).

### ¿Cómo hago que mi trabajo esté disponible para todos?

Distribúyalo: guárdelo en Arweave o IPFS (o, de forma experimental, en
Steem o Blurt) y anúncielo en Nostr o Arweave (o Steem o Blurt), para que cualquiera pueda
encontrarlo y comprobarlo sin estar conectado con usted. Haga clic en
**Distribuir** justo después de publicar, o en **Mi Mundo compartido** en la
Vista del mundo. Necesita una extensión del navegador que firme para las
redes que elija, como Wander para Arweave o nos2x para Nostr.
[Distribuir su trabajo](Distribution.md) enumera todo lo que
puede distribuir, adónde puede ir y qué necesita cada red.

### ¿Por qué nadie puede bifurcar mi creación?

Un documento nuevo no tiene licencia, y una creación sin licencia no se
puede bifurcar. Abra **Propiedades del documento** (el **✎** junto al
título del documento en el Editor), elija una licencia que permita
bifurcar (cualquier licencia CC excepto CC BY-ND) y vuelva a publicar. La
opción forma parte de lo que se publica, así que las creaciones que ya
publicó conservan la licencia que tenían. Consulte
[Elegir una licencia](04-PublishingAndForking.md#elegir-una-licencia).

### Publicar falló. ¿Qué significan los mensajes?

Estos mensajes aparecen en inglés en la app:

- **a title is required before publishing** (se necesita un título antes
  de publicar): póngale un título a la creación en **Propiedades del
  documento**.
- **cannot publish an empty world** (no se puede publicar un mundo vacío):
  primero coloque al menos un bloque.
- **cannot sign, identity is locked** (no se puede firmar, la identidad
  está bloqueada): su identidad se bloqueó sola; haga clic en
  **Desbloquear** junto a su nombre en la barra superior y vuelva a
  publicar.

### ¿Necesito haber iniciado sesión para publicar?

Publicar funciona sin haber iniciado sesión, pero el resultado no tiene
autor ni firma, así que no puede compartirlo con pares ni distribuirlo
después. Inicie sesión antes de publicar.

### ¿Puedo retirar la publicación de algo?

Sí: abra el Mundo en la Vista del mundo y luego, en **Mi Mundo
compartido**, elija **Más ▾ → Retirar publicación…**. Eso lo quita de su
Repositorio. No puede recuperar las copias que otras personas ya
recibieron ni nada de lo que distribuyó a Arweave, IPFS, Nostr, Steem o Blurt. Este dispositivo sí recuerda lo que retiró,
así que la búsqueda del Repositorio en las redes no volverá a mostrar esas
copias aquí; otros dispositivos y otras personas aún pueden encontrarlas.

### Alguien colocó mi construcción en su Mundo. ¿Movió la mía?

No. Una colocación solo dice dónde muestra *su* Mundo la construcción de
usted; la suya se queda donde la puso, y la construcción conserva su nombre
y su historial. Si no quiere esto, elija **Solo yo puedo colocarlo** en
**Quién puede colocarlo en el Mundo** antes de publicar. Consulte
[¿Por qué puedo colocar construcciones de otras personas?](03-WorldView.md#por-qué-puedo-colocar-construcciones-de-otras-personas).

### ¿Por qué hay dos construcciones en el mismo lugar?

Una colocación no reclama terreno, y no hay ningún servidor central que
diga quién llegó primero a un lugar, así que dos colocaciones pueden
nombrar el mismo punto. Se le avisa antes de mover una de las suyas a un
lugar ocupado. Consulte
[¿Por qué dos construcciones pueden estar en el mismo lugar?](03-WorldView.md#por-qué-dos-construcciones-pueden-estar-en-el-mismo-lugar).

## Identidad y sus datos

### Olvidé mi frase de contraseña. ¿Se puede restablecer?

No. La frase de contraseña es la única forma de descifrar la clave de esa
identidad, y no hay ningún servidor que guarde una copia. Si exportó la
identidad, igual necesita la frase de contraseña que eligió para la
exportación. Si no, cree una identidad nueva. Consulte
[Identidad e inicio de sesión](05-IdentityAndLogin.md).

### ¿Por qué mi identidad se sigue bloqueando sola?

Una identidad protegida se bloquea **15 minutos después de que la
desbloquea**, aunque esté usando la app, y cada vez que recarga la página.
Construir y guardar siguen funcionando mientras está bloqueada; publicar,
ser descubrible y unirse a una sala requieren que la vuelva a desbloquear.

### ¿Cómo llevo mi trabajo a otra computadora o a otro navegador?

Nada se sincroniza solo. Para llevarlo todo, haga una copia de seguridad en
**Sus datos** y restaure el archivo en el otro dispositivo (consulte
[Sus datos](13-YourData.md)). Para llevar un solo tipo de cosa:

- **Documentos**: **Exportar** en la barra de herramientas del Editor, o
  **Exportar todos los documentos** al final de **Recientes**, y luego
  **Importar** en el otro dispositivo.
- **Sus propias estructuras**: **Exportar plano** desde el menú **⋮** de una
  tarjeta, o **Exportar todo** junto a **Mis estructuras**, y luego
  **Importar plano**.
- **Identidades**: **Exportar** en **Mis identidades**, y luego **Importar
  identidad**.

El historial de chat, los amigos y la configuración solo se trasladan con
una copia de seguridad completa.

### ¿Borrar los datos del navegador elimina mi trabajo?

Sí. Los documentos, las identidades, los amigos y el historial de chat
viven en el almacenamiento de este navegador para este sitio, y borrarlo
los elimina para siempre. Haga primero una copia de seguridad con **Sus
datos → Hacer copia de seguridad en un archivo**, y guarde en un lugar
seguro el archivo y su frase de contraseña; **Restaurar**, en la misma
página, lo trae todo de vuelta. ForkBuild le avisa cuando la última copia
de seguridad es antigua, y en Chrome o Edge en una computadora puede hacer
copias de seguridad automáticas cada día en una carpeta que sincronice su
almacenamiento en la nube. Consulte [Sus datos](13-YourData.md) y
[Privacidad](Privacy.md).

### ¿Puedo cambiar el nombre de una identidad o eliminarla?

No. Las identidades están pensadas para perdurar. Para dejar de usar una,
declare una sucesora o revóquela en **Mis identidades**.

### ¿Por qué una copia más antigua de ForkBuild no abre mi documento exportado?

Ahora los documentos se guardan en un formato más nuevo y compacto.
ForkBuild 1.0.0 y anteriores no pueden leerlo, así que primero actualice la
otra copia. Los archivos exportados por versiones anteriores se siguen
abriendo aquí.

## La Vista del mundo y su avatar

### WASD no mueve mi avatar

Caminar está desactivado hasta que lo active:

1. Inicie sesión y guarde un avatar en **Mi avatar**.
2. En la sección **Avatar** de la Vista del mundo, marque **Controlar mi
   avatar (WASD, Mayús, Espacio)**.
3. Haga clic en la vista 3D, para que las teclas no vayan a un campo de
   texto.

En una pantalla táctil, toque en cambio **Caminar**, encima del joystick.
Consulte
[Caminar con su avatar](06-AvatarsAndPresence.md#caminar-con-su-avatar).

### ¿Quién puede ver mi avatar?

De forma predeterminada, cualquiera con quien esté conectado: tanto
**Visibilidad de la presencia** como **Visibilidad del perfil** empiezan
en **Pública**. Cámbielas en **Mi avatar**; **Oculta** lo vuelve invisible.
Consulte
[Quién puede verlo](06-AvatarsAndPresence.md#quién-puede-verlo-dos-opciones-independientes).

### La pestaña del navegador se cerró mientras conducía un vehículo

**Ctrl** es el freno y **W** acelera, y en Windows y Linux la mayoría de
los navegadores cierran la pestaña con **Ctrl+W**. Suelte **W** antes de
frenar.

### ¿Puedo cambiar algo en la Vista del mundo?

Solo anotaciones: hitos, nombres de regiones y decoraciones animales. Se
construye en el Editor; use **Editar una copia** para llevar allí lo que
está mirando. Consulte la
[Vista del mundo](03-WorldView.md#editar-una-copia--llevar-algo-al-editor).

## Pares, amigos y chat

### Ejecuto ForkBuild yo mismo y no encuentro a nadie

El servidor de encuentro predeterminado solo atiende al sitio alojado, así
que una copia servida desde su propia dirección (incluido `localhost`) no
puede usarlo. Conéctese con una invitación (**Pares → Conectarse con
alguien nuevo → Invitar**), o agregue su propio servidor de encuentro en
**Configuración de red → Servidores de encuentro**. Consulte
[Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md).

### Mi amigo no se vuelve a conectar automáticamente

La reconexión automática solo abarca a las personas que **Recordó** (Pares
conocidos), y solo las encuentra mientras son **descubribles**. Un Amigo al
que no Recordó muestra en cambio un botón **Volver a conectar**. Elija
**Recordar** en su menú **⋯**, y que ambos hagan clic en **Ser
descubrible**.

### Mi mensaje sigue diciendo “En cola”

Los mensajes esperan en su dispositivo, no en un servidor, así que solo se
entregan mientras ForkBuild está abierto en ambos lados y están
conectados. Un mensaje que no se entrega en 7 días se descarta y se marca
como **No entregado: venció**. Consulte
[Chat y conversaciones](08-ChatAndConversations.md#enviar-mientras-alguien-está-desconectado).

### ¿Por qué no puedo chatear con alguien con quien estoy conectado?

El chat y las llamadas de voz son solo para amigos. Haga clic en **Agregar
amigo** en su fila de **Pares**; cuando acepte, aparece un botón **Chat**.

### Cambié una opción de Configuración de red pero nada es distinto

La configuración de red (servidores, relays, gateways) se lee cuando se
inicia la app. Recargue la página después de guardar. Consulte
[Configuración de red](10-NetworkSettings.md).

## Dispositivos y navegadores

### ¿ForkBuild funciona en un teléfono o una tableta?

Sí. Ambas vistas tienen controles táctiles, y en una pantalla angosta el
menú y los paneles laterales se pliegan. Consulte
[Pantallas táctiles](ControlsReference.md#pantallas-táctiles).

### ¿Necesito una billetera de criptomonedas?

No. Construir, guardar, publicar, bifurcar, los pares y el chat no
necesitan ninguna. Solo se necesita una billetera o una extensión de firma
para las funciones experimentales de distribución y anclaje de
[Evidencia y almacenamiento](11-EvidenceAndStorage.md).
