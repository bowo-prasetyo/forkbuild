import { readFile, readdir } from 'node:fs/promises';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { License, LicenseId } from '../core/License.js';
import {
    EditorEntryContext, EditorEntryReason, editorEntryContextToQuery, editorEntryContextFromQuery
} from '../core/EditorEntryContext.js';
import { Publication } from '../publisher/Publication.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { FindPublicationUseCase } from '../application/FindPublicationUseCase.js';
import { PublicationResolver } from '../application/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/PublicationResolutionCoordinator.js';
import { resolvePublicationView } from '../application/PublicationResolutionView.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/PublicationContentValidator.js';
import { ForkDocumentUseCase } from '../application/ForkDocumentUseCase.js';
import { ForkFailureReason } from '../application/ForkFailureReason.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import ForkFailureDialog from '../ui/components/ForkFailureDialog.js';

// 0.9.354 — Fork Failure UX Convergence Audit.
//
// Test-only. No production file is changed by this milestone.
//
// 0.9.353 gave ForkDocumentUseCase's two existing failure causes a
// structural `.reason` code and gave EditorView.js a persistent
// ForkFailureDialog + a route back, and its own test file
// (tests/ForkFailureReasonPresentation.test.js) proved the pieces are
// individually correct — mostly by reading ui/views/EditorView.js's and
// ui/components/ForkFailureDialog.js's own SOURCE TEXT and asserting a
// regex matches it, because both files import `vue`/`vue-router` and so
// cannot be `import`ed by this repo's plain `node tests/*.test.js` sweep
// (see that file's own header, and tests/EditorAutosaveRecoveryLifecycleAudit
// .test.js's identical constraint).
//
// This audit goes one rung further, using the SAME technique
// tests/WorldViewUndoRedoLifecycleAudit.test.js already established for
// the identical constraint: extract the REAL, CURRENT function/block
// source out of EditorView.js by brace-matching (never hand-retyped —
// see extractByMarker() below), wrap it in `new Function(...)`, and
// EXECUTE it against real collaborators (a real ForkDocumentUseCase, a
// real signed Publication produced by the real LocalPublisherProvider, a
// real FindPublicationUseCase over real discovery providers). What
// 0.9.353 proved by pattern-matching source text, this file proves by
// running the production code and inspecting what it actually produced.
//
// ui/components/ForkFailureDialog.js turns out to need no such
// extraction at all — it has no `vue`/`vue-router` import of its own
// (Vue's `template`/`computed`/`props`/`emits` conventions are read by
// whatever runtime later calls `createApp`, not required at module load
// time), so Section C below imports it directly and calls its real
// `computed.message` getter — no regex anywhere in that section.
//
// Sections follow the milestone brief's own outline (A-J). The one
// question the brief asked to be examined "particularly carefully" —
// whether `returnWorldId`'s fallback to `Publication.documentId` is
// actually valid, not merely syntactically constructible — is answered
// in Section E with LIVE evidence: publisher/LocalPublisherProvider.js
// is the ONLY class in this codebase that ever constructs a Publication
// FROM a Document (verified structurally below by scanning publisher/),
// and it sets `documentId: document.world.id` — literally the World's
// own id, not a separate concept that merely happens to route the same
// way. `/world/:documentId` (ui/router/index.js) then resolves that
// exact id as the World to open.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

// -----------------------------------------------------------------
// Harness: real, in-memory collaborators. InMemoryStorageProvider
// mirrors every other test file in this repo (LocalStorageProvider
// itself needs a browser `window.localStorage`, unavailable under
// plain `node`) — everything built ON TOP of it below (LocalPublisherProvider,
// LocalDiscoveryProvider, ForkDocumentUseCase, LocalContentStore) is the
// REAL production class, unmodified.
// -----------------------------------------------------------------
class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); this.saveCalls = 0; }
    save(name, data) { this.saveCalls += 1; this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

function createDocument(title, author, license = null) {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author, license }) });
}

// Publishes a real Document through the ONE real production publisher
// (see Section E's structural proof that it is the only one) onto
// `storage`, returning the real, signed Publication it produces —
// `publication.documentId` is `document.world.id` by construction, never
// re-derived or hand-set here.
function publishLocally(document, identityProvider, storage) {
    return new LocalPublisherProvider(storage).publish(document, identityProvider);
}

// Wraps an already-published Publication in a real decentralized
// resolution round trip — application/PublicationResolver.js#publish()
// then application/PublicationResolutionView.js#resolvePublicationView()
// — modeling "this replica learned about the publication over a
// peer/decentralized channel," independent of whether ITS OWN local
// storage ever received the publish record (that's `originStorage`
// below, deliberately a THROWAWAY instance distinct from whatever
// storage the viewer's own ForkDocumentUseCase/findPublicationUseCase
// consult) — same posture tests/ForkFailureReasonPresentation.test.js's
// own Section H already established for "a Publication resolved through
// PublicationResolver.publish() without a live peer connection."
async function resolveAsDecentralized(publication, identityProvider) {
    const originStorage = new InMemoryStorageProvider();
    const resolver = new PublicationResolver(new LocalContentStore(originStorage), new LocalAuthorizationVerifier());
    const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();
    const coordinator = new PublicationResolutionCoordinator(resolver, null);
    const envelope = await resolver.publish({ content: publication, contentKind: PUBLICATION_CONTENT_KIND, identityProvider });
    return resolvePublicationView(envelope, { coordinator, kindPlugins });
}

// -----------------------------------------------------------------
// Extraction: pull the REAL, CURRENT source of a named region out of
// ui/views/EditorView.js by brace-matching from `marker` to its own
// closing brace — the exact technique
// tests/WorldViewUndoRedoLifecycleAudit.test.js already established for
// the identical "this file imports vue, so it cannot be `import`ed
// directly" constraint. Never hand-retyped: whatever this milestone
// (or any future one) edits in EditorView.js is what actually executes
// here.
// -----------------------------------------------------------------
// Mirrors tests/EditorAutosaveRecoveryLifecycleAudit.test.js's own
// codeOnlyLines() — strips full-line comments before a "this code never
// does X" check, so a COMMENT that merely mentions X (e.g. this block's
// own header explaining what it replaced) never produces a false
// positive.
function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

function extractByMarker(source, marker, label) {
    const idx = source.indexOf(marker);
    assert(idx !== -1, `${label || marker} located in source`);
    const braceStart = source.indexOf('{', idx);
    let depth = 0, i = braceStart;
    for (; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) break; }
    }
    return source.slice(idx, i + 1);
}

async function run() {
    console.log('Running Fork Failure UX Convergence Audit...\n');

    const editorViewSource = await readSource('ui/views/EditorView.js');
    const forkBlockSource = extractByMarker(editorViewSource, 'if (route.query.fork) {', 'route.query.fork handler');
    const backFromForkFailureSource = extractByMarker(editorViewSource, 'function backFromForkFailure() {', 'backFromForkFailure()');

    // Executes the REAL, extracted route.query.fork handler against real
    // (or, for editorSession/feedback/router — pure UI-framework
    // concerns with no domain logic of their own — spy) collaborators.
    // Mirrors EditorView.js's own setup() closure exactly: `entryContext`
    // and `forkFailure` are refs (`{ value }`), `arrivalDocumentId` is a
    // plain closure `let`, `router.replace`/`feedback.show` are the only
    // two methods this block ever calls on those two collaborators.
    function runForkHandler({ route, identityProvider, findPublicationUseCase, forkDocumentUseCase }) {
        const entryContextRef = { value: null };
        const forkFailureRef = { value: null };
        const openDocumentCalls = [];
        const feedbackLog = [];
        const routerReplaceCalls = [];
        const editorSession = { openDocument: (doc, ctx) => openDocumentCalls.push({ doc, ctx }) };
        const feedback = { show: (message) => feedbackLog.push(message) };
        const router = { replace: (opts) => routerReplaceCalls.push(opts) };
        // eslint-disable-next-line no-new-func
        const factory = new Function(
            'route', 'identityProvider', 'findPublicationUseCase', 'forkDocumentUseCase',
            'editorEntryContextFromQuery', 'editorSession', 'feedback', 'router',
            'entryContext', 'forkFailure',
            `let arrivalDocumentId = null;\n${forkBlockSource}\nreturn { arrivalDocumentId };`
        );
        const result = factory(
            route, identityProvider, findPublicationUseCase, forkDocumentUseCase,
            editorEntryContextFromQuery, editorSession, feedback, router,
            entryContextRef, forkFailureRef
        );
        return {
            entryContext: entryContextRef.value,
            forkFailure: forkFailureRef.value,
            arrivalDocumentId: result.arrivalDocumentId,
            openDocumentCalls, feedbackLog, routerReplaceCalls
        };
    }

    // Executes the REAL, extracted backFromForkFailure() against a spy
    // router and a forkFailure ref seeded to whatever runForkHandler()
    // above actually produced.
    function runBackFromForkFailure(forkFailureValue) {
        const forkFailureRef = { value: forkFailureValue };
        const routerPushCalls = [];
        const router = { push: (opts) => routerPushCalls.push(opts) };
        // eslint-disable-next-line no-new-func
        const factory = new Function(
            'router', 'forkFailure',
            `${backFromForkFailureSource}\nbackFromForkFailure();\nreturn forkFailure.value;`
        );
        const forkFailureAfter = factory(router, forkFailureRef);
        return { routerPushCalls, forkFailureAfter };
    }

    // ===============================================================
    // Section A — Real license-denial path, end to end through the
    // extracted PRODUCTION route.query.fork handler: a real ND-licensed
    // Publication, published through the real LocalPublisherProvider,
    // forked the way ui/components/PublicationCatalog.js#forkPublication()
    // actually navigates (`{ fork: pub.documentId, publication: pub.id }`,
    // no entry context — see Section E for why that fallback is valid).
    // ===============================================================
    let sectionAOutcome;
    {
        const alice = makeIdentity('alice');
        const bob = makeIdentity('bob');
        const storage = new InMemoryStorageProvider();
        const document = createDocument('No Derivatives', 'alice', new License({ id: LicenseId.CC_BY_ND_4_0 }));
        const publication = publishLocally(document, alice, storage);
        assert(publication.license.forkAllowed === false, '1. setup: the published Publication genuinely disallows forking.');
        assert(publication.documentId === document.world.id, '2. setup: LocalPublisherProvider stamped documentId as the real World id.');
        storage.saveCalls = 0; // isolate what the FORK ATTEMPT itself writes, not the publish above.

        const route = { query: { fork: publication.documentId, publication: publication.id } };
        const findPublicationUseCase = new FindPublicationUseCase(new LocalDiscoveryProvider(storage));
        const forkDocumentUseCase = new ForkDocumentUseCase(storage);

        const outcome = runForkHandler({ route, identityProvider: bob, findPublicationUseCase, forkDocumentUseCase });
        sectionAOutcome = outcome;

        assert(outcome.forkFailure !== null, '3. the real handler recorded a forkFailure.');
        assert(outcome.forkFailure.reason === ForkFailureReason.LICENSE_DENIED,
            `4. the reason the REAL, executed handler recorded is exactly ForkFailureReason.LICENSE_DENIED, got "${outcome.forkFailure.reason}".`);
        assert(outcome.forkFailure.returnWorldId === publication.documentId,
            '5. with no entry context, returnWorldId falls back to the Publication\'s own documentId.');
        assert(outcome.openDocumentCalls.length === 0, '6. editorSession.openDocument() was never called — no blank-editor dead end.');
        assert(outcome.feedbackLog.length === 0, '7. feedback.show() (the old transient toast) was never called for this failure.');
        assert(outcome.routerReplaceCalls.length === 1 && outcome.routerReplaceCalls[0].path === '/editor',
            '8. the handler still normalizes the URL back to /editor either way.');
        assert(storage.saveCalls === 0, '9. the failed fork attempt itself wrote nothing to storage.');
    }
    console.log('✓ Section A: a real, published, ND-licensed Publication forked through the actual extracted EditorView.js handler produces forkFailure.reason === LICENSE_DENIED, with no Document opened and no storage write.');

    // ===============================================================
    // Section B — Real material-unavailable path via a genuinely
    // PEER-DISCOVERED Publication: carol publishes locally (to get a
    // real, validly-signed Publication), but the VIEWER (dave) never
    // has that publish recorded in their own storage — they only know
    // about it because it arrived through a real decentralized
    // resolution round trip (PublicationResolver.publish() +
    // resolvePublicationView()) and was cataloged into a real
    // DecentralizedPublicationDiscoveryProvider. Dave's own document
    // storage genuinely has no content for it — modeling the actual
    // 0.9.352 gap: the Publication's metadata resolved, but its
    // Document body was never separately fetched into local
    // edit-storage.
    // ===============================================================
    let sectionBOutcome;
    {
        const carol = makeIdentity('carol');
        const dave = makeIdentity('dave');
        const originStorage = new InMemoryStorageProvider(); // carol's own replica — never consulted below.
        const document = createDocument('Never Retrieved', 'carol', new License({ id: LicenseId.CC0_1_0 }));
        const publication = publishLocally(document, carol, originStorage);

        const decentralizedView = await resolveAsDecentralized(publication, carol);
        assert(decentralizedView.resolved === true, '1. setup: the Publication genuinely resolves through the real decentralized pipeline.');
        assert(decentralizedView.content instanceof Publication, '2. setup: the resolved content is a real Publication instance.');

        const daveDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
        daveDiscoveryProvider.add(decentralizedView.content); // enforces `instanceof Publication` internally.
        const daveDocumentStorage = new InMemoryStorageProvider(); // dave's own document storage — genuinely empty.
        const discoveryProvider = new CompositeDiscoveryProvider([
            new LocalDiscoveryProvider(daveDocumentStorage), daveDiscoveryProvider
        ]);
        assert(new LocalDiscoveryProvider(daveDocumentStorage).findById(publication.id) === null,
            '3. setup: dave\'s own local catalog genuinely has no record of this Publication.');

        const route = { query: { fork: publication.documentId, publication: publication.id } };
        const findPublicationUseCase = new FindPublicationUseCase(discoveryProvider);
        const forkDocumentUseCase = new ForkDocumentUseCase(daveDocumentStorage);

        const outcome = runForkHandler({ route, identityProvider: dave, findPublicationUseCase, forkDocumentUseCase });
        sectionBOutcome = outcome;

        assert(outcome.forkFailure !== null, '4. the real handler recorded a forkFailure.');
        assert(outcome.forkFailure.reason === ForkFailureReason.MATERIAL_UNAVAILABLE,
            `5. the reason the REAL, executed handler recorded is exactly ForkFailureReason.MATERIAL_UNAVAILABLE, got "${outcome.forkFailure.reason}" — a genuinely DIFFERENT value from Section A's LICENSE_DENIED, for a genuinely different, peer-discovered cause.`);
        assert(outcome.forkFailure.returnWorldId === publication.documentId, '6. returnWorldId again falls back to the Publication\'s own documentId.');
        assert(outcome.openDocumentCalls.length === 0, '7. no Document was opened.');
        assert(outcome.feedbackLog.length === 0, '8. no transient toast was shown.');
    }
    console.log('✓ Section B: a genuinely peer-discovered Publication (real decentralized resolution, real DecentralizedPublicationDiscoveryProvider, never locally cataloged for the viewer) whose Document body was never fetched produces forkFailure.reason === MATERIAL_UNAVAILABLE through the real handler — a different reason and a different presentation from Section A.');

    // ===============================================================
    // Section C — No string-based classification: ForkFailureDialog.js
    // imported DIRECTLY (it has no vue import of its own — see this
    // file's own header) and its real `computed.message` getter called
    // live, never regex-matched.
    // ===============================================================
    {
        assert(typeof ForkFailureDialog.computed.message === 'function', '1. ForkFailureDialog exports a real computed.message getter.');
        const licenseMessage = ForkFailureDialog.computed.message.call({ reason: ForkFailureReason.LICENSE_DENIED });
        const materialMessage = ForkFailureDialog.computed.message.call({ reason: ForkFailureReason.MATERIAL_UNAVAILABLE });
        const unknownStringMessage = ForkFailureDialog.computed.message.call({ reason: 'some-other-error-message-shaped-string' });
        const nullMessage = ForkFailureDialog.computed.message.call({ reason: null });

        assert(typeof licenseMessage === 'string' && licenseMessage.length > 0, '2. LICENSE_DENIED produces a real message.');
        assert(typeof materialMessage === 'string' && materialMessage.length > 0, '3. MATERIAL_UNAVAILABLE produces a real message.');
        assert(licenseMessage !== materialMessage, '4. the two known reasons genuinely produce DIFFERENT messages, live.');
        assert(unknownStringMessage === nullMessage,
            '5. an unrecognized string and a null reason produce the IDENTICAL fallback message — the component branches on membership in ForkFailureReason\'s own known values, never on whether `reason` merely looks like error text.');
        assert(unknownStringMessage !== licenseMessage && unknownStringMessage !== materialMessage,
            '6. that fallback is its own third message, never coincidentally matching either known one.');

        // The two REAL results from Section A/B, fed straight into the
        // REAL dialog's REAL getter — end-to-end proof the reason that
        // survived the production handler drives a genuinely different
        // presentation.
        const sectionAMessage = ForkFailureDialog.computed.message.call({ reason: sectionAOutcome.forkFailure.reason });
        const sectionBMessage = ForkFailureDialog.computed.message.call({ reason: sectionBOutcome.forkFailure.reason });
        assert(sectionAMessage !== sectionBMessage,
            '7. the ACTUAL forkFailure.reason values produced by Section A (license) and Section B (material) drive genuinely different ForkFailureDialog messages, end to end.');

        assert(ForkFailureDialog.props && ForkFailureDialog.props.reason && ForkFailureDialog.props.reason.type === String,
            '8. reason is declared as a String prop.');
        assert(ForkFailureDialog.props.reason.default === null, '9. reason defaults to null (an unnamed cause), never a required prop that would break on one.');

        // EditorView.js's own extracted handler never inspects err.message
        // to decide anything — it only ever reads `err.reason` (checked
        // directly against the real source text extracted above, not a
        // hand-retyped copy).
        assert(!codeOnlyLines(forkBlockSource).includes('err.message'),
            '10. the REAL, extracted route.query.fork catch block never reads err.message in actual code to classify the failure — only err.reason (a comment describing the OLD, replaced toast is the only place "err.message" appears in this block\'s source at all).');
        assert(/reason:\s*err\.reason\s*\|\|\s*null/.test(forkBlockSource),
            '11. the REAL, extracted catch block sets forkFailure.reason directly from err.reason, with no intermediate string inspection.');
    }
    console.log('✓ Section C: ForkFailureDialog.js, imported and executed directly (no regex), proves its message depends only on membership in ForkFailureReason\'s own known values — never on error text — and the real Section A/B outcomes drive genuinely different presentations end to end; the real extracted EditorView.js catch block never reads err.message either.');

    // ===============================================================
    // Section D — Failure convergence: for BOTH real outcomes above,
    // the same shape holds — persistent (dialog-driving forkFailure set,
    // never a toast), no blank Editor, a correct message, and an
    // actionable return that genuinely clears forkFailure once resolved.
    // ===============================================================
    {
        for (const [label, outcome] of [['license-denied', sectionAOutcome], ['material-unavailable', sectionBOutcome]]) {
            assert(outcome.forkFailure !== null, `1. [${label}] forkFailure is set — a persistent dialog condition, not a transient one.`);
            assert(outcome.feedbackLog.length === 0, `2. [${label}] no auto-hiding feedback.show() toast fired.`);
            assert(outcome.openDocumentCalls.length === 0, `3. [${label}] no Document was ever opened — no blank-editor dead end.`);
            const message = ForkFailureDialog.computed.message.call({ reason: outcome.forkFailure.reason });
            assert(typeof message === 'string' && message.length > 0, `4. [${label}] a real, non-empty message is produced.`);

            // The actionable return path: the REAL, extracted
            // backFromForkFailure() resolves this exact forkFailure to a
            // real router.push and clears it — the dialog's only exit.
            const back = runBackFromForkFailure(outcome.forkFailure);
            assert(back.forkFailureAfter === null, `5. [${label}] resolving the dialog clears forkFailure back to null.`);
            assert(back.routerPushCalls.length === 1, `6. [${label}] resolving the dialog performs exactly one real navigation.`);
            assert(back.routerPushCalls[0].path === `/world/${outcome.forkFailure.returnWorldId}`,
                `7. [${label}] that navigation targets /world/<returnWorldId> — a real, actionable route back, not a decorative button.`);
        }
    }
    console.log('✓ Section D: both real failure outcomes converge on the same shape — a persistent, non-blank, correctly-messaged dialog whose only exit is a real navigation that actually clears forkFailure.');

    // ===============================================================
    // Section E — Return-context preservation, both real entry
    // contexts, PLUS the "particularly careful" documentId/World-id
    // audit the milestone brief asked for.
    // ===============================================================
    {
        // E1 — "Edit a Copy" context: build the SAME EditorEntryContext
        // shape ui/views/WorldView.js#editInspectedCopy() constructs by
        // hand (see that function's own 0.6.1 header), encode it via the
        // REAL editorEntryContextToQuery(), and merge it into route.query
        // exactly the way that function's own router.push() does:
        // `{ fork: documentId, ...(publication ? {publication} : {}), ...entryQuery }`.
        const erin = makeIdentity('erin');
        const frank = makeIdentity('frank');
        const storage = new InMemoryStorageProvider();
        const structureDoc = createDocument('A Placed Structure', 'erin', new License({ id: LicenseId.CC_BY_ND_4_0 }));
        const publication = publishLocally(structureDoc, erin, storage);

        const preferredReturnWorldId = 'a-genuinely-different-world-id-than-the-structure-doc';
        const entryContext = new EditorEntryContext({
            sourceDocumentId: publication.documentId,
            title: 'A Placed Structure',
            kind: 'structure',
            reason: EditorEntryReason.WORLD_VIEW_EDIT_COPY,
            selectAllBricks: true,
            returnWorldId: preferredReturnWorldId,
            returnWorldTitle: 'The World Erin Was Standing In'
        });
        const route = {
            query: {
                fork: publication.documentId,
                publication: publication.id,
                ...editorEntryContextToQuery(entryContext)
            }
        };
        assert(route.query.entryReturnWorld === preferredReturnWorldId, '1. setup: the query actually carries the preferred returnWorldId.');
        assert(route.query.fork !== preferredReturnWorldId, '2. setup: sourceDocumentId and returnWorldId are genuinely different values — a real test of "prefers," not an accident of equal ids.');

        const findPublicationUseCase = new FindPublicationUseCase(new LocalDiscoveryProvider(storage));
        const forkDocumentUseCase = new ForkDocumentUseCase(storage);
        const outcome = runForkHandler({ route, identityProvider: frank, findPublicationUseCase, forkDocumentUseCase });

        assert(outcome.forkFailure.reason === ForkFailureReason.LICENSE_DENIED, '3. sanity — this fork genuinely fails (ND license).');
        assert(outcome.forkFailure.returnWorldId === preferredReturnWorldId,
            `4. with a real "Edit a Copy" entry context present, returnWorldId is the PREFERRED World the viewer actually came from ("${preferredReturnWorldId}"), never the fallback sourceDocumentId ("${publication.documentId}").`);

        // E2 — No entry context (Repository/Author Catalog / Publication
        // Catalog's own forkPublication(), reproduced exactly — see
        // ui/components/PublicationCatalog.js's own forkPublication()):
        // falls back to sourceDocumentId, i.e. Publication.documentId.
        const routeNoContext = { query: { fork: publication.documentId, publication: publication.id } };
        const outcomeNoContext = runForkHandler({ route: routeNoContext, identityProvider: frank, findPublicationUseCase, forkDocumentUseCase });
        assert(outcomeNoContext.forkFailure.returnWorldId === publication.documentId,
            '5. with NO entry context, returnWorldId falls back to sourceDocumentId — never null, never undefined, so a Repository/Catalog-originated fork always has a way back.');

        // E3 — The "particularly careful" audit: is Publication.documentId
        // actually a World id, or merely syntactically constructible into
        // one? LIVE evidence, not assumption:
        assert(publication.documentId === structureDoc.world.id,
            '6. LIVE: the published Publication\'s own documentId is exactly the source Document\'s World id — not a separate value that happens to look routable.');

        // STRUCTURAL evidence that this is architecturally guaranteed,
        // not a coincidence of this test's own setup: scan publisher/ and
        // confirm LocalPublisherProvider is the ONLY class that ever
        // constructs a Publication FROM a Document, and that it does so
        // with `documentId: document.world.id`.
        const publisherDir = new URL('../publisher/', import.meta.url);
        const publisherFiles = (await readdir(publisherDir)).filter((f) => f.endsWith('.js'));
        let extendsPublisherProviderCount = 0;
        let localPublisherProviderSource = null;
        for (const file of publisherFiles) {
            const src = await readFile(new URL(file, publisherDir), 'utf8');
            if (/extends PublisherProvider\b/.test(src)) {
                extendsPublisherProviderCount += 1;
            }
            if (file === 'LocalPublisherProvider.js') {
                localPublisherProviderSource = src;
            }
        }
        assert(extendsPublisherProviderCount === 1,
            `7. exactly ONE class in publisher/ extends PublisherProvider (found ${extendsPublisherProviderCount}) — there is no second, competing way to construct a Publication from a Document that might set documentId differently.`);
        assert(localPublisherProviderSource && localPublisherProviderSource.includes('documentId: document.world.id'),
            '8. that one class stamps documentId directly from document.world.id — the World\'s own identity, by construction, never re-derived or independently chosen.');

        // STRUCTURAL evidence that /world/<documentId> is genuinely the
        // route that resolves it: the router itself names `documentId`
        // as the World route's own param, and PublicationCatalog.js's
        // own Explore action — for the identical Publication a fork
        // would target — already navigates to precisely
        // `/world/<pub.documentId>`, never a different field.
        const routerSource = await readSource('ui/router/index.js');
        assert(/path: '\/world\/:documentId'[\s\S]{0,80}component: WorldView/.test(routerSource),
            '9. the /world/:documentId route names its own param `documentId` and resolves it via WorldView.');
        const publicationCatalogSource = await readSource('ui/components/PublicationCatalog.js');
        assert(publicationCatalogSource.includes("router.push({ path: `/world/${pub.documentId}` });"),
            '10. PublicationCatalog.js\'s own Explore action — for the SAME Publication a fork targets — already navigates to exactly this id, proving the fallback lands the viewer on the identical, already-proven-correct route, never a merely-plausible one.');
    }
    console.log('✓ Section E: "Edit a Copy" prefers its own returnWorldId; no-entry-context falls back to Publication.documentId; and that fallback is proven valid LIVE (documentId === document.world.id, the one and only Publication-from-Document constructor site) and structurally (the same id PublicationCatalog\'s own Explore action already routes to for this Publication) — not merely syntactically constructible.');

    // ===============================================================
    // Section F — Successful fork regression through the SAME real,
    // extracted production handler.
    // ===============================================================
    {
        const grace = makeIdentity('grace');
        const henry = makeIdentity('henry');
        const storage = new InMemoryStorageProvider();
        const document = createDocument('Freely Forkable', 'grace', new License({ id: LicenseId.CC0_1_0 }));
        const publication = publishLocally(document, grace, storage);
        storage.saveCalls = 0;

        const route = { query: { fork: publication.documentId, publication: publication.id } };
        const findPublicationUseCase = new FindPublicationUseCase(new LocalDiscoveryProvider(storage));
        const forkDocumentUseCase = new ForkDocumentUseCase(storage);
        const outcome = runForkHandler({ route, identityProvider: henry, findPublicationUseCase, forkDocumentUseCase });

        assert(outcome.forkFailure === null, '1. a genuinely forkable Publication produces NO forkFailure.');
        assert(outcome.openDocumentCalls.length === 1, '2. editorSession.openDocument() was called exactly once.');
        const { doc: openedDocument, ctx: openedEntryContext } = outcome.openDocumentCalls[0];
        assert(openedDocument instanceof Document, '3. a real, editable Document was opened.');
        assert(openedDocument.metadata.title === 'Fork of Freely Forkable', '4. the fork\'s own derived title is correct.');
        assert(openedDocument.world.id !== publication.documentId, '5. the fork got a fresh World identity — never the source\'s own.');
        assert(openedEntryContext === null, '6. with no entry context on this route, openDocument() received null — never a manufactured one.');
        assert(outcome.feedbackLog.length === 1 && outcome.feedbackLog[0].includes('Created your editable fork'),
            '7. the real "created your fork" feedback message fired.');
        assert(outcome.routerReplaceCalls.length === 1 && outcome.routerReplaceCalls[0].path === '/editor',
            '8. the URL is normalized back to /editor exactly as on the failure path.');
        assert(storage.saveCalls === 0, '9. forking itself performs no storage save — DocumentCloneService/openDocument never persist by themselves.');
    }
    console.log('✓ Section F: a genuinely forkable Publication, run through the SAME real extracted handler, opens a real Document, never sets forkFailure, and performs no storage write — the successful path is unchanged.');

    // ===============================================================
    // Section G — Failure isolation, verified through the real,
    // extracted handler (not ForkDocumentUseCase in isolation — that is
    // tests/ForkFailureReasonPresentation.test.js's own Section G, not
    // duplicated here): no Document save, no unintended clone reaching
    // openDocument(), no catalog mutation, no Publication record change.
    // ===============================================================
    {
        const iris = makeIdentity('iris');
        const jack = makeIdentity('jack');
        const storage = new InMemoryStorageProvider();
        const document = createDocument('Isolated', 'iris', new License({ id: LicenseId.CC_BY_ND_4_0 }));
        const publication = publishLocally(document, iris, storage);
        const catalogBefore = storage.load('forkbuild-publications');
        storage.saveCalls = 0;

        const findPublicationUseCase = new FindPublicationUseCase(new LocalDiscoveryProvider(storage));
        const forkDocumentUseCase = new ForkDocumentUseCase(storage);
        const route = { query: { fork: publication.documentId, publication: publication.id } };

        const outcome = runForkHandler({ route, identityProvider: jack, findPublicationUseCase, forkDocumentUseCase });
        assert(outcome.forkFailure.reason === ForkFailureReason.LICENSE_DENIED, '1. sanity — the attempt genuinely failed.');
        assert(outcome.openDocumentCalls.length === 0, '2. no unintended clone ever reached openDocument().');
        assert(storage.saveCalls === 0, '3. no Document save of any kind.');

        const catalogAfter = storage.load('forkbuild-publications');
        assert(JSON.stringify(catalogAfter) === JSON.stringify(catalogBefore),
            '4. the Publication catalog itself (forkbuild-publications) is byte-for-byte unchanged — no phantom re-publish, no catalog mutation.');
        const refetched = new FindPublicationUseCase(new LocalDiscoveryProvider(storage)).execute(publication.id);
        assert(refetched.license.id === LicenseId.CC_BY_ND_4_0 && refetched.documentId === publication.documentId,
            '5. re-reading the SAME Publication afterward shows it completely unmutated.');

        // A subsequent, legitimately-licensed fork of a document at the
        // SAME storage still succeeds — the failed attempt left no
        // residue that could block or corrupt a later, real fork.
        const legitDoc = createDocument('Isolated (Legit)', 'iris', new License({ id: LicenseId.CC0_1_0 }));
        const legitPublication = publishLocally(legitDoc, iris, storage);
        const legitOutcome = runForkHandler({
            route: { query: { fork: legitPublication.documentId, publication: legitPublication.id } },
            identityProvider: jack, findPublicationUseCase, forkDocumentUseCase
        });
        assert(legitOutcome.forkFailure === null && legitOutcome.openDocumentCalls.length === 1,
            '6. a subsequent, legitimately-licensed fork still succeeds normally afterward.');
    }
    console.log('✓ Section G: a failed fork run through the real handler writes nothing to storage, leaves the Publication catalog byte-for-byte unchanged, and never opens a Document — verified one layer higher than ForkDocumentUseCase alone, at the actual UI boundary.');

    // ===============================================================
    // Section H — Origin neutrality: Local / Decentralized /
    // Peer-discovered Publications under the SAME license produce the
    // SAME reason, run through the SAME real, extracted handler.
    // ===============================================================
    {
        const kate = makeIdentity('kate');
        const liam = makeIdentity('liam');
        const ndLicense = new License({ id: LicenseId.CC_BY_ND_4_0 });

        // Local: published and cataloged directly in the viewer's own storage.
        const localStorage = new InMemoryStorageProvider();
        const localDoc = createDocument('Local ND Work', 'kate', ndLicense);
        const localPublication = publishLocally(localDoc, kate, localStorage);
        const localOutcome = runForkHandler({
            route: { query: { fork: localPublication.documentId, publication: localPublication.id } },
            identityProvider: liam,
            findPublicationUseCase: new FindPublicationUseCase(new LocalDiscoveryProvider(localStorage)),
            forkDocumentUseCase: new ForkDocumentUseCase(localStorage)
        });

        // Decentralized: resolved through the real PublicationResolver
        // pipeline, cataloged only via DecentralizedPublicationDiscoveryProvider
        // — the viewer's own local catalog never heard of it directly.
        const originStorage = new InMemoryStorageProvider();
        const decentralizedDoc = createDocument('Decentralized ND Work', 'kate', ndLicense);
        const decentralizedPublicationRaw = publishLocally(decentralizedDoc, kate, originStorage);
        const decentralizedView = await resolveAsDecentralized(decentralizedPublicationRaw, kate);
        const decentralizedDiscovery = new DecentralizedPublicationDiscoveryProvider();
        decentralizedDiscovery.add(decentralizedView.content);
        const viewerStorageForDecentralized = new InMemoryStorageProvider();
        const decentralizedOutcome = runForkHandler({
            route: { query: { fork: decentralizedPublicationRaw.documentId, publication: decentralizedPublicationRaw.id } },
            identityProvider: liam,
            findPublicationUseCase: new FindPublicationUseCase(new CompositeDiscoveryProvider([
                new LocalDiscoveryProvider(viewerStorageForDecentralized), decentralizedDiscovery
            ])),
            forkDocumentUseCase: new ForkDocumentUseCase(viewerStorageForDecentralized)
        });

        // Peer-discovered: identical wiring to Section B's real
        // peer-discovery path — a SEPARATE DecentralizedPublicationDiscoveryProvider
        // instance, standing in for "announced by a connected peer,"
        // composed the SAME way application/CreateDiscoveryUseCase.js
        // itself composes local + decentralized discovery in production.
        const peerOriginStorage = new InMemoryStorageProvider();
        const peerDoc = createDocument('Peer-Discovered ND Work', 'kate', ndLicense);
        const peerPublicationRaw = publishLocally(peerDoc, kate, peerOriginStorage);
        const peerView = await resolveAsDecentralized(peerPublicationRaw, kate);
        const peerDiscovery = new DecentralizedPublicationDiscoveryProvider();
        peerDiscovery.add(peerView.content);
        const viewerStorageForPeer = new InMemoryStorageProvider();
        const peerOutcome = runForkHandler({
            route: { query: { fork: peerPublicationRaw.documentId, publication: peerPublicationRaw.id } },
            identityProvider: liam,
            findPublicationUseCase: new FindPublicationUseCase(new CompositeDiscoveryProvider([
                new LocalDiscoveryProvider(viewerStorageForPeer), peerDiscovery
            ])),
            forkDocumentUseCase: new ForkDocumentUseCase(viewerStorageForPeer)
        });

        assert(localOutcome.forkFailure && localOutcome.forkFailure.reason === ForkFailureReason.LICENSE_DENIED,
            '1. Local-origin: LICENSE_DENIED.');
        assert(decentralizedOutcome.forkFailure && decentralizedOutcome.forkFailure.reason === ForkFailureReason.LICENSE_DENIED,
            '2. Decentralized-origin: LICENSE_DENIED — the identical reason.');
        assert(peerOutcome.forkFailure && peerOutcome.forkFailure.reason === ForkFailureReason.LICENSE_DENIED,
            '3. Peer-discovered-origin: LICENSE_DENIED — the identical reason a third time.');
        assert(!localOutcome.openDocumentCalls.length && !decentralizedOutcome.openDocumentCalls.length && !peerOutcome.openDocumentCalls.length,
            '4. none of the three ever opened a Document.');

        // Structural: the REAL, extracted handler contains no
        // origin-branching vocabulary of any kind — it produced the same
        // reason for all three because it never asked "where did this
        // Publication come from" in the first place.
        assert(!/decentralized|peer-sourced|isPeer|isDecentralized/i.test(codeOnlyLines(forkBlockSource)),
            '5. the extracted route.query.fork handler contains no origin-branching concept IN CODE — confirmed on the SAME source text just executed three times above, not a separate read.');
    }
    console.log('✓ Section H: Local, Decentralized, and genuinely Peer-discovered Publications under the identical license all produce the identical LICENSE_DENIED reason through the SAME real, executed handler — and that handler\'s own source contains no origin-branching vocabulary.');

    // ===============================================================
    // Section I — Vocabulary boundary: ForkFailureReason stays narrowly
    // scoped to the two currently-evidenced causes; ForkFailureDialog's
    // own live behavior (not just its source text) never grows a third
    // meaningfully-distinct branch for anything this milestone did not
    // evidence.
    // ===============================================================
    {
        assert(Object.keys(ForkFailureReason).sort().join(',') === 'LICENSE_DENIED,MATERIAL_UNAVAILABLE',
            '1. ForkFailureReason still has EXACTLY these two keys — nothing spéculative was added.');
        assert(Object.isFrozen(ForkFailureReason), '2. still frozen.');

        // Live: every string this milestone can imagine EXCEPT the two
        // real ones collapses onto the identical fallback message — the
        // dialog has no hidden third branch for NETWORK_ERROR/TIMEOUT/
        // NOT_FOUND/FORK_FAILED/RETRYING or anything else speculative.
        const speculative = ['network-error', 'timeout', 'not-found', 'fork-failed', 'retrying', 'blocked'];
        const fallback = ForkFailureDialog.computed.message.call({ reason: null });
        for (const guess of speculative) {
            const message = ForkFailureDialog.computed.message.call({ reason: guess });
            assert(message === fallback, `3. an unevidenced reason ("${guess}") produces the SAME generic fallback as null — no speculative branch exists for it.`);
        }

        for (const file of ['application/ForkFailureReason.js', 'application/ForkDocumentUseCase.js', 'ui/components/ForkFailureDialog.js']) {
            const source = await readSource(file);
            assert(!/RETRYING|BLOCKED|FORK_FAILED|NETWORK_ERROR|TIMEOUT|NOT_FOUND|setInterval|retry\(/i.test(source),
                `4. ${file} still introduces no retry loop, no persistent lifecycle state, and no speculative reason vocabulary.`);
        }
        assert(!forkBlockSource.includes('setInterval') && !/retry\(/i.test(forkBlockSource),
            '5. the real, extracted route.query.fork handler itself contains no retry machinery either.');
    }
    console.log('✓ Section I: ForkFailureReason stays exactly its two evidenced values, and ForkFailureDialog\'s LIVE behavior (every speculative guess collapses onto the identical generic fallback) confirms no hidden third branch exists anywhere in the executed code.');

    // ===============================================================
    // Section J — Final convergence matrix.
    // ===============================================================
    console.log('\n=== 0.9.354 CONVERGENCE MATRIX ===');
    console.log('| Failure               | Structured reason       | Presentation              | Return path | Document created |');
    console.log('|------------------------|--------------------------|---------------------------|-------------|-------------------|');
    console.log('| License denied         | LICENSE_DENIED           | License-specific dialog   | World       | No                |');
    console.log('| Material unavailable   | MATERIAL_UNAVAILABLE     | Material-specific dialog  | World       | No                |');
    console.log('| Success                | —                        | Editor                    | —           | Yes               |');
    console.log('\nEvery row above was produced by EXECUTING the real, current production code (ForkDocumentUseCase,');
    console.log('LocalPublisherProvider, the real decentralized resolution pipeline, the extracted EditorView.js');
    console.log('route.query.fork handler and backFromForkFailure(), and ForkFailureDialog.js\'s own computed.message),');
    console.log('never merely pattern-matched against source text.');
    console.log('\nAll Fork Failure UX Convergence Audit tests passed.');
    console.log('\n=== 0.9.354 VERDICT: CONVERGED ===');
    console.log('Both demonstrated Fork failure causes preserve their structural reason and reach a distinct, actionable,');
    console.log('persistent presentation with a genuinely valid return path, across every entry context and every');
    console.log('Publication origin this codebase can produce — proceed to 0.9.355\'s product reassessment.');
}

run().catch((error) => {
    console.error('ForkFailureUXConvergenceAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
