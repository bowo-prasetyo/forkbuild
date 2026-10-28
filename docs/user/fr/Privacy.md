<!-- translation-of: docs/Privacy.md source-hash: ca4e09d21f77cc11 -->
# Confidentialité

<!-- languages -->
[English](../../Privacy.md) · [Deutsch](../de/Privacy.md) · [Español](../es/Privacy.md) · **Français** · [Bahasa Indonesia](../id/Privacy.md) · [日本語](../ja/Privacy.md) · [한국어](../ko/Privacy.md) · [Português (Brasil)](../pt-BR/Privacy.md)
<!-- /languages -->

ForkBuild n’a pas de comptes et ne vous suit pas. Il stocke votre travail
dans votre propre navigateur et ne communique avec d’autres ordinateurs que
pour les fonctions qui en ont besoin, plus un comptage anonyme des
visiteurs, une fois par jour, quand un lien de partage est utilisé et quand il est installé, afin
que ses créateurs sachent à peu près combien de personnes l’utilisent et
partagent des constructions (voir « Comptage des visiteurs » plus bas, et
comment le désactiver). Cette page indique ce qu’il stocke, et chaque
serveur qu’il peut contacter et quand.

## Ce qui reste sur votre appareil

Tout ce qui suit se trouve dans le stockage de ce navigateur (la base de
données IndexedDB `forkbuild` ; les navigateurs sans IndexedDB utilisent
`localStorage`, sous des clés commençant par `forkbuild:`) et ne quitte
jamais l’appareil, sauf si vous le publiez, l’exportez ou l’envoyez :

- vos constructions, les copies de récupération des modifications non
  enregistrées, et les structures enregistrées ;
- vos identités : la clé publique de chacune, et sa clé privée, chiffrée
  avec votre phrase secrète sauf si vous avez choisi de la créer sans ;
- la clé porteuse qui envoie vos constructions à tout le monde (une clé Nostr, créée la première fois que vous choisissez **Tout le monde** sous **Qui peut la trouver ?**). Ce n’est pas votre identité et elle ne signe rien de vous : qui l’aurait ne pourrait qu’envoyer des notes que chaque lecteur vérifie avec la signature de votre propre identité ;
- votre réponse à **Qui peut la trouver ?** ;
- une identité créée avec un simple nom, lors d’une première publication
  ou promenade, n’a pas de phrase secrète tant que vous n’en ajoutez pas une
  dans **Mes identités** : tout ce qui peut lire le stockage de ce site
  pourrait alors signer en son nom ;
- les pairs connus, les amis, les personnes que vous suivez, les
  blocages, l’historique du chat et les messages en attente (personne
  n’est informé que vous le suivez, et rien concernant un abonnement n’est
  jamais envoyé) ;
- votre profil d’avatar (si vous parcourez la Vue du Monde avant de choisir
  un nom, vous êtes un invité : cet avatar n’est gardé nulle part, pas même
  ici, et n’est jamais envoyé à personne), vos réglages (y compris si la Vue du Monde joue
  du son, à quel volume, en 3D ou en stéréo, et avec ou sans musique, si elle montre ses outils
  avancés, s’il y fait toujours jour, si le soleil et la lune y projettent des ombres, où Publier envoie vos constructions, la langue que vous avez
  choisie, et si l’apparence est claire, sombre ou suit l’appareil ; quand vous n’en avez pas choisi, ForkBuild lit les langues
  préférées du navigateur sur l’appareil et ne les envoie nulle part), et
  le nom d’utilisateur et l’identifiant d’un serveur TURN si vous en
  saisissez un sous **Paramètres réseau**;
- si ce navigateur participe au comptage quotidien des visiteurs, et le
  dernier jour où il l’a fait ;
- les publications d’autres personnes que cet appareil a trouvées et
  vérifiées, auprès de pairs, par des liens, dans la Vue du Monde ou par la
  recherche d’Explorer sur les réseaux, et, pour celles trouvées sur les
  réseaux, l’endroit où l’enregistrement signé de chacune a été lu ;
- les identifiants des publications que vous avez dépubliées sur cet
  appareil, pour que la recherche d’Explorer sur les réseaux ne liste plus
  les copies que vous aviez distribuées.
- à quels réseaux cet appareil a envoyé chacun de vos commentaires, et
  quand, pour que chaque commentaire puisse indiquer où il est allé.
- chaque enregistrement de cœur que cet appareil a fait ou accepté, le réseau
  choisi pour les cœurs, à quels réseaux chacun de vos propres cœurs a été
  envoyé (avec l’événement Nostr, pour que retirer un cœur puisse demander
  aux relais de le supprimer) et si l’explication du premier cœur a été
  montrée.
- pour chaque semaine du défi de construction que vous ouvrez, les
  identifiants des participations trouvées sur les réseaux, pour que sa page
  les affiche de nouveau avant de chercher.
- les constructions que cet appareil sait présentes sur les relais Nostr
  sous forme de notes de construction (les vôtres, dès qu’un relais a pris
  la note, et celles des autres qu’il a ouvertes depuis l’une d’elles), pour
  pouvoir les partager par un lien court.
- pour chaque construction commencée avec **Construire ici**, le monde et
  l’emplacement choisis, pour qu’une fois publiée elle s’y dresse.
- quand cet appareil a vu chaque construction publiée pour la première fois
  (son identifiant et l’heure, 5000 au plus), pour distinguer une
  construction datée d’avant une autre d’une construction qui était ici en
  premier (**Constructions semblables publiées avant** et l’entrée 🔔 **… a
  publié une construction datée d’avant la vôtre qui lui ressemble**).
- les identifiants et empreintes de contenu des constructions d’autres
  personnes dont les octets ne sont pas encore arrivés sur cet appareil, et
  depuis quand (500 au plus, chacune pendant 30 jours), pour que chacune
  puisse encore être comparée à vos propres constructions quand ses octets
  arrivent, même après la fermeture de ForkBuild (l’entrée 🔔 **… a publié
  une construction qui ressemble à la vôtre**).
- pour chaque construction commencée à partir d’une structure toute faite ou
  comme copie d’une construction, et pour chaque structure toute faite
  ajoutée, quelles briques c’étaient et où elles se trouvaient, pour que la
  publication distingue les briques que vous avez posées de celles du départ
  (seule la tranche est comptée).
- pour chaque identité, les constructions où un ami l’a créditée pendant que
  vous les construisiez ensemble (**Construire avec moi**) : le titre de
  chacune, le nom et l’identité de son auteur, et quand, pour
  **Constructions auxquelles vous avez participé** dans Mes mondes et sur
  votre propre page de constructeur. Cette liste est conservée sous
  l’identité que partagent vos appareils, et tant qu’un autre de vos
  appareils est connecté (un appareil autorisé de la même identité), les
  deux s’échangent leurs listes ; elle ne va jamais sur l’appareil de
  quelqu’un d’autre. Vos tampons sur l’Accueil sont établis
  à partir de ce qui est déjà listé ici et ne sont pas enregistrés.

Effacer les données de ce site dans le navigateur supprime tout cela, et
il n’existe aucune autre copie ni aucun moyen de le récupérer.
Sauvegardez-le d’abord avec **Vos données → Sauvegarder dans un
fichier** : le fichier contient tout ce qui précède sauf le nom que
vous utilisiez, chiffré avec une phrase secrète de votre choix, et reste là où
vous le mettez. ForkBuild ne l’envoie jamais. **Partager la sauvegarde**
remet le fichier à l’application que vous choisissez sur votre appareil.
Si vous choisissez un dossier de sauvegarde, le navigateur garde
l’autorisation de ForkBuild pour ce dossier, et ForkBuild garde le dossier
et, si vous le demandez, une clé dérivée de votre phrase secrète de
sauvegarde qui ne peut que créer des sauvegardes (jamais les ouvrir),
dans une base IndexedDB distincte `forkbuild-backup` ; la date et le lieu
de votre dernière sauvegarde sont conservés avec le reste des données mais
exclus des sauvegardes.

Sur le site officiel, le navigateur garde aussi les fichiers propres à
ForkBuild (son code, sa feuille de style, ses icônes et la langue que vous
utilisez) via le service worker du site, pour que ForkBuild s’ouvre sans
connexion et puisse s’installer comme une application. Ce sont les mêmes
fichiers pour tout le monde, et rien de vous n’y figure. Le fait que les
notifications sur cet appareil soient activées est gardé avec vos réglages
(voir « Notifications sur cet appareil » plus bas).

## Ce que les autres peuvent voir

- **Tout ce que vous publiez** est public : son contenu, son titre, sa
  description et sa licence, ainsi que la clé publique de votre identité,
  qui le signe. Une fois que d’autres en ont une copie, vous ne pouvez
  pas la reprendre. Quand vous la diffusez sur Nostr ou Arweave, son annonce liste aussi ses
  étiquettes (sous la forme `forkbuild-tag:<tag>`), pour que chacun puisse
  trouver les constructions qui portent une étiquette, comme les
  participations au défi d’une semaine.
  Une fois que vous avez choisi où vont vos constructions, chaque Publier y envoie aussi la construction ; jusque-là, Publier n’envoie rien.
- **Qui peut la trouver ?** est demandé avant votre première publication. Avec **Tout le monde**, chaque construction signée que vous publiez est aussi envoyée, entière, aux relais Nostr publics des **Paramètres réseau** sous forme de note de construction (docs/Protocol.md, « Build notes », en anglais), avec ses étiquettes et sa place dans le Monde, pour que toute personne qui utilise ForkBuild la trouve dans Explorer, dans le défi et dans le Monde. La note est signée avec la clé porteuse de cet appareil, pas avec votre identité. Les relais gardent ce qu’on leur envoie : une note ne se reprend pas. Avec **Seulement les personnes à qui j’envoie le lien**, rien n’est envoyé et la construction ne voyage que dans son lien. Le choix est retenu sur cet appareil et se change dans le message qui suit la publication.
- **Les cœurs que vous donnez** sont publics : chacun dit que votre identité
  aime cette construction, ou ne l’aime plus, sous le nom avec lequel vous
  êtes connecté, signé avec la clé de votre identité. Il va aux pairs
  connectés et au réseau choisi pour les cœurs (Nostr si vous ne le changez
  pas), où tout le monde peut le lire, et au bâtisseur sous forme de
  notification. Retirer un cœur envoie un enregistrement plus récent ;
  l’ancien peut rester là où il a été envoyé, et sur Nostr une demande de
  suppression n’est qu’une demande.
- **Votre heure, aux pairs connectés.** Tant que vous êtes connecté, votre
  appareil et chaque pair connecté se disent ce qu’indiquent leurs horloges
  (quelques fois à la connexion, puis une fois par minute), pour que les
  animaux et les habitants se tiennent au même endroit sur tous les écrans.
  Seule l’heure est envoyée.
- **Les pairs auxquels vous vous connectez** apprennent la clé publique
  de votre identité, et votre adresse IP (une connexion directe en a
  besoin ; un relais TURN la cache au pair mais pas au relais). Les pairs
  connectés peuvent voir votre avatar et votre présence selon son réglage
  de visibilité, y compris le véhicule que vous conduisez (son type et son
  id, envoyés seulement quand la présence le serait ; l’endroit où vous
  avez laissé un véhicule n’est jamais envoyé), et vos amis peuvent vous
  envoyer des messages. Ils reçoivent aussi les annonces de Snapshots et
  de Noms de lieux que votre appareil a découvertes, et apprennent donc
  dans quelles régions du Monde vous avez cherché des noms de lieux
  (docs/AnnouncementIndex.md).
- **Les pairs, pour les Mondes que vous partagez.** **Partager avec les
  pairs**, dans Explorer, propose l’un de vos Mondes publiés à toutes les
  personnes auxquelles vous êtes connecté maintenant et à toutes celles
  qui se connecteront plus tard, y compris les inconnus des salons : elles
  reçoivent sa fiche et peuvent récupérer le Monde lui-même sur votre
  appareil tant que vous êtes connecté. Les appareils de vos Amis et Pairs
  connus le récupèrent d’eux-mêmes ; ceux des autres seulement quand ils
  cliquent sur **Récupérer**. Un Monde que vous vous contentez de
  **Publier** n’est jamais envoyé à personne.
- **Les amis avec qui vous vous promenez.** Toute personne qui ouvre un
  lien **Se promener ici avec moi** que vous avez créé, tant qu’il
  fonctionne, reçoit le Monde où vous êtes (sa publication signée et sa
  construction, comme un lien partagé les transporte) et votre nom
  d’affichage, et se connecte à vous comme un pair connecté ordinaire :
  elle apprend votre adresse IP et voit votre avatar et votre présence
  selon vos réglages de visibilité. Vous apprenez les siens de la même
  façon, ainsi que le nom sous lequel elle se promène.
- **Les amis avec qui vous construisez.** Toute personne qui ouvre un lien
  **Construire avec moi** que vous avez créé, tant qu’il fonctionne, se
  connecte à vous de la même façon et reçoit votre nom d’affichage, le titre
  de la construction et, dès que son Éditeur le demande, la construction
  elle-même, puis chaque modification que l’un de vous y apporte, l’endroit
  que vise votre pointeur et ce que vous avez sélectionné, tant que vous
  construisez ensemble. Elle garde sa copie. Vous apprenez de la même façon
  son adresse IP, le nom sous lequel elle construit et l’endroit qu’elle
  vise. Chaque ami dont votre construction intègre une modification y est
  crédité, sous le nom avec lequel il a construit et la clé publique de son
  identité, et quand vous la publiez, ce crédit fait partie de sa
  publication signée, que peut lire toute personne qui voit la construction
  (la page qu’ouvre un lien **Construire avec moi** le signale avant qu’on
  la rejoigne). Pendant que vous construisez ensemble, la copie de chacun
  suit cette liste, si bien que chaque ami voit qui d’autre est crédité.
- **N’importe qui, pendant que vous êtes dans un salon public.** Rejoindre
  le salon public (**Pairs**) ou le salon d’un Monde (**Salon** dans la
  Vue du Monde) liste la clé publique de votre identité et le nom affiché
  de votre choix, pour quiconque ouvre ce salon. Le salon d’un Monde
  indique aussi quel Monde vous avez ouvert. Votre inscription dure
  jusqu’à ce que vous partiez, que vous fermiez l’application (puis
  jusqu’à 10 minutes), ou que la carte expire. Elle ne contient aucune
  adresse réseau, mais n’importe qui dans le salon peut se connecter à
  vous, et un inconnu qui se connecte est un pair connecté ordinaire : il
  apprend votre adresse IP, voit votre avatar et votre présence selon vos
  réglages de visibilité, et **échange avec vous des annonces de Snapshots
  et de Noms de lieux et des métadonnées de publications, exactement comme
  n’importe quel pair connecté**, avant que vous le Mémorisiez ou deveniez
  amis. Le chat et la voix exigent toujours une amitié mutuelle.
  **Bloquer** dans le salon masque quelqu’un de vos listes de salon et le
  bloque comme sur la page Pairs (présence, profil, chat et demandes
  d’ami).

## Comptage des visiteurs

Une fois par jour, la première fois que ForkBuild s’ouvre sur cet appareil
ce jour-là, le site officiel (`https://bowo-prasetyo.github.io/forkbuild/`)
charge une minuscule image depuis GoatCounter (`forkbuild.goatcounter.com`),
un compteur qui ne dépose aucun cookie. Cette requête est tout ce qu’il
envoie.

- **Ce que reçoit GoatCounter :** votre adresse IP et le User-Agent de
  votre navigateur, comme pour toute requête web, plus un chemin fixe (`/`)
  et un nombre aléatoire qui empêche l’image d’être mise en cache. Aucune
  page, aucune construction, aucun Monde, aucune identité, aucun référent ni rien
  de ce que ForkBuild stocke n’est inclus ; il ne peut donc pas savoir ce
  que vous faites dans l’application, ni même quelle page vous avez ouverte.
- **Ce qu’il conserve :** uniquement des totaux, c’est-à-dire les visiteurs
  par heure et par jour, et de quels navigateurs, systèmes, pays et langues
  ils venaient, chacun compté séparément, sans lien possible entre eux. Sa
  politique de confidentialité (<https://www.goatcounter.com/help/privacy>)
  indique qu’il ne conserve jamais les adresses IP ni le User-Agent
  complet : il les garde en mémoire jusqu’à 8 heures, uniquement pour
  reconnaître une visite répétée, sans cookie.
- **Tout le monde peut consulter les totaux** sur le tableau de bord
  public, <https://forkbuild.goatcounter.com/>.

Le même compteur est aussi informé de ces moments du partage d’une
construction, chacun par une requête d’image de plus du même genre, sous
son propre chemin fixe :

- `/e/share-link` : un lien vers une construction a été copié ou partagé
  avec **Copier le lien** ou **Partager…** ;
- `/e/share-link-short` : ce lien était un lien court (`/n/…`), compté en
  plus de `/e/share-link`, jamais à sa place ;
- `/e/opened-shared-link` : un lien partagé a ouvert une construction ;
- `/e/remix-from-link` : une construction ouverte depuis un lien partagé a
  été copiée dans l’Éditeur (au plus une fois par construction chaque fois
  que l’application est ouverte).

Il apprend aussi, de la même façon, quand ForkBuild est installé comme
application (`/e/installed`).

Il apprend aussi, de la même façon, les constructions intégrées dans des
pages d’autres sites (voir « Serveurs que ForkBuild contacte » plus bas) :

- `/e/embed-code` : le code d’intégration d’une construction a été copié
  avec **Intégrer → Copier le code d’intégration** ;
- `/e/embed-view` : une construction intégrée a été affichée sur une page ;
- `/e/embed-open` : une construction intégrée a été ouverte dans ForkBuild
  depuis cette page.

Et quand quelqu’un participe au défi de construction hebdomadaire
(**Participer au défi**, ou le défi dans **Nouveau** de l’Éditeur) :
`/e/challenge-join` ; et quand quelqu’un ouvre la
place du défi d’une semaine dans la vue du monde : `/e/plaza-visit`. Et chaque fois que la vue du monde s’ouvre : `/e/world-visit` ; et, une fois par visite, quand la construction de quelqu’un d’autre y est en vue (une que cet appareil n’a pas publiée et ne peut pas modifier ; les constructions toutes prêtes autour de la place ne comptent pas) : `/e/world-neighbour`. Et, au plus une fois à chaque ouverture de ForkBuild, quand quelqu’un qui n’a pas encore de nom s’y promène en invité : `/e/guest-walk` ; rien n’est envoyé sur l’endroit où il s’est promené. Et, au plus une fois à chaque ouverture de ForkBuild, quand l’Éditeur s’ouvre : `/e/editor-open` ; quand une construction toute prête s’y ouvre comme votre propre copie depuis un lien de l’**Accueil** ou de la page d’un défi : `/e/starter-open` ; et quand vous y faites une première modification : `/e/editor-edit`. Aucun ne dit de quelle construction il s’agissait ni ce qui a été modifié. Et, au plus une fois à chaque ouverture de ForkBuild, quand quelqu’un utilise l’un des systèmes annexes : nage (`/e/swam`), attrape un animal (`/e/animal-caught`), décore une construction avec l’un d’eux (`/e/animal-decorated`), porte quelque chose, un animal ou un véhicule rangé (`/e/inventory-used`), envoie un message de discussion (`/e/chat-sent`), passe ou prend un appel vocal (`/e/voice-call`) ou rejoint un salon public (`/e/lobby-joined`). Aucun ne dit ce qui a été attrapé, dit, appelé ou rejoint. Et quand quelqu’un crée un lien **Se promener ici avec moi** dans la vue du monde : `/e/walk-link` ; et quand un ami arrive par l’un d’eux : `/e/walk-joined`. Et quand quelqu’un crée un lien **Construire avec moi** dans l’Éditeur : `/e/build-link` ; et quand un ami vous rejoint par l’un d’eux : `/e/build-joined` ; et la première fois qu’une construction est publiée en créditant les amis qui l’ont construite ensemble : `/e/publish-together`. Et à chaque publication d’une construction : `/e/publish-found` quand elle a été envoyée à tout le monde, ou `/e/publish-link-only` quand elle est restée avec son lien.

Et la première fois qu’une construction est publiée depuis ce navigateur
(la republier plus tard n’envoie rien) :

- sa taille, sous la forme de l’une de cinq tranches de briques posées
  directement, hors structures : `/e/publish-bricks-0`, `/e/publish-bricks-1`
  (de 1 à 9), `/e/publish-bricks-10` (de 10 à 49), `/e/publish-bricks-50`
  (de 50 à 199) ou `/e/publish-bricks-200` (200 ou plus). Jamais le nombre
- les mêmes cinq tranches pour les briques que son auteur a posées ou
  modifiées, sans les briques toutes faites avec lesquelles elle a commencé
  ou qui y ont été ajoutées : de `/e/publish-placed-0` à
  `/e/publish-placed-200` ;
  exact ;
- `/e/second-build`, quand c’est la deuxième construction publiée depuis ce
  navigateur, ce qui n’arrive qu’une fois ;
- `/e/remix-published`, quand c’est une copie d’une construction que ce
  navigateur n’a pas publiée.

Ils sont déduits des constructions que ce navigateur a publiées, qu’il garde
déjà (voir « Ce qui reste sur votre appareil ») ; pour les briques posées, s’y ajoute une note des briques avec lesquelles chaque construction a commencé, gardée à côté d’elle sur cet appareil et jamais envoyée.

Et quand ForkBuild est ouvert par un lien de l’une de ses propres
publications de lancement, qui se termine par `?ref=` et le nom de l’endroit
où il a été publié (`hn`, `producthunt`, `reddit`, `itch`, `nostr`, `steem`, `blurt`, `edu`, `gamejolt`, `indiedb`, `youtube` ou `github` ; toute autre valeur est ignorée) :
`/r/` suivi de ce nom, comme `/r/hn`, une fois. L’application retire
ensuite `ref` de l’adresse, pour qu’un rechargement ou une adresse
transmise ne l’envoie pas à nouveau. Cela indique quelles publications ont
amené des gens, et rien sur qui ils sont ni ce qu’ils ont fait.

Chacune n’envoie que son chemin et le nombre aléatoire : jamais le lien, la
construction, son titre ni qui l’a faite. Les constructions ouvertes depuis
un lien ne sont retenues que dans la mémoire de la page ouverte, et
oubliées à sa fermeture.

Aucune de ces requêtes n’est jamais envoyée :

- quand votre navigateur envoie Global Privacy Control ou Do Not Track ;
- quand vous désactivez **Vos données → Comptage quotidien des visiteurs →
  Compter ce navigateur** (le choix est gardé dans ce navigateur
  uniquement) ;
- depuis une copie de ForkBuild servie ailleurs que sur le site officiel, y
  compris `localhost`.

Une construction intégrée ne peut pas lire le choix **Compter ce
navigateur** : elle n’ouvre aucun stockage, et les navigateurs séparent de
toute façon le stockage d’un site à l’intérieur des pages d’autres sites.
`/e/embed-view` et `/e/embed-open` ne suivent donc que les deux autres
règles : jamais avec Global Privacy Control ou Do Not Track, et seulement
depuis le site officiel.

Le code se trouve dans `core/app/VisitorCount.js`,
`core/app/LaunchChannel.js`, `application/settings/CountDailyVisit.js`,
`application/settings/CountLaunchChannel.js`,
`application/settings/FunnelEventCounter.js`, `ui/counterHit.js`,
`ui/start.js` et `ui/embed/embedBoot.js`.

## Les serveurs que ForkBuild contacte

Chaque script, feuille de style et police vient du site depuis lequel
l’application est servie (voir [docs/Deployment.md](../../Deployment.md),
en anglais). Une seule chose démarre d’elle-même : environ 10 secondes
après l’ouverture de l’application, puis toutes les quelques minutes tant
que son onglet est visible, elle lit les nouvelles annonces depuis les
relais Nostr, la passerelle Arweave, et les nœuds Steem et Blurt configurés sous
**Paramètres réseau** (docs/AnnouncementIndex.md). Elle ne lit que des
annonces (petits pointeurs et déclarations signées), jamais de contenu,
et ne publie rien. Les notes de construction, qui portent des constructions
entières, ne sont lues que quand vous ouvrez Explorer, une page d’auteur, le
défi ou sa place (voir le tableau). Tout le reste ne se produit que lorsque vous utilisez
la fonctionnalité, et chaque serveur peut être changé sous **Paramètres
réseau**. Chaque serveur voit votre adresse IP et ce que vous lui
demandez.

La voix, une fois activée dans l’Éditeur ou la Vue du Monde, télécharge aussi une seule fois
son modèle vocal depuis Hugging Face et son moteur vocal (WebAssembly)
depuis jsDelivr ; chacun est refusé s’il n’est pas exactement le fichier
attendu par ForkBuild (le SHA-256 du moteur et de chaque fichier du modèle,
à une version précise du modèle, est fixé dans l’application). Ce que vous
dites est enregistré et compris sur votre appareil, et n’est jamais envoyé.

| Quand | Serveur (par défaut) | Ce qu’il reçoit |
| --- | --- | --- |
| Vous activez la voix dans l’Éditeur ou la Vue du Monde (une fois, puis seulement après avoir supprimé ses fichiers) | Hugging Face (`huggingface.co` et ses serveurs de fichiers), jsDelivr (`cdn.jsdelivr.net`) | des demandes pour les fichiers du modèle vocal (`onnx-community/whisper-base`, une version précise) et le fichier WebAssembly du moteur vocal (`onnxruntime-web`, une version précise) ; jamais rien de ce que vous dites |
| L’application s’ouvre sur le site officiel, au plus une fois par jour (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image avec un chemin fixe, sans référent et sans cookie |
| Sur le site officiel, vous copiez ou partagez un lien vers une construction, ouvrez un lien partagé, ou copiez dans l’Éditeur une construction ouverte depuis un tel lien (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image avec un chemin fixe qui indique lequel des trois moments c’était, sans référent et sans cookie |
| Vous installez ForkBuild depuis le site officiel (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image avec le chemin fixe `/e/installed`, sans référent et sans cookie |
| Sur le site officiel, vous copiez le code d’intégration d’une construction, ou une construction intégrée est affichée ou ouverte dans ForkBuild (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image avec un chemin fixe indiquant lequel des trois cas, sans référent et sans cookie |
| Sur le site officiel, vous participez au défi de construction hebdomadaire ou ouvrez sa place (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image avec le chemin fixe `/e/challenge-join` ou `/e/plaza-visit`, sans référent et sans cookie |
| Sur le site officiel, vous ouvrez la vue du monde, et la construction de quelqu’un d’autre y est en vue (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image avec le chemin fixe `/e/world-visit`, et au plus une avec `/e/world-neighbour` par visite, sans référent ni cookie |
| Sur le site officiel, vous vous promenez dans la vue du monde avant de choisir un nom (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | au plus une requête d’image avec le chemin fixe `/e/guest-walk` à chaque ouverture de ForkBuild, sans référent ni cookie |
| Sur le site officiel, vous ouvrez l’Éditeur, y ouvrez une construction toute prête depuis l’**Accueil** ou un défi, ou y faites une modification (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | au plus une requête d’image à chaque ouverture de ForkBuild pour chacun, avec son chemin fixe (`/e/editor-open`, `/e/starter-open`, `/e/editor-edit`), sans référent et sans cookie |
| Sur le site officiel, vous nagez, attrapez un animal, décorez une construction avec l’un d’eux, portez quelque chose, envoyez un message de discussion, passez ou prenez un appel vocal ou rejoignez un salon public (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | au plus une requête d’image par chargement de page pour chacun, avec son chemin fixe (`/e/swam`, `/e/animal-caught`, `/e/animal-decorated`, `/e/inventory-used`, `/e/chat-sent`, `/e/voice-call`, `/e/lobby-joined`), sans référent ni cookie |
| Sur le site officiel, vous créez un lien **Se promener ici avec moi** ou arrivez par l’un d’eux (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image au chemin fixe `/e/walk-link` ou `/e/walk-joined`, sans référent ni cookie |
| Sur le site officiel, vous créez un lien **Construire avec moi** ou rejoignez une construction par l’un d’eux (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image au chemin fixe `/e/build-link` ou `/e/build-joined` (et `/e/publish-together` quand une construction faite ensemble est publiée pour la première fois en les créditant), sans référent ni cookie |
| Sur le site officiel, vous publiez une construction pour la première fois (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image avec un chemin fixe indiquant sa tranche de briques, et une de plus pour une deuxième construction ou un remix, sans référent et sans cookie |
| Vous ouvrez le site officiel par le lien d’une publication de lancement (`?ref=…`, voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image avec le chemin fixe `/r/<canal>`, sans référent et sans cookie |
| Vous vous rendez découvrable, ou cherchez quelqu’un, dans **Pairs** | le serveur de rendez-vous (`forkbuild-rendezvous.prazjp.workers.dev`) | la clé publique de votre identité et une offre de connexion, conservées au plus 15 minutes ; l’identité que vous recherchez ; quand vous vous connectez à quelqu’un que vous avez trouvé, votre réponse de connexion (elle liste vos adresses réseau), que seule cette personne peut récupérer |
| Vous rejoignez un salon public, ou y jetez un œil | le même serveur de rendez-vous | votre carte de salon signée (clé publique, nom affiché, quel salon), conservée au plus 15 minutes et renouvelée tant que vous restez ; le salon que vous consultez |
| Vous copiez vers un autre appareil (**Vos données** → **Copier vers un autre appareil**), ou ouvrez son lien sur l’autre appareil | le serveur de rendez-vous (`forkbuild-rendezvous.prazjp.workers.dev`) | une clé publique créée pour cette seule copie (pas celle de votre identité) et une offre de connexion, gardées au plus 10 minutes ; depuis l’autre appareil, cette clé et sa réponse de connexion. Ce qui est copié passe directement d’un appareil à l’autre, chiffré avec une clé que seul le code contient |
| Vous créez un lien **Se promener ici avec moi** dans la vue du monde, ou en ouvrez un | le serveur de rendez-vous (`forkbuild-rendezvous.prazjp.workers.dev`) | une clé publique créée pour ce seul lien (pas celle de votre identité) et une offre de connexion, chacune gardée au plus 10 minutes et proposée de nouveau tant que le lien fonctionne (au plus 30 minutes) et après chaque ami arrivé ; d’un ami, cette clé et sa réponse de connexion. Le Monde, les deux noms et l’invitation qui relie vos deux sessions de pairs passent directement entre vos appareils |
| Vous créez un lien **Construire avec moi** dans l’Éditeur, ou en ouvrez un | le même serveur de rendez-vous | la même chose que pour **Se promener ici avec moi**. Le titre de la construction, les deux noms, l’invitation, la construction et chaque modification qui y est apportée passent directement entre vos appareils |
| Une connexion entre pairs démarre | des serveurs STUN (`stun.l.google.com`) | rien d’autre qu’une demande de votre adresse IP publique |
| Vous démarrez une connexion entre pairs, si le serveur de rendez-vous propose un relais | le `/turn-credentials` du serveur de rendez-vous, puis son relais TURN (Cloudflare) | une demande d’identifiants de relais de courte durée, au plus environ une fois par heure ; le trafic relayé est chiffré de bout en bout par WebRTC |
| L’application est ouverte et son onglet visible (synchronisation des annonces en arrière-plan) | des relais Nostr (`relay.damus.io`), une passerelle Arweave (`arweave.net`), des nœuds Steem (`api.steemit.com`), des nœuds Blurt (`rpc.blurt.blog`) | des requêtes pour les tags de découverte de ForkBuild : les tags communs des Snapshots et des Commentaires, et les régions de Noms de lieux et cases de carte que vous avez visitées |
| Vous ouvrez Explorer ou une page d’auteur | des relais Nostr (`relay.damus.io`), une passerelle Arweave (`arweave.net`), des nœuds Steem (`api.steemit.com`), des nœuds Blurt (`rpc.blurt.blog`) | une requête pour le tag commun des publications (`forkbuild-publication`) ; puis une demande de l’enregistrement signé de chaque publication nouvellement annoncée, au plus 20 par visite ou par **Vérifier à nouveau** |
| Vous ouvrez le défi de construction d’une semaine (**Défi**) | relais Nostr (`relay.damus.io`), une passerelle Arweave (`arweave.net`), des nœuds Steem (`api.steemit.com`), des nœuds Blurt (`rpc.blurt.blog`) | une requête pour l’étiquette de cette semaine (`forkbuild-tag:<tag>`) ; puis une demande de l’enregistrement signé de chaque nouvelle participation annoncée, au plus 20 par visite ou **Vérifier à nouveau** |
| Vous publiez une construction après avoir choisi **Tout le monde** sous **Qui peut la trouver ?** | chaque relais Nostr des **Paramètres réseau** (`relay.damus.io`, `nos.lol`, `relay.primal.net`) | une note de construction : la construction signée elle-même, ses étiquettes et l’emplacement signé de son éditeur, signée avec la clé porteuse de cet appareil |
| Vous ouvrez Explorer, la page d’une personne, le défi d’une semaine ou sa place | chaque relais Nostr des **Paramètres réseau** | une requête de notes de construction (`forkbuild-build`, ou `forkbuild-tag:<tag>` de la semaine) ; chaque nouvelle note est vérifiée et ouverte sur cet appareil, au plus 40 par visite |
| Vous distribuez ou découvrez des publications via Nostr | des relais Nostr (`relay.damus.io`) | les annonces signées que vous publiez ; vos requêtes |
| Vous stockez ou récupérez du contenu sur Arweave | une passerelle Arweave (`arweave.net`) | le contenu que vous publiez ; ce que vous récupérez |
| Vous récupérez du contenu depuis IPFS | une passerelle IPFS (`ipfs.filebase.io`), ou votre propre nœud IPFS (`127.0.0.1:5001`) | ce que vous récupérez ou ajoutez |
| Vous épinglez du contenu chez un service d’épinglage distant (*expérimental*) | le service que vous saisissez | le contenu, et le jeton que vous saisissez, gardé seulement jusqu’à la fermeture ou au rechargement de la page (jamais stocké) ; l’adresse du service et ses noms de champ sont conservés sur cet appareil une fois enregistrés sous **Fournisseur de contenu** |
| Vous stockez, annoncez ou ancrez sur Steem, ou découvrez des annonces Steem (*expérimental*) | des nœuds API Steem (`api.steemit.com`, puis `api.justyy.com`, puis `steemd.steemworld.org`) ; la signature passe par l’extension Steem Keychain | le nom de votre compte Steem ; ce que vous publiez (annonces, contenu stocké, ancres) est public sur la chaîne pour toujours, et les modifications laissent la version précédente dans son historique |
| Vous stockez, annoncez ou ancrez sur Blurt, ou découvrez des articles Blurt (*expérimental*) | des nœuds API Blurt (`rpc.blurt.blog`, puis `rpc.beblurt.com`, puis `rpc.drakernoise.com`) ; la signature passe par l’extension Blurt Keychain (ou WhaleVault) | le nom de votre compte Blurt, et les comptes dont l’historique d’articles est lu (ceux que vous suivez, et chaque compte que cet appareil a vu publier sous les tags de ForkBuild, mémorisés sur cet appareil) ; ce que vous publiez est public sur la chaîne pour toujours, sous votre propre compte, et les modifications laissent la version précédente dans son historique. Chaque transaction paie de petits frais en BLURT depuis votre compte |
| Vous distribuez la Déclaration signée d’une Publication sur Blurt (*expérimental*) | l’hébergeur d’images de Blurt (`img-upload.blurt.blog`), directement ou, quand le navigateur ne peut pas l’atteindre, par le relais `/blurt-image` du serveur de rendez-vous, qui ne conserve rien | une image 320×200 de la construction pour l’aperçu de l’article, signée avec votre clé de publication Blurt |
| Vous distribuez la Déclaration signée d’une Publication sur Steem (*expérimental*) | l’hébergeur d’images de Steem (`steemitimages.com`), directement ou, quand le navigateur ne peut pas l’atteindre, par le relais `/steem-image` du serveur de rendez-vous, qui ne garde rien | une image 320×200 de la construction pour l’aperçu de l’article, signée avec votre clé de publication Steem |
| Quelqu’un ouvre, ou un site affiche l’aperçu d’un lien qui contient sa construction (`/b/…`) | le serveur de rendez-vous (`forkbuild-rendezvous.prazjp.workers.dev`) | le lien, qui contient la construction et sa Déclaration signée ; il ne conserve rien |
| Quelqu’un ouvre, ou un site prévisualise, un lien court vers une construction envoyée à tout le monde (`/n/…`) | le serveur de rendez-vous (`forkbuild-rendezvous.prazjp.workers.dev`), qui demande la note de la construction aux relais Nostr (`relay.damus.io`, `nos.lol`, `relay.primal.net`) | le lien, qui nomme la Publication de la construction ; le serveur ne garde rien, et Cloudflare garde en cache la page et l’image d’une construction trouvée pendant un jour |
| Vous ouvrez un lien court (`#/n/…`) | chaque relais Nostr des **Paramètres réseau** | une requête pour les notes de cette seule construction (`forkbuild-build:<id>`) ; la plus récente qui passe la vérification est ouverte sur cet appareil |
| Quelqu’un ouvre une page où une construction est intégrée (`embed.html#…`) | le site d’où ForkBuild est servi (`bowo-prasetyo.github.io`) | les requêtes des fichiers de l’intégration, sans référent ; jamais la construction, qui est dans la partie de l’adresse que les navigateurs n’envoient pas |
| Un site ou un éditeur demande comment intégrer un lien `/b/…` (`/n/…`) (oEmbed) | le `/oembed` du serveur de rendez-vous (`forkbuild-rendezvous.prazjp.workers.dev`) | le lien, qui contient la construction et sa Revendication signée ; il ne conserve rien |
| Vous ouvrez un lien partagé vers une Publication (`#/view/…`) | le nœud Steem ou Blurt, la passerelle Arweave ou la passerelle IPFS que le lien désigne, puis les supports d’annonce pour trouver sa construction | l’article, la transaction ou le CID que vous ouvrez |
| Vous ancrez ou vérifiez des preuves sur Bitcoin (*expérimental*) | une API Esplora (`blockstream.info`) | la transaction que vous diffusez ou consultez |
| Vous vérifiez des preuves sur Base (*expérimental*) | un endpoint JSON-RPC Base (`mainnet.base.org`) | la transaction que vous consultez |
| Vous connectez un portefeuille de navigateur (*expérimental*) | l’extension de portefeuille que vous choisissez | tout ce qu’elle vous demande d’approuver |

ForkBuild n’envoie jamais votre clé privée, votre phrase secrète ni vos
constructions enregistrées à aucun de ces serveurs.

**Un lien qui contient sa construction** (créé par **Copier le lien** ou
**Partager…** avant qu’une construction soit distribuée) porte votre Monde
partagé signé et la construction elle-même. Il pointe vers le serveur de
rendez-vous (`forkbuild-rendezvous.prazjp.workers.dev/b/…`) pour que les
messageries et les réseaux sociaux puissent afficher le titre de la
construction et une image d’elle : ouvrir le lien, ou un site qui en
affiche l’aperçu, l’envoie, et la construction avec, à ce serveur, qui
vérifie la signature, dessine l’image, envoie les gens vers l’application
(`#/s/…`, une partie de l’adresse que les navigateurs n’envoient jamais à un
serveur) et ne conserve rien. Cloudflare, qui fait tourner le serveur, peut
journaliser les adresses demandées. Créer un lien ne contacte rien.
Quiconque a le lien peut voir la construction, son titre, sa description et
le nom de son auteur, ainsi que la clé publique de votre identité, comme pour
tout Monde partagé que vous distribuez.

**Un lien court** (proposé à la place dès qu’une construction a été
envoyée à tout le monde, voir **Qui peut la trouver ?** plus haut) ne
contient que l’identifiant de la Publication de la construction
(`forkbuild-rendezvous.prazjp.workers.dev/n/…`). L’ouvrir, ou qu’un site le prévisualise, envoie cet identifiant
au serveur de rendez-vous, qui demande la note de la construction aux
relais Nostr publics, la vérifie comme il vérifie un lien qui porte sa
construction, dessine l’image, envoie les gens vers l’application
(`#/n/…`) et ne garde rien ; l’application demande ensuite elle-même la
note aux relais. La construction était déjà publique sur ces relais, et
c’est ce sur quoi repose un lien court : il cesse de marcher si aucun
relais ne garde la note. Les constructions gardées pour leur lien n’en ont
jamais.

**Une construction intégrée** (le code que copie **Intégrer** : un
`<iframe>` de `embed.html#…` sur le site d’où ForkBuild est servi) contient
la même chose : votre Monde partagé signé et la construction. La page où il
est collé charge l’intégration depuis ce site, qui n’apprend ni la
construction (elle est dans la partie de l’adresse que les navigateurs
n’envoient jamais à un serveur) ni la page autour (le cadre n’envoie pas de
référent). Dans le navigateur du lecteur, l’intégration vérifie la signature
et la construction, l’affiche et ne conserve rien ; elle ne lance aucune des
connexions de l’application, donc aucun pair, relais ou autre réseau n’est
contacté. Quiconque peut voir la page peut voir la construction, comme avec
son lien.

**Les relais ne sont utilisés que lorsque c’est nécessaire.** Une
connexion essaie toujours d’abord un chemin direct, puis un chemin trouvé
via STUN, et ne se rabat sur le relais TURN que si aucun des deux ne
fonctionne. Pendant que vous attendez dans un salon, les offres que votre
appareil tient prêtes ne demandent jamais d’identifiants de relais, si
bien qu’un séjour dans un salon n’épuise pas l’allocation de relais que
le serveur de rendez-vous distribue chaque mois ; la personne qui se
connecte à vous en demande un, si elle en a besoin.

## Notifications sur cet appareil

Si vous activez **Me notifier sur cet appareil** (dans le panneau 🔔), votre
appareil affiche lui-même vos nouvelles notifications tant que ForkBuild est
ouvert dans un onglet en arrière-plan ou comme application installée. Aucun
service push n’est utilisé et rien n’est envoyé nulle part pour cela : la
page ouverte transmet la notification à votre navigateur, qui l’affiche via
votre système d’exploitation. Le texte de la notification (par exemple le
titre d’une construction et le nom de son auteur) peut alors rester dans
l’historique des notifications de votre appareil, comme pour toute
application. Désactivez-le dans le même panneau, ou bloquez les
notifications de ForkBuild dans les réglages du site du navigateur.

## Si vous faites tourner votre propre copie

Un déploiement détermine les valeurs par défaut ci-dessus : son serveur
de rendez-vous (`peer/RendezvousConfig.js`), si ce serveur propose un
relais TURN (`server/rendezvous-worker/README.md`), et les autres valeurs
par défaut sous **Paramètres réseau**. Le serveur de rendez-vous par
défaut n’accepte que l’origine du site officiel, une copie hébergée
ailleurs a donc besoin du sien (voir
[docs/Deployment.md](../../Deployment.md), en anglais). Si vous hébergez
ForkBuild pour d’autres, mettez à jour cette page pour nommer vos
serveurs.

Le comptage des visiteurs ne fonctionne que sur le site officiel, donc une
copie hébergée ailleurs ne compte rien. Pour compter vos propres visiteurs,
changez les adresses dans `core/app/VisitorCount.js` et l’entrée `img-src` de la
Content Security Policy de `index.html`.
