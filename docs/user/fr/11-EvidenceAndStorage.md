<!-- translation-of: docs/user/11-EvidenceAndStorage.md source-hash: 44b0d63b84daefad -->
# 11 — Preuves et stockage

<!-- languages -->
[English](../11-EvidenceAndStorage.md) · [Deutsch](../de/11-EvidenceAndStorage.md) · [Español](../es/11-EvidenceAndStorage.md) · **Français** · [Bahasa Indonesia](../id/11-EvidenceAndStorage.md) · [日本語](../ja/11-EvidenceAndStorage.md) · [한국어](../ko/11-EvidenceAndStorage.md) · [Português (Brasil)](../pt-BR/11-EvidenceAndStorage.md)
<!-- /languages -->

> **Surtout expérimental.** Stocker du contenu sur IPFS ou Arweave depuis
> le bloc **Distribution → Contenu** d’une carte
> ([Créer un placement](#créer-un-placement) et
> [Utiliser un fournisseur préféré](#utiliser-un-fournisseur-préféré)) est
> une fonctionnalité ordinaire. Tout le reste ici est **Expérimental** :
> les preuves externes et les deux parcours de portefeuille, la liste des
> Placements de Snapshot, l’épinglage IPFS distant et Steem. Cela peut
> changer ou être retiré dans une version ultérieure, et ce que cela
> produit pourrait ne pas être conservé. La page marque ces parties d’un
> badge **Expérimental**.

Chaque carte de la page **Publications** (voir
[Publications et preuves externes](09-PublicationsAndEvidence.md)) a des
sections pour prouver *quand* une publication existait et pour placer son
contenu là où d’autres peuvent le récupérer :

- **[Preuves externes](#preuves-externes)** — des enregistrements sur
  Bitcoin, Base, Arweave, Steem ou Blurt attestant que le hash de contenu d’une
  publication existait à un moment donné.
- **[Le parcours d’ancrage Bitcoin](#le-parcours-dancrage-bitcoin)** et
  **[Le parcours d’ancrage Base](#le-parcours-dancrage-base)** — des
  parcours étape par étape qui utilisent votre propre portefeuille pour
  écrire une vraie transaction.
- **[Placements de Snapshot](#placements-de-snapshot)** — des pointeurs
  signés vers l’endroit où le contenu peut être récupéré : IPFS, Arweave
  ou cet appareil.
- **[Publication IPFS](#publication-ipfs)** — l’envoi vers un service
  d’épinglage distant.
- **[Steem](#steem)** — publier, stocker et partager des liens sur Steem.
- **[Blurt](#blurt)** — publier, stocker et ancrer sur Blurt, depuis votre
  propre compte, avec des récompenses.

Les preuves et les placements répondent à des questions différentes. Une
ancre montre qu’un hash a été enregistré à un moment donné ; elle ne dit
rien sur la possibilité de récupérer encore les octets. Un placement dit
où les octets peuvent être récupérés ; il ne dit rien sur le moment où la
revendication a été faite pour la première fois.

## Preuves externes

*Expérimental.*

Une ancre listée ici signifie seulement que cet appareil détient un
enregistrement valablement signé disant « ceci a été enregistré à
l’extérieur ». La réalité de cet enregistrement n’est vérifiée que
lorsque vous cliquez sur **Vérifier les preuves**. Rien sur la page ne
vérifie automatiquement : ni au chargement, ni à l’arrivée d’une preuve,
ni quand vous dépliez la liste.

### Créer des preuves

Dans la section **Distribution** d’une carte de publication, le bloc
**Preuve / Ancrage** (marqué **Expérimental**) a une carte par type de
preuve qu’un clic peut créer, chacune avec son propre bouton : **Créer une
ancre Arweave** et **Créer une ancre Steem**. Les ancres Bitcoin et Base
n’ont pas de telle carte : elles se créent via leurs étapes de
portefeuille dans l’onglet **Détails → Décentralisation et preuves** de la
carte, et le bloc le signale. Quand vous avez enregistré un fournisseur
préféré, ces cartes sont repliées sous **Autres options d’ancrage**, sous
le bouton propre à ce fournisseur (voir
[Ancrer chez un fournisseur préféré](#ancrer-chez-un-fournisseur-préféré)).
Chacune enregistre le hash de contenu de la publication dans une
transaction sur ce réseau, avec l’un de trois résultats :

| Résultat | Signification |
|---|---|
| **Ancre créée** | Cela a fonctionné. La nouvelle ancre apparaît dans la liste, pas encore vérifiée. |
| **Enregistrement refusé** | Le réseau a été joint et a refusé. |
| **Aucune ancre n’a été créée** | Le réseau n’a pas pu être joint, ou cet appareil ne peut pas signer pour lui. |

- Pour Bitcoin, utilisez
  [Le parcours d’ancrage Bitcoin](#le-parcours-dancrage-bitcoin) ; pour
  Base, [Créer une ancre Base en une étape](#créer-une-ancre-base-en-une-étape).
- **Créer une ancre Arweave** nécessite une extension de portefeuille
  Arweave, comme Wander.
- **Créer une ancre Steem** nécessite l’extension Steem Keychain, et votre
  compte Steem défini dans
  [Paramètres réseau → Steem](10-NetworkSettings.md#steem).
- **Créer une ancre Blurt** nécessite l’extension Blurt Keychain (ou
  WhaleVault), et votre compte Blurt défini dans
  [Paramètres réseau → Blurt](10-NetworkSettings.md#blurt).

Une publication faite avant le passage des hashs de contenu en SHA-256
n’est jamais ancrée, ni par ces boutons, ni par les étapes Bitcoin ou
Base, ni par **Ancrer plusieurs publications** : personne d’autre ne peut
vérifier un contenu par rapport à son ancien hash, un enregistrement ne
prouverait donc rien. Vous obtenez **Enregistrement refusé** (ou, pour
Bitcoin et Base, une étape de transaction en échec) indiquant de la
publier de nouveau, avant qu’aucun portefeuille ne soit sollicité. Il en
va de même pour les placements, qui se terminent par **Aucun placement
n’a été créé**.

Après une réussite, le bouton devient **Créer une autre ancre …**, qui
crée une seconde ancre indépendante. Les ancres Base se créent
différemment ; voir
[Créer une ancre Base en une étape](#créer-une-ancre-base-en-une-étape).

**Les ancres Steem sont plus faibles que celles de Bitcoin.** Elles ne
coûtent aucuns frais, seulement des Resource Credits (qui se
rechargent), et le bloc est définitif environ une minute plus tard.
D’ici là, la carte indique **En attente de finalité**, puis **Ancré** (ou,
rarement, **Non ancré** si la chaîne l’a abandonné : recréez-la).
**Vérifier les preuves** indique **Vérification indisponible** pendant
cette première minute, puis précise quand, et par quel témoin, le bloc a
été enregistré. **Inspecter les preuves** affiche immédiatement l’heure du
bloc, à partir d’une copie de l’en-tête de bloc signé que votre appareil
vérifie hors ligne. Un bloc Steem est signé par environ 21 témoins élus
selon leur participation, et non sécurisé par une preuve de travail ; un
nombre suffisant d’entre eux pourrait donc réécrire l’historique ; la
carte indique « Attesté par les témoins de Steem ». Utilisez une ancre
Steem comme preuve rapide et gratuite en complément d’une ancre Bitcoin,
pas à sa place.

**Les ancres Blurt** sont attestées par les témoins de Blurt de la même
façon, et sont tout aussi plus faibles que celles de Bitcoin. Quand cet
appareil a déjà publié le Snapshot de votre construction sur Blurt (en
l’annonçant ou en l’y stockant), cet article est l’ancre : **Créer une
ancre Blurt** ne publie rien et ne coûte rien. Sinon, elle ajoute le hash
de contenu de la construction à votre article Blurt actuel, ou en crée un
nouveau, pour de petits frais en BLURT. La finalité, **Vérifier les
preuves** et **Inspecter les preuves** fonctionnent comme pour Steem, et
la carte renvoie vers l’article.

**Ancrer plusieurs publications à la fois sur Steem.** Sous
**Portefeuille, archives et outils d’éditeur → Ancrage sur blockchain**,
**Ancrer plusieurs publications sur Steem** liste vos publications
cataloguées. Cochez celles que vous voulez (ou **Sélectionner les non
ancrées**) et cliquez sur **Ancrer N publications sur Steem**. Une seule
approbation dans Keychain en ancre jusqu’à 64. Chaque publication obtient
toujours sa propre ancre, vérifiée séparément. **Ancrer plusieurs
publications sur Blurt** fonctionne de la même façon, avec une seule
approbation dans Blurt Keychain.

### Ancrer chez un fournisseur préféré

Le lien **Configurer** du bloc **Preuve / Ancrage** ouvre
[Fournisseur de Preuve / Ancrage](10-NetworkSettings.md#fournisseur-de-preuve--ancrage),
où vous choisissez une valeur par défaut. Une fois choisie, le bloc
commence par un bouton portant son nom, comme **Ancrer sur Steem**, qui y
ancre avec les mêmes résultats que les boutons ci-dessus. Il affiche
**Ancrage…** pendant qu’il travaille et montre la transaction et le hash
de contenu de la nouvelle ancre une fois terminé. Tous les autres types
restent à un clic, sous **Autres options d’ancrage**. Enregistrer une
préférence ne change ni ces boutons ni les ancres existantes.

Il n’y a pas de tel bouton, et toutes les options s’affichent, quand rien
n’est enregistré, quand le fournisseur enregistré n’est pas disponible sur
cet appareil, ou quand c’est Bitcoin : une ancre Bitcoin se crée via ses
étapes de portefeuille (voir
[Le parcours d’ancrage Bitcoin](#le-parcours-dancrage-bitcoin)), et le
bloc le signale.

### Découvrir auprès des pairs

Les pairs connectés ne transmettent que les preuves créées ou
ré-annoncées pendant que vous êtes connecté. **Découvrir auprès des
pairs** comble ce manque : il demande à chaque pair connecté, l’un après
l’autre, toutes les ancres qu’il connaît pour cette publication, y
compris celles qu’il a apprises d’autres. Rien d’autre sur la page ne
contacte un pair.

| Message | Signification |
|---|---|
| *N nouvelles déclarations de preuve découvertes auprès des pairs.* | Elles sont maintenant dans la liste ci-dessous. |
| *Aucune nouvelle déclaration de preuve découverte auprès des pairs.* | Ces pairs n’avaient rien de nouveau. Cela ne veut pas dire qu’aucune preuve n’existe. |
| *Aucun pair authentifié n’était disponible pour être interrogé.* | Connectez-vous d’abord à un pair (voir [Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md)). |
| *L’opération de découverte auprès des pairs demandée n’a pas pu aboutir.* | Quelque chose a échoué localement avant qu’aucun pair ne soit interrogé. |

Les ancres découvertes arrivent non vérifiées, vos résultats de
vérification antérieurs sont conservés, et la même ancre n’est jamais
ajoutée deux fois.

### La liste des preuves

Dans l’onglet **Décentralisation et preuves** de la carte, **Preuves
externes** indique combien d’ancres sont connues et propose **Découvrir
auprès des pairs** (ci-dessus). **Afficher les preuves** liste côte à côte
toutes les ancres connues pour la publication, même celles qui sont en
désaccord. Avec plus d’une ancre, un résumé **Liaison au contenu** vient
en premier, comptant les ancres par hash de contenu, et avertit quand
elles déclarent des hashs différents. Il ne dit pas lequel est le bon.

Chaque ancre affiche :

| Champ | Signification |
|---|---|
| **Localisateur** | Où le système externe dit de trouver l’enregistrement. |
| **Enregistré** | L’heure d’enregistrement déclarée (déclarée tant que vous ne l’avez pas vérifiée). |
| **Publication / Hash du contenu** | Ce que la signature de cette ancre lie ensemble. |
| **Attesté par** | L’identité qui a signé l’ancre. |

- **Vérifier les preuves** (puis **Vérifier de nouveau**) interroge
  maintenant le système externe ; voir
  [Résultats de vérification](#résultats-de-vérification).
- **Inspecter les preuves** montre la déclaration brute : l’heure exacte,
  le localisateur, et pour Bitcoin un lien vers un explorateur de blocs et
  la preuve brute. Elle ne lit que ce qui est sur votre appareil. En bas,
  **Connaissance locale** indique comment cet appareil a appris l’ancre :
  **Acquisition** (*Appris localement*, *Appris par import de paquet* ou
  *Appris par échange entre pairs*) et **Vu pour la première fois par
  cette réplique**. Elle ne nomme jamais le pair et n’est pas un signal de
  confiance.

### Résultats de vérification

| Libellé | Signification |
|---|---|
| **Vérifiée de façon indépendante** | Le système externe confirme exactement ce qui a été déclaré. |
| **Preuve non vérifiée de façon indépendante** | Réellement signée, mais cet appareil ne peut pas vérifier ce type d’ancre à l’extérieur. |
| **Vérification indisponible** | Le système externe n’a pas pu être joint. Ce n’est pas la même chose qu’invalide. |
| **Preuve invalide** / **Signature invalide** | L’enregistrement est mal formé ou n’a pas été réellement signé. |
| **Contenu non correspondant** | L’ancre ne correspond pas à cette publication. |
| **Preuve externe invalide** | Le système externe dit que la déclaration est fausse. |

Si une ancre a été vérifiée plus tôt pendant cette visite et qu’une
vérification ultérieure ne peut pas joindre le réseau, elle garde une
note : « Cette preuve a été vérifiée de façon indépendante auparavant ; la
vérification est actuellement indisponible. »

Les ancres Base, qu’elles soient créées ici ou reçues, se vérifient avec
le même bouton **Vérifier les preuves**.

### Réconciliation des ancres Bitcoin

La carte d’une ancre Bitcoin a aussi une section **Ancre Bitcoin**.
**Réconcilier** (puis **Réconcilier de nouveau**) pose deux questions
distinctes et affiche les deux réponses :

| Confirmation | Signification |
|---|---|
| **Transaction confirmée** | Minée ; affiche la hauteur du bloc, le hash du bloc et les confirmations. |
| **Transaction non confirmée** | Introuvable, ou pas encore minée (les deux ne sont pas distingués). |
| **État de confirmation indisponible** | N’a pas pu être vérifié. |

| Preuve de contenu | Signification |
|---|---|
| **Le hash correspond à l’OP_RETURN** | La transaction porte le hash de contenu déclaré. |
| **Le hash ne correspond pas à l’OP_RETURN** | Ce n’est pas le cas, ou la preuve est mal formée. |
| **Preuve de contenu indisponible** | N’a pas pu être vérifiée. |

Une transaction confirmée dont l’OP_RETURN ne correspond pas est affichée
telle quelle. La confirmation de chaque réconciliation est ajoutée à
**Afficher l’historique des confirmations**, de la plus ancienne à la
plus récente ; la preuve de contenu n’affiche que le dernier résultat.

## Le parcours d’ancrage Bitcoin

Un parcours étape par étape qui utilise votre propre portefeuille Bitcoin
pour écrire le hash de contenu d’une publication dans une vraie
transaction. Chaque étape demande son propre clic.

> **Cela dépense de vrais bitcoins sur le réseau principal Bitcoin.** À
> partir de **Créer le plan de transaction**, cela travaille avec les vrais
> fonds de votre portefeuille, et **Diffuser la transaction** envoie une
> vraie transaction. Il n’y a pas de mode test.

Tous ses panneaux valables pour toute la page se trouvent sous
**Portefeuille, archives et outils d’éditeur → Ancrage sur blockchain**,
le panneau replié en bas de la page Publications ; les étapes propres à
chaque publication sont sur sa carte. Quand une étape demande d’abord
d’observer un portefeuille ou des fonds, son lien ouvre ce panneau pour
vous.

### Ce dont vous aurez besoin

- L’extension de navigateur **UniSat** (`window.unisat`) ; aucun autre
  portefeuille Bitcoin n’est encore pris en charge.
- Un compte détenant des bitcoins dépensables à une adresse **SegWit
  native** (commençant par `bc1q…`). Des fonds sur des adresses Taproot
  (`bc1p…`) ou anciennes (`1…`, `3…`) peuvent être observés mais pas
  signés ; l’examen les signale comme non examinables.
- Une publication sur votre page Publications ; la transaction ancre son
  hash de contenu.

### Connecter un portefeuille

Cliquez sur **Connecter un portefeuille Bitcoin** sur la carte
**Portefeuille Bitcoin** et approuvez la connexion dans l’extension.
ForkBuild ne voit jamais vos clés, votre phrase de récupération ni votre
mot de passe ; il obtient votre adresse, votre réseau et une capacité de
signature tant que vous êtes connecté.

| État | Signification |
|---|---|
| **Connecté** | Affiche le **Compte** et le **Réseau**. |
| **Déconnecté** | Pas encore connecté, ou vous avez refusé. |
| **Portefeuille indisponible** | Pas d’extension, elle est verrouillée, ou elle est injoignable. |

La connexion est utilisée partout sur la page. **Déconnecter** la
supprime, et un rechargement l’oublie. Un portefeuille sur un autre réseau
que le réseau principal est signalé comme non correspondant ; ForkBuild
ne change jamais de réseau à votre place.

### Observer les fonds

Une fois connecté, la carte **Fonds Bitcoin** apparaît. **Observer les
fonds du portefeuille** (puis **Actualiser les fonds**) lit ce que le
compte peut dépenser maintenant. Cela ne dépense et ne réserve rien, et
ne s’actualise pas tout seul.

| État | Signification |
|---|---|
| **Fonds observés** | Le nombre d’UTXO (**Afficher les entrées de fonds** les liste), leur total, le type de script et l’adresse de monnaie rendue (toujours votre propre compte). |
| **Format d’adresse non pris en charge** | Un type d’adresse dont les frais ne sont pas encore pris en charge, comme les anciennes `3…`. |
| **Fonds indisponibles** | La source des fonds n’a pas pu être jointe. |

Si vous vous reconnectez ensuite sur un autre réseau, un avertissement
indique que l’observation est périmée.

### Construire un plan de transaction

Dans l’onglet **Décentralisation et preuves** de la carte de publication,
**Transaction d’ancrage Bitcoin → Créer le plan de transaction** est
activé dès que vous avez observé les fonds. Il planifie à partir de la
dernière observation, en choisissant d’abord les plus gros UTXO, et
calcule les frais.

| État | Signification |
|---|---|
| **Plan de transaction construit** | Réseau, hash du contenu, entrées, frais, monnaie rendue, total des entrées, la liste complète des entrées et des sorties, et quand les fonds ont été observés et le plan construit. |
| **Impossible de construire la transaction** | Le plus souvent, les fonds ne couvrent pas les frais. |

Un nouveau plan remplace tout ce qui a été examiné, signé ou diffusé
avant lui.

### Examiner et signer

Un plan remplit aussitôt le panneau **Examiner la transaction d’ancrage
Bitcoin** : réseau, hash du contenu, frais, monnaie rendue, total des
entrées, entrées et sorties, et si le réseau de votre portefeuille
correspond à cette transaction. **Signer la transaction examinée** (activé
quand un portefeuille correspondant est connecté) demande au portefeuille
de signer. ForkBuild vérifie d’abord que ce qui est signé est toujours
exactement ce que vous avez examiné ; sinon, le portefeuille n’est pas
sollicité.

| État | Signification |
|---|---|
| **Le portefeuille a renvoyé un PSBT signé** | La réponse contient des éléments de signature pour cette transaction. Ils ne sont pas encore vérifiés ; c’est l’étape suivante. |
| **Signature refusée** | Vous ou le portefeuille avez refusé. |
| **Portefeuille indisponible** | Aucun portefeuille connecté, ou il est injoignable. |
| **Échec de la signature** | Le portefeuille a renvoyé quelque chose d’inutilisable. |

### Vérifier et finaliser

**Vérifier et finaliser la transaction** vérifie la signature de façon
cryptographique, hors ligne.

| État | Signification |
|---|---|
| **Transaction finalisée** | La signature est valide. Affiche l’ID de transaction et, sous **Octets bruts de la transaction**, la transaction finalisée. |
| **La signature n’a pas pu être vérifiée** | Mauvaise clé, mauvaise signature, ou signature portant sur de mauvaises données. |
| **Échec de la finalisation** | Un autre résultat inutilisable. |

Seules les entrées SegWit natives (P2WPKH) peuvent être finalisées.
Finaliser enregistre aussi une
[Publication d’ancre Bitcoin](#publications-dancres-bitcoin).

### Diffuser

**Diffuser la transaction** envoie les octets finalisés, sans les
modifier, au réseau Bitcoin.

| État | Signification |
|---|---|
| **Transaction diffusée** | Acceptée par le réseau, mais pas encore minée. |
| **Transaction refusée** | Refusée. |
| **Diffusion indisponible** | Le réseau n’a pas pu être joint. |

**Diffuser de nouveau** renvoie les mêmes octets. Rien ne réessaie tout
seul.

### Observer la confirmation

Après une diffusion, **Observer la confirmation** vérifie si elle a été
minée, avec les trois mêmes résultats que la
[Réconciliation des ancres Bitcoin](#réconciliation-des-ancres-bitcoin).
Chaque vérification est ajoutée à **Afficher l’historique des
confirmations** de cette diffusion. Cette liste est effacée au
rechargement, mais chaque résultat est aussi conservé dans
l’[Archive des observations de publication](12-ArchiveAndLeaderboards.md#larchive-des-observations-de-publication).

### Ce que le parcours ne fait pas

Même une transaction confirmée ne crée pas d’entrée dans **Preuves
externes**, les autres ne peuvent donc pas la découvrir comme preuve. Les
écrans d’examen, de signature et de diffusion sont effacés par un nouveau
plan, une nouvelle signature ou un rechargement. Ce qui est conservé,
c’est l’enregistrement de publication créé à la finalisation, ainsi que
chaque résultat de diffusion et de confirmation dans l’Archive des
observations.

### Publications d’ancres Bitcoin

La carte **Publications d’ancres Bitcoin** liste un enregistrement pour
chaque transaction que cet appareil a finalisée : `{ ID d’ancre, hash du
contenu, txid, réseau, créé le }`. Il est créé quand **Vérifier et
finaliser la transaction** réussit, que la diffusion fonctionne ensuite ou
non, et n’a pas d’état confirmé ou valide propre. **Afficher les
publications** les liste. Chaque ligne a :

- **Inspecter les observations** — le nombre de chaque fait de diffusion,
  de confirmation, de preuve de contenu, de position dans la chaîne et de
  cohérence que l’archive détient pour cet ID d’ancre.
- **Afficher le cycle de vie de la publication** — les mêmes faits dans
  l’ordre chronologique, en commençant par **Enregistrement de publication
  créé**. Une étape sans rien d’enregistré est simplement absente.
  L’ouvrir ne contacte aucun réseau.

## Le parcours d’ancrage Base

La même idée sur **Base**, un réseau compatible Ethereum. Il est distinct
de Bitcoin : son propre portefeuille, sa propre transaction (un transfert
vers soi-même portant le hash du contenu comme données), ses propres
termes.

> **Cela dépense de vrais fonds sur le réseau principal Base, ou des fonds
> de test sur Base Sepolia — selon le réseau de votre portefeuille.**
> ForkBuild ne choisit jamais le réseau à votre place.

### Ce dont vous aurez besoin

- Un portefeuille de navigateur utilisant l’interface standard
  [EIP-1193](https://eips.ethereum.org/EIPS/eip-1193) `window.ethereum`,
  comme Coinbase Wallet ou MetaMask.
- Un compte sur l’ID de chaîne **8453** (réseau principal Base) ou
  **84532** (Base Sepolia). Toute autre chaîne est signalée comme non
  correspondante.
- Une publication sur votre page Publications.

### Connecter un portefeuille et observer un compte

Sur la carte **Réseau Base** (sous **Portefeuille, archives et outils
d’éditeur → Ancrage sur blockchain**), cliquez sur **Connecter un
portefeuille Base** et approuvez. Les états sont **Connecté**,
**Déconnecté** et **Portefeuille indisponible**, comme pour Bitcoin ;
**Déconnecter** supprime la connexion et un rechargement l’oublie.

Ensuite, **Observer le compte Base** (puis **Actualiser l’observation**)
lit la chaîne et le solde du compte :

| Badge | Signification |
|---|---|
| **Compte Base observé** | **Réseau**, **ID de chaîne**, **Compte**, **Solde natif** (en wei), et l’heure d’observation. |
| **Le réseau connecté n’est pas Base** | Affiche l’ID de chaîne réellement trouvé. |
| **Compte Base indisponible** | Le portefeuille n’a pas pu être joint. |

### Construire un plan de transaction

Dans l’onglet **Décentralisation et preuves** de la carte de publication,
**Transaction de publication sur Base → Créer le plan de transaction Base**
(activé dès que vous avez observé un compte) construit un transfert non
signé de votre compte vers lui-même, portant le hash du contenu comme
données.

| État | Signification |
|---|---|
| **Plan de transaction construit** | Réseau, ID de chaîne, hash du contenu, de / à (la même adresse), valeur, nonce, limite de gas, frais max. et frais de priorité (en wei), les données, et quand le compte a été observé et le plan construit. |
| **Réseau Base indisponible** | Le compte, les frais ou le nonce n’ont pas pu être lus. |
| **Impossible de construire la transaction** | Un autre échec. |

Un nouveau plan remplace tout ce qui a été examiné, signé ou diffusé
avant lui.

### Examiner et signer

Un plan remplit aussitôt la **Vérification de la transaction Base** de la
carte : de, à, valeur, nonce, chiffres du gas, hash du contenu et données
de transaction. **Signer la transaction examinée** demande au
portefeuille de signer exactement ce plan.

| État | Signification |
|---|---|
| **Le portefeuille a renvoyé une transaction signée** | Signée, mais pas encore vérifiée. |
| **Signature refusée** | Vous ou le portefeuille avez refusé. |
| **Portefeuille indisponible** | Aucun portefeuille connecté, ou il est injoignable. |
| **Échec de la signature** | Le portefeuille a renvoyé quelque chose d’inutilisable. |

### Créer une ancre Base en une étape

Dans la même carte d’examen, **Créer une ancre Base** signe, finalise et
diffuse la transaction examinée en un clic, puis l’ajoute à la liste des
preuves de la publication. C’est une alternative aux boutons étape par
étape, qui fonctionnent toujours.

| Badge | Signification |
|---|---|
| **Ancre créée** | Diffusée ; la nouvelle ancre apparaît, dépliée, dans la [liste des preuves](#la-liste-des-preuves). |
| **Enregistrement refusé** | La signature, la finalisation ou la diffusion a été refusée. |
| **Aucune ancre n’a été créée** | Le portefeuille ou le réseau n’a pas pu être joint. |

Le bouton devient ensuite **Créer une autre ancre Base**. Il utilise votre
portefeuille et envoie une vraie transaction.

### Vérifier, finaliser et diffuser

**Vérifier et finaliser la transaction** vérifie la signature hors ligne
par rapport au plan examiné et retrouve le signataire.

| État | Signification |
|---|---|
| **Transaction finalisée** | Valide ; affiche le signataire retrouvé et le hash de la transaction. |
| **La signature n’a pas pu être vérifiée** | Mauvaise clé, mauvaise signature, ou mauvaises données. |
| **Finalisation indisponible** / **Échec de la finalisation** | N’a pas pu être vérifiée, ou un autre résultat inutilisable. |

Finaliser enregistre une
[Publication d’ancre Base](#publications-dancres-base). Ensuite,
**Diffuser la transaction** l’envoie : **Transaction diffusée** (avec
l’**ID de transaction** ; pas encore incluse dans un bloc), **Transaction
refusée** ou **Diffusion indisponible**. **Diffuser de nouveau** renvoie
les mêmes octets.

### Observer l’inclusion

Après une diffusion, **Observer la transaction**, dans la section
**Inclusion de la transaction Base**, vérifie si elle est dans un bloc :

| Badge | Signification |
|---|---|
| **Transaction incluse** | Base renvoie un reçu : hash du bloc, numéro de bloc, index de transaction, confirmations. Une réorganisation de la chaîne reste possible et n’est pas détectée. |
| **Transaction non incluse** | Pas encore de reçu (en attente et jamais envoyée ne sont pas distinguées). |
| **État d’inclusion indisponible** | N’a pas pu être vérifié. |

**Observer de nouveau la transaction** ajoute une entrée à **Afficher
l’historique des observations**. Cette liste est effacée au
rechargement, mais chaque observation est aussi conservée dans
l’[Archive des observations de publication](12-ArchiveAndLeaderboards.md#larchive-des-observations-de-publication).

### Publications d’ancres Base

Comme pour Bitcoin, la carte **Publications d’ancres Base** garde un
enregistrement par transaction finalisée : `{ hash du contenu, txid,
réseau, créé le }`. **Afficher les publications** les liste, et
**Afficher le cycle de vie de la publication** montre **Enregistrement de
publication créé** suivi de chaque **Observation d’inclusion nº N**. Les
résultats de diffusion Base ne sont pas enregistrés, il n’y a donc pas
d’entrée de diffusion.

Seul **Créer une ancre Base** ajoute une entrée aux Preuves externes ; le
parcours étape par étape ne le fait jamais.

## Placements de Snapshot

Créer un placement sur IPFS, Arweave ou Local est une fonctionnalité
ordinaire ; la liste de l’onglet **Placements et IPFS** et tout ce qui
suit [Utiliser un fournisseur préféré](#utiliser-un-fournisseur-préféré)
sont *Expérimentaux*.

Un **placement de snapshot** est une déclaration signée selon laquelle un
backend de stockage — **IPFS**, **Arweave**, ou le stockage **Local** de
cet appareil — peut fournir les octets correspondant au hash de contenu
d’une publication. Ce n’est pas une garantie qu’ils y seront demain.
Plusieurs placements, sur différents backends et de différentes
personnes, peuvent coexister ; aucun n’est préféré.

### Créer un placement

Dans la section **Distribution** d’une carte de publication, le bloc
**Contenu** a une carte par backend, avec **Créer un placement Local**,
**Créer un placement IPFS** ou **Créer un placement Arweave**. Quand vous
avez enregistré un stockage préféré, le bloc commence par un bouton pour
celui-ci, comme **Stocker sur IPFS**, et replie ces cartes sous **Autres
options de stockage**. Chacune prend les octets que cet appareil détient
pour la publication et les remet à ce backend :

- **Placement créé** — accepté ; un nouveau placement signé apparaît en
  dessous.
- **Aucun placement n’a été créé** — le backend n’a pas pu être joint, ou
  cet appareil ne détient pas le contenu.

Le bouton devient ensuite **Créer un autre placement …**. En créer un
signifie seulement qu’un backend vient d’accepter les octets.

- **IPFS** nécessite l’API de votre propre nœud IPFS, par défaut à
  `http://127.0.0.1:5001` (modifiable sous
  [Fournisseur de contenu](10-NetworkSettings.md#fournisseur-de-contenu)).
  Sans nœud en marche, vous obtenez **Aucun placement n’a été créé**.
- **Arweave** nécessite une extension de portefeuille, comme Wander.

Vous n’avez pas besoin d’un nœud pour *lire* des placements IPFS :
**Résoudre le Snapshot** et **Matérialiser le Snapshot** utilisent des
passerelles publiques (voir
[Passerelle IPFS](10-NetworkSettings.md#passerelle-ipfs)), vous pouvez
donc récupérer du contenu placé par d’autres.

### Utiliser un fournisseur préféré

**Stocker sur …**, en haut du bloc **Contenu**, et **Utiliser le
fournisseur préféré**, dans l’onglet **Détails → Placements et IPFS** de
la carte, créent un placement sur le backend enregistré sous
[Fournisseur de contenu](10-NetworkSettings.md#fournisseur-de-contenu).
Enregistrer une préférence ne change ni les boutons explicites ni les
placements existants. Sans rien d’enregistré, ou avec IPFS (épinglage
distant) enregistré, le bloc **Contenu** affiche tous les backends au lieu
de **Stocker sur …**.

| Libellé | Signification |
|---|---|
| **Placement créé** | Comme un clic sur le bouton de ce backend. |
| **Aucun placement n’a été créé** | Aucune préférence n’est enregistrée. |
| **Fournisseur préféré introuvable** | Le backend enregistré n’est pas disponible sur cet appareil, ou c’est IPFS (épinglage distant), qui demande un endpoint saisi à chaque fois. |

### La liste des Placements de Snapshot

Dans l’onglet **Placements et IPFS** de la carte, **Afficher les
placements** liste tous les placements connus pour la publication : ceux
que vous avez faits, ceux qu’un pair a envoyés, et ceux contenus dans un
paquet de Plan importé.

| Champ | Signification |
|---|---|
| **Localisateur** | Où le backend dit de trouver les octets. |
| **Placé** | L’heure de placement déclarée. |
| **Publication** / **Hash du contenu** | Ce que la signature du placement lie ensemble. |
| **Placé par** | L’identité qui l’a signé. |

Chacun a jusqu’à trois boutons :

- **Inspecter le placement** — les champs propres au placement, et pour
  IPFS un lien vers une passerelle. Il ne contacte aucun réseau. En
  dessous, **Connaissance locale** montre comment cet appareil l’a appris
  (*Appris localement*, *par import de paquet* ou *par échange entre
  pairs*) et quand il a été **Vu pour la première fois par cette
  réplique**.
- **Résoudre le Snapshot** (puis **Résoudre de nouveau**) — vérifie
  auprès du backend si les octets sont récupérables maintenant, sans les
  stocker.
- **Matérialiser le Snapshot** (puis **Matérialiser de nouveau**) —
  résout et, si cela fonctionne, stocke les octets sur cet appareil (voir
  [Snapshot local](09-PublicationsAndEvidence.md#snapshot-local)). C’est
  vous qui choisissez le placement ; il n’en essaie jamais un autre à
  votre place.

| Résultat de la matérialisation | Signification |
|---|---|
| **Matérialisé** | Récupéré, vérifié et stocké ici. |
| **Déjà disponible** | Cet appareil avait déjà des octets correspondants. |
| **Indisponible pour le moment** | Le backend n’a pas pu être joint ou ne les a pas. |
| **Refusé** | Les octets ne correspondaient pas au hash du placement. |
| **Placement invalide** | L’enregistrement est mal formé ou n’a pas été réellement signé. |

### Résultats de résolution

| Badge | Signification |
|---|---|
| **Contenu disponible** | Le backend a fourni des octets correspondant au hash du contenu. |
| **Aucun backend de stockage configuré** | Cet appareil n’a pas de backend pour ce type de stockage. |
| **Contenu indisponible** | Joint, mais il n’a pas les octets en ce moment. |
| **Le contenu récupéré ne correspond pas à ce placement** | Le backend a fourni de mauvais octets. |
| **Placement invalide** / **Signature invalide** | L’enregistrement est mal formé ou n’a pas été réellement signé. |

Les résultats restent sur cette page pendant cette visite et ne sont pas
partagés. Deux personnes peuvent obtenir des résultats différents pour le
même placement (par exemple, si une seule fait tourner un nœud IPFS). Si
un placement s’est résolu plus tôt pendant la visite et ne peut plus être
joint ensuite, il le note : « Ce snapshot a été résolu avec succès
auparavant ; il est actuellement indisponible. » Une non-correspondance
n’est jamais atténuée de cette façon.

### Relations de placement

Avec plus d’un placement, une carte **Relations de placement** indique le
nombre de backends et d’emplacements distincts, compte les placements par
hash de contenu, et affiche **Liaison au contenu : ACCORD** ou **CONFLIT**
(avec un avertissement). Elle ne se fonde que sur les déclarations, pas
sur le fait que vous les ayez résolues, et un groupe plus grand n’est pas
considéré comme plus probablement correct.

## Publication IPFS

*Expérimental.* La section **Publication IPFS**, sous les Placements de
Snapshot dans l’onglet **Placements et IPFS** de la carte, envoie le
contenu vers un service d’épinglage de votre choix. (Comme l’indique la
section : un nœud Kubo local peut résoudre et publier, une passerelle
distante peut seulement résoudre, et l’épinglage distant peut seulement
publier.) Contrairement à un placement, le résultat n’est pas une
déclaration signée que d’autres peuvent découvrir : c’est la trace qu’un
fournisseur a accepté ces octets. Les résultats à l’écran sont effacés au
rechargement, mais chaque publication réussie et chaque vérification sont
aussi conservées dans
l’[Archive des observations de publication](12-ArchiveAndLeaderboards.md#larchive-des-observations-de-publication).

### Configurer un fournisseur d’épinglage distant

ForkBuild n’est livré avec aucun fournisseur d’épinglage. Cliquez sur
**Configurer la publication distante** (**Reconfigurer la publication
distante** ensuite) :

| Champ | Signification |
|---|---|
| **Endpoint** | L’URL d’envoi du service. Obligatoire. |
| **Identifiant** (facultatif) | Envoyé dans un en-tête `Authorization` de type bearer. Jamais réaffiché ; la carte indique seulement **configuré** ou **non configuré**. |
| **Champ de requête** (facultatif) | Le champ de formulaire du fichier. Par défaut `file`. |
| **Champ de réponse** (facultatif) | Le champ de la réponse qui contient le CID. Par défaut `cid`. |

**Enregistrer la configuration** la conserve pour cette visite
seulement ; elle n’est jamais stockée, et un rechargement ou **Effacer la
configuration** l’abandonne. Annuler laisse la configuration précédente.
Reconfigurer repart de zéro, sans rien de publié chez le nouveau
fournisseur.

### Publier

**Publier sur IPFS distant** (puis **Publier de nouveau**) vérifie la copie
de cet appareil par rapport au hash du contenu et l’envoie.

| Badge | Signification |
|---|---|
| **Publié** | Accepté ; le fournisseur a renvoyé un CID. |
| **Publication refusée** | Refusée, par exemple identifiant incorrect, requête mal formée ou quota atteint. Changez la configuration avant de réessayer. |
| **Publication indisponible** | Le fournisseur n’a pas pu être joint. Réessayez plus tard. |
| **Échec de la publication** | Tout le reste, y compris l’échec préalable d’une vérification d’intégrité locale. |

Un résultat publié affiche le hash du contenu, le localisateur
(`ipfs://<cid>`), l’endpoint et l’heure. Un badge comme **Nostr :
Annoncé** ou **Steem : Non annoncé**, au nom de votre
[Fournisseur d’annonce / de découverte](10-NetworkSettings.md#fournisseur-dannonce--de-découverte),
indique si la publication a aussi été annoncée pour la découverte de
Snapshots, pour que d’autres puissent la trouver comme une publication
depuis un nœud local. **Non annoncé** signifie que seule l’annonce a
échoué.

### Vérifier ce qui a été publié

Après une publication réussie, **Récupération du contenu → Vérifier le
contenu IPFS** (puis **Vérifier de nouveau**) récupère les octets via vos
[passerelles IPFS](10-NetworkSettings.md#passerelle-ipfs) et les compare
au hash enregistré :

| Badge | Signification |
|---|---|
| **Le contenu récupéré correspond au hash de contenu enregistré** | Il correspond. |
| **Le contenu récupéré ne correspond pas au hash de contenu enregistré** | Il ne correspond pas. |
| **Récupération du contenu indisponible** | La passerelle n’a pas pu être jointe ou ne l’a pas. Ce n’est pas une non-correspondance. |
| **Échec de la vérification** | Autre chose s’est mal passé. |

### Historique de publication

Publier de nouveau n’écrase jamais les enregistrements antérieurs.
**Afficher l’historique de publication** liste chaque publication, de la
plus ancienne à la plus récente, avec son localisateur et son heure ;
**Inspecter** montre son localisateur, son hash de contenu, son heure et
sa méthode (aujourd’hui toujours **Fournisseur d’épinglage distant**).
Chaque entrée a son propre bouton **Vérifier le contenu** et **Afficher
l’historique de vérification**, une liste chronologique de chaque
vérification de cet enregistrement.

## Steem

*Expérimental.* ForkBuild peut annoncer, stocker et partager via la
blockchain Steem. Les annonces (de publications, de Snapshots et de
commentaires) sont des réponses à des fils de découverte mensuels comme
[`@forkbuild/forkbuild-snapshot-2026-09`](https://steemit.com/forkbuild/@forkbuild/forkbuild-snapshot-2026-09).
La lecture ne nécessite aucun compte. Tout ce qui est trouvé est vérifié
comme une annonce provenant de Nostr ou d’Arweave ; les votes, les
rémunérations et la réputation n’y changent rien. Les réglages se
trouvent sous [Paramètres réseau → Steem](10-NetworkSettings.md#steem).

### Publier sur Steem

Choisissez **Steem** dans une boîte de dialogue Distribuer, sur la page
Publications ou à côté de **Publier le commentaire**, ou faites-en votre
valeur par défaut sous
[Fournisseur d’annonce / de découverte](10-NetworkSettings.md#fournisseur-dannonce--de-découverte).
Il vous faut l’extension Steem Keychain contenant la clé de **publication**
de votre compte, et le nom de votre compte enregistré sur la page des
réglages Steem. ForkBuild ne voit jamais la clé. Chaque article est une
réponse au fil du mois, avec la rémunération refusée, et Keychain vous
demande de l’approuver. Si le fil du mois n’existe pas encore, rien n’est
publié et vous en êtes informé. Un commentaire est toujours d’abord
enregistré sur cet appareil, et son formulaire vous avertit si le compte
ou Keychain manque.

### Stocker sur Steem

Choisissez **Steem** comme stockage dans une boîte de dialogue Distribuer
ou sur la page Publications. Le Snapshot est compressé et stocké sous
forme de réponses au fil de contenu du mois (comme
`@forkbuild/forkbuild-content-2026-10`), sans frais d’épinglage ni
d’envoi. Les données se trouvent dans les métadonnées de chaque article ;
le texte de l’article est une note d’une ligne. Les anciens articles qui
ont les données dans le texte se chargent toujours.

- **Taille.** Jusqu’à environ 2 500 briques tiennent dans un article. Une
  construction plus grande devient un article d’index plus jusqu’à 20
  articles d’environ 48 Ko, soit jusqu’à environ 30 000 briques. Au-delà,
  c’est refusé avant toute publication, avec une suggestion d’utiliser
  IPFS ou Arweave.
- **Approbation.** Keychain demande une approbation pour chaque article,
  à au moins 4,5 secondes d’intervalle, et la boîte de dialogue affiche la
  progression (« Stockage sur Steem : 3 articles sur 9 publiés »).
- **Resource Credits.** Publier utilise les Resource Credits de votre
  compte, qui se rechargent en cinq jours. Si vous n’en avez pas assez,
  rien n’est publié et on vous indique combien il en faut. La progression
  affiche la part utilisée.
- **Si cela s’arrête en cours de route** (vous refusez, vous manquez de
  crédits, ou vous perdez la connexion), on vous indique combien
  d’articles sont stockés. Distribuez de nouveau avec le même compte et
  seuls les articles manquants sont créés. Rien n’est annoncé tant que
  tous les articles ne sont pas stockés.

La Déclaration signée peut aussi être stockée sur Steem : un article de
plus (et une approbation de plus) dans le même fil, après le Snapshot
quand vous distribuez les deux. Elle est relue et sa signature vérifiée
comme celle d’une déclaration provenant d’Arweave.

### Partager un lien

**Sur Steem.** L’article d’une Déclaration signée affiche une image de
votre construction, son titre, votre nom et sa description, et un lien
« Voir en 3D ». Keychain vous demande d’approuver la signature de l’image,
qui est envoyée sur l’hébergeur d’images de Steemit sans coût en Resource
Credits ; si vous refusez ou qu’elle ne peut pas être créée, l’article
part sans elle. Les mentions, tags et liens de votre titre ou de votre
description sont affichés en texte brut, ils ne notifient donc personne.
Toute personne qui clique sur le lien, même sans avoir jamais utilisé
ForkBuild, arrive dans la Vue du Monde sur votre construction, après que
ForkBuild a vérifié la signature du Monde partagé et que la construction
correspond à son annonce (sinon, la page dit pourquoi). La construction
est ensuite conservée dans son navigateur. Le lien demande que la
construction soit annoncée et pas seulement stockée, ce que fait
Distribuer.

**N’importe où.** Dès qu’une Déclaration signée est stockée sur Steem,
Arweave ou IPFS, **Partager…** et **Copier le lien** apparaissent en
dessous : dans le panneau de publication de la Vue du Monde, dans le
résultat de la boîte de dialogue Distribuer, et sur la page Publications.
**Partager…** ouvre la feuille de partage de votre appareil quand elle
existe ; **Copier le lien** copie le lien, qui est aussi affiché pour une
copie à la main. Le lien s’ouvre sur n’importe quel appareil, à condition
que le Snapshot ait aussi été distribué, et montre la construction là où vous l’avez placée : votre placement signé voyage avec le Snapshot, et le lien le reprend. L’adresse `#/world/…` de votre
barre d’adresse ne fonctionne que dans votre propre navigateur.

- **Arweave :** juste après la distribution, le lien peut mettre quelques
  minutes à s’ouvrir, le temps que l’envoi atteigne les passerelles. La
  page propose **Réessayer**.
- **IPFS sur votre propre nœud :** il ne s’ouvre que tant que votre nœud
  est en ligne et joignable depuis les passerelles publiques. Un service
  d’épinglage ou Arweave le garde disponible quand votre ordinateur est
  éteint.
- Vos amis lisent via les passerelles de leurs propres Paramètres réseau.
  Une passerelle IPFS a jusqu’à 30 secondes pour trouver la déclaration.

## Blurt

*Expérimental.* Blurt est une blockchain issue de Steem, sans votes
négatifs. ForkBuild peut y annoncer, stocker et ancrer, et tout part de
**votre propre compte** sous forme d’articles Blurt ordinaires qui gardent
leur paiement : quand des gens votent pour l’article de votre
construction, vous gagnez des BLURT. Il n’y a ni compte ForkBuild ni fil
commun. Les réglages se trouvent sous
[Paramètres réseau → Blurt](10-NetworkSettings.md#blurt).

### Publier sur Blurt

Choisissez **Blurt** dans une boîte de dialogue Distribuer, sur la page
Publications, à côté de **Publier le commentaire** ou dans le panneau de
nommage, ou faites-en votre choix par défaut sous
[Fournisseur d’annonce / de découverte](10-NetworkSettings.md#fournisseur-dannonce--de-découverte).
Il vous faut l’extension Blurt Keychain (ou WhaleVault) contenant la clé
de **publication** de votre compte, et le nom de votre compte enregistré
sur la page de réglages Blurt. ForkBuild ne voit jamais la clé, et
Keychain vous demande d’approuver chaque article.

- **Un article par construction.** Distribuer crée un article principal
  depuis votre compte, avec les tags `forkbuild` et `forkbuild-snapshot`
  ou `forkbuild-publication`, avec une image de votre construction, son
  titre, votre nom et sa description (entière, jusqu’à 2 000 caractères, avec sa [mise en forme](02-TheEditor.md)), et un lien « Voir en 3D ». Ce qui
  suit dans la demi-heure (l’annonce de la Publication, un commentaire,
  une ancre) est ajouté au même article en le modifiant, pour que vos
  abonnés voient un seul article, pas plusieurs.
- **L’image demande sa propre approbation.** Pour une Déclaration signée,
  Keychain vous demande d’abord de signer l’image de la construction, puis
  d’approuver l’article. Sa seconde fenêtre peut s’ouvrir derrière votre
  navigateur ; ForkBuild attend jusqu’à deux minutes pour chacune.
  L’image va chez l’hébergeur d’images de Blurt, par le serveur de
  rendez-vous de ForkBuild quand le navigateur ne peut pas joindre
  l’hébergeur directement ; si elle ne peut pas être envoyée, l’article
  part sans elle.
- **Cinq minutes entre deux articles.** Blurt accepte un article principal
  par compte toutes les cinq minutes. Si votre compte en a publié un
  récemment (depuis une autre application, par exemple), ForkBuild
  attend, et la boîte de dialogue indique combien de temps.
- **Frais.** Chaque transaction Blurt coûte de petits frais en BLURT, fixés
  par les témoins de Blurt. Si votre compte ne peut pas les payer, rien
  n’est publié et vous en êtes averti.
- **Les autres le trouvent** par Nexus, l’index de recherche de Blurt, qui
  liste chaque article sous les tags de ForkBuild, quel que soit son âge.
  Si aucun nœud Blurt ne propose Nexus, ForkBuild lit le tag, qui liste un
  article pendant une semaine, puis l’historique de votre compte : une
  fois que le ForkBuild de quelqu’un a vu l’un de vos articles, il
  continue de lire les suivants et les précédents.

### Stocker sur Blurt

Choisissez **Blurt** comme stockage dans une boîte de dialogue Distribuer
ou sur la page Publications. La construction est stockée comme sur Steem,
dans des réponses sous l’article de votre construction : jusqu’à environ
2 500 briques dans une réponse, ou jusqu’à 20 réponses de plus pour
jusqu’à environ 30 000 briques. Avant de publier, ForkBuild calcule les
frais et refuse si votre solde ne suffit pas (« Stocker cette construction
sur Blurt coûte environ 0,632 BLURT de frais, et votre compte a
0,100 BLURT »). La boîte de dialogue affiche la progression et les frais.
Si cela s’arrête en cours de route, distribuez de nouveau avec le même
compte, et seules les réponses manquantes sont créées.

La Déclaration signée peut aussi être stockée sur Blurt, sous forme d’une
réponse de plus. Son lien fonctionne comme un lien Steem : quiconque clique
sur « Voir en 3D » arrive dans la Vue du Monde sur votre construction,
après que ForkBuild l’a vérifiée. **Partager…** et **Copier le lien**
apparaissent une fois qu’elle est stockée.
