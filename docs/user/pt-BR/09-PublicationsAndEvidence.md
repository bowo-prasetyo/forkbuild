<!-- translation-of: docs/user/09-PublicationsAndEvidence.md source-hash: 2c5fc47e7e82ef51 -->
# 09 — Publicações e evidências externas

<!-- languages -->
[English](../09-PublicationsAndEvidence.md) · [Deutsch](../de/09-PublicationsAndEvidence.md) · [Español](../es/09-PublicationsAndEvidence.md) · [Français](../fr/09-PublicationsAndEvidence.md) · [Bahasa Indonesia](../id/09-PublicationsAndEvidence.md) · [日本語](../ja/09-PublicationsAndEvidence.md) · [한국어](../ko/09-PublicationsAndEvidence.md) · **Português (Brasil)**
<!-- /languages -->

> **Em parte experimental.** A página Publicações é um recurso comum: a
> lista e os status, remover publicações que não podem ser usadas,
> anunciar no Nostr ou no Arweave, guardar no IPFS ou no Arweave, ancorar
> no Arweave, e as guias **Snapshot** e **Descentralização e evidências**
> de um cartão. O resto é **Experimental**: funciona, mas pode mudar ou
> ser removido numa versão futura, e o que produz pode não ser aproveitado
> depois. A página marca cada uma dessas partes com um selo
> **Experimental** (**Exp.** numa guia): todo tipo de ancoragem exceto no
> Arweave, as carteiras e seus passos de Bitcoin e Base, o Steem, o Blurt,
> o pinning remoto no IPFS, as guias **Posicionamentos e IPFS** e
> **Histórico**, e o painel inteiro **Ferramentas de carteira, arquivo e
> editor**. Os guias [11](11-EvidenceAndStorage.md) e
> [12](12-ArchiveAndLeaderboards.md) dizem quais das seções deles são
> experimentais. Construir, salvar, publicar no Repositório, bifurcar,
> identidades e pares não dependem de nada disso.

Nada disto é necessário para usar o ForkBuild. Pule se você só quer
construir, publicar e explorar.

A página **Publicações** é uma camada mais técnica que o Repositório. O
Repositório trata de Documentos e Mundos; a página Publicações trata de
**declarações assinadas**, como "eu projetei esta estrutura" ou "eu chamo
este lugar de X", e da profundidade opcional que você pode dar a uma
declaração:

- **Este guia** — de onde vêm as declarações, a página Publicações,
  [Comentários](#comentários) e [Snapshot local](#snapshot-local) (o que seu
  dispositivo guarda).
- **[Configurações de rede](10-NetworkSettings.md)** — gateways, relays,
  provedores e servidores de conexão entre pares. Não é experimental, e é
  útil para todos.
- **[Evidências e armazenamento](11-EvidenceAndStorage.md)** — evidências
  externas (Bitcoin, Base, Arweave, Steem, Blurt), os fluxos de carteira, os
  Posicionamentos de Snapshot, a publicação no IPFS, o Steem e o Blurt.
- **[Arquivo e classificações](12-ArchiveAndLeaderboards.md)** — o arquivo
  durável de observações, as referências, as conquistas, os rótulos de
  editores e as páginas de classificação.

## Dois sentidos de "publicar"

| | **Publicar** (Repositório) | **Página Publicações** |
|---|---|---|
| O que compartilha | Um Documento ou Mundo | Um registro assinado: um Mundo compartilhado, a autoria de uma estrutura ou um nome de lugar |
| Onde você vê | Repositório, página do autor, Visão do mundo | A página **Publicações** |
| O que você faz com ele | Abrir, explorar, bifurcar | Verificar, buscar o conteúdo, distribuir e ancorar |
| Guia | [Publicar e bifurcar](04-PublishingAndForking.md) | Este |

**Publicar** sozinho não coloca um Mundo na página Publicações. **Compartilhar
com pares** coloca: ele assina o Mundo como um **Mundo compartilhado** que
pode viajar até os pares (veja
[Uma criação do Repositório, descentralizada](#uma-criação-do-repositório-descentralizada)).

A página Publicações não tem **Abrir**, **Explorar** nem **Bifurcar**, nem
para um Mundo compartilhado. Ela mostra o registro assinado, não o Mundo.
Para abrir, explorar ou bifurcar um Mundo compartilhado, encontre-o no
Repositório, na página do autor ou na Visão do mundo. Um que você recebeu de
um par aparece lá depois que o conteúdo dele está neste dispositivo. (A
única exceção é **Abrir no Editor** num Mundo compartilhado seu que precisa
ser publicado de novo; veja
[Significado dos status](#significado-dos-status).)

Cada entrada da página Publicações é uma *publicação*, e cada uma é de um de
três tipos:

| Tipo | O que é |
|---|---|
| **Mundo compartilhado** | Um Mundo publicado, como registro assinado que pode viajar entre pares e redes |
| **Atribuição de planta** | Uma declaração de que você projetou uma estrutura |
| **Declaração de nome de lugar** | Um nome para uma Região ou um Marco |

A Visão do mundo, o Editor e o Repositório também chamam o registro assinado
de um Mundo de **Mundo compartilhado**, como em **Meu Mundo compartilhado**,
**Descobrir Mundo compartilhado** e **Voltar ao Mundo compartilhado**.

## O que fica em volta de uma publicação

Uma publicação é só o registro assinado. Todo o resto que você vê no cartão
dela, e em volta dela na Visão do mundo, é algo feito com ela ou ligado a
ela. Nada disso é um tipo de publicação, e só a publicação em si é
obrigatória:

| Termo | Como… | O que é |
|---|---|---|
| **Publicação** | O livro em si | Um registro assinado: um Mundo compartilhado, uma Atribuição de planta ou uma Declaração de nome de lugar. Leva o hash do conteúdo e a assinatura do editor. |
| **Conteúdo** | Onde ficam os exemplares impressos | Os bytes de que trata a publicação, como os blocos de um Mundo. Sempre ficam primeiro neste dispositivo; **Armazenar em …** põe uma cópia no IPFS, no Arweave, no Steem ou no Blurt para que outros possam buscá-la. Veja [Provedor de conteúdo](10-NetworkSettings.md#provedor-de-conteúdo). |
| **Snapshot** | Um exemplar impresso | Uma cópia guardada do conteúdo de uma publicação, como os blocos de um Mundo, que outros podem buscar e conferir com o hash. Veja [Snapshot local](#snapshot-local). |
| **Posicionamento** | Em que estante o exemplar fica | Um registro assinado de onde uma construção fica no Mundo. Um Mundo compartilhado pode ter vários. Veja [Posicionar ou bifurcar](03-WorldView.md#posicionar-ou-bifurcar). |
| **Anúncio / descoberta** | Uma ficha no catálogo da biblioteca | Um pequeno aviso assinado no Nostr, no Arweave, no Steem ou no Blurt dizendo que a publicação ou o Snapshot existe e onde está a cópia, para que pessoas não conectadas a você possam encontrá-lo. Veja [Provedor de anúncio / descoberta](10-NetworkSettings.md#provedor-de-anúncio--descoberta). |
| **Prova / ancoragem** *(Experimental, exceto no Arweave)* | O carimbo de um cartório | O hash do conteúdo gravado numa transação de blockchain (Bitcoin, Base, Arweave, Steem ou Blurt), como evidência de que ele existia naquele momento. Não guarda nem anuncia nada. Veja [Evidências e armazenamento](11-EvidenceAndStorage.md). |
| **Comentários** | As resenhas dos leitores | Comentários que qualquer pessoa que entrou pode anexar a uma publicação, cada um assinado por quem comentou, não pelo editor. Veja [Comentários](#comentários). |

Então você faz uma publicação; depois, se quiser, guarda o conteúdo dela, a
anuncia, a ancora e a posiciona (no caso de um Mundo compartilhado); e
qualquer pessoa pode comentar nela.

## De onde vem uma publicação

Você nunca cria uma declaração na própria página Publicações. Ela lista as
declarações que você fez em outros lugares, as que os pares enviaram a você
e as criações do Repositório que chegaram em forma descentralizada. As
declarações de nomes de lugares também podem ser encontradas direto no
Nostr, sem nenhum par envolvido; veja
[Nomes de lugares por perto](03-WorldView.md#nomes-de-lugares-por-perto--descobrindo-declarações-de-qualquer-pessoa).

### Declarando a autoria de uma estrutura

Abra o painel **Informações** de uma estrutura em **Minhas estruturas**, na
Biblioteca de construção do Editor. Se ela tem identidade de planta (a
maioria das estruturas salvas tem), a seção **Atribuição da comunidade**
oferece:

- **Declarar autoria** — assina, com sua identidade atual, uma declaração de
  que você a projetou. Aparece até você declarar.
- **Exportar atribuição** — salva sua declaração como arquivo que você pode
  entregar a alguém.
- **Publicar na rede** — anuncia sua declaração a todos os pares a que você
  está conectado, o que a põe na página Publicações deles, e na sua.

Depois de publicada, o painel oferece **Distribuir**, para que quem não está
conectado a você também possa encontrá-la. **Distribuir** abre o mesmo
diálogo que o Editor oferece depois que você publica um Mundo, só com a
metade da Declaração assinada (uma declaração de autoria não tem Snapshot):
escolha onde o conteúdo dela fica guardado e onde ela é anunciada, depois
clique em **Distribuir Declaração assinada**. **Agora não** esconde a
oferta; você ainda pode distribuir a declaração depois pelo card dela na
página Publicações (veja [Distribuição](Distribution.md)).

### Dando nome a um lugar

Na Visão do mundo, abra o painel de nomes de uma Região ou Marco e use
**Publicar um nome** (veja
[Lugares geográficos](03-WorldView.md#lugares-geográficos)). Isso anuncia
uma declaração assinada aos seus pares conectados.

Logo depois de publicar, o painel oferece **Distribuir** o nome, para que
quem não está conectado a você também possa encontrá-lo, por exemplo em
[Nomes de lugares por perto](03-WorldView.md#nomes-de-lugares-por-perto--descobrindo-declarações-de-qualquer-pessoa).
Escolha a **Rede** (Arweave, Blurt, Nostr ou Steem; começa no seu
[Provedor de anúncio / descoberta](10-NetworkSettings.md#provedor-de-anúncio--descoberta))
e clique em **Distribuir**, ou em **Agora não** para pular. Você também pode
distribuir qualquer declaração depois: abra **Mais** no painel de nomes e
clique em **Distribuir** ao lado dela em **Todas as declarações**. Publicar
e distribuir continuam sendo passos separados: nenhum faz o outro. Um
sucesso diz em qual rede o nome foi anunciado; uma falha mostra o motivo, na
maioria das vezes a falta da extensão Nostr no navegador ou uma rede que não
está configurada neste dispositivo.

### Recebendo uma de um par

Quando você se conecta a um par (veja
[Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md)), seu
dispositivo recebe tudo o que ele publicou, e não só o que ele publica
enquanto vocês estão conectados. Uma declaração recebida é só um registro
assinado de forma válida: o conteúdo dela não está no seu dispositivo até
você buscá-lo com **Recuperar dos pares** (abaixo).

### Uma criação do Repositório, descentralizada

Um cartão também pode conter um **Mundo compartilhado** — o mesmo tipo de
objeto que uma entrada do Repositório, embalado para viajar de forma
descentralizada. **Compartilhar com pares** no Repositório cria um para os
seus próprios Mundos (veja
[Compartilhando com pares conectados](04-PublishingAndForking.md#compartilhando-com-pares-conectados)).
Depois que você o resolve aqui com **Verificar de novo** ou **Recuperar dos
pares**, ele entra na busca do Repositório, na página do autor e na Visão do
mundo, e continua lá depois de recarregar.

## A página Publicações

Abra **Publicações** na barra superior. Ela lista todas as publicações
assinadas que este dispositivo catalogou, suas ou de um par. No fim, o
painel recolhido **Ferramentas de carteira, arquivo e editor** guarda
ferramentas para a página toda em três guias: **Ancoragem em blockchain**,
**Ferramentas de arquivo** e **Referências e conquistas** (veja os guias
[11](11-EvidenceAndStorage.md) e [12](12-ArchiveAndLeaderboards.md)). O link
para ele na introdução da página, e em qualquer passo que precise antes de
uma carteira observada, o abre para você.

Cada cartão de publicação mostra:

- O nome dela, depois que o conteúdo foi verificado: o título de um Mundo
  compartilhado ou um nome de lugar. Caso contrário, ou numa declaração de
  autoria, o tipo de publicação.
- O tipo de publicação (embaixo do nome, quando há um) e quem a publicou,
  encurtado para os últimos caracteres do ID.
- Um **selo de status** (veja
  [Significado dos status](#significado-dos-status)), calculado de novo
  cada vez que a página carrega ou que você clica em **Verificar de novo**.
- Um resumo de uma linha da declaração: a impressão digital e o declarante
  de uma atribuição, ou um nome de lugar e o declarante.
- **Recuperar dos pares**, enquanto o conteúdo está indisponível
  (desabilitado sem nenhum par conectado). Pede os bytes a cada par
  conectado, um de cada vez, e só os aceita depois que seu dispositivo os
  confere com o hash do conteúdo.
- **Verificar de novo** — calcula o status de novo agora.

Abaixo disso, duas seções recolhidas:

- **Distribuição** — anunciar a publicação, guardar o conteúdo dela e
  ancorá-la. Guardar e ancorar começam, cada um, com um botão para o
  provedor que você salvou em **Configurar** (**Armazenar em IPFS**,
  **Ancorar em Steem**), com todos os outros provedores recolhidos em
  **Outras opções de …**. Sem um provedor salvo que ela possa usar, todas as
  opções aparecem. O Steem, o Blurt e o pinning remoto no IPFS são marcados como
  **Experimental** onde quer que apareçam, assim como todo tipo
  de ancoragem exceto no Arweave. Veja
  [Distribuindo pela página Publicações](#distribuindo-pela-página-publicações)
  e [Evidências e armazenamento](11-EvidenceAndStorage.md).
- **Detalhes**, em quatro guias:

| Guia | O que tem |
|---|---|
| **Snapshot** | [Snapshot local](#snapshot-local): o que este dispositivo guarda e como obtê-lo. |
| **Descentralização e evidências** | [Descentralização](#descentralização-num-relance), a [lista de evidências](11-EvidenceAndStorage.md#a-lista-de-evidências) e os passos das transações no Bitcoin e na Base (Experimental). |
| **Posicionamentos e IPFS** *(Exp.)* | A lista de [Posicionamentos de snapshot](11-EvidenceAndStorage.md#posicionamentos-de-snapshot) e a [Publicação no IPFS](11-EvidenceAndStorage.md#publicação-no-ipfs). |
| **Histórico** *(Exp.)* | **Mostrar linha do tempo entre domínios**: todas as observações de IPFS e Bitcoin desta publicação, em ordem cronológica. |

### Significado dos status

| Selo | Significado |
|---|---|
| **Disponível** | O conteúdo está neste dispositivo agora. |
| **Conteúdo indisponível** | A declaração é genuína, mas o conteúdo ainda não está aqui. Tente **Recuperar dos pares**. |
| **Envelope de publicação inválido** / **Assinatura de publicação inválida** | O registro está malformado, ou não foi assinado de verdade. |
| **O conteúdo não corresponde à sua própria referência** / **Conteúdo inválido** / **Assinatura de conteúdo inválida** | O conteúdo não corresponde ao que a publicação declara. |
| **Falhou em uma verificação específica do domínio** | Bem formada e assinada, mas falha numa verificação específica do tipo dela. |
| **Tipo de publicação não suportado** | Esta versão não sabe exibir este tipo de publicação. |

Eles dizem se o registro confere, não se o projeto ou o nome é bom.

Uma publicação cujo status não seja **Disponível** nem **Conteúdo
indisponível** não pode ser aberta, distribuída nem ancorada, então ela não
ganha um cartão completo. Essas ficam reunidas no fim da página num grupo
recolhido, "*N* publicações que não podem ser usadas", cada uma com o
status, o motivo, **Verificar de novo** e **Remover deste dispositivo**.
Elas também ficam fora de **Ancorar várias publicações**. O motivo mais comum
é uma publicação feita antes de os hashes de conteúdo passarem a ser
SHA-256: só o autor pode corrigir isso, publicando-a de novo.

Se uma delas é **sua** (assinada por uma identidade deste dispositivo) e
falhou só por causa do hash antigo, ela aparece primeiro, com um selo
**Sua**. Em vez de "o autor precisa publicá-la de novo", ela diz como:

| Tipo | Como publicar de novo |
|---|---|
| **Mundo compartilhado** | Publique o Mundo de novo no Editor e depois use **Compartilhar com pares** abaixo dele no Repositório (**Abrir o Repositório**). |
| **Atribuição de planta** | No Editor, abra o painel **Informações** da estrutura, **Assinar de novo para este projeto**, depois **Publicar na rede** (**Abrir o Editor**). |
| **Declaração de nome de lugar** | Na Visão do mundo, abra o painel de nomes do lugar e use **Publicar um nome** de novo. |

Para um Mundo, o cartão vai um passo além quando este dispositivo ainda tem o
próprio registro do que você publicou: ele leva o nome do Mundo (**Meu
Castelo** em vez de **Mundo compartilhado**) e **Abrir no Editor** abre
aquele Mundo, pronto para publicar de novo. O nome e o link vêm do seu
próprio registro, nunca do conteúdo da entrada antiga, que ninguém consegue
verificar. Se o registro sumiu (você despublicou aquele Mundo desde então),
o cartão mostra **Abrir o Repositório**, como acima.

A cópia nova ganha um cartão próprio; depois remova a antiga. A antiga nunca
é aceita, mesmo sendo sua: este dispositivo também guarda conteúdo recebido
de pares, então o hash antigo não prova quais bytes você publicou.

**Remover deste dispositivo** (ou **Remover todas as *N* deste
dispositivo**, no topo do grupo) pede confirmação e depois esquece a
publicação aqui. Não despublica nada nem chega a mais ninguém, e um par
conectado que ainda tenha a publicação pode anunciá-la de novo. Só as
publicações deste grupo podem ser removidas.

### Distribuindo pela página Publicações

**Distribuição → Anúncio / descoberta** tem dois cartões:

- **Publicação** anuncia a própria publicação assinada no **Substrato** que
  você escolher (Arweave, Nostr, Steem ou Blurt; estes dois últimos são
  experimentais). Começa no seu
  [Provedor de anúncio / descoberta](10-NetworkSettings.md#provedor-de-anúncio--descoberta).
- **Snapshot** guarda o conteúdo em **Conteúdo** e o anuncia no próprio
  **Substrato**, que também começa nesse provedor. Para um Mundo, é o
  próprio snapshot do Mundo, anunciado com o lugar onde o editor o
  posicionou quando este dispositivo tem esse posicionamento assinado, como
  faz **Distribuir** na Visão do mundo. Para qualquer outro tipo, é o
  conteúdo da publicação, anunciado só pelo hash. Este dispositivo precisa
  dos bytes: para um Mundo que você não abriu, abra-o na Visão do mundo ou
  obtenha-o de um par antes.

O resultado diz o substrato usado, como **Steem: Anunciada**, e, para um
Mundo, se o posicionamento do editor foi junto. **Não anunciada** quer dizer
que só o anúncio falhou; o conteúdo foi guardado.

## Comentários

Qualquer identidade que entrou pode comentar em qualquer publicação que se
resolve: uma criação do Repositório, uma declaração de autoria ou um nome de
lugar. Não há verificação de dono, exigência de amizade nem moderação.

Você encontra comentários:

- no **Repositório** e nas páginas de autor: o botão **Comentar** em todo
  cartão e linha da lista;
- no painel
  [Meu Mundo compartilhado](03-WorldView.md#meu-mundo-compartilhado--distribuindo-seu-próprio-snapshot-sem-precisar-de-pares)
  da Visão do mundo, na seção **Comentários**;
- num **Encontro no Mundo** selecionado: o botão **Comentar** dele.

Cada um mostra os comentários, do mais antigo para o mais novo, com a
identidade de cada autor. Se você entrou, ganha uma caixa de texto e
**Publicar comentário**; se não, uma nota pedindo para entrar.

Os comentários são permanentes: nada de editar, excluir ou responder.

### Como os comentários viajam

Um comentário postado pelo **Repositório** é salvo no seu dispositivo,
enviado aos pares a que você está conectado e publicado na rede escolhida ao
lado de **Publicar comentário** (Nostr, Arweave, Steem ou Blurt; começa no seu
[Provedor de anúncio / descoberta](10-NetworkSettings.md#provedor-de-anúncio--descoberta)),
para que pessoas que não estavam conectadas possam encontrá-lo. Fechar a
seção (**Ocultar comentários**) descarta o que você tinha digitado sem
postar. Os comentários postados pelo **Meu Mundo compartilhado** ou por
**Encontros no Mundo** da Visão do mundo viajam do mesmo jeito, com a mesma
escolha de rede ao lado de **Publicar comentário**.

Para que um comentário não vá para nenhuma rede, escolha **Somente local e
pares**. Ele é salvo no seu dispositivo e enviado só aos pares conectados
naquele momento, então não é preciso conta em nenhuma rede. Quem não estiver
conectado quando você postar não o recebe, e ninguém poderá encontrá-lo
depois em uma rede.
Para que todo formulário de comentário comece nela, escolha-a em
**Comentários** na página [Provedor de anúncio /
descoberta](10-NetworkSettings.md#provedor-de-anúncio--descoberta).

Criou depois uma conta em uma rede, ou quer o comentário em outra rede
também? Embaixo de cada comentário seu, uma linha diz para quais redes este
dispositivo o enviou, ou *Ainda não enviado a nenhuma rede a partir deste
dispositivo.* **Distribuir** ali o envia para a rede escolhida e diz se deu
certo; uma rede para a qual ele já foi aparece marcada e não pode ser
escolhida de novo. Só o autor do comentário, conectado, vê isso, porque só
ele pode assinar o comentário para uma rede, e a linha só sabe o que este
dispositivo enviou.

Os comentários das outras pessoas chegam a você:

- dos pares conectados, à medida que são postados;
- das redes, quando você abre os comentários de uma publicação e sempre que
  clica em **Procurar comentários novos**. É assim que você vê comentários
  postados enquanto estava offline.

A linha ao lado do botão informa a última busca, como *2 comentários novos
encontrados* ou *Nenhum comentário novo encontrado* (que só vale para as
redes que responderam). Uma rede inacessível é nomeada (*Arweave
indisponível*); se nenhuma responder, você vê *Não foi possível acessar Nostr
ou Arweave: mostrando os comentários guardados neste dispositivo.* Só são
consultadas as publicações cujos comentários você abre. A assinatura de cada
comentário buscado é conferida, e nenhum é contado duas vezes.

Quando alguém comenta numa publicação que você publicou, aparece uma entrada
**Publication commented** (comentaram numa publicação sua) no seu
[Histórico de notificações](03-WorldView.md#orientação-e-locais) (o botão 🔔
no cabeçalho). É o único tipo de notificação que o ForkBuild tem hoje.

## Snapshot local

Na guia **Snapshot** de um cartão, **Snapshot local** responde a uma
pergunta: este dispositivo tem agora os bytes do conteúdo desta publicação?
Ele não confere assinaturas nem posicionamentos, e só contata a rede quando
você clica numa das ações de recuperação.

### Conferindo o que você tem

**Verificar Snapshot local** (depois **Verificar de novo**):

| Selo | Significado |
|---|---|
| **Disponível** | Os bytes estão aqui e correspondem ao hash do conteúdo. |
| **Indisponível** | Nada nunca foi guardado com este hash. |
| **Hash divergente** | Há algo guardado com este hash, mas não corresponde mais. |

Duas pessoas com a mesma publicação podem ter respostas diferentes, porque o
armazenamento delas é diferente. Depois de uma verificação, uma linha mostra
*Publicação: conhecida localmente / não conhecida localmente · Snapshot:
disponível / indisponível*: se este dispositivo catalogou a publicação
assinada, e se tem bytes válidos.

Se a verificação não encontrar bytes válidos, uma dica aponta as formas de
trazê-los, mais abaixo. Nada é tentado de novo sozinho.

### Trazendo os bytes

Três ações, cada uma com seu clique:

**Importar Snapshot** — mostra um seletor de arquivo e uma caixa para colar
um **Pacote de transferência de Snapshot de publicação** (um pacote JSON com
o conteúdo de uma publicação). Escolha ou cole um, depois clique em
**Importar Snapshot** de novo.

| Selo | Significado |
|---|---|
| **Importado** | Guardado e conferido com o hash. |
| **Já disponível** | Os bytes correspondentes já estavam aqui. |
| **Importação rejeitada** | Os bytes do pacote não correspondem ao próprio hash. |
| **O snapshot não foi importado** | Não é um pacote válido. |

**Obter Snapshot do par** — escolha um par conectado e clique em **Obter
Snapshot do par** (depois **…de novo**). Pede só àquele par.

| Selo | Significado |
|---|---|
| **Obtido** | Os bytes do par correspondem ao hash do conteúdo. |
| **Já disponível** | Os bytes correspondentes já estavam aqui. |
| **Indisponível agora** | O par não respondeu, ou não os tem. |
| **Rejeitado** | Os bytes do par não corresponderam. |

**Materializar Snapshot**, a partir de um posicionamento (veja
[Posicionamentos de snapshot](11-EvidenceAndStorage.md#posicionamentos-de-snapshot)),
é o terceiro jeito. Quando um dos três dá certo, uma linha **Origem:** diz
qual foi o último a dar certo: "Pacote de transferência", "Posicionamento"
ou "Par".

### Quais pares o têm?

**Quais pares o têm?** pergunta aos seus pares conectados se eles têm os
bytes, sem trazê-los. Cada par conectado aparece na lista, marcado;
desmarque os que você não quer consultar e clique em **Perguntar aos pares
selecionados** (depois, **Perguntar de novo aos pares selecionados**). A
última resposta de cada par aparece com o momento em que chegou, além dos
totais: **Disponível**, **Indisponível** ou **Não foi possível determinar**
(não respondeu a tempo). Uma resposta é o que aquele par disse naquele
momento, não uma promessa.

Um par que respondeu **Disponível** ganha o próprio botão **Obter Snapshot
de *par***. Ele pede os bytes só a esse par e os confere, como **Obter
Snapshot do par**; nada é buscado de mais ninguém por você. **Mostrar
respostas desta visita** lista cada resposta em uma linha (como
`20:21:04 — Alice → Disponível`); clique em uma linha para ver o relatório
completo, a publicação e o hash do conteúdo. Uma linha nunca é reescrita.

### Tentativas nesta visita

Depois que você tentar trazer os bytes, **Tentativas nesta visita** conta
as tentativas desta visita por resultado e por origem. Uma tentativa que
guardou os bytes não quer dizer que eles ainda estão aqui; quem diz isso é
**Verificar Snapshot local**. **Mostrar histórico de obtenção** lista cada
tentativa (como `20:16 — Par → Hash não confere`); clique em uma para ver o
resultado, a publicação e o hash do conteúdo.

## Descentralização num relance

Na guia **Descentralização e evidências**, depois que uma
publicação tem uma âncora ou um posicionamento, **Descentralização** compara
as [Evidências externas](11-EvidenceAndStorage.md#evidências-externas) e os
[Posicionamentos de snapshot](11-EvidenceAndStorage.md#posicionamentos-de-snapshot):

- **Publicação: conhecida localmente / não conhecida localmente** — se este
  dispositivo catalogou a publicação assinada.
- Dois cartões com quantas declarações de cada tipo são conhecidas, e se elas
  concordam sobre o hash do conteúdo (**Concordância**) ou não
  (**Conflito**). Se um concorda e o outro tem conflito, uma frase diz isso;
  a concordância num não garante o outro. Sem declarações de um tipo ainda,
  aparece **Nada para comparar ainda**.
- **Sincronizar com os pares** (depois **Sincronizar de novo**) pede a cada
  par conectado as âncoras e os posicionamentos que você não tem, e informa
  **Declarações novas** e **Já conhecidas** para cada tipo.
- **Mostrar o que a réplica conhece** lista, para cada âncora e
  posicionamento, como este dispositivo ficou sabendo dele (**Aquisição**:
  *Conhecido localmente*, *por importação de pacote* ou *por troca entre
  pares*), **Visto pela primeira vez** e o estado atual de **Verificação** /
  **Resolução**. Não contata nenhuma rede.

## O que sobrevive a uma recarga

As declarações assinadas e os fatos registrados ficam; verificações,
tentativas e telas em andamento, não.

| Fica neste dispositivo | Zera ao recarregar |
|---|---|
| Evidências e posicionamentos catalogados, e o **Conhecimento local** de cada um | Os resultados de **Verificar evidências** e **Resolver Snapshot** |
| Os bytes de Snapshot que você importou, recuperou ou materializou | Todo o resto de **Snapshot local**: verificações, histórico de tentativas, a linha **Origem:**, verificações e comparações com pares |
| As contagens de **Descentralização** (calculadas a cada carga) | Os resultados de **Sincronizar com os pares** |
| — | **Publicação no IPFS**: a configuração do provedor, os resultados, o histórico na tela e o histórico de verificação |
| Os registros de **Publicações de âncora no Bitcoin/Base**, feitos na finalização | A conexão dos fluxos de carteira, a observação de fundos ou da conta, o plano, a revisão, a assinatura, a transação finalizada, o resultado da transmissão e o histórico de confirmação ou inclusão na tela |
| O **Arquivo de observações de publicações** (cada publicação e verificação no IPFS, transmissão, confirmação e prova de conteúdo no Bitcoin, e inclusão na Base), até **Esvaziar arquivo** | — |
| Referências entre publicações e Associações de editores | Quais cartões e linhas você tinha abertos |
| Decisões e observações de conciliação (guardadas no arquivo) | Arquivos de pares colados, exportações de evidências importadas, filtros, a Comparação de exportações de evidências e a Declaração de snapshot do editor |

Depois de recarregar, os resultados de um fluxo ou de uma publicação no IPFS
continuam visíveis no
[Arquivo de observações](12-ArchiveAndLeaderboards.md#o-arquivo-de-observações-de-publicações),
no ciclo de vida de um registro ou (no Bitcoin) nas Evidências históricas de
âncoras no Bitcoin. Reconecte a carteira, ou configure de novo o provedor de
pinning, para continuar.

## E agora?

Compartilhar suas construções continua sendo em
[Publicar e bifurcar](04-PublishingAndForking.md). Para ir mais longe aqui,
continue com [Evidências e armazenamento](11-EvidenceAndStorage.md).
