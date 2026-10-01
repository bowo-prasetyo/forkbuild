<!-- translation-of: docs/user/01-GettingStarted.md source-hash: 757dbcb5067716b0 -->
# 01 — Primeros pasos

<!-- languages -->
[English](../01-GettingStarted.md) · [Deutsch](../de/01-GettingStarted.md) · **Español** · [Bahasa Indonesia](../id/01-GettingStarted.md) · [日本語](../ja/01-GettingStarted.md)
<!-- /languages -->

¡Bienvenido! Esta guía lo lleva de “acabo de abrir la app” a “construí
algo” en unos cinco minutos.

## Abrir ForkBuild

ForkBuild funciona en cualquier navegador web actual. Abra la URL
alojada y llegará a la pantalla **Inicio**. Para ejecutar su propia copia,
sirva la carpeta por HTTP (por ejemplo, `python3 -m http.server 8000`, y
luego abra <http://localhost:8000/>): abrir `index.html` directamente
desde el disco no funciona, porque los navegadores no cargan sus módulos
desde una página `file://`. El servidor de encuentro predeterminado solo
atiende al sitio alojado, así que una copia propia no puede usarlo para
encontrar personas; conéctese mediante invitaciones, o configure su propio
servidor de encuentro (consulte
[Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md)).

La barra de arriba siempre está visible:

`ForkBuild Inicio Editor Repositorio Mis mundos Mi avatar Mis identidades Pares Siguiendo Conversaciones Publicaciones Configuración de red Sus datos Idioma Acerca de 🔔 [Iniciar sesión]`

- **Inicio**: la página de inicio
- **Editor**: donde construye
- **Repositorio**: explore las creaciones publicadas por todos
- **Mis mundos**: los Mundos que realmente visitó en este dispositivo;
  consulte
  [Mis mundos](03-WorldView.md#mis-mundos--los-mundos-que-realmente-visitó)
- **Mi avatar**: cómo lo ven los demás en la Vista del mundo; consulte
  [Avatares y presencia](06-AvatarsAndPresence.md)
- **Mis identidades**: las identidades criptográficas guardadas en este
  dispositivo; consulte
  [Identidad e inicio de sesión](05-IdentityAndLogin.md)
- **Pares**: las personas con las que está conectado, que conoce o que son
  sus amigos; consulte
  [Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md)
- **Conversaciones**: sus mensajes directos; consulte
  [Chat y conversaciones](08-ChatAndConversations.md)
- **Publicaciones**: declaraciones firmadas de autoría y de nombres de
  lugares, dónde guardarlas y anunciarlas y (*experimental*) su evidencia
  externa; consulte
  [Publicaciones y evidencia externa](09-PublicationsAndEvidence.md)
- **Configuración de red**: gateways, relays, proveedores y servidores de
  conexión entre pares; consulte
  [Configuración de red](10-NetworkSettings.md)
- **Idioma**: el idioma en que ForkBuild se muestra en este dispositivo.
  Sigue los idiomas de su navegador hasta que usted elija uno; guardar
  recarga la página, así que primero guarde su trabajo. ForkBuild está
  disponible en inglés, alemán, español, bahasa indonesia y japonés
  (consulte [Translating ForkBuild](../../Translating.md), en inglés).
- **Acerca de**: información de la versión

## Iniciar sesión

Haga clic en **Iniciar sesión**, en la esquina superior derecha. ForkBuild
no usa contraseñas ni cuentas centrales: **su identidad es un par de
claves criptográficas guardado en este dispositivo**. El diálogo Iniciar
sesión muestra todas las identidades que ya tiene este navegador; haga
clic en una para usarla, o cree una nueva:

1. Escriba un **nombre visible**: es lo que verán las demás personas.
2. Escriba dos veces una **frase de contraseña** de al menos 8 caracteres.
   Cifra su clave en este dispositivo y no se puede restablecer, así que
   elija una que vaya a conservar. (Para omitirla, marque **Crear sin
   frase de contraseña**; la clave se guarda entonces sin cifrar en este
   navegador).
3. Haga clic en **Crear e iniciar sesión**.

Eso es todo: ya inició sesión, y todo lo que construya, publique o envíe
se firma con esta identidad.

Qué protege una frase de contraseña, cómo bloquear y desbloquear, y cómo
hacer una copia de seguridad de su identidad se explica en
[Identidad e inicio de sesión](05-IdentityAndLogin.md).

## El recorrido

ForkBuild tiene varias áreas principales:

| Área | Para qué sirve |
|---|---|
| **Editor** | Construir y editar sus propias creaciones |
| **Repositorio** | Buscar, explorar, abrir, bifurcar y recorrer creaciones publicadas |
| **Vista del autor** | Ver todo lo que hizo una persona (se abre al hacer clic en el nombre de cualquier autor) |
| **Vista del mundo** | Volar por el mundo compartido donde todas las creaciones viven en un espacio 3D, y buscar o explorar para encontrar cosas |
| **Mi avatar / Pares / Conversaciones** | Cómo lo ven los demás, con quién está conectado y sus mensajes directos: consulte las guías enlazadas arriba |

## Colocar su primer bloque

1. Haga clic en **Editor** en la barra superior.
2. En la barra lateral izquierda, asegúrese de que la herramienta
   **Colocar** esté activa (presione `2`).
3. En la **Biblioteca de construcción**, debajo, abra la pestaña
   **Bloques** y haga clic en un bloque: por ejemplo, **Cubo** en
   **Básicos**.
4. Mueva el mouse a la ventana gráfica 3D. Un **fantasma** translúcido del
   bloque sigue la cuadrícula.
5. **Haga clic** para colocarlo.

¡Felicitaciones, construyó su primer bloque! 🎉

### Apilar bloques

No tiene que construir sobre el suelo. Pase el cursor sobre una **cara**
de un bloque existente y el fantasma se ajusta a ella: haga clic para
apilarlo encima o para unirlo al costado. Así se construyen paredes,
torres y techos.

## Guardar su trabajo

Presione **Ctrl+S** (o haga clic en **Guardar** en la barra de
herramientas). El indicador **● Cambios sin guardar** cambia a
**Guardado**.

Su creación se guarda en su navegador, así que sigue ahí cuando vuelve.
Mientras edita, ForkBuild también conserva una copia de recuperación de
los cambios sin guardar, y ofrece restaurarla si la página se cierra antes
de que guarde.

Los navegadores limitan cuánto puede guardar cada sitio, normalmente a una
parte del disco. Si se llena la parte de ForkBuild, el guardado y la
recuperación se detienen con un mensaje que lo indica; no se pierde nada
de lo que tenga abierto. Use **Exportar** en la barra de herramientas para
conservar una copia del documento como archivo. La primera vez que guarda,
algunos navegadores preguntan si ForkBuild puede conservar sus datos de
forma permanente; permitirlo evita que el navegador los borre cuando queda
poco espacio en el disco.

No necesita iniciar sesión para construir. Iniciar sesión importa cuando
publica o trabaja con otras personas: una creación que publica sin haber
iniciado sesión no tiene autor ni firma, así que no se puede compartir con
pares ni distribuir después. Primero inicie sesión y luego publique.

## ¿Y ahora qué?

- Aprenda todo el kit de construcción en **[El Editor](02-TheEditor.md)**.
- ¿Listo para compartir? Vaya a
  **[Publicar y bifurcar](04-PublishingAndForking.md)**.
- Configure su identidad, su avatar y sus conexiones en
  **[Identidad e inicio de sesión](05-IdentityAndLogin.md)**,
  **[Avatares y presencia](06-AvatarsAndPresence.md)** y
  **[Conexiones entre pares y amigos](07-PeerConnectionsAndFriends.md)**.
