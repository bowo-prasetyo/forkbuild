<!-- translation-of: docs/user/README.md source-hash: d9d89f42b403877b -->
# Documentation utilisateur de ForkBuild

<!-- languages -->
[English](../README.md) · [Deutsch](../de/README.md) · [Español](../es/README.md) · **Français** · [Bahasa Indonesia](../id/README.md) · [日本語](../ja/README.md) · [한국어](../ko/README.md) · [Português (Brasil)](../pt-BR/README.md)
<!-- /languages -->

Guides pratiques pour utiliser ForkBuild dans le navigateur. Tout ce qui
se trouve ici décrit le produit tel qu’il fonctionne aujourd’hui ; le
fonctionnement interne du moteur est décrit dans
[docs/Architecture.md](../../Architecture.md) (en anglais) et dans le
reste du dossier [docs/](../..) de premier niveau.

## Pour commencer (à lire dans l’ordre)

1. **[Premiers pas](01-GettingStarted.md)** — ouvrir l’application, se
   connecter et placer votre première brique.
2. **[L’Éditeur](02-TheEditor.md)** — la boîte à outils de construction :
   outils, sélection, transformations, couleurs des briques, groupes, les
   structures de la Bibliothèque de construction et vos propres plans,
   les instances de structure, et le titre, la description et la licence
   d’une création.
3. **[La Vue du Monde](03-WorldView.md)** — l’espace 3D partagé, en
   lecture seule, où vit chaque création publiée : se déplacer, trouver
   et inspecter des choses, **Modifier une copie** pour emporter quelque
   chose dans l’Éditeur, les Rencontres dans le Monde partagées par vos
   pairs, distribuer votre propre publication depuis **Mon Monde
   partagé**, les commentaires et les notifications.
4. **[Publier et forker](04-PublishingAndForking.md)** — la publication,
   les licences, les forks, le catalogue du Dépôt, et la distribution
   d’une publication directement depuis l’Éditeur. Pour tout ce que vous
   pouvez distribuer et où, voir [Distribuer votre travail](Distribution.md).
5. **[Identité et connexion](05-IdentityAndLogin.md)** — votre identité
   cryptographique, le coffre (verrouillage et déverrouillage), sa
   sauvegarde par export et import, et la gestion des identités depuis
   **Mes identités**.
6. **[Avatars et présence](06-AvatarsAndPresence.md)** — personnaliser
   votre avatar, qui peut vous voir, marcher, les perspectives de caméra,
   les véhicules, les animaux et votre inventaire.
7. **[Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md)** —
   se connecter directement à d’autres personnes, mémoriser, devenir amis,
   suivre, bloquer, la reconnexion automatique et votre propre relais
   TURN.
8. **[Chat et conversations](08-ChatAndConversations.md)** — la
   messagerie directe réservée aux amis, la remise hors ligne, les
   accusés de lecture et les appels vocaux.
9. **[Publications et preuves externes](09-PublicationsAndEvidence.md)** —
   la couche technique et facultative : revendications signées de
   paternité et de noms de lieux, la page Publications, les commentaires,
   et ce que détient votre appareil (Snapshot local). Certaines parties de
   la page sont *expérimentales*, et marquées comme telles.
10. **[Paramètres réseau](10-NetworkSettings.md)** — passerelles, relais,
    fournisseurs de stockage et d’annonce, et serveurs de connexion entre
    pairs. Ce dont chaque réseau a besoin est résumé dans
    [Distribuer votre travail](Distribution.md#ce-dont-chaque-réseau-a-besoin).
11. **[Preuves et stockage](11-EvidenceAndStorage.md)** — stocker du
    contenu sur IPFS ou Arweave, ancrer sur Arweave et, de façon
    *expérimentale*, les autres preuves externes, les parcours de portefeuille Bitcoin et Base, les placements
    de snapshot, l’épinglage IPFS distant, Steem et Blurt.
    [Distribuer votre travail](Distribution.md) montre comment tout cela
    s’articule.
12. **[Archive et classements](12-ArchiveAndLeaderboards.md)** —
    *expérimental*. L’archive des observations, les références entre
    publications, les succès, les étiquettes d’éditeur et les pages de
    Classement.
13. **[Vos données](13-YourData.md)** — sauvegarder tout ce que ce
    navigateur contient dans un seul fichier chiffré et le restaurer, les
    exports plus restreints, et où cet appareil a enregistré la
    distribution de vos publications.

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

- **Éditeur** (`/editor`) — votre espace de travail privé. Placez des
  briques depuis la palette, sélectionnez-les et transformez-les au
  clavier ou avec le manipulateur. Enregistrez, chargez et publiez des
  documents depuis la barre d’outils.
- **Vue du Monde** (`/world/:id`) — le monde spatial partagé. Passez
  d’un monde publié à l’autre, cherchez et explorez ce qui vous entoure,
  inspectez les briques et les structures placées, faites marcher votre
  avatar sur les structures et le terrain, et utilisez **Modifier une
  copie** pour ouvrir dans l’Éditeur ce que vous avez trouvé, prêt à être
  développé.

Quoi que vous fassiez dans l’Éditeur, chaque modification est une étape
annulable, et `Ctrl/Cmd+Z` la défait.

## Collaboration et exploration

ForkBuild vous offre une collaboration incarnée et la découverte du
monde :

- **Marcher et naviguer** — utilisez les touches WASD pour faire marcher
  votre avatar sur les bâtiments et le terrain, sauter, grimper et
  explorer les espaces en hauteur.
- **Construire ensemble** — voyez les avatars des autres bâtisseurs et
  comprenez sur quoi ils travaillent grâce à la conscience spatiale, puis
  utilisez **Modifier une copie** pour emporter dans l’Éditeur quelque
  chose que vous avez trouvé et le développer vous-même.
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
coup — vingt structures prêtes à l’emploi réparties en cinq catégories,
plus tout ce que vous enregistrez vous-même :

- **Placez** une structure directement dans ce que vous construisez, ou
  **forkez**-la dans un tout nouveau document.
- **Enregistrez vos propres** constructions comme structures
  réutilisables dans **Mes structures**, votre bibliothèque personnelle
  de plans.
- **Exportez et importez** un plan sous forme de fichier portable pour
  le partager avec quelqu’un, ou l’emporter sur un autre appareil.

Voir [L’Éditeur](02-TheEditor.md#structures--composer-forker-et-votre-bibliothèque-personnelle)
pour la présentation complète.
