<!-- translation-of: docs/user/02-TheEditor.md source-hash: 1238c1e7cb84a4db -->
# 02 — O Editor

<!-- languages -->
[English](../02-TheEditor.md) · [Deutsch](../de/02-TheEditor.md) · [Español](../es/02-TheEditor.md) · [Français](../fr/02-TheEditor.md) · [Bahasa Indonesia](../id/02-TheEditor.md) · [日本語](../ja/02-TheEditor.md) · [한국어](../ko/02-TheEditor.md) · **Português (Brasil)**
<!-- /languages -->

O Editor é onde você constrói. Este guia mostra as ferramentas, como
selecionar e transformar blocos e como organizar sua construção com grupos.

## O layout

```
┌─────────────────────────────────────────────────────────────┐
│ Barra: Salvar · Publicar · Novo · Exportar · Importar ·     │
│        Recentes · ⌨ Atalhos                                 │
├──────────────────────┬──────────────────────────────────────┤
│ [Selecionar|Colocar] │                                      │
│ Título do documento ✎│                                      │
│ Seleção              │      Área de visualização 3D         │
│ Biblioteca de        │                                      │
│ construção           │                                      │
│  [Blocos|Estruturas] │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

- **Barra de ferramentas** — salvar, publicar, começar uma criação nova,
  exportar ou importar um documento como arquivo, reabrir os recentes e abrir
  a sobreposição **⌨ Atalhos** (também `?`).
- **Ferramentas** — alterne entre **Selecionar** (`1`) e **Colocar** (`2`).
  **Colocar** fica destacado enquanto você coloca um bloco ou uma estrutura.
- **Título do documento** — o nome da criação aberta. Clique em **✎** para
  editar o título, a descrição e a licença. Se ela está salva aparece na
  barra de ferramentas.
- **Seleção** — mostra só o que pode agir sobre a seleção atual; veja
  [O painel Seleção](#o-painel-seleção) abaixo.
- **Biblioteca de construção** — uma caixa de pesquisa e duas guias:
  - **Blocos** — tudo o que você pode colocar com a ferramenta Colocar, em
    blocos de cinco seções (Básicos, Estrutura, Telhados e escadas,
    Aberturas, Detalhes). Clique em um para selecioná-lo (e passar para a
    ferramenta Colocar); aparece então uma amostra **Cor** para escolher a
    cor dele — veja [Cores dos blocos](#cores-dos-blocos) abaixo.
    **Rampa 45°**, **Escada** e **Escora diagonal 2x2** sobem para um lado;
    gire um duas vezes (**R**, **R**) para virá-lo para o outro lado. Uma
    escora diagonal e uma cópia girada 180° formam um X.
  - **Estruturas** — vinte estruturas prontas em cinco categorias
    (residencial, agrícola, comercial, comunitária, infraestrutura), mais as
    suas em **Minhas estruturas**. Clique em um cartão para posicioná-la —
    veja
    [Estruturas: compor, bifurcar e sua biblioteca pessoal](#estruturas-compor-bifurcar-e-sua-biblioteca-pessoal)
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

## As duas ferramentas

### Ferramenta Colocar (`2`)

Escolha um bloco na paleta, passe o mouse pela área de visualização e
clique para colocá-lo. Um fantasma translúcido mostra exatamente onde o
bloco vai parar. Passe o mouse sobre a face de um bloco existente para
empilhar ou prender.

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
| **Ctrl/Cmd + A** | Seleciona todos os blocos da criação |
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
| **Delete / Backspace** | Remover os blocos selecionados |

Quando você seleciona vários blocos, eles giram em torno do **centro em
comum**, então uma seção inteira gira como uma unidade.

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
  próprio documento da estrutura (veja
  [Instâncias de estrutura](#instâncias-de-estrutura-uma-referência-viva)
  abaixo).

A cor de um bloco é salva com sua criação e vai junto quando você a publica
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

## Estruturas: compor, bifurcar e sua biblioteca pessoal

A guia **Estruturas** da Biblioteca de construção (veja
[O layout](#o-layout) acima) oferece vinte estruturas prontas — casas,
celeiros, um poço, um mercado, um moinho, uma ponte e mais, em cinco
categorias — mais **Minhas estruturas**, sua coleção pessoal com tudo o que
você salvou de uma construção. Há coisas diferentes que você pode fazer com
qualquer uma delas, e elas importam por motivos diferentes:

- **Posicionar** (clique no cartão) — copia os blocos da estrutura direto
  para o documento em que você já está trabalhando, e ela passa a fazer
  parte de uma construção maior. É a ação do dia a dia.
- **Bifurcar como novo documento** (no menu **⋮** do cartão) — começa um
  documento novo e independente, que nasce como cópia exata da estrutura.
- **Bifurcar para Minhas estruturas** (só nos cartões prontos, no menu
  **⋮**) — adiciona a estrutura às suas **Minhas estruturas**, sem nenhum
  documento envolvido. Veja
  [Minhas estruturas](#minhas-estruturas-sua-biblioteca-pessoal-de-plantas)
  abaixo.
- **Informações** (no menu **⋮** do cartão) — uma visão somente leitura do
  nome, da categoria, do número de blocos, da área ocupada, da altura, da
  origem e da descrição da estrutura.
- Posicione um **documento salvo** seu como **instância de estrutura** —
  uma referência viva e reutilizável em vez de uma cópia — pelo menu
  **Recentes** da barra de ferramentas, não pela Biblioteca de construção.
  Veja [Instâncias de estrutura](#instâncias-de-estrutura-uma-referência-viva)
  abaixo.

### Posicionando uma estrutura no seu documento

Clique em qualquer cartão da guia **Estruturas** — um pronto ou um das suas
**Minhas estruturas** — e aparece um fantasma translúcido da estrutura
inteira, acompanhando o ponteiro sobre o chão, exatamente como ao colocar um
único bloco:

1. Mova o ponteiro para posicionar o fantasma.
2. Pressione `R` / `Shift+R` para girá-lo em passos de 90°.
3. Clique para confirmar — todos os blocos da estrutura são adicionados ao
   documento como **um passo de desfazer**. Uma posição ocupada deixa o
   fantasma vermelho e recusa o clique, do mesmo jeito que um bloco se recusa
   a ser colocado em cima de outro.
4. `Esc` cancela — nada é adicionado, e você volta à ferramenta que estava
   usando antes.

Os blocos que você recebe são blocos comuns do seu documento desde o
momento em que chegam — iguais a tudo o que você colocou à mão, livres para
editar, selecionar, agrupar ou excluir como qualquer outro. Posicionar
várias estruturas é um jeito rápido de montar uma cena: clique em Casa e
posicione; clique em Celeiro e posicione ao lado; clique em Poço e
posicione no quintal.

### Bifurcando uma estrutura como novo documento

Abra o menu **⋮** de um cartão e clique em **Bifurcar como novo documento**
para começar uma criação nova sua, que nasce como cópia exata da estrutura —
os mesmos blocos, editáveis com todas as ferramentas deste guia, em um
documento próprio em vez de incluídos no que você tem aberto. Bifurcar nunca
muda a cópia da biblioteca: bifurque a Casa dez vezes e cada uma é uma
criação independente desde o momento do clique.

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
cartão **pronto** e clique em **Bifurcar para Minhas estruturas**. Ela é
adicionada exatamente como está — nenhum documento criado, nada extraído —
e fica pronta para Renomear, Exportar ou posicionar na hora, como qualquer
outra entrada da sua biblioteca.

Uma estrutura em **Minhas estruturas** funciona exatamente como uma pronta —
clique para posicioná-la no documento atual, ou Bifurcar como novo
documento — com duas ações extras no menu **⋮**:

| Ação | O que faz |
|---|---|
| **Renomear** | Muda o nome (a categoria e a descrição continuam como estão) |
| **Remover** | Exclui a estrutura da sua biblioteca |

**Minhas estruturas** só guarda a *estrutura em si* — um nome e um conjunto
de blocos. Remover uma nunca afeta nada que você já construiu com ela: todo
lugar em que você já a posicionou ou bifurcou mantém aqueles blocos
exatamente como estão. E ela nunca é editada no lugar — se quiser mudar o
que uma estrutura salva constrói, posicione-a em um documento, edite esse
documento e use **Criar planta** de novo (se quiser, com outro nome, como
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

Isso é opcional e totalmente separado de posicionar, bifurcar ou
compartilhar a estrutura em si — existe para quando você quer ligar seu nome
a um projeto de um jeito que outras pessoas possam verificar por conta
própria, e não só confiar. Veja
[Publicações e evidências externas](09-PublicationsAndEvidence.md) para o
que acontece com uma declaração depois de publicada e como anexar a ela
evidências externas independentes.

## Instâncias de estrutura: uma referência viva

Posicionar (acima) copia os blocos de uma estrutura para o seu documento uma
vez. Às vezes, o que você quer é uma cópia **viva** de algo que já
construiu — qualquer documento salvo, não só algo da sua biblioteca — que
fique em sincronia com a origem toda vez que você olhar. Isso é uma
**instância de estrutura**: ela faz referência ao documento de origem em vez
de copiar os blocos dele, então editar a origem depois atualiza todas as
instâncias dela automaticamente.

1. Abra o menu **Recentes** na barra de ferramentas. (Ele aparece depois que
   você salvou pelo menos um documento.)
2. Ao lado de qualquer documento salvo, clique em **Posicionar**. Clicar no
   nome do documento, em vez disso, abre o documento, substituindo o que você
   tem aberto.
3. Passe o mouse sobre o chão, pressione `R` para girar e clique para
   posicioná-la — exatamente como ao colocar um bloco.

Uma instância é uma *referência* viva àquele documento, não uma cópia dos
blocos dele: o mesmo documento pode ser posicionado quantas vezes você
quiser, e editar os blocos do documento de origem depois atualiza todas as
instâncias dele. Selecione uma instância com a ferramenta Selecionar (`1`) e
a barra lateral mostra:

| Controle | O que faz |
|---|---|
| Arrastar na área de visualização, ou o [gizmo](InteractiveTransformGizmo.md) | Mover / girar, como um bloco |
| Setas / Page Up / Page Down | Deslocar |
| **Campos X / Z / Rotação °, depois Aplicar** | Definir posição e direção exatas — a altura (Y do chão) sempre acompanha o terreno e não é um alvo que você define |
| **Girar ↻ / ↺** | Girar exatamente 90° |
| **Duplicar** (`Ctrl/Cmd+D`) | Posicionar outra instância da mesma estrutura |
| **Excluir** | Remover esta instância — o documento de origem não é afetado |
| **Editar documento de origem** | Abrir o próprio documento referenciado, para mudar a aparência de todas as instâncias dele |

Editar o *conteúdo* de uma estrutura posicionada sempre se faz editando o
documento de origem — não há como editar diretamente os blocos de uma
instância, e é exatamente isso que mantém todas as instâncias em sincronia.

## Propriedades do documento

Toda criação tem um **título**, uma **descrição** opcional, uma **licença**
e uma configuração **Quem pode posicioná-lo no Mundo** — defina-os na caixa
de diálogo **Propriedades do documento**, aberta pelo botão **✎** ao lado do
título do documento, no topo da barra lateral do Editor (na Visão do mundo,
é o botão **Editar metadados**). Um documento novo começa sem licença, o que
significa que ninguém mais pode bifurcá-lo até você escolher uma. A
descrição aparece como trecho no cartão dele no Repositório e também pode
ser pesquisada lá; a licença controla se — e como — outras pessoas podem
bifurcá-lo. Veja [Publicar e bifurcar](04-PublishingAndForking.md) para o
que significa cada licença.

Uma descrição longa fica mais legível com um pouco de formatação, que o
painel de Informações do documento, o navegador de locais da Visão do Mundo
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
Os cartões do Repositório mostram as palavras da descrição em uma linha, sem
formatação.

## Som

Cada mudança que você faz tem um som curto próprio, então dá para ouvir o
que aconteceu sem olhar: um estalo quando um bloco ou estrutura é colocado,
um pop quando é removido, um tique para um movimento e um tique duplo para um
giro, uma sequência rápida de bipes para colar ou duplicar, um ping claro
para uma cor nova, duas notas para agrupar, um sino para dar nome a um
lugar, um bipe descendente para desfazer e um ascendente para refazer, e um
pequeno acorde quando você salva. As mudanças feitas por um colaborador no
mesmo documento são silenciosas.

Ligue ou desligue o som com o botão **Som** no canto superior direito da
visualização ou pressionando `M` (listado na sobreposição Atalhos de
teclado, `?`); o controle deslizante ao lado define o volume. É a mesma
configuração da Visão do mundo, lembrada neste dispositivo. O som começa com
seu primeiro clique ou tecla, como os navegadores exigem.

## Salvar, publicar, recomeçar

- **Salvar** (`Ctrl+S`) — guarda seu trabalho neste dispositivo.
- **Publicar** — compartilha com todo mundo (veja
  [Publicar e bifurcar](04-PublishingAndForking.md)).
- **Novo** — começa uma criação nova e vazia.
- **Exportar** — baixa a criação atual como arquivo JSON, para guardar uma
  cópia ou levá-la a outro dispositivo. Os arquivos usam um formato compacto
  que guarda os blocos como uma tabela.
- **Importar** — abre um arquivo exportado como uma criação nova com
  identidade própria; nada é guardado até você **Salvar**. Arquivos
  exportados por versões anteriores continuam abrindo (são convertidos ao
  carregar), mas o ForkBuild 1.0.0 e anteriores não conseguem abrir arquivos
  exportados por esta versão.
- **Recentes** — reabre algo que você salvou antes (aparece depois do
  primeiro salvamento; clique no nome de um documento para abri-lo). Quando
  você tiver salvo documentos suficientes, aparece uma caixa de filtro para
  ir direto a um pelo nome. Cada entrada também tem um botão **Posicionar** —
  veja [Instâncias de estrutura](#instâncias-de-estrutura-uma-referência-viva)
  — para adicioná-la ao seu documento *atual* em vez de substituí-lo.
  **Exportar todos os documentos**, no fim, baixa todos os documentos salvos
  em um único arquivo; **Importar** o lê de volta, salvando os documentos que
  este dispositivo não tem (abra-os em Recentes), ignorando os que ele tem
  sem mudanças e salvando uma cópia ao lado de qualquer um que ele tenha em
  outra versão. Alterações não salvas não entram, então salve antes.

## Controles da câmera

- **Arrastar** — orbitar em torno da cena
- **Rolar** — aproximar e afastar
- **Home** — voltar a câmera à visualização padrão

## Em um celular ou tablet

O Editor funciona com toque. Arraste com um dedo para orbitar, com dois para
mover a vista, e faça pinça para o zoom. Um toque seleciona ou coloca, e
arrastar nunca faz isso. Em uma tela estreita, a barra lateral abre pelo
botão **Ferramentas** no canto superior direito da cena. Uma barra na parte
de baixo da cena tem **Desfazer**, **Refazer**, **Girar**, **Excluir**,
**Múltiplo** (cada toque põe um bloco na seleção ou tira dela), **Caixa**
(arraste para desenhar uma caixa de seleção; a câmera fica parada até você
desativar) e **Mais**, que abre a Paleta de comandos. Veja
[Telas sensíveis ao toque](ControlsReference.md#telas-sensíveis-ao-toque)
para os detalhes.
