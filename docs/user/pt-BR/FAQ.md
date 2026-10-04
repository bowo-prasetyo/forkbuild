<!-- translation-of: docs/user/FAQ.md source-hash: b5cf5faa75241d15 -->
# Perguntas frequentes

<!-- languages -->
[English](../FAQ.md) · [Deutsch](../de/FAQ.md) · [Español](../es/FAQ.md) · [Français](../fr/FAQ.md) · [Bahasa Indonesia](../id/FAQ.md) · [日本語](../ja/FAQ.md) · [한국어](../ko/FAQ.md) · **Português (Brasil)**
<!-- /languages -->

Respostas curtas às dúvidas mais comuns, cada uma com um link para o guia
que explica o assunto por inteiro.

## Publicar e compartilhar

### Publiquei minha criação, mas meu amigo não a encontra no Repositório dele

Publicar só guarda a criação no seu próprio dispositivo e a lista no *seu*
Repositório. Nada é enviado a lugar nenhum até você escolher:

- **Compartilhar com pares**, abaixo da sua criação no Repositório, a oferece
  às pessoas com quem você está conectado. O dispositivo de um Amigo ou Par
  conhecido a adiciona sozinho; qualquer outra pessoa a vê em
  **Compartilhado com você** e clica em **Recuperar**. Vocês precisam estar
  conectados ao mesmo tempo para ela chegar.
- **Distribuir** a envia para o Arweave ou o IPFS (ou, de forma
  experimental, para o Steem) e a anuncia, para que as pessoas possam
  encontrá-la sem estar conectadas a você.

Veja
[Publicar e bifurcar](04-PublishingAndForking.md#compartilhando-com-pares-conectados).

### Como deixo meu trabalho disponível para todos?

Distribua-o: guarde-o no Arweave ou no IPFS (ou, de forma experimental, no
Steem) e anuncie-o no Nostr ou no Arweave (ou no Steem), para que qualquer
pessoa possa encontrá-lo e conferi-lo sem estar conectada a você. Clique em
**Distribuir** logo depois de publicar, ou em **Meu Mundo compartilhado** na
Visão do mundo. Você precisa de uma extensão de navegador que assine para as
redes que escolher, como a Wander para o Arweave ou a nos2x para o Nostr.
[Distribuindo seu trabalho](Distribution.md) lista tudo o que
você pode distribuir, para onde pode ir e do que cada rede precisa.

### Por que ninguém consegue bifurcar minha criação?

Um documento novo não tem licença, e uma criação sem licença não pode ser
bifurcada. Abra **Propriedades do documento** (o **✎** ao lado do título do
documento no Editor), escolha uma licença que permita bifurcar (qualquer
licença CC, menos a CC BY-ND) e publique de novo. A configuração faz parte do
que é publicado, então as criações que você já publicou mantêm a licença que
tinham. Veja
[Escolhendo uma licença](04-PublishingAndForking.md#escolhendo-uma-licença).

### A publicação falhou. O que as mensagens querem dizer?

Estas mensagens aparecem em inglês no app:

- **a title is required before publishing** (é preciso um título antes de
  publicar) — dê um título à criação em **Propriedades do documento**.
- **cannot publish an empty world** (não é possível publicar um mundo vazio)
  — coloque pelo menos um bloco antes.
- **cannot sign, identity is locked** (não é possível assinar, a identidade
  está bloqueada) — sua identidade se bloqueou sozinha; clique em
  **Desbloquear** ao lado do seu nome na barra superior e publique de novo.

### Preciso ter entrado para publicar?

Publicar funciona sem ter entrado, mas o resultado não tem autor nem
assinatura, então você não consegue compartilhá-lo com pares nem
distribuí-lo depois. Entre antes de publicar.

### Posso despublicar alguma coisa?

Sim: abra o Mundo na Visão do mundo e, em **Meu Mundo compartilhado**,
escolha **Mais ▾ → Despublicar…**. Isso o tira do seu Repositório. Não
recupera as cópias que outras pessoas já receberam nem nada que você tenha
distribuído no Arweave, no IPFS, no Nostr ou no Steem. Este dispositivo
lembra o que você despublicou, então a busca do Repositório nas redes não
volta a listar essas cópias aqui; outros dispositivos e outras pessoas ainda
podem encontrá-las.

### Alguém posicionou minha construção no Mundo dela. Ela moveu a minha?

Não. Um posicionamento só diz onde o Mundo *dela* mostra sua construção; a
sua fica onde você a pôs, e a construção mantém seu nome e seu histórico. Se
você não quiser isso, escolha **Só eu posso posicioná-lo** em **Quem pode
posicioná-lo no Mundo** antes de publicar. Veja
[Por que posso posicionar construções de outras pessoas?](03-WorldView.md#por-que-posso-posicionar-construções-de-outras-pessoas).

### Por que há duas construções no mesmo ponto?

Um posicionamento não reivindica terreno, e não há servidor central para
dizer quem chegou primeiro a um ponto, então dois posicionamentos podem
citar o mesmo ponto. Você é avisado antes de mover um dos seus para um ponto
ocupado. Veja
[Por que duas construções podem ficar no mesmo ponto?](03-WorldView.md#por-que-duas-construções-podem-ficar-no-mesmo-ponto).

## Identidade e seus dados

### Esqueci minha frase secreta. Dá para redefini-la?

Não. A frase secreta é o único jeito de descriptografar a chave daquela
identidade, e não há servidor guardando uma cópia. Se você exportou a
identidade, ainda precisa da frase secreta que escolheu para a exportação.
Caso contrário, crie uma identidade nova. Veja
[Identidade e login](05-IdentityAndLogin.md).

### Por que minha identidade fica se bloqueando sozinha?

Uma identidade protegida se bloqueia **15 minutos depois de você
desbloqueá-la**, mesmo que você esteja usando o app, e toda vez que você
recarrega a página. Construir e salvar continuam funcionando enquanto ela
está bloqueada; publicar, ficar visível e entrar numa sala exigem que você a
desbloqueie de novo.

### Como levo meu trabalho para outro computador ou navegador?

Nada se sincroniza sozinho. Para levar tudo, faça um backup em **Seus
dados** e restaure o arquivo no outro dispositivo (veja
[Seus dados](13-YourData.md)). Para levar um tipo de coisa:

- **Documentos**: **Exportar** na barra de ferramentas do Editor, ou
  **Exportar todos os documentos** no fim de **Recentes**, depois
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

### Por que uma cópia mais antiga do ForkBuild não abre meu documento exportado?

Os documentos agora são salvos num formato mais novo e mais compacto. O
ForkBuild 1.0.0 e anteriores não conseguem lê-lo, então atualize antes a
outra cópia. Os arquivos exportados por versões mais antigas continuam
abrindo aqui.

## Visão do mundo e seu avatar

### WASD não move meu avatar

Caminhar fica desligado até você ligar:

1. Entre e salve um avatar em **Meu avatar**.
2. Na seção **Avatar** da Visão do mundo, marque **Controlar meu avatar
   (WASD, Shift, Espaço)**.
3. Clique na visualização 3D, para que as teclas não vão para um campo de
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

### Preciso de uma carteira de criptomoedas?

Não. Construir, salvar, publicar, bifurcar, pares e conversas não precisam
de nenhuma. Uma carteira ou extensão de assinatura só é necessária para os
recursos experimentais de distribuição e ancoragem de
[Evidências e armazenamento](11-EvidenceAndStorage.md).
