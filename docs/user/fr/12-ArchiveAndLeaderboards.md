<!-- translation-of: docs/user/12-ArchiveAndLeaderboards.md source-hash: 6f86f5609d7f2b27 -->
# 12 — Archive et classements

<!-- languages -->
[English](../12-ArchiveAndLeaderboards.md) · [Deutsch](../de/12-ArchiveAndLeaderboards.md) · [Español](../es/12-ArchiveAndLeaderboards.md) · **Français** · [Bahasa Indonesia](../id/12-ArchiveAndLeaderboards.md) · [日本語](../ja/12-ArchiveAndLeaderboards.md) · [한국어](../ko/12-ArchiveAndLeaderboards.md) · [Português (Brasil)](../pt-BR/12-ArchiveAndLeaderboards.md)
<!-- /languages -->

> **Expérimental.** Tout ce qui est ici peut changer ou être retiré dans
> une version ultérieure, et ce que cela produit pourrait ne pas être
> conservé. Sur la page Publications, le panneau **Portefeuille, archives
> et outils d’éditeur** porte un badge **Expérimental** ; les pages de
> Classement affichent un bandeau **Expérimental**.

Les outils Bitcoin, Base et IPFS de
[Preuves et stockage](11-EvidenceAndStorage.md) enregistrent ce qu’ils
observent dans une archive durable sur cet appareil. Ce guide présente
cette archive et ce qui s’appuie dessus : les références entre
publications, les succès, les étiquettes d’éditeur et les pages de
Classement.

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

## Identité d’éditeur

**Associations d’éditeurs** vous permet d’étiqueter des publications avec
un nom d’éditeur, sur votre seule parole, pour les cartes d’éditeur et le
classement ci-dessous.

Un identifiant d’éditeur est une simple étiquette auto-déclarée, pas une
identité vérifiée ni une connexion. La correspondance est exacte :
`Alice`, `alice` et `ALICE` sont trois éditeurs. Rien n’est déduit des
portefeuilles, du contenu ou des noms.

**Afficher les associations d’éditeurs**, puis :

1. **Identifiant de l’éditeur** — saisissez une étiquette, ou choisissez
   une étiquette déjà utilisée.
2. **Publication** — choisissez l’une de vos identités de publication
   Bitcoin ou Base.
3. **Ajouter la publication** — enregistre l’association.

**Associations enregistrées** les liste, de la plus ancienne à la plus
récente. **Publications associées à un éditeur** affiche toutes les
publications d’un éditeur choisi, avec le hash du contenu et la date
d’association.

Trois cartes de la page [Classement](#page-classement) s’appuient sur ces
associations, chacune avec sa propre liste déroulante **Choisir un
éditeur** :

| Carte | Affiche |
|---|---|
| **Profil de succès de l’éditeur** | Tous les succès obtenus par toute publication que l’éditeur revendique, et quelle publication l’a obtenu. |
| **Badges de succès de l’éditeur** | La même chose, limitée aux succès qui ont un badge, chacun renvoyant à son cycle de vie sur la page Publications. |
| **Statistiques de succès de l’éditeur** | Le nombre de publications associées, de succès, de types de succès, de badges et de types de badges, de publications par chaîne et de succès par type. |

Sans encore aucune association, chaque carte le signale et renvoie vers
les Associations d’éditeurs. Elles indiquent ce qu’un éditeur
*revendique*, pas qui contrôle une publication, et aucune ne classe qui
que ce soit.

## Page Classement

La page **Classement** (`/leaderboard`) donne accès aux pages ci-dessous,
plus les trois cartes d’éditeur ci-dessus. Elle n’est pas dans la barre du
haut : ouvrez-la depuis le lien **Classement** sous la carte **Archive des
publications** de la page Publications.

### Classement des performances des éditeurs

`/publisher-leaderboard` classe les éditeurs selon ce que cet appareil a
enregistré : **Rang**, **Éditeur**, **Succès**, **Types de succès** et
**Publications**, recalculés à chaque ouverture de la page et jamais
enregistrés. Un éditeur apparaît dès que vous lui avez associé une
publication. Les noms sont vos propres étiquettes, pas des identités
vérifiées.

### Déclaration d’instantané d’éditeur

`/publisher-snapshot-claim` signe une déclaration portant sur votre
instantané de classement actuel, pour qu’un pair puisse s’y comparer. Vous
devez être connecté.

1. **Générer et signer la déclaration** — calcule votre instantané et
   signe une déclaration à son sujet. Affiche le signataire et les
   empreintes des preuves, de la règle et de l’instantané.
   **Recommencer** l’abandonne.
2. **Exporter la déclaration** — affiche la déclaration en JSON avec un
   lien **Télécharger la déclaration**, à coller dans
   l’[Espace de réconciliation](#espace-de-réconciliation) d’un pair ou à
   envoyer sous forme de fichier.

### Espace de réconciliation

`/reconciliation-workspace` : collez la déclaration exportée d’un pair
dans **JSON de la preuve du pair** et cliquez sur **Réconcilier**. Cela
compare la déclaration avec votre archive et, quand cela fait apparaître
un candidat de réconciliation, enregistre une décision et une observation
de revalidation dans votre archive et propose **Voir dans le
classement**. S’il n’y a rien à réconcilier, cela dit pourquoi.
**Effacer le résultat** fait disparaître le résultat.

### Classement des candidats de réconciliation

`/reconciliation-leaderboard` est en lecture seule. Il montre, pour
chaque candidat de réconciliation, les preuves que contient votre
archive, éventuellement comparées à l’archive d’un pair.

Un **candidat** est un endroit où une déclaration de preuve externe et un
enregistrement de Snapshot local pour le même contenu ont été comparés :

| Libellé du candidat | Signification |
|---|---|
| **Déclaration *X* ↔ Snapshot nº *N*** | Une déclaration et un snapshot qui ont été comparés et ont divergé. |
| **Déclaration *X* (pas de Snapshot correspondant)** | Une déclaration sans snapshot à comparer. |
| **Snapshot nº *N* (pas de Déclaration correspondante)** | Un snapshot sans déclaration à comparer. |

Les candidats viennent de l’Espace de réconciliation. Tant que vous n’y
avez pas réconcilié la déclaration d’un pair, la page affiche « Aucun
candidat de réconciliation à afficher ».

**Colonnes.** **Preuves de décision** (un choix enregistré du côté auquel
on a fait confiance) et **Preuves d’observation** (une revérification
ultérieure de cette décision) ont chacune trois décomptes : **Commun**
(les deux archives l’ont), **Source uniquement** (seulement la vôtre) et
**Cible uniquement** (seulement celle du pair). Les lignes apparaissent
dans l’ordre où elles ont été trouvées, pas selon la quantité de preuves ;
ce n’est pas un classement.

**Comparer avec un pair.** Collez l’export d’archive d’un pair dans
**Archive du pair** et cliquez sur **Utiliser comme archive du pair**. Un
collage invalide est refusé. Sans archive de pair, tout compte comme
Source uniquement. Une ligne au-dessus du tableau indique dans quel cas
vous êtes :

| Bandeau | Signification |
|---|---|
| *Aucune archive de pair fournie — chaque décompte ci-dessous ne reflète que cette réplique.* | Pas encore d’archive de pair. |
| *Une archive de pair a été fournie, mais elle ne contient aucune preuve enregistrée — chaque décompte ci-dessous ne reflète encore que cette réplique.* | Une vraie archive, mais vide. |
| *Comparaison avec une archive de pair fournie.* | Une vraie comparaison. |

**Inspecter les preuves** (puis **Masquer les preuves**) sur une ligne
liste les enregistrements de décision et d’observation derrière ses
décomptes, répartis en Commun, Source uniquement et Cible uniquement.
Chaque observation affiche l’empreinte du plan par rapport auquel elle a
été vérifiée (comme `plan abcdef012345…`) et si le candidat était
**présent** et **correspond au plan**, tels qu’enregistrés. Des
enregistrements qui se ressemblent restent séparés.

**Filtre des preuves.** Deux listes déroulantes restreignent ce qui est
affiché : **Type de preuve** (**Tout**, **Décisions**, **Observations**)
et **Relation entre répliques** (**Tout**, **Commun**, **Source
uniquement**, **Cible uniquement**). Une ligne reste si elle a des preuves
de ce type dans cette relation. Avec **Relation entre répliques** sur
**Tout**, rien n’est filtré ; avec **Type de preuve** sur **Tout**, une
ligne correspond si l’un ou l’autre type a la relation choisie. Le filtre
restreint aussi la liste Inspecter les preuves de chaque ligne. Il ne fait
que masquer des lignes et des enregistrements ; les décomptes d’une ligne
ne changent jamais.

**Export des preuves.** **Exporter les preuves** produit un document JSON
de exactement ce que montre le filtre, en enregistrant l’état de
comparaison et le filtre utilisés, avec un lien **Télécharger l’export des
preuves** (`reconciliation-candidate-leaderboard-evidence-export.json`).
Rien n’est envoyé. **Comparer des preuves exportées** ouvre la
[Comparaison d’exports de preuves](#comparaison-dexports-de-preuves).

**Importer un export de preuves.** Collez un export (le vôtre ou celui
d’un pair) et cliquez sur **Importer les preuves** pour voir son état de
comparaison et ses décomptes de candidats, de décisions et
d’observations. Un collage invalide est refusé et le résumé précédent
conservé. **Effacer les preuves importées** le fait disparaître. Cela
n’affecte pas le tableau ci-dessus.

La page lit votre archive une fois à l’ouverture ; rouvrez-la pour voir
les nouveaux enregistrements. L’archive du pair, le filtre, les lignes
ouvertes et le résumé importé ne sont pas enregistrés.

## Comparaison d’exports de preuves

`/evidence-export-comparison` compare deux exports de preuves entre eux —
par exemple celui de la semaine dernière et celui d’aujourd’hui, ou le
vôtre et celui d’un pair. Elle ne lit pas votre archive et n’affecte pas
le classement.

Collez les deux documents dans **Export de preuves source** et **Export
de preuves cible** et cliquez sur **Comparer les preuves**. Un côté
invalide est refusé seul ; l’autre côté est conservé. **Effacer la
comparaison** vide la page.

- **État de la comparaison et Filtre** affichent l’état de comparaison
  et le filtre enregistrés de chaque document, et s’ils sont identiques.
- Trois tableaux — **présence des candidats**, **preuves de décision** et
  **preuves d’observation** — comptent chacun Source uniquement, Commun et
  Cible uniquement, et ne sont jamais combinés.
- **Inspecter les enregistrements** (puis **Masquer les
  enregistrements**) liste les enregistrements derrière les décomptes d’un
  tableau. Sur un enregistrement de décision ou d’observation,
  **Inspecter l’identité** affiche les champs qui l’identifient :

| Enregistrement | Champs d’identité |
|---|---|
| Décision | `decided`, `candidate`, `decision`, `decidedAt` |
| Observation | `candidate`, `decision`, `planIdentity`, `candidatePresent`, `candidateType`, `candidateMatchesPlan`, `observedAt` |

**Appariement explicite des enregistrements.** Pour comparer deux
enregistrements précis, choisissez un enregistrement source et un
enregistrement cible (dans n’importe quelle partition) pour les décisions
ou les observations et cliquez sur **Ajouter la paire** ; **Retirer**
retire une paire. Rien n’est apparié automatiquement, et la même paire
peut être ajoutée deux fois. Sous **Différences entre enregistrements
appariés**, chaque **Paire de décision *N*** ou **Paire d’observation
*N*** indique combien de champs d’identité diffèrent (ou **Aucune
différence**) ; **Inspecter les différences** les nomme, ou indique
**Identiques sur chaque champ nommé**. Elle ne dit jamais quel côté a
raison.

Rien sur cette page n’est enregistré ni envoyé nulle part ; un
rechargement l’efface.
