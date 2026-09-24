# Principles: Notifications

Each rule links to its full text in [the history](../Principles.md#history).

### A NotificationEvent Represents An Awareness-Worthy Fact; It Is Not A Delivery, A Read State, Or A Chat Message (0.9.273)

`NotificationEvent` has five fields (`notificationId`, `eventType`,
`recipientIdentityId`, `createdAt`, `payload`) and records something
that happened, not a job in flight. `eventType` is deliberately open.

[Full text](history/0.9.md#a-notificationevent-represents-an-awareness-worthy-fact-it-is-not-a-delivery-a-read-state-or-a-chat-message-09273)

### A Producer Wraps The Command It Notifies About; It Never Becomes A Fourth Argument To It (0.9.275)

Commentary notifications come from a decorator around
`AddPublicationCommentaryUseCase`, not a new constructor argument. Order
follows call sequence rather than a transaction, a sink's failure is its
own, and no suppression rules are invented ahead of a product decision.

[Full text](history/0.9.md#a-producer-wraps-the-command-it-notifies-about-it-never-becomes-a-fourth-argument-to-it-09275)

### A Lifecycle Audit Names What It Finds; It Does Not Fix What It Finds (0.9.276)

An audit reports gaps, such as a retry producing a second event, rather
than closing them. The decorator must return the wrapped use case's own
result object, not something merely shaped like it.

[Full text](history/0.9.md#a-lifecycle-audit-names-what-it-finds-it-does-not-fix-what-it-finds-09276)

### Reconstructible, Safe To Regenerate, Deduplicated, And Exactly-Once Are Four Separate Facts (0.9.277)

Being able to rebuild an event is not deduplication, and a persistence
identity is not obviously `commentaryId`. These four properties are
separate questions to answer on their own.

[Full text](history/0.9.md#reconstructible-safe-to-regenerate-deduplicated-and-exactly-once-are-four-separate-facts-09277)

### A Dedup Identity Is Chosen From Outside The Fact It Names; The Fact Never Chooses For Itself (0.9.278)

Candidate deduplication identities are characterized from outside the
event. Where candidates disagree, some disagreements are bugs and one is
a real decision; the event itself never decides.

[Full text](history/0.9.md#a-dedup-identity-is-chosen-from-outside-the-fact-it-names-the-fact-never-chooses-for-itself-09278)

### A Key Collision Is Necessary, Never Sufficient, Evidence Of Sameness (0.9.279)

Two events sharing a deduplication key may still differ. Benign
differences and contradictions must be told apart, and contradictions
must be detected before any collapse; what to do with them was left
open.

[Full text](history/0.9.md#a-key-collision-is-necessary-never-sufficient-evidence-of-sameness-09279)

### Deduplication Identity Is A Decision About A Fact, Never A Capability Of It (0.9.280)

`NotificationDeduplicationPolicy` is a pure module outside
`NotificationEvent`; the event has no `dedupKey()` or `equals()`.
`classifyNotificationCollision()` returns one of three outcomes, not a
boolean.

[Full text](history/0.9.md#deduplication-identity-is-a-decision-about-a-fact-never-a-capability-of-it-09280)

### A Persistence Layer Enforces A Policy; It Never Adjudicates What The Policy Leaves Open (0.9.281)

`NotificationEventStore` looks up the deduplication identity and follows
the policy's answer, with no comparison logic of its own. It has three
outcomes, reports CONFLICT without resolving it, and is idempotent in
its stored data, not just in memory.

[Full text](history/0.9.md#a-persistence-layer-enforces-a-policy-it-never-adjudicates-what-the-policy-leaves-open-09281)

### Persisted, Delivered, Seen, And Read Are Four Different Claims — This System Makes Only The First One (0.9.286)

The system can say a durable notification record exists; it never says
the recipient was notified, saw or read it. Persisting never depends on
delivery, reading the history changes nothing, and delivered, seen and
read states do not exist.

[Full text](history/0.9.md#persisted-delivered-seen-and-read-are-four-different-claims--this-system-makes-only-the-first-one-09286)
