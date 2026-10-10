<!-- translation-of: docs/user/12-ArchiveAndLeaderboards.md source-hash: 472fcc2701093e58 -->
# 12 — Archivo y logros

<!-- languages -->
[English](../12-ArchiveAndLeaderboards.md) · [Deutsch](../de/12-ArchiveAndLeaderboards.md) · **Español** · [Français](../fr/12-ArchiveAndLeaderboards.md) · [Bahasa Indonesia](../id/12-ArchiveAndLeaderboards.md) · [日本語](../ja/12-ArchiveAndLeaderboards.md) · [한국어](../ko/12-ArchiveAndLeaderboards.md) · [Português (Brasil)](../pt-BR/12-ArchiveAndLeaderboards.md)
<!-- /languages -->

> **Experimental.** Todo lo que hay aquí puede cambiar o eliminarse en una
> versión futura, y lo que produce podría no conservarse. En la página
> Publicaciones, el panel **Herramientas de billetera y archivo**
> está marcado con una insignia **Experimental**.

Las herramientas de Bitcoin, Base e IPFS de
[Evidencia y almacenamiento](11-EvidenceAndStorage.md) registran lo que
observan en un archivo duradero en este dispositivo. Esta guía cubre ese
archivo y lo que se construye sobre él: las referencias entre
publicaciones y los logros.

La mayoría de estas tarjetas están en la página Publicaciones, en
**Herramientas de billetera y archivo**, en sus pestañas
**Herramientas de archivo** y **Referencias y logros**. Cada una muestra
**Guardado localmente** cuando lo que contiene se conserva al recargar.

Una expresión que se usa en toda la guía: una **identidad de publicación**
es un registro de Publicación de anclaje en Bitcoin o en Base (consulte
[Publicaciones de anclaje en Bitcoin](11-EvidenceAndStorage.md#publicaciones-de-anclaje-en-bitcoin)).
Es un registro en una cadena, no una persona.

## El Archivo de observaciones de publicaciones

Un único registro duradero, en este dispositivo, de los hechos que
observan las herramientas de IPFS, Bitcoin y Base. Contiene solo
identidades de publicación y observaciones: nunca una conexión de
billetera, una clave ni una credencial de pinning.

### Archivo de observaciones

La tarjeta **Archivo de observaciones** muestra cuántas **Publicaciones** y
**Observaciones** contiene.

- **Mostrar archivo** abre la **Línea de tiempo de observaciones
  archivadas**: cada publicación y verificación en IPFS, cada transmisión,
  confirmación y prueba de contenido de Bitcoin, y cada observación de
  inclusión en Base, en orden cronológico, cada una con su dominio, su
  estado y (cuando corresponde) su localizador, su txid o la altura del
  bloque. Abrirla no contacta ninguna red.
- **Vaciar archivo** es la única forma de quitar algo del archivo; todo lo
  demás solo agrega. Está deshabilitado cuando el archivo está vacío.

### Evidencia histórica de anclajes en Bitcoin

Los mismos hechos de Bitcoin, agrupados por ID de anclaje, en una tarjeta
de la pestaña **Anclaje en blockchain**. **Mostrar anclajes históricos**, y
luego un ID de anclaje, muestra su **Historial de transmisiones**,
**Historial de confirmaciones**, **Historial de pruebas de contenido**,
**Comparaciones de ubicación en la cadena** y **Coherencia de las
observaciones**, con un resumen **Evidencia combinada** de los cinco
conteos. Los conteos dicen cuánto se registró, no qué tan confiable es.

### Exportar, importar e inspeccionar el archivo

La tarjeta **Archivo de publicaciones** convierte el archivo en un documento
JSON:

- **Exportar archivo** muestra el JSON y un enlace **Descargar la
  exportación del archivo**.
- **Importar archivo** toma un documento JSON, como archivo o pegado, y muestra una vista
  previa de cuántas publicaciones y observaciones contiene frente al
  archivo actual. Solo **Reemplazar el archivo actual** lo aplica. Importar
  **reemplaza** el archivo actual (no lo combina) y no se puede deshacer.
  Un documento no válido se rechaza sin cambiar nada.

**Inspeccionar un archivo externo** mira dentro de una exportación sin
importarla. Muestra la versión del esquema del documento, los conteos de
hechos por dominio (publicación y verificación en IPFS; transmisión,
confirmación, prueba de contenido e identidad de publicación en Bitcoin;
inclusión e identidad de publicación en Base), los conteos de hechos
locales e importados, los eventos de importación, su huella, y los ID de
anclajes en Bitcoin, los índices de registros de IPFS y los hashes de
transacciones de Base que contiene. Desde allí:

- **Comparar con el archivo actual** muestra, por dominio, qué es
  **Igual**, qué **Cambió**, qué está **Solo en el actual**, **Solo en el
  externo**, o tiene una **Procedencia distinta**.
- **Revisar el reemplazo** (después de una comparación) muestra de
  antemano qué cambiaría el reemplazo, con los conteos y las huellas de
  ambos archivos. Su botón **Reemplazar el archivo actual** es la misma
  importación de arriba. Reemplazar marca cada hecho como recién
  importado, así que la huella resultante es distinta de la del documento.

### Procedencia del archivo

Muestra de dónde vinieron los hechos: **Hechos locales** (observados en
este dispositivo) y **Hechos importados** (de un **Reemplazar el archivo
actual**). Si alguna vez importó, **Importaciones del archivo** muestra la
hora, el conteo de hechos y la versión del esquema de cada importación.
Ninguno de los dos tipos se considera más confiable.

### Huella del archivo

Un resumen SHA-256 de cada hecho y cada etiqueta de procedencia del
archivo. **Copiar huella** la copia. Para compararla con una huella de
otro lugar (de un par, por ejemplo), péguela en **Comparar con otra
huella** y haga clic en **Comparar**:

| Resultado | Significado |
|---|---|
| **COINCIDE** | Los dos archivos tienen contenidos idénticos. |
| **DISTINTA** | No los tienen. |
| **INVALID_FINGERPRINT** | Lo que pegó no es una huella SHA-256 de 64 caracteres (huella no válida). |

Que coincidan solo significa que el contenido es idéntico, no que sea
correcto, y nada aquí dice qué archivo es más reciente.

## Referencias entre publicaciones

Registre que una identidad de publicación apunta a otra.

**Referencias entre publicaciones → Mostrar referencias** abre un
formulario: elija la **Publicación de origen (la que hace la referencia)**
y la **Publicación referenciada (a la que se apunta)** entre sus
identidades de publicación de Bitcoin y Base conocidas (por ejemplo,
“Bitcoin — a1b2…c3d4 — contenido 9f8e…”), y luego haga clic en
**Registrar referencia**. Una publicación no puede hacer referencia a sí
misma. Las referencias solo las crea usted; nada crea una automáticamente,
y bifurcar en otra parte de la app tampoco.

A propósito, una referencia no se llama bifurcación: registra que el
puntero existe, no lo que significa (una bifurcación, una cita, una
respuesta).

Las referencias registradas se muestran de la más antigua a la más
reciente, con la cadena, la identidad abreviada y el hash de contenido de
ambos lados, y cuándo se registraron. Los duplicados se conservan como
referencias separadas.

**Grafo de referencias entre publicaciones** agrupa las mismas referencias
por publicación: totales de **Aristas**, **Publicaciones**, **Orígenes
distintos** y **Referenciadas distintas**, y para cada publicación sus
**Referencias salientes** y **Referencias entrantes**, que se despliegan
para mostrar cada referencia. Los conteos no son una clasificación.

## Logros

Una identidad de publicación obtiene una insignia en el momento en que
supera un umbral; no hay nada que reclamar.

**Logros → Mostrar logros** muestra las insignias obtenidas hasta ahora
(sus nombres aparecen en inglés en la app):

| Insignia | Icono | Se obtiene cuando |
|---|---|---|
| First publication (primera publicación) | 🏆 | Su primer registro de publicación de anclaje en Bitcoin o Base. |
| Bitcoin publisher (editor en Bitcoin) | ₿ | Su primero en Bitcoin. |
| Base publisher (editor en Base) | 🔵 | Su primero en Base. |
| Multi-chain publisher (editor en varias cadenas) | 🌐 | Registros en más de una cadena. |
| Ten publications (diez publicaciones) | 🔟 | Su décimo, sumando Bitcoin y Base. |
| One hundred publications (cien publicaciones) | 💯 | Su centésimo. |

Haga clic en una insignia para ver su **Publicación de origen** (cadena,
hash del contenido, referencia en la cadena, hora de creación) y, cuando
está disponible, **Ver el ciclo de vida de la publicación arriba**, que
salta al ciclo de vida de ese registro.

Cinco logros más vienen de las referencias y todavía no tienen insignia:
**First reference created** (primera referencia creada), **First reference
received** (primera referencia recibida), **Referenced by 10
publications** (referenciada por 10 publicaciones), **Referenced by 100
publications** (referenciada por 100 publicaciones) y **First cross-chain
reference** (primera referencia entre cadenas, entre una publicación de
Bitcoin y una de Base). Aparecen por su nombre en **Perfil de logros**,
donde elige una identidad de publicación y ve su conteo de logros y la
lista completa, cada uno con cuándo se obtuvo.

Los logros pertenecen a identidades de publicación, no a personas: nada
aquí vincula una publicación con una persona.

## Retirado: clasificaciones, conciliación y etiquetas de editor

Las versiones anteriores tenían páginas de Clasificación: una clasificación
de editores, declaraciones firmadas de instantánea del editor, un espacio y
una clasificación de conciliación, y la comparación de exportaciones de
evidencia. ForkBuild no clasifica a las personas ni lleva puntuaciones
([Pilares](../../Pillars.md#what-we-are-not-making)), así que se eliminaron. Un enlace antiguo a una de esas
páginas abre Inicio. Un archivo guardado cuando existían se sigue cargando e
importando, con todos sus demás registros; las declaraciones de clasificación
y las decisiones de conciliación que contenía se descartan.

También se eliminaron las Asociaciones de editores, que etiquetaban sus
publicaciones con un nombre de editor para esas páginas. Las etiquetas que
tenía un archivo se descartan de la misma manera.
