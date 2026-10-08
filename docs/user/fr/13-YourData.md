<!-- translation-of: docs/user/13-YourData.md source-hash: 268072de3b1fe04f -->
# 13 — Vos données : sauvegarder et restaurer

<!-- languages -->
[English](../13-YourData.md) · [Deutsch](../de/13-YourData.md) · [Español](../es/13-YourData.md) · **Français** · [Bahasa Indonesia](../id/13-YourData.md) · [日本語](../ja/13-YourData.md) · [한국어](../ko/13-YourData.md) · [Português (Brasil)](../pt-BR/13-YourData.md)
<!-- /languages -->

ForkBuild n’a ni comptes ni serveur qui garde votre travail. Tout ce qu’il
stocke se trouve dans ce navigateur, sur cet appareil : vos documents, vos
identités et leurs clés privées, vos structures, publications, pairs et
amis, l’historique du chat et vos réglages. **Effacer les données de ce
site dans le navigateur supprime tout définitivement**, tout comme
désinstaller le navigateur ou perdre l’appareil.

La page **Vos données** (**Vos données** dans le menu du haut) est
l’endroit où vous en gardez une copie.

## Sur cet appareil

La première section liste ce qui est stocké, par type, et l’espace
utilisé. Les nombres sont des entrées de stockage, pas des documents : un
document enregistré et la liste des documents font deux entrées, par
exemple.

Si elle indique **Le navigateur peut supprimer ces données quand le
disque manque d’espace**, cliquez sur **Demander au navigateur de les
conserver**. Les navigateurs acceptent généralement une fois que vous
avez ajouté le site aux favoris, l’avez installé ou l’utilisez souvent.
Cela ne protège que contre le ménage que le navigateur ferait de
lui-même : effacer les données du site supprime toujours tout.

## Sauvegarder

1. Choisissez une **phrase secrète de sauvegarde** (au moins 8
   caractères) et saisissez-la deux fois.
2. Laissez **Inclure les constructions téléchargées depuis d’autres
   personnes** décoché, sauf si vous les voulez : elles peuvent être
   volumineuses et peuvent généralement être récupérées de nouveau. Vos
   propres publications sont toujours incluses.
3. Cliquez sur **Sauvegarder dans un fichier**. Le navigateur télécharge
   un fichier `forkbuild-backup-<date>.forkbuild-backup`.

Le fichier contient tout ce que la page a listé, chiffré avec votre
phrase secrète de sauvegarde. Vous pouvez le garder sans risque dans un
stockage en ligne ou sur une clé USB, mais **il n’y a aucun moyen de
l’ouvrir sans cette phrase secrète** : conservez les deux là où vous ne
les perdrez pas. La phrase secrète de sauvegarde est distincte de celles
de vos identités : chaque identité du fichier reste protégée par la
sienne.

La sauvegarde n’indique pas quelle identité est connectée. Après une
restauration, vous vous reconnectez.

En plus de **Sauvegarder dans un fichier**, la même section permet :

- **Partager la sauvegarde…** (téléphones, tablettes et certains
  ordinateurs) : ouvre la feuille de partage de votre appareil, pour
  enregistrer le fichier sur un stockage en ligne, l’envoyer par e-mail
  ou le transférer vers un autre appareil. Si la feuille de partage ne
  s’ouvre pas au premier appui (le chiffrement a pris plus de temps que ce
  que permet le navigateur), touchez de nouveau **Partager la
  sauvegarde** : la sauvegarde est prête et part tout de suite.
- **Sauvegarder dans « dossier »** : une fois que vous avez choisi un
  dossier de sauvegarde (ci-dessous).

**Mémoriser la clé de sauvegarde sur cet appareil** apparaît dès que vous
saisissez une phrase secrète. Cochez-la pour faire les sauvegardes
suivantes sans saisir la phrase secrète : les boutons en un clic et les
sauvegardes automatiques ci-dessous l’utilisent. ForkBuild ne conserve pas
la phrase secrète elle-même, seulement une clé qui en est dérivée, que le
navigateur permet à ForkBuild d’utiliser pour créer des sauvegardes sans
jamais la montrer à personne, et qui ne peut pas ouvrir une sauvegarde.
Les sauvegardes faites avec elle s’ouvrent toujours avec votre phrase
secrète. **Oublier la clé de sauvegarde** la supprime.

## Rappels

Si cet appareil n’a pas été sauvegardé depuis un moment, une barre sous le
menu, sur chaque page, le signale, avec **Sauvegarder maintenant** et **Me
le rappeler dans une semaine** :

- Elle apparaît la première fois une semaine après que ce navigateur a
  commencé à contenir votre travail (documents, identités, structures,
  pairs ou chat), si vous n’avez jamais sauvegardé.
- Ensuite, elle apparaît quand la dernière sauvegarde est plus ancienne
  que ce que vous avez choisi sous **Rappels et sauvegardes automatiques →
  Me rappeler de sauvegarder** : chaque semaine, toutes les 2 semaines,
  chaque mois (par défaut) ou tous les 3 mois, ou jamais.
- **Sauvegarder maintenant** sauvegarde dans votre dossier de sauvegarde
  en un clic si vous en avez configuré un avec une clé mémorisée ; sinon,
  il ouvre cette page.

La même section indique quand la dernière sauvegarde a été faite et où.

## Sauvegarder dans un dossier

Dans Chrome et Edge sur ordinateur, **Choisir un dossier…** vous permet
de choisir un dossier pour les sauvegardes. Choisissez-en un que votre
stockage en ligne synchronise (Dropbox, OneDrive, iCloud Drive, Google
Drive) ou une clé USB, et chaque sauvegarde quitte cet appareil sans que
vous ayez à déplacer des fichiers. La sauvegarde de chaque jour est un
fichier, `forkbuild-backup-<date>.forkbuild-backup` ; une seconde
sauvegarde le même jour remplace le fichier de ce jour, et ForkBuild y
garde ses dix sauvegardes les plus récentes, sans jamais toucher au reste
du dossier.

Le navigateur demande la première fois si ForkBuild peut enregistrer dans
le dossier, et peut redemander lors d’une visite ultérieure. **Ne plus
utiliser ce dossier** l’oublie ; les sauvegardes qui s’y trouvent déjà
restent.

**Sauvegarder automatiquement dans le dossier une fois par jour tant que
ForkBuild est ouvert** nécessite un dossier et une clé mémorisée.
ForkBuild vérifie alors une minute après son ouverture, puis toutes les
heures, et sauvegarde si la dernière sauvegarde date d’un jour. Il ne
demande jamais d’autorisation de lui-même : si le navigateur veut
redemander, les sauvegardes automatiques attendent que vous ayez
sauvegardé une fois vous-même dans le dossier. Une sauvegarde automatique
qui échoue est signalée sur cette page.

Les autres navigateurs ne peuvent pas enregistrer dans un dossier.
Utilisez-y **Partager la sauvegarde…**, ou téléchargez le fichier et
déplacez-le vous-même.

## Restaurer

Fermez d’abord ForkBuild dans tout autre onglet : un onglet resté ouvert
peut réécrire ses anciennes données.

1. Sous **Restaurer**, choisissez le fichier de sauvegarde et saisissez
   sa phrase secrète, puis cliquez sur **Ouvrir la sauvegarde**. Une
   mauvaise phrase secrète est refusée et rien ne change. ForkBuild
   indique quand la sauvegarde a été faite et ce qu’elle contient.
2. Choisissez comment restaurer :
   - **Ajouter ce que cet appareil n’a pas** (par défaut) : tout ce qui,
     dans la sauvegarde, n’est pas sur cet appareil est ajouté. Quand les
     deux ont quelque chose, comme le même document ou un réglage, la
     version de cet appareil est conservée.
   - **Remplacer tout ce qui est sur cet appareil par la sauvegarde** :
     supprime d’abord ce que ForkBuild a stocké ici, puis restaure
     exactement la sauvegarde. Cochez la confirmation pour l’activer.
3. Cliquez sur **Restaurer**. La page se recharge une fois terminé. Un
   appareil restauré compte comme sauvegardé à la date de la sauvegarde.

Une sauvegarde faite par une version plus récente de ForkBuild ne peut
pas être ouverte par une version plus ancienne ; mettez d’abord cette
copie à jour. Tout ce qu’une sauvegarde contient et que cette version ne
connaît pas est ignoré, et le résultat indique combien d’éléments.

## Exports plus restreints

Pour déplacer un seul type de chose, ou le partager, utilisez l’export de
sa propre page :

| Quoi | Exporter | Importer |
|---|---|---|
| Un document | **Exporter** dans la barre d’outils de l’Éditeur | **Importer** dans la barre d’outils de l’Éditeur |
| Tous les documents enregistrés | **Exporter tous les documents** en bas du menu **Récents** de l’Éditeur | **Importer** dans la barre d’outils de l’Éditeur |
| Une structure | **Exporter le plan** dans le menu **⋮** de sa carte | **Importer un plan** à côté de **Mes structures** |
| Toutes les structures | **Tout exporter** à côté de **Mes structures** | **Importer un plan** à côté de **Mes structures** |
| Une identité | **Exporter** dans **Mes identités** | **Importer une identité** dans **Mes identités** |

Importer tous les documents remet ceux que cet appareil n’a pas, garde
ceux qu’il a déjà tels quels, et enregistre une copie à côté de ceux qu’il
a dans une autre version. Importer toutes les structures ignore les
designs déjà présents dans Mes structures. Une identité exportée emporte
aussi sa révocation, son successeur et ses autorisations d’appareils, si
bien qu’une identité révoquée revient révoquée.

L’historique du chat, les amis, les personnes suivies et les réglages ne
se déplacent qu’avec une sauvegarde complète.

## Vos publications

Une création que vous **Publiez** n’est stockée que sur cet appareil,
jusqu’à ce que vous la distribuiez (voir
[Publier et forker](04-PublishingAndForking.md)). Sa carte dans le Dépôt
indique où cet appareil a enregistré sa distribution, par exemple
**Stocké sur IPFS · Annoncé sur Nostr** : où la construction ou sa
Déclaration signée a été envoyée (IPFS, Arweave, Steem ou Blurt) et où elle
a été annoncée (Nostr, Arweave, Steem ou Blurt). Laissez le pointeur sur un nom pour
voir son adresse ou l’id de l’annonce.

La ligne indique seulement ce dont cet appareil a une trace. Elle ne
vérifie pas qu’un envoi est toujours disponible (une copie IPFS ne dure
que tant que quelqu’un la garde épinglée), et une distribution faite
depuis un autre appareil n’est pas connue ici. Sans trace, la carte
indique **Aucune distribution enregistrée sur cet appareil** :
sauvegardez-la, ou ouvrez-la dans la Vue du Monde avec **Explorer** et
utilisez **Distribuer** sous **Mon Monde partagé**. La partager avec des
pairs connectés n’est pas enregistré comme une distribution : ils n’en
gardent une copie qu’aussi longtemps qu’ils le choisissent.

## Comptage quotidien des visiteurs

En bas de la page, **Comptage quotidien des visiteurs** contrôle la seule
chose que ForkBuild envoie sans qu’aucune fonction en ait besoin. Une fois
par jour, le site officiel signale à GoatCounter qu’un navigateur de plus
l’a ouvert. Il compte aussi, de la même façon, quand un lien vers une
construction est copié ou partagé, quand un lien partagé est ouvert et quand
une construction ouverte depuis un tel lien est copiée dans l’Éditeur.
Chaque requête est un chemin fixe qui ne nomme aucune page, aucune
construction ni aucune personne et ne dépose aucun cookie, et tout le monde
peut consulter les totaux sur le tableau de bord public. Décochez **Compter ce navigateur**
pour l’arrêter ; le choix est enregistré aussitôt, dans ce navigateur
uniquement. Un navigateur qui envoie Global Privacy Control ou Do Not Track
n’est jamais compté, et l’interrupteur l’indique. Voir
[Confidentialité](Privacy.md#comptage-des-visiteurs) pour savoir
exactement ce qui est envoyé.
