<!-- translation-of: docs/user/ControlsReference.md source-hash: 15773095004fb495 -->
# Référence des commandes

<!-- languages -->
[English](../ControlsReference.md) · [Deutsch](../de/ControlsReference.md) · [Español](../es/ControlsReference.md) · **Français** · [Bahasa Indonesia](../id/ControlsReference.md) · [日本語](../ja/ControlsReference.md) · [한국어](../ko/ControlsReference.md) · [Português (Brasil)](../pt-BR/ControlsReference.md)
<!-- /languages -->

Chaque interaction à la souris et au clavier dans ForkBuild ; les
téléphones et tablettes sont traités dans [Écrans tactiles](#écrans-tactiles).
La Vue du Monde sert à regarder autour de soi et à naviguer ; chaque
commande de construction (sélection pour modifier, transformations,
groupes, presse-papiers, placement et Palette de commandes) ne fonctionne
que dans l’Éditeur. Les raccourcis de l’Éditeur sont les mêmes que ceux
listés dans sa Palette de commandes et dans le panneau **⌨ Raccourcis** —
si cette page et la palette ne sont pas d’accord, c’est la palette qui a
raison et cette page qui a un bug.

Ouvrez la **Palette de commandes** avec `Ctrl/Cmd+K` dans l’Éditeur pour
chercher par son nom chacune des opérations de modification ci-dessous.

Les touches sont désignées par leur nom sur un clavier français : `Maj`
(Shift), `Suppr` (Delete), `Échap` (Escape), `Origine` (Home), `Pg préc` /
`Pg suiv` (Page Up / Page Down), `Retour arrière` (Backspace).

## Caméra (les deux vues)

| Entrée | Action |
|---|---|
| Glisser avec le bouton gauche dans le vide | Orbiter |
| Glisser avec le bouton droit | Se déplacer latéralement |
| Molette | Zoomer |
| `Origine` | Éditeur : réinitialiser la caméra (ignoré pendant un glissement du manipulateur). Vue du Monde : ramener la caméra et l’avatar à votre propre monde actuel — voir [Vue du Monde](03-WorldView.md#orientation-et-emplacements) |

## Commandes générales (Éditeur uniquement)

| Entrée | Action |
|---|---|
| `Ctrl/Cmd+K` | Palette de commandes |
| `?` | Panneau des raccourcis clavier (aussi accessible par le bouton « ⌨ Raccourcis » de la barre d’outils) — tous les raccourcis de l’Éditeur |

## Découverte (Vue du Monde)

Ce ne sont pas des raccourcis clavier, mais la façon propre à la Vue du
Monde de trouver des choses — voir
[Vue du Monde](03-WorldView.md#trouver-des-mondes) pour l’explication
complète.

| Contrôle | Action |
|---|---|
| Panneau Recherche, **Chercher** | Chercher des publications par titre ou auteur, éventuellement dans un rayon autour d’une coordonnée |
| **Explorer ici** | Ouvrir la boîte de dialogue Explorer l’emplacement, centrée sur la position actuelle de la caméra |
| **Qu’y a-t-il ici ?** | Pareil, avec un petit rayon fixe — « ce qu’il y a pratiquement ici » |
| **Centrer** sur un résultat | Déplacer la caméra jusque-là et en faire le document actif (en cours de modification) |
| **Sélectionner** sur un résultat | En faire le document actif, sans déplacer la caméra |
| **Inspecter** sur un résultat | Déplier sur place un résumé en lecture seule |

## Orientation et navigation (Vue du Monde)

Purement de la navigation de caméra — aucune de ces commandes ne charge
de document, ne change la sélection ni ne modifie quoi que ce soit. Voir
[Vue du Monde](03-WorldView.md#orientation-et-emplacements).

| Contrôle | Action |
|---|---|
| Indicateur de boussole | Cap en lecture seule, avec des repères contextuels pour les structures et éléments du terrain proches |
| **Accueil** | Ramener la caméra et l’avatar à votre propre monde actuel (revient à l’origine partagée si vous n’avez encore centré aucun de vos mondes pendant cette session) — voir [Vue du Monde](03-WorldView.md#orientation-et-emplacements) |
| **Emplacements** | Ouvrir la liste du Monde, de ses structures, points de repère et lieux, chacun avec un bouton **Centrer** |
| **?** | Afficher ou masquer les commandes de la caméra et de la marche |
| 🔔 **Notifications** (en-tête de l’application, sur chaque page) | Ouvrir votre **Historique des notifications** — un journal en lecture seule, pas une action de caméra ; voir [Vue du Monde](03-WorldView.md#orientation-et-emplacements) |
| **Caméra** : Libre / Première personne / Troisième personne / Vue aérienne | Verrouiller la caméra à un décalage fixe par rapport à votre propre avatar au lieu de la piloter vous-même ; cliquez de nouveau sur celle qui est active pour revenir à Libre — voir [Avatars et présence](06-AvatarsAndPresence.md#perspective-de-la-caméra) |

### Descriptions contextuelles des lieux

Pendant que vous vous déplacez dans le monde, l’interface affiche un
contexte calculé comme :

- « **Forêt · près de Maison** » — vous êtes dans une forêt, à moins de 50
  unités d’une structure
- « **Prairie · rivière** » — terrain dégagé au bord d’une rivière
- « **Prairie · lac · près de Grange** » — terrain, eau, et la structure
  la plus proche

Ces descriptions sont calculées à partir de votre position, de l’écologie
du terrain, de l’hydrologie et des placements de structures — rien n’est
stocké dans le monde.

## Son (les deux vues)

| Entrée | Action | Remarques |
|---|---|---|
| `M` | Couper ou activer le son | Comme le bouton **Son** ; un seul réglage pour les deux vues, mémorisé sur cet appareil. Voir [Vue du Monde](03-WorldView.md#son) et [l’Éditeur](02-TheEditor.md#son) |

## Déplacement de l’avatar (Vue du Monde)

Faire marcher directement votre avatar, au lieu de faire voler la
caméra — voir
[Avatars et présence](06-AvatarsAndPresence.md#faire-marcher-votre-avatar).

| Entrée | Action | Remarques |
|---|---|---|
| `W` / `A` / `S` / `D` | Avancer / tourner | Bloqué par les bâtiments, arbres, animaux et habitants proches, comme par un mur. Ce sont les lettres imprimées sur les touches, y compris sur un clavier AZERTY |
| `Maj` (maintenu) | Courir | |
| `Espace` | Sauter | En eau profonde : remonter |
| `C` (maintenue) | Plonger | Seulement dans une eau assez profonde pour nager |
| `Alt` + `W` / `S` | Démarrer une marche continue vers l’avant / l’arrière | Continue après avoir relâché les touches ; un simple appui sur `W`/`S` sans Alt l’annule |
| `Alt` + `Maj` + `W` / `S` | Démarrer une course continue vers l’avant / l’arrière | Même règle d’annulation que ci-dessus |

## Véhicules (Vue du Monde)

Voir [Avatars et présence](06-AvatarsAndPresence.md#véhicules). Demande le
mode Contrôle de l’avatar ; une indication apparaît automatiquement quand
vous êtes assez près d’un véhicule pour y monter.

| Entrée | Action | Remarques |
|---|---|---|
| `E` | Monter sur le véhicule proche, ou descendre de celui où vous êtes | Affiché / actif seulement quand un véhicule est à portée ou que vous êtes à bord |
| `W` / `S` | Accélérer / reculer | Remplace la marche à pied pendant que vous êtes à bord |
| `A` / `D` | Tourner l’orientation de votre avatar | Même rotation qu’à pied — pas la direction du véhicule |
| `←` / `→` (appui) | Tourner vers la gauche / la droite la direction visée par le véhicule | Un seul virage de 45° par appui — maintenir la touche ne continue pas de tourner |
| `Ctrl` (maintenu) | Freiner | |
| `Q` (à bord) | Ranger le véhicule où vous êtes dans votre inventaire | Le retire du monde ; vous fait descendre en même temps |
| `Q` (à pied, avec un véhicule rangé) | Sortir le véhicule rangé sélectionné | Le fait apparaître et vous met à bord à votre position actuelle ; par défaut, le dernier rangé |
| `[` / `]` (avec 2 véhicules rangés ou plus) | Faire passer la sélection à un véhicule rangé plus ancien / plus récent | Change seulement celui que `Q` sortira ensuite — ne fait jamais monter ni disparaître quoi que ce soit |

## Animaux (Vue du Monde)

Voir [Avatars et présence](06-AvatarsAndPresence.md#animaux). Demande le
mode Contrôle de l’avatar ; une indication apparaît automatiquement quand
un animal attrapable est proche ou que vous en transportez un.

| Entrée | Action | Remarques |
|---|---|---|
| `F` (près d’un animal attrapable) | L’attraper | L’ajoute à votre inventaire et le retire du monde |
| `F` (loin de tout animal attrapable, en en transportant un) | Relâcher le dernier animal attrapé | Le fait apparaître à votre position actuelle, de nouveau attrapable |
| `G` (près d’un animal que vous avez relâché) | En décorer le Monde | L’enregistre dans le contenu du Monde comme décoration — il n’est plus attrapable ; demande le droit de MODIFICATION. Une indication s’affiche quand `G` ferait quelque chose |
| `G` (près d’une décoration animale, sans animal relâché à proximité) | Annuler la décoration | La retire du Monde et la retransforme en animal vivant et attrapable |

## Habitants (Vue du Monde)

Voir [Avatars et présence](06-AvatarsAndPresence.md#habitants). Demande le
mode Contrôle de l’avatar ; les boutons **Ajouter un habitant ici** /
**Retirer l’habitant** et **Parler** de la section Avatar font la même
chose sans lui.

| Entrée | Action | Remarques |
|---|---|---|
| `R` (sur un terrain dégagé, sans habitant juste à côté) | Ajouter un habitant dont la maison est là où vous êtes | Enregistré dans le contenu du Monde ; demande le droit de MODIFICATION. Pas sur un toit, dans l’eau ou à bord d’un véhicule |
| `R` (à côté d’un habitant) | Le retirer de son Monde | Une indication affiche **[R] Retirer l’habitant** ; annulez avec `Ctrl/Cmd+Z` |
| `T` (à côté d’un habitant) | Parler : il vous dit ce qu’il y a autour | Affiché dans une bulle au-dessus de sa tête ; parlez-lui de nouveau pour autre chose. Le bouton **Parler** de la section Avatar et du pavé tactile fait la même chose |
| Bouton **Centrer : …** (pendant que les paroles d’un habitant sont affichées) | Regarder ce qu’il a mentionné | Caméra seulement ; votre avatar ne bouge pas. Proposé pour les points de repère, structures, constructions et véhicules |

Votre inventaire, les véhicules placés et les animaux relâchés sont
enregistrés sur cet appareil et survivent à un rechargement — voir
[Avatars et présence](06-AvatarsAndPresence.md#ce-qui-survit-à-un-rechargement).

## Sélection (Éditeur ; cliquer sur une brique dans la Vue du Monde ne fait que l’inspecter)

| Entrée | Action | Remarques |
|---|---|---|
| Clic sur une brique | La sélectionner (remplace la sélection) | dans la Vue du Monde, cela ouvre seulement le panneau Inspection — voir [Vue du Monde](03-WorldView.md#la-vue-du-monde-est-en-lecture-seule--on-construit-dans-léditeur) |
| `Maj`-clic | Ajouter la brique à la sélection | |
| `Ctrl/Cmd`-clic | Ajouter ou retirer la brique de la sélection | |
| `Maj`-glisser | Sélection par cadre (remplace la sélection) | `Ctrl/Cmd+Maj`-glisser ajoute à la sélection ; un simple glissement fait orbiter la caméra |
| `Ctrl/Cmd+A` | Tout sélectionner | |
| `Échap` | Effacer la sélection | La chaîne Échap propre à l’Éditeur, ci-dessous — dans la Vue du Monde, Échap ne fait que fermer le panneau ouvert |
| `Suppr` / `Retour arrière` | Supprimer la sélection — **Éditeur uniquement** | une étape d’annulation ; aucune touche associée dans la Vue du Monde |
| Bouton **Centrer** du panneau Sélection — **Éditeur uniquement** | Cadrer instantanément la caméra sur la ou les briques sélectionnées | pas de raccourci clavier ; caméra seulement — ne touche jamais au document, à la sélection ni à l’historique d’annulation ; sélections de briques uniquement, pas les placements de structure |

## Transformation — clavier (Éditeur uniquement)

| Entrée | Action |
|---|---|
| `→` / `←` | Déplacer la sélection le long de l’axe X du monde |
| `↑` / `↓` | Déplacer la sélection le long de l’axe Z du monde |
| `Pg préc` / `Pg suiv` | Déplacer la sélection le long de l’axe Y du monde |
| `R` | Pivoter de +90° autour du pivot de la sélection |
| `Maj+R` | Pivoter de −90° |
| `Maj` pendant un glissement du manipulateur | Mode précision (incréments de 0,1×) |

## Transformation — manipulateur (Éditeur uniquement)

| Entrée | Action |
|---|---|
| Survoler une poignée | La met en surbrillance |
| Faire glisser une poignée d’axe (X rouge / Y vert / Z bleu) | Déplacer le long de cet axe (aimanté) |
| Faire glisser le pavé central (ambre) | Déplacement libre sur le plan du sol |
| Faire glisser l’anneau de rotation (violet) | Pivoter autour du pivot (aimanté) |
| Relâcher | Valider — exactement une étape d’annulation |
| `Échap` en cours de glissement | Annuler — rien ne change, rien dans l’historique |

Si un élément d’un glissement ou d’un décalage de plusieurs briques devait
se poser sur une brique hors de la sélection, relâcher à cet endroit
annule le geste au lieu de le valider — chaque brique revient exactement à
son point de départ, sans nouvelle entrée d’annulation. Réorganiser des
briques à l’intérieur de la même sélection n’est jamais considéré comme
une collision.

## Transformation — panneau numérique (Éditeur uniquement)

Dans la section **Position et rotation exactes** du panneau Sélection.

| Entrée | Action |
|---|---|
| Saisir dans les champs X/Y/Z/R | Valeurs exactes ; champ vide = inchangé |
| Bascule Absolu / Décalage | Viser le pivot ou appliquer un simple écart |
| `Entrée` ou Appliquer | Une opération, une étape d’annulation — jamais aimantée |
| `Échap` dans un champ, ou **Vider les champs** | Vider les champs (n’efface jamais la sélection) |

## Alignement et répartition (Éditeur uniquement)

Disponibles dans la section **Aligner, répartir, répéter** du panneau
Sélection et via la palette. L’alignement demande **2 briques ou plus** ;
la répartition **3 ou plus**. Les deux agissent sur les limites de toute
la sélection selon les **axes du monde** et valident une seule commande.

## Répéter (Éditeur uniquement)

Aussi dans la section **Aligner, répartir, répéter** du panneau
Sélection. Crée **N** copies supplémentaires de la sélection, décalées
régulièrement le long d’un axe, en **une seule étape d’annulation** —
tout le lot est vérifié pour les collisions avant que quoi que ce soit ne
soit créé, si bien qu’une collision en cours de lot bloque toute la
répétition au lieu de créer certaines copies et pas d’autres.

| Entrée | Action |
|---|---|
| Champ **Copies** | Nombre de copies supplémentaires (l’original n’est jamais touché) |
| Champ **Décalage** | Distance entre chaque copie |
| **Répéter X / Y / Z** | Répéter le long de cet axe du monde |

## Structures (Bibliothèque de construction) — Éditeur uniquement

Composer, forker et votre bibliothèque personnelle — voir
[L’Éditeur](02-TheEditor.md#structures--composer-forker-et-votre-bibliothèque-personnelle).

| Entrée | Action | Remarques |
|---|---|---|
| Clic sur une carte de l’onglet **Structures** | Entrer en mode placement de structure ; l’aperçu fantôme suit le pointeur | fonctionne pour une structure intégrée ou l’une de vos **Mes structures** |
| `R` / `Maj+R` pendant le placement | Faire pivoter le fantôme de ±90° | mêmes touches d’aperçu de placement que pour une brique |
| Clic | Valider — toutes les briques de la structure se posent en une étape d’annulation | refusé à une position occupée (rouge) |
| `Échap` pendant le placement | Annuler — rien n’est ajouté | |
| Menu **⋮** d’une carte, **Forker en nouveau document** | Démarrer un tout nouveau document qui commence comme une copie de cette structure | ne modifie jamais l’entrée de la bibliothèque |
| Menu **⋮** d’une carte intégrée, **Forker dans Mes structures** | L’ajouter telle quelle à Mes structures | aucun document créé, rien d’extrait |
| Menu **⋮** de n’importe quelle carte, **Infos** | Afficher un panneau en lecture seule nom / catégorie / briques / emprise / hauteur / source / description | jamais modifiable |
| Sélection d’**1 brique ou plus**, puis **Créer un plan** (section **Groupes et plan** du panneau Sélection, ou Palette de commandes) | Ouvrir une petite boîte de dialogue (nom / catégorie / description + aperçu) ; enregistrer la sélection comme nouvelle entrée de **Mes structures** | |
| Menu **⋮** d’une carte de **Mes structures**, **Renommer** | Changer le nom d’une structure personnelle | structures personnelles uniquement |
| Menu **⋮** d’une carte de **Mes structures**, **Retirer** | La supprimer de votre bibliothèque | ne touche jamais aux briques déjà composées ou forkées à partir d’elle |
| Menu **⋮** de n’importe quelle carte, **Exporter le plan** | La télécharger sous forme de fichier JSON portable | intégrée ou personnelle |
| Bouton **Importer un plan** (à côté du titre Mes structures) | Ajouter un fichier de plan à votre bibliothèque comme nouvelle entrée | nouvelle identité, même pour un fichier réimporté |

## Instances de structure (Éditeur)

Une **instance de structure** place un document enregistré entier comme
une seule unité sélectionnable — une référence vivante, pas une copie —
voir
[L’Éditeur](02-TheEditor.md#instances-de-structure--une-référence-vivante).

| Entrée | Action | Remarques |
|---|---|---|
| Liste déroulante **Récents** de la barre d’outils, bouton **Placer** d’un document | Entrer en mode Placer une structure visant ce document | cliquer sur le nom du document l’ouvre plutôt |
| `R` / `Maj+R` pendant le placement | Faire pivoter l’instance en attente de ±90° | mêmes touches d’aperçu de placement que pour une brique |
| Clic sur une instance placée (outil Sélection) | La sélectionner comme une unité, distincte d’une sélection de briques | |
| Glisser dans la vue, ou le manipulateur | Déplacer / faire pivoter l’instance | |
| `Ctrl/Cmd+D` | Dupliquer — place une autre instance du même document | voir [Dupliquer](#dupliquer-éditeur-uniquement) — une sélection d’instance obtient une nouvelle instance plutôt qu’une nouvelle copie de briques |
| Champs **X / Z / Rotation** du panneau d’instance, puis Appliquer | Définir une position et une orientation exactes | Y (altitude) vient toujours du terrain, ce n’est jamais une cible |
| **Modifier le document source** du panneau d’instance | Ouvrir le document référencé pour modifier ses briques | toutes les instances se mettent à jour, puisqu’une instance est une référence vivante |
| `Suppr` / `Retour arrière` | Retirer l’instance | ne touche jamais au document référencé |

## Groupes (Éditeur uniquement)

Dans la section **Groupes et plan** du panneau Sélection ; quand rien
n’est sélectionné, le panneau liste vos groupes pour que vous puissiez en
sélectionner un d’un clic.

| Opération | Disponibilité |
|---|---|
| Nouveau groupe | des briques sélectionnées |
| Renommer / Dupliquer / Supprimer le groupe | un groupe sélectionné |
| Ajouter au groupe / Retirer du groupe | des briques sélectionnées et un groupe sélectionné |

Les transformations de groupe (déplacer, pivoter, aligner, répartir,
numérique) agissent sur les briques membres résolues ; l’appartenance
elle-même n’est jamais modifiée par une transformation.

## Presse-papiers (Éditeur uniquement)

| Entrée | Action | Remarques |
|---|---|---|
| `Ctrl/Cmd+C`, ou **Copier** du panneau Sélection | Copier | demande une sélection |
| `Ctrl/Cmd+V`, ou **Coller** du panneau Sélection | Coller | le bouton apparaît dès que le presse-papiers contient quelque chose |

## Dupliquer (Éditeur uniquement)

| Entrée | Action | Remarques |
|---|---|---|
| `Ctrl/Cmd+D` | Dupliquer la sélection actuelle sur place — une étape d’annulation | fonctionne sur des briques isolées ou un groupe résolu ; une sélection d’instance de structure se duplique aussi — voir [Instances de structure](#instances-de-structure-éditeur). Laisse le presse-papiers (et tout décalage de collage en attente) intact |

Le double devient la sélection active, prêt à être glissé ou décalé
immédiatement.

## Historique

| Entrée | Action | Où |
|---|---|---|
| `Ctrl/Cmd+Z` | Annuler | Éditeur et Vue du Monde |
| `Ctrl/Cmd+Maj+Z` ou `Ctrl/Cmd+Y` | Rétablir | Éditeur et Vue du Monde |

Dans la Vue du Monde, annuler et rétablir s’appliquent à ses
modifications d’annotation : points de repère, noms de régions et
décorations animales. Son panneau Historique (voir
[Vue du Monde](03-WorldView.md#historique--prévisualiser-et-restaurer-des-états-antérieurs))
permet aussi de les prévisualiser et de les restaurer.

## Éditeur uniquement

| Entrée | Action |
|---|---|
| `1` / `2` | Passer à l’outil Sélection / Placement |
| `Ctrl/Cmd+S` | Enregistrer le document |

## Placement (Éditeur uniquement)

Ces touches appartiennent à l’outil Placement, elles n’apparaissent donc
pas dans la Palette de commandes (là, `R`/`Maj+R` font pivoter une
*sélection*). La Vue du Monde n’a pas du tout d’outil Placement.

| Entrée | Action | Remarques |
|---|---|---|
| Déplacer le pointeur | L’aperçu suit la face du sol ou de la brique survolée | teinté en rouge quand la position est actuellement occupée |
| `R` | Faire pivoter l’aperçu en attente de +90° | persiste quand vous changez de brique ; se réinitialise quand vous quittez le mode Placement. Appuyé avant de survoler quoi que ce soit, il fait tourner le prochain aperçu |
| `Maj+R` | Faire pivoter l’aperçu en attente de −90° | |
| Clic | Valider l’aperçu comme une vraie brique | refusé à une position occupée (rouge) |
| Nuancier **Couleur** de la Bibliothèque de construction | Choisir la couleur des prochaines briques que vous placez | revient à la couleur par défaut du type quand vous en choisissez un autre — voir [Couleurs des briques](02-TheEditor.md#couleurs-des-briques) |

Pour recolorer des briques déjà placées, sélectionnez-les et utilisez le
nuancier **Couleur** de la section Sélection — une étape d’annulation par
changement.

## Écrans tactiles

Sur un téléphone ou une tablette, les mêmes actions ont des commandes à
l’écran. Elles apparaissent dès que l’appareil a un écran tactile, si bien
qu’un ordinateur portable tactile les affiche à côté de son clavier et de
sa souris. Sur un écran de 720 pixels de large ou moins, la page se
réorganise aussi : les liens des pages se replient derrière un bouton
**Menu**, le panneau latéral de la Vue du Monde s’ouvre avec un bouton
**Panneau**, et la barre latérale de l’Éditeur devient un tiroir ouvert
par un bouton **Outils**.

### Caméra (les deux vues)

| Toucher | Action |
|---|---|
| Glisser un doigt | Orbiter |
| Glisser deux doigts | Se déplacer latéralement |
| Pincer | Zoomer |
| Appui bref | Vue du Monde : inspecter ce que vous avez touché. Éditeur : comme un clic avec l’outil actuel |

### Marcher (Vue du Monde)

Le pavé tactile apparaît quand le mode Contrôle de l’avatar est activé ;
le bouton **Marcher** au-dessus du joystick active et désactive le mode,
et avec lui le pavé.

| Contrôle | Touches qu’il remplace | Remarques |
|---|---|---|
| Joystick | `W` / `A` / `S` / `D` | Poussez vers le haut pour avancer, sur le côté pour tourner ; les diagonales pressent les deux touches |
| Joystick poussé jusqu’au bord | `Maj` | Courir |
| **Sauter** | `Espace` | Devient **Remonter** en eau profonde |
| **Plonger** | `C` | Affiché pendant la nage |
| **Croisière** | `Alt` + `W`, puis `Alt` + `Maj` + `W`, puis `W` | Chaque appui : marcher vers l’avant sans les mains, puis courir, puis s’arrêter. Affiche **Croisière : marche** / **Croisière : course** quand il est actif. Pousser le joystick vers l’avant ou l’arrière l’arrête aussi ; sur le côté, il ne fait que diriger |
| **Monter** / **Descendre** | `E` | Affiché quand un véhicule est à portée, ou à bord |
| **Ranger** / **Sortir** | `Q` | Affiché quand vous pouvez ranger le véhicule où vous êtes, ou en sortir un rangé. Sortir nomme le véhicule, et sa place dans la liste (comme 2/3) quand vous en transportez plusieurs |
| **‹** / **›** à côté de Sortir | `[` / `]` | Avec 2 véhicules ou plus : choisir un véhicule plus ancien ou plus récent à sortir |
| **Attraper** / **Relâcher** | `F` | Affiché quand un animal attrapable est proche, ou quand vous en transportez un |
| **Décorer** / **Annuler la décoration** | `G` | Affiché près d’un animal que vous avez relâché, ou près d’une décoration. Contrairement à `G`, une décoration refusée (non connecté, pas de droit de MODIFICATION) en indique la raison |
| **↶** / **↷** | `←` / `→` | À bord : un virage de 45° par appui |
| **Freiner** | `Ctrl` (maintenu) | À bord |

Les boutons du pavé remplacent les indications du clavier, qui sont
masquées tant qu’il est affiché. Une marche continue vers l’arrière
(`Alt` + `S`) n’a pas de bouton tactile ; une marche lancée depuis un
clavier s’affiche comme **Croisière : arrière**, et un appui l’arrête.

### Modifier (Éditeur)

Un appui fait ce que fait un clic : il sélectionne avec l’outil
Sélection, il place avec l’outil Placement. Un glissement ne fait que
déplacer la caméra, si bien qu’orbiter ne place jamais une brique et
n’efface jamais la sélection par accident. Le toucher n’a pas de survol,
l’outil Placement n’affiche donc pas d’aperçu avant l’appui ; la brique va
là où vous touchez. Choisir une brique ou une structure à placer ferme le
tiroir Outils, pour que l’appui suivant atteigne la scène. La barre en bas
de la vue remplace les touches :

| Bouton | Équivaut à | Remarques |
|---|---|---|
| **Annuler** / **Rétablir** | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Maj+Z` | |
| **Pivoter** | `R` | Pendant un placement, fait tourner la prochaine brique ou structure avant l’appui ; sinon, fait pivoter la sélection |
| **Supprimer** | `Suppr` | |
| **Multi** | `Ctrl/Cmd`-clic | Tant qu’il est actif, chaque appui ajoute une brique à la sélection ou l’en retire |
| **Cadre** | `Maj`-glisser | Tant qu’il est actif, glisser un doigt trace un cadre de sélection au lieu de déplacer la caméra ; avec **Multi** aussi actif, le cadre ajoute à la sélection (`Ctrl/Cmd+Maj`-glisser). La caméra reste immobile tant que Cadre est actif (un second doigt annule le cadre au lieu de zoomer), désactivez-le donc pour vous déplacer de nouveau |
| **Plus** | `Ctrl/Cmd+K` | La Palette de commandes, qui donne accès à toutes les autres actions de modification |

Les poignées du manipulateur fonctionnent au toucher comme à la souris,
**Cadre** actif ou non : faites glisser une poignée.

## Priorité d’Échap (Éditeur)

Échap dépend du contexte, exactement dans cet ordre :

1. **Champ de texte actif** — efface le champ ou lui retire le focus.
2. **Panneau des raccourcis clavier** — ferme le panneau (`?` le ferme
   aussi).
3. **Palette de commandes** — ferme la palette.
4. **Geste du manipulateur en cours** — annule le glissement (rien dans
   l’historique).
5. **Cadre de sélection en cours** — annule le cadre.
6. **Sinon** — efface la sélection (en mode Placement : quitte le
   placement).

### Échap dans la Vue du Monde

Un champ de texte actif garde Échap de la même façon ; sinon, Échap ferme
le panneau de la Vue du Monde qui est ouvert (le panneau Centrer, un
panneau de nommage, etc.).
