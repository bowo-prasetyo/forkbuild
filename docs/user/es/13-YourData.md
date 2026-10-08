<!-- translation-of: docs/user/13-YourData.md source-hash: 268072de3b1fe04f -->
# 13 — Sus datos

<!-- languages -->
[English](../13-YourData.md) · [Deutsch](../de/13-YourData.md) · **Español** · [Français](../fr/13-YourData.md) · [Bahasa Indonesia](../id/13-YourData.md) · [日本語](../ja/13-YourData.md) · [한국어](../ko/13-YourData.md) · [Português (Brasil)](../pt-BR/13-YourData.md)
<!-- /languages -->

ForkBuild no tiene cuentas ni un servidor que guarde su trabajo. Todo lo
que guarda vive en este navegador, en este dispositivo: sus documentos, sus
identidades y sus claves privadas, estructuras, publicaciones, pares y
amigos, historial de chat y configuración. **Borrar los datos de este sitio
en el navegador lo elimina todo para siempre**, y lo mismo pasa si
desinstala el navegador o pierde el dispositivo.

La página **Sus datos** (**Sus datos** en el menú superior) es donde
conserva una copia.

## En este dispositivo

La primera sección muestra lo que está guardado, por tipo, y cuánto
espacio ocupa. Los conteos son entradas de almacenamiento, no documentos:
un documento guardado y la lista de documentos son dos entradas, por
ejemplo.

Si dice **El navegador podría eliminar estos datos cuando quede poco
espacio en el disco.**, haga clic en **Pedirle al navegador que los
conserve**. Los navegadores suelen aceptar cuando el sitio está en
marcadores, instalado o se usa con frecuencia. Esto solo protege contra
que el navegador haga limpieza por su cuenta: borrar los datos del sitio
igual lo elimina todo.

## Hacer una copia de seguridad

1. Elija una **frase de contraseña de la copia de seguridad** (al menos 8
   caracteres) y escríbala dos veces.
2. Deje sin marcar **Incluir construcciones descargadas de otras
   personas** a menos que las quiera: pueden ocupar mucho y normalmente se
   pueden volver a obtener. Sus propias publicaciones siempre se incluyen.
3. Haga clic en **Hacer copia de seguridad en un archivo**. El navegador
   descarga un archivo `forkbuild-backup-<fecha>.forkbuild-backup`.

El archivo contiene todo lo que mostraba la página, cifrado con la frase de
contraseña de la copia de seguridad. Es seguro guardarlo en la nube o en
una memoria USB, pero **no hay forma de abrirlo sin esa frase de
contraseña**, así que guarde ambos en algún lugar donde no los vaya a
perder. La frase de contraseña de la copia de seguridad es distinta de las
frases de contraseña de sus identidades: cada identidad que contiene sigue
protegida por la suya.

La copia de seguridad no incluye con qué identidad se inició sesión.
Después de restaurar, inicie sesión de nuevo.

Además de **Hacer copia de seguridad en un archivo**, la misma sección
puede:

- **Compartir copia de seguridad…** (teléfonos, tabletas y algunas
  computadoras): abre el menú para compartir de su dispositivo, para que
  pueda guardar el archivo en la nube, enviarlo por correo electrónico o
  llevarlo a otro dispositivo. Si el menú no se abre con el primer toque
  (el cifrado tardó más de lo que permite el navegador), toque
  **Compartir copia de seguridad** otra vez: la copia de seguridad está
  lista y sale de inmediato.
- **Hacer copia de seguridad en “carpeta”**: una vez que eligió una carpeta
  de copias de seguridad (abajo).

**Recordar la clave de la copia de seguridad en este dispositivo** aparece
cuando escribe una frase de contraseña. Márquela para hacer copias de
seguridad posteriores sin escribir la frase de contraseña: la usan los
botones de un solo clic y las copias de seguridad automáticas de abajo.
ForkBuild no guarda la frase de contraseña en sí, solo una clave hecha a
partir de ella que el navegador le permite usar a ForkBuild para hacer
copias de seguridad, que nunca se le muestra a nadie y que no puede abrir
una copia de seguridad. Las copias hechas con ella se siguen abriendo con
su frase de contraseña. **Olvidar la clave de la copia de seguridad** la
quita.

## Recordatorios

Si no se hizo una copia de seguridad de este dispositivo desde hace un
tiempo, una barra debajo del menú, en todas las páginas, lo indica, con
**Hacer copia de seguridad ahora** y **Recordármelo en una semana**:

- Aparece por primera vez una semana después de que este navegador
  empieza a guardar su trabajo (documentos, identidades, estructuras, pares
  o chat), si nunca hizo una copia de seguridad.
- Después, aparece cuando la última copia de seguridad es más antigua que
  lo que eligió en **Recordatorios y copias de seguridad automáticas →
  Recordarme hacer una copia de seguridad**: cada semana, cada 2 semanas,
  cada mes (el predeterminado) o cada 3 meses, o nunca.
- **Hacer copia de seguridad ahora** hace la copia en su carpeta de copias
  de seguridad con un solo clic cuando configuró una con una clave
  recordada; si no, abre esta página.

La misma sección muestra cuándo se hizo la última copia de seguridad y
dónde.

## Copias de seguridad en una carpeta

En Chrome y Edge en una computadora, **Elegir carpeta…** le permite elegir
una carpeta para las copias de seguridad. Elija una que sincronice su
almacenamiento en la nube (Dropbox, OneDrive, iCloud Drive, Google Drive) o
una unidad USB, y cada copia de seguridad saldrá de este dispositivo sin
que usted tenga que mover archivos. La copia de cada día es un archivo,
`forkbuild-backup-<fecha>.forkbuild-backup`; una segunda copia el mismo día
reemplaza el archivo de ese día, y ForkBuild conserva allí las diez copias
propias más recientes, sin tocar nunca nada más de la carpeta.

El navegador pregunta si ForkBuild puede guardar en la carpeta la primera
vez, y puede volver a preguntar en una visita posterior. **Dejar de usar
esta carpeta** la olvida; las copias de seguridad que ya están allí se
conservan.

**Hacer una copia de seguridad en la carpeta automáticamente una vez al día
mientras ForkBuild esté abierto** requiere una carpeta y una clave
recordada. Entonces ForkBuild comprueba un minuto después de abrirse, y
cada hora, y hace una copia si la última tiene un día. Nunca pide permiso
por su cuenta: si el navegador quiere volver a preguntar, las copias
automáticas esperan hasta que usted haga una vez una copia en la carpeta.
Una copia automática que falla se muestra en esta página.

Los demás navegadores no pueden guardar en una carpeta. En ellos, use
**Compartir copia de seguridad…**, o descargue el archivo y muévalo usted
mismo.

## Restaurar

Primero cierre ForkBuild en cualquier otra pestaña: una pestaña que quede
abierta puede volver a escribir sus datos anteriores.

1. En **Restaurar**, elija el archivo de copia de seguridad e ingrese su
   frase de contraseña, y luego haga clic en **Abrir copia de seguridad**.
   Una frase de contraseña incorrecta se rechaza y no cambia nada.
   ForkBuild muestra cuándo se hizo la copia de seguridad y qué contiene.
2. Elija cómo restaurar:
   - **Agregar lo que este dispositivo no tiene** (la predeterminada): se
     agrega todo lo que hay en la copia de seguridad y no está en este
     dispositivo. Donde ambos tienen algo, como el mismo documento o una
     configuración, se conserva la versión de este dispositivo.
   - **Reemplazar todo lo que hay en este dispositivo por la copia de
     seguridad**: primero elimina lo que ForkBuild guardó aquí y luego
     restaura la copia exactamente. Marque la confirmación para
     habilitarlo.
3. Haga clic en **Restaurar**. La página se recarga cuando termina. Un
   dispositivo restaurado cuenta como respaldado en la fecha en que se hizo
   la copia de seguridad.

Una versión más antigua de ForkBuild no puede abrir una copia de seguridad
hecha por una más nueva; primero actualice esta copia. Todo lo que haya en
una copia de seguridad y esta versión no conozca se omite, y el resultado
dice cuántas cosas.

## Exportaciones más pequeñas

Para llevar o compartir un solo tipo de cosa, use la exportación de su
propia página:

| Qué | Exportar | Importar |
|---|---|---|
| Un documento | **Exportar** en la barra de herramientas del Editor | **Importar** en la barra de herramientas del Editor |
| Todos los documentos guardados | **Exportar todos los documentos**, al final del menú **Recientes** del Editor | **Importar** en la barra de herramientas del Editor |
| Una estructura | **Exportar plano** en el menú **⋮** de su tarjeta | **Importar plano** junto a **Mis estructuras** |
| Todas las estructuras | **Exportar todo** junto a **Mis estructuras** | **Importar plano** junto a **Mis estructuras** |
| Una identidad | **Exportar** en **Mis identidades** | **Importar identidad** en **Mis identidades** |

Importar todos los documentos repone los que este dispositivo no tiene,
deja sin cambios los que ya tiene y guarda una copia al lado de cualquiera
que tenga en otra versión. Importar todas las estructuras omite los diseños
que ya están en Mis estructuras. Una identidad exportada también lleva su
revocación, su sucesora y las autorizaciones de dispositivos, así que una
identidad revocada vuelve revocada.

El historial de chat, los amigos, las personas que sigue y la
configuración solo se trasladan con una copia de seguridad completa.

## Sus publicaciones

Una creación que **publica** se guarda solo en este dispositivo, hasta que
la distribuya (consulte [Publicar y bifurcar](04-PublishingAndForking.md)).
Su tarjeta del Repositorio indica dónde registró este dispositivo su
distribución, por ejemplo **Guardado en IPFS · Anunciado en Nostr**: dónde
se subió la construcción o su Declaración firmada (IPFS, Arweave, Steem o
Blurt) y dónde se anunció (Nostr, Arweave, Steem o Blurt). Pase el puntero sobre un nombre
para ver su dirección o el id del anuncio.

La línea solo dice de qué tiene registro este dispositivo. No comprueba que
una subida siga disponible (una copia en IPFS dura solo mientras alguien la
mantenga fijada), y una distribución hecha desde otro dispositivo no se
conoce aquí. Sin ningún registro, la tarjeta dice **No hay ninguna
distribución registrada en este dispositivo.**: haga una copia de
seguridad, o ábrala en la Vista del mundo con **Explorar** y use
**Distribuir** en **Mi Mundo compartido**. Compartirla con pares conectados
no se registra como una distribución: ellos conservan una copia solo
mientras quieran.

## Recuento diario de visitantes

Al final de la página, **Recuento diario de visitantes** controla lo único
que ForkBuild envía sin que ninguna función lo necesite. Una vez al día, el
sitio oficial avisa a GoatCounter de que un navegador más lo ha abierto. De
la misma manera, también cuenta cuando se copia o se comparte un enlace a
una construcción, cuando se abre un enlace compartido y cuando una
construcción abierta desde uno se copia en el Editor. Cada solicitud es una
ruta fija que no nombra ninguna página, construcción ni persona y no guarda
cookies, y cualquiera puede ver los totales en el panel público. Desmarque
**Contar este navegador** para detenerlo; la elección se guarda al
instante, solo en este navegador. Un navegador que envía Global Privacy
Control o Do Not Track nunca se cuenta, y el interruptor lo indica.
Consulte [Privacidad](Privacy.md#recuento-de-visitantes) para saber
exactamente qué se envía.
