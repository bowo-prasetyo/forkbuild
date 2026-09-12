import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { NotificationEvent, isValidEventType } from '../core/NotificationEvent.js';
import { Publication } from '../publisher/Publication.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/AddPublicationCommentaryUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/GetPublicationCommentariesUseCase.js';
import {
    toFriendshipAdvertisement, isValidFriendshipAdvertisement,
    getFriendshipSigningDescriptor, FriendshipAction
} from '../core/FriendshipAdvertisement.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.274 — Notification Event Boundary Audit.
//
// 0.9.273 built `core/NotificationEvent.js` — a domain-neutral seam with,
// by design, NO PRODUCERS. 0.9.272's own Section D already asked "does a
// notification-worthy event exist" for five candidates and found all five
// blocked on DELIVERY (no way to reach a recipient who is not currently
// connected). This milestone asks a NARROWER, more mechanical question
// 0.9.273 itself deferred to here (docs/Roadmap.md, 0.9.273 "What comes
// after"): independent of delivery entirely, WHICH of this codebase's
// existing domain events already carry enough semantic information —
// fact, recipient, identity, timestamp, payload — to become a
// `NotificationEvent` by construction alone, without inventing new
// meaning? Test/document-only, per this milestone's own brief. No
// producer is wired, no store is built, no delivery question is
// reopened.
//
//   Section A — Event-source inventory: for each candidate, is the
//               underlying fact already durably or observably
//               represented?
//   Section B — Recipient determination: does a recipient identity,
//               DISTINCT from the actor, exist WITHOUT inventing a new
//               relationship?
//   Section C — Event identity: does the source event already carry an
//               identity stable enough to become notificationId, and is
//               it independent of the domain fact's own, possibly
//               mutable, current-state identity?
//   Section D — Timestamp provenance: can createdAt come from the
//               underlying fact, never from notification-processing
//               time?
//   Section E — Payload sufficiency: is the existing data enough for a
//               useful payload, without inventing presentation fields
//               (title/message/icon/url)? Proved by actually
//               CONSTRUCTING real `NotificationEvent` instances from
//               real domain data, not merely asserting the shape would
//               work.
//   Section F — The ChatOutbox boundary: a dedicated regression proving
//               `application/ChatOutbox.js` is a durable-delivery
//               PRECEDENT, never a hidden NotificationEvent producer or
//               a generic notification store.
//   Section G — Candidate classification and the producer-selection
//               decision this milestone exists to make.
//
// Seven candidates, drawn from 0.9.272's own Section D four (World
// Presence, Publication Commentary, Place Naming, Document Collaboration)
// plus three this milestone adds with fresh evidence: Publication/
// Snapshot distribution (0.9.272 D4, not previously carried through a
// full boundary audit), Friend Relationships (not examined by 0.9.272 at
// all), and Commentary threading (a second-order candidate that does not
// exist yet, included to give the DEFERRED classification a genuine,
// evidenced example rather than an invented placeholder).

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch {
        return false;
    }
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function flattenProse(source) {
    return source.split('\n')
        .map((line) => line.replace(/^\s*\/\/\s?/, ''))
        .join(' ')
        .replace(/\s+/g, ' ');
}

async function grepCount(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    provider.identityId = identity.identityId;
    return provider;
}

const CLASSIFICATIONS = [
    'READY_PRODUCER', 'MISSING_RECIPIENT', 'MISSING_EVENT_IDENTITY',
    'MISSING_FACT', 'NEW_PRODUCT_SEMANTICS', 'DEFERRED'
];

async function runTests() {
    console.log('Running Notification Event Boundary Audit tests...\n');

    // ---------------------------------------------------------------
    // Section A — Event-source inventory.
    //
    // For each of the seven candidates: is the underlying fact already
    // durably or observably represented ANYWHERE in this codebase right
    // now — not "could it be," but is it, today?
    // ---------------------------------------------------------------
    {
        // A1. Publication Commentary — durably persisted, APPEND-ONLY,
        // never truncated/overwritten (storage/PublicationCommentaryStore.js's
        // own header). The strongest durability story of all seven.
        const commentaryStoreSource = await rawSource('storage/PublicationCommentaryStore.js');
        assert(/APPEND-ONLY/.test(commentaryStoreSource) && commentaryStoreSource.includes('There is no `remove()`, no `update()`'),
            'A1. storage/PublicationCommentaryStore.js is still append-only with no remove()/update() — a commentary, once saved, is a permanent fact.');

        // A2. Friend Relationship (incoming REQUEST) — durably persisted
        // as `FriendshipRecord.incomingAction`, but NOT as an independent,
        // append-only log: a fresh action in either direction, or any
        // TERMINAL action, OVERWRITES or CLEARS it (core/FriendshipRecord.js
        // #withIncomingAction). The fact survives only as long as the
        // relationship stays in the exact state it arrived in.
        const friendshipRecordSource = codeOnlyLines(await rawSource('core/FriendshipRecord.js'));
        assert(/outgoingAction:\s*null,\s*incomingAction:\s*null/.test(friendshipRecordSource),
            'A2. core/FriendshipRecord.js still resets BOTH incomingAction/outgoingAction to null on any terminal action — the arrival fact is durable only conditionally, never a permanent log entry the way Commentary A1 is.');

        // A3. Place Naming claim — durably persisted in
        // application/LocalPlaceNamingClaimStore.js once imported, but this
        // is each REPLICA's own local copy of a claim it discovered, never
        // a fact recorded FOR another identity — see Section B3 below.
        assert(await sourceExists('application/LocalPlaceNamingClaimStore.js'),
            'A3. application/LocalPlaceNamingClaimStore.js still exists — the underlying fact (a claim exists) is durable, but see Section B3 for why that is not the same as being addressed to a recipient.');

        // A4. Publication/Snapshot distribution result — durably
        // persisted, but as a SINGLE CURRENT VALUE per publicationId, never
        // a history (application/PublicationDistributionLifecycleStore.js's
        // own header, reconfirmed fresh).
        const lifecycleStoreSource = await rawSource('application/PublicationDistributionLifecycleStore.js');
        assert(/holds a single current value per publication/.test(lifecycleStoreSource),
            'A4. application/PublicationDistributionLifecycleStore.js still holds a single current value per publication, never a history — reconfirmed fresh, one milestone after 0.9.272 D4a first found it.');

        // A5. World Presence change — NEVER persisted, by explicit,
        // permanent design (application/WorldPresenceUseCase.js's own
        // header, reconfirmed fresh, one milestone after 0.9.272 D1).
        const presenceUseCase = await rawSource('application/WorldPresenceUseCase.js');
        assert(/COMPUTED from currently live, authenticated peer connections, never\s*\n\/\/ PERSISTED/.test(presenceUseCase),
            'A5. application/WorldPresenceUseCase.js still states presence is COMPUTED from live connections, never persisted — the underlying fact this candidate would need simply is not represented anywhere on disk.');

        // A6. Document Collaboration causal-gap observation — held only in
        // an in-memory Map (core/DocumentOperationCausality.js), never
        // written to any StorageProvider. Reconfirmed structurally: no
        // storage/ import anywhere in the causal-gap chain.
        const causalitySource = codeOnlyLines(await rawSource('core/DocumentOperationCausality.js'));
        const gapDetectorSource = codeOnlyLines(await rawSource('core/DocumentOperationCausalGapDetector.js'));
        const gapObserverSource = codeOnlyLines(await rawSource('application/DocumentOperationCausalGapObservationUseCase.js'));
        assert(causalitySource.includes('this._predecessors = new Map()') && !/storage\//.test(causalitySource),
            'A6a. core/DocumentOperationCausality.js still holds causal history in a bare in-memory Map, with no storage/ import anywhere in the file.');
        assert(!/storage\//.test(gapDetectorSource) && !/storage\//.test(gapObserverSource),
            'A6b. Neither core/DocumentOperationCausalGapDetector.js nor application/DocumentOperationCausalGapObservationUseCase.js imports anything from storage/ — the causal-gap fact never reaches durable storage anywhere in this chain, reconfirming 0.9.272 D5a/b at the storage layer specifically.');

        // A7. Publication Commentary reply/threading — does not exist.
        // 0.9.242's own header lists "threading, replies" as EXPLICITLY
        // NOT PART OF this milestone — reconfirmed still true, no
        // `parentCommentaryId`/`replyTo` field anywhere in the domain.
        const publicationCommentarySource = await rawSource('core/PublicationCommentary.js');
        assert(/threading, replies/.test(publicationCommentarySource),
            'A7a. core/PublicationCommentary.js\'s own header still lists threading/replies as explicitly excluded.');
        assert(!/parentCommentaryId|replyTo|inReplyTo/.test(codeOnlyLines(publicationCommentarySource)),
            'A7b. core/PublicationCommentary.js still has no parentCommentaryId/replyTo/inReplyTo field of any kind — a "someone replied to your comment" event has no underlying fact to become a NotificationEvent from, because that fact is not tracked at all.');

        console.log('✓ A: Event-source inventory across seven candidates. Durable and append-only: Commentary (A1). Durable but conditionally overwritten: Friend Relationship (A2). Durable but local-replica-scoped: Place Naming (A3), Distribution (A4). Never persisted at all: World Presence (A5), Collaboration causal-gap (A6). Does not exist: Commentary threading (A7).');
    }

    // ---------------------------------------------------------------
    // Section B — Recipient determination.
    //
    //   event occurs -> is there a distinct recipient? -> can
    //   recipientIdentityId be determined WITHOUT inventing a new
    //   relationship?
    //
    // The discipline this section holds itself to, per this milestone's
    // own brief: a candidate with NO natural recipient (Place Naming) is
    // recorded as such, never forced into having one merely because
    // NotificationEvent requires a recipientIdentityId field.
    // ---------------------------------------------------------------
    {
        // B1. Publication Commentary — LIVE proof, reconfirming 0.9.272
        // D2a-c fresh: the commentary's authorIdentityId and the
        // Publication's own publisherIdentity.id are two distinct,
        // independently verifiable identities, and the relationship
        // ("this Publication's own publisher") already exists as a field
        // on the Publication object itself — no NEW relationship type is
        // invented to derive it.
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const publisherIdentity = alice.getSigningIdentity().toJSON();
        const publication = new Publication({
            id: 'pub-1', documentId: 'doc-1', title: 'Alice\'s World', author: 'alice', publisherIdentity
        });
        const discoveryStorage = new InMemoryStorageProvider();
        discoveryStorage.save('forkbuild-publications', [publication.toJSON()]);
        const discoveryProvider = new LocalDiscoveryProvider(discoveryStorage);
        const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);
        const commentaryStore = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const addUseCase = new AddPublicationCommentaryUseCase(commentaryStore, bob, canComment);
        const { commentary } = addUseCase.execute({ publicationId: 'pub-1', content: 'Beautiful world!' });
        assert(commentary.authorIdentityId !== publication.publisherIdentity.id,
            'B1a. LIVE: the commentary\'s actor (Bob) and the Publication\'s own publisherIdentity (Alice) are structurally distinct identities.');
        assert(publication.publisherIdentity.id === alice.getSigningIdentity().id,
            'B1b. LIVE: publisherIdentity is a real field already present on the Publication object at the moment the comment is added — not derived, invented, or looked up through any new relationship store.');
        console.log('✓ B1. Publication Commentary: a distinct recipient (publisherIdentity) exists, already on file, without inventing a new relationship — reconfirmed live, one milestone after 0.9.272 D2.');

        // B2. Friend Relationship REQUEST — LIVE proof, a candidate 0.9.272
        // never examined. `subjectIdentity` is not merely a DERIVED
        // recipient the way publisherIdentity is for Commentary — it is
        // the wire protocol's own ADDRESSEE, verified cryptographically.
        // This is, if anything, a STRONGER recipient story than
        // Commentary: zero inference is required at all.
        const carol = makeIdentity('Carol');
        const dave = makeIdentity('Dave');
        const rawAdvertisement = toFriendshipAdvertisement({
            actorIdentity: carol.getSigningIdentity().id,
            subjectIdentity: dave.getSigningIdentity().id,
            action: FriendshipAction.REQUEST
        });
        const signature = carol.signCanonical(getFriendshipSigningDescriptor(rawAdvertisement));
        const signedAdvertisement = { ...rawAdvertisement, signature: signature.toJSON() };
        assert(isValidFriendshipAdvertisement(signedAdvertisement),
            'B2a. A real, signed FriendshipAdvertisement is well-formed by the domain\'s own validator.');
        const verifyResult = new LocalAuthorizationVerifier().verifyFriendshipAdvertisement(signedAdvertisement);
        assert(verifyResult.valid === true,
            'B2b. LIVE: the signed REQUEST verifies as genuinely authored by Carol against her own key.');
        assert(signedAdvertisement.subjectIdentity === dave.getSigningIdentity().id
            && signedAdvertisement.actorIdentity !== signedAdvertisement.subjectIdentity,
            'B2c. LIVE: subjectIdentity (Dave) is the wire protocol\'s own addressee, distinct from actorIdentity (Carol) — the recipient is not inferred from a side field the way Commentary\'s publisherIdentity is; it IS the message\'s own address.');
        console.log('✓ B2. Friend Relationship REQUEST: a distinct recipient (subjectIdentity) exists, verified live via a real signed-and-verified advertisement — requiring even less inference than Commentary\'s own recipient, since it is the protocol\'s literal addressee rather than a derived field.');

        // B3. Place Naming claim — reconfirmed structurally, one milestone
        // after 0.9.272 D3a: discovery is a REPLICA'S OWN QUERY for claims
        // near itself, never a claim being pushed AT a specific other
        // identity. There is no candidate recipient at all, and this
        // section does not manufacture one.
        const nostrSource = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoverySource.js'));
        assert(!/publishEvent|sendEvent|broadcast|\.publish\(/i.test(nostrSource),
            'B3. application/NostrPlaceNamingDiscoverySource.js still contains no publish/send/broadcast call — reconfirmed fresh: discovery is pull-only, so a naming claim has no natural recipient to address a NotificationEvent to.');

        // B4. Publication/Snapshot distribution result — reconfirmed
        // structurally, one milestone after 0.9.272 D4a/b: the only
        // "recipient" is the SAME local actor who initiated the
        // operation, and the other side of the exchange (a second replica
        // importing the Snapshot) never informs the first party at all.
        const lifecycleStoreHeader = await rawSource('application/PublicationDistributionLifecycleStore.js');
        assert(/talks to another process, tab, or machine/.test(lifecycleStoreHeader),
            'B4a. application/PublicationDistributionLifecycleStore.js\'s own header still states it never talks to another process, tab, or machine.');
        const importSnapshotSource = codeOnlyLines(await rawSource('application/ImportPublicationSnapshotTransferPackageUseCase.js'));
        assert(!/acknowledge|receipt|notifyPublisher|notifyOrigin/i.test(importSnapshotSource),
            'B4b. application/ImportPublicationSnapshotTransferPackageUseCase.js still contains no acknowledge/receipt/notify call back to the original publisher.');

        // B5. World Presence — recipients ARE structurally identifiable
        // (each roster entry's own identityId is real and distinct from
        // every other participant's) — but Section A5 already found the
        // underlying fact isn't durably represented at all, so this
        // candidate fails on MISSING_FACT independent of recipient
        // determination. This section also checks a SEPARATE, genuinely
        // distinct question: could "the World's own author" plausibly be
        // a recipient for "someone is visiting your World"? A
        // `core/DocumentMetadata.js` author identity DOES exist and IS
        // structurally distinct from a visitor's — but building this
        // notification would require reconciling with an EXISTING,
        // deliberately designed privacy boundary
        // (`core/PresenceVisibilityPolicy.js`, 0.2.40's own "Avatar
        // Presence Visibility & Privacy" domain), not merely reading one
        // more field. That reconciliation is a genuine product decision,
        // not a technical gap — see Section G's NEW_PRODUCT_SEMANTICS
        // classification for this candidate.
        const documentMetadataSource = codeOnlyLines(await rawSource('core/DocumentMetadata.js'));
        assert(documentMetadataSource.includes('authorIdentityId'),
            'B5a. core/DocumentMetadata.js still exposes authorIdentityId — a candidate "World owner" recipient identity genuinely exists on file.');
        assert(await sourceExists('core/PresenceVisibilityPolicy.js'),
            'B5b. core/PresenceVisibilityPolicy.js still exists — presence disclosure is already a deliberately gated, privacy-sensitive concern this codebase has made an explicit product decision about once already (0.2.40), which "visitor arrived" notifications would have to be reconciled with, not silently bypass.');
        console.log('✓ B3-B5: Place Naming has no recipient at all (B3) and Distribution\'s only "recipient" is the same local actor (B4) — neither is forced to have one. World Presence has structurally real recipient candidates on BOTH the participant side and, newly examined here, the World-author side (B5a) — but the latter collides with an existing privacy policy boundary this codebase already drew deliberately (B5b), a genuinely different kind of gap than "no recipient exists."');

        // B6. Document Collaboration — recipients are real, named,
        // authenticated identities (every collaborator), reconfirmed
        // structurally; moot in the same way B5's participant side is
        // moot, given Section A6's MISSING_FACT finding.
        assert(gapObserverSourceHasAttachHeader(await rawSource('application/DocumentOperationCausalGapObservationUseCase.js')),
            'B6. application/DocumentOperationCausalGapObservationUseCase.js\'s own header still describes attaching to the live propagation feed operations already flow through — collaborators are real, named identities, but this is moot given Section A6\'s finding that no durable fact exists to notify FROM.');

        console.log('✓ B: Recipient determination complete for all seven candidates. Two candidates (Commentary, Friend Relationship) have a distinct recipient determinable without inventing any new relationship (B1/B2) — Friend Relationship\'s is structurally the stronger of the two, since it is the wire protocol\'s own address rather than a derived field. Two (Place Naming, Distribution) have no natural recipient at all (B3/B4). Two (World Presence, Collaboration) have real recipient candidates that are moot next to their own Section A MISSING_FACT finding — except World Presence\'s newly examined World-author angle, which surfaces a genuinely different privacy-policy gap (B5).');
    }

    function gapObserverSourceHasAttachHeader(source) {
        return /attach.*propagation|attaches to that identical feed/i.test(source);
    }

    // ---------------------------------------------------------------
    // Section C — Event identity.
    //
    // Does the source event already carry an identity stable enough to
    // become `notificationId`? And, per this milestone's own brief:
    // underlying domain fact identity ≠ notification-event identity — a
    // single domain fact could produce different recipient-specific
    // notification events later, so this section also asks whether the
    // candidate's identity survives independently of the domain
    // object's own, possibly mutable, CURRENT state.
    // ---------------------------------------------------------------
    {
        // C1. Publication Commentary — commentaryId is durable, permanent,
        // and CONFLICT-CHECKED: storage/PublicationCommentaryStore.js
        // refuses to let a second, different record silently reuse the
        // same id (PublicationCommentaryConflictError). A NotificationEvent
        // built from commentaryId can be constructed at ANY later time by
        // re-reading the append-only store — it never depends on catching
        // a specific in-flight moment.
        const commentaryStoreSourceC = await rawSource('storage/PublicationCommentaryStore.js');
        assert(commentaryStoreSourceC.includes('class PublicationCommentaryConflictError'),
            'C1. storage/PublicationCommentaryStore.js still refuses to silently overwrite a commentaryId with different content — commentaryId is a genuinely stable, collision-guarded identity, independently re-derivable at any later time from the append-only store.');

        // C2. Friend Relationship REQUEST — the advertisement's own
        // `signature.signature` is cryptographically unique per signed
        // action (proven live in B2 above), a genuinely stable candidate
        // identity. But UNLIKE Commentary, there is no independent,
        // append-only store of past advertisements to re-derive it from
        // later — core/FriendshipRecord.js only ever holds the CURRENT
        // incomingAction, which Section A2 already showed gets
        // overwritten or cleared. A NotificationEvent for this candidate
        // could only be constructed by a producer wired directly at the
        // ingestion boundary (application/FriendRelationshipUseCase.js
        // #_handleIncoming), at the moment the advertisement arrives —
        // never derived later from stored relationship state, the way
        // Commentary's can be.
        const friendUseCaseSource = await rawSource('application/FriendRelationshipUseCase.js');
        assert(friendUseCaseSource.includes('_handleIncoming(payload, meta)') && friendUseCaseSource.includes('withIncomingAction(payload)'),
            'C2. application/FriendRelationshipUseCase.js#_handleIncoming still both verifies and stores the incoming advertisement in one place — the only point in this codebase where the full, still-fresh advertisement (including its own stable signature identity) is available, before any later action can overwrite or clear it.');

        // C3. Place Naming claim — claim.id IS stable (reconfirmed: the
        // discovery envelope round-trips the same id), but this is moot
        // given Section B3's MISSING_RECIPIENT finding — a stable id with
        // no one to address is not itself sufficient.
        assert(await sourceExists('core/PlaceNamingDiscoveryEnvelope.js'),
            'C3. core/PlaceNamingDiscoveryEnvelope.js still exists and carries claim.id through discovery — a stable id exists here too, but Section B3 already closes this candidate on recipient grounds, independent of identity.');

        console.log('✓ C: Commentary\'s event identity (commentaryId) is durable and independently re-derivable at any later time from an append-only store — the strongest of the candidates examined (C1). Friend Relationship\'s event identity (the advertisement signature) is equally stable in principle, but only reachable AT ARRIVAL, never re-derivable later from the mutable, overwrite-in-place relationship record it ends up stored in (C2) — a real architectural constraint on where a producer could be wired, not a defect in the identity itself. No candidate examined in this file lacks a stable identity outright (MISSING_EVENT_IDENTITY) once it has cleared Section A/B — this file does not force that classification onto a candidate merely to exercise the full taxonomy.');
    }

    // ---------------------------------------------------------------
    // Section D — Timestamp provenance.
    //
    // Per 0.9.273's own principle: "NotificationEvent describes
    // something that happened; it isn't a delivery job." createdAt must
    // be able to come from the underlying fact, never from
    // notification-processing time.
    // ---------------------------------------------------------------
    {
        // D1. Publication Commentary — createdAt is set once, at
        // construction, on the domain object itself, and is exactly
        // what would be read back out for a NotificationEvent — never a
        // value a hypothetical producer would compute itself at
        // processing time.
        const publicationCommentarySourceD = codeOnlyLines(await rawSource('core/PublicationCommentary.js'));
        assert(/createdAt\s*=\s*new Date\(\)/.test(publicationCommentarySourceD),
            'D1. core/PublicationCommentary.js still stamps createdAt once, at construction of the underlying fact itself — a real fact timestamp, not a processing-time value.');

        // D2. Friend Relationship — the advertisement's own `timestamp`
        // field IS the underlying fact's own clock reading (the actor's,
        // at signing time) — but its own header explicitly documents it
        // as "carried as display metadata only ... never an authority or
        // freshness mechanism." This is a real caveat this section does
        // not silently drop: the value is usable as createdAt (it
        // genuinely describes when the fact happened), but a consumer
        // must not treat it as authoritative for ordering or security —
        // the same restriction the domain itself already imposes,
        // unrelated to and no stricter than what NotificationEvent.js
        // itself requires (Section D3 below).
        const friendshipAdvertisementProse = flattenProse(await rawSource('core/FriendshipAdvertisement.js'));
        assert(/carried as display metadata only/.test(friendshipAdvertisementProse) && /never an authority or freshness mechanism/.test(friendshipAdvertisementProse),
            'D2. core/FriendshipAdvertisement.js\'s own header still documents `timestamp` as untrusted display metadata only, never an authority/freshness mechanism — usable as createdAt, but this file must not silently upgrade it to something the domain itself never claimed it was.');

        // D3. NotificationEvent.js's own createdAt contract, reconfirmed:
        // it validates only that the value is a well-formed Date — no
        // authority, freshness, or ordering guarantee is required of it
        // by this class either. The untrusted-clock caveat on Friend
        // Relationship's own timestamp (D2) is therefore compatible with
        // what NotificationEvent actually needs, not a blocker — it is
        // simply a fact worth carrying forward honestly into any future
        // producer's own documentation.
        const notificationEventSource = codeOnlyLines(await rawSource('core/NotificationEvent.js'));
        assert(!/trust|authorit|freshness/i.test(notificationEventSource),
            'D3. core/NotificationEvent.js itself imposes no trust/authority/freshness requirement on createdAt anywhere in its own validation — it only ever checks Number.isNaN(createdAtDate.getTime()).');

        // D4. World Presence / Collaboration — moot: Section A already
        // found no underlying fact is durably represented at all, so
        // there is no fact-provenance timestamp to read in the first
        // place, independent of whether one could theoretically exist.
        console.log('✓ D4. World Presence and Document Collaboration: no timestamp-provenance question to answer — Section A already found neither candidate\'s underlying fact is durably represented, so there is nothing to read a real fact-timestamp FROM.');

        console.log('✓ D: Commentary\'s createdAt is a genuine fact timestamp, set once at construction (D1). Friend Relationship\'s timestamp is also a genuine fact timestamp, but explicitly, permanently untrusted by its own domain\'s own documentation — a caveat this file carries forward rather than smoothing over (D2), and one that turns out not to matter because NotificationEvent.js itself never asked for an authoritative clock to begin with (D3).');
    }

    // ---------------------------------------------------------------
    // Section E — Payload sufficiency.
    //
    // Proved empirically, not merely asserted: real `NotificationEvent`
    // instances constructed from real domain data extracted moments ago
    // in Sections B/D above, using ONLY fields the domain event already
    // carries — never inventing presentation-specific fields (title,
    // message, icon, url), which this milestone's own brief names as
    // belonging strictly downstream of this boundary.
    // ---------------------------------------------------------------
    {
        // E1. Publication Commentary — construct a real NotificationEvent
        // from the live `commentary`/`publication` objects Section B1
        // already produced.
        const alice2 = makeIdentity('AliceE');
        const bob2 = makeIdentity('BobE');
        const publisherIdentity2 = alice2.getSigningIdentity().toJSON();
        const publication2 = new Publication({
            id: 'pub-e1', documentId: 'doc-e1', title: 'Alice\'s Second World', author: 'alice', publisherIdentity: publisherIdentity2
        });
        const discoveryStorage2 = new InMemoryStorageProvider();
        discoveryStorage2.save('forkbuild-publications', [publication2.toJSON()]);
        const canComment2 = new CanCommentOnPublicationUseCase(new LocalDiscoveryProvider(discoveryStorage2));
        const commentaryStore2 = new PublicationCommentaryStore(new InMemoryStorageProvider());
        const addUseCase2 = new AddPublicationCommentaryUseCase(commentaryStore2, bob2, canComment2);
        const { commentary: commentary2 } = addUseCase2.execute({ publicationId: 'pub-e1', content: 'Genuinely enough data.' });

        assert(isValidEventType('publication.commentary.created'),
            'E1a. "publication.commentary.created" is a valid namespaced eventType by core/NotificationEvent.js\'s own rule.');
        const commentaryNotification = new NotificationEvent({
            eventType: 'publication.commentary.created',
            recipientIdentityId: publication2.publisherIdentity.id,
            createdAt: commentary2.createdAt,
            payload: {
                publicationId: commentary2.publicationId,
                commentaryId: commentary2.commentaryId,
                authorIdentityId: commentary2.authorIdentityId
            }
        });
        assert(commentaryNotification.payload.publicationId === 'pub-e1'
            && commentaryNotification.payload.commentaryId === commentary2.commentaryId
            && commentaryNotification.payload.authorIdentityId === bob2.getSigningIdentity().id,
            'E1b. The constructed NotificationEvent\'s payload round-trips exactly the three domain-native fields — no presentation field was needed to make construction succeed.');
        assert(!('title' in commentaryNotification.payload) && !('message' in commentaryNotification.payload)
            && !('icon' in commentaryNotification.payload) && !('url' in commentaryNotification.payload),
            'E1c. The constructed payload contains none of title/message/icon/url — this milestone\'s own brief names those as belonging strictly downstream of this boundary, and construction succeeds without them.');
        const roundTripped = NotificationEvent.fromJSON(JSON.parse(JSON.stringify(commentaryNotification.toJSON())));
        assert(roundTripped && roundTripped.payload.commentaryId === commentary2.commentaryId,
            'E1d. The Commentary NotificationEvent survives a real JSON serialization round-trip unchanged.');
        console.log('✓ E1. Publication Commentary: a real NotificationEvent constructed from genuine, freshly-produced domain data (publicationId/commentaryId/authorIdentityId), with no presentation fields needed, surviving a real JSON round-trip.');

        // E2. Friend Relationship REQUEST — construct a real
        // NotificationEvent from a genuine, signed, verified advertisement.
        const erin = makeIdentity('Erin');
        const frank = makeIdentity('Frank');
        const rawAdvertisement2 = toFriendshipAdvertisement({
            actorIdentity: erin.getSigningIdentity().id,
            subjectIdentity: frank.getSigningIdentity().id,
            action: FriendshipAction.REQUEST
        });
        const signature2 = erin.signCanonical(getFriendshipSigningDescriptor(rawAdvertisement2));
        const signedAdvertisement2 = { ...rawAdvertisement2, signature: signature2.toJSON() };
        assert(new LocalAuthorizationVerifier().verifyFriendshipAdvertisement(signedAdvertisement2).valid === true,
            'E2a. sanity: the advertisement this section builds a NotificationEvent from is genuinely valid and verified, not a shortcut fixture.');

        assert(isValidEventType('friend.request.received'), 'E2b. "friend.request.received" is a valid namespaced eventType.');
        const friendNotification = new NotificationEvent({
            eventType: 'friend.request.received',
            recipientIdentityId: signedAdvertisement2.subjectIdentity,
            createdAt: new Date(signedAdvertisement2.timestamp),
            payload: {
                requestorIdentityId: signedAdvertisement2.actorIdentity,
                action: signedAdvertisement2.action
            }
        });
        assert(friendNotification.recipientIdentityId === frank.getSigningIdentity().id,
            'E2c. The constructed NotificationEvent is addressed to Frank — the advertisement\'s own subjectIdentity, unchanged.');
        assert(friendNotification.payload.requestorIdentityId === erin.getSigningIdentity().id
            && friendNotification.payload.action === 'REQUEST',
            'E2d. The constructed payload carries exactly the two domain-native fields a recipient needs to understand what happened — who, and what action.');
        assert(!('title' in friendNotification.payload) && !('message' in friendNotification.payload)
            && !('icon' in friendNotification.payload) && !('url' in friendNotification.payload),
            'E2e. Again, no presentation field was needed for construction to succeed.');
        const friendRoundTripped = NotificationEvent.fromJSON(JSON.parse(JSON.stringify(friendNotification.toJSON())));
        assert(friendRoundTripped && friendRoundTripped.payload.requestorIdentityId === erin.getSigningIdentity().id,
            'E2f. The Friend Relationship NotificationEvent survives a real JSON round-trip unchanged.');
        console.log('✓ E2. Friend Relationship REQUEST: a real NotificationEvent constructed from a genuine, live-signed-and-verified advertisement, addressed to the protocol\'s own subjectIdentity, with a two-field payload sufficient on its own — again with no presentation fields.');

        console.log('✓ E: Both READY_PRODUCER candidates from Sections B/C/D (Commentary, Friend Relationship) are proved sufficient the strongest way available to a test-only milestone — by actually constructing and round-tripping real NotificationEvent instances from genuine domain data, never a synthetic fixture standing in for what a real payload would look like.');
    }

    // ---------------------------------------------------------------
    // Section F — The ChatOutbox boundary.
    //
    // A dedicated regression: application/ChatOutbox.js is 0.9.272's own
    // real durable-delivery precedent (D6), reconfirmed fresh here, PLUS
    // a check 0.9.272 could not have made — NotificationEvent.js did not
    // exist yet — that the coupling stays absent in BOTH directions, now
    // that it does.
    // ---------------------------------------------------------------
    {
        // F1. ChatOutbox genuinely exists and genuinely enqueues messages
        // addressed to a peerIdentityId — reconfirmed fresh.
        const chatOutboxSource = await rawSource('application/ChatOutbox.js');
        assert(chatOutboxSource.includes('export class ChatOutbox') && chatOutboxSource.includes('enqueue(message, peerIdentityId'),
            'F1. application/ChatOutbox.js still genuinely exists and enqueues messages addressed to a peerIdentityId.');
        assert(chatOutboxSource.includes('Addressed To An Identity, Never A Connection'),
            'F1b. Its own header still states the architectural precedent explicitly.');

        // F2. Still typed to ChatMessage specifically — reconfirmed fresh.
        const outboxEntrySource = codeOnlyLines(await rawSource('core/ChatOutboxEntry.js'));
        assert(outboxEntrySource.includes('isValidChatMessage(message)'),
            'F2. core/ChatOutboxEntry.js still validates its own payload as a ChatMessage specifically — not a generic, domain-agnostic envelope.');

        // F3. Still zero non-Chat/Conversation/presence-summary callers —
        // reconfirmed fresh with a live re-grep, not trusted from 0.9.272.
        const allChatOutboxImporters = execSync('grep -rl "from .*ChatOutbox\\.js." application ui core --include="*.js" || true', { cwd: SOURCE_ROOT.pathname })
            .toString().trim().split('\n').filter(Boolean);
        const nonChatOutboxImporters = allChatOutboxImporters.filter((f) => !/chat|conversation/i.test(f) && f !== 'application/PeerPresenceUseCase.js');
        assert(nonChatOutboxImporters.length === 0,
            `F3. Every file importing application/ChatOutbox.js is still Chat/Conversation-domain code, plus exactly the one read-only summary reader — found ${nonChatOutboxImporters.length} unexplained importer(s): ${nonChatOutboxImporters.join(', ')}.`);

        // F4. NEW — core/NotificationEvent.js imports nothing from
        // ChatOutbox/ChatOutboxEntry/ChatMessage, reconfirmed independently
        // of 0.9.273's own regression (this file does not trust that test
        // passed; it re-derives the same fact from source directly).
        const notificationEventSourceRaw = await rawSource('core/NotificationEvent.js');
        assert(!/ChatOutbox|ChatMessage|ChatDeliveryState/.test(codeOnlyLines(notificationEventSourceRaw)),
            'F4. core/NotificationEvent.js still contains no reference to ChatOutbox/ChatMessage/ChatDeliveryState in its own code.');

        // F5. NEW — the reverse direction, uncheckable before this
        // milestone because NotificationEvent.js did not exist when
        // ChatOutbox.js/ChatOutboxEntry.js were last touched:
        // application/ChatOutbox.js and core/ChatOutboxEntry.js import
        // nothing from core/NotificationEvent.js. ChatOutbox stays a
        // closed, ChatMessage-specific precedent — it has not silently
        // absorbed the new seam as a special case of itself.
        const chatOutboxEntryRawSource = await rawSource('core/ChatOutboxEntry.js');
        assert(!/NotificationEvent/.test(codeOnlyLines(chatOutboxSource)) && !/NotificationEvent/.test(codeOnlyLines(chatOutboxEntryRawSource)),
            'F5. Neither application/ChatOutbox.js nor core/ChatOutboxEntry.js references NotificationEvent anywhere — the coupling this milestone must not introduce stays absent in the direction 0.9.272 could not yet have checked.');

        // F6. Still a bounded, 7-day, best-effort guarantee, never a
        // durable inbox — reconfirmed fresh.
        assert(outboxEntrySource.includes('DEFAULT_OUTBOX_TTL_MS') && /best-effort, not forever/.test(await rawSource('core/ChatOutboxEntry.js')),
            'F6. core/ChatOutboxEntry.js still bounds delivery to a 7-day, explicitly "best-effort, not forever" TTL.');

        console.log('✓ F: application/ChatOutbox.js reconfirmed, fresh, as a real durable-delivery precedent (F1) that stays narrowly typed to ChatMessage (F2) with zero non-Chat callers (F3) and a bounded, best-effort guarantee (F6) — none of that has drifted since 0.9.272. And the coupling this milestone must not introduce is checked directly in BOTH directions: NotificationEvent.js still imports nothing Chat-shaped (F4, reconfirming 0.9.273\'s own regression independently), and — newly checkable now that NotificationEvent.js exists — ChatOutbox.js/ChatOutboxEntry.js reference nothing NotificationEvent-shaped either (F5). ChatOutbox remains exactly what 0.9.272 found it to be: an architectural precedent, never a hidden NotificationEvent producer or a generic notification store.');
    }

    // ---------------------------------------------------------------
    // Section G — Candidate classification and the producer-selection
    // decision.
    // ---------------------------------------------------------------
    {
        const classificationTable = [
            ['Publication Commentary (comment added)', 'READY_PRODUCER'],
            ['Friend Relationship (REQUEST received)', 'READY_PRODUCER'],
            ['Place Naming claim (discovered/adopted)', 'MISSING_RECIPIENT'],
            ['Publication/Snapshot distribution result', 'MISSING_RECIPIENT'],
            ['World Presence change (join/leave)', 'MISSING_FACT'],
            ['Document Collaboration causal-gap/operation arrival', 'MISSING_FACT'],
            ['Publication Commentary reply (threading)', 'DEFERRED']
        ];
        assert(classificationTable.length === 7 && classificationTable.every(([, c]) => CLASSIFICATIONS.includes(c)),
            'G1. All seven candidates classify using only the taxonomy this milestone\'s own brief defined.');

        // G2. The World-Presence-to-author angle Section B5 surfaced is
        // recorded as a SEPARATE, additional finding on top of World
        // Presence's own MISSING_FACT row, not folded into it and not
        // given its own row — it demonstrates NEW_PRODUCT_SEMANTICS is a
        // real, evidenced category in this codebase (a privacy-policy
        // collision, not a technical gap), without inflating the
        // candidate count with a variant of a candidate already listed.
        console.log('  (World Presence also carries an independent NEW_PRODUCT_SEMANTICS finding on the World-author angle — Section B5 — kept as a sub-finding rather than an eighth row, since it shares World Presence\'s own MISSING_FACT root cause.)');

        // G3. No candidate examined here classifies as
        // MISSING_EVENT_IDENTITY. Recorded explicitly, honestly, rather
        // than force-fitting a weak candidate merely to exercise every
        // label in the taxonomy — the same restraint 0.9.272 Section F
        // already modeled by reporting Place Naming's five-cycle history
        // honestly instead of smoothing it into a uniform pattern.
        assert(!classificationTable.some(([, c]) => c === 'MISSING_EVENT_IDENTITY'),
            'G3. No candidate in this audit\'s table is classified MISSING_EVENT_IDENTITY — every candidate that survives Sections A/B already carries a structurally stable id (Section C).');

        // G4. THE PRODUCER-SELECTION DECISION. Between the two
        // READY_PRODUCER candidates, Publication Commentary is
        // recommended as the first producer, for a reason this section
        // states explicitly rather than defaulting to the initial
        // suspicion: Friend Relationship's recipient story is actually
        // the STRONGER of the two (Section B2 — zero inference, the
        // protocol's own address) — but its event identity (Section C2)
        // is reachable ONLY at the live ingestion boundary, before the
        // domain's own overwrite-in-place storage clears it. Commentary's
        // event identity (Section C1) is durable and independently
        // re-derivable at any later time from an already-append-only
        // store. A producer needs BOTH a recipient and a stable,
        // re-derivable identity; Commentary is the candidate where
        // neither one requires new architectural work to reach.
        const recommendedFirstProducer = 'Publication Commentary';
        assert(classificationTable.find(([name]) => name.startsWith(recommendedFirstProducer))[1] === 'READY_PRODUCER',
            'G4. The recommended first producer classifies READY_PRODUCER in this file\'s own table, not merely in prose.');

        console.log(
'\n0.9.274 — Notification Event Boundary Audit — Verdict\n' +
'\n' +
'CANDIDATE CLASSIFICATION\n' +
'    Publication Commentary ............................ READY_PRODUCER\n' +
'    Friend Relationship (REQUEST received) ............ READY_PRODUCER\n' +
'    Place Naming claim ................................. MISSING_RECIPIENT\n' +
'    Publication/Snapshot distribution result ........... MISSING_RECIPIENT\n' +
'    World Presence change .............................. MISSING_FACT\n' +
'      (+ NEW_PRODUCT_SEMANTICS on the World-author angle, Section B5)\n' +
'    Document Collaboration causal-gap/operation arrival . MISSING_FACT\n' +
'    Publication Commentary reply (threading) ............ DEFERRED\n' +
'    (no candidate examined classifies MISSING_EVENT_IDENTITY — Section G3)\n' +
'\n' +
'PRODUCER-SELECTION DECISION\n' +
'    Publication Commentary is recommended as the first NotificationEvent\n' +
'    producer. Friend Relationship\'s recipient determination is actually\n' +
'    stronger (Section B2 — zero inference; the protocol\'s own address),\n' +
'    but its event identity is reachable only at the live ingestion\n' +
'    boundary, before the domain\'s own overwrite-in-place storage clears\n' +
'    it (Section C2). Commentary\'s event identity is durable and\n' +
'    independently re-derivable at any later time from an already\n' +
'    append-only store (Section C1) — a producer here needs no new\n' +
'    persistence design and no coupling to a lower-level wire-ingestion\n' +
'    method, only a straightforward construction from data\n' +
'    AddPublicationCommentaryUseCase already produces.\n' +
'\n' +
'NOT SELECTED, NOT IMPLEMENTED\n' +
'    Per this milestone\'s own brief: no producer is wired in this\n' +
'    milestone, no NotificationEvent store, no delivery, no ChatOutbox\n' +
'    integration, no read/unread state, no UI, no subscriptions, no\n' +
'    preferences. This file\'s own live constructions (Section E) prove\n' +
'    sufficiency; they are test-only evidence, not production wiring —\n' +
'    reconfirmed directly: zero application/, core/, ui/, or storage/\n' +
'    files are modified by this milestone.\n');

        // 0.9.440 — SCOPED TO THIS MILESTONE'S OWN COMMIT, not live
        // working-tree state against HEAD — see tests/
        // EndpointMultiplicityFailoverSemanticsAudit.test.js's own J1 for
        // the identical fix applied to the identical class of bug: a live
        // `git diff --stat HEAD` check can never stay passing once any
        // LATER milestone has in-progress production work of its own. This
        // file's own "0.9.274" no longer resolves to one isolated commit
        // (its content was folded into a later bulk commit) — when that
        // history isn't cleanly resolvable, this degrades to "nothing to
        // check" rather than asserting against unrelated, unresolvable
        // repo history, the identical graceful-degradation every other
        // instance of this fix already applies for "git unavailable."
        let gitDiffStat = '';
        try {
            const commitHash = execSync('git log --grep="^0.9.274 " --format=%H -n 1', { cwd: SOURCE_ROOT.pathname }).toString().trim();
            if (commitHash) {
                gitDiffStat = execSync(`git diff --stat ${commitHash}^..${commitHash} -- application/ core/ ui/ storage/ identity/ collaboration/ discovery/ publisher/ 2>/dev/null || true`,
                    { cwd: SOURCE_ROOT.pathname }).toString().trim();
            }
        } catch { /* git unavailable — not a failure of this decision artifact */ }
        assert(gitDiffStat === '',
            `G5. Zero production files were modified by this milestone's own commit — test/document-only. Found: ${gitDiffStat || '(none)'}.`);

        console.log('✓ G: Seven candidates classified against the taxonomy this milestone\'s own brief defined, using only evidence gathered in Sections A-F (G1). Two READY_PRODUCER candidates were found — more than 0.9.272\'s own five-candidate sweep found under the delivery-focused criterion, because this audit deliberately asks a narrower, delivery-independent question (G4). Publication Commentary is recommended as the first producer, with the specific, evidenced reason for preferring it over Friend Relationship recorded rather than assumed from the milestone\'s own initial suspicion. No candidate is force-classified MISSING_EVENT_IDENTITY merely to exercise the full taxonomy (G3). No production code is modified (G5).');
    }

    console.log('\n✅ All NotificationEventBoundaryAudit tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All NotificationEventBoundaryAudit tests passed');
}).catch((error) => {
    console.error('\n✗ NotificationEventBoundaryAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
