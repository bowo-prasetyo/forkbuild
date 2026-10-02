<!-- translation-of: docs/user/07-PeerConnectionsAndFriends.md source-hash: 25e078a7afa72b20 -->
# 07 — Connexions entre pairs et amis

<!-- languages -->
[English](../07-PeerConnectionsAndFriends.md) · [Deutsch](../de/07-PeerConnectionsAndFriends.md) · [Español](../es/07-PeerConnectionsAndFriends.md) · **Français** · [Bahasa Indonesia](../id/07-PeerConnectionsAndFriends.md) · [日本語](../ja/07-PeerConnectionsAndFriends.md) · [한국어](../ko/07-PeerConnectionsAndFriends.md) · [Português (Brasil)](../pt-BR/07-PeerConnectionsAndFriends.md)
<!-- /languages -->

ForkBuild vous connecte directement aux navigateurs des autres personnes
— aucun serveur central ne détient de liste d’amis. Ouvrez **Pairs** dans
la barre du haut pour gérer les personnes avec qui vous êtes connecté, que
vous connaissez et dont vous êtes ami.

## La page en un coup d’œil

```
Pairs                                   Votre ID …N6KbN  [Copier l’ID complet]

Demande votre attention   connexions qui vous attendent, demandes d’ami
Personnes  [Tous|Amis|Suivi|En ligne]   une ligne par personne
Se connecter avec quelqu’un de nouveau
  [Inviter|Coller une invitation|Chercher par ID|Salon public]
▸ Bloqués (N)             seulement si vous avez bloqué quelqu’un
```

- **Demande votre attention** n’apparaît que si quelque chose attend :
  une connexion en cours (avec son étape, par exemple « étape 2 sur 5 :
  Connexion WebRTC »), une connexion qui attend que vous colliez la
  réponse de l’autre côté, une connexion échouée à ignorer, ou quelqu’un
  qui demande à devenir votre ami (**Accepter** / **Refuser**).
- **Personnes** a une ligne par personne, quel que soit le nombre de
  choses que vous savez sur elle. Des étiquettes disent ce qu’elle est
  pour vous — **Ami**, **Mémorisé**, **Suivi**, **Bloqué**, **Demande
  envoyée**, **Veut devenir ami** — et un point vert signifie en ligne.
  Les personnes en ligne viennent d’abord, puis les amis, puis tous les
  autres. Chaque ligne a son action principale (**Discuter** pour un ami,
  **Se reconnecter** quand il est hors ligne, **Ajouter comme ami** pour
  quelqu’un avec qui vous êtes connecté), et le menu **⋯** contient le
  reste : **Renommer** (ou **Nommer et mémoriser**), **Mémoriser** /
  **Oublier**, **Retirer des amis**, **Suivre** / **Ne plus suivre**,
  **Détails de la connexion**, **Déconnecter**, et **Bloquer** /
  **Débloquer**. Le filtre **Suivi** affiche les personnes d’ici que vous
  suivez.
- **Bloqués** est replié en bas et n’apparaît que si vous avez bloqué
  quelqu’un.

Derrière la liste se trouvent cinq registres indépendants — les
connexions en direct, les Pairs connus (les personnes que vous avez
choisi de **Mémoriser**, une note privée jamais partagée avec elles), les
Amis (mutuels et signés), les Abonnements (voir
[Suivre des personnes](#suivre-des-personnes)) et les Bloqués. Une
personne peut être Ami sans être Mémorisée, et ainsi de suite ; la ligne
affiche simplement ce qui s’applique. Quelqu’un que vous suivez mais
auquel vous ne vous êtes jamais connecté n’est pas listé ici ; la page
**Abonnements** liste toutes les personnes que vous suivez.

## Trouver quelqu’un et s’y connecter

Il n’y a pas de noms d’utilisateur à rechercher — chaque pair est désigné
par son identité cryptographique, se connecter commence donc toujours par
un échange d’informations d’identité par un canal auquel vous faites déjà
confiance (chat, e-mail, en personne). **Se connecter avec quelqu’un de
nouveau** montre une façon à la fois :

- **Inviter** — **Créer une invitation**, puis copiez-la et envoyez-la à
  quelqu’un. La connexion attend sous **Demande votre attention** ; une
  fois qu’on vous a répondu, collez la réponse à cet endroit et cliquez
  sur **Terminer la connexion**.
- **Coller une invitation** — le côté qui reçoit : collez une invitation
  qu’on vous a envoyée, cliquez sur **Se connecter**, et renvoyez la
  réponse qu’on vous donne.
- **Chercher par ID** — cherchez par l’ID d’identité complet de quelqu’un
  parmi les candidats que vous ou d’autres avez publiés, puis **Se
  connecter**. Votre réponse revient par le serveur de rendez-vous, la
  connexion se termine donc d’elle-même ; vous ne copiez une réponse à la
  main que lorsque ce n’est pas possible (votre identité est verrouillée,
  ou le candidat vient d’une invitation enregistrée). **Enregistrer une
  invitation pour plus tard**, replié en dessous, ajoute une invitation à
  ces résultats de recherche sans se connecter.
- **Être découvrable** (dans le même onglet, sous **Laisser les autres
  vous trouver**) — publie votre propre identité sur un réseau de
  rendez-vous pour que quelqu’un qui connaît déjà votre ID d’identité
  puisse vous trouver et se connecter sans invitation directe. Une
  publication répond à une seule tentative de connexion — réactivez-la
  pour être trouvé de nouveau. Le bouton affiche **Ne plus être
  découvrable** tant que votre publication attend encore une réponse ; il
  revient de lui-même à **Être découvrable** dès que quelqu’un se
  connecte, ou que l’offre se ferme ou que son invitation expire. Votre
  identité doit être déverrouillée pour publier : le serveur de
  rendez-vous n’accepte qu’une publication signée par l’identité qu’elle
  désigne, personne d’autre ne peut donc en publier ou en retirer une pour
  vous. Le serveur de rendez-vous par défaut ne répond qu’au site
  ForkBuild hébergé ; si vous faites tourner ForkBuild depuis votre propre
  adresse (y compris `localhost`), utilisez des invitations ou ajoutez
  votre propre serveur sous **Serveurs de rendez-vous** dans **Paramètres
  réseau**. Cet état est conservé pour toute l’application, si bien que
  quitter la page Pairs et y revenir ne le réinitialise pas.
- **Salon public** — rencontrer des personnes dont vous n’avez pas l’ID ;
  voir ci-dessous.

**Votre ID** en haut de la page, avec **Copier l’ID complet**, est ce dont
quelqu’un a besoin pour **Chercher par ID**. La version raccourcie
`…14derniersCaractères` affichée sur les lignes ne sert qu’à distinguer
les personnes d’un coup d’œil et ne correspondra jamais à une vraie
recherche.

Quel que soit le chemin, une connexion passe par les mêmes étapes :
**Trouvé via le rendez-vous → Connexion WebRTC → Pair connecté →
Authentification de l’identité → Authentifié** (ou **Échec**). **Détails
de la connexion**, dans le menu **⋯** d’une personne connectée, affiche
son identité, sa clé publique, et rappelle que la *connexion* elle-même ne
dure que le temps de la session, même si un enregistrement de Pair connu
ou d’Ami lui survit. Les compteurs « en ligne depuis … » et « commencé il
y a … » partent du moment où la connexion a réellement été établie, ils
restent donc justes si vous changez de page et revenez.

## Le salon public : rencontrer des personnes que vous ne connaissez pas encore

Chercher par ID demande l’ID d’identité complet de quelqu’un. Le **Salon
public** sert à rencontrer des personnes dont vous n’avez pas l’ID. Il y
a un salon pour tout le monde, sur la page **Pairs** sous **Se connecter
avec quelqu’un de nouveau → Salon public**, et un pour chaque Monde, sous
**Salon** dans la Vue du Monde.

- **Rejoindre le salon** vous y liste sous un nom affiché de votre choix,
  à côté de la fin de votre ID d’identité. N’importe qui peut choisir
  n’importe quel nom ; c’est l’identité qu’une connexion vérifie
  réellement. Le nom est mémorisé pour la prochaine fois.
- Tant que vous êtes dans un salon, cet appareil reste découvrable :
  n’importe qui dans le salon peut cliquer sur **Se connecter** sur vous,
  et quand quelqu’un le fait, il se prépare aussitôt pour la personne
  suivante.
- **Se connecter** sur quelqu’un de la liste s’y connecte comme le fait
  Chercher par ID, sans rien à copier. Sa carte affiche **Connexion…**,
  puis **Connecté** une fois que l’échange a prouvé qui il est. Voir
  quelqu’un dans le salon ne s’y connecte jamais tout seul.
- **Bloquer** masque quelqu’un de vos listes de salon et le bloque comme
  partout ailleurs sur cette page.
- **Quitter le salon** vous en retire immédiatement. Rejoindre ne vaut
  que pour cette visite : fermer l’application quitte tous les salons
  (votre inscription peut mettre jusqu’à 10 minutes à disparaître des
  listes des autres), et vous n’êtes jamais remis dans un salon quand
  vous la rouvrez.

**Ce qu’obtient quelqu’un qui se connecte à vous depuis un salon.** Une
connexion de salon est un pair connecté ordinaire, même avant que vous le
Mémorisiez ou deveniez amis. Il apprend votre adresse IP, voit votre
avatar et votre présence selon vos réglages de visibilité, et vos
appareils **échangent des annonces de Snapshots et de Noms de lieux et des
métadonnées de publications**, exactement comme avec n’importe quel pair
connecté (voir [Confidentialité](Privacy.md)). Le chat et la voix exigent
toujours une amitié. Les Mondes que vous avez partagés avec des pairs lui
sont aussi proposés, mais son appareil n’en récupère un que s’il clique
sur **Récupérer** (voir
[Partager avec les pairs connectés](04-PublishingAndForking.md#partager-avec-les-pairs-connectés)).
Les Mondes partagés par vos Amis et Pairs connus sont récupérés
automatiquement pour vous ; jamais ceux d’un inconnu rencontré dans un
salon.

**Des relais seulement quand c’est nécessaire.** Chaque connexion essaie
d’abord un chemin direct et n’utilise le relais TURN du serveur de
rendez-vous que si aucun chemin direct ne fonctionne. Pendant que vous
attendez dans un salon, votre appareil ne demande jamais d’identifiants
de relais ; la personne qui se connecte à vous n’en demande que si elle en
a besoin. Cela garde l’allocation mensuelle du relais pour les connexions
qui ont vraiment lieu.

Le salon a besoin d’un serveur de rendez-vous (voir **Serveurs de
rendez-vous** dans **Paramètres réseau**) et d’une identité déverrouillée.

## Mémoriser, devenir amis, bloquer

- **Mémoriser** quelqu’un (dans son menu **⋯**) conserve une note privée
  et locale à son sujet — sans qu’il ait besoin d’y consentir.
  **Renommer** lui donne un nom que vous seul voyez ; pour quelqu’un que
  vous n’avez pas mémorisé, **Nommer et mémoriser** fait les deux.
  **Oublier** retire la note, localement seulement.
- **Ajouter comme ami**, sur la ligne d’une personne connectée, demande
  une relation mutuelle ; elle la voit sous **Demande votre attention**
  avec **Accepter** / **Refuser**, et vous pouvez **Annuler la demande
  d’ami** depuis le menu **⋯** en attendant. **Retirer des amis** y met
  fin ; il faut qu’elle soit connectée, car elle doit le recevoir. Les
  amis ont un bouton **Discuter** — voir
  [Chat et conversations](08-ChatAndConversations.md).
- **Bloquer** arrête tout ce qui vient de cette identité — présence,
  profil, chat, et même les demandes d’ami — sans la prévenir. Bloquer un
  ami ne supprime pas l’amitié, cela la rend simplement muette ;
  **Débloquer** (dans le menu **⋯**, ou dans la liste **Bloqués**) vous
  permet de nouveau de recevoir ses messages, mais ne rétablit jamais ce
  que le blocage a fait taire entre-temps.

## Suivre des personnes

**Suivre** vous tient au courant des créations de quelqu’un, comme suivre
un compte sur un réseau social, sans que personne n’ait rien à demander à
l’autre.

- **Où suivre.** **Suivre** apparaît sur les cartes de publication du
  Dépôt, à côté de **Signé par …** sur la page d’un auteur, dans le menu
  **⋯** d’une personne sur cette page, et sous la forme **Suivre ses
  créations** sur un avatar dans la Vue du Monde. Vous suivez une
  *identité*, jamais un nom d’auteur saisi : plusieurs personnes peuvent
  publier sous le même nom, la page d’un auteur affiche donc un
  **Suivre** par identité ayant signé des créations sous ce nom.
- **La page Abonnements** (**Abonnements** dans la barre du haut) liste
  les personnes que vous suivez, chacune avec **Ne plus suivre**, et en
  dessous leurs créations les plus récentes arrivées sur cet appareil, des
  plus récentes aux plus anciennes. Cliquez sur un nom pour ne voir que
  les créations de cette personne.
- **Notifications.** Quand une nouvelle création d’une personne que vous
  suivez arrive sur cet appareil, le panneau 🔔 reçoit une entrée
  indiquant qu’un auteur suivi a publié, une fois par création, avec
  **Explorer** pour l’ouvrir.
- **Ses Mondes partagés sont récupérés pour vous.** Les Mondes qu’une
  personne que vous suivez partage avec des pairs connectés sont récupérés
  automatiquement, comme ils le sont déjà pour les Amis et les pairs
  Mémorisés.
- **Ses annonces sont conservées plus longtemps.** Cet appareil garde une
  trace des annonces qu’il a vues, jusqu’à une limite par tag de
  découverte. Quand un tag est plein, les entrées vues le moins récemment
  sont supprimées en premier, mais les placements de constructions et les
  noms de lieux signés par les personnes que vous suivez passent avant le
  reste.

**Suivre est privé et à sens unique.** La liste est conservée sur cet
appareil, pour l’identité avec laquelle vous êtes connecté. Elle n’est
jamais envoyée nulle part, les personnes que vous suivez n’en sont jamais
informées, et il n’y a pas de compteur d’abonnés : sans serveur, personne
ne pourrait les compter honnêtement. Suivre ne donne rien non plus à
l’autre personne : pas de chat, pas de vue sur votre avatar, aucun moyen
de vous joindre. C’est toujours le rôle de l’amitié.

**Ce que suivre ne fait pas.** Suivre repère les créations des personnes
que vous suivez parmi ce qui arrive sur cet appareil ; cela ne va pas
chercher leurs créations de soi-même. Les créations arrivent toujours par
les voies habituelles : la découverte de Mondes dans la Vue du Monde, les
Mondes partagés par les pairs connectés, et les liens que vous ouvrez.
Seules les créations dont la signature est valide comptent, personne ne
peut donc apparaître sur votre page Abonnements en inscrivant le nom ou
l’identité de quelqu’un d’autre sur son travail. Les créations d’une
personne que vous avez **Bloquée** restent masquées même si vous la
suivez.

## TURN : relayer les connexions qui ne trouvent pas de chemin direct

Chaque connexion entre pairs commence par essayer de négocier un chemin
direct entre deux navigateurs, avec l’aide des serveurs STUN publics par
défaut de ForkBuild pour que chaque côté découvre sa propre adresse
joignable. Cela suffit pour la plupart des connexions — mais certains
réseaux (un NAT symétrique, un pare-feu d’entreprise restrictif)
n’exposent jamais de chemin que STUN seul peut trouver. Si votre serveur
de rendez-vous propose un relais TURN, ForkBuild lui demande des
identifiants de relais de courte durée quand vous démarrez une connexion
(jamais simplement à l’ouverture de l’application) et les utilise
automatiquement. Le serveur distribue un nombre limité d’identifiants de
relais chaque mois ; une fois épuisés, les connexions sont toujours
tentées, simplement sans relais, jusqu’au mois suivant. Pour utiliser
votre propre relais, ouvrez **Serveur TURN** depuis **Paramètres réseau**
dans la barre du haut (`/settings/turn-server`) et configurez votre propre
relais TURN : un serveur qui transmet réellement les données de la
connexion quand un chemin direct ne peut pas être établi.

```
Serveur TURN

Votre propre relais TURN, utilisé pour les connexions entre pairs qui ne
peuvent pas établir de chemin direct ou négocié par STUN. Ce réglage
n’affecte que l’établissement des connexions ; il ne change ni l’identité
des pairs, ni l’authentification, ni aucune connexion existante.

Vous n’avez pas besoin de remplir ceci pour obtenir un relais : au début
d’une connexion, ForkBuild demande déjà à vos serveurs de rendez-vous
(voir Serveurs de rendez-vous) un relais TURN de courte durée et l’utilise
s’ils en proposent un. N’ajoutez un relais ici que si vous en gérez ou en
payez un vous-même ; il est utilisé en plus du leur, jamais à sa place.

[ Une URL turn:/turns: par ligne (ex. turn:relay.example:3478) ]

Nom d’utilisateur [______________]
Identifiant [______________]

[Enregistrer]   [Effacer]
```

Saisissez une ou plusieurs URL `turn:`/`turns:` (une par ligne), un **Nom
d’utilisateur** et un **Identifiant** — la même paire d’identifiants est
envoyée pour chaque URL listée, jamais une différente par serveur — et
cliquez sur **Enregistrer**. Une fois défini, le relais actuel s’affiche
sous la forme « Relais TURN actuel (*N* urls) : `<vos URL>` — nom
d’utilisateur : `<votre nom d’utilisateur>` » — l’identifiant lui-même
n’est jamais réaffiché une fois enregistré, seulement le fait qu’il est
configuré. Cliquez sur **Effacer** pour le supprimer entièrement.

**Il n’y a volontairement pas de bouton « Rétablir les valeurs par
défaut » ici.** Le relais par défaut vient des serveurs de rendez-vous,
comme décrit ci-dessus, cette page n’a donc rien d’intégré à rétablir :
livrer un serveur TURN ici reviendrait à publier son identifiant dans
l’application, à la portée de quiconque voudrait le lire et le consommer.
Laisser la page vide vous donne toujours le relais des serveurs de
rendez-vous, quand ils en proposent un ; sans relais d’aucun côté, les
connexions ne reposent que sur STUN et la connectivité directe. Votre
propre relais est facultatif, et c’est quelque chose que vous fourniriez
vous-même (de nombreux hébergeurs WebRTC en proposent) seulement si les
connexions avec certains pairs échouent malgré tout. Comme pour toutes
les autres pages des Paramètres réseau, une modification ici ne prend
effet qu’au prochain chargement de l’application.

## Se reconnecter

Un Pair connu ou un Ami qui n’est pas en ligne affiche un bouton **Se
reconnecter**, même un ami que vous n’avez jamais mémorisé. Il ouvre le
même échange d’invitations qu’**Inviter** / **Coller une invitation**,
directement sur sa ligne, et effectue toujours un échange complet et neuf
plutôt que de réutiliser d’anciens détails de connexion. Si une tentative
de reconnexion s’authentifie sous une *autre* identité que celle attendue,
ForkBuild la refuse et ferme la connexion avec une erreur explicite,
plutôt que de faire confiance en silence à la personne qui a répondu.

ForkBuild le tente aussi pour vous, automatiquement, pour chaque identité
de vos Pairs connus : dès le démarrage de l’application, chaque fois que
vous Mémorisez, Oubliez ou modifiez autrement une relation de Pair connu,
et chaque fois que vous cliquez vous-même sur **Être découvrable**, il
vérifie discrètement si chacun est actuellement **découvrable** et, si
c’est le cas, se connecte sans que vous ayez à cliquer sur Se reconnecter.
Ainsi, deux amis qui cliquent tous deux sur **Être découvrable** se
connectent : le second clic trouve le premier. Un Pair connu qui n’est pas
découvrable en ce moment, ou qui est injoignable, est simplement laissé
tranquille — pas de boucle de nouvelles tentatives à sa poursuite, pas de
notification sur la tentative, et l’échec d’une identité n’en affecte
jamais une autre. Utilisez **Se reconnecter** quand vous voulez que cela
se fasse tout de suite plutôt que d’attendre le prochain passage
automatique.

## Et ensuite ?

Une fois que vous avez un ami, discutez avec lui dans
**[Chat et conversations](08-ChatAndConversations.md)**.
