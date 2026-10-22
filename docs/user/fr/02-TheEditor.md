<!-- translation-of: docs/user/02-TheEditor.md source-hash: b275d31fdacad544 -->
# 02 — L’Éditeur

<!-- languages -->
[English](../02-TheEditor.md) · [Deutsch](../de/02-TheEditor.md) · [Español](../es/02-TheEditor.md) · **Français** · [Bahasa Indonesia](../id/02-TheEditor.md) · [日本語](../ja/02-TheEditor.md) · [한국어](../ko/02-TheEditor.md) · [Português (Brasil)](../pt-BR/02-TheEditor.md)
<!-- /languages -->

L’Éditeur est l’endroit où vous construisez. Ce guide présente les outils,
la façon de sélectionner et de transformer des briques, et comment
organiser votre construction avec des groupes.

## La disposition

![L’Éditeur](../img/fr/editor.jpg)
*La barre d’outils en haut ; à gauche, les outils, le nom de la construction, le panneau Sélection et la Bibliothèque de construction ; au milieu, la vue 3D.*

```
┌─────────────────────────────────────────────────────────────┐
│ Barre d’outils : Enregistrer · Publier · Nouveau ·          │
│   Exporter · Importer · Récents · ⌨ Raccourcis              │
├──────────────────────┬──────────────────────────────────────┤
│ [Sélection|Placement]│                                      │
│ Titre de la constr. ✎│                                      │
│ Sélection            │              Vue 3D                  │
│ Bibliothèque de      │                                      │
│ construction         │                                      │
│ [Briques|Structures] │                                      │
└──────────────────────┴──────────────────────────────────────┘
```

- **Barre d’outils** — d’abord **Enregistrer**, **Publier** et
  **Nouveau**, puis **Fichier**, un menu avec **Exporter**, **Modèle 3D** et
  **Importer** ; rouvrir les constructions récentes, et ouvrir le panneau
  **⌨ Raccourcis** (aussi `?`).
- **Outils** — basculer entre **Sélection** (`1`) et **Placement** (`2`).
  **Placement** reste en surbrillance pendant que vous placez une brique
  ou une structure.
- **Titre de la construction** — le nom de la construction ouverte. Cliquez sur **✎**
  pour modifier son titre, sa description et sa licence. Son état
  d’enregistrement est affiché dans la barre d’outils.
  Cliquez sur le titre lui-même (**▸**) pour déplier le même panneau
  **À propos de cette construction** que la Vue du Monde, avec **Lire la
  suite** pour une longue description ; **▾** le replie, et l’Éditeur
  retient votre choix.
- **Sélection** — n’affiche que ce qui peut agir sur votre sélection
  actuelle ; voir [Le panneau Sélection](#le-panneau-sélection)
  ci-dessous.
- **Bibliothèque de construction** — un champ de recherche et deux
  onglets. Tapez une partie d’un nom, ou dites avec vos propres mots ce
  qu’il vous faut : *traverser la rivière* trouve le Pont, *dormir* le Lit.
  Les mots qui permettent de trouver chaque brique et chaque structure
  sont fournis avec l’application : rien n’est envoyé nulle part.
  - **Briques** — tout ce que vous pouvez placer avec l’outil Placement,
    sous forme de vignettes réparties en six sections (Base, Structure,
    Toits et escaliers, Ouvertures, Détails, Nature) : cinquante-neuf
    pièces, des demi-cubes, briques rondes et rondins aux toits à pignon et
    coniques, des toits en croupe qui couvrent toute une maison d’une seule
    pièce (4x4, 4x6 et 6x6) et un long toit à pignon 2x4, cadres de fenêtre
    et œils-de-bœuf, clôtures, bancs, buissons et sapins, des meubles pour
    les pièces où l’on entre (une table, un lit, un âtre et une étagère,
    dans Détails) et une **Lanterne** qui s’allume la nuit dans la Vue du Monde
    (voir [Le jour et la nuit](03-WorldView.md#le-jour-et-la-nuit)). Cliquez sur l’une d’elles
    pour la sélectionner (et passer à l’outil Placement) ; un nuancier
    **Couleur** apparaît alors pour choisir sa couleur — voir
    [Couleurs des briques](#couleurs-des-briques) ci-dessous.
    **Pente 45°**, **Pente douce 2x1**, **Escalier**, **Escalier large** et
    **Contreventement diagonal 2x2** montent vers un côté ; tournez-en un deux fois (**R**, **R**) pour l’orienter
    dans l’autre sens. Un contreventement diagonal et une copie tournée de
    180° forment une croix.
  - **Structures** — vingt-deux structures prêtes à l’emploi dans cinq
    catégories (résidentiel, agricole, commercial, collectif,
    infrastructure) et trois constructions plus grandes de la catégorie **vitrine**, plus
    vos propres **Mes structures**. Cliquez sur une
    carte pour la placer — voir
    [Structures : composer, remixer et votre bibliothèque personnelle](#structures--composer-remixer-et-votre-bibliothèque-personnelle)
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

## Essayez maintenant : une maison à finir

**Essayez maintenant**, sur l’**Accueil**, ouvre une maison à vous qui n’est
pas finie : ses murs sont montés et sa pièce est meublée, mais elle n’a pas
de toit. Une carte en haut des outils vous donne la mission, une étape à la
fois (**Étape 1 sur 4**), chacune avec un bouton qui choisit la brique
voulue et passe en Placement :

1. **Un toit** : cliquez sur **Prendre le toit** (**Toit en croupe 6x6**),
   puis n’importe où sur la maison : le toit se pose sur les murs.
2. **Une cheminée** : cliquez sur **Prendre la cheminée**, puis n’importe où
   sur la maison : elle traverse le toit au-dessus du foyer.
3. **Un chemin jusqu’à la porte** : cliquez sur **Prendre une pierre**, puis
   quatre fois n’importe où sur la maison : les pierres s’alignent depuis le
   seuil.
4. **Un jardin** : cliquez sur **Prendre un buisson**, puis mettez quatre
   choses autour de la maison, où vous voulez. Des buissons, une clôture,
   une pelouse, un rocher, un arbre ou une lanterne de la Bibliothèque de
   construction comptent tous.

Chaque étape compte les briques que vous ajoutez, dans n’importe quel
ordre, et annuler revient d’une étape. Tant que la mission est ouverte, la
carte **Votre première construction** attend repliée, pour qu’il n’y ait
qu’une consigne à la fois. Une fois les quatre étapes faites, la carte dit
que la maison est à vous, avec **La publier** (le même Publier que celui de
la barre d’outils, que vous pouvez aussi utiliser à tout moment) et
**Continuer à construire**, qui range la carte.

Toute autre construction toute prête (les cartes de l’**Accueil**, les idées
d’un défi, ou celle choisie sous **Nouveau** dans l’Éditeur) s’ouvre plutôt
avec une carte **Faites-la vôtre**. Cliquez sur **Prendre un arbre** (il
choisit un arbre et passe en Placement), puis sur le sol à côté de la
construction. Dès qu’elle contient quelque chose de vous, la carte propose
**La publier** de la même façon. Sur un téléphone, la carte se place sur la
vue 3D, au-dessus des boutons tactiles, car les outils y sont repliés.

## Votre première construction

La première fois que vous ouvrez l’Éditeur sur un appareil, une carte
**Votre première construction** apparaît dans le coin inférieur gauche de
la vue 3D (sur un téléphone, elle commence repliée en un petit bouton
**Première construction · 0/6** en haut à gauche, et tant qu’une maison d’**Essayez maintenant** a sa mission ouverte, elle attend repliée aussi). Elle liste six
étapes et donne une indication pour la suivante :

1. **Placer une brique**
2. **En empiler une sur une autre** : placez une brique sur une autre.
3. **Ajouter quelque chose à vous** : posez cinq briques à vous, une à une.
   Une structure ajoutée depuis la Bibliothèque de construction ne compte
   pas.
4. **Enregistrer votre construction**
5. **Publier et partager un lien** : publiez, puis **Copier le lien** ou
   **Partager…**.
6. **Entrer à pied** : cliquez sur **Entrer à pied**, à côté du lien que
   montre Publier (ou dans la carte), et entrez par la porte de votre
   construction dans le monde (voir
   [Entrer à pied](04-PublishingAndForking.md#entrer-à-pied)).

Chaque étape est cochée dès que vous la faites, dans n’importe quel
ordre ; annuler et rétablir ne comptent pas. Quand les six sont faites,
la carte le fête et propose **Voir d’autres constructions** ou **Continuer
à construire**, puis disparaît ; si elle était déjà terminée avant qu’entrer à pied soit
une étape, elle ne revient pas. **–** la replie en petit bouton ; **Masquer
le guide** la masque pour de bon sur cet appareil. Pour la faire revenir,
ouvrez la palette de commandes (**Ctrl+K**) et lancez **Guide de la
première construction**. Un appareil qui a déjà du travail enregistré
commence avec le guide masqué.

## Les deux outils

### Outil Placement (`2`)

Choisissez une brique dans la palette, survolez la vue et cliquez pour la
placer. Quand aucune brique n’est encore choisie, Placement commence avec
un **Cube**, pour que le premier clic place toujours quelque chose. Un
fantôme translucide montre exactement où la brique va se poser. Survolez la
face d’une brique existante pour empiler ou accrocher. Une brique posée sur
une autre repose sur la brique la plus haute en dessous, pas dedans : un toit
lâché au milieu du sol d’une maison se pose sur ses murs, et une poutre
en travers de deux poteaux, sur les poteaux.

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
| **Ctrl/Cmd + A** | Sélectionne toutes les briques de la construction |
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
| **T** | Basculer sur la face suivante |
| **Maj + T** | Basculer dans l’autre sens |
| **Suppr / Retour arrière** | Retirer les briques sélectionnées |

Quand vous sélectionnez plusieurs briques, elles pivotent autour de leur
**centre commun**, si bien qu’une section entière tourne d’un seul bloc.

**T** couche chaque brique sélectionnée sur sa face suivante, là où elle
est : un poteau s’allonge en poutre, un mur devient un sol, une pente se
retourne en surplomb. Chaque brique garde la hauteur de sa base, et la
bascule s’annule en une étape. Quatre appuis remettent une brique debout.
Pendant un placement, **T** bascule plutôt la brique que vous allez poser.
Une structure placée pivote mais ne bascule pas. Les anciennes versions de
ForkBuild (1.3.0 et avant) montrent les briques basculées debout.

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
  la construction de la structure (voir
  [Instances de structure](#instances-de-structure--une-référence-vivante)
  ci-dessous).

À côté de chaque nuancier **Couleur**, une rangée de **couleurs du
village** (enduit, pierre, brique, rouge tuile, chêne, feuille, ciel…) qui
vont bien ensemble : un clic en choisit une, pour les prochaines briques
ou pour la sélection. Le nuancier permet toujours de choisir n’importe
quelle couleur.

La couleur d’une brique est enregistrée avec votre construction et la suit
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

Pendant que vous construisez ensemble (**Construire avec moi**, plus bas),
Annuler ne reprend que vos propres étapes, jamais celles d’un ami, et sur tous
les écrans à la fois ; Rétablir les remet. Si un ami a modifié depuis ce que
votre étape avait produit (en supprimant la brique que vous aviez placée, par
exemple), cette étape est ignorée et l’Éditeur vous le signale. Quand
quelqu’un rejoint, Annuler repart de là pour tout le monde : le nouveau venu
n’a jamais eu les étapes faites avant.

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

## Structures : composer, remixer et votre bibliothèque personnelle

L’onglet **Structures** de la Bibliothèque de construction (voir
[La disposition](#la-disposition) ci-dessus) vous offre vingt-deux structures
prêtes à l’emploi — maisons, granges, un puits, un marché, un moulin, un
pont et bien d’autres, dans cinq catégories — et trois constructions plus
grandes de la catégorie **vitrine** (un château fort, une île du port et une place du
village), plus **Mes structures**,
votre collection personnelle de tout ce que vous avez enregistré depuis
une construction. Vous pouvez faire trois choses différentes avec chacune
d’elles, et elles servent à des fins différentes :

- **Placer** (cliquez sur la carte) — copie les briques de la structure
  directement dans la construction sur lequel vous travaillez déjà, pour
  qu’elle fasse partie d’une construction plus grande. C’est l’action de
  tous les jours.
- **Remixer en nouvelle construction** (dans le menu **⋮** de la carte) —
  démarre une toute nouvelle construction indépendante, qui commence comme une
  copie exacte de cette structure.
- **Remixer dans Mes structures** (cartes intégrées uniquement, dans le
  menu **⋮**) — ajoute la structure à vos propres **Mes structures**,
  sans aucune construction. Voir
  [Mes structures](#mes-structures--votre-bibliothèque-personnelle-de-plans)
  ci-dessous.
- **Infos** (dans le menu **⋮** de la carte) — un aperçu en lecture seule
  du nom, de la catégorie, du nombre de briques, de l’emprise, de la
  hauteur, de la source et de la description d’une structure.
- Placez l’une de vos **constructions enregistrées** comme **instance de
  structure** — une référence vivante et réutilisable plutôt qu’une
  copie — depuis la liste déroulante **Récents** de la barre d’outils, pas
  depuis la Bibliothèque de construction. Voir
  [Instances de structure](#instances-de-structure--une-référence-vivante)
  ci-dessous.

### Placer une structure dans votre construction

Cliquez sur n’importe quelle carte de l’onglet **Structures** — une carte
intégrée ou l’une de vos **Mes structures** — et un aperçu fantôme
translucide de toute la structure apparaît, suivant votre pointeur sur le
sol, exactement comme pour placer une seule brique :

1. Déplacez le pointeur pour positionner le fantôme.
2. Appuyez sur `R` / `Maj+R` pour le faire pivoter par pas de 90°.
3. Cliquez pour valider — toutes les briques de la structure sont
   ajoutées à votre construction en **une seule étape d’annulation**. Une
   position occupée teinte le fantôme en rouge et refuse le clic, de la
   même façon qu’une brique refuse de se poser sur une autre.
4. `Échap` annule — rien n’est ajouté, et vous revenez à l’outil que vous
   utilisiez avant.

Les briques obtenues sont des briques ordinaires de votre construction dès
qu’elles se posent — impossibles à distinguer de celles placées à la
main, libres d’être modifiées, sélectionnées, groupées ou supprimées comme
les autres. Placer plusieurs structures est une façon rapide de
construire une scène : cliquez sur Maison, placez-la ; cliquez sur
Grange, placez-la à côté ; cliquez sur Puits, placez-le dans la cour.

### Remixer une structure en nouvelle construction

Ouvrez le menu **⋮** d’une carte et cliquez sur **Remixer en nouvelle
construction** pour démarrer une toute nouvelle construction qui commence comme
une copie exacte de cette structure — exactement les mêmes briques,
modifiables avec tous les outils de ce guide, dans une construction à part
plutôt que mêlées à ce que vous avez ouvert. Remixer ne modifie jamais la
copie de la bibliothèque : remixez Maison dix fois, et chacune est une
construction indépendante dès que vous cliquez sur Remixer.

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
d’une carte **intégrée** et cliquez sur **Remixer dans Mes structures**.
Elle est ajoutée telle quelle — aucune construction créée, rien d’extrait — et
peut donc être renommée, exportée ou placée tout de suite, comme toute
autre entrée de votre bibliothèque.

Une structure de **Mes structures** fonctionne exactement comme une
structure intégrée — cliquez pour la placer dans votre construction actuelle,
ou Remixer en nouvelle construction — avec deux actions supplémentaires dans son
menu **⋮** :

| Action | Ce qu’elle fait |
|---|---|
| **Renommer** | Changer son nom (sa catégorie et sa description restent telles quelles) |
| **Retirer** | La supprimer de votre bibliothèque |

**Mes structures** ne stocke jamais que la *structure elle-même* — un nom
et un ensemble de briques. En retirer une ne touche jamais à ce que vous
avez déjà construit avec : partout où vous l’avez déjà placée ou remixée,
ces briques restent exactement telles quelles. Et elle ne se modifie
jamais sur place — si vous voulez changer ce qu’une structure enregistrée
construit, placez-la dans une construction, modifiez cette construction, puis
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

C’est facultatif, et entièrement indépendant du placement, du remix ou du
partage de la structure elle-même — cela existe pour les situations où
vous voulez associer votre nom à un design d’une façon que d’autres
peuvent vérifier indépendamment, et pas seulement croire. Voir
[Publications et preuves externes](09-PublicationsAndEvidence.md) pour ce
qu’il advient d’une revendication une fois publiée, et comment y joindre
des preuves externes indépendantes.

## Instances de structure : une référence vivante

Placer (ci-dessus) copie une fois les briques d’une structure dans votre
construction. Parfois, ce que vous voulez plutôt, c’est une copie **vivante**
de quelque chose que vous avez déjà construit — n’importe quelle construction
enregistré, pas seulement ce qui est dans votre bibliothèque — qui reste
synchronisée avec sa source chaque fois que vous la regardez. C’est une
**instance de structure** : elle référence la construction source au lieu de
copier ses briques, si bien que modifier la source plus tard met à jour
automatiquement toutes ses instances.

1. Ouvrez la liste déroulante **Récents** de la barre d’outils. (Elle
   apparaît dès que vous avez enregistré au moins une construction.)
2. À côté de n’importe quelle construction enregistrée, cliquez sur **Placer**.
   Cliquer sur le nom de la construction l’ouvre plutôt, à la place de ce que
   vous avez ouvert.
3. Survolez le sol, appuyez sur `R` pour pivoter, et cliquez pour placer —
   exactement comme pour placer une brique.

Une instance est une *référence* vivante à cette construction, pas une copie de
ses briques : le même construction peut être placé autant de fois que vous
voulez, et modifier plus tard les briques de la construction source met à jour
toutes ses instances. Sélectionnez une instance avec l’outil Sélection
(`1`) et la barre latérale affiche :

| Contrôle | Ce qu’il fait |
|---|---|
| Glisser dans la vue, ou le [manipulateur](InteractiveTransformGizmo.md) | Déplacer / faire pivoter, comme une brique |
| Flèches / Pg préc / Pg suiv | Décaler |
| **Champs X / Z / Rotation °, puis Appliquer** | Définir une position et une orientation exactes — l’altitude (Sol Y) suit toujours le terrain et n’est pas une cible que vous définissez |
| **Pivoter ↻ / ↺** | Pivoter d’exactement 90° |
| **Dupliquer** (`Ctrl/Cmd+D`) | Placer une autre instance de la même structure |
| **Supprimer** | Retirer cette instance — la construction source n’est pas touchée |
| **Modifier la construction source** | Ouvrir la construction référencée elle-même, pour changer l’apparence de toutes ses instances |

Modifier le *contenu* d’une structure placée se fait toujours en modifiant
sa construction source — il est impossible de modifier directement les
briques d’une instance, et c’est justement ce qui garde toutes ses
instances synchronisées.

## Propriétés de la construction

Chaque construction a un **titre**, une **description** facultative, une
**licence** et un réglage **Qui peut le placer dans le Monde** — à
définir dans la boîte de dialogue **Propriétés de la construction**, ouverte avec
le bouton **✎** à côté du titre de la construction en haut de la barre latérale
de l’Éditeur (dans la Vue du Monde, c’est le bouton **Modifier les
métadonnées**). Une nouvelle construction commence sans licence, ce qui veut
dire que personne d’autre ne peut le remixer tant que vous n’en choisissez
pas une. La description apparaît comme extrait sur sa carte dans **Explorer** et y
est aussi consultable par recherche ; la licence détermine si — et
comment — d’autres personnes peuvent la remixer. Voir
[Publier et remixer](04-PublishingAndForking.md) pour la signification de
chaque licence.

Les boutons **Suggérer un titre** et **Suggérer une description** sous le
titre proposent des idées tirées des briques de la construction : ses
structures de la Bibliothèque de construction, ses principales pièces et
couleurs et, pour un remix, ce qu’il a ajouté à la construction d’origine
(*Moulin et grenier avec Grange*). Appuyez de nouveau sur **Suggérer un
titre** pour l’idée suivante. Une description suggérée remplit une
description vide, ou se place après ce que vous avez écrit. Ce ne sont que
des suggestions, calculées sur votre appareil ; modifiez-les à votre guise.

Une longue description se lit mieux avec un peu de mise en forme, que
montrent le panneau d’informations de la construction, le navigateur de lieux de la
Vue du monde et les articles Steem et Blurt :

| Écrivez | Pour obtenir |
|---|---|
| une ligne vide | un nouveau paragraphe (un simple retour à la ligne reste un retour à la ligne) |
| `## Matériaux` en début de ligne | un titre |
| `- ` (ou `* `) en début de ligne | un élément de liste |
| `**mot**` | **gras** |
| `*mot*` | *italique* |
| `\*`, `\#`, `\-` | le caractère lui-même |

Rien d’autre n’est de la mise en forme : liens, images et HTML restent du
texte simple. Les cartes d’**Explorer** montrent les mots de la description sur une ligne, sans
mise en forme.

Les **étiquettes** disent ce qu’est la construction, comme `japonais temple
jardin` : jusqu’à 5, séparées par des espaces ou des virgules, faites de
minuscules, de chiffres et de tirets (les accents sont retirés, `café` devient
`cafe`). Si une construction n’en a pas, la boîte de dialogue remplit le champ
avec des suggestions tirées du titre et de la description, que vous pouvez
garder, modifier ou effacer ; les boutons sous le champ ajoutent d’autres
suggestions. Un remix garde ses étiquettes. Un article Blurt les affiche
après celles de ForkBuild, pour que ceux qui parcourent Blurt par étiquette
trouvent votre construction.

## Son

Chaque modification a son propre son bref, pour que vous entendiez ce qui
s’est passé sans regarder : un claquement quand une brique ou une
structure est placée, un « pop » quand elle est retirée, un tic pour un
déplacement et un double tic pour une rotation, une rapide série de bips
pour un collage ou une duplication, un tintement clair pour une nouvelle
couleur, deux notes pour un groupement, une cloche pour nommer un lieu, un
bip descendant pour annuler et un bip montant pour rétablir, et un petit
accord quand vous enregistrez. Les modifications qu’un collaborateur fait
dans la même construction sont silencieuses.

Coupez ou activez le son avec le bouton **Son** en haut à droite de la vue
ou en appuyant sur `M` (listé dans le panneau des raccourcis clavier,
`?`) ; le curseur à côté règle le volume. C’est le même réglage que dans
la Vue du Monde, mémorisé sur cet appareil. Le son démarre à votre premier
clic ou appui sur une touche, comme l’exigent les navigateurs.

Une musique douce accompagne la construction, un peu plus vive que celle de la Vue du Monde. Le bouton **♪ Musique** à côté du curseur l’active ou la désactive ; c’est le même choix que dans la Vue du Monde.

## Enregistrer, publier, recommencer

- **Enregistrer** (`Ctrl+S`) — garder votre travail sur cet appareil.
- **Publier** — le partager avec tout le monde (voir
  [Publier et remixer](04-PublishingAndForking.md)). Publier l’enregistre
  aussi. Pour une construction commencée à partir d’une construction toute
  prête qui ne contient encore rien de vous, la question est posée une
  fois : **Continuer à construire**, ou **Publier quand même**. Le message
  qui suit tient en une barre : **Entrer à pied** et **Copier le lien**, avec
  **Autres façons de partager**, qui regroupe le lien lui-même,
  **Enregistrer l’image**,
  **Faire une vidéo** et **Intégrer**. Un rappel d’ajouter une phrase de
  passe à l’identité avec laquelle vous avez publié attend votre publication
  suivante quand cette identité vient d’être créée.
- **Nouveau** — commencer quelque chose de nouveau : un **Terrain vide**,
  ou l’une des constructions toutes prêtes (un château fort, une île du
  port, une place du village, une maison, un moulin et un pont) comme votre
  propre copie, vue en entier. Si ce qui est ouvert a des modifications non
  enregistrées, Nouveau le signale d’abord ; enregistrez pour les garder.
- **Fichier** — un menu avec trois autres :
  - **Exporter** — télécharger la construction actuelle sous forme de fichier
    JSON, pour en garder une copie ou la déplacer vers un autre appareil.
    Les fichiers utilisent un format compact qui stocke les briques sous
    forme de tableau.
  - **Modèle 3D** — télécharger la construction comme modèle 3D pour d’autres
    logiciels (voir [Télécharger un modèle 3D](#télécharger-un-modèle-3d)).
  - **Importer** — ouvrir un fichier exporté comme une nouvelle construction
    avec sa propre identité ; rien n’est conservé tant que vous
    n’**Enregistrez** pas. Les fichiers exportés par des versions
    antérieures s’ouvrent toujours (ils sont convertis au chargement), mais
    ForkBuild 1.0.0 et les versions antérieures ne peuvent pas ouvrir les
    fichiers exportés par cette version.
  Quand vous avez fait la construction, **Exporter** signe le fichier, pour
  que la personne qui l’importe puisse se fier au nom et à la licence qu’il
  porte. Vos propres constructions s’importent telles quelles. Celle de
  quelqu’un d’autre s’ouvre comme votre propre copie, qui le crédite,
  quand sa licence autorise les remix ; sinon, ou si le fichier a été
  modifié après que son auteur l’a signé, elle n’est pas importée. Le
  fichier porte la licence qu’a la construction au moment de l’export :
  vous pouvez donc publier une construction en **All Rights Reserved** et
  quand même donner à quelqu’un une copie sur laquelle il peut construire.
  Choisissez une autre licence dans **Propriétés de la construction**, exportez,
  puis remettez-la. **Exporter toutes les constructions** et son
  **Importer**, sous **Récents**, fonctionnent de la même façon.
- **Récents** — rouvrir quelque chose que vous avez enregistré (la liste
  apparaît après votre premier enregistrement ; cliquez sur le nom d’un
  construction pour l’ouvrir). Dès que vous avez enregistré assez de
  constructions, un champ de filtre apparaît pour aller directement à l’un
  d’eux par son nom. Chaque entrée a aussi un bouton **Placer** — voir
  [Instances de structure](#instances-de-structure--une-référence-vivante)
  — pour l’ajouter à votre construction *actuelle* au lieu de la remplacer.
  **Exporter toutes les constructions**, en bas, télécharge toutes les constructions
  enregistrées dans un seul fichier ; **Importer** le relit, en
  enregistrant les constructions que cet appareil n’a pas (ouvrez-les depuis
  Récents), en ignorant ceux qu’il a déjà à l’identique, et en
  enregistrant une copie à côté de ceux qu’il a dans une autre version.
  Les modifications non enregistrées ne sont pas incluses, alors
  enregistrez d’abord.

## Construire avec moi : construire ensemble, en direct

**Construire avec moi**, sous le nom de la construction dans la barre
latérale, crée un lien qui permet à vos amis de travailler sur cette
construction avec vous, en même temps. Envoyez-le comme vous voulez ; il
s’affiche aussi en code QR pour un téléphone. Un ami qui l’ouvre choisit un nom
s’il ne l’a pas encore fait (ses briques sont ajoutées sous son nom), clique
sur **Rejoindre**, et votre construction s’ouvre dans son Éditeur. Dès lors,
chaque brique que l’un de vous place, déplace, recolore ou supprime apparaît
sur les deux écrans.

- Un bandeau au-dessus de la scène montre qui construit, chacun dans sa
  couleur, et chacun voit où l’autre pointe et ce qu’il a sélectionné, dans
  cette couleur.
- **Annuler** (`Ctrl/Cmd + Z`) reprend votre propre dernière étape sur tous
  les écrans, et **Rétablir** la remet ; c’est à vos amis d’annuler leurs
  propres étapes.
- Il doit s’agir de votre propre construction : une que vous avez commencée,
  ou une copie que vous avez faite. Une construction commencée avant de choisir
  un nom devient la vôtre quand vous y invitez des amis.
- Toute personne qui ouvre le lien dans ses 30 premières minutes peut
  rejoindre, tant que la construction reste ouverte dans votre Éditeur. Tous
  ceux qui ont rejoint peuvent construire jusqu’à ce que vous cliquiez sur
  **Arrêter**, ouvriez une autre construction ou quittiez l’Éditeur.
  **Lien**, dans le bandeau, affiche de nouveau le lien.
- L’Éditeur de chaque ami garde sa propre copie, enregistrée sur son
  appareil. Quand vous arrêtez, il peut la garder, mais ce qu’il modifie ne
  vous parvient plus.
  Un ami qui n’a posé aucune brique n’est pas crédité, donc sa copie reste
  votre construction : restaurée depuis une sauvegarde, elle suit la
  licence de la construction, comme celle de n’importe qui.
- Toutes les personnes dont votre construction intègre les briques y sont
  créditées : le panneau de la construction indique **Construit avec** et
  leurs noms, et quand vous publiez, le lien partagé et l’arbre généalogique
  l’indiquent aussi, sous votre signature. La copie de chaque ami affiche
  les mêmes crédits. Une copie qu’une autre personne en fait commence sans
  ces crédits ; la sienne est une nouvelle construction.
- Chaque nom crédité, ainsi que l’auteur d’une construction partagée, ouvre
  la page de cette personne : les constructions que son identité a signées
  et celles où d’autres la créditent. Dans l’arbre généalogique, le titre
  de chaque construction l’ouvre, et les noms de son auteur et de ses
  co-constructeurs ouvrent leurs pages. **Mes mondes** liste **Constructions
  auxquelles vous avez participé**, celles où un ami vous a crédité, chacune
  ouvrant son Monde une fois publiée ; vos autres appareils les listent
  aussi, une fois connectés à celui-ci (ou après avoir reçu une copie de vos
  données).
- Rejoindre connecte directement vos deux appareils, comme **Se promener ici
  avec moi** : chacun peut voir l’adresse IP de l’autre. Personne ne devient
  un pair mémorisé ni un ami si vous ne le choisissez pas. Il faut un
  serveur de rendez-vous ; le site officiel en a un.

## Télécharger un modèle 3D

**Modèle 3D**, sous **Fichier** dans la barre d’outils, télécharge ce qui est ouvert sous
forme de fichier que d’autres logiciels 3D ouvrent, créé sur cet appareil
(rien n’est envoyé) :

- **glTF (.glb)** — en couleur. S’ouvre dans Blender, la Visionneuse 3D de
  Windows, des moteurs de jeu comme Godot et Unity, et les visionneuses en
  ligne. Une unité ForkBuild vaut un mètre.
- **Pour l’impression 3D (.stl)** — d’une seule couleur, en millimètres à
  l’échelle 1:100 (une porte mesure 20 mm, un cube 10 mm), Z vers le haut et
  posé sur le plateau, pour qu’un trancheur (Cura, PrusaSlicer, Bambu
  Studio…) l’ouvre prêt à imprimer ; agrandissez-le là si vous voulez. Les
  briques qui se touchent ou se chevauchent restent des pièces séparées,
  que les trancheurs fusionnent au tranchage.
- **OBJ (.obj)** — en couleur (couleurs de sommets), pour les logiciels plus
  anciens.

Chaque brique garde exactement la forme et la couleur qu’elle a dans
ForkBuild, et les structures placées sont incluses si elles sont sur cet
appareil (le message le signale sinon). Chaque fichier nomme la
construction, son auteur, sa licence et ce dont elle est un remix : dans le
copyright et les extras glTF, dans l’en-tête STL et en commentaires dans
l’OBJ. La page d’une construction partagée propose les mêmes
téléchargements quand sa licence autorise les copies (voir
[Ce qu’ouvre un lien](04-PublishingAndForking.md#ce-quouvre-un-lien)).

## Décrire la construction

Appuyez sur `I`, ou choisissez **Décrire la construction** dans la palette
de commandes, et l’Éditeur dit de quoi votre construction est faite :
combien de briques, sa largeur, sa profondeur et sa hauteur approximatives,
les structures de la Bibliothèque de construction qui s’y trouvent, les
fenêtres, portes, toits, arbres et autres pièces parmi le reste de ses
briques, et ses couleurs principales, nommées d’après les couleurs du
village. Un lecteur d’écran la lit à voix haute ; elle reste aussi dans le
haut de la vue 3D jusqu’à ce que vous appuyiez sur **Fermer**, une façon
rapide de vérifier une construction sans faire tourner la caméra autour.
Elle est calculée sur votre appareil à partir des briques : rien n’est
envoyé nulle part. L’image d’une construction sur son lien partagé et dans
une intégration porte la même description pour les lecteurs d’écran.

## Des commandes avec vos mots

Tapez ce que vous voulez dans la palette de commandes (`Ctrl/Cmd+K`) avec
vos propres mots, comme *peins le toit en rouge*, *sélectionne toutes les
fenêtres* ou *supprime les arbres*, et sa première ligne, **D’après vos
mots**, dit ce qu’elle fera et sur combien de briques : *Peindre 4
fenêtres en Bleu du port*. Appuyez sur `Entrée`, ou cliquez dessus, pour le
faire en une seule étape annulable. Elle comprend peindre, sélectionner et
supprimer ; les parties d’une construction (fenêtres, portes, toits,
escaliers, arches, barrières, cheminées, meubles, lanternes, arbres,
buissons, rochers et pelouse), *tout*, ou ce qui est sélectionné (*ceci*,
*ces*) ; et les couleurs du village par leur nom ou par des mots de tous
les jours (*rouge*, *gris foncé*, *bleu clair*). Cela marche dans toutes
les langues de ForkBuild, sur votre appareil ; tout le reste cherche parmi
les actions comme avant.

## Dire une commande (voix)

Appuyez sur `V`, ou sur **🎤 Voix** en haut de la vue 3D, et dites ce que
vous voulez : *peins le toit en rouge*, *sélectionne toutes les fenêtres*,
*supprime les arbres*, *annuler*. Appuyez sur `V` (ou **Arrêter**) quand
vous avez fini ; ForkBuild dit ce qu’il a entendu et ce qu’il a fait, en une
seule étape annulable. Il comprend les mêmes demandes que
[Des commandes avec vos mots](#des-commandes-avec-vos-mots), et toute action
dite par son nom. Une question (*comment inviter un ami ?*) propose
**Demander au guide**.

La première fois, il explique ce que télécharge l’activation de la voix,
environ 70 Mo une seule fois : un petit modèle vocal (Whisper) depuis
Hugging Face et son moteur depuis jsDelivr. Ils restent dans ce navigateur,
si bien que la voix marche ensuite hors ligne. Ce que vous dites est
enregistré et compris sur votre appareil, et n’est jamais envoyé (voir
[Confidentialité](Privacy.md)). **Désactiver la voix** et **Supprimer le
modèle vocal** se trouvent dans le panneau de la voix après chaque commande.
Il entend la langue dans laquelle ForkBuild est affiché.

La Vue du Monde écoute aussi (voir
[Dire où aller](03-WorldView.md#dire-où-aller-voix)). Le modèle vocal
travaille en arrière-plan : la vue ne se fige jamais pendant qu’il écoute, et
il reste chargé quand vous passez de l’une à l’autre.

## Commandes de la caméra

- **Glisser** — orbiter autour de la scène
- **Molette** — zoomer et dézoomer
- **Origine** — remettre la caméra dans la vue par défaut

Une construction s’ouvre vue d’en haut, en biais, cadrée en entier.

### Voir l’intérieur

**Voir l’intérieur**, en haut à gauche de la vue (en haut à droite sur un
téléphone, sous **Outils**), coupe la construction au-dessus de son
rez-de-chaussée, comme la Vue du Monde quand vous entrez : les murs
s’arrêtent à hauteur de tête environ et les pièces, avec leurs meubles, se
voient d’en haut. Construisez-y comme d’habitude : un clic passe à travers
ce qui est coupé. **La montrer en entier** dessine de nouveau tout. Rien
n’est retiré ; seul ce qui est dessiné change.

## Sur un téléphone ou une tablette

L’Éditeur fonctionne au toucher. Faites glisser un doigt pour orbiter,
deux pour vous déplacer, et pincez pour zoomer. Un appui bref sélectionne
ou place, et un glissement ne le fait jamais. Sur un écran étroit, la
barre latérale s’ouvre avec le bouton **Outils** en haut à droite de la
scène. Une barre en bas de la scène propose **Annuler**, **Rétablir**,
**Pivoter**, **Basculer**, **Supprimer**, **Multi** (chaque appui ajoute ou retire une
brique de la sélection), **Cadre** (glissez pour tracer un cadre de
sélection ; la caméra reste immobile jusqu’à ce que vous le désactiviez)
et **Plus**, qui ouvre la Palette de commandes. Sur un téléphone, la barre d’outils au-dessus de la
scène défile sur le côté : **Enregistrer** et **Publier** y viennent donc en
premier (après **← Retour au Monde**, quand il y en a un). Voir
[Écrans tactiles](ControlsReference.md#écrans-tactiles) pour les détails.
