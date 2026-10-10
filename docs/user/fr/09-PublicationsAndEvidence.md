<!-- translation-of: docs/user/09-PublicationsAndEvidence.md source-hash: 7c7451cea88d3528 -->
# 09 — Publications et preuves externes

<!-- languages -->
[English](../09-PublicationsAndEvidence.md) · [Deutsch](../de/09-PublicationsAndEvidence.md) · [Español](../es/09-PublicationsAndEvidence.md) · **Français** · [Bahasa Indonesia](../id/09-PublicationsAndEvidence.md) · [日本語](../ja/09-PublicationsAndEvidence.md) · [한국어](../ko/09-PublicationsAndEvidence.md) · [Português (Brasil)](../pt-BR/09-PublicationsAndEvidence.md)
<!-- /languages -->

> **En partie expérimental.** La page Publications est une fonctionnalité
> ordinaire : sa liste et ses statuts, le retrait des publications
> inutilisables, l’annonce sur Nostr ou Arweave, le stockage sur IPFS ou
> Arweave, l’ancrage sur Arweave, et les quatre onglets d’une carte :
> **Snapshot**, **Décentralisation et preuves**, **Placements et IPFS** et
> **Historique**. Le reste est **Expérimental** : cela fonctionne, mais peut
> changer ou être retiré dans une version ultérieure, et ce que cela produit
> pourrait ne pas être conservé. La page marque chacune de ces parties d’un
> badge **Expérimental** : tous les types d’ancrage sauf Arweave, les
> portefeuilles et leurs étapes Bitcoin et Base, Steem, Blurt, l’épinglage
> IPFS distant et tout le panneau **Portefeuille, archives et outils
> d’éditeur**. Les guides [11](11-EvidenceAndStorage.md) et
> [12](12-ArchiveAndLeaderboards.md) indiquent lesquelles de leurs sections
> sont Expérimentales. Construire, enregistrer, publier dans le Dépôt,
> forker, les identités et les pairs n’en dépendent pas.

Rien de tout cela n’est nécessaire pour utiliser ForkBuild. Passez si vous
voulez seulement construire, publier et explorer.

La page **Publications** est une couche plus technique que le Dépôt. Le
Dépôt concerne les Documents et les Mondes ; la page Publications
concerne les **revendications signées** comme « j’ai conçu cette
structure » ou « j’appelle ce lieu X », et la profondeur facultative que
vous pouvez ajouter à une revendication :

- **Ce guide** — d’où viennent les revendications, la page Publications,
  les [Commentaires](#commentaires) et le [Snapshot local](#snapshot-local)
  (ce que détient votre appareil).
- **[Paramètres réseau](10-NetworkSettings.md)** — passerelles, relais,
  fournisseurs et serveurs de connexion entre pairs. Pas expérimental, et
  utile à tout le monde.
- **[Preuves et stockage](11-EvidenceAndStorage.md)** — preuves externes
  (Bitcoin, Base, Arweave, Steem, Blurt), les parcours de portefeuille, les
  Placements de Snapshot, la publication IPFS, Steem et Blurt.
- **[Archive et classements](12-ArchiveAndLeaderboards.md)** — l’archive
  durable des observations, les références, les succès, les étiquettes
  d’éditeur et les pages de Classement.

## Deux sens de « publier »

| | **Publier** (Dépôt) | **Page Publications** |
|---|---|---|
| Ce qui est partagé | Un Document ou un Monde | Un enregistrement signé : un Monde partagé, la paternité d’une structure ou un nom de lieu |
| Où on le voit | Dépôt, page d’auteur, Vue du Monde | La page **Publications** |
| Ce qu’on en fait | L’ouvrir, l’explorer, le forker | Le vérifier, récupérer son contenu, le distribuer et l’ancrer |
| Guide | [Publier et forker](04-PublishingAndForking.md) | Celui-ci |

**Publier** seul ne met pas un Monde sur la page Publications.
**Partager avec les pairs**, si : cela signe le Monde comme **Monde
partagé**, capable de voyager vers les pairs (voir
[Une création du Dépôt, décentralisée](#une-création-du-dépôt-décentralisée)).

La page Publications n’a ni **Ouvrir**, ni **Explorer**, ni **Forker**,
même pas pour un Monde partagé. Elle montre l’enregistrement signé, pas le
Monde. Pour ouvrir, explorer ou forker un Monde partagé, trouvez-le dans
le Dépôt, sur la page de son auteur ou dans la Vue du Monde. Un Monde
reçu d’un pair y apparaît dès que son contenu est sur cet appareil.
(La seule exception est **Ouvrir dans l’Éditeur** sur votre propre Monde
partagé qui doit être publié de nouveau ; voir
[Signification des statuts](#signification-des-statuts).)

Chaque entrée de la page Publications est une *publication*, et chacune
est de l’un de ces trois types :

| Type | Ce que c’est |
|---|---|
| **Monde partagé** | Un Monde publié, sous forme d’enregistrement signé qui peut voyager entre pairs et réseaux |
| **Attribution de plan** | Une revendication selon laquelle vous avez conçu une structure |
| **Proposition de nom de lieu** | Un nom pour une Région ou un Point de repère |

La Vue du Monde, l’Éditeur et le Dépôt appellent eux aussi
l’enregistrement signé d’un Monde un **Monde partagé**, comme dans **Mon
Monde partagé**, **Découvrir un Monde partagé** et **Retour au Monde
partagé**.

## Ce qui entoure une publication

Une publication n’est que l’enregistrement signé. Tout ce que vous verrez
d’autre sur sa carte, et autour d’elle dans la Vue du Monde, est quelque
chose qu’on en a fait ou qu’on y a joint. Aucun de ces éléments n’est un
type de publication, et seule la publication elle-même est obligatoire :

| Terme | Comme… | Ce que c’est |
|---|---|---|
| **Publication** | Le livre lui-même | Un enregistrement signé : un Monde partagé, une Attribution de plan ou une Proposition de nom de lieu. Il porte le hash de son contenu et la signature de son éditeur. |
| **Contenu** | L’endroit où sont gardés les exemplaires imprimés | Les octets dont parle la publication, comme les briques d’un Monde. Ils sont toujours d’abord conservés sur cet appareil ; **Stocker sur …** en place une copie sur IPFS, Arweave, Steem ou Blurt pour que d’autres puissent la récupérer. Voir [Fournisseur de contenu](10-NetworkSettings.md#fournisseur-de-contenu). |
| **Snapshot** | Un exemplaire imprimé | Une copie stockée du contenu d’une publication, comme les briques d’un Monde, que d’autres peuvent récupérer et vérifier par rapport à son hash. Voir [Snapshot local](#snapshot-local). |
| **Placement** | Le rayon où l’exemplaire est rangé | Un enregistrement signé de l’endroit où se tient une construction dans le Monde. Un Monde partagé peut en avoir plusieurs. Voir [Placer ou forker](03-WorldView.md#placer-ou-forker). |
| **Annonce / Découverte** | Une fiche du catalogue de la bibliothèque | Un petit avis signé sur Nostr, Arweave, Steem ou Blurt indiquant que la publication ou le Snapshot existe et où se trouve sa copie, pour que des personnes non connectées à vous puissent la trouver. Voir [Fournisseur d’annonce / de découverte](10-NetworkSettings.md#fournisseur-dannonce--de-découverte). |
| **Preuve / Ancrage** *(Expérimental, sauf sur Arweave)* | Le tampon d’un notaire | Le hash du contenu inscrit dans une transaction blockchain (Bitcoin, Base, Arweave, Steem ou Blurt), comme preuve qu’il existait à ce moment-là. Il ne stocke ni n’annonce rien. Voir [Preuves et stockage](11-EvidenceAndStorage.md). |
| **Commentaires** | Les critiques des lecteurs | Des commentaires que toute personne connectée peut joindre à une publication, chacun signé par son auteur, pas par l’éditeur. Voir [Commentaires](#commentaires). |

Vous faites donc une publication ; puis, si vous le souhaitez, vous
stockez son contenu, l’annoncez, l’ancrez et la placez (pour un Monde
partagé) ; et n’importe qui peut la commenter.

## D’où vient une publication

Vous ne créez jamais de revendication sur la page Publications
elle-même. Elle liste les revendications que vous avez faites ailleurs,
celles que des pairs vous ont envoyées, et les créations du Dépôt arrivées
sous forme décentralisée. Les propositions de nom de lieu peuvent aussi
être trouvées directement sur Nostr, sans aucun pair ; voir
[Noms de lieux à proximité](03-WorldView.md#noms-de-lieux-à-proximité--découvrir-les-propositions-de-nimporte-qui).

### Revendiquer la paternité d’une structure

Ouvrez le panneau **Infos** d’une structure depuis **Mes structures** dans
la Bibliothèque de construction de l’Éditeur. Si elle a une identité de
Plan (la plupart des structures enregistrées en ont une), sa section
**Attribution par la communauté** propose :

- **Revendiquer la paternité** — signe une revendication, avec votre
  identité actuelle, selon laquelle vous l’avez conçue. Affiché tant que
  vous ne l’avez pas revendiquée.
- **Exporter l’attribution** — enregistre votre revendication dans un
  fichier que vous pouvez remettre à quelqu’un.
- **Publier sur le réseau** — annonce votre revendication à tous les pairs
  auxquels vous êtes connecté, ce qui la place sur leur page Publications,
  et sur la vôtre.

Une fois publiée, le panneau propose de la **Distribuer**, pour que les
personnes non connectées à vous puissent aussi la trouver. **Distribuer**
ouvre la même boîte de dialogue que celle proposée par l’Éditeur après la
publication d’un Monde, avec seulement la partie Déclaration signée (une
revendication de paternité n’a pas de Snapshot) : choisissez où son
contenu est stocké et où il est annoncé, puis **Distribuer la Déclaration
signée**. **Pas maintenant** masque la proposition ; vous pouvez toujours
distribuer la revendication plus tard depuis sa carte sur la page
Publications (voir [Distribution](Distribution.md)).

### Nommer un lieu

Dans la Vue du Monde, ouvrez le panneau de nommage d’une Région ou d’un
Point de repère et utilisez **Publier un nom** (voir
[Lieux géographiques](03-WorldView.md#lieux-géographiques)). Cela annonce
une proposition signée à vos pairs connectés.

Juste après la publication, le panneau propose de **Distribuer** le nom,
pour que les personnes non connectées à vous puissent aussi le trouver,
par exemple via
[Noms de lieux à proximité](03-WorldView.md#noms-de-lieux-à-proximité--découvrir-les-propositions-de-nimporte-qui).
Choisissez le **Réseau** (Arweave, Blurt, Nostr ou Steem ; il démarre sur votre
[Fournisseur d’annonce / de découverte](10-NetworkSettings.md#fournisseur-dannonce--de-découverte))
et cliquez sur **Distribuer**, ou sur **Pas maintenant** pour passer. Vous
pouvez aussi distribuer n’importe quelle proposition plus tard : ouvrez
**Plus** dans le panneau de nommage et cliquez sur **Distribuer** à côté
d’elle sous **Toutes les propositions**. Publier et distribuer restent
deux étapes distinctes : aucune ne fait l’autre. Une réussite indique sur
quel réseau le nom a été annoncé ; un échec indique pourquoi, le plus
souvent une extension de navigateur Nostr manquante ou un réseau non
configuré sur cet appareil.

### En recevoir une d’un pair

Quand vous vous connectez à un pair (voir
[Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md)), votre
appareil reçoit tout ce qu’il a publié, pas seulement ce qu’il publie
pendant que vous êtes connecté. Une revendication reçue n’est qu’un
enregistrement valablement signé : son contenu n’est sur votre appareil
qu’une fois récupéré avec **Récupérer auprès des pairs** (ci-dessous).

### Une création du Dépôt, décentralisée

Une carte peut aussi contenir un **Monde partagé** — le même type d’objet
qu’une entrée du Dépôt, emballé pour voyager de façon décentralisée.
**Partager avec les pairs**, dans le Dépôt, en crée un pour vos propres
Mondes (voir
[Partager avec les pairs connectés](04-PublishingAndForking.md#partager-avec-les-pairs-connectés)).
Une fois résolu ici avec **Revérifier** ou **Récupérer auprès des pairs**,
il rejoint la recherche du Dépôt, la page de son auteur et la Vue du
Monde, et y reste après un rechargement.

## La page Publications

Ouvrez **Publications** dans la barre du haut. Elle liste toutes les
publications signées que cet appareil a cataloguées, les vôtres ou celles
d’un pair. En bas, le panneau replié **Portefeuille, archives et outils
d’éditeur** contient des outils pour toute la page, en trois onglets :
**Ancrage sur blockchain**, **Outils d’archive** et **Références et
succès** (voir les guides [11](11-EvidenceAndStorage.md) et
[12](12-ArchiveAndLeaderboards.md)). Le lien qui y mène dans
l’introduction de la page, et dans toute étape qui demande d’abord
d’observer un portefeuille, l’ouvre pour vous.

Le panneau n’apparaît que si **Afficher les outils expérimentaux** est
activé dans les [Paramètres réseau](10-NetworkSettings.md#afficher-les-outils-expérimentaux) ; sinon, l’introduction renvoie
aux Paramètres réseau. Une étape qui demande d’abord d’observer un
portefeuille ouvre quand même le panneau pour cette visite.

Chaque carte de publication affiche :

- Son nom, une fois son contenu vérifié : le titre d’un Monde partagé ou
  un nom de lieu. Sinon, ou pour une revendication de paternité, le type
  de publication.
- Le type de publication (sous le nom, quand il y en a un) et qui l’a
  publiée, réduit aux derniers caractères de son ID.
- Un **badge d’état** (voir
  [Signification des statuts](#signification-des-statuts)), recalculé à
  chaque chargement de la page ou quand vous cliquez sur **Revérifier**.
- Un résumé d’une ligne de la revendication : l’empreinte et le
  revendicateur d’une attribution, ou un nom de lieu et son auteur.
- **Récupérer auprès des pairs**, tant que le contenu est indisponible
  (désactivé sans pair connecté). Il demande tour à tour les octets à
  chaque pair connecté, et ne les accepte qu’après que votre appareil les
  a vérifiés par rapport au hash du contenu.
- **Revérifier** — recalcule l’état maintenant.

En dessous, deux sections repliées :

- **Distribution** — annoncer la publication, stocker son contenu et
  l’ancrer. Le stockage et l’ancrage commencent chacun par un bouton pour
  le fournisseur enregistré sous **Configurer** (**Stocker sur IPFS**,
  **Ancrer sur Steem**), avec tous les autres fournisseurs repliés sous
  **Autres options de …**. Sans fournisseur enregistré utilisable, toutes
  les options s’affichent à la place. Steem, Blurt et l’épinglage IPFS distant
  sont marqués **Expérimental** partout où ils sont proposés, tout comme
  tous les types d’ancrage sauf Arweave. Voir
  [Distribuer depuis la page Publications](#distribuer-depuis-la-page-publications)
  et [Preuves et stockage](11-EvidenceAndStorage.md).
- **Détails**, en quatre onglets :

| Onglet | Ce qu’on y trouve |
|---|---|
| **Snapshot** | Le [Snapshot local](#snapshot-local) : ce que détient cet appareil, et comment l’obtenir. |
| **Décentralisation et preuves** | La [Décentralisation](#la-décentralisation-en-un-coup-dœil), la [liste des preuves](11-EvidenceAndStorage.md#la-liste-des-preuves), et les étapes de transaction Bitcoin et Base (expérimental). |
| **Placements et IPFS** | La liste des [Placements de Snapshot](11-EvidenceAndStorage.md#placements-de-snapshot) et la [Publication IPFS](11-EvidenceAndStorage.md#publication-ipfs) (Expérimental). |
| **Historique** | **Afficher la chronologie multi-domaines** : toutes les observations IPFS, Bitcoin et Base que cet appareil a enregistrées pour cette publication, dans l’ordre chronologique, tirées de l’[Archive des observations](12-ArchiveAndLeaderboards.md), donc conservées d’une visite à l’autre ; ou une note indiquant que rien n’est encore enregistré. |

### Signification des statuts

| Badge | Signification |
|---|---|
| **Disponible** | Le contenu est sur cet appareil maintenant. |
| **Contenu indisponible** | La revendication est authentique, mais le contenu n’est pas encore ici. Essayez **Récupérer auprès des pairs**. |
| **Enveloppe de publication invalide** / **Signature de publication invalide** | L’enregistrement est mal formé, ou n’a pas été réellement signé. |
| **Le contenu ne correspond pas à sa propre référence** / **Contenu invalide** / **Signature du contenu invalide** | Le contenu ne correspond pas à ce que déclare la publication. |
| **Échec d’une vérification propre au domaine** | Bien formée et signée, mais échoue à une vérification propre à son type. |
| **Type de publication non pris en charge** | Cette version ne sait pas afficher ce type de publication. |

Ces statuts décrivent si l’enregistrement est valide, pas si le design ou
le nom est bon.

Une publication dont l’état n’est ni **Disponible** ni **Contenu
indisponible** ne peut être ni ouverte, ni distribuée, ni ancrée, elle n’a
donc pas de carte complète. Ces publications sont réunies en bas de la
page dans un groupe replié, « *N* publications inutilisables », chacune
avec son état, la raison, **Revérifier** et **Retirer de cet appareil**.
Elles sont aussi exclues d’**Ancrer plusieurs publications**. La raison la
plus fréquente est une publication faite avant le passage des hashs de
contenu en SHA-256 : seul son auteur peut corriger cela, en la publiant de
nouveau.

Si l’une d’elles est **à vous** (signée par une identité de cet appareil)
et n’a échoué qu’à cause de son ancien hash, elle est listée en premier
avec un badge **Les vôtres**. Au lieu de « son auteur doit la publier de
nouveau », elle vous explique comment faire :

| Type | Comment la publier de nouveau |
|---|---|
| **Monde partagé** | Publiez de nouveau le Monde depuis l’Éditeur, puis **Partager avec les pairs** en dessous, dans le Dépôt (**Ouvrir le Dépôt**). |
| **Attribution de plan** | Dans l’Éditeur, ouvrez le panneau **Infos** de la structure, **Signer de nouveau pour ce design**, puis **Publier sur le réseau** (**Ouvrir l’Éditeur**). |
| **Proposition de nom de lieu** | Dans la Vue du Monde, ouvrez le panneau de nommage du lieu et utilisez de nouveau **Publier un nom**. |

Pour un Monde, la carte va un peu plus loin quand cet appareil a encore
son propre enregistrement de ce que vous avez publié : elle porte le nom
du Monde (**Mon château** au lieu de **Monde partagé**) et **Ouvrir dans
l’Éditeur** ouvre ce Monde, prêt à être publié de nouveau. Le nom et le
lien viennent de votre propre enregistrement, jamais du contenu de
l’ancienne entrée, que personne ne peut vérifier. Si l’enregistrement a
disparu (vous avez depuis dépublié ce Monde), la carte affiche **Ouvrir
le Dépôt** comme ci-dessus.

La nouvelle copie obtient sa propre carte ; retirez ensuite l’ancienne.
L’ancienne n’est jamais acceptée, même si elle est à vous : cet appareil
stocke aussi du contenu reçu de pairs, l’ancien hash ne peut donc pas
prouver quels octets vous avez publiés.

**Retirer de cet appareil** (ou **Retirer les *N* de cet appareil** en
haut du groupe) demande confirmation, puis oublie la publication ici.
Cela ne dépublie rien et n’atteint personne d’autre, et un pair connecté
qui a encore la publication peut l’annoncer de nouveau. Seules les
publications de ce groupe peuvent être retirées.

### Distribuer depuis la page Publications

**Distribution → Annonce / Découverte** contient deux cartes :

- **Publication** annonce la publication signée elle-même sur le
  **Support** de votre choix (Arweave, Nostr, Steem ou Blurt ; ces deux
  derniers sont Expérimentaux). Elle démarre sur votre
  [Fournisseur d’annonce / de découverte](10-NetworkSettings.md#fournisseur-dannonce--de-découverte).
- **Snapshot** stocke le contenu sous **Contenu** et l’annonce sur son
  propre **Support**, qui démarre aussi sur ce fournisseur. Pour un Monde,
  c’est le snapshot du Monde lui-même, annoncé avec l’endroit où son
  éditeur l’a placé quand cet appareil détient ce placement signé, comme
  le fait **Distribuer** dans la Vue du Monde. Pour tout autre type, c’est
  le contenu de la publication, annoncé par son seul hash. Cet appareil a
  besoin des octets : pour un Monde que vous n’avez pas ouvert,
  ouvrez-le d’abord dans la Vue du Monde ou obtenez-le d’un pair.

Le résultat nomme le support utilisé, comme **Steem : Annoncé**, et pour
un Monde indique si le placement de son éditeur a été joint. **Non
annoncé** signifie que seule l’annonce a échoué ; le contenu a été stocké.

## Commentaires

Toute identité connectée peut commenter n’importe quelle publication qui
se résout : une création du Dépôt, une revendication de paternité ou un
nom de lieu. Il n’y a ni vérification de propriété, ni exigence d’amitié,
ni modération.

Vous trouverez des commentaires :

- dans le **Dépôt** et sur les pages d’auteur : le bouton **Commenter**
  de chaque carte et ligne de liste ;
- dans le panneau
  [Mon Monde partagé](03-WorldView.md#mon-monde-partagé--distribuer-votre-propre-snapshot-sans-pair-nécessaire)
  de la Vue du Monde, dans sa section **Commentaires** ;
- sur une **Rencontre dans le Monde** sélectionnée : son bouton
  **Commenter**.

Chacun affiche les commentaires, du plus ancien au plus récent, avec
l’identité de chaque auteur. Connecté, vous avez une zone de texte et
**Publier le commentaire** ; sinon, une note vous invitant à vous
connecter.

Les commentaires sont permanents : ni modification, ni suppression, ni
réponses.

### Comment voyagent les commentaires

Un commentaire publié depuis le **Dépôt** est enregistré sur votre
appareil, envoyé aux pairs auxquels vous êtes connecté, et publié sur le
réseau choisi à côté de **Publier le commentaire** (Nostr, Arweave,
Steem ou Blurt ; il démarre sur votre
[Fournisseur d’annonce / de découverte](10-NetworkSettings.md#fournisseur-dannonce--de-découverte)),
pour que des personnes qui n’étaient pas connectées puissent le trouver.
Fermer la section (**Masquer les commentaires**) abandonne tout ce que
vous aviez saisi sans le publier. Les commentaires publiés depuis **Mon
Monde partagé** ou les **Rencontres dans le Monde** de la Vue du Monde
voyagent de la même façon, avec le même choix de réseau à côté de
**Publier le commentaire**.

Pour qu’un commentaire n’aille sur aucun réseau, choisissez **Local et pairs
uniquement**. Il est enregistré sur votre appareil et envoyé seulement aux
pairs connectés à ce moment-là, sans compte réseau nécessaire. Qui n’est pas
connecté au moment de la publication ne le reçoit pas, et personne ne pourra
le trouver plus tard sur un réseau.
Pour que chaque formulaire de commentaire démarre dessus, choisissez-le sous
**Commentaires** sur la page [Fournisseur d’annonce / de
découverte](10-NetworkSettings.md#fournisseur-dannonce--de-découverte).

Vous avez créé un compte réseau depuis, ou voulez un commentaire sur un
autre réseau aussi ? Sous chacun de vos commentaires, une ligne indique à
quels réseaux cet appareil l’a envoyé, ou *Pas encore envoyé à un réseau
depuis cet appareil.* **Distribuer** l’envoie alors au réseau choisi et
indique si cela a fonctionné ; un réseau où il est déjà allé est signalé et
ne peut pas être choisi à nouveau. Seul l’auteur du commentaire, connecté,
le voit, car lui seul peut signer le commentaire pour un réseau, et la ligne
ne connaît que ce que cet appareil a envoyé.

Les commentaires des autres vous parviennent :

- des pairs connectés, au moment où ils sont publiés ;
- des réseaux, quand vous ouvrez les commentaires d’une publication et
  chaque fois que vous cliquez sur **Rechercher de nouveaux
  commentaires**. C’est ainsi que vous voyez les commentaires publiés
  pendant que vous étiez hors ligne.

La ligne à côté du bouton indique le résultat de la dernière recherche,
comme *2 nouveaux commentaires trouvés* ou *Aucun nouveau commentaire
trouvé* (ce qui ne couvre que les réseaux qui ont répondu). Un réseau
injoignable est nommé (*Arweave indisponible(s)*) ; si aucun ne répond,
vous voyez *Impossible de joindre Nostr et Arweave — affichage des
commentaires stockés sur cet appareil*. Seules les publications dont vous
ouvrez les commentaires sont vérifiées. La signature de chaque
commentaire récupéré est vérifiée, et aucun n’est compté deux fois.

Quand quelqu’un commente une publication que vous avez publiée, une
entrée **Nouveau commentaire sur votre construction** apparaît dans votre
[Historique des notifications](03-WorldView.md#orientation-et-emplacements)
(le bouton 🔔 de l’en-tête).

## Snapshot local

Dans l’onglet **Snapshot** d’une carte, **Snapshot local** répond à une
seule question : cet appareil détient-il en ce moment les octets du
contenu de cette publication ? Il ne vérifie ni les signatures ni les
placements, et ne contacte le réseau que lorsque vous cliquez sur l’une
des actions de récupération.

### Vérifier ce que vous avez

**Vérifier le snapshot local** (puis **Vérifier de nouveau**) :

| Badge | Signification |
|---|---|
| **Disponible** | Les octets sont ici et correspondent au hash du contenu. |
| **Non disponible** | Rien n’a jamais été stocké sous ce hash. |
| **Hash non correspondant** | Quelque chose est stocké sous ce hash, mais ne lui correspond plus. |

Deux personnes ayant la même publication peuvent obtenir des réponses
différentes, car leur stockage diffère. Après une vérification, une ligne
indique *Publication : connue localement / non connue localement ·
Snapshot : disponible / non disponible* : si cet appareil a catalogué la
publication signée, et s’il détient des octets valides.

Si la vérification ne trouve pas d’octets valides, une indication renvoie
vers les façons de les faire venir, plus bas. Rien ne réessaie tout seul.

### Faire venir les octets

Trois actions, chacune avec son propre clic :

**Importer un Snapshot** — affiche un sélecteur de fichier et une zone de
collage pour un **Paquet de transfert de Snapshot de publication** (un
paquet JSON du contenu d’une publication). Choisissez-en ou collez-en un,
puis cliquez de nouveau sur **Importer le Snapshot**.

| Badge | Signification |
|---|---|
| **Importé** | Stocké et vérifié par rapport à son hash. |
| **Déjà disponible** | Des octets correspondants étaient déjà ici. |
| **Import refusé** | Les octets du paquet ne correspondent pas à son propre hash. |
| **Le snapshot n’a pas été importé** | Ce n’est pas un paquet valide. |

**Obtenir le Snapshot d’un pair** — choisissez un pair connecté et
cliquez sur **Obtenir le Snapshot d’un pair** (puis **…de nouveau**). Il
ne demande qu’à ce pair.

| Badge | Signification |
|---|---|
| **Obtenu** | Les octets du pair correspondent au hash du contenu. |
| **Déjà disponible** | Des octets correspondants étaient déjà ici. |
| **Indisponible pour le moment** | Le pair n’a pas répondu, ou ne les a pas. |
| **Refusé** | Les octets du pair ne correspondaient pas. |

**Matérialiser le Snapshot**, depuis un placement (voir
[Placements de Snapshot](11-EvidenceAndStorage.md#placements-de-snapshot)),
est la troisième façon. Dès que l’une des trois réussit, une ligne
**Source :** nomme la plus récente réussie : « Paquet de transfert »,
« Placement » ou « Pair ».

### Quels pairs l’ont ?

**Quels pairs l’ont ?** demande à vos pairs connectés s’ils détiennent les
octets, sans les faire venir. Chaque pair connecté figure dans la liste,
coché ; décochez ceux que vous ne voulez pas interroger, puis cliquez sur
**Interroger les pairs sélectionnés** (ensuite **Interroger de nouveau les
pairs sélectionnés**). La dernière réponse de chaque pair s’affiche avec
son heure, ainsi que les totaux : **Disponible**, **Non disponible** ou
**Indéterminé** (pas de réponse à temps). Une réponse est ce que ce pair a
dit à ce moment-là, pas une promesse.

Un pair qui a répondu **Disponible** a son propre bouton **Obtenir le
Snapshot de *pair***. Il demande les octets à ce seul pair et les vérifie,
comme **Obtenir le Snapshot d’un pair** ; rien n’est jamais récupéré
auprès de quelqu’un d’autre à votre place. **Afficher les réponses de cette
visite** liste chaque réponse sur une ligne (comme
`20:21:04 — Alice → Disponible`) ; cliquez sur une ligne pour le rapport
complet, la publication et le hash de contenu. Une ligne n’est jamais
réécrite.

### Tentatives de cette visite

Dès que vous avez tenté de faire venir les octets, **Tentatives de cette
visite** compte les tentatives de cette visite par résultat et par source.
Une tentative qui a stocké les octets ne signifie pas qu’ils sont toujours
là ; c’est **Vérifier le snapshot local** qui le dit. **Afficher
l’historique d’acquisition** liste chaque tentative (comme
`20:16 — Pair → Hash non correspondant`) ; cliquez sur l’une d’elles pour
son résultat, sa publication et son hash de contenu.

## La décentralisation en un coup d’œil

Dans l’onglet **Décentralisation et preuves**, dès
qu’une publication a une ancre ou un placement, **Décentralisation**
compare les [Preuves externes](11-EvidenceAndStorage.md#preuves-externes)
et les [Placements de Snapshot](11-EvidenceAndStorage.md#placements-de-snapshot) :

- **Publication : connue localement / non connue localement** — si cet
  appareil a catalogué la publication signée.
- Deux cartes indiquant combien de déclarations de chaque type sont
  connues, et si elles s’accordent sur le hash du contenu (**Accord**) ou
  non (**Conflit**). Si l’une s’accorde et l’autre est en conflit, une
  phrase le signale ; l’accord de l’une ne garantit pas l’autre. Sans
  encore aucune déclaration d’un type, elle affiche plutôt **Rien à
  comparer pour l’instant**.
- **Synchroniser avec les pairs** (puis **Synchroniser de nouveau**)
  demande à chaque pair connecté les ancres et placements que vous n’avez
  pas, et indique **Nouvelles déclarations** et **Déjà connues** pour
  chaque type.
- **Afficher la connaissance de la réplique** liste, pour chaque ancre et
  chaque placement, comment cet appareil l’a appris (**Acquisition** :
  *Appris localement*, *par import de paquet* ou *par échange entre
  pairs*), **Vu pour la première fois**, et son état actuel de
  **Vérification** / **Résolution**. Elle ne contacte aucun réseau.

## Ce qui survit à un rechargement

Les revendications signées et les faits enregistrés sont conservés ; les
vérifications, les tentatives et les écrans en cours ne le sont pas.

| Conservé sur cet appareil | Réinitialisé au rechargement |
|---|---|
| Les preuves et placements catalogués, et la **Connaissance locale** de chacun | Les résultats de **Vérifier les preuves** et **Résoudre le Snapshot** |
| Les octets de Snapshot que vous avez importés, récupérés ou matérialisés | Tout le reste de **Snapshot local** : vérifications, historique des tentatives, ligne **Source :**, vérifications et comparaisons auprès des pairs |
| Les décomptes de **Décentralisation** (recalculés à chaque chargement) | Les résultats de **Synchroniser avec les pairs** |
| — | **Publication IPFS** : la configuration du fournisseur, les résultats, l’historique à l’écran et l’historique de vérification |
| Les enregistrements **Publications d’ancres Bitcoin/Base**, créés à la finalisation | La connexion des parcours de portefeuille, l’observation des fonds ou du compte, le plan, l’examen, la signature, la transaction finalisée, le résultat de diffusion et l’historique à l’écran des confirmations ou inclusions |
| L’**Archive des observations de publication** (chaque publication et vérification IPFS, diffusion, confirmation et preuve de contenu Bitcoin, et inclusion Base), jusqu’à **Vider l’archive** | — |
| Les Références entre publications et les Associations d’éditeurs | Les cartes et lignes que vous aviez ouvertes |
| Les décisions et observations de réconciliation (conservées dans l’archive) | Les archives de pairs collées, les exports de preuves importés, les filtres, la Comparaison d’exports de preuves et la Déclaration d’instantané d’éditeur |

Après un rechargement, les résultats d’un parcours ou d’une publication
IPFS restent visibles dans
l’[Archive des observations](12-ArchiveAndLeaderboards.md#larchive-des-observations-de-publication),
le cycle de vie d’un enregistrement, ou (pour Bitcoin) l’Historique des
preuves d’ancrage Bitcoin. Reconnectez le portefeuille, ou reconfigurez le
fournisseur d’épinglage, pour continuer.

## Et ensuite ?

Partager vos constructions se fait toujours dans
[Publier et forker](04-PublishingAndForking.md). Pour aller plus loin
ici, continuez avec [Preuves et stockage](11-EvidenceAndStorage.md).
