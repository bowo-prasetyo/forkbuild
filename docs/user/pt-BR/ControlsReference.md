<!-- translation-of: docs/user/ControlsReference.md source-hash: 14214dca588aad38 -->
# Referência de controles

<!-- languages -->
[English](../ControlsReference.md) · [Deutsch](../de/ControlsReference.md) · [Español](../es/ControlsReference.md) · [Français](../fr/ControlsReference.md) · [Bahasa Indonesia](../id/ControlsReference.md) · [日本語](../ja/ControlsReference.md) · [한국어](../ko/ControlsReference.md) · **Português (Brasil)**
<!-- /languages -->

Todas as interações de mouse e teclado do ForkBuild; celulares e tablets
estão em [Telas sensíveis ao toque](#telas-sensíveis-ao-toque). A Visão do
mundo serve para olhar em volta e navegar; todos os controles de construção
(seleção para edição, transformações, grupos, área de transferência,
colocação e a Paleta de comandos) só funcionam no Editor. Os atalhos do
Editor são os mesmos listados na Paleta de comandos e na sobreposição **⌨
Atalhos** — se esta página e a paleta discordarem, a paleta está certa e
esta página tem um erro.

Abra a **Paleta de comandos** com `Ctrl/Cmd+K` no Editor para pesquisar por
nome todas as operações de edição abaixo.

## Câmera (nas duas visões)

| Entrada | Ação |
|---|---|
| Arrastar com o botão esquerdo num espaço vazio | Orbitar |
| Arrastar com o botão direito | Mover a vista |
| Roda do mouse | Zoom |
| `Home` | Editor: volta a câmera ao padrão (ignorado enquanto um arraste do gizmo está ativo). Visão do mundo: leva a câmera e o avatar de volta ao seu próprio mundo atual — veja [Visão do mundo](03-WorldView.md#orientação-e-locais) |

## Superfície de comandos (só no Editor)

| Entrada | Ação |
|---|---|
| `Ctrl/Cmd+K` | Paleta de comandos |
| `?` | Sobreposição Atalhos de teclado (também pelo botão "⌨ Atalhos" da barra de ferramentas) — todos os atalhos do Editor |

## Descoberta (Visão do mundo)

Não são atalhos de teclado, mas o jeito próprio da Visão do mundo de
encontrar coisas — veja
[Visão do mundo](03-WorldView.md#encontrando-mundos) para a explicação
completa.

| Controle | Ação |
|---|---|
| Painel Buscar, **Buscar** | Pesquisar publicações por título/autor, se quiser dentro de um raio em torno de uma coordenada |
| **Explorar aqui** | Abrir a caixa de diálogo Explorar local centrada na posição atual da câmera |
| **O que há aqui?** | O mesmo, com um raio pequeno e fixo — "o que há praticamente aqui" |
| **Focar** de um resultado | Voar com a câmera até lá e torná-lo o documento ativo (em edição) |
| **Selecionar** de um resultado | Torná-lo o documento ativo, sem mover a câmera |
| **Inspecionar** de um resultado | Expandir um resumo somente leitura ali mesmo |

## Orientação e navegação (Visão do mundo)

Só navegação de câmera — nenhum destes carrega um documento, muda a seleção
ou edita algo. Veja [Visão do mundo](03-WorldView.md#orientação-e-locais).

| Controle | Ação |
|---|---|
| Indicador da bússola | Direção somente leitura, com marcadores de contexto para estruturas e elementos do terreno próximos |
| **Início** | Levar a câmera e o avatar de volta ao seu próprio mundo atual (volta à origem compartilhada se você ainda não focou um mundo seu nesta sessão) — veja [Visão do mundo](03-WorldView.md#orientação-e-locais) |
| **Locais** | Abrir uma lista do Mundo, das estruturas, dos marcos e dos lugares dele, cada um com um botão **Focar** |
| **?** | Mostrar ou ocultar os controles de câmera e de caminhada |
| 🔔 **Notificações** (cabeçalho do app, em todas as páginas) | Abrir seu **Histórico de notificações** — um registro somente leitura, não uma ação de câmera; veja [Visão do mundo](03-WorldView.md#orientação-e-locais) |
| **Câmera**: Livre / Primeira pessoa / Terceira pessoa / Vista aérea | Travar a câmera numa distância fixa do seu avatar em vez de voar com ela você mesmo; clique de novo no botão ativo para voltar a Livre — veja [Avatares e presença](06-AvatarsAndPresence.md#perspectiva-da-câmera) |

### Descrições de lugar conforme o contexto

Enquanto você se move pelo mundo, a interface mostra contexto calculado,
como:

- "**Floresta · perto de Casa**" — você está numa floresta, a menos de 50
  unidades de uma estrutura
- "**Pastagem · rio**" — terreno aberto ao lado de um rio
- "**Pastagem · lago · perto de Celeiro**" — terreno, água e a estrutura
  mais próxima

Essas descrições são calculadas a partir da sua posição, da ecologia do
terreno, da hidrologia e dos posicionamentos de estruturas — nada é guardado
no mundo.

## Som (nas duas visões)

| Entrada | Ação | Observações |
|---|---|---|
| `M` | Ligar ou desligar o som | Igual ao botão **Som**; uma única configuração para as duas visões, lembrada neste dispositivo. Veja [Visão do mundo](03-WorldView.md#som) e [o Editor](02-TheEditor.md#som) |

## Movimento do avatar (Visão do mundo)

Caminhar diretamente com seu avatar, em vez de voar com a câmera — veja
[Avatares e presença](06-AvatarsAndPresence.md#caminhando-com-seu-avatar).

| Entrada | Ação | Observações |
|---|---|---|
| `W` / `A` / `S` / `D` | Mover / virar | Barrado por construções, árvores, vida selvagem e moradores próximos, como por uma parede |
| `Shift` (segurado) | Correr | |
| `Espaço` | Pular | |
| `Alt` + `W` / `S` | Começar a andar sem parar para a frente/para trás | Continua se movendo depois de soltar as teclas; um toque comum em `W`/`S` sem Alt cancela |
| `Alt` + `Shift` + `W` / `S` | Começar a correr sem parar para a frente/para trás | Mesma regra de cancelamento de cima |

## Veículos (Visão do mundo)

Veja [Avatares e presença](06-AvatarsAndPresence.md#veículos). Exige
controlar seu avatar; um aviso aparece automaticamente quando você está
perto o bastante de um veículo para montar nele.

| Entrada | Ação | Observações |
|---|---|---|
| `E` | Montar no veículo próximo, ou descer daquele em que está | Só aparece/funciona quando há um veículo ao alcance ou você está montado |
| `W` / `S` | Acelerar / dar ré | Substitui a caminhada a pé enquanto montado |
| `A` / `D` | Virar o próprio corpo do avatar | O mesmo giro de quando está a pé — não é a direção do veículo |
| `←` / `→` (pressionar) | Virar a direção pretendida do veículo para a esquerda/direita | Uma única virada de 45° por toque — segurar a tecla não continua virando |
| `Ctrl` (segurado) | Frear | |
| `Q` (montado) | Guardar no inventário o veículo em que você está | Tira-o do mundo; você desce ao mesmo tempo |
| `Q` (a pé, carregando um veículo) | Tirar o veículo guardado selecionado | Cria-o e monta nele na sua posição atual; por padrão, o guardado por último |
| `[` / `]` (carregando 2 ou mais veículos) | Passar a seleção para um veículo guardado mais antigo / mais novo | Só muda qual `Q` vai tirar em seguida — nunca monta nem remove nada sozinho |

## Animais (Visão do mundo)

Veja [Avatares e presença](06-AvatarsAndPresence.md#animais). Exige
controlar seu avatar; um aviso aparece automaticamente quando há um animal
que dá para pegar por perto ou você está carregando um.

| Entrada | Ação | Observações |
|---|---|---|
| `F` (perto de um animal que dá para pegar) | Pegá-lo | Adiciona-o ao inventário e o tira do mundo |
| `F` (sem animal para pegar por perto, carregando um) | Soltar o último animal que você pegou | Cria-o na sua posição atual, de novo pegável |
| `G` (perto de um animal que você soltou) | Decorar o Mundo com ele | Guarda-o no conteúdo do Mundo como decoração — deixa de ser pegável; exige acesso EDIT. Um aviso aparece quando `G` faria algo |
| `G` (perto de uma decoração de animal, sem animal solto por perto) | Desfazer a decoração | Tira-a do Mundo e a transforma de novo num animal vivo e pegável |

## Moradores (Visão do mundo)

Veja [Avatares e presença](06-AvatarsAndPresence.md#moradores). Exige
controlar seu avatar; os botões **Adicionar morador aqui** / **Remover
morador** e **Conversar** da seção Avatar fazem o mesmo sem isso.

| Entrada | Ação | Observações |
|---|---|---|
| `R` (em chão aberto, sem morador bem ao seu lado) | Adicionar um morador cuja casa é onde você está | Guardado no conteúdo do Mundo; exige acesso EDIT. Não num telhado, na água nem montado num veículo |
| `R` (ao lado de um morador) | Tirá-lo do Mundo | Um aviso mostra **[R] Remover morador**; desfaça com `Ctrl/Cmd+Z` |
| `T` (ao lado de um morador) | Conversar: ele conta o que há em volta | Num balão sobre a cabeça dele; converse de novo para ouvir outra coisa. O botão **Conversar** da seção Avatar e do painel de toque faz o mesmo |
| Botão **Focar: …** (enquanto as palavras de um morador estão visíveis) | Olhar o que ele mencionou | Só a câmera; seu avatar fica onde está. Aparece para marcos, estruturas, construções e veículos |

Seu inventário, os veículos posicionados e os animais soltos ficam salvos
neste dispositivo e sobrevivem a uma recarga — veja
[Avatares e presença](06-AvatarsAndPresence.md#o-que-sobrevive-a-uma-recarga).

## Seleção (Editor; clicar num bloco na Visão do mundo só o inspeciona)

| Entrada | Ação | Observações |
|---|---|---|
| Clicar num bloco | Selecioná-lo (substitui a seleção) | na Visão do mundo isso só abre o painel Inspeção — veja [Visão do mundo](03-WorldView.md#a-visão-do-mundo-é-somente-leitura--construir-é-no-editor) |
| `Shift` + clique | Adicionar o bloco à seleção | |
| `Ctrl/Cmd` + clique | Pôr o bloco na seleção ou tirá-lo | |
| `Shift` + arrastar | Seleção por caixa (substitui a seleção) | `Ctrl/Cmd+Shift` + arrastar soma à seleção; arrastar sem tecla orbita a câmera |
| `Ctrl/Cmd+A` | Selecionar tudo | |
| `Esc` | Limpar a seleção | Sequência própria do Esc no Editor, abaixo — o Esc da Visão do mundo só fecha o painel que estiver aberto |
| `Delete` / `Backspace` | Excluir a seleção — **só no Editor** | um passo de desfazer; nenhuma tecla faz isso na Visão do mundo |
| Botão **Focar** do painel Seleção — **só no Editor** | Enquadrar a câmera no(s) bloco(s) selecionado(s), na hora | sem atalho de teclado; só a câmera — nunca mexe no documento, na seleção nem no histórico de desfazer; só para seleções de blocos, não para posicionamentos de estruturas |

## Transformar — teclado (só no Editor)

| Entrada | Ação |
|---|---|
| `→` / `←` | Mover a seleção ao longo do X do mundo |
| `↑` / `↓` | Mover a seleção ao longo do Z do mundo |
| `PgUp` / `PgDn` | Mover a seleção ao longo do Y do mundo |
| `R` | Girar +90° em torno do pivô da seleção |
| `Shift+R` | Girar −90° |
| `Shift` enquanto arrasta o gizmo | Modo de precisão (passos de 0,1×) |

## Transformar — gizmo (só no Editor)

| Entrada | Ação |
|---|---|
| Passar o mouse sobre uma alça | Destaca a alça |
| Arrastar uma alça de eixo (X vermelho / Y verde / Z azul) | Mover ao longo daquele eixo (com encaixe) |
| Arrastar o quadrado central (âmbar) | Movimento livre no plano do chão |
| Arrastar o anel de rotação (roxo) | Girar em torno do pivô (com encaixe) |
| Soltar | Confirmar — exatamente um passo de desfazer |
| `Esc` no meio do arraste | Cancelar — nada muda, nada no histórico |

Se algum bloco de um arraste ou deslocamento de vários blocos fosse cair
sobre um bloco fora da seleção, soltar ali cancela o gesto em vez de
confirmá-lo — todos os blocos voltam exatamente para onde começaram, sem
nova entrada de desfazer. Reorganizar blocos dentro da mesma seleção nunca
conta como colisão.

## Transformar — painel numérico (só no Editor)

Na seção **Posição e rotação exatas** do painel Seleção.

| Entrada | Ação |
|---|---|
| Digitar nos campos X/Y/Z/R | Valores exatos; campo vazio = sem mudança |
| Alternância Absoluto / Deslocamento | Mirar o pivô ou somar uma diferença simples |
| `Enter` ou Aplicar | Uma operação, um passo de desfazer — nunca com encaixe |
| `Esc` num campo, ou **Limpar campos** | Esvaziar os campos (nunca limpa a seleção) |

## Alinhamento e distribuição (só no Editor)

Disponível na seção **Alinhar, distribuir, repetir** do painel Seleção e
pela paleta. O alinhamento precisa de **2 ou mais blocos**; a distribuição,
de **3 ou mais**. Os dois agem sobre os limites da seleção inteira nos
**eixos do mundo** e confirmam um único comando.

## Repetir (só no Editor)

Também na seção **Alinhar, distribuir, repetir** do painel Seleção. Cria
**N** cópias a mais da seleção, deslocadas por igual ao longo de um eixo,
como **um passo de desfazer** — o lote inteiro é conferido quanto a colisões
antes de qualquer coisa ser criada, então uma colisão no meio do lote
bloqueia a repetição inteira, em vez de criar algumas cópias e outras não.

| Entrada | Ação |
|---|---|
| Campo **Cópias** | Quantas cópias a mais (o original nunca é tocado) |
| Campo **Deslocamento** | Distância entre cada cópia |
| **Repetir X / Y / Z** | Repetir ao longo daquele eixo do mundo |

## Estruturas (Biblioteca de construção) — só no Editor

Compor, bifurcar e sua biblioteca pessoal — veja
[O Editor](02-TheEditor.md#estruturas-compor-bifurcar-e-sua-biblioteca-pessoal).

| Entrada | Ação | Observações |
|---|---|---|
| Clicar num cartão da guia **Estruturas** | Entrar no modo de posicionamento de estrutura; a prévia fantasma acompanha o ponteiro | funciona com uma estrutura pronta ou uma das suas **Minhas estruturas** |
| `R` / `Shift+R` ao posicionar | Girar o fantasma pendente ±90° | as mesmas teclas da prévia de um bloco |
| Clicar | Confirmar — todos os blocos da estrutura entram como um passo de desfazer | recusado numa posição ocupada (vermelha) |
| `Esc` ao posicionar | Cancelar — nada é adicionado | |
| Menu **⋮** do cartão, **Bifurcar como novo documento** | Começar um documento novo que nasce como cópia daquela estrutura | nunca muda a entrada da biblioteca |
| Menu **⋮** de um cartão pronto, **Bifurcar para Minhas estruturas** | Adicioná-la a Minhas estruturas como está | nenhum documento criado, nada extraído |
| Menu **⋮** de qualquer cartão, **Informações** | Mostrar um painel somente leitura com nome/categoria/blocos/área ocupada/altura/origem/descrição | nunca editável |
| Seleção com **1 ou mais blocos**, depois **Criar planta** (seção **Grupos e planta** do painel Seleção, ou Paleta de comandos) | Abrir uma pequena caixa de diálogo (nome / categoria / descrição + prévia); salvar a seleção como nova entrada em **Minhas estruturas** | |
| Menu **⋮** de um cartão de **Minhas estruturas**, **Renomear** | Mudar o nome de uma estrutura pessoal | só estruturas pessoais |
| Menu **⋮** de um cartão de **Minhas estruturas**, **Remover** | Excluí-la da sua biblioteca | nunca mexe nos blocos já compostos ou bifurcados a partir dela |
| Menu **⋮** de qualquer cartão, **Exportar planta** | Baixá-la como arquivo JSON portátil | pronta ou pessoal |
| Botão **Importar planta** (ao lado do título Minhas estruturas) | Adicionar um arquivo de planta à sua biblioteca como entrada nova | identidade nova, mesmo para um arquivo importado de novo |

## Instâncias de estrutura (Editor)

Uma **instância de estrutura** posiciona um documento salvo inteiro como uma
única unidade selecionável — uma referência viva, não uma cópia — veja
[O Editor](02-TheEditor.md#instâncias-de-estrutura-uma-referência-viva).

| Entrada | Ação | Observações |
|---|---|---|
| Menu **Recentes** da barra de ferramentas, botão **Posicionar** de um documento | Entrar no modo de posicionar estrutura com aquele documento | clicar no nome do documento o abre em vez disso |
| `R` / `Shift+R` ao posicionar | Girar a instância pendente ±90° | as mesmas teclas da prévia de um bloco |
| Clicar numa instância posicionada (ferramenta Selecionar) | Selecioná-la como uma unidade, diferente de uma seleção de blocos | |
| Arrastar na área de visualização, ou o gizmo | Mover / girar a instância | |
| `Ctrl/Cmd+D` | Duplicar — posiciona outra instância do mesmo documento | veja [Duplicar](#duplicar-só-no-editor) — seleções de instância ganham uma instância nova em vez de uma cópia nova de blocos |
| Campos **X / Z / Rotação** do painel da instância, depois Aplicar | Definir posição/direção exatas | Y (altura) sempre vem do terreno, nunca é um alvo |
| **Editar documento de origem** no painel da instância | Abrir o documento referenciado para mudar os blocos dele | todas as instâncias se atualizam, já que uma instância é uma referência viva |
| `Delete` / `Backspace` | Remover a instância | nunca mexe no documento referenciado |

## Grupos (só no Editor)

Na seção **Grupos e planta** do painel Seleção; sem nada selecionado, o
painel lista seus grupos para você clicar num e selecioná-lo.

| Operação | Disponível quando |
|---|---|
| Novo grupo | há blocos selecionados |
| Renomear / Duplicar / Excluir grupo | há um grupo selecionado |
| Adicionar ao grupo / Remover do grupo | há blocos selecionados e um grupo selecionado |

As transformações de grupo (mover/girar/alinhar/distribuir/numérica) agem
sobre os blocos membros resolvidos; a participação em si nunca é mudada por
uma transformação.

## Área de transferência (só no Editor)

| Entrada | Ação | Observações |
|---|---|---|
| `Ctrl/Cmd+C`, ou **Copiar** do painel Seleção | Copiar | exige uma seleção |
| `Ctrl/Cmd+V`, ou **Colar** do painel Seleção | Colar | o botão aparece quando a área de transferência tem algo |

## Duplicar (só no Editor)

| Entrada | Ação | Observações |
|---|---|---|
| `Ctrl/Cmd+D` | Duplicar a seleção atual no lugar — um passo de desfazer | funciona com blocos soltos ou um grupo resolvido; uma seleção de instância de estrutura também é duplicada — veja [Instâncias de estrutura](#instâncias-de-estrutura-editor). Não mexe na área de transferência (nem num deslocamento de colagem pendente) |

A duplicata vira a seleção ativa, então fica pronta para arrastar ou
deslocar na hora.

## Histórico

| Entrada | Ação | Onde |
|---|---|---|
| `Ctrl/Cmd+Z` | Desfazer | Editor e Visão do mundo |
| `Ctrl/Cmd+Shift+Z` ou `Ctrl/Cmd+Y` | Refazer | Editor e Visão do mundo |

Na Visão do mundo, desfazer e refazer valem para as edições de anotação
dela: marcos, nomes de regiões e decorações de animais. O painel Histórico
dela (veja
[Visão do mundo](03-WorldView.md#histórico--visualizar-e-restaurar-estados-anteriores))
também pode visualizá-las e restaurá-las.

## Só no Editor

| Entrada | Ação |
|---|---|
| `1` / `2` | Alternar entre as ferramentas Selecionar / Colocar |
| `Ctrl/Cmd+S` | Salvar o documento |

## Colocação (só no Editor)

Estas teclas pertencem à ferramenta Colocar, por isso não aparecem na Paleta
de comandos (lá, `R`/`Shift+R` giram uma *seleção*). A Visão do mundo não
tem ferramenta Colocar.

| Entrada | Ação | Observações |
|---|---|---|
| Mover o ponteiro | A prévia acompanha o chão ou a face de bloco sob o ponteiro | fica vermelha quando a posição está ocupada |
| `R` | Girar a prévia pendente +90° | continua ao trocar de bloco; zera quando você sai do modo Colocar. Pressionada antes de passar o mouse sobre algo, gira a próxima prévia |
| `Shift+R` | Girar a prévia pendente −90° | |
| Clicar | Confirmar a prévia como um bloco de verdade | recusado numa posição ocupada (vermelha) |
| Amostra **Cor** da Biblioteca de construção | Escolher a cor dos próximos blocos que você colocar | volta à cor padrão do tipo quando você escolhe outro tipo — veja [Cores dos blocos](02-TheEditor.md#cores-dos-blocos) |

Para mudar a cor de blocos já colocados, selecione-os e use a amostra
**Cor** da seção Seleção — um passo de desfazer por mudança.

## Telas sensíveis ao toque

Num celular ou tablet, as mesmas ações têm controles na tela. Eles aparecem
sempre que o dispositivo tem tela sensível ao toque, então um notebook com
tela de toque os mostra ao lado do teclado e do mouse. Numa tela de 720
pixels de largura ou menos, a página também se reorganiza: os links das
páginas se recolhem num botão **Menu**, o painel lateral da Visão do mundo
abre por um botão **Painel**, e a barra lateral do Editor vira uma gaveta
aberta por um botão **Ferramentas**.

### Câmera (nas duas visões)

| Toque | Ação |
|---|---|
| Arrastar com um dedo | Orbitar |
| Arrastar com dois dedos | Mover a vista |
| Pinça | Zoom |
| Toque | Visão do mundo: inspecionar o que você tocou. Editor: o mesmo que um clique com a ferramenta atual |

### Caminhando (Visão do mundo)

O painel de toque aparece enquanto você controla seu avatar; o botão
**Andar**, acima do joystick, liga e desliga esse modo, e com ele o painel.

| Controle | Teclas que substitui | Observações |
|---|---|---|
| Joystick | `W` / `A` / `S` / `D` | Empurre para cima para andar para a frente, para o lado para virar; as diagonais pressionam as duas teclas |
| Joystick empurrado até a borda | `Shift` | Correr |
| **Pular** | `Espaço` | |
| **Piloto automático** | `Alt` + `W`, depois `Alt` + `Shift` + `W`, depois `W` | Cada toque: andar para a frente sem as mãos, depois correr, depois parar. Mostra **Piloto automático: andar** / **Piloto automático: correr** enquanto ativo. Empurrar o joystick para a frente ou para trás também para; para o lado, só manobra |
| **Montar** / **Descer** | `E` | Aparece quando há um veículo ao alcance, ou enquanto você está montado |
| **Guardar** / **Tirar** | `Q` | Aparece quando você pode guardar o veículo em que está, ou tirar um guardado. Tirar diz o nome do veículo, e o lugar dele na lista (como 2/3) quando você carrega mais de um |
| **‹** / **›** ao lado de Tirar | `[` / `]` | Carregando 2 ou mais veículos: escolher um mais antigo ou mais novo para tirar |
| **Pegar** / **Soltar** | `F` | Aparece quando há um animal pegável por perto, ou enquanto você carrega um |
| **Decorar** / **Desfazer decoração** | `G` | Aparece perto de um animal que você soltou, ou perto de uma decoração. Ao contrário de `G`, uma decoração recusada (sem ter entrado, sem acesso EDIT) diz por quê |
| **↶** / **↷** | `←` / `→` | Montado: uma virada de 45° por toque |
| **Frear** | `Ctrl` (segurado) | Montado |

Os botões do painel substituem os avisos de teclado, que ficam ocultos
enquanto ele aparece. Andar para trás sem as mãos (`Alt` + `S`) não tem botão
de toque; uma caminhada assim iniciada pelo teclado aparece como **Piloto
automático: para trás**, e tocar nele a para.

### Editando (Editor)

Um toque faz o que um clique faz: seleciona com a ferramenta Selecionar,
coloca com a ferramenta Colocar. Arrastar só move a câmera, então orbitar
nunca coloca um bloco nem limpa a seleção por engano. O toque não tem
"passar o mouse", então a ferramenta Colocar não mostra prévia antes do
toque; o bloco vai para onde você toca. Escolher um bloco ou uma estrutura
para colocar fecha a gaveta Ferramentas, para que o próximo toque chegue à
cena. A barra na parte de baixo da área de visualização substitui as
teclas:

| Botão | O mesmo que | Observações |
|---|---|---|
| **Desfazer** / **Refazer** | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` | |
| **Girar** | `R` | Ao colocar, gira o próximo bloco ou estrutura antes do toque; senão, gira a seleção |
| **Excluir** | `Delete` | |
| **Múltiplo** | `Ctrl/Cmd` + clique | Ligado, cada toque põe um bloco na seleção ou o tira |
| **Caixa** | `Shift` + arrastar | Ligado, arrastar com um dedo desenha uma caixa de seleção em vez de mover a câmera; com **Múltiplo** também ligado, a caixa soma à seleção (`Ctrl/Cmd+Shift` + arrastar). A câmera fica parada enquanto Caixa está ligado (um segundo dedo cancela a caixa em vez de dar zoom), então desligue para voltar a se mover |
| **Mais** | `Ctrl/Cmd+K` | A Paleta de comandos, que leva a todas as outras ações de edição |

As alças do gizmo funcionam com toque como com o mouse, com **Caixa** ligado
ou não: arraste uma alça.

## Prioridade do Esc (Editor)

O Esc depende do contexto, exatamente nesta ordem:

1. **Campo de texto ativo** — limpa o campo / tira o foco dele.
2. **Sobreposição Atalhos de teclado** — fecha a sobreposição (`?` também a
   fecha).
3. **Paleta de comandos** — fecha a paleta.
4. **Gesto do gizmo ativo** — cancela o arraste (nada no histórico).
5. **Caixa de seleção ativa** — cancela a caixa.
6. **Nos outros casos** — limpa a seleção (no modo Colocar: sai da
   colocação).

### Esc na Visão do mundo

Um campo de texto ativo continua sendo dono do Esc do mesmo jeito; nos
outros casos, o Esc fecha o painel da Visão do mundo que estiver aberto (o
painel Focar, um painel de nomes e assim por diante).
