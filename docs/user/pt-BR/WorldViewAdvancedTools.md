<!-- translation-of: docs/user/WorldViewAdvancedTools.md source-hash: a22a2e4bd16629ee -->
# Visão do mundo: ferramentas avançadas

<!-- languages -->
[English](../WorldViewAdvancedTools.md) · [Deutsch](../de/WorldViewAdvancedTools.md) · [Español](../es/WorldViewAdvancedTools.md) · [Français](../fr/WorldViewAdvancedTools.md) · [Bahasa Indonesia](../id/WorldViewAdvancedTools.md) · [日本語](../ja/WorldViewAdvancedTools.md) · [한국어](../ko/WorldViewAdvancedTools.md) · **Português (Brasil)**
<!-- /languages -->

Esta página trata das partes da [Visão do mundo](03-WorldView.md) que só
aparecem quando você marca **Mostrar ferramentas avançadas** no fim do
painel lateral. Elas servem às redes por trás do Mundo: onde uma
construção está posicionada, onde está armazenada e o que outras pessoas
anunciaram por perto.

Você não precisa de nenhuma delas para andar, construir, remixar ou
compartilhar um link. A marcação fica guardada neste dispositivo e não
muda nada para mais ninguém.

**Com as ferramentas avançadas, você tem:**

| Ferramenta | Onde fica | Para que serve |
|---|---|---|
| [Inspecionar](#inspecionando-um-bloco--ou-uma-estrutura-posicionada) | Clique num bloco ou numa estrutura posicionada | Ver o que é e de onde veio |
| [Câmera e edição](#câmera-e-edição) | Uma linha no cabeçalho do painel | Ver em que construção a sua próxima mudança se aplica |
| [Sobre esta construção, e Posicionamento](#informações-e-posicionamento-da-construção) | Embaixo do cabeçalho, depois de um clique | Os dados de uma construção e onde ela fica |
| Coordenadas e busca por **Local** | Sobre a visão, e em **Buscar** | Encontrar coisas pela posição X/Y/Z |
| [Encontros no Mundo](#encontros-no-mundo--publicações-e-avatares-que-seus-pares-estão-compartilhando) | **Por perto**, em Explorar | O que as pessoas conectadas compartilham |
| [Nomes de lugares](#nomes-de-lugares-por-perto--descobrindo-declarações-de-qualquer-pessoa) | **Por perto**, em Explorar | Nomes que outras pessoas deram aos lugares em volta |
| [Construções declaradas](#construções-declaradas--construções-de-outras-pessoas-onde-os-editores-dizem-que-elas-ficam) | **Por perto**, em Explorar | Construções anunciadas perto de você, como fantasmas |
| [Meu Mundo compartilhado](#meu-mundo-compartilhado--distribuindo-seu-próprio-snapshot-sem-precisar-de-pares) | Mais abaixo no painel | Os posicionamentos da sua própria construção, a distribuição e os comentários |

As ferramentas avançadas também acrescentam a lista de Mundos que não
puderam ser carregados e, em **Configurações do avatar**, o diagnóstico
de avatares.

## Inspecionando um bloco — ou uma estrutura posicionada

Clique num bloco para abrir o painel **Inspeção**. (Sem as ferramentas
avançadas, um clique só escolhe outro avatar.) Ele mostra:

- que tipo de bloco é;
- a posição e a rotação dele;
- a que Mundo e a que construção ele pertence;
- quem fez esse Mundo.

**Focar bloco** aproxima a câmera do bloco. **Focar Mundo** leva você à
posição inicial do Mundo. **Editar uma cópia** faz uma cópia sua do Mundo
e a abre no Editor; o original fica como está.

Clicar num chão vazio dentro de um Mundo abre o mesmo painel, com a
posição e o Mundo mas sem dados de bloco. Ele também tem **Editar uma
cópia**, então você pode copiar um Mundo clicando em qualquer lugar dele.

Uma **estrutura posicionada** é uma construção inteira colocada num Mundo
pelo Editor (veja
[Instâncias de estrutura](02-TheEditor.md#instâncias-de-estrutura-uma-referência-viva)).
Clique numa e o painel mostra a construção a que ela se refere: título,
posição e rotação, altura do chão e o Mundo onde ela está. Aqui você não
pode movê-la. Há dois botões:

- **Abrir origem** abre no Editor a construção a que ela se refere. Cada
  cópia dessa estrutura, onde quer que esteja posicionada, mostra o que
  você mudar lá.
- **Editar uma cópia** faz em vez disso uma cópia sua dessa construção, e
  deixa sem mudanças o original e cada cópia posicionada.

Todo **Editar uma cópia** da Visão do mundo faz a mesma coisa; veja
[Editar uma cópia](03-WorldView.md#editar-uma-cópia--levando-algo-para-o-editor).

## Câmera e edição

O cabeçalho mostra uma linha assim:

```
Câmera: Castelo da Alice · Editando: Castelo do Bob
```

- **Câmera** é o que você está olhando. Voar até um Mundo, ou clicar em
  **Focar** ou **Ir**, muda a câmera.
- **Edição** é a construção em que a sua próxima mudança se aplica: um
  marco, uma região, os dados dela ou a publicação. Clicar num bloco ou
  num posicionamento, ou em **Selecionar** num resultado de busca, muda a
  edição sem mover a câmera.

Em geral as duas são a mesma, porque **Focar** muda as duas. Elas são
diferentes quando você selecionou uma construção e está olhando outra, ou
quando duas construções estão exatamente no mesmo ponto: focar a segunda
não move a câmera, mas a linha mostra que agora você edita a outra. Olhar
em volta nunca muda o que você edita; só selecionar muda.

**Ir** e **Focar** são a mesma coisa com dois nomes: os dois movem a
câmera. Se também mudam o que você edita depende do painel (em
[Buscar](03-WorldView.md#buscar--quais-publicações-correspondem-a-isto),
Focar muda).

## Informações e posicionamento da construção

Clique num bloco, num chão vazio ou numa estrutura posicionada e dois
painéis se abrem embaixo do cabeçalho, para a construção em que você
clicou:

- **Sobre esta construção**: título, descrição, tags, licença, status,
  autor e de que ela é remix. **Editar metadados** muda o título, a
  descrição, a licença e quem pode posicioná-la.
  De uma descrição longa aparece aqui o começo; **Ler mais** abre ela
  inteira num painel mais largo ao lado (de baixo, no celular), com o Mundo
  ainda à vista. **Esc** ou **✕** fecha.
  Uma construção publicada mostra também **💬 Comentários**: eles abrem no
  mesmo painel, embaixo da descrição, onde você lê e deixa os seus, como no
  cartão dela em **Explorar**.
- **Posicionamento**: onde a construção fica no Mundo, em **unidades do
  Mundo**. São as coordenadas do próprio ForkBuild, não GPS; uma unidade
  do Mundo é um metro. **Focar** leva você até lá. **Mover** abre **Mover
  posicionamento**, onde você digita novos valores de X, Y e Z ou empurra
  a construção 1, 10 ou 100 unidades. **Mover para seu lugar na grade**
  preenche o lugar próprio da construção na grade do Mundo, onde as
  construções são posicionadas ao serem publicadas; clique em **Mover**
  para ir até lá. **Remover do Mundo** tira este posicionamento.

São dois painéis porque *o que* uma construção é e *onde* ela fica são
coisas diferentes. Mover um posicionamento nunca muda a construção, e
mudar a construção nunca a move.

### Posição no mundo

Para levar uma construção de volta ao seu lugar próprio na grade do Mundo
(uma publicada de 12 a 17 de outubro de 2026 foi posicionada, em vez
disso, em volta da praça do desafio), abra **Mover posicionamento**,
clique em **Mover para seu lugar na grade** e depois em **Mover**. Depois
envie-a de novo com **Distribuir** em **Meu Mundo compartilhado**, para que
outros dispositivos também a movam.

Se outra construção já está exatamente onde você vai movê-la, **Mover
posicionamento** avisa e lista o que está lá antes de você confirmar.
Dividir um ponto é permitido: uma cena de pátio e o prédio em volta podem
ficar no mesmo lugar. O ForkBuild só garante que você saiba.

### Posicionamentos que não são seus

Quando outra pessoa posicionou uma construção, o painel Posicionamento diz
**🔒 Posicionado por &lt;nome&gt;: você pode ver este posicionamento, mas
não movê-lo.**, e **Mover** fica desativado. Você ainda pode focá-la,
inspecioná-la e usar **Editar uma cópia** para construir a partir dela. Só
onde ela fica é coisa dessa pessoa.

### Construções aqui

Quando o painel Posicionamento diz que outras construções dividem este
ponto, clique em **Ver** para abrir **Construções aqui**: uma lista de todas
as construções nesse ponto, cada uma com um botão **Focar**. Construções
despublicadas ficam de fora.

### Por que posso posicionar construções de outras pessoas?

Um prédio de verdade não pode ser levantado e posto em outro lugar, então
pode parecer estranho que você possa posicionar qualquer construção
publicada onde quiser. Mas uma construção publicada não é um objeto físico
único. É um conteúdo fixo, reconhecido pelo hash do conteúdo, como um
arquivo. Um **posicionamento** é uma anotação separada e assinada que diz
"mostre esta construção aqui". Ele aponta para a construção; não a copia.
Uma construção pode ter muitos posicionamentos, e cada um mostra
exatamente o mesmo conteúdo.

Então posicionar a construção de outra pessoa nunca move nem muda a dela:

- **O posicionamento dela fica onde ela o colocou.** Só ela pode movê-lo
  (veja
  [Posicionamentos que não são seus](#posicionamentos-que-não-são-seus)).
- **O seu posicionamento é assinado por você.** Ele só diz onde *você*
  mostra a construção dela.
- **A construção mantém o autor e a história.** Continua sendo exatamente
  o que foi publicado, e qualquer pessoa pode conferir isso pelo hash e
  pela assinatura.

Não existe um mapa central que diga de quem é cada terreno. Cada Mundo
mostra os posicionamentos que aceitou. Por isso uma construção que alguém
anuncia perto de você só aparece como fantasma até você escolher
**Aceitar posição** (veja
[Construções declaradas](#construções-declaradas--construções-de-outras-pessoas-onde-os-editores-dizem-que-elas-ficam)).
Ninguém pode colocar uma construção no seu Mundo sem a sua permissão.

Alguns motivos para posicionar uma construção que você não fez:

- **Fazer curadoria**, como um Mundo galeria com construções de que você
  gosta.
- **Montar uma cena**, como colocar o castelo de um amigo ao lado da sua
  vila.
- **Usá-la do jeito que está.** Posicione quando quiser sem mudanças, e
  use
  [Editar uma cópia](03-WorldView.md#editar-uma-cópia--levando-algo-para-o-editor)
  quando quiser mudá-la.

Quem não quiser isso pode escolher **Só eu posso posicioná-lo** ao
publicar (veja
[Escolhendo quem pode posicioná-lo](04-PublishingAndForking.md#escolhendo-quem-pode-posicioná-lo)).
Você ainda pode encontrar e olhar a construção, e remixá-la se a licença
permitir, mas não posicioná-la.

### Por que duas construções podem ficar no mesmo ponto?

Dois prédios de verdade não podem ficar no mesmo lugar. No ForkBuild
podem, porque um posicionamento não ocupa terreno. É só uma anotação
assinada que diz "mostre esta construção aqui", e duas anotações podem
apontar para o mesmo ponto.

O ForkBuild permite isso de propósito:

- **Ninguém distribui terreno.** Nenhum servidor central decide quem
  chegou primeiro a um ponto, e o ForkBuild nunca escolhe um vencedor
  entre dois posicionamentos assinados. Os dois continuam válidos.
- **Cada dispositivo conhece posicionamentos diferentes.** Um ponto
  ocupado no dispositivo do seu amigo pode ainda estar vazio no seu até os
  posicionamentos dele chegarem a você. Uma regra rígida de "uma construção
  por ponto" daria respostas diferentes em dispositivos diferentes, então o
  ForkBuild não finge ter uma.
- **Às vezes você quer isso.** Uma cena de pátio dentro de um prédio, ou
  uma versão antiga mostrada no lugar da nova, pertencem ao mesmo ponto.

Isso não quer dizer que qualquer um possa amontoar coisas nas suas
construções:

- **Você é avisado antes.** **Mover posicionamento** lista o que já está
  num ponto antes de você confirmar, e nunca move a sua construção para
  outro lugar sem avisar (veja [Posição no mundo](#posição-no-mundo)).
- **Nada de duplicatas por acidente.** **Adicionar posicionamento aqui**
  recusa quando já há um posicionamento exatamente onde você está.
- **A declaração de outra pessoa é só um fantasma.** Uma posição anunciada
  por alguém que não é o editor da construção só aparece como um fantasma
  transparente, e nunca num ponto onde este dispositivo já conhece um
  posicionamento real (veja
  [Construções declaradas](#construções-declaradas--construções-de-outras-pessoas-onde-os-editores-dizem-que-elas-ficam)).
- **Só o dono pode mover ou remover um posicionamento** (veja
  [Posicionamentos que não são seus](#posicionamentos-que-não-são-seus)).

O ForkBuild só confere construções exatamente no mesmo ponto. Duas
construções um pouco afastadas cujos blocos por acaso se tocam não são
apontadas. Para os motivos desse projeto, veja
[Overlap Is A Fact; Collision Is A Policy Decision](../../principles/placement.md#overlap-is-a-fact-collision-is-a-policy-decision-0225)
(em inglês) e as regras que vêm depois.

### Posicionar ou remixar

As duas coisas põem a construção de outra pessoa num Mundo seu, mas são
diferentes:

| | Posicionar | Remixar (ou Editar uma cópia) |
|---|---|---|
| O que é criado | Um posicionamento: uma pequena anotação assinada de onde mostrar a construção | Uma construção nova, com ids novos, que é sua |
| A construção | O mesmo Mundo compartilhado, como foi publicado | Uma cópia sua, com uma anotação que aponta para o original |
| Você pode mudar os blocos? | Não | Sim, no Editor |
| Quem é o autor | O editor original | Você, com o original registrado como pai |
| Controlado por | A opção **Quem pode posicioná-lo** do editor | A licença |
| Ao publicar | Nada novo é publicado | Cria um Mundo compartilhado novo com o seu nome |

Posicionar é como fazer um link para um arquivo; remixar é como fazer uma
cópia sua para mudar. Quem escolheu **Só eu posso posicioná-lo** ainda
pode permitir remixes pela licença, e um remix é seu para posicionar onde
quiser.

## Encontros no Mundo — publicações e avatares que seus pares estão compartilhando

**Encontros no Mundo** é um grupo de **Por perto**, em Explorar. É um
pequeno mapa à parte (não o Mapa do mundo) que mostra o que os seus
[pares conectados](07-PeerConnectionsAndFriends.md) contaram a você:

- **publicações** posicionadas por perto (veja
  [Publicações e evidências externas](09-PublicationsAndEvidence.md));
- os **avatares** de outras pessoas;
- um marcador para você.

Até um par conectado compartilhar algo, o grupo mostra **Ainda não há
nada para encontrar aqui.**

Clique num marcador para inspecioná-lo:

- Uma **publicação** mostra título, editor, se está assinada, posição e
  quantas âncoras e posicionamentos de Snapshot tem.
- Um **avatar** mostra nome, dono e posição.

Se mais de um par oferece a mesma coisa, **Escolher fonte** deixa você
escolher de quem é a cópia que vai olhar. Nada aqui move a sua câmera nem
muda nada.

### Material e verificação

Selecionar uma publicação mostra mais duas linhas:

- **Material**: o conteúdo pode ser carregado? **Available** (disponível)
  ou **Unavailable** (indisponível).
- **Verificação**: o conteúdo bate com o que foi declarado sobre ele?
  **Verified** (verificado) ou **Unverifiable** (não verificável).

O conteúdo que já está neste dispositivo carrega e é conferido na hora. O
que um par só mostrou a você costuma aparecer como **Unavailable** /
**Unverifiable** até você procurar com
[Descobrir Mundo compartilhado](#descobrir-mundo-compartilhado--pesquisando-direto-nas-redes-descentralizadas).
Se isso o encontrar no Arweave ou no Nostr, ele é usado aqui também.
Quando encontra mais de um lugar, **Escolher local** deixa você escolher
um; nada é carregado antes disso, e a escolha vale só para esta
publicação.

Uma linha **Origem** diz de onde o conteúdo veio: **Local** (este
dispositivo) ou **Decentralized** (descentralizado: Arweave ou Nostr). É
um fato simples, não uma nota de confiança.

Assim que a publicação de um par mostra **Available**, ela entra em
Explorar e na página do autor como se você a tivesse encontrado lá, e
continua lá depois de recarregar. Nada a marca como encontrada por um par:
o seu próprio dispositivo conferiu o conteúdo, então ela é como qualquer
outra.

### O diálogo Distribuir

Quando este dispositivo tem o conteúdo de uma publicação, um botão
**Distribuir** abre o diálogo **Distribuir**. O mesmo diálogo abre a partir
de
[Meu Mundo compartilhado](#meu-mundo-compartilhado--distribuindo-seu-próprio-snapshot-sem-precisar-de-pares)
para a sua própria construção. Para o que cada rede faz, veja
[Distribuindo seu trabalho](Distribution.md).

No alto há duas opções que valem para o diálogo inteiro. As duas começam
nas suas preferências salvas:

- **Armazenamento**: para onde o conteúdo vai. **Arweave**, **IPFS (Kubo
  local)**, **IPFS (pinning remoto)** ou, de forma experimental, **Steem**
  ou **Blurt** (veja [Steem](11-EvidenceAndStorage.md#steem) e
  [Blurt](11-EvidenceAndStorage.md#blurt)). O pinning remoto pede um
  endpoint e uma credencial toda vez e nunca os guarda. Só aparece o
  armazenamento que este dispositivo pode de fato usar.
- **Substrato de anúncio / descoberta**: onde ele é anunciado para que
  outros o encontrem. **Arweave**, **Blurt**, **Nostr** ou **Steem**.

O diálogo pode enviar duas coisas:

- a **Declaração assinada**, que diz que você publicou isto, e
- o **Snapshot**, uma cópia da própria construção (veja
  [Snapshot local](09-PublicationsAndEvidence.md#snapshot-local)).

Quando as duas podem ser enviadas, o botão principal **Distribuir** as
envia uma depois da outra, porque as duas podem pedir assinatura à mesma
extensão de carteira. Cada uma tem sua seção com o próprio resultado, e a
falha de uma nunca esconde nem interrompe a outra. **Distribuir só a
Declaração assinada** e **Distribuir só o Snapshot** enviam só uma, por
exemplo para tentar de novo a metade que falhou. Quando só uma pode ser
enviada, o botão dela é simplesmente **Distribuir Declaração assinada** ou
**Distribuir Snapshot**.

Para assinar você precisa de uma extensão do navegador: uma carteira
Arweave (como a Wander) para o Arweave, e um assinador Nostr (como o
nos2x) para o Nostr. Sem ela, a seção diz "Não foi possível concluir a
distribuição." e o motivo.

- A seção **Declaração assinada** mostra **Ausente** em **Material** e
  **Descoberta** até ser enviada. Depois mostra o id da publicação, onde
  está o material e o id do anúncio, com uma linha por
  [relay do Nostr](10-NetworkSettings.md#relays-do-nostr).
- A seção **Snapshot** mostra um **Hash do conteúdo**, um **Localizador** e
  um id de **Anúncio**. "Sem anúncio" quer dizer que a cópia foi guardada
  mas não anunciada; é um resultado parcial, não um erro. Uma falha de
  verdade diz "Não foi possível concluir a distribuição do Snapshot."

Fechar o diálogo não perde nada: abra de novo e os resultados continuam
lá. Eles são esquecidos quando você seleciona outra publicação ou sai da
página.

## Descobrir Mundo compartilhado — pesquisando direto nas redes descentralizadas

Dentro de Encontros no Mundo, **Descoberta de Mundos compartilhados** abre
o painel **Descobrir Mundo compartilhado**. Ele não precisa de par nem de
marcador. Digite um **id do Mundo compartilhado**, mantenha a **tag de
descoberta** (ela começa com a tag do próprio ForkBuild, que quase sempre
está certa) e clique em **Descobrir Mundo compartilhado**. O ForkBuild
pergunta direto ao Arweave e ao Nostr.

A linha **Descoberta** mostra então **Unavailable** (indisponível),
**Resolved** (resolvido) ou **Ambiguous** (ambíguo: mais de uma pista para
o mesmo local). Depois de resolvido, mostra as mesmas linhas Material,
Origem e Verificação de cima.

Hoje ele só resolve as suas próprias publicações: as que você assinou e
ainda tem neste dispositivo. Pense nele como "a minha construção está
mesmo lá fora, inteira?", não como uma busca no trabalho de todo mundo.

Quando um resultado mostra **Verified**, **Selecionar Mundo
compartilhado** o marca como aquele com que você está trabalhando, numa
nota embaixo. É só isso que ele faz: não envia nem confere nada de novo.
A marca fica até você selecionar outro ou sair da página. Fechar o painel
mantém o que você digitou e encontrou.

## Nomes de lugares por perto — descobrindo declarações de qualquer pessoa

**Nomes de lugares**, um grupo de **Por perto** em Explorar, mostra os
nomes que as pessoas publicaram para as Regiões do Mundo em volta de você.
Ele os procura no Nostr, então não precisa de um par conectado. Começa
recolhido, porque esses nomes ainda não foram conferidos.

Cada linha mostra o nome, mais ou menos onde fica, quem deu o nome e
quando:

- **Navegar** move a sua câmera até essa região, como **Ir**. Não renomeia
  nem aceita nada.
- **Adotar** guarda o nome neste dispositivo, depois da mesma conferência
  de assinatura de um nome vindo de um par conectado (veja
  [Recebendo uma de um par](09-PublicationsAndEvidence.md#recebendo-uma-de-um-par)).
  O botão passa a dizer **✓ Já salvo**.

Quando duas pessoas deram nome ao mesmo terreno, os dois nomes aparecem.
O ForkBuild nunca escolhe um vencedor, e adotar um não quer dizer que ele
esteja mais certo. Se a busca falhar, um aviso diz isso e os nomes que
você já viu continuam. Para publicar um nome você mesmo, veja
[Dando nome a um lugar](09-PublicationsAndEvidence.md#dando-nome-a-um-lugar).

## Construções declaradas — construções de outras pessoas, onde os editores dizem que elas ficam

Enquanto você anda, o ForkBuild baixa os Snapshots anunciados perto de
você (veja
[Meu Mundo compartilhado](#meu-mundo-compartilhado--distribuindo-seu-próprio-snapshot-sem-precisar-de-pares)).
Um anúncio pode dizer onde a construção fica, mas isso é só uma
**declaração**: confiar nela às cegas deixaria qualquer um pôr uma
construção em cima da sua. Por isso uma construção declarada aparece como
**fantasma**, com os blocos transparentes no ponto declarado, e nunca vira
sozinha um posicionamento real.

**Uma exceção não precisa de clique.** Quando os editores distribuem o
próprio Snapshot, o anúncio leva o **posicionamento assinado** deles.
Assim que este dispositivo conhece o Mundo compartilhado dessa construção
(ele está em Explorar, ou você clica em **Verificar**), o ForkBuild confere
se o posicionamento foi assinado com a chave desse Mundo compartilhado. Se
foi, a construção aparece sólida, exatamente onde eles a puseram. Continua
sendo o posicionamento deles, então você não pode movê-lo nem removê-lo, e
se eles o moverem e distribuírem de novo, ele se move para você também.
Uma posição assinada por qualquer outra pessoa continua fantasma.

Um fantasma só é desenhado quando:

- está perto de você (a sua célula do mapa ou as vizinhas, umas 1.000
  unidades para cada lado), e some de novo quando você se afasta;
- o conteúdo foi baixado e bate com o hash do conteúdo;
- este dispositivo ainda não tem um posicionamento dessa construção
  (quando tem, a construção real aparece no lugar);
- nada que este dispositivo conhece já está exatamente nesse ponto.

Você não pode selecionar, inspecionar, editar nem copiar um fantasma.
Construções muito grandes só são desenhadas em parte (os primeiros milhares
de blocos).

Cada fantasma tem uma linha em **Construções declaradas**, o mais próximo
primeiro: título, distância, posição e "declarada por …". O título e o
autor vêm da própria construção e são tão não conferidos quanto a posição.
Cada linha tem:

- **Navegar**: move a câmera até o ponto declarado. Nada mais muda.
- **Verificar**: aparece enquanto este dispositivo não tem o Mundo
  compartilhado assinado da construção. Procura no Nostr e no Arweave e
  confere se está assinado corretamente, se é o Mundo compartilhado desta
  construção e se aponta exatamente para o conteúdo que o fantasma mostra.
  Se tudo bater, ele entra em Explorar e a linha diz "assinado por *nome*
  (chave did:key:…)". Se não, a linha diz por quê: nada foi anunciado (o
  editor pode ter distribuído só o Snapshot), nenhuma cópia estava
  assinada corretamente, ou ele aponta para outro conteúdo. Verificar não
  aceita a posição, mas se o posicionamento assinado do próprio editor veio
  junto, a construção agora aparece sólida onde ele a pôs.
- **Aceitar posição**: o único jeito de confiar numa declaração. Ele
  posiciona a construção no ponto declarado com um posicionamento *seu*,
  assinado por você, e daí em diante ela é uma construção normal do seu
  Mundo. Só funciona quando este dispositivo tem o Mundo compartilhado
  assinado e conferido do editor, e só se ele apontar exatamente para o
  conteúdo que o fantasma mostra. Você o obtém com **Verificar**, quando
  [compartilham o Mundo com você](04-PublishingAndForking.md#compartilhando-com-pares-conectados),
  ou quando o
  [Encontro](#encontros-no-mundo--publicações-e-avatares-que-seus-pares-estão-compartilhando)
  de um par mostra **Available**. Também fica desativado se o editor
  escolheu **Só eu posso posicioná-lo** (veja
  [Escolhendo quem pode posicioná-lo](04-PublishingAndForking.md#escolhendo-quem-pode-posicioná-lo)).
  Quando está desativado, a linha diz por quê.

  **O que "verificado" quer dizer.** A construção é exatamente o conteúdo
  de um Mundo compartilhado assinado com a chave mostrada. Isso não prova
  quem tem essa chave (qualquer um pode criar uma e se chamar "bob"), nem
  prova a posição, que continua só declarada. Aceitar posição funciona
  também com chaves que você não conhece; confiar numa é decisão sua.
- **Ocultar**: tira esse fantasma e a linha dele até você sair da Visão do
  mundo. Nada é denunciado nem apagado.

## Meu Mundo compartilhado — distribuindo seu próprio Snapshot, sem precisar de pares

**Meu Mundo compartilhado**, mais abaixo no painel, embaixo de Buscar e
Avatar, trata da construção que você tem aberta. Ele mostra título e autor
quando ela está publicada, e funciona havendo ou não mais alguém por
perto.

Na frente ficam **Distribuir** e o link de compartilhamento.
**Distribuir** abre o mesmo [diálogo Distribuir](#o-diálogo-distribuir) de
Encontros no Mundo, mas para a sua própria construção. Até a construção
ser publicada, o botão fica desativado, com uma nota dizendo que ainda não
há nada para enviar. O pinning remoto no IPFS e a ancoragem no Bitcoin ou
no Base não ficam aqui: eles precisam antes de uma conta ou de uma
carteira, então ficam na página Publicações (veja
[Publicação no IPFS](11-EvidenceAndStorage.md#publicação-no-ipfs) e
[O fluxo de âncora no Bitcoin](11-EvidenceAndStorage.md#o-fluxo-de-âncora-no-bitcoin)).

**Mais ▾** guarda as ações menos usadas:

- **Exportar Snapshot** e **Verificar correspondência do Snapshot**. Os
  resultados ficam no painel depois que o menu fecha.
- **Ferramentas de diagnóstico** (veja [mais abaixo](#ferramentas-de-diagnóstico)).
- **Despublicar…** pergunta uma vez e depois tira o Mundo do catálogo. Os
  posicionamentos, a construção e as cópias que você já enviou ficam; as
  cópias enviadas não podem ser recolhidas, mas este dispositivo lembra o
  que você despublicou, para que Explorar não as liste de novo.
  **Cancelar** volta atrás.

Quando o Mundo aberto foi publicado por outra pessoa (um par o
compartilhou com você, por exemplo), o painel se chama **Mundo
compartilhado** e não tem **Despublicar** nem **Distribuir**: só o editor
de um Mundo pode fazer isso. Todo o resto continua, inclusive os
comentários.

**▸ Comentários (N)** abre os comentários da construção; o número continua
atualizado mesmo recolhido. Você pode escrever depois que a construção
estiver publicada. Quem pode comentar é explicado em
[Comentários](09-PublicationsAndEvidence.md#comentários).

### Posicionamentos

**Posicionamentos (N)** lista todos os lugares onde este Mundo
compartilhado fica: posição, revisão e, quando se sabe, dono. Uma
construção pode ficar em mais de um lugar, e todo posicionamento que este
dispositivo conhece é listado.

- **Mover…** abre **Mover posicionamento** para esse posicionamento, com o
  aviso sobre construções que já estão no novo ponto.
- **Remover…** pergunta uma vez e depois tira esse posicionamento do
  Mundo. A construção e os outros posicionamentos ficam. Sem nenhum
  posicionamento, a construção simplesmente não aparece em lugar nenhum
  até você posicioná-la de novo.

Os dois ficam desativados num posicionamento feito por outra pessoa.

**Adicionar posicionamento aqui**, embaixo da lista, posiciona a mesma
construção *de novo* onde o seu avatar está (ou embaixo da câmera, sem
avatar). Não move um posicionamento existente nem faz uma cópia: continua
sendo um Mundo compartilhado só (veja
[Posicionar ou remixar](#posicionar-ou-remixar)). Ele diz onde
posicionou a construção e quantos posicionamentos ela tem agora. Se já há
um posicionamento exatamente onde você está, ele pede que você se mova
antes, para que dois cliques não empilhem dois no mesmo ponto.

### Ferramentas de diagnóstico

O ForkBuild encontra Snapshots sozinho enquanto você anda (veja abaixo).
**Ferramentas de diagnóstico**, em **Mais**, faz os mesmos passos à mão,
para quando isso não encontra o que você espera. Cada passo é um clique
próprio, e nada roda sozinho:

1. **Descobrir Snapshots** lista tudo o que foi anunciado com a tag
   compartilhada do ForkBuild. Funciona sem pares e sem uma construção
   publicada sua.
2. **Resolver o Snapshot selecionado** confere se o que você escolheu pode
   ser obtido.
3. **Atribuir o Snapshot selecionado** confere se ele bate com o hash do
   conteúdo deste Mundo compartilhado. **Materializar o Snapshot
   selecionado** o guarda neste dispositivo. Você pode fazer qualquer um
   dos dois, em qualquer ordem.
4. **Posicionar o Snapshot materializado** e depois **Registrar o Snapshot
   posicionado** o acrescentam ao Mundo em que você está, sem recarregar.

**Usar a posição declarada**, a qualquer momento depois de escolher um,
usa a posição que o próprio Snapshot declara, se tiver uma.

**O que acontece sozinho.** Enquanto você anda, o ForkBuild procura
Snapshots de vez em quando, do mesmo jeito que **Descobrir Snapshots**. Ele
olha o que este dispositivo tem, o que pares conectados compartilham só
por estarem conectados e o que o Nostr informa. Um que passa na
conferência segue os mesmos passos sozinho e aparece como marcador de
[Encontros no Mundo](#encontros-no-mundo--publicações-e-avatares-que-seus-pares-estão-compartilhando);
não há lista nem notificação à parte.

Ele só baixa Snapshots perto de você: os posicionados, ou anunciados como
posicionados, na sua célula do mapa ou nas vizinhas (umas 1.000 unidades
para cada lado), mais os 20 mais novos que não dizem onde ficam. Os mais
distantes são baixados quando você chega perto. No máximo quatro baixam
ao mesmo tempo. Um que este dispositivo já tem é lido do próprio
armazenamento, depois da mesma conferência de conteúdo.

## E agora?

Volte para a **[Visão do mundo](03-WorldView.md)**, ou siga para
**[Distribuindo seu trabalho](Distribution.md)** para ver todos os lugares
para onde uma construção pode ser enviada.
