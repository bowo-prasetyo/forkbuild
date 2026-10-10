<!-- translation-of: docs/user/10-NetworkSettings.md source-hash: 030d653a072ce0a8 -->
# 10 — Configurações de rede

<!-- languages -->
[English](../10-NetworkSettings.md) · [Deutsch](../de/10-NetworkSettings.md) · [Español](../es/10-NetworkSettings.md) · [Français](../fr/10-NetworkSettings.md) · [Bahasa Indonesia](../id/10-NetworkSettings.md) · [日本語](../ja/10-NetworkSettings.md) · [한국어](../ko/10-NetworkSettings.md) · **Português (Brasil)**
<!-- /languages -->

**Configurações de rede**, na barra superior, reúne links para todas as
páginas que controlam com quais servidores o ForkBuild conversa. A maioria
das pessoas nunca precisa mudar nada aqui: os padrões já funcionam. Venha
aqui quando um servidor cair, quando você rodar o seu próprio, ou para
escolher onde suas publicações são guardadas e anunciadas.

Para o que cada servidor fica sabendo sobre você, veja
[Privacidade](Privacy.md).

## As páginas

| Página | Rota | O que define |
|---|---|---|
| **Provedor de conteúdo** | `/settings/content-provider` | Onde **Armazenar em …** e **Usar o provedor preferido** guardam conteúdo novo, e para qual nó IPFS ele vai — veja [abaixo](#provedor-de-conteúdo) |
| **Provedor de anúncio / descoberta** | `/settings/announcement-discovery-provider` | Para onde vão seus anúncios por padrão: Nostr, Arweave, Steem ou Blurt — veja [abaixo](#provedor-de-anúncio--descoberta) |
| **Provedor de prova / ancoragem** | `/settings/anchor-provider` | Onde **Ancorar em …** ancora — veja [abaixo](#provedor-de-prova--ancoragem) |
| **Gateway do Arweave** | `/settings/arweave-gateway` | Gateways para ler conteúdo do Arweave — veja [abaixo](#gateway-do-arweave) |
| **Gateway IPFS** | `/settings/ipfs-gateway` | Gateways para ler conteúdo IPFS — veja [abaixo](#gateway-ipfs) |
| **Endpoint do Bitcoin** *(experimental)* | `/settings/bitcoin-esplora` | O serviço que a ancoragem no Bitcoin usa — veja [abaixo](#endpoint-do-bitcoin) |
| **Relays do Nostr** | `/settings/nostr-relay` | Relays para publicar e descobrir pelo Nostr — veja [abaixo](#relays-do-nostr) |
| **Steem** *(experimental)* | `/settings/steem` | Sua conta no Steem, e de onde o Steem é lido — veja [abaixo](#steem) |
| **Blurt** *(experimental)* | `/settings/blurt` | Sua conta no Blurt, e de onde o Blurt é lido — veja [abaixo](#blurt) |
| **Servidores STUN** / **Servidor TURN** | `/settings/stun`, `/settings/turn-server` | Ajuda para conexões entre pares — veja [TURN](07-PeerConnectionsAndFriends.md#turn-retransmitindo-conexões-entre-pares-que-não-acham-um-caminho-direto) |
| **Servidores de encontro** | `/settings/rendezvous` | Como os pares se encontram — veja [Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md) |

## Mostrar ferramentas experimentais

No alto da página, **Mostrar ferramentas experimentais** mostra as partes
do ForkBuild que são **experimentais**: aqui, a página **Endpoint do
Bitcoin**, e na [página Publicações](09-PublicationsAndEvidence.md#a-página-publicações), o painel **Ferramentas de
carteira e arquivo**. Fica desativado até você ativá-lo e é salvo
neste dispositivo assim que você o muda. Nada do que você precisa para
construir, publicar ou compartilhar fica oculto.

Logo abaixo, **Carteiras** tem um botão para cada carteira com que o
ForkBuild pode ancorar: **Carteira de Bitcoin** e **Carteira da Base**. Cada
um fica desativado até você ativá-lo, e é salvo neste dispositivo. Enquanto
um estiver desativado, a página Publicações não oferece nem carrega os passos
dessa carteira, e o Bitcoin não é oferecido como
[Provedor de prova / ancoragem](#provedor-de-prova--ancoragem). As âncoras já criadas no
Bitcoin ou na Base continuam sendo verificadas e mostradas. Desativar uma
carteira vale a partir da próxima vez que a página Publicações abrir.

## Como todas as páginas se comportam

- **Recarregue depois de salvar.** As mudanças passam a valer na próxima vez
  que o app carregar (as contas do Steem e do Blurt são as exceções). Uma Visão do
  mundo ou um Editor aberto continua usando as configurações antigas até
  você recarregar.
- Cada página tem seu próprio **Salvar**. Um salvamento que falha mostra o
  motivo e deixa a configuração anterior como estava; um bem-sucedido
  mostra "Salvo.".
- As listas de opções aparecem em ordem alfabética.
- **As listas de servidores vêm com padrões.** As páginas Gateway do
  Arweave, Gateway IPFS, Endpoint do Bitcoin, Relays do Nostr, Steem, Blurt, STUN e
  Servidores de encontro começam com vários servidores públicos gratuitos,
  para que as coisas continuem funcionando quando um cai. A página diz se
  está "Usando os … padrão" ou "Usando os … que você salvou". Sem nada
  salvo, a caixa de texto traz os padrões, um por linha, prontos para
  editar. **Salvar** fica desabilitado até você mudar algo, para que você
  continue recebendo os padrões melhorados das versões futuras.
  **Restaurar padrões** remove sua lista.
- **A validação só confere o formato.** Salvar recusa tudo o que não for
  uma URL bem formada do tipo certo, mas não confere se o servidor
  funciona; um servidor errado aparece depois como uma leitura que falhou.
- **Os padrões são serviços de terceiros.** Cada um vê seu endereço IP e o
  que o app pede a ele. O conteúdo lido por um gateway é conferido com o
  hash do conteúdo, então um gateway não consegue trocar os bytes.

## Provedor de conteúdo

Escolha em qual armazenamento **Armazenar em …** (o primeiro botão do bloco
**Conteúdo** de uma publicação) e **Usar o provedor preferido** criam um
Posicionamento de Snapshot (veja
[Usando um provedor preferido](11-EvidenceAndStorage.md#usando-um-provedor-preferido)),
entre os backends que este dispositivo registrou, e clique em **Salvar**.
**Local** não aparece, já que toda publicação já fica guardada neste
dispositivo.

**IPFS (pinning remoto)** *(experimental)* sempre aparece. Ele usa o
serviço configurado em **Serviço de pinning remoto**, abaixo: com um
configurado, **Armazenar em IPFS (pinning remoto)** e **Usar o provedor
preferido** colocam o conteúdo lá, como um posicionamento IPFS comum; sem
nenhum, avisam que nenhum está configurado. Escolhê-lo também deixa o
pinning remoto pré-selecionado como armazenamento em toda caixa de diálogo
**Distribuir**.

Uma segunda seção, **Nó IPFS**, define o nó para onde vão os novos
posicionamentos IPFS. O padrão é um nó Kubo local em
`http://127.0.0.1:5001`. Digite a URL da API de outro nó e **Salvar**, ou
**Usar o padrão da implantação** para voltar. Isso não afeta a leitura de
conteúdo IPFS, que usa a lista de [Gateway IPFS](#gateway-ipfs).

Uma terceira seção, **Serviço de pinning remoto** *(experimental)*, define
o serviço para o qual o IPFS (pinning remoto) envia: o **Endereço** e, se o
serviço precisar, o **Campo da requisição** para o arquivo e o **Campo da
resposta** com o CID. **Salvar** guarda isso neste dispositivo. O
**Token** só fica até você fechar ou recarregar a página, e nunca é salvo;
um serviço que precise de um recusa envios até você informá-lo. Toda caixa
de diálogo **Distribuir** e a página Publicações começam com esse serviço,
e você ainda pode trocá-lo ali. **Esquecer serviço** o remove.

## Provedor de anúncio / descoberta

Escolha **Arweave**, **Blurt** (experimental), **Nostr** ou **Steem** (experimental) como o lugar
padrão onde suas publicações (Mundos compartilhados, atribuições de planta e
declarações de nomes de lugares), Snapshots e comentários são anunciados. É
só um padrão: toda caixa de diálogo **Distribuir**, o seletor de Distribuição
de cada cartão no Repositório e o seletor de rede ao lado de **Publicar
comentário** começam nele, e você pode trocá-los para uma ação.
Encontrar o conteúdo de outras pessoas sempre pesquisa todos eles.

Uma segunda seção, **Comentários**, dá aos comentários um padrão próprio.
**Igual ao provedor de anúncio / descoberta acima**, a opção inicial, os
mantém na escolha acima. Escolha uma rede, ou **Somente local e pares** para
manter os comentários fora de qualquer rede, sem precisar de conta em
nenhuma. Todo formulário de comentário começa nela, e você ainda pode
trocá-la em um comentário ao lado de **Publicar comentário**.

## Provedor de prova / ancoragem

Escolha onde **Ancorar em …** (o primeiro botão do bloco
**Prova / ancoragem** de uma publicação) cria evidências externas:
**Arweave**, **Bitcoin** *(experimental)*, **Blurt** *(experimental)* ou **Steem** *(experimental)*, conforme o que este dispositivo tiver
registrado. A Base nunca aparece, porque toda âncora na Base exige que você
revise e assine uma transação na carteira. Com o Bitcoin escolhido, não há
botão **Ancorar em …**: o bloco mostra todas as opções e aponta para os
passos da carteira; veja
[O fluxo de âncora no Bitcoin](11-EvidenceAndStorage.md#o-fluxo-de-âncora-no-bitcoin)
para âncoras de verdade no Bitcoin.

## Gateway do Arweave

Gateways para ler conteúdo do Arweave, uma URL `http://` ou `https://` por
linha. Os padrões são `https://arweave.net`, `https://ardrive.net` e
`https://permagate.io`.

Eles são tentados em ordem: uma leitura só passa para o próximo gateway se o
atual estiver inacessível ou devolver um erro. O conteúdo do Arweave é
endereçado pelo id da transação, então todos os gateways devolvem os mesmos
bytes.

Esta lista é usada ao recuperar o material de uma publicação a partir de uma
origem descentralizada e ao resolver ou materializar um Posicionamento de
Snapshot no Arweave. Ela não muda para onde seu próprio conteúdo é enviado.
As âncoras no Arweave usam o primeiro gateway da lista para criar e
verificar.

## Gateway IPFS

Gateways para ler conteúdo IPFS, uma URL por linha, tentados em ordem como
os do Arweave. Os padrões são `https://ipfs.filebase.io`, `https://gateway.pinata.cloud`, `https://ipfs.io`, `https://dweb.link` e `https://4everland.io`.

Esta lista é usada ao resolver ou materializar um Posicionamento de
Snapshot no IPFS, para **Verificar conteúdo no IPFS**, para abrir links compartilhados para
conteúdo no IPFS e quando o Repositório e o desafio semanal leem
construções encontradas nas redes cuja Declaração assinada está no IPFS.
Ela não muda onde o seu próprio conteúdo é fixado.

Alguns gateways, entre eles `https://ipfs.io` e `https://dweb.link`,
recusam requisições de páginas web para certos conteúdos, ou as bloqueiam
atrás de uma verificação anti-robôs; os padrões são operados por
organizações diferentes, então uma leitura passa para o próximo. Se **Verificar** ou
**Resolver** continuar falhando com "Failed to fetch" para um conteúdo que você sabe
que existe, adicione no topo o gateway do seu serviço de fixação. Uma
lista salva antes de 8 de outubro de 2026 mantém a própria ordem:
**Restaurar padrões** traz de volta os novos padrões.

## Endpoint do Bitcoin

*Experimental.* A API compatível com Esplora que a ancoragem no Bitcoin usa
para transmitir transações, conferir confirmações, consultar os fundos da
carteira e verificar a prova OP_RETURN de uma âncora. Uma URL `http://` ou
`https://` por linha; os padrões são `https://blockstream.info/api` e
`https://mempool.space/api`.

Uma consulta usa o primeiro endpoint que responder. Uma transmissão só passa
para o próximo endpoint se o anterior estava inacessível, nunca depois que
um rejeitou a transação.

## Relays do Nostr

Relays para tudo o que o ForkBuild publica ou descobre pelo Nostr:
publicações (Mundos compartilhados, atribuições de planta e declarações de
nomes de lugares), Snapshots e comentários. Uma URL `ws://` ou `wss://` por
linha; os padrões são `wss://relay.damus.io`, `wss://nos.lol` e
`wss://relay.primal.net`. **Salvar** substitui a lista inteira, e a recusa
se alguma linha não for uma URL válida.

Ao contrário dos gateways, os relays não são tentados em ordem: os anúncios
vão para todos os relays ao mesmo tempo e a descoberta pergunta a todos,
então cada relay a mais torna seu conteúdo encontrável por mais gente, mesmo
quando outro está fora do ar. Não há status por relay aqui; um resultado de
**Distribuir** lista uma linha de **Descoberta** por relay.

## Steem

*Experimental.* Defina **Sua conta no Steem** em **Postagem** (isso vale na
hora, sem recarregar), necessária para postar ou guardar no Steem — veja
[Steem](11-EvidenceAndStorage.md#steem). Ler do Steem não exige conta. O
resto da página define de onde o Steem é lido:

- **Nós de API**, uma URL `https://` por linha (padrões
  `https://api.steemit.com`, `https://api.justyy.com` e `https://steemd.steemworld.org`), tentados em ordem.
- **Contas dos tópicos**, uma por linha (padrão `forkbuild`): de quem são os
  tópicos mensais de descoberta lidos. Adicione outra se uma comunidade
  mantiver seus próprios tópicos.
- **Primeiro mês a ler** (padrão setembro de 2026): o ForkBuild lê todos os
  meses desde então até agora, até os últimos 36 meses.

Quando nenhum nó do Steem pode ser alcançado, **Procurar comentários novos**
e a descoberta de Snapshots dizem que o Steem está indisponível, em vez de
informar que nada foi encontrado.

## Blurt

*Experimental.* Defina **Sua conta do Blurt** em **Publicação** (isso vale
na hora, sem recarregar), necessária para postar, guardar ou ancorar no
Blurt — veja [Blurt](11-EvidenceAndStorage.md#blurt). Ler do Blurt não
exige conta. O resto da página define de onde o Blurt é lido:

**Nós de API**, uma URL `https://` por linha (padrões
`https://rpc.blurt.blog`, `https://rpc.beblurt.com` e `https://rpc.drakernoise.com`), tentados em ordem.
O ForkBuild encontra as postagens pelo Nexus, o índice de busca do Blurt,
que guarda toda postagem por mais antiga que seja, e pula um nó que não o
ofereça. Quando nenhum nó oferece o Nexus, ele recorre à própria lista de
tags do Blurt, que guarda uma postagem só até ela ser paga, depois de sete
dias, e encontra as postagens mais antigas no histórico das contas que viu
postar com a tag neste dispositivo. Mesmo quando o Nexus responde, o
ForkBuild lê também a lista de tags, caso o Nexus deixe uma postagem de
fora; se deixar, ele lê também o histórico dessa conta, para que as
postagens mais antigas dela também não fiquem de fora.

Quando nenhum nó do Blurt pode ser alcançado, **Procurar comentários novos**
e a descoberta de Snapshots dizem que o Blurt está indisponível, em vez de
informar que nada foi encontrado.
