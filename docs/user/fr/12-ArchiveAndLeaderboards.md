<!-- translation-of: docs/user/12-ArchiveAndLeaderboards.md source-hash: 9ecc6d131bdffddc -->
# 12 — Archive et succès

<!-- languages -->
[English](../12-ArchiveAndLeaderboards.md) · [Deutsch](../de/12-ArchiveAndLeaderboards.md) · [Español](../es/12-ArchiveAndLeaderboards.md) · **Français** · [Bahasa Indonesia](../id/12-ArchiveAndLeaderboards.md) · [日本語](../ja/12-ArchiveAndLeaderboards.md) · [한국어](../ko/12-ArchiveAndLeaderboards.md) · [Português (Brasil)](../pt-BR/12-ArchiveAndLeaderboards.md)
<!-- /languages -->

> **Expérimental.** Tout ce qui est ici peut changer ou être retiré dans
> une version ultérieure, et ce que cela produit pourrait ne pas être
> conservé. Sur la page Publications, le panneau **Portefeuille, archives
> et outils d’éditeur** porte un badge **Expérimental**.

Les outils Bitcoin, Base et IPFS de
[Preuves et stockage](11-EvidenceAndStorage.md) enregistrent ce qu’ils
observent dans une archive durable sur cet appareil. Ce guide présente
cette archive et ce qui s’appuie dessus : les références entre
publications et les succès.

La plupart de ces cartes se trouvent sur la page Publications, sous
**Portefeuille, archives et outils d’éditeur**, dans ses onglets **Outils
d’archive** et **Références et succès**. Chacune affiche **Conservé
localement** quand ce qu’elle contient survit à un rechargement.

Un terme utilisé partout : une **identité de publication** est un
enregistrement de Publication d’ancre Bitcoin ou Base (voir
[Publications d’ancres Bitcoin](11-EvidenceAndStorage.md#publications-dancres-bitcoin)).
C’est un enregistrement sur une chaîne, pas une personne.

## L’archive des observations de publication

Un registre durable, sur cet appareil, des faits qu’observent les outils
IPFS, Bitcoin et Base. Il ne contient que des identités de publication et
des observations : jamais une connexion de portefeuille, une clé ou un
identifiant d’épinglage.

### Archive des observations

La carte **Archive des observations** indique combien de
**Publications** et d’**Observations** elle contient.

- **Afficher l’archive** ouvre la **Chronologie des observations
  archivées** : chaque publication et vérification IPFS, chaque
  diffusion, confirmation et preuve de contenu Bitcoin, et chaque
  observation d’inclusion Base, dans l’ordre chronologique, chacune avec
  son domaine, son état et (le cas échéant) son localisateur, son txid ou
  sa hauteur de bloc. L’ouvrir ne contacte aucun réseau.
- **Vider l’archive** est la seule façon de retirer quoi que ce soit de
  l’archive ; tout le reste ne fait qu’y ajouter. Le bouton est désactivé
  quand l’archive est vide.

### Historique des preuves d’ancrage Bitcoin

Les mêmes faits Bitcoin, regroupés par ID d’ancre, sur une carte de
l’onglet **Ancrage sur blockchain**. **Afficher l’historique des
ancres**, puis un ID d’ancre, affiche son **Historique des diffusions**,
son **Historique des confirmations**, son **Historique des preuves de
contenu**, ses **Comparaisons de position dans la chaîne** et sa
**Cohérence des observations**, avec un résumé **Preuves combinées** des
cinq décomptes. Les décomptes indiquent ce qui a été enregistré, pas son
degré de fiabilité.

### Exporter, importer et inspecter l’archive

La carte **Archive des publications** transforme l’archive en fichier
JSON :

- **Exporter l’archive** affiche le JSON et un lien **Télécharger
  l’export de l’archive**.
- **Importer une archive** prend un fichier ou du JSON collé et
  prévisualise combien de publications et d’observations il contient, par
  rapport à l’archive actuelle. Seul **Remplacer l’archive actuelle**
  l’applique. Importer **remplace** l’archive actuelle (cela ne fusionne
  pas) et est irréversible. Un fichier invalide est refusé sans rien
  changer.

**Inspecter une archive externe** examine un export sans l’importer.
Elle affiche la version du schéma du fichier, le nombre de faits par
domaine (publication et vérification IPFS ; diffusion, confirmation,
preuve de contenu et identité de publication Bitcoin ; inclusion et
identité de publication Base), le nombre de faits locaux et importés, les
événements d’import, son empreinte, ainsi que les ID d’ancres Bitcoin, les
index d’enregistrements IPFS et les hashs de transactions Base qu’il
contient. De là :

- **Comparer avec l’archive actuelle** liste, par domaine, ce qui est
  **Identique**, **Modifié**, **Seulement dans l’actuelle**, **Seulement
  dans l’externe**, ou a une **Provenance différente**.
- **Examiner le remplacement** (après une comparaison) prévisualise ce que
  le remplacement changerait, avec les décomptes et les empreintes des
  deux archives. Son bouton **Remplacer l’archive actuelle** est le même
  import que ci-dessus. Le remplacement marque chaque fait comme
  nouvellement importé, l’empreinte qui en résulte diffère donc de celle
  du fichier.

### Provenance de l’archive

Montre d’où viennent les faits : les **Faits locaux** (observés sur cet
appareil) et les **Faits importés** (issus d’un **Remplacer l’archive
actuelle**). Si vous avez déjà importé, **Imports d’archives** liste
l’heure, le nombre de faits et la version du schéma de chaque import.
Aucun des deux types n’est considéré comme plus fiable.

### Empreinte de l’archive

Un condensé SHA-256 de chaque fait et de chaque étiquette de provenance
de l’archive. **Copier l’empreinte** la copie. Pour la comparer avec une
empreinte venant d’ailleurs (d’un pair, par exemple), collez-la sous
**Comparer avec une autre empreinte** et cliquez sur **Comparer** :

| Résultat | Signification |
|---|---|
| **IDENTIQUE** | Les deux archives ont un contenu identique. |
| **DIFFÉRENT** | Ce n’est pas le cas. |
| **INVALID_FINGERPRINT** | Ce que vous avez collé n’est pas une empreinte SHA-256 de 64 caractères. |

Une correspondance signifie seulement que les contenus sont identiques,
pas qu’ils sont corrects, et rien ici n’indique quelle archive est la plus
récente.

## Références entre publications

Enregistrer qu’une identité de publication en désigne une autre.

**Références entre publications → Afficher les références** ouvre un
formulaire : choisissez la **Publication source (celle qui fait la
référence)** et la **Publication référencée (celle qui est désignée)**
parmi vos identités de publication Bitcoin et Base connues (par exemple
« Bitcoin — a1b2…c3d4 — contenu 9f8e… »), puis cliquez sur **Enregistrer
la référence**. Une publication ne peut pas se référencer elle-même. Les
références ne sont jamais faites que par vous ; rien n’en crée
automatiquement, et les forks faits ailleurs dans l’application non plus.

Une référence n’est délibérément pas appelée un fork : elle enregistre
que le pointeur existe, pas ce qu’il signifie (un fork, une citation, une
réponse).

Les références enregistrées sont listées de la plus ancienne à la plus
récente, avec la chaîne, l’identité abrégée et le hash de contenu des deux
côtés, et la date d’enregistrement. Les doublons sont conservés comme des
références distinctes.

Le **Graphe des références entre publications** regroupe ces mêmes
références par publication : les totaux d’**Arêtes**, de **Publications**,
de **Sources distinctes** et de **Référencées distinctes**, et pour chaque
publication ses **Références sortantes** et **Références entrantes**, qui
se déplient pour montrer les références individuelles. Les décomptes ne
sont pas un classement.

## Succès

Une identité de publication obtient un badge dès qu’elle franchit un
seuil ; il n’y a rien à réclamer.

**Succès → Afficher les succès** liste les badges obtenus jusqu’ici :

| Badge | Icône | Obtenu quand |
|---|---|---|
| Première publication | 🏆 | Votre premier enregistrement de publication d’ancre Bitcoin ou Base. |
| Éditeur Bitcoin | ₿ | Votre premier sur Bitcoin. |
| Éditeur Base | 🔵 | Votre premier sur Base. |
| Éditeur multi-chaînes | 🌐 | Des enregistrements sur plus d’une chaîne. |
| Dix publications | 🔟 | Votre 10e, Bitcoin et Base confondus. |
| Cent publications | 💯 | Votre 100e. |

Cliquez sur un badge pour voir sa **Publication source** (chaîne, hash du
contenu, référence dans la chaîne, date de création) et, si disponible,
**Voir le cycle de vie de la publication ci-dessus**, qui mène au cycle de
vie de cet enregistrement.

Cinq autres succès viennent des références et n’ont pas encore de badge :
**Première référence créée**, **Première référence reçue**, **Référencée
par 10 publications**, **Référencée par 100 publications** et **Première
référence entre chaînes** (entre une publication Bitcoin et une
publication Base). Ils sont listés par leur nom dans **Profil de succès**,
où vous choisissez une identité de publication et voyez son nombre de
succès et leur liste complète, chacun avec sa date d’obtention.

Les succès appartiennent aux identités de publication, pas aux
personnes : rien ici ne relie une publication à une personne.

## Retiré : classements, réconciliation et étiquettes d’éditeur

Les versions précédentes avaient des pages de Classement : un classement des
éditeurs, des déclarations d’instantané d’éditeur signées, un espace et un
classement de réconciliation, et la comparaison d’exports de preuves.
ForkBuild ne classe pas les personnes et ne tient pas de scores
([Piliers](../../Pillars.md#what-we-are-not-making)), ils ont donc été retirés. Un ancien lien vers l’une de ces
pages ouvre l’Accueil. Une archive enregistrée quand elles existaient se
charge et s’importe toujours, avec tous ses autres enregistrements ; les
déclarations de classement et les décisions de réconciliation qu’elle
contenait sont abandonnées.

Les Associations d’éditeurs, qui étiquetaient vos publications d’un nom
d’éditeur pour ces pages, ont aussi été retirées. Les étiquettes que
contenait une archive sont abandonnées de la même façon.
