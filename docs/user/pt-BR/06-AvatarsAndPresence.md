<!-- translation-of: docs/user/06-AvatarsAndPresence.md source-hash: 67d735c25cb2e640 -->
# 06 — Avatares e presença

<!-- languages -->
[English](../06-AvatarsAndPresence.md) · [Deutsch](../de/06-AvatarsAndPresence.md) · [Español](../es/06-AvatarsAndPresence.md) · [Français](../fr/06-AvatarsAndPresence.md) · [Bahasa Indonesia](../id/06-AvatarsAndPresence.md) · [日本語](../ja/06-AvatarsAndPresence.md) · [한국어](../ko/06-AvatarsAndPresence.md) · **Português (Brasil)**
<!-- /languages -->

Seu **avatar** é como as outras pessoas veem você na Visão do mundo — a
aparência, a posição e como ele se move. Este guia mostra como
personalizá-lo, controlar quem pode vê-lo e interagir com os avatares de
todos os outros.

## Personalizando seu avatar

Abra **Meu avatar** na barra superior:

1. Escolha um **Modelo** — um tipo de corpo (por exemplo "Humanoid 01") — na
   lista. Uma prévia plana se atualiza ao vivo enquanto você escolhe.
2. Para cada parte que o modelo declara (os modelos prontos oferecem
   **pele, cabelo, camisa, calça**), escolha uma opção na lista dela, e uma
   cor onde o modelo permite.
3. Ative os **acessórios** que o modelo oferece, numa lista de seleção.
   (Qualquer parte que permite várias escolhas ao mesmo tempo aparece como
   uma lista assim; a página mostra exatamente as partes que o modelo
   escolhido declara.)
4. Defina seu **Nome de exibição** (até 60 caracteres) — é o nome mostrado
   com seu avatar e em Pares/Conversas.
5. Clique em **Salvar**.

Trocar de modelo volta a aparência aos padrões daquele modelo — as escolhas
não passam de um modelo para outro. Não há prévia 3D aqui; você vê seu avatar
de verdade na primeira vez que você (ou outra pessoa) olha para ele na Visão
do mundo.

## Quem pode ver você: duas configurações independentes

A página Meu avatar tem dois controles de visibilidade separados. É fácil
confundi-los, então mantenha-os distintos:

| Configuração | Controla |
|---|---|
| **Visibilidade da presença** | Quem recebe sua *posição ao vivo* — se e onde você aparece se movendo pela Visão do mundo |
| **Visibilidade do perfil** | Quem recebe sua *aparência* — modelo, cores, acessórios, nome de exibição |

As duas oferecem os mesmos quatro níveis, e as duas começam em **Público**:

- **Público** — qualquer pessoa conectada pode ver.
- **Amigos** — amigos mútuos, mais as identidades que você listar
  explicitamente (cole IDs de identidade, um por linha). É uma simples lista
  de permissões, não um fluxo de pedido/aprovação — veja
  [Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md) para o
  que "amigo" significa.
- **Local** — só outras abas do ForkBuild abertas neste mesmo navegador;
  nunca enviado a nenhum par, nem mesmo a um amigo.
- **Oculto** — nunca anunciado, para ninguém. É assim que você fica
  invisível.

Cada seção tem seu próprio botão **Salvar** — salvar uma nunca salva a
outra. "Salvo." aparece depois de salvar e some assim que você muda aquela
seção de novo, então sempre descreve o que você está vendo.

Ser amigo de alguém **não** revela seu avatar por si só — estas duas
configurações decidem o que é de fato compartilhado, uma independente da
outra. E elas só afetam atualizações *futuras*: quem já recebeu sua posição
ou aparência fica com o que tem; não existe um "esqueça-me" remoto.

Você também pode alternar **Mostrar meu avatar** e **Mostrar outros
avatares** direto na Visão do mundo, como simples chaves de exibição no seu
lado. Até você ter um avatar seu, a seção Avatar da Visão do mundo mostra só
**Mostrar outros avatares** e uma nota de como criar um; os controles que
precisam do seu avatar aparecem quando você o tiver.

## Vendo outras pessoas na Visão do mundo

Qualquer pessoa cuja presença você pode receber (conforme a Visibilidade da
presença dela) aparece automaticamente enquanto você se move — não é preciso
pedido de amizade para ver um avatar público. Clique num avatar (ou numa
entrada do painel **Avatares próximos** — uma lista simples de todos que
estão perto, com distância e animação atual) para abrir o **painel de
informações do avatar**:

- Nome de exibição e modelo do avatar
- Uma linha de status — **Presente / Desatualizado / Ausente**, e um rótulo
  de confiança (**Confiável / Sem assinatura / Conflitante**) que descreve
  quão bem verificados estão os dados deste avatar
- Posição, distância (em unidades do Mundo) e animação atual (Andando,
  Parado, …)
- **Seguir avatar** — trava sua câmera no movimento dele
- **Cumprimentar / Acenar / Apontar** — envia um gesto pontual àquele avatar
- **Seguir os trabalhos** — segue a identidade por trás do avatar, para que
  as criações novas dela apareçam na página **Seguindo** (veja
  [Seguindo pessoas](07-PeerConnectionsAndFriends.md#seguindo-pessoas)). Só
  aparece quando a presença do avatar é assinada, porque é a assinatura que
  prova de quem é o avatar.

Fora isso, um avatar remoto é só para ver — não há como mover, editar ou
excluir o avatar de outra pessoa, só olhar, seguir e fazer gestos.

Se um avatar próximo aparece ou não depende de para onde sua **câmera** está
olhando, e não da direção em que seu próprio avatar caminha — os dois podem
apontar para lados diferentes, principalmente logo depois de você orbitar a
câmera livremente. Alguém bem no seu caminho pode ficar totalmente invisível
enquanto sua câmera olha para outro lado; vire ou orbite a câmera de volta
para a pessoa e ela reaparece.

## Caminhando com seu avatar

Voar com a câmera ([Visão do mundo](03-WorldView.md#voando-por-aí)) é um
jeito de se mover, mas você também pode caminhar com seu avatar diretamente,
controlando-o. Para ativar, você precisa ter entrado e ter um avatar salvo em
**Meu avatar**; depois marque **Controlar meu avatar (WASD, Shift, Espaço)**
na seção **Avatar** da Visão do mundo. As teclas não fazem nada até você
marcar, e são ignoradas enquanto um campo de texto está em foco — clique
antes na visualização 3D.

| Tecla | Ação |
|---|---|
| **W / A / S / D** | Mover / virar |
| **Shift** | Correr (movimento mais rápido) |
| **Espaço** | Pular; em águas profundas, subir nadando |
| **C** (segurada, em águas profundas) | Mergulhar |
| **Alt + W / S** | Caminhada contínua sem as mãos, para a frente/para trás — continua se movendo depois que você solta as teclas |
| **Alt + Shift + W / S** | O mesmo, mas correndo em vez de andar |

Num celular ou tablet, um joystick e botões na tela fazem o papel dessas
teclas: empurre o joystick para andar e até a borda para correr, e toque em
**Pular**. Veja
[Telas sensíveis ao toque](ControlsReference.md#caminhando-visão-do-mundo).

Caminhar respeita a colisão com as construções carregadas por perto, as
árvores e a vida selvagem — você não atravessa estruturas carregadas à sua
volta, nem as árvores geradas como parte do terreno, nem um cervo ou coelho
pastando por perto (veja [Visão do mundo](03-WorldView.md#voando-por-aí)). A
vida selvagem só bloqueia seu caminho como uma árvore, onde quer que o animal
tenha ido parar — ele pode virar a cabeça para olhar você, mas nunca sai do
seu caminho nem sofre dano, e um veículo passa direto por ele; só a
caminhada a pé é barrada. Um animal que você pegou não bloqueia mais nada.
Seu avatar pode andar sobre estruturas posicionadas, escalar superfícies
verticais e percorrer terreno irregular. A câmera acompanha seu avatar
naturalmente enquanto você se move.

**Seguir avatar** mantém a câmera travada no seu avatar enquanto ele se
move, em vez de orbitar livremente. Você também pode seguir os avatares de
outros jogadores para ver aonde eles vão.

### Nadar e mergulhar

Água de até metade da altura do seu avatar é atravessada a pé, mais devagar
quanto mais funda. Mais funda que isso, seu avatar nada: flutua com a
cabeça acima da superfície e se move como em terra, só que mais devagar.
Segure **C** para mergulhar e **Espaço** para subir nadando; solte os dois
e ele sobe devagar até a superfície. Em primeira pessoa você vê o mundo
acima da água enquanto flutua, e o mundo debaixo dela quando mergulha.

Debaixo d’água seu avatar prende a respiração. Uma barra de **Ar** no topo
da visão mostra quanto resta: dois minutos e meio com o fôlego cheio.
Quando acaba, seu avatar é empurrado até a superfície e fica lá alguns
segundos para recuperar o fôlego antes de poder mergulhar de novo. Nade até
a margem e ele fica de pé e sai andando.

Os outros também veem você nadar e mergulhar: como seu avatar se move na
água decorre de onde ele está, então nada a mais é enviado.

### Perspectiva da câmera

Ao lado de Seguir avatar fica **Câmera**, uma fileira de quatro botões —
**Livre**, **Primeira pessoa**, **Terceira pessoa** e **Vista aérea** —
para travar a câmera numa distância fixa do seu avatar em vez de voar com
ela você mesmo. Como Seguir avatar, eles precisam de um avatar local (Meu
avatar) para ficar habilitados.

- **Livre** é a câmera orbital comum — o padrão da Visão do mundo, e o que
  todos os outros controles de câmera deste guia pressupõem.
- **Primeira pessoa** põe a câmera na altura dos olhos do seu avatar,
  olhando para onde ele está virado.
- **Terceira pessoa** fica atrás e acima do seu avatar, olhando um pouco
  para baixo — o enquadramento clássico de "ver o próprio personagem".
- **Vista aérea** olha direto para baixo, do alto, acompanhando a posição do
  seu avatar mas ignorando de propósito a direção dele, para que a vista
  nunca gire quando você vira.

Clicar no botão que já está ativo volta para **Livre**. Uma perspectiva de
câmera é puramente local — nunca é compartilhada com um colaborador e nunca
afeta o que ele vê.

Os dois modos se comportam de forma diferente quando você vira: com uma
perspectiva travada (Primeira pessoa ou Terceira pessoa), a câmera se
reenquadra na direção atual do seu avatar a cada movimento, então sua vista
vira exatamente como você. Com **Livre** selecionado, a câmera ignora de
propósito a orientação — virar no lugar, caminhar ou montar num veículo
nunca a move nem gira sozinho, só seu próprio arrastar/mover/zoom faz isso.
Se você orbitar livremente para olhar para um lado e depois sair andando
para outro, a câmera continua olhando para onde você a apontou por último,
em vez de seguir você.

### Movimento contínuo sem as mãos

Segurar **Alt** enquanto toca em **W** ou **S** faz seu avatar começar a
andar (ou, com **Shift** também pressionado, correr) naquela direção sem
parar — ele continua mesmo depois de você soltar todas as teclas,
exatamente como um piloto automático. Tocar em **W** ou **S** de novo *sem*
Alt cancela e volta ao movimento comum, com a tecla pressionada; tocar na
direção oposta do mesmo jeito também cancela, em vez de inverter. No teclado
não há indicador na tela mostrando que ele está ativo — o único sinal é seu
avatar continuar andando sozinho.

Num celular ou tablet, o botão **Piloto automático** do painel de toque faz
o mesmo: toque uma vez para andar para a frente sem as mãos, de novo para
correr e uma terceira vez para parar. Enquanto ativo, ele mostra **Piloto
automático: andar** ou **Piloto automático: correr**. Empurrar o joystick
para a frente ou para trás também o para, como tocar em **W** ou **S**;
empurrá-lo para o lado só vira você, então dá para manobrar com o piloto
automático ligado.

### Veículos

Alguns mundos têm uma bicicleta, moto, carro ou drone em que seu avatar pode
montar em vez de andar. Chegue perto o bastante de um e aparece um aviso
dizendo qual tecla o monta:

| Tecla | Ação |
|---|---|
| **E** (perto de um veículo) | Montar |
| **E** (montado) | Descer |
| **W / S** | Acelerar / dar ré |
| **A / D** | Virar o próprio corpo do avatar — o mesmo giro contínuo de quando está a pé, não a direção do veículo |
| **← / →** (pressionar) | Manobrar — uma única virada de 45° na direção pretendida do veículo por toque; segurar a tecla não continua virando, e cada virada precisa de um toque novo |
| **Ctrl** (segurado) | Frear |

Depois de montado, **W/S** e **Ctrl** conduzem o veículo, enquanto **←/→**
o manobram — não há um "modo de direção" separado para ligar. **A/D**
continuam virando o corpo do seu avatar, exatamente como a pé, e são
independentes da direção. Descer põe seu avatar a pé de novo, num ponto livre
ao lado do veículo. A velocidade máxima, a aceleração, a frenagem e a
manobrabilidade de um veículo dependem do tipo dele, e a área de colisão tem
o tamanho certo — hoje são a bicicleta, a moto, o carro e o drone, os quatro
veículos que os mundos de fato posicionam e desenham. Uma moto é mais rápida
que uma bicicleta e mais rara, um carro é ainda mais rápido que uma moto e
ainda mais raro, e um drone é o mais rápido e o mais raro de todos.

Um drone fica no chão, parado, exatamente como os outros três, até você
montar nele e começar a se mover — segurar **W** ou **S** o tira do chão;
soltar o traz de volta para baixo. No ar, ele voa acima das árvores, mas uma
construção alta ainda o bloqueia exatamente como bloquearia um carro, então
voar não quer dizer ignorar a geometria do mundo. Você não pode descer de um
drone no ar — traga-o de volta ao chão antes.

Bicicletas, motos e carros param na beira d’água. Um drone segue voando
sobre lagos e o mar, e deixa você na água: pouse, desça, e seu avatar está
nadando. Você não pode tirar um veículo com rodas do inventário enquanto
está na água.

#### Carregando um veículo

Encontrou um veículo longe de onde vai precisar dele depois? Montado,
pressione **Q** para guardá-lo no inventário — ele some do mundo e você desce
no mesmo movimento. Vá para qualquer outro lugar, pressione **Q** de novo a
pé, e o veículo guardado selecionado aparece bem onde você está, já com você
montado. Hoje não há limite de quantos veículos você pode carregar ao mesmo
tempo, e um veículo guardado nunca reaparece onde você o encontrou.

Por padrão, **Q** tira o veículo que você guardou por último. Se você
carrega mais de um, pressione **[** ou **]** para percorrer a seleção para
trás ou para a frente entre tudo o que carrega — o aviso mostra qual está
selecionado e a posição dele (por exemplo "[Q] Tirar Bicicleta (1/3)"),
para você achar um mais antigo sem precisar tirar e guardar de novo os
outros. Percorrer só muda o que **Q** vai tirar em seguida; nunca cria nem
remove nada sozinho.

#### Andando de veículo com outras pessoas por perto

Quem consegue ver seu avatar também vê em que você está montado: sua
bicicleta, moto, carro ou drone aparece embaixo de você na tela da pessoa,
virado para onde você vai, e ela ouve o motor, sua subida e descida e suas
freadas (veja "Som" em [03 — Visão do mundo](03-WorldView.md)). Você vê e
ouve os delas do mesmo jeito. Isso segue sua configuração de presença: quem
não consegue ver você também não fica sabendo em que você está montado.

Enquanto outra pessoa está montada num veículo, sua cópia dele some e você
não consegue montar nele; o veículo em que você mesmo está montado continua
sempre seu. Mas onde um veículo fica quando ninguém está montado não é
compartilhado: quando a pessoa desce, ele reaparece na sua tela onde você o
viu parado por último, que pode não ser onde ela o deixou. Um veículo
guardado com **Q** ou tirado num lugar novo também só aparece na tela do
dono até ele montar.

### Animais

Alguns mundos têm vida selvagem — cervos nas florestas, coelhos nos campos
abertos. Os animais selvagens passeiam devagar em torno de onde o mundo os
pôs, nunca se afastando mais que alguns passos. Chegue perto o bastante de um
e aparece um aviso dizendo para pressionar **F** para pegá-lo. Pegar o
adiciona ao seu inventário (o mesmo inventário onde fica um veículo
guardado) e o tira do mundo.

Vá para qualquer outro lugar e pressione **F** de novo — sem nada que dê para
pegar por perto, isso solta o último animal que você pegou bem onde você
está, e dá para pegá-lo de novo na hora se quiser. Um animal solto fica onde
você o soltou, mas não fica congelado: ele pasta, olha em volta e de vez em
quando vira para outro lado, e vira a cabeça para olhar você quando você se
aproxima. Hoje não há limite de quantos animais você pode carregar, e pegar
um nunca atrapalha um veículo que você também carrega, nem o contrário —
eles dividem a mesma mochila mas nunca se misturam.

#### Decorando um Mundo com um animal

Um animal solto só existe na sua própria sessão. Para torná-lo uma parte
duradoura do Mundo — por exemplo, um coelho sentado em cima de algo que você
construiu —, fique ao lado de um animal que você soltou e pressione **G**.
Ele vira uma **decoração de animal**: guardada no próprio conteúdo do Mundo,
então entra quando aquele Mundo é publicado ou distribuído, e todo mundo que
o abre a vê, igual ao animal de onde veio. Ela fica no ponto que você
escolheu (então um coelho num telhado nunca sai andando de lá), mas pasta,
olha em volta e vira no lugar, e todos que abrem o Mundo a veem fazendo a
mesma coisa no mesmo momento.

Uma decoração é só decorativa — não dá para pegá-la com **F**. Mudou de
ideia? Fique ao lado dela e pressione **G** de novo: a decoração é removida
do Mundo e volta a ser um animal vivo que dá para pegar. Quando os dois estão
por perto, **G** decora primeiro um animal recém-solto, assim como **F**
prefere pegar a soltar. Só animais que você soltou podem ser decorados — a
vida selvagem que o mundo pôs sozinho não pode. Um aviso aparece quando **G**
decoraria ou desfaria algo por perto. Como adicionar um
[marco](03-WorldView.md#marcos--marcando-um-lugar-que-vale-lembrar),
decorar exige que você tenha entrado com acesso EDIT ao Mundo em que está. No
Mundo publicado de outra pessoa, a decoração vai para a sua própria cópia
dele — desde que a licença permita bifurcar. Se nada disso se aplica, **G**
simplesmente não faz nada; o botão **Decorar** do painel de toque diz o
porquê.

### Moradores

Um Mundo pode ter **moradores**: pessoas que moram lá e passeiam em volta do
lugar que chamam de casa, tocando o dia entre as suas construções. Para
adicionar um, fique num chão aberto onde quer que ele more e pressione **R**
(ou clique em **Adicionar morador aqui** na seção **Avatar**). Ele aparece
bem ao seu lado e, a partir daí, faz parte do conteúdo do próprio Mundo —
salvo, publicado e bifurcado junto com ele, como um
[marco](03-WorldView.md#marcos--marcando-um-lugar-que-vale-lembrar).
Adicionar um exige que você tenha entrado com acesso EDIT ao Mundo em que
está; no Mundo publicado de outra pessoa, o morador vai para a sua própria
cópia dele. Mudou de ideia? Fique ao lado de um morador e pressione **R** de
novo (um aviso mostra **[R] Remover morador**), ou desfaça com
**Ctrl/Cmd+Z**.

Os moradores ficam a uns seis passos de casa. Eles contornam paredes,
árvores e água, nunca as atravessam, e de vez em quando fazem uma pausa para
ficar parados e olhar em volta. Todos que abrem o Mundo veem cada morador no
mesmo lugar no mesmo momento, porque onde eles estão vem do Mundo e do
relógio, não de algo enviado entre jogadores. Eles são sólidos: você esbarra
neles como esbarraria numa árvore. Mas eles não param nem desviam por você,
então um pode passar direto através de você enquanto você está parado.

Os moradores percebem você. Quando um está parado e você está na frente ou
ao lado dele, a poucos passos, ele se vira para você, e se você chegar bem
perto, ele acena. Ele acena uma vez a cada vez que você se aproxima. Como com
os animais, isso só acontece na sua tela, e só para o seu próprio avatar.

Os moradores também conhecem a vizinhança. Fique ao lado de um e pressione
**T** (um aviso mostra **[T] Conversar**; a seção Avatar e o painel de toque
também têm um botão **Conversar**), e ele conta uma ou duas coisas sobre o
que há em volta, num balão de fala sobre a cabeça: uma bicicleta ou um
cervo por perto, um marco, uma estrutura posicionada no Mundo (pelo título e
autor), alguém que está por ali, o lugar onde ele mora ou outra construção um
pouco mais longe — por exemplo *"Tem uma construção chamada “Forte do
Morro”, de bob, a uns 3,6 km a nordeste."* As distâncias são arredondadas e
as direções são vistas de onde o morador está (o norte é para onde a bússola
aponta). Converse de novo e ele fala de outra coisa. O balão some depois de
alguns segundos, ou assim que você se afasta.

Enquanto o balão está visível, aparece um botão **Focar** na parte de baixo
da visualização para cada coisa que ele mencionou e que fica no lugar — um
marco, uma estrutura, uma construção ou um veículo (animais e pessoas se
movem, então não ganham botão). Clique nele para virar a câmera e dar uma
olhada, como **Focar** no painel Locais: seu avatar fica ao lado do morador,
e voltar a andar traz a câmera de volta se Seguir avatar estiver ativo.

O que um morador diz é o que a *sua* cópia do ForkBuild sabe: as construções
do seu catálogo, as pessoas presentes com você, os veículos e animais que
você não pegou. Outra pessoa que converse com o mesmo morador pode ouvir
coisas diferentes, e ninguém mais vê o que ele disse a você. Ele nunca
menciona um veículo que você guardou ou em que está montado, um em que outra
pessoa está montada, nem um animal que você pegou. As construções são
chamadas pelo título e autor que a publicação delas dá, como em todo o resto
do app.

Um morador precisa de chão seco e aberto: não um telhado, não a água, e não
enquanto você está montado num veículo. A seção Avatar diz por quê quando
não dá para adicionar um onde você está. Os moradores não são pessoas — não
têm perfil, nunca aparecem em Pessoas nem em Por perto, não dá para clicar
neles para ver informações, e nunca dão missões, tarefas nem recompensas —
eles só moram ali, e contam o que há por perto quando você pergunta.

#### O que sobrevive a uma recarga

Seu inventário — todos os veículos e animais que você carrega — fica salvo
neste dispositivo, assim como os veículos que você posicionou ou em que
andou em algum lugar e os animais que você soltou, bem onde você os deixou.
Recarregar a página ou voltar mais tarde continua exatamente de onde você
estava.

### Percepção espacial e atividade

Quando há outras pessoas presentes, você vê indicadores de contexto
mostrando o que elas estão fazendo:

- "**Bob — explorando por perto**" aparece perto do avatar dele enquanto ele
  voa ou anda por aí.
- "**Alice — inspecionando um bloco**" indica que alguém está olhando algo de
  perto, sem mudá-lo.

Esses indicadores de atividade vêm dos dados de presença espacial e ajudam
você a entender para o que os outros estão olhando sem precisar de
comunicação explícita.

Os indicadores de atividade só descrevem o que alguém está fazendo; nunca
mudam nada — veja
[Vendo outros colaboradores](03-WorldView.md#vendo-outros-colaboradores).

## E agora?

Encontre pessoas com quem se conectar em
**[Conexões entre pares e amigos](07-PeerConnectionsAndFriends.md)**, depois
converse com seus amigos em **[Conversas](08-ChatAndConversations.md)**.
