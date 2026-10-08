<!-- translation-of: docs/Privacy.md source-hash: d70bfd90aa9c35dd -->
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

- vos documents, les copies de récupération des modifications non
  enregistrées, et les structures enregistrées ;
- vos identités : la clé publique de chacune, et sa clé privée, chiffrée
  avec votre phrase secrète sauf si vous avez choisi de la créer sans ;
- les pairs connus, les amis, les personnes que vous suivez, les
  blocages, l’historique du chat et les messages en attente (personne
  n’est informé que vous le suivez, et rien concernant un abonnement n’est
  jamais envoyé) ;
- votre profil d’avatar, vos réglages (y compris si la Vue du Monde joue
  du son, à quel volume, en 3D ou en stéréo, et la langue que vous avez
  choisie ; quand vous n’en avez pas choisi, ForkBuild lit les langues
  préférées du navigateur sur l’appareil et ne les envoie nulle part), et
  le nom d’utilisateur et l’identifiant d’un serveur TURN si vous en
  saisissez un sous **Paramètres réseau**;
- si ce navigateur participe au comptage quotidien des visiteurs, et le
  dernier jour où il l’a fait ;
- les publications d’autres personnes que cet appareil a trouvées et
  vérifiées, auprès de pairs, par des liens, dans la Vue du Monde ou par la
  recherche du Dépôt sur les réseaux, et, pour celles trouvées sur les
  réseaux, l’endroit où l’enregistrement signé de chacune a été lu ;
- les identifiants des publications que vous avez dépubliées sur cet
  appareil, pour que la recherche du Dépôt sur les réseaux ne liste plus
  les copies que vous aviez distribuées.
- à quels réseaux cet appareil a envoyé chacun de vos commentaires, et
  quand, pour que chaque commentaire puisse indiquer où il est allé.
- pour chaque semaine du défi de construction que vous ouvrez, les
  identifiants des participations trouvées sur les réseaux, pour que sa page
  les affiche de nouveau avant de chercher.

Effacer les données de ce site dans le navigateur supprime tout cela, et
il n’existe aucune autre copie ni aucun moyen de le récupérer.
Sauvegardez-le d’abord avec **Vos données → Sauvegarder dans un
fichier** : le fichier contient tout ce qui précède sauf l’identité
connectée, chiffré avec une phrase secrète de votre choix, et reste là où
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
  pairs**, dans le Dépôt, propose l’un de vos Mondes publiés à toutes les
  personnes auxquelles vous êtes connecté maintenant et à toutes celles
  qui se connecteront plus tard, y compris les inconnus des salons : elles
  reçoivent sa fiche et peuvent récupérer le Monde lui-même sur votre
  appareil tant que vous êtes connecté. Les appareils de vos Amis et Pairs
  connus le récupèrent d’eux-mêmes ; ceux des autres seulement quand ils
  cliquent sur **Récupérer**. Un Monde que vous vous contentez de
  **Publier** n’est jamais envoyé à personne.
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
  page, aucun document, aucun Monde, aucune identité, aucun référent ni rien
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

Le même compteur est aussi informé de trois moments du partage d’une
construction, chacun par une requête d’image de plus du même genre, sous
son propre chemin fixe :

- `/e/share-link` : un lien vers une construction a été copié ou partagé
  avec **Copier le lien** ou **Partager…** ;
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
`/e/challenge-join`.

Et quand ForkBuild est ouvert par un lien de l’une de ses propres
publications de lancement, qui se termine par `?ref=` et le nom de l’endroit
où il a été publié (`hn`, `producthunt`, `reddit`, `itch`, `nostr`, `steem`, `blurt`, `edu` ou `github` ; toute autre valeur est ignorée) :
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

Le code se trouve dans `core/VisitorCount.js`,
`core/LaunchChannel.js`, `application/settings/CountDailyVisit.js`,
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
et ne publie rien. Tout le reste ne se produit que lorsque vous utilisez
la fonctionnalité, et chaque serveur peut être changé sous **Paramètres
réseau**. Chaque serveur voit votre adresse IP et ce que vous lui
demandez.

| Quand | Serveur (par défaut) | Ce qu’il reçoit |
| --- | --- | --- |
| L’application s’ouvre sur le site officiel, au plus une fois par jour (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image avec un chemin fixe, sans référent et sans cookie |
| Sur le site officiel, vous copiez ou partagez un lien vers une construction, ouvrez un lien partagé, ou copiez dans l’Éditeur une construction ouverte depuis un tel lien (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image avec un chemin fixe qui indique lequel des trois moments c’était, sans référent et sans cookie |
| Vous installez ForkBuild depuis le site officiel (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image avec le chemin fixe `/e/installed`, sans référent et sans cookie |
| Sur le site officiel, vous copiez le code d’intégration d’une construction, ou une construction intégrée est affichée ou ouverte dans ForkBuild (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image avec un chemin fixe indiquant lequel des trois cas, sans référent et sans cookie |
| Sur le site officiel, vous participez au défi de construction hebdomadaire (voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image avec le chemin fixe `/e/challenge-join`, sans référent et sans cookie |
| Vous ouvrez le site officiel par le lien d’une publication de lancement (`?ref=…`, voir « Comptage des visiteurs ») | GoatCounter (`forkbuild.goatcounter.com`) | une requête d’image avec le chemin fixe `/r/<canal>`, sans référent et sans cookie |
| Vous vous rendez découvrable, ou cherchez quelqu’un, dans **Pairs** | le serveur de rendez-vous (`forkbuild-rendezvous.prazjp.workers.dev`) | la clé publique de votre identité et une offre de connexion, conservées au plus 15 minutes ; l’identité que vous recherchez ; quand vous vous connectez à quelqu’un que vous avez trouvé, votre réponse de connexion (elle liste vos adresses réseau), que seule cette personne peut récupérer |
| Vous rejoignez un salon public, ou y jetez un œil | le même serveur de rendez-vous | votre carte de salon signée (clé publique, nom affiché, quel salon), conservée au plus 15 minutes et renouvelée tant que vous restez ; le salon que vous consultez |
| Une connexion entre pairs démarre | des serveurs STUN (`stun.l.google.com`) | rien d’autre qu’une demande de votre adresse IP publique |
| Vous démarrez une connexion entre pairs, si le serveur de rendez-vous propose un relais | le `/turn-credentials` du serveur de rendez-vous, puis son relais TURN (Cloudflare) | une demande d’identifiants de relais de courte durée, au plus environ une fois par heure ; le trafic relayé est chiffré de bout en bout par WebRTC |
| L’application est ouverte et son onglet visible (synchronisation des annonces en arrière-plan) | des relais Nostr (`relay.damus.io`), une passerelle Arweave (`arweave.net`), des nœuds Steem (`api.steemit.com`), des nœuds Blurt (`rpc.blurt.blog`) | des requêtes pour les tags de découverte de ForkBuild : les tags communs des Snapshots et des Commentaires, et les régions de Noms de lieux et cases de carte que vous avez visitées |
| Vous ouvrez le Dépôt ou une page d’auteur | des relais Nostr (`relay.damus.io`), une passerelle Arweave (`arweave.net`), des nœuds Steem (`api.steemit.com`), des nœuds Blurt (`rpc.blurt.blog`) | une requête pour le tag commun des publications (`forkbuild-publication`) ; puis une demande de l’enregistrement signé de chaque publication nouvellement annoncée, au plus 20 par visite ou par **Vérifier à nouveau** |
| Vous ouvrez le défi de construction d’une semaine (**Défi**) | relais Nostr (`relay.damus.io`), une passerelle Arweave (`arweave.net`) | une requête pour l’étiquette de cette semaine (`forkbuild-tag:<tag>`) ; puis une demande de l’enregistrement signé de chaque nouvelle participation annoncée, au plus 20 par visite ou **Vérifier à nouveau** |
| Vous distribuez ou découvrez des publications via Nostr | des relais Nostr (`relay.damus.io`) | les annonces signées que vous publiez ; vos requêtes |
| Vous stockez ou récupérez du contenu sur Arweave | une passerelle Arweave (`arweave.net`) | le contenu que vous publiez ; ce que vous récupérez |
| Vous récupérez du contenu depuis IPFS | une passerelle IPFS (`ipfs.filebase.io`), ou votre propre nœud IPFS (`127.0.0.1:5001`) | ce que vous récupérez ou ajoutez |
| Vous épinglez du contenu chez un service d’épinglage distant (*expérimental*) | le service que vous saisissez | le contenu, et le jeton que vous saisissez, gardé seulement jusqu’à la fermeture ou au rechargement de la page (jamais stocké) ; l’adresse du service et ses noms de champ sont conservés sur cet appareil une fois enregistrés sous **Fournisseur de contenu** |
| Vous stockez, annoncez ou ancrez sur Steem, ou découvrez des annonces Steem (*expérimental*) | des nœuds API Steem (`api.steemit.com`, puis `api.justyy.com`, puis `steemd.steemworld.org`) ; la signature passe par l’extension Steem Keychain | le nom de votre compte Steem ; ce que vous publiez (annonces, contenu stocké, ancres) est public sur la chaîne pour toujours, et les modifications laissent la version précédente dans son historique |
| Vous stockez, annoncez ou ancrez sur Blurt, ou découvrez des articles Blurt (*expérimental*) | des nœuds API Blurt (`rpc.blurt.blog`, puis `rpc.beblurt.com`, puis `rpc.drakernoise.com`) ; la signature passe par l’extension Blurt Keychain (ou WhaleVault) | le nom de votre compte Blurt, et les comptes dont l’historique d’articles est lu (ceux que vous suivez, et chaque compte que cet appareil a vu publier sous les tags de ForkBuild, mémorisés sur cet appareil) ; ce que vous publiez est public sur la chaîne pour toujours, sous votre propre compte, et les modifications laissent la version précédente dans son historique. Chaque transaction paie de petits frais en BLURT depuis votre compte |
| Vous distribuez la Déclaration signée d’une Publication sur Blurt (*expérimental*) | l’hébergeur d’images de Blurt (`img-upload.blurt.blog`), directement ou, quand le navigateur ne peut pas l’atteindre, par le relais `/blurt-image` du serveur de rendez-vous, qui ne conserve rien | une image 320×200 de la construction pour l’aperçu de l’article, signée avec votre clé de publication Blurt |
| Vous distribuez la Déclaration signée d’une Publication sur Steem (*expérimental*) | l’hébergeur d’images de Steem (`steemitimages.com`), directement ou, quand le navigateur ne peut pas l’atteindre, par le relais `/steem-image` du serveur de rendez-vous, qui ne garde rien | une image 320×200 de la construction pour l’aperçu de l’article, signée avec votre clé de publication Steem |
| Quelqu’un ouvre, ou un site affiche l’aperçu d’un lien qui contient sa construction (`/b/…`) | le serveur de rendez-vous (`forkbuild-rendezvous.prazjp.workers.dev`) | le lien, qui contient la construction et sa Déclaration signée ; il ne conserve rien |
| Quelqu’un ouvre une page où une construction est intégrée (`embed.html#…`) | le site d’où ForkBuild est servi (`bowo-prasetyo.github.io`) | les requêtes des fichiers de l’intégration, sans référent ; jamais la construction, qui est dans la partie de l’adresse que les navigateurs n’envoient pas |
| Un site ou un éditeur demande comment intégrer un lien `/b/…` (oEmbed) | le `/oembed` du serveur de rendez-vous (`forkbuild-rendezvous.prazjp.workers.dev`) | le lien, qui contient la construction et sa Revendication signée ; il ne conserve rien |
| Vous ouvrez un lien partagé vers une Publication (`#/view/…`) | le nœud Steem ou Blurt, la passerelle Arweave ou la passerelle IPFS que le lien désigne, puis les supports d’annonce pour trouver sa construction | l’article, la transaction ou le CID que vous ouvrez |
| Vous ancrez ou vérifiez des preuves sur Bitcoin (*expérimental*) | une API Esplora (`blockstream.info`) | la transaction que vous diffusez ou consultez |
| Vous vérifiez des preuves sur Base (*expérimental*) | un endpoint JSON-RPC Base (`mainnet.base.org`) | la transaction que vous consultez |
| Vous connectez un portefeuille de navigateur (*expérimental*) | l’extension de portefeuille que vous choisissez | tout ce qu’elle vous demande d’approuver |

ForkBuild n’envoie jamais votre clé privée, votre phrase secrète ni vos
documents enregistrés à aucun de ces serveurs.

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
changez les adresses dans `core/VisitorCount.js` et l’entrée `img-src` de la
Content Security Policy de `index.html`.
