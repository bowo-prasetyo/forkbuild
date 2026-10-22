<!-- translation-of: docs/user/FAQ.md source-hash: ce5fc18391277ac3 -->
# Preguntas frecuentes

<!-- languages -->
[English](../FAQ.md) · [Deutsch](../de/FAQ.md) · **Español** · [Français](../fr/FAQ.md) · [Bahasa Indonesia](../id/FAQ.md) · [日本語](../ja/FAQ.md) · [한국어](../ko/FAQ.md) · [Português (Brasil)](../pt-BR/FAQ.md)
<!-- /languages -->

Respuestas breves a las preguntas con las que más se encuentra la gente,
cada una con un enlace a la guía que la explica por completo.

## Orientarse

### ¿Dónde quedaron el Editor, el Repositorio e Iniciar sesión?

Cambiaron de nombre en el menú. **Construir** abre el Editor, **Explorar**
es lo que antes era el Repositorio, y **Elegir un nombre** (o su nombre,
cuando ya tiene uno) reemplaza a Iniciar sesión. **Pasear** abre el Mundo
en la plaza del desafío de esta semana. Consulte
[Orientarse](01-GettingStarted.md#orientarse).

### No encuentro Mi avatar, Pares ni Configuración de red

Están en **Más**, en la barra superior (en un teléfono, en **Menú**):
**Personal** tiene Mi avatar, Mis identidades y Sus datos; **Personas**
tiene Pares, Siguiendo y Conversaciones; **Avanzado** tiene Publicaciones
y Configuración de red. Al hacer clic en su nombre, en la esquina superior
derecha, también se abren Mi avatar, Mis identidades y Sus datos.

## Publicar y compartir

### Publiqué mi construcción, pero mi amigo no la encuentra en Explorar

Salvo que haya dejado marcado **Todos pueden encontrarla** al publicar por
primera vez (vea [¿Quién puede encontrarla?](04-PublishingAndForking.md#quién-puede-encontrarla)),
publicar solo guarda la construcción en su propio dispositivo y la muestra
en *su* **Explorar**. Para que le llegue a su amigo:

- **Envíe el enlace.** Publicar muestra **Copiar enlace** (y
  **Compartir…** donde su dispositivo puede compartir); la construcción
  viaja dentro del enlace, así que su amigo puede abrirla en cualquier
  dispositivo. Consulte
  [Compartir un enlace](04-PublishingAndForking.md#compartir-un-enlace).
- **Que todos la encuentren.** Haga clic en **Que todos la encuentren** en
  el aviso que aparece después de publicar, y aparecerá en el **Explorar**
  de todos, en el desafío y en el Mundo.
- **Compartir con pares**, debajo de su construcción en **Explorar**, se la
  ofrece a las personas con las que está conectado. El dispositivo de un
  Amigo o de un Par conocido la agrega solo; cualquier otra persona la ve
  en **Compartido con usted** y hace clic en **Recuperar**. Tienen que
  estar conectados al mismo tiempo para que llegue.
- **Distribuir** la sube a Arweave o IPFS (o, de forma experimental, a
  Steem o Blurt) y la anuncia, para que la gente pueda encontrarla sin estar
  conectada con usted.

Consulte [Publicar y remezclar](04-PublishingAndForking.md#compartir-con-pares-conectados).

### ¿Cómo hago que mi trabajo esté disponible para todos?

Deje marcado **Todos pueden encontrarla** al publicar por primera vez (vea
[¿Quién puede encontrarla?](04-PublishingAndForking.md#quién-puede-encontrarla)),
o haga clic en **Que todos la encuentren** después de publicar. Cada
construcción que publique se envía entonces a todos y aparece en
**Explorar**, en el desafío semanal y en el Mundo, sin instalar nada.

Para guardar además una copia en una red de almacenamiento
descentralizada, distribúyala: guárdela en Arweave o IPFS (o, de forma
experimental, en Steem o Blurt) y anúnciela en Nostr o Arweave (o Steem o
Blurt). Para eso necesita una extensión del navegador que firme para las
redes que elija, como Wander para Arweave o nos2x para Nostr.
[Distribuir su trabajo](Distribution.md) enumera todo lo que
puede distribuir, adónde puede ir y qué necesita cada red.

### ¿Por qué nadie puede remezclar mi construcción?

Una construcción nueva no tiene licencia, y una construcción sin licencia no se
puede remezclar. Abra **Propiedades de la construcción** (el **✎** junto al
título de la construcción en el Editor), elija una licencia que permita
remezclar (cualquier licencia CC excepto CC BY-ND) y vuelva a publicar. La
opción forma parte de lo que se publica, así que las construcciones que ya
publicó conservan la licencia que tenían. Consulte
[Elegir una licencia](04-PublishingAndForking.md#elegir-una-licencia).

### Publicar falló. ¿Qué significan los mensajes?

Estos mensajes aparecen en inglés en la app:

- **a title is required before publishing** (se necesita un título antes
  de publicar): póngale un título a la construcción en **Propiedades de la
  construcción**.
- **cannot publish an empty world** (no se puede publicar un mundo vacío):
  primero coloque al menos un bloque.
- **Su nombre "…" está bloqueado**: su nombre se bloqueó solo; haga clic en
  **Desbloquear** junto al mensaje (o junto a su nombre en la barra superior)
  y vuelva a publicar.

### ¿Necesito un nombre para publicar?

En la práctica, sí. La hoja de Publicar le sugiere uno, que puede conservar
o cambiar, y no necesita cuenta. **Publicar sin nombre**, en **Avanzado**
de esa hoja, publica sin
nombre, pero el resultado no tiene autor ni firma: no recibe enlace, y no
puede compartirlo con pares ni enviarlo a todos más tarde. Consulte
[Elegir un nombre](01-GettingStarted.md#elegir-un-nombre).

### ¿Puedo retirar la publicación de algo?

Sí: abra el Mundo en la Vista del mundo y luego, en **Mi Mundo
compartido**, elija **Más ▾ → Retirar publicación…**. Eso lo quita de su
**Explorar**. No puede recuperar las copias que otras personas ya
recibieron ni nada de lo que distribuyó a Arweave, IPFS, Nostr, Steem o Blurt. Este dispositivo sí recuerda lo que retiró,
así que la búsqueda de **Explorar** en las redes no volverá a mostrar esas
copias aquí; otros dispositivos y otras personas aún pueden encontrarlas.

### Alguien colocó mi construcción en su Mundo. ¿Movió la mía?

No. Una colocación solo dice dónde muestra *su* Mundo la construcción de
usted; la suya se queda donde la puso, y la construcción conserva su nombre
y su historial. Si no quiere esto, elija **Solo yo puedo colocarlo** en
**Quién puede colocarlo en el Mundo** antes de publicar. Consulte
[¿Por qué puedo colocar construcciones de otras personas?](WorldViewAdvancedTools.md#por-qué-puedo-colocar-construcciones-de-otras-personas).

### ¿Puedo darle mi construcción a otra persona?

No como su autor. El autor de una construcción es la identidad que la
firmó, y nadie puede cambiar esa firma, así que su construcción siempre lo
mostrará a usted como su autor. Eso es lo que mantiene honesto el
reconocimiento de todos cuando las construcciones se remezclan.

Lo que otra persona sí puede hacer, si la licencia de la construcción
permite remezclas, es hacer su propia copia con **Editar una copia** o
**Remezclar**. Su copia es suya para cambiarla, publicarla y colocarla, y
muestra que viene de la suya (consulte
[Remezclar: hágalo suyo](04-PublishingAndForking.md#remezclar-hágalo-suyo)).
Si prefiere que la suya sea la que la gente encuentre, puede quitar la
de usted de su Mundo y retirar su publicación, aunque las copias ya
enviadas se quedan (consulte
[¿Puedo retirar la publicación de algo?](#puedo-retirar-la-publicación-de-algo)).

Lo mismo vale para un archivo que usted exportó: esa persona puede
importarlo como copia suya cuando su licencia permite remezclas, y usted
puede exportar una copia con una licencia más abierta que la que publicó
(consulte
[Guardar, publicar, empezar de nuevo](02-TheEditor.md#guardar-publicar-empezar-de-nuevo)).

**Declarar sucesora**, en **Mis identidades**, no entrega una
construcción: retira toda su identidad en favor de otra que también sea
suya.

### ¿Por qué hay dos construcciones en el mismo lugar?

Una colocación no reclama terreno, y no hay ningún servidor central que
diga quién llegó primero a un lugar, así que dos colocaciones pueden
nombrar el mismo punto. Se le avisa antes de mover una de las suyas a un
lugar ocupado. Consulte
[¿Por qué dos construcciones pueden estar en el mismo lugar?](WorldViewAdvancedTools.md#por-qué-dos-construcciones-pueden-estar-en-el-mismo-lugar).

## Identidad y sus datos

### Olvidé mi frase de contraseña. ¿Se puede restablecer?

No. La frase de contraseña es la única forma de descifrar la clave de esa
identidad, y no hay ningún servidor que guarde una copia. Si exportó la
identidad, igual necesita la frase de contraseña que eligió para la
exportación. Si no, cree una identidad nueva. Consulte
[Su nombre y su identidad](05-IdentityAndLogin.md).

### ¿Por qué mi identidad se sigue bloqueando sola?

Una identidad protegida se bloquea **15 minutos después de que la
desbloquea**, aunque esté usando la app, y cada vez que recarga la página.
Construir y guardar siguen funcionando mientras está bloqueada; publicar,
ser descubrible y unirse a una sala requieren que la vuelva a desbloquear.

### ¿Cómo llevo mi trabajo a otra computadora o a otro navegador?

Nada se sincroniza solo. Para copiarlo todo, haga clic en **Mostrar un
código** en **Sus datos**, dentro de **Copiar a otro dispositivo**, y
escanee el código con el otro dispositivo (o abra allí su enlace) mientras
ambos están en línea. O haga allí una copia de seguridad y restaure el
archivo en el otro dispositivo (consulte [Sus datos](13-YourData.md)). Para llevar un solo tipo de cosa:

- **Documentos**: **Exportar** en la barra de herramientas del Editor, o
  **Exportar todas las construcciones** al final de **Recientes**, y luego
  **Importar** en el otro dispositivo.
- **Sus propias estructuras**: **Exportar plano** desde el menú **⋮** de una
  tarjeta, o **Exportar todo** junto a **Mis estructuras**, y luego
  **Importar plano**.
- **Identidades**: **Exportar** en **Mis identidades**, y luego **Importar
  identidad**.

El historial de chat, los amigos y la configuración solo se trasladan con
una copia de seguridad completa.

### ¿Borrar los datos del navegador elimina mi trabajo?

Sí. Las construcciones, las identidades, los amigos y el historial de chat
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

### Revoqué mi identidad, ¿por qué todavía puedo usarla?

Es lo esperado. Revocar impide que la identidad firme nada nuevo, incluido
lo que necesita para conectarse con otras personas, pero todavía puede
elegirla en este dispositivo. Así todavía puede consultarla o exportarla. Muestra
**Revocada** en **Mis identidades**, y la revocación nunca se puede
deshacer. Cree una identidad nueva para seguir trabajando. Consulte
[Qué hace revocar — y qué no](05-IdentityAndLogin.md#qué-hace-revocar--y-qué-no).

### ¿Por qué una copia más antigua de ForkBuild no abre mi construcción exportada?

Ahora las construcciones se guardan en un formato más nuevo y compacto.
ForkBuild 1.0.0 y anteriores no pueden leerlo, así que primero actualice la
otra copia. Los archivos exportados por versiones anteriores se siguen
abriendo aquí.

## La Vista del mundo y su avatar

### WASD no mueve mi avatar

Caminar está activado al abrir la Vista del mundo, con o sin nombre:
quien aún no tiene nombre camina como invitado, visible solo en su propia
pantalla. Si las teclas no mueven su avatar:

1. En **Ajustes del avatar** de la Vista del mundo, compruebe que
   **Controlar mi avatar (WASD, Mayús, Espacio)** está marcado.
2. Haga clic en la vista 3D, para que las teclas no vayan a un campo de
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

### ¿ForkBuild funciona sin conexión? ¿Puedo instalarlo?

Sí, en el sitio alojado. Tras su primera visita, ForkBuild se abre sin
conexión, y **Instalar ForkBuild** en la pantalla de Inicio lo agrega a su
dispositivo como aplicación. Construir, guardar y sus construcciones
guardadas y las ya hechas funcionan sin conexión; encontrar construcciones
y personas, distribuir y el chat necesitan conexión. Consulte
[Instalar ForkBuild](01-GettingStarted.md#instalar-forkbuild).

### ¿Puedo imprimir mi construcción en 3D o abrirla en Blender?

Sí. **Archivo → Modelo 3D** en la barra de herramientas del Editor la descarga como
STL para impresión 3D (en milímetros, apoyada en la cama) o como glTF u OBJ
en color para Blender y otros programas. Consulte
[Descargar un modelo 3D](02-TheEditor.md#descargar-un-modelo-3d).

### ¿Necesito una billetera de criptomonedas?

No. Construir, guardar, publicar, compartir un enlace, enviar una
construcción a todos, remezclar, los pares y el chat no necesitan ninguna.
Solo necesita una billetera o una extensión de firma si decide distribuir
usted mismo una construcción a una red de almacenamiento (Arweave necesita
una billetera de Arweave como Wander; Nostr, una extensión de firma como
nos2x), y para las funciones experimentales de anclaje de
[Evidencia y almacenamiento](11-EvidenceAndStorage.md).

### ¿Puedo vender mi construcción o convertirla en un NFT?

ForkBuild no tiene tienda, ni precios, ni NFT, y no ayuda a vender
construcciones ni recomienda ningún lugar para hacerlo, dentro del juego ni
fuera de él. Lo que se acuerde fuera de ForkBuild queda entre usted y la
otra persona, y el juego no sabe nada de ello: no cambia quién hizo la
construcción, quién puede copiarla ni quién puede colocarla.

Su construcción siempre es suya para llevársela: puede exportarla como
archivo o descargarla como modelo 3D (consulte
[Guardar, publicar, empezar de nuevo](02-TheEditor.md#guardar-publicar-empezar-de-nuevo)
y [Descargar un modelo 3D](02-TheEditor.md#descargar-un-modelo-3d)).

Dentro de ForkBuild, lo que otras personas pueden hacer con una
construcción publicada lo deciden su licencia (consulte
[Elegir una licencia](04-PublishingAndForking.md#elegir-una-licencia)) y
**Quién puede colocarlo en el Mundo** (consulte
[Elegir quién puede colocarlo](04-PublishingAndForking.md#elegir-quién-puede-colocarlo)).
Todas las copias de ForkBuild las respetan, pero ninguna es un candado, y
las copias ya enviadas no se pueden recuperar (consulte
[¿Puedo retirar la publicación de algo?](#puedo-retirar-la-publicación-de-algo)).

Si su construcción es una remezcla, lleva la licencia de su original, así
que sus condiciones siguen aplicándose: una construcción con CC BY-NC, por
ejemplo, no puede usarse con fines comerciales.
