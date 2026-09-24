# Principles: Identity, keys and devices

Each rule links to its full text in [the history](../Principles.md#history).

### Login Unlocks An Identity; It Does Not Derive One From A Typed Name (0.2.46)

Creating an identity and choosing one are separate, explicit actions.
`createLocalIdentity(label)` mints a keypair and stores it in a listable
index; `authenticate(identityId)` unlocks one specific identity the
device already holds, addressed by its id and never re-derived from a
typed name. The private key on the device is the identity.

[Full text](history/0.1-0.2.md#login-unlocks-an-identity-it-does-not-derive-one-from-a-typed-name-0246)

### Identity Existence And Session Authentication Are Independent Facts (0.2.46)

An identity existing on a device and that identity being authenticated
are independent facts. Creating an identity does not log it in; logging
out does not forget the identity or its key; switching identities never
touches the others. Signing is refused whenever no session is
authenticated.

[Full text](history/0.1-0.2.md#identity-existence-and-session-authentication-are-independent-facts-0246)

### Identity Existence, Vault Unlock, And Session Authentication Are Three Independent Facts, Not Two (0.2.47)

This extends the rule above with a third fact: whether the private key
is currently decrypted (`VaultLock`). An identity can be authenticated
while its vault is locked (after an idle timeout or `lock()`), and
ending a session also locks the vault, so the next `authenticate()` asks
for the passphrase again.

[Full text](history/0.1-0.2.md#identity-existence-vault-unlock-and-session-authentication-are-three-independent-facts-not-two-0247)

### An Unlocked Vault Must Never Touch Storage (0.2.47)

A decrypted seed, or anything that trivially reconstructs one, is never
written to storage. The vault cache is an in-memory `Map` written only
by `unlock()` and cleared only by `lock()` and expiry, so a protected
identity is always locked after a page load.

[Full text](history/0.1-0.2.md#an-unlocked-vault-must-never-touch-storage-0247)

### A Wrong Passphrase And A Tampered Record Must Fail Identically (0.2.47)

`KeyEncryption.decrypt()` is encrypt-then-MAC: it checks an HMAC-SHA512
tag derived from the attempted passphrase, in constant time, before
decrypting. A wrong passphrase and a tampered record both raise the same
`IncorrectPassphraseError`. Decrypting first could not detect a wrong
passphrase at all, since any output looks like a plausible seed.

[Full text](history/0.1-0.2.md#a-wrong-passphrase-and-a-tampered-record-must-fail-identically-0247)

### Failed-Unlock Lockout Is Time-Based, Not Passphrase-Based (0.2.47)

After `maxAttempts` consecutive failures, every unlock attempt is
refused, even with the correct passphrase, until the cooldown has
passed. The cooldown is checked before the slow key derivation runs, and
a success clears the counter completely.

[Full text](history/0.1-0.2.md#failed-unlock-lockout-is-time-based-not-passphrase-based-0247)

### A Bounded Unlock Lifetime Is Not The Same Claim As Idle Detection (0.2.47)

`isVaultExpired()` means "more than `timeoutMs` since the vault was
unlocked", not "the user has been idle that long". A fixed lifetime
gives the security property without threading activity signals through
the UI, and the code says honestly which one it implements.

[Full text](history/0.1-0.2.md#a-bounded-unlock-lifetime-is-not-the-same-claim-as-idle-detection-0247)

### Exporting And Importing An Identity Preserves The Identity, Not Merely Its Name (0.2.48)

The test that matters is that a signature made on a second device after
import verifies with the identity's original public key. Import never
takes `identityId` on faith: it re-derives it from the package's
`publicKey` with the same `did:key` math `LocalIdentity` enforces.

[Full text](history/0.1-0.2.md#exporting-and-importing-an-identity-preserves-the-identity-not-merely-its-name-0248)

### Recovery Is Not Password Recovery (0.2.48)

There is no "forgot your passphrase" flow, and there cannot be: no
central authority can reset a decentralized identity. An export package
uses the same encrypt-then-MAC protection as the key at rest. Losing
both the file and its passphrase means the identity is gone.

[Full text](history/0.1-0.2.md#recovery-is-not-password-recovery-0248)

### Duplicate Identity Import Is A No-Op, Never A Silent Overwrite (0.2.48)

Import first checks whether the `identityId` already exists. If it does,
with matching key material, it returns `ALREADY_EXISTS` without touching
the passphrase. Overwriting could downgrade a protected identity, and
ignoring the import silently would hide what happened.

[Full text](history/0.1-0.2.md#duplicate-identity-import-is-a-no-op-never-a-silent-overwrite-0248)

### An Identity Identifier Is Immutable For The Lifetime Of That Cryptographic Identity (0.2.67)

`identityId` is the `did:key` derivation of `publicKey` and never
changes. Key rotation never points an existing id at a new key, which
would make every earlier signature unverifiable. A rotation is two
identities joined by a signed, directional succession record
(`IdentitySuccessionEnvelope`).

[Full text](history/0.1-0.2.md#an-identity-identifier-is-immutable-for-the-lifetime-of-that-cryptographic-identity-0267)

### A Successor Declaration Is Signed By The Predecessor, Never Counter-Signed By The Successor (0.2.67)

Only the predecessor's key signs a succession declaration. The successor
is already a complete, independently provable identity; the declaration
is a statement about the predecessor, like a will that needs only the
testator's signature.

[Full text](history/0.1-0.2.md#a-successor-declaration-is-signed-by-the-predecessor-never-counter-signed-by-the-successor-0267)

### Declaring A Successor Does Not Revoke The Predecessor (0.2.67)

`declareSuccessor()` never changes lifecycle state, so the old key keeps
working. Revocation is a separate act (`revokeIdentity()`), which may
name a successor so that "rotate now" is still one signed action. Having
a successor and being revoked stay independent facts.

[Full text](history/0.1-0.2.md#declaring-a-successor-does-not-revoke-the-predecessor-0267)

### An Identity Can Be Revoked Without A Successor (0.2.67)

A revocation's `successorIdentityId` is optional. Losing a device or
simply retiring an identity is a valid reason to revoke it with nothing
to replace it.

[Full text](history/0.1-0.2.md#an-identity-can-be-revoked-without-a-successor-0267)

### A Revocation Is Self-Attested, Never Third-Party (0.2.67)

A revocation must be signed by the identity it revokes, the same
discipline friendship advertisements follow, because no server exists
that could vouch for it otherwise.

[Full text](history/0.1-0.2.md#a-revocation-is-self-attested-never-third-party-0267)

### No Central Authority Can Revoke An Identity It Does Not Control (0.2.67)

`verifyIdentityRevocation()` requires the signer to be the revoked
identity itself. There is no identity server that could answer "is Alice
revoked?", because the key is the authority. Only whoever holds an
identity's key can revoke it.

[Full text](history/0.1-0.2.md#no-central-authority-can-revoke-an-identity-it-does-not-control-0267)

### Revocation Is A Signing Gate, Not A Session Gate (0.2.67)

Revocation is enforced only where signing happens
(`_requireAuthenticatedIdentity()`). A revoked identity can still be
shown as logged in, and its owner can inspect or export its revocation
record. Vault locked, session inactive and identity revoked are three
independent facts, checked in that order.

[Full text](history/0.1-0.2.md#revocation-is-a-signing-gate-not-a-session-gate-0267)

### Revocation Prevents New Trust; It Does Not Retroactively Revoke Old Trust (0.2.67)

Revoking stops new signatures, including new peer authentication proofs,
from that point on. It cannot tear down live connections elsewhere,
because no ledger of trusted peers exists to find them: every peer
connection is re-proved from nothing on each reconnect.

[Full text](history/0.1-0.2.md#revocation-prevents-new-trust-it-does-not-retroactively-revoke-old-trust-0267)

### Changing A Passphrase Never Changes The Identity (0.2.67)

`changePassphrase()` only changes what protects the key at rest. The id,
public key, label, signatures and every record keyed on the identity
stay as they are, because nothing was ever keyed on the passphrase.

[Full text](history/0.1-0.2.md#changing-a-passphrase-never-changes-the-identity-0267)

### Backup, Recovery, Rotation, And Revocation Are Four Different Questions (0.2.67)

Backup preserves an identity elsewhere; recovery regains one from its
exported package and passphrase; rotation establishes a successor;
revocation permanently invalidates an identity. Backup and recovery need
no lifecycle concept, and rotation and revocation are signed statements
about an identity rather than packages containing one. They stay
separate mechanisms.

[Full text](history/0.1-0.2.md#backup-recovery-rotation-and-revocation-are-four-different-questions-0267)

### A Relayed Identity Lifecycle Record Is Trusted By Its Own Signature, Never By Who Relayed It (0.2.68)

Friendship claims are first-person, so they are bound to the connection
they arrive on. Revocation and succession records are different: anyone
can relay them, and they are trusted only by their own verified
signature. The propagation code never reads which peer delivered them.

[Full text](history/0.1-0.2.md#a-relayed-identity-lifecycle-record-is-trusted-by-its-own-signature-never-by-who-relayed-it-0268)

### Propagation Reaches Identities This Device Already Knows, Never An Open Revocation Directory (0.2.68)

A valid lifecycle record about an identity this device has never
remembered (no peer relationship or friendship) is dropped, not cached.
This keeps propagation from becoming a shadow global directory. It is a
relevance gate, not a weaker trust check.

[Full text](history/0.1-0.2.md#propagation-reaches-identities-this-device-already-knows-never-an-open-revocation-directory-0268)

### Identity Lifecycle State Does Not Implicitly Rewrite Unrelated Durable Social State (0.2.68)

Learning that an identity was revoked or rotated is information, never
an instruction. Lifecycle records live in their own store
(`RemoteIdentityLifecycle`) and are only cross-referenced for display.
Nothing deletes relationships, ends friendships or merges them because a
lifecycle fact arrived.

[Full text](history/0.1-0.2.md#identity-lifecycle-state-does-not-implicitly-rewrite-unrelated-durable-social-state-0268)

### Propagation Carries A Record, It Does Not Mint A New Claim (0.2.68)

The gossip message wraps the exact revocation or succession record the
identity produced, byte for byte, with no second signature and no new
signature type. There is one kind of evidence, verified one way, whether
it was read locally or received from a peer.

[Full text](history/0.1-0.2.md#propagation-carries-a-record-it-does-not-mint-a-new-claim-0268)

### Identity Authentication Proves A Key; Device Authorization Proves Permission (0.2.78)

The peer handshake proves who holds a key on a connection, nothing more.
A device authorization answers a separate question: did another identity
permit this key to act for it. `resolvePeerAuthority()` is a separate
query, never a side effect of a connection authenticating.

[Full text](history/0.1-0.2.md#identity-authentication-proves-a-key-device-authorization-proves-permission-0278)

### A Device Authorization Grant Is Signed By The Parent, Never Counter-Signed By The Device (0.2.78)

`authorizeDevice()` is signed only by the parent identity. The device
proves its own key live when it connects, so a grant is meaningful as
soon as it is produced, even for a device not yet set up.

[Full text](history/0.1-0.2.md#a-device-authorization-grant-is-signed-by-the-parent-never-counter-signed-by-the-device-0278)

### Device Authorization Can Be Re-Granted; Identity Revocation Cannot (0.2.78)

Identity revocation is a permanent latch. Device authorization is not:
`DeviceAuthority.isAuthorized` compares the latest verified grant with
the latest verified revocation, so a newer grant re-authorizes a device.
Losing and recovering a device is an ordinary event, not a compromise of
the identity.

[Full text](history/0.1-0.2.md#device-authorization-can-be-re-granted-identity-revocation-cannot-0278)

### A Connection Represents An Identity Either Directly Or Through One Verified Device Authorization, Never By Assumption (0.2.78)

`resolvePeerAuthority()` answers in one of two modes. DIRECT means the
connection's proven key is the identity; DEVICE means it is a different
key the identity verifiably authorized, not since revoked. Anything else
is `{ authorized: false, mode: null }`, never "probably fine".

[Full text](history/0.1-0.2.md#a-connection-represents-an-identity-either-directly-or-through-one-verified-device-authorization-never-by-assumption-0278)

### Device Authorization Changes Peer Authority, Never Social Identity (0.2.82)

Authorizing or revoking a device changes which connections speak for a
social identity. It never creates, splits or duplicates relationships: a
friendship or conversation with either of Alice's authorized devices is
the same friendship or conversation, and blocking or unfriending the
parent identity reaches both.

[Full text](history/0.1-0.2.md#device-authorization-changes-peer-authority-never-social-identity-0282)

### Resolution Happens Strictly After Authentication, And Only On the Wire's Receiving Half (0.2.82)

Every authentication check (a claimed actor, sender or caller matching
the connection's proven key) is unchanged; social-identity resolution
runs only after it holds. Signed wire claims addressed to a connection
(a friendship subject, a chat `conversationId`, an INVITE's callee) stay
addressed to the raw authenticated key on both ends, never the resolved
identity.

[Full text](history/0.1-0.2.md#resolution-happens-strictly-after-authentication-and-only-on-the-wires-receiving-half-0282)

### A Device Is Never Taught To Resolve Itself, Except Reflexively Against Itself (0.2.82; narrowed 0.2.83)

`resolveConnectionIdentity()` answers only who is on the other end of a
connection, from this device's own verified records. No device asks a
third party who it is. Since 0.2.83, `resolveOwnSocialIdentity()` lets a
device consult its own adopted, signed grant record, which is exactly as
evidence-gated as resolving someone else.

[Full text](history/0.1-0.2.md#a-device-is-never-taught-to-resolve-itself-except-reflexively-against-itself-0282-narrowed-0283)
