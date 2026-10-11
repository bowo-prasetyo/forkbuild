<!-- translation-of: docs/Privacy.md source-hash: 1bcac3d373cc9606 -->
# Privacidade

<!-- languages -->
[English](../../Privacy.md) · [Deutsch](../de/Privacy.md) · [Español](../es/Privacy.md) · [Français](../fr/Privacy.md) · [Bahasa Indonesia](../id/Privacy.md) · [日本語](../ja/Privacy.md) · [한국어](../ko/Privacy.md) · **Português (Brasil)**
<!-- /languages -->

O ForkBuild não tem contas e não rastreia você. Ele guarda seu trabalho no
seu próprio navegador e só conversa com outros computadores nos recursos que
precisam disso, além de uma contagem anônima de visitantes, uma vez por dia, quando um link de compartilhamento é usado e quando ele é instalado, para que seus criadores saibam
aproximadamente quantas pessoas o usam e compartilham construções (veja
"Contagem de visitantes" abaixo, e como desligá-la). Esta página lista o
que ele guarda, e cada servidor com que pode se comunicar e quando.

## O que fica no seu dispositivo

Tudo o que está abaixo fica no armazenamento deste navegador (o banco de
dados IndexedDB `forkbuild`; navegadores sem IndexedDB usam `localStorage`,
com chaves que começam com `forkbuild:`) e nunca sai do dispositivo, a menos
que você publique, exporte ou envie:

- seus documentos, as cópias de recuperação das alterações não salvas e as
  estruturas salvas;
- suas identidades: a chave pública de cada uma, e a chave privada,
  criptografada com sua frase secreta, a menos que você tenha escolhido
  criá-la sem uma;
- pares conhecidos, amigos, as pessoas que você segue, bloqueios, histórico
  de conversas e mensagens na fila (ninguém é avisado de que você o segue, e
  nada sobre seguir é enviado);
- seu perfil de avatar, as configurações (incluindo se a Visão do mundo toca
  som, o volume, em 3D ou estéreo, e o idioma que você escolheu; quando você
  não escolheu um, o ForkBuild lê os idiomas preferidos do navegador no
  próprio dispositivo e não os envia para lugar nenhum), e o nome de usuário
  e a credencial de um servidor TURN, se você digitar um em **Configurações
  de rede**;
- se este navegador participa da contagem diária de visitantes, e o último
  dia em que participou;
- as publicações de outras pessoas que este dispositivo encontrou e
  verificou, vindas de pares, links, da Visão do mundo ou da pesquisa do
  Repositório nas redes, e, para as encontradas nas redes, onde o registro
  assinado de cada uma foi lido;
- os ids das publicações que você despublicou neste dispositivo, para que a
  pesquisa do Repositório nas redes não liste de novo cópias que você
  distribuiu antes.
- para quais redes este dispositivo enviou cada comentário seu, e quando,
  para que cada comentário possa dizer para onde foi.
- para cada semana do desafio de construção que você abre, os ids das
  participações encontradas nas redes, para que a página dele as mostre de
  novo antes de procurar.
- para cada construção que você começou com **Construir aqui**, o Mundo e
  o lugar escolhidos, para que ao publicar ela fique ali. Seus selos no
  Início são calculados a partir do que já está listado aqui e não são
  guardados.

Limpar os dados deste site no navegador apaga tudo isso, e não há outra
cópia nem como recuperar. Faça antes um backup com **Seus dados → Fazer
backup em um arquivo**: o arquivo contém tudo o que está acima, exceto com
qual identidade você entrou, criptografado com uma frase secreta que você
escolhe, e fica onde você o puser. O ForkBuild nunca o envia. **Compartilhar
backup** entrega o arquivo ao app que você escolher no seu dispositivo. Se
você escolher uma pasta de backup, o navegador guarda a permissão do
ForkBuild para ela, e o ForkBuild guarda a pasta e, se você pedir, uma chave
feita a partir da frase secreta do backup que só consegue fazer backups
(nunca abri-los), num banco de dados IndexedDB separado, `forkbuild-backup`;
quando e onde foi seu último backup fica guardado com o resto dos dados, mas
fora dos backups.

No site oficial, o navegador também guarda os arquivos do próprio ForkBuild
(o código, a folha de estilos, os ícones e o idioma que você usa) pelo
service worker do site, para que o ForkBuild abra sem conexão e possa ser
instalado como aplicativo. São os mesmos arquivos para todo mundo e não têm
nada seu. Se as notificações neste dispositivo estão ativadas fica guardado
com suas configurações (veja "Notificações neste dispositivo" abaixo).

## O que outras pessoas podem ver

- **Tudo o que você publica** é público: o conteúdo, o título, a descrição e
  a licença, e a chave pública da sua identidade, que assina a publicação.
  Depois que outras pessoas têm uma cópia, você não pode recuperá-la. Quando você a distribui no Nostr ou no Arweave, o anúncio dela também
  lista as tags (como `forkbuild-tag:<tag>`), para que qualquer pessoa
  encontre as construções com uma tag, como as participações do desafio de
  uma semana.
- **Os pares a que você se conecta** ficam sabendo a chave pública da sua
  identidade e seu endereço IP (uma conexão direta precisa dele; um relay
  TURN o esconde do par, mas não do relay). Os pares conectados podem ver seu
  avatar e sua presença conforme a configuração de visibilidade, incluindo em
  que veículo você está montado (o tipo e o id dele, enviados só enquanto a
  presença seria; onde você deixou um veículo nunca é enviado), e seus amigos
  podem mandar mensagens para você. Eles também recebem os anúncios de
  Snapshots e de nomes de lugares que seu dispositivo descobriu, então ficam
  sabendo em quais regiões do Mundo você procurou nomes de lugares
  (docs/AnnouncementIndex.md).
- **Os pares, nos Mundos que você compartilha.** **Compartilhar com pares**,
  no Repositório, oferece um dos seus Mundos publicados a todos com quem você
  está conectado agora e a quem se conectar depois, incluindo desconhecidos
  de uma sala: eles recebem a listagem do Mundo e podem buscar o Mundo em si
  no seu dispositivo enquanto você está conectado. Os dispositivos dos seus
  Amigos e Pares conhecidos o buscam sozinhos; os de qualquer outra pessoa,
  só quando ela clica em **Recuperar**. Um Mundo que você só **Publica** nunca
  é enviado a ninguém.
- **Amigos com quem você passeia.** Qualquer pessoa que abrir um link
  **Passear aqui comigo** que você criou, enquanto ele funcionar, recebe o
  Mundo em que você está (a publicação assinada e a construção, como um
  link compartilhado as leva) e seu nome de exibição, e se conecta a você
  como um par conectado comum: fica sabendo seu endereço IP e vê seu avatar
  e sua presença conforme suas configurações de visibilidade permitem. Você
  fica sabendo os dela do mesmo jeito, e o nome com que ela passeia.
- **Qualquer pessoa, enquanto você está numa sala pública.** Entrar na sala
  pública (**Pares**) ou na sala de um Mundo (**Sala** na Visão do mundo)
  lista a chave pública da sua identidade e o nome de exibição que você
  escolher, para qualquer pessoa que abrir aquela sala. A sala de um Mundo
  também diz a elas qual Mundo você tem aberto. Sua entrada dura até você
  sair, fechar o app (então até 10 minutos) ou o cartão expirar. Ela não tem
  endereço de rede, mas qualquer pessoa na sala pode se conectar a você, e um
  desconhecido que se conecta é um par conectado comum: fica sabendo seu
  endereço IP, vê seu avatar e sua presença conforme suas configurações de
  visibilidade permitem e **troca com você anúncios de Snapshots e de nomes
  de lugares e metadados de publicações, exatamente como qualquer par
  conectado**, antes de você Lembrar dele ou fazer amizade. Chat e voz
  continuam exigindo uma amizade mútua. **Bloquear** na sala oculta alguém
  das suas listas de sala e o bloqueia como na página Pares (presença,
  perfil, chat e pedidos de amizade).

## Contagem de visitantes

Uma vez por dia, na primeira vez que o ForkBuild abre neste dispositivo
naquele dia do calendário, o site oficial
(`https://bowo-prasetyo.github.io/forkbuild/`) carrega uma imagem minúscula
do GoatCounter (`forkbuild.goatcounter.com`), um contador que não grava
cookies. Essa solicitação é tudo o que ele envia:

- **O que o GoatCounter recebe:** seu endereço IP e o User-Agent do seu
  navegador, como em qualquer solicitação web, mais um caminho fixo (`/`) e
  um número aleatório que impede que a imagem fique em cache. Nenhuma
  página, documento, mundo, identidade, referenciador ou qualquer coisa que
  o ForkBuild guarde é incluída, então ele não tem como saber o que você faz
  no aplicativo, nem mesmo qual página abriu.
- **O que ele guarda:** só totais: visitantes por hora e por dia, e de quais
  navegadores, sistemas, países e idiomas eles vieram, cada um contado
  separadamente, sem como ligar uns aos outros. A política de privacidade
  dele (<https://www.goatcounter.com/help/privacy>) diz que ele nunca guarda
  endereços IP nem o User-Agent completo: ele os mantém na memória por até
  8 horas, só para reconhecer uma visita repetida, sem cookies.
- **Qualquer pessoa pode ver os totais** no painel público,
  <https://forkbuild.goatcounter.com/>.

O mesmo contador também fica sabendo de três momentos ao compartilhar uma
construção, cada um como mais uma solicitação de imagem do mesmo tipo, com
seu próprio caminho fixo:

- `/e/share-link`: um link para uma construção foi copiado ou compartilhado
  com **Copiar link** ou **Compartilhar…**;
- `/e/opened-shared-link`: um link compartilhado abriu uma construção;
- `/e/remix-from-link`: uma construção aberta por um link compartilhado foi
  copiada para o Editor (no máximo uma vez por construção enquanto o
  aplicativo está aberto).

Ele também fica sabendo, do mesmo jeito, quando o ForkBuild é instalado
como aplicativo (`/e/installed`).

Ele também fica sabendo, do mesmo jeito, das construções incorporadas em
páginas de outros sites (veja "Servidores que o ForkBuild contata" abaixo):

- `/e/embed-code`: o código para incorporar de uma construção foi copiado
  com **Incorporar → Copiar código para incorporar**;
- `/e/embed-view`: uma construção incorporada foi mostrada em uma página;
- `/e/embed-open`: uma construção incorporada foi aberta no ForkBuild a
  partir dessa página.

E quando alguém entra no desafio de construção semanal (**Participar do
desafio**, ou o desafio em **Novo** no Editor): `/e/challenge-join`; e quando alguém abre a
praça do desafio de uma semana na visão do mundo: `/e/plaza-visit`. E quando alguém cria um link **Passear aqui comigo** na visão do mundo: `/e/walk-link`; e quando um amigo chega por um deles: `/e/walk-joined`.

E na primeira vez que uma construção é publicada a partir deste navegador
(publicá-la de novo depois não envia nada):

- o tamanho dela, como uma de cinco faixas de blocos colocados diretamente,
  sem contar estruturas: `/e/publish-bricks-0`, `/e/publish-bricks-1`
  (de 1 a 9), `/e/publish-bricks-10` (de 10 a 49), `/e/publish-bricks-50`
  (de 50 a 199) ou `/e/publish-bricks-200` (200 ou mais). Nunca o número exato;
- `/e/second-build`, quando é a segunda construção publicada a partir deste
  navegador, o que acontece uma única vez;
- `/e/remix-published`, quando é uma cópia de uma construção que este
  navegador não publicou.

Isso é calculado a partir das construções que este navegador publicou, que
ele já guarda (veja "O que fica no seu dispositivo"); nada novo é guardado
para isso.

E quando o ForkBuild é aberto por um link de um dos próprios posts de
lançamento, que termina em `?ref=` e no nome do lugar onde foi publicado
(`hn`, `producthunt`, `reddit`, `itch`, `nostr`, `steem`, `blurt`, `edu` ou `github`; qualquer outro valor é ignorado): `/r/` e esse nome,
como `/r/hn`, uma vez. O app então tira `ref` do endereço, para que
recarregar ou repassar o endereço não o envie de novo. Isso mostra quais
posts trouxeram pessoas, e nada sobre quem elas são ou o que fizeram.

Cada uma envia só o caminho e o número aleatório: nunca o link, a
construção, o título dela ou quem a fez. Quais construções foram abertas por
um link fica só na memória da página aberta, e é esquecido quando ela fecha.

Nenhuma dessas solicitações é enviada:

- quando seu navegador envia Global Privacy Control ou Do Not Track;
- quando você desliga **Seus dados → Contagem diária de visitantes → Contar
  este navegador** (a escolha fica só neste navegador);
- de qualquer cópia do ForkBuild servida de outro lugar que não o site
  oficial, incluindo `localhost`.

Uma construção incorporada não consegue ler a escolha **Contar este
navegador**: ela não abre nenhum armazenamento, e os navegadores, de todo
modo, separam o armazenamento de um site dentro das páginas de outros sites.
Por isso `/e/embed-view` e `/e/embed-open` seguem só as outras duas regras:
nunca com Global Privacy Control ou Do Not Track, e só a partir do site
oficial.

O código está em `core/VisitorCount.js`,
`core/LaunchChannel.js`, `application/settings/CountDailyVisit.js`,
`application/settings/CountLaunchChannel.js`,
`application/settings/FunnelEventCounter.js`, `ui/counterHit.js`,
`ui/start.js` e `ui/embed/embedBoot.js`.

## Servidores com que o ForkBuild se comunica

Todo script, estilo e fonte vem do site de onde o app é servido (veja
[docs/Deployment.md](../../Deployment.md), em inglês). Uma coisa começa
sozinha: uns 10 segundos depois de o app abrir, e a cada poucos minutos
enquanto a aba dele está visível, ele lê anúncios novos dos relays do Nostr,
do gateway do Arweave e dos nós do Steem e do Blurt configurados em **Configurações de
rede** (docs/AnnouncementIndex.md). Ele só lê anúncios (pequenos ponteiros e
declarações assinadas), nunca conteúdo, e não publica nada. Todo o resto só
acontece quando você usa o recurso, e cada servidor pode ser trocado em
**Configurações de rede**. Cada servidor vê seu endereço IP e o que você
pede a ele.

| Quando | Servidor (padrão) | O que ele recebe |
| --- | --- | --- |
| O aplicativo abre no site oficial, no máximo uma vez por dia (veja "Contagem de visitantes") | GoatCounter (`forkbuild.goatcounter.com`) | uma solicitação de imagem com caminho fixo, sem referenciador e sem cookie |
| No site oficial, você copia ou compartilha um link para uma construção, abre um link compartilhado ou copia para o Editor uma construção aberta por um link (veja "Contagem de visitantes") | GoatCounter (`forkbuild.goatcounter.com`) | uma solicitação de imagem com caminho fixo que diz qual dos três momentos foi, sem referenciador e sem cookie |
| Você instala o ForkBuild pelo site oficial (veja "Contagem de visitantes") | GoatCounter (`forkbuild.goatcounter.com`) | uma solicitação de imagem com o caminho fixo `/e/installed`, sem referenciador e sem cookie |
| No site oficial, você copia o código para incorporar de uma construção, ou uma construção incorporada é mostrada ou aberta no ForkBuild (veja "Contagem de visitantes") | GoatCounter (`forkbuild.goatcounter.com`) | uma solicitação de imagem com um caminho fixo dizendo qual dos três casos foi, sem referenciador e sem cookie |
| No site oficial, você entra no desafio de construção semanal ou abre a praça dele (veja "Contagem de visitantes") | GoatCounter (`forkbuild.goatcounter.com`) | uma requisição de imagem com o caminho fixo `/e/challenge-join` ou `/e/plaza-visit`, sem referenciador e sem cookie |
| No site oficial, você cria um link **Passear aqui comigo** ou chega por um deles (veja "Contagem de visitantes") | GoatCounter (`forkbuild.goatcounter.com`) | uma solicitação de imagem com o caminho fixo `/e/walk-link` ou `/e/walk-joined`, sem referenciador e sem cookie |
| No site oficial, você publica uma construção pela primeira vez (veja "Contagem de visitantes") | GoatCounter (`forkbuild.goatcounter.com`) | uma requisição de imagem com um caminho fixo que indica a faixa de blocos, e mais uma para uma segunda construção ou um remix, sem referenciador e sem cookie |
| Você abre o site oficial pelo link de um post de lançamento (`?ref=…`, veja "Contagem de visitantes") | GoatCounter (`forkbuild.goatcounter.com`) | uma requisição de imagem com o caminho fixo `/r/<canal>`, sem referenciador e sem cookie |
| Você fica visível, ou procura alguém, em **Pares** | o servidor de encontro (`forkbuild-rendezvous.prazjp.workers.dev`) | a chave pública da sua identidade e uma oferta de conexão, guardadas por no máximo 15 minutos; a identidade que você procura; quando você se conecta a alguém que encontrou, sua resposta de conexão (que lista seus endereços de rede), que só essa pessoa pode buscar |
| Você entra numa sala pública, ou olha uma | o mesmo servidor de encontro | seu cartão de sala assinado (chave pública, nome de exibição, qual sala), guardado por no máximo 15 minutos e renovado enquanto você fica; qual sala você olha |
| Você copia para outro dispositivo (**Seus dados** → **Copiar para outro dispositivo**) ou abre o link dele no outro dispositivo | o servidor de encontro (`forkbuild-rendezvous.prazjp.workers.dev`) | uma chave pública criada só para esta cópia (não a da sua identidade) e uma oferta de conexão, guardadas por no máximo 10 minutos; do outro dispositivo, essa chave e a resposta de conexão. O que é copiado vai diretamente entre os dispositivos, criptografado com uma chave que só o código tem |
| Você cria um link **Passear aqui comigo** na visão do mundo, ou abre um | o servidor de encontro (`forkbuild-rendezvous.prazjp.workers.dev`) | uma chave pública criada só para este link (não a da sua identidade) e uma oferta de conexão, mantida enquanto o link funciona (no máximo 30 minutos) e oferecida de novo depois de cada amigo que entra; de um amigo, essa chave e a resposta de conexão dele. O Mundo, os dois nomes e o convite que conecta as suas duas sessões de pares vão diretamente entre os dispositivos |
| Uma conexão entre pares começa | servidores STUN (`stun.l.google.com`) | nada além de um pedido do seu endereço IP público |
| Você começa uma conexão entre pares, se o servidor de encontro oferece um relay | o `/turn-credentials` do servidor de encontro, e depois o relay TURN dele (Cloudflare) | um pedido de credenciais de relay de curta duração, no máximo cerca de uma vez por hora; o tráfego retransmitido é criptografado de ponta a ponta pelo WebRTC |
| O app está aberto e a aba visível (sincronização de anúncios em segundo plano) | relays do Nostr (`relay.damus.io`), um gateway do Arweave (`arweave.net`), nós do Steem (`api.steemit.com`), nós do Blurt (`rpc.blurt.blog`) | consultas pelas etiquetas de descoberta do ForkBuild: as etiquetas compartilhadas de Snapshot e de Comentários, e as regiões de nomes de lugares e células do mapa que você visitou |
| Você abre o Repositório ou a página de um autor | relays do Nostr (`relay.damus.io`), um gateway do Arweave (`arweave.net`), nós do Steem (`api.steemit.com`), nós do Blurt (`rpc.blurt.blog`) | uma consulta pela etiqueta compartilhada de publicações (`forkbuild-publication`); depois um pedido do registro assinado de cada publicação recém-anunciada, no máximo 20 por visita ou por **Verificar de novo** |
| Você abre o desafio de construção de uma semana (**Desafio**) | relays do Nostr (`relay.damus.io`), um gateway do Arweave (`arweave.net`), nós do Steem (`api.steemit.com`), nós do Blurt (`rpc.blurt.blog`) | uma consulta pela tag dessa semana (`forkbuild-tag:<tag>`); depois, uma requisição do registro assinado de cada participação recém-anunciada, no máximo 20 por visita ou **Verificar de novo** |
| Você distribui ou descobre publicações pelo Nostr | relays do Nostr (`relay.damus.io`) | os anúncios assinados que você publica; suas consultas |
| Você guarda ou busca conteúdo no Arweave | um gateway do Arweave (`arweave.net`) | o conteúdo que você publica; o que você busca |
| Você busca conteúdo no IPFS | um gateway IPFS (`ipfs.filebase.io`), ou seu próprio nó IPFS (`127.0.0.1:5001`) | o que você busca ou adiciona |
| Você fixa conteúdo num serviço de pinning remoto (*experimental*) | o serviço que você digitar | o conteúdo, e o token que você digita, que só fica até você fechar ou recarregar a página (nunca guardado); o endereço do serviço e os nomes de campo ficam neste dispositivo depois que você os salva em **Provedor de conteúdo** |
| Você guarda, anuncia ou ancora no Steem, ou descobre anúncios do Steem (*experimental*) | nós de API do Steem (`api.steemit.com`, depois `api.justyy.com`, depois `steemd.steemworld.org`); a assinatura passa pela extensão Steem Keychain | o nome da sua conta no Steem; o que você posta (anúncios, conteúdo guardado, âncoras) fica público na cadeia para sempre, e as edições deixam a versão anterior no histórico |
| Você guarda, anuncia ou ancora no Blurt, ou descobre postagens do Blurt (*experimental*) | nós de API do Blurt (`rpc.blurt.blog`, depois `rpc.beblurt.com`, depois `rpc.drakernoise.com`); a assinatura passa pela extensão Blurt Keychain (ou WhaleVault) | o nome da sua conta no Blurt, e as contas cujo histórico de postagens é lido (as que você segue, e todas as contas que este dispositivo viu postar com as tags do ForkBuild, lembradas neste dispositivo); o que você posta fica público na blockchain para sempre, na sua própria conta, e as edições deixam a versão anterior no histórico. Cada transação paga uma pequena taxa em BLURT da sua conta |
| Você distribui a Declaração assinada de uma publicação no Blurt (*experimental*) | o servidor de imagens do Blurt (`img-upload.blurt.blog`), diretamente ou, quando o navegador não consegue alcançá-lo, pelo relay `/blurt-image` do servidor de encontro, que não guarda nada | uma imagem 320×200 da construção para a prévia da postagem, assinada com sua chave de postagem do Blurt |
| Você distribui a Declaração assinada de uma publicação no Steem (*experimental*) | o servidor de imagens do Steem (`steemitimages.com`), diretamente ou, quando o navegador não consegue alcançá-lo, pelo relé `/steem-image` do servidor de encontro, que não guarda nada | uma imagem de 320×200 da construção para a prévia da postagem, assinada com sua chave de postagem do Steem |
| Alguém abre, ou um site mostra a prévia de, um link que leva a construção (`/b/…`) | o servidor de encontro (`forkbuild-rendezvous.prazjp.workers.dev`) | o link, que contém a construção e a Declaração assinada dela; ele não guarda nada |
| Alguém abre uma página com uma construção incorporada (`embed.html#…`) | o site de onde o ForkBuild é servido (`bowo-prasetyo.github.io`) | solicitações dos arquivos da incorporação, sem referenciador; nunca a construção, que fica na parte do endereço que os navegadores não enviam |
| Um site ou editor pergunta como incorporar um link `/b/…` (oEmbed) | o `/oembed` do servidor de encontro (`forkbuild-rendezvous.prazjp.workers.dev`) | o link, que contém a construção e sua Reivindicação assinada; ele não guarda nada |
| Você abre um link compartilhado de uma publicação (`#/view/…`) | o nó do Steem ou do Blurt, o gateway do Arweave ou o gateway IPFS que o link indica, e depois os substratos de anúncio para encontrar a construção | qual postagem, transação ou CID você abre |
| Você ancora ou verifica evidências no Bitcoin (*experimental*) | uma API Esplora (`blockstream.info`) | a transação que você transmite ou consulta |
| Você verifica evidências na Base (*experimental*) | um endpoint JSON-RPC da Base (`mainnet.base.org`) | a transação que você consulta |
| Você conecta uma carteira de navegador (*experimental*) | a extensão de carteira que você escolher | o que ela pedir para você aprovar |

O ForkBuild nunca envia sua chave privada, sua frase secreta nem seus
documentos salvos para nenhum desses servidores.

**Um link que leva a construção** (criado por **Copiar link** ou
**Compartilhar…** antes de a construção ser distribuída) carrega seu Mundo
compartilhado assinado e a própria construção. Ele aponta para o servidor de
encontro (`forkbuild-rendezvous.prazjp.workers.dev/b/…`) para que
aplicativos de conversa e redes sociais possam mostrar o título da
construção e uma imagem dela: abrir o link, ou um site mostrar a prévia
dele, o envia, e com ele a construção, para esse servidor, que confere a
assinatura, desenha a imagem, leva as pessoas ao aplicativo (`#/s/…`, uma
parte do endereço que os navegadores nunca enviam a um servidor) e não
guarda nada. A Cloudflare, que roda o servidor, pode registrar os endereços
pedidos. Criar um link não contata nada. Quem tiver o link pode ver a
construção, o título, a descrição e o nome do autor dela, e a chave pública
da sua identidade, como em qualquer Mundo compartilhado que você
distribuir.

**Uma construção incorporada** (o código que **Incorporar** copia: um
`<iframe>` de `embed.html#…` no site de onde o ForkBuild é servido) leva o
mesmo: seu Mundo compartilhado assinado e a construção. A página onde ele é
colado carrega a incorporação desse site, que não fica sabendo nem da
construção (ela fica na parte do endereço que os navegadores nunca enviam a
um servidor) nem da página ao redor (o quadro não envia referenciador). No
navegador de quem lê, a incorporação confere a assinatura e a construção,
mostra a construção e não guarda nada; ela não inicia nenhuma das conexões
do aplicativo, então nenhum par, relay ou outra rede é contatado. Quem pode
ver a página pode ver a construção, como acontece com o link.

**Os relays só são usados quando precisa.** Uma conexão sempre tenta primeiro
um caminho direto, depois um encontrado pelo STUN, e só recorre ao relay TURN
quando nenhum dos dois funciona. Enquanto você espera numa sala, as ofertas
que seu dispositivo deixa prontas nunca pedem credenciais de relay, então
ficar numa sala não gasta a cota de relay que o servidor de encontro
distribui por mês; quem se conecta a você pede uma, se precisar.

## Notificações neste dispositivo

Se você ativar **Avisar neste dispositivo** (no painel 🔔), seu dispositivo
mostra sozinho suas notificações novas enquanto o ForkBuild está aberto
numa aba em segundo plano ou como aplicativo instalado. Nenhum serviço de
push é usado e nada é enviado para lugar nenhum para isso: a página aberta
entrega a notificação ao seu navegador, que a mostra pelo seu sistema
operacional. O texto da notificação (por exemplo, o título de uma
construção e o nome de quem a fez) pode então ficar no histórico de
notificações do seu dispositivo, como com qualquer aplicativo. Desative no
mesmo painel, ou bloqueie as notificações do ForkBuild nas configurações do
site no navegador.

## Se você roda sua própria cópia

Uma implantação decide os padrões acima: o servidor de encontro dela
(`peer/RendezvousConfig.js`), se esse servidor oferece um relay TURN
(`server/rendezvous-worker/README.md`) e os outros padrões em
**Configurações de rede**. O servidor de encontro padrão só aceita a origem
do site oficial, então uma cópia hospedada em outro lugar precisa do seu
próprio (veja [docs/Deployment.md](../../Deployment.md), em inglês). Se você
hospeda o ForkBuild para outras pessoas, atualize esta página com o nome dos
seus servidores.

A contagem de visitantes só funciona no site oficial, então uma cópia
hospedada em outro lugar não conta nada. Para contar seus próprios
visitantes, mude os endereços em `core/VisitorCount.js` e a entrada
`img-src` da Content Security Policy do `index.html`.
