<!-- translation-of: docs/user/07-PeerConnectionsAndFriends.md source-hash: 25e078a7afa72b20 -->
# 07 — Conexões entre pares e amigos

<!-- languages -->
[English](../07-PeerConnectionsAndFriends.md) · [Deutsch](../de/07-PeerConnectionsAndFriends.md) · [Español](../es/07-PeerConnectionsAndFriends.md) · [Bahasa Indonesia](../id/07-PeerConnectionsAndFriends.md) · [日本語](../ja/07-PeerConnectionsAndFriends.md) · **Português (Brasil)**
<!-- /languages -->

O ForkBuild conecta você diretamente aos navegadores de outras pessoas — não
há um servidor central guardando uma lista de amigos. Abra **Pares** na barra
superior para gerenciar com quem você está conectado, quem você conhece e de
quem é amigo.

## A página em resumo

```
Pares                                    Seu ID …N6KbN  [Copiar ID completo]

Precisa da sua atenção    conexões esperando por você, pedidos de amizade
Pessoas  [Todos|Amigos|Seguindo|Online]   uma linha por pessoa
Conectar-se com alguém novo  [Convidar|Colar um convite|Encontrar por ID|Sala pública]
▸ Bloqueados (N)          só quando você bloqueou alguém
```

- **Precisa da sua atenção** só aparece quando há algo esperando: uma
  conexão em andamento (com a etapa, por exemplo "etapa 2 de 5: Conectando
  por WebRTC"), uma conexão esperando você colar a resposta do outro lado,
  uma que falhou para dispensar, ou alguém pedindo para ser seu amigo
  (**Aceitar** / **Recusar**).
- **Pessoas** tem uma linha por pessoa, não importa quantas coisas você saiba
  sobre ela. As etiquetas dizem o que ela é para você — **Amigo**,
  **Lembrado**, **Seguindo**, **Bloqueado**, **Pedido enviado**, **Quer ser
  seu amigo** — e um ponto verde quer dizer on-line. As pessoas on-line vêm
  primeiro, depois os amigos, depois todos os outros. Cada linha tem a ação
  principal (**Conversar** para um amigo, **Reconectar** quando a pessoa está
  offline, **Adicionar amigo** para alguém com quem você está conectado), e o
  menu **⋯** guarda o resto: **Renomear** (ou **Dar nome e lembrar**),
  **Lembrar** / **Esquecer**, **Desfazer amizade**, **Seguir** / **Deixar de
  seguir**, **Detalhes da conexão**, **Desconectar** e **Bloquear** /
  **Desbloquear**. O filtro **Seguindo** mostra as pessoas daqui que você
  segue.
- **Bloqueados** fica recolhido no fim e só aparece quando você bloqueou
  alguém.

Por trás da lista há cinco registros independentes — conexões ativas, Pares
conhecidos (pessoas que você escolheu **Lembrar**, uma nota privada nunca
compartilhada com elas), Amigos (mútuos e assinados), Seguindo (veja
[Seguindo pessoas](#seguindo-pessoas)) e Bloqueados. Uma pessoa pode ser
Amiga sem ser Lembrada, e assim por diante; a linha só mostra o que se
aplica. Alguém que você segue mas com quem nunca se conectou não aparece
aqui; a página **Seguindo** lista todos que você segue.

## Encontrando alguém e se conectando

Não há nomes de usuário para pesquisar — cada par é identificado pela
identidade criptográfica dele, então uma conexão sempre começa trocando
informações de identidade por algum canal em que você já confia (chat,
e-mail, pessoalmente). **Conectar-se com alguém novo** mostra um jeito de
cada vez:

- **Convidar** — **Criar convite**, depois copie e envie a alguém. A conexão
  espera em **Precisa da sua atenção**; quando a pessoa responder, cole a
  resposta dela ali e clique em **Concluir conexão**.
- **Colar um convite** — o lado de quem recebe: cole um convite que alguém
  enviou a você, clique em **Conectar** e devolva a resposta que você
  receber.
- **Encontrar por ID** — pesquise pelo ID de identidade completo de alguém
  entre os candidatos que você ou outros publicaram, depois **Conectar**. Sua
  resposta volta pelo servidor de encontro, então a conexão se conclui
  sozinha; você só copia uma resposta à mão quando isso não é possível (sua
  identidade está bloqueada, ou o candidato veio de um convite salvo).
  **Salvar um convite para depois**, recolhido logo abaixo, adiciona um
  convite a estes resultados de pesquisa sem conectar.
- **Ficar visível** (na mesma guia, em **Deixe que os outros encontrem
  você**) — publica sua própria identidade numa rede de encontro, para que
  alguém que já conhece seu ID de identidade possa encontrar você e se
  conectar sem um convite direto. Uma publicação atende uma tentativa de
  conexão — ative de novo para ser encontrado de novo. O botão mostra
  **Deixar de ficar visível** enquanto sua publicação ainda espera alguém
  responder; volta sozinho para **Ficar visível** quando alguém se conecta,
  ou quando a oferta se fecha ou o convite dela expira. Sua identidade precisa
  estar desbloqueada para publicar: o servidor de encontro só aceita uma
  publicação assinada pela identidade que ela nomeia, então ninguém mais
  consegue publicar nem retirar uma por você. O servidor de encontro padrão
  só atende o site hospedado do ForkBuild; se você roda o ForkBuild a partir
  do seu próprio endereço (inclusive `localhost`), use convites ou adicione
  seu próprio servidor em **Servidores de encontro**, nas **Configurações de
  rede**. Esse estado vale para o app inteiro, então sair da página Pares e
  voltar não o zera.
- **Sala pública** — conheça pessoas cujo ID você não tem; veja abaixo.

**Seu ID**, no topo da página, com **Copiar ID completo**, é o que alguém
precisa para **Encontrar por ID**. O `…últimos14caracteres` encurtado
mostrado nas linhas serve só para distinguir as pessoas num relance e nunca
vai corresponder a uma pesquisa de verdade.

Seja qual for o caminho, uma conexão passa pelas mesmas etapas:
**Encontrado pelo servidor de encontro → Conectando por WebRTC → Par
conectado → Autenticando a identidade → Autenticado** (ou **Falhou**).
**Detalhes da conexão**, no menu **⋯** de uma pessoa conectada, mostra a
identidade dela, a chave pública e um lembrete de que a *conexão* em si vale
só para a sessão, mesmo que um registro de Par conhecido ou de Amigo
continue depois dela. Os contadores "on-line há …" e "iniciado há …" contam
a partir do momento em que aquela conexão foi de fato feita, então continuam
certos se você sair e voltar.

## A sala pública: conhecendo pessoas que você ainda não conhece

Encontrar por ID precisa do ID de identidade completo de alguém. A **Sala
pública** serve para conhecer pessoas cujo ID você não tem. Há uma sala para
todo mundo, na página **Pares** em **Conectar-se com alguém novo → Sala
pública**, e uma para cada Mundo, em **Sala** na Visão do mundo.

- **Entrar na sala** lista você ali com um nome de exibição que você
  escolhe, ao lado do final do seu ID de identidade. Qualquer pessoa pode
  escolher qualquer nome; o que uma conexão de fato verifica é a identidade.
  O nome é lembrado para a próxima vez.
- Enquanto você está numa sala, este dispositivo fica visível: qualquer
  pessoa nela pode clicar em **Conectar** em você, e quando alguém faz isso,
  ele já fica pronto para a próxima pessoa.
- **Conectar** em alguém da lista conecta a essa pessoa do mesmo jeito que
  Encontrar por ID, sem nada para copiar. O cartão dela mostra
  **Conectando…** e depois **Conectado** quando a troca inicial prova quem
  ela é. Ver alguém na sala nunca conecta você sozinho a essa pessoa.
- **Bloquear** oculta alguém das suas listas de sala e o bloqueia como em
  todo o resto desta página.
- **Sair da sala** tira você na hora. Entrar vale só para esta visita: fechar
  o app tira você de todas as salas (sua entrada pode levar até 10 minutos
  para sumir das listas das outras pessoas), e você nunca é colocado de novo
  numa sala quando volta a abrir o app.

**O que recebe alguém que se conecta a você por uma sala.** Uma conexão de
sala é um par conectado comum, mesmo antes de você Lembrar dele ou fazer
amizade. Ele fica sabendo seu endereço IP, vê seu avatar e sua presença
conforme suas configurações de visibilidade permitem, e os seus dispositivos
**trocam anúncios de Snapshots e de nomes de lugares e metadados de
publicações**, exatamente como com qualquer par conectado (veja
[Privacidade](Privacy.md)). Chat e voz continuam exigindo uma amizade. Os
Mundos que você compartilhou com pares também são oferecidos a ele, mas o
dispositivo dele só busca um se ele clicar em **Recuperar** (veja
[Compartilhando com pares conectados](04-PublishingAndForking.md#compartilhando-com-pares-conectados)).
Os Mundos compartilhados pelos seus Amigos e Pares conhecidos são buscados
para você automaticamente; os de um desconhecido da sala, nunca.

**Relays só quando precisa.** Toda conexão tenta primeiro um caminho direto e
só usa o relay TURN do servidor de encontro quando nenhum caminho direto
funciona. Enquanto você espera numa sala, seu dispositivo nunca pede
credenciais de relay; quem se conecta a você só pede uma se precisar. Isso
guarda a cota mensal do relay para as conexões que de fato acontecem.

A sala precisa de um servidor de encontro (veja **Servidores de encontro**
nas **Configurações de rede**) e de uma identidade desbloqueada.

## Lembrar, fazer amizade, bloquear

- **Lembre** de alguém (no menu **⋯** da pessoa) para guardar uma nota
  privada e local sobre ela — sem precisar do consentimento dela.
  **Renomear** dá a ela um nome que só você vê; para alguém de quem você não
  lembrou, **Dar nome e lembrar** faz as duas coisas. **Esquecer** remove a
  nota, só localmente.
- **Adicionar amigo**, na linha de uma pessoa conectada, pede uma relação
  mútua; ela vê o pedido em **Precisa da sua atenção**, com **Aceitar** /
  **Recusar**, e você pode **Cancelar pedido de amizade** no menu **⋯**
  enquanto espera. **Desfazer amizade** a encerra; precisa que a pessoa
  esteja conectada, porque ela tem de receber o aviso. Os amigos ganham um
  botão **Conversar** — veja [Conversas](08-ChatAndConversations.md).
- **Bloquear** interrompe tudo o que vem daquela identidade — presença,
  perfil, chat, até pedidos de amizade — sem avisá-la. Bloquear um amigo não
  desfaz a amizade, só a silencia; **Desbloquear** (no menu **⋯**, ou na
  lista **Bloqueados**) volta a deixar você ouvir a pessoa, mas nunca
  restaura nada do que o bloqueio silenciou enquanto isso.

## Seguindo pessoas

**Seguir** mantém você em dia com as criações de alguém, como seguir uma
conta numa rede social, sem que nenhum dos dois peça nada ao outro.

- **Onde seguir.** **Seguir** aparece nos cartões de publicação do
  Repositório, ao lado de **Assinado por …** na página de um autor, no menu
  **⋯** de uma pessoa nesta página e como **Seguir os trabalhos** num avatar
  na Visão do mundo. Você segue uma *identidade*, nunca um nome de autor
  digitado: várias pessoas podem publicar com o mesmo nome, então a página de
  um autor mostra um **Seguir** para cada identidade que assinou trabalhos
  com aquele nome.
- **A página Seguindo** (**Seguindo** na barra superior) lista as pessoas que
  você segue, cada uma com **Deixar de seguir**, e abaixo delas os trabalhos
  mais novos delas que chegaram a este dispositivo, do mais novo para o mais
  antigo. Clique num nome para ver só os trabalhos daquela pessoa.
- **Notificações.** Quando uma criação nova de alguém que você segue chega a
  este dispositivo, o painel 🔔 ganha uma entrada **Publication followed
  author published** (um autor que você segue publicou), uma vez por
  criação, com **Explorar** para abri-la.
- **Os Mundos compartilhados delas são buscados para você.** Os Mundos que
  alguém que você segue compartilha com pares conectados são recuperados
  automaticamente, como já acontece com Amigos e pares Lembrados.
- **Os anúncios delas são guardados por mais tempo.** Este dispositivo
  guarda um registro dos anúncios que viu, até um limite por etiqueta de
  descoberta. Quando uma etiqueta enche, os registros vistos há mais tempo
  saem primeiro, mas posicionamentos de construções e nomes de lugares
  assinados por pessoas que você segue ficam na frente dos outros.

**Seguir é privado e de mão única.** A lista fica guardada neste
dispositivo, para a identidade com que você entrou. Nunca é enviada para
lugar nenhum, as pessoas que você segue nunca são avisadas, e não há
contagem de seguidores: sem servidor, ninguém conseguiria contá-los de forma
honesta. Seguir também não dá nada à outra pessoa: nem chat, nem ver seu
avatar, nem como chegar até você. Para isso continua existindo a amizade.

**O que seguir não faz.** Seguir separa os trabalhos das pessoas que você
segue a partir do que chega a este dispositivo; não sai buscando os
trabalhos delas sozinho. As criações continuam chegando pelos caminhos de
sempre: a descoberta de Mundos na Visão do mundo, Mundos compartilhados por
pares conectados e links que você abre. Só contam trabalhos cuja assinatura
confere, então ninguém consegue entrar na sua página Seguindo digitando o
nome ou a identidade de outra pessoa no próprio trabalho. Trabalhos de
alguém que você **Bloqueou** continuam ocultos, mesmo que você siga a
pessoa.

## TURN: retransmitindo conexões entre pares que não acham um caminho direto

Toda conexão entre pares começa tentando negociar um caminho direto entre
dois navegadores, com os servidores STUN públicos padrão do próprio
ForkBuild ajudando cada lado a descobrir o próprio endereço acessível. Isso
basta para a maioria das conexões — mas algumas redes (um NAT simétrico, um
firewall corporativo restritivo) nunca expõem um caminho que só o STUN
consiga achar. Se o seu servidor de encontro oferece um relay TURN, o
ForkBuild pede a ele credenciais de relay de curta duração quando você
começa uma conexão (nunca só por abrir o app) e as usa automaticamente. O
servidor distribui um número limitado de credenciais de relay por mês;
quando acabam, as conexões continuam sendo tentadas, só que sem relay, até o
mês seguinte. Para usar um relay seu, abra **Servidor TURN** nas
**Configurações de rede** da barra superior (`/settings/turn-server`) e
configure seu próprio relay TURN: um servidor que de fato repassa os dados
da conexão quando não dá para estabelecer um caminho direto.

```
Servidor TURN

Seu próprio relay TURN, usado em conexões entre pares que não conseguem
estabelecer um caminho direto ou negociado por STUN. Esta configuração
afeta só a configuração da conexão; não muda a identidade dos pares, a
autenticação nem nenhuma conexão existente.

Você não precisa preencher isto para ter um relay: quando uma conexão
começa, o ForkBuild já pede aos seus servidores de encontro (veja
Servidores de encontro) um relay TURN de curta duração e o usa quando eles
oferecem um. Adicione um relay aqui só se você mesmo mantiver ou pagar por
um; ele é usado junto com o deles, nunca no lugar dele.

[ Uma URL turn:/turns: por linha (ex.: turn:relay.example:3478) ]

Nome de usuário [______________]
Credencial [______________]

[Salvar]   [Limpar]
```

Digite uma ou mais URLs `turn:`/`turns:` (uma por linha), um **Nome de
usuário** e uma **Credencial** — o mesmo par de credenciais é enviado para
todas as URLs que você listar, nunca um separado por servidor — e clique em
**Salvar**. Depois disso, o relay atual aparece como "Relay TURN atual (*N*
URL(s)): `<suas URLs>` — usuário: `<seu usuário>`" — a credencial em si
nunca é mostrada de volta depois de salva, só o fato de que há uma
configurada. Clique em **Limpar** para removê-lo por completo.

**De propósito, não há um botão "Restaurar padrões" aqui.** O relay padrão
vem dos servidores de encontro, como descrito acima, então esta página não
tem nada embutido para restaurar: trazer um servidor TURN pronto aqui
significaria publicar a credencial dele no app, para qualquer pessoa ler e
gastar. Deixar a página vazia ainda dá a você o relay dos servidores de
encontro, quando eles oferecem um; sem relay de nenhum dos dois, as conexões
dependem só do STUN e da conectividade direta. Seu próprio relay é opcional,
e algo que você mesmo forneceria (muitos provedores de hospedagem WebRTC
oferecem um) só se as conexões com certos pares continuarem falhando mesmo
assim. Como em todas as outras páginas das Configurações de rede, uma
mudança aqui só vale na próxima vez que o app carregar.

## Reconectando

Um Par conhecido ou Amigo que não está on-line mostra um botão
**Reconectar**, mesmo um amigo de quem você nunca lembrou. Ele abre a mesma
troca de convites de **Convidar** / **Colar um convite**, na própria linha
da pessoa, e sempre faz uma troca inicial completa e nova, em vez de
reaproveitar dados de conexão antigos. Se uma tentativa de reconexão se
autenticar como uma identidade *diferente* da esperada, o ForkBuild a
rejeita e fecha a conexão com um erro explícito, em vez de confiar em
silêncio em quem respondeu.

O ForkBuild também tenta isso por você, automaticamente, para cada
identidade em Pares conhecidos: assim que o app começa, sempre que você
Lembra, Esquece ou muda de outra forma uma relação de Par conhecido, e cada
vez que você mesmo clica em **Ficar visível**, ele confere em silêncio se
cada um está com **Ficar visível** ativo no momento e, se estiver, conecta
sem você precisar clicar em Reconectar. Então dois amigos que clicam os dois
em **Ficar visível** se conectam: o segundo clique encontra o primeiro. Um
Par conhecido que não está visível agora, ou que não pode ser alcançado, é
simplesmente deixado em paz — não há laço de novas tentativas atrás dele,
nem notificação sobre a tentativa, e uma identidade que falha nunca afeta
outra. Use **Reconectar** quando quiser que aconteça agora, em vez de
esperar a próxima passada automática.

## E agora?

Depois de fazer um amigo, converse com ele em
**[Conversas](08-ChatAndConversations.md)**.
