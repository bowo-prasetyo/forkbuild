<!-- translation-of: docs/user/04-PublishingAndForking.md source-hash: c477db500c6a8d08 -->
# 04 — Publier et forker

<!-- languages -->
[English](../04-PublishingAndForking.md) · [Deutsch](../de/04-PublishingAndForking.md) · [Español](../es/04-PublishingAndForking.md) · **Français** · [Bahasa Indonesia](../id/04-PublishingAndForking.md) · [日本語](../ja/04-PublishingAndForking.md) · [한국어](../ko/04-PublishingAndForking.md) · [Português (Brasil)](../pt-BR/04-PublishingAndForking.md)
<!-- /languages -->

C’est le cœur de ForkBuild. **Publier** partage votre création avec le
monde. **Forker** permet à n’importe qui de copier une création et de la
faire évoluer — en conservant tout l’historique.

## Publier votre création

1. Construisez quelque chose dans l’Éditeur.
2. Connectez-vous et vérifiez que votre identité est déverrouillée (voir
   [Identité et connexion](05-IdentityAndLogin.md)). Publier signe la
   création avec elle. Si vous n’êtes pas connecté, **Publier** vous demande
   d’abord de vous connecter ou de créer une identité ; **Publier sans
   signer** la publie alors sans auteur et sans lien.
3. Donnez-lui un titre — Publier refuse une création sans titre ou vide —
   et, si vous le souhaitez, une description et une licence : cliquez sur
   **✎** à côté du titre du document dans la barre latérale pour ouvrir
   **Propriétés du document**. Un nouveau document n’a pas de licence,
   personne ne peut donc le forker tant que vous n’en choisissez pas une.
4. Appuyez sur **Enregistrer** pour qu’elle soit stockée.
5. Cliquez sur **Publier**.

Votre création apparaît maintenant dans **votre propre Dépôt** sur cet
appareil, où vous pouvez la chercher, l’ouvrir et la forker, avec votre
nom comme auteur. Les autres ne la voient qu’une fois que vous la
partagez ou la distribuez (voir la remarque ci-dessous). Elle reçoit aussi
automatiquement une position dans le monde partagé, pour qu’**Explorer**
ait toujours un endroit où emmener les gens — voir
[Trouver des mondes](03-WorldView.md#trouver-des-mondes).

> **Remarque :** publier ne stocke votre Document/Monde que sur cet
> appareil. Sa carte dans le Dépôt indique où cet appareil a enregistré sa
> distribution (par exemple **Stocké sur IPFS · Annoncé sur Nostr**), ou
> **Aucune distribution enregistrée sur cet appareil**. Sauvegardez-la
> dans [Vos données](13-YourData.md) pour en garder une copie en
> attendant.
> Publier n’envoie jamais rien nulle part de soi-même. Un
> [lien](#partager-un-lien) que vous copiez apporte la construction à qui
> vous le donnez. Deux étapes
> distinctes et facultatives le font : **Distribuer**, décrite ci-dessous,
> envoie la publication sur Arweave ou IPFS et l’annonce sur Nostr ou
> Arweave pour que d’autres puissent la trouver sans être connectés à
> vous ; et
> [**Partager avec les pairs**](#partager-avec-les-pairs-connectés) la
> propose aux personnes auxquelles vous êtes connecté.

## Partager un lien

Dès que **Publier** réussit, l’avis de l’Éditeur affiche aussi
**Partager…** (là où votre appareil a un menu de partage), **Copier le
lien** et **Enregistrer l’image**, avec le lien en dessous. Les mêmes
boutons se trouvent sous **Mon Monde partagé** dans la Vue du monde.

- **La construction voyage dans le lien.** Rien n’a besoin d’être distribué
  d’abord, et aucun portefeuille ni compte n’intervient : le lien
  porte votre Monde partagé signé et la construction elle-même. Quiconque
  l’ouvre, sur n’importe quel appareil, arrive dans la Vue du monde sur
  votre construction, et **Modifier une copie** la fait sienne. ForkBuild
  vérifie la signature, et que la construction lui correspond, avant de
  montrer quoi que ce soit ; un lien modifié ou tronqué le signale.
- **Il montre ce qu’il est.** Collé dans une messagerie, un courriel ou
  une publication, le lien affiche le titre de votre construction, votre nom
  et une image de la construction, dessinée par le serveur de liens de
  ForkBuild, qui envoie ensuite quiconque l’ouvre vers ForkBuild. Un lien
  modifié n’affiche que « A shared build ».
- **Il faut une signature.** Publiez en étant connecté ; une création
  publiée sans être connecté n’obtient pas de lien.
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

Copier ou partager un lien, et en ouvrir un, sont comptés anonymement,
comme la visite quotidienne ; voir
[Comptage quotidien des visiteurs](13-YourData.md#comptage-quotidien-des-visiteurs).

## Distribuer directement depuis l’Éditeur

Dès que **Publier** réussit, l’Éditeur affiche un petit avis sur place —
« Monde partagé publié avec succès. » — avec un bouton **Distribuer** à
côté, et **Ignorer** pour le faire disparaître sans rien faire. Cliquer
sur **Distribuer** ouvre une boîte de dialogue **Distribuer** plutôt que
d’encombrer l’écran de sélecteurs et de résultats dont vous n’avez besoin
que de temps en temps ; la fermer (**Fermer**, un clic à l’extérieur ou
Échap) ne perd jamais rien de ce qu’elle a produit — la rouvrir affiche
exactement le même résultat, la même erreur ou le même état en cours.

C’est la même boîte de dialogue que celle de la Vue du Monde — ses
réglages **Stockage** et **Support d’annonce / de découverte**, le bouton
**Distribuer** combiné, et les boutons distincts **Distribuer le Snapshot
seulement** / **Distribuer la Déclaration signée seulement** fonctionnent
tous comme décrit dans
[Rencontres dans le Monde](03-WorldView.md#rencontres-dans-le-monde--publications-et-avatars-que-vos-pairs-partagent).
Deux choses diffèrent ici : elle agit toujours sur le Monde partagé exact
que votre clic sur Publier vient de produire, et la section **Snapshot**
vient en premier, si bien que le bouton combiné exécute d’abord le
Snapshot, puis la Déclaration signée.

Le résultat de la Déclaration signée apparaît dans sa propre section :

| Champ | Signification |
|---|---|
| **Monde partagé** | L’id du Monde partagé — confirme de quel Monde partagé parle ce résultat. |
| **Contenu** | L’emplacement produit par l’envoi, ou « Pas encore envoyé » s’il n’a pas abouti. |
| **Découverte** | L’id de l’annonce, ou « Pas encore annoncé » si elle n’a pas abouti — une ligne par relais quand plusieurs sont configurés. |
| **Dépôt** | Un bouton **Explorer** qui mène directement à la page de cette publication dans la Vue du Monde — affiché dès que la publication a un endroit à explorer, c’est-à-dire en pratique toujours. |

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

Comme tous les autres boutons de distribution de cette application,
distribuer demande une extension de navigateur capable de signer — un
portefeuille Arweave (comme Wander) ou une extension Nostr (comme nos2x) ;
sans elle, cela se termine par un simple avis « …n’a pas pu aboutir ».
Publier ne distribue jamais rien de soi-même : la distribution n’a lieu
que lors de ce clic ultérieur, distinct et explicite. Publier de nouveau
remplace tout l’avis par un nouveau pour la nouvelle publication ;
l’ignorer, ou quitter la page, l’efface — ni l’avis ni le résultat de
l’une ou l’autre section ne sont mémorisés nulle part.

## Partager avec les pairs connectés

Un Monde que vous publiez n’est listé que dans *votre* Dépôt, jusqu’à ce
que vous le distribuiez sur Nostr, Arweave, Steem ou Blurt (voir
[Distribution](Distribution.md)) : le Dépôt de chacun le trouve alors (voir
[Créations distribuées par d’autres](#créations-distribuées-par-dautres)).
Pour le
mettre dans le Dépôt de quelqu’un à qui vous êtes connecté (voir
[Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md)),
cliquez sur **Partager avec les pairs** sous ce Monde dans le Dépôt. Le
bouton n’apparaît que sur vos propres Mondes publiés.

- Partager propose le Monde à toutes les personnes connectées en ce
  moment, et à toutes celles qui se connecteront plus tard. **Partagé ✓ ·
  Partager de nouveau** l’annonce de nouveau aux personnes connectées
  maintenant.
- De leur côté, un Monde partagé par l’un de leurs **Amis** ou **Pairs
  connus** est ajouté de lui-même à leur Dépôt, avec tout ce qu’il faut
  pour l’**Explorer**. Un Monde partagé par quelqu’un d’autre attend sous
  **Partagés avec vous** en haut de leur Dépôt jusqu’à ce qu’ils cliquent
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

Une création publiée est toujours affichée avec une licence, choisie dans
la boîte de dialogue **Propriétés du document** :

| Licence | Signification |
|---|---|
| **CC0 1.0 — Domaine public** | Aucun droit réservé — chacun peut en faire ce qu’il veut |
| **CC BY 4.0 — Attribution** | Chacun peut la forker et la réutiliser, en vous citant |
| **CC BY-SA 4.0 — Attribution, Partage dans les mêmes conditions** | Les forks doivent garder la même licence |
| **CC BY-NC 4.0 — Attribution, Pas d’utilisation commerciale** | Les forks sont autorisés, l’usage commercial ne l’est pas |
| **CC BY-ND 4.0 — Attribution, Pas de modification** | Consultable, mais **les forks ne sont pas autorisés** |
| **Tous droits réservés** | Consultable, mais les forks ne sont pas autorisés |
| **Aucune licence indiquée** | Les forks ne sont pas autorisés tant que vous n’en définissez pas une |

Si vous laissez une création sans licence, les gens peuvent toujours
l’ouvrir et l’explorer — ils ne peuvent simplement pas la forker tant que
vous ne choisissez pas une licence qui le permet.

## Choisir qui peut le placer

Les autres peuvent normalement placer votre création publiée dans leurs
propres Mondes. Cela ajoute un placement de votre construction, jamais une
copie, et cela ne déplace ni ne modifie jamais la vôtre (voir
[Pourquoi puis-je placer les constructions des autres ?](03-WorldView.md#pourquoi-puis-je-placer-les-constructions-des-autres-)).
Forker est distinct et régi par la licence (voir
[Placer ou forker](03-WorldView.md#placer-ou-forker)).
Si vous préférez qu’ils ne la placent pas, ouvrez **Propriétés du
document** et réglez **Qui peut le placer dans le Monde** :

| Réglage | Signification |
|---|---|
| **Tout le monde peut le placer** | Par défaut. Chacun peut la placer où il veut dans son propre Monde |
| **Moi seul peux le placer** | Vous seul pouvez la placer. Les autres peuvent toujours la trouver, la voir et (si la licence le permet) la forker, mais ForkBuild ne les laissera pas la placer |

Le réglage est signé avec la publication au moment où vous publiez,
personne ne peut donc le retirer ni le changer ensuite. Cela veut aussi
dire qu’il ne s’applique qu’à ce que vous publiez après l’avoir choisi.
Une publication déjà sortie garde le réglage avec lequel elle a été
publiée : publiez de nouveau si vous voulez que le nouveau s’applique.

Il fonctionne comme l’autorisation de fork de la licence : chaque copie de
ForkBuild le respecte, mais ce n’est pas un verrou. Quelqu’un qui aurait
modifié le code de l’application pourrait l’ignorer, et il ne peut pas
annuler un placement fait avant que vous le choisissiez.

Dans tous les cas, les autres voient votre construction là où *vous*
l’avez mise dès que vous **Distribuez** son Snapshot depuis la Vue du
Monde ou juste après la publication dans l’Éditeur : l’annonce porte votre placement signé, et leur ForkBuild affiche
la construction à cet endroit dès qu’il connaît votre Monde partagé.
Déplacez-la et distribuez de nouveau, et elle se déplace aussi chez eux.

## Modifier une création publiée

Une création publiée est **immuable** — elle ne peut jamais changer après
coup. Pour la développer, **Forkez**-la (ci-dessous), ou utilisez
**Modifier une copie** dans la Vue du Monde. Dans la Vue du Monde, votre
première modification d’un monde publié — ses métadonnées, le nom d’un
point de repère ou d’une région, ou une décoration animale — crée
automatiquement votre propre copie, intitulée *« Fork de &lt;nom
d’origine&gt; »*, avec une courte confirmation (« Votre propre copie
modifiable a été créée — … reste inchangé ») ; voir
[Enregistrer et publier ici aussi](03-WorldView.md#enregistrer-et-publier-ici-aussi).

L’original n’est jamais touché, quoi que vous changiez dans votre copie.

## Le Dépôt

Le **Dépôt** est le catalogue, avec recherche, de toutes les créations
publiées que cet appareil connaît : les vôtres, celles que des pairs ont
partagées avec vous, et celles trouvées sur des réseaux décentralisés. Il
est conçu pour rester utilisable qu’il contienne dix créations ou dix
mille.

### Constructions toutes prêtes

En haut, **Partir d’une construction toute prête** montre les
constructions fournies avec ForkBuild : un château fort, une île du port,
une place du village, une maison, un moulin et un pont. Elles sont là
avant même que quoi que ce soit soit publié ou trouvé. Cliquez sur l’une
d’elles (**Remixer**) pour ouvrir votre propre copie dans l’Éditeur ; rien
n’est publié tant que vous ne la publiez pas. Cliquez sur le titre pour
replier la rangée.

### Créations distribuées par d’autres

Chaque fois que vous ouvrez le Dépôt (ou une page d’auteur), il cherche sur
Nostr, Arweave, Steem et Blurt les créations que d’autres personnes y ont
distribuées, et ajoute celles qu’il peut vérifier. Une ligne au-dessus de
la liste indique ce qu’il fait, puis combien de nouvelles créations il a
trouvées ; **Vérifier à nouveau** cherche encore une fois.

- Seule une création dont l’enregistrement signé est vérifié est ajoutée :
  signé par la clé qu’il nomme, et exactement la création annoncée. Tout le
  reste est ignoré, et un enregistrement qui a échoué n’est pas récupéré de
  nouveau.
- Il vérifie jusqu’à 20 nouvelles créations à la fois. S’il y en a plus,
  la ligne indique combien il en reste pour la prochaine fois.
- Une création trouvée ainsi reste dans votre Dépôt après un
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

Chaque création propose trois actions :

| Bouton | Ce qu’il fait |
|---|---|
| **Ouvrir** | Charger ce document dans l’Éditeur |
| **Forker** | Le copier dans votre propre création modifiable |
| **Explorer** | Aller le voir dans la Vue du Monde |

(Le bouton **Continuer l’exploration** de **Mes mondes** — voir
[Mes mondes](03-WorldView.md#mes-mondes--les-mondes-où-vous-êtes-vraiment-allé)
— fait la même chose qu’**Explorer** ici, simplement formulé pour un Monde
déjà visité plutôt que pour un Monde que vous découvrez.)

Cliquez sur le **nom d’un auteur** pour ouvrir sa **page d’auteur** — un
portfolio de tout ce qu’il a créé, y compris ses originaux et tous les
forks qui en sont nés, avec exactement le même catalogue de recherche, de
tri et de pagination que le Dépôt, simplement limité à cet auteur.

Une carte dont la signature est valide a aussi un bouton **Suivre**, et
une page d’auteur affiche **Signé par …** avec **Suivre** pour chaque
identité qui a publié sous ce nom. Suivre quelqu’un place ses nouvelles
créations sur votre page **Abonnements** et dans vos notifications ; voir
[Suivre des personnes](07-PeerConnectionsAndFriends.md#suivre-des-personnes).

Le Dépôt ne se limite pas non plus à ce qui a été publié depuis cet
appareil ou découvert directement : une création décentralisée qu’un pair
vous a montrée sur la carte des
[Rencontres dans le Monde](03-WorldView.md#rencontres-dans-le-monde--publications-et-avatars-que-vos-pairs-partagent)
de la Vue du Monde, une fois son contenu réellement résolu, rejoint aussi
cette recherche et la page de son auteur, et y reste après un
rechargement. Elle n’est affichée d’aucune façon différente du reste.

## Forker : faites-le vôtre

**Forker** est ce qui rend ForkBuild unique. Quand vous forkez une
création :

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
[Modifier une création publiée](#modifier-une-création-publiée)
ci-dessus.)

> **Aussi appelé « Modifier une copie » dans la Vue du Monde.** C’est la
> même opération sous-jacente dans les deux cas, avec les mêmes règles de
> licence et la même gestion de
> [Fork impossible](#quand-un-fork-ne-peut-pas-aboutir). Voir
> [Modifier une copie](03-WorldView.md#modifier-une-copie--emporter-quelque-chose-dans-léditeur)
> pour la présentation propre à la Vue du Monde.

### Comment forker

1. Trouvez une création dans le **Dépôt** (ou dans la Vue du Monde).
2. Cliquez sur **Forker**.
3. La copie s’ouvre dans l’Éditeur, intitulée *« Fork de &lt;nom
   d’origine&gt; »*.
4. Développez-la, puis enregistrez-la et publiez-la comme la vôtre.

Votre fork publié apparaît avec une note **« ↳ Fork de … »**, qui le
relie à l’original.

### Quand un fork ne peut pas aboutir

Il arrive qu’un fork ne puisse pas aboutir — le plus souvent en forkant un
Monde partagé trouvé via un pair ou un réseau décentralisé (voir
[Publications et preuves externes](09-PublicationsAndEvidence.md)) plutôt
qu’une entrée ordinaire du Dépôt. Au lieu de vous déposer dans un
document vide et sans rapport de l’Éditeur, ForkBuild affiche une boîte
de dialogue **Fork impossible** qui nomme exactement le problème :

- **Ce Monde partagé ne peut pas être forké selon sa licence** — la
  licence de ce que vous essayiez de forker ne le permet pas (voir
  [Choisir une licence](#choisir-une-licence) ci-dessus).
- **Le contenu de ce Monde partagé est actuellement indisponible** — la
  licence autorise les forks, mais le contenu lui-même n’est pas encore
  sur cet appareil (ni accessible via un pair connecté).

Dans les deux cas, l’unique bouton de la boîte de dialogue, **Retour au
Monde partagé**, vous ramène là où vous l’avez trouvé — le Monde où il
était placé, ou le Monde partagé lui-même — plutôt que de vous laisser
bloqué dans l’Éditeur sans rien à développer.

## L’arbre généalogique

Comme chaque fork enregistre son parent, ForkBuild peut dessiner toute la
lignée d’une création. Sur une **page d’auteur**, vous verrez un **arbre
des forks** :

```
Maison médiévale (original)
└─ Fork de Maison médiévale (par Bob)
   └─ Fork de Fork de… (par Carol)
```

Une belle création peut ainsi inspirer tout un écosystème de variantes —
et chacun dans la chaîne est crédité.

## Une boucle créative typique

Voici tout le parcours en un seul enchaînement :

1. **Construisez** une création dans l’Éditeur.
2. **Enregistrez**-la.
3. **Publiez**-la dans le Dépôt.
4. Quelqu’un la **trouve** — en cherchant, en explorant les alentours
   dans la Vue du Monde, ou en parcourant votre page d’auteur — et la
   **forke**.
5. Il **publie** son fork.
6. D’autres **explorent** les deux dans la Vue du Monde, et l’arbre
   grandit.

C’est l’écosystème de construction ouvert pour lequel ForkBuild est fait.

## Et ensuite ?

Gardez la [Référence des commandes](ControlsReference.md) à portée de main
pendant que vous construisez, ou retournez explorer plus en détail
[la Vue du Monde](03-WorldView.md).
