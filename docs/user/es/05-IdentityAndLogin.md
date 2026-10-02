<!-- translation-of: docs/user/05-IdentityAndLogin.md source-hash: b7e773ae656ae805 -->
# 05 — Identidad e inicio de sesión

<!-- languages -->
[English](../05-IdentityAndLogin.md) · [Deutsch](../de/05-IdentityAndLogin.md) · **Español** · [Français](../fr/05-IdentityAndLogin.md) · [Bahasa Indonesia](../id/05-IdentityAndLogin.md) · [日本語](../ja/05-IdentityAndLogin.md) · [한국어](../ko/05-IdentityAndLogin.md) · [Português (Brasil)](../pt-BR/05-IdentityAndLogin.md)
<!-- /languages -->

ForkBuild no tiene contraseñas ni un servidor central de cuentas. **Su
identidad es un par de claves criptográficas guardado en este navegador**:
la misma clave que firma todo lo que construye, publica, envía como mensaje
o mueve. Esta guía cubre cómo crear, proteger y hacer una copia de
seguridad de esa identidad.

## Crear una identidad

Haga clic en **Iniciar sesión** en la barra superior. El diálogo muestra
todas las identidades que ya tiene este dispositivo (haga clic en una para
usarla), o puede crear una nueva:

1. Escriba un **nombre visible**. Es lo que ven las demás personas; puede
   tener varias identidades con nombres distintos.
2. Escriba una **frase de contraseña** (al menos 8 caracteres) y luego
   escríbala otra vez para confirmarla.
3. Haga clic en **Crear e iniciar sesión**.

Así se crea una identidad **protegida** (se muestra con un 🔒): la clave
se guarda cifrada y solo se descifra, en memoria, después de que ingresa la
frase de contraseña.

Puede dejar vacía la frase de contraseña, pero solo marcando **Crear sin
frase de contraseña**. Eso crea una identidad **sin protección**: la clave
se guarda sin cifrar en este navegador, lista para usarse sin pedirle nunca
nada, y cualquier cosa que pueda leer el almacenamiento de este sitio puede
firmar como usted. Puede protegerla más adelante desde **Mis
identidades**.

> No se puede restablecer la contraseña. En una identidad protegida, la
> frase de contraseña *es* la única forma de descifrar la clave: si la
> pierde, esa identidad desaparece, incluso para el propio ForkBuild. Elija
> una que pueda conservar.

## La bóveda: bloqueada o sin sesión

La clave descifrada de una identidad protegida vive en algo llamado su
**bóveda**. La bóveda puede estar **bloqueada** o **desbloqueada**, y esa es
una pregunta realmente distinta de si inició sesión o no:

- **Con sesión iniciada, desbloqueada**: todo funciona con normalidad.
- **Con sesión iniciada, bloqueada** (🔒 junto a su nombre, arriba a la
  derecha): sigue siendo usted, y todavía puede explorar, construir y
  guardar, pero cualquier cosa que necesite una firma nueva (publicar, ser
  descubrible, unirse a una sala) falla con un mensaje de “identidad
  bloqueada” hasta que la desbloquee. Haga clic en **Desbloquear** junto a
  su nombre para ingresar su frase de contraseña, y vuelva a intentarlo.
- **Sin sesión iniciada**: no es nadie; abra **Iniciar sesión** para
  elegir o desbloquear una identidad otra vez.

Una bóveda se bloquea automáticamente **15 minutos después de
desbloquearla**, siga o no usando la app (no es un temporizador de
inactividad), o cuando usted mismo hace clic en **Bloquear** en **Mis
identidades**. Recargar la página siempre deja bloqueadas las identidades
protegidas (la clave descifrada nunca se escribe en el disco, solo se
mantiene en memoria), aunque la app todavía recuerde con quién había
iniciado sesión.

## Administrar identidades — la página Mis identidades

Abra **Mis identidades** en la barra superior para ver todas las
identidades que tiene este dispositivo, cada una con su propio estado de
bloqueo, independientemente de con cuál haya iniciado sesión. Desde aquí
puede:

- **Crear** una identidad nueva (igual que en el diálogo de inicio de
  sesión).
- **Proteger con frase de contraseña**: aparece en una identidad sin
  protección (marcada ⚠ Sin protección). Cifra la clave existente; la
  identidad en sí no cambia, y queda bloqueada hasta que la desbloquee.
- **Bloquear / Desbloquear** cada identidad por separado.
- **Cambiar frase de contraseña**: reemplaza la frase de contraseña de una
  identidad protegida (solo las identidades protegidas lo ofrecen). La
  identidad en sí (su ID, su clave pública y todas las firmas que hizo)
  nunca cambia.
- **Exportar**: hacer una copia de seguridad.
- **Importar**: restaurar o copiar una desde un archivo de copia de
  seguridad.
- **Declarar sucesora / Revocar**: marcar una identidad como retirada en
  favor de otra (pegue el ID `did:key:z…` de la sucesora), o revocarla por
  completo, de forma permanente. Declarar una sucesora no revoca nada por
  sí solo: revoque por separado cuando el cambio deba entrar en vigor. En
  una identidad protegida y bloqueada, ambas acciones piden su frase de
  contraseña, y firmar con ella la desbloquea, exactamente como si la
  desbloqueara usted mismo.

Solo uno de estos formularios (Desbloquear, Exportar, Cambiar frase de
contraseña, Declarar sucesora, Revocar) está abierto a la vez, en una sola
tarjeta de identidad. Abrir otro, presionar **Cancelar** o terminar la
acción lo cierra y borra todos sus campos, para que una frase de
contraseña que escribió nunca quede en la página. Se les indica a los
administradores de contraseñas del navegador que no completen
automáticamente los campos de esta página.

No hay forma de cambiar el nombre ni de eliminar una identidad: las
identidades están pensadas para perdurar; si quiere dejar de usar una,
revóquela.

## Hacer una copia de seguridad de una identidad (exportar e importar)

Su identidad solo existe en este dispositivo a menos que haga una copia de
seguridad. **Exportar** produce un archivo descargable que contiene su
clave privada cifrada:

- Exportar siempre pide la frase de contraseña de la identidad, aunque esté
  desbloqueada en ese momento.
- Si la identidad no tiene protección, exportar le pide que elija en ese
  momento una frase de contraseña (al menos 8 caracteres), solo para
  proteger la copia del archivo.

**Importar** lleva una identidad exportada a otro dispositivo o navegador:

1. Haga clic en **Importar identidad** y luego elija el archivo exportado
   (o pegue su JSON en el cuadro de abajo). ForkBuild muestra primero una
   vista previa segura (nombre, ID, algoritmo y si ya la tiene) sin
   descifrar nada.
2. Ingrese la frase de contraseña de la exportación para importarla de
   verdad.

Una identidad importada siempre llega **bloqueada**, y no se inicia sesión
automáticamente con ella: desbloquéela desde Mis identidades o desde el
diálogo de inicio de sesión, como cualquier otra identidad protegida.

El archivo también lleva los registros firmados del ciclo de vida de la
identidad: su revocación, la sucesora que declaró y los dispositivos que
autorizó o dejó de autorizar. Importarlo los restaura, así que una
identidad revocada vuelve revocada y no activa. Importar un archivo más
reciente de una identidad que ya tiene agrega los registros que le faltan
al dispositivo, y no cambia nada más.

Para hacer una copia de seguridad de todas las identidades a la vez, junto
con todo lo demás, use [Sus datos](13-YourData.md).

Los archivos exportados por versiones anteriores de ForkBuild se siguen
importando. Los archivos que se exportan ahora usan un formato más nuevo
que las versiones anteriores no pueden leer, así que primero actualice
ForkBuild en el otro dispositivo.

## Claves de versiones anteriores

Las identidades protegidas creadas antes de esta versión usaban un formato
de cifrado más débil. Se siguen desbloqueando con la misma frase de
contraseña, y la primera vez que desbloquea una (o la exporta), ForkBuild
la vuelve a cifrar con el formato actual. Nada de la identidad en sí
cambia.

> Guarde en un lugar seguro tanto el archivo exportado *como* su frase de
> contraseña. Cualquiera de los dos por separado no sirve, y perder ambos
> significa que esa identidad, y todo lo que solo ella podía firmar, no se
> puede recuperar.

## Frase de contraseña incorrecta

Cinco intentos fallidos (al desbloquear, exportar o cambiar una frase de
contraseña: comparten un solo conteo por identidad) activan una espera de
30 segundos; el mensaje de error cuenta los intentos restantes y luego el
tiempo de bloqueo restante. El conteo se reinicia al recargar.

## ¿Y ahora qué?

Ahora que inició sesión, configure cómo lo ven los demás en
**[Avatares y presencia](06-AvatarsAndPresence.md)**, o encuentre personas
con las que construir en
**[Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md)**.
