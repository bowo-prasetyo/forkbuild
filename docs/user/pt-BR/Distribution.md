<!-- translation-of: docs/user/Distribution.md source-hash: fe119546bc539030 -->
# Distribuindo seu trabalho

<!-- languages -->
[English](../Distribution.md) · [Deutsch](../de/Distribution.md) · [Español](../es/Distribution.md) · [Français](../fr/Distribution.md) · [Bahasa Indonesia](../id/Distribution.md) · [日本語](../ja/Distribution.md) · [한국어](../ko/Distribution.md) · **Português (Brasil)**
<!-- /languages -->

Tudo o que o ForkBuild cria começa no seu próprio dispositivo.
**Distribuir** é o passo separado e opcional que coloca seu trabalho em
redes descentralizadas, para que pessoas que não estão conectadas a você
possam encontrá-lo, buscá-lo e conferi-lo. Esta página reúne em um só lugar
o que você pode distribuir, para onde pode ir e do que você precisa. Cada
seção tem um link para o guia que explica os detalhes.

## Publicar, compartilhar, distribuir: três coisas diferentes

| Ação | Para onde vai | Quem recebe | Guia |
|---|---|---|---|
| **Publicar** | Só para este dispositivo | Ninguém mais, por enquanto | [Publicando sua criação](04-PublishingAndForking.md#publicando-sua-criação) |
| **Compartilhar com pares** | Direto para as pessoas com quem você está conectado | Seus pares conectados, enquanto você estiver online | [Compartilhando com pares conectados](04-PublishingAndForking.md#compartilhando-com-pares-conectados) |
| **Distribuir** | Redes descentralizadas (IPFS, Arweave, Nostr, Steem, Blurt) | Qualquer pessoa, sem precisar estar conectada a você | Esta página |

Publicar nunca envia nada a lugar nenhum por si só, e compartilhar com pares
não é distribuir: os pares guardam uma cópia só enquanto quiserem, e mais
ninguém consegue encontrá-la. Cada distribuição é um clique próprio e
explícito.

## Os três papéis que uma rede pode cumprir

Distribuir usa até três tipos de rede, cada um escolhido separadamente:

| Papel | Como… | O que faz | Opções |
|---|---|---|---|
| **Conteúdo** (Armazenamento) | O lugar onde ficam guardados os exemplares impressos | Guarda os bytes, como os blocos do seu Mundo, para que outras pessoas possam buscá-los | **Arweave**, **Blurt** *(experimental)*, **IPFS (Local Kubo)**, **IPFS (Remote Pinning)**, **Steem** *(experimental)* |
| **Anúncio / descoberta** | Uma ficha no catálogo de uma biblioteca | Publica um pequeno aviso assinado dizendo que seu trabalho existe e onde está a cópia dele, para que outras pessoas possam encontrá-lo | **Nostr**, **Arweave**, **Steem** *(experimental)*, **Blurt** *(experimental)* |
| **Prova / ancoragem** *(experimental, opcional)* | O carimbo de um cartório | Grava o hash do seu conteúdo em uma blockchain, como evidência de que ele existia naquele momento. Não guarda nem anuncia nada. | **Bitcoin**, **Arweave**, **Base**, **Steem**, **Blurt** |

Armazenar sem anunciar significa que ninguém sabe onde procurar; um anúncio
sem armazenamento aponta para o nada. **Distribuir** faz as duas coisas com
um clique. Ancorar é um extra, feito separadamente na página
**Publicações**.

Defina sua escolha habitual para cada papel em
[Configurações de rede](10-NetworkSettings.md):
[Provedor de conteúdo](10-NetworkSettings.md#provedor-de-conteúdo),
[Provedor de anúncio / descoberta](10-NetworkSettings.md#provedor-de-anúncio--descoberta)
e [Provedor de prova / ancoragem](10-NetworkSettings.md#provedor-de-prova--ancoragem).
Elas só preenchem a primeira opção de cada seletor; salvá-las nunca envia
nada.

## O que você pode distribuir

| O quê | Conteúdo | Anúncio / descoberta | Prova / ancoragem | Onde você faz |
|---|---|---|---|---|
| **A Declaração assinada do seu Mundo** (o registro assinado de um Mundo publicado, chamado Mundo compartilhado) | Arweave, IPFS, Steem ou Blurt | Nostr, Arweave, Steem ou Blurt | — | **Distribuir** depois de publicar no Editor; **Meu Mundo compartilhado** na Visão do mundo; a página **Publicações** |
| **O Snapshot do seu Mundo** (os blocos dele), com o lugar onde você o posicionou | Arweave, IPFS, Steem ou Blurt | Nostr, Arweave, Steem ou Blurt | — | Os mesmos diálogos de **Distribuir** (**Distribuir só o Snapshot** para só esta metade) |
| **O hash do conteúdo de qualquer publicação** (um Mundo, uma declaração de autoria ou um nome de lugar) | — | — | Bitcoin, Arweave, Base, Steem ou Blurt | O card da publicação na página **Publicações** |
| **A autoria de uma estrutura** (Atribuição de planta) | Arweave, IPFS, Steem ou Blurt | Nostr, Arweave, Steem ou Blurt | — | **Distribuir** no painel **Informações** da estrutura, oferecido assim que você usa **Publicar na rede**; a página **Publicações** |
| **Um nome de lugar** (Declaração de nome de lugar) | Arweave, IPFS, Steem ou Blurt | Nostr, Arweave, Steem ou Blurt | — | **Distribuir** no painel de nomes da Visão do mundo, oferecido assim que você usa **Publicar um nome** (anuncia o nome na rede que você escolher); a página **Publicações** para qualquer uma dessas opções |
| **Um comentário** sobre uma publicação | — | Nostr, Arweave, Steem ou Blurt, ou nenhuma (**Somente local e pares**) | — | **Publicar comentário**, no Repositório ou na Visão do mundo, na rede escolhida ao lado; depois, **Distribuir** embaixo do seu próprio comentário |

O Snapshot de um Mundo leva junto o seu posicionamento assinado, então quem o
busca vê a construção exatamente onde você a colocou.

Detalhes:

- Declaração assinada e Snapshot:
  [Distribuindo direto do Editor](04-PublishingAndForking.md#distribuindo-direto-do-editor),
  [Meu Mundo compartilhado](03-WorldView.md#meu-mundo-compartilhado--distribuindo-seu-próprio-snapshot-sem-precisar-de-pares)
  e o próprio [diálogo Distribuir](03-WorldView.md#encontros-no-mundo--publicações-e-avatares-que-seus-pares-estão-compartilhando).
- A página Publicações:
  [Distribuindo pela página Publicações](09-PublicationsAndEvidence.md#distribuindo-pela-página-publicações),
  [Posicionamentos de snapshot](11-EvidenceAndStorage.md#posicionamentos-de-snapshot) e
  [Publicação no IPFS](11-EvidenceAndStorage.md#publicação-no-ipfs).
- Ancoragem: [Evidências externas](11-EvidenceAndStorage.md#evidências-externas),
  [O fluxo de âncora no Bitcoin](11-EvidenceAndStorage.md#o-fluxo-de-âncora-no-bitcoin)
  e [O fluxo de âncora na Base](11-EvidenceAndStorage.md#o-fluxo-de-âncora-na-base).
- Autoria: [Declarando a autoria de uma estrutura](09-PublicationsAndEvidence.md#declarando-a-autoria-de-uma-estrutura).
- Nomes de lugares: [Dando nome a um lugar](09-PublicationsAndEvidence.md#dando-nome-a-um-lugar).
- Comentários: [Como os comentários viajam](09-PublicationsAndEvidence.md#como-os-comentários-viajam).

## O que fica com você ou com seus pares

Nem tudo o que você cria é distribuído. Isto nunca vai para as redes acima:

| O quê | Para onde vai | Guia |
|---|---|---|
| Um Mundo que você **compartilha com pares** | Só seus pares conectados | [Compartilhando com pares conectados](04-PublishingAndForking.md#compartilhando-com-pares-conectados) |
| A posição ao vivo e a aparência do seu avatar | Pares conectados, conforme suas configurações de visibilidade permitirem | [Quem pode ver você](06-AvatarsAndPresence.md#quem-pode-ver-você-duas-configurações-independentes) |
| Mensagens de chat e chamadas de voz | Direto para o amigo com quem você está falando | [Conversas](08-ChatAndConversations.md) |
| Âncoras e posicionamentos que você troca com **Sincronizar com os pares** | Só seus pares conectados | [Descentralização num relance](09-PublicationsAndEvidence.md#descentralização-num-relance) |
| Sua identidade, estruturas salvas, veículos e animais que você carrega, amigos, configurações | Este dispositivo, a menos que você os exporte ou faça backup | [Seus dados](13-YourData.md) |

Para levar isso a outro dispositivo, ou entregar a alguém, use as
exportações e o backup completo em [Seus dados](13-YourData.md).

## Do que cada rede precisa

A distribuição é assinada por uma extensão de navegador ou carteira que você
mesmo instala; o ForkBuild nunca vê suas chaves. Sem a extensão
correspondente, a tentativa termina com um aviso de que não pôde ser
concluída.

| Rede | Papéis | Você precisa de | Limites e observações |
|---|---|---|---|
| **Nostr** | Anúncio / descoberta | Uma extensão de assinatura do Nostr, como a nos2x | Anuncia em todos os relays de [Relays do Nostr](10-NetworkSettings.md#relays-do-nostr) de uma vez; mais relays, mais gente pode encontrar você |
| **Arweave** | Conteúdo, anúncio / descoberta, prova / ancoragem | Uma extensão de carteira do Arweave, como a Wander | Guarda até 256 KB por Snapshot, cerca de oito mil blocos; qualquer coisa maior é recusada antes da assinatura. Permanente: continua disponível com o seu computador desligado. Um envio novo pode levar alguns minutos para chegar aos gateways. |
| **IPFS (Local Kubo)** | Conteúdo | Seu próprio nó IPFS, por padrão em `http://127.0.0.1:5001` | Sem limite de tamanho. Disponível só enquanto seu nó estiver online, a menos que outra pessoa o fixe. |
| **IPFS (Remote Pinning)** *(experimental)* | Conteúdo | Uma conta em um serviço de pinning compatível com o Pinata | Sem limite de tamanho. Configure o serviço uma vez em [Provedor de conteúdo](10-NetworkSettings.md#provedor-de-conteúdo); o token é pedido uma vez por visita e nunca é salvo. |
| **Steem** *(experimental)* | Conteúdo, anúncio / descoberta, prova / ancoragem | A extensão Steem Keychain com sua chave de postagem, e sua conta em [Configurações de rede → Steem](10-NetworkSettings.md#steem) | As postagens são respostas aos tópicos mensais do ForkBuild; uma aprovação por postagem. Guarda cerca de 2.500 blocos por postagem, até cerca de 30.000 blocos em 20 postagens. Usa Resource Credits, que se recarregam. |
| **Blurt** *(experimental)* | Conteúdo, anúncio / descoberta, prova / ancoragem | A extensão Blurt Keychain (ou WhaleVault) com sua chave de postagem, e sua conta em [Configurações de rede → Blurt](10-NetworkSettings.md#blurt) | Uma postagem principal da sua própria conta por construção, que mantém seu pagamento; os dados guardados ficam em respostas abaixo dela. Guarda cerca de 2.500 blocos por resposta, até cerca de 30.000 blocos. Cada transação custa uma pequena taxa em BLURT. |
| **Bitcoin** *(experimental)* | Prova / ancoragem | A extensão UniSat, com bitcoin em um endereço SegWit nativo (`bc1q…`) para a taxa | Feita pelas etapas de carteira na página Publicações |
| **Base** *(experimental)* | Prova / ancoragem | Uma carteira de navegador como MetaMask ou Coinbase Wallet, na Base | Cada âncora é uma transação que você revisa e assina |

Uma âncora no Steem é rápida e gratuita, mas atestada pelas testemunhas
(witnesses) do Steem em vez de prova de trabalho: use-a junto com uma âncora
no Bitcoin, não no lugar dela. Veja [Steem](11-EvidenceAndStorage.md#steem). O mesmo vale
para uma âncora no Blurt, que não custa nada quando a postagem da sua
construção no Blurt já traz o hash do conteúdo dela; veja [Blurt](11-EvidenceAndStorage.md#blurt).

## Um caminho típico

1. **Publique** seu Mundo no Editor (veja
   [Publicando sua criação](04-PublishingAndForking.md#publicando-sua-criação)).
2. Clique em **Distribuir** no aviso que aparece, ou depois em
   **Meu Mundo compartilhado** na Visão do mundo.
3. Escolha um **Armazenamento** e um **Substrato de anúncio / descoberta**,
   por exemplo IPFS e Nostr, ou Arweave para os dois, e clique em
   **Distribuir**. Ele distribui o Snapshot, depois a Declaração assinada,
   e informa cada um separadamente. Se uma metade falhar, tente de novo só
   essa metade com o botão **Distribuir só …** dela.
4. Se quiser, na página **Publicações**, ancore a publicação (por exemplo
   **Ancorar em Arweave**) para registrar quando ela existia.
5. Clique em **Compartilhar…** ou **Copiar link** abaixo do resultado para
   dar às pessoas um link que abre sua construção na Visão do mundo em
   qualquer dispositivo.

Para uma construção maior que os 256 KB do Arweave, escolha o IPFS. Pares
conectados a você ainda podem buscar construções de até 64 MB direto de
você.

## Conferindo se deu certo

- O card da sua construção no Repositório diz onde este dispositivo
  registrou a distribuição, por exemplo **Guardado no IPFS · Anunciado no
  Nostr**, ou **Nenhuma distribuição registrada neste dispositivo.** Veja
  [Suas publicações](13-YourData.md#suas-publicações).
- O Repositório de outras pessoas encontra sua publicação no Nostr, no
  Arweave, no Steem ou no Blurt na próxima vez que elas o abrirem, desde que ela
  tenha sido anunciada com a tag de descoberta de sempre,
  `forkbuild-publication`. Veja
  [Criações que outras pessoas distribuíram](04-PublishingAndForking.md#criações-que-outras-pessoas-distribuíram).
- **Descobrir Mundo compartilhado** na Visão do mundo procura seu Mundo
  compartilhado direto no Arweave e no Nostr e o confere, respondendo à
  pergunta "minha publicação está mesmo lá fora, intacta?". Veja
  [Descobrir Mundo compartilhado](03-WorldView.md#descobrir-mundo-compartilhado--pesquisando-direto-nas-redes-descentralizadas).
- Na página Publicações, **Verificar conteúdo no IPFS** busca de volta um
  envio ao IPFS e o compara com o hash dele, e **Verificar evidências**
  confere uma âncora.

A distribuição não pode ser desfeita: depois que algo é anunciado ou
guardado, outras pessoas podem já ter uma cópia. **Despublicar** remove um
Mundo só do seu próprio catálogo, e este dispositivo passa a lembrar de não
listar de novo as cópias distribuídas quando o Repositório pesquisa nas
redes.
