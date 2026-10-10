<!-- translation-of: docs/user/10-NetworkSettings.md source-hash: 09927c2e29d339ff -->
# 10 — Paramètres réseau

<!-- languages -->
[English](../10-NetworkSettings.md) · [Deutsch](../de/10-NetworkSettings.md) · [Español](../es/10-NetworkSettings.md) · **Français** · [Bahasa Indonesia](../id/10-NetworkSettings.md) · [日本語](../ja/10-NetworkSettings.md) · [한국어](../ko/10-NetworkSettings.md) · [Português (Brasil)](../pt-BR/10-NetworkSettings.md)
<!-- /languages -->

**Paramètres réseau**, dans la barre du haut, donne accès à toutes les
pages qui déterminent avec quels serveurs ForkBuild communique. La plupart
des gens n’ont jamais rien à changer ici : les valeurs par défaut
fonctionnent d’emblée. Venez ici quand un serveur est en panne, quand
vous gérez le vôtre, ou pour choisir où vos publications sont stockées et
annoncées.

Pour ce que chaque serveur apprend sur vous, voir
[Confidentialité](Privacy.md).

## Les pages

| Page | Route | Ce qu’elle règle |
|---|---|---|
| **Fournisseur de contenu** | `/settings/content-provider` | Où **Stocker sur …** et **Utiliser le fournisseur préféré** stockent le nouveau contenu, et vers quel nœud IPFS il va — voir [ci-dessous](#fournisseur-de-contenu) |
| **Fournisseur d’annonce / de découverte** | `/settings/announcement-discovery-provider` | Où vont vos annonces par défaut : Nostr, Arweave, Steem ou Blurt — voir [ci-dessous](#fournisseur-dannonce--de-découverte) |
| **Fournisseur de Preuve / Ancrage** | `/settings/anchor-provider` | Où **Ancrer sur …** ancre — voir [ci-dessous](#fournisseur-de-preuve--ancrage) |
| **Passerelle Arweave** | `/settings/arweave-gateway` | Passerelles pour lire le contenu Arweave — voir [ci-dessous](#passerelle-arweave) |
| **Passerelle IPFS** | `/settings/ipfs-gateway` | Passerelles pour lire le contenu IPFS — voir [ci-dessous](#passerelle-ipfs) |
| **Endpoint Bitcoin** *(expérimental)* | `/settings/bitcoin-esplora` | Le service qu’utilise l’ancrage Bitcoin — voir [ci-dessous](#endpoint-bitcoin) |
| **Relais Nostr** | `/settings/nostr-relay` | Relais pour publier et découvrir via Nostr — voir [ci-dessous](#relais-nostr) |
| **Steem** *(expérimental)* | `/settings/steem` | Votre compte Steem, et d’où Steem est lu — voir [ci-dessous](#steem) |
| **Blurt** *(expérimental)* | `/settings/blurt` | Votre compte Blurt, et d’où Blurt est lu — voir [ci-dessous](#blurt) |
| **Serveurs STUN** / **Serveur TURN** | `/settings/stun`, `/settings/turn-server` | Aide aux connexions entre pairs — voir [TURN](07-PeerConnectionsAndFriends.md#turn--relayer-les-connexions-qui-ne-trouvent-pas-de-chemin-direct) |
| **Serveurs de rendez-vous** | `/settings/rendezvous` | Comment les pairs se trouvent — voir [Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md) |

## Afficher les outils expérimentaux

En haut de la page, **Afficher les outils expérimentaux** affiche les
parties de ForkBuild qui sont **expérimentales** : ici, la page
**Endpoint Bitcoin**, et sur la [page Publications](09-PublicationsAndEvidence.md#la-page-publications), le panneau
**Outils de portefeuille et d’archives**. Il est désactivé tant que
vous ne l’activez pas, et il est enregistré sur cet appareil dès que vous le
changez. Rien de ce qu’il faut pour construire, publier ou partager n’est
masqué.

En dessous, **Portefeuilles** propose un interrupteur pour chaque
portefeuille avec lequel ForkBuild peut ancrer : **Portefeuille Bitcoin** et
**Portefeuille Base**. Chacun est désactivé tant que vous ne l’activez pas, et
il est enregistré sur cet appareil. Tant que l’un est désactivé, la page
Publications ne propose ni ne charge les étapes de ce portefeuille, et
Bitcoin n’est pas proposé comme
[fournisseur de preuve / ancrage](#fournisseur-de-preuve--ancrage). Les ancres déjà
créées sur Bitcoin ou Base sont vérifiées et affichées dans tous les cas.
Désactiver un portefeuille prend effet à la prochaine ouverture de la page
Publications.

## Comment se comporte chaque page

- **Rechargez après avoir enregistré.** Les modifications prennent effet
  au prochain chargement de l’application (les comptes Steem et Blurt
  sont les exceptions). Une Vue du Monde ou un Éditeur ouvert continue d’utiliser
  les anciens réglages jusqu’au rechargement.
- Chaque page a son propre **Enregistrer**. Un enregistrement qui échoue
  indique la raison et laisse le réglage précédent tel quel ; un
  enregistrement réussi affiche « Enregistré. ».
- Les listes de choix sont affichées par ordre alphabétique.
- **Les listes de serveurs ont des valeurs par défaut.** Les pages
  Passerelle Arweave, Passerelle IPFS, Endpoint Bitcoin, Relais Nostr,
  Steem, Blurt, STUN et Rendez-vous commencent avec plusieurs serveurs publics
  gratuits, pour que tout continue de fonctionner quand l’un d’eux est en
  panne. La page indique si elle utilise les valeurs par défaut ou vos
  valeurs enregistrées. Sans rien d’enregistré, la zone de texte contient
  les valeurs par défaut, une par ligne, prêtes à être modifiées.
  **Enregistrer** reste désactivé tant que vous ne changez rien, pour que
  vous continuiez à recevoir les valeurs par défaut améliorées des
  versions suivantes. **Rétablir les valeurs par défaut** supprime votre
  liste.
- **La validation ne vérifie que le format.** Enregistrer refuse tout ce
  qui n’est pas une URL bien formée du bon type, mais ne vérifie pas que
  le serveur fonctionne ; un mauvais serveur se manifeste plus tard par
  une lecture qui échoue.
- **Les valeurs par défaut sont des services tiers.** Chacun voit votre
  adresse IP et ce que l’application lui demande. Le contenu lu via une
  passerelle est vérifié par rapport à son hash de contenu, une passerelle
  ne peut donc pas substituer d’autres octets.

## Fournisseur de contenu

Choisissez sur quel stockage **Stocker sur …** (le premier bouton du bloc
**Contenu** d’une publication) et **Utiliser le fournisseur préféré**
créent un Placement de Snapshot (voir
[Utiliser un fournisseur préféré](11-EvidenceAndStorage.md#utiliser-un-fournisseur-préféré)),
parmi les backends que cet appareil a enregistrés, et cliquez sur
**Enregistrer**. **Local** n’est pas proposé, puisque chaque publication
est déjà stockée sur cet appareil.

**IPFS (épinglage distant)** *(expérimental)* est toujours proposé. Il
utilise le service configuré dans **Service d’épinglage distant**, plus
bas : s’il y en a un, **Stocker sur IPFS (épinglage distant)** et
**Utiliser le fournisseur préféré** y placent le contenu, comme un
placement IPFS ordinaire ; sinon, ils indiquent qu’aucun n’est configuré.
Le choisir présélectionne aussi l’épinglage distant comme stockage dans
chaque boîte de dialogue **Distribuer**.

Une seconde section, **Nœud IPFS**, règle le nœud auquel sont envoyés les
nouveaux placements IPFS. Par défaut, c’est un nœud Kubo local à
`http://127.0.0.1:5001`. Saisissez l’URL de l’API d’un autre nœud et
**Enregistrer**, ou **Utiliser la valeur par défaut du déploiement** pour
revenir en arrière. Cela n’affecte pas la lecture du contenu IPFS, qui
utilise la liste de [Passerelle IPFS](#passerelle-ipfs).

Une troisième section, **Service d’épinglage distant** *(expérimental)*,
règle le service vers lequel IPFS (épinglage distant) envoie : son
**Adresse** et, si le service en a besoin, le **Champ de la requête** pour
le fichier et le **Champ de la réponse** qui contient le CID.
**Enregistrer** les conserve sur cet appareil. Le **Jeton** n’est gardé que
jusqu’à la fermeture ou au rechargement de la page, et n’est jamais
enregistré ; un service qui en a besoin refuse les envois tant que vous ne
l’avez pas saisi. Chaque boîte de dialogue **Distribuer** et la page
Publications partent de ce service, et vous pouvez encore le changer là.
**Oublier le service** le retire.

## Fournisseur d’annonce / de découverte

Choisissez **Arweave**, **Blurt** (expérimental), **Nostr** ou **Steem** (expérimental) comme
endroit par défaut où sont annoncés vos publications (Mondes partagés,
Attributions de plans et propositions de noms de lieux), vos Snapshots et
vos commentaires. Ce n’est qu’une valeur par défaut : chaque boîte de
dialogue **Distribuer**, le sélecteur de Distribution de chaque carte du
Dépôt et le sélecteur de réseau à côté de **Publier le commentaire**
démarrent dessus, et vous pouvez en changer pour une action. Chercher le
contenu des autres les interroge toujours tous.

Une seconde section, **Commentaires**, donne aux commentaires leur propre
choix par défaut. **Comme le fournisseur d’annonce / de découverte
ci-dessus**, le réglage initial, les garde sur le choix ci-dessus.
Choisissez plutôt un réseau, ou **Local et pairs uniquement** pour garder
les commentaires hors de tout réseau, sans compte réseau nécessaire. Chaque
formulaire de commentaire démarre dessus, et vous pouvez toujours changer un
commentaire à côté de **Publier le commentaire**.

## Fournisseur de Preuve / Ancrage

Choisissez où **Ancrer sur …** (le premier bouton du bloc
**Preuve / Ancrage** d’une publication) crée des preuves externes :
**Arweave**, **Bitcoin** *(expérimental)*, **Blurt** *(expérimental)* ou **Steem** *(expérimental)*, selon ce que cet appareil a
enregistré. Base n’est jamais proposé, car chaque ancre Base exige que
vous examiniez et signiez une transaction de portefeuille. Avec Bitcoin, il
n’y a pas de bouton **Ancrer sur …** : le bloc affiche toutes les options
et renvoie vers les étapes du portefeuille ; voir
[Le parcours d’ancrage Bitcoin](11-EvidenceAndStorage.md#le-parcours-dancrage-bitcoin)
pour de vraies ancres Bitcoin.

## Passerelle Arweave

Passerelles pour lire le contenu Arweave, une URL `http://` ou `https://`
par ligne. Les valeurs par défaut sont `https://arweave.net`,
`https://ardrive.net` et `https://permagate.io`.

Elles sont essayées dans l’ordre : une lecture ne passe à la passerelle
suivante que si la passerelle actuelle est injoignable ou renvoie une
erreur. Le contenu Arweave est adressé par son id de transaction, si bien
que toutes les passerelles renvoient les mêmes octets.

Cette liste sert à récupérer le contenu d’une publication depuis une
source décentralisée et à résoudre ou matérialiser un Placement de
Snapshot Arweave. Elle ne change pas l’endroit où votre propre contenu est
envoyé. Les ancres Arweave utilisent la première passerelle de la liste
pour créer et vérifier.

## Passerelle IPFS

Passerelles pour lire le contenu IPFS, une URL par ligne, essayées dans
l’ordre comme celles d’Arweave. Les valeurs par défaut sont
`https://ipfs.filebase.io`, `https://gateway.pinata.cloud`, `https://ipfs.io`, `https://dweb.link` et `https://4everland.io`.

Cette liste sert à résoudre ou matérialiser un Placement de Snapshot IPFS,
pour **Vérifier le contenu IPFS**, pour ouvrir les liens partagés vers du contenu sur IPFS, et
quand le Dépôt et le défi hebdomadaire lisent des constructions trouvées
sur les réseaux dont la Déclaration signée est sur IPFS. Elle ne change pas
l’endroit où votre propre contenu est épinglé.

Certaines passerelles, dont `https://ipfs.io` et `https://dweb.link`,
refusent les requêtes des pages web pour certains contenus, ou les
bloquent derrière une vérification anti-robots ; les valeurs par défaut
sont gérées par des opérateurs différents, donc une lecture passe à la
suivante. Si **Vérifier** ou **Résoudre** échoue sans cesse avec « Failed to fetch » pour
un contenu que vous savez présent, ajoutez en tête la passerelle de votre
service d’épinglage. Une liste enregistrée avant le 8 octobre 2026 garde
son propre ordre : **Rétablir les valeurs par défaut** ramène les
nouvelles.

## Endpoint Bitcoin

*Expérimental.* L’API compatible Esplora qu’utilise l’ancrage Bitcoin pour
diffuser les transactions, vérifier les confirmations, consulter les fonds
du portefeuille et vérifier la preuve OP_RETURN d’une ancre. Une URL
`http://` ou `https://` par ligne ; les valeurs par défaut sont
`https://blockstream.info/api` et `https://mempool.space/api`.

Une consultation utilise le premier endpoint qui répond. Une diffusion ne
passe à l’endpoint suivant que si le précédent était injoignable, jamais
après qu’un endpoint a refusé la transaction.

## Relais Nostr

Les relais de tout ce que ForkBuild publie ou découvre via Nostr :
publications (Mondes partagés, Attributions de plans et propositions de
noms de lieux), Snapshots et commentaires. Une URL `ws://` ou `wss://` par
ligne ; les valeurs par défaut sont `wss://relay.damus.io`, `wss://nos.lol`
et `wss://relay.primal.net`. **Enregistrer** remplace toute la liste, et
la refuse si une ligne n’est pas une URL valide.

Contrairement aux passerelles, les relais ne sont pas essayés dans
l’ordre : les annonces vont à tous les relais à la fois et la découverte
interroge tous les relais, si bien que chaque relais supplémentaire rend
votre contenu trouvable par plus de monde, même quand un autre est en
panne. Il n’y a pas d’état par relais ici ; un résultat de **Distribuer**
liste une ligne **Découverte** par relais.

## Steem

**Publier sur Steem depuis cet appareil**, dans la partie publication, est désactivé sur un nouvel
appareil. Tant qu’il l’est, ForkBuild ne propose pas Steem quand vous
publiez, commentez, nommez un lieu, stockez une construction ou créez un
ancrage, n’y publie rien et masque le champ du compte. Un appareil qui
avait déjà un compte Steem enregistré démarre avec l’option activée. Les
constructions et commentaires déjà sur Steem sont trouvés et affichés dans
tous les cas.

*Expérimental.* Définissez **Votre compte Steem** sous **Publication**
(cela s’applique immédiatement, sans rechargement), nécessaire pour
publier ou stocker sur Steem — voir
[Steem](11-EvidenceAndStorage.md#steem). Lire depuis Steem ne nécessite
aucun compte. Le reste de la page règle d’où Steem est lu :

- **Nœuds API**, une URL `https://` par ligne (valeurs par défaut
  `https://api.steemit.com`, `https://api.justyy.com` et `https://steemd.steemworld.org`), essayés dans
  l’ordre.
- **Comptes des fils**, un par ligne (par défaut `forkbuild`) : les
  comptes dont les fils de découverte mensuels sont lus. Ajoutez-en un
  autre si une communauté gère ses propres fils.
- **Premier mois à lire** (par défaut septembre 2026) : ForkBuild lit
  chaque mois de là jusqu’à aujourd’hui, dans la limite des 36 derniers
  mois.

Quand aucun nœud Steem n’est joignable, **Rechercher de nouveaux
commentaires** et la découverte de Snapshots indiquent que Steem est
indisponible plutôt que de signaler que rien n’a été trouvé.

## Blurt

**Publier sur Blurt depuis cet appareil**, dans la partie publication, est désactivé sur un nouvel
appareil. Tant qu’il l’est, ForkBuild ne propose pas Blurt quand vous
publiez, commentez, nommez un lieu, stockez une construction ou créez un
ancrage, n’y publie rien et masque le champ du compte. Un appareil qui
avait déjà un compte Blurt enregistré démarre avec l’option activée. Les
constructions et commentaires déjà sur Blurt sont trouvés et affichés dans
tous les cas.

*Expérimental.* Définissez **Votre compte Blurt** sous **Publication**
(cela s’applique immédiatement, sans rechargement), nécessaire pour
publier, stocker ou ancrer sur Blurt — voir
[Blurt](11-EvidenceAndStorage.md#blurt). Lire depuis Blurt ne nécessite
aucun compte. Le reste de la page règle d’où Blurt est lu :

**Nœuds API**, une URL `https://` par ligne (valeurs par défaut
`https://rpc.blurt.blog`, `https://rpc.beblurt.com` et `https://rpc.drakernoise.com`), essayés dans
l’ordre. ForkBuild trouve les articles par Nexus, l’index de recherche de
Blurt, qui garde chaque article quel que soit son âge, et ignore un nœud
qui ne le propose pas. Quand aucun nœud ne propose Nexus, il se rabat sur
la liste de tags de Blurt elle-même, qui ne garde un article que jusqu’à
son paiement, au bout de sept jours, et trouve les articles plus anciens
dans l’historique des comptes qu’il a vus publier sous le tag sur cet
appareil. Même quand Nexus répond, ForkBuild lit aussi la liste de tags,
au cas où Nexus omettrait un article ; si c’est le cas, il lit aussi
l’historique de ce compte, pour que ses articles plus anciens ne manquent
pas non plus.

Quand aucun nœud Blurt n’est joignable, **Rechercher de nouveaux
commentaires** et la découverte de Snapshots indiquent que Blurt est
indisponible plutôt que de signaler que rien n’a été trouvé.
