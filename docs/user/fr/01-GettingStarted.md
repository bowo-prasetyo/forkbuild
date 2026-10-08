<!-- translation-of: docs/user/01-GettingStarted.md source-hash: 2d3a98acb2272855 -->
# 01 — Premiers pas

<!-- languages -->
[English](../01-GettingStarted.md) · [Deutsch](../de/01-GettingStarted.md) · [Español](../es/01-GettingStarted.md) · **Français** · [Bahasa Indonesia](../id/01-GettingStarted.md) · [日本語](../ja/01-GettingStarted.md) · [한국어](../ko/01-GettingStarted.md) · [Português (Brasil)](../pt-BR/01-GettingStarted.md)
<!-- /languages -->

Bienvenue ! Ce guide vous amène de « je viens d’ouvrir l’application » à
« j’ai construit quelque chose » en cinq minutes environ.

## Ouvrir ForkBuild

ForkBuild fonctionne dans n’importe quel navigateur web récent. Ouvrez
l’URL hébergée et vous arrivez sur l’écran **Accueil**. Pour faire tourner
votre propre copie, servez le dossier en HTTP (par exemple
`python3 -m http.server 8000`, puis ouvrez <http://localhost:8000/>) :
ouvrir `index.html` directement depuis le disque ne fonctionne pas, car les
navigateurs ne chargent pas ses modules depuis une page `file://`. Le
serveur de rendez-vous par défaut ne sert que le site hébergé, votre propre
copie ne peut donc pas l’utiliser pour trouver des personnes ; connectez-vous
plutôt par invitation, ou installez votre propre serveur de rendez-vous
(voir [Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md)).

L’écran **Accueil** montre un petit village qui tourne en 3D et propose
trois façons de commencer : **Essayez maintenant : commencez par une
maison** ouvre une maison toute prête dans l’Éditeur comme votre propre
copie, prête à être modifiée ; **Partir de zéro** ouvre l’Éditeur sur un
terrain vide ; et **Découvrir des constructions** ouvre le Dépôt. Sous
**Partir d’une construction toute prête**, chaque carte (un château fort,
une île du port, une place du village, une maison, un moulin et un pont)
ouvre de la même façon votre propre copie de cette construction ; le
Dépôt, Mes mondes et **Nouveau** dans l’Éditeur proposent les mêmes
constructions. Rien n’est publié ni envoyé nulle part tant que vous ne le
décidez pas.

La barre du haut est toujours visible :

`ForkBuild Accueil Éditeur Dépôt Mes mondes Plus ▾ 🔔 [Se connecter]`

- **Accueil** — la page d’arrivée
- **Éditeur** — là où vous construisez
- **Dépôt** — parcourir les créations publiées par tout le monde
- **Mes mondes** — les Mondes que vous avez réellement visités sur cet
  appareil, voir
  [Mes mondes](03-WorldView.md#mes-mondes--les-mondes-où-vous-êtes-vraiment-allé)

**Plus** ouvre le reste, en quatre groupes : **Vous** (Mon avatar, Mes identités,
Vos données), **Personnes** (Pairs, Abonnements, Conversations), **Réseau**
(Publications, Paramètres réseau) et **Application** (Langue, À propos, et **Installer ForkBuild** là où le navigateur peut l’installer). Sur un téléphone,
**Menu** les affiche tous d’un coup.

- **Mon avatar** — votre apparence pour les autres dans la Vue du Monde,
  voir [Avatars et présence](06-AvatarsAndPresence.md)
- **Mes identités** — les identités cryptographiques stockées sur cet
  appareil, voir [Identité et connexion](05-IdentityAndLogin.md)
- **Pairs** — les personnes avec qui vous êtes connecté, que vous
  connaissez ou dont vous êtes ami, voir
  [Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md)
- **Conversations** — vos messages directs, voir
  [Chat et conversations](08-ChatAndConversations.md)
- **Publications** — les revendications signées de paternité et de noms
  de lieux, où les stocker et les annoncer, et (*expérimental*) leurs
  preuves externes, voir
  [Publications et preuves externes](09-PublicationsAndEvidence.md)
- **Paramètres réseau** — passerelles, relais, fournisseurs et serveurs de
  connexion entre pairs, voir [Paramètres réseau](10-NetworkSettings.md)
- **Langue** — la langue dans laquelle ForkBuild s’affiche sur cet
  appareil. Elle suit les langues de votre navigateur tant que vous n’en
  choisissez pas une ; enregistrer recharge la page, alors enregistrez
  d’abord votre travail. ForkBuild existe en anglais, allemand, espagnol,
  français, bahasa indonesia, japonais, coréen et portugais du Brésil (voir
  [Translating ForkBuild](../../Translating.md), en anglais).
- **À propos** — informations de version

## Installer ForkBuild

ForkBuild peut s’installer comme une application : il s’ouvre alors depuis
votre écran d’accueil, le dock ou la liste des applications, dans sa propre
fenêtre, et fonctionne sans connexion. Cliquez sur **Installer ForkBuild**
sur l’écran d’Accueil (ou sous **Plus**), puis confirmez dans la boîte de
dialogue du navigateur. Dans Safari sur iPhone ou iPad, le bouton indique
plutôt comment faire : touchez **Partager**, puis **Sur l’écran
d’accueil**. Là où le navigateur ne peut pas installer d’applications, ou
si ForkBuild est déjà installé, le bouton n’apparaît pas.

- **Hors ligne.** La première fois que vous ouvrez ForkBuild, votre
  navigateur garde ses fichiers : il s’ouvre ensuite sans connexion,
  installé ou non. L’Accueil, l’Éditeur, vos constructions enregistrées et
  les constructions toutes prêtes fonctionnent. Ce qui a besoin du réseau
  (trouver des constructions et des personnes, distribuer, le chat et les
  appels) attend votre retour en ligne.
- **Mises à jour.** Quand une nouvelle version sort, une ligne en haut
  indique **Une nouvelle version de ForkBuild est prête** ; cliquez sur
  **Recharger** pour la lancer, sinon elle se lance d’elle-même la
  prochaine fois que vous ouvrez ForkBuild.
- **Notifications.** Un ForkBuild installé (ou ouvert dans un onglet en
  arrière-plan) peut afficher vos notifications via votre appareil ; voir
  [Notifications sur cet appareil](03-WorldView.md#notifications-sur-cet-appareil).

Cela concerne le site hébergé. Une copie lancée directement depuis le
dossier (comme ci-dessus) ne s’installe pas et ne fonctionne pas hors
ligne ; une copie construite avec `node scripts/build.mjs`, si (voir
[Déploiement](../../Deployment.md)).

## Se connecter

Vous n’avez pas besoin de vous connecter pour commencer à construire. La
première fois que vous cliquez sur **Publier**, ForkBuild vous demande de
vous connecter, ou de créer une identité sur place, car publier signe votre
création. Vous pouvez aussi vous connecter à tout moment :
Cliquez sur **Se connecter** en haut à droite. ForkBuild n’utilise ni mot
de passe ni compte central — **votre identité est une paire de clés
cryptographiques stockée sur cet appareil**. La boîte de dialogue de
connexion liste toutes les identités que ce navigateur détient déjà ;
cliquez sur l’une d’elles pour l’utiliser, ou créez-en une nouvelle :

1. Saisissez un **nom affiché** — c’est ce que les autres verront.
2. Saisissez deux fois une **phrase secrète** d’au moins 8 caractères.
   Elle chiffre votre clé sur cet appareil, et il n’y a pas de
   réinitialisation : choisissez-en une que vous garderez. (Pour vous en
   passer, cochez **Créer sans phrase secrète** ; la clé est alors stockée
   non chiffrée dans ce navigateur.)
3. Cliquez sur **Créer et se connecter**.

C’est tout — vous êtes maintenant connecté, et tout ce que vous
construisez, publiez ou envoyez est signé avec cette identité.

Ce que protège une phrase secrète, le verrouillage et le déverrouillage,
et la sauvegarde de votre identité sont expliqués dans
[Identité et connexion](05-IdentityAndLogin.md).

## Faire le tour

ForkBuild comporte plusieurs grandes parties :

| Partie | À quoi elle sert |
|---|---|
| **Éditeur** | Construire et modifier vos propres créations |
| **Dépôt** | Rechercher, parcourir, ouvrir, forker et explorer les créations publiées |
| **Page d’auteur** | Voir tout ce qu’une personne a créé (s’ouvre en cliquant sur le nom d’un auteur) |
| **Vue du Monde** | Parcourir le monde partagé où toutes les créations vivent dans l’espace 3D, et chercher ou explorer pour trouver des choses |
| **Mon avatar / Pairs / Conversations** | Votre apparence pour les autres, les personnes avec qui vous êtes connecté et vos messages directs — voir les guides ci-dessus |

## Placer votre première brique

La première fois que vous ouvrez l’Éditeur, une carte **Votre première
construction** dans le coin de la vue 3D vous guide en cinq étapes et coche
chacune dès que vous l’avez faite. Voir
[Votre première construction](02-TheEditor.md#votre-première-construction).

1. Cliquez sur **Éditeur** dans la barre du haut.
2. Dans la barre latérale gauche, vérifiez que l’outil **Placement** est
   actif (appuyez sur `2`).
3. Dans la **Bibliothèque de construction** en dessous, ouvrez l’onglet
   **Briques** et cliquez sur une brique — par exemple **Cube** sous
   **Base**.
4. Déplacez la souris dans la vue 3D. Un **fantôme** translucide de la
   brique suit la grille.
5. **Cliquez** pour la placer.

Félicitations — vous avez construit votre première brique ! 🎉

### Empiler des briques

Vous n’êtes pas obligé de construire au sol. Survolez une **face** d’une
brique existante et le fantôme s’y aimante — cliquez pour empiler dessus,
ou pour l’accrocher sur le côté. C’est ainsi qu’on construit murs, tours
et toits.

## Enregistrer votre travail

Appuyez sur **Ctrl+S** (ou cliquez sur **Enregistrer** dans la barre
d’outils). L’indicateur **● Modifications non enregistrées** devient
**Enregistré**.

Votre création est stockée dans votre navigateur, elle est donc toujours
là quand vous revenez. Pendant que vous modifiez, ForkBuild garde aussi une
copie de récupération des modifications non enregistrées, et propose de la
restaurer si la page se ferme avant que vous enregistriez.

Les navigateurs limitent ce que chaque site peut stocker, en général à une
part du disque. Si la part de ForkBuild est pleine, l’enregistrement et la
récupération après plantage s’arrêtent avec un message qui le dit ; rien
de ce que vous avez ouvert n’est perdu. Utilisez **Exporter** dans la barre
d’outils pour garder une copie du document dans un fichier. Au premier
enregistrement, certains navigateurs demandent si ForkBuild peut conserver
ses données de façon permanente ; l’accepter empêche le navigateur de les
effacer quand le disque manque d’espace.

Vous n’avez pas besoin d’être connecté pour construire. La connexion
compte dès que vous publiez ou travaillez avec d’autres personnes : une
création publiée sans être connecté n’a ni auteur ni signature, elle ne
peut donc pas être partagée avec des pairs ni distribuée plus tard, et
n’obtient pas de lien. Publier vous demande d’abord de vous connecter.

## Et ensuite ?

- Découvrez toute la boîte à outils de construction dans
  **[L’Éditeur](02-TheEditor.md)**.
- Prêt à partager ? Passez à **[Publier et forker](04-PublishingAndForking.md)**.
- Configurez votre identité, votre avatar et vos connexions dans
  **[Identité et connexion](05-IdentityAndLogin.md)**,
  **[Avatars et présence](06-AvatarsAndPresence.md)** et
  **[Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md)**.
