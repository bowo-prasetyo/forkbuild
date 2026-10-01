<!-- translation-of: docs/Privacy.md source-hash: 91943196a1dbc4fd -->
# Privacidade

<!-- languages -->
[English](../../Privacy.md) · [Deutsch](../de/Privacy.md) · [Español](../es/Privacy.md) · [Bahasa Indonesia](../id/Privacy.md) · [日本語](../ja/Privacy.md) · **Português (Brasil)**
<!-- /languages -->

O ForkBuild não tem contas nem analytics. Ele guarda seu trabalho no seu
próprio navegador e só conversa com outros computadores nos recursos que
precisam disso. Esta página lista o que ele guarda, e todos os servidores
com que ele pode se comunicar e quando.

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
  de rede**.

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

## O que outras pessoas podem ver

- **Tudo o que você publica** é público: o conteúdo, o título, a descrição e
  a licença, e a chave pública da sua identidade, que assina a publicação.
  Depois que outras pessoas têm uma cópia, você não pode recuperá-la.
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

## Servidores com que o ForkBuild se comunica

Todo script, estilo e fonte vem do site de onde o app é servido (veja
[docs/Deployment.md](../../Deployment.md), em inglês). Uma coisa começa
sozinha: uns 10 segundos depois de o app abrir, e a cada poucos minutos
enquanto a aba dele está visível, ele lê anúncios novos dos relays do Nostr,
do gateway do Arweave e dos nós do Steem configurados em **Configurações de
rede** (docs/AnnouncementIndex.md). Ele só lê anúncios (pequenos ponteiros e
declarações assinadas), nunca conteúdo, e não publica nada. Todo o resto só
acontece quando você usa o recurso, e cada servidor pode ser trocado em
**Configurações de rede**. Cada servidor vê seu endereço IP e o que você
pede a ele.

| Quando | Servidor (padrão) | O que ele recebe |
| --- | --- | --- |
| Você fica visível, ou procura alguém, em **Pares** | o servidor de encontro (`forkbuild-rendezvous.prazjp.workers.dev`) | a chave pública da sua identidade e uma oferta de conexão, guardadas por no máximo 15 minutos; a identidade que você procura; quando você se conecta a alguém que encontrou, sua resposta de conexão (que lista seus endereços de rede), que só essa pessoa pode buscar |
| Você entra numa sala pública, ou olha uma | o mesmo servidor de encontro | seu cartão de sala assinado (chave pública, nome de exibição, qual sala), guardado por no máximo 15 minutos e renovado enquanto você fica; qual sala você olha |
| Uma conexão entre pares começa | servidores STUN (`stun.l.google.com`) | nada além de um pedido do seu endereço IP público |
| Você começa uma conexão entre pares, se o servidor de encontro oferece um relay | o `/turn-credentials` do servidor de encontro, e depois o relay TURN dele (Cloudflare) | um pedido de credenciais de relay de curta duração, no máximo cerca de uma vez por hora; o tráfego retransmitido é criptografado de ponta a ponta pelo WebRTC |
| O app está aberto e a aba visível (sincronização de anúncios em segundo plano) | relays do Nostr (`relay.damus.io`), um gateway do Arweave (`arweave.net`), nós do Steem (`api.steemit.com`) | consultas pelas etiquetas de descoberta do ForkBuild: as etiquetas compartilhadas de Snapshot e de Comentários, e as regiões de nomes de lugares e células do mapa que você visitou |
| Você distribui ou descobre publicações pelo Nostr | relays do Nostr (`relay.damus.io`) | os anúncios assinados que você publica; suas consultas |
| Você guarda ou busca conteúdo no Arweave | um gateway do Arweave (`arweave.net`) | o conteúdo que você publica; o que você busca |
| Você busca conteúdo no IPFS | um gateway IPFS (`ipfs.io`), ou seu próprio nó IPFS (`127.0.0.1:5001`) | o que você busca ou adiciona |
| Você fixa conteúdo num serviço de pinning remoto (*experimental*) | o serviço que você digitar | o conteúdo, e o token que você digita para aquele envio (nunca guardado) |
| Você guarda, anuncia ou ancora no Steem, ou descobre anúncios do Steem (*experimental*) | nós de API do Steem (`api.steemit.com`, depois `api.justyy.com`); a assinatura passa pela extensão Steem Keychain | o nome da sua conta no Steem; o que você posta (anúncios, conteúdo guardado, âncoras) fica público na cadeia para sempre, e as edições deixam a versão anterior no histórico |
| Você distribui a Declaração assinada de uma publicação no Steem (*experimental*) | o servidor de imagens do Steem (`steemitimages.com`) | uma imagem de 320×200 da construção para a prévia da postagem, assinada com sua chave de postagem do Steem |
| Você abre um link compartilhado de uma publicação (`#/view/…`) | o nó do Steem, o gateway do Arweave ou o gateway IPFS que o link indica, e depois os substratos de anúncio para encontrar a construção | qual postagem, transação ou CID você abre |
| Você ancora ou verifica evidências no Bitcoin (*experimental*) | uma API Esplora (`blockstream.info`) | a transação que você transmite ou consulta |
| Você verifica evidências na Base (*experimental*) | um endpoint JSON-RPC da Base (`mainnet.base.org`) | a transação que você consulta |
| Você conecta uma carteira de navegador (*experimental*) | a extensão de carteira que você escolher | o que ela pedir para você aprovar |

O ForkBuild nunca envia sua chave privada, sua frase secreta nem seus
documentos salvos para nenhum desses servidores.

**Os relays só são usados quando precisa.** Uma conexão sempre tenta primeiro
um caminho direto, depois um encontrado pelo STUN, e só recorre ao relay TURN
quando nenhum dos dois funciona. Enquanto você espera numa sala, as ofertas
que seu dispositivo deixa prontas nunca pedem credenciais de relay, então
ficar numa sala não gasta a cota de relay que o servidor de encontro
distribui por mês; quem se conecta a você pede uma, se precisar.

## Se você roda sua própria cópia

Uma implantação decide os padrões acima: o servidor de encontro dela
(`peer/RendezvousConfig.js`), se esse servidor oferece um relay TURN
(`server/rendezvous-worker/README.md`) e os outros padrões em
**Configurações de rede**. O servidor de encontro padrão só aceita a origem
do site oficial, então uma cópia hospedada em outro lugar precisa do seu
próprio (veja [docs/Deployment.md](../../Deployment.md), em inglês). Se você
hospeda o ForkBuild para outras pessoas, atualize esta página com o nome dos
seus servidores.
