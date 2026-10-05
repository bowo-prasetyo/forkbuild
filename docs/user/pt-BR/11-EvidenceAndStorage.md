<!-- translation-of: docs/user/11-EvidenceAndStorage.md source-hash: 44b0d63b84daefad -->
# 11 — Evidências e armazenamento

<!-- languages -->
[English](../11-EvidenceAndStorage.md) · [Deutsch](../de/11-EvidenceAndStorage.md) · [Español](../es/11-EvidenceAndStorage.md) · [Français](../fr/11-EvidenceAndStorage.md) · [Bahasa Indonesia](../id/11-EvidenceAndStorage.md) · [日本語](../ja/11-EvidenceAndStorage.md) · [한국어](../ko/11-EvidenceAndStorage.md) · **Português (Brasil)**
<!-- /languages -->

> **Em grande parte experimental.** Guardar conteúdo no IPFS ou no Arweave
> pelo bloco **Distribuição → Conteúdo** de um cartão
> ([Criando um posicionamento](#criando-um-posicionamento) e
> [Usando um provedor preferido](#usando-um-provedor-preferido)) é um
> recurso comum. Todo o resto aqui é **Experimental**: as evidências externas
> e os dois fluxos de carteira, a lista de Posicionamentos de snapshot, o
> pinning remoto no IPFS e o Steem. Pode mudar ou ser removido numa versão
> futura, e o que produz pode não ser aproveitado depois. A página marca
> essas partes com um selo **Experimental**.

Todo cartão da página **Publicações** (veja
[Publicações e evidências externas](09-PublicationsAndEvidence.md)) tem
seções para provar *quando* uma publicação existia e para pôr o conteúdo
dela num lugar de onde outros possam buscá-lo:

- **[Evidências externas](#evidências-externas)** — registros no Bitcoin,
  na Base, no Arweave, no Steem ou no Blurt de que o hash do conteúdo de uma
  publicação existia num certo momento.
- **[O fluxo de âncora no Bitcoin](#o-fluxo-de-âncora-no-bitcoin)** e
  **[O fluxo de âncora na Base](#o-fluxo-de-âncora-na-base)** — fluxos passo a
  passo que usam sua própria carteira para gravar uma transação de verdade.
- **[Posicionamentos de snapshot](#posicionamentos-de-snapshot)** —
  ponteiros assinados para onde o conteúdo pode ser buscado: IPFS, Arweave
  ou este dispositivo.
- **[Publicação no IPFS](#publicação-no-ipfs)** — envio para um serviço de
  pinning remoto.
- **[Steem](#steem)** — postar, guardar e compartilhar links no Steem.
- **[Blurt](#blurt)** — postar, guardar e ancorar no Blurt, a partir da sua
  própria conta, com recompensas.

Evidências e posicionamentos respondem a perguntas diferentes. Uma âncora
mostra que um hash foi registrado num certo momento; não diz nada sobre se
os bytes ainda podem ser buscados. Um posicionamento diz onde os bytes podem
ser buscados; não diz nada sobre quando a declaração foi feita pela primeira
vez.

## Evidências externas

*Experimental.*

Uma âncora listada aqui só quer dizer que este dispositivo tem um registro
assinado de forma válida dizendo "isto foi registrado externamente". Se o
registro aconteceu de verdade só é conferido quando você clica em
**Verificar evidências**. Nada na página verifica automaticamente: nem ao
carregar, nem quando chegam evidências, nem quando você expande a lista.

### Criando evidências

Na seção **Distribuição** de um cartão de publicação, o bloco **Prova /
ancoragem** (marcado como **Experimental**) tem um cartão para cada tipo de
evidência que um clique consegue criar, cada um com seu botão: **Criar
âncora Arweave** e **Criar âncora Steem**. As âncoras no Bitcoin e na Base
não têm um cartão assim: elas são feitas pelos passos da carteira na guia
**Detalhes → Descentralização e evidências** do cartão, e o bloco diz isso.
Quando você salvou um provedor preferido, estes cartões ficam recolhidos em
**Outras opções de ancoragem**, abaixo do botão desse provedor (veja
[Ancorando num provedor preferido](#ancorando-num-provedor-preferido)). Cada
um registra o hash do conteúdo da publicação numa transação naquela rede,
com um de três resultados:

| Resultado | Significado |
|---|---|
| **Âncora criada** | Deu certo. A nova âncora aparece na lista, ainda não verificada. |
| **Registro rejeitado** | A rede foi alcançada e recusou. |
| **Nenhuma âncora foi criada** | Não foi possível alcançar a rede, ou este dispositivo não consegue assinar para ela. |

- Para o Bitcoin, use [O fluxo de âncora no Bitcoin](#o-fluxo-de-âncora-no-bitcoin);
  para a Base,
  [Criando uma âncora na Base em um passo](#criando-uma-âncora-na-base-em-um-passo).
- **Criar âncora Arweave** precisa de uma extensão de carteira Arweave, como
  a Wander.
- **Criar âncora Steem** precisa da extensão Steem Keychain e da sua conta
  no Steem definida em
  [Configurações de rede → Steem](10-NetworkSettings.md#steem).
- **Criar âncora Blurt** precisa da extensão Blurt Keychain (ou WhaleVault)
  e da sua conta no Blurt definida em
  [Configurações de rede → Blurt](10-NetworkSettings.md#blurt).

Uma publicação feita antes de os hashes de conteúdo passarem a ser SHA-256
nunca é ancorada, nem por estes botões, nem pelos passos do Bitcoin ou da
Base, nem por **Ancorar várias publicações**: ninguém mais consegue conferir
o conteúdo com o hash antigo dela, então um registro dele não provaria nada.
Você recebe **Registro rejeitado** (ou, no Bitcoin e na Base, um passo de
transação que falha) dizendo para publicá-la de novo, antes de qualquer
carteira ser consultada. O mesmo vale para os posicionamentos, que terminam
em **Nenhum posicionamento foi criado**.

Depois de um sucesso, o botão passa a mostrar **Criar outra âncora …**, que
faz uma segunda âncora independente. As âncoras na Base são feitas de outro
jeito; veja
[Criando uma âncora na Base em um passo](#criando-uma-âncora-na-base-em-um-passo).

**As âncoras no Steem são mais fracas que as do Bitcoin.** Elas não custam
taxa, só Resource Credits (que se recarregam), e o bloco fica definitivo
cerca de um minuto depois. Até lá o cartão mostra **Waiting for finality**
(aguardando a finalidade), depois **Anchored** (ancorada) (ou, raramente,
**Not anchored** — não ancorada — se a cadeia a descartou: crie-a de novo).
**Verificar evidências** informa **Verificação indisponível** durante esse
primeiro minuto, e depois diz quando, e por qual testemunha, o bloco foi
registrado. **Inspecionar evidências** mostra a hora do bloco na hora, a
partir de uma cópia do cabeçalho de bloco assinado que seu dispositivo
confere offline. Um bloco do Steem é assinado por cerca de 21 testemunhas
eleitas por participação, e não protegido por prova de trabalho, então um
número suficiente delas juntas poderia reescrever o histórico; o cartão diz
"Attested by Steem witnesses" (atestado por testemunhas do Steem). Use uma
âncora no Steem como evidência rápida e gratuita junto com uma no Bitcoin,
não no lugar dela.

**As âncoras no Blurt** são atestadas pelas testemunhas do Blurt da mesma
forma, e são igualmente mais fracas que as do Bitcoin. Quando este
dispositivo já postou o Snapshot da sua construção no Blurt (anunciou-o ou
guardou-o lá), essa postagem é a âncora: **Criar âncora Blurt** não posta
nada e não custa nada. Caso contrário, ela acrescenta o hash do conteúdo
da construção à sua postagem atual no Blurt, ou cria uma nova, por uma
pequena taxa em BLURT. A finalidade, **Verificar evidências** e
**Inspecionar evidências** funcionam como no Steem, e o card tem um link
para a postagem.

**Ancorando várias publicações de uma vez no Steem.** Em **Ferramentas de
carteira, arquivo e editor → Ancoragem em blockchain**, **Ancorar várias
publicações em Steem** lista suas publicações catalogadas. Marque as que
quiser (ou **Selecionar as não ancoradas**) e clique em **Ancorar N
publicações em Steem**. Uma única aprovação no Keychain ancora até 64. Cada
publicação continua recebendo sua própria âncora, verificada por conta
própria. **Ancorar várias publicações em Blurt** funciona do mesmo jeito,
com uma única aprovação no Blurt Keychain.

### Ancorando num provedor preferido

O link **Configurar** do bloco **Prova / ancoragem** abre
[Provedor de prova / ancoragem](10-NetworkSettings.md#provedor-de-prova--ancoragem),
onde você escolhe um padrão. Depois disso, o bloco começa com um único botão
com o nome dele, como **Ancorar em Steem**, que ancora ali com os mesmos
resultados dos botões acima. Ele mostra **Ancorando…** enquanto trabalha e,
ao terminar, a transação e o hash do conteúdo da nova âncora. Todos os
outros tipos ficam a um clique, em **Outras opções de ancoragem**. Salvar
uma preferência não muda nem esses botões nem as âncoras existentes.

Não há esse botão, e todas as opções aparecem, quando nada está salvo,
quando o provedor salvo não está registrado neste dispositivo, ou quando ele
é o Bitcoin: uma âncora no Bitcoin é feita pelos passos da carteira (veja
[O fluxo de âncora no Bitcoin](#o-fluxo-de-âncora-no-bitcoin)), e o bloco
diz isso.

### Descobrir com os pares

Os pares conectados só repassam evidências criadas ou anunciadas de novo
enquanto você está conectado. **Descobrir com os pares** preenche essa
lacuna: pergunta a cada par conectado, um de cada vez, todas as âncoras que
ele conhece para esta publicação, incluindo as que ficou sabendo por
outros. Nada mais na página contata um par.

| Mensagem | Significado |
|---|---|
| *N novas declarações de evidência descobertas com os pares.* | Elas agora estão na lista abaixo. |
| *Nenhuma nova declaração de evidência descoberta com os pares.* | Estes pares não tinham nada de novo. Não quer dizer que não existam evidências. |
| *Nenhum par autenticado estava disponível para consulta.* | Conecte-se antes a um par (veja [Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md)). |
| *Não foi possível concluir a operação de descoberta entre pares solicitada.* | Algo falhou localmente antes de qualquer par ser consultado. |

As âncoras descobertas chegam não verificadas, seus resultados de
verificação anteriores são mantidos, e a mesma âncora nunca é adicionada duas
vezes.

### A lista de evidências

Na guia **Descentralização e evidências** do cartão, **Evidências externas**
mostra quantas âncoras são conhecidas e oferece **Descobrir com os pares**
(acima). **Mostrar evidências** lista todas as âncoras conhecidas da
publicação, lado a lado, mesmo as que discordam. Com mais de uma âncora, um
resumo de **Vínculo com o conteúdo** vem primeiro, contando as âncoras por
hash de conteúdo, e avisa quando elas declaram hashes diferentes. Ele não diz
qual está certo.

Cada âncora mostra:

| Campo | Significado |
|---|---|
| **Localizador** | Onde o sistema externo diz que o registro pode ser encontrado. |
| **Registrado** | A hora de registro declarada (declarada até você verificar). |
| **Publicação / Hash do conteúdo** | O que a assinatura desta âncora liga entre si. |
| **Atestado por** | A identidade que assinou a âncora. |

- **Verificar evidências** (depois **Verificar de novo**) confere agora com
  o sistema externo; veja
  [Resultados da verificação](#resultados-da-verificação).
- **Inspecionar evidências** mostra a declaração bruta: a hora exata, o
  localizador e, no Bitcoin, um link para um explorador de blocos e a prova
  bruta. Só lê o que está no seu dispositivo. No fim, **Conhecimento local**
  diz como este dispositivo ficou sabendo da âncora: **Aquisição**
  (*Conhecida localmente*, *Conhecida por importação de pacote* ou
  *Conhecida por troca entre pares*) e **Vista pela primeira vez por esta
  réplica**. Nunca nomeia o par e não é um sinal de confiança.

### Resultados da verificação

| Rótulo | Significado |
|---|---|
| **Verificada de forma independente** | O sistema externo confirma exatamente o que foi declarado. |
| **Prova não verificada de forma independente** | Assinada de verdade, mas este dispositivo não consegue conferir externamente este tipo de âncora. |
| **Verificação indisponível** | Não foi possível alcançar o sistema externo. Não é o mesmo que inválida. |
| **Evidência inválida** / **Assinatura inválida** | O registro está malformado ou não foi assinado de verdade. |
| **Conteúdo divergente** | A âncora não corresponde a esta publicação. |
| **Prova externa inválida** | O sistema externo diz que a declaração é falsa. |

Se uma âncora foi verificada antes nesta visita e uma verificação posterior
não consegue alcançar a rede, ela guarda uma nota: "Esta evidência foi
verificada de forma independente antes; no momento, a verificação está
indisponível."

As âncoras na Base, criadas aqui ou recebidas, são verificadas com o mesmo
botão **Verificar evidências**.

### Conciliação de âncoras no Bitcoin

O cartão de uma âncora no Bitcoin também tem uma seção **Âncora no
Bitcoin**. **Conciliar** (depois **Conciliar de novo**) faz duas perguntas
separadas e mostra as duas respostas:

| Confirmação | Significado |
|---|---|
| **Transação confirmada** | Minerada; mostra a altura do bloco, o hash do bloco e as confirmações. |
| **Transação não confirmada** | Não encontrada, ou ainda não minerada (os dois casos não são distinguidos). |
| **Status de confirmação indisponível** | Não foi possível conferir. |

| Prova de conteúdo | Significado |
|---|---|
| **O hash corresponde ao OP_RETURN** | A transação leva o hash de conteúdo declarado. |
| **O hash não corresponde ao OP_RETURN** | Não leva, ou a prova está malformada. |
| **Prova de conteúdo indisponível** | Não foi possível conferir. |

Uma transação confirmada cujo OP_RETURN não corresponde é mostrada como
está. A confirmação de cada conciliação entra em **Mostrar histórico de
confirmações**, da mais antiga para a mais nova; a prova de conteúdo só
mostra o resultado mais recente.

## O fluxo de âncora no Bitcoin

Um fluxo passo a passo que usa sua própria carteira Bitcoin para gravar o
hash do conteúdo de uma publicação numa transação de verdade. Cada passo é
um clique separado.

> **Isto gasta bitcoin de verdade na mainnet do Bitcoin.** A partir de
> **Criar plano de transação**, ele trabalha com os fundos reais da sua
> carteira, e **Transmitir transação** envia uma transação de verdade. Não
> há modo de teste.

Todos os painéis dele que valem para a página toda ficam em **Ferramentas de
carteira, arquivo e editor → Ancoragem em blockchain**, o painel recolhido no
fim da página Publicações; os passos de cada publicação ficam no cartão
dela. Quando um passo precisa antes de uma carteira ou de fundos observados,
o link dele abre esse painel para você.

### Do que você vai precisar

- A extensão de navegador **UniSat** (`window.unisat`); nenhuma outra
  carteira Bitcoin é suportada ainda.
- Uma conta com bitcoin disponível para gastar num endereço **SegWit
  nativo** (começando com `bc1q…`). Fundos em endereços Taproot (`bc1p…`) ou
  legados (`1…`, `3…`) podem ser observados, mas não assinados; a revisão
  informa que não podem ser revisados.
- Uma publicação na sua página Publicações; a transação ancora o hash do
  conteúdo dela.

### Conectando uma carteira

Clique em **Conectar carteira Bitcoin** no cartão **Carteira de Bitcoin** e
aprove a conexão na extensão. O ForkBuild nunca vê suas chaves, sua frase de
recuperação nem sua senha; ele recebe seu endereço, sua rede e a capacidade
de assinar enquanto está conectado.

| Estado | Significado |
|---|---|
| **Conectada** | Mostra a **Conta** e a **Rede**. |
| **Desconectada** | Ainda não conectada, ou você recusou. |
| **Carteira indisponível** | Não há extensão, ela está bloqueada, ou não pode ser alcançada. |

A conexão é usada em toda a página. **Desconectar** a encerra, e recarregar
a esquece. Uma carteira numa rede que não seja a mainnet é informada como
divergente; o ForkBuild nunca troca de rede por você.

### Observando os fundos

Depois de conectar, aparece o cartão **Fundos em Bitcoin**. **Observar fundos
da carteira** (depois **Atualizar fundos**) lê o que a conta pode gastar
agora. Não gasta nem reserva nada, e não se atualiza sozinho.

| Estado | Significado |
|---|---|
| **Fundos observados** | O número de UTXOs (**Mostrar entradas de fundos** os lista), o total, o tipo de script e o endereço de troco (sempre sua própria conta). |
| **Formato de endereço não suportado** | Um tipo de endereço ainda sem suporte a taxas, como o legado `3…`. |
| **Fundos indisponíveis** | Não foi possível alcançar a origem dos fundos. |

Se você reconectar depois em outra rede, um aviso diz que a observação está
desatualizada.

### Montando um plano de transação

Na guia **Descentralização e evidências** do cartão da publicação,
**Transação de âncora no Bitcoin → Criar plano de transação** fica
habilitado depois que você observou os fundos. Ele planeja com base na
observação mais recente, escolhendo os UTXOs dos maiores para os menores, e
calcula a taxa.

| Estado | Significado |
|---|---|
| **Plano de transação montado** | Rede, hash do conteúdo, entradas, taxa, troco, total de entrada, a lista completa de entradas e saídas, e quando os fundos foram observados e o plano montado. |
| **Não foi possível montar a transação** | Em geral, os fundos não cobrem a taxa. |

Um plano novo substitui tudo o que foi revisado, assinado ou transmitido
antes dele.

### Revisando e assinando

Um plano preenche na hora o painel **Revisar a transação de âncora no
Bitcoin**: rede, hash do conteúdo, taxa, troco, total de entrada, entradas e
saídas, e se a rede da sua carteira corresponde a esta transação. **Assinar a
transação revisada** (habilitado quando uma carteira correspondente está
conectada) pede à carteira para assinar. O ForkBuild confere antes que o que
está sendo assinado continua exatamente o que você revisou; se não, a
carteira não é consultada.

| Estado | Significado |
|---|---|
| **A carteira devolveu um PSBT assinado** | A resposta traz o material de assinatura desta transação. Ainda não está verificado; esse é o próximo passo. |
| **Assinatura recusada** | Você ou a carteira recusou. |
| **Carteira indisponível** | Nenhuma carteira conectada, ou ela não pode ser alcançada. |
| **Falha na assinatura** | A carteira devolveu algo inutilizável. |

### Verificando e finalizando

**Verificar e finalizar transação** confere a assinatura
criptograficamente, offline.

| Estado | Significado |
|---|---|
| **Transação finalizada** | A assinatura é válida. Mostra o ID da transação e, em **Bytes brutos da transação**, a transação finalizada. |
| **A assinatura não foi verificada** | Chave errada, assinatura errada, ou assinada sobre os dados errados. |
| **Falha na finalização** | Algum outro resultado inutilizável. |

Só entradas SegWit nativas (P2WPKH) podem ser finalizadas. Finalizar também
registra uma
[Publicação de âncora no Bitcoin](#publicações-de-âncora-no-bitcoin).

### Transmitindo

**Transmitir transação** envia os bytes finalizados, sem mudanças, para a
rede Bitcoin.

| Estado | Significado |
|---|---|
| **Transação transmitida** | Aceita pela rede, mas ainda não minerada. |
| **Transação rejeitada** | Recusada. |
| **Transmissão indisponível** | Não foi possível alcançar a rede. |

**Transmitir de novo** reenvia os mesmos bytes. Nada tenta de novo sozinho.

### Observando a confirmação

Depois de uma transmissão, **Observar confirmação** confere se ela foi
minerada, com os mesmos três resultados de
[Conciliação de âncoras no Bitcoin](#conciliação-de-âncoras-no-bitcoin).
Cada verificação entra no **Mostrar histórico de confirmações** desta
transmissão. Essa lista é apagada ao recarregar, mas todo resultado também
fica guardado no
[Arquivo de observações de publicações](12-ArchiveAndLeaderboards.md#o-arquivo-de-observações-de-publicações).

### O que o fluxo não faz

Mesmo uma transação confirmada não cria uma entrada em **Evidências
externas**, então outras pessoas não conseguem descobri-la como evidência.
As telas de revisão, assinatura e transmissão são apagadas por um plano
novo, uma assinatura nova ou uma recarga. O que fica é o registro de
publicação feito na finalização, e todo resultado de transmissão e
confirmação no Arquivo de observações.

### Publicações de âncora no Bitcoin

O cartão **Publicações de âncora no Bitcoin** lista um registro para cada
transação que este dispositivo finalizou: `{ ID da âncora, hash do conteúdo,
txid, rede, criado em }`. Ele é feito quando **Verificar e finalizar
transação** dá certo, funcione ou não a transmissão depois, e não tem status
próprio de confirmado ou válido. **Mostrar publicações** os lista. Cada linha
tem:

- **Inspecionar observações** — contagens de todos os fatos de transmissão,
  confirmação, prova de conteúdo, posicionamento na cadeia e consistência
  que o arquivo tem para aquele ID de âncora.
- **Mostrar ciclo de vida da publicação** — os mesmos fatos em ordem
  cronológica, começando com **Registro de publicação criado**. Um passo sem
  nada registrado simplesmente não aparece. Abri-lo não contata nenhuma
  rede.

## O fluxo de âncora na Base

A mesma ideia na **Base**, uma rede compatível com Ethereum. É separado do
Bitcoin: carteira própria, transação própria (uma transferência para si
mesmo levando o hash do conteúdo como dado), termos próprios.

> **Isto gasta fundos reais na mainnet da Base, ou fundos de teste na Base
> Sepolia — conforme a rede em que sua carteira estiver.** O ForkBuild nunca
> escolhe a rede por você.

### Do que você vai precisar

- Uma carteira de navegador que use a interface padrão
  [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) `window.ethereum`,
  como a Coinbase Wallet ou a MetaMask.
- Uma conta no chain ID **8453** (mainnet da Base) ou **84532** (Base
  Sepolia). Qualquer outra cadeia é informada como divergente.
- Uma publicação na sua página Publicações.

### Conectando uma carteira e observando uma conta

No cartão **Rede Base** (em **Ferramentas de carteira, arquivo e editor →
Ancoragem em blockchain**), clique em **Conectar carteira Base** e aprove. Os
estados são **Conectada**, **Desconectada** e **Carteira indisponível**, como
no Bitcoin; **Desconectar** a encerra e recarregar a esquece.

Depois, **Observar conta na Base** (mais tarde **Atualizar observação**) lê a
cadeia e o saldo da conta:

| Selo | Significado |
|---|---|
| **Conta na Base observada** | **Rede**, **ID da cadeia**, **Conta**, **Saldo nativo** (em wei) e quando foi observada. |
| **A rede conectada não é a Base** | Mostra o ID da cadeia de fato encontrado. |
| **Conta na Base indisponível** | Não foi possível alcançar a carteira. |

### Montando um plano de transação

Na guia **Descentralização e evidências** do cartão da publicação,
**Transação de publicação na Base → Criar plano de transação na Base**
(habilitado depois que você observou uma conta) monta uma transferência não
assinada da sua conta para ela mesma, levando o hash do conteúdo como dado.

| Estado | Significado |
|---|---|
| **Plano de transação montado** | Rede, ID da cadeia, hash do conteúdo, de/para (o mesmo endereço), valor, nonce, limite de gás, taxa máxima e taxa de prioridade (em wei), os dados, e quando a conta foi observada e o plano montado. |
| **Rede Base indisponível** | Não foi possível ler a conta, a taxa ou o nonce. |
| **Não foi possível montar a transação** | Alguma outra falha. |

Um plano novo substitui tudo o que foi revisado, assinado ou transmitido
antes dele.

### Revisando e assinando

Um plano preenche na hora a **Revisão da transação da Base** do cartão: de,
para, valor, nonce, valores de gás, hash do conteúdo e dados da transação.
**Assinar a transação revisada** pede à carteira para assinar exatamente
esse plano.

| Estado | Significado |
|---|---|
| **A carteira devolveu uma transação assinada** | Assinada, mas ainda não verificada. |
| **Assinatura recusada** | Você ou a carteira recusou. |
| **Carteira indisponível** | Nenhuma carteira conectada, ou ela não pode ser alcançada. |
| **Falha na assinatura** | A carteira devolveu algo inutilizável. |

### Criando uma âncora na Base em um passo

No mesmo cartão de revisão, **Criar âncora na Base** assina, finaliza e
transmite a transação revisada com um clique, e depois a adiciona à lista de
evidências da publicação. É uma alternativa aos botões passo a passo, que
continuam funcionando.

| Selo | Significado |
|---|---|
| **Âncora criada** | Transmitida; a nova âncora aparece, expandida, na [lista de evidências](#a-lista-de-evidências). |
| **Registro rejeitado** | A assinatura, a finalização ou a transmissão foi recusada. |
| **Nenhuma âncora foi criada** | Não foi possível alcançar a carteira ou a rede. |

Depois ele passa a mostrar **Criar outra âncora Base**. Ele usa sua carteira
e envia uma transação de verdade.

### Verificando, finalizando e transmitindo

**Verificar e finalizar transação** confere a assinatura offline com o plano
revisado e recupera quem assinou.

| Estado | Significado |
|---|---|
| **Transação finalizada** | Válida; mostra quem assinou e o hash da transação. |
| **A assinatura não foi verificada** | Chave errada, assinatura errada ou dados errados. |
| **Finalização indisponível** / **Falha na finalização** | Não foi possível conferir, ou algum outro resultado inutilizável. |

Finalizar registra uma
[Publicação de âncora na Base](#publicações-de-âncora-na-base). Depois,
**Transmitir transação** a envia: **Transação transmitida** (com o **ID da
transação**; ainda não incluída num bloco), **Transação rejeitada** ou
**Transmissão indisponível**. **Transmitir de novo** reenvia os mesmos bytes.

### Observando a inclusão

Depois de uma transmissão, **Observar transação**, na seção **Inclusão da
transação na Base**, confere se ela está num bloco:

| Selo | Significado |
|---|---|
| **Transação incluída** | A Base informa um recibo: hash do bloco, número do bloco, índice da transação, confirmações. Uma reorganização da cadeia ainda é possível e não é detectada. |
| **Transação não incluída** | Ainda sem recibo (pendente e nunca enviada não são distinguidas). |
| **Status de inclusão indisponível** | Não foi possível conferir. |

**Observar a transação de novo** acrescenta ao **Mostrar histórico de
observações**. Essa lista é apagada ao recarregar, mas toda observação
também fica guardada no
[Arquivo de observações de publicações](12-ArchiveAndLeaderboards.md#o-arquivo-de-observações-de-publicações).

### Publicações de âncora na Base

Como as do Bitcoin, o cartão **Publicações de âncora na Base** guarda um
registro por transação finalizada: `{ hash do conteúdo, txid, rede, criado
em }`. **Mostrar publicações** os lista, e **Mostrar ciclo de vida da
publicação** mostra **Registro de publicação criado** seguido de cada
**Observação de inclusão nº N**. Os resultados de transmissão na Base não
são guardados, então não há entrada de transmissão.

Só **Criar âncora na Base** adiciona uma entrada em Evidências externas; o
fluxo passo a passo nunca adiciona.

## Posicionamentos de snapshot

Criar um posicionamento no IPFS, no Arweave ou no Local é um recurso comum;
a lista da guia **Posicionamentos e IPFS** e tudo o que vem depois de
[Usando um provedor preferido](#usando-um-provedor-preferido) é
*experimental*.

Um **posicionamento de snapshot** é uma declaração assinada de que um
backend de armazenamento — **IPFS**, **Arweave** ou o armazenamento
**Local** deste dispositivo — consegue servir os bytes do hash de conteúdo de
uma publicação. Não é garantia de que eles vão estar lá amanhã. Vários
posicionamentos, em backends diferentes e de pessoas diferentes, podem
existir lado a lado; nenhum é preferido.

### Criando um posicionamento

Na seção **Distribuição** de um cartão de publicação, o bloco **Conteúdo** tem
um cartão por backend, com **Criar posicionamento Local**, **Criar
posicionamento IPFS** ou **Criar posicionamento Arweave**. Quando você salvou
um armazenamento preferido, o bloco começa com um único botão para ele, como
**Armazenar em IPFS**, e recolhe estes cartões em **Outras opções de
armazenamento**. Cada um pega os bytes que este dispositivo tem da
publicação e os entrega àquele backend:

- **Posicionamento criado** — aceito; um novo posicionamento assinado aparece
  abaixo.
- **Nenhum posicionamento foi criado** — não foi possível alcançar o
  backend, ou este dispositivo não tem o conteúdo.

Depois o botão passa a mostrar **Criar outro posicionamento …**. Criar um só
quer dizer que um backend aceitou os bytes agora.

- O **IPFS** precisa da API do seu próprio nó IPFS, por padrão em
  `http://127.0.0.1:5001` (mude em
  [Provedor de conteúdo](10-NetworkSettings.md#provedor-de-conteúdo)). Sem
  um nó rodando, você recebe **Nenhum posicionamento foi criado**.
- O **Arweave** precisa de uma extensão de carteira, como a Wander.

Você não precisa de um nó para *ler* posicionamentos IPFS: **Resolver
Snapshot** e **Materializar Snapshot** usam gateways públicos (veja
[Gateway IPFS](10-NetworkSettings.md#gateway-ipfs)), então você consegue
buscar conteúdo que outras pessoas posicionaram.

### Usando um provedor preferido

**Armazenar em …**, no topo do bloco **Conteúdo**, e **Usar o provedor
preferido**, na guia **Detalhes → Posicionamentos e IPFS** do cartão, criam
um posicionamento no backend salvo em
[Provedor de conteúdo](10-NetworkSettings.md#provedor-de-conteúdo). Salvar
uma preferência não muda nem os botões explícitos nem os posicionamentos
existentes. Sem nada salvo, ou com IPFS (pinning remoto) salvo, o bloco
**Conteúdo** mostra todos os backends em vez de **Armazenar em …**.

| Rótulo | Significado |
|---|---|
| **Posicionamento criado** | O mesmo que clicar no botão daquele backend. |
| **Nenhum posicionamento foi criado** | Nenhuma preferência salva. |
| **Provedor preferido não encontrado** | O backend salvo não está registrado neste dispositivo, ou é o IPFS (pinning remoto), que precisa de um endpoint digitado a cada vez. |

### A lista de posicionamentos de snapshot

Na guia **Posicionamentos e IPFS** do cartão, **Mostrar posicionamentos**
lista todos os posicionamentos conhecidos da publicação: os que você fez,
os que um par enviou e os que vêm dentro de um pacote de planta importado.

| Campo | Significado |
|---|---|
| **Localizador** | Onde o backend diz que os bytes podem ser encontrados. |
| **Posicionado** | A hora de posicionamento declarada. |
| **Publicação** / **Hash do conteúdo** | O que a assinatura do posicionamento liga entre si. |
| **Posicionado por** | A identidade que o assinou. |

Cada um tem até três botões:

- **Inspecionar posicionamento** — os campos do próprio posicionamento e,
  para o IPFS, um link de gateway. Não contata nenhuma rede. Abaixo,
  **Conhecimento local** mostra como este dispositivo ficou sabendo dele
  (*Conhecido localmente*, *por importação de pacote* ou *por troca entre
  pares*) e quando ele foi **Visto pela primeira vez por esta réplica**.
- **Resolver Snapshot** (depois **Resolver de novo**) — confere com o backend
  se os bytes podem ser recuperados agora, sem guardá-los.
- **Materializar Snapshot** (depois **Materializar de novo**) — resolve e, se
  der certo, guarda os bytes neste dispositivo (veja
  [Snapshot local](09-PublicationsAndEvidence.md#snapshot-local)). Você
  escolhe o posicionamento; ele nunca tenta outro por você.

| Resultado de Materializar | Significado |
|---|---|
| **Materializado** | Buscado, conferido e guardado aqui. |
| **Já disponível** | Este dispositivo já tinha os bytes correspondentes. |
| **Indisponível agora** | Não foi possível alcançar o backend, ou ele não os tem. |
| **Rejeitado** | Os bytes não corresponderam ao hash do posicionamento. |
| **Posicionamento inválido** | O registro está malformado ou não foi assinado de verdade. |

### Resultados da resolução

| Selo | Significado |
|---|---|
| **Conteúdo disponível** | O backend serviu bytes que correspondem ao hash do conteúdo. |
| **Nenhum backend de armazenamento configurado** | Este dispositivo não tem backend para este tipo de armazenamento. |
| **Conteúdo indisponível** | Alcançado, mas ele não tem os bytes agora. |
| **O conteúdo recuperado não corresponde a este posicionamento** | O backend serviu os bytes errados. |
| **Posicionamento inválido** / **Assinatura inválida** | O registro está malformado ou não foi assinado de verdade. |

Os resultados ficam nesta página durante esta visita e não são
compartilhados. Duas pessoas podem ter resultados diferentes para o mesmo
posicionamento (por exemplo, só uma roda um nó IPFS). Se um posicionamento se
resolveu antes na visita e depois não pode ser alcançado, ele anota: "Este
snapshot foi resolvido com sucesso antes; no momento, está indisponível."
Uma divergência nunca é amenizada desse jeito.

### Relações entre posicionamentos

Com mais de um posicionamento, um cartão **Relações entre posicionamentos**
mostra quantos backends e locais distintos há, conta os posicionamentos por
hash de conteúdo e mostra **Vínculo de conteúdo: AGREEMENT** (concordância)
ou **CONFLICT** (conflito, com um aviso). Ele se baseia só nas declarações,
não em você tê-las resolvido, e um grupo maior não é tratado como mais
provavelmente certo.

## Publicação no IPFS

*Experimental.* A seção **Publicação no IPFS**, abaixo dos Posicionamentos de
snapshot na guia **Posicionamentos e IPFS** do cartão, envia o conteúdo para
um serviço de pinning que você escolhe. (Como a seção diz: um nó Kubo local
pode resolver e publicar, um gateway remoto só pode resolver, e o pinning
remoto só pode publicar.) Ao contrário de um posicionamento, o resultado não
é uma declaração assinada que outros possam descobrir: é um registro de que
um provedor aceitou estes bytes. Os resultados na tela são apagados ao
recarregar, mas toda publicação bem-sucedida e toda verificação também ficam
guardadas no
[Arquivo de observações de publicações](12-ArchiveAndLeaderboards.md#o-arquivo-de-observações-de-publicações).

### Configurando um provedor de pinning remoto

O ForkBuild não vem com nenhum provedor de pinning. Clique em **Configurar
publicação remota** (**Reconfigurar publicação remota** depois):

| Campo | Significado |
|---|---|
| **Endpoint** | A URL de envio do serviço. Obrigatório. |
| **Credencial** (opcional) | Enviada como cabeçalho `Authorization` do tipo bearer. Nunca é mostrada de volta; o cartão só diz **configurado** ou **não configurado**. |
| **Campo da solicitação** (opcional) | O campo do formulário para o arquivo. Padrão `file`. |
| **Campo da resposta** (opcional) | O campo da resposta que traz o CID. Padrão `cid`. |

**Salvar configuração** a guarda só para esta visita; ela nunca é gravada, e
uma recarga ou **Limpar configuração** a descarta. Cancelar mantém a
configuração anterior. Reconfigurar começa do zero, sem nada publicado com o
novo provedor.

### Publicando

**Publicar no IPFS remoto** (depois **Publicar de novo**) confere a cópia
deste dispositivo com o hash do conteúdo e a envia.

| Selo | Significado |
|---|---|
| **Publicado** | Aceito; o provedor devolveu um CID. |
| **Publicação rejeitada** | Recusada, por exemplo por credencial errada, pedido malformado ou cota. Mude a configuração antes de tentar de novo. |
| **Publicação indisponível** | Não foi possível alcançar o provedor. Tente mais tarde. |
| **Falha na publicação** | Qualquer outra coisa, inclusive uma verificação local de integridade que falha antes. |

Um resultado publicado mostra o hash do conteúdo, o localizador
(`ipfs://<cid>`), o endpoint e a hora. Um selo como **Nostr: Anunciada** ou
**Steem: Não anunciada**, com o nome do seu
[Provedor de anúncio / descoberta](10-NetworkSettings.md#provedor-de-anúncio--descoberta),
diz se a publicação também foi anunciada para a descoberta de Snapshots, para
que outros possam encontrá-la como encontrariam uma publicação feita por um
nó local. **Não anunciada** quer dizer que só o anúncio falhou.

### Verificando o que foi publicado

Depois de uma publicação bem-sucedida, **Recuperação do conteúdo → Verificar
conteúdo no IPFS** (depois **Verificar de novo**) busca os bytes pelos seus
[gateways IPFS](10-NetworkSettings.md#gateway-ipfs) e os compara com o hash
registrado:

| Selo | Significado |
|---|---|
| **O conteúdo recuperado corresponde ao hash de conteúdo registrado** | Corresponde. |
| **O conteúdo recuperado não corresponde ao hash de conteúdo registrado** | Não corresponde. |
| **Recuperação de conteúdo indisponível** | Não foi possível alcançar o gateway, ou ele não o tem. Não é uma divergência. |
| **Falha na verificação** | Outra coisa deu errado. |

### Histórico de publicação

Publicar de novo nunca sobrescreve registros anteriores. **Mostrar histórico
de publicação** lista cada publicação, da mais antiga para a mais nova, com
localizador e hora; **Inspecionar** mostra o localizador, o hash do
conteúdo, a hora e o método (hoje sempre **Provedor de pinning remoto**).
Cada entrada tem seu próprio botão **Verificar conteúdo** e **Mostrar
histórico de verificação**, uma lista em ordem cronológica de cada
verificação daquele registro.

## Steem

*Experimental.* O ForkBuild consegue anunciar, guardar e compartilhar pela
blockchain Steem. Os anúncios (de publicações, Snapshots e comentários) são
respostas a tópicos mensais de descoberta, como
[`@forkbuild/forkbuild-snapshot-2026-09`](https://steemit.com/forkbuild/@forkbuild/forkbuild-snapshot-2026-09).
Ler não exige conta. O que for encontrado é verificado como um anúncio do
Nostr ou do Arweave; votos, pagamentos e reputação não o afetam. As
configurações ficam em
[Configurações de rede → Steem](10-NetworkSettings.md#steem).

### Postando no Steem

Escolha **Steem** numa caixa de diálogo Distribuir, na página Publicações ou
ao lado de **Publicar comentário**, ou torne-o seu padrão em
[Provedor de anúncio / descoberta](10-NetworkSettings.md#provedor-de-anúncio--descoberta).
Você precisa da extensão Steem Keychain com a chave de **postagem** da sua
conta, e do nome da sua conta salvo na página de configurações do Steem. O
ForkBuild nunca vê a chave. Cada postagem é uma resposta ao tópico deste mês,
com o pagamento recusado, e o Keychain pede que você a aprove. Se o tópico
deste mês ainda não existir, nada é postado e você é avisado. Um comentário
sempre é salvo primeiro neste dispositivo, e o formulário dele avisa se
faltar a conta ou o Keychain.

### Guardando no Steem

Escolha **Steem** como armazenamento numa caixa de diálogo Distribuir ou na
página Publicações. O Snapshot é compactado e guardado como respostas ao
tópico de conteúdo deste mês (como `@forkbuild/forkbuild-content-2026-10`),
sem pinning nem taxa de envio. Os dados ficam nos metadados de cada
postagem; o texto da postagem é uma nota de uma linha. Postagens mais antigas
com os dados no texto continuam carregando.

- **Tamanho.** Cabem até uns 2.500 blocos numa postagem. Uma construção
  maior vira uma postagem de índice mais até 20 postagens de uns 48 KB, até
  uns 30.000 blocos. Qualquer coisa maior é recusada antes de postar, com a
  sugestão de usar o IPFS ou o Arweave.
- **Aprovação.** O Keychain pede aprovação para cada postagem, com pelo
  menos 4,5 segundos entre elas, e a caixa de diálogo mostra o andamento
  ("Guardando no Steem: 3 de 9 postagens feitas.").
- **Resource Credits.** Postar usa os Resource Credits da sua conta, que se
  recarregam em cinco dias. Se você não tiver o bastante, nada é postado e
  você fica sabendo quanto é preciso. O andamento mostra a parte usada.
- **Se parar no meio** (você recusa, os créditos acabam ou a conexão cai),
  você fica sabendo quantas postagens foram guardadas. Distribua de novo com
  a mesma conta e só as postagens que faltam são feitas. Nada é anunciado
  até todas as postagens estarem guardadas.

A Declaração assinada também pode ser guardada no Steem: mais uma postagem (e
aprovação) no mesmo tópico, depois do Snapshot quando você distribui os
dois. Ela é lida de volta e tem a assinatura conferida como uma do Arweave.

### Compartilhando um link

**No Steem.** A postagem de uma Declaração assinada mostra uma imagem da sua
construção, o título, seu nome e a descrição, e um link "See it in 3D" (veja
em 3D). O Keychain pede que você aprove a assinatura da imagem, que é
enviada para o servidor de imagens do Steemit sem custo de Resource Credits;
se você recusar ou ela não puder ser feita, a postagem sai sem ela. Menções,
tags e links no seu título ou descrição aparecem como texto simples, então
não notificam ninguém. Qualquer pessoa que clicar no link, mesmo sem nunca
ter usado o ForkBuild, chega à Visão do mundo na sua construção, depois que o
ForkBuild confere a assinatura do Mundo compartilhado e se a construção
corresponde ao anúncio dela (se não, a página diz por quê). A construção
então fica guardada no navegador da pessoa. O link precisa da construção
anunciada, além de guardada, o que Distribuir faz.

**Em qualquer lugar.** Depois que uma Declaração assinada está guardada no
Steem, no Arweave ou no IPFS, **Compartilhar…** e **Copiar link** aparecem
abaixo dela: no painel de publicação da Visão do mundo, no resultado da caixa
de diálogo Distribuir e na página Publicações. **Compartilhar…** abre o menu
de compartilhamento do seu dispositivo, onde houver; **Copiar link** copia o
link, que também aparece para copiar à mão. O link abre em qualquer
dispositivo, desde que o Snapshot também tenha sido distribuído, e mostra a construção onde você a colocou: seu posicionamento assinado viaja com o Snapshot, e o link o traz junto. O endereço
`#/world/…` na sua barra de endereços só funciona no seu próprio navegador.

- **Arweave:** logo depois de distribuir, o link pode levar alguns minutos
  para abrir enquanto o envio chega aos gateways. A página oferece **Tentar
  novamente**.
- **IPFS no seu próprio nó:** só abre enquanto seu nó estiver on-line e
  acessível pelos gateways públicos. Um serviço de pinning ou o Arweave o
  mantêm disponível quando seu computador está desligado.
- Os amigos leem pelos gateways das Configurações de rede deles. Um gateway
  IPFS tem até 30 segundos para encontrar a declaração.

## Blurt

*Experimental.* O Blurt é uma blockchain que surgiu do Steem, sem votos
negativos. O ForkBuild pode anunciar, guardar e ancorar nele, e tudo sai
da **sua própria conta** como postagens comuns do Blurt que mantêm seu
pagamento: quando as pessoas votam a favor da postagem da sua construção,
você ganha BLURT. Não há conta do ForkBuild nem thread compartilhada. As
configurações ficam em
[Configurações de rede → Blurt](10-NetworkSettings.md#blurt).

### Postando no Blurt

Escolha **Blurt** em um diálogo de Distribuir, na página Publicações, ao
lado de **Publicar comentário** ou no painel de nomes, ou torne-o seu
padrão em
[Provedor de anúncio / descoberta](10-NetworkSettings.md#provedor-de-anúncio--descoberta).
Você precisa da extensão Blurt Keychain (ou WhaleVault) com a chave de
**postagem** da sua conta, e do nome da sua conta salvo na página de
configurações do Blurt. O ForkBuild nunca vê a chave, e o Keychain pede
que você aprove cada postagem.

- **Uma postagem por construção.** Distribuir cria uma postagem principal
  da sua conta, com as tags `forkbuild` e `forkbuild-snapshot` ou
  `forkbuild-publication`, com uma imagem da sua construção, o título,
  seu nome e a descrição (completa, até 2.000 caracteres, com sua [formatação](02-TheEditor.md)), e um link "See it in 3D" (veja em 3D). O que vier
  na meia hora seguinte (o anúncio da Publicação, um comentário, uma
  âncora) é acrescentado à mesma postagem editando-a, para que seus
  seguidores vejam uma postagem, não várias.
- **A imagem precisa de uma aprovação própria.** Para uma Declaração
  assinada, o Keychain primeiro pede que você assine a imagem da
  construção e depois que aprove a postagem. A segunda janela dele pode
  abrir atrás do navegador; o ForkBuild espera até dois minutos por cada
  uma. A imagem vai para o servidor de imagens do Blurt, pelo servidor de
  encontro do ForkBuild quando o navegador não consegue alcançá-lo
  diretamente; se não puder ser enviada, a postagem sai sem ela.
- **Cinco minutos entre postagens.** O Blurt aceita uma postagem
  principal por conta a cada cinco minutos. Se a sua conta postou uma há
  pouco (de outro app, por exemplo), o ForkBuild espera, e o diálogo diz
  quanto tempo.
- **Taxas.** Cada transação no Blurt custa uma pequena taxa em BLURT,
  definida pelas testemunhas do Blurt. Se a sua conta não puder pagá-la,
  nada é postado e você é avisado.
- **Os outros a encontram** pelo Nexus, o índice de busca do Blurt, que
  lista toda postagem com as tags do ForkBuild, por mais antiga que seja.
  Se nenhum nó do Blurt oferecer o Nexus, o ForkBuild lê a tag, que lista
  uma postagem por uma semana, e depois o histórico da sua conta: depois
  que o ForkBuild de alguém vê uma das suas postagens, ele continua lendo
  as mais novas e as mais antigas.

### Guardando no Blurt

Escolha **Blurt** como armazenamento em um diálogo de Distribuir ou na
página Publicações. A construção é guardada como no Steem, em respostas
abaixo da postagem da sua construção: até cerca de 2.500 blocos em uma
resposta, ou até 20 respostas a mais para até cerca de 30.000 blocos.
Antes de postar, o ForkBuild calcula as taxas e se recusa se o seu saldo
não bastar ("Guardar esta construção no Blurt custa cerca de 0,632 BLURT
em taxas, e sua conta tem 0,100 BLURT"). O diálogo mostra o progresso e as
taxas. Se parar no meio do caminho, distribua de novo com a mesma conta, e
só as respostas que faltam são criadas.

A Declaração assinada também pode ser guardada no Blurt, como mais uma
resposta. O link dela funciona como um do Steem: quem clicar em "See it in
3D" chega à Visão do mundo na sua construção, depois que o ForkBuild a
confere. **Compartilhar…** e **Copiar link** aparecem assim que ela é
guardada.
