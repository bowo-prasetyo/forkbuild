<!-- translation-of: docs/user/12-ArchiveAndLeaderboards.md source-hash: 6f86f5609d7f2b27 -->
# 12 — Arquivo e classificações

<!-- languages -->
[English](../12-ArchiveAndLeaderboards.md) · [Deutsch](../de/12-ArchiveAndLeaderboards.md) · [Español](../es/12-ArchiveAndLeaderboards.md) · [Français](../fr/12-ArchiveAndLeaderboards.md) · [Bahasa Indonesia](../id/12-ArchiveAndLeaderboards.md) · [日本語](../ja/12-ArchiveAndLeaderboards.md) · [한국어](../ko/12-ArchiveAndLeaderboards.md) · **Português (Brasil)**
<!-- /languages -->

> **Experimental.** Tudo aqui pode mudar ou ser removido numa versão
> futura, e o que produz pode não ser aproveitado depois. Na página
> Publicações, o painel **Ferramentas de carteira, arquivo e editor** é
> marcado com um selo **Experimental**; as páginas de classificação mostram
> uma faixa **Experimental**.

As ferramentas de Bitcoin, Base e IPFS de
[Evidências e armazenamento](11-EvidenceAndStorage.md) registram o que
observam num arquivo durável neste dispositivo. Este guia trata desse
arquivo e do que é construído sobre ele: referências entre publicações,
conquistas, rótulos de editores e as páginas de classificação.

A maioria destes cartões fica na página Publicações, em **Ferramentas de
carteira, arquivo e editor**, nas guias **Ferramentas de arquivo** e
**Referências e conquistas**. Cada um mostra **Guardado localmente** quando o
que ele guarda sobrevive a uma recarga.

Uma palavra usada em todo o guia: uma **identidade de publicação** é um
registro de Publicação de âncora no Bitcoin ou na Base (veja
[Publicações de âncora no Bitcoin](11-EvidenceAndStorage.md#publicações-de-âncora-no-bitcoin)).
É um registro numa cadeia, não uma pessoa.

## O arquivo de observações de publicações

Um único registro durável, neste dispositivo, dos fatos que as ferramentas
de IPFS, Bitcoin e Base observam. Ele guarda só identidades de publicação e
observações: nunca uma conexão de carteira, uma chave ou uma credencial de
pinning.

### Arquivo de observações

O cartão **Arquivo de observações** mostra quantas **Publicações** e
**Observações** ele guarda.

- **Mostrar arquivo** abre a **Linha do tempo de observações arquivadas**:
  cada publicação e verificação no IPFS, cada transmissão, confirmação e
  prova de conteúdo no Bitcoin e cada observação de inclusão na Base, em
  ordem cronológica, cada uma com o domínio, o estado e (quando cabe) o
  localizador, o txid ou a altura do bloco. Abri-la não contata nenhuma
  rede.
- **Esvaziar arquivo** é o único jeito de remover algo do arquivo; todo o
  resto só acrescenta. Fica desabilitado quando o arquivo está vazio.

### Evidências históricas de âncoras no Bitcoin

Os mesmos fatos do Bitcoin, agrupados por ID de âncora, num cartão da guia
**Ancoragem em blockchain**. **Mostrar âncoras históricas**, e depois um ID
de âncora, mostra o **Histórico de transmissões**, o **Histórico de
confirmações**, o **Histórico de provas de conteúdo**, as **Comparações de
posição na cadeia** e a **Consistência das observações**, com um resumo de
**Evidências combinadas** das cinco contagens. As contagens dizem quanto foi
registrado, não quão confiável isso é.

### Exportando, importando e inspecionando o arquivo

O cartão **Arquivo de publicações** transforma o arquivo num documento JSON:

- **Exportar arquivo** mostra o JSON e um link **Baixar a exportação do
  arquivo**.
- **Importar arquivo** recebe um documento ou um JSON colado e mostra uma
  prévia de quantas publicações e observações ele guarda em relação ao
  arquivo atual. Só **Substituir o arquivo atual** o aplica. Importar
  **substitui** o arquivo atual (não mescla) e não pode ser desfeito. Um
  documento inválido é recusado sem que nada mude.

**Inspecionar um arquivo externo** olha dentro de uma exportação sem
importá-la. Mostra a versão do esquema do documento, a contagem de fatos por
domínio (publicação e verificação no IPFS; transmissão, confirmação, prova
de conteúdo e identidade de publicação no Bitcoin; inclusão e identidade de
publicação na Base), as contagens de fatos locais e importados, os eventos de
importação, a impressão digital dele, e os IDs de âncora no Bitcoin, os
índices de registros no IPFS e os hashes de transação na Base que ele guarda.
Dali:

- **Comparar com o arquivo atual** lista, por domínio, o que está **Igual**,
  **Alterado**, **Só no atual**, **Só no externo** ou tem **Procedência
  diferente**.
- **Revisar a substituição** (depois de uma comparação) mostra uma prévia do
  que a substituição mudaria, com as contagens e as impressões digitais dos
  dois arquivos. O botão **Substituir o arquivo atual** dele é a mesma
  importação de cima. Substituir marca todos os fatos como recém-importados,
  então a impressão digital resultante é diferente da do documento.

### Procedência do arquivo

Mostra de onde vieram os fatos: **Fatos locais** (observados neste
dispositivo) e **Fatos importados** (de um **Substituir o arquivo atual**).
Se você já importou alguma vez, **Importações do arquivo** lista a hora, o
número de fatos e a versão do esquema de cada importação. Nenhum dos dois
tipos é tratado como mais confiável.

### Impressão digital do arquivo

Um resumo SHA-256 de cada fato e etiqueta de procedência do arquivo.
**Copiar impressão digital** o copia. Para comparar com uma impressão digital
de outro lugar (de um par, por exemplo), cole-a em **Comparar com outra
impressão digital** e clique em **Comparar**:

| Resultado | Significado |
|---|---|
| **CORRESPONDE** | Os dois arquivos têm conteúdos idênticos. |
| **DIFERENTE** | Não têm. |
| **INVALID_FINGERPRINT** (impressão digital inválida) | O que você colou não é uma impressão digital SHA-256 de 64 caracteres. |

Uma correspondência só quer dizer que os conteúdos são idênticos, não que
estão corretos, e nada aqui diz qual arquivo é mais novo.

## Referências entre publicações

Registre que uma identidade de publicação aponta para outra.

**Referências entre publicações → Mostrar referências** abre um formulário:
escolha a **Publicação de origem (a que faz a referência)** e a **Publicação
referenciada (a que é apontada)** entre as suas identidades de publicação
conhecidas no Bitcoin e na Base (por exemplo "Bitcoin — a1b2…c3d4 — conteúdo
9f8e…") e clique em **Registrar referência**. Uma publicação não pode fazer
referência a si mesma. As referências só são feitas por você; nada cria uma
automaticamente, nem bifurcar em outro lugar do app.

De propósito, uma referência não se chama bifurcação: ela registra que o
apontamento existe, não o que ele significa (uma bifurcação, uma citação,
uma resposta).

As referências registradas aparecem da mais antiga para a mais nova, com a
cadeia, a identidade curta, o hash do conteúdo de cada lado e quando foi
registrada. Duplicatas ficam como referências separadas.

O **Grafo de referências entre publicações** agrupa as mesmas referências
por publicação: totais de **Arestas**, **Publicações**, **Origens
distintas** e **Referenciadas distintas**, e para cada publicação as
**Referências feitas** e **Referências recebidas**, que se expandem nas
referências individuais. As contagens não são uma classificação.

## Conquistas

Uma identidade de publicação ganha um emblema no momento em que passa de um
limite; não há nada para reivindicar.

**Conquistas → Mostrar conquistas** lista os emblemas ganhos até agora (os
nomes aparecem em inglês no app):

| Emblema | Ícone | Ganho quando |
|---|---|---|
| First publication (primeira publicação) | 🏆 | Seu primeiro registro de publicação de âncora no Bitcoin ou na Base. |
| Bitcoin publisher (editor no Bitcoin) | ₿ | Seu primeiro no Bitcoin. |
| Base publisher (editor na Base) | 🔵 | Seu primeiro na Base. |
| Multi-chain publisher (editor em várias cadeias) | 🌐 | Registros em mais de uma cadeia. |
| Ten publications (dez publicações) | 🔟 | Seu 10º, Bitcoin e Base juntos. |
| One hundred publications (cem publicações) | 💯 | Seu 100º. |

Clique num emblema para ver a **Publicação de origem** (cadeia, hash do
conteúdo, referência na cadeia, hora de criação) e, quando disponível, **Ver
o ciclo de vida da publicação acima**, que leva ao ciclo de vida daquele
registro.

Mais cinco conquistas vêm de referências e ainda não têm emblema: **First
reference created** (primeira referência criada), **First reference
received** (primeira referência recebida), **Referenced by 10
publications** (referenciada por 10 publicações), **Referenced by 100
publications** (referenciada por 100 publicações) e **First cross-chain
reference** (primeira referência entre cadeias, entre uma publicação no
Bitcoin e uma na Base). Elas aparecem pelo nome em **Perfil de
conquistas**, onde você escolhe uma identidade de publicação e vê a contagem
e a lista completa de conquistas dela, cada uma com quando foi ganha.

As conquistas pertencem às identidades de publicação, não a pessoas: nada
aqui liga uma publicação a uma pessoa.

## Identidade do editor

**Associações de editores** permite rotular publicações com um nome de
editor, por sua própria conta, para os cartões de editor e a classificação
abaixo.

Um identificador de editor é um rótulo simples e autodeclarado, não uma
identidade verificada nem um login. A correspondência é exata: `Alice`,
`alice` e `ALICE` são três editores. Nada é deduzido de carteiras, conteúdo
ou nomes.

**Mostrar associações do editor**, e depois:

1. **Identificador do editor** — digite um rótulo, ou escolha um que você já
   usou.
2. **Publicação** — escolha uma das suas identidades de publicação no
   Bitcoin ou na Base.
3. **Adicionar publicação** — registra a associação.

**Associações registradas** as lista, da mais antiga para a mais nova.
**Publicações associadas a um editor** mostra todas as publicações de um
editor escolhido, com o hash do conteúdo e quando foi associada.

Três cartões da página de [Classificação](#central-de-classificações) se
baseiam nessas associações, cada um com sua lista **Escolha um editor**:

| Cartão | Mostra |
|---|---|
| **Perfil de conquistas do editor** | Todas as conquistas ganhas por qualquer publicação que o editor reivindica, e qual publicação a ganhou. |
| **Emblemas de conquistas do editor** | O mesmo, limitado às conquistas com emblema, cada uma com um link de volta para o ciclo de vida dela na página Publicações. |
| **Estatísticas de conquistas do editor** | Contagens de publicações associadas, conquistas, tipos de conquista, emblemas e tipos de emblema, publicações por cadeia e conquistas por tipo. |

Sem associações ainda, cada cartão diz isso e aponta para Associações de
editores. Eles informam o que um editor *declara*, não quem controla uma
publicação, e nenhum deles classifica ninguém.

## Central de classificações

A página **Classificação** (`/leaderboard`) reúne links para as páginas
abaixo, mais os três cartões de editor acima. Ela não está na barra
superior: abra-a pelo link **Classificação** abaixo do cartão **Arquivo de
publicações**, na página Publicações.

### Classificação de desempenho dos editores

`/publisher-leaderboard` classifica os editores pelo que este dispositivo
registrou: **Posição**, **Editor**, **Conquistas**, **Tipos de conquista** e
**Publicações**, calculados de novo cada vez que a página abre e nunca
guardados. Um editor aparece depois que você associou uma publicação a ele.
Os nomes são rótulos seus, não identidades verificadas.

### Declaração de snapshot do editor

`/publisher-snapshot-claim` assina uma declaração sobre o snapshot atual da
sua classificação, para que um par possa comparar com ele. Você precisa ter
entrado.

1. **Gerar e assinar declaração** — calcula seu snapshot e assina uma
   declaração sobre ele. Mostra quem assinou e as impressões digitais da
   evidência, da política e do snapshot. **Recomeçar** a descarta.
2. **Exportar declaração** — mostra a declaração como JSON, com um link
   **Baixar declaração**, para colar no
   [Espaço de conciliação](#espaço-de-conciliação) de um par ou enviar como
   arquivo.

### Espaço de conciliação

`/reconciliation-workspace`: cole a declaração exportada de um par em **JSON
da evidência do par** e clique em **Conciliar**. Ele compara a declaração
com o seu arquivo e, quando isso encontra um candidato de conciliação,
registra uma decisão e uma observação de revalidação no seu arquivo e
oferece **Ver na classificação**. Se não houver nada para conciliar, ele diz
por quê. **Limpar resultado** dispensa o resultado.

### Classificação de candidatos de conciliação

`/reconciliation-leaderboard` é somente leitura. Mostra, para cada candidato
de conciliação, as evidências que o seu arquivo guarda, comparadas, se você
quiser, com o arquivo de um par.

Um **candidato** é um ponto onde uma declaração de evidência externa e um
registro de Snapshot local do mesmo conteúdo foram comparados:

| Rótulo do candidato | Significado |
|---|---|
| **Declaração *X* ↔ Snapshot nº *N*** | Uma declaração e um snapshot que foram comparados e divergiram. |
| **Declaração *X* (sem Snapshot correspondente)** | Uma declaração sem snapshot para comparar. |
| **Snapshot nº *N* (sem declaração correspondente)** | Um snapshot sem declaração para comparar. |

Os candidatos vêm do Espaço de conciliação. Até você conciliar ali uma
declaração de um par, a página mostra "Não há candidatos de conciliação para
mostrar.".

**Colunas.** **Evidências de decisão** (uma escolha registrada de qual lado
mereceu confiança) e **Evidências de observação** (uma nova conferência
posterior daquela decisão) têm, cada uma, três contagens: **Em comum** (os
dois arquivos têm), **Só na origem** (só o seu) e **Só no destino** (só o do
par). As linhas aparecem na ordem em que foram encontradas, não por quantas
evidências têm; isto não é uma classificação.

**Comparando com um par.** Cole a exportação de arquivo de um par em
**Arquivo do par** e clique em **Usar como arquivo do par**. Uma colagem
inválida é recusada. Sem arquivo de par, tudo conta como Só na origem. Uma
linha acima da tabela diz em que caso você está:

| Faixa | Significado |
|---|---|
| *Nenhum arquivo de par fornecido — todas as contagens abaixo refletem só esta réplica.* | Ainda sem arquivo de par. |
| *Um arquivo de par foi fornecido, mas não tem nenhuma evidência registrada — todas as contagens abaixo ainda refletem só esta réplica.* | Um arquivo de verdade, mas vazio. |
| *Comparando com um arquivo de par fornecido.* | Uma comparação de verdade. |

**Inspecionar evidências** (depois **Ocultar evidências**) numa linha lista
os registros de decisão e de observação por trás das contagens dela,
divididos em Em comum, Só na origem e Só no destino. Cada observação mostra
a impressão digital do plano com que foi conferida (como `plano
abcdef012345…`) e se o candidato estava **presente** e **corresponde ao
plano**, como registrado. Registros parecidos continuam separados.

**Filtro de evidências.** Duas listas restringem o que aparece: **Tipo de
evidência** (**Todos**, **Decisões**, **Observações**) e **Relação entre
réplicas** (**Todos**, **Em comum**, **Só na origem**, **Só no destino**).
Uma linha fica se tiver evidências daquele tipo naquela relação. Com
**Relação entre réplicas** em **Todos**, nada é filtrado; com **Tipo de
evidência** em **Todos**, uma linha corresponde se qualquer um dos tipos
tiver a relação escolhida. O filtro também restringe a lista Inspecionar
evidências de cada linha. Ele só oculta linhas e registros; as contagens de
uma linha nunca mudam.

**Exportação de evidências.** **Exportar evidências** produz um documento
JSON exatamente com o que o filtro mostra, registrando o estado de
comparação e o filtro usados, com um link **Baixar a exportação de
evidências**
(`reconciliation-candidate-leaderboard-evidence-export.json`). Nada é
enviado. **Comparar evidências exportadas** abre a
[Comparação de exportações de evidências](#comparação-de-exportações-de-evidências).

**Importar exportação de evidências.** Cole uma exportação (sua ou de um
par) e clique em **Importar evidências** para ver o estado de comparação e
as contagens de candidatos, decisões e observações dela. Uma colagem
inválida é recusada e o resumo anterior fica. **Limpar evidências
importadas** o dispensa. Isso não afeta a tabela acima.

A página lê seu arquivo uma vez, quando abre; reabra-a para ver registros
novos. O arquivo do par, o filtro, as linhas abertas e o resumo importado não
são guardados.

## Comparação de exportações de evidências

`/evidence-export-comparison` compara duas exportações de evidências entre
si — por exemplo a da semana passada com a de hoje, ou a sua com a de um
par. Não lê seu arquivo nem afeta a classificação.

Cole os dois documentos em **Exportação de evidências de origem** e
**Exportação de evidências de destino** e clique em **Comparar evidências**.
Um lado inválido é recusado sozinho; o outro lado fica. **Limpar
comparação** esvazia a página.

- **Estado da comparação** e **Filtro** mostram o estado de comparação e o
  filtro registrados em cada documento, e se são iguais.
- Três tabelas — **presença de candidatos**, **evidências de decisão** e
  **evidências de observação** — contam, cada uma, Só na origem, Em comum e
  Só no destino, e nunca são combinadas.
- **Inspecionar registros** (depois **Ocultar registros**) lista os
  registros por trás das contagens de uma tabela. Num registro de decisão
  ou de observação, **Inspecionar identidade** mostra os campos que o
  identificam:

| Registro | Campos de identidade |
|---|---|
| Decisão | `decided`, `candidate`, `decision`, `decidedAt` |
| Observação | `candidate`, `decision`, `planIdentity`, `candidatePresent`, `candidateType`, `candidateMatchesPlan`, `observedAt` |

**Pareamento explícito de registros.** Para comparar dois registros
específicos, escolha um registro de origem e um de destino (de qualquer
partição) para decisões ou observações e clique em **Adicionar par**;
**Remover** tira um par. Nada é pareado automaticamente, e o mesmo par pode
ser adicionado duas vezes. Em **Diferenças entre registros pareados**, cada
**Par de decisões *N*** ou **Par de observações *N*** mostra quantos campos
de identidade diferem (ou **Sem diferenças**); **Inspecionar diferenças**
os nomeia, ou diz **Idênticos em todos os campos nomeados.** Nunca diz qual
lado está certo.

Nada nesta página é guardado nem enviado para lugar nenhum; recarregar a
apaga.
