<!-- translation-of: docs/user/08-ChatAndConversations.md source-hash: 406b0d8076916c27 -->
# 08 — Conversas

<!-- languages -->
[English](../08-ChatAndConversations.md) · [Deutsch](../de/08-ChatAndConversations.md) · [Español](../es/08-ChatAndConversations.md) · [Français](../fr/08-ChatAndConversations.md) · [Bahasa Indonesia](../id/08-ChatAndConversations.md) · [日本語](../ja/08-ChatAndConversations.md) · [한국어](../ko/08-ChatAndConversations.md) · **Português (Brasil)**
<!-- /languages -->

As mensagens diretas no ForkBuild são entre pares e **só entre amigos** —
veja [Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md) para
saber como ficar amigo de alguém antes.

## Começando uma conversa

Chega-se ao chat pelo botão **Conversar** de um amigo na página **Pares**, ou
pela página **Conversas** na barra superior — não há entrada para o chat pela
Visão do mundo nem por um avatar. Abrir o chat com alguém que não é seu amigo
no momento (ou que está bloqueado) mostra uma explicação em vez de uma caixa
de escrita: o que libera o chat é a amizade, não estar on-line.

## A página Conversas

Lista todos que valem a pena mostrar — qualquer pessoa com quem você tenha
uma relação lembrada, uma amizade (incluindo um pedido pendente) ou um
histórico de mensagens, ordenados pela atividade mais recente. Cada linha
mostra:

- O nome de exibição da pessoa e um selo **Online / Offline**
- A relação de vocês — Amigo, Pedido de amizade pendente, Par conhecido ou
  Nunca conectado antes
- Um contador de mensagens não lidas, e "N mensagens aguardando envio" se
  houver alguma na fila
- A hora da última atividade

Só os amigos atuais que você não bloqueou ganham um botão **Abrir conversa**;
a linha de todos os outros manda você de volta a Pares. Um amigo que você
bloqueou mostra "⛔ Bloqueado — desbloqueie em Pares para conversar de
novo." no lugar do botão, e a linha se atualiza assim que você bloqueia ou
desbloqueia a pessoa.

## A conversa

Uma única transcrição rolável entre você e um amigo: balões de mensagem
marcados "Você" ou com o nome dele, cada um com data e hora, e uma caixa de
escrita embaixo (até 4.000 caracteres). Clique em **Mostrar detalhes** para
um pequeno painel com a identidade dele, a relação, a amizade, o estado da
conexão ao vivo e as contagens de mensagens/pendentes. Não há indicador de
digitação, edição, exclusão, reações, anexos nem chat em grupo — são só
mensagens, de propósito.

## Chamadas de voz

Um botão **📞 Ligar** fica ao lado da caixa de escrita sempre que pelo menos
um dos dispositivos acessíveis daquele amigo aceita voz — você não precisa
saber qual dos dispositivos dele vai de fato atender; ligar chega à
identidade dele, não a uma conexão específica.

- Clique em **Ligar** para fazer uma chamada — você vê **Chamando…** até a
  pessoa atender.
- Do lado de quem recebe, uma chamada recebida mostra **Aceitar** /
  **Recusar**.
- Depois de conectada, a barra mostra **Em chamada**, mais **Silenciar** /
  **Ativar som** e — quando seu microfone estiver de fato ligado — seletores
  de qual **Microfone** e (se o navegador permitir) qual **Alto-falante**
  usar.
- O botão de encerrar mostra **Cancelar** enquanto você ainda espera a
  pessoa atender, e **Desligar** quando vocês já estão conversando.

Você fica limitado a uma chamada por vez neste dispositivo inteiro — o botão
Ligar fica desabilitado para qualquer outra pessoa enquanto você está numa
chamada. Se seu microfone sumir no meio da chamada (desconectado, permissão
revogada), um pequeno aviso diz isso; a chamada continua, caso ele volte.

Uma chamada que termina antes de vocês se conectarem explica por quê, em
poucas palavras:

| Mensagem | Significado |
|---|---|
| **Chamada recusada.** | A pessoa clicou em Recusar. |
| **A pessoa já está em outra chamada.** | Ela está ocupada em outro lugar. |
| **Sem resposta.** | Ninguém atendeu a tempo. |
| **Não foi possível acessar seu microfone.** | Seu navegador negou ou não tem acesso ao microfone. |
| **A chamada não conseguiu se conectar.** | Uma falha no nível da conexão — vale tentar de novo. |

Desligar normalmente (você ou a outra pessoa) não mostra mensagem nenhuma — a
barra da chamada simplesmente sumir já conta toda a história.

## Enviando enquanto a pessoa está offline

Você pode enviar uma mensagem a um amigo offline — não é preciso que ele
esteja conectado. Ela fica na fila localmente e é entregue automaticamente na
próxima vez que vocês dois estiverem conectados; você não precisa reenviá-la.
Não há servidor guardando a mensagem no meio do caminho, então ela espera no
*seu* dispositivo: o ForkBuild precisa estar aberto dos dois lados ao mesmo
tempo para ela chegar. Uma mensagem ainda não entregue depois de 7 dias é
descartada e marcada como **Não entregue — expirou**. Cada mensagem enviada
mostra seu próprio status embaixo do balão:

| Status | Significado |
|---|---|
| **Na fila — será enviada quando a pessoa se reconectar** | Esperando a pessoa ficar on-line |
| **Enviada** | Entregue à rede — ainda sem confirmação de chegada |
| **Entregue** | Chegada confirmada no dispositivo da pessoa |
| **Não entregue — expirou** | Nunca foi entregue a tempo e foi descartada |
| **Vista** | A pessoa abriu a conversa e leu até esta mensagem |

**Vista** é totalmente automático — não há botão de "marcar como lida". Só
abrir ou atualizar uma conversa já avisa quem enviou que você leu.

## Seu histórico

As conversas ficam salvas localmente neste dispositivo e continuam de onde
você parou depois de recarregar — mensagens, status de entrega e tudo mais.
Esse histórico é **local, só deste dispositivo**: não acompanha você em outro
navegador ou computador, e não há cópia em servidor. Cada conversa guarda as
500 mensagens mais recentes; as mais antigas saem em silêncio para não
ocupar armazenamento demais.

Desfazer a amizade ou bloquear alguém interrompe o chat na hora, mesmo que a
conexão por baixo ainda esteja tecnicamente ativa — você não precisa de um
passo separado de "desconectar".

## E agora?

Volte a **[Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md)**
para encontrar mais pessoas com quem construir e conversar, ou reveja a
**[Visão do mundo](03-WorldView.md)** para ver onde estão as criações de
todo mundo.
