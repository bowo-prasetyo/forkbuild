<!-- translation-of: docs/user/Distribution.md source-hash: 9c6ca1cfed3b4863 -->
# Distribuer votre travail

<!-- languages -->
[English](../Distribution.md) · [Deutsch](../de/Distribution.md) · [Español](../es/Distribution.md) · **Français** · [Bahasa Indonesia](../id/Distribution.md) · [日本語](../ja/Distribution.md) · [한국어](../ko/Distribution.md) · [Português (Brasil)](../pt-BR/Distribution.md)
<!-- /languages -->

Tout ce que crée ForkBuild commence sur votre propre appareil.
**Distribuer** est l’étape distincte et facultative qui place votre
travail sur des réseaux décentralisés, pour que des personnes non
connectées à vous puissent le trouver, le récupérer et le vérifier.
Cette page réunit en un seul endroit ce que vous pouvez distribuer, où, et
ce dont vous avez besoin. Chaque section renvoie vers le guide qui
explique les détails.

## Publier, partager, distribuer : trois choses différentes

| Action | Où cela va | Qui le reçoit | Guide |
|---|---|---|---|
| **Publier** | Cet appareil uniquement | Personne d’autre, pour l’instant | [Publier votre création](04-PublishingAndForking.md#publier-votre-création) |
| **Partager avec les pairs** | Directement aux personnes auxquelles vous êtes connecté | Vos pairs connectés, tant que vous êtes en ligne | [Partager avec les pairs connectés](04-PublishingAndForking.md#partager-avec-les-pairs-connectés) |
| **Distribuer** | Des réseaux décentralisés (IPFS, Arweave, Nostr, Steem) | N’importe qui, sans connexion à vous | Cette page |

Publier n’envoie jamais rien nulle part de soi-même, et partager avec des
pairs n’est pas distribuer : les pairs n’en gardent une copie qu’aussi
longtemps qu’ils le choisissent, et personne d’autre ne peut la trouver.
Chaque distribution est un clic explicite.

## Les trois rôles qu’un réseau peut jouer

Distribuer utilise jusqu’à trois types de réseau, chacun choisi
séparément :

| Rôle | Comme… | Ce qu’il fait | Choix |
|---|---|---|---|
| **Contenu** (Stockage) | L’endroit où sont gardés les exemplaires imprimés | Conserve les octets, comme les briques de votre Monde, pour que d’autres puissent les récupérer | **Arweave**, **IPFS (Kubo local)**, **IPFS (épinglage distant)**, **Steem** *(expérimental)* |
| **Annonce / Découverte** | Une fiche du catalogue de la bibliothèque | Publie un petit avis signé indiquant que votre travail existe et où se trouve sa copie, pour que d’autres puissent le trouver | **Nostr**, **Arweave**, **Steem** *(expérimental)* |
| **Preuve / Ancrage** *(expérimental, facultatif)* | Le tampon d’un notaire | Inscrit le hash de votre contenu dans une blockchain, comme preuve qu’il existait à ce moment-là. Il ne stocke ni n’annonce rien. | **Bitcoin**, **Arweave**, **Base**, **Steem** |

Un stockage sans annonce, c’est personne qui ne sait où chercher ; une
annonce sans stockage pointe vers rien. **Distribuer** fait les deux en un
clic. L’ancrage est un supplément, fait séparément sur la page
**Publications**.

Définissez votre choix habituel pour chaque rôle sous
[Paramètres réseau](10-NetworkSettings.md) :
[Fournisseur de contenu](10-NetworkSettings.md#fournisseur-de-contenu),
[Fournisseur d’annonce / de découverte](10-NetworkSettings.md#fournisseur-dannonce--de-découverte)
et [Fournisseur de Preuve / Ancrage](10-NetworkSettings.md#fournisseur-de-preuve--ancrage).
Ils ne font que préremplir le premier choix de chaque sélecteur ; les
enregistrer n’envoie jamais rien.

## Ce que vous pouvez distribuer

| Quoi | Contenu | Annonce / Découverte | Preuve / Ancrage | Où le faire |
|---|---|---|---|---|
| **La Déclaration signée de votre Monde** (l’enregistrement signé d’un Monde publié, appelé Monde partagé) | Arweave, IPFS ou Steem | Nostr, Arweave ou Steem | — | **Distribuer** après la publication dans l’Éditeur ; **Mon Monde partagé** dans la Vue du Monde ; la page **Publications** |
| **Le Snapshot de votre Monde** (ses briques), avec l’endroit où vous l’avez placé | Arweave, IPFS ou Steem | Nostr, Arweave ou Steem | — | Les mêmes boîtes de dialogue **Distribuer** (**Distribuer le Snapshot seulement** pour cette seule moitié) |
| **Le hash de contenu de n’importe quelle publication** (un Monde, une revendication de paternité ou un nom de lieu) | — | — | Bitcoin, Arweave, Base ou Steem | La carte de la publication sur la page **Publications** |
| **La paternité d’une structure** (Attribution de plan) | Arweave, IPFS ou Steem | Nostr, Arweave ou Steem | — | **Distribuer** dans le panneau **Infos** de la structure, proposé une fois que vous avez cliqué sur **Publier sur le réseau** ; la page **Publications** |
| **Un nom de lieu** (Proposition de nom de lieu) | Arweave, IPFS ou Steem | Nostr, Arweave ou Steem | — | **Distribuer** dans le panneau de nommage de la Vue du Monde, proposé une fois que vous avez cliqué sur **Publier un nom** (il annonce le nom sur le réseau choisi) ; la page **Publications** pour n’importe lequel d’entre eux |
| **Un commentaire** sur une publication | — | Nostr, Arweave ou Steem | — | **Publier le commentaire**, dans le Dépôt ou la Vue du Monde, sur le réseau choisi à côté |

Le Snapshot d’un Monde emporte votre placement signé, si bien que les
personnes qui le récupèrent voient la construction exactement là où vous
l’avez mise.

### Déclaration signée et Snapshot : deux moitiés d’un même Monde

Un Monde publié est distribué en deux morceaux distincts :

| | Déclaration signée | Snapshot |
|---|---|---|
| **Comme…** | Une fiche de catalogue certifiée | L’exemplaire imprimé sur l’étagère, étiqueté avec son emplacement |
| **Ce qu’elle contient** | Le titre du Monde, vous comme auteur, sa licence, le Monde dont il est forké (le cas échéant) et son **hash de contenu**, une empreinte des briques, le tout signé avec votre identité | Chaque brique du Monde, plus votre placement signé : l’endroit où vous l’avez mis dans la Vue du Monde |
| **Taille** | Quelques kilo-octets | Aussi grand que la construction : jusqu’à 256 Ko sur Arweave, sans limite sur IPFS |
| **Ce qu’elle prouve** | Que vous avez publié ce Monde, avec exactement cette empreinte | Rien en soi ; quiconque le récupère vérifie les briques par rapport au hash de contenu |
| **À quoi elle sert** | Les liens de partage, et **Découvrir un Monde partagé** qui recherche et vérifie votre Monde | Afficher votre construction dans la Vue du Monde, là où vous l’avez placée, aux personnes qui marchent à proximité |

Le hash de contenu relie les deux : quiconque détient les briques peut
vérifier qu’elles correspondent à l’empreinte de votre enregistrement
signé.

Les deux moitiés utilisent les deux rôles : chacune est stockée sur le
réseau de Contenu que vous choisissez et annoncée sur le réseau
d’Annonce / Découverte que vous choisissez. Avec IPFS et Nostr, par
exemple, **Distribuer** stocke le Snapshot sur IPFS et l’annonce sur
Nostr, puis stocke la Déclaration signée sur IPFS et l’annonce aussi sur
Nostr.

Chaque moitié est utile seule, c’est pourquoi les boîtes de dialogue
**Distribuer** en rendent compte séparément et vous permettent d’en
réessayer une avec **Distribuer le Snapshot seulement** ou **Distribuer
la Déclaration signée seulement** :

- **Snapshot seulement :** votre construction apparaît dans la Vue du
  Monde pour les personnes à proximité, mais aucun enregistrement signé de
  la publication ne la soutient.
- **Déclaration signée seulement :** on peut trouver votre Monde et
  confirmer qu’il est à vous, mais pas récupérer ses briques sur les
  réseaux. Les pairs auxquels vous êtes connecté peuvent toujours les
  obtenir directement chez vous tant que vous êtes en ligne.

Détails :

- Déclaration signée et Snapshot :
  [Distribuer directement depuis l’Éditeur](04-PublishingAndForking.md#distribuer-directement-depuis-léditeur),
  [Mon Monde partagé](03-WorldView.md#mon-monde-partagé--distribuer-votre-propre-snapshot-sans-pair-nécessaire),
  et la [boîte de dialogue Distribuer](03-WorldView.md#rencontres-dans-le-monde--publications-et-avatars-que-vos-pairs-partagent)
  elle-même.
- La page Publications :
  [Distribuer depuis la page Publications](09-PublicationsAndEvidence.md#distribuer-depuis-la-page-publications),
  [Placements de Snapshot](11-EvidenceAndStorage.md#placements-de-snapshot)
  et [Publication IPFS](11-EvidenceAndStorage.md#publication-ipfs).
- L’ancrage : [Preuves externes](11-EvidenceAndStorage.md#preuves-externes),
  [Le parcours d’ancrage Bitcoin](11-EvidenceAndStorage.md#le-parcours-dancrage-bitcoin)
  et [Le parcours d’ancrage Base](11-EvidenceAndStorage.md#le-parcours-dancrage-base).
- La paternité : [Revendiquer la paternité d’une structure](09-PublicationsAndEvidence.md#revendiquer-la-paternité-dune-structure).
- Les noms de lieux : [Nommer un lieu](09-PublicationsAndEvidence.md#nommer-un-lieu).
- Les commentaires : [Comment voyagent les commentaires](09-PublicationsAndEvidence.md#comment-voyagent-les-commentaires).

## Ce qui reste chez vous ou chez vos pairs

Tout ce que vous créez n’est pas distribué. Ces éléments ne vont jamais
sur les réseaux ci-dessus :

| Quoi | Où cela va | Guide |
|---|---|---|
| Un Monde que vous **Partagez avec les pairs** | Vos pairs connectés uniquement | [Partager avec les pairs connectés](04-PublishingAndForking.md#partager-avec-les-pairs-connectés) |
| La position en direct et l’apparence de votre avatar | Les pairs connectés, selon vos réglages de visibilité | [Qui peut vous voir](06-AvatarsAndPresence.md#qui-peut-vous-voir--deux-réglages-indépendants) |
| Les messages du chat et les appels vocaux | L’ami avec qui vous parlez, directement | [Chat et conversations](08-ChatAndConversations.md) |
| Les ancres et placements échangés avec **Synchroniser avec les pairs** | Vos pairs connectés uniquement | [La décentralisation en un coup d’œil](09-PublicationsAndEvidence.md#la-décentralisation-en-un-coup-dœil) |
| Votre identité, vos structures enregistrées, les véhicules et animaux que vous transportez, vos amis, vos réglages | Cet appareil, sauf si vous les exportez ou les sauvegardez | [Vos données](13-YourData.md) |

Pour les déplacer vers un autre appareil, ou les remettre à quelqu’un,
utilisez les exports et la sauvegarde complète de
[Vos données](13-YourData.md).

## Ce dont chaque réseau a besoin

La distribution est signée par une extension de navigateur ou un
portefeuille que vous installez vous-même ; ForkBuild ne voit jamais vos
clés. Sans l’extension correspondante, la tentative se termine par un avis
indiquant qu’elle n’a pas pu aboutir.

| Réseau | Rôles | Ce qu’il vous faut | Limites et remarques |
|---|---|---|---|
| **Nostr** | Annonce / Découverte | Une extension de signature Nostr, comme nos2x | Annonce à tous les relais de [Relais Nostr](10-NetworkSettings.md#relais-nostr) à la fois ; plus de relais, plus de gens peuvent vous trouver |
| **Arweave** | Contenu, Annonce / Découverte, Preuve / Ancrage | Une extension de portefeuille Arweave, comme Wander | Stocke jusqu’à 256 Ko par Snapshot, soit environ huit mille briques ; au-delà, c’est refusé avant la signature. Permanent : reste disponible quand votre ordinateur est éteint. Un nouvel envoi peut mettre quelques minutes à atteindre les passerelles. |
| **IPFS (Kubo local)** | Contenu | Votre propre nœud IPFS, par défaut à `http://127.0.0.1:5001` | Pas de limite de taille. Disponible seulement tant que votre nœud est en ligne, sauf si quelqu’un d’autre l’épingle. |
| **IPFS (épinglage distant)** *(expérimental)* | Contenu | Un compte chez un service d’épinglage compatible Pinata | Pas de limite de taille. Saisissez l’endpoint et l’identifiant à chaque fois ; ils ne sont jamais enregistrés. |
| **Steem** *(expérimental)* | Contenu, Annonce / Découverte, Preuve / Ancrage | L’extension Steem Keychain avec votre clé de publication, et votre compte sous [Paramètres réseau → Steem](10-NetworkSettings.md#steem) | Les articles sont des réponses aux fils mensuels de ForkBuild ; une approbation par article. Stocke environ 2 500 briques par article, jusqu’à environ 30 000 briques en 20 articles. Utilise des Resource Credits, qui se rechargent. |
| **Bitcoin** *(expérimental)* | Preuve / Ancrage | L’extension UniSat, avec des bitcoins sur une adresse SegWit native (`bc1q…`) pour les frais | Se fait via les étapes de portefeuille de la page Publications |
| **Base** *(expérimental)* | Preuve / Ancrage | Un portefeuille de navigateur comme MetaMask ou Coinbase Wallet, sur Base | Chaque ancre est une transaction que vous examinez et signez |

Une ancre Steem est rapide et gratuite mais attestée par les témoins de
Steem plutôt que par une preuve de travail : utilisez-la en complément
d’une ancre Bitcoin, pas à sa place. Voir
[Steem](11-EvidenceAndStorage.md#steem).

## Un parcours type

1. **Publiez** votre Monde dans l’Éditeur (voir
   [Publier votre création](04-PublishingAndForking.md#publier-votre-création)).
2. Cliquez sur **Distribuer** dans l’avis qui apparaît, ou plus tard sous
   **Mon Monde partagé** dans la Vue du Monde.
3. Choisissez un **Stockage** et un **Support d’annonce / de
   découverte**, par exemple IPFS et Nostr, ou Arweave pour les deux, et
   cliquez sur **Distribuer**. Cela distribue le Snapshot, puis la
   Déclaration signée, et rend compte de chacun séparément. Si une moitié
   échoue, réessayez seulement celle-ci avec son propre bouton
   **… seulement**.
4. Éventuellement, sur la page **Publications**, ancrez la publication
   (par exemple **Ancrer sur Arweave**) pour enregistrer quand elle
   existait.
5. Cliquez sur **Partager…** ou **Copier le lien** sous le résultat pour
   donner aux gens un lien qui ouvre votre construction dans la Vue du
   Monde sur n’importe quel appareil.

Pour une construction plus grande que les 256 Ko d’Arweave, choisissez
IPFS. Les pairs auxquels vous êtes connecté peuvent toujours récupérer
directement chez vous des constructions jusqu’à 64 Mo.

## Vérifier que cela a fonctionné

- La carte de votre construction dans le Dépôt indique où cet appareil a
  enregistré sa distribution, par exemple **Stocké sur IPFS · Annoncé sur
  Nostr**, ou **Aucune distribution enregistrée sur cet appareil**. Voir
  [Vos publications](13-YourData.md#vos-publications).
- **Découvrir un Monde partagé**, dans la Vue du Monde, recherche
  directement votre Monde partagé sur Arweave et Nostr et le vérifie, pour
  répondre à « ma publication est-elle vraiment là-bas, intacte ? ». Voir
  [Découvrir un Monde partagé](03-WorldView.md#découvrir-un-monde-partagé--chercher-directement-sur-les-réseaux-décentralisés).
- Sur la page Publications, **Vérifier le contenu IPFS** récupère un
  envoi IPFS et le compare à son hash, et **Vérifier les preuves**
  vérifie une ancre.

Une distribution ne peut pas être reprise : une fois quelque chose annoncé
ou stocké, d’autres personnes en détiennent peut-être déjà une copie.
**Dépublier** ne retire un Monde que de votre propre catalogue.
