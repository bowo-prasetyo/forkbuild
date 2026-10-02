<!-- translation-of: docs/user/02-TheEditor.md source-hash: c8966f8ede880a9e -->
# 02 — L’Éditeur

<!-- languages -->
[English](../02-TheEditor.md) · [Deutsch](../de/02-TheEditor.md) · [Español](../es/02-TheEditor.md) · **Français** · [Bahasa Indonesia](../id/02-TheEditor.md) · [日本語](../ja/02-TheEditor.md) · [Português (Brasil)](../pt-BR/02-TheEditor.md)
<!-- /languages -->

L’Éditeur est l’endroit où vous construisez. Ce guide présente les outils,
la façon de sélectionner et de transformer des briques, et comment
organiser votre construction avec des groupes.

## La disposition

```
┌─────────────────────────────────────────────────────────────┐
│ Barre d’outils : Enregistrer · Publier · Nouveau ·          │
│   Exporter · Importer · Récents · ⌨ Raccourcis              │
├──────────────────────┬──────────────────────────────────────┤
│ [Sélection|Placement]│                                      │
│ Titre du document ✎  │                                      │
│ Sélection            │              Vue 3D                  │
│ Bibliothèque de      │                                      │
│ construction         │                                      │
│ [Briques|Structures] │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

- **Barre d’outils** — enregistrer, publier, commencer une nouvelle
  création, exporter ou importer un document sous forme de fichier,
  rouvrir les documents récents, et ouvrir le panneau **⌨ Raccourcis**
  (aussi `?`).
- **Outils** — basculer entre **Sélection** (`1`) et **Placement** (`2`).
  **Placement** reste en surbrillance pendant que vous placez une brique
  ou une structure.
- **Titre du document** — le nom de la création ouverte. Cliquez sur **✎**
  pour modifier son titre, sa description et sa licence. Son état
  d’enregistrement est affiché dans la barre d’outils.
- **Sélection** — n’affiche que ce qui peut agir sur votre sélection
  actuelle ; voir [Le panneau Sélection](#le-panneau-sélection)
  ci-dessous.
- **Bibliothèque de construction** — un champ de recherche et deux
  onglets :
  - **Briques** — tout ce que vous pouvez placer avec l’outil Placement,
    sous forme de vignettes réparties en cinq sections (Base, Structure,
    Toits et escaliers, Ouvertures, Détails). Cliquez sur l’une d’elles
    pour la sélectionner (et passer à l’outil Placement) ; un nuancier
    **Couleur** apparaît alors pour choisir sa couleur — voir
    [Couleurs des briques](#couleurs-des-briques) ci-dessous.
  - **Structures** — vingt structures prêtes à l’emploi dans cinq
    catégories (résidentiel, agricole, commercial, collectif,
    infrastructure), plus vos propres **Mes structures**. Cliquez sur une
    carte pour la placer — voir
    [Structures : composer, forker et votre bibliothèque personnelle](#structures--composer-forker-et-votre-bibliothèque-personnelle)
    ci-dessous.

### Le panneau Sélection

Le panneau change selon ce que vous avez sélectionné, il n’affiche donc
jamais de boutons qui ne peuvent encore rien faire :

- **Rien de sélectionné** — une courte indication, **Tout sélectionner**,
  **Coller** une fois que vous avez copié quelque chose, et vos groupes
  (cliquez sur l’un d’eux pour sélectionner ses briques).
- **Des briques sélectionnées** — combien, où elles sont, et les actions
  courantes : **Pivoter ↻ / ↺**, **Dupliquer**, **Supprimer**, **Copier**,
  **Coller**, **Couleur**, **Centrer** et **Désélectionner**. Les outils
  moins fréquents sont repliés dans trois sections en dessous : **Position
  et rotation exactes**, **Aligner, répartir, répéter**, et **Groupes et
  plan**.
- **Une instance de structure sélectionnée** — sa propre carte à la place,
  avec sa position, sa rotation et ses actions (voir
  [Instances de structure](#instances-de-structure--une-référence-vivante)).

> **Astuce :** appuyez sur `Ctrl/Cmd+K` n’importe où pour ouvrir la
> **Palette de commandes** — une liste, avec recherche par nom, de toutes
> les actions de ce guide.

## Les deux outils

### Outil Placement (`2`)

Choisissez une brique dans la palette, survolez la vue et cliquez pour la
placer. Un fantôme translucide montre exactement où la brique va se
poser. Survolez la face d’une brique existante pour empiler ou accrocher.

> **Astuce :** appuyez sur **Échap** pour revenir à l’outil Sélection.

### Outil Sélection (`1`)

Cliquez sur des briques pour les sélectionner, puis déplacez-les,
faites-les pivoter ou supprimez-les. C’est là que vous passez le plus de
temps une fois la forme ébauchée.

## Sélectionner des briques

ForkBuild vous donne un contrôle précis sur la sélection :

| Action | Résultat |
|---|---|
| **Clic** sur une brique | La sélectionne (remplace la sélection actuelle) |
| **Ctrl/Cmd + Clic** | Ajoute ou retire cette brique de la sélection |
| **Maj + Clic** | Ajoute cette brique à la sélection |
| **Maj + Glisser** | Trace un cadre — sélectionne tout ce qui est dedans |
| **Ctrl/Cmd + Maj + Glisser** | Sélection par cadre en *ajoutant* à la sélection actuelle |
| **Ctrl/Cmd + A** | Sélectionne toutes les briques de la création |
| **Échap** | Efface la sélection |

> **Pourquoi c’est important :** construire quoi que ce soit de plus grand
> qu’une brique, c’est travailler avec *beaucoup* de briques à la fois.
> Apprenez tôt la sélection par cadre avec Maj — c’est la façon la plus
> rapide d’attraper un mur entier.

## Déplacer, faire pivoter et supprimer

Avec une ou plusieurs briques sélectionnées :

| Touche | Action |
|---|---|
| **Flèches** | Décaler à gauche / à droite / vers l’avant / vers l’arrière |
| **Pg préc / Pg suiv** | Décaler vers le haut / le bas |
| **R** | Pivoter de 90° dans le sens horaire |
| **Maj + R** | Pivoter de 90° dans le sens antihoraire |
| **Suppr / Retour arrière** | Retirer les briques sélectionnées |

Quand vous sélectionnez plusieurs briques, elles pivotent autour de leur
**centre commun**, si bien qu’une section entière tourne d’un seul bloc.

## Couleurs des briques

Chaque type de brique a sa couleur par défaut, mais vous pouvez choisir la
vôtre :

- **Avant de placer** — une fois une brique sélectionnée dans l’onglet
  **Briques** de la Bibliothèque de construction, cliquez sur son nuancier
  **Couleur** et choisissez une couleur. Toutes les briques que vous
  placez ensuite l’utilisent, et le fantôme de placement la prévisualise.
  Choisir un autre type de brique revient à la couleur par défaut de ce
  type, jusqu’à ce que vous en choisissiez une de nouveau.
- **Après avoir placé** — sélectionnez une ou plusieurs briques et
  utilisez le nuancier **Couleur** de la section **Sélection** pour les
  recolorer toutes d’un coup. Chaque changement s’annule (`Ctrl/Cmd+Z`)
  comme n’importe quelle autre modification. Le nuancier n’est pas
  proposé pour une instance de structure sélectionnée — modifiez plutôt
  le document de la structure (voir
  [Instances de structure](#instances-de-structure--une-référence-vivante)
  ci-dessous).

La couleur d’une brique est enregistrée avec votre création et la suit
quand vous la publiez ou la partagez.

## Transformations précises : saisie numérique, alignement et répétition

Les sections repliées du panneau Sélection offrent des façons plus exactes
de déplacer une sélection, en plus du manipulateur et des touches
ci-dessus :

- **Position et rotation exactes** — saisissez des valeurs X/Y/Z/Rotation
  exactes au lieu de faire glisser. Choisissez **Absolu** (les valeurs
  sont une cible pour le pivot ou l’orientation de la sélection) ou
  **Décalage** (les valeurs sont ajoutées comme un écart), puis appuyez
  sur **Appliquer** (ou `Entrée` dans un champ). Un champ vide signifie
  « ne pas changer », jamais zéro. **Vider les champs** vide les champs
  sans toucher à la sélection.
- **Alignement et répartition** (sous **Aligner, répartir, répéter**) —
  neuf boutons pour aligner les bords ou les centres de toute la
  sélection sur un axe du monde (Gauche/Centre/Droite, Bas/Centre/Haut,
  Avant/Centre/Arrière), plus trois pour la répartir uniformément
  (Répartir X/Y/Z). L’alignement demande **2 briques ou plus**
  sélectionnées ; la répartition **3 ou plus**.
- **Répéter** (aussi sous **Aligner, répartir, répéter**) — crée **N**
  copies supplémentaires de la sélection, espacées régulièrement le long
  d’un axe. Si une seule copie devait entrer en collision, aucune copie
  n’est créée.

Chacune de ces actions est **une seule étape d’annulation**, exactement
comme un glissement du manipulateur ou un décalage au clavier — voir la
[Référence des commandes](ControlsReference.md#transformation--panneau-numérique-éditeur-uniquement)
pour le comportement détaillé, champ par champ.

Le bouton **Centrer** du panneau Sélection cadre la caméra sur les briques
sélectionnées sans rien modifier.

> **Les collisions sont bloquées.** Faire glisser le manipulateur ou
> décaler au clavier vérifie le résultat par rapport à toutes les briques
> hors de la sélection. Si relâcher devait poser un élément sur l’une
> d’elles, tout le déplacement est annulé au lieu d’être validé — chaque
> brique de la sélection revient exactement à son point de départ, sans
> nouvelle entrée d’annulation. Réorganiser des briques *à l’intérieur* de
> votre propre sélection (comme échanger la place de deux briques par une
> rotation) n’est jamais considéré comme une collision.

## Copier, coller et dupliquer

| Touche | Action |
|---|---|
| **Ctrl/Cmd + C** | Copier les briques sélectionnées |
| **Ctrl/Cmd + V** | Les coller (légèrement décalées pour que vous les voyiez) |
| **Ctrl/Cmd + D** | Dupliquer la sélection sur place — copier et coller en une étape |

Copier puis coller est idéal pour les éléments répétés — construisez une
fenêtre, puis copiez-collez-la sur toute une façade. **Dupliquer** fait la
même chose en un seul geste et une seule étape d’annulation, et laisse
votre presse-papiers intact : un Ctrl+C antérieur est toujours là à coller
après avoir dupliqué autre chose. Le double devient votre nouvelle
sélection, donc l’enchaînement naturel est sélectionner → dupliquer →
faire glisser ou décaler à sa place. Dupliquer fonctionne sur n’importe
quelle sélection — des briques isolées, un groupe entier ou une seule
[instance de structure](#instances-de-structure--une-référence-vivante).

## Annuler et rétablir

Chaque modification est enregistrée, vous pouvez donc toujours revenir en
arrière :

| Touche | Action |
|---|---|
| **Ctrl/Cmd + Z** | Annuler la dernière action |
| **Ctrl/Cmd + Y** *(ou Ctrl/Cmd+Maj+Z)* | La rétablir |

Déplacer dix briques compte pour **une seule** étape d’annulation,
l’annulation reste donc gérable même sur de grosses constructions.

## Groupes

Les groupes vous permettent de nommer et de réutiliser des ensembles de
briques — comme « Toit » ou « Fenêtres ».

**Créer un groupe :**
1. Sélectionnez des briques.
2. Ouvrez la section **Groupes et plan** du panneau Sélection et cliquez
   sur **Nouveau groupe**, puis donnez-lui un nom avec **Renommer le
   groupe** (ci-dessous).

**Utiliser un groupe :** cliquez sur le nom d’un groupe dans la liste pour
le sélectionner (avec ses briques) — la liste se trouve dans le panneau
Sélection quand rien n’est sélectionné, et dans **Groupes et plan** sinon.
Ces boutons agissent sur le groupe sélectionné :

| Bouton | Ce qu’il fait |
|---|---|
| **Renommer le groupe** | Changer le nom du groupe |
| **Dupliquer le groupe** | Copier le groupe entier *et* ses briques |
| **Supprimer le groupe** | Supprimer le groupe (les briques elles-mêmes sont conservées) |
| **Ajouter au groupe** | Ajoute votre sélection actuelle au groupe |
| **Retirer du groupe** | Retire votre sélection actuelle du groupe |

> **Bon à savoir :** sélectionner un groupe sélectionne simplement ses
> briques — cela ne modifie jamais le groupe. Et supprimer un groupe ne
> retire que l’*étiquette*, pas les briques qu’il contient.

## Structures : composer, forker et votre bibliothèque personnelle

L’onglet **Structures** de la Bibliothèque de construction (voir
[La disposition](#la-disposition) ci-dessus) vous offre vingt structures
prêtes à l’emploi — maisons, granges, un puits, un marché, un moulin, un
pont et bien d’autres, dans cinq catégories — plus **Mes structures**,
votre collection personnelle de tout ce que vous avez enregistré depuis
une construction. Vous pouvez faire trois choses différentes avec chacune
d’elles, et elles servent à des fins différentes :

- **Placer** (cliquez sur la carte) — copie les briques de la structure
  directement dans le document sur lequel vous travaillez déjà, pour
  qu’elle fasse partie d’une construction plus grande. C’est l’action de
  tous les jours.
- **Forker en nouveau document** (dans le menu **⋮** de la carte) —
  démarre un tout nouveau document indépendant, qui commence comme une
  copie exacte de cette structure.
- **Forker dans Mes structures** (cartes intégrées uniquement, dans le
  menu **⋮**) — ajoute la structure à vos propres **Mes structures**,
  sans aucun document. Voir
  [Mes structures](#mes-structures--votre-bibliothèque-personnelle-de-plans)
  ci-dessous.
- **Infos** (dans le menu **⋮** de la carte) — un aperçu en lecture seule
  du nom, de la catégorie, du nombre de briques, de l’emprise, de la
  hauteur, de la source et de la description d’une structure.
- Placez l’un de vos **documents enregistrés** comme **instance de
  structure** — une référence vivante et réutilisable plutôt qu’une
  copie — depuis la liste déroulante **Récents** de la barre d’outils, pas
  depuis la Bibliothèque de construction. Voir
  [Instances de structure](#instances-de-structure--une-référence-vivante)
  ci-dessous.

### Placer une structure dans votre document

Cliquez sur n’importe quelle carte de l’onglet **Structures** — une carte
intégrée ou l’une de vos **Mes structures** — et un aperçu fantôme
translucide de toute la structure apparaît, suivant votre pointeur sur le
sol, exactement comme pour placer une seule brique :

1. Déplacez le pointeur pour positionner le fantôme.
2. Appuyez sur `R` / `Maj+R` pour le faire pivoter par pas de 90°.
3. Cliquez pour valider — toutes les briques de la structure sont
   ajoutées à votre document en **une seule étape d’annulation**. Une
   position occupée teinte le fantôme en rouge et refuse le clic, de la
   même façon qu’une brique refuse de se poser sur une autre.
4. `Échap` annule — rien n’est ajouté, et vous revenez à l’outil que vous
   utilisiez avant.

Les briques obtenues sont des briques ordinaires de votre document dès
qu’elles se posent — impossibles à distinguer de celles placées à la
main, libres d’être modifiées, sélectionnées, groupées ou supprimées comme
les autres. Placer plusieurs structures est une façon rapide de
construire une scène : cliquez sur Maison, placez-la ; cliquez sur
Grange, placez-la à côté ; cliquez sur Puits, placez-le dans la cour.

### Forker une structure en nouveau document

Ouvrez le menu **⋮** d’une carte et cliquez sur **Forker en nouveau
document** pour démarrer une toute nouvelle création qui commence comme
une copie exacte de cette structure — exactement les mêmes briques,
modifiables avec tous les outils de ce guide, dans un document à part
plutôt que mêlées à ce que vous avez ouvert. Forker ne modifie jamais la
copie de la bibliothèque : forkez Maison dix fois, et chacune est une
création indépendante dès que vous cliquez sur Forker.

### Mes structures : votre bibliothèque personnelle de plans

Vous avez construit quelque chose qui mérite d’être réutilisé ?
Sélectionnez les briques qui le composent (un bâtiment entier, ou juste
une section) et cliquez sur **Créer un plan** — il se trouve dans la
section **Groupes et plan** du panneau Sélection dès que vous avez des
briques sélectionnées, et dans la Palette de commandes (`Ctrl/Cmd+K`)
dans tous les cas. Une petite boîte de dialogue demande un **nom**, une
**catégorie** et une **description** facultative, avec un aperçu en direct
de ce que vous allez enregistrer ; cliquez sur **Créer le plan** et il est
ramené à sa propre origine locale et enregistré immédiatement dans **Mes
structures**, une nouvelle section en bas de l’onglet Structures, juste
sous les catégories intégrées.

Il existe une seconde façon d’ajouter une structure à Mes structures, sans
rien à sélectionner ni à construire d’abord : ouvrez le menu **⋮**
d’une carte **intégrée** et cliquez sur **Forker dans Mes structures**.
Elle est ajoutée telle quelle — aucun document créé, rien d’extrait — et
peut donc être renommée, exportée ou placée tout de suite, comme toute
autre entrée de votre bibliothèque.

Une structure de **Mes structures** fonctionne exactement comme une
structure intégrée — cliquez pour la placer dans votre document actuel,
ou Forker en nouveau document — avec deux actions supplémentaires dans son
menu **⋮** :

| Action | Ce qu’elle fait |
|---|---|
| **Renommer** | Changer son nom (sa catégorie et sa description restent telles quelles) |
| **Retirer** | La supprimer de votre bibliothèque |

**Mes structures** ne stocke jamais que la *structure elle-même* — un nom
et un ensemble de briques. En retirer une ne touche jamais à ce que vous
avez déjà construit avec : partout où vous l’avez déjà placée ou forkée,
ces briques restent exactement telles quelles. Et elle ne se modifie
jamais sur place — si vous voulez changer ce qu’une structure enregistrée
construit, placez-la dans un document, modifiez ce document, puis
**Créer un plan** de nouveau (éventuellement sous un nouveau nom, comme
« Ferme de luxe » — elle devient une entrée distincte dans Mes
structures, pas un remplacement de l’originale).

> **Bon à savoir :** Mes structures se trouve sur cet appareil. Elle n’est
> liée à votre identité ni synchronisée nulle part automatiquement — voir
> [Partager des plans](#partager-des-plans--export-et-import) ci-dessous
> pour en déplacer une vers un autre appareil ou la donner à quelqu’un.

### Partager des plans : export et import

N’importe quelle structure — intégrée ou à vous — peut quitter l’appareil
où elle se trouve sous forme de fichier portable, sans jamais faire partie
du Monde publié partagé :

- **Exporter le plan** (dans le menu **⋮** de n’importe quelle carte) la
  télécharge sous forme d’un petit fichier JSON — un instantané autonome
  du nom, de la catégorie, des étiquettes, de la description et des
  briques de cette structure.
- **Importer un plan** (bouton à côté du titre **Mes structures**) relit
  un fichier de plan et l’ajoute à vos Mes structures comme une nouvelle
  entrée indépendante — une copie neuve avec sa propre identité, jamais
  reliée à sa provenance. Importer deux fois le même fichier donne deux
  entrées distinctes, pas une qui écrase l’autre en silence. Un fichier
  mal formé ou non reconnu est refusé avec une explication au lieu de
  produire en silence quelque chose de cassé.

C’est ainsi que vous donnez une construction à un ami, ou que vous
emportez vos propres structures d’un de vos appareils à l’autre :
exportez d’un côté, envoyez le fichier comme vous voulez, importez de
l’autre.

**Tout exporter** (à côté de **Importer un plan**, dès que vous avez vos
propres structures) télécharge toutes les structures de Mes structures
dans un seul fichier, chacune avec ses attributions et ses revendications
de filiation. **Importer un plan** lit aussi ce fichier, et ignore tout
design déjà présent dans Mes structures, si bien que l’importer deux fois
ne crée pas de doublons. Pour garder aussi une copie de tout le reste,
utilisez [Vos données](13-YourData.md).

### Revendiquer la paternité

Une structure dotée d’une identité de Plan (la plupart des structures
enregistrées en ont une) peut aussi porter une **Attribution par la
communauté** — un registre signé de qui affirme l’avoir conçue. Ouvrez le
panneau **Infos** de la structure depuis sa carte et vous trouverez :

- **Revendiquer la paternité** — signe une revendication, sous votre
  identité actuelle, selon laquelle vous êtes l’un de ses auteurs.
  Plusieurs personnes peuvent chacune revendiquer le même design
  indépendamment ; la revendication de l’une ne remplace jamais celle
  d’une autre.
- **Exporter l’attribution** / **Publier sur le réseau** — une fois la
  paternité revendiquée, partagez cette revendication sous forme de
  fichier ou annoncez-la à vos pairs connectés. Après **Publier sur le
  réseau**, le panneau propose **Distribuer**, qui place aussi la
  revendication sur des réseaux décentralisés (voir
  [Distribution](Distribution.md)).
- **Signer de nouveau pour ce design** — les revendications faites avant
  le 28 septembre 2026 utilisaient un ancien type d’empreinte de design
  qu’un design différent peut reproduire, elles ne comptent donc plus et
  le panneau indique combien il y en a. Si l’une d’elles est la vôtre et
  que c’est vraiment votre design, ce bouton signe de nouveau votre
  revendication. Vérifiez d’abord le design : le bouton apparaît pour tout
  design qui partage l’ancienne empreinte.

C’est facultatif, et entièrement indépendant du placement, du fork ou du
partage de la structure elle-même — cela existe pour les situations où
vous voulez associer votre nom à un design d’une façon que d’autres
peuvent vérifier indépendamment, et pas seulement croire. Voir
[Publications et preuves externes](09-PublicationsAndEvidence.md) pour ce
qu’il advient d’une revendication une fois publiée, et comment y joindre
des preuves externes indépendantes.

## Instances de structure : une référence vivante

Placer (ci-dessus) copie une fois les briques d’une structure dans votre
document. Parfois, ce que vous voulez plutôt, c’est une copie **vivante**
de quelque chose que vous avez déjà construit — n’importe quel document
enregistré, pas seulement ce qui est dans votre bibliothèque — qui reste
synchronisée avec sa source chaque fois que vous la regardez. C’est une
**instance de structure** : elle référence le document source au lieu de
copier ses briques, si bien que modifier la source plus tard met à jour
automatiquement toutes ses instances.

1. Ouvrez la liste déroulante **Récents** de la barre d’outils. (Elle
   apparaît dès que vous avez enregistré au moins un document.)
2. À côté de n’importe quel document enregistré, cliquez sur **Placer**.
   Cliquer sur le nom du document l’ouvre plutôt, à la place de ce que
   vous avez ouvert.
3. Survolez le sol, appuyez sur `R` pour pivoter, et cliquez pour placer —
   exactement comme pour placer une brique.

Une instance est une *référence* vivante à ce document, pas une copie de
ses briques : le même document peut être placé autant de fois que vous
voulez, et modifier plus tard les briques du document source met à jour
toutes ses instances. Sélectionnez une instance avec l’outil Sélection
(`1`) et la barre latérale affiche :

| Contrôle | Ce qu’il fait |
|---|---|
| Glisser dans la vue, ou le [manipulateur](InteractiveTransformGizmo.md) | Déplacer / faire pivoter, comme une brique |
| Flèches / Pg préc / Pg suiv | Décaler |
| **Champs X / Z / Rotation °, puis Appliquer** | Définir une position et une orientation exactes — l’altitude (Sol Y) suit toujours le terrain et n’est pas une cible que vous définissez |
| **Pivoter ↻ / ↺** | Pivoter d’exactement 90° |
| **Dupliquer** (`Ctrl/Cmd+D`) | Placer une autre instance de la même structure |
| **Supprimer** | Retirer cette instance — le document source n’est pas touché |
| **Modifier le document source** | Ouvrir le document référencé lui-même, pour changer l’apparence de toutes ses instances |

Modifier le *contenu* d’une structure placée se fait toujours en modifiant
son document source — il est impossible de modifier directement les
briques d’une instance, et c’est justement ce qui garde toutes ses
instances synchronisées.

## Propriétés du document

Chaque création a un **titre**, une **description** facultative, une
**licence** et un réglage **Qui peut le placer dans le Monde** — à
définir dans la boîte de dialogue **Propriétés du document**, ouverte avec
le bouton **✎** à côté du titre du document en haut de la barre latérale
de l’Éditeur (dans la Vue du Monde, c’est le bouton **Modifier les
métadonnées**). Un nouveau document commence sans licence, ce qui veut
dire que personne d’autre ne peut le forker tant que vous n’en choisissez
pas une. La description apparaît comme extrait sur sa carte du Dépôt et y
est aussi consultable par recherche ; la licence détermine si — et
comment — d’autres personnes peuvent la forker. Voir
[Publier et forker](04-PublishingAndForking.md) pour la signification de
chaque licence.

## Son

Chaque modification a son propre son bref, pour que vous entendiez ce qui
s’est passé sans regarder : un claquement quand une brique ou une
structure est placée, un « pop » quand elle est retirée, un tic pour un
déplacement et un double tic pour une rotation, une rapide série de bips
pour un collage ou une duplication, un tintement clair pour une nouvelle
couleur, deux notes pour un groupement, une cloche pour nommer un lieu, un
bip descendant pour annuler et un bip montant pour rétablir, et un petit
accord quand vous enregistrez. Les modifications qu’un collaborateur fait
dans le même document sont silencieuses.

Coupez ou activez le son avec le bouton **Son** en haut à droite de la vue
ou en appuyant sur `M` (listé dans le panneau des raccourcis clavier,
`?`) ; le curseur à côté règle le volume. C’est le même réglage que dans
la Vue du Monde, mémorisé sur cet appareil. Le son démarre à votre premier
clic ou appui sur une touche, comme l’exigent les navigateurs.

## Enregistrer, publier, recommencer

- **Enregistrer** (`Ctrl+S`) — garder votre travail sur cet appareil.
- **Publier** — le partager avec tout le monde (voir
  [Publier et forker](04-PublishingAndForking.md)).
- **Nouveau** — commencer une nouvelle création vide.
- **Exporter** — télécharger la création actuelle sous forme de fichier
  JSON, pour en garder une copie ou la déplacer vers un autre appareil.
  Les fichiers utilisent un format compact qui stocke les briques sous
  forme de tableau.
- **Importer** — ouvrir un fichier exporté comme une nouvelle création
  avec sa propre identité ; rien n’est conservé tant que vous
  n’**Enregistrez** pas. Les fichiers exportés par des versions
  antérieures s’ouvrent toujours (ils sont convertis au chargement), mais
  ForkBuild 1.0.0 et les versions antérieures ne peuvent pas ouvrir les
  fichiers exportés par cette version.
- **Récents** — rouvrir quelque chose que vous avez enregistré (la liste
  apparaît après votre premier enregistrement ; cliquez sur le nom d’un
  document pour l’ouvrir). Dès que vous avez enregistré assez de
  documents, un champ de filtre apparaît pour aller directement à l’un
  d’eux par son nom. Chaque entrée a aussi un bouton **Placer** — voir
  [Instances de structure](#instances-de-structure--une-référence-vivante)
  — pour l’ajouter à votre document *actuel* au lieu de le remplacer.
  **Exporter tous les documents**, en bas, télécharge tous les documents
  enregistrés dans un seul fichier ; **Importer** le relit, en
  enregistrant les documents que cet appareil n’a pas (ouvrez-les depuis
  Récents), en ignorant ceux qu’il a déjà à l’identique, et en
  enregistrant une copie à côté de ceux qu’il a dans une autre version.
  Les modifications non enregistrées ne sont pas incluses, alors
  enregistrez d’abord.

## Commandes de la caméra

- **Glisser** — orbiter autour de la scène
- **Molette** — zoomer et dézoomer
- **Origine** — remettre la caméra dans la vue par défaut

## Sur un téléphone ou une tablette

L’Éditeur fonctionne au toucher. Faites glisser un doigt pour orbiter,
deux pour vous déplacer, et pincez pour zoomer. Un appui bref sélectionne
ou place, et un glissement ne le fait jamais. Sur un écran étroit, la
barre latérale s’ouvre avec le bouton **Outils** en haut à droite de la
scène. Une barre en bas de la scène propose **Annuler**, **Rétablir**,
**Pivoter**, **Supprimer**, **Multi** (chaque appui ajoute ou retire une
brique de la sélection), **Cadre** (glissez pour tracer un cadre de
sélection ; la caméra reste immobile jusqu’à ce que vous le désactiviez)
et **Plus**, qui ouvre la Palette de commandes. Voir
[Écrans tactiles](ControlsReference.md#écrans-tactiles) pour les détails.
