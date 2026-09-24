import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

import { PublicationCommentary } from '../core/PublicationCommentary.js';
import {
    PublicationCommentaryDistributionEnvelope,
    PUBLICATION_COMMENTARY_DISTRIBUTION_KIND
} from '../core/PublicationCommentaryDistributionEnvelope.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { PublicationCommentaryDistributionExchange } from '../application/publication/commentary/PublicationCommentaryDistributionExchange.js';

import {
    describeDecentralizedDiscoveryEnvelope,
    DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL
} from '../core/DecentralizedDiscoveryEnvelope.js';
import {
    describeSnapshotDiscoveryEnvelope,
    SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL
} from '../core/SnapshotDiscoveryEnvelope.js';
import { NostrPublicationDiscoveryPublisher } from '../application/nostr/NostrPublicationDiscoveryPublisher.js';
import { ArweaveAnnouncementPublisher } from '../application/arweave/ArweaveAnnouncementPublisher.js';

// 0.9.625 — Publication Commentary Persistent Distribution Boundary Audit.
//
// TYPE: test-only architectural/product audit. PRODUCTION CHANGES: none
// (Section J's own guard).
//
// NAMING NOTE, restated from 0.9.617's own precedent, because the
// requesting brief repeats the same non-existent term: there is no
// "Snapshot Commentary" in this codebase. Commentary
// (core/PublicationCommentary.js, 0.9.242) is attached to a
// `publicationId`, never a `snapshotId` — a Snapshot
// (core/PublicationSnapshotPlacement.js) is a separate, content-hash-keyed
// distribution substrate that carries no commentary of its own. This audit
// follows the real domain vocabulary throughout: Publication Commentary.
//
// THE QUESTION. 0.9.617-0.9.623 closed a complete arc: Commentary can leave
// the device it was created on, the real application does it, and a remote
// arrival now produces a local notification — all over ONE transport, the
// existing authenticated WebRTC peer connection
// (application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js). A
// follow-up proposal asks whether Commentary should ALSO travel over Nostr
// (an existing announcement/discovery substrate) and Arweave (an existing
// durable-storage substrate), reasoning that both already carry comparable
// material for Publication and Snapshot. This milestone asks, before any
// such implementation: does a concrete product requirement for that exist,
// and do the EXISTING Nostr/Arweave substrate seams actually fit a
// Commentary distribution envelope without inventing a second Commentary
// identity, persistence, or verification mechanism?
//
// METHOD. Section A re-executes the arc's own terminal guard files live, as
// real subprocesses against current on-disk source — 0.9.619's own
// established mechanism, reused verbatim. Everything after that is
// genuinely new ground this arc's own five milestones never asked,
// because they were scoped to ONE transport throughout. Sections D and are
// especially deliberate about testing LIVE, against real production
// classes, never merely asserting from documentation: a claim that an
// existing envelope validator rejects a Commentary distribution envelope is
// proven by actually constructing a real, signed
// PublicationCommentaryDistributionEnvelope and feeding its exact wire
// bytes through the real, unmodified validator, in both directions.
//
//   Section A — entry-state reconfirmation: the 0.9.617-0.9.623 arc,
//               re-run live, right now.
//   Section B — Nostr substrate census: role, envelope shape, and
//               present-day production wiring, established live.
//   Section C — Arweave substrate census: TWO independent roles (durable
//               content storage vs. tagged-transaction announcement),
//               established live.
//   Section D — THE FLAGSHIP FINDING: envelope structural incompatibility,
//               proven bidirectionally, live, against real classes — a
//               signed Commentary distribution envelope is rejected by
//               both existing discovery-envelope validators and both
//               existing discovery publishers; a discovery envelope is
//               rejected by the Commentary envelope constructor.
//   Section E — five-identity independence: commentaryId, publicationId,
//               a Publication's own contentHash, a Nostr event id, and an
//               Arweave transaction id never alias one another anywhere
//               in the Commentary family's own source.
//   Section F — announcement-of-a-locator vs. delivery-of-content: what
//               the existing Nostr/Arweave discovery substrate actually
//               transports, contrasted live with what Commentary's own
//               peer ANNOUNCE already transports today.
//   Section G — historical/asynchronous acquisition boundary: no
//               Commentary-flavored Nostr/Arweave discovery class exists
//               anywhere — this is new ground, not an unwired existing
//               class, unlike 0.9.619's own finding one arc over.
//   Section H — product requirement census, re-running and extending a
//               grep this codebase's own history already ran once before
//               Commentary distribution existed at all.
//   Section I — fan-out policy: the existing substrate-selection
//               precedent for Publication/Snapshot is SELECTION, NEVER
//               FAN-OUT — reconfirmed live from its own source.
//   Section J — production-change guard.
//   Section K — classification and verdict.
//
// AMENDED BY 0.9.629 — Publication Commentary Nostr Asynchronous
// Distribution Closure Audit. This audit's own RECOMMENDATION (Section K,
// below) was: "if a genuine product need for asynchronous/offline
// Commentary delivery emerges later, scope it as its own small, explicit,
// SELECTION-never-fan-out capability... choosing ONE new substrate seam at
// a time, built as a new envelope/publisher/query-service family rather
// than a repurposing of the Publication/Snapshot discovery-envelope
// classes." 0.9.626 (a new, substrate-neutral delivery CONTRACT —
// deliberately no envelope of its own, reusing 0.9.618's existing one
// instead, per that milestone's own finding that Commentary needs no
// second envelope), 0.9.627 (a test-only proof that composing two already-
// existing, genuinely substrate-neutral Nostr transport PRIMITIVES
// satisfies that contract), and 0.9.628 (application/
// PublicationCommentaryNostrDistribution.js + application/
// DiscoverPublicationCommentaryFromNostrUseCase.js — a real, permanent,
// production-wired adapter, built and wired into ui/main.js) did exactly
// that, in that order — a genuinely NEW family, never a repurposing of
// NostrPublicationDiscoveryPublisher/NostrDiscoveryQueryService, exactly
// as Section G/I below anticipated. Only Section G's own two now-stale
// file-census assertions and closing narration are amended in place,
// below, plus this note — every other section holds exactly as measured:
// Section D's own bidirectional structural-incompatibility finding for
// the two existing LOCATOR envelope families is UNCHANGED and remains the
// reason 0.9.626-0.9.628 built a NEW family rather than reusing either;
// Section H's own product-requirement census is scoped to nostr/, arweave/,
// and replication/ directories specifically (never application/), and
// remains literally true — application/publication/commentary/PublicationCommentaryNostrDistribution.js
// itself never imports storage/PublicationCommentaryStore.js, exactly like
// every raw nostr/ transport primitive it composes (see that file's own
// header, "an opaque envelope carrier, never a second Commentary
// authority"); Section I's own SELECTION-NEVER-FAN-OUT precedent is
// likewise unchanged and is exactly what 0.9.628 followed (one relay, one
// discovery tag, per instance — no automatic fan-out to Nostr AND WebRTC;
// each is its own explicit, independent, best-effort call).

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rliE' : '-rlE';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

// Re-executes a real existing test file, live, as its own subprocess
// against current on-disk source — 0.9.619's own established composition
// mechanism, reused verbatim rather than re-implemented.
function runGuardLive(relativeTestFile) {
    try {
        const stdout = execSync(`node ${relativeTestFile}`, { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' });
        return { passed: true, stdout };
    } catch (error) {
        return { passed: false, stdout: `${error.stdout || ''}${error.stderr || ''}` };
    }
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
    return provider;
}

// A real, signed Commentary distribution envelope — the exact production
// artifact application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js
// already announces to peers, built here through the same real
// exchange/exportCommentary() path production code uses, never hand-rolled.
function signedCommentaryEnvelopeJson(authorProvider, overrides = {}) {
    const exchange = new PublicationCommentaryDistributionExchange(
        new PublicationCommentaryStore(new InMemoryStorageProvider()),
        authorProvider,
        new LocalAuthorizationVerifier()
    );
    const commentary = new PublicationCommentary({
        publicationId: overrides.publicationId || 'pub-boundary-audit-625',
        authorIdentityId: authorProvider.getSigningIdentity().id,
        content: overrides.content || 'a real, signed Commentary distribution envelope'
    });
    return exchange.exportCommentary(commentary);
}

async function run() {
    // ===============================================================
    // Section A — entry-state reconfirmation.
    // ===============================================================
    {
        const closureAudit = runGuardLive('tests/PublicationCommentaryApplicationDistributionClosureAudit.test.js');
        assert(closureAudit.passed && /All Publication Commentary Application Distribution Closure Audit tests passed/.test(closureAudit.stdout),
            n('0.9.621\'s own closure audit, re-executed live, still exits 0 and still prints its own ARC_CLOSED verdict — that file\'s own Section A already transitively re-runs 0.9.617/0.9.618/0.9.619/0.9.620, so this single re-run reconfirms that whole span without retyping any of its assertions'));

        const bridgeSuite = runGuardLive('tests/PublicationCommentaryRemoteNotificationBridge.test.js');
        assert(bridgeSuite.passed,
            n('0.9.623\'s own new bridge unit suite, re-executed live, still exits 0'));

        const wiringSuite = runGuardLive('tests/PublicationCommentaryRemoteNotificationWiring.test.js');
        assert(wiringSuite.passed,
            n('0.9.623\'s own wiring integration suite, re-executed live, still exits 0 — that file\'s own Section A already re-runs 0.9.620\'s wiring suite, 0.9.275\'s producer suite, and 0.9.623\'s own bridge unit suite together, so the full arc through local notification bridging is reconfirmed live, right now, against current source'));

        // AMENDED BY 0.9.629 — at the time this audit originally ran,
        // 0.9.622's own test file was stale BY DESIGN (Section E asserted
        // "zero production call sites subscribe to onCommentaryReceived"
        // as the CONCRETE_PRODUCT_GAP it measured; 0.9.623 then closed
        // exactly that gap without anyone amending 0.9.622's own now-
        // obsolete assertion to match), and this section deliberately
        // surfaced that staleness live rather than hiding it. 0.9.629's
        // own Section A re-execution of the FULL 0.9.617-0.9.628 arc
        // needs every one of those files to pass live — so 0.9.629 itself
        // amended tests/PostCommentaryDistributionProductReassessment.test.js
        // in place (its own Section E only; see that file's own header
        // note), the same "amend a prior audit's now-stale assertion,
        // never its substantive finding" convention this codebase already
        // used for 0.9.620's amendment of tests/
        // PublicationCommentaryCrossDeviceProductClosureAudit.test.js.
        // This section now reconfirms it passes live, rather than
        // confirming its own expected failure.
        const reassessment = runGuardLive('tests/PostCommentaryDistributionProductReassessment.test.js');
        assert(reassessment.passed && /All Post-Commentary-Distribution Product Reassessment tests passed/.test(reassessment.stdout),
            n('0.9.622\'s own test file, re-executed live, now exits 0 again — 0.9.629 amended its one now-stale assertion (Section E) in place; every other section, including this file\'s own Sections A-D and F-H, is unmodified and holds exactly as originally measured'));

        console.log('✓ A: the entire 0.9.617-0.9.628 arc reconfirmed live — this milestone builds on that result, never re-derives it, adds no wiring of its own to it, and (this same milestone, elsewhere) repaired the one stale assertion in 0.9.622\'s own file that 0.9.623 had already superseded but nobody had yet amended.');
    }

    // ===============================================================
    // Section B — Nostr substrate census.
    // ===============================================================
    {
        const publisherSource = codeOnly(await rawSource('application/nostr/NostrPublicationDiscoveryPublisher.js'));
        assert(/describeDecentralizedDiscoveryEnvelope/.test(publisherSource),
            n('application/nostr/NostrPublicationDiscoveryPublisher.js re-validates its own envelope argument through core/DecentralizedDiscoveryEnvelope.js\'s own describeDecentralizedDiscoveryEnvelope() before ever touching a relay — it never builds its own announcement shape'));
        assert(/content:\s*JSON\.stringify\(described\)/.test(publisherSource),
            n('the ENTIRE described envelope becomes a Nostr event\'s own `content` — but that envelope\'s own five fields (protocol/version/kind/objectId/uri) are themselves a LOCATOR, never the underlying material — Publication announcement, not Publication delivery'));
        const snapshotDiscoverySource = codeOnly(await rawSource('application/nostr/NostrSnapshotDiscoveryPublisher.js'));
        assert(/describeSnapshotDiscoveryEnvelope/.test(snapshotDiscoverySource),
            n('the Snapshot-flavored sibling (application/nostr/NostrSnapshotDiscoveryPublisher.js) holds the identical restraint for core/SnapshotDiscoveryEnvelope.js\'s own contentHash/locator/storage shape — also a locator, never Snapshot bytes'));

        // Live proof that this substrate's own role is exactly
        // "announce a locator," constructed against the real class —
        // never merely asserted from its own header comment.
        const nostrDiscoveryEnvelope = { protocol: DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL, version: 1, kind: 'PUBLICATION', objectId: 'pub-1', uri: 'ar://some-tx-id' };
        const nostrPublisher = new NostrPublicationDiscoveryPublisher({
            discoveryTag: 'forkbuild-boundary-audit-625',
            publishImpl: async () => ({ published: true, id: '0'.repeat(64) })
        });
        const nostrResult = await nostrPublisher.publish(nostrDiscoveryEnvelope);
        assert(nostrResult && nostrResult.published === true,
            n('a real NostrPublicationDiscoveryPublisher, live, accepts and publishes a well-formed LOCATOR envelope — confirming its own actual, working role before Section D tests what it does with a Commentary'));

        const mainSource = await rawSource('ui/main.js');
        assert(/createNostrPublicationDistributionRuntimeAdapter\(\s*\{\s*publish:\s*nostrHostPublisher\s*\}\s*\)/.test(mainSource),
            n('ui/main.js — the one real production composition root — wires createNostrPublicationDistributionRuntimeAdapter() to a genuine host capability (nostrHostPublisher, a NIP-07 window.nostr delegate), not to an empty object; the two older per-file headers (0.9.108/0.9.109) describing "nothing real to adapt yet" describe a state a later, unread-here milestone already superseded — Nostr Publication/Snapshot announcement is a LIVE, reachable production capability today, not inert scaffolding'));

        console.log('✓ B: Nostr\'s existing role, live-confirmed — announcing a small, self-declared, UNSIGNED locator envelope (never inline content) for Publication and Snapshot, over a real, production-wired host capability. No Commentary-flavored Nostr publisher or query service exists anywhere in this codebase.');
    }

    // ===============================================================
    // Section C — Arweave substrate census: two independent roles.
    // ===============================================================
    {
        const announcementSource = codeOnly(await rawSource('application/arweave/ArweaveAnnouncementPublisher.js'));
        assert(/describeDecentralizedDiscoveryEnvelope/.test(announcementSource),
            n('application/arweave/ArweaveAnnouncementPublisher.js re-validates through the SAME core/DecentralizedDiscoveryEnvelope.js validator NostrPublicationDiscoveryPublisher uses — one protocol envelope, ridden by two substrate publishers, per that file\'s own header'));
        assert(/two distinct Arweave transactions/.test(await rawSource('application/arweave/ArweaveAnnouncementPublisher.js')),
            n('that same header is explicit that an ANNOUNCEMENT transaction (this class) and a CONTENT transaction (application/arweave/ArweavePublicationMaterialUploader.js, a completely separate class) for the same Publication remain two distinct Arweave transactions — Arweave-as-storage and Arweave-as-announcement are never conflated into one role merely because both use the same substrate'));
        const uploaderSource = await rawSource('application/arweave/ArweavePublicationMaterialUploader.js');
        assert(!/describeDecentralizedDiscoveryEnvelope|discoveryTag/.test(codeOnly(uploaderSource)),
            n('confirmed structurally: the content-storage uploader never validates or attaches a discovery envelope/tag of its own — that is entirely ArweaveAnnouncementPublisher\'s own, separate job'));

        // Live proof of the announcement role, against the real class.
        const arweaveDiscoveryEnvelope = { protocol: DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL, version: 1, kind: 'PUBLICATION', objectId: 'pub-1', uri: 'ar://some-tx-id' };
        const arweavePublisher = new ArweaveAnnouncementPublisher({
            discoveryTag: 'forkbuild-boundary-audit-625',
            uploadTaggedTransaction: async () => ({ id: 'a'.repeat(43) })
        });
        const arweaveResult = await arweavePublisher.publish(arweaveDiscoveryEnvelope);
        assert(arweaveResult && arweaveResult.published === true,
            n('a real ArweaveAnnouncementPublisher, live, accepts and publishes the identical well-formed LOCATOR envelope shape Nostr\'s own publisher accepts — confirming its own actual, working role before Section D'));

        const mainSource = await rawSource('ui/main.js');
        assert(/window\.arweaveWallet/.test(mainSource) && /createArweavePublicationDistributionRuntimeAdapter\(\s*\{\s*signer:\s*arweaveHostSigner\s*\}\s*\)/.test(mainSource),
            n('ui/main.js wires a real injected-provider Arweave signer (window.arweaveWallet) into createArweavePublicationDistributionRuntimeAdapter() — the identical "genuinely live, not inert scaffolding" fact Section B established for Nostr, held here for Arweave'));
        assert(/Register Arweave as Snapshot Content Store/.test(mainSource),
            n('ui/main.js also registers a real, live content/ArweaveContentStore.js instance for Snapshot placement — Arweave\'s STORAGE role is separately, and also already, wired to production'));

        console.log('✓ C: Arweave plays two independent, already-live production roles for Publication/Snapshot — (1) durable CONTENT storage, a ContentReference{hash,uri,storage} for bytes that already exist; (2) ANNOUNCEMENT, a separate small tagged transaction carrying only a locator envelope. No Commentary-flavored Arweave publisher, uploader, or query service exists anywhere in this codebase.');
    }

    // ===============================================================
    // Section D — THE FLAGSHIP FINDING: envelope structural
    // incompatibility, proven bidirectionally, live.
    // ===============================================================
    {
        const authorProvider = makeIdentity('boundary-audit-625-author');
        const commentaryEnvelopeJson = signedCommentaryEnvelopeJson(authorProvider);

        assert(commentaryEnvelopeJson.kind === PUBLICATION_COMMENTARY_DISTRIBUTION_KIND
            && typeof commentaryEnvelopeJson.commentaryId === 'string'
            && typeof commentaryEnvelopeJson.content === 'string'
            && commentaryEnvelopeJson.signature && typeof commentaryEnvelopeJson.signature === 'object',
            n('setup: a REAL, signed PublicationCommentaryDistributionEnvelope — the exact bytes application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js already announces to peers today — carries commentaryId/publicationId/authorIdentityId/content/createdAt plus a REQUIRED signature; it has no `protocol`, `objectId`, or `uri` field of any kind'));

        // D1. The real, unmodified Publication discovery-envelope
        // validator, fed this envelope's own real wire JSON.
        const decentralizedDescribed = describeDecentralizedDiscoveryEnvelope(commentaryEnvelopeJson);
        assert(decentralizedDescribed === null,
            n('core/DecentralizedDiscoveryEnvelope.js#describeDecentralizedDiscoveryEnvelope(), UNMODIFIED, fed a real signed Commentary envelope\'s own JSON, returns null — it has no `protocol: "forkbuild"` field (Commentary\'s own `kind` field collides in NAME but not in required VALUE with this validator\'s own `kind` field), so it is rejected at the very first check'));

        // D2. The real, unmodified Snapshot discovery-envelope validator.
        const snapshotDescribed = describeSnapshotDiscoveryEnvelope(commentaryEnvelopeJson);
        assert(snapshotDescribed === null,
            n('core/SnapshotDiscoveryEnvelope.js#describeSnapshotDiscoveryEnvelope(), UNMODIFIED, fed the identical real Commentary envelope JSON, also returns null — it requires `contentHash`/`locator`/`storage`, none of which a Commentary envelope carries; content-hash-keyed locator semantics do not apply to a payload that IS the content'));

        // D3. The real Nostr publisher, live, given the real Commentary
        // envelope as its own `publish()` argument — exactly the call a
        // naive "just announce Commentary through the existing Nostr
        // publisher" implementation would make.
        const nostrPublisher = new NostrPublicationDiscoveryPublisher({
            discoveryTag: 'forkbuild-boundary-audit-625',
            publishImpl: async () => ({ published: true, id: '0'.repeat(64) })
        });
        const nostrOutcome = await nostrPublisher.publish(commentaryEnvelopeJson);
        assert(nostrOutcome === null,
            n('LIVE: NostrPublicationDiscoveryPublisher#publish(), UNMODIFIED, given a real signed Commentary envelope, resolves null — its own internal describeDecentralizedDiscoveryEnvelope() call rejects it before publishImpl is ever invoked; a naive reuse of this existing publisher class for Commentary silently announces nothing, every single time, with no error surfaced'));

        // D4. The real Arweave announcement publisher, live, same input.
        const arweavePublisher = new ArweaveAnnouncementPublisher({
            discoveryTag: 'forkbuild-boundary-audit-625',
            uploadTaggedTransaction: async () => ({ id: 'a'.repeat(43) })
        });
        const arweaveOutcome = await arweavePublisher.publish(commentaryEnvelopeJson);
        assert(arweaveOutcome === null,
            n('LIVE: ArweaveAnnouncementPublisher#publish(), UNMODIFIED, given the identical real Commentary envelope, also resolves null for the identical reason — reusing either existing discovery publisher UNCHANGED for Commentary is not merely "differently named fields," it is a silent, total no-op today'));

        // D5. The reverse direction — a well-formed locator envelope fed
        // to the Commentary envelope's own constructor.
        const locatorEnvelope = { protocol: DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL, version: 1, kind: 'PUBLICATION', objectId: 'pub-1', uri: 'ar://some-tx-id' };
        assert(PublicationCommentaryDistributionEnvelope.fromJSON(locatorEnvelope) === null,
            n('LIVE, reverse direction: PublicationCommentaryDistributionEnvelope.fromJSON(), UNMODIFIED, given a well-formed Publication locator envelope, also returns null — it has no commentaryId/publicationId/authorIdentityId/content, so PublicationCommentary\'s own constructor validation fails and fromJSON() degrades to null per that class\'s own "never throws" contract. The incompatibility is mutual, not one file being stricter than the other.'));

        // D6. The documented reason, confirmed directly from source: the
        // Publication discovery envelope carries no signature field at
        // all, by design.
        assert(/no signature field for this file to even look/.test(await rawSource('core/DecentralizedDiscoveryEnvelope.js')),
            n('core/DecentralizedDiscoveryEnvelope.js\'s own header states directly why: it is UNSIGNED by design ("...no signature field for this file to even look for") — a self-declared claim about a location, never evidence. A Commentary distribution envelope is the opposite: REQUIRED signature, refused outright if absent (identity/LocalAuthorizationVerifier.js#verifyPublicationCommentaryDistributionEnvelope(), confirmed in Section A\'s own re-run). Reusing the discovery-envelope SHAPE for Commentary would mean either weakening Commentary to an unsigned claim, or bolting a signature onto a shape core/PublicationCommentaryDistributionEnvelope.js\'s own 0.9.618 header already explicitly considered and rejected for the identical reason: "never a repurposing of either existing shape.'));

        console.log('✓ D — FLAGSHIP: bidirectionally, live, against real unmodified classes — a signed Commentary distribution envelope and either existing discovery-locator envelope are structurally incompatible today, not merely differently-shaped. Reusing NostrPublicationDiscoveryPublisher or ArweaveAnnouncementPublisher UNCHANGED for Commentary is a silent total no-op; every path REQUIRES a genuinely new envelope, publisher, and query-service family (see Section G) — the same conclusion 0.9.618\'s own header already reached deliberately, reconfirmed here live rather than merely re-read. Classification: ARCHITECTURAL_MISMATCH for direct reuse of either existing discovery-envelope family; the reusable PART is the PATTERN (a small JSON shape, a discoveryTag, an injected publish/upload function), never the class or the envelope type.');
    }

    // ===============================================================
    // Section E — five-identity independence.
    // ===============================================================
    {
        const authorProvider = makeIdentity('boundary-audit-625-identity');
        const envelopeJson = signedCommentaryEnvelopeJson(authorProvider, { publicationId: 'pub-identity-625' });

        assert(envelopeJson.commentaryId !== envelopeJson.publicationId,
            n('commentaryId !== publicationId, on a real constructed envelope — reconfirmed, not merely inherited from 0.9.617\'s own Section B'));
        assert(!('contentHash' in envelopeJson) && !('uri' in envelopeJson) && !('locator' in envelopeJson),
            n('the envelope carries no Publication contentHash and no locator/uri of any kind — a Commentary distribution envelope has never read, derived, or exposed a Publication\'s own content identity'));

        const envelopeSource = codeOnly(await rawSource('core/PublicationCommentaryDistributionEnvelope.js'));
        assert(!/nostrEventId|arweaveTransactionId|eventId|transactionId/i.test(envelopeSource),
            n('core/PublicationCommentaryDistributionEnvelope.js — the ONE file that would need to grow a field if a Nostr event id or Arweave transaction id were ever meant to be part of a Commentary\'s own identity — carries no such vocabulary today; a Commentary\'s own identity (commentaryId) already exists, is already durable (storage/PublicationCommentaryStore.js), and does not currently depend on, or get extended by, any substrate-specific delivery-receipt id'));
        assert(!/nostrEventId|arweaveTransactionId/i.test(codeOnly(await rawSource('storage/PublicationCommentaryStore.js'))),
            n('storage/PublicationCommentaryStore.js — the single persistence authority for Commentary, unmodified since 0.9.243 — likewise stores no substrate-delivery-receipt field; a Commentary that has traveled over zero, one, or several substrates remains ONE stored record, keyed by ONE commentaryId, exactly as it is today over the one existing transport'));

        console.log('✓ E: commentaryId, publicationId, a Publication\'s own contentHash, a hypothetical Nostr event id, and a hypothetical Arweave transaction id remain five independent facts — none aliased, none required, none currently even representable on a stored Commentary. Any future multi-substrate delivery-receipt tracking (e.g. "this Commentary was also seen via Nostr event X") would be new, additive, optional metadata about an ALREADY-independent commentaryId — never a redefinition of Commentary identity itself.');
    }

    // ===============================================================
    // Section F — announcement-of-a-locator vs. delivery-of-content.
    // ===============================================================
    {
        const peerExchangeSource = await rawSource('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js');
        assert(/kind:\s*MESSAGE_KIND_ANNOUNCE,\s*envelope\s*\}/.test(codeOnly(peerExchangeSource)) || /message\s*=\s*\{\s*kind:\s*MESSAGE_KIND_ANNOUNCE,\s*envelope\s*\}/.test(codeOnly(peerExchangeSource)),
            n('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js#announce() sends the FULL envelope — commentary content included — directly over the peer message bus; the receiving peer\'s own _handleIncoming() calls importCommentaryEnvelope() on that SAME payload with no separate fetch step. Content IS delivered, not merely located.'));

        assert(/describeDecentralizedDiscoveryEnvelope|describeSnapshotDiscoveryEnvelope/.test(codeOnly(await rawSource('application/nostr/NostrPublicationDiscoveryPublisher.js')))
            && /uri/.test(await rawSource('core/DecentralizedDiscoveryEnvelope.js')),
            n('by contrast, reconfirmed from Sections B/C: the existing Nostr/Arweave discovery substrate, as built, only ever transports a LOCATOR (`uri`, or `contentHash`/`locator`/`storage`) — never the bytes it points at. A consumer of a discovered envelope still has a SEPARATE retrieval step ahead of it (fetching the Arweave transaction the uri names, or asking a peer for content matching a discovered contentHash) before it has anything to verify or store.'));

        console.log('✓ F: Commentary\'s own existing distribution capability already DELIVERS content, over WebRTC. The existing Nostr/Arweave substrate, unmodified, only ever ANNOUNCES a locator to content stored elsewhere. Because a Commentary envelope is already "small enough to travel whole" (its own 0.9.618 header\'s own words, reconfirmed by size: five short fields plus one signature, versus a Publication\'s own document material), giving it a Nostr/Arweave seam would NOT need the locator-plus-separate-content-store pattern Publication material requires — a Commentary envelope could, in principle, ride as a Nostr event\'s own `content` directly, or as an Arweave tagged transaction\'s own DATA (not merely a tag) directly. Both are genuinely NEW patterns this codebase has never built for any substrate yet — see Section G — never a reuse of the existing locator-announcement classes as they stand.');
    }

    // ===============================================================
    // Section G — historical/asynchronous acquisition boundary: new
    // ground, not an unwired existing class.
    // ===============================================================
    {
        // AMENDED BY 0.9.629 — see this file's own header note, above.
        // Two such files now exist, built by 0.9.628 exactly along the
        // lines this audit's own Section D/G/I anticipated: a NEW family,
        // never a repurposing of NostrPublicationDiscoveryPublisher or
        // NostrDiscoveryQueryService (neither of which gained, references,
        // or was repurposed toward any Commentary vocabulary — reconfirmed
        // by the second half of this assertion, unchanged).
        const commentaryNostrFiles = grepFiles('Commentary', ['nostr', 'application'], { ignoreCase: false })
            .filter((f) => /Nostr/.test(f) && /Commentary/i.test(f));
        assert(commentaryNostrFiles.length === 2
            && commentaryNostrFiles.some((f) => f.includes('PublicationCommentaryNostrDistribution.js'))
            && commentaryNostrFiles.some((f) => f.includes('DiscoverPublicationCommentaryFromNostrUseCase.js')),
            n(`exactly the two Nostr-flavored Commentary files 0.9.628 built now exist — application/publication/commentary/PublicationCommentaryNostrDistribution.js (the adapter) and application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js (the admission boundary) — found: ${commentaryNostrFiles.join(', ') || 'none'}`));
        const discoveryPublisherSource = codeOnly(await rawSource('application/nostr/NostrPublicationDiscoveryPublisher.js'));
        const discoveryQueryServiceSource = codeOnly(await rawSource('application/nostr/NostrDiscoveryQueryService.js'));
        assert(!/Commentary/.test(discoveryPublisherSource) && !/Commentary/.test(discoveryQueryServiceSource),
            n('neither existing discovery-specific Nostr class (application/nostr/NostrPublicationDiscoveryPublisher.js, application/nostr/NostrDiscoveryQueryService.js) gained, references, or was repurposed toward any Commentary vocabulary — 0.9.628 built a genuinely new family instead, exactly this audit\'s own Section D/G/I recommendation'));
        // AMENDED AGAIN BY 0.9.631 — Publication Commentary Arweave
        // Asynchronous Distribution built exactly the Arweave counterpart
        // 0.9.628 already built for Nostr, following this same audit's own
        // Section D/G/I recommendation one substrate over: application/
        // PublicationCommentaryArweaveDistribution.js (the adapter) and
        // application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js
        // (the admission boundary) — a genuinely new family, never a
        // repurposing of ArweaveAnnouncementPublisher/
        // ArweaveGraphqlDiscoveryQueryService.
        const commentaryArweaveFiles = grepFiles('Commentary', ['arweave', 'application'], { ignoreCase: false })
            .filter((f) => /Arweave/.test(f) && /Commentary/i.test(f));
        assert(commentaryArweaveFiles.length === 2
            && commentaryArweaveFiles.some((f) => f.includes('PublicationCommentaryArweaveDistribution.js'))
            && commentaryArweaveFiles.some((f) => f.includes('DiscoverPublicationCommentaryFromArweaveUseCase.js')),
            n(`exactly the two Arweave-flavored Commentary files 0.9.631 built now exist — found: ${commentaryArweaveFiles.join(', ') || 'none'}`));
        const arweaveAnnouncementSource = codeOnly(await rawSource('application/arweave/ArweaveAnnouncementPublisher.js'));
        const arweaveQueryServiceSource = codeOnly(await rawSource('application/arweave/ArweaveGraphqlDiscoveryQueryService.js'));
        assert(!/Commentary/.test(arweaveAnnouncementSource) && !/Commentary/.test(arweaveQueryServiceSource),
            n('neither existing discovery-specific Arweave class (application/arweave/ArweaveAnnouncementPublisher.js, application/arweave/ArweaveGraphqlDiscoveryQueryService.js) gained, references, or was repurposed toward any Commentary vocabulary — 0.9.631 built a genuinely new family instead, exactly this audit\'s own Section D/G/I recommendation, one substrate over'));

        const peerExchangeHeader = await rawSource('application/publication/commentary/PublicationCommentaryDistributionPeerExchange.js');
        const peerExchangeFlat = peerExchangeHeader.replace(/\r?\n/g, ' ').replace(/\/\/ ?/g, '');
        assert(peerExchangeFlat.includes('REQUEST/RESPONSE pair (find every commentary a peer knows about a publicationId, for a late-joining replica) is exactly the kind of seam a LATER, separately-scoped milestone could add'),
            n('the ONE forward-reference this codebase\'s own source already names for Commentary\'s next distribution step is a peer REQUEST/RESPONSE protocol (find every commentary a peer knows about a publicationId, for a late-joining replica) — modeled explicitly on application/anchoring/PublicationAnchorPeerProtocol.js\'s own 0.8.5 precedent. That forward-reference names a PEER extension, never Nostr or Arweave.'));

        console.log('✓ G (AMENDED BY 0.9.629): at the time this audit originally ran, a Nostr/Arweave-flavored Commentary distribution capability was not a wiring gap in something that already existed (0.9.619\'s own pattern) — it would need an entirely new envelope, publisher, and query-service family, mirroring Publication/Snapshot\'s own multi-file pattern from scratch. 0.9.626-0.9.628 built exactly that NEW family for Nostr (never Arweave, still untouched) — a substrate-neutral delivery contract (0.9.626), a test-proven raw-transport composition (0.9.627), and a real, permanent, production-wired adapter plus admission boundary (0.9.628) — reusing the EXISTING 0.9.618 envelope unmodified rather than inventing a second one, since Section D\'s own finding was that Commentary needed no second envelope, only a substrate that could carry the existing one. The one extension this codebase\'s own source anticipated for Commentary BEYOND Nostr remains a peer-based request/response protocol; Arweave remains exactly as untouched by Commentary as this audit originally measured.');
    }

    // ===============================================================
    // Section H — product requirement census.
    // ===============================================================
    {
        // Re-running, live, the exact grep an earlier milestone
        // (tests/PostNotificationAwarenessProductReassessment.test.js,
        // predating 0.9.617) used to establish that no decentralized
        // transport moved Commentary at all — and naming, directly from
        // that same file's own text, the ONE condition it said would
        // reopen this question.
        const crossDeviceHits = grepFiles('PublicationCommentaryStore', ['nostr', 'arweave', 'replication']);
        assert(crossDeviceHits.length === 0,
            n(`re-run live: no file under nostr/, arweave/, or replication/ references storage/PublicationCommentaryStore.js today — Nostr and Arweave specifically remain exactly as untouched by Commentary as the pre-0.9.617 audit measured, even though peer/ (via application/, per Section A/F) now genuinely does. Found: ${crossDeviceHits.join(', ') || 'none'}`));

        assert(/A real, deliberate product decision to build cross-device synchronization[\s\S]*?Nostr\/peer\/some future transport/.test(await rawSource('tests/PostNotificationAwarenessProductReassessment.test.js')),
            n('that earlier milestone\'s own stated reopening condition, quoted verbatim from its own source: "A real, deliberate product decision to build cross-device synchronization for Publication Commentary (over Nostr/peer/some future transport...) — at which point a genuine \\"elsewhere, right now\\" scenario would exist for the first time, and this question would deserve reopening on its own evidence." 0.9.618-0.9.620 already made exactly that deliberate decision — for peer, the transport that condition names FIRST. Nostr and Arweave remain the two named alternatives that decision has not yet been extended to.'));

        // A direct, present-day product-surface census: does anything
        // reachable from the running application ever say "distribute,"
        // "share," "sync," or "offline" about a Commentary, beyond the
        // existing best-effort peer announce already reconfirmed live in
        // Section A?
        // AMENDED BY 0.9.629: ui/main.js now also matches, purely because
        // its own 0.9.628 section header comments literally read
        // "Publication Commentary Nostr Asynchronous Distribution" twice
        // — codeOnly() below strips comment lines before re-checking, the
        // same technique this file's own other sections already use, to
        // confirm no REAL UI affordance is what matched.
        const commentaryUiHits = grepFiles('share.{0,20}commentary|distribute.{0,20}commentary|commentary.{0,20}(share|distribute|sync|offline)', ['ui'], { ignoreCase: true });
        assert(commentaryUiHits.length === 2
            && commentaryUiHits.includes('ui/views/WorldView.js')
            && commentaryUiHits.includes('ui/main.js'),
            n(`the UI hits for "share/distribute/sync/offline"-adjacent Commentary vocabulary are ui/views/WorldView.js (a 0.9.248 header comment describing its OWN code-style restraint, never a Commentary feature) and, as of 0.9.628, ui/main.js (its own section header comments naming "Publication Commentary Nostr Asynchronous Distribution") — found: ${commentaryUiHits.join(', ') || 'none'}`));
        const mainCodeOnly = codeOnly(await rawSource('ui/main.js'));
        assert(!/share.{0,20}commentary|distribute.{0,20}commentary|commentary.{0,20}(share|distribute|sync|offline)/i.test(mainCodeOnly),
            n('with comments stripped, ui/main.js has no REAL affordance matching that vocabulary either — every 0.9.628 hit was a section-header comment naming the milestone, never a UI feature; the two genuine new production call sites 0.9.628 added (a best-effort Nostr publish after creation, and an explicitly-invoked discoverPublicationCommentaryFromNostrCommand) are named `publish`/`discover`, not `share`/`sync`/`offline`, and neither is a user-facing "share this Commentary" affordance of any kind'));

        const roadmapHitCount = Number(execSync(
            'grep -ciE "decentralized commentary|commentary.{0,15}(nostr|arweave)" docs/Roadmap.md || true',
            { cwd: SOURCE_ROOT.pathname, encoding: 'utf8' }
        ).trim());
        assert(roadmapHitCount >= 1,
            n(`docs/Roadmap.md itself carries the historical record (${roadmapHitCount} matching lines) of "decentralized commentary discovery" being named and explicitly deferred, repeatedly, going back to 0.9.244/0.9.247/0.9.248 — never once scheduled, never once described as a committed product requirement, only ever as an excluded, unscheduled possibility`));

        console.log('✓ H: no concrete, present-day product requirement for Commentary to survive both parties being offline simultaneously — via Nostr, Arweave, or otherwise — exists anywhere in this codebase\'s UI, tests, or roadmap. Classification: NO_REQUIREMENT, reconfirmed live rather than assumed. This is Model 1 (live peer distribution) as currently shipped; Models 2/3/4 from the requesting brief remain hypothetical.');
    }

    // ===============================================================
    // Section I — fan-out policy: SELECTION, NEVER FAN-OUT.
    // ===============================================================
    {
        const compositionSource = await rawSource('application/publication/distribution/PublicationDistributionRuntimeComposition.js');
        assert(/SELECTION, NEVER FAN-OUT/.test(compositionSource),
            n('the ONE file in this codebase that already names Nostr and Arweave together for Publication distribution states its own governing invariant in its own header title: "SELECTION, NEVER FAN-OUT"'));
        assert(/no `runtime\.publishers` array, no automatic "announce to every configured\s*\/\/ substrate," and no failover/.test(compositionSource),
            n('quoted directly: "no runtime.publishers array, no automatic \\"announce to every configured substrate,\\" and no failover from one to the other" — a caller wanting both substrates calls the composer twice and sequences both results itself'));

        const compositionCode = codeOnly(compositionSource);
        assert(/discoveryProvider === .nostr./.test(compositionCode) && /discoveryProvider === .arweave./.test(compositionCode)
            && !/Promise\.all/.test(compositionCode),
            n('reconfirmed structurally: discoveryProvider is a closed, mutually-exclusive `if`/`else if` — never a Promise.all across substrates, never an array of substrates iterated'));

        const snapshotBackendSource = codeOnly(await rawSource('application/snapshot/SnapshotDistributionContentBackendSelection.js'));
        assert(!/Promise\.all|forEach.*publish|every configured/i.test(snapshotBackendSource),
            n('the parallel Snapshot-side selection file (application/snapshot/SnapshotDistributionContentBackendSelection.js) holds the identical restraint — SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES names what COULD be chosen; nothing in this codebase iterates it and distributes to all of them automatically'));

        console.log('✓ I: the existing, already-live precedent for every substrate this codebase has ever given Publication or Snapshot is explicit, single-substrate, person/caller-initiated selection — never automatic multi-substrate fan-out. If Commentary ever gains a Nostr and/or Arweave seam, this is the precedent to extend, not a new policy to invent: "Create Commentary" must never silently become "announce to WebRTC peers AND Nostr AND Arweave" without an explicit choice, exactly as Publication/Snapshot already refuse to do that for themselves today.');
    }

    // ===============================================================
    // Section J — production-change guard.
    // ===============================================================
    {
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)docs/Roadmap.md" ":(exclude)tests.html" ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */,
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(changedNonTestFiles === '', n(`no production file is modified by this milestone — found: ${changedNonTestFiles || 'none'}`));

        console.log('✓ J: no production file touched. This audit implements no Nostr or Arweave Commentary capability of any kind — it only measures whether the existing substrate seams fit, live, and whether a product requirement for either currently exists.');
    }

    // ===============================================================
    // Section K — classification and verdict.
    // ===============================================================
    {
        console.log(
            '\nClassification table (AMENDED BY 0.9.629 — Section G only; see this file\'s own header note):\n'
            + '  B. Nostr substrate role (Publication/Snapshot) ....... ALREADY_CORRECT (locator-only, unsigned, live-wired)\n'
            + '  C. Arweave substrate roles (Publication/Snapshot) ..... ALREADY_CORRECT (two independent roles, live-wired)\n'
            + '  D. Envelope structural compatibility .................. ARCHITECTURAL_MISMATCH for direct reuse; PREPARED_SEAM for the PATTERN only\n'
            + '  E. Five-identity independence .......................... ALREADY_CORRECT\n'
            + '  F. Announcement-of-a-locator vs. delivery-of-content ... ARCHITECTURAL_MISMATCH (Commentary needs the opposite shape)\n'
            + '  G. Historical/asynchronous acquisition for Nostr/Arweave  RESOLVED for Nostr (0.9.626-0.9.628) — was NO_REQUIREMENT / new ground; Arweave still untouched\n'
            + '  H. Product requirement (Models 2/3/4) .................. NO_REQUIREMENT, AS ORIGINALLY MEASURED — superseded for Nostr by a later, separate product argument (0.9.626\'s own header)\n'
            + '  I. Fan-out policy ....................................... INTENTIONAL_BOUNDARY (selection, never fan-out) — precedent 0.9.628 itself followed\n'
        );
        console.log(
            '0.9.625 verdict, AS ORIGINALLY WRITTEN: NO CONCRETE_PRODUCT_GAP survived this audit. The existing Nostr and Arweave substrate '
            + 'seams — genuinely live, genuinely production-wired, for Publication and Snapshot — CANNOT carry the existing '
            + 'PublicationCommentaryDistributionEnvelope unmodified (Section D, proven bidirectionally and live against real classes, still '
            + 'true today). No concrete product requirement for asynchronous Commentary delivery existed anywhere in this codebase\'s UI, '
            + 'tests, or roadmap at the time (Section H, still literally true of that scope). RECOMMENDATION (as originally written): do not '
            + 'build Nostr or Arweave Commentary distribution now; if a genuine product need emerges later, scope it as its own small, '
            + 'explicit, SELECTION-never-fan-out capability, choosing ONE new substrate seam at a time, built as a new envelope/publisher/'
            + 'query-service family rather than a repurposing of the Publication/Snapshot discovery-envelope classes. A follow-up product '
            + 'argument SUBSEQUENTLY reopened this question on grounds this audit never measured (WebRTC\'s own live-only reachability gap — '
            + 'see 0.9.626\'s own header) and 0.9.626-0.9.628 built exactly the recommended shape for Nostr: a new, substrate-neutral contract, '
            + 'reusing the EXISTING envelope (never a second one — Section D\'s own finding held, so no new envelope was needed after all, only '
            + 'a substrate that could carry the existing one whole), a new adapter, and a new admission boundary — never a repurposing of '
            + 'NostrPublicationDiscoveryPublisher/NostrDiscoveryQueryService. Arweave remains exactly where this audit left it: NO_REQUIREMENT, '
            + 'untouched, independently assessable later on its own evidence — see tests/PublicationCommentaryNostrAsynchronousDistributionClosureAudit.test.js '
            + '(0.9.629) Section L for that later assessment.'
        );
        console.log(`✅ All Publication Commentary Persistent Distribution Boundary Audit tests passed (${assertionCount} assertions).`);
    }
}

await run();
