# Principles: Shared worlds and collaboration

Each rule links to its full text in [the history](../Principles.md#history).

### World Mutation Requires Explicit Document Editing Authority (0.2.95)

Every mutation asks `WorldAuthorizationService.resolveAccess(document)`
about the actual Document being changed, at the moment of the attempt,
never once per session or login. Revocation therefore takes effect on
the very next attempt, with nothing cached to invalidate.

[Full text](history/0.1-0.2.md#world-mutation-requires-explicit-document-editing-authority-0295)

### Ownership Is A Cryptographic Identity Fact, Never A Free-Text Label, When One Is Available (0.2.95)

`DocumentMetadata.author` is an unverified display name, so two people
named "Alice" would both look like owners. `authorIdentityId` records
the creator's `did:key` at creation time, and authorization uses that.

[Full text](history/0.1-0.2.md#ownership-is-a-cryptographic-identity-fact-never-a-free-text-label-when-one-is-available-0295)

### Authorization Composes With Device Resolution; It Never Reimplements It (0.2.95)

`WorldAuthorizationService` decides what a viewer may do with a
Document. It takes device resolution from `resolveOwnSocialIdentity()`
as given, never reimplementing or caching it, so all of an owner's
authorized devices get EDIT with no device-specific code.

[Full text](history/0.1-0.2.md#authorization-composes-with-device-resolution-it-never-reimplements-it-0295)

### World Synchronization Is A Command Protocol, Never A Document Sync Channel (0.2.96)

Replicas exchange individual executed commands (`command.toJSON()`),
rebuilt through the same `CommandRegistry`, never whole Worlds or
Documents. Shipping whole documents would silently overwrite local edits
and leave no operations to order or reconcile.

[Full text](history/0.1-0.2.md#world-synchronization-is-a-command-protocol-never-a-document-sync-channel-0296)

### A Remote Operation Is Durable World State; It Is Never A Local Undo-Stack Entry (0.2.96)

A remote operation is applied with `command.execute()` directly, never
through the local `CommandHistory`, so your Undo can never undo someone
else's change. `ReplayGuard` makes remote operations idempotent.

[Full text](history/0.1-0.2.md#a-remote-operation-is-durable-world-state-it-is-never-a-local-undo-stack-entry-0296)

### Authorization For A World Operation Is Asked About One Specific World, Never "Authorized Somewhere" (0.2.96)

Each incoming operation is authorized against the local Document for its
own `worldDocumentId`. EDIT on one World gives no authority over
another, even over the same connection.

[Full text](history/0.1-0.2.md#authorization-for-a-world-operation-is-asked-about-one-specific-world-never-authorized-somewhere-0296)

### The Claimed Author Of An Operation Is Never Trusted Ahead Of The Connection That Carried It (0.2.96)

An operation's `authorIdentityId` must first equal the key the
connection proved in its handshake; only then is device identity
resolved and authorization asked. Writing someone else's id into an
envelope is caught at the earliest point.

[Full text](history/0.1-0.2.md#the-claimed-author-of-an-operation-is-never-trusted-ahead-of-the-connection-that-carried-it-0296)

### Ordering Is A Deterministic Total Order, Never Wall-Clock Time (0.2.97)

World operations are ordered by a Lamport clock with the operation id as
a tie-breaker, `(logicalClock, operationId)`, never by system time. No
two operations compare equal, so every replica agrees on one total
order.

[Full text](history/0.1-0.2.md#ordering-is-a-deterministic-total-order-never-wall-clock-time-0297)

### A Conflict Resolver Reorders Commands; It Never Reinvents Them (0.2.97)

Conflict resolution is neither a CRDT nor operational transform. When an
operation arrives out of order, the resolver undoes the operations that
come after it, applies it, and replays them, using only each command's
own `execute()` and `undo()`.

[Full text](history/0.1-0.2.md#a-conflict-resolver-reorders-commands-it-never-reinvents-them-0297)

### Delete Is Terminal — A Stated Conflict Policy, Not An Accident Of Arrival Order (0.2.97)

Concurrent moves of a placement simply add together. Delete versus
modify is the one real conflict: a modify that finds its target gone is
recorded as SUPERSEDED, so in either order the delete wins.

[Full text](history/0.1-0.2.md#delete-is-terminal--a-stated-conflict-policy-not-an-accident-of-arrival-order-0297)

### The Composition Gap Is Closed Through The Existing Event, Never A New Call Site (0.2.97)

Command propagation subscribes once to each `CommandHistory`'s existing
`COMMAND_EXECUTED` event, and every history the session creates passes
through one registration chokepoint, rather than a broadcast call at
every place a history is created.

[Full text](history/0.1-0.2.md#the-composition-gap-is-closed-through-the-existing-event-never-a-new-call-site-0297)

### A World Edit Grant Is A Signed Capability About One World, Never A Role And Never A Second Kind Of Ownership (0.2.98)

A grant gives one identity EDIT on one World. It adds no new access
levels (still NONE, READ, EDIT), no roles, and no authority over any
other World.

[Full text](history/0.1-0.2.md#a-world-edit-grant-is-a-signed-capability-about-one-world-never-a-role-and-never-a-second-kind-of-ownership-0298)

### Only The World's Own True Owner May Ever Issue A Membership Grant — Checked Structurally, On Every Replica, Against A Forged Claim (0.2.98)

Grants travel by gossip and are trusted by their own signature, but each
receiver also checks that the granting identity is the World's
`authorIdentityId` in its own local copy of the World. A validly signed
grant from anyone else is rejected.

[Full text](history/0.1-0.2.md#only-the-worlds-own-true-owner-may-ever-issue-a-membership-grant--checked-structurally-on-every-replica-against-a-forged-claim-0298)

### World Presence Is Computed From Live, Authorized Connections, Never Persisted (0.2.98)

World presence advertisements are unsigned and never stored. The roster
is recomputed on each call from the latest advertisements and the
current authenticated connections, so a peer who disconnects drops out
immediately.

[Full text](history/0.1-0.2.md#world-presence-is-computed-from-live-authorized-connections-never-persisted-0298)

### Being Online Is Not The Same As Being Authorized To Edit — A Presence Roster's `canEdit` Is Always Recomputed, Never Read Off A Remote Claim (0.2.98)

A participant's EDITING or EXPLORING activity is only a self-reported
hint. The roster recomputes `canEdit` locally from ownership and grants
on every call, so revoking a grant takes effect at once without
disconnecting anyone.

[Full text](history/0.1-0.2.md#being-online-is-not-the-same-as-being-authorized-to-edit--a-presence-rosters-canedit-is-always-recomputed-never-read-off-a-remote-claim-0298)

### The UI Displays Authorization; It Never Decides It (0.2.99)

Collaboration components show buttons and rosters, but every decision is
made below them. `canManage` only decides whether a button is offered; a
direct call that skips the panel is still refused by the membership use
case.

[Full text](history/0.1-0.2.md#the-ui-displays-authorization-it-never-decides-it-0299)

### A Collaboration UI Component Is Shared, Never Duplicated, Between World View And A Future Editor Surface (0.2.99)

`buildWorldCollaborationRoster()` is a pure function, and the members
and presence panels are generic components, so any future editor surface
reuses them rather than keeping a second account of who may edit or who
is here.

[Full text](history/0.1-0.2.md#a-collaboration-ui-component-is-shared-never-duplicated-between-world-view-and-a-future-editor-surface-0299)

### Collaborative Spatial Presence Is Ephemeral Observation, Never World Content (0.3.0)

A participant's camera position, heading, selection and activity are
never stored, signed or part of a World, Document, command or operation.
The roster comes from live connections only, and the World is
byte-identical whether or not anyone was present.

[Full text](history/0.3-0.7.md#collaborative-spatial-presence-is-ephemeral-observation-never-world-content-030)

### Remote Selection Observation Is Never Local Editing Selection (0.3.0)

`WorldSpatialSelection` shares no type or code with local selection, the
editing service, the gizmo or any command, so remote spatial presence
can never enter a mutation path.

[Full text](history/0.3-0.7.md#remote-selection-observation-is-never-local-editing-selection-030)

### A Compass Heading's LABEL Stays Local; Raw Camera Orientation May Now Travel As Ephemeral Presence (0.3.0 amends 0.2.94)

No compass heading label is ever stored or advertised, and
`getCompassHeading()` is still computed fresh. Spatial presence may
carry a raw camera heading in degrees, an ephemeral, connection-scoped
fact about the remote replica's own camera.

[Full text](history/0.3-0.7.md#a-compass-headings-label-stays-local-raw-camera-orientation-may-now-travel-as-ephemeral-presence-030-amends-0294)

### A Spatial Anchor Is A Presentation Decision, Never Remote Authority (0.3.1)

`deriveWorldSpatialAnchor()` turns spatial presence into proximity tier,
visibility, presentation mode and an activity phrase: decisions about
drawing, never facts about what a participant may do. It is never
stored, signed or sent, and adds no protocol.

[Full text](history/0.3-0.7.md#a-spatial-anchor-is-a-presentation-decision-never-remote-authority-031)

### Follow Is Local Camera Navigation, Never A Shared Camera (0.3.1)

`focusCollaborator()` reads a collaborator's last known position once
and moves your own camera there through the normal focus machinery.
There is no ongoing follow mode; clicking again just refocuses.

[Full text](history/0.3-0.7.md#follow-is-local-camera-navigation-never-a-shared-camera-031)
