<!-- translation-of: docs/user/README.md source-hash: 168564d162b23c2b -->
# Documentation utilisateur de ForkBuild

<!-- languages -->
[English](../README.md) · [Deutsch](../de/README.md) · [Español](../es/README.md) · **Français** · [Bahasa Indonesia](../id/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Português (Brasil)](../pt-BR/README.md)
<!-- /languages -->

Guides pratiques pour utiliser ForkBuild dans le navigateur. Nouveau
venu ? Commencez par **[Premiers pas](01-GettingStarted.md)** : cinq
minutes entre l’ouverture de l’application et votre promenade dans votre
première construction.

## Je veux…

| Je veux… | Lisez |
|---|---|
| Construire ma première chose | [Premiers pas](01-GettingStarted.md#placer-votre-première-brique) |
| Apprendre les outils de construction | [L’Éditeur](02-TheEditor.md) |
| Partager une construction avec un ami | [Partager un lien](04-PublishingAndForking.md#partager-un-lien) |
| Que tout le monde trouve ma construction | [Qui peut la trouver ?](04-PublishingAndForking.md#qui-peut-la-trouver-) |
| Remixer la construction de quelqu’un d’autre | [Remixer : faites-le vôtre](04-PublishingAndForking.md#remixer--faites-le-vôtre) |
| Construire avec un ami, en direct | [Construire avec moi](02-TheEditor.md#construire-avec-moi--construire-ensemble-en-direct) |
| Me promener avec des amis | [Se promener ici avec moi](03-WorldView.md#se-promener-ici-avec-moi--amener-vos-amis-dans-ce-monde) |
| Changer l’apparence de mon avatar | [Avatars et présence](06-AvatarsAndPresence.md#personnaliser-votre-avatar) |
| Sauvegarder mon travail, ou le déplacer vers un autre appareil | [Vos données](13-YourData.md) |
| Trouver une touche ou une commande de souris | [Référence des commandes](ControlsReference.md) |
| Régler quelque chose qui ne marche pas | [FAQ](FAQ.md) |

Tout ce qui se trouve ici décrit le produit tel qu’il fonctionne
aujourd’hui ; les rouages internes du moteur se trouvent dans
[docs/Architecture.md](../../Architecture.md) et dans le reste du dossier
[docs/](../..) de premier niveau (en anglais uniquement).

## Jouer (à lire dans l’ordre)

Tout ce qu’il faut pour construire, partager, remixer et se promener
avec des amis.

1. **[Premiers pas](01-GettingStarted.md)** — ouvrir l’application, se
   repérer dans le menu, placer votre première brique, et ne choisir un
   nom que pour publier.
2. **[L’Éditeur](02-TheEditor.md)** — la boîte à outils de construction :
   outils, sélection, transformations, couleurs des briques, groupes, les
   structures de la Bibliothèque de construction et vos propres plans,
   les instances de structure, et le titre, la description et la licence
   d’une construction.
3. **[La Vue du Monde](03-WorldView.md)** — le monde 3D partagé où
   vit chaque construction publiée : marcher et voler, trouver et
   regarder les choses, **Construire ici**, **Se promener ici avec
   moi**, les habitants et **Modifier une copie** pour emporter quelque
   chose dans l’Éditeur. Ses outils réseau ont leur propre page, plus bas
   dans Avancé.
4. **[Publier et remixer](04-PublishingAndForking.md)** — publier et
   partager un lien, choisir où vont vos constructions, les licences,
   remixer, **Explorer** et ses constructions toutes prêtes, le défi de la
   semaine et sa place, et les arbres généalogiques. Pour tout ce vers
   quoi une construction peut aller, voir [Distribuer votre
   travail](Distribution.md).
5. **[Avatars et présence](06-AvatarsAndPresence.md)** — personnaliser
   votre avatar, qui peut vous voir, marcher, les perspectives de caméra,
   les véhicules, les animaux et votre inventaire.
6. **[Vos données](13-YourData.md)** — sauvegarder tout ce que ce
   navigateur contient dans un seul fichier chiffré et le restaurer, les
   exports plus restreints, et où cet appareil a enregistré la
   distribution de vos enregistrements.

## Avancé

La mécanique en dessous : votre identité en détail, les connexions
directes avec d’autres personnes, les réseaux où une construction peut
aller, et les outils expérimentaux. Rien de tout cela n’est nécessaire
pour jouer.

- **[La Vue du Monde : outils avancés](WorldViewAdvancedTools.md)** — ce
  qu’ajoute **Afficher les outils avancés** : inspecter les briques, les
  placements et pourquoi on peut placer la construction de n’importe qui,
  Rencontres dans le Monde, les noms de lieux découverts, les constructions
  déclarées et l’envoi de votre propre construction depuis **Mon Monde
  partagé**.
- **[Votre nom et votre identité](05-IdentityAndLogin.md)** — votre nom et
  l’identité cryptographique derrière lui, le coffre (verrouillage et déverrouillage), sa
  sauvegarde par export et import, et la gestion des identités depuis
  **Mes identités**.
- **[Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md)** —
  se connecter directement à d’autres personnes, mémoriser, devenir amis,
  suivre, bloquer, la reconnexion automatique et votre propre relais
  TURN.
- **[Chat et conversations](08-ChatAndConversations.md)** — la
  messagerie directe réservée aux amis, la remise hors ligne, les
  accusés de lecture et les appels vocaux.
- **[Enregistrements signés et preuves externes](09-PublicationsAndEvidence.md)** —
  la couche technique et facultative : revendications signées de
  paternité et de noms de lieux, la page Enregistrements signés, les commentaires,
  et ce que détient votre appareil (Snapshot local). Certaines parties de
  la page sont *expérimentales*, et marquées comme telles.
- **[Paramètres réseau](10-NetworkSettings.md)** — passerelles, relais,
  fournisseurs de stockage et d’annonce, et serveurs de connexion entre
  pairs. Ce dont chaque réseau a besoin est résumé dans
  [Distribuer votre travail](Distribution.md#ce-dont-chaque-réseau-a-besoin).
- **[Preuves et stockage](11-EvidenceAndStorage.md)** — stocker du contenu
  sur IPFS ou Arweave, les placements de snapshot, ancrer sur Arweave et,
  de façon *expérimentale*, les autres preuves externes, les parcours de
  portefeuille Bitcoin et Base, l’épinglage IPFS distant, Steem et Blurt.
  [Distribuer votre travail](Distribution.md) montre comment tout cela
  s’articule.
- **[Archive et succès](12-ArchiveAndAchievements.md)** —
  *expérimental*. L’archive des observations, les références entre
  enregistrements et les succès.

## Référence

- **[Distribuer votre travail](Distribution.md)** — tout ce que vous
  pouvez mettre sur des réseaux décentralisés (vos Mondes, vos
  revendications de paternité et de noms de lieux, vos commentaires, vos
  ancres), les trois rôles que joue un réseau (Contenu, Annonce /
  Découverte, Preuve / Ancrage), ce dont chaque réseau a besoin, et des
  liens vers les guides détaillés.
- **[FAQ](FAQ.md)** — des réponses courtes aux questions les plus
  fréquentes : le partage, les licences, une phrase secrète perdue,
  changer d’appareil, faire marcher votre avatar et se reconnecter à ses
  amis.
- **[Référence des commandes](ControlsReference.md)** — chaque
  interaction à la souris et au clavier dans l’Éditeur et la Vue du
  Monde, dans un seul tableau. Si cette page et la Palette de commandes
  de l’application (`Ctrl/Cmd+K`) ne sont pas d’accord, c’est la Palette
  qui a raison et cette page qui a un bug — merci de le signaler.
- **[Manipulateur de transformation interactif](InteractiveTransformGizmo.md)** —
  comment déplacer et faire pivoter votre sélection en la faisant
  glisser directement dans la vue : poignées, pivot, aimantation,
  validation, annulation, retour en arrière, et comportement des
  groupes.

## Où l’on construit, où l’on explore

L’Éditeur est le seul endroit où ForkBuild construit ; la Vue du Monde
est une surface d’exploration en lecture seule :

- **Éditeur** (**Construire** dans le menu) — votre espace de travail
  privé. Placez des briques depuis la Bibliothèque de construction,
  sélectionnez-les et déplacez-les ou tournez-les au clavier ou avec le
  manipulateur. Enregistrez, ouvrez et publiez des constructions depuis la
  barre d’outils.
- **Vue du Monde** (**Se promener** dans le menu, ou **Explorer** sur
  n’importe quelle construction) — le monde partagé. Marchez ou volez
  d’une construction publiée à l’autre, cherchez et explorez ce qui vous
  entoure, faites marcher votre avatar sur les bâtiments et le terrain, et
  utilisez **Modifier une copie** pour ouvrir dans l’Éditeur ce que vous
  avez trouvé, prêt à être développé.

Quoi que vous fassiez dans l’Éditeur, chaque modification est une étape
annulable, et `Ctrl/Cmd+Z` la défait.

## Collaboration et exploration

ForkBuild vous offre une collaboration incarnée et la découverte du
monde :

- **Marcher et naviguer** — utilisez les touches WASD pour faire marcher
  votre avatar sur les bâtiments et le terrain, sauter, grimper et
  explorer les espaces en hauteur.
- **Construire ensemble** — **Construire avec moi**, dans l’Éditeur, crée un
  lien qui ouvre votre construction dans l’Éditeur d’un ami, pour la
  construire ensemble, en direct, chacun voyant apparaître les briques de
  l’autre et l’endroit qu’il vise (voir
  [L’Éditeur](02-TheEditor.md#construire-avec-moi--construire-ensemble-en-direct)).
  Dans la Vue du Monde, voyez les avatars des autres bâtisseurs et ce sur
  quoi ils travaillent, puis utilisez **Modifier une copie** pour emporter
  dans l’Éditeur quelque chose que vous avez trouvé et le développer
  vous-même.
- **Découvrir le monde** — utilisez la boussole et ses repères de lieux
  contextuels pour trouver les structures proches et les éléments du
  terrain comme les forêts, les rivières et les prairies.
- **Suivre des collaborateurs** — verrouillez votre caméra pour suivre
  l’avatar de quelqu’un pendant qu’il se déplace dans le monde.

Tout ce que vous voyez découle de la graine déterministe du monde — le
terrain, l’écologie et l’hydrologie sont calculés de la même façon pour
tout le monde, ce qui crée un lieu partagé cohérent sans stocker de
données supplémentaires.

## Structures et plans réutilisables

Au-delà des briques individuelles, la Bibliothèque de construction de
l’Éditeur vous permet de construire avec des structures entières d’un
coup — vingt-deux structures prêtes à l’emploi réparties en cinq catégories,
plus tout ce que vous enregistrez vous-même :

- **Placez** une structure directement dans ce que vous construisez, ou
  **remixez**-la dans une toute nouvelle construction.
- **Enregistrez vos propres** constructions comme structures
  réutilisables dans **Mes structures**, votre bibliothèque personnelle
  de plans.
- **Exportez et importez** un plan sous forme de fichier portable pour
  le partager avec quelqu’un, ou l’emporter sur un autre appareil.

Voir [L’Éditeur](02-TheEditor.md#structures--composer-remixer-et-votre-bibliothèque-personnelle)
pour la présentation complète.
