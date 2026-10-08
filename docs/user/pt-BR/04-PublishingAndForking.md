<!-- translation-of: docs/user/04-PublishingAndForking.md source-hash: e6595d73ff729e3e -->
# 04 — Publicar e bifurcar

<!-- languages -->
[English](../04-PublishingAndForking.md) · [Deutsch](../de/04-PublishingAndForking.md) · [Español](../es/04-PublishingAndForking.md) · [Français](../fr/04-PublishingAndForking.md) · [Bahasa Indonesia](../id/04-PublishingAndForking.md) · [日本語](../ja/04-PublishingAndForking.md) · [한국어](../ko/04-PublishingAndForking.md) · **Português (Brasil)**
<!-- /languages -->

Este é o coração do ForkBuild. **Publicar** compartilha sua criação com o
mundo. **Bifurcar** deixa qualquer pessoa copiar uma criação e fazê-la
evoluir — com todo o histórico preservado.

## Publicando sua criação

1. Construa algo no Editor.
2. Entre e confira se sua identidade está desbloqueada (veja
   [Identidade e login](05-IdentityAndLogin.md)). Publicar assina a criação
   com ela. Se você não entrou, **Publicar** pede que você entre ou crie uma
   identidade primeiro; **Publicar sem assinar** ali a publica sem autor e
   sem link.
3. Dê um título a ela — Publicar recusa uma criação sem título ou vazia — e,
   se quiser, uma descrição e uma licença: clique em **✎** ao lado do título
   do documento na barra lateral para abrir **Propriedades do documento**. Um
   documento novo não tem licença; na primeira vez que você o publicar, o
   ForkBuild pergunta se outras pessoas podem remixá-lo (veja
   [Deixando outras pessoas remixarem](#deixando-outras-pessoas-remixarem)).
4. Pressione **Salvar** para guardá-la.
5. Clique em **Publicar**.

Sua criação agora aparece no **seu próprio Repositório** neste dispositivo,
onde você pode pesquisá-la, abri-la e bifurcá-la, com seu nome como autor.
As outras pessoas só a veem depois que você a compartilha ou distribui (veja
a nota abaixo). Ela também recebe automaticamente uma posição no mundo
compartilhado, para que **Explorar** sempre tenha aonde levar as pessoas —
veja [Encontrando mundos](03-WorldView.md#encontrando-mundos).

> **Nota:** Publicar guarda seu Documento/Mundo só neste dispositivo. O
> cartão dele no Repositório diz onde este dispositivo registrou a
> distribuição (por exemplo **Guardado no IPFS · Anunciado no Nostr**), ou
> **Nenhuma distribuição registrada neste dispositivo.** Faça um backup em
> [Seus dados](13-YourData.md) para ter uma cópia enquanto isso.
> Publicar nunca envia nada para lugar nenhum por conta própria. Um
> [link](#compartilhando-um-link) que você copia leva a construção a quem
> você o der. Dois passos
> separados e opcionais fazem isso: **Distribuir**, descrito mais abaixo,
> envia a publicação para o Arweave ou o IPFS e a anuncia no Nostr ou no
> Arweave, para que outras pessoas a encontrem sem estar conectadas a você;
> e [**Compartilhar com pares**](#compartilhando-com-pares-conectados) a
> oferece às pessoas com quem você está conectado.

## Compartilhando um link

Assim que **Publicar** dá certo, o aviso no Editor também mostra
**Compartilhar…** (onde seu dispositivo tem um menu de compartilhamento),
**Copiar link**, **Salvar imagem** e **Incorporar**, com o link embaixo. Os mesmos botões
ficam em **Meu Mundo compartilhado** na Visão do mundo.

- **A construção vai dentro do link.** Nada precisa ser distribuído antes,
  e nenhuma carteira ou conta entra na história: o link leva seu
  Mundo compartilhado assinado e a própria construção. Quem abrir o link, em
  qualquer dispositivo, chega à sua construção (veja
  [O que um link abre](#o-que-um-link-abre)). O ForkBuild confere a assinatura, e se a
  construção corresponde a ela, antes de mostrar qualquer coisa; um link
  alterado ou cortado avisa isso.
- **Mostra o que é.** Colado em um aplicativo de conversa, um e-mail ou um
  post, o link mostra o título da sua construção, seu nome e uma imagem
  dela, desenhada pelo servidor de links do ForkBuild, que depois leva quem
  o abrir ao ForkBuild. Um link alterado mostra só "A shared build".
- **Precisa de assinatura.** Publique com a sessão iniciada; uma criação
  publicada sem entrar não ganha link.
- **Tamanho.** Cabe uma construção de até uns 500 blocos; o link do castelo
  pronto tem uns 3.700 caracteres. O e-mail e a maioria dos aplicativos de
  conversa e redes sociais mantêm um link desse tamanho, mas o Discord e o
  Telegram limitam o tamanho de uma mensagem. Uma construção maior avisa que
  é grande demais para um link: distribua-a para obter um.
- **Depois de distribuída**, os botões oferecem o link mais curto que diz
  onde o Mundo compartilhado está guardado, e que também leva o seu
  posicionamento (veja [Distribuição](Distribution.md)). Um link que leva a
  construção não leva o seu posicionamento, então a Visão do mundo coloca a
  construção onde coloca as que não têm um.
- **Salvar imagem** baixa um PNG de 1200 × 630 da construção, com o título
  dela e "Faça sua versão no ForkBuild" na parte de baixo, para postar onde
  um link sozinho não mostra imagem.

Copiar ou compartilhar um link, e abrir um, são contados de forma anônima,
como a visita diária; veja
[Contagem diária de visitantes](13-YourData.md#contagem-diária-de-visitantes).

### O que um link abre

Um link para uma construção, seja ele com a construção dentro ou dizendo
onde ela está guardada, abre a página própria dessa construção:

- a construção, girando devagar;
- o título e quem a fez;
- **Remix de “…”, de …** quando é um remix, e **Remixada N vezes** quando
  este dispositivo encontrou remixes dela (veja
  [Contagem de remixes](#contagem-de-remixes));
- **Editar uma cópia**, o botão grande: sua própria cópia abre no Editor,
  pronta para mudar, sem precisar de conta. Ela registra de onde veio,
  então quem fez continua com o crédito, e **Voltar ao mundo** leva você
  ao original;
- **Andar ao redor dela no Mundo**, para vê-la na Visão do mundo.

Quando a licença permite cópias, a página também oferece **Baixe como
modelo 3D** (glTF, STL para impressão 3D ou OBJ; veja
[Baixando um modelo 3D](02-TheEditor.md#baixando-um-modelo-3d)). Se a licença da construção não permite cópias, a página diz isso e oferece
só andar ao redor dela.

### Incorporando uma construção em uma página web

Uma construção cujo link a leva também pode ser mostrada dentro de um post
de blog ou de uma página web, onde os leitores a veem girando sem sair da
página:

1. Embaixo do link, escolha **Incorporar**. O código para colar aparece logo
   abaixo.
2. Escolha **Copiar código para incorporar** e cole onde a página aceita
   HTML ou conteúdo incorporado (um `<iframe>`).

Na página, a construção gira devagar, e arrastar para os lados a gira com a
mão. O título e quem a fez ficam embaixo, ao lado de **Remixar no ForkBuild**
(**Abrir no ForkBuild** quando a licença não permite cópias), que abre a
página da própria construção no ForkBuild em uma nova aba (veja
[O que um link abre](#o-que-um-link-abre)).

- **A construção viaja dentro do código**, como no link: nada precisa ser
  distribuído, e a incorporação confere a assinatura e a construção antes de
  mostrá-la.
- **Ela fica quieta.** A incorporação não inicia nenhuma das conexões do
  ForkBuild e não guarda nada no navegador de quem lê; veja
  [Privacidade](Privacy.md).
- **Sites que incorporam links sozinhos** (os que aceitam oEmbed, como Notion
  e Ghost) podem receber o link de **Copiar link** no lugar: eles pedem a
  incorporação ao servidor de links do ForkBuild.
- **Sites que removem código `<iframe>`**, como a maioria das redes sociais,
  não conseguem mostrá-la; compartilhe ali o link ou a imagem.

Copiar o código, e uma incorporação ser mostrada ou aberta no ForkBuild,
também são contados de forma anônima.

## Distribuindo direto do Editor

Assim que **Publicar** dá certo, o Editor mostra ali mesmo um pequeno aviso
— "Mundo compartilhado publicado com sucesso." — com um botão
**Distribuir** ao lado, e um **Dispensar** para fechá-lo sem fazer nada.
Clicar em **Distribuir** abre uma caixa de diálogo **Distribuir**, em vez
de encher a sobreposição de seletores e resultados de que você só precisa
de vez em quando; fechá-la de novo (**Fechar**, clicar fora dela ou Esc)
nunca perde nada do que ela produziu — reabri-la mostra exatamente o mesmo
resultado, erro ou andamento em que você a deixou.

A caixa de diálogo é a mesma que a Visão do mundo usa — as configurações
**Armazenamento** e **Substrato de anúncio / descoberta**, o botão combinado
**Distribuir** e os botões separados **Distribuir só o Snapshot** /
**Distribuir só a Declaração assinada** funcionam todos como descrito em
[Encontros no Mundo](03-WorldView.md#encontros-no-mundo--publicações-e-avatares-que-seus-pares-estão-compartilhando).
Duas coisas mudam aqui: ela sempre age sobre exatamente o Mundo
compartilhado que seu clique em Publicar acabou de produzir, e a seção
**Snapshot** vem primeiro, então o botão combinado roda primeiro o Snapshot
e depois a Declaração assinada.

O resultado da Declaração assinada aparece na seção dela:

| Campo | Significado |
|---|---|
| **Mundo compartilhado** | O id do próprio Mundo compartilhado — confirma de qual Mundo compartilhado é este resultado. |
| **Material** | O local que o envio produziu, ou "Ainda não enviado" se ele não foi concluído. |
| **Descoberta** | O id do anúncio, ou "Ainda não anunciado" se ele não foi concluído — uma linha por relay quando vários estão configurados. |
| **Repositório** | Um botão **Explorar** que leva direto à página desta publicação na Visão do mundo — mostrado sempre que a publicação tem algum lugar para explorar, o que na prática é sempre. |

**Construções grandes.** O armazenamento no Arweave aceita um Snapshot de
até 256 KB, uns oito mil blocos. Para qualquer coisa maior, escolha o
armazenamento IPFS (um nó IPFS local ou pinning remoto), que não tem limite
de tamanho; se você escolher o Arweave mesmo assim, a seção Snapshot diz o
tamanho da construção e pede que você escolha o IPFS, e nada é enviado. Os
pares conectados a você podem buscar construções de até 64 MB direto de
você, sem precisar de armazenamento.

O resultado do próprio Snapshot — um **Hash do conteúdo**, um
**Localizador** e um id de **Anúncio**, ou "Sem anúncio" para um
posicionamento que deu certo sem anúncio — é totalmente separado, já que os
Snapshots são posicionados e descobertos independentemente da distribuição
da Declaração assinada; veja
[Snapshot local](09-PublicationsAndEvidence.md#snapshot-local) para o que
essa diferença significa.

Como todos os outros botões de distribuição deste app, distribuir precisa de
uma extensão de assinatura no navegador — uma carteira Arweave (como a
Wander) ou uma extensão Nostr (como a nos2x); sem ela, termina num aviso
simples de "Não foi possível concluir…". Publicar em si nunca distribui nada:
a distribuição só acontece nesse clique posterior, separado e explícito.
Publicar de novo substitui a sobreposição inteira por uma nova, para a nova
publicação; dispensá-la, ou sair da página, a apaga — nem o aviso nem o
resultado de nenhuma das seções é lembrado em lugar nenhum.

## Compartilhando com pares conectados

Um Mundo que você publica aparece só no *seu* Repositório, até você
distribuí-lo no Nostr, no Arweave, no Steem ou no Blurt (veja
[Distribuição](Distribution.md)): aí o Repositório de qualquer pessoa o
encontra (veja
[Criações que outras pessoas distribuíram](#criações-que-outras-pessoas-distribuíram)).
Para colocá-lo no
Repositório de alguém com quem você está conectado (veja
[Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md)), clique em
**Compartilhar com pares** abaixo dele no Repositório. O botão só aparece nos
Mundos que você mesmo publicou.

- Compartilhar oferece o Mundo a todos que estão conectados agora e a quem se
  conectar depois. **Compartilhado ✓ · Compartilhar de novo** o anuncia de
  novo às pessoas conectadas agora.
- Do lado delas, um Mundo compartilhado por um dos **Amigos** ou **Pares
  conhecidos** delas é adicionado sozinho ao Repositório, junto com tudo o
  que é preciso para **Explorar**. Um Mundo compartilhado por qualquer outra
  pessoa espera em **Compartilhado com você**, no topo do Repositório, até
  elas clicarem em **Recuperar**. Nenhum dispositivo baixa o Mundo de um
  desconhecido sem que peçam. Cada um aparece com o título, para que
  possam escolher; o dispositivo delas garante que o Mundo que recuperam é
  o que esse título indica. Um Mundo que você compartilhou antes de os
  títulos serem incluídos aparece como "Um Mundo compartilhado por …" até
  você clicar em **Compartilhar de novo**.
- O Mundo é buscado só com você, e só enquanto você estiver conectado: se
  você estiver offline, **Recuperar** espera você voltar, e um Amigo ou Par
  conhecido o recebe assim que você se reconectar. O dispositivo da pessoa
  confere que o Mundo foi assinado por você antes de adicioná-lo, então
  ninguém consegue fazer passar uma cópia como se fosse sua.
- Como qualquer publicação, compartilhar não pode ser desfeito para quem já
  recebeu.

## Escolhendo uma licença

### Deixando outras pessoas remixarem

Na primeira vez que você publica uma construção sem licença, o ForkBuild
pergunta **Deixar outras pessoas remixarem?** antes de publicar qualquer
coisa:

- **Sim, permitir remixes** define **CC BY 4.0**: qualquer pessoa pode
  copiar e mudar, desde que dê crédito a você, e cada remix mostra que veio
  da sua.
- **Não, só deixar olhar** define **Todos os direitos reservados**: dá para
  andar ao redor, mas não copiar.
- **Agora não** não publica nada.

Sua resposta é salva como a licença da construção, então a pergunta vem só
uma vez; mude quando quiser em **Propriedades do documento**. Uma
bifurcação já leva a licença do original, então publicar uma nunca
pergunta.

### Todas as licenças

Uma criação publicada sempre aparece com uma licença, escolhida na caixa de
diálogo **Propriedades do documento**:

| Licença | Significado |
|---|---|
| **CC0 1.0 — Domínio público** | Nenhum direito reservado — qualquer pessoa pode fazer qualquer coisa com ela |
| **CC BY 4.0 — Atribuição** | Qualquer pessoa pode bifurcá-la e reutilizá-la, dando crédito a você |
| **CC BY-SA 4.0 — Atribuição, Compartilha Igual** | As bifurcações precisam levar adiante a mesma licença |
| **CC BY-NC 4.0 — Atribuição, Não Comercial** | Bifurcar é permitido, uso comercial não |
| **CC BY-ND 4.0 — Atribuição, Sem Derivações** | Pode ser vista, mas **bifurcar não é permitido** |
| **Todos os direitos reservados** | Pode ser vista, mas bifurcar não é permitido |
| **Nenhuma licença especificada** | Bifurcar não é permitido até você definir uma |

Se você deixar uma criação sem licença, as pessoas ainda podem abri-la e
explorá-la — só não podem bifurcá-la até você escolher uma licença que
permita.

## Escolhendo quem pode posicioná-lo

Em geral, outras pessoas podem posicionar sua criação publicada nos Mundos
delas. Isso adiciona um posicionamento da sua construção, nunca uma cópia
dela, e nunca move nem muda a sua (veja
[Por que posso posicionar construções de outras pessoas?](03-WorldView.md#por-que-posso-posicionar-construções-de-outras-pessoas)).
Bifurcar é outra coisa, regida pela licença (veja
[Posicionar ou bifurcar](03-WorldView.md#posicionar-ou-bifurcar)).
Se você preferir que não a posicionem, abra **Propriedades do documento** e
defina **Quem pode posicioná-lo no Mundo**:

| Configuração | Significado |
|---|---|
| **Qualquer pessoa pode posicioná-lo** | O padrão. Qualquer pessoa pode posicioná-la onde quiser no próprio Mundo |
| **Só eu posso posicioná-lo** | Só você pode posicioná-la. Outras pessoas ainda podem encontrá-la, vê-la e (se a licença permitir) bifurcá-la, mas o ForkBuild não as deixa posicioná-la |

A configuração é assinada como parte da publicação quando você publica,
então ninguém pode removê-la nem mudá-la depois. Isso também significa que
ela só vale para o que você publicar depois de escolhê-la. Uma publicação
que já saiu mantém a configuração com que foi publicada, então publique de
novo se quiser que a nova valha.

Ela funciona do mesmo jeito que a permissão de bifurcar da licença: toda
cópia do ForkBuild a respeita, mas ela não é uma tranca. Alguém que mude o
código do app poderia ignorá-la, e ela não desfaz um posicionamento que
alguém fez antes de você escolhê-la.

De todo modo, as outras pessoas veem sua construção onde *você* a pôs depois
que você usa **Distribuir** com o Snapshot dela na Visão do mundo ou logo depois de publicar no Editor: o anúncio
leva seu posicionamento assinado, e o ForkBuild delas mostra a construção ali
assim que conhece seu Mundo compartilhado. Mova-a e distribua de novo, e ela
se move para elas também.

## Editando uma criação publicada

Uma criação publicada é **imutável** — nunca pode mudar depois. Para
construir a partir dela, **Bifurque** (abaixo), ou use **Editar uma cópia**
na Visão do mundo. Na Visão do mundo, fazer sua primeira mudança num mundo
publicado — os metadados, o nome de um marco ou região, ou uma decoração de
animal — cria automaticamente sua própria cópia, com o título *"Bifurcação
de &lt;nome original&gt;"*, e uma confirmação curta ("Sua própria cópia
editável foi criada; … não muda"); veja
[Salvar e publicar aqui também](03-WorldView.md#salvar-e-publicar-aqui-também).

O original nunca é tocado, por mais que você mude sua cópia.

## O Repositório

O **Repositório** é o catálogo pesquisável de todas as criações publicadas
que este dispositivo conhece: as suas, as que pares compartilharam com você
e as encontradas em redes descentralizadas. Ele foi feito para continuar
prático tenha dez criações ou dez mil.

### Construções prontas

No topo, **Comece com uma construção pronta** mostra as construções que vêm
com o ForkBuild: um castelo, uma ilha do porto, uma praça da vila, uma
casa, um moinho e uma ponte. Elas estão lá mesmo antes de algo ser
publicado ou encontrado. Clique em uma (**Remixar**) para abrir sua própria
cópia no Editor; nada é publicado até você publicar. Clique no título para
recolher a fileira.

### Criações que outras pessoas distribuíram

Toda vez que você abre o Repositório (ou a página de um autor), ele procura
no Nostr, no Arweave, no Steem e no Blurt criações que outras pessoas distribuíram lá
e adiciona as que consegue verificar. Uma linha acima da lista diz o que
ele está fazendo e depois quantas criações novas encontrou; **Verificar de
novo** procura mais uma vez.

- Só é adicionada uma criação cujo registro assinado confere: assinado pela
  chave que ele indica e exatamente a criação que foi anunciada. Qualquer
  outra coisa é ignorada, e um registro que falhou não é buscado de novo.
- Ele verifica até 20 criações novas por vez. Se houver mais, a linha diz
  quantas ficaram para a próxima vez.
- Uma criação encontrada assim continua no seu Repositório depois de
  recarregar a página.
- O build dela ainda não está no seu dispositivo. **Explorar** busca o build
  de onde ele foi armazenado e o confere, depois o abre na Visão do mundo,
  como ao abrir um link compartilhado.

```
Buscar [________________]  ☐ Incluir descrições  [Buscar]

Ordenar: [Publicadas recentemente ▾]   Agrupar: [Nenhum ▾]   [Cartões] [Lista]

1.248 publicações

┌─────────────────────────────────────────┐
│  [prévia]  Cidade antiga                 │
│            Uma reconstrução de uma       │
│            cidade romana mostrando…      │
│            🔒 Publicado  de alice        │
│            16/08/2026 · CC BY 4.0        │
│            [Abrir] [Bifurcar] [Explorar] │
└─────────────────────────────────────────┘

        [← Anterior]  1 2 3 4 5 … 125  [Próxima →]
```

- **Buscar** olha o título e o autor por padrão. Marque **Incluir
  descrições** para pesquisar também dentro das descrições — isso pode levar
  um pouco mais de tempo, porque precisa ler mais do que a listagem
  normalmente precisa.
- **Ordenar** oferece cinco ordens: Publicadas recentemente, Publicadas há
  mais tempo, Título A–Z, Título Z–A e Autor A–Z.
- **Agrupar** junta os resultados da página atual por Autor, Data ou
  Licença — só para navegar; não muda o que é encontrado nem quantas páginas
  há.
- **Cartões** é melhor para navegar visualmente; **Lista** é uma tabela
  compacta — passe para ela quando estiver percorrendo muitos resultados
  depressa.
- A paginação é explícita, página por página, em vez de rolagem infinita —
  então "página 5" sempre quer dizer a mesma coisa se você voltar depois.

Toda criação oferece três ações:

| Botão | O que faz |
|---|---|
| **Abrir** | Carrega aquele documento no Editor |
| **Bifurcar** | Copia para uma criação editável sua |
| **Explorar** | Voa até ela na Visão do mundo |

(O botão **Continuar explorando** de **Meus mundos** — veja
[Meus mundos](03-WorldView.md#meus-mundos--os-mundos-em-que-você-realmente-esteve)
— faz o mesmo que **Explorar** aqui, só com outro nome, para um Mundo que
você já visitou em vez de um que está encontrando pela primeira vez.)

Clique no **nome de qualquer autor** para visitar a **página do autor** — um
portfólio de tudo o que a pessoa fez, incluindo os originais e todas as
bifurcações que nasceram deles, com exatamente o mesmo catálogo de
busca/ordenação/paginação do Repositório, só que restrito àquele autor.

Um cartão cuja assinatura confere também tem um botão **Seguir**, e uma
página do autor mostra **Assinado por …** com **Seguir** para cada
identidade que publicou com aquele nome. Seguir alguém coloca os trabalhos
novos dessa pessoa na sua página **Seguindo** e nas suas notificações; veja
[Seguindo pessoas](07-PeerConnectionsAndFriends.md#seguindo-pessoas).

O Repositório também não se limita ao que foi publicado deste dispositivo ou
descoberto diretamente: uma criação de Repositório descentralizada que um par
mostrou a você no mapa de
[Encontros no Mundo](03-WorldView.md#encontros-no-mundo--publicações-e-avatares-que-seus-pares-estão-compartilhando)
da Visão do mundo, depois que o conteúdo dela de fato se resolve, também
entra nesta mesma busca e na página do autor dela, e continua lá depois de
recarregar. Ela aparece igual a qualquer outra coisa aqui.

## Bifurcar: torne-a sua

**Bifurcar** é o que torna o ForkBuild especial. Quando você bifurca uma
criação:

- Você recebe uma **cópia nova e independente** para editar à vontade.
- O **original não é tocado** — suas mudanças nunca o afetam.
- A cópia **lembra de onde veio**, então o crédito nunca se perde.

Funciona exatamente como fazer um fork de um projeto no Git: você abre um
ramo, faz suas coisas, e a árvore genealógica acompanha todo mundo. (Na
Visão do mundo isso também acontece automaticamente no momento em que você
muda um mundo publicado — veja
[Editando uma criação publicada](#editando-uma-criação-publicada) acima.)

> **Na Visão do mundo, também se chama "Editar uma cópia".** É a mesma
> operação nos dois casos, com as mesmas regras de licença e o mesmo
> tratamento de
> [Bifurcação indisponível](#quando-uma-bifurcação-não-pode-ser-concluída).
> Veja
> [Editar uma cópia](03-WorldView.md#editar-uma-cópia--levando-algo-para-o-editor)
> para o passo a passo na própria Visão do mundo.

### Como bifurcar

1. Encontre uma criação no **Repositório** (ou na Visão do mundo).
2. Clique em **Bifurcar**.
3. A cópia abre no Editor, com o título *"Bifurcação de &lt;nome
   original&gt;"*.
4. Continue a construção, depois salve e publique como sua.

Sua bifurcação publicada aparece com uma nota **Remix de “…”, de …**, que a
liga de volta ao original.

### Contagem de remixes

A página de uma construção e o cartão dela no Repositório dizem quantas
vezes ela foi remixada (**Remixada 3 vezes**): quantas construções
diferentes, bifurcadas dela e publicadas, este dispositivo encontrou. Um
remix publicado duas vezes conta uma vez, e uma construção que ninguém
remixou não mostra nada. A contagem é só o que este dispositivo conhece,
então outro dispositivo pode mostrar um número diferente, e ela nunca
decide o que aparece primeiro.

Quando este dispositivo encontra o remix que outra pessoa fez de uma das
suas construções, seu 🔔 ganha uma entrada **… remixou sua construção**,
uma vez por remix (e seu dispositivo também a mostra, se você ativou
[Notificações neste dispositivo](03-WorldView.md#notificações-neste-dispositivo)).

### Quando uma bifurcação não pode ser concluída

De vez em quando uma bifurcação não dá certo — na maioria das vezes ao
bifurcar um Mundo compartilhado encontrado por um par ou por uma rede
descentralizada (veja
[Publicações e evidências externas](09-PublicationsAndEvidence.md)), e não
uma entrada comum do Repositório. Em vez de largar você num documento vazio
e sem relação no Editor, o ForkBuild mostra uma caixa de diálogo
**Bifurcação indisponível** dizendo exatamente o que deu errado:

- **Este Mundo compartilhado não pode ser bifurcado sob a licença dele.** —
  a licença do que você tentou bifurcar não permite (veja
  [Escolhendo uma licença](#escolhendo-uma-licença) acima).
- **O material deste Mundo compartilhado está indisponível no momento.** — a
  licença permite bifurcar, mas o conteúdo em si ainda não está neste
  dispositivo (nem acessível por um par conectado).

De todo modo, o único botão da caixa de diálogo, **Voltar ao Mundo
compartilhado**, leva você de volta a onde o encontrou — o Mundo em que ele
estava posicionado, ou o próprio Mundo compartilhado —, em vez de deixar
você preso no Editor sem nada para construir.

## O desafio de construção semanal

Toda semana o ForkBuild propõe um tema para construir (um farol, uma
ponte, uma casa minúscula, …), de segunda-feira até o fim do domingo
(UTC). O Início o mostra, e **Desafio** na barra do topo abre a página
dele.

1. **Participar do desafio** abre uma construção inicial no Editor como
   sua própria cópia, já com a tag da semana (uma tag como
   `#lighthouse-20261012`: o tema e a segunda-feira em que começou). O
   desafio também é a primeira opção de **Novo** no Editor, e as **Ideias
   para começar** da página abrem outras construções que combinam, do
   mesmo jeito.
2. Deixe-a do seu jeito ou recomece num terreno vazio: seja o que for que
   você construir, participa enquanto mantiver a tag da semana
   (adicione-a em **Propriedades do documento → Tags** se começou de outro
   jeito).
3. Publique antes do fim da semana e compartilhe o link. O texto do link
   cita o desafio e a tag, pronto para um post.

A página do desafio lista as participações que este dispositivo conhece:
suas próprias construções publicadas com a tag e as de outras pessoas
encontradas nas redes. Quando uma construção é distribuída no Nostr ou no
Arweave, o anúncio dela lista as tags, e a página pergunta a essas redes
pela tag da semana sempre que abre (**Verificar de novo** pergunta outra
vez). Cada participação encontrada é verificada como tudo o que o
Repositório encontra, e aparece também no Repositório. Uma construção
compartilhada só pelo link, ou distribuída só no Steem ou no Blurt, não é
encontrada assim. As semanas anteriores continuam abertas pela
segunda-feira delas (**Semana passada: …**), sem **Participar**.

As participações aparecem das mais novas para as mais antigas, com as
contagens de remixes. Ninguém as julga e nada é classificado: o desafio é
um motivo para construir algo nesta semana e ver o que outras pessoas
fizeram com a mesma ideia.

## A árvore genealógica

Como toda bifurcação registra o pai, o ForkBuild consegue desenhar a
linhagem inteira de uma criação. Numa **página do autor**, você vê uma
**árvore de bifurcações**:

```
Casa medieval (original)
└─ Bifurcação de Casa medieval (de Bob)
   └─ Bifurcação de Bifurcação de… (de Carol)
```

Isso quer dizer que uma ótima criação pode inspirar todo um ecossistema de
variações — e todos na cadeia recebem crédito.

## Um ciclo criativo típico

Aqui está a jornada inteira num só fluxo:

1. **Construa** uma criação no Editor.
2. **Salve**.
3. **Publique** no Repositório.
4. Alguém a **encontra** — pesquisando, explorando por perto na Visão do
   mundo ou navegando pela sua página de autor — e a **bifurca**.
5. Essa pessoa **publica** a bifurcação.
6. Outras pessoas **exploram** as duas na Visão do mundo, e a árvore cresce.

Esse é o ecossistema aberto de construção para o qual o ForkBuild foi feito.

## E agora?

Tenha a [Referência de controles](ControlsReference.md) à mão enquanto
constrói, ou volte e explore a [Visão do mundo](03-WorldView.md) mais a
fundo.
