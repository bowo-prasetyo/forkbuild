<!-- translation-of: docs/user/06-AvatarsAndPresence.md source-hash: 5914df7d440551c6 -->
# 06 — Avatars et présence

<!-- languages -->
[English](../06-AvatarsAndPresence.md) · [Deutsch](../de/06-AvatarsAndPresence.md) · [Español](../es/06-AvatarsAndPresence.md) · **Français** · [Bahasa Indonesia](../id/06-AvatarsAndPresence.md) · [日本語](../ja/06-AvatarsAndPresence.md) · [한국어](../ko/06-AvatarsAndPresence.md) · [Português (Brasil)](../pt-BR/06-AvatarsAndPresence.md)
<!-- /languages -->

Votre **avatar** est la façon dont les autres vous voient dans la Vue du
Monde — son apparence, sa position et ses mouvements. Ce guide explique
comment le personnaliser, contrôler qui peut le voir, et interagir avec
ceux des autres.

## Personnaliser votre avatar

Ouvrez **Mon avatar** dans la barre du haut :

1. Choisissez un **Modèle** — un type de corps (par exemple « Humanoid
   01 ») — dans la liste déroulante. Un aperçu plat se met à jour en
   direct pendant que vous choisissez.
2. Pour chaque partie que le modèle déclare (les modèles intégrés
   proposent **peau, cheveux, haut, pantalon**), choisissez une option
   dans sa liste déroulante, et une couleur quand le modèle le permet.
3. Cochez les **accessoires** que le modèle propose, dans une liste à
   cocher. (Toute partie qui permet plusieurs choix à la fois s’affiche
   sous forme de liste à cocher comme celle-ci ; la page affiche
   exactement les parties que déclare le modèle choisi.)
4. Définissez votre **Nom affiché** (jusqu’à 60 caractères) — c’est le
   nom affiché avec votre avatar et dans Pairs et Conversations.
5. Cliquez sur **Enregistrer**.

Changer de modèle remet l’apparence aux valeurs par défaut de ce modèle —
les choix ne passent pas d’un modèle à l’autre. Il n’y a pas d’aperçu 3D
ici ; vous voyez votre véritable avatar la première fois que vous (ou
quelqu’un d’autre) le regardez dans la Vue du Monde.

## Qui peut vous voir : deux réglages indépendants

La page Mon avatar a deux contrôles de visibilité distincts. Il est
facile de les confondre, alors gardez-les bien séparés :

| Réglage | Contrôle |
|---|---|
| **Visibilité de la présence** | Qui reçoit votre *position en direct* — si et où vous apparaissez en vous déplaçant dans la Vue du Monde |
| **Visibilité du profil** | Qui reçoit votre *apparence* — modèle, couleurs, accessoires, nom affiché |

Les deux proposent les mêmes quatre niveaux, et les deux commencent sur
**Public** :

- **Public** — toute personne connectée peut la voir.
- **Amis** — les amis mutuels, plus les identités que vous listez
  explicitement (collez des ID d’identité, un par ligne). C’est une simple
  liste d’autorisation, pas un parcours de demande et d’approbation —
  voir [Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md)
  pour ce que « ami » signifie.
- **Local** — seulement les autres onglets ForkBuild ouverts dans ce même
  navigateur ; jamais envoyée à un pair, pas même à un ami.
- **Masqué** — jamais annoncée, à personne. C’est ainsi que vous devenez
  invisible.

Chaque section a son propre bouton **Enregistrer** — enregistrer l’une
n’enregistre jamais l’autre. « Enregistré. » apparaît après un
enregistrement et disparaît dès que vous modifiez de nouveau cette
section, pour toujours décrire ce que vous avez sous les yeux.

Être l’ami de quelqu’un ne révèle **pas** à lui seul votre avatar — ces
deux réglages décident de ce qui est réellement partagé,
indépendamment l’un de l’autre. Et ils n’affectent que les mises à jour
*futures* : quelqu’un qui a déjà reçu votre position ou votre apparence
garde ce qu’il a ; il n’existe pas de « oublie-moi » à distance.

Vous pouvez aussi cocher **Afficher mon avatar** et **Afficher les autres
avatars** directement dans la Vue du Monde, comme de simples interrupteurs
d’affichage locaux. Tant que vous n’avez pas votre propre avatar, la
section Avatar de la Vue du Monde n’affiche que **Afficher les autres
avatars** et une note expliquant comment en créer un ; les contrôles qui
ont besoin de votre avatar apparaissent une fois que vous l’avez.

## Voir les autres dans la Vue du Monde

Toute personne dont vous pouvez recevoir la présence (selon sa propre
Visibilité de la présence) apparaît automatiquement pendant que vous vous
déplacez — aucune demande d’ami n’est nécessaire pour voir un avatar
public. Cliquez sur un avatar (ou sur une entrée du panneau **Avatars
proches** — une simple liste de toutes les personnes proches, avec la
distance et l’animation en cours) pour ouvrir son **panneau d’infos
d’avatar** :

- Nom affiché et modèle d’avatar
- Une ligne d’état — **Présent / Périmé / Absent**, et une étiquette de
  confiance (**Fiable / Non signé / Contradictoire**) qui décrit à quel
  point les données de cet avatar sont vérifiées
- Position, distance (en unités du Monde) et animation en cours (Marche,
  Immobile, …)
- **Suivre l’avatar** — verrouille votre caméra sur ses mouvements
- **Saluer / Faire signe / Montrer du doigt** — envoie un geste ponctuel à
  cet avatar
- **Suivre ses créations** — suit l’identité derrière l’avatar, pour que
  ses nouvelles créations apparaissent sur la page **Abonnements** (voir
  [Suivre des personnes](07-PeerConnectionsAndFriends.md#suivre-des-personnes)).
  Ce bouton n’apparaît que si la présence de l’avatar est signée, car
  c’est la signature qui prouve à qui appartient l’avatar.

Pour le reste, un avatar distant est en lecture seule — il est impossible
de déplacer, modifier ou supprimer l’avatar de quelqu’un d’autre, seulement
de le regarder, le suivre et lui faire des gestes.

Qu’un avatar proche apparaisse ou non dépend de l’endroit que regarde
votre **caméra**, et non de la direction dans laquelle marche votre propre
avatar — les deux peuvent pointer dans des directions différentes, le
plus souvent juste après avoir fait orbiter librement la caméra. Quelqu’un
qui se tient en plein sur votre chemin peut être totalement invisible
pendant que votre caméra regarde ailleurs ; tournez ou faites orbiter la
caméra vers lui et il réapparaît.

## Faire marcher votre avatar

Faire voler la caméra ([Vue du Monde](03-WorldView.md#se-déplacer)) est une
façon de se déplacer, mais vous pouvez aussi faire marcher directement
votre avatar avec le **mode Contrôle de l’avatar**. Pour l’activer, vous
devez être connecté avec un avatar enregistré dans **Mon avatar** ; cochez
alors **Contrôler mon avatar (WASD, Maj, Espace)** dans la section
**Avatar** de la Vue du Monde. Les touches ne font rien tant que vous ne
l’avez pas fait, et elles sont ignorées quand un champ de texte a le
focus — cliquez d’abord dans la vue 3D.

| Touche | Action |
|---|---|
| **W / A / S / D** | Avancer / tourner |
| **Maj** | Courir (déplacement plus rapide) |
| **Espace** | Sauter |
| **Alt + W / S** | Marche continue sans les mains, vers l’avant ou l’arrière — continue après avoir relâché les touches |
| **Alt + Maj + W / S** | Pareil, mais en courant |

Les lettres W, A, S et D sont celles imprimées sur les touches : sur un
clavier AZERTY, utilisez donc W, A, S et D là où elles se trouvent (et non
Z, Q, S, D).

Sur un téléphone ou une tablette, un joystick et des boutons à l’écran
remplacent ces touches : poussez le joystick pour marcher et jusqu’à son
bord pour courir, et touchez **Sauter**. Voir
[Écrans tactiles](ControlsReference.md#marcher-vue-du-monde).

La marche tient compte des collisions avec les bâtiments chargés
alentour, les arbres et la faune — vous ne pouvez pas traverser les
structures chargées autour de vous, les arbres générés avec le terrain, ni
un cerf ou un lapin qui broute à proximité (voir
[Vue du Monde](03-WorldView.md#se-déplacer)). La faune ne fait que bloquer
votre chemin comme un arbre, où que l’animal se soit aventuré — il peut
tourner la tête pour vous observer, mais il ne s’écarte jamais de votre
chemin et ne subit aucun dommage, et un véhicule le traverse ; seule la
marche à pied est arrêtée. Un animal que vous avez attrapé ne bloque plus
rien. Votre avatar peut marcher sur les structures placées, escalader des
surfaces verticales et parcourir un terrain accidenté. La caméra suit
naturellement votre avatar pendant que vous vous déplacez.

**Suivre l’avatar** garde la caméra verrouillée sur votre avatar pendant
qu’il se déplace, au lieu d’orbiter librement. Vous pouvez aussi suivre
les avatars d’autres joueurs pour voir où ils vont.

### Perspective de la caméra

À côté de Suivre l’avatar se trouve **Caméra**, une rangée de quatre
boutons — **Libre**, **Première personne**, **Troisième personne** et
**Vue aérienne** — pour verrouiller votre caméra à un décalage fixe par
rapport à votre propre avatar au lieu de la piloter vous-même. Comme
Suivre l’avatar, ils demandent un avatar local (Mon avatar) pour être
actifs.

- **Libre** est la caméra orbitale ordinaire — celle par défaut de la Vue
  du Monde, et celle que supposent toutes les autres commandes de caméra
  de ce guide.
- **Première personne** place la caméra à hauteur des yeux de votre
  avatar, regardant dans la direction où il est tourné.
- **Troisième personne** se place derrière et au-dessus de votre avatar,
  en regardant légèrement vers le bas — le cadrage classique « voir son
  propre personnage ».
- **Vue aérienne** regarde droit vers le bas depuis très haut, suivant la
  position de votre avatar mais ignorant délibérément son orientation,
  pour que la vue ne tourne jamais quand vous tournez.

Cliquer sur le bouton déjà actif revient à **Libre**. Une perspective de
caméra est purement locale — elle n’est jamais partagée avec un
collaborateur et n’affecte jamais ce qu’il voit.

Les deux modes se comportent différemment quand vous tournez : avec une
perspective verrouillée (Première ou Troisième personne), la caméra se
recadre sur le cap actuel de votre avatar à chaque mouvement, si bien que
votre vue tourne exactement comme vous. Avec **Libre**, la caméra ignore
délibérément l’orientation — tourner sur place, marcher ou monter sur un
véhicule ne la déplace ni ne la fait jamais tourner d’elle-même ; seuls
vos propres glissements, déplacements et zooms le font. Si vous faites
orbiter la caméra pour regarder d’un côté puis partez marcher de l’autre,
la caméra continue de regarder là où vous l’avez dirigée en dernier,
plutôt que de vous suivre.

### Déplacement continu sans les mains

Maintenir **Alt** en appuyant sur **W** ou **S** fait marcher votre avatar
(ou, avec **Maj** également maintenu, courir) dans cette direction en
continu — il continue même après que vous avez relâché toutes les
touches, exactement comme un régulateur de vitesse. Appuyer de nouveau
sur **W** ou **S** *sans* Alt l’annule et revient au déplacement normal
touche maintenue ; appuyer de la même façon sur la direction opposée
l’annule aussi, au lieu de l’inverser. Au clavier, aucun indicateur à
l’écran ne montre qu’il est actif — le seul signe est que votre avatar
continue de marcher tout seul.

Sur un téléphone ou une tablette, le bouton **Croisière** du pavé tactile
fait la même chose : touchez-le une fois pour marcher vers l’avant sans
les mains, une deuxième fois pour courir, et une troisième pour vous
arrêter. Il affiche **Croisière : marche** ou **Croisière : course**
quand il est actif. Pousser le joystick vers l’avant ou l’arrière l’arrête
aussi, comme appuyer sur **W** ou **S** ; le pousser sur le côté ne fait
que vous tourner, vous pouvez donc diriger en croisière.

### Véhicules

Certains mondes placent un vélo, une moto, une voiture ou un drone que
votre avatar peut utiliser au lieu de marcher. Approchez-vous assez de
l’un d’eux et une indication apparaît, précisant quelle touche permet de
monter :

| Touche | Action |
|---|---|
| **E** (près d’un véhicule) | Monter |
| **E** (à bord) | Descendre |
| **W / S** | Accélérer / reculer |
| **A / D** | Tourner l’orientation de votre avatar — la même rotation continue qu’à pied, pas la direction du véhicule |
| **← / →** (appui) | Diriger — un seul virage de 45° de la direction visée par le véhicule à chaque appui ; maintenir la touche ne continue pas de tourner, il faut un nouvel appui pour chaque virage |
| **Ctrl** (maintenu) | Freiner |

Une fois à bord, **W/S** et **Ctrl** pilotent le véhicule, tandis que
**←/→** le dirigent — il n’y a pas de « mode conduite » séparé à activer.
**A/D** font toujours tourner le corps de votre avatar, exactement comme à
pied, indépendamment de la direction. Descendre remet votre avatar à pied
à un endroit dégagé à côté du véhicule. La vitesse maximale,
l’accélération, le freinage et la manœuvrabilité d’un véhicule dépendent
de son type, et son encombrement pour les collisions est dimensionné en
conséquence — aujourd’hui, ce sont le vélo, la moto, la voiture et le
drone, les quatre véhicules que les mondes placent et affichent
réellement. Une moto est plus rapide qu’un vélo et plus rare, une voiture
est encore plus rapide qu’une moto et encore plus rare, et un drone est le
plus rapide et le plus rare de tous.

Un drone repose au sol, immobile, exactement comme les trois autres,
jusqu’à ce que vous montiez dessus et commenciez à bouger — maintenir
**W** ou **S** le fait décoller ; relâcher le ramène au sol. Une fois en
l’air, il vole au-dessus des arbres, mais un grand bâtiment le bloque
toujours exactement comme il bloquerait une voiture : voler ne veut pas
dire ignorer la géométrie du monde. Vous ne pouvez pas descendre d’un
drone en plein vol — ramenez-le d’abord au sol.

#### Emporter un véhicule

Vous avez trouvé un véhicule loin de l’endroit où vous en aurez besoin
plus tard ? À bord, appuyez sur **Q** pour le ranger dans votre
inventaire — il disparaît du monde et vous descendez du même geste.
Marchez n’importe où ailleurs, appuyez de nouveau sur **Q** à pied, et le
véhicule rangé sélectionné apparaît exactement là où vous êtes, avec vous
déjà à bord. Il n’y a pas de limite aujourd’hui au nombre de véhicules
que vous pouvez emporter, et un véhicule rangé ne réapparaît jamais là où
vous l’avez trouvé.

Par défaut, **Q** sort le dernier véhicule que vous avez rangé. Si vous en
transportez plusieurs, appuyez sur **[** ou **]** pour faire défiler la
sélection vers l’arrière ou vers l’avant parmi tout ce que vous
transportez — l’indication montre lequel est sélectionné et sa position
(par exemple « Sortir : Vélo (1/3) ») pour que vous puissiez en retrouver
un plus ancien sans devoir sortir et ranger les autres. Faire défiler ne
change que ce que **Q** sortira ensuite ; cela ne fait jamais apparaître
ni disparaître quoi que ce soit.

#### Rouler avec d’autres personnes autour

Les personnes qui peuvent voir votre avatar voient aussi ce que vous
conduisez : votre vélo, moto, voiture ou drone est dessiné sous vous sur
leur écran, tourné dans la direction où vous allez, et elles entendent son
moteur, quand vous montez et descendez, et vos freinages (voir « Son »
dans [03 — La Vue du Monde](03-WorldView.md)). Vous voyez et entendez les
leurs de la même façon. Cela suit votre réglage de présence : qui ne peut
pas vous voir n’apprend pas non plus ce que vous conduisez.

Pendant que quelqu’un d’autre conduit un véhicule, votre propre copie de
celui-ci disparaît et vous ne pouvez pas monter dessus ; le véhicule que
vous conduisez vous-même reste toujours à vous. L’endroit où se trouve un
véhicule quand personne ne le conduit n’est cependant pas partagé : une
fois que l’autre personne en descend, il réapparaît sur votre écran là où
vous l’avez vu stationné pour la dernière fois, ce qui n’est peut-être pas
là où elle l’a laissé. Un véhicule rangé avec **Q** ou sorti ailleurs
n’existe de même que sur l’écran de son propriétaire jusqu’à ce qu’il le
conduise.

### Animaux

Certains mondes ont de la faune — des cerfs dans les forêts, des lapins
dans les prairies. Les animaux sauvages errent lentement autour de
l’endroit où le monde les a placés, sans jamais s’éloigner de plus de
quelques pas. Approchez-vous assez de l’un d’eux et une indication vous
propose d’appuyer sur **F** pour l’attraper. L’attraper l’ajoute à votre
inventaire (le même inventaire que celui des véhicules rangés) et le
retire du monde.

Marchez n’importe où ailleurs et appuyez de nouveau sur **F** — sans rien
d’attrapable à proximité, cela relâche le dernier animal attrapé
exactement là où vous êtes, et il peut aussitôt être attrapé de nouveau
si vous le voulez. Un animal relâché reste exactement là où vous l’avez
laissé, mais il n’est pas figé : il broute, regarde autour de lui et se
tourne de temps en temps dans une nouvelle direction, et tourne la tête
pour vous observer quand vous approchez. Il n’y a pas de limite
aujourd’hui au nombre d’animaux que vous pouvez transporter, et en
attraper un ne dérange jamais un véhicule que vous transportez aussi, ni
l’inverse — ils partagent le même sac mais ne se mélangent jamais.

#### Décorer un Monde avec un animal

Un animal relâché ne vit que dans votre propre session. Pour en faire un
élément durable du Monde — par exemple un lapin assis sur quelque chose
que vous avez construit — placez-vous à côté d’un animal que vous avez
relâché et appuyez sur **G**. Il devient une **décoration animale** :
enregistrée dans le contenu propre du Monde, elle est donc incluse quand
ce Monde est publié ou distribué, et toute personne qui l’ouvre la voit,
identique à l’animal dont elle vient. Elle reste à l’endroit choisi (un
lapin sur un toit n’en descend donc jamais), mais broute, regarde autour
d’elle et tourne sur place, et toute personne qui ouvre le Monde la voit
faire la même chose au même moment.

Une décoration n’est que décorative — elle ne peut pas être attrapée avec
**F**. Vous avez changé d’avis ? Placez-vous à côté et appuyez de nouveau
sur **G** : la décoration est retirée du Monde et redevient un animal
vivant, attrapable. Quand les deux sont à proximité, **G** décore d’abord
un animal fraîchement relâché, de même que **F** préfère attraper plutôt
que relâcher. Seuls les animaux que vous avez relâchés peuvent être
transformés en décoration — la faune placée par le monde lui-même, non.
Une indication s’affiche quand **G** décorerait ou annulerait quelque
chose à proximité. Comme pour ajouter un
[point de repère](03-WorldView.md#points-de-repère--marquer-un-lieu-qui-mérite-quon-sen-souvienne),
décorer demande d’être connecté avec le droit de MODIFICATION sur le Monde
où vous êtes. Sur le Monde publié de quelqu’un d’autre, la décoration va
dans votre propre copie — à condition que sa licence autorise les forks.
Si rien de tout cela ne s’applique, **G** ne fait simplement rien ; le
bouton **Décorer** du pavé tactile, lui, vous explique pourquoi.

### Habitants

Un Monde peut avoir des **habitants** : des personnes qui y vivent et se
promènent autour de l’endroit qu’elles appellent leur maison, vaquant à
leurs occupations au milieu de vos bâtiments. Pour en ajouter un,
placez-vous sur un terrain dégagé où vous voulez qu’il vive et appuyez sur
**R** (ou cliquez sur **Ajouter un habitant ici** dans la section
**Avatar**). Il apparaît juste à côté de vous, et à partir de là il fait
partie du contenu propre du Monde — enregistré, publié et forké avec lui,
comme un
[point de repère](03-WorldView.md#points-de-repère--marquer-un-lieu-qui-mérite-quon-sen-souvienne).
En ajouter un demande d’être connecté avec le droit de MODIFICATION sur le
Monde où vous êtes ; sur le Monde publié de quelqu’un d’autre, l’habitant
va dans votre propre copie. Vous avez changé d’avis ? Placez-vous à côté
d’un habitant et appuyez de nouveau sur **R** (une indication affiche
**[R] Retirer l’habitant**), ou annulez avec **Ctrl/Cmd+Z**.

Les habitants restent à environ six pas de chez eux. Ils contournent les
murs, les arbres et l’eau, sans jamais les traverser, et font une pause
de temps en temps pour s’arrêter et regarder autour d’eux. Toute personne
qui ouvre le Monde voit chaque habitant au même endroit au même moment,
car leur position découle du Monde et de l’horloge, et non de quoi que ce
soit envoyé entre joueurs. Ils sont solides : vous les heurtez comme un
arbre. Ils ne s’arrêtent pas et ne s’écartent pas pour vous, cependant,
si bien que l’un d’eux peut vous traverser pendant que vous êtes immobile.

Les habitants vous remarquent. Quand l’un d’eux est arrêté et que vous
êtes devant lui ou sur son côté, à quelques pas, il se tourne vers vous,
et si vous venez juste à côté de lui, il vous fait signe. Il fait signe
une fois chaque fois que vous venez le voir. Comme pour les animaux, cela
ne se produit que sur votre écran, et seulement pour votre propre avatar.

Les habitants connaissent aussi leur voisinage. Placez-vous à côté de
l’un d’eux et appuyez sur **T** (une indication affiche **[T] Parler** ;
la section Avatar et le pavé tactile ont aussi un bouton **Parler**), et
il vous dit une ou deux choses sur ce qu’il y a autour, dans une bulle
au-dessus de sa tête : un vélo ou un cerf à proximité, un point de repère,
une structure placée dans le Monde (par son titre et son auteur),
quelqu’un qui est dans les parages, le lieu où il vit, ou une autre
construction un peu plus loin — par exemple *« Il y a une construction
appelée « Fort de la colline », de bob, à environ 3,6 km au nord-est. »*
Les distances sont arrondies et les directions sont vues depuis l’endroit
où se tient l’habitant (le nord est la direction qu’indique la boussole).
Parlez-lui de nouveau et il mentionne autre chose. La bulle disparaît
après quelques secondes, ou dès que vous vous éloignez.

Tant que la bulle est affichée, un bouton **Centrer** apparaît en bas de
la vue pour chaque chose mentionnée qui ne bouge pas — un point de
repère, une structure, une construction ou un véhicule (les animaux et les
personnes se déplacent, ils n’en ont donc pas). Cliquez dessus pour
tourner la caméra et jeter un œil, comme **Centrer** dans le panneau
Emplacements : votre avatar reste à côté de l’habitant, et marcher de
nouveau ramène la caméra si Suivre l’avatar est activé.

Ce que dit un habitant, c’est ce que sait *votre* copie de ForkBuild : les
constructions de votre catalogue, les personnes présentes avec vous, les
véhicules et les animaux que vous n’avez pas pris. Quelqu’un d’autre qui
parle au même habitant peut entendre des choses différentes, et personne
d’autre ne voit jamais ce qu’il vous a dit. Il ne mentionne jamais un
véhicule que vous avez rangé ou que vous conduisez, un véhicule conduit
par quelqu’un d’autre, ni un animal que vous avez attrapé. Les
constructions sont nommées avec le titre et l’auteur que leur donne leur
publication, comme partout ailleurs dans l’application.

Un habitant a besoin d’un terrain sec et dégagé : pas un toit, pas l’eau,
et pas pendant que vous êtes à bord d’un véhicule. La section Avatar
indique pourquoi quand elle ne peut pas en ajouter un là où vous êtes. Les
habitants ne sont pas des personnes — ils n’ont pas de profil,
n’apparaissent jamais sous Personnes ou À proximité, ne peuvent pas être
cliqués pour des infos, et ne vous donnent jamais de quêtes, de tâches ni
de récompenses — ils vivent simplement là, et vous disent ce qu’il y a
autour quand vous le demandez.

#### Ce qui survit à un rechargement

Votre inventaire — chaque véhicule et animal que vous transportez — est
enregistré sur cet appareil, tout comme les véhicules que vous avez placés
ou conduits quelque part et les animaux que vous avez relâchés,
exactement là où vous les avez laissés. Recharger la page ou revenir plus
tard reprend exactement où vous en étiez.

### Conscience spatiale et activité

Quand d’autres personnes sont présentes, vous voyez des indicateurs
contextuels montrant ce qu’elles font :

- « **Bob — explore à proximité** » apparaît près de son avatar pendant
  qu’il vole ou marche.
- « **Alice — inspecte une brique** » indique que quelqu’un regarde
  quelque chose de près, sans le modifier.

Ces indicateurs d’activité découlent des données de présence spatiale et
vous aident à comprendre ce que regardent les autres sans communication
explicite.

Les indicateurs d’activité décrivent seulement ce que fait quelqu’un ; ils
ne changent jamais rien — voir
[Voir les autres collaborateurs](03-WorldView.md#voir-les-autres-collaborateurs).

## Et ensuite ?

Trouvez des personnes avec qui vous connecter dans
**[Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md)**,
puis discutez avec vos amis dans
**[Chat et conversations](08-ChatAndConversations.md)**.
