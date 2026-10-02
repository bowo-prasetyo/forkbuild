<!-- translation-of: docs/user/12-ArchiveAndLeaderboards.md source-hash: 6f86f5609d7f2b27 -->
# 12 — Archivo y clasificaciones

<!-- languages -->
[English](../12-ArchiveAndLeaderboards.md) · [Deutsch](../de/12-ArchiveAndLeaderboards.md) · **Español** · [Français](../fr/12-ArchiveAndLeaderboards.md) · [Bahasa Indonesia](../id/12-ArchiveAndLeaderboards.md) · [日本語](../ja/12-ArchiveAndLeaderboards.md) · [Português (Brasil)](../pt-BR/12-ArchiveAndLeaderboards.md)
<!-- /languages -->

> **Experimental.** Todo lo que hay aquí puede cambiar o eliminarse en una
> versión futura, y lo que produce podría no conservarse. En la página
> Publicaciones, el panel **Herramientas de billetera, archivo y editor**
> está marcado con una insignia **Experimental**; las páginas de
> Clasificación muestran un aviso **Experimental**.

Las herramientas de Bitcoin, Base e IPFS de
[Evidencia y almacenamiento](11-EvidenceAndStorage.md) registran lo que
observan en un archivo duradero en este dispositivo. Esta guía cubre ese
archivo y lo que se construye sobre él: las referencias entre
publicaciones, los logros, las etiquetas de editor y las páginas de
Clasificación.

La mayoría de estas tarjetas están en la página Publicaciones, en
**Herramientas de billetera, archivo y editor**, en sus pestañas
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

## Identidad del editor

**Asociaciones de editores** le permite etiquetar publicaciones con un
nombre de editor, según su propia palabra, para las tarjetas de editor y la
clasificación de abajo.

Un identificador de editor es una etiqueta simple y autodeclarada, no una
identidad verificada ni un inicio de sesión. La coincidencia es exacta:
`Alicia`, `alicia` y `ALICIA` son tres editores distintos. Nada se deduce de
billeteras, contenidos ni nombres.

**Mostrar asociaciones de editores**, y luego:

1. **Identificador del editor**: escriba una etiqueta, o elija una que ya
   usó.
2. **Publicación**: elija una de sus identidades de publicación de Bitcoin
   o Base.
3. **Agregar publicación**: registra la asociación.

**Asociaciones registradas** las muestra, de la más antigua a la más
reciente. **Publicaciones asociadas a un editor** muestra todas las
publicaciones de un editor elegido, con su hash de contenido y cuándo se
asoció.

Tres tarjetas de la página [Clasificación](#página-de-clasificación) se
basan en estas asociaciones, cada una con su propio menú desplegable
**Elija un editor**:

| Tarjeta | Muestra |
|---|---|
| **Perfil de logros del editor** | Todos los logros obtenidos por cualquier publicación que reivindique el editor, y qué publicación lo obtuvo. |
| **Insignias de logros del editor** | Lo mismo, limitado a los logros con insignia, cada uno con un enlace a su ciclo de vida en la página Publicaciones. |
| **Estadísticas de logros del editor** | Conteos de publicaciones asociadas, logros, tipos de logros, insignias y tipos de insignias, publicaciones por cadena y logros por tipo. |

Sin asociaciones todavía, cada tarjeta lo indica y remite a Asociaciones de
editores. Informan lo que un editor *reivindica*, no quién controla una
publicación, y ninguna clasifica a nadie.

## Página de Clasificación

La página **Clasificación** (`/leaderboard`) enlaza las páginas de abajo,
más las tres tarjetas de editor de arriba. No está en la barra superior:
ábrala desde el enlace **Clasificación** debajo de la tarjeta **Archivo de
publicaciones**, en la página Publicaciones.

### Clasificación de rendimiento de editores

`/publisher-leaderboard` ordena a los editores según lo que registró este
dispositivo: **Posición**, **Editor**, **Logros**, **Tipos de logros** y
**Publicaciones**, calculados de nuevo cada vez que se abre la página y
nunca guardados. Un editor aparece cuando le asoció una publicación. Los
nombres son sus propias etiquetas, no identidades verificadas.

### Declaración de instantánea del editor

`/publisher-snapshot-claim` firma una declaración sobre la instantánea
actual de su clasificación, para que un par pueda compararse con ella.
Necesita haber iniciado sesión.

1. **Generar y firmar declaración**: calcula su instantánea y firma una
   declaración sobre ella. Muestra el firmante y las huellas de la
   evidencia, de la política y de la instantánea. **Empezar de nuevo** la
   descarta.
2. **Exportar declaración**: muestra la declaración como JSON con un enlace
   **Descargar declaración**, para pegarla en el
   [Espacio de conciliación](#espacio-de-conciliación) de un par o enviarla
   como archivo.

### Espacio de conciliación

`/reconciliation-workspace`: pegue la declaración exportada por un par en
**JSON de la evidencia del par** y haga clic en **Conciliar**. Compara la
declaración con su archivo y, cuando eso encuentra un candidato de
conciliación, registra una decisión y una observación de revalidación en
su archivo y ofrece **Ver en la clasificación**. Si no hay nada que
conciliar, dice por qué. **Borrar resultado** descarta el resultado.

### Clasificación de candidatos de conciliación

`/reconciliation-leaderboard` es de solo lectura. Muestra, para cada
candidato de conciliación, la evidencia que tiene su archivo,
opcionalmente comparada con el archivo de un par.

Un **candidato** es un punto donde se compararon una declaración de
evidencia externa y un registro de Snapshot local del mismo contenido:

| Etiqueta del candidato | Significado |
|---|---|
| **Declaración *X* ↔ Snapshot n.º *N*** | Una declaración y un Snapshot que se compararon y no coincidieron. |
| **Declaración *X* (sin Snapshot correspondiente)** | Una declaración sin Snapshot con el que compararla. |
| **Snapshot n.º *N* (sin Declaración correspondiente)** | Un Snapshot sin declaración con la que compararlo. |

Los candidatos vienen del Espacio de conciliación. Hasta que haya
conciliado allí la declaración de un par, la página muestra “No hay
candidatos de conciliación para mostrar.”

**Columnas.** **Evidencia de decisión** (una elección registrada de en qué
lado se confió) y **Evidencia de observación** (una comprobación posterior
de esa decisión) tienen tres conteos cada una: **Compartido** (ambos
archivos la tienen), **Solo en origen** (solo el suyo) y **Solo en
destino** (solo el del par). Las filas aparecen en el orden en que se
encontraron, no según cuánta evidencia tienen; esto no es una
clasificación.

**Comparar con un par.** Pegue la exportación del archivo de un par en
**Archivo del par** y haga clic en **Usar como archivo del par**. Lo que
pegue que no sea válido se rechaza. Sin el archivo de un par, todo cuenta
como Solo en origen. Una línea arriba de la tabla indica en qué caso está:

| Aviso | Significado |
|---|---|
| *No se proporcionó ningún archivo de par: todos los conteos de abajo reflejan solo esta réplica.* | Todavía no hay archivo de par. |
| *Se proporcionó un archivo de par, pero no tiene evidencia registrada: todos los conteos de abajo siguen reflejando solo esta réplica.* | Un archivo real, pero vacío. |
| *Se compara con un archivo de par proporcionado.* | Una comparación real. |

**Inspeccionar evidencia** (y luego **Ocultar evidencia**) en una fila
muestra los registros de decisión y de observación que hay detrás de sus
conteos, separados en Compartido, Solo en origen y Solo en destino. Cada
observación muestra la huella del plan contra el que se comprobó (como
`plan abcdef012345…`) y si el candidato estaba **presente** y **coincide
con el plan**, tal como se registró. Los registros que parecen iguales se
mantienen separados.

**Filtro de evidencia.** Dos menús desplegables limitan lo que se muestra:
**Tipo de evidencia** (**Todo**, **Decisiones**, **Observaciones**) y
**Relación entre réplicas** (**Todo**, **Compartido**, **Solo en origen**,
**Solo en destino**). Una fila se queda si tiene evidencia de ese tipo en
esa relación. Con **Relación entre réplicas** en **Todo**, no se filtra
nada; con **Tipo de evidencia** en **Todo**, una fila coincide si
cualquiera de los dos tipos tiene la relación elegida. El filtro también
limita la lista Inspeccionar evidencia de cada fila. Solo oculta filas y
registros; los conteos de una fila nunca cambian.

**Exportación de evidencia.** **Exportar evidencia** produce un documento
JSON con exactamente lo que muestra el filtro, registrando el estado de la
comparación y el filtro usado, con un enlace **Descargar la exportación de
evidencia** (`reconciliation-candidate-leaderboard-evidence-export.json`).
No se sube nada. **Comparar evidencia exportada** abre la
[Comparación de exportaciones de evidencia](#comparación-de-exportaciones-de-evidencia).

**Importar exportación de evidencia.** Pegue una exportación (suya o de un
par) y haga clic en **Importar evidencia** para ver su estado de
comparación y sus conteos de candidatos, decisiones y observaciones. Lo
que pegue que no sea válido se rechaza y se conserva el resumen anterior.
**Borrar evidencia importada** lo descarta. Esto no afecta la tabla de
arriba.

La página lee su archivo una vez al abrirse; vuelva a abrirla para ver los
registros nuevos. El archivo del par, el filtro, las filas abiertas y el
resumen importado no se guardan.

## Comparación de exportaciones de evidencia

`/evidence-export-comparison` compara dos exportaciones de evidencia entre
sí: por ejemplo, la de la semana pasada y la de hoy, o la suya y la de un
par. No lee su archivo ni afecta la clasificación.

Pegue los dos documentos en **Exportación de evidencia de origen** y
**Exportación de evidencia de destino** y haga clic en **Comparar
evidencia**. Un lado no válido se rechaza por separado; el otro lado se
conserva. **Borrar comparación** vacía la página.

- **Estado de la comparación y filtro** muestran el estado de comparación y
  el filtro registrados en cada documento, y si son iguales.
- Tres tablas (**presencia de candidatos**, **evidencia de decisión** y
  **evidencia de observación**) cuentan cada una Solo en origen,
  Compartido y Solo en destino, y nunca se combinan.
- **Inspeccionar registros** (y luego **Ocultar registros**) muestra los
  registros que hay detrás de los conteos de una tabla. En un registro de
  decisión o de observación, **Inspeccionar identidad** muestra los campos
  que lo identifican:

| Registro | Campos de identidad |
|---|---|
| Decisión | `decided`, `candidate`, `decision`, `decidedAt` |
| Observación | `candidate`, `decision`, `planIdentity`, `candidatePresent`, `candidateType`, `candidateMatchesPlan`, `observedAt` |

**Emparejamiento explícito de registros.** Para comparar dos registros
concretos, elija un registro de origen y uno de destino (de cualquier
partición) para decisiones u observaciones y haga clic en **Agregar par**;
**Quitar** saca un par. Nada se empareja automáticamente, y el mismo par se
puede agregar dos veces. En **Diferencias entre registros emparejados**,
cada **Par de decisión *N*** o **Par de observación *N*** muestra cuántos
campos de identidad difieren (o **Sin diferencias**); **Inspeccionar
diferencias** los nombra, o dice **Idénticos en todos los campos
nombrados.** Nunca dice qué lado tiene razón.

Nada en esta página se guarda ni se envía a ningún lugar; recargar la
borra.
