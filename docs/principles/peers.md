# Principles: Peers, friends, chat and voice

Each rule links to its full text in [the history](../Principles.md#history).

### A Peer Connection Authenticates A Key, Not An Account (0.2.49)

The peer handshake answers one question: does the other end of this
connection hold the private key for identity X? It never answers whether
this is the same person as yesterday, a real human, or someone to trust.
A successful handshake produces a `PeerIdentity`, a proven key and
nothing more.

[Full text](history/0.1-0.2.md#a-peer-connection-authenticates-a-key-not-an-account-0249)

### A Peer Authentication Signature Is Scoped To One Connection, Never To One Identity (0.2.49)

Every peer authentication signature covers the connection's own
`sessionNonce`, so it proves something only about one live connection
and is worthless once that connection ends. A genuine proof replayed
into a new connection fails.

[Full text](history/0.1-0.2.md#a-peer-authentication-signature-is-scoped-to-one-connection-never-to-one-identity-0249)

### Transport State And Authentication State Are Two Different Questions (0.2.49)

Connection state and authentication state are separate enums. A
connection can be open before any handshake starts, and a failed
handshake leaves the transport open for the caller to decide what to do.
Only one link is automatic: a closed or failed connection resets
authentication.

[Full text](history/0.1-0.2.md#transport-state-and-authentication-state-are-two-different-questions-0249)

### An Invitation Is A Rendezvous Hint, Never A Credential (0.2.50)

An invitation says where Bob might be reachable, never "this is Bob". It
is unsigned, and the handshake never reads its `identityHint`, so
copying or tampering with one gains nothing. Only a verified proof
establishes an identity.

[Full text](history/0.1-0.2.md#an-invitation-is-a-rendezvous-hint-never-a-credential-0250)

### Discovery Finds A Candidate; It Never Authenticates One (0.2.50)

Discovery answers which endpoint is worth trying. Whether the candidate
is who it claims is decided by the handshake on a real connection, every
time. No discovery type carries a validity or trust flag.

[Full text](history/0.1-0.2.md#discovery-finds-a-candidate-it-never-authenticates-one-0250)

### A Peer's Lifecycle Is Derived, Never A Third State Machine (0.2.50)

The DISCOVERED to AUTHENTICATED lifecycle a UI shows is never stored.
`derivePeerLifecycleState()` recomputes it on each call from the real
connection and authentication states, so it can never disagree with
them.

[Full text](history/0.1-0.2.md#a-peers-lifecycle-is-derived-never-a-third-state-machine-0250)

### A Peer Alias Is A Local Note, Never A Claim About The Peer (0.2.50)

An alias on a connected peer is a local, in-memory label. It is never
signed, sent or stored, and it disappears when the connection closes.

[Full text](history/0.1-0.2.md#a-peer-alias-is-a-local-note-never-a-claim-about-the-peer-0250)

### A Signaling Payload Is Not An Identity Proof (0.2.51)

WebRTC offers and answers only carry session descriptions and
candidates. They are unsigned, and the handshake never reads anything
from the signaling layer, so replaying an offer proves nothing.

[Full text](history/0.1-0.2.md#a-signaling-payload-is-not-an-identity-proof-0251)

### A Transport Connection Is Never An Authenticated Peer (0.2.51)

`WebRtcPeerConnection` knows how bytes move and carries no identity at
all. A `PeerIdentity` exists only after the handshake verifies a proof,
and it disappears when the connection closes, however real the network
connection feels.

[Full text](history/0.1-0.2.md#a-transport-connection-is-never-an-authenticated-peer-0251)

### A Peer Connection Transports Messages; It Does Not Interpret Them (0.2.52)

Connections move opaque objects. `PeerMessageBus` routes on the
`protocol` string and hands the payload to subscribers unopened; it
never branches on a specific protocol, so adding a protocol never
touches the bus.

[Full text](history/0.1-0.2.md#a-peer-connection-transports-messages-it-does-not-interpret-them-0252)

### A Peer Message Envelope Carries Routing Information, Never Meaning (0.2.52)

`messageId`, `protocol` and `version` on an envelope serve the bus only.
`messageId` exists for duplicate suppression and implies no order;
`version` is carried opaquely for the protocol's own use.

[Full text](history/0.1-0.2.md#a-peer-message-envelope-carries-routing-information-never-meaning-0252)

### Replay Semantics Belong To The Protocol, Never The Bus (0.2.52)

The bus's duplicate suppression is a small, bounded, per-connection
window against redelivered bytes: transport hygiene, not a security
boundary. Staleness, replay and freshness decisions belong to each
protocol's own trust code.

[Full text](history/0.1-0.2.md#replay-semantics-belong-to-the-protocol-never-the-bus-0252)

### A Transport Migration Should Leave The Trust Model Untouched (0.2.53)

The peer presence transport implements the same broadcast interface as
the local one, so moving presence onto peer connections changed none of
the presence ingestion, trust, replay, equivocation or freshness code.

[Full text](history/0.1-0.2.md#a-transport-migration-should-leave-the-trust-model-untouched-0253)

### Peer Selection Is A Transport Concern, Never A Presence-Core Concern (0.2.53)

The presence advertisement carries no recipient or visibility list, and
`publish()` does not know who receives it. The peer transport asks the
visibility policy once per authenticated peer, immediately before
sending to that peer.

[Full text](history/0.1-0.2.md#peer-selection-is-a-transport-concern-never-a-presence-core-concern-0253)

### Presence Never Establishes A Connection (0.2.53)

Receiving presence never triggers a connection. The order is one-way:
discovery finds a candidate, a connection opens, authentication proves
who is there, and only then can presence or any other protocol travel
over it.

[Full text](history/0.1-0.2.md#presence-never-establishes-a-connection-0253)

### Profile Visibility Is Never Presence Visibility (0.2.54)

Who may see my presence and who may see my appearance are separate
policies (`AvatarProfileVisibilityPolicy` and
`PresenceVisibilityPolicy`), never one object reused. "Presence PUBLIC,
profile FRIENDS" and the reverse must both be expressible.

[Full text](history/0.1-0.2.md#profile-visibility-is-never-presence-visibility-0254)

### A Protocol's State-Keeping Semantics Are Its Own, Never Borrowed From Its Neighbor (0.2.54)

Protocols sharing the bus each decide what a receiver keeps: presence
keeps the latest ephemeral state, profiles keep the latest durable
appearance, and interactions keep no state, only events. None borrows
another's rules because they happen to share an implementation.

[Full text](history/0.1-0.2.md#a-protocols-state-keeping-semantics-are-its-own-never-borrowed-from-its-neighbor-0254)

### A Peer Session Manager Owns Connections, Never What Travels Over Them (0.2.55)

`PeerSessionManager` turns an invitation into an authenticated
`ConnectedPeer` and stops there. It never sends application messages or
touches presence, profiles or avatars, and does not depend on the
message bus.

[Full text](history/0.1-0.2.md#a-peer-session-manager-owns-connections-never-what-travels-over-them-0255)

### An Authenticated Peer Is Not A Friend (0.2.55)

A live authenticated connection is ephemeral and the UI never implies
otherwise: it says "Ephemeral", never "Trusted" or "Saved", and offers
nothing that outlives the connection.

[Full text](history/0.1-0.2.md#an-authenticated-peer-is-not-a-friend-0255)

### A Peer Relationship Remembers An Identity, Never An Endpoint (0.2.56)

A `PeerRelationship` stores the identity, public key, algorithm, alias,
status and timestamps, never an endpoint or connection id, so it can
never be used to skip a fresh handshake. `rememberPeer()` accepts only a
`PeerIdentity` produced by a completed handshake, never an invitation
hint.

[Full text](history/0.1-0.2.md#a-peer-relationship-remembers-an-identity-never-an-endpoint-0256)

### Remembering A Peer Is A Deliberate Act, Never A Side Effect Of Authentication (0.2.56)

Authentication never remembers a peer automatically. Adding someone to
Known Peers is a person's decision, and the "Remember" button is the
only call site.

[Full text](history/0.1-0.2.md#remembering-a-peer-is-a-deliberate-act-never-a-side-effect-of-authentication-0256)

### Forgetting A Peer Deletes A Local Record, Never The Peer (0.2.56)

`forgetPeer()` removes one local record and sends nothing. The peer's
identity, profile, publications and documents are untouched, and an open
connection is not closed.

[Full text](history/0.1-0.2.md#forgetting-a-peer-deletes-a-local-record-never-the-peer-0256)

### Knowing Is Not Befriending (0.2.56)

`KNOWN` means only that this device authenticated an identity once and
chose to keep a note. It is unilateral and says nothing about mutual
consent; friendship is a separate concept.

[Full text](history/0.1-0.2.md#knowing-is-not-befriending-0256)

### Friendship Is Mutual Consent, Never A Unilateral Claim (0.2.57)

`deriveFriendshipState()` returns FRIEND only for a signed REQUEST
answered by a signed ACCEPT from the other identity. Two crossing
requests without an accept are still REQUESTED: asking is not agreeing.

[Full text](history/0.1-0.2.md#friendship-is-mutual-consent-never-a-unilateral-claim-0257)

### A Friend Request Is Signed Evidence, Never A Server Record (0.2.57)

No server can say "Bob accepted". Only Bob's signature can, arriving
over a connection he has authenticated. Friendship advertisements must
be signed, and unsigned ones are refused outright, unlike presence
claims, which only become less trusted.

[Full text](history/0.1-0.2.md#a-friend-request-is-signed-evidence-never-a-server-record-0257)

### A Social Relationship Grants Eligibility; A Visibility Policy Grants Access (0.2.58)

Being friends reveals nothing by itself. Visibility policies may use
`isFriend` as an input, but PUBLIC still reaches everyone and HIDDEN
still hides from friends. Friendship is an input to policy, never a
bypass.

[Full text](history/0.1-0.2.md#a-social-relationship-grants-eligibility-a-visibility-policy-grants-access-0258)

### A Visibility Policy Consults A Fact, Never A Store (0.2.58)

Visibility policies import nothing about friendship. The caller computes
a plain `isFriend` (or `hasFriend`) value and passes it in; the
transport receives a predicate from the wiring layer.

[Full text](history/0.1-0.2.md#a-visibility-policy-consults-a-fact-never-a-store-0258)

### FRIENDS Means Mutual Friendship OR An Explicit Grant, Never Either Alone (0.2.58)

FRIENDS visibility reaches mutual friends or identities on the explicit
allow-list. A weaker relationship, such as REQUESTED or KNOWN, never
qualifies.

[Full text](history/0.1-0.2.md#friends-means-mutual-friendship-or-an-explicit-grant-never-either-alone-0258)

### The Sender's Own Friendship Record Decides, Never The Receiver's (0.2.58)

The sender asks its own friendship record about the peer's proven
identity. Nothing a peer sends can claim friendship or change the
sender's policy.

[Full text](history/0.1-0.2.md#the-senders-own-friendship-record-decides-never-the-receivers-0258)

### Profile Gets Its Own Publication Gate, Superseding The Shared One (0.2.58)

Profile publishing now consults its own
`AvatarProfileVisibilityUseCase`, independent of presence visibility.
"Presence HIDDEN, profile PUBLIC" and the reverse are both real
configurations.

[Full text](history/0.1-0.2.md#profile-gets-its-own-publication-gate-superseding-the-shared-one-0258)

### Withholding A Future Advertisement Is Not Remote Deletion (0.2.58)

Narrowing visibility stops future advertisements from reaching a peer.
It cannot make a peer forget one it already accepted; there is no remote
wipe.

[Full text](history/0.1-0.2.md#withholding-a-future-advertisement-is-not-remote-deletion-0258)

### Friendship Persists Across A Connection; Its Eligibility Is Re-Proven On Every One (0.2.58)

Friendship is keyed on identity, never on a connection. After a
reconnect the handshake proves the same identity again and the
friendship predicate is consulted fresh; there is no special reconnect
path or re-request.

[Full text](history/0.1-0.2.md#friendship-persists-across-a-connection-its-eligibility-is-re-proven-on-every-one-0258)

### A Transport Migration Is Complete Only Once Something Actually Uses It (0.2.59)

A capability that is built and tested but never reached by the running
application is a rehearsal, not a shipped feature. 0.2.59 wired the peer
transport into World View without adding new capability.

[Full text](history/0.1-0.2.md#a-transport-migration-is-complete-only-once-something-actually-uses-it-0259)

### Once A Peer Is Authenticated, Avatar State Travels Through It, Never Around It (0.2.59)

Presence, profile and interaction all travel over the same authenticated
connection and message bus, each gated by its own visibility policy,
never over a parallel unauthenticated path. The same-origin
`BroadcastChannel` transport is a separate scope, not a peer connection.

[Full text](history/0.1-0.2.md#once-a-peer-is-authenticated-avatar-state-travels-through-it-never-around-it-0259)

### No Authenticated Peers Is A Population Of Zero, Never An Absent Transport (0.2.59)

Whether a peer transport exists is decided once, at construction. With
no authenticated peers it is still live and simply sends to nobody; when
a peer authenticates, the same transport starts reaching them.

[Full text](history/0.1-0.2.md#no-authenticated-peers-is-a-population-of-zero-never-an-absent-transport-0259)

### BroadcastChannel Is A Development Transport, Never A Production One (0.2.59)

The `BroadcastChannel` presence transport stays for demos and tests. The
running application always uses the real peer transport.

[Full text](history/0.1-0.2.md#broadcastchannel-is-a-development-transport-never-a-production-one-0259)

### Login Does Not Make Someone Globally Visible (0.2.59)

Logging in creates a local identity; authenticating a peer proves one
relationship; visibility policy decides what crosses each connection. At
no step does being logged in mean being broadcast to everyone.

[Full text](history/0.1-0.2.md#login-does-not-make-someone-globally-visible-0259)

### A Cyclic Consent Vocabulary Needs A Reference, Never Just A Type (0.2.60)

Once friendship can end and restart, an old ACCEPT could be replayed
against a new REQUEST, since actor, subject, action and sequence repeat.
Each consent message therefore references the specific message it
answers, not just its type.

[Full text](history/0.1-0.2.md#a-cyclic-consent-vocabulary-needs-a-reference-never-just-a-type-0260)

### Friendship Is Mutual Relationship State; Blocking Is A Unilateral Local Decision (0.2.60)

Friendship (`FriendshipRecord`) needs evidence from both sides. Blocking
(`PeerBlockRecord`) is one device's own decision about what it sends and
accepts, and the other side is never told. They live in separate stores,
so blocking a current friend never forces a choice between the two.

[Full text](history/0.1-0.2.md#friendship-is-mutual-relationship-state-blocking-is-a-unilateral-local-decision-0260)

### Blocking Is An Additional Local Authorization Gate, Never A Replacement For One (0.2.60)

Blocking is checked after a claim is known to be validly signed, never
instead of the usual checks, so a malformed claim from a blocked
identity is still reported as malformed. When sending, blocking is
checked before, not instead of, the visibility policy.

[Full text](history/0.1-0.2.md#blocking-is-an-additional-local-authorization-gate-never-a-replacement-for-one-0260)

### Blocking Is Wired Twice, Once Per Direction, Because Neither Side May Trust The Other To Enforce It (0.2.60)

The same `isBlocked` predicate gates both sending (never send to a
blocked peer) and receiving (never accept from a blocked signer).
Neither side can rely on the other to enforce a block.

[Full text](history/0.1-0.2.md#blocking-is-wired-twice-once-per-direction-because-neither-side-may-trust-the-other-to-enforce-it-0260)

### Blocking Is Silent — Never Announced To The Blocked Identity (0.2.60)

A block is never signed or sent. The blocked identity simply stops
hearing from you, and whatever it sends is dropped without any notice.

[Full text](history/0.1-0.2.md#blocking-is-silent--never-announced-to-the-blocked-identity-0260)

### Unblocking Restores Nothing But The Ability To Be Heard Again (0.2.60)

`unblock()` only removes the block record. Friendship stays exactly as
it already was, and nothing is re-sent.

[Full text](history/0.1-0.2.md#unblocking-restores-nothing-but-the-ability-to-be-heard-again-0260)

### Chat Is A Protocol Running Over Authenticated Peers, Never A Feature Of The Transport Itself (0.2.61)

Chat runs on its own namespaced channel (`forkbuild:chat`) over the
message bus; the bus and connections have no chat-specific code. Being
authenticated is necessary but never sufficient for a message to be
chat.

[Full text](history/0.1-0.2.md#chat-is-a-protocol-running-over-authenticated-peers-never-a-feature-of-the-transport-itself-0261)

### Friendship Authorizes A Protocol; It Is Never The Protocol (0.2.61)

Chat only asks `getState()` for friendship, fresh on every send and
every incoming message. The rule: authenticated, not blocked and FRIEND
means chat is allowed; anything else means it is not.

[Full text](history/0.1-0.2.md#friendship-authorizes-a-protocol-it-is-never-the-protocol-0261)

### An Authenticated Connection Surviving Unfriend/Block Does Not Mean Chat Survives It (0.2.61)

Unfriending or blocking never closes the connection. Chat stops at once
anyway, on both sending and receiving sides, because eligibility is
rechecked on every message.

[Full text](history/0.1-0.2.md#an-authenticated-connection-surviving-unfriendblock-does-not-mean-chat-survives-it-0261)

### A Chat Message's Identity, Its Sequence, And Its Delivery Order Are Three Different Facts (0.2.61)

`messageId` exists only for duplicate suppression. `sequence` only asks
whether a message is newer than the highest accepted from that sender in
that conversation; gaps are tolerated. Delivery order is assumed
nowhere.

[Full text](history/0.1-0.2.md#a-chat-messages-identity-its-sequence-and-its-delivery-order-are-three-different-facts-0261)

### A Reconnect Verifies An Identity; It Never Assumes One (0.2.62)

A reconnect passes `expectedIdentityId`, and the connection must first
authenticate normally. Only then is the proven identity compared with
the expected one; a new connection is never assumed to be the peer being
reconnected to.

[Full text](history/0.1-0.2.md#a-reconnect-verifies-an-identity-it-never-assumes-one-0262)

### A Rejected Reconnect Is Not A Failed Handshake (0.2.62)

A handshake failure means we still do not know who is there. An identity
mismatch means someone else proved exactly who they are. They are
reported differently, so a Reconnect UI can say which happened and who
answered.

[Full text](history/0.1-0.2.md#a-rejected-reconnect-is-not-a-failed-handshake-0262)

### Connection Incarnation Was Already Solved; 0.2.62 Only Named It (0.2.62)

Each connection already has a globally unique `connectionId` that keys
the registry and binds the handshake nonce, so stale events from an old
connection cannot affect a new one. No generation counter is needed.

[Full text](history/0.1-0.2.md#connection-incarnation-was-already-solved-0262-only-named-it-0262)

### Send Means Live Delivery; SendOrQueue Means Deliberate Durability (0.2.63)

`sendMessage()` still requires a live authenticated connection and fails
otherwise. `sendOrQueue()` is a separate operation, addressed to an
identity, that stores a durable outbox entry and tries to send it at
once.

[Full text](history/0.1-0.2.md#send-means-live-delivery-sendorqueue-means-deliberate-durability-0263)

### A Durable Outbox Is Addressed To An Identity, Never A Connection (0.2.63)

An outbox entry carries a `peerIdentityId`, never a connection id.
Flushing asks only whether that proven identity is authenticated right
now, so queued mail is never sent to someone else who answers a
reconnect.

[Full text](history/0.1-0.2.md#a-durable-outbox-is-addressed-to-an-identity-never-a-connection-0263)

### Sent Is Not Delivered (0.2.63)

QUEUED (in the outbox), SENT (accepted by the bus) and DELIVERED (a
delivery ack came back) are distinct states. Acks use their own wire
shape and protocol string, never folded into chat messages.

[Full text](history/0.1-0.2.md#sent-is-not-delivered-0263)

### The Outbox Prunes Itself; It Is Not A Message Database (0.2.63)

An outbox entry exists only while its message is in flight. It is
deleted when acknowledged or when its TTL expires (checked lazily on
read). The outbox never answers "what did we talk about".

[Full text](history/0.1-0.2.md#the-outbox-prunes-itself-it-is-not-a-message-database-0263)

### Discovery Is Untrusted Input; Only Authentication Answers Who (0.2.64)

Searching imported candidates by identity returns candidates, never
findings. Discovery, rendezvous and authentication are three stages, and
only authentication is authoritative. Connecting always passes the
identity searched for as `expectedIdentityId`.

[Full text](history/0.1-0.2.md#discovery-is-untrusted-input-only-authentication-answers-who-0264)

### A Discovery Record's Freshness Outlives Neither The Identity Nor The Relationship It Might Lead To (0.2.64)

A discovery record's expiry says only whether that endpoint is still
worth trying. An expired candidate never affects peer relationships or
friendships. Expiry is checked lazily on read.

[Full text](history/0.1-0.2.md#a-discovery-records-freshness-outlives-neither-the-identity-nor-the-relationship-it-might-lead-to-0264)

### Rediscovering A Candidate Refreshes It; It Never Duplicates It (0.2.64)

Re-importing the same candidate (same endpoint and identity hint)
refreshes the existing record. A different endpoint claiming the same
identity is kept as a separate record, never merged over the earlier
one.

[Full text](history/0.1-0.2.md#rediscovering-a-candidate-refreshes-it-it-never-duplicates-it-0264)

### A Discovery Source Describes Provenance, Never Trustworthiness (0.2.64)

A discovery `source` (invitation, LAN, rendezvous, distributed) is
metadata a UI may show. No source earns more trust than another.

[Full text](history/0.1-0.2.md#a-discovery-source-describes-provenance-never-trustworthiness-0264)

### Rendezvous Distributes Candidates; Authentication Establishes Identity (0.2.65)

Networked rendezvous changes nothing about who may say "this is Bob":
only the handshake, checked against `expectedIdentityId`. A rendezvous
node, even a real server, can only hand out candidates.

[Full text](history/0.1-0.2.md#rendezvous-distributes-candidates-authentication-establishes-identity-0265)

### A Rendezvous Publication Is Never A Permanent Directory Entry (0.2.65)

A rendezvous publication wraps an ordinary invitation and never outlives
it (its expiry is the stricter of the two). A node keeps at most one
live publication per identity; a new one replaces the old.

[Full text](history/0.1-0.2.md#a-rendezvous-publication-is-never-a-permanent-directory-entry-0265)

### A Rendezvous Lookup Degrades; It Never Fails Loud (0.2.65)

If the rendezvous network is unreachable, a lookup returns no fresh
results and falls back to the local cache instead of throwing. A single
malformed publication is skipped without aborting the rest.

[Full text](history/0.1-0.2.md#a-rendezvous-lookup-degrades-it-never-fails-loud-0265)

### A Bootstrap List Is Configuration, Never An Authority (0.2.65)

How to reach the rendezvous network at all is an explicit, editable list
of bootstrap providers, never a hard-coded authority. Callers depend
only on the discovery provider interface.

[Full text](history/0.1-0.2.md#a-bootstrap-list-is-configuration-never-an-authority-0265)

### Rendezvous Can Introduce An Endpoint; It Can Never Establish Identity (0.2.66)

A real network rendezvous transport is no more authoritative than the
in-memory one. Pointing Bob's identity at Charlie's genuine endpoint
gets an attacker nothing: Charlie authenticates as himself and the
reconnect check rejects him.

[Full text](history/0.1-0.2.md#rendezvous-can-introduce-an-endpoint-it-can-never-establish-identity-0266)

### A Rendezvous Transport Cannot Stay Synchronous (0.2.66)

A real network round trip needs `async`, so the rendezvous contract
became asynchronous and the change was carried up through each caller in
turn to the UI.

[Full text](history/0.1-0.2.md#a-rendezvous-transport-cannot-stay-synchronous-0266)

### A Rendezvous Publication's Signature Is Tamper-Evidence, Never Trust (0.2.66)

An optional signature lets a receiver discard a publication whose
signature does not verify or whose signer does not match its identity
hint. It never makes the endpoint trustworthy; authentication still
decides.

[Full text](history/0.1-0.2.md#a-rendezvous-publications-signature-is-tamper-evidence-never-trust-0266)

### STUN Is Free Public Infrastructure; TURN Is Transport Infrastructure, Never A Trusted Application Server (0.2.66)

Two public STUN servers ship by default, because STUN only reveals your
own public address. No TURN server ships by default: TURN relays real
traffic and needs operator-issued credentials. Neither is ever trusted
with identity.

[Full text](history/0.1-0.2.md#stun-is-free-public-infrastructure-turn-is-transport-infrastructure-never-a-trusted-application-server-0266)

### One Publication Answers At Most One Connection Attempt (0.2.66)

A published WebRTC offer can be found by many but completed by only one
peer, the first whose answer arrives. Later peers find the offer already
used.

[Full text](history/0.1-0.2.md#one-publication-answers-at-most-one-connection-attempt-0266)

### A Reload Continues A Conversation; It Never Starts A New One (0.2.69)

After a reload, each conversation is rebuilt from the durable
`ConversationStore`, in order, before any peer is attached. The
in-memory `LiveConversation` stays ephemeral; only what seeds it
changed.

[Full text](history/0.1-0.2.md#a-reload-continues-a-conversation-it-never-starts-a-new-one-0269)

### Sequence Continuity Is What Makes A Reload Actually Work, Not Merely Look Like It Works (0.2.69)

Outgoing sequence numbers are restored from stored history on reload.
Restarting at 1 would make the recipient's replay window silently reject
every new message.

[Full text](history/0.1-0.2.md#sequence-continuity-is-what-makes-a-reload-actually-work-not-merely-look-like-it-works-0269)

### A Durable Conversation Store Is Addressed To An Identity, Never A Connection (0.2.69)

Conversation entries carry a `peerIdentityId`, never a connection id, so
a reconnect that authenticates as someone else can never see or receive
another person's history.

[Full text](history/0.1-0.2.md#a-durable-conversation-store-is-addressed-to-an-identity-never-a-connection-0269)

### A Local History Store Is Never An Authorization Mechanism (0.2.69)

The conversation store is written only after the chat trust boundary has
accepted a message (or authorized a send). It performs no friendship,
block or replay checks and is never consulted to decide whether to
accept anything.

[Full text](history/0.1-0.2.md#a-local-history-store-is-never-an-authorization-mechanism-0269)

### Never Reuse A Durable Outbox As A Message Database, Or A Message Database As An Outbox (0.2.69)

The outbox answers "what have I sent that is not yet confirmed" and
prunes itself. The conversation store answers "what did we talk about"
and keeps every message up to a per-peer cap. They share no code and no
storage key.

[Full text](history/0.1-0.2.md#never-reuse-a-durable-outbox-as-a-message-database-or-a-message-database-as-an-outbox-0269)

### Idempotent Local Storage Is What Makes A Bounded, Resettable Replay Window Safe To Leave Alone (0.2.69)

The chat replay window stays in memory and resets on reload. A
retransmit accepted twice after a reset is harmless, because appending
to the conversation store is idempotent by `(peerIdentityId,
messageId)`.

[Full text](history/0.1-0.2.md#idempotent-local-storage-is-what-makes-a-bounded-resettable-replay-window-safe-to-leave-alone-0269)

### Offline Is Not Absence: Identity, Relationship, Friendship, And Conversation All Outlive The Connection (0.2.70)

When a connection closes, only the connection becomes false. The peer
relationship, friendship, conversation history and queued outbox all
survive, and none of those stores depends on the connection registry.

[Full text](history/0.1-0.2.md#offline-is-not-absence-identity-relationship-friendship-and-conversation-all-outlive-the-connection-0270)

### A Peer Presence Summary Reconciles Independent Lifetimes; It Is Never A Fourth Store (0.2.70)

`PeerPresenceUseCase` reads the connection registry, relationships,
friendships, conversations and outbox fresh on every call and stores
nothing, so the summary can never drift from its sources.

[Full text](history/0.1-0.2.md#a-peer-presence-summary-reconciles-independent-lifetimes-it-is-never-a-fourth-store-0270)

### A Read Marker Is A Local Note About What THIS Device Has Seen, Never A Receipt Sent To Anyone (0.2.70)

A `ConversationReadMarker` records what this device has seen. It is
never signed, never sent and never read by chat ingestion; the other
person cannot observe it.

[Full text](history/0.1-0.2.md#a-read-marker-is-a-local-note-about-what-this-device-has-seen-never-a-receipt-sent-to-anyone-0270)

### A Read Marker Answers A Third Question; It Is Never Folded Into The Outbox Or The History Store (0.2.70)

Outbox (not yet delivered), conversation store (what we said) and read
tracker (what I have seen) answer three different questions with
different retention, so they are three classes with three storage keys.

[Full text](history/0.1-0.2.md#a-read-marker-answers-a-third-question-it-is-never-folded-into-the-outbox-or-the-history-store-0270)

### A Read Receipt Is Computed Independently From The Local Read Marker, Never Transmitted From It (0.2.71)

`sendReadReceipt()` never reads the local read tracker. It recomputes
the highest incoming sequence from the conversation itself. The local
note and the network claim are two independent computations of one fact.

[Full text](history/0.1-0.2.md#a-read-receipt-is-computed-independently-from-the-local-read-marker-never-transmitted-from-it-0271)

### A Coalescing Outbox Remembers The Latest Value, Not Every Event (0.2.71)

"Read through sequence N" implies everything before N, so the
read-receipt outbox keeps at most one entry per peer and only advances
it. Ten reads while a peer is offline send one receipt.

[Full text](history/0.1-0.2.md#a-coalescing-outbox-remembers-the-latest-value-not-every-event-0271)

### A Read Marker And A Read Receipt Are Opposite-Direction Facts, Never The Same Store (0.2.71)

"What I have seen of their messages" (a local fact) and "what they say
they have seen of mine" (a received, trust-checked claim) have the same
shape but are separate classes and stores.

[Full text](history/0.1-0.2.md#a-read-marker-and-a-read-receipt-are-opposite-direction-facts-never-the-same-store-0271)

### Social Authorization Controls What May Happen Next; It Never Rewrites What Already Happened (0.2.72)

Blocking or unfriending affects the next send, message or reconnect. It
never changes history: delivered stays delivered, read stays read, and
the stores that record those facts are never written by block or
unfriend.

[Full text](history/0.1-0.2.md#social-authorization-controls-what-may-happen-next-it-never-rewrites-what-already-happened-0272)

### Queued Mail Answers To The Same Eligibility Check As A Fresh Send, Never A Softer One (0.2.72)

Queued mail must pass `canChat()` before it is sent, like a fresh
message. When eligibility is withdrawn, queued mail is cancelled at once
rather than waiting for a reconnect that may never come. Block and
unfriend are treated the same.

[Full text](history/0.1-0.2.md#queued-mail-answers-to-the-same-eligibility-check-as-a-fresh-send-never-a-softer-one-0272)

### A Fact About Time And A Fact About Authorization Are Different Terminal States, Never One Reused For The Other (0.2.72)

EXPIRED means the device stopped waiting (a clock fact); CANCELLED means
its owner decided the message would never be delivered (a relationship
fact). They stay separate states.

[Full text](history/0.1-0.2.md#a-fact-about-time-and-a-fact-about-authorization-are-different-terminal-states-never-one-reused-for-the-other-0272)

### Media Never Establishes Peer Identity; Authenticated Peer Identity Authorizes Media (0.2.73)

An audio track proves nothing about who is speaking. Every voice
operation requires a peer that is already authenticated, the same
precondition as every other protocol.

[Full text](history/0.1-0.2.md#media-never-establishes-peer-identity-authenticated-peer-identity-authorizes-media-0273)

### One Logical PeerConnection Serves Every Protocol, Including Media (0.2.73)

Voice adds audio to the same `RTCPeerConnection` that carries the
message bus. Chat, friendship, presence and voice share one
authenticated transport, never separate connections.

[Full text](history/0.1-0.2.md#one-logical-peerconnection-serves-every-protocol-including-media-0273)

### Renegotiation Travels In-Band, Over The Connection It Renegotiates (0.2.73)

Voice renegotiation signals travel over the existing connection's
message bus on their own protocol string. Only the first handshake needs
an out-of-band channel.

[Full text](history/0.1-0.2.md#renegotiation-travels-in-band-over-the-connection-it-renegotiates-0273)

### Exactly One Side Renegotiates; Role Decides Which, Forever (0.2.73)

The connection's fixed `role` from its first handshake decides who
renegotiates: only the offerer calls `renegotiate()`. This avoids the
"polite peer" conflict entirely.

[Full text](history/0.1-0.2.md#exactly-one-side-renegotiates-role-decides-which-forever-0273)

### Voice Lifecycle Is Independent Of Peer Lifecycle (0.2.73)

Voice state and connection state are separate. Ending a call never
closes the connection; a connection dropping ends the call as a
consequence.

[Full text](history/0.1-0.2.md#voice-lifecycle-is-independent-of-peer-lifecycle-0273)

### Voice Reuses Chat's Own Authorization Question; It Never Invents A Second Trust System (0.2.73)

`canCall()` is the same predicate as `canChat()`: authenticated, not
blocked and FRIEND. Voice subscribes to the same block and unfriend
events to end calls, so chat and voice can never disagree.

[Full text](history/0.1-0.2.md#voice-reuses-chats-own-authorization-question-it-never-invents-a-second-trust-system-0273)

### Audio Device State Is Never Presence, Never A Wire Fact (0.2.73)

Muting only disables the local track. It is never sent or exposed
through presence; showing "Bob is muted" would need its own explicit
signal.

[Full text](history/0.1-0.2.md#audio-device-state-is-never-presence-never-a-wire-fact-0273)

### Voice Is Ephemeral Like Presence And Connections, Never Durable Like Conversations Or Relationships (0.2.73)

Nothing about a call is stored: no call id, participants or times. A
recent calls list or missed-call notice would be separate future work.

[Full text](history/0.1-0.2.md#voice-is-ephemeral-like-presence-and-connections-never-durable-like-conversations-or-relationships-0273)

### Ringing Is Bounded By Local Policy, Never By The Network (0.2.74)

Each device runs its own ringing timeout and ends its own call with
TIMEOUT when it fires. The END message it sends is a courtesy; the other
side's own timer reaches the same conclusion.

[Full text](history/0.1-0.2.md#ringing-is-bounded-by-local-policy-never-by-the-network-0274)

### Reasons Are Local Judgments, Never Transmitted Facts (0.2.74)

End reasons are never sent. An incoming END always means REMOTE_HANGUP
on the receiving side; REJECTED and BUSY are the only reasons carried by
their own signal types.

[Full text](history/0.1-0.2.md#reasons-are-local-judgments-never-transmitted-facts-0274)

### A Call Failure Always Tells The Other Side (0.2.74)

Every local decision that a call is over (hang up, block or unfriend,
timeout, media or negotiation failure) sends the ordinary END signal, so
the other side is never left waiting. It is not told why.

[Full text](history/0.1-0.2.md#a-call-failure-always-tells-the-other-side-0274)

### A Local Microphone Failure Is Never A Peer Or Connection Failure (0.2.74)

A missing or denied microphone ends the call as MEDIA_FAILED; a failure
to attach or renegotiate ends it as NEGOTIATION_FAILED. Neither touches
the peer connection.

[Full text](history/0.1-0.2.md#a-local-microphone-failure-is-never-a-peer-or-connection-failure-0274)

### Device Selection Is Local State, Not Peer Protocol State (0.2.75)

Choosing a microphone, like muting, is local and never sent. Switching
devices mid-call produces no extra messages on the wire.

[Full text](history/0.1-0.2.md#device-selection-is-local-state-not-peer-protocol-state-0275)

### A Live Device Switch Reuses RTCRtpSender#replaceTrack(), Never A Second Renegotiation (0.2.75)

Switching microphones replaces the track on the existing sender, with no
SDP exchange. The call stays ACTIVE throughout; there is no SWITCHING
state.

[Full text](history/0.1-0.2.md#a-live-device-switch-reuses-rtcrtpsenderreplacetrack-never-a-second-renegotiation-0275)

### A Local Media Problem Never Ends A Call By Itself (0.2.75)

If the microphone disappears mid-call, voice tries once to fall back to
the default device. If that also fails, the call and the connection are
left as they are.

[Full text](history/0.1-0.2.md#a-local-media-problem-never-ends-a-call-by-itself-0275)

### Output Device Selection Never Enters VoiceSession (0.2.75)

Choosing a speaker is handled in the UI with the audio element's
`setSinkId()`. `VoiceUseCase` never learns about output devices.

[Full text](history/0.1-0.2.md#output-device-selection-never-enters-voicesession-0275)

### Conversation Synchronization Is A Protocol Between A Device And Itself, Never A Wider Chat Feature (0.2.83)

Syncing conversations runs on its own channel, only between connections
that resolve to the same identity. It never produces delivery acks or
read receipts, and merges messages through the same idempotent store
append as ordinary receipt.

[Full text](history/0.1-0.2.md#conversation-synchronization-is-a-protocol-between-a-device-and-itself-never-a-wider-chat-feature-0283)

### Sibling Eligibility Is A Symmetric Identity Comparison, Never A Device Allowlist (0.2.83)

Two devices may sync if the other connection's resolved identity equals
this device's own resolved identity, recomputed on every connection and
message. There is no list of sibling devices, so revoking a device stops
sync as soon as the revocation is known.

[Full text](history/0.1-0.2.md#sibling-eligibility-is-a-symmetric-identity-comparison-never-a-device-allowlist-0283)

### A Device That Authors A Grant Never Waits For Its Own Broadcast To Come Back To Believe It (0.2.83)

Broadcasting a device grant or revocation also applies it to the
authoring device's own view at once, through the same freshness-checked
path as received records.

[Full text](history/0.1-0.2.md#a-device-that-authors-a-grant-never-waits-for-its-own-broadcast-to-come-back-to-believe-it-0283)

### Per-Device Local Read State And Identity-Observed Read State Are Never The Same Fact (0.2.83)

The local read tracker stays per-device. A sibling's reported read
position is kept separately (`SiblingReadStateStore`), and the
identity-level view takes the maximum of both on each call without
writing one into the other.

[Full text](history/0.1-0.2.md#per-device-local-read-state-and-identity-observed-read-state-are-never-the-same-fact-0283)

### Identity Presence Is An Aggregate Of Authorized Device Observations, Never A Fourth Store (0.2.85)

"Alice is online" is true when at least one authenticated connection
resolves to her identity, recomputed on every call. Connection presence,
device presence and identity presence stay distinct.

[Full text](history/0.1-0.2.md#identity-presence-is-an-aggregate-of-authorized-device-observations-never-a-fourth-store-0285)

## Changed or superseded

These rules described the code at the time and no longer apply as written.

### Friendship Can Be Established, But Not Yet Revoked (0.2.57)

0.2.57 had only REQUEST and ACCEPT. Changed by 0.2.60: REJECT, CANCEL
and UNFRIEND exist, and blocking is a separate local decision. See
"Friendship Is Mutual Relationship State; Blocking Is A Unilateral Local
Decision (0.2.60)".

[Full text](history/0.1-0.2.md#friendship-can-be-established-but-not-yet-revoked-0257)

### 0.2.61 Ships Live Chat, Not A Message Database (0.2.61)

0.2.61 kept chat in memory only. Changed by 0.2.63 and 0.2.69: chat has
a durable outbox and a durable conversation store. See "A Reload
Continues A Conversation; It Never Starts A New One (0.2.69)".

[Full text](history/0.1-0.2.md#0261-ships-live-chat-not-a-message-database-0261)
