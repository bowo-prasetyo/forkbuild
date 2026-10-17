<!-- translation-of: docs/user/04-PublishingAndForking.md source-hash: 33cea86c419bfd8c -->
# 04 — Publier et remixer

<!-- languages -->
[English](../04-PublishingAndForking.md) · [Deutsch](../de/04-PublishingAndForking.md) · [Español](../es/04-PublishingAndForking.md) · **Français** · [Bahasa Indonesia](../id/04-PublishingAndForking.md) · [日本語](../ja/04-PublishingAndForking.md) · [한국어](../ko/04-PublishingAndForking.md) · [Português (Brasil)](../pt-BR/04-PublishingAndForking.md)
<!-- /languages -->

C’est le cœur de ForkBuild. **Publier** partage votre construction avec le
monde. **Remixer** permet à n’importe qui de faire sa propre copie d’une
construction et de la faire évoluer, en conservant tout son historique.
(Les documents pour développeurs appellent un remix un
*fork*, comme dans ForkBuild.)

## Publier votre construction

1. Construisez quelque chose dans l’Éditeur.
2. Ayez un nom, et vérifiez qu’il est déverrouillé (voir
   [Votre nom et votre identité](05-IdentityAndLogin.md)). Publier signe la
   construction avec lui. Si vous n’avez pas encore de nom, **Publier**
   vous demande d’abord d’en choisir un ; **Publier sans signer** la publie
   alors sans auteur et sans lien.
3. Donnez-lui un titre — Publier refuse une construction sans titre ou vide —
   et, si vous le souhaitez, une description et une licence : cliquez sur
   **✎** à côté du titre de la construction dans la barre latérale pour ouvrir
   **Propriétés de la construction**. Une nouvelle construction n’a pas de licence ;
   la première fois que vous le publiez, ForkBuild demande si d’autres
   peuvent le remixer (voir [Laisser les autres la remixer](#laisser-les-autres-la-remixer)).
4. Appuyez sur **Enregistrer** pour qu’elle soit stockée.
5. Cliquez sur **Publier**. La première fois, ForkBuild demande aussi
   [Qui peut la trouver ?](#qui-peut-la-trouver-)

Votre construction apparaît maintenant dans **Explorer** sur cet appareil, où
vous pouvez la chercher, l’ouvrir et la remixer, avec votre nom comme
auteur. Les autres la voient dès que vous partagez son lien, ou tout de
suite si vous avez choisi **Tout le monde** sous
[Qui peut la trouver ?](#qui-peut-la-trouver-). Elle reçoit aussi une
place dans le monde partagé, à côté de ce avec quoi elle va (voir
[Où se dresse une construction](#où-se-dresse-une-construction)), pour qu’**Explorer**
ait toujours un endroit où emmener les gens — voir
[Trouver des mondes](03-WorldView.md#trouver-des-mondes).

### Entrer à pied

À côté du lien, l’avis que montre Publier propose **Entrer à pied** (**En
faire le tour** pour une construction sans porte). Il ouvre le monde avec
votre avatar au sol devant la porte de la construction, face à elle ; la
porte s’ouvre quand vous vous approchez, et entrer (**W**, ou le joystick sur
un téléphone) coche la dernière étape de
[Votre première construction](02-TheEditor.md#votre-première-construction).
La porte est l’entrée principale : une porte dans un mur ou une tour pleins,
sans place pour se tenir derrière, ne compte pas, et on arrive devant une
construction sans porte. La carte **Votre première construction** propose le
même bouton une fois la construction publiée.

> **Remarque :** publier stocke votre construction sur cet appareil. Sa
> carte dans **Explorer** indique où cet appareil a enregistré sa
> distribution (par exemple **Stocké sur IPFS · Annoncé sur Nostr**), ou
> **Aucune distribution enregistrée sur cet appareil**. Sauvegardez-la
> dans [Vos données](13-YourData.md) pour en garder une copie en
> attendant.
> Tant que vous n’avez pas choisi où vont vos constructions, publier n’envoie
> rien nulle part de soi-même. Un [lien](#partager-un-lien) que vous copiez apporte la
> construction à qui vous le donnez. Une fois un réseau choisi (voir
> [Où elle va](#où-elle-va--envoyer-une-construction-en-publiant)), chaque Publier y envoie aussi la construction, pour
> que d’autres la trouvent sans être connectés à vous.
> [**Partager avec les pairs**](#partager-avec-les-pairs-connectés) la propose aux personnes auxquelles
> vous êtes connecté.

## Partager un lien

Dès que **Publier** réussit, l’avis de l’Éditeur affiche aussi
**Partager…** (là où votre appareil a un menu de partage), **Copier le
lien**, **Enregistrer l’image** et **Intégrer**, avec le lien en dessous. Les mêmes
boutons se trouvent sous **Mon Monde partagé** dans la Vue du monde.

- **La construction voyage dans le lien.** Rien n’a besoin d’être distribué
  d’abord, et aucun portefeuille ni compte n’intervient : le lien
  porte votre Monde partagé signé et la construction elle-même. Quiconque
  l’ouvre, sur n’importe quel appareil, arrive sur votre construction (voir
  [Ce qu’ouvre un lien](#ce-quouvre-un-lien)). ForkBuild
  vérifie la signature, et que la construction lui correspond, avant de
  montrer quoi que ce soit ; un lien modifié ou tronqué le signale.
- **Il montre ce qu’il est.** Collé dans une messagerie, un courriel ou
  une publication, le lien affiche le titre de votre construction, votre nom
  et une image de la construction, dessinée par le serveur de liens de
  ForkBuild, qui envoie ensuite quiconque l’ouvre vers ForkBuild. Un lien
  modifié n’affiche que « A shared build ».
- **Il faut une signature.** Publiez sous un nom ; une construction
  publiée sans nom (**Publier sans signer**) n’obtient pas de lien.
- **Un lien court dès qu’elle est envoyée à tout le monde.** Si la
  construction est allée à **Tout le monde** (voir
  [Qui peut la trouver ?](#qui-peut-la-trouver-)), les boutons proposent
  plutôt un lien court, d’environ 90 caractères, qui nomme la construction
  au lieu de la porter : qui l’ouvre reçoit la construction des relais
  Nostr publics auxquels elle a été envoyée, vérifiée comme pour un lien.
  Il tient dans n’importe quelle discussion, Discord et Telegram compris,
  et vaut pour les constructions jusqu’à environ 2 000 briques. Les
  constructions gardées pour leur lien gardent le lien long, puisque la
  construction n’est nulle part ailleurs. Un lien court marche tant qu’un
  relais garde la construction ; si aucun ne répond, la page le dit et
  propose **Réessayer**.
- **Taille.** Une construction d’environ 500 briques au plus y tient ; le
  lien du château prêt à l’emploi fait environ 3 700 caractères. Le
  courriel et la plupart des messageries et des réseaux sociaux gardent un
  lien aussi long, mais Discord et Telegram limitent la longueur d’un
  message. Une construction plus grande indique qu’elle est trop grande pour
  un lien : distribuez-la pour en obtenir un.
- **Une fois distribuée**, les boutons proposent le lien plus court qui
  indique où le Monde partagé est stocké, et qui apporte aussi votre
  placement (voir [Distribution](Distribution.md)). Un lien qui contient sa
  construction ne contient pas votre placement, la Vue du monde place donc
  la construction là où elle met celles qui n’en ont pas.
- **Enregistrer l’image** télécharge un PNG de 1200 × 630 de la
  construction, avec son titre et « Faites-en votre version sur
  ForkBuild » en bas, à publier là où un lien seul n’affiche aucune
  image.
- **Faire une vidéo** enregistre une courte vidéo de la construction, à
  mettre vous-même sur YouTube, Shorts, TikTok ou Reels : une **Construction
  en accéléré**, où elle s’élève brique par brique depuis le sol, ou un
  **Plateau tournant**, où elle fait un tour, en **Large (16:9)** ou
  **Vertical (9:16)**. Son nom défile en bas, et elle se termine sur une carte
  qui dit qui l’a construite, avec tous ceux qui l’ont construite avec vous, et
  où la remixer. La vidéo est faite sur votre appareil, le temps qu’elle dure
  (une demi-minute au plus), et enregistrée dans vos téléchargements ; rien
  n’est envoyé. Ensuite, **Copier le titre** et **Copier la description**
  donnent le texte à coller à côté : qui l’a construite, le lien vers votre
  construction, un lien vers ForkBuild et la licence. Gardez l’onglet au
  premier plan pendant l’enregistrement ; il se met en pause quand l’onglet
  est caché.
- Une **Visite**, le troisième genre de **Faire une vidéo**, est filmée dans
  la Vue du Monde : elle s’ouvre sur votre construction, votre avatar part
  quelques pas en arrière, marche jusqu’à la porte (qui s’ouvre) et entre,
  puis regarde tout autour de la pièce, avec les sons de la Vue du Monde
  (oiseaux ou grillons, vent, pas, la porte) et, si vous ne décochez pas
  **Avec musique**, sa musique. Seule la vue 3D est filmée, jamais les
  panneaux, et cela prend le temps de la vidéo (environ 15 secondes). Une
  construction sans porte est rejointe par l’avant. La musique et les sons
  sont dans la vidéo même si vous les avez coupés. Un lien qui contient une
  grande construction est trop long pour une description YouTube : il est
  laissé de côté, et Faire une vidéo le dit ; publiez avec « Qui peut la
  trouver ? » sur « Tout le monde » pour un lien court.

Copier ou partager un lien, et en ouvrir un, sont comptés anonymement,
comme la visite quotidienne ; voir
[Comptage quotidien des visiteurs](13-YourData.md#comptage-quotidien-des-visiteurs).

### Ce qu’ouvre un lien

Un lien vers une construction, qu’il la porte ou qu’il indique où elle
est stockée, ouvre la page propre à cette construction :

- la construction, qui tourne lentement ;
- son titre et qui l’a faite, et **Construit avec …** suivi des noms quand
  des amis l’ont construite avec son auteur (voir
  [Construire avec moi](02-TheEditor.md#construire-avec-moi--construire-ensemble-en-direct)).
  Le nom de l’auteur et celui de chaque co-constructeur ouvrent la page de
  cette personne : les constructions que son identité a signées, et celles
  où d’autres la créditent ;
- **Remix de « … » par …** quand c’est un remix, et **Remixée N fois**
  quand cet appareil a trouvé des remix de celle-ci (voir
  [Nombre de remix](#nombre-de-remix)) ;
- son **Arbre généalogique** : les constructions dont elle est un remix,
  jusqu’à l’originale, et les remix faits d’elle et de ceux-ci, chacun en
  lien quand cet appareil peut l’ouvrir ;
- **Modifier une copie**, le grand bouton : votre propre copie s’ouvre
  dans l’Éditeur, prête à être modifiée, sans compte. Elle garde la trace
  de son origine, son auteur garde donc le mérite, et **Retour au monde**
  vous mène à l’original ;
- **En faire le tour dans le Monde**, pour la voir dans la Vue du monde.

Quand la licence autorise les copies, la page propose aussi **La
télécharger comme modèle 3D** (glTF, STL pour l’impression 3D ou OBJ ; voir
[Télécharger un modèle 3D](02-TheEditor.md#télécharger-un-modèle-3d)). Si la licence de la construction n’autorise pas
les copies, la page le dit
et ne propose que d’en faire le tour.

### Intégrer une construction dans une page web

Une construction dont le lien la contient peut aussi être affichée dans un
article de blog ou une page web, où les lecteurs la voient tourner sans
quitter la page :

1. Sous le lien, choisissez **Intégrer**. Le code à coller apparaît en
   dessous.
2. Choisissez **Copier le code d’intégration** et collez-le là où la page
   accepte du HTML ou un contenu intégré (un `<iframe>`).

Sur la page, la construction tourne lentement, et un glissement sur le côté
la fait tourner à la main. Son titre et son auteur sont en bas, à côté de
**Remixer sur ForkBuild** (**Ouvrir dans ForkBuild** quand sa licence
n’autorise pas les copies), qui ouvre la page de la construction dans
ForkBuild dans un nouvel onglet (voir
[Ce qu’ouvre un lien](#ce-quouvre-un-lien)).

- **La construction voyage dans le code**, comme dans son lien : rien n’a
  besoin d’être distribué, et l’intégration vérifie la signature et la
  construction avant de l’afficher.
- **Elle reste discrète.** L’intégration ne lance aucune des connexions de
  ForkBuild et ne conserve rien dans le navigateur du lecteur ; voir
  [Confidentialité](Privacy.md).
- **Les sites qui intègrent eux-mêmes les liens** (ceux qui prennent en
  charge oEmbed, comme Notion et Ghost) peuvent recevoir à la place le lien
  de **Copier le lien** : ils demandent l’intégration au serveur de liens
  de ForkBuild.
- **Les sites qui retirent le code `<iframe>`**, comme la plupart des
  réseaux sociaux, ne peuvent pas l’afficher ; partagez-y le lien ou
  l’image.

Copier le code, et l’affichage ou l’ouverture d’une intégration dans
ForkBuild, sont aussi comptés anonymement.

## Qui peut la trouver ?

La première fois que vous cliquez sur **Publier**, ForkBuild demande
**Qui peut la trouver ?** :

- **Tout le monde** : chaque construction que vous publiez est aussi envoyée
  à tout le monde. Elle apparaît dans **Explorer**, dans le défi de la
  semaine et sur sa place, et dans le Monde, pour quiconque utilise
  ForkBuild, sans lien, portefeuille ni compte d’un côté comme de l’autre.
  Juste après Publier, l’Éditeur dit « Publiée ! Envoi à tout le monde… »,
  puis « Publiée ! Tout le monde peut maintenant la trouver dans Explorer,
  dans le défi et dans le Monde. » Si les réseaux n’ont pas pu être
  joints, il le dit et propose **Réessayer** ; le lien fonctionne dans tous
  les cas.
- **Seulement les personnes à qui j’envoie le lien** : la construction reste
  sur cet appareil et dans son lien. La notification dit « Seules les
  personnes à qui vous envoyez son lien peuvent la voir. » avec **Laisser
  tout le monde la trouver**, qui envoie cette construction et fait de
  **Tout le monde** le choix à partir de là.

La réponse est mémorisée sur cet appareil. Une fois qu’une construction a été
envoyée à tout le monde, **Désormais, seulement par lien** dans la même
notification garde vos prochaines constructions dans leurs liens.

Comment ça marche : la construction, signée par vous, est envoyée comme
*note de construction* aux relais Nostr publics de **Paramètres réseau**,
avec ses étiquettes et sa place dans le Monde. La note est signée avec une
clé que cet appareil crée à cet effet (sa *clé porteuse*), pas avec votre
identité, si bien qu’il n’y a rien à installer. Quiconque trouve la note
l’ouvre exactement comme il ouvrirait votre lien : votre signature et le
contenu de la construction sont vérifiés d’abord, et une note qui ne
correspond pas est ignorée. Une construction trop grande pour une note
(environ 2 000 briques) le dit ; partagez son lien, ou choisissez où elle
va ci-dessous. Les constructions publiées sans nom ne peuvent pas être
envoyées. Voir [Confidentialité](Privacy.md).

### Où se dresse une construction

Une construction publiée se dresse dans le Monde partagé à côté de ce avec
quoi elle va :

- **un remix** se dresse à côté de la construction qu’il remixe, si bien
  qu’un arbre généalogique devient une rue ;
- **tout le reste** rejoint le village qui grandit autour de la place du
  défi, anneau par anneau de l’intérieur vers l’extérieur, en commençant
  juste à l’extérieur des constructions toutes prêtes qui entourent sa
  place, si bien que des constructions publiées à peu près en même temps
  sont voisines, et que les premières sont en vue de la place ;
- **Construire ici** pose toujours une construction à l’endroit que vous
  avez choisi, et publier de nouveau une construction ne la déplace jamais.

Tous ceux qui trouvent la construction la voient au même endroit, puisque
sa place voyage avec elle, signée par vous.

## Où elle va — envoyer une construction en publiant

**Publier** garde votre construction sur cet appareil et dans ses liens
jusqu’à ce que vous choisissiez où elle va, à part l’envoi à tout le monde
(ci-dessus). Juste après un Publier, la notification propose **Choisir où
elle va** (ou **Autres réseaux**, une fois qu’elle a été envoyée à tout le
monde) à côté du lien, et **Ignorer**.

**Choisir où elle va** ouvre la boîte de dialogue **Où elle va** : choisissez
un **Stockage** (où la construction elle-même est gardée : Arweave, IPFS, ou
Steem ou Blurt quand leurs rédacteurs sont activés) et un **Support
d’annonce / de découverte** (où elle est annoncée : Nostr, Arweave, Steem ou
Blurt), puis cliquez sur **Envoyer**. **Envoyer ici à chaque publication**
est coché au départ : dès qu’un envoi fonctionne avec la case cochée, cet
appareil garde le choix, et **chaque Publier ensuite y envoie la
construction tout seul**. L’avis dit alors « Envoi vers Nostr… », puis
« Publiée et envoyée vers Nostr : tout le monde peut la trouver
maintenant. », ou, quand un envoi échoue, ce qui n’a pas marché, avec
**Réessayer** et **Changer où elle va**. Décochez la case (dans la boîte de
dialogue, depuis **Changer où elle va**) pour arrêter, et Publier garde de
nouveau les constructions sur cet appareil. L’épinglage distant n’est
jamais gardé, car son jeton ne dure que la visite ; choisissez-le chaque
fois dans la boîte de dialogue.

Seule une construction signée est envoyée toute seule ; **Publier sans
signer** n’envoie rien. Le portefeuille ou l’extension de votre navigateur
pour ce réseau (un portefeuille Arweave comme Wander, une extension Nostr
comme nos2x, Steem ou Blurt Keychain) vous demande d’approuver chaque envoi,
et Arweave et Blurt prennent de petits frais à chaque fois. Sans eux,
l’envoi se termine par un simple avis « … n’a pas pu être effectuée » et la
construction reste publiée ici.

La boîte de dialogue est la même que celle de la Vue du Monde : ses
réglages **Stockage** et **Support d’annonce / de découverte** et les
boutons séparés **Distribuer le Snapshot seulement** / **Distribuer la
Déclaration signée seulement** fonctionnent comme décrit dans
[Rencontres dans le Monde](WorldViewAdvancedTools.md#rencontres-dans-le-monde--publications-et-avatars-que-vos-pairs-partagent). Deux choses diffèrent ici : elle agit
toujours sur le Monde partagé exact que votre clic sur Publier vient de
produire, et le **Snapshot** passe en premier, si bien qu’**Envoyer** envoie
le Snapshot, puis la Déclaration signée. Fermer la boîte de dialogue
(**Fermer**, un clic à l’extérieur ou Échap) ne perd jamais rien de ce
qu’elle a produit.

Le résultat de la Déclaration signée apparaît dans sa propre section :

| Champ | Signification |
|---|---|
| **Monde partagé** | L’id du Monde partagé — confirme de quel Monde partagé parle ce résultat. |
| **Contenu** | L’emplacement produit par l’envoi, ou « Pas encore envoyé » s’il n’a pas abouti. |
| **Découverte** | L’id de l’annonce, ou « Pas encore annoncé » si elle n’a pas abouti — une ligne par relais quand plusieurs sont configurés. |
| **Votre construction** | Un bouton **Explorer** qui mène directement à la page de cette publication dans la Vue du Monde — affiché dès que la publication a un endroit à explorer, c’est-à-dire en pratique toujours. |

**Grosses constructions.** Le stockage Arweave accepte un Snapshot
jusqu’à 256 Ko, soit environ huit mille briques. Au-delà, choisissez le
stockage IPFS (un nœud IPFS local ou l’épinglage distant), qui n’a pas de
limite de taille ; si vous choisissez quand même Arweave, la section
Snapshot indique la taille de la construction et vous demande de choisir
IPFS, et rien n’est envoyé. Les pairs auxquels vous êtes connecté peuvent
récupérer directement chez vous des constructions jusqu’à 64 Mo, sans
stockage nécessaire.

Le résultat propre au Snapshot — un **Hash du contenu**, un
**Localisateur** et un id d’**Annonce**, ou « Aucune annonce » pour un
placement réussi sans annonce — est entièrement séparé, puisque les
Snapshots sont placés et découverts indépendamment de la distribution des
Déclarations signées ; voir
[Snapshot local](09-PublicationsAndEvidence.md#snapshot-local) pour ce que
signifie cette distinction.

Publier de nouveau remplace tout l’avis par un nouveau pour la nouvelle
publication ; l’ignorer, ou quitter la page, l’efface. Ni l’avis ni le
résultat d’une section ne sont gardés nulle part ; seul l’endroit où vont
vos constructions l’est.

## Partager avec les pairs connectés

Une construction que vous publiez n’est listée que dans *votre*
**Explorer**, jusqu’à ce qu’elle soit envoyée à tout le monde (voir
[Qui peut la trouver ?](#qui-peut-la-trouver-)) ou que vous la distribuiez
sur Nostr, Arweave, Steem ou Blurt (voir [Distribution](Distribution.md)) :
l’**Explorer** de chacun la trouve alors (voir
[Constructions distribuées par d’autres](#constructions-distribuées-par-dautres)).
Pour la mettre dans l’**Explorer** de quelqu’un à qui vous êtes connecté
(voir [Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md)),
cliquez sur **Partager avec les pairs** sous elle dans **Explorer**. Le
bouton n’apparaît que sur vos propres Mondes publiés.

- Partager propose le Monde à toutes les personnes connectées en ce
  moment, et à toutes celles qui se connecteront plus tard. **Partagé ✓ ·
  Partager de nouveau** l’annonce de nouveau aux personnes connectées
  maintenant.
- De leur côté, un Monde partagé par l’un de leurs **Amis** ou **Pairs
  connus** est ajouté de lui-même à leur **Explorer**, avec tout ce qu’il faut
  pour l’**Explorer**. Un Monde partagé par quelqu’un d’autre attend sous
  **Partagés avec vous** en haut de leur **Explorer** jusqu’à ce qu’ils cliquent
  sur **Récupérer**. Aucun appareil ne télécharge le Monde d’un inconnu
  sans qu’on le lui demande. Chacun est listé sous son titre, pour qu’ils
  puissent choisir ; leur appareil s’assure que le Monde qu’ils récupèrent
  est bien celui que ce titre désigne. Un Monde que vous avez partagé avant
  que les titres soient inclus est listé comme « Un Monde partagé par … »
  jusqu’à ce que vous cliquiez sur **Partager de nouveau**.
- Le Monde n’est récupéré qu’auprès de vous, et seulement pendant que
  vous êtes connecté : si vous êtes hors ligne, **Récupérer** attend votre
  retour, et un Ami ou Pair connu le reçoit dès que vous vous reconnectez.
  Leur appareil vérifie que le Monde est signé par vous avant de
  l’ajouter, pour que personne ne puisse faire passer une copie pour la
  sienne.
- Comme pour toute publication, un partage ne peut pas être repris aux
  personnes qui l’ont déjà reçu.

## Choisir une licence

### Laisser les autres la remixer

La première fois que vous publiez une construction sans licence,
ForkBuild demande **Autoriser les autres à la remixer ?** avant de publier
quoi que ce soit :

- **Oui, autoriser les remix** choisit **CC BY 4.0** : chacun peut la
  copier et la modifier, à condition de vous citer, et chaque remix indique
  qu’il vient de la vôtre.
- **Non, seulement la regarder** choisit **Tous droits réservés** : on peut
  en faire le tour, mais pas la copier.
- **Pas maintenant** ne publie rien.

Votre réponse est enregistrée comme licence de la construction, on ne vous
le demande donc qu’une fois ; changez-la quand vous voulez dans
**Propriétés de la construction**. Un remix porte déjà la licence de son original,
le publier ne demande donc jamais rien.

### Toutes les licences

Une construction publiée est toujours affichée avec une licence, choisie dans
la boîte de dialogue **Propriétés de la construction** :

| Licence | Signification |
|---|---|
| **CC0 1.0 — Domaine public** | Aucun droit réservé — chacun peut en faire ce qu’il veut |
| **CC BY 4.0 — Attribution** | Chacun peut la remixer et la réutiliser, en vous citant |
| **CC BY-SA 4.0 — Attribution, Partage dans les mêmes conditions** | Les remix doivent garder la même licence |
| **CC BY-NC 4.0 — Attribution, Pas d’utilisation commerciale** | Les remix sont autorisés, l’usage commercial ne l’est pas |
| **CC BY-ND 4.0 — Attribution, Pas de modification** | Consultable, mais **les remix ne sont pas autorisés** |
| **Tous droits réservés** | Consultable, mais les remix ne sont pas autorisés |
| **Aucune licence indiquée** | Les remix ne sont pas autorisés tant que vous n’en définissez pas une |

Si vous laissez une construction sans licence, les gens peuvent toujours
l’ouvrir et l’explorer — ils ne peuvent simplement pas la remixer tant que
vous ne choisissez pas une licence qui le permet.

## Choisir qui peut le placer

Les autres peuvent normalement placer votre construction publiée dans leurs
propres Mondes. Cela ajoute un placement de votre construction, jamais une
copie, et cela ne déplace ni ne modifie jamais la vôtre (voir
[Pourquoi puis-je placer les constructions des autres ?](WorldViewAdvancedTools.md#pourquoi-puis-je-placer-les-constructions-des-autres-)).
Remixer est distinct et régi par la licence (voir
[Placer ou remixer](WorldViewAdvancedTools.md#placer-ou-remixer)).
Si vous préférez qu’ils ne la placent pas, ouvrez **Propriétés de la
construction** et réglez **Qui peut le placer dans le Monde** :

| Réglage | Signification |
|---|---|
| **Tout le monde peut le placer** | Par défaut. Chacun peut la placer où il veut dans son propre Monde |
| **Moi seul peux le placer** | Vous seul pouvez la placer. Les autres peuvent toujours la trouver, la voir et (si la licence le permet) la remixer, mais ForkBuild ne les laissera pas la placer |

Le réglage est signé avec la publication au moment où vous publiez,
personne ne peut donc le retirer ni le changer ensuite. Cela veut aussi
dire qu’il ne s’applique qu’à ce que vous publiez après l’avoir choisi.
Une publication déjà sortie garde le réglage avec lequel elle a été
publiée : publiez de nouveau si vous voulez que le nouveau s’applique.

Il fonctionne comme l’autorisation de remix de la licence : chaque copie de
ForkBuild le respecte, mais ce n’est pas un verrou. Quelqu’un qui aurait
modifié le code de l’application pourrait l’ignorer, et il ne peut pas
annuler un placement fait avant que vous le choisissiez.

Dans les deux cas, les autres voient votre construction là où *vous* l’avez
mise dès que vous envoyez son Snapshot, comme le fait Publier une fois que
vous avez choisi où vont vos constructions, ou avec **Distribuer** dans la
Vue du Monde : l’annonce porte votre placement signé, et leur ForkBuild
montre la construction à cet endroit dès qu’il connaît votre Monde partagé.
Déplacez-la et distribuez de nouveau, et elle se déplace aussi chez eux.

## Modifier une construction publiée

Une construction publiée est **immuable** — elle ne peut jamais changer après
coup. Pour la développer, **Remixez**-la (ci-dessous), ou utilisez
**Modifier une copie** dans la Vue du Monde. Dans la Vue du Monde, votre
première modification d’un monde publié — ses métadonnées, le nom d’un
point de repère ou d’une région, ou une décoration animale — crée
automatiquement votre propre copie, intitulée *« Remix de &lt;nom
d’origine&gt; »*, avec une courte confirmation (« Votre propre copie
modifiable a été créée — … reste inchangé ») ; voir
[Enregistrer et publier ici aussi](03-WorldView.md#enregistrer-et-publier-ici-aussi).

L’original n’est jamais touché, quoi que vous changiez dans votre copie.

## Explorer

**Explorer**, dans la barre du haut (appelé *Dépôt* dans les versions
antérieures), est le catalogue, avec
recherche, de toutes les constructions publiées que cet appareil connaît : les vôtres, celles que des pairs ont
partagées avec vous, et celles trouvées sur des réseaux décentralisés. Il
est conçu pour rester utilisable qu’il contienne dix constructions ou dix
mille.

### Constructions toutes prêtes

En haut, **Partir d’une construction toute prête** montre les
constructions fournies avec ForkBuild : un château fort, une île du port,
une place du village, une maison, un moulin et un pont. Elles sont là
avant même que quoi que ce soit soit publié ou trouvé. Cliquez sur l’une
d’elles (**Remixer**) pour ouvrir votre propre copie dans l’Éditeur ; rien
n’est publié tant que vous ne la publiez pas. Cliquez sur le titre pour
replier la rangée.

En dessous, **Comment grandissent les remix** montre trois familles
d’exemple fournies avec ForkBuild, chacune une chaîne de remix d’une
construction toute prête : la Maison, remixée en Maison avec porche, elle-même
remixée deux fois (Maison avec jardin et Maison avec tour) ; la Tour de guet,
remixée en Phare puis en Phare et maison du gardien ; et le Moulin, remixé en
Moulin et grenier puis en Ferme. Chacune est sa parente avec quelque chose en
plus, comme le serait un remix de votre part. Cliquez sur un nom pour en
ouvrir votre propre copie. Ce sont les exemples de l’application, jamais les
publications de quelqu’un ; ils sont aussi dans les **Structures** de la
Bibliothèque de construction, sous *collection*.

### Constructions distribuées par d’autres

Chaque fois que vous ouvrez **Explorer** (ou une page d’auteur), il cherche sur
Nostr, Arweave, Steem et Blurt les constructions que d’autres personnes y ont
distribuées, et ajoute celles qu’il peut vérifier. Une ligne au-dessus de
la liste indique ce qu’il fait, puis combien de nouvelles constructions il a
trouvées ; **Vérifier à nouveau** cherche encore une fois.

- Seule une construction dont l’enregistrement signé est vérifié est ajoutée :
  signé par la clé qu’il nomme, et exactement la construction annoncée. Tout le
  reste est ignoré, et un enregistrement qui a échoué n’est pas récupéré de
  nouveau.
- Il vérifie jusqu’à 20 nouvelles constructions à la fois. S’il y en a plus,
  la ligne indique combien il en reste pour la prochaine fois.
- Une construction trouvée ainsi reste dans votre **Explorer** après un
  rechargement.
- Son build n’est pas encore sur votre appareil. **Explorer** le récupère
  là où il a été stocké, le vérifie, puis l’ouvre dans la Vue du Monde,
  exactement comme l’ouverture d’un lien partagé.

```
Rechercher [________________]  ☐ Inclure les descriptions  [Rechercher]

Trier : [Publiés récemment ▾]   Grouper : [Aucun ▾]   [Cartes] [Liste]

1 248 publications

┌─────────────────────────────────────────┐
│  [aperçu]   Cité antique                 │
│             Une reconstitution d’une     │
│             ville romaine montrant…      │
│             🔒 Publié  par alice         │
│             16/08/2026 · CC BY 4.0       │
│             [Ouvrir] [Forker] [Explorer] │
└─────────────────────────────────────────┘

        [← Précédent]  1 2 3 4 5 … 125  [Suivant →]
```

- **Rechercher** porte par défaut sur le titre et l’auteur. Cochez
  **Inclure les descriptions** pour chercher aussi dans les descriptions —
  cela peut prendre un peu plus de temps, car il faut lire plus que ce
  dont la liste a normalement besoin.
- **Trier** propose cinq ordres : Publiés récemment, Publiés il y a le
  plus longtemps, Titre A–Z, Titre Z–A et Auteur A–Z.
- **Grouper** regroupe les résultats de la page actuelle par Auteur, Date
  ou Licence — purement pour parcourir ; cela ne change ni ce qui est
  trouvé ni le nombre de pages.
- **Cartes** est idéal pour parcourir visuellement ; **Liste** est un
  tableau compact — passez-y quand vous parcourez rapidement beaucoup de
  résultats.
- La pagination est explicite, page par page, plutôt qu’un défilement
  sans fin — « page 5 » veut donc toujours dire la même chose si vous y
  revenez plus tard.

Chaque construction propose trois actions :

| Bouton | Ce qu’il fait |
|---|---|
| **Ouvrir** | Charger cette construction dans l’Éditeur |
| **Remixer** | Le copier dans votre propre construction modifiable |
| **Explorer** | Aller le voir dans la Vue du Monde |

(Le bouton **Continuer l’exploration** de **Mes mondes** — voir
[Mes mondes](03-WorldView.md#mes-mondes--les-mondes-où-vous-êtes-vraiment-allé)
— fait la même chose qu’**Explorer** ici, simplement formulé pour un Monde
déjà visité plutôt que pour un Monde que vous découvrez.)

Cliquez sur le **nom d’un auteur** pour ouvrir sa **page d’auteur** — un
portfolio de tout ce qu’il a créé, y compris ses originaux et tous les
remix qui en sont nés, avec exactement le même catalogue de recherche, de
tri et de pagination qu’**Explorer**, simplement limité à cet auteur.

Une carte dont la signature est valide a aussi un bouton **Suivre**, et
une page d’auteur affiche **Signé par …** avec **Suivre** pour chaque
identité qui a publié sous ce nom. Suivre quelqu’un place ses nouvelles
constructions sur votre page **Abonnements** et dans vos notifications ; voir
[Suivre des personnes](07-PeerConnectionsAndFriends.md#suivre-des-personnes).

**Explorer** ne se limite pas non plus à ce qui a été publié depuis cet
appareil ou découvert directement : une construction décentralisée qu’un pair
vous a montrée sur la carte des
[Rencontres dans le Monde](WorldViewAdvancedTools.md#rencontres-dans-le-monde--publications-et-avatars-que-vos-pairs-partagent)
de la Vue du Monde, une fois son contenu réellement résolu, rejoint aussi
cette recherche et la page de son auteur, et y reste après un
rechargement. Elle n’est affichée d’aucune façon différente du reste.

## Remixer : faites-le vôtre

**Remixer** est ce qui rend ForkBuild unique. Quand vous remixez une
construction :

- Vous obtenez une **toute nouvelle copie indépendante**, à modifier
  librement.
- L’**original n’est pas touché** — vos modifications ne l’affectent
  jamais.
- La copie **se souvient de son origine**, le crédit n’est donc jamais
  perdu.

Cela fonctionne exactement comme forker un projet dans Git : vous créez
une branche, faites votre propre chose, et l’arbre généalogique garde la
trace de tout le monde. (Dans la Vue du Monde, cela se produit aussi
automatiquement dès que vous modifiez un monde publié — voir
[Modifier une construction publiée](#modifier-une-construction-publiée)
ci-dessus.)

> **Aussi appelé « Modifier une copie » dans la Vue du Monde.** C’est la
> même opération sous-jacente dans les deux cas, avec les mêmes règles de
> licence et la même gestion de
> [Impossible de faire une copie](#quand-un-remix-ne-peut-pas-aboutir). Voir
> [Modifier une copie](03-WorldView.md#modifier-une-copie--emporter-quelque-chose-dans-léditeur)
> pour la présentation propre à la Vue du Monde.

### Comment remixer

1. Trouvez une construction dans **Explorer** (ou dans la Vue du Monde).
2. Cliquez sur **Remixer**.
3. La copie s’ouvre dans l’Éditeur, intitulée *« Remix de &lt;nom
   d’origine&gt; »*.
4. Développez-la, puis enregistrez-la et publiez-la comme la vôtre.

Votre remix publié apparaît avec une note **Remix de « … » par …**, qui le
relie à l’original.

### Nombre de remix

La page d’une construction et sa carte dans **Explorer** disent combien de
fois elle a été remixée (**Remixée 3 fois**) : combien de constructions
différentes, remixées à partir d’elle et publiées, cet appareil a trouvées.
Un remix publié deux fois compte une fois, et une construction que
personne n’a remixée n’affiche rien. Le nombre n’est que ce que cet
appareil connaît, un autre appareil peut donc afficher un nombre
différent, et il ne décide jamais de ce qui est montré en premier.

Quand cet appareil trouve le remix, par quelqu’un d’autre, de l’une de vos
constructions, votre 🔔 reçoit une entrée **… a remixé votre
construction**, une fois par remix (et votre appareil l’affiche aussi, si
vous avez activé [Notifications sur cet appareil](03-WorldView.md#notifications-sur-cet-appareil)).

### Quand un remix ne peut pas aboutir

Il arrive qu’un remix ne puisse pas aboutir — le plus souvent en remixant un
Monde partagé trouvé via un pair ou un réseau décentralisé (voir
[Publications et preuves externes](09-PublicationsAndEvidence.md)) plutôt
qu’une construction ordinaire d’**Explorer**. Au lieu de vous déposer
dans une construction vide et sans rapport de l’Éditeur, ForkBuild affiche une
boîte de dialogue **Impossible de faire une copie** qui nomme exactement le
problème :

- **La licence de cette construction n’autorise pas les copies.** — voir
  [Choisir une licence](#choisir-une-licence) ci-dessus.
- **Impossible de récupérer cette construction pour l’instant.** — la
  licence autorise les copies, mais la construction elle-même n’est pas
  encore sur cet appareil (ni accessible via un pair connecté).

Dans les deux cas, l’unique bouton de la boîte de dialogue, **Retour à la
construction**, vous ramène là où vous l’avez trouvé — le Monde où il
était placé, ou le Monde partagé lui-même — plutôt que de vous laisser
bloqué dans l’Éditeur sans rien à développer.

## Le défi de construction hebdomadaire

Chaque semaine, ForkBuild propose un thème à construire (un phare, un pont,
une mini-maison, …), du lundi à la fin du dimanche (UTC). L’accueil le
montre, et **Défi** dans la barre du haut ouvre sa page.

Il y a 26 thèmes, si bien qu’une demi-année passe avant qu’un thème
revienne, chacun avec des idées pour commencer et une contrainte qui rend les
participations de la semaine différentes, comme *« Faites-le assez large
pour que la charrette de foin passe. »* Une semaine sur quatre est une
semaine du remix (voir plus bas).

1. **Participer au défi** ouvre dans l’Éditeur un terrain vide à vous,
   nommé d’après le thème et déjà étiqueté pour la semaine (une étiquette
   comme `#lighthouse-20261012` : le thème et le lundi où il a commencé),
   avec les structures de la semaine épinglées en haut des **Structures** de
   la Bibliothèque de construction. Le défi est aussi le premier choix de
   **Nouveau** dans l’Éditeur, et la section **Des idées pour commencer** de
   la page ouvre plutôt l’une de ces constructions comme votre propre copie.
2. Construisez à votre façon : ajoutez une idée si vous voulez, puis
   faites-en la vôtre. Quoi que vous construisiez, cela participe tant que
   l’étiquette de la semaine reste (ajoutez-la dans **Propriétés de la construction
   → Étiquettes** si vous avez commencé autrement).
3. Publiez-la avant la fin de la semaine et partagez son lien. Le texte du
   lien nomme le défi et son étiquette, prêt pour une publication.

**Semaines du remix.** Une semaine sur quatre, à partir de celle du
2 novembre 2026, est une semaine du remix (`#remix-20261102`) : au lieu
d’un thème, une participation commence comme votre propre copie d’une
participation de la semaine précédente. **Participer** mène à la page du
défi, qui liste les participations de la semaine dernière ; **Remixer**
sur l’une d’elles ouvre votre copie dans l’Éditeur, étiquetée pour la
semaine. Votre copie se souvient à qui elle était, pour que son auteur soit
crédité dans l’arbre généalogique. Si la semaine dernière n’a eu aucune
participation, les familles de remix d’exemple sont proposées à la place.

La page du défi liste les participations que cet appareil connaît : vos
propres constructions publiées avec l’étiquette, et celles des autres
trouvées sur les réseaux. Quand une construction est diffusée sur Nostr, Arweave, Steem ou Blurt, son annonce (sur Blurt, sa publication) liste ses étiquettes, et la page demande l’étiquette
de la semaine à ces réseaux à chaque ouverture (**Vérifier à nouveau**
redemande). Chaque participation trouvée est vérifiée comme tout ce que
trouve **Explorer**, et apparaît aussi dans **Explorer**. Une construction partagée seulement par son lien n’est pas trouvée ainsi, pas plus qu’une construction annoncée seulement sur Steem avant le 8 octobre 2026, date à laquelle les annonces Steem ont commencé à lister les étiquettes. Les semaines précédentes restent ouvertes par leur
lundi (**La semaine dernière : …**), sans **Participer**.

Les participations sont montrées de la plus récente à la plus ancienne,
avec leur nombre de remix. Personne ne les juge et rien n’est classé : le
défi est une raison de construire quelque chose cette semaine, et de voir
ce que d’autres ont fait de la même idée.

Quand des participations sont des remix les unes des autres, ou d’autres
constructions, **Arbres généalogiques** sous les participations montre d’où
elles viennent, un arbre par chaîne de remix.
Une semaine encore sans participation montre à la place les familles d’exemple (voir [Constructions toutes prêtes](#constructions-toutes-prêtes)).

### La place du défi

**Se promener**, dans le menu principal, vous emmène sur la place de cette
semaine, et **Parcourir la place** sur la page du défi aussi, dès qu’une
semaine a des participations. C’est la place du village du monde partagé :
les six constructions toutes prêtes se dressent autour pour tout le monde,
toujours, chacune avec **Remixer**, et le village des constructions
publiées grandit juste à l’extérieur, les participations de la semaine
parmi elles. Promenez-vous parmi elles ou choisissez-en une dans le panneau :
**Naviguer** vole jusqu’à elle, **Ouvrir** l’ouvre comme le ferait
**Explorer**, et **Modifier une copie** commence votre propre copie.

- Chaque participation se dresse dans le village. Celle dont cet appareil
  sait que l’emplacement est dans le village s’y dresse, là où elle s’est
  installée à sa publication. Toute autre (une placée loin, comme les
  constructions publiées avant qu’elles ne s’installent dans le village, ou
  une dont cet appareil ne connaît pas l’emplacement) est montrée, tant que
  vous êtes sur la place, à l’endroit où elle s’installerait dans le
  village ; son propre emplacement reste où il est.
- Le panneau liste les 24 premières participations publiées. Les autres
  sont sur la page du défi.
- Les participations trouvées sur les réseaux sont récupérées et vérifiées
  comme à l’ouverture de leur lien. Celle qui ne peut pas être récupérée est
  laissée de côté, et le panneau dit combien l’ont été.
- Une participation dont l’auteur a choisi **Moi seul peux le placer** ne se
  dresse pas sur la place, puisque l’y mettre reviendrait à la placer. Elle
  reste sur la page du défi.
- Une participation montrée à son emplacement est une pièce exposée, pas un
  placement : rien n’est signé ni conservé pour personne, et elle disparaît
  quand vous partez. Comme le reste de la vue du monde, la place montre ce que cet
  appareil connaît : deux visiteurs peuvent donc en voir un ensemble
  différent.

## L’arbre généalogique

Comme chaque remix enregistre son parent, ForkBuild peut dessiner toute la
lignée d’une construction. Sur une **page d’auteur**, vous verrez un **arbre
des remix** :

```
Maison médiévale (original)
└─ Remix de Maison médiévale (par Bob)
   └─ Remix de Remix de… (par Carol)
```

Une belle construction peut ainsi inspirer tout un écosystème de variantes —
et chacun dans la chaîne est crédité.

La page propre d’une construction, ouverte depuis un lien partagé, montre
la même lignée en **Arbre généalogique** : ce dont elle est un remix,
jusqu’à l’originale, puis la construction elle-même, puis les remix qui en
ont été faits, pour autant que cet appareil les connaisse. La page du défi
en montre un pour chaque chaîne de participations. Chaque construction de
l’arbre nomme son auteur et les amis qui l’ont construite avec lui ; son
titre ouvre la construction, et chaque nom la page de cette personne.

## Une boucle créative typique

Voici tout le parcours en un seul enchaînement :

1. **Construisez** quelque chose dans l’Éditeur.
2. **Enregistrez**-le.
3. **Publiez**-le, et envoyez-le à tout le monde ou partagez son lien.
4. Quelqu’un le **trouve** — en cherchant, en explorant les alentours
   dans la Vue du Monde, ou en parcourant votre page d’auteur — et le
   **remixe**.
5. Il **publie** son remix.
6. D’autres **explorent** les deux dans la Vue du Monde, et l’arbre
   grandit.

C’est l’écosystème de construction ouvert pour lequel ForkBuild est fait.

## Et ensuite ?

Gardez la [Référence des commandes](ControlsReference.md) à portée de main
pendant que vous construisez, ou retournez explorer plus en détail
[la Vue du Monde](03-WorldView.md).
