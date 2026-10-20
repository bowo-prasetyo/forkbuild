<!-- translation-of: docs/user/02-TheEditor.md source-hash: a6b88e4e92839dec -->
# 02 — O Editor

<!-- languages -->
[English](../02-TheEditor.md) · [Deutsch](../de/02-TheEditor.md) · [Español](../es/02-TheEditor.md) · [Français](../fr/02-TheEditor.md) · [Bahasa Indonesia](../id/02-TheEditor.md) · [日本語](../ja/02-TheEditor.md) · [한국어](../ko/02-TheEditor.md) · **Português (Brasil)**
<!-- /languages -->

O Editor é onde você constrói. Este guia mostra as ferramentas, como
selecionar e transformar blocos e como organizar sua construção com grupos.

## O layout

![O Editor](../img/pt-BR/editor.jpg)
*A barra de ferramentas no alto; à esquerda, as ferramentas, o nome da construção, o painel Seleção e a Biblioteca de construção; no meio, a visão 3D.*

```
┌─────────────────────────────────────────────────────────────┐
│ Barra: Salvar · Publicar · Novo · Exportar · Importar ·     │
│        Recentes · ⌨ Atalhos                                 │
├──────────────────────┬──────────────────────────────────────┤
│ [Selecionar|Colocar] │                                      │
│ Título da constr.   ✎│                                      │
│ Seleção              │      Área de visualização 3D         │
│ Biblioteca de        │                                      │
│ construção           │                                      │
│  [Blocos|Estruturas] │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

- **Barra de ferramentas** — primeiro **Salvar**, **Publicar** e **Novo**,
  depois **Arquivo**, um menu com **Exportar**, **Modelo 3D** e **Importar**;
  reabrir os recentes e abrir a sobreposição **⌨ Atalhos** (também `?`).
- **Ferramentas** — alterne entre **Selecionar** (`1`) e **Colocar** (`2`).
  **Colocar** fica destacado enquanto você coloca um bloco ou uma estrutura.
- **Título da construção** — o nome da construção aberta. Clique em **✎** para
  editar o título, a descrição e a licença. Se ela está salva aparece na
  barra de ferramentas.
  Clique no próprio título (**▸**) para abrir o mesmo painel **Sobre esta
  construção** que a Visão do Mundo mostra, com **Ler mais** para uma
  descrição longa; **▾** fecha de novo, e o Editor lembra o que você
  escolheu.
- **Seleção** — mostra só o que pode agir sobre a seleção atual; veja
  [O painel Seleção](#o-painel-seleção) abaixo.
- **Biblioteca de construção** — uma caixa de pesquisa e duas guias.
  Digite parte de um nome, ou diga com suas palavras do que precisa:
  *atravessar o rio* encontra a Ponte, *dormir* a Cama. As palavras pelas
  quais cada bloco e cada estrutura são encontrados vêm com o aplicativo,
  então nada é enviado a lugar nenhum.
  - **Blocos** — tudo o que você pode colocar com a ferramenta Colocar, em
    blocos de seis seções (Básicos, Estrutura, Telhados e escadas,
    Aberturas, Detalhes, Natureza): cinquenta e nove peças, de meios cubos,
    blocos redondos e toras a telhados de duas águas e cônicos, telhados de
    quatro águas que cobrem uma casa inteira numa peça só (4x4, 4x6 e 6x6) e
    um telhado de duas águas comprido 2x4, molduras de janela e janelas
    redondas, cercas, bancos, arbustos e pinheiros, móveis para os cômodos em
    que você entra (uma mesa, uma cama, uma lareira e uma estante, em
    Detalhes) e uma **Lanterna** que acende à noite na Visão do mundo (veja
    [Dia e noite](03-WorldView.md#dia-e-noite)). Clique em um para selecioná-lo (e passar para a
    ferramenta Colocar); aparece então uma amostra **Cor** para escolher a
    cor dele — veja [Cores dos blocos](#cores-dos-blocos) abaixo.
    **Rampa 45°**, **Rampa suave 2x1**, **Escada**, **Escada larga** e
    **Escora diagonal 2x2** sobem para um lado;
    gire um duas vezes (**R**, **R**) para virá-lo para o outro lado. Uma
    escora diagonal e uma cópia girada 180° formam um X.
  - **Estruturas** — vinte e duas estruturas prontas em cinco categorias
    (residencial, agrícola, comercial, comunitária, infraestrutura) e três
    construções maiores da categoria **vitrine**, mais as
    suas em **Minhas estruturas**. Clique em um cartão para posicioná-la —
    veja
    [Estruturas: compor, remixar e sua biblioteca pessoal](#estruturas-compor-remixar-e-sua-biblioteca-pessoal)
    abaixo.

### O painel Seleção

O painel muda conforme o que você selecionou, então nunca mostra botões que
ainda não podem fazer nada:

- **Nada selecionado** — uma dica curta, **Selecionar tudo**, **Colar**
  depois que você copiou algo, e seus grupos (clique em um para selecionar os
  blocos dele).
- **Blocos selecionados** — quantos são, onde estão, e as ações do dia a
  dia: **Girar ↻ / ↺**, **Duplicar**, **Excluir**, **Copiar**, **Colar**,
  **Cor**, **Focar** e **Desmarcar**. As ferramentas menos usadas ficam
  recolhidas em três seções logo abaixo: **Posição e rotação exatas**,
  **Alinhar, distribuir, repetir** e **Grupos e planta**.
- **Uma instância de estrutura selecionada** — no lugar disso, um cartão
  próprio, com posição, rotação e ações (veja
  [Instâncias de estrutura](#instâncias-de-estrutura-uma-referência-viva)).

> **Dica:** Pressione `Ctrl/Cmd+K` em qualquer lugar para abrir a **Paleta
> de comandos** — uma lista pesquisável, por nome, de todas as ações deste
> guia.

## Experimente agora: uma casa para terminar

**Experimente agora**, no **Início**, abre uma casa sua que ainda não está
pronta: as paredes estão de pé e o cômodo está mobiliado, mas ela não tem
telhado. Um cartão **Sua tarefa: colocar o telhado** no alto das ferramentas
avisa isso. Clique em **Pegar o telhado** (ele escolhe
**Telhado de quatro águas 6x6** e muda para Colocar) e depois em qualquer
lugar da casa: o telhado vai para cima das paredes. Então o cartão diz que
a casa agora é sua, com **Publicar** (o mesmo Publicar da barra de
ferramentas) e **Continuar construindo**, que guarda o cartão.

Qualquer outra construção pronta (os cartões do **Início**, as ideias de um
desafio ou uma escolhida em **Novo** no Editor) abre com um cartão
**Deixe com a sua cara**. Clique em **Pegar uma árvore** (ele escolhe uma
árvore e muda para Colocar) e depois no chão ao lado da construção. Assim que
houver algo seu nela, o cartão oferece **Publicar** do mesmo jeito. No
celular, o cartão fica sobre a visão 3D, acima dos botões de toque, porque ali
as ferramentas ficam recolhidas.

## Sua primeira construção

Na primeira vez que você abre o Editor em um dispositivo, um cartão **Sua
primeira construção** fica no canto inferior esquerdo da visão 3D (no
celular, ele começa recolhido em um pequeno botão
**Primeira construção · 0/6** no canto superior esquerdo). Ele lista seis
passos e mostra uma dica para o próximo:

1. **Colocar um bloco**
2. **Empilhar um sobre outro**: coloque um bloco em cima de outro.
3. **Adicionar uma estrutura**: coloque uma estrutura da aba **Estruturas**
   da Biblioteca de construção.
4. **Salvar sua construção**
5. **Publicar e compartilhar um link**: publique e depois use **Copiar
   link** ou **Compartilhar…**.
6. **Entrar andando**: clique em **Entrar andando**, ao lado do link que
   Publicar mostra (ou no cartão), e entre pela porta da sua construção na
   Visão do Mundo (veja
   [Entrar andando](04-PublishingAndForking.md#entrar-andando)).

Cada passo é marcado quando você o faz, em qualquer ordem; desfazer e
refazer não contam. Quando os seis estão feitos, o cartão comemora e
oferece **Ver outras construções** ou **Continuar construindo**, e depois
some; se já estava concluído antes de entrar andando ser um passo, não
volta. **–** o recolhe no botão pequeno; **Ocultar o guia** o esconde de vez
neste dispositivo. Para trazê-lo de volta, abra a paleta de comandos
(**Ctrl+K**) e execute **Guia da primeira construção**. Um dispositivo que
já tem trabalho salvo começa com o guia oculto.

## As duas ferramentas

### Ferramenta Colocar (`2`)

Escolha um bloco na paleta, passe o mouse pela área de visualização e
clique para colocá-lo. Sem nenhum bloco escolhido ainda, Colocar começa
com um **Cubo**, então o primeiro clique sempre coloca alguma coisa. Um
fantasma translúcido mostra exatamente onde o bloco vai parar. Passe o mouse
sobre a face de um bloco existente para empilhar ou prender. Um bloco posto
em cima de outro se apoia no bloco mais alto embaixo dele, não dentro dele:
um telhado solto no meio do piso de uma casa fica sobre as paredes, e uma
viga atravessada em dois postes, sobre os postes.

> **Dica:** Pressione **Esc** para voltar à ferramenta Selecionar.

### Ferramenta Selecionar (`1`)

Clique em blocos para selecioná-los e depois mova, gire ou exclua. É aqui
que você passa a maior parte do tempo depois que a forma está esboçada.

## Selecionando blocos

O ForkBuild dá a você um controle preciso da seleção:

| Ação | Resultado |
|---|---|
| **Clicar** em um bloco | Seleciona o bloco (substitui a seleção atual) |
| **Ctrl/Cmd + clique** | Põe o bloco na seleção ou tira dela |
| **Shift + clique** | Adiciona o bloco à seleção |
| **Shift + arrastar** | Desenha uma caixa — seleciona tudo o que está dentro |
| **Ctrl/Cmd + Shift + arrastar** | Seleção por caixa *somando* à seleção atual |
| **Ctrl/Cmd + A** | Seleciona todos os blocos da construção |
| **Esc** | Limpa a seleção |

> **Por que importa:** Construir qualquer coisa maior que um bloco significa
> trabalhar com *muitos* blocos ao mesmo tempo. Aprenda cedo a caixa de
> seleção com Shift + arrastar — é o jeito mais rápido de pegar uma parede
> inteira.

## Mover, girar e excluir

Com um ou mais blocos selecionados:

| Tecla | Ação |
|---|---|
| **Setas** | Deslocar para a esquerda/direita/frente/trás |
| **Page Up / Page Down** | Deslocar para cima / para baixo |
| **R** | Girar 90° no sentido horário |
| **Shift + R** | Girar 90° no sentido anti-horário |
| **T** | Tombar sobre a próxima face |
| **Shift + T** | Tombar ao contrário |
| **Delete / Backspace** | Remover os blocos selecionados |

Quando você seleciona vários blocos, eles giram em torno do **centro em
comum**, então uma seção inteira gira como uma unidade.

**T** deita cada bloco selecionado sobre a próxima face, onde ele está:
um poste deita como uma viga, uma parede vira piso, uma rampa vira de
cabeça para baixo como um beiral. Cada bloco mantém a altura da base, e o
tombo se desfaz em um passo. Quatro toques deixam o bloco de pé de novo.
Ao colocar, **T** tomba o bloco que você vai colocar. Uma estrutura
posicionada gira, mas não tomba. Versões antigas do ForkBuild (1.3.0 e
anteriores) mostram de pé os blocos tombados.

## Cores dos blocos

Cada tipo de bloco tem sua cor padrão, mas você pode escolher a sua:

- **Antes de colocar** — com um bloco selecionado na guia **Blocos** da
  Biblioteca de construção, clique na amostra **Cor** dele e escolha uma
  cor. Todos os blocos que você colocar a partir daí a usam, e o fantasma de
  posicionamento mostra uma prévia dela. Escolher outro tipo de bloco volta
  à cor padrão desse tipo até você escolher uma de novo.
- **Depois de colocar** — selecione um ou mais blocos e use a amostra
  **Cor** da seção **Seleção** para mudar a cor de todos de uma vez. Cada
  mudança pode ser desfeita (`Ctrl/Cmd+Z`) como qualquer outra edição. A
  amostra não aparece para uma seleção de instância de estrutura — edite o
  própria construção da estrutura (veja
  [Instâncias de estrutura](#instâncias-de-estrutura-uma-referência-viva)
  abaixo).

Ao lado de cada amostra **Cor** há uma fileira de **cores da vila**
(reboco, pedra, tijolo, vermelho telha, carvalho, folha, céu e mais) que
combinam bem: um clique escolhe uma, para os próximos blocos ou para a
seleção. A amostra continua permitindo escolher qualquer cor.

A cor de um bloco é salva com sua construção e vai junto quando você a publica
ou compartilha.

## Transformações precisas: entrada numérica, alinhamento e repetição

As seções recolhidas do painel Seleção dão formas mais exatas de mover uma
seleção, além do gizmo e das teclas acima:

- **Posição e rotação exatas** — digite valores exatos de X/Y/Z/Rotação em
  vez de arrastar. Alterne entre **Absoluto** (os valores são um alvo para o
  pivô/orientação da seleção) e **Deslocamento** (os valores são somados como
  diferença) e pressione **Aplicar** (ou `Enter` em um campo). Um campo vazio
  significa "deixar como está", nunca zero. **Limpar campos** esvazia os
  campos sem mexer na seleção.
- **Alinhamento e distribuição** (em **Alinhar, distribuir, repetir**) —
  nove botões para alinhar as bordas ou os centros da seleção inteira em um
  eixo do mundo (Esquerda/Centro/Direita, Embaixo/Centro/Em cima,
  Frente/Centro/Trás), mais três para espalhá-la por igual (Distribuir
  X/Y/Z). O alinhamento precisa de **2 ou mais blocos** selecionados; a
  distribuição, de **3 ou mais**.
- **Repetir** (também em **Alinhar, distribuir, repetir**) — cria **N**
  cópias a mais da seleção, espaçadas por igual ao longo de um eixo. Se
  alguma cópia fosse colidir, nenhuma cópia é criada.

Cada uma dessas ações é **um passo de desfazer**, exatamente como arrastar
o gizmo ou deslocar pelo teclado — veja a
[Referência de controles](ControlsReference.md#transformar--painel-numérico-só-no-editor)
para o comportamento campo a campo.

O botão **Focar** do painel Seleção enquadra a câmera nos blocos
selecionados sem mudar nada.

> **Colisões são bloqueadas.** Arrastar o gizmo ou deslocar pelo teclado
> confere o resultado com todos os blocos fora da seleção. Se soltar fizesse
> algum bloco cair em cima de um deles, o movimento inteiro é cancelado em
> vez de confirmado — todos os blocos da seleção voltam exatamente para onde
> começaram, sem nova entrada de desfazer. Reorganizar blocos *dentro* da
> sua própria seleção (como trocar dois blocos de lugar com uma rotação)
> nunca conta como colisão.

## Copiar, colar e duplicar

| Tecla | Ação |
|---|---|
| **Ctrl/Cmd + C** | Copiar os blocos selecionados |
| **Ctrl/Cmd + V** | Colar (um pouco deslocados, para você vê-los) |
| **Ctrl/Cmd + D** | Duplicar a seleção no lugar — copiar e colar em um passo |

Copiar e colar é perfeito para elementos repetidos — construa uma janela e
copie-a ao longo de uma fachada. **Duplicar** faz o mesmo em um só gesto e
um só passo de desfazer, e não mexe na área de transferência: um Ctrl+C
anterior continua lá para colar depois de você duplicar outra coisa. A
duplicata vira sua nova seleção, então o fluxo natural é selecionar →
duplicar → arrastar ou deslocar até o lugar. Duplicar funciona com qualquer
seleção — blocos soltos, um grupo inteiro ou uma única
[instância de estrutura](#instâncias-de-estrutura-uma-referência-viva).

## Desfazer e refazer

Toda mudança é registrada, então você sempre pode voltar:

| Tecla | Ação |
|---|---|
| **Ctrl/Cmd + Z** | Desfazer a última ação |
| **Ctrl/Cmd + Y** *(ou Ctrl/Cmd+Shift+Z)* | Refazer |

Mover dez blocos conta como **um** passo de desfazer, então desfazer
continua prático mesmo em construções grandes.

Enquanto vocês constroem juntos (**Construir comigo**, abaixo), Desfazer
desfaz só os seus próprios passos, nunca os de um amigo, e em todas as telas
ao mesmo tempo; Refazer os traz de volta. Se depois disso um amigo mudou o que
o seu passo fez (excluiu o bloco que você colocou, por exemplo), esse passo é
pulado e o Editor avisa. Quando alguém entra, o Desfazer de todo mundo
recomeça a partir dali: quem chegou nunca teve os passos feitos antes.

## Grupos

Os grupos permitem dar nome a conjuntos de blocos e reutilizá-los — como
"Telhado" ou "Janelas".

**Criar um grupo:**
1. Selecione alguns blocos.
2. Abra a seção **Grupos e planta** do painel Seleção e clique em **Novo
   grupo**; depois dê um nome a ele com **Renomear grupo** (abaixo).

**Usar um grupo:** clique no nome de um grupo na lista para selecioná-lo (e
os blocos dele) — a lista fica no painel Seleção quando nada está
selecionado e em **Grupos e planta** nos outros casos. Estes botões agem
sobre o grupo selecionado:

| Botão | O que faz |
|---|---|
| **Renomear grupo** | Muda o nome do grupo |
| **Duplicar grupo** | Copia o grupo inteiro *e* os blocos dele |
| **Excluir grupo** | Exclui o grupo (os blocos em si ficam) |
| **Adicionar ao grupo** | Adiciona sua seleção atual ao grupo |
| **Remover do grupo** | Remove sua seleção atual do grupo |

> **Bom saber:** Selecionar um grupo só seleciona os blocos dele — nunca muda
> o grupo. E excluir um grupo só remove o *rótulo*, não os blocos dentro
> dele.

## Estruturas: compor, remixar e sua biblioteca pessoal

A guia **Estruturas** da Biblioteca de construção (veja
[O layout](#o-layout) acima) oferece vinte e duas estruturas prontas — casas,
celeiros, um poço, um mercado, um moinho, uma ponte e mais, em cinco
categorias — e três construções maiores da categoria **vitrine** (um castelo, uma ilha
do porto e uma praça da vila), mais **Minhas estruturas**, sua coleção pessoal com tudo o que
você salvou de uma construção. Há coisas diferentes que você pode fazer com
qualquer uma delas, e elas importam por motivos diferentes:

- **Posicionar** (clique no cartão) — copia os blocos da estrutura direto
  para a construção em que você já está trabalhando, e ela passa a fazer
  parte de uma construção maior. É a ação do dia a dia.
- **Remixar como nova construção** (no menu **⋮** do cartão) — começa um
  construção nova e independente, que nasce como cópia exata da estrutura.
- **Remixar para Minhas estruturas** (só nos cartões prontos, no menu
  **⋮**) — adiciona a estrutura às suas **Minhas estruturas**, sem nenhum
  construção envolvida. Veja
  [Minhas estruturas](#minhas-estruturas-sua-biblioteca-pessoal-de-plantas)
  abaixo.
- **Informações** (no menu **⋮** do cartão) — uma visão somente leitura do
  nome, da categoria, do número de blocos, da área ocupada, da altura, da
  origem e da descrição da estrutura.
- Posicione uma **construção salva** sua como **instância de estrutura** —
  uma referência viva e reutilizável em vez de uma cópia — pelo menu
  **Recentes** da barra de ferramentas, não pela Biblioteca de construção.
  Veja [Instâncias de estrutura](#instâncias-de-estrutura-uma-referência-viva)
  abaixo.

### Posicionando uma estrutura na sua construção

Clique em qualquer cartão da guia **Estruturas** — um pronto ou um das suas
**Minhas estruturas** — e aparece um fantasma translúcido da estrutura
inteira, acompanhando o ponteiro sobre o chão, exatamente como ao colocar um
único bloco:

1. Mova o ponteiro para posicionar o fantasma.
2. Pressione `R` / `Shift+R` para girá-lo em passos de 90°.
3. Clique para confirmar — todos os blocos da estrutura são adicionados ao
   construção como **um passo de desfazer**. Uma posição ocupada deixa o
   fantasma vermelho e recusa o clique, do mesmo jeito que um bloco se recusa
   a ser colocado em cima de outro.
4. `Esc` cancela — nada é adicionado, e você volta à ferramenta que estava
   usando antes.

Os blocos que você recebe são blocos comuns da sua construção desde o
momento em que chegam — iguais a tudo o que você colocou à mão, livres para
editar, selecionar, agrupar ou excluir como qualquer outro. Posicionar
várias estruturas é um jeito rápido de montar uma cena: clique em Casa e
posicione; clique em Celeiro e posicione ao lado; clique em Poço e
posicione no quintal.

### Remixando uma estrutura como nova construção

Abra o menu **⋮** de um cartão e clique em **Remixar como nova construção**
para começar uma construção nova sua, que nasce como cópia exata da estrutura —
os mesmos blocos, editáveis com todas as ferramentas deste guia, em um
construção própria em vez de incluídos no que você tem aberto. Remixar nunca
muda a cópia da biblioteca: bifurque a Casa dez vezes e cada uma é uma
construção independente desde o momento do clique.

### Minhas estruturas: sua biblioteca pessoal de plantas

Construiu algo que vale reutilizar? Selecione os blocos que o compõem (uma
construção inteira ou só uma parte) e clique em **Criar planta** — o botão
fica na seção **Grupos e planta** do painel Seleção quando há blocos
selecionados, e na Paleta de comandos (`Ctrl/Cmd+K`) em qualquer caso. Uma
pequena caixa de diálogo pede um **nome**, uma **categoria** e uma
**descrição** opcional, com uma prévia ao vivo do que você vai salvar;
clique em **Criar planta** e ela é ajustada à própria origem local e salva
na hora em **Minhas estruturas**, uma seção nova no fim da guia Estruturas,
logo abaixo das categorias prontas.

Há uma segunda forma de uma estrutura ir parar em Minhas estruturas, sem
nada para selecionar nem construir antes: abra o menu **⋮** de qualquer
cartão **pronto** e clique em **Remixar para Minhas estruturas**. Ela é
adicionada exatamente como está — nenhuma construção criada, nada extraído —
e fica pronta para Renomear, Exportar ou posicionar na hora, como qualquer
outra entrada da sua biblioteca.

Uma estrutura em **Minhas estruturas** funciona exatamente como uma pronta —
clique para posicioná-la na construção atual, ou Remixar como nova
construção — com duas ações extras no menu **⋮**:

| Ação | O que faz |
|---|---|
| **Renomear** | Muda o nome (a categoria e a descrição continuam como estão) |
| **Remover** | Exclui a estrutura da sua biblioteca |

**Minhas estruturas** só guarda a *estrutura em si* — um nome e um conjunto
de blocos. Remover uma nunca afeta nada que você já construiu com ela: todo
lugar em que você já a posicionou ou remixou mantém aqueles blocos
exatamente como estão. E ela nunca é editada no lugar — se quiser mudar o
que uma estrutura salva constrói, posicione-a em uma construção, edite esse
construção e use **Criar planta** de novo (se quiser, com outro nome, como
"Sítio de luxo" — ela vira uma entrada separada em Minhas estruturas, não uma
substituição da original).

> **Bom saber:** Minhas estruturas fica neste dispositivo. Não está ligada à
> sua identidade nem é sincronizada automaticamente — veja
> [Compartilhando plantas](#compartilhando-plantas-exportar-e-importar)
> abaixo para levar uma a outro dispositivo ou entregá-la a outra pessoa.

### Compartilhando plantas: exportar e importar

Qualquer estrutura — pronta ou sua — pode sair do dispositivo em que está
como um arquivo portátil, sem nunca passar a fazer parte do Mundo publicado
compartilhado:

- **Exportar planta** (no menu **⋮** de qualquer cartão) baixa a estrutura
  como um pequeno arquivo JSON — um retrato completo do nome, da categoria,
  das tags, da descrição e dos blocos dela.
- **Importar planta** (botão ao lado do título **Minhas estruturas**) lê um
  arquivo de planta e o adiciona às suas Minhas estruturas como uma entrada
  nova e independente — uma cópia nova com identidade própria, nunca ligada
  de volta à origem. Importar o mesmo arquivo duas vezes gera duas entradas
  separadas, e não uma que sobrescreve a outra em silêncio. Um arquivo
  malformado ou não reconhecido é recusado com uma explicação, em vez de
  produzir em silêncio algo quebrado.

É assim que você entrega uma construção a um amigo, ou leva suas estruturas
entre seus próprios dispositivos: exporte de um lado, envie o arquivo como
preferir e importe do outro.

**Exportar tudo** (ao lado de **Importar planta**, quando você tem
estruturas suas) baixa todas as estruturas de Minhas estruturas em um único
arquivo, cada uma com as atribuições e as declarações de linhagem dela.
**Importar planta** também lê esse arquivo e ignora qualquer projeto que já
esteja em Minhas estruturas, então importá-lo duas vezes não gera
duplicatas. Para guardar uma cópia de todo o resto também, use
[Seus dados](13-YourData.md).

### Declarando autoria

Uma estrutura com identidade de planta (a maioria das salvas tem uma) também
pode ter uma **Atribuição da comunidade** — um registro assinado de quem
declarou ter projetado a estrutura. Abra o painel **Informações** da
estrutura pelo cartão e você vai encontrar:

- **Declarar autoria** — assina, com sua identidade atual, uma declaração de
  que você é um dos autores. Várias pessoas podem declarar o mesmo projeto
  cada uma por conta própria; a declaração de ninguém substitui nem anula a
  de outra pessoa.
- **Exportar atribuição** / **Publicar na rede** — depois de declarar,
  compartilhe a declaração como arquivo ou anuncie-a aos pares conectados.
  Depois de **Publicar na rede**, o painel oferece **Distribuir**, que leva
  a declaração também a redes descentralizadas (veja
  [Distribuição](Distribution.md)).
- **Assinar de novo para este projeto** — declarações feitas antes de 28 de
  setembro de 2026 usavam um tipo antigo de impressão digital de projeto que
  um projeto diferente consegue copiar, então elas não contam mais, e o
  painel diz quantas são. Se uma delas é sua e este projeto é mesmo seu, este
  botão assina sua declaração de novo. Confira o projeto antes: o botão
  aparece para qualquer projeto que tenha a impressão digital antiga.

Isso é opcional e totalmente separado de posicionar, remixar ou
compartilhar a estrutura em si — existe para quando você quer ligar seu nome
a um projeto de um jeito que outras pessoas possam verificar por conta
própria, e não só confiar. Veja
[Publicações e evidências externas](09-PublicationsAndEvidence.md) para o
que acontece com uma declaração depois de publicada e como anexar a ela
evidências externas independentes.

## Instâncias de estrutura: uma referência viva

Posicionar (acima) copia os blocos de uma estrutura para a sua construção uma
vez. Às vezes, o que você quer é uma cópia **viva** de algo que já
construiu — qualquer construção salva, não só algo da sua biblioteca — que
fique em sincronia com a origem toda vez que você olhar. Isso é uma
**instância de estrutura**: ela faz referência à construção de origem em vez
de copiar os blocos dele, então editar a origem depois atualiza todas as
instâncias dela automaticamente.

1. Abra o menu **Recentes** na barra de ferramentas. (Ele aparece depois que
   você salvou pelo menos uma construção.)
2. Ao lado de qualquer construção salva, clique em **Posicionar**. Clicar no
   nome da construção, em vez disso, abre a construção, substituindo o que você
   tem aberto.
3. Passe o mouse sobre o chão, pressione `R` para girar e clique para
   posicioná-la — exatamente como ao colocar um bloco.

Uma instância é uma *referência* viva àquela construção, não uma cópia dos
blocos dela: a mesma construção pode ser posicionada quantas vezes você
quiser, e editar os blocos da construção de origem depois atualiza todas as
instâncias dele. Selecione uma instância com a ferramenta Selecionar (`1`) e
a barra lateral mostra:

| Controle | O que faz |
|---|---|
| Arrastar na área de visualização, ou o [gizmo](InteractiveTransformGizmo.md) | Mover / girar, como um bloco |
| Setas / Page Up / Page Down | Deslocar |
| **Campos X / Z / Rotação °, depois Aplicar** | Definir posição e direção exatas — a altura (Y do chão) sempre acompanha o terreno e não é um alvo que você define |
| **Girar ↻ / ↺** | Girar exatamente 90° |
| **Duplicar** (`Ctrl/Cmd+D`) | Posicionar outra instância da mesma estrutura |
| **Excluir** | Remover esta instância — a construção de origem não é afetada |
| **Editar construção de origem** | Abrir a própria construção referenciada, para mudar a aparência de todas as instâncias dela |

Editar o *conteúdo* de uma estrutura posicionada sempre se faz editando o
construção de origem — não há como editar diretamente os blocos de uma
instância, e é exatamente isso que mantém todas as instâncias em sincronia.

## Propriedades da construção

Toda construção tem um **título**, uma **descrição** opcional, uma **licença**
e uma configuração **Quem pode posicioná-lo no Mundo** — defina-os na caixa
de diálogo **Propriedades da construção**, aberta pelo botão **✎** ao lado do
título da construção, no topo da barra lateral do Editor (na Visão do mundo,
é o botão **Editar metadados**). Uma construção nova começa sem licença, o que
significa que ninguém mais pode remixá-la até você escolher uma. A
descrição aparece como trecho no cartão dela em **Explorar** e também pode
ser pesquisada lá; a licença controla se — e como — outras pessoas podem
remixá-la. Veja [Publicar e remixar](04-PublishingAndForking.md) para o
que significa cada licença.

Uma descrição longa fica mais legível com um pouco de formatação, que o
painel de Informações da construção, o navegador de locais da Visão do Mundo
e as postagens no Steem e no Blurt mostram:

| Escreva | Para ter |
|---|---|
| uma linha em branco | um novo parágrafo (uma quebra de linha simples continua sendo quebra de linha) |
| `## Materiais` no início de uma linha | um título |
| `- ` (ou `* `) no início de uma linha | um item de lista |
| `**palavra**` | **negrito** |
| `*palavra*` | *itálico* |
| `\*`, `\#`, `\-` | o próprio caractere |

Nada mais é formatação: links, imagens e HTML continuam como texto simples.
Os cartões de **Explorar** mostram as palavras da descrição em uma linha, sem
formatação.

As **tags** dizem o que é a construção, como `japones templo jardim`: até 5,
separadas por espaços ou vírgulas, feitas de letras minúsculas, dígitos e
hífens (os acentos são removidos, então `café` vira `cafe`). Se a construção
não tiver nenhuma, o diálogo preenche o campo com sugestões a partir do
título e da descrição, que você pode manter, mudar ou apagar; os botões
abaixo do campo acrescentam outras sugestões. Um remix mantém suas tags. Uma
postagem no Blurt as lista depois das tags do próprio ForkBuild, para que
quem navega pelo Blurt por tag encontre sua construção.

## Som

Cada mudança que você faz tem um som curto próprio, então dá para ouvir o
que aconteceu sem olhar: um estalo quando um bloco ou estrutura é colocado,
um pop quando é removido, um tique para um movimento e um tique duplo para um
giro, uma sequência rápida de bipes para colar ou duplicar, um ping claro
para uma cor nova, duas notas para agrupar, um sino para dar nome a um
lugar, um bipe descendente para desfazer e um ascendente para refazer, e um
pequeno acorde quando você salva. As mudanças feitas por um colaborador no
mesma construção são silenciosas.

Ligue ou desligue o som com o botão **Som** no canto superior direito da
visualização ou pressionando `M` (listado na sobreposição Atalhos de
teclado, `?`); o controle deslizante ao lado define o volume. É a mesma
configuração da Visão do mundo, lembrada neste dispositivo. O som começa com
seu primeiro clique ou tecla, como os navegadores exigem.

Enquanto você constrói, toca uma música suave, um pouco mais animada que a da Visão do mundo. O botão **♪ Música** ao lado do controle a liga ou desliga; é a mesma escolha da Visão do mundo.

## Salvar, publicar, recomeçar

- **Salvar** (`Ctrl+S`) — guarda seu trabalho neste dispositivo.
- **Publicar** — compartilha com todo mundo (veja
  [Publicar e remixar](04-PublishingAndForking.md)). Publicar também salva.
  Uma construção começada a partir de uma pronta que ainda não tem nada seu
  é perguntada uma vez: **Continuar construindo** ou **Publicar mesmo
  assim**. A mensagem depois disso é uma barra só: **Entrar andando** e
  **Copiar link**, com **Mais formas de compartilhar** reunindo o próprio
  link, **Salvar imagem**,
  **Fazer um vídeo** e **Incorporar**. Um lembrete para adicionar uma
  frase secreta à identidade com que você publicou espera sua próxima
  publicação quando essa identidade acabou de ser criada.
- **Novo** — começa algo novo: um **Terreno vazio**, ou uma das
  construções prontas (um castelo, uma ilha do porto, uma praça da vila, uma
  casa, um moinho e uma ponte) como sua própria cópia, vista inteira. Se o
  que está aberto tem alterações não salvas, Novo avisa primeiro; salve
  para mantê-las.
- **Arquivo** — um menu com mais três:
  - **Exportar** — baixa a construção atual como arquivo JSON, para guardar uma
    cópia ou levá-la a outro dispositivo. Os arquivos usam um formato compacto
    que guarda os blocos como uma tabela.
  - **Modelo 3D** — baixa a construção como modelo 3D para outros programas
    (veja [Baixando um modelo 3D](#baixando-um-modelo-3d)).
  - **Importar** — abre um arquivo exportado como uma construção nova com
    identidade própria; nada é guardado até você **Salvar**. Arquivos
    exportados por versões anteriores continuam abrindo (são convertidos ao
    carregar), mas o ForkBuild 1.0.0 e anteriores não conseguem abrir arquivos
    exportados por esta versão.
  Quando a construção é sua, **Exportar** assina o arquivo, para que quem o
  importar possa confiar no nome e na licença que ele traz. Suas próprias
  construções são importadas como elas mesmas. A de outra pessoa abre como
  cópia sua, dando o crédito a ela, quando a licença permite remixes;
  quando não permite, ou quando o arquivo foi mudado depois que quem fez o
  assinou, ela não é importada. O arquivo leva a licença que a construção
  tem quando você exporta, então você pode publicar uma construção como
  **All Rights Reserved** e mesmo assim dar a alguém uma cópia em que essa
  pessoa possa construir: escolha outra licença em **Propriedades da
  construção**, exporte e depois volte a licença. **Exportar todas as
  construções** e o **Importar** dela, em **Recentes**, funcionam do mesmo
  jeito.
- **Recentes** — reabre algo que você salvou antes (aparece depois do
  primeiro salvamento; clique no nome de uma construção para abri-la). Quando
  você tiver salvo construções suficientes, aparece uma caixa de filtro para
  ir direto a um pelo nome. Cada entrada também tem um botão **Posicionar** —
  veja [Instâncias de estrutura](#instâncias-de-estrutura-uma-referência-viva)
  — para adicioná-la à sua construção *atual* em vez de substituí-la.
  **Exportar todas as construções**, no fim, baixa todas as construções salvas
  em um único arquivo; **Importar** o lê de volta, salvando as construções que
  este dispositivo não tem (abra-os em Recentes), ignorando os que ele tem
  sem mudanças e salvando uma cópia ao lado de qualquer um que ele tenha em
  outra versão. Alterações não salvas não entram, então salve antes.

## Construir comigo: construir juntos, ao vivo

**Construir comigo**, abaixo do nome da construção na barra lateral, cria um
link que deixa seus amigos trabalharem nesta construção com você, ao mesmo
tempo. Envie como quiser; ele também aparece como QR code para um celular.
Um amigo que abre o link escolhe um nome, se ainda não tem (os blocos dele
são adicionados com o nome dele), clica em **Entrar** e a sua construção
abre no Editor dele. A partir daí, cada bloco que qualquer um de vocês
colocar, mover, mudar de cor ou excluir aparece nas duas telas.

- Uma faixa sobre a cena mostra quem está construindo, cada um com sua
  própria cor, e cada um de vocês vê para onde o outro está apontando e o
  que ele selecionou, nessa cor.
- **Desfazer** (`Ctrl/Cmd + Z`) desfaz o seu último passo em todas as telas, e
  **Refazer** o traz de volta; desfazer os passos dos seus amigos cabe a eles.
- Precisa ser a sua própria construção: uma que você começou, ou uma cópia
  que você fez. Uma construção que você começou antes de escolher um nome
  passa a ser sua quando você convida amigos para ela.
- Qualquer pessoa que abrir o link nos primeiros 30 minutos pode entrar,
  enquanto a construção continuar aberta no seu Editor. Todos que entraram
  podem construir até você clicar em **Parar**, abrir outra construção ou
  sair do Editor. **Link**, na faixa, mostra o link de novo.
- O Editor de cada amigo guarda a própria cópia, salva no dispositivo dele.
  Quando você para, ele pode ficar com ela, mas o que ele mudar não chega
  mais até você.
  Um amigo que não colocou nenhum bloco não recebe crédito, então a cópia
  dele continua sendo sua construção: restaurada de um backup, ela segue a
  licença da construção, como a de qualquer outra pessoa.
- Todos cujos blocos a sua construção recebe aparecem nos créditos dela: o
  painel da construção diz **Construída com** e os nomes deles, e quando
  você publica, o link compartilhado e a árvore genealógica também dizem
  isso, sob a sua assinatura. A cópia de cada amigo mostra os mesmos
  créditos. Uma cópia que outra pessoa fizer dela começa sem esses créditos;
  a dela é uma construção nova.
- Cada nome nos créditos, e o autor de uma construção compartilhada, abre a
  página dessa pessoa: as construções que a identidade dela assinou e
  aquelas em que outros dão crédito a ela. Na árvore genealógica, o título
  de cada construção a abre, e os nomes do autor dela e dos coconstrutores
  abrem as páginas deles. **Meus mundos** lista **Construções que você
  ajudou a fazer**, aquelas em que um amigo deu crédito a você, e cada uma
  abre o Mundo dela quando é publicada; seus outros dispositivos também as
  listam, depois de conectados a este (ou de receberem uma cópia dos seus
  dados).
- Entrar conecta os dois dispositivos diretamente, como **Passear aqui
  comigo**: cada um pode ver o endereço IP do outro. Ninguém vira um par
  lembrado nem amigo a menos que você escolha. É preciso um servidor de
  encontro; o site oficial tem um.

## Baixando um modelo 3D

**Modelo 3D**, em **Arquivo** na barra de ferramentas, baixa o que está aberto como um
arquivo que outros programas 3D abrem, feito neste dispositivo (nada é
enviado):

- **glTF (.glb)** — colorido. Abre no Blender, no Visualizador 3D do
  Windows, em motores de jogo como Godot e Unity e em visualizadores online.
  Uma unidade do ForkBuild é um metro.
- **Para impressão 3D (.stl)** — de uma cor só, em milímetros na escala
  1:100 (uma porta tem 20 mm, um cubo 10 mm), com Z para cima e apoiado na
  mesa de impressão, então um fatiador (Cura, PrusaSlicer, Bambu Studio…)
  abre pronto para imprimir; aumente lá se quiser maior. Blocos que se
  tocam ou se sobrepõem ficam como peças separadas, que os fatiadores unem
  ao fatiar.
- **OBJ (.obj)** — colorido (como cores de vértice), para programas mais
  antigos.

Cada bloco mantém a forma e a cor exatas que tem no ForkBuild, e as
estruturas que você posicionou vão junto se estiverem neste dispositivo (a
mensagem avisa se alguma não estiver). Cada arquivo nomeia a construção, o
autor, a licença e de que ela é remix: no copyright e nos extras do glTF,
no cabeçalho do STL e como comentários no OBJ. A página de uma construção
compartilhada oferece os mesmos downloads quando a licença permite cópias
(veja [O que um link abre](04-PublishingAndForking.md#o-que-um-link-abre)).

## Descrever a construção

Pressione `I`, ou escolha **Descrever a construção** na paleta de comandos,
e o Editor diz do que sua construção é feita: quantos blocos, mais ou menos
qual a largura, a profundidade e a altura, as estruturas da Biblioteca de
construção que estão nela, as janelas, portas, telhados, árvores e outras
peças entre os demais blocos, e suas cores principais, com os nomes das
cores da vila. Um leitor de tela lê em voz alta; o texto também fica no
alto da visão 3D até você pressionar **Fechar**, um jeito rápido de
conferir uma construção sem girar a câmera em volta dela. Tudo é calculado
no seu dispositivo a partir dos blocos, então nada é enviado. A imagem de
uma construção no link compartilhado e na incorporação traz a mesma
descrição para leitores de tela.

## Controles da câmera

- **Arrastar** — orbitar em torno da cena
- **Rolar** — aproximar e afastar
- **Home** — voltar a câmera à visualização padrão

Uma construção abre vista de cima, em ângulo, enquadrada inteira.

### Ver por dentro

**Ver por dentro**, no alto à esquerda da vista (no alto à direita no
celular, embaixo de **Ferramentas**), corta a construção acima do térreo,
como a Visão do mundo faz quando você entra: as paredes ficam mais ou menos
na altura da cabeça e os cômodos, com os móveis, aparecem de cima. Construa
neles como sempre: um clique passa pelo que foi cortado. **Mostrar inteira**
desenha tudo de novo. Nada é removido; só muda o que é desenhado.

## Em um celular ou tablet

O Editor funciona com toque. Arraste com um dedo para orbitar, com dois para
mover a vista, e faça pinça para o zoom. Um toque seleciona ou coloca, e
arrastar nunca faz isso. Em uma tela estreita, a barra lateral abre pelo
botão **Ferramentas** no canto superior direito da cena. Uma barra na parte
de baixo da cena tem **Desfazer**, **Refazer**, **Girar**, **Tombar**, **Excluir**,
**Múltiplo** (cada toque põe um bloco na seleção ou tira dela), **Caixa**
(arraste para desenhar uma caixa de seleção; a câmera fica parada até você
desativar) e **Mais**, que abre a Paleta de comandos. Em um celular, a barra de ferramentas acima da cena rola
para o lado, então **Salvar** e **Publicar** vêm primeiro nela (depois de
**← Voltar ao Mundo**, quando houver). Veja
[Telas sensíveis ao toque](ControlsReference.md#telas-sensíveis-ao-toque)
para os detalhes.
