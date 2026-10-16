<!-- translation-of: docs/user/FAQ.md source-hash: f1e16b4c1352d5a0 -->
# Perguntas frequentes

<!-- languages -->
[English](../FAQ.md) · [Deutsch](../de/FAQ.md) · [Español](../es/FAQ.md) · [Français](../fr/FAQ.md) · [Bahasa Indonesia](../id/FAQ.md) · [日本語](../ja/FAQ.md) · [한국어](../ko/FAQ.md) · **Português (Brasil)**
<!-- /languages -->

Respostas curtas às dúvidas mais comuns, cada uma com um link para o guia
que explica o assunto por inteiro.

## Orientando-se

### Para onde foram o Editor, o Repositório e Entrar?

Eles mudaram de nome no menu. **Construir** abre o Editor, **Explorar** é o
antigo Repositório, e **Escolher um nome** (ou o seu nome, quando você tem
um) substitui Entrar. **Passear** abre o Mundo na praça do desafio desta
semana. Veja [Orientando-se](01-GettingStarted.md#orientando-se).

### Não encontro Meu avatar, Pares ou Configurações de rede

Eles ficam em **Mais**, na barra superior (no celular, em **Menu**):
**Você** tem Meu avatar, Minhas identidades e Seus dados; **Pessoas** tem
Pares, Seguindo e Conversas; **Avançado** tem Publicações e Configurações
de rede. Clicar no seu nome, no canto superior direito, também abre Meu
avatar, Minhas identidades e Seus dados.

## Publicar e compartilhar

### Publiquei minha construção, mas meu amigo não a encontra no Explorar

A não ser que você tenha escolhido **Todo mundo** quando Publicar perguntou
[Quem pode encontrá-la?](04-PublishingAndForking.md#quem-pode-encontrá-la),
publicar só guarda a construção no seu próprio dispositivo e a lista no
*seu* **Explorar**. Para ela chegar ao seu amigo:

- **Mande o link.** Publicar mostra **Copiar link** (e **Compartilhar…**
  onde seu dispositivo pode compartilhar); a construção vai dentro do link,
  então seu amigo pode abri-la em qualquer dispositivo. Veja
  [Compartilhando um link](04-PublishingAndForking.md#compartilhando-um-link).
- **Deixe todo mundo encontrar.** Clique em **Deixar todo mundo encontrar**
  no aviso que aparece depois de publicar, e ela aparece no **Explorar** de
  todo mundo, no desafio e no Mundo.
- **Compartilhar com pares**, abaixo da sua construção no **Explorar**, a oferece
  às pessoas com quem você está conectado. O dispositivo de um Amigo ou Par
  conhecido a adiciona sozinho; qualquer outra pessoa a vê em
  **Compartilhado com você** e clica em **Recuperar**. Vocês precisam estar
  conectados ao mesmo tempo para ela chegar.
- **Distribuir** a envia para o Arweave ou o IPFS (ou, de forma
  experimental, para o Steem ou o Blurt) e a anuncia, para que as pessoas possam
  encontrá-la sem estar conectadas a você.

Veja
[Publicar e remixar](04-PublishingAndForking.md#compartilhando-com-pares-conectados).

### Como deixo meu trabalho disponível para todos?

Escolha **Todo mundo** quando Publicar perguntar
[Quem pode encontrá-la?](04-PublishingAndForking.md#quem-pode-encontrá-la)
(ou clique em **Deixar todo mundo encontrar** depois de publicar). Cada
construção que você publica passa a ser enviada a todo mundo e aparece no
**Explorar**, no desafio semanal e no Mundo, sem precisar instalar nada.

Para guardar também uma cópia numa rede de armazenamento descentralizada,
distribua-a: guarde-a no Arweave ou no IPFS (ou, de forma experimental, no
Steem ou no Blurt) e anuncie-a no Nostr ou no Arweave (ou no Steem ou no
Blurt). Para isso você precisa de uma extensão de navegador que assine para
as redes que escolher, como a Wander para o Arweave ou a nos2x para o
Nostr.
[Distribuindo seu trabalho](Distribution.md) lista tudo o que
você pode distribuir, para onde pode ir e do que cada rede precisa.

### Por que ninguém consegue bifurcar minha criação?

Um documento novo não tem licença, e uma criação sem licença não pode ser
bifurcada. Abra **Propriedades da construção** (o **✎** ao lado do título do
documento no Editor), escolha uma licença que permita bifurcar (qualquer
licença CC, menos a CC BY-ND) e publique de novo. A configuração faz parte do
que é publicado, então as criações que você já publicou mantêm a licença que
tinham. Veja
[Escolhendo uma licença](04-PublishingAndForking.md#escolhendo-uma-licença).

### A publicação falhou. O que as mensagens querem dizer?

Estas mensagens aparecem em inglês no app:

- **a title is required before publishing** (é preciso um título antes de
  publicar) — dê um título à criação em **Propriedades da construção**.
- **cannot publish an empty world** (não é possível publicar um mundo vazio)
  — coloque pelo menos um bloco antes.
- **cannot sign, identity is locked** (não é possível assinar, a identidade
  está bloqueada) — sua identidade se bloqueou sozinha; clique em
  **Desbloquear** ao lado do seu nome na barra superior e publique de novo.

### Preciso de um nome para publicar?

Na prática, sim. Publicar pede que você escolha um, o que leva alguns
segundos e não exige conta. **Publicar sem assinar**, nessa caixa de
diálogo, publica sem nome, mas o resultado não tem autor nem assinatura:
não ganha link, e você não consegue compartilhá-lo com pares nem enviá-lo
a todo mundo depois. Veja
[Escolhendo um nome](01-GettingStarted.md#escolhendo-um-nome).

### Posso despublicar alguma coisa?

Sim: abra o Mundo na Visão do mundo e, em **Meu Mundo compartilhado**,
escolha **Mais ▾ → Despublicar…**. Isso o tira do seu **Explorar**. Não
recupera as cópias que outras pessoas já receberam nem nada que você tenha
distribuído no Arweave, no IPFS, no Nostr, no Steem ou no Blurt. Este dispositivo
lembra o que você despublicou, então a busca do **Explorar** nas redes não
volta a listar essas cópias aqui; outros dispositivos e outras pessoas ainda
podem encontrá-las.

### Alguém posicionou minha construção no Mundo dela. Ela moveu a minha?

Não. Um posicionamento só diz onde o Mundo *dela* mostra sua construção; a
sua fica onde você a pôs, e a construção mantém seu nome e seu histórico. Se
você não quiser isso, escolha **Só eu posso posicioná-lo** em **Quem pode
posicioná-lo no Mundo** antes de publicar. Veja
[Por que posso posicionar construções de outras pessoas?](WorldViewAdvancedTools.md#por-que-posso-posicionar-construções-de-outras-pessoas).

### Posso dar minha construção para outra pessoa?

Não como autor dela. O autor de uma construção é a identidade que a
assinou, e ninguém pode mudar essa assinatura, então sua construção sempre
vai mostrar você como autor. É isso que mantém o crédito de todos honesto
quando construções são remixadas.

O que outra pessoa pode fazer, se a licença da construção permitir
remixes, é fazer a própria cópia com **Editar uma cópia** ou **Remixar**.
A cópia dela é dela para mudar, publicar e posicionar, e mostra que veio
da sua (veja
[Bifurcar: torne-a sua](04-PublishingAndForking.md#bifurcar-torne-a-sua)).
Se você preferir que a dela seja a que as pessoas encontram, pode remover
a sua do seu Mundo e despublicá-la, mas cópias já enviadas continuam
existindo (veja
[Posso despublicar alguma coisa?](#posso-despublicar-alguma-coisa)).

O mesmo vale para um arquivo que você exportou: a pessoa pode importá-lo
como cópia própria quando a licença permite remixes, e você pode exportar
uma cópia com uma licença mais aberta do que a que publicou (veja
[Salvar, publicar, recomeçar](02-TheEditor.md#salvar-publicar-recomeçar)).

**Declarar sucessora**, em **Minhas identidades**, não entrega uma
construção: aposenta sua identidade inteira em favor de outra que também
é sua.

### Por que há duas construções no mesmo ponto?

Um posicionamento não reivindica terreno, e não há servidor central para
dizer quem chegou primeiro a um ponto, então dois posicionamentos podem
citar o mesmo ponto. Você é avisado antes de mover um dos seus para um ponto
ocupado. Veja
[Por que duas construções podem ficar no mesmo ponto?](WorldViewAdvancedTools.md#por-que-duas-construções-podem-ficar-no-mesmo-ponto).

## Identidade e seus dados

### Esqueci minha frase secreta. Dá para redefini-la?

Não. A frase secreta é o único jeito de descriptografar a chave daquela
identidade, e não há servidor guardando uma cópia. Se você exportou a
identidade, ainda precisa da frase secreta que escolheu para a exportação.
Caso contrário, crie uma identidade nova. Veja
[Seu nome e sua identidade](05-IdentityAndLogin.md).

### Por que minha identidade fica se bloqueando sozinha?

Uma identidade protegida se bloqueia **15 minutos depois de você
desbloqueá-la**, mesmo que você esteja usando o app, e toda vez que você
recarrega a página. Construir e salvar continuam funcionando enquanto ela
está bloqueada; publicar, ficar visível e entrar numa sala exigem que você a
desbloqueie de novo.

### Como levo meu trabalho para outro computador ou navegador?

Nada se sincroniza sozinho. Para copiar tudo, clique em **Mostrar um
código** em **Seus dados**, em **Copiar para outro dispositivo**, e
escaneie o código com o outro dispositivo (ou abra o link dele lá) enquanto
os dois estão on-line. Ou faça lá um backup e restaure o arquivo no outro
dispositivo (veja [Seus dados](13-YourData.md)). Para levar um tipo de coisa:

- **Documentos**: **Exportar** na barra de ferramentas do Editor, ou
  **Exportar todas as construções** no fim de **Recentes**, depois
  **Importar** no outro dispositivo.
- **Suas próprias estruturas**: **Exportar planta** no menu **⋮** de um
  cartão, ou **Exportar tudo** ao lado de **Minhas estruturas**, depois
  **Importar planta**.
- **Identidades**: **Exportar** em **Minhas identidades**, depois
  **Importar identidade**.

Histórico de conversas, amigos e configurações só vão junto num backup
completo.

### Limpar os dados do navegador apaga meu trabalho?

Sim. Documentos, identidades, amigos e histórico de conversas ficam todos no
armazenamento deste navegador para este site, e limpá-lo os apaga para
sempre. Faça antes um backup com **Seus dados → Fazer backup em um
arquivo**, e guarde o arquivo e a frase secreta dele em segurança;
**Restaurar**, na mesma página, traz tudo de volta. O ForkBuild lembra você
quando o último backup está antigo e, no Chrome ou no Edge num computador,
consegue fazer backup automaticamente todo dia numa pasta que seu
armazenamento em nuvem sincroniza. Veja [Seus dados](13-YourData.md) e
[Privacidade](Privacy.md).

### Posso renomear ou excluir uma identidade?

Não. As identidades são feitas para durar. Para parar de usar uma, declare
uma sucessora ou revogue-a em **Minhas identidades**.

### Revoguei minha identidade, então por que ainda consigo usá-la?

Isso é esperado. Revogar impede a identidade de assinar qualquer coisa
nova, inclusive o que ela precisa para se conectar a outras pessoas, mas você
ainda pode escolhê-la neste dispositivo. Assim você ainda pode consultá-la ou exportá-la. Ela
mostra **Revogada** em **Minhas identidades**, e a revogação nunca pode ser
desfeita. Crie uma nova identidade para continuar trabalhando. Veja
[O que revogar faz — e o que não faz](05-IdentityAndLogin.md#o-que-revogar-faz--e-o-que-não-faz).

### Por que uma cópia mais antiga do ForkBuild não abre meu documento exportado?

Os documentos agora são salvos num formato mais novo e mais compacto. O
ForkBuild 1.0.0 e anteriores não conseguem lê-lo, então atualize antes a
outra cópia. Os arquivos exportados por versões mais antigas continuam
abrindo aqui.

## Visão do mundo e seu avatar

### WASD não move meu avatar

Caminhar já está ligado quando a Visão do mundo abre, com ou sem nome:
quem ainda não tem nome anda como convidado, visível só na própria tela.
Se as teclas não movem seu avatar:

1. Em **Configurações do avatar** da Visão do mundo, confira se
   **Controlar meu avatar (WASD, Shift, Espaço)** está marcado.
2. Clique na visualização 3D, para que as teclas não vão para um campo de
   texto.

Numa tela sensível ao toque, toque em **Andar** acima do joystick. Veja
[Caminhando com seu avatar](06-AvatarsAndPresence.md#caminhando-com-seu-avatar).

### Quem pode ver meu avatar?

Por padrão, qualquer pessoa com quem você está conectado: tanto a
**Visibilidade da presença** quanto a **Visibilidade do perfil** começam em
**Público**. Mude-as em **Meu avatar**; **Oculto** deixa você invisível.
Veja
[Quem pode ver você](06-AvatarsAndPresence.md#quem-pode-ver-você-duas-configurações-independentes).

### A aba do navegador fechou enquanto eu dirigia um veículo

**Ctrl** é o freio e **W** acelera, e no Windows e no Linux a maioria dos
navegadores fecha a aba com **Ctrl+W**. Solte o **W** antes de frear.

### Posso mudar alguma coisa na Visão do mundo?

Só anotações: marcos, nomes de regiões e decorações de animais. Construir é
no Editor; use **Editar uma cópia** para levar para lá o que você está
vendo. Veja
[Visão do mundo](03-WorldView.md#editar-uma-cópia--levando-algo-para-o-editor).

## Pares, amigos e conversas

### Estou rodando o ForkBuild por conta própria e não encontro ninguém

O servidor de encontro padrão só atende o site hospedado, então uma cópia
servida a partir do seu próprio endereço (inclusive `localhost`) não
consegue usá-lo. Conecte-se com um convite (**Pares → Conectar-se com alguém
novo → Convidar**), ou adicione um servidor de encontro seu em
**Configurações de rede → Servidores de encontro**. Veja
[Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md).

### Meu amigo não se reconecta automaticamente

A reconexão automática só cobre as pessoas que você **Lembrou** (Pares
conhecidos), e só as encontra enquanto elas estão com **Ficar visível**
ativo. Um Amigo que você não Lembrou mostra um botão **Reconectar**. Escolha
**Lembrar** no menu **⋯** dele, e os dois cliquem em **Ficar visível**.

### Minha mensagem continua dizendo "Na fila"

As mensagens esperam no seu dispositivo, não num servidor, então só são
entregues enquanto o ForkBuild está aberto dos dois lados e vocês estão
conectados. Uma mensagem não entregue em 7 dias é descartada e marcada como
**Não entregue — expirou**. Veja
[Conversas](08-ChatAndConversations.md#enviando-enquanto-a-pessoa-está-offline).

### Por que não consigo conversar com alguém a quem estou conectado?

Chat e chamadas de voz são só para amigos. Clique em **Adicionar amigo** na
linha da pessoa em **Pares**; quando ela aceitar, aparece um botão
**Conversar**.

### Mudei uma configuração de rede, mas nada mudou

As configurações de rede (servidores, relays, gateways) são lidas quando o
app começa. Recarregue a página depois de salvar. Veja
[Configurações de rede](10-NetworkSettings.md).

## Dispositivos e navegadores

### O ForkBuild funciona num celular ou tablet?

Sim. As duas visões têm controles de toque, e numa tela estreita o menu e os
painéis laterais se recolhem. Veja
[Telas sensíveis ao toque](ControlsReference.md#telas-sensíveis-ao-toque).

### O ForkBuild funciona sem internet? Posso instalá-lo?

Sim, no site hospedado. Depois da primeira visita o ForkBuild abre sem
conexão, e **Instalar o ForkBuild** na tela Início o adiciona ao seu
dispositivo como aplicativo. Construir, salvar e suas construções salvas e
as prontas funcionam sem internet; encontrar construções e pessoas,
distribuir e o chat precisam de conexão. Veja
[Instalando o ForkBuild](01-GettingStarted.md#instalando-o-forkbuild).

### Posso imprimir minha construção em 3D, ou abri-la no Blender?

Pode. **Arquivo → Modelo 3D** na barra de ferramentas do Editor a baixa como STL para
impressão 3D (em milímetros, apoiada na mesa) ou como glTF ou OBJ colorido
para o Blender e outros programas. Veja
[Baixando um modelo 3D](02-TheEditor.md#baixando-um-modelo-3d).

### Preciso de uma carteira de criptomoedas?

Não. Construir, salvar, publicar, compartilhar um link, enviar uma
construção a todo mundo, remixar, pares e conversas não precisam de
nenhuma. Uma carteira ou extensão de assinatura só é necessária se você
quiser distribuir você mesmo uma construção numa rede de armazenamento (o
Arweave precisa de uma carteira Arweave como a Wander; o Nostr, de uma
extensão de assinatura como a nos2x), e para os recursos experimentais de
ancoragem de [Evidências e armazenamento](11-EvidenceAndStorage.md).

### Posso vender minha construção, ou transformá-la num NFT?

O ForkBuild não tem loja, preços nem NFTs, e não ajuda a vender
construções nem recomenda onde fazer isso, dentro do jogo ou fora dele. O
que for combinado fora do ForkBuild fica entre você e a outra pessoa, e o
jogo não sabe de nada: isso não muda quem fez a construção, quem pode
copiá-la nem quem pode posicioná-la.

Sua construção é sempre sua para levar: você pode exportá-la como arquivo
ou baixá-la como modelo 3D (veja
[Salvar, publicar, recomeçar](02-TheEditor.md#salvar-publicar-recomeçar)
e [Baixando um modelo 3D](02-TheEditor.md#baixando-um-modelo-3d)).

Dentro do ForkBuild, o que outras pessoas podem fazer com uma construção
publicada é decidido pela licença dela (veja
[Escolhendo uma licença](04-PublishingAndForking.md#escolhendo-uma-licença))
e por **Quem pode posicioná-lo no Mundo** (veja
[Escolhendo quem pode posicioná-lo](04-PublishingAndForking.md#escolhendo-quem-pode-posicioná-lo)).
Toda cópia do ForkBuild as respeita, mas nenhuma das duas é uma tranca, e
cópias já enviadas não podem ser recolhidas (veja
[Posso despublicar alguma coisa?](#posso-despublicar-alguma-coisa)).

Se sua construção é um remix, ela leva a licença da original, então os
termos dessa licença continuam valendo: uma construção em CC BY-NC, por
exemplo, não pode ser usada comercialmente.
