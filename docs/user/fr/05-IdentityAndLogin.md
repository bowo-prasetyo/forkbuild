<!-- translation-of: docs/user/05-IdentityAndLogin.md source-hash: ed66279f6cd72634 -->
# 05 — Votre nom et votre identité

<!-- languages -->
[English](../05-IdentityAndLogin.md) · [Deutsch](../de/05-IdentityAndLogin.md) · [Español](../es/05-IdentityAndLogin.md) · **Français** · [Bahasa Indonesia](../id/05-IdentityAndLogin.md) · [日本語](../ja/05-IdentityAndLogin.md) · [한국어](../ko/05-IdentityAndLogin.md) · [Português (Brasil)](../pt-BR/05-IdentityAndLogin.md)
<!-- /languages -->

> **Avancé.** Ce chapitre n’est pas nécessaire pour construire, partager,
> remixer ou se promener avec des amis : les
> [chapitres Jouer](README.md#jouer-à-lire-dans-lordre) s’en chargent. Lisez la suite si vous
> voulez savoir ce qui tourne en dessous.

ForkBuild n’a ni mots de passe ni comptes. **Derrière votre nom se trouve
une identité : une paire de clés cryptographiques stockée dans ce
navigateur** — la même clé qui signe tout ce que vous publiez, envoyez ou
déplacez. Ce guide explique comment choisir un nom, le protéger par une
phrase secrète et le sauvegarder.

## Créer une identité

Sans nom, cliquez sur **Choisir un nom** dans la barre du haut : saisissez
un nom et cliquez sur **Continuer en tant que …**, et une identité de ce nom
est créée, sans phrase secrète jusqu’à ce que vous en ajoutiez une. Pour la
protéger tout de suite, cliquez plutôt sur **La protéger maintenant par une
phrase secrète**.

Avec un nom, cliquez dessus dans la barre du haut, puis sur **Changer de
nom**. La boîte de dialogue liste toutes les identités que cet appareil
détient déjà — cliquez sur l’une d’elles pour l’utiliser — ou en crée une
nouvelle :

1. Saisissez un **nom**. C’est ce que voient les autres ; vous pouvez avoir
   plusieurs identités avec des noms différents.
2. Saisissez une **phrase secrète** (au moins 8 caractères), puis
   saisissez-la de nouveau pour la confirmer.
3. Cliquez sur **Utiliser ce nom**.

Cela crée une identité **protégée** (marquée d’un 🔒) : la clé est chiffrée
au repos et n’est déchiffrée, en mémoire, qu’après la saisie de la phrase
secrète.

Vous pouvez laisser la phrase secrète vide, mais seulement en cochant
**Créer sans phrase secrète**. Cela crée une identité **non protégée** :
la clé est stockée non chiffrée dans ce navigateur, utilisable sans jamais
rien vous demander, et tout ce qui peut lire le stockage de ce site peut
signer en votre nom. Vous pouvez la protéger plus tard depuis **Mes
identités**.

> Il n’y a pas de réinitialisation du mot de passe. Pour une identité
> protégée, la phrase secrète *est* le seul moyen de déchiffrer la clé —
> si vous la perdez, cette identité est perdue, même pour ForkBuild.
> Choisissez-en une que vous pourrez garder.

## Le coffre : verrouillé ou sans nom

La clé déchiffrée d’une identité protégée se trouve dans ce qu’on appelle
son **coffre**. Le coffre peut être **verrouillé** ou **déverrouillé**, et
c’est une question réellement différente de celle de savoir quel nom vous
utilisez :

- **Avec un nom, déverrouillé** — tout fonctionne normalement.
- **Avec un nom, verrouillé** (🔒 à côté de votre nom en haut à droite) — vous
  êtes toujours vous-même : vous pouvez toujours parcourir, construire et
  enregistrer, et vous voyez toujours vos propres cœurs, les personnes que
  vous suivez et vos notifications. Tout ce qui demande une nouvelle signature
  (donner un cœur, commenter, suivre, publier, être découvrable, rejoindre un
  salon) indique **Votre nom « … » est verrouillé** et propose aussitôt un
  bouton **Déverrouiller**, qui ouvre la même demande de phrase secrète qu’un
  clic sur votre nom puis sur **Déverrouiller**. Réessayez ensuite.
- **Sans nom** — après **Changer de nom → Continuer sans nom**, vous êtes
  un invité ; **Choisir un nom** dans la barre du haut choisit ou
  déverrouille de nouveau une identité.

Un coffre se verrouille automatiquement **15 minutes après son
déverrouillage**, que vous utilisiez encore l’application ou non (ce
n’est pas un délai d’inactivité), ou quand vous cliquez vous-même sur
**Verrouiller** dans **Mes identités**. Recharger la page laisse toujours
les identités protégées verrouillées — la clé déchiffrée n’est jamais
écrite sur le disque, seulement gardée en mémoire — même si l’application
se souvient encore du nom que vous utilisiez.

## Gérer les identités — la page Mes identités

Ouvrez **Plus → Mes identités** (ou cliquez sur votre nom dans la barre du haut) pour voir toutes les
identités que cet appareil détient, chacune avec son propre état de
verrouillage, indépendamment de celle que vous utilisez.
De là, vous pouvez :

- **Créer** une nouvelle identité (comme dans la boîte de dialogue du
  nom).
- **Protéger par une phrase secrète** — affiché sur une identité non
  protégée (marquée ⚠ Non protégée). Cela chiffre la clé existante ;
  l’identité elle-même ne change pas, et elle reste verrouillée jusqu’à ce
  que vous la déverrouilliez.
- **Verrouiller / Déverrouiller** chaque identité individuellement.
- **Changer la phrase secrète** — remplace la phrase secrète d’une
  identité protégée (seules les identités protégées le proposent).
  L’identité elle-même — son ID, sa clé publique et toutes les signatures
  qu’elle a faites — ne change jamais.
- **Exporter** — la sauvegarder.
- **Importer** — en restaurer ou en copier une depuis un fichier de
  sauvegarde.
- **Déclarer un successeur** / **Révoquer** — marquer une identité comme
  retirée au profit d’une autre (collez l’ID `did:key:z…` du successeur),
  ou la révoquer purement et simplement, définitivement, avec
  **Révoquer l’identité**. Déclarer un
  successeur ne révoque rien en soi — révoquez séparément quand le
  changement doit prendre effet. Pour une identité protégée verrouillée,
  les deux demandent sa phrase secrète, et signer avec elle la
  déverrouille, exactement comme si vous la déverrouilliez vous-même.

Un seul de ces formulaires (Déverrouiller, Exporter, Changer la phrase
secrète, Déclarer un successeur, Révoquer) est ouvert à la fois, sur une
seule carte d’identité. En ouvrir un autre, appuyer sur **Annuler** ou
terminer l’action le ferme et efface tous ses champs, pour qu’une phrase
secrète saisie ne reste jamais sur la page. Les gestionnaires de mots de
passe du navigateur reçoivent l’instruction de ne pas remplir
automatiquement les champs de cette page.

Il n’y a ni renommage ni suppression — les identités sont faites pour
durer ; si vous voulez arrêter d’en utiliser une, révoquez-la plutôt.

### Ce que fait la révocation — et ce qu’elle ne fait pas

Révoquer empêche une identité de signer quoi que ce soit de nouveau, y
compris la preuve dont elle a besoin pour établir une nouvelle connexion
avec une autre personne. Cela ne vous empêche **pas** de l’utiliser,
et vous pouvez toujours la choisir ensuite — sa carte dans **Mes identités**
affiche simplement **Révoquée**. C’est voulu, pour que vous puissiez encore
l’ouvrir pour la consulter ou l’**Exporter** une dernière fois. Pour
continuer à travailler, créez une nouvelle identité et utilisez
celle-ci.

La révocation est définitive, sur cet appareil et sur tout appareil où vous
restaurez sa sauvegarde. Les connexions déjà ouvertes au moment de la
révocation ne sont pas coupées ; à leur prochaine reconnexion, l’identité
révoquée ne pourra plus prouver qui elle est. Déclarez un successeur *avant*
de révoquer si vous voulez que les autres sachent quelle identité la
remplace — ensuite, l’identité révoquée ne peut plus le signer.

## Sauvegarder une identité (export et import)

Votre identité n’existe que sur cet appareil tant que vous ne la
sauvegardez pas. **Exporter** produit un fichier téléchargeable contenant
votre clé privée chiffrée :

- L’export demande toujours la phrase secrète de l’identité, même si elle
  est actuellement déverrouillée.
- Si l’identité n’est pas protégée, l’export vous demande de choisir sur
  le moment une phrase secrète (au moins 8 caractères), uniquement pour
  protéger la copie dans le fichier.

**Importer** amène une identité exportée sur un autre appareil ou un
autre navigateur :

1. Cliquez sur **Importer une identité**, puis choisissez le fichier
   exporté (ou collez son JSON dans la zone en dessous). ForkBuild affiche
   d’abord un aperçu sans risque — nom, ID, algorithme, et si vous l’avez
   déjà — sans rien déchiffrer.
2. Saisissez la phrase secrète de l’export pour l’importer réellement.

Une identité importée arrive toujours **verrouillée**, et ForkBuild ne passe
pas à elle de lui-même — déverrouillez-la depuis Mes
identités ou la boîte de dialogue du nom, comme toute autre identité
protégée.

Le fichier contient aussi les enregistrements signés du cycle de vie de
l’identité : sa révocation, le successeur qu’elle a déclaré, et les
appareils qu’elle a autorisés ou cessé d’autoriser. L’import les restaure,
si bien qu’une identité révoquée revient révoquée plutôt qu’active.
Importer un fichier plus récent pour une identité que vous avez déjà
ajoute ceux de ces enregistrements qui manquent à l’appareil, et ne change
rien d’autre.

Pour sauvegarder toutes les identités d’un coup, avec tout le reste,
utilisez [Vos données](13-YourData.md).

Les fichiers exportés par les versions antérieures de ForkBuild
s’importent toujours. Les fichiers exportés maintenant utilisent un format
plus récent que les versions antérieures ne savent pas lire : mettez
d’abord à jour ForkBuild sur l’autre appareil.

## Clés des versions antérieures

Les identités protégées créées avant cette version utilisaient un format
de chiffrement plus faible. Elles se déverrouillent toujours avec la même
phrase secrète, et la première fois que vous en déverrouillez une (ou que
vous l’exportez), ForkBuild la chiffre de nouveau dans le format actuel.
Rien ne change pour l’identité elle-même.

> Gardez en sécurité à la fois le fichier exporté *et* sa phrase secrète.
> L’un sans l’autre est inutile — et perdre les deux signifie que cette
> identité, et tout ce qu’elle seule pouvait signer, est irrécupérable.

## Mauvaise phrase secrète

Cinq tentatives erronées (déverrouillage, export ou changement de phrase
secrète — elles partagent un même compteur par identité) déclenchent une
pause de 30 secondes ; le message d’erreur décompte les tentatives
restantes, puis le temps de blocage restant. Le compteur se réinitialise
au rechargement.

## Et ensuite ?

Maintenant que vous avez un nom, configurez votre apparence pour les
autres dans **[Avatars et présence](06-AvatarsAndPresence.md)**, ou
trouvez des personnes avec qui construire dans
**[Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md)**.
