<!-- translation-of: docs/user/03-WorldView.md source-hash: 3833a37ca4181e18 -->
# 03 — La Vue du Monde

<!-- languages -->
[English](../03-WorldView.md) · [Deutsch](../de/03-WorldView.md) · [Español](../es/03-WorldView.md) · **Français** · [Bahasa Indonesia](../id/03-WorldView.md) · [日本語](../ja/03-WorldView.md) · [한국어](../ko/03-WorldView.md) · [Português (Brasil)](../pt-BR/03-WorldView.md)
<!-- /languages -->

La Vue du Monde est l’espace 3D partagé où **toutes les créations publiées
existent côte à côte**. Déplacez-vous, cherchez ce que vous voulez,
découvrez ce que d’autres ont construit à proximité et inspectez leurs
briques — la Vue du Monde est une surface d’exploration en lecture seule,
jamais un second endroit pour construire. Dès que vous voulez changer
quelque chose, **Modifier une copie** vous remet une copie indépendante
dans l’Éditeur, le seul endroit où ForkBuild construit — voir
[Modifier une copie](#modifier-une-copie--emporter-quelque-chose-dans-léditeur)
ci-dessous.

Les seules exceptions sont des annotations, pas de la construction :
nommer des Régions du Monde et des
[Points de repère](#points-de-repère--marquer-un-lieu-qui-mérite-quon-sen-souvienne),
et intégrer au Monde un animal relâché comme décoration avec **G** (voir
[Avatars et présence](06-AvatarsAndPresence.md#décorer-un-monde-avec-un-animal)).

## Ouvrir la Vue du Monde

Depuis le **Dépôt**, cliquez sur **Explorer** sur n’importe quelle
création — ou allez directement à l’URL d’un monde. Vous apparaissez à
côté de cette création dans le monde partagé.

## Se déplacer

- **Glisser avec le bouton gauche** — faire orbiter la caméra
- **Glisser avec le bouton droit** — se déplacer latéralement
- **Molette** — zoomer et dézoomer
- **Origine** (la touche, ou le bouton du panneau) — revenir à votre
  propre monde (voir ci-dessous)

Pendant que vous vous déplacez, les mondes proches **se chargent et se
déchargent** automatiquement. Le panneau de gauche se lit de haut en bas :
ce que vous regardez (l’en-tête), où vous pouvez aller (Accueil,
Emplacements et les onglets Explorer / Carte / Lieux), ce qui vous entoure
(À proximité), puis vos propres outils — Recherche, Avatar et Mon Monde
partagé. En bas, il affiche :

- **Mondes en vue** — les autres mondes actuellement chargés autour de
  vous (masqué tant que le seul monde chargé est celui où vous êtes, que
  l’en-tête nomme déjà)
- **Mondes proches** — cliquez sur l’un d’eux pour y voler directement

En haut de la section **À proximité** d’Explorer, vous trouverez aussi deux
boutons, **Explorer ici** et **Qu’y a-t-il ici ?** — voir
[Trouver des mondes](#trouver-des-mondes) ci-dessous.

Survoler le Monde affiche ce qui se trouve sous le pointeur dans une
petite carte en bas à droite de la vue, pour que le panneau lui-même ne
saute jamais quand vous bougez la souris.

Le sol lui-même est généré de la même façon pour tout le monde à partir
d’une graine commune — herbe, plage, rochers, forêt et terres agricoles,
lacs, rivières sinueuses et pleine mer suivent l’altitude et l’humidité
propres du terrain, et non un placement aléatoire. Les terres autour de
l’origine restent toujours sèches ; à un millier d’unités environ, vous
atteindrez une côte où le sol descend le long d’un plateau vers une mer
profonde, d’un bleu plus sombre. Votre avatar entre dans un lac ou dans la
mer en ralentissant à mesure que l’eau monte, et dès que l’eau dépasse la
moitié de sa taille, il nage (voir [Nager et plonger](06-AvatarsAndPresence.md#nager-et-plonger)).
Plongez et la vue devient une eau bleu-vert : des algues ondulent sur le
fond et de petits bancs de poissons tournent en eau libre, les mêmes
poissons aux mêmes endroits pour tout le monde. C’est un
décor : rien n’y est modifiable, et il est identique quel que soit
l’observateur et le moment.

Le sol forestier porte son propre mélange d’essences d’arbres, issu de
cette même graine — des conifères là où l’humidité est plus forte, des
feuillus là où il fait plus sec, et des arbustes en lisière des prairies
— et des cerfs (en forêt) et des lapins (dans les prairies) apparaissent
comme un décor supplémentaire, lui aussi issu de la graine. Les arbres
restent exactement là où ils sont placés. Les animaux errent lentement
autour de leur point d’origine, jamais à plus de quelques pas, s’arrêtant
et se retournant en chemin — les lapins sautillent, les cerfs avancent en
hochant la tête. À l’arrêt, ils broutent la tête dans l’herbe, ou lèvent
la tête et regardent autour d’eux (un lapin se dresse sur ses pattes
arrière). Approchez-vous de l’un d’eux et il tourne la tête pour vous
observer — un cerf qui broute s’arrête et lève la tête, et un lapin se
dresse si vous vous approchez — même s’il ne peut pas vous voir quand vous
êtes juste derrière lui. Les animaux ne s’enfuient jamais et ne changent
jamais de place à cause de vous : la réaction n’existe que sur votre
écran, et les animaux des autres personnes les observent, elles.
Les lapins ont de longues oreilles dressées et une queue en pompon ; les
cerfs ont les oreilles écartées sur les côtés et une queue courte. Leurs
trajets découlent de la même graine et de l’horloge, si bien que tous
ceux qui regardent le même endroit au même moment voient les mêmes animaux
aux mêmes endroits. La faune bloque votre chemin à pied exactement comme
un arbre, où que l’animal se soit aventuré — voir
[Faire marcher votre avatar](06-AvatarsAndPresence.md#faire-marcher-votre-avatar)
— et rien de tout cela n’est modifiable.

Un Monde peut aussi avoir des **habitants** — des personnes qui y vivent
et se promènent autour de chez elles, en contournant les bâtiments plutôt
qu’en les traversant, et qui se tournent pour vous saluer quand vous vous
approchez ; parlez à l’une d’elles et elle vous dit ce qu’il y a autour.
Contrairement à la faune, ils font partie du contenu propre du Monde :
c’est son auteur qui les ajoute. Voir
[Habitants](06-AvatarsAndPresence.md#habitants).

## Son

La Vue du Monde joue un léger fond sonore adapté à l’endroit où vous
êtes : le vent sur les hauteurs et les rochers, le chant des oiseaux en
forêt, les grillons dans les champs et les prairies, le clapotis de l’eau
au bord d’un lac, et l’eau qui coule près d’une rivière. Les arbres autour
de vous s’entendent selon leur type : le bruissement des feuilles dans les
bois de feuillus et les broussailles, le souffle du vent dans les
conifères, plus fort à mesure qu’ils sont proches. Tout cela s’estompe
quand vous passez d’un type de terrain à un autre.

Votre avatar produit aussi ses propres sons. Les pas suivent le rythme de
sa marche ou de sa course et changent selon ce qu’il a sous les pieds :
l’herbe, les feuilles qui craquent en forêt, le sable doux d’une plage, la
pierre sur les hauteurs rocheuses, les éclaboussures dans un lac ou une
rivière, et un son creux sur les briques. Sauter fait un souffle, et
atterrir un bruit sourd, plus lourd après une chute plus longue. À bord
d’un véhicule, vous l’entendez : les pneus et la roue libre d’un vélo, le
bourdonnement d’une moto, le grondement d’une voiture ou le sifflement d’un
drone, qui montent quand vous accélérez et s’estompent quand vous
descendez. Monter et descendre ont aussi leur son (la sonnette et la
béquille d’un vélo, le kick d’une moto, la portière et le démarrage d’une
voiture, les rotors d’un drone qui démarrent et s’arrêtent), et freiner à
vitesse fait crisser les pneus ou les plaquettes, d’autant plus fort que
vous alliez vite.

Les modifications que vous apportez ici à un Monde ont les mêmes sons
brefs que dans l’Éditeur : nommer un point de repère ou une région,
ajouter ou retirer un habitant, transformer un animal en décoration ou
l’inverse, annuler et rétablir. Les modifications d’un collaborateur sont
silencieuses.

Les animaux et les personnes autour de vous s’entendent aussi, depuis la
direction où ils se trouvent et plus faiblement s’ils sont loin. Un cerf
s’ébroue et un lapin tape du pied quand il lève la tête, aux aguets, et de
nouveau, surpris, quand vous vous approchez ; vous entendez leurs pas
quand ils passent. En attraper un produit un froissement et un pincement
montant, et le relâcher le même son descendant. Un habitant fredonne un
« hm-hm » amical quand il se tourne pour vous saluer, murmure d’une voix
qui lui est propre quand il vous parle, et ses pas s’entendent quand il
passe. Tous les visiteurs entendent le même cerf lever la tête au même
moment, car le moment où un animal le fait fait partie du Monde.

Les avatars des autres personnes s’entendent aussi : leurs pas sur ce sur
quoi ils marchent, leurs sauts et leurs atterrissages, depuis là où ils
sont. Seules les personnes que vous pouvez voir s’entendent ; masquez les
autres avatars et ils se taisent. Quelqu’un à bord d’un véhicule
s’entend jusqu’à 40 m : son moteur qui monte et descend avec sa vitesse,
quand il monte et descend, et un crissement quand il ralentit
brusquement (le freinage lui-même n’est pas transmis, donc un arrêt brutal
est interprété comme tel). Seuls les moteurs des trois conducteurs les
plus proches sont joués, pour qu’une foule ne couvre pas le reste.

Les sons autour de vous sont placés en **3D** : devant ou derrière, au-
dessus ou en dessous, ainsi qu’à gauche ou à droite, et tournent quand
vous tournez la caméra. C’est idéal avec un casque. Le bouton **3D** à
côté du curseur de volume passe en simple gauche-droite (**Stéréo**), ce
qui peut mieux convenir à un appareil lent ou à des haut-parleurs.

Tout est généré dans votre navigateur : rien n’est téléchargé et aucun son
n’est jamais envoyé. Les autres entendent vos pas et votre véhicule comme
vous entendez les leurs : leur navigateur les produit à partir de là où il
voit déjà votre avatar marcher ou rouler.

Les navigateurs ne laissent pas une page jouer du son avant que vous
interagissiez avec elle, le son démarre donc à votre premier clic, appui
ou touche pressée. Coupez-le ou activez-le avec le bouton **Son** en haut
à droite de la vue (en bas à droite sur un téléphone) ou en appuyant sur
`M`, et réglez le volume avec le curseur à côté ; sur un téléphone ou une
tablette, utilisez les boutons de volume de l’appareil. ForkBuild retient
vos choix, y compris 3D ou Stéréo, sur cet appareil. Le son se met en
pause quand l’onglet est masqué.

## Orientation et emplacements

À côté des coordonnées de votre caméra, une petite **boussole** indique
la direction dans laquelle vous regardez (elle est en lecture seule —
elle ne déplace jamais la caméra). Une rangée de boutons près du haut du
panneau sert à se déplacer :

- **Accueil** vous ramène — caméra et avatar — à votre propre monde
  actuel, celui que vous avez ouvert ou que vous avez centré en dernier,
  plutôt qu’à l’origine fixe (0,0,0) de la carte partagée. Il vous dépose
  juste après l’emprise de votre monde, jamais à l’intérieur, même si son
  contenu est centré autour de son origine locale. Si vous n’avez pas
  encore centré l’un de vos mondes pendant cette session, il revient à
  cette origine partagée — toujours accessible depuis **Emplacements**
  ci-dessous, où elle est listée en permanence sous « Monde ». Vous
  éloigner assez pour que votre propre monde sorte de la vue (à pied ou
  en véhicule) ne vous fait pas perdre le chemin du retour ; Accueil vous
  y ramène toujours.
- **Emplacements** ouvre la liste de tous les lieux que cette session
  connaît actuellement, regroupés en **Monde**, **Structures**, **Points
  de repère** et **Lieux** — chacun avec un bouton **Centrer**. Comme
  Recherche et Explorer ici / Qu’y a-t-il ici ?, Centrer ne fait que
  déplacer la caméra ; cela ne charge, ne sélectionne et ne modifie
  jamais rien.
- **👥 N en ligne** est le bouton **Membres** : il compte qui est là, et
  un clic ouvre le panneau des Membres du Monde. Un bouton **Salon** le
  suit quand le Monde a un salon public.
- **?** affiche les commandes de la caméra et de la marche (glisser pour
  orbiter, molette pour zoomer, et WASD, Maj et Espace quand vous
  contrôlez votre avatar) ; cliquez de nouveau pour les masquer.

**Notifications** est le bouton 🔔 dans l’en-tête de l’application, à côté
de Se connecter, il est donc présent sur toutes les pages, pas seulement
dans la Vue du Monde. Il ouvre votre **Historique des notifications** —
un registre durable des notifications adressées à votre identité, les
plus récentes en premier. Aujourd’hui, la seule chose qui en produit une
est un commentaire sur une publication que vous avez publiée (voir
[Commentaires](09-PublicationsAndEvidence.md#commentaires) ci-dessous) —
chaque entrée indique ce qui s’est passé et quand, et un bouton
**Explorer** vous emmène dans le Monde de cette publication : dans la Vue
du Monde, il vous y fait voler ; ailleurs, il ouvre la Vue du Monde à cet
endroit. C’est un simple journal en lecture seule, pas une boîte de
réception : pas d’état lu / non lu, pas de suppression d’entrée, et pas
de compteur sur le bouton lui-même. Il se charge une fois à l’ouverture,
puis seulement si vous cliquez sur **Actualiser** ; il ne se met jamais à
jour en direct en arrière-plan. Il est lié à votre identité connectée, pas
au Monde ou au document que vous avez ouvert.

La boussole affiche les points cardinaux (N, E, S, O) et votre cap actuel
en degrés, plus de petits points pour les structures, collaborateurs et
points de repère proches — survolez-en un pour voir son nom, ou consultez
la liste lisible sous la boussole.

### Explorer, Carte et Lieux — trois façons de parcourir, jamais en même temps

Sous les boutons de navigation se trouvent trois onglets : **Explorer**,
**Carte** et **Lieux**. Ce sont les trois façons principales, et
mutuellement exclusives, de regarder autour de soi dans la Vue du Monde —
en ouvrir une ferme toujours celle des deux autres qui était ouverte, si
bien que vous ne jonglez jamais avec plusieurs panneaux de navigation
superposés.

- **Explorer** est l’onglet par défaut. Il affiche le panneau d’arrivée et
  de bienvenue (qui est là, et quelques destinations suggérées) plus une
  section **À proximité** avec des groupes repliables — **Lieux**,
  **Points de repère**, **Personnes**, **Noms de lieux** (voir
  [Noms de lieux à proximité](#noms-de-lieux-à-proximité--découvrir-les-propositions-de-nimporte-qui)
  ci-dessous), **Constructions déclarées** (voir
  [Constructions déclarées](#constructions-déclarées--les-constructions-des-autres-là-où-leurs-éditeurs-disent-quelles-se-trouvent)
  ci-dessous, affiché seulement s’il y en a une) et **Rencontres dans le
  Monde** (voir
  [Rencontres dans le Monde](#rencontres-dans-le-monde--publications-et-avatars-que-vos-pairs-partagent)
  ci-dessous) — chacun n’étant qu’un nom, une distance et un petit bouton
  **Y aller** (Rencontres dans le Monde et Noms de lieux affichent plutôt
  leur propre contenu, de forme différente, décrit ci-dessous). Lieux,
  Points de repère et Personnes n’apparaissent que s’ils contiennent
  quelque chose ; tant que les trois sont vides, une seule ligne le dit.
  Cliquez sur le titre d’un groupe pour le déplier — la Vue du Monde
  retient les groupes que vous avez laissés ouverts, même après être
  passé à Carte ou Lieux et revenu.
- **Carte** ouvre la même Carte du Monde plate, vue de dessus, décrite
  ci-dessous.
- **Lieux** ouvre l’annuaire des lieux géographiques décrit dans
  [Lieux géographiques](#lieux-géographiques) ci-dessous.

Passer d’Explorer à Carte ou Lieux ne charge jamais de document, ne
modifie rien et ne déplace pas votre avatar — cela change seulement ce que
ce panneau vous montre, selon la même frontière « Naviguer ≠ Modifier »
que respectent toutes les autres commandes de navigation de la Vue du
Monde.

### Rencontres dans le Monde — publications et avatars que vos pairs partagent

Le groupe **Rencontres dans le Monde**, dans la section À proximité
d’Explorer, est une petite carte plate à part — distincte de la Carte du
Monde décrite ci-dessous — qui place deux types de choses dont vos pairs
connectés vous ont parlé : d’autres **publications** (voir
[Publications et preuves externes](09-PublicationsAndEvidence.md)) placées
à proximité, et les **avatars** d’autres personnes, chacun avec son propre
marqueur à côté d’un marqueur pour vous.

Cliquez sur un marqueur pour ouvrir un panneau d’inspection :

- Un marqueur de **publication** affiche son titre, son éditeur, si elle
  est signée, sa position, et combien d’ancres de preuve externe et de
  placements de snapshot elle a.
- Un marqueur d’**avatar** affiche son nom affiché, son propriétaire et sa
  position.

Si plus d’un pair connecté propose la même rencontre, une liste **Choisir
la source** apparaît pour que vous choisissiez la copie de quel pair
inspecter. Comme tout le reste dans la Vue du Monde, c’est purement pour
regarder — rien ici ne déplace votre caméra ni ne modifie quoi que ce
soit.

Si vous avez lancé **Découvrir un Monde partagé** (ci-dessous) et que
cela a fait apparaître une piste décentralisée — un emplacement Arweave
ou Nostr — pour la publication sélectionnée, une ligne **Emplacement**
indique celui qui sera utilisé. Quand plus d’une piste correspond, une
liste **Choisir l’emplacement** apparaît à la place : choisissez-en une,
et Contenu/Vérification ci-dessous se chargent depuis cet emplacement.
Tant que vous n’avez pas choisi, rien n’est chargé depuis aucune d’elles,
et un choix fait pour une rencontre ne s’applique jamais à une autre.

Sélectionner une publication affiche aussi deux autres blocs d’état en
dessous. **Contenu** / **Vérification** tentent de charger réellement le
contenu de cette publication et de le vérifier cryptographiquement par
rapport à ce qui a été déclaré pour elle. Pour le contenu que cet appareil
détient déjà, cela fonctionne directement ; pour tout ce qu’un pair vous a
montré, cela affiche normalement **Indisponible** / **Invérifiable** —
sauf si vous avez lancé séparément **Découvrir un Monde partagé**
(ci-dessous) pour cette même publication, auquel cas une piste
décentralisée résolue qu’elle a trouvée est réutilisée ici aussi, et
Contenu / Vérification peuvent revenir **Disponible** / **Vérifié**
comme pour une découverte directe. Dans les deux cas, une ligne
**Source** sous Contenu vous indique d’où vient réellement le contenu
inspecté — **Local** (déjà sur cet appareil) ou **Décentralisé** (récupéré
via une piste Arweave/Nostr résolue) — un simple fait sur cette
observation, jamais une note de confiance. Dès que cet appareil détient le
contenu de la publication, un bouton **Distribuer** apparaît — cliquez
dessus pour ouvrir une boîte de dialogue **Distribuer** plutôt que de
laisser en permanence à l’écran chaque sélecteur de stockage, bouton et
résultat. Fermer la boîte de dialogue (**Fermer**, un clic à l’extérieur
ou Échap) ne perd jamais rien de ce qu’elle a produit : la rouvrir
affiche exactement le même résultat, la même erreur ou le même état en
cours — la boîte de dialogue n’est que de la présentation, rien n’y
dépend du fait qu’elle soit ouverte.

La boîte de dialogue s’ouvre avec un seul jeu de réglages, utilisé pour
tout ce qu’elle distribue : un **Stockage** — **Arweave**, **IPFS (Kubo
local)**, **IPFS (épinglage distant)** (qui demande un Endpoint et un
Identifiant saisis à chaque fois ; rien n’en est jamais enregistré) ou
**Steem** (expérimental, voir [Steem](11-EvidenceAndStorage.md#steem)) —
et un **Support d’annonce / de découverte** (**Arweave**, **Nostr** ou
**Steem**). Les deux s’ouvrent sur vos préférences de fournisseur
enregistrées. Stockage ne liste que les backends sur lesquels cet appareil
peut réellement placer un Snapshot (plus l’épinglage distant), pour que
vous ne puissiez pas en choisir un qui échouerait à mi-chemin.

Si les deux protocoles ci-dessous sont disponibles, un bouton
**Distribuer** combiné se trouve juste sous ces réglages — l’action
principale, qui distribue la Déclaration signée et le Snapshot ensemble
avec les réglages ci-dessus. Cela ne change rien à aucun des deux
protocoles : chacun s’exécute toujours indépendamment, chacun rend
toujours compte dans sa propre section ci-dessous, et l’échec de l’un
n’est jamais masqué par l’autre ni ne le bloque — il exécute bien les
deux l’un après l’autre, jamais en même temps, car les deux peuvent finir
par demander à la même extension de portefeuille connectée de signer, et
deux demandes de signature lancées en même temps sont un vrai cas d’échec
des extensions. Chaque section ci-dessous a aussi son propre bouton plus
petit **Distribuer la Déclaration signée seulement** / **Distribuer le
Snapshot seulement**, avec les mêmes réglages — utile si vous ne voulez
que l’un des deux, ou réessayer seulement la moitié qui a échoué. (Si un
seul protocole est disponible, le bouton de sa section est simplement
**Distribuer la Déclaration signée** ou **Distribuer le Snapshot**.)

La section **Déclaration signée** indique si la publication a été
envoyée séparément via la distribution Arweave/Nostr, en affichant
**Absent** pour **Contenu** et **Découverte** tant que ce n’est pas le
cas. La distribuer envoie le contenu et l’annonce. Les deux étapes sont
signées par une extension de navigateur : un portefeuille Arweave (comme
Wander) pour Arweave, et une extension de signature Nostr (comme nos2x)
pour Nostr. Sans l’extension correspondante installée, la tentative se
termine par « La distribution n’a pas pu aboutir. » avec la raison. Une
tentative réussie affiche l’id de la publication, l’emplacement de son
**Contenu** et l’id de son annonce de **Découverte** — une ligne
Découverte par relais quand vous avez configuré plusieurs
[relais Nostr](10-NetworkSettings.md#relais-nostr).

La section **Snapshot**, juste en dessous dans la même boîte de dialogue,
a les mêmes conditions et demande les mêmes extensions, mais utilise un
autre protocole : les Snapshots (voir
[Publications et preuves externes](09-PublicationsAndEvidence.md#snapshot-local))
sont placés et découverts indépendamment de la distribution des
Déclarations signées, cette section ne partage donc jamais d’état,
d’historique ni de résultat avec la section Déclaration signée au-dessus
— seulement les réglages. Cliquer dessus affiche exactement ce qui est
revenu : un **Hash du contenu**, un **Localisateur** et un id
d’**Annonce** — ou « Aucune annonce » si le placement a réussi mais pas
l’annonce Nostr, ce qui est présenté comme un résultat partiel, jamais
comme une erreur. Un véritable échec affiche plutôt un simple avis « La
distribution du Snapshot n’a pas pu aboutir. ». Ni l’état ni le résultat
d’aucune section ne sont mémorisés nulle part — sélectionner une autre
rencontre, ou quitter la page, les efface.

**Une publication qu’un pair vous a montrée ici ne reste pas bloquée dans
Rencontres dans le Monde une fois qu’elle se résout réellement.** Dès que
le Contenu d’une publication montrée par un pair atteint **Disponible** —
son contenu se charge vraiment et se vérifie — elle est aussi admise dans
le même catalogue que celui de la recherche du
[Dépôt](04-PublishingAndForking.md#le-dépôt) et de chaque page d’auteur,
exactement comme si elle avait été trouvée de la façon habituelle :
chercher dans le Dépôt, ou ouvrir la page de son auteur, la fait aussi
apparaître, et elle y reste après un rechargement. Aucun badge ni aucune
étiquette ne la signale comme « trouvée via un pair » une fois qu’elle y
est — une carte du Dépôt ou une entrée de page d’auteur est identique
dans les deux cas, puisqu’à ce stade votre propre appareil a vérifié le
contenu lui-même de façon indépendante ; seule la *façon dont vous en
avez entendu parler* différait.

### Découvrir un Monde partagé — chercher directement sur les réseaux décentralisés

Toujours dans le groupe Rencontres dans le Monde, mais sans clic sur un
marqueur ni pair connecté, se trouve un bouton **Découverte de Mondes
partagés** qui ouvre sa propre petite fenêtre. Elle contient le panneau
**Découvrir un Monde partagé** : saisissez un **id du Monde partagé** et
le **tag de découverte** sous lequel il a été distribué, puis cliquez sur
**Découvrir un Monde partagé** pour interroger directement Arweave et
Nostr. Le champ du tag de découverte est prérempli avec le tag de
campagne commun de ForkBuild — celui qu’aurait utilisé une publication
distribuée depuis cette application — si bien que, dans le cas courant,
vous n’avez qu’à saisir l’id du Monde partagé ; il reste un champ
librement modifiable si vous devez viser un autre tag. Le résultat
affiche une ligne **Découverte** (**Indisponible**, **Résolu**, ou
**Ambigu** quand plus d’une piste indépendante apparaît pour le même
emplacement) et, une fois résolu, le même affichage
Contenu/Source/Vérification décrit ci-dessus, avec les mêmes champs et la
même formulation. Aujourd’hui, cela ne se résout que pour l’une de vos
propres publications — une que vous avez signée et détenez encore
localement, dont l’emplacement déclaré correspond à ce que le réseau
signale — voyez-le donc comme « ma publication est-elle vraiment là-bas,
intacte ? » plutôt que comme une recherche générale dans le travail des
autres. Fermer la fenêtre conserve ce que vous aviez saisi ou trouvé — la
rouvrir reprend exactement où vous en étiez, jusqu’à une nouvelle
recherche ou jusqu’à ce que vous quittiez la page.

Dès qu’un résultat découvert revient **Vérifié**, un bouton
**Sélectionner le Monde partagé** apparaît ; cliquer dessus enregistre ce
résultat comme « la publication avec laquelle vous travaillez », affichée
ensuite dans un petit avis en dessous. Sélectionner n’est que ce choix
explicite — cela ne distribue rien, ne revérifie rien et n’alimente pas
votre sélection locale au-dessus — et il reste en place même après une
autre recherche, jusqu’à ce que vous sélectionniez autre chose ou quittiez
la page. Seul un résultat vérifié est sélectionnable ; tout ce qui est
**Refusé**, **Invérifiable** ou pas encore résolu ne propose jamais le
bouton.

Les panneaux à marqueurs de Rencontres dans le Monde n’affichent que ce
qu’un pair actuellement ou récemment connecté vous a réellement signalé ;
le groupe lui-même affiche **Rien à rencontrer ici pour l’instant**
jusqu’à ce qu’au moins un l’ait fait. Découvrir un Monde partagé est la
seule exception — cela fonctionne même sans aucun pair connecté, puisque
cela interroge directement un réseau décentralisé. Voir
[Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md) pour se
connecter à quelqu’un.

### Noms de lieux à proximité — découvrir les propositions de n’importe qui

**Noms de lieux**, le quatrième groupe d’À proximité, affiche les
propositions de nom de lieu signées pour les Régions du Monde qui vous
entourent — sans aucun pair connecté. Comme Découvrir un Monde partagé
ci-dessus, il cherche directement sur un réseau décentralisé (Nostr) les
propositions associées à une région proche ; contrairement à tout le reste
d’À proximité, il est replié par défaut, car une proposition découverte
et non vérifiée est un type de chose nouveau et inhabituel sur cette
page.

Chaque ligne affiche le nom proposé, sa position approximative, qui l’a
proposé, et quand. Deux boutons sont proposés :

- **Naviguer** déplace votre caméra vers la région de la proposition —
  exactement comme **Y aller** ailleurs dans À proximité. Cela n’adopte,
  ne vérifie ni n’exploite jamais la proposition, et ne renomme jamais
  rien.
- **Adopter** enregistre la proposition sur votre appareil, en la faisant
  passer par la même vérification de signature qu’une proposition qui
  arrive d’un pair connecté (voir
  [En recevoir une d’un pair](09-PublicationsAndEvidence.md#en-recevoir-une-dun-pair)).
  Une fois adoptée, c’est simplement une proposition connue, comme les
  autres — le bouton Adopter de la ligne est remplacé par **✓ Déjà
  enregistré**, et adopter de nouveau la même proposition confirme
  simplement que rien n’a changé.

Deux propositions qui nomment le même terrain apparaissent toutes les deux
ici — cette liste ne désigne jamais de « gagnant », et en adopter une
n’affirme jamais qu’elle est plus juste qu’une autre. Si la découverte
elle-même échoue (pas de connexion à un relais, ou erreur de requête), un
petit avis le signale, mais les propositions déjà vues restent à l’écran ;
cela n’est jamais interprété comme « il n’y a pas de propositions à
proximité ». Voir
[Nommer un lieu](09-PublicationsAndEvidence.md#nommer-un-lieu) pour la
façon dont une proposition est publiée au départ.

### Constructions déclarées — les constructions des autres, là où leurs éditeurs disent qu’elles se trouvent

Pendant que vous marchez, ForkBuild télécharge les Snapshots annoncés près
de vous (voir le parcours automatique de
[Mon Monde partagé](#mon-monde-partagé--distribuer-votre-propre-snapshot-sans-pair-nécessaire)).
L’annonce d’un Snapshot peut indiquer où son éditeur l’a placé, mais ce
n’est qu’une **déclaration** : personne ne l’a vérifiée, et s’y fier
aveuglément permettrait à n’importe qui de poser une construction sur la
vôtre. Une construction déclarée est donc affichée comme un **fantôme** —
ses briques dessinées en translucide à la position déclarée — et ne
devient jamais d’elle-même un vrai placement.

Il y a une exception, et elle ne demande aucun clic. Quand un éditeur
distribue son Snapshot, l’annonce porte aussi son propre **placement
signé**. Dès que cet appareil connaît le Monde partagé de cette
construction (il est dans votre Dépôt, ou vous le **Vérifiez**),
ForkBuild vérifie que le placement est signé avec la clé de ce Monde
partagé et, si c’est le cas, affiche la construction en plein, exactement
là où son éditeur l’a mise. C’est toujours son placement, pas le vôtre :
vous ne pouvez ni le déplacer ni le retirer. S’il le déplace plus tard et
distribue de nouveau, il se déplace aussi chez vous. Une position signée
par quelqu’un d’autre reste un fantôme.

Un fantôme n’est dessiné que si :

- sa position est proche de vous (votre case de carte ou celles qui
  l’entourent, environ 1 000 unités dans chaque direction), et il
  disparaît quand vous vous éloignez ;
- son contenu a été téléchargé et correspond à son hash de contenu ;
- cet appareil n’a encore aucun placement de cette construction — dès
  qu’il en a un, c’est la vraie construction qui est affichée ;
- rien de ce que connaît cet appareil n’est déjà placé exactement à cet
  endroit — une déclaration cède toujours la place à un vrai placement.

Vous ne pouvez ni sélectionner, ni inspecter, ni modifier, ni forker un
fantôme dans la vue 3D. Les très grosses constructions ne sont dessinées
qu’en partie (les quelques milliers de premières briques).

Chaque fantôme a aussi une ligne dans le groupe **Constructions
déclarées**, de la plus proche à la plus lointaine : son titre, sa
distance et sa position, et « déclaré par … » — le titre et l’auteur
viennent du contenu de la construction lui-même et ne sont pas plus
vérifiés que sa position. Chaque ligne propose :

- **Naviguer** — déplace la caméra pour regarder l’endroit déclaré. Rien
  d’autre ne change.
- **Vérifier** — affiché tant que cet appareil n’a pas encore
  l’enregistrement signé du Monde partagé de la construction. Il cherche
  l’enregistrement sur Nostr et Arweave, vérifie sa signature, et vérifie
  qu’il s’agit exactement du Monde partagé de cette construction et qu’il
  désigne exactement le contenu affiché par le fantôme. Si tout est en
  ordre, le Monde partagé est ajouté à votre Dépôt et la ligne devient
  « signé par *nom* (clé did:key:…) ». Sinon, la ligne dit pourquoi :
  rien n’a été annoncé (l’éditeur n’a peut-être distribué que le
  Snapshot — le bouton **Distribuer** combiné annonce les deux), aucune
  copie n’était valablement signée, ou le Monde partagé signé désigne un
  autre contenu. Vérifier n’accepte jamais une déclaration à lui seul ;
  mais si l’annonce portait le placement signé de l’éditeur, la
  construction apparaît désormais en plein là où il l’a mise (voir
  ci-dessus), et le fantôme disparaît.
- **Accepter la position** — la seule façon de faire confiance à une
  déclaration. Cela place la construction à la position déclarée avec un
  placement *à vous*, signé par vous comme n’importe quel autre
  placement, et à partir de là c’est une construction normale de votre
  Monde. Ce n’est possible qu’une fois que cet appareil détient
  l’enregistrement signé et vérifié du Monde partagé de l’éditeur — via
  **Vérifier**, quand il partage le Monde avec vous (voir
  [Partager avec les pairs connectés](04-PublishingAndForking.md#partager-avec-les-pairs-connectés) ;
  il apparaît alors dans votre Dépôt), ou quand la
  [Rencontre dans le Monde](#rencontres-dans-le-monde--publications-et-avatars-que-vos-pairs-partagent)
  d’un pair connecté pour cette construction atteint **Disponible** — et
  seulement si ce Monde partagé désigne exactement le contenu affiché par
  le fantôme. Le bouton reste aussi désactivé quand l’éditeur de ce Monde
  partagé a choisi **Moi seul peux le placer** (voir
  [Choisir qui peut le placer](04-PublishingAndForking.md#choisir-qui-peut-le-placer)).
  Chaque fois qu’il est désactivé, la ligne dit pourquoi.

  **Ce que « vérifié » veut dire.** Cela prouve que la construction est
  exactement le contenu d’un Monde partagé signé par la clé affichée. Cela
  ne prouve pas qui détient cette clé — n’importe qui peut en créer une et
  se faire appeler « bob » — et cela ne prouve pas la position, qui reste
  seulement déclarée. Accepter la position fonctionne aussi pour des clés
  que vous ne connaissez pas ; leur faire confiance ou non, c’est à vous
  de voir.
- **Masquer** — retire ce fantôme et sa ligne jusqu’à ce que vous quittiez
  la Vue du Monde. Rien n’est signalé ni supprimé.

### Infos — qu’est-ce que je regarde ?

À côté de la plupart des boutons **Y aller** — dans les lignes À proximité
d’Explorer et dans le panneau Emplacements — vous trouverez aussi un
bouton **Infos**. Là où Y aller déplace votre caméra, Infos ouvre un petit
panneau qui décrit ce que vous avez sélectionné sans rien déplacer : ce
que c’est, à quelle distance, dans quel lieu nommé il se trouve (« Vous
êtes ici : Village des Saules ») ou de quel candidat de lieu
géographique il est proche (« Vous êtes près de Village de Kawahara »)
quand ni l’un ni l’autre n’est connu avec certitude. De là, vous pouvez
toujours appuyer sur **Y aller** pour vous y rendre, **Afficher sur la
carte** pour le voir sur la Carte du Monde, **Noms** (pour un lieu nommé)
pour voir ou publier les noms que lui donne la communauté, ou **Modifier
une copie** pour l’ouvrir dans l’Éditeur — voir ci-dessous. Infos ne fait
jamais rien de cela tout seul.

### Modifier une copie — emporter quelque chose dans l’Éditeur

Partout où la Vue du Monde vous montre quelque chose de précis — une
région, un point de repère, une structure placée, une brique ou un sol
nu — le panneau qui le décrit a un bouton de plus : **Modifier une
copie**. Il crée une copie indépendante du document qui contient
réellement ce que vous regardiez — jamais le Monde entier, jamais
l’original de quelqu’un d’autre — et l’ouvre directement dans l’Éditeur,
prête à être développée. Deux panneaux le proposent : le panneau
**Centrer** (le bouton Infos des lignes d’Explorer et d’Emplacements,
pour une région, un point de repère ou une structure) et le panneau
**Inspection** (un clic direct dans la vue 3D, pour une brique, un sol nu
ou une structure placée) — même action, même bouton, quel que soit le
chemin.

- Pour un **point de repère**, une **région**, une **brique** ou un **sol
  nu**, c’est le document du Monde auquel ils appartiennent.
- Pour une **structure placée**, c’est le contenu propre de la structure —
  pas le Monde dans lequel elle se trouve.

L’original n’est jamais touché — ForkBuild vous prévient dès que votre
copie est prête, exactement comme pour n’importe quel autre fork (voir
[Publier et forker](04-PublishingAndForking.md)). Si la copie ne peut pas
être faite — le plus souvent parce que la source est un Monde partagé
trouvé via un pair ou un réseau décentralisé dont le contenu n’est pas
encore disponible, ou dont la licence interdit les forks — une boîte de
dialogue **Fork impossible** explique exactement pourquoi et propose
**Retour au Monde partagé** pour vous ramener à votre point de départ,
plutôt que de vous laisser dans un document vide de l’Éditeur (voir
[Quand un fork ne peut pas aboutir](04-PublishingAndForking.md#quand-un-fork-ne-peut-pas-aboutir)).
Un **lieu géographique** et un **collaborateur** ne proposent jamais
Modifier une copie — un lieu géographique regroupe les régions de
plusieurs personnes sans document propre à copier (ouvrez plutôt l’une de
ses régions), et une personne n’est pas un document du tout.

**C’est la même action que le bouton « Forker » du Dépôt, de la page
d’auteur et des Rencontres dans le Monde** — voir
[Forker : faites-le vôtre](04-PublishingAndForking.md#forker--faites-le-vôtre).
Quel que soit le libellé sur lequel vous cliquez, vous obtenez le même
résultat : une toute nouvelle copie indépendante, l’original laissé
exactement tel quel, et les mêmes règles de licence. « Modifier une
copie » n’est formulé différemment ici que parce que vous regardez déjà
la chose précise qui est copiée, plutôt que de la choisir dans une
liste.

C’est la *seule* porte de sortie de la surface en lecture seule de la Vue
du Monde. Tout le reste ici — se déplacer, Recherche, Explorer ici /
Qu’y a-t-il ici ?, la boussole, la Carte, Infos — ne fait que regarder.

### Points de repère — marquer un lieu qui mérite qu’on s’en souvienne

Contrairement à une structure (un bâtiment placé, construit par vous ou
quelqu’un d’autre) ou à une indication de la boussole (calculée à partir
de l’endroit où vous vous trouvez), un **point de repère** est quelque
chose que vous créez délibérément : un point nommé — « Vieux pont »,
« Belle vue » — avec une description facultative, placé exactement là où
se tient actuellement votre avatar.

Si vous avez le droit de MODIFICATION sur le Monde où vous êtes, la
section Points de repère du panneau **Emplacements** affiche un bouton
**+ Ajouter un point de repère**. Donnez-lui un titre (et éventuellement
une description) et cliquez sur **Placer ici** — il apparaît
immédiatement pour vous et, quelques instants plus tard, pour tous les
autres collaborateurs du même Monde, sur la boussole, dans leur propre
panneau Emplacements, et comme destination accessible. Toute personne
ayant le droit de MODIFICATION peut renommer, redécrire ou retirer
n’importe quel point de repère du Monde, pas seulement la personne qui
l’a créé — les points de repère font partie du contenu du Monde, régis
par les mêmes droits de collaboration que tout ce que vous construisez
ensemble, jamais une épingle personnelle et privée que vous seul pouvez
voir ou toucher.

### La Carte du Monde

L’onglet **Carte** ouvre une vue plate, vue de dessus, de tout ce que
cette session connaît actuellement du Monde — lieux nommés, points de
repère, structures, toutes les autres personnes présentes, et un
marqueur pour vous. Utilisez la molette ou +/− pour zoomer, cliquez sur
un espace vide pour déplacer la carte, et cliquez sur n’importe quel lieu
ou personne pour y déplacer directement votre caméra. Rien sur la carte
n’est modifiable, et la regarder ne change jamais rien — c’est
simplement une façon de voir d’un coup la géographie que les
collaborateurs d’un Monde ont déjà construite et nommée, au lieu d’un
point de repère à la fois.

### Lieux géographiques

L’onglet **Lieux** ouvre un annuaire de tous les **lieux géographiques**
que cette session a identifiés — des lieux que plusieurs personnes ont
nommés ou décrits indépendamment (sous forme de région — voir la section
Lieux d’Emplacements) et qui occupent à peu près le même terrain. Cliquez
sur une ligne pour ouvrir son écran de détail : combien de descriptions
et de Mondes il couvre, ses propres **Noms donnés par la communauté**, et
les boutons **Aller au lieu** / **Afficher sur la carte**. Cliquez sur
**← Retour** (ou appuyez sur Échap) pour revenir à l’annuaire — passer à
Carte ou Explorer puis revenir à Lieux rouvre exactement l’écran que vous
aviez quitté, détail ou liste.

La section Noms donnés par la communauté d’un lieu n’affiche d’abord que
ses quelques premiers noms, avec un bouton **Plus de noms** pour voir la
liste complète classée — et tout ce qui va au-delà de « publier votre
propre nom » (autres descriptions géographiques, historique brut des
propositions, import/export) se trouve derrière un seul dépliant
**Plus**, pour que le cas courant — « comment les gens appellent-ils ce
lieu, et comment est-ce que je l’appelle ? » — n’entre jamais en
concurrence avec tout le reste de ce que permet le système de nommage.

> Publier un nom l’annonce à vos pairs connectés de la même façon que
> revendiquer la paternité d’une structure — voir
> [Publications et preuves externes](09-PublicationsAndEvidence.md) si
> vous voulez voir, au même endroit, toutes les propositions que cet
> appareil a publiées ou apprises.

## Caméra et modification

L’en-tête affiche deux choses qui peuvent réellement différer :

```
Caméra : Château d’Alice · Modification : Château de Bob
```

**Caméra** est l’endroit que vous regardez — voler vers un monde, ou
cliquer sur le bouton **Centrer** d’un résultat de recherche, y déplace la
caméra. **Modification** est le document auquel votre prochaine action
(ajouter un point de repère ou une région, modifier les métadonnées,
publier) s’appliquerait réellement — cliquer sur une brique ou un
placement, ou sur le bouton **Sélectionner** d’un résultat de recherche ou
d’emplacement, le change *sans* déplacer la caméra. (Modifier les briques
elles-mêmes ne se fait que dans l’Éditeur — voir
[Modifier une copie](#modifier-une-copie--emporter-quelque-chose-dans-léditeur)
ci-dessus.)

Les deux bougent généralement ensemble (Centrer fait les deux), mais deux
créations peuvent partager exactement le même endroit du monde — centrer
l’une puis l’autre ne déplace pas du tout la caméra la seconde fois, et
pourtant l’en-tête vous indique toujours laquelle vous modifiez
maintenant. Se déplacer et regarder les choses ne change jamais à lui
seul ce que vous modifiez ; seule la sélection effective d’une brique ou
d’un document le fait.

« Y aller », dans les lignes À proximité d’Explorer et dans le panneau
Infos, désigne le même mécanisme de déplacement de la caméra que les
boutons « Centrer » de Recherche, Emplacements et Placement — seul le
libellé diffère ; chacun déplace la caméra. Ce qu’il fait d’autre — s’il
change aussi le document que vous modifiez, comme le fait le Centrer de
[Recherche](#recherche---quelles-publications-correspondent--) — dépend
toujours du contexte, exactement comme décrit dans la section propre à
chaque panneau ; dire « Y aller » au lieu de « Centrer » n’y change rien.

## Mes mondes — les Mondes où vous êtes vraiment allé

Cliquez sur **Mes mondes** dans la barre du haut pour voir tous les Mondes
que cet appareil a déjà visités, du plus récent au plus ancien, chacun
avec son titre, son auteur, et le nombre de structures et de points de
repère quand il est connu. Cliquez sur le bouton **Continuer
l’exploration** d’une carte pour y retourner directement — la même entrée
fraîche dans la Vue du Monde que le bouton **Explorer** du Dépôt et de la
page d’auteur (voir [Le Dépôt](04-PublishingAndForking.md#le-dépôt)),
simplement formulée pour un Monde déjà visité plutôt que pour un Monde
que vous découvrez.

C’est un historique purement local et personnel — jamais une liste
partagée ou publiée, et pas la même chose que le Dépôt ou un résultat de
recherche : un Monde n’apparaît ici qu’une fois que vous y êtes vraiment
entré, et il y reste (sur cet appareil seulement) même si vous ne publiez
ou ne partagez jamais rien vous-même. Vous n’êtes encore allé nulle
part ? **Parcourez le Dépôt** pour trouver votre premier Monde.

## Trouver des mondes

Il y a trois façons de trouver quelque chose dans le monde partagé,
chacune répondant à une question différente.

### Recherche — « quelles publications correspondent ? »

Le panneau **Recherche** cherche par **titre ou auteur**, dans tout ce
qui a été publié — pas seulement ce qui est actuellement chargé autour de
vous. Saisissez un terme et cliquez sur **Chercher**.

Vous pouvez éventuellement la limiter à un **Emplacement** : remplissez
X/Y/Z et un **Rayon** (en unités du Monde) et la recherche ne renvoie que
les résultats situés à cette distance de ce point. Laissez Emplacement
vide pour une simple recherche textuelle.

Chaque résultat affiche :

- 📍 sa position
- 📏 sa distance (seulement pour une recherche par emplacement)
- une note si la position affichée est une **position par défaut** plutôt
  qu’une position réellement choisie par l’auteur (voir
  [Position dans le Monde](#position-dans-le-monde) ci-dessous)

Cliquez sur **Centrer** pour vous y rendre.

### Explorer ici / Qu’y a-t-il ici ? — « qu’y a-t-il autour de moi en ce moment ? »

Ces deux boutons, en haut de la section À proximité d’Explorer, cherchent
**à partir de l’endroit où se trouve actuellement votre caméra** — inutile
de connaître déjà un titre ou de saisir des coordonnées.

- **Explorer ici** cherche dans une zone assez large autour de la caméra,
  et vous permet ensuite d’élargir ou de réduire ce rayon.
- **Qu’y a-t-il ici ?** ne vérifie que la zone immédiate — utile quand
  vous voulez savoir « y a-t-il quelque chose pratiquement là où je me
  tiens ? »

Les deux ouvrent la boîte de dialogue **Explorer l’emplacement** :

```
📍 Centre : 100.0, 50.0, 250.0
⭕ Rayon : 25 unités du Monde

3 documents découvrables affichés sur 3

📍 Hôtel de ville       📏 À 4,2 unités du Monde
par alice
[Centrer] [Sélectionner] [Inspecter]
```

Chaque résultat vous offre trois actions distinctes :

| Bouton | Ce qu’il fait |
|---|---|
| **Centrer** | Déplace la caméra jusque-là *et* en fait le document que vous modifiez |
| **Sélectionner** | En fait le document que vous modifiez, **sans** déplacer la caméra |
| **Inspecter** | Déplie un résumé — titre, auteur, statut, position, propriétaire — sans rien déplacer |

Cette boîte de dialogue ne déplace jamais un placement, ne modifie jamais
un document et ne publie jamais rien d’elle-même — elle sert uniquement à
regarder autour de soi et à choisir où aller ensuite.

### Documents ici

Quand le panneau d’informations d’un placement vous indique que d’autres
documents partagent exactement sa position, cliquez sur **Voir** pour
ouvrir **Documents ici** — une simple liste de tout ce qui se trouve à cet
endroit, chacun avec son propre bouton **Centrer**. Seuls les documents
encore réellement publiés apparaissent ici — si l’un d’eux a été
dépublié, il est simplement omis de la liste plutôt que d’apparaître
comme une ligne inutilisable.

## Inspecter une brique — ou une structure placée

Cliquez sur n’importe quelle brique pour ouvrir le panneau
**Inspection**, qui vous indique :

- De quel type de brique il s’agit
- Sa position et sa rotation
- À quel monde et à quel bâtiment elle appartient
- Qui est l’auteur du monde

Utilisez **Centrer sur la brique** pour zoomer dessus, ou **Centrer sur le
monde** pour aller à la position d’origine de cette création. Juste à
côté, un bouton **Modifier une copie** forke le Monde auquel appartient
cette brique et ouvre la copie dans l’Éditeur — sans toucher à
l’original. Cliquer sur un sol nu à l’intérieur d’une création ouvre le
même type de panneau (la position et le monde ou l’auteur qui le
contient, sans les champs propres aux briques) avec son propre bouton
**Modifier une copie**, pour la même raison : forker ne demande pas de
trouver d’abord quelque chose de remarquable, juste de cliquer n’importe
où dans le Monde que vous voulez développer.

Cliquez sur une **structure placée** (une instance d’un document entier,
déposée dans une création depuis l’Éditeur — voir
[L’Éditeur](02-TheEditor.md#instances-de-structure--une-référence-vivante))
et le même panneau affiche plutôt ce qu’elle référence : le titre de son
document source, sa position locale et dans le monde, sa rotation,
l’altitude du sol, ainsi que le titre et l’auteur du monde qui la
contient. C’est en lecture seule dans la Vue du Monde — pas de
manipulateur, pas de champ numérique, rien à faire glisser. Cliquez sur
**Ouvrir la source** pour aller directement dans l’Éditeur sur le document
référencé lui-même ; toutes ses autres instances, où qu’elles soient
placées, reflètent ce que vous y modifiez. Son propre bouton **Modifier
une copie**, juste à côté d’Ouvrir la source, vise ce même document
référencé plutôt que le Monde qui se contente de le positionner — si vous
préférez travailler sur une copie indépendante, en laissant intactes
toutes les autres instances (et l’original), utilisez celui-ci plutôt
qu’Ouvrir la source.

Tous les boutons « Modifier une copie » de la Vue du Monde — ici, et sur
le panneau Centrer d’une région, d’un point de repère ou d’une structure
— sont la même action ; voir
[Modifier une copie](#modifier-une-copie--emporter-quelque-chose-dans-léditeur)
ci-dessus.

## Informations sur le document et placement

Sous l’en-tête, vous trouverez deux panneaux pour le document que vous
modifiez actuellement :

- **Informations sur le document** — titre, description, licence, qui
  peut le placer, statut, et (s’il s’agit d’un fork) de quel monde il a
  été forké. Cliquez sur **Modifier les métadonnées** pour changer le
  titre, la description, la licence ou qui peut le placer.
- **Placement** — *où* ce document se trouve dans l’espace partagé, en
  **unités du Monde** (le système de coordonnées propre à ForkBuild, pas
  des coordonnées GPS — une unité du Monde représente un mètre réel).
  Cliquez sur **Déplacer** pour lui donner directement de nouvelles
  coordonnées X/Y/Z, ou utilisez les boutons de décalage ± (1 / 10 / 100
  unités du Monde) pour déplacer la position actuelle avant de confirmer.
  **Centrer** vous y emmène.

Ce sont volontairement deux panneaux distincts : ce qu’*est* une création
et l’endroit où elle *se trouve* sont deux questions différentes, et
déplacer un placement ne modifie jamais le document lui-même (ni
l’inverse).

### Position dans le Monde

Si un autre document occupe déjà exactement l’endroit vers lequel vous le
déplacez, vous voyez un avertissement listant qui s’y trouve avant qu’on
vous demande de confirmer — partager un emplacement est autorisé (une
scène de cour et le bâtiment qui l’entoure peuvent légitimement se
trouver au même endroit), ForkBuild s’assure juste que vous le voyiez
d’abord.

### Les placements qui ne sont pas à vous

Si un placement appartient à quelqu’un d’autre, le panneau Placement
affiche **🔒 Placé par &lt;nom&gt; — vous pouvez voir ce placement mais pas
le déplacer** et le bouton **Déplacer** est désactivé. Vous pouvez
toujours le **Centrer**, l’inspecter, et utiliser **Modifier une copie**
pour développer ce qui s’y trouve ; seul *l’endroit où il se trouve dans
l’espace partagé* reste à lui de déplacer.

### Pourquoi puis-je placer les constructions des autres ?

Un vrai bâtiment ne peut pas être soulevé et posé ailleurs, il peut donc
sembler étrange que ForkBuild vous laisse placer n’importe quelle
construction publiée où vous voulez. Une construction publiée n’est pas
un objet physique unique. C’est un contenu fixe, identifié par son hash
de contenu, un peu comme un fichier ou un dépôt Git. Un **placement** est
un enregistrement signé distinct qui dit « afficher cette construction
ici ». Il pointe vers la construction ; il ne la copie pas. La même
construction peut avoir de nombreux placements, et chacun affiche
exactement le même contenu publié.

Placer la construction de quelqu’un d’autre ne déplace ni ne modifie donc
jamais la sienne :

- **Son placement reste là où elle l’a mis.** Elle seule peut le
  déplacer (voir
  [Les placements qui ne sont pas à vous](#les-placements-qui-ne-sont-pas-à-vous)
  ci-dessus).
- **Votre placement est signé par vous**, et il dit seulement où *vous*
  affichez sa construction.
- **La construction garde son auteur et son historique.** C’est toujours
  exactement le contenu publié, et n’importe qui peut le vérifier par
  rapport à son hash et à sa signature.

Il n’existe pas non plus de monde central unique qui déciderait qui
possède quelle parcelle. Chaque Monde affiche les placements qu’il a
acceptés. C’est pourquoi une construction que quelqu’un annonce près de
vous n’apparaît que comme un fantôme jusqu’à ce que vous choisissiez
**Accepter la position** (voir
[Constructions déclarées](#constructions-déclarées--les-constructions-des-autres-là-où-leurs-éditeurs-disent-quelles-se-trouvent)).
Personne ne peut déposer une construction dans votre Monde sans votre
accord.

Quelques raisons de placer une construction que vous n’avez pas faite :

- **Faire une sélection**, comme un Monde-galerie qui réunit les
  constructions que vous aimez.
- **Composer une scène**, comme placer le château d’un ami à côté de
  votre village.
- **La réutiliser telle quelle.** Placez-la quand vous la voulez sans
  changement, et utilisez
  [Modifier une copie](#modifier-une-copie--emporter-quelque-chose-dans-léditeur)
  seulement quand vous voulez la modifier.

Un éditeur qui ne veut pas de cela peut choisir **Moi seul peux le
placer** en publiant (voir
[Choisir qui peut le placer](04-PublishingAndForking.md#choisir-qui-peut-le-placer)).
Vous pouvez toujours trouver, voir et, si la licence le permet, forker sa
construction, mais vous ne pouvez pas la placer.

### Pourquoi deux constructions peuvent-elles se trouver au même endroit ?

Dans la vraie vie, deux bâtiments ne peuvent pas se tenir au même
endroit. Dans ForkBuild, si, car un placement n’occupe pas de terrain.
Ce n’est qu’une note signée qui dit « afficher cette construction ici »,
et deux notes peuvent désigner le même endroit.

ForkBuild l’autorise exprès :

- **Personne ne distribue le terrain.** Aucun serveur central ne décide
  qui a eu un endroit en premier, et ForkBuild ne désigne jamais de
  gagnant entre deux placements signés. Les deux restent valides.
- **Chaque appareil connaît un ensemble de placements différent.** Un
  endroit occupé sur l’appareil de votre ami peut encore être libre sur le
  vôtre, jusqu’à ce que les placements vous parviennent. Une règle stricte
  « une construction par endroit » donnerait des réponses différentes
  selon les appareils, ForkBuild ne prétend donc pas en imposer une.
- **Parfois, on le veut.** Une scène de cour à l’intérieur d’un bâtiment,
  une ancienne version affichée à la place de la nouvelle, ou des
  expositions superposées exprès sont autant de constructions qui ont
  leur place au même endroit.

Cela ne veut pas dire que n’importe qui peut encombrer vos constructions :

- **Vous êtes prévenu d’abord.** **Déplacer…** liste ce qui se trouve
  déjà à un endroit avant que vous confirmiez, et ForkBuild ne déplace
  jamais discrètement votre construction ailleurs à la place (voir
  [Position dans le Monde](#position-dans-le-monde)).
- **Pas de doublons accidentels.** **Ajouter un placement ici** refuse
  quand un placement se trouve déjà exactement là où vous êtes.
- **La déclaration de quelqu’un d’autre n’est qu’un fantôme.** Une
  position annoncée par quelqu’un d’autre que l’éditeur de la construction
  n’est affichée que comme un fantôme translucide, et jamais à un endroit
  où cet appareil connaît déjà un vrai placement (voir
  [Constructions déclarées](#constructions-déclarées--les-constructions-des-autres-là-où-leurs-éditeurs-disent-quelles-se-trouvent)).
- **Seul le propriétaire peut déplacer ou retirer un placement** (voir
  [Les placements qui ne sont pas à vous](#les-placements-qui-ne-sont-pas-à-vous)).

ForkBuild ne vérifie que les constructions situées exactement au même
point. Deux constructions à des points proches dont les briques se
touchent ne sont pas signalées. Pour le raisonnement de conception, voir
[Overlap Is A Fact; Collision Is A Policy Decision](../../principles/placement.md#overlap-is-a-fact-collision-is-a-policy-decision-0225)
(en anglais) et les règles qui suivent.

### Placer ou forker

Les deux vous permettent d’avoir la construction de quelqu’un d’autre
dans l’un de vos Mondes, mais ce sont deux choses différentes :

| | Placer | Forker (Forker, ou Modifier une copie) |
|---|---|---|
| Ce qui est créé | Un placement : un petit enregistrement signé indiquant où afficher la construction | Un nouveau document, avec de nouveaux identifiants, qui vous appartient |
| La construction | Le même Monde partagé, affiché tel que publié | Votre propre copie, avec une note qui renvoie à l’original |
| Pouvez-vous modifier les briques ? | Non | Oui, dans l’Éditeur |
| Qui est l’auteur | L’éditeur d’origine | Vous, avec l’original enregistré comme parent |
| Régi par | Le réglage **Qui peut le placer** de l’éditeur | La licence |
| La publier | Rien de nouveau n’est publié | Crée un nouveau Monde partagé à votre nom |

Placer revient à créer un lien vers le même fichier depuis une autre
page ; forker revient à cloner un dépôt pour travailler sur sa propre
copie. Seul un fork est donc une vraie copie. Quelqu’un qui a choisi
**Moi seul peux le placer** peut toujours autoriser les forks par sa
licence, et un fork est alors à vous, à placer où vous voulez.

## La Vue du Monde est en lecture seule — on construit dans l’Éditeur

Il n’y a ici ni outil Placement, ni manipulateur de transformation, ni
copier/coller, ni groupes — cliquer, faire glisser ou appuyer sur une
touche ne modifie jamais une brique. Pour développer quelque chose,
utilisez **[Modifier une copie](#modifier-une-copie--emporter-quelque-chose-dans-léditeur)**
et continuez dans [L’Éditeur](02-TheEditor.md). Les exceptions
d’annotation citées en haut de ce guide s’appliquent toujours.

## Voir les autres collaborateurs

Quand plusieurs personnes sont présentes dans le même Monde :

- **Voir les autres** — leurs avatars apparaissent avec leur nom affiché
  et des indicateurs d’activité (par exemple « **Bob — explore à
  proximité** »).
- **Mises à jour en temps réel** — tout ce qu’ils publient (un point de
  repère, un nom, un nouveau fork à eux) apparaît pour vous au moment où
  cela se produit.
- **Fil d’activité éphémère** — un panneau local montre l’activité récente
  pour vous aider à comprendre ce qui a changé, même hors de votre vue
  actuelle. Ce fil est temporaire et n’est pas conservé.

> **La présence décrit l’activité ; elle ne change jamais rien d’elle-même.**
> La présence spatiale vous aide à comprendre ce que font les autres, mais
> seule une vraie modification — faite dans l’Éditeur, ou l’une des
> exceptions d’annotation de la Vue du Monde — change l’environnement
> partagé.

## Enregistrer et publier ici aussi

L’en-tête propose les boutons **Enregistrer**, **Publier** et **Modifier
les métadonnées** dès que vous modifiez quelque chose, pour que vous
puissiez capturer et partager un monde sans le quitter. La ligne d’état
(**🔒 Publié** ou **✎ Modification d’un fork**) indique toujours de quoi il
s’agit.

Un monde publié ne peut jamais changer. Si le monde que vous modifiez est
publié, votre première modification ici — modifier ses métadonnées,
ajouter ou renommer un point de repère ou une région, ou le décorer avec
un animal — crée automatiquement votre propre copie modifiable, intitulée
*« Fork de &lt;nom d’origine&gt; »*, et un court avis (« Votre propre
copie modifiable a été créée — … reste inchangé ») vous le signale. Elle
suit les mêmes règles de licence que tout autre fork (voir
[Publier et forker](04-PublishingAndForking.md#forker--faites-le-vôtre)).

### Mon Monde partagé — distribuer votre propre Snapshot, sans pair nécessaire

Plus bas dans le panneau, sous Recherche et Avatar, se trouve un panneau
**Mon Monde partagé**, qui affiche le titre et l’auteur de votre monde
actuel une fois qu’il est réellement publié, plus son propre bouton
**Distribuer**, qui ouvre exactement le même type de boîte de dialogue
**Distribuer** que celle décrite ci-dessus pour les Rencontres dans le
Monde — c’est le même composant, donc tout ce qui concerne sa
disposition, son bouton **Distribuer** combiné, ses réglages communs de
Stockage et de support, ses sections **Déclaration signée** / **Snapshot**
et leur comportement « fermer ne perd jamais un résultat » est exactement
comme décrit dans
[Rencontres dans le Monde](#rencontres-dans-le-monde--publications-et-avatars-que-vos-pairs-partagent)
ci-dessus. La seule différence est *ce qu’*elle distribue : la boîte de
dialogue des Rencontres dans le Monde agit toujours sur la publication
rencontrée que vous avez sélectionnée ; celle-ci agit toujours sur *votre
propre monde actuel*, et aucune ne partage d’état, d’historique ni de
résultat avec l’autre — **Distribuer la Déclaration signée seulement**
distribue ici la Déclaration signée derrière votre monde de la même façon
que le bouton des Rencontres dans le Monde ; **Distribuer le Snapshot
seulement** le distribue selon le protocole distinct des Snapshots — voir
[Snapshot local](09-PublicationsAndEvidence.md#snapshot-local) pour ce que
signifie cette distinction. L’épinglage IPFS distant et l’ancrage Bitcoin
ou Base restent dans le Centre de publication de la page Publications
(voir [Publication IPFS](11-EvidenceAndStorage.md#publication-ipfs) et
[Le parcours d’ancrage Bitcoin](11-EvidenceAndStorage.md#le-parcours-dancrage-bitcoin))
— les deux demandent d’abord un compte ou un portefeuille connecté, aucun
n’est donc un bouton en un clic ici.

L’intérêt de Mon Monde partagé est qu’il ne dépend jamais de ce que les
Rencontres dans le Monde ont à montrer. Les Rencontres dans le Monde
n’affichent que ce qu’un pair actuellement ou récemment connecté vous a
signalé — sans personne autour, elles restent vides. Mon Monde partagé
n’a besoin de rien de tout cela : il est toujours là dès que vous avez un
monde ouvert, que quelqu’un d’autre soit à proximité ou non, et qu’il
soit actuellement publié ou non (tant que vous ne l’avez pas publié, le
bouton est simplement désactivé, avec une note indiquant qu’il n’y a
encore rien à distribuer).

**Distribuer** et le lien de partage sont en avant. Les actions moins
fréquentes attendent derrière **Plus ▾** : **Exporter le Snapshot**,
**Vérifier la correspondance du Snapshot**, **Outils de diagnostic**
(ci-dessous) et **Dépublier…**. Dépublier demande une confirmation avant
d’agir — cela retire le Monde du catalogue, tandis que ses placements, le
Document et toutes les copies distribuées restent — et **Annuler** fait
marche arrière. Les résultats d’Exporter et de Vérifier restent sur le
panneau après la fermeture du menu.

Quand le Monde que vous avez ouvert a été publié par quelqu’un d’autre
(un Monde qu’un pair a partagé avec vous, par exemple), le panneau
s’intitule plutôt **Monde partagé**, et omet **Dépublier** et
**Distribuer** : seul l’éditeur d’un Monde peut le retirer ou le
distribuer. Ses placements, ses outils de Snapshot, son lien de partage et
ses **Commentaires** restent, vous pouvez donc toujours lire et publier
des commentaires sur le Monde de n’importe qui.

Sous tout cela se trouve une section **Commentaires**, repliée en une
seule ligne **▸ Commentaires (N)** jusqu’à ce que vous cliquiez dessus (le
nombre reste à jour pendant qu’elle est repliée), et, comme tout le reste
de ce panneau, limitée à votre monde actuel — voir
[Commentaires](09-PublicationsAndEvidence.md#commentaires) pour savoir qui
peut commenter et ce qui se passe quand on le fait. Comme pour Distribuer
le Snapshot, publier réellement un commentaire demande d’abord que votre
monde soit publié ; d’ici là, la zone de saisie reste désactivée.

Une liste **Placements (N)** affiche tous les endroits où ce Monde
partagé est réellement placé, dans l’ordre où ils ont été trouvés —
position, révision et (quand il est connu) propriétaire, une ligne par
placement. Rien ici n’est réduit à « le plus récent » : un Monde partagé
peut réellement se trouver à plus d’un endroit, et chaque placement que
cet appareil peut découvrir est listé, jamais un seul remplaçant, le plus
récemment mis à jour, pour tous les autres.

Chaque ligne a ses propres **Déplacer…** et **Retirer…**, qui agissent
exactement sur ce placement et aucun autre. **Déplacer…** ouvre la même
boîte de dialogue X/Y/Z Déplacer le placement (avec son avertissement de
chevauchement) pour ce placement. **Retirer…** demande une confirmation
avant de retirer ce placement du Monde ; le Monde partagé, son Document et
les autres placements restent, et retirer le dernier placement signifie
seulement que la construction n’apparaît plus nulle part jusqu’à ce que
vous la placiez de nouveau. Les deux sont désactivés sur un placement fait
par quelqu’un d’autre : seul son propriétaire peut le déplacer ou le
retirer.

**Ajouter un placement ici**, sous la liste, place la même construction
*encore une fois* à la position de votre avatar (ou, sans avatar, de la
caméra) — il ne déplace jamais un placement existant ; utilisez pour cela
le **Déplacer…** de ce placement. Il ajoute un placement, pas une copie :
la construction reste un seul Monde partagé (voir
[Placer ou forker](#placer-ou-forker)). La confirmation indique où elle a
été placée et combien de placements a désormais le Monde partagé. Si un
placement se trouve déjà exactement là où vous êtes, le bouton refuse et
vous demande de vous déplacer d’abord, pour que des clics répétés ne
puissent pas empiler des doublons invisibles au même endroit. Une liste
vide signifie simplement que ce Monde partagé n’a encore été placé nulle
part ; un échec de lecture affiche plutôt sa propre erreur.

Dans **Plus**, un bouton **Outils de diagnostic** — présent seulement si
au moins l’une des fonctions qu’il regroupe est disponible — ouvre une
petite fenêtre d’outils de récupération manuels, étape par étape, pour
quand la découverte ou le placement automatiques des Snapshots ne donnent
pas ce que vous attendez : **Découvrir des Snapshots** parcourt tout ce
qui a été annoncé sous le tag de découverte de campagne commun —
accessible même sans pair connecté, sans Rencontres dans le Monde et sans
encore de Monde partagé à vous ; en sélectionner un et cliquer sur
**Résoudre le Snapshot sélectionné** vérifie s’il peut réellement être
récupéré ; de là, vous pouvez **Attribuer le Snapshot sélectionné**
(correspond-il au hash de contenu de ce Monde partagé ?) et,
indépendamment, **Matérialiser le Snapshot sélectionné** (stocker ses
octets sur cet appareil) — et, à tout moment une fois un candidat
sélectionné, **Utiliser la position déclarée** adopte la position que le
Snapshot déclare lui-même, s’il en a une. Une fois matérialisé, **Placer
le Snapshot matérialisé** puis **Enregistrer le Snapshot placé** l’ajoutent
réellement au Monde que vous regardez, sans rechargement. Chacune de ces
actions est un clic explicite — rien ici n’enchaîne, ne réessaie ni ne
classe un candidat pour vous ; c’est la même retenue que tous les autres
parcours manuels, une étape à la fois, de ForkBuild.

**Le parcours automatique, dont cette fenêtre est le recours, puise à
d’autres sources que cet appareil.** Pendant que vous marchez, ForkBuild
cherche régulièrement, en arrière-plan, des Snapshots candidats — la même
vérification que **Découvrir des Snapshots** ci-dessus lance à la main —
en réunissant en un seul ensemble de candidats ce que cet appareil détient
déjà localement, ce qu’un pair connecté a partagé passivement (simplement
en étant connecté, sans aucune action de sa part) et ce que Nostr
signale. Un candidat qui se résout passe discrètement par la même chaîne
résoudre → matérialiser → placer → enregistrer décrite ci-dessus, et
apparaît exactement comme n’importe quel autre marqueur de **Rencontre
dans le Monde** — il n’y a pas de liste ni de notification séparée
« découvert automatiquement », et les boutons manuels des Outils de
diagnostic ci-dessus fonctionnent toujours exactement comme décrit, sans
changement, pour les fois où ce parcours passif ne trouve pas ce que vous
cherchez.

Le parcours automatique ne télécharge que les Snapshots proches de vous :
ceux placés, ou annoncés comme placés, dans votre case de carte ou celles
qui l’entourent (environ 1 000 unités dans chaque direction), plus les 20
plus récents qui n’indiquent pas où ils se trouvent. Un Snapshot plus
lointain est téléchargé quand vous vous en approchez. Quatre au plus se
téléchargent à la fois. Un Snapshot déjà téléchargé par cet appareil est
lu depuis son propre stockage au lieu d’être téléchargé de nouveau, après
la même vérification du contenu.

## Historique — prévisualiser et restaurer des états antérieurs

Chaque modification que vous faites ici — ajouter, renommer ou retirer un
point de repère ou une région — est enregistrée dans l’historique du
document. Cliquez sur **Historique** dans l’en-tête pour l’ouvrir. Vous
verrez une liste numérotée avec des horodatages, comme :

```
1. Créer le point de repère « Vieux pont »
2. Modifier la région « Village des Saules »
3. Retirer le point de repère
```

Les entrées que vous avez annulées sont marquées **annulé**. Cliquer sur
une entrée ne fait que la sélectionner ; rien ne change tant que vous
n’appuyez pas sur l’un des boutons :

- **Aperçu** — montre à quoi ressemblait le monde *juste après* l’étape
  sélectionnée, à côté de l’état actuel, sans rien changer. **Quitter
  l’aperçu** revient au présent.
- **Restaurer** — fait de l’étape sélectionnée votre état **actuel**. Le
  document est laissé avec des modifications non enregistrées, vous
  pouvez donc encore décider de l’enregistrer ou non. Il n’y a pas de
  confirmation séparée.
- **Fermer** — ferme le panneau.

## Et ensuite ?

Prêt à partager ce que vous avez créé, ou à remixer le travail de
quelqu’un d’autre ? Passez à
**[Publier et forker](04-PublishingAndForking.md)**.
