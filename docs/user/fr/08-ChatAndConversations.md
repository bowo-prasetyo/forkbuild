<!-- translation-of: docs/user/08-ChatAndConversations.md source-hash: 406b0d8076916c27 -->
# 08 — Chat et conversations

<!-- languages -->
[English](../08-ChatAndConversations.md) · [Deutsch](../de/08-ChatAndConversations.md) · [Español](../es/08-ChatAndConversations.md) · **Français** · [Bahasa Indonesia](../id/08-ChatAndConversations.md) · [日本語](../ja/08-ChatAndConversations.md) · [한국어](../ko/08-ChatAndConversations.md) · [Português (Brasil)](../pt-BR/08-ChatAndConversations.md)
<!-- /languages -->

La messagerie directe de ForkBuild fonctionne de pair à pair et est
**réservée aux amis** — voir
[Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md) pour
devenir d’abord ami avec quelqu’un.

## Démarrer une conversation

On accède au chat par le bouton **Discuter** d’un ami sur la page
**Pairs**, ou par la page **Conversations** de la barre du haut — il n’y a
pas d’accès au chat depuis la Vue du Monde ou un avatar. Ouvrir le chat
avec quelqu’un qui n’est pas actuellement votre ami (ou qui est bloqué)
affiche une explication au lieu d’une zone de saisie : c’est l’amitié, et
non le fait d’être en ligne, qui débloque le chat.

## La page Conversations

Elle liste toutes les personnes qui méritent d’y figurer — toute personne
avec qui vous avez une relation mémorisée, une amitié (y compris une
demande en attente) ou un historique de messages, triées par activité la
plus récente. Chaque ligne affiche :

- Son nom affiché et un badge **En ligne / Hors ligne**
- Votre relation — Ami, Demande d’ami en attente, Pair connu, ou Jamais
  connecté auparavant
- Le nombre de messages non lus, et « N messages en attente d’envoi » s’il
  y en a en file d’attente
- L’heure de la dernière activité

Seuls les amis actuels que vous n’avez pas bloqués ont un bouton **Ouvrir
le chat** ; la ligne des autres vous renvoie plutôt vers Pairs. Un ami que
vous avez bloqué affiche « ⛔ Bloqué — débloquez depuis Pairs pour
discuter de nouveau. » à la place du bouton, et la ligne se met à jour dès
que vous le bloquez ou le débloquez.

## La vue du chat

Une seule transcription défilante entre vous et un ami : des bulles de
messages étiquetées « Vous » ou par son nom, chacune avec un horodatage,
et une zone de saisie en dessous (jusqu’à 4 000 caractères). Cliquez sur
**Afficher les détails** pour un petit panneau indiquant son identité,
votre relation, l’amitié, l’état de la connexion en direct, et le nombre
de messages et de messages en attente. Il n’y a ni indicateur de saisie,
ni modification, ni suppression, ni réactions, ni pièces jointes, ni chat
de groupe — ce sont délibérément de simples messages.

## Appels vocaux

Un bouton **📞 Appeler** se trouve à côté de la zone de saisie dès qu’au
moins un des appareils actuellement joignables de cet ami prend en charge
la voix — inutile de savoir lequel de ses appareils décrochera réellement ;
appeler vise son identité, pas une connexion en particulier.

- Cliquez sur **Appeler** pour passer un appel — vous voyez **Appel en
  cours…** jusqu’à ce qu’il réponde.
- Du côté de celui qui reçoit, un appel entrant affiche **Accepter** /
  **Refuser**.
- Une fois connecté, la barre affiche **En communication** plus **Couper
  le micro** / **Réactiver le micro**, et — dès que votre microphone est
  réellement branché — des sélecteurs pour le **Microphone** et (si votre
  navigateur le permet) le **Haut-parleur** à utiliser.
- Le bouton de fin affiche **Annuler** tant que vous attendez qu’il
  décroche, et **Raccrocher** une fois que vous parlez vraiment.

Vous êtes limité à un appel à la fois sur tout cet appareil — le bouton
Appeler est désactivé pour toutes les autres personnes pendant que vous
êtes en communication. Si votre microphone disparaît en cours d’appel
(débranché, autorisation retirée), un petit bandeau le signale ; l’appel
lui-même continue, au cas où il se reconnecterait.

Un appel qui se termine avant d’être établi explique brièvement pourquoi :

| Message | Signification |
|---|---|
| **Appel refusé.** | Il a cliqué sur Refuser. |
| **Cette personne est déjà en communication.** | Il est occupé ailleurs. |
| **Pas de réponse.** | Personne n’a décroché à temps. |
| **Impossible d’accéder à votre microphone.** | Votre navigateur a refusé l’accès au microphone ou ne l’a pas. |
| **L’appel n’a pas pu être établi.** | Un échec au niveau de la connexion — mieux vaut réessayer. |

Un raccrochage ordinaire (le vôtre ou le sien) n’affiche aucun message —
la barre d’appel qui disparaît dit tout.

## Envoyer pendant que quelqu’un est hors ligne

Vous pouvez envoyer un message à un ami hors ligne — il n’a pas besoin
d’être connecté. Le message est mis en file d’attente localement et remis
automatiquement la prochaine fois que vous êtes tous deux connectés ;
inutile de le renvoyer vous-même. Aucun serveur ne le garde entre-temps,
il attend donc sur *votre* appareil : ForkBuild doit être ouvert des deux
côtés en même temps pour qu’il passe. Un message toujours non remis après
7 jours est abandonné et marqué **Non remis — expiré**. Chaque message
envoyé affiche son propre état sous la bulle :

| État | Signification |
|---|---|
| **En file d’attente — sera envoyé à la reconnexion** | En attente de sa connexion |
| **Envoyé** | Transmis au réseau — pas encore confirmé comme arrivé |
| **Remis** | Arrivée confirmée sur son appareil |
| **Non remis — expiré** | Jamais remis à temps et abandonné |
| **Vu** | Il a ouvert la conversation et lu jusqu’à ce message |

**Vu** est entièrement automatique — il n’y a pas de bouton « marquer
comme lu ». Le simple fait d’ouvrir ou d’actualiser une conversation
indique à l’expéditeur que vous l’avez lue.

## Votre historique

Les conversations sont enregistrées localement sur cet appareil et
reprennent exactement où vous en étiez après un rechargement — messages,
états de remise et tout le reste. Cet historique est **propre à cet
appareil** : il ne vous suit pas sur un autre navigateur ou un autre
ordinateur, et il n’en existe aucune copie sur un serveur. Chaque
conversation garde ses 500 messages les plus récents ; les plus anciens
disparaissent discrètement pour limiter le stockage.

Retirer quelqu’un de vos amis ou le bloquer arrête immédiatement le chat,
même si la connexion sous-jacente est techniquement encore active — pas
besoin d’une étape « déconnecter » séparée.

## Et ensuite ?

Retournez à **[Connexions entre pairs et amis](07-PeerConnectionsAndFriends.md)**
pour trouver d’autres personnes avec qui construire et discuter, ou
revenez à **[la Vue du Monde](03-WorldView.md)** pour voir où vivent les
créations de chacun.
