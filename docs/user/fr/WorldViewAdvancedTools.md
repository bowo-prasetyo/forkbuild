<!-- translation-of: docs/user/WorldViewAdvancedTools.md source-hash: 29cdc8613dfca1c8 -->
# La Vue du Monde : outils avancés

<!-- languages -->
[English](../WorldViewAdvancedTools.md) · [Deutsch](../de/WorldViewAdvancedTools.md) · [Español](../es/WorldViewAdvancedTools.md) · **Français** · [Bahasa Indonesia](../id/WorldViewAdvancedTools.md) · [日本語](../ja/WorldViewAdvancedTools.md) · [한국어](../ko/WorldViewAdvancedTools.md) · [Português (Brasil)](../pt-BR/WorldViewAdvancedTools.md)
<!-- /languages -->

<!-- stale -->
> **Remarque :** la version anglaise de cette page a changé depuis sa traduction, cette traduction n’est donc peut-être plus à jour. Consultez la [version anglaise](../WorldViewAdvancedTools.md).
<!-- /stale -->

Cette page présente les parties de la [Vue du Monde](03-WorldView.md) qui
n’apparaissent que si vous cochez **Afficher les outils avancés** en bas du
panneau latéral. Elles servent aux réseaux derrière le Monde : où une
construction est placée, où elle est stockée et ce que d’autres ont annoncé
à proximité.

Vous n’en avez besoin d’aucune pour marcher, construire, remixer ou
partager un lien. La case est mémorisée sur cet appareil et ne change rien
pour personne d’autre.

**Avec les outils avancés, vous avez :**

| Outil | Où il se trouve | À quoi il sert |
|---|---|---|
| [Inspecter](#inspecter-une-brique--ou-une-structure-placée) | Clic sur une brique ou une structure placée | Voir ce que c’est et d’où ça vient |
| [Caméra et modification](#caméra-et-modification) | Une ligne dans l’en-tête du panneau | Voir à quelle construction s’applique votre prochain changement |
| [À propos de cette construction, et Placement](#informations-sur-la-construction-et-placement) | Sous l’en-tête, après un clic | Les informations d’une construction et où elle se trouve |
| Coordonnées et recherche par **Emplacement** | Au-dessus de la vue, et dans **Recherche** | Trouver des choses par leur position X/Y/Z |
| [Rencontres dans le Monde](#rencontres-dans-le-monde--publications-et-avatars-que-vos-pairs-partagent) | **À proximité**, dans Explorer | Ce que partagent les personnes connectées |
| [Noms de lieux](#noms-de-lieux-à-proximité--découvrir-les-propositions-de-nimporte-qui) | **À proximité**, dans Explorer | Les noms que d’autres ont donnés aux lieux autour de vous |
| [Constructions déclarées](#constructions-déclarées--les-constructions-des-autres-là-où-leurs-éditeurs-disent-quelles-se-trouvent) | **À proximité**, dans Explorer | Les constructions annoncées près de vous, en fantômes |
| [Mon Monde partagé](#mon-monde-partagé--distribuer-votre-propre-snapshot-sans-pair-nécessaire) | Plus bas dans le panneau | Les placements de votre propre construction, sa distribution et ses commentaires |

Les outils avancés ajoutent aussi la liste des Mondes qui n’ont pas pu être
chargés et, dans **Réglages de l’avatar**, le diagnostic des avatars.

## Inspecter une brique — ou une structure placée

Cliquez sur une brique pour ouvrir le panneau **Inspection**. (Sans les
outils avancés, un clic ne choisit qu’un autre avatar.) Il indique :

- quel type de brique c’est ;
- sa position et sa rotation ;
- à quel Monde et à quelle construction elle appartient ;
- qui a fait ce Monde.

**Centrer sur la brique** zoome sur la brique. **Centrer sur le monde**
vous emmène à la position de départ du Monde. **Modifier une copie** fait
votre propre copie du Monde et l’ouvre dans l’Éditeur ; l’original reste
tel quel.

Cliquer sur un sol nu dans un Monde ouvre le même panneau, avec la
position et le Monde mais sans détails de brique. Il a aussi **Modifier une
copie**, pour copier un Monde en cliquant n’importe où dedans.

Une **structure placée** est une construction entière posée dans un Monde
depuis l’Éditeur (voir
[Instances de structure](02-TheEditor.md#instances-de-structure--une-référence-vivante)).
Cliquez dessus et le panneau montre la construction à laquelle elle
renvoie : son titre, sa position et sa rotation, la hauteur du sol et le
Monde où elle se trouve. Vous ne pouvez pas la déplacer ici. Elle a deux
boutons :

- **Ouvrir la source** ouvre dans l’Éditeur la construction à laquelle elle
  renvoie. Chaque copie de cette structure, où qu’elle soit placée, montre
  ce que vous y changez.
- **Modifier une copie** fait plutôt votre propre copie de cette
  construction, et laisse inchangés l’original et chaque copie placée.

Chaque **Modifier une copie** de la Vue du Monde fait la même chose ; voir
[Modifier une copie](03-WorldView.md#modifier-une-copie--emporter-quelque-chose-dans-léditeur).

## Caméra et modification

L’en-tête affiche une ligne comme celle-ci :

```
Caméra : Château d’Alice · Modification : Château de Bob
```

- **Caméra**, c’est ce que vous regardez. Voler vers un Monde, ou cliquer
  sur **Centrer** ou **Y aller**, la change.
- **Modification**, c’est la construction à laquelle s’applique votre
  prochain changement : un point de repère, une région, ses informations ou
  la publication. Cliquer sur une brique ou un placement, ou sur
  **Sélection** dans un résultat de recherche, la change sans déplacer la
  caméra.

En général, c’est la même, car **Centrer** change les deux. Elles diffèrent
quand vous avez sélectionné une construction et en regardez une autre, ou
quand deux constructions sont exactement au même endroit : centrer la
seconde ne déplace pas la caméra, mais la ligne montre que vous modifiez
maintenant l’autre. Regarder autour de vous ne change jamais ce que vous
modifiez ; seule la sélection le fait.

**Y aller** et **Centrer** sont la même chose sous deux noms : les deux
déplacent la caméra. S’ils changent aussi ce que vous modifiez dépend du
panneau (dans la
[Recherche](03-WorldView.md#recherche---quelles-publications-correspondent--),
Centrer le fait).

## Informations sur la construction et placement

Cliquez sur une brique, un sol nu ou une structure placée, et deux panneaux
s’ouvrent sous l’en-tête, pour la construction sur laquelle vous avez
cliqué :

- **À propos de cette construction** : son titre, sa description, ses
  mots-clés, sa licence, son statut, son auteur et ce dont elle est un
  remix. **Modifier les métadonnées** change le titre, la description, la
  licence et qui peut la placer.
- **Placement** : où la construction se trouve dans le Monde, en **unités
  du Monde**. Ce sont les coordonnées propres à ForkBuild, pas du GPS ; une
  unité du Monde vaut un mètre. **Centrer** vous y emmène. **Déplacer**
  ouvre **Déplacer le placement**, où vous tapez de nouvelles valeurs X, Y
  et Z ou décalez la construction de 1, 10 ou 100 unités. **Retirer du
  Monde** retire ce placement.

Ce sont deux panneaux parce que *ce qu’est* une construction et *où elle
se trouve* sont deux choses distinctes. Déplacer un placement ne change
jamais la construction, et changer la construction ne la déplace jamais.

### Position dans le Monde

Si une autre construction se trouve déjà exactement là où vous la
déplacez, **Déplacer le placement** vous prévient et liste ce qui s’y
trouve avant que vous confirmiez. Partager un endroit est permis : une
scène de cour et le bâtiment qui l’entoure peuvent se trouver au même
endroit. ForkBuild s’assure simplement que vous le savez.

### Les placements qui ne sont pas à vous

Quand quelqu’un d’autre a placé une construction, le panneau Placement
indique **🔒 Placé par &lt;nom&gt; — vous pouvez voir ce placement, mais pas
le déplacer**, et **Déplacer** est grisé. Vous pouvez quand même la
centrer, l’inspecter et utiliser **Modifier une copie** pour construire à
partir d’elle. Seul l’endroit où elle se trouve leur appartient.

### Constructions ici

Quand le panneau Placement indique que d’autres constructions partagent
cet endroit, cliquez sur **Voir** pour ouvrir **Constructions ici** : la liste
de toutes les constructions à cet endroit, chacune avec un bouton
**Centrer**. Les constructions dépubliées n’y figurent pas.

### Pourquoi puis-je placer les constructions des autres ?

Un vrai bâtiment ne se soulève pas pour être posé ailleurs, alors il peut
sembler étrange que vous puissiez placer n’importe quelle construction
publiée où vous voulez. Mais une construction publiée n’est pas un objet
physique unique. C’est un contenu fixe, reconnu par son hash de contenu,
comme un fichier. Un **placement** est une note à part, signée, qui dit
« montre cette construction ici ». Il renvoie à la construction ; il ne la
copie pas. Une construction peut avoir de nombreux placements, et chacun
montre exactement le même contenu.

Placer la construction de quelqu’un d’autre ne déplace donc jamais la
sienne et ne la change pas :

- **Son placement reste là où il l’a mis.** Lui seul peut le déplacer (voir
  [Les placements qui ne sont pas à vous](#les-placements-qui-ne-sont-pas-à-vous)).
- **Votre propre placement est signé par vous.** Il dit seulement où *vous*
  montrez sa construction.
- **La construction garde son auteur et son histoire.** C’est toujours
  exactement ce qui a été publié, et chacun peut le vérifier grâce à son
  hash et à sa signature.

Il n’y a pas de carte centrale qui dise à qui appartient chaque parcelle.
Chaque Monde montre les placements qu’il a acceptés. C’est pourquoi une
construction que quelqu’un annonce près de vous n’apparaît qu’en fantôme
tant que vous ne choisissez pas **Accepter la position** (voir
[Constructions déclarées](#constructions-déclarées--les-constructions-des-autres-là-où-leurs-éditeurs-disent-quelles-se-trouvent)).
Personne ne peut mettre une construction dans votre Monde sans votre
accord.

Quelques raisons de placer une construction que vous n’avez pas faite :

- **Faire une sélection**, comme un Monde galerie de constructions que vous
  aimez.
- **Composer une scène**, comme mettre le château d’un ami à côté de votre
  village.
- **L’utiliser telle quelle.** Placez-la quand vous la voulez inchangée, et
  utilisez
  [Modifier une copie](03-WorldView.md#modifier-une-copie--emporter-quelque-chose-dans-léditeur)
  quand vous voulez la changer.

Un éditeur qui ne veut pas de cela peut choisir **Moi seul peux le
placer** en publiant (voir
[Choisir qui peut le placer](04-PublishingAndForking.md#choisir-qui-peut-le-placer)).
Vous pouvez toujours trouver et regarder sa construction, et la remixer si
la licence le permet, mais pas la placer.

### Pourquoi deux constructions peuvent-elles se trouver au même endroit ?

Deux vrais bâtiments ne peuvent pas occuper le même endroit. Dans
ForkBuild, si, car un placement n’occupe pas de terrain. Ce n’est qu’une
note signée qui dit « montre cette construction ici », et deux notes
peuvent nommer le même endroit.

ForkBuild le permet exprès :

- **Personne ne distribue les terrains.** Aucun serveur central ne décide
  qui est arrivé le premier à un endroit, et ForkBuild ne désigne jamais de
  gagnant entre deux placements signés. Les deux restent valables.
- **Chaque appareil connaît des placements différents.** Un endroit occupé
  sur l’appareil de votre ami peut encore être libre sur le vôtre tant que
  ses placements ne vous sont pas parvenus. Une règle stricte « une
  construction par endroit » donnerait des réponses différentes selon les
  appareils, alors ForkBuild ne fait pas semblant d’en avoir une.
- **Parfois, vous le voulez.** Une scène de cour dans un bâtiment, ou une
  ancienne version montrée à la place de la nouvelle, ont leur place au
  même endroit.

Cela ne veut pas dire que n’importe qui peut encombrer vos constructions :

- **Vous êtes prévenu d’abord.** **Déplacer le placement** liste ce qui se
  trouve déjà à un endroit avant que vous confirmiez, et ne déplace jamais
  votre construction ailleurs en douce (voir
  [Position dans le Monde](#position-dans-le-monde)).
- **Pas de doublons par accident.** **Ajouter un placement ici** refuse
  quand un placement se trouve déjà exactement là où vous êtes.
- **La déclaration d’un autre n’est qu’un fantôme.** Une position annoncée
  par quelqu’un d’autre que l’éditeur de la construction n’apparaît que
  comme un fantôme transparent, et jamais à un endroit où cet appareil
  connaît déjà un vrai placement (voir
  [Constructions déclarées](#constructions-déclarées--les-constructions-des-autres-là-où-leurs-éditeurs-disent-quelles-se-trouvent)).
- **Seul le propriétaire peut déplacer ou retirer un placement** (voir
  [Les placements qui ne sont pas à vous](#les-placements-qui-ne-sont-pas-à-vous)).

ForkBuild ne vérifie que les constructions exactement au même point. Deux
constructions un peu écartées dont les briques se touchent ne sont pas
signalées. Pour les raisons de ce choix, voir
[Overlap Is A Fact; Collision Is A Policy Decision](../../principles/placement.md#overlap-is-a-fact-collision-is-a-policy-decision-0225)
(en anglais) et les règles qui suivent.

### Placer ou remixer

Les deux mettent la construction de quelqu’un d’autre dans un Monde à
vous, mais ce n’est pas la même chose :

| | Placer | Remixer (ou Modifier une copie) |
|---|---|---|
| Ce qui est créé | Un placement : une petite note signée indiquant où montrer la construction | Une nouvelle construction, avec de nouveaux id, qui vous appartient |
| La construction | Le même Monde partagé, tel que publié | Votre propre copie, avec une note qui renvoie à l’original |
| Pouvez-vous changer les briques ? | Non | Oui, dans l’Éditeur |
| Qui est l’auteur | L’éditeur d’origine | Vous, avec l’original enregistré comme parent |
| Contrôlé par | Le réglage **Qui peut le placer** de l’éditeur | La licence |
| À la publication | Rien de nouveau n’est publié | Crée un nouveau Monde partagé à votre nom |

Placer, c’est comme faire un lien vers un fichier ; remixer, c’est comme en
faire votre propre copie pour la changer. Quelqu’un qui a choisi **Moi
seul peux le placer** peut quand même autoriser les remix par sa licence,
et un remix est à vous, à placer où vous voulez.

## Rencontres dans le Monde — publications et avatars que vos pairs partagent

**Rencontres dans le Monde** est un groupe d’**À proximité**, dans
Explorer. C’est une petite carte à part (pas la Carte du Monde) qui montre
ce que vos [pairs connectés](07-PeerConnectionsAndFriends.md) vous ont
signalé :

- des **publications** placées à proximité (voir
  [Publications et preuves externes](09-PublicationsAndEvidence.md)) ;
- les **avatars** d’autres personnes ;
- un repère pour vous.

Tant qu’aucun pair connecté n’a rien partagé, le groupe indique **Rien à
rencontrer ici pour l’instant**.

Cliquez sur un repère pour l’inspecter :

- Une **publication** affiche son titre, son éditeur, si elle est signée,
  sa position et combien d’ancres et de placements de Snapshot elle a.
- Un **avatar** affiche son nom, son propriétaire et sa position.

Si plusieurs pairs proposent la même chose, **Choisir la source** vous
laisse choisir la copie de qui regarder. Rien ici ne déplace votre caméra
ni ne change quoi que ce soit.

### Contenu et vérification

Sélectionner une publication affiche deux lignes de plus :

- **Contenu** : son contenu peut-il être chargé ? **Disponible** ou
  **Indisponible**.
- **Vérification** : le contenu correspond-il à ce qui a été déclaré pour
  lui ? **Vérifié** ou **Invérifiable**.

Le contenu déjà présent sur cet appareil se charge et se vérifie tout de
suite. Ce qu’un pair vous a seulement montré indique en général
**Indisponible** / **Invérifiable** jusqu’à ce que vous le cherchiez avec
[Découvrir un Monde partagé](#découvrir-un-monde-partagé--chercher-directement-sur-les-réseaux-décentralisés).
Si cela le trouve sur Arweave ou Nostr, c’est aussi utilisé ici. Quand
plusieurs endroits sont trouvés, **Choisir l’emplacement** vous laisse en
choisir un ; rien n’est chargé avant, et le choix ne vaut que pour cette
publication.

Une ligne **Source** dit d’où vient le contenu : **Local** (cet appareil)
ou **Décentralisé** (Arweave ou Nostr). C’est un simple fait, pas une note
de confiance.

Dès que la publication d’un pair indique **Disponible**, elle est ajoutée à
Explorer et à la page de son auteur comme si vous l’y aviez trouvée, et
elle reste après un rechargement. Rien ne la marque comme trouvée via un
pair : votre propre appareil a vérifié le contenu, elle est donc comme
n’importe quelle autre.

### La boîte de dialogue Distribuer

Dès que cet appareil a le contenu d’une publication, un bouton
**Distribuer** ouvre la boîte de dialogue **Distribuer**. La même boîte de
dialogue s’ouvre depuis
[Mon Monde partagé](#mon-monde-partagé--distribuer-votre-propre-snapshot-sans-pair-nécessaire)
pour votre propre construction. Pour ce que fait chaque réseau, voir
[Distribuer votre travail](Distribution.md).

En haut, deux réglages valent pour toute la boîte de dialogue. Les deux
démarrent sur vos préférences enregistrées :

- **Stockage** : où va le contenu. **Arweave**, **IPFS (Kubo local)**,
  **IPFS (épinglage distant)** ou, à titre expérimental, **Steem** ou
  **Blurt** (voir [Steem](11-EvidenceAndStorage.md#steem) et
  [Blurt](11-EvidenceAndStorage.md#blurt)). L’épinglage distant demande un
  endpoint et un identifiant à chaque fois et ne les enregistre jamais.
  Seul le stockage que cet appareil peut vraiment utiliser est proposé.
- **Support d’annonce / de découverte** : où c’est annoncé pour que
  d’autres le trouvent. **Arweave**, **Blurt**, **Nostr** ou **Steem**.

La boîte de dialogue peut envoyer deux choses :

- la **Déclaration signée**, qui dit que vous avez publié ceci, et
- le **Snapshot**, une copie de la construction elle-même (voir
  [Snapshot local](09-PublicationsAndEvidence.md#snapshot-local)).

Quand les deux peuvent être envoyés, le bouton principal **Distribuer** les
envoie l’un après l’autre, car les deux peuvent demander une signature à la
même extension de portefeuille. Chacun a sa section avec son propre
résultat, et l’échec de l’un ne cache ni n’arrête jamais l’autre.
**Distribuer la Déclaration signée seulement** et **Distribuer le Snapshot
seulement** n’en envoient qu’un, par exemple pour réessayer la moitié qui a
échoué. Quand un seul peut être envoyé, son bouton est simplement
**Distribuer la Déclaration signée** ou **Distribuer le Snapshot**.

Pour signer, il vous faut une extension de navigateur : un portefeuille
Arweave (comme Wander) pour Arweave, et un signataire Nostr (comme nos2x)
pour Nostr. Sans elle, la section indique « La distribution n’a pas pu
aboutir. » et pourquoi.

- La section **Déclaration signée** indique **Absent** pour **Contenu** et
  **Découverte** tant qu’elle n’a pas été envoyée. Ensuite, elle affiche
  l’id de la publication, où se trouve son contenu et l’id de l’annonce,
  avec une ligne par [relais Nostr](10-NetworkSettings.md#relais-nostr).
- La section **Snapshot** affiche un **Hash du contenu**, un
  **Localisateur** et un id d’**Annonce**. « Aucune annonce » veut dire que
  la copie a été stockée mais pas annoncée ; c’est un résultat partiel, pas
  une erreur. Un vrai échec indique « La distribution du Snapshot n’a pas
  pu aboutir. »

Fermer la boîte de dialogue ne perd rien : rouvrez-la et les résultats sont
toujours là. Ils sont oubliés quand vous sélectionnez une autre publication
ou quittez la page.

## Découvrir un Monde partagé — chercher directement sur les réseaux décentralisés

Dans Rencontres dans le Monde, **Découverte de Mondes partagés** ouvre le
panneau **Découvrir un Monde partagé**. Il n’a besoin ni d’un pair ni d’un
repère. Tapez un **id du Monde partagé**, gardez l’**étiquette de
découverte** (elle commence sur l’étiquette propre à ForkBuild, presque
toujours la bonne) et cliquez sur **Découvrir un Monde partagé**. ForkBuild
interroge directement Arweave et Nostr.

La ligne **Découverte** indique alors **Indisponible**, **Résolu** ou
**Ambigu** (plus d’une piste pour le même emplacement). Une fois résolu,
elle affiche les mêmes lignes Contenu, Source et Vérification que
ci-dessus.

Aujourd’hui, cela ne résout que vos propres publications : celles que vous
avez signées et que vous avez encore sur cet appareil. Voyez-le comme « ma
construction est-elle vraiment là-bas, intacte ? », pas comme une recherche
dans le travail de tout le monde.

Quand un résultat indique **Vérifié**, **Sélectionner le Monde partagé** le
marque comme celui avec lequel vous travaillez, dans une note en dessous.
C’est tout ce qu’il fait : il n’envoie et ne revérifie rien. Il reste
jusqu’à ce que vous en sélectionniez un autre ou quittiez la page. Fermer
le panneau garde ce que vous avez tapé et trouvé.

## Noms de lieux à proximité — découvrir les propositions de n’importe qui

**Noms de lieux**, un groupe d’**À proximité** dans Explorer, montre les
noms que des gens ont publiés pour les régions du Monde autour de vous. Il
les cherche sur Nostr, donc il n’a pas besoin d’un pair connecté. Il
commence replié, parce que ces noms ne sont pas encore vérifiés.

Chaque ligne affiche le nom, à peu près où il se trouve, qui l’a donné et
quand :

- **Naviguer** déplace votre caméra vers cette région, comme **Y aller**.
  Cela ne renomme et n’accepte rien.
- **Adopter** enregistre le nom sur cet appareil, après la même
  vérification de signature qu’un nom venant d’un pair connecté (voir
  [En recevoir une d’un pair](09-PublicationsAndEvidence.md#en-recevoir-une-dun-pair)).
  Le bouton indique alors **✓ Déjà enregistré**.

Quand deux personnes ont nommé le même terrain, les deux noms apparaissent.
ForkBuild ne désigne jamais de gagnant, et en adopter un ne veut pas dire
qu’il est plus juste. Si la recherche échoue, un avis le dit et les noms
que vous avez déjà vus restent. Pour publier un nom vous-même, voir
[Nommer un lieu](09-PublicationsAndEvidence.md#nommer-un-lieu).

## Constructions déclarées — les constructions des autres, là où leurs éditeurs disent qu’elles se trouvent

Pendant que vous marchez, ForkBuild télécharge les Snapshots annoncés près
de vous (voir
[Mon Monde partagé](#mon-monde-partagé--distribuer-votre-propre-snapshot-sans-pair-nécessaire)).
Une annonce peut dire où se trouve la construction, mais ce n’est qu’une
**déclaration** : s’y fier aveuglément permettrait à n’importe qui de poser
une construction sur la vôtre. Une construction déclarée s’affiche donc en
**fantôme**, ses briques transparentes à l’endroit déclaré, et ne devient
jamais d’elle-même un vrai placement.

**Une exception ne demande aucun clic.** Quand des éditeurs distribuent
leur propre Snapshot, l’annonce porte leur **placement signé**. Dès que cet
appareil connaît le Monde partagé de cette construction (il est dans
Explorer, ou vous cliquez sur **Vérifier**), ForkBuild vérifie que le
placement est signé avec la clé de ce Monde partagé. Si c’est le cas, la
construction s’affiche pleine, exactement là où ils l’ont mise. Cela reste
leur placement, vous ne pouvez donc ni le déplacer ni le retirer, et s’ils
le déplacent puis distribuent à nouveau, il se déplace aussi chez vous. Une
position signée par quelqu’un d’autre reste un fantôme.

Un fantôme n’est dessiné que si :

- il est près de vous (votre case de la carte ou celles d’à côté, environ
  1 000 unités dans chaque direction), et il disparaît quand vous vous
  éloignez ;
- son contenu a été téléchargé et correspond à son hash de contenu ;
- cet appareil n’a pas encore de placement de cette construction (dès qu’il
  en a un, la vraie construction s’affiche à la place) ;
- rien de ce que connaît cet appareil ne se trouve déjà exactement à cet
  endroit.

Vous ne pouvez pas sélectionner, inspecter, modifier ou copier un fantôme.
Les très grandes constructions ne sont dessinées qu’en partie (les quelques
premiers milliers de briques).

Chaque fantôme a une ligne dans **Constructions déclarées**, le plus proche
en premier : son titre, sa distance, sa position et « déclarée par … ». Le
titre et l’auteur viennent de la construction elle-même et ne sont pas plus
vérifiés que sa position. Chaque ligne a :

- **Naviguer** : déplace la caméra vers l’endroit déclaré. Rien d’autre ne
  change.
- **Vérifier** : apparaît tant que cet appareil n’a pas le Monde partagé
  signé de la construction. Il le cherche sur Nostr et Arweave et vérifie
  qu’il est valablement signé, qu’il s’agit bien du Monde partagé de cette
  construction et qu’il nomme exactement le contenu que montre le fantôme.
  Si tout concorde, il est ajouté à Explorer et la ligne indique « signé
  par *nom* (clé did:key:…) ». Sinon, la ligne dit pourquoi : rien n’a été
  annoncé (l’éditeur n’a peut-être distribué que le Snapshot), aucune copie
  n’était valablement signée, ou il nomme un autre contenu. Vérifier
  n’accepte pas la position, mais si le placement signé de l’éditeur lui-même
  l’accompagnait, la construction s’affiche maintenant pleine là où il l’a
  mise.
- **Accepter la position** : la seule façon de faire confiance à une
  déclaration. Elle place la construction à l’endroit déclaré avec un
  placement *à vous*, signé par vous, et à partir de là c’est une
  construction normale de votre Monde. Cela ne marche que lorsque cet
  appareil a le Monde partagé signé et vérifié de l’éditeur, et seulement
  s’il nomme exactement le contenu que montre le fantôme. Vous l’obtenez
  avec **Vérifier**, quand
  [on partage le Monde avec vous](04-PublishingAndForking.md#partager-avec-les-pairs-connectés),
  ou quand la
  [Rencontre](#rencontres-dans-le-monde--publications-et-avatars-que-vos-pairs-partagent)
  d’un pair indique **Disponible**. Le bouton reste aussi désactivé si
  l’éditeur a choisi **Moi seul peux le placer** (voir
  [Choisir qui peut le placer](04-PublishingAndForking.md#choisir-qui-peut-le-placer)).
  Quand il est désactivé, la ligne dit pourquoi.

  **Ce que « vérifié » veut dire.** La construction est exactement le
  contenu d’un Monde partagé signé avec la clé affichée. Cela ne prouve pas
  qui détient cette clé (n’importe qui peut en créer une et s’appeler
  « bob »), ni la position, qui reste seulement déclarée. Accepter la
  position fonctionne aussi pour des clés que vous ne connaissez pas ; leur
  faire confiance, c’est à vous de voir.
- **Masquer** : retire ce fantôme et sa ligne jusqu’à ce que vous quittiez
  la Vue du Monde. Rien n’est signalé ni supprimé.

## Mon Monde partagé — distribuer votre propre Snapshot, sans pair nécessaire

**Mon Monde partagé**, plus bas dans le panneau, sous Recherche et Avatar,
concerne la construction que vous avez ouverte. Il affiche son titre et son
auteur une fois qu’elle est publiée, et fonctionne qu’il y ait quelqu’un
d’autre ou non.

En premier viennent **Distribuer** et le lien de partage. **Distribuer**
ouvre la même
[boîte de dialogue Distribuer](#la-boîte-de-dialogue-distribuer) que
Rencontres dans le Monde, mais pour votre propre construction. Tant que la
construction n’est pas publiée, le bouton est grisé, avec une note disant
qu’il n’y a encore rien à envoyer. L’épinglage IPFS distant et l’ancrage
sur Bitcoin ou Base ne sont pas ici : ils demandent d’abord un compte ou un
portefeuille, et se trouvent donc sur la page Publications (voir
[Publication IPFS](11-EvidenceAndStorage.md#publication-ipfs) et
[Le parcours d’ancrage Bitcoin](11-EvidenceAndStorage.md#le-parcours-dancrage-bitcoin)).

**Plus ▾** regroupe les actions plus rares :

- **Exporter le Snapshot** et **Vérifier la correspondance du Snapshot**.
  Leurs résultats restent sur le panneau après la fermeture du menu.
- **Outils de diagnostic** (voir [plus bas](#outils-de-diagnostic)).
- **Dépublier…** demande une fois, puis retire le Monde du catalogue. Ses
  placements, la construction et les copies déjà envoyées restent ; les
  copies envoyées ne peuvent pas être rappelées, mais cet appareil se
  souvient de ce que vous avez dépublié, pour qu’Explorer ne les affiche
  plus. **Annuler** revient en arrière.

Quand le Monde ouvert a été publié par quelqu’un d’autre (un pair l’a
partagé avec vous, par exemple), le panneau s’intitule **Monde partagé** et
n’a ni **Dépublier** ni **Distribuer** : seul l’éditeur d’un Monde peut le
faire. Tout le reste demeure, commentaires compris.

**▸ Commentaires (N)** ouvre les commentaires de la construction ; le
nombre reste à jour même replié. Vous pouvez écrire une fois la
construction publiée. Qui peut commenter est expliqué dans
[Commentaires](09-PublicationsAndEvidence.md#commentaires).

### Placements

**Placements (N)** liste tous les endroits où se trouve ce Monde partagé :
position, révision et, quand il est connu, propriétaire. Une construction
peut se trouver à plusieurs endroits, et chaque placement que connaît cet
appareil est listé.

- **Déplacer…** ouvre **Déplacer le placement** pour ce placement, avec
  son avertissement sur les constructions déjà présentes au nouvel endroit.
- **Retirer…** demande une fois, puis retire ce placement du Monde. La
  construction et ses autres placements restent. Sans aucun placement, la
  construction n’est simplement affichée nulle part jusqu’à ce que vous la
  placiez à nouveau.

Les deux sont grisés sur un placement fait par quelqu’un d’autre.

**Ajouter un placement ici**, sous la liste, place la même construction
*une fois de plus* là où se tient votre avatar (ou sous la caméra, sans
avatar). Il ne déplace aucun placement existant et ne fait pas de copie :
cela reste un seul Monde partagé (voir [Placer ou remixer](#placer-ou-remixer)).
Il indique où il a placé la construction et combien de placements elle a
maintenant. Si un placement se trouve déjà exactement là où vous êtes, il
vous demande de bouger d’abord, pour que deux clics n’en empilent pas deux
au même endroit.

### Outils de diagnostic

ForkBuild trouve des Snapshots tout seul pendant que vous marchez (voir
plus bas). **Outils de diagnostic**, sous **Plus**, fait les mêmes étapes à
la main, pour quand cela ne trouve pas ce que vous attendez. Chaque étape
est un clic à part, et rien ne se lance tout seul :

1. **Découvrir des Snapshots** liste tout ce qui a été annoncé sous
   l’étiquette partagée de ForkBuild. Cela marche sans pair et sans
   construction publiée à vous.
2. **Résoudre le Snapshot sélectionné** vérifie que celui que vous avez
   choisi peut être récupéré.
3. **Attribuer le Snapshot sélectionné** vérifie qu’il correspond au hash
   de contenu de ce Monde partagé. **Matérialiser le Snapshot sélectionné**
   le stocke sur cet appareil. Vous pouvez faire l’un ou l’autre, dans
   n’importe quel ordre.
4. **Placer le Snapshot matérialisé**, puis **Enregistrer le Snapshot
   placé**, l’ajoutent au Monde où vous êtes, sans recharger.

**Utiliser la position déclarée**, à tout moment après en avoir choisi un,
reprend la position que déclare le Snapshot lui-même, s’il en a une.

**Ce qui se passe automatiquement.** Pendant que vous marchez, ForkBuild
cherche de temps en temps des Snapshots, comme le fait **Découvrir des
Snapshots**. Il regarde ce qu’a cet appareil, ce que les pairs connectés
partagent du simple fait d’être connectés, et ce que signale Nostr. Un
Snapshot qui passe la vérification suit tout seul les mêmes étapes et
apparaît comme repère dans
[Rencontres dans le Monde](#rencontres-dans-le-monde--publications-et-avatars-que-vos-pairs-partagent) ;
il n’y a pas de liste ni de notification à part.

Il ne télécharge que les Snapshots proches de vous : ceux placés, ou
annoncés comme placés, dans votre case de la carte ou celles d’à côté
(environ 1 000 unités dans chaque direction), plus les 20 plus récents qui
ne disent pas où ils vont. Les plus éloignés se téléchargent quand vous
vous en approchez. Quatre au plus se téléchargent à la fois. Un Snapshot
que cet appareil a déjà est lu depuis son propre stockage, après la même
vérification du contenu.

## Et ensuite ?

Revenez à la **[Vue du Monde](03-WorldView.md)**, ou passez à
**[Distribuer votre travail](Distribution.md)** pour tout ce vers quoi une
construction peut être envoyée.
