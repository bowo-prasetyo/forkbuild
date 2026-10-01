<!-- translation-of: docs/user/InteractiveTransformGizmo.md source-hash: abe609dc8dec857e -->
# Gizmo de transformação interativo

<!-- languages -->
[English](../InteractiveTransformGizmo.md) · [Deutsch](../de/InteractiveTransformGizmo.md) · [Español](../es/InteractiveTransformGizmo.md) · [Bahasa Indonesia](../id/InteractiveTransformGizmo.md) · [日本語](../ja/InteractiveTransformGizmo.md) · **Português (Brasil)**
<!-- /languages -->

Sempre que há blocos selecionados no Editor, aparece um gizmo no pivô da
seleção. Arrastar as alças dele move ou gira a seleção com uma prévia ao
vivo; soltar confirma a mudança como **um passo de desfazer**. Selecionar
uma única
[instância de estrutura](02-TheEditor.md#instâncias-de-estrutura-uma-referência-viva)
no Editor mostra exatamente o mesmo gizmo, com uma diferença: a alça verde do
eixo Y não faz nada. A altura de um posicionamento sempre acompanha o
terreno embaixo dele — nunca é uma alça que você arrasta nem um valor que
você digita.

O gizmo só existe no Editor. A [Visão do mundo](03-WorldView.md) é uma
superfície de exploração somente leitura; para construir a partir de algo que
você encontrar lá, use o botão **Editar uma cópia** dela para abri-lo aqui,
no Editor.

## O gizmo

```
    Y
    ↑
    │
    │
    ●──────→ X        ●  pivô
   /
  /
 Z

    ◯
  ◯ ● ◯               anel de rotação (eixo Y)
    ◯
```

| Alça | Cor | O que faz |
|---|---|---|
| Seta de eixo | Vermelha (X) | Arraste para mover só ao longo de X |
| Seta de eixo | Verde (Y) | Arraste para mover só ao longo de Y |
| Seta de eixo | Azul (Z) | Arraste para mover só ao longo de Z |
| Quadrado central | Âmbar | Movimento livre no plano do chão (X + Z) |
| Anel de rotação | Roxo | Arraste para girar em torno do pivô |

As alças se destacam quando você passa o mouse sobre elas e brilham mais
enquanto você as arrasta. O gizmo mantém um tamanho confortável na tela, por
mais que você afaste o zoom.

## O pivô

O marcador branco no centro do gizmo é o **pivô**:

```
┌───────────────┐
│ ■           ■ │
│               │
│       +       │ ← pivô (centro dos limites da seleção)
│               │
│ ■           ■ │
└───────────────┘
```

- Selecione um bloco → o pivô fica no centro desse bloco.
- Selecione vários blocos → o pivô fica no centro da caixa em volta de todos
  eles.
- A rotação sempre acontece em torno do pivô.

O pivô acompanha sua seleção automaticamente: selecione A, depois adicione
B, depois desfaça um movimento — o gizmo se reposiciona a cada vez.

## Movendo

1. Selecione um ou mais blocos.
2. Pegue uma alça de eixo para mover ao longo daquele eixo, ou o quadrado
   central para mover livremente pelo chão.
3. A seleção acompanha o ponteiro ao vivo.
4. Solte para confirmar.

## Girando

1. Selecione um ou mais blocos.
2. Arraste o anel roxo. A seleção gira em torno do pivô enquanto você
   arrasta.
3. Solte para confirmar.

Em seleções múltiplas, cada bloco orbita em torno do pivô comum *e* gira o
mesmo ângulo — o arranjo mantém a forma.

## Confirmar, cancelar, não fazer nada

| Você… | Resultado |
|---|---|
| Solta o mouse | Mudança confirmada — **exatamente uma** entrada no histórico de desfazer, não importa quantos blocos se moveram |
| Pressiona `Esc` no meio do arraste | Cancelar — tudo volta exatamente; o histórico não é tocado |
| Clica e solta sem mover | Nada — nenhum comando, nenhuma entrada no histórico |

`Ctrl/Cmd+Z` desfaz o gesto inteiro de uma vez; `Ctrl/Cmd+Y` (ou
`Ctrl/Cmd+Shift+Z`) o refaz.

## Enquanto você arrasta, o gesto é dono do ponteiro

Durante um arraste, a câmera não orbita, nada mais pode ser selecionado e os
atalhos são ignorados — o arraste não briga sem querer com a câmera. Soltar
(confirmar) ou `Esc` (cancelar) volta tudo ao normal. Soltar o mouse *fora*
da área de visualização ainda confirma direitinho.

## Grupos

Selecionar um grupo seleciona os blocos membros dele — e o gizmo os trata
exatamente como qualquer seleção múltipla:

- Arrastar move todos os membros; girar gira todos os membros em torno do
  pivô comum.
- O grupo em si não é tocado: a participação nunca muda por causa de uma
  transformação. (O gizmo nem sabe que grupos existem.)
- Um desfazer devolve cada membro para onde estava.

## Encaixe

Os arrastes se encaixam por padrão — 1 unidade do Mundo para o movimento (o
mesmo passo de um deslocamento com as setas) e 15° para a rotação (mais fino
que o giro de 90° de `R`). Segure **Shift** enquanto arrasta para o **modo de
precisão**: 0,1× o passo normal (0,1 unidade do Mundo, 1,5°), para ajustes
finos em que a grade padrão é grossa demais.

O **painel de transformação numérica** e **alinhamento/distribuição** são a
exceção de propósito — eles sempre aplicam o valor exato ou o resultado
geométrico exato que você pediu, nunca com encaixe, já que você digitou (ou
pediu) algo preciso.

## A colisão bloqueia a confirmação

Mover ou girar uma seleção confere o resultado com todos os blocos *fora* da
seleção antes de deixá-la parar ali. Se algum membro fosse se sobrepor a
algo que já está lá, soltar ali não confirma — todos os blocos da seleção
voltam exatamente para onde estavam, sem nova entrada de desfazer, do mesmo
jeito que soltar sobre uma célula ocupada ao colocar um único bloco recusa o
clique. Reorganizar blocos *dentro* da mesma seleção (dois membros trocando
de lugar numa rotação, por exemplo) nunca conta como colisão. Essa
verificação vale para arrastes do gizmo, deslocamentos pelo teclado e
rotações; alinhamento, distribuição e o painel de transformação numérica não
passam por ela, já que calculam um resultado exato e deliberado em vez de um
movimento livre.

## O que o gizmo não faz

- **Escala** — os blocos não podem ser redimensionados, então não há alças
  de escala.
- **Duplicar arrastando** — não há tecla modificadora para copiar enquanto
  arrasta; use `Ctrl/Cmd+D` para duplicar a seleção no lugar antes (veja
  [O Editor](02-TheEditor.md#copiar-colar-e-duplicar)), depois arraste a
  cópia.

## Dicas

- Passe o mouse sobre o anel de rotação e arraste devagar para um controle
  fino — arcos pequenos do ponteiro perto do pivô continuam precisos, porque
  a rotação é medida como ângulo, não como distância.
- Use uma alça de eixo quando quiser manter duas coordenadas perfeitamente
  fixas — a restrição é exata, não visual.
- Combine as superfícies: desloque com as setas em passos de unidades
  inteiras, depois termine com um arraste com Shift para o posicionamento
  fino. Desfazer/refazer trata os dois do mesmo jeito — um passo por gesto.
