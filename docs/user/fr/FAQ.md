<!-- translation-of: docs/user/FAQ.md source-hash: 781eb04573741493 -->
# Questions fréquentes

<!-- languages -->
[English](../FAQ.md) · [Deutsch](../de/FAQ.md) · [Español](../es/FAQ.md) · **Français** · [Bahasa Indonesia](../id/FAQ.md) · [日本語](../ja/FAQ.md) · [한국어](../ko/FAQ.md) · [Português (Brasil)](../pt-BR/FAQ.md)
<!-- /languages -->

Des réponses courtes aux questions les plus fréquentes, chacune renvoyant
vers le guide qui l’explique en détail.

## Se repérer

### Où sont passés l’Éditeur, le Dépôt et Se connecter ?

Ils ont été renommés dans le menu. **Construire** ouvre l’Éditeur,
**Explorer** est l’ancien Dépôt, et **Choisir un nom** (ou votre nom, une
fois que vous en avez un) remplace Se connecter. **Se promener** ouvre le
Monde sur la place du défi de la semaine. Voir
[Se repérer](01-GettingStarted.md#se-repérer).

### Je ne trouve pas Mon avatar, Pairs ou Paramètres réseau

Ils sont sous **Plus** dans la barre du haut (sur un téléphone, sous
**Menu**) : **Vous** contient Mon avatar, Mes identités et Vos données ;
**Personnes** contient Pairs, Abonnements et Conversations ; **Avancé**
contient Publications et Paramètres réseau. Cliquer sur votre nom en haut à
droite ouvre aussi Mon avatar, Mes identités et Vos données.

## Publier et partager

### J’ai publié ma construction, mais mon ami ne la trouve pas dans Explorer

Sauf si vous avez choisi **Tout le monde** quand Publier a demandé
[Qui peut la trouver ?](04-PublishingAndForking.md#qui-peut-la-trouver-),
publier ne fait que stocker la construction sur votre propre appareil et la
lister dans *votre* **Explorer**. Pour qu’elle arrive à votre ami :

- **Envoyez le lien.** Publier affiche **Copier le lien** (et
  **Partager…** là où votre appareil sait partager) ; la construction
  voyage dans le lien, votre ami peut donc l’ouvrir sur n’importe quel
  appareil. Voir [Partager un lien](04-PublishingAndForking.md#partager-un-lien).
- **Laissez tout le monde la trouver.** Cliquez sur **Laisser tout le
  monde la trouver** dans le message qui suit la publication : elle
  apparaît dans l’**Explorer** de chacun, dans le défi et dans le Monde.
- **Partager avec les pairs**, sous votre construction dans **Explorer**,
  la propose aux personnes auxquelles vous êtes connecté. L’appareil d’un
  Ami ou d’un Pair connu l’ajoute de lui-même ; les autres la voient sous
  **Partagés avec vous** et cliquent sur **Récupérer**. Vous devez être
  connectés en même temps pour qu’elle arrive.
- **Distribuer** l’envoie sur Arweave ou IPFS (ou, de façon
  expérimentale, sur Steem ou Blurt) et l’annonce, pour qu’on puisse la trouver
  sans être connecté à vous.

Voir [Publier et remixer](04-PublishingAndForking.md#partager-avec-les-pairs-connectés).

### Comment rendre mon travail accessible à tous ?

Choisissez **Tout le monde** quand Publier demande
[Qui peut la trouver ?](04-PublishingAndForking.md#qui-peut-la-trouver-)
(ou cliquez sur **Laisser tout le monde la trouver** après la
publication). Chaque construction que vous publiez est alors envoyée à tout
le monde et apparaît dans **Explorer**, dans le défi de la semaine et dans
le Monde, sans rien à installer.

Pour garder en plus une copie sur un réseau de stockage décentralisé,
distribuez-la : stockez-la sur Arweave ou IPFS (ou, de façon
expérimentale, sur Steem ou Blurt) et annoncez-la sur Nostr ou Arweave (ou
Steem ou Blurt). Il vous faut alors une extension de navigateur capable de
signer pour les réseaux choisis, comme Wander pour Arweave ou nos2x pour
Nostr.
[Distribuer votre travail](Distribution.md) liste tout ce que vous pouvez
distribuer, où, et ce dont chaque réseau a besoin.

### Pourquoi personne ne peut-il forker ma création ?

Un nouveau document n’a pas de licence, et une création sans licence ne
peut pas être forkée. Ouvrez **Propriétés du document** (le **✎** à côté
du titre du document dans l’Éditeur), choisissez une licence qui autorise
les forks (n’importe quelle licence CC sauf CC BY-ND), et publiez de
nouveau. Le réglage fait partie de ce qui est publié, les créations déjà
publiées gardent donc la licence qu’elles avaient. Voir
[Choisir une licence](04-PublishingAndForking.md#choisir-une-licence).

### La publication a échoué. Que veulent dire les messages ?

- **a title is required before publishing** — donnez un titre à la
  création dans **Propriétés du document**.
- **cannot publish an empty world** — placez d’abord au moins une brique.
- **cannot sign, identity is locked** — votre identité s’est verrouillée
  d’elle-même ; cliquez sur **Déverrouiller** à côté de votre nom dans la
  barre du haut et publiez de nouveau.

Ces messages sont aujourd’hui affichés en anglais.

### Faut-il un nom pour publier ?

En pratique, oui. Publier vous demande d’en choisir un, ce qui prend
quelques secondes et ne demande aucun compte. **Publier sans signer**, dans
cette fenêtre, publie sans nom, mais le résultat n’a ni auteur ni
signature : il n’obtient pas de lien, et vous ne pouvez ni le partager avec
des pairs ni l’envoyer à tout le monde plus tard. Voir
[Choisir un nom](01-GettingStarted.md#choisir-un-nom).

### Puis-je dépublier quelque chose ?

Oui : ouvrez le Monde dans la Vue du Monde, puis dans **Mon Monde
partagé** choisissez **Plus ▾ → Dépublier…**. Cela le retire de votre
**Explorer**. Cela ne peut pas rappeler les copies que d’autres ont déjà reçues
ni ce que vous avez distribué sur Arweave, IPFS, Nostr, Steem ou Blurt. Cet appareil se souvient toutefois de ce que
vous avez dépublié : la recherche d’**Explorer** sur les réseaux n’affichera plus
ces copies ici ; d’autres appareils et d’autres personnes peuvent encore les
trouver.

### Quelqu’un a placé ma construction dans son Monde. A-t-il déplacé la mienne ?

Non. Un placement indique seulement où *son* Monde affiche votre
construction ; la vôtre reste là où vous l’avez mise, et la construction
garde votre nom et son historique. Si vous ne voulez pas de cela,
choisissez **Moi seul peux le placer** sous **Qui peut le placer dans le
Monde** avant de publier. Voir
[Pourquoi puis-je placer les constructions des autres ?](WorldViewAdvancedTools.md#pourquoi-puis-je-placer-les-constructions-des-autres-).

### Pourquoi deux constructions se trouvent-elles au même endroit ?

Un placement ne revendique pas de terrain, et il n’y a pas de serveur
central pour dire qui a eu un endroit en premier : deux placements peuvent
donc désigner le même point. Vous êtes prévenu avant de déplacer l’un des
vôtres sur un endroit occupé. Voir
[Pourquoi deux constructions peuvent-elles se trouver au même endroit ?](WorldViewAdvancedTools.md#pourquoi-deux-constructions-peuvent-elles-se-trouver-au-même-endroit-).

## Identité et données

### J’ai oublié ma phrase secrète. Peut-elle être réinitialisée ?

Non. La phrase secrète est le seul moyen de déchiffrer la clé de cette
identité, et aucun serveur n’en détient de copie. Si vous avez exporté
l’identité, il vous faut quand même la phrase secrète choisie pour
l’export. Sinon, créez une nouvelle identité. Voir
[Votre nom et votre identité](05-IdentityAndLogin.md).

### Pourquoi mon identité se verrouille-t-elle sans cesse ?

Une identité protégée se verrouille **15 minutes après son
déverrouillage**, même si vous êtes en train d’utiliser l’application, et
à chaque rechargement de la page. Construire et enregistrer continuent de
fonctionner pendant qu’elle est verrouillée ; publier, être découvrable et
rejoindre un salon demandent de la déverrouiller de nouveau.

### Comment déplacer mon travail vers un autre ordinateur ou navigateur ?

Rien ne se synchronise de soi-même. Pour tout copier, cliquez sur
**Afficher un code** dans **Vos données**, sous **Copier vers un autre
appareil**, et scannez le code avec l’autre appareil (ou ouvrez-y son lien)
pendant que les deux sont en ligne. Ou faites-y une sauvegarde et restaurez
le fichier sur l’autre appareil (voir [Vos données](13-YourData.md)). Pour déplacer un seul type
de chose :

- **Documents** : **Exporter** dans la barre d’outils de l’Éditeur, ou
  **Exporter toutes les constructions** en bas de **Récents**, puis **Importer**
  sur l’autre appareil.
- **Vos propres structures** : **Exporter le plan** depuis le menu **⋮**
  d’une carte, ou **Tout exporter** à côté de **Mes structures**, puis
  **Importer un plan**.
- **Identités** : **Exporter** dans **Mes identités**, puis **Importer une
  identité**.

L’historique du chat, les amis et les réglages ne se déplacent qu’avec une
sauvegarde complète.

### Effacer les données de mon navigateur supprimera-t-il mon travail ?

Oui. Les documents, identités, amis et l’historique du chat se trouvent
tous dans le stockage de ce navigateur pour ce site, et l’effacer les
supprime définitivement. Sauvegardez-les d’abord avec **Vos données →
Sauvegarder dans un fichier**, et gardez en sécurité le fichier et sa
phrase secrète ; **Restaurer**, sur la même page, remet tout en place.
ForkBuild vous prévient quand la dernière sauvegarde est ancienne, et dans
Chrome ou Edge sur ordinateur il peut sauvegarder automatiquement chaque
jour dans un dossier synchronisé par votre stockage en ligne. Voir
[Vos données](13-YourData.md) et [Confidentialité](Privacy.md).

### Puis-je renommer ou supprimer une identité ?

Non. Les identités sont faites pour durer. Pour arrêter d’en utiliser
une, déclarez un successeur ou révoquez-la dans **Mes identités**.

### J’ai révoqué mon identité, alors pourquoi puis-je encore l’utiliser ?

C’est normal. Révoquer empêche l’identité de signer quoi que ce soit de
nouveau, y compris ce dont elle a besoin pour se connecter à d’autres
personnes, mais vous pouvez encore la choisir sur cet appareil. Vous pouvez
ainsi encore la consulter ou l’exporter. Elle affiche **Révoquée** dans
**Mes identités**, et la révocation ne peut jamais être annulée. Créez une
nouvelle identité pour continuer à travailler. Voir
[Ce que fait la révocation — et ce qu’elle ne fait pas](05-IdentityAndLogin.md#ce-que-fait-la-révocation--et-ce-quelle-ne-fait-pas).

### Pourquoi une ancienne copie de ForkBuild n’ouvre-t-elle pas mon document exporté ?

Les documents sont désormais enregistrés dans un format plus récent et
plus compact. ForkBuild 1.0.0 et les versions antérieures ne savent pas le
lire : mettez d’abord à jour l’autre copie. Les fichiers exportés par les
anciennes versions s’ouvrent toujours ici.

## La Vue du Monde et votre avatar

### WASD ne fait pas bouger mon avatar

La marche est active à l’ouverture de la Vue du Monde, avec ou sans
nom : qui n’a pas encore de nom marche en invité, visible seulement sur son
propre écran. Si les touches ne font pas bouger votre avatar :

1. Dans **Réglages de l’avatar** de la Vue du Monde, vérifiez que
   **Contrôler mon avatar (WASD, Maj, Espace)** est coché.
2. Cliquez dans la vue 3D, pour que les touches n’aillent pas dans un
   champ de texte.

Sur un clavier AZERTY, ce sont les touches marquées W, A, S et D qui
comptent, pas Z, Q, S et D. Sur un écran tactile, touchez plutôt
**Marcher** au-dessus du joystick. Voir
[Faire marcher votre avatar](06-AvatarsAndPresence.md#faire-marcher-votre-avatar).

### Qui peut voir mon avatar ?

Par défaut, toute personne à laquelle vous êtes connecté : **Visibilité
de la présence** et **Visibilité du profil** commencent toutes deux sur
**Public**. Changez-les dans **Mon avatar** ; **Masqué** vous rend
invisible. Voir
[Qui peut vous voir](06-AvatarsAndPresence.md#qui-peut-vous-voir--deux-réglages-indépendants).

### L’onglet du navigateur s’est fermé pendant que je conduisais un véhicule

**Ctrl** est le frein et **W** accélère, et sous Windows et Linux la
plupart des navigateurs ferment l’onglet avec **Ctrl+W**. Relâchez **W**
avant de freiner.

### Puis-je modifier quoi que ce soit dans la Vue du Monde ?

Seulement les annotations : points de repère, noms de régions et
décorations animales. On construit dans l’Éditeur ; utilisez **Modifier
une copie** pour y emporter ce que vous regardez. Voir
[Vue du Monde](03-WorldView.md#modifier-une-copie--emporter-quelque-chose-dans-léditeur).

## Pairs, amis et chat

### Je fais tourner ForkBuild moi-même et je ne trouve personne

Le serveur de rendez-vous par défaut ne répond qu’au site hébergé, une
copie servie depuis votre propre adresse (y compris `localhost`) ne peut
donc pas l’utiliser. Connectez-vous par invitation (**Pairs → Se
connecter avec quelqu’un de nouveau → Inviter**), ou ajoutez votre propre
serveur de rendez-vous sous **Paramètres réseau → Serveurs de
rendez-vous**. Voir
[Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md).

### Mon ami ne se reconnecte pas automatiquement

La reconnexion automatique ne concerne que les personnes que vous avez
**Mémorisées** (Pairs connus), et ne les trouve que lorsqu’elles sont
**découvrables**. Un Ami que vous n’avez pas mémorisé affiche plutôt un
bouton **Se reconnecter**. Choisissez **Mémoriser** dans son menu **⋯**,
et cliquez tous les deux sur **Être découvrable**.

### Mon message indique toujours « En file d’attente »

Les messages attendent sur votre appareil, pas sur un serveur : ils ne
sont donc remis que lorsque ForkBuild est ouvert des deux côtés et que
vous êtes connectés. Un message non remis dans les 7 jours est abandonné
et marqué **Non remis — expiré**. Voir
[Chat et conversations](08-ChatAndConversations.md#envoyer-pendant-que-quelquun-est-hors-ligne).

### Pourquoi ne puis-je pas discuter avec quelqu’un à qui je suis connecté ?

Le chat et les appels vocaux sont réservés aux amis. Cliquez sur
**Ajouter comme ami** sur sa ligne dans **Pairs** ; une fois qu’il
accepte, un bouton **Discuter** apparaît.

### J’ai changé un Paramètre réseau mais rien n’a changé

Les paramètres réseau (serveurs, relais, passerelles) sont lus au
démarrage de l’application. Rechargez la page après avoir enregistré.
Voir [Paramètres réseau](10-NetworkSettings.md).

## Appareils et navigateurs

### ForkBuild fonctionne-t-il sur un téléphone ou une tablette ?

Oui. Les deux vues ont des commandes tactiles, et sur un écran étroit le
menu et les panneaux latéraux se replient. Voir
[Écrans tactiles](ControlsReference.md#écrans-tactiles).

### ForkBuild fonctionne-t-il hors ligne ? Puis-je l’installer ?

Oui, sur le site hébergé. Après votre première visite, ForkBuild s’ouvre
sans connexion, et **Installer ForkBuild** sur l’écran d’Accueil l’ajoute
à votre appareil comme application. Construire, enregistrer, vos
constructions enregistrées et les constructions toutes prêtes fonctionnent
hors ligne ; trouver des constructions et des personnes, distribuer et le
chat ont besoin d’une connexion. Voir
[Installer ForkBuild](01-GettingStarted.md#installer-forkbuild).

### Puis-je imprimer ma construction en 3D, ou l’ouvrir dans Blender ?

Oui. **Fichier → Modèle 3D** dans la barre d’outils de l’Éditeur la télécharge en STL
pour l’impression 3D (en millimètres, posée sur le plateau) ou en glTF ou
OBJ en couleur pour Blender et d’autres logiciels. Voir
[Télécharger un modèle 3D](02-TheEditor.md#télécharger-un-modèle-3d).

### Ai-je besoin d’un portefeuille crypto ?

Non. Construire, enregistrer, publier, partager un lien, envoyer une
construction à tout le monde, remixer, les pairs et le chat n’en ont pas
besoin. Un portefeuille ou une extension de signature n’est nécessaire que
si vous choisissez de distribuer vous-même une construction sur un réseau
de stockage (Arweave demande un portefeuille Arweave comme Wander ; Nostr,
une extension de signature comme nos2x), et pour les fonctions
expérimentales d’ancrage de [Preuves et stockage](11-EvidenceAndStorage.md).
