<!-- translation-of: docs/user/InteractiveTransformGizmo.md source-hash: abe609dc8dec857e -->
# Manipulateur de transformation interactif

<!-- languages -->
[English](../InteractiveTransformGizmo.md) · [Deutsch](../de/InteractiveTransformGizmo.md) · [Español](../es/InteractiveTransformGizmo.md) · **Français** · [Bahasa Indonesia](../id/InteractiveTransformGizmo.md) · [日本語](../ja/InteractiveTransformGizmo.md) · [Português (Brasil)](../pt-BR/InteractiveTransformGizmo.md)
<!-- /languages -->

Dès que des briques sont sélectionnées dans l’Éditeur, un manipulateur
apparaît au pivot de la sélection. Faire glisser ses poignées déplace ou
fait pivoter la sélection avec un aperçu en direct ; relâcher valide la
modification en **une seule étape d’annulation**. Sélectionner une seule
[instance de structure](02-TheEditor.md#instances-de-structure--une-référence-vivante)
dans l’Éditeur affiche exactement le même manipulateur, à une différence
près : la poignée verte de l’axe Y est inactive. L’altitude d’un placement
suit toujours le terrain qui se trouve dessous — ce n’est jamais une
poignée que l’on fait glisser ni une valeur que l’on saisit.

Le manipulateur n’existe que dans l’Éditeur. La
[Vue du Monde](03-WorldView.md) est une surface d’exploration en lecture
seule ; pour développer quelque chose que vous y trouvez, utilisez son
bouton **Modifier une copie** pour l’ouvrir ici, dans l’Éditeur.

## Le manipulateur

```
    Y
    ↑
    │
    │
    ●──────→ X        ●  pivot
   /
  /
 Z

    ◯
  ◯ ● ◯               anneau de rotation (axe Y)
    ◯
```

| Poignée | Couleur | Ce qu’elle fait |
|---|---|---|
| Flèche d’axe | Rouge (X) | Glisser pour déplacer le long de X uniquement |
| Flèche d’axe | Verte (Y) | Glisser pour déplacer le long de Y uniquement |
| Flèche d’axe | Bleue (Z) | Glisser pour déplacer le long de Z uniquement |
| Pavé central | Ambre | Déplacement libre sur le plan du sol (X + Z) |
| Anneau de rotation | Violet | Glisser pour pivoter autour du pivot |

Les poignées s’éclairent quand vous les survolez, et brillent davantage
pendant que vous les faites glisser. Le manipulateur garde une taille
confortable à l’écran, quel que soit le niveau de zoom.

## Le pivot

Le repère blanc au centre du manipulateur est le **pivot** :

```
┌───────────────┐
│ ■           ■ │
│               │
│       +       │ ← pivot (centre des limites de la sélection)
│               │
│ ■           ■ │
└───────────────┘
```

- Sélectionnez une brique → le pivot se place au centre de cette brique.
- Sélectionnez plusieurs briques → le pivot se place au centre de la
  boîte qui les entoure toutes.
- La rotation se fait toujours autour du pivot.

Le pivot suit automatiquement votre sélection : sélectionnez A, ajoutez
B, puis annulez un déplacement — le manipulateur se repositionne à chaque
fois.

## Déplacer

1. Sélectionnez une ou plusieurs briques.
2. Attrapez une poignée d’axe pour déplacer le long de cet axe, ou le
   pavé central pour un déplacement libre sur le sol.
3. La sélection suit le pointeur en direct.
4. Relâchez pour valider.

## Faire pivoter

1. Sélectionnez une ou plusieurs briques.
2. Faites glisser l’anneau violet. La sélection pivote autour du pivot
   pendant que vous faites glisser.
3. Relâchez pour valider.

Pour une sélection multiple, chaque brique tourne autour du pivot commun
*et* pivote du même angle — l’ensemble garde sa forme.

## Valider, annuler, ne rien faire

| Vous… | Résultat |
|---|---|
| Relâchez la souris | Modification validée — **exactement une** entrée dans l’historique d’annulation, quel que soit le nombre de briques déplacées |
| Appuyez sur `Échap` en cours de glissement | Annulation — tout revient exactement en place ; l’historique n’est pas touché |
| Cliquez et relâchez sans bouger | Rien — aucune commande, aucune entrée dans l’historique |

`Ctrl/Cmd+Z` annule tout le geste en une étape ; `Ctrl/Cmd+Y` (ou
`Ctrl/Cmd+Maj+Z`) le rétablit.

## Pendant le glissement, le geste prend le pointeur

Pendant un glissement, la caméra n’orbite pas, rien d’autre ne peut être
sélectionné et les raccourcis sont ignorés — le glissement ne peut pas
entrer en conflit avec la caméra par accident. Relâcher (valider) ou
`Échap` (annuler) remet tout à la normale. Relâcher la souris *en dehors*
de la vue valide quand même proprement.

## Groupes

Sélectionner un groupe sélectionne ses briques membres — et le
manipulateur les traite exactement comme n’importe quelle sélection
multiple :

- Glisser déplace chaque membre ; pivoter fait tourner chaque membre
  autour du pivot commun.
- Le groupe lui-même n’est pas touché : l’appartenance ne change jamais à
  cause d’une transformation. (Le manipulateur ne sait même pas que les
  groupes existent.)
- Une seule annulation remet chaque membre là où il était.

## Aimantation

Les glissements sont aimantés par défaut — 1 unité du Monde pour le
déplacement (le même pas qu’un décalage avec une flèche du clavier) et 15°
pour la rotation (plus fin que le virage de 90° que fait `R`). Maintenez
**Maj** pendant le glissement pour le **mode précision** : 0,1× l’incrément
normal (0,1 unité du Monde, 1,5°), pour des ajustements fins pour lesquels
la grille par défaut est trop grossière.

Le **panneau de transformation numérique** et
l’**alignement / la répartition** sont l’exception voulue — ils
appliquent toujours la valeur exacte ou le résultat géométrique exact
demandé, jamais aimanté, puisque vous avez déjà saisi (ou demandé) quelque
chose de précis.

## Une collision bloque la validation

Déplacer ou faire pivoter une sélection vérifie le résultat par rapport à
toutes les briques *hors* de la sélection avant de l’autoriser à se poser.
Si un élément devait chevaucher quelque chose déjà présent, relâcher à cet
endroit ne valide pas — chaque brique de la sélection revient exactement là
où elle était, sans nouvelle entrée d’annulation, de la même façon qu’un
clic sur une case occupée est refusé pour une seule brique à placer.
Réorganiser des briques *à l’intérieur* de la même sélection (deux membres
qui échangent leur place par une rotation, par exemple) n’est jamais
considéré comme une collision. Cette vérification s’applique aux
glissements du manipulateur, aux décalages au clavier et à la rotation ;
l’alignement, la répartition et le panneau de transformation numérique n’y
sont pas soumis, puisqu’ils calculent un résultat exact et délibéré plutôt
qu’un déplacement libre.

## Ce que le manipulateur ne fait pas

- **Mise à l’échelle** — les briques ne peuvent pas être redimensionnées,
  il n’y a donc pas de poignées d’échelle.
- **Dupliquer en glissant** — il n’y a pas de touche pour copier pendant
  le glissement ; utilisez d’abord `Ctrl/Cmd+D` pour dupliquer la
  sélection sur place (voir
  [L’Éditeur](02-TheEditor.md#copier-coller-et-dupliquer)), puis faites
  glisser la copie.

## Astuces

- Survolez l’anneau de rotation et faites glisser lentement pour un
  contrôle fin — de petits arcs du pointeur près du pivot restent
  précis, car la rotation se mesure en angle, pas en distance.
- Utilisez une poignée d’axe quand vous voulez garder deux coordonnées
  parfaitement fixes — la contrainte est exacte, pas visuelle.
- Combinez les méthodes : décalez avec les flèches du clavier par pas
  entiers, puis terminez par un glissement avec Maj pour un
  positionnement fin. L’annulation et le rétablissement traitent les deux
  de la même façon — une étape par geste.
