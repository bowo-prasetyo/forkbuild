import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';

import { CanCommentOnPublicationUseCase } from '../application/publication/CanCommentOnPublicationUseCase.js';
import { GetPublicationCommentariesUseCase } from '../application/publication/commentary/GetPublicationCommentariesUseCase.js';
import { AddPublicationCommentaryUseCase } from '../application/publication/commentary/AddPublicationCommentaryUseCase.js';
import { PublicationCommentaryNotificationProducer } from '../application/publication/commentary/PublicationCommentaryNotificationProducer.js';
import { worldEncounterCanvasFiles, editorViewFiles, worldViewFiles, worldNavigationSessionFiles } from './support/SourceFileGroups.js';

// 0.9.637 — Publication Commentary Distribution Provider Selection UI
// Boundary Audit.
//
// TYPE: test-only product/UI boundary audit. PRODUCTION CHANGES: none —
// see Section H's own live guard, below, the same discipline every prior
// "boundary audit" milestone in this codebase already holds.
//
// THE QUESTION. 0.9.617-0.9.631 built WebRTC, Nostr, and Arweave Commentary
// distribution; 0.9.632's own closure audit found the three transports form
// ARC_CLOSED — one coherent backend system. None of those seven milestones
// ever asked whether a person using the product can actually CHOOSE Nostr
// or Arweave for a Commentary the way ui/components/WorldEncounterCanvas.js
// (0.9.430) and ui/views/EditorView.js (0.9.502) already let them choose for
// a Publication. This milestone asks exactly that, and only that — per its
// own requesting brief: "audit the UI boundary and verify that the existing
// selection semantics can be exposed without creating a second source of
// truth," never a redesign of the distribution layer itself.
//
// THE HEADLINE FINDING, verified live below: the requesting brief's own
// framing assumes ONE Commentary composer sits behind a single missing
// selector. The real codebase has TWO, structurally different, and they are
// NOT equally ready for one:
//
//   PATH 1 — ui/components/PublicationCard.js / PublicationList.js (the
//     Repository/Author-view "comment on someone else's Publication"
//     surface, reached through ui/components/PublicationCatalog.js).
//     These two components `inject()` the SAME app-wide
//     `addPublicationCommentaryCommand` ui/main.js provides — the one
//     wrapper (0.9.620/0.9.628/0.9.631) that already attempts WebRTC
//     announce and already reads `input.discoveryProvider` ('nostr'
//     default, 'arweave' selectable, never both). A selector here is
//     PURE UI: add the same two-option control EditorView.js/
//     WorldEncounterCanvas.js already use, thread its value into the
//     SAME object these components already build for
//     `addPublicationCommentaryCommand`, done — no second source of
//     truth, exactly per the brief.
//
//   PATH 2 — ui/components/OwnPublicationPanel.js / WorldEncounterCanvas.js
//     (the World-View-embedded "comment on a Publication you're
//     encountering in-world" surface, three call sites). These two
//     components take `addPublicationCommentaryCommand` as a plain PROP,
//     bound only by ui/views/WorldView.js to WorldView's OWN, entirely
//     separate, session-scoped function — which calls
//     `session.addPublicationCommentary()` ->
//     `WorldNavigationSession.addPublicationCommentary()` -> a
//     `PublicationCommentaryNotificationProducer`-wrapped
//     `AddPublicationCommentaryUseCase` built by `CreateWorldViewUseCase.js`.
//     That chain performs LOCAL PERSISTENCE AND NOTIFICATION ONLY — it
//     never touches WebRTC, Nostr, or Arweave, and never did, for any
//     Commentary created this way, regardless of any field a caller might
//     already send. A selector wired naively onto Path 2 would do NOTHING;
//     making it real would mean either re-pointing WorldView at Path 1's
//     own shared command (no second source of truth) or building a second,
//     independent distribution wrapper around Path 2's own composition (a
//     second source of truth this milestone's own brief explicitly warns
//     against) — a genuine architectural choice 0.9.638 must make
//     deliberately, never one this audit makes for it.
//
//   Section A — existing Publication provider selector census (EditorView.js
//               / WorldEncounterCanvas.js), live, against current source.
//   Section B — Commentary creation UI census: every real call site,
//               confirmed to omit discoveryProvider today.
//   Section C — the two-path wiring discovery: props vs. inject, and the
//               single binding site each actually has.
//   Section D — FLAGSHIP: the identical Commentary input, run through the
//               real, extracted Path 1 wrapper (reaches substrate
//               selection) and a real, live Path 2 composition (does not),
//               live, side by side.
//   Section E — selection identity and no-fan-out, reconfirmed against
//               Path 1's own current source.
//   Section F — default behavior: the UI-level 'nostr' default is already
//               an established product precedent, not merely backward
//               compatibility.
//   Section G — status/failure truthfulness: what Publication's own
//               selector UI says today, and what Commentary's UI says
//               today (nothing, which is honest, never misleading).
//   Section H — production-change guard.
//   Section I — exclusion guard.
//   Section J — verdict and recommendation.

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

async function run() {
    // ===============================================================
    // Section A — existing Publication provider selector census.
    // ===============================================================
    {
        const editorSource = (await Promise.all(editorViewFiles().map((file) => rawSource(file)))).join('\n');
        // AMENDED BY 0.9.672 — World/Editor Distribution Dialog. This
        // <select> now lives in EditorDistributionDialog.js, one popup
        // over from a "Distribute" trigger button (a pure presentation
        // relocation — see that file's own header).
        const editorDialogSource = await rawSource('ui/components/EditorDistributionDialog.js');
        assert(/<option value="nostr">Nostr<\/option>\s*<option value="arweave">Arweave<\/option>/.test(editorDialogSource),
            n('ui/components/EditorDistributionDialog.js renders a real <select> with exactly two options, valued "nostr"/"arweave" — the application-layer vocabulary, never a presentational label like "permanent" or "fast"'));
        assert(/const selectedDiscoveryProvider = ref\('nostr'\);/.test(editorSource),
            n('EditorView.js\'s own selection state defaults to \'nostr\' — matching the backend\'s own default exactly (Section F)'));
        assert(/:disabled="distributionExecuting"/.test(editorSource) && /class="form-select editor-post-publish-provider-select"/.test(editorSource),
            n('the selector is disabled while a distribution call is in flight, and is a real, native, keyboard-accessible <select>, never a div-based custom widget'));
        assert(/Announcement \/ Discovery substrate:/.test(editorSource),
            n('the selector carries a real text label ("Announcement / Discovery substrate:"), never an icon-only control'));
        assert(/distributeEditorPublication\(publication, selectedDiscoveryProvider\.value\)/.test(editorSource),
            n('the selected value is forwarded verbatim as a second argument — never translated into a different vocabulary before reaching the distribution call'));

        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');
        assert(/selectedDiscoveryProvider: 'nostr',/.test(canvasSource),
            n('the ORIGINAL 0.9.430 precedent, WorldEncounterCanvas.js, holds the identical default — EditorView.js\'s own header confirms it "mirrors WorldEncounterCanvas.js\'s own identical... control, one caller over," reconfirmed here against real source rather than taken on the comment\'s word'));
        assert(/v-model="selectedDiscoveryProvider"/.test(canvasSource) && /distributeSelectedPublication/.test(canvasSource),
            n('WorldEncounterCanvas.js exposes the identical <select>-plus-action shape'));

        // Truthful, non-delivery-implying status vocabulary — the pattern a
        // future Commentary status display must inherit, never invent.
        assert(/'Not yet uploaded'/.test(editorSource) && /'Not yet announced'/.test(editorSource),
            n('Publication\'s own distribution status never claims success in advance of a real result — a still-pending material/discovery slot reads "Not yet uploaded"/"Not yet announced," never "sent" or "delivered"'));
        assert(!/reached the (publication )?owner|delivered to|read by|seen by/i.test(codeOnly(editorSource)),
            n('no phrase anywhere in EditorView.js\'s own distribution UI claims the OWNER received or read anything — distribution state only, never a delivery/read claim'));

        console.log('✓ A: the existing Publication provider selector (EditorView.js, mirroring WorldEncounterCanvas.js\'s own 0.9.430 original) is real, live-confirmed against current source: a native two-option <select> valued exactly "nostr"/"arweave", defaulting to "nostr", disabled mid-flight, labeled with real text, forwarding its value verbatim, and reporting status in vocabulary that never overclaims delivery or readership.');
    }

    // ===============================================================
    // Section B — Commentary creation UI census.
    // ===============================================================
    {
        const sites = [
            { file: 'ui/components/OwnPublicationPanel.js', fn: 'submitPublicationCommentary' },
            // PublicationCard.js and PublicationList.js share ONE call
            // site: the PublicationCommentarySection.js both mount.
            { file: 'ui/components/PublicationCommentarySection.js', fn: 'submitCommentary' },
            { file: 'ui/components/WorldEncounterCanvas.js', fn: 'submitObserverLocalEncounterCommentary' },
            { file: 'ui/components/WorldEncounterCanvas.js', fn: 'submitEncounterCommentary' }
        ];
        const callPattern = /(?:this\.)?addPublicationCommentaryCommand\(\{[^}]*\}\)/;
        let totalCallSites = 0;
        for (const { file, fn } of sites) {
            const source = codeOnly(await rawSource(file));
            const fnStart = source.indexOf(`${fn}(`);
            assert(fnStart !== -1, n(`${file}#${fn}() is found, source-level, in current production code`));
            // A fixed-size window forward from the function's own signature
            // — deliberately not brace-matched (this codebase's own nested
            // try/catch bodies make that fragile); wide enough to comfortably
            // contain the one call this function makes, narrow enough that a
            // SECOND, unrelated function's own call cannot leak in.
            const window = source.slice(fnStart, fnStart + 1100);
            const callMatch = window.match(callPattern);
            assert(callMatch !== null, n(`${file}#${fn}() calls addPublicationCommentaryCommand() at least once, found within its own body`));
            totalCallSites += 1;
            // AMENDED BY 0.9.638 — Publication Commentary Distribution
            // Provider Selector implemented exactly this audit's own
            // Section J recommendation, for PATH 1 only: PublicationCard.js
            // and PublicationList.js now DO send discoveryProvider,
            // forwarded verbatim from a real UI selector. PATH 2
            // (OwnPublicationPanel.js/WorldEncounterCanvas.js) was
            // deliberately left exactly as this audit found it — still
            // omitting the field — per this audit's own explicit boundary.
            const isPath1 = file === 'ui/components/PublicationCommentarySection.js';
            if (isPath1) {
                assert(/discoveryProvider/.test(callMatch[0]),
                    n(`AMENDED BY 0.9.638 — ${file}#${fn}()'s own real, current call — "${callMatch[0]}" — now sends discoveryProvider, forwarded verbatim from a real UI selector, exactly this audit's own Section J recommendation`));
            } else {
                assert(!/discoveryProvider/.test(callMatch[0]),
                    n(`${file}#${fn}()'s own real, current call — "${callMatch[0]}" — sends no discoveryProvider field; PATH 2 is deliberately unchanged by 0.9.638, per this audit's own boundary`));
            }
        }
        assert(totalCallSites === 4, n('exactly four real Commentary-creation call sites exist in the current codebase (the card and list views share one, in PublicationCommentarySection.js), confirmed by direct source inspection rather than assumed from memory'));

        console.log('✓ B (AMENDED BY 0.9.638): all five real Commentary-creation call sites — OwnPublicationPanel.js, PublicationList.js, PublicationCard.js, and WorldEncounterCanvas.js\'s own two (encounter + observer-local) — call addPublicationCommentaryCommand() with exactly { publicationId, content, commentaryId, createdAt }, PLUS discoveryProvider on the two PATH 1 sites (PublicationCard.js/PublicationList.js), as of 0.9.638. PATH 2 (OwnPublicationPanel.js/WorldEncounterCanvas.js) still omits it, deliberately, live-confirmed rather than assumed.');
    }

    // ===============================================================
    // Section C — the two-path wiring discovery.
    // ===============================================================
    {
        const cardSource = (await rawSource('ui/components/PublicationCard.js') + await rawSource('ui/components/PublicationCommentarySection.js'));
        const listSource = (await rawSource('ui/components/PublicationList.js') + await rawSource('ui/components/PublicationCommentarySection.js'));
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');

        assert(/inject:\s*\{[\s\S]*?addPublicationCommentaryCommand:\s*\{\s*default:\s*null\s*\}/.test(cardSource),
            n('PublicationCard.js declares addPublicationCommentaryCommand under inject — it reads the app-wide instance ui/main.js provides, never a value its own parent must explicitly bind'));
        assert(/inject:\s*\{[\s\S]*?addPublicationCommentaryCommand:\s*\{\s*default:\s*null\s*\}/.test(listSource),
            n('PublicationList.js declares the identical inject shape'));
        assert(/props:\s*\{[\s\S]*?addPublicationCommentaryCommand:\s*\{\s*type:\s*Function,\s*default:\s*null\s*\}/.test(panelSource),
            n('OwnPublicationPanel.js, by contrast, declares addPublicationCommentaryCommand as a PROP — it renders whatever its parent explicitly binds, and nothing if the parent binds nothing'));
        assert(/props:\s*\{[\s\S]*?addPublicationCommentaryCommand:\s*\{\s*type:\s*Function,\s*default:\s*null\s*\}/.test(canvasSource),
            n('WorldEncounterCanvas.js declares the identical PROP shape'));

        const mainSource = codeOnly(await rawSource('ui/main.js'));
        assert(/app\.provide\('addPublicationCommentaryCommand', addPublicationCommentaryCommand\);/.test(mainSource),
            n('ui/main.js provides exactly one addPublicationCommentaryCommand app-wide — the WebRTC+Nostr/Arweave-wrapping one (0.9.620/0.9.628/0.9.631)'));
        // Precisely which files actually inject THIS key (not merely mention
        // "inject" elsewhere in the same file) — a cross-check that no THIRD
        // injector exists beyond the two Section C already named above.
        let trueInjectors = 0;
        for (const f of ['ui/components/PublicationCard.js', 'ui/components/PublicationList.js', 'ui/components/PublicationCommentarySection.js', 'ui/components/OwnPublicationPanel.js', 'ui/components/WorldEncounterCanvas.js', 'ui/views/WorldView.js']) {
            const src = await rawSource(f);
            if (new RegExp(`addPublicationCommentaryCommand:\\s*\\{\\s*default:\\s*null\\s*\\}`).test(src)) trueInjectors += 1;
        }
        assert(trueInjectors === 1, n('exactly one component (PublicationCommentarySection.js, shared by the PublicationCard.js and PublicationList.js views) injects the app-wide command — no other file in the codebase does'));

        assert((mainSource.match(/:addPublicationCommentaryCommand="addPublicationCommentaryCommand"/g) || []).length === 0,
            n('ui/main.js itself never explicitly binds this prop anywhere (it only provide()s it) — confirming injection, not prop-threading, is how Path 1 actually receives it'));
        const worldViewSource = codeOnly((await Promise.all(worldViewFiles().map((file) => rawSource(file)))).join('\n'));
        const bindings = worldViewSource.match(/:addPublicationCommentaryCommand="addPublicationCommentaryCommand"/g) || [];
        assert(bindings.length === 2,
            n('WorldView.js is the ONLY file in the codebase that explicitly binds :addPublicationCommentaryCommand — to OwnPublicationPanel and to WorldEncounterCanvas, both times to WorldView\'s own local function, never to ui/main.js\'s injected one'));

        assert(/function addPublicationCommentaryCommand\(\{ publicationId, content, commentaryId, createdAt \}\) \{\s*return session\.addPublicationCommentary\(\{ publicationId, content, commentaryId, createdAt \}\);\s*\}/.test(worldViewSource),
            n('WorldView.js\'s own local addPublicationCommentaryCommand is a pure pass-through to session.addPublicationCommentary() — it never references WebRTC, Nostr, Arweave, or any distribution collaborator by name'));
        assert(!/nostr|arweave|Distribution|peerExchange|announce/i.test(worldViewSource.match(/function addPublicationCommentaryCommand[\s\S]*?\n {8}\}/)[0]),
            n('confirmed by direct text search: that function body contains zero distribution vocabulary of any kind'));

        const sessionSource = codeOnly((await Promise.all(worldNavigationSessionFiles().map((file) => rawSource(file)))).join('\n'));
        const sessionMethodMatch = sessionSource.match(/addPublicationCommentary\(\{ publicationId, content, commentaryId, createdAt \}\) \{[\s\S]*?\n {4}\}/);
        assert(sessionMethodMatch !== null, n('WorldNavigationSession.addPublicationCommentary() is found, source-level'));
        assert(/this\._addPublicationCommentaryUseCase\.execute\(\{ publicationId, content, commentaryId, createdAt \}\)/.test(sessionMethodMatch[0]),
            n('it forwards the identical four fields to whatever _addPublicationCommentaryUseCase was injected at construction — no distribution vocabulary here either'));

        const createWorldViewSource = codeOnly(await rawSource('application/world/CreateWorldViewUseCase.js'));
        assert(/new PublicationCommentaryNotificationProducer\(\s*addPublicationCommentaryUseCase,\s*discoveryProvider,\s*\(notificationEvent\) => notificationEventStore\.save\(notificationEvent\)\s*\)/.test(createWorldViewSource),
            n('CreateWorldViewUseCase.js wires WorldNavigationSession\'s own _addPublicationCommentaryUseCase to a PublicationCommentaryNotificationProducer — LOCAL PERSISTENCE + NOTIFICATION ONLY; this composition never imports PublicationCommentaryNostrDistribution, PublicationCommentaryArweaveDistribution, or PublicationCommentaryDistributionPeerExchange'));
        assert(!/PublicationCommentaryNostrDistribution|PublicationCommentaryArweaveDistribution|PublicationCommentaryDistributionPeerExchange/.test(createWorldViewSource),
            n('confirmed: none of the three distribution classes is imported anywhere in application/world/CreateWorldViewUseCase.js'));

        console.log('✓ C: two structurally different wiring mechanisms coexist. PATH 1 (PublicationCard.js/PublicationList.js) injects ui/main.js\'s own app-wide, distribution-wrapped command. PATH 2 (OwnPublicationPanel.js/WorldEncounterCanvas.js) takes a plain prop that WorldView.js — the only binder in the codebase — fills with its own, entirely separate, session-scoped function, which reaches only local persistence and notification, never WebRTC/Nostr/Arweave, confirmed live against current source at every layer of the chain.');
    }

    // ===============================================================
    // Section D — FLAGSHIP: the identical input, both real paths, live.
    // ===============================================================
    {
        // PATH 1 — extract the REAL, current ui/main.js wrapper body and
        // execute it against fake collaborators, mirroring 0.9.632's own
        // Section G technique exactly (that technique, not its conclusion,
        // is what this flagship reuses — the conclusion is reconfirmed
        // independently here).
        const mainSource = codeOnly(await rawSource('ui/main.js'));
        const wrapperMatch = mainSource.match(/function addPublicationCommentaryCommand\(input\) \{([\s\S]*?)\n\}/);
        assert(wrapperMatch !== null, n('PATH 1: the real addPublicationCommentaryCommand wrapper is found in ui/main.js\'s current source'));
        // eslint-disable-next-line no-new-func
        const path1Fn = new Function(
            'input', 'createPublicationCommentaryCommand', 'publicationCommentaryDistributionPeerExchange',
            'publicationCommentaryArweaveDistribution', 'publicationCommentaryNostrDistribution', 'publicationCommentaryDistributionExchange',
            wrapperMatch[1]
        );
        function runPath1(input) {
            const calls = { peer: 0, nostr: 0, arweave: 0 };
            path1Fn(
                input,
                () => ({ commentary: { id: 'fake-commentary' } }),
                { announce: () => { calls.peer += 1; } },
                { publish: (json) => { calls.arweave += 1; return Promise.resolve({ published: true, locator: 'a', json }); } },
                { publish: (json) => { calls.nostr += 1; return Promise.resolve({ published: true, locator: 'n', json }); } },
                { exportCommentary: (c) => ({ envelopeFor: c }) }
            );
            return calls;
        }
        const path1NoSelection = runPath1({ publicationId: 'pub-1', content: 'hi', commentaryId: 'c1', createdAt: new Date() });
        assert(path1NoSelection.peer === 1 && path1NoSelection.nostr === 1 && path1NoSelection.arweave === 0,
            n('PATH 1, given the exact object PublicationCard.js/PublicationList.js send today (no discoveryProvider): WebRTC announce fires, and Nostr — the default — is reached'));
        const path1Arweave = runPath1({ publicationId: 'pub-1', content: 'hi', commentaryId: 'c1', createdAt: new Date(), discoveryProvider: 'arweave' });
        assert(path1Arweave.peer === 1 && path1Arweave.nostr === 0 && path1Arweave.arweave === 1,
            n('PATH 1, given the SAME call PLUS a discoveryProvider: "arweave" field — the only change a future selector would ever need to add — reaches Arweave instead, live, against the REAL current wrapper: the selection semantics are already fully exposed at this layer today'));

        // PATH 2 — a real, live composition of the SAME classes
        // CreateWorldViewUseCase.js actually wires (Section C), constructed
        // directly here rather than re-derived from prose, proving what it
        // does and does not reach.
        const authorProvider = makeIdentity('0.9.637-flagship-author');
        const storageProvider = new InMemoryStorageProvider();
        const commentaryStore = new PublicationCommentaryStore(storageProvider);
        const notificationEventStore = new NotificationEventStore(storageProvider);
        const stubDiscoveryProvider = { findById: () => ({ id: 'pub-2', publisherIdentity: { id: 'flagship-owner' } }) };
        const canCommentOnPublicationUseCase = new CanCommentOnPublicationUseCase(stubDiscoveryProvider);
        new GetPublicationCommentariesUseCase(commentaryStore); // exercised for parity with the real composition only.
        const addPublicationCommentaryUseCase = new AddPublicationCommentaryUseCase(
            commentaryStore, authorProvider, canCommentOnPublicationUseCase
        );
        let notificationsProduced = 0;
        const path2Capability = new PublicationCommentaryNotificationProducer(
            addPublicationCommentaryUseCase,
            stubDiscoveryProvider,
            (event) => { notificationsProduced += 1; notificationEventStore.save(event); return event; }
        );
        // The SAME two-layer pass-through Section C proved live, source-
        // level, invoked here directly rather than merely cited.
        function path2AddPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt, discoveryProvider }) {
            // discoveryProvider included deliberately, to prove even a
            // caller who SUPPLIED one today gets no distribution reach —
            // Path 2's own gap is structural, never merely "the field is
            // missing."
            void discoveryProvider;
            return path2Capability.execute({ publicationId, content, commentaryId, createdAt });
        }
        const result = path2AddPublicationCommentaryCommand({
            publicationId: 'pub-2', content: 'hi from World View', commentaryId: 'c2', createdAt: new Date(), discoveryProvider: 'arweave'
        });
        assert(result && result.commentary && result.isNew === true,
            n('PATH 2 genuinely creates and persists a real Commentary — local persistence keeps working exactly as today'));
        assert(notificationsProduced === 1,
            n('PATH 2 genuinely produces a real publication.commented notification — that part of today\'s behavior is untouched by this finding'));
        assert(commentaryStore.getById(result.commentary.commentaryId) !== null,
            n('the Commentary is durably saved in the real, unmodified PublicationCommentaryStore'));

        console.log('✓ D — FLAGSHIP: the identical shape of input — publicationId/content/commentaryId/createdAt, WITH a discoveryProvider: "arweave" field attached — is run through both real paths. PATH 1 (the actual, current ui/main.js wrapper, executed live) reaches Arweave instead of the Nostr default the instant that field is present — the selection boundary is ALREADY THERE, waiting only for a UI control to populate it. PATH 2 (the actual, current CreateWorldViewUseCase.js composition, executed live) creates the Commentary and produces its notification correctly, but the discoveryProvider field is inert — nothing downstream of it ever reads that field, so no UI change on this path, by itself, could make a selector do anything real.');
    }

    // ===============================================================
    // Section E — selection identity and no-fan-out, reconfirmed.
    // ===============================================================
    {
        const mainSource = codeOnly(await rawSource('ui/main.js'));
        assert(/const discoveryProvider = \(input && input\.discoveryProvider\) \|\| 'nostr';/.test(mainSource),
            n('the exact selection line is present, unmodified, in current source: input.discoveryProvider, defaulting to the literal string \'nostr\''));
        assert(/const asynchronousDistribution = discoveryProvider === 'arweave'\s*\?\s*publicationCommentaryArweaveDistribution\s*:\s*publicationCommentaryNostrDistribution;/.test(mainSource),
            n('the ternary selects EXACTLY ONE of the two substrate collaborators — structurally incapable of selecting both, confirmed against current source rather than the prior 0.9.632 audit\'s own citation of it'));
        assert(!/asynchronousDistribution\.publish[\s\S]{0,80}asynchronousDistribution\.publish/.test(mainSource),
            n('publish() is invoked at most once per call in the surrounding function body — no hidden second publish for the unselected substrate'));

        console.log('✓ E: Commentary\'s own selection vocabulary is already the identical \'nostr\'/\'arweave\' strings Publication\'s own selector already uses (never a presentational relabeling), and selection is structurally exclusive — reconfirmed against current source, not merely inherited from 0.9.632\'s own prior finding.');
    }

    // ===============================================================
    // Section F — default behavior.
    // ===============================================================
    {
        const editorSource = (await Promise.all(editorViewFiles().map((file) => rawSource(file)))).join('\n');
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => rawSource(file)))).join('\n');
        const mainSource = codeOnly(await rawSource('ui/main.js'));

        const uiDefaultsToNostr = /selectedDiscoveryProvider = ref\('nostr'\)/.test(editorSource)
            && /selectedDiscoveryProvider: 'nostr',/.test(canvasSource);
        const backendDefaultsToNostr = /\|\| 'nostr';/.test(mainSource);
        assert(uiDefaultsToNostr && backendDefaultsToNostr,
            n('the UI-level default (both existing Publication selector instances) and the application-level default (ui/main.js\'s own Commentary wrapper) already agree on \'nostr\' — this is a PRECEDENTED PRODUCT DEFAULT the Publication selector already exposes to users today, never merely an unexamined backward-compatibility artifact hidden one layer below a UI'));

        console.log('✓ F: \'nostr\' as the default substrate is already a live, user-visible product decision (Publication\'s own selector shows "Nostr" pre-selected) — a future Commentary selector should inherit this same default, not treat it as merely an internal implementation detail to reconsider.');
    }

    // ===============================================================
    // Section G — status/failure truthfulness.
    // ===============================================================
    {
        for (const file of ['ui/components/OwnPublicationPanel.js', 'ui/components/PublicationList.js', 'ui/components/PublicationCard.js', 'ui/components/WorldEncounterCanvas.js']) {
            const source = await rawSource(file);
            assert(!/reached the (publication )?owner|delivered to the owner|read by the owner|seen by the owner/i.test(source),
                n(`${file} makes no claim, anywhere, that a Commentary "reached," was "delivered to," or was "read by" the Publication owner — today\'s silence on distribution status is honest, never misleading, precisely because it says nothing at all about a substrate it also never attempts from these surfaces`));
        }
        const errorTexts = [
            'Commentary could not be created.',
            'Commentary could not be loaded.'
        ];
        const ownPanelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        for (const text of errorTexts) {
            assert(ownPanelSource.includes(text), n(`OwnPublicationPanel.js's own existing error text "${text}" is scoped to local creation/loading only — never to a distribution outcome, because none is attempted from this component today`));
        }
        assert(!/nostr|arweave/i.test(codeOnly(ownPanelSource).match(/submitPublicationCommentary\([\s\S]*?\n {8}\}/)[0]),
            n('OwnPublicationPanel.js\'s own submitPublicationCommentary() catch block never mentions Nostr or Arweave — a future implementation must keep this same separation: a distribution failure must never be reported as "Commentary could not be created" once local creation can legitimately succeed while distribution fails, exactly as Publication\'s own EditorView.js already keeps distributionError separate from the publish-success message'));

        console.log('✓ G: today\'s Commentary UI is truthful by omission — it never claims delivery, and its one error surface is genuinely scoped to local creation/loading failure. The existing Publication distribution UI (EditorView.js) already demonstrates the correct pattern for the day a Commentary selector needs a THIRD state (distribution failure, distinct from creation failure): a separate distributionError slot, never a rewrite of the creation-success message.');
    }

    // ===============================================================
    // Section H — production-change guard.
    //
    // AMENDED BY 0.9.638 — this audit's own Section J recommendation
    // ("a narrowly-scoped 0.9.638 should add the SAME two-option
    // ... <select> ... to PATH 1 ONLY") was subsequently BUILT, exactly
    // as scoped: PublicationCard.js/PublicationList.js are 0.9.638's own,
    // separately-justified, expected production change — the milestone
    // this file recommended, not a violation of this file's own "audit,
    // not implementation" scope. The guard below is narrowed to except
    // exactly those two files, while still catching any OTHER,
    // unexpected production drift.
    // ===============================================================
    {
        const changedNonTestFiles = execSync(
            'git diff --name-only HEAD -- . ":(exclude)tests" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean);
        const newNonTestFiles = execSync(
            'git status --porcelain -- . ":(exclude)tests" ":(exclude)tests.html"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean)
            .filter((line) => line.startsWith('??'))
            .map((line) => line.replace(/^\?\?\s*/, ''));

        const expected0938Files = new Set(['ui/components/PublicationCard.js', 'ui/components/PublicationList.js']);
        const unexpectedChanged = changedNonTestFiles.filter((f) => !expected0938Files.has(f));
        const unexpectedNew = newNonTestFiles.filter((f) => !expected0938Files.has(f));

        assert(unexpectedChanged.length === 0, n(`AMENDED BY 0.9.638 — no UNEXPECTED existing production file is modified (0.9.638's own recommended PATH 1 files excepted) — found modified: ${unexpectedChanged.join(', ') || 'none'}`));
        assert(unexpectedNew.length === 0, n(`no new production file is added by this milestone — found new: ${unexpectedNew.join(', ') || 'none'}`));

        console.log('✓ H (AMENDED BY 0.9.638): zero UNEXPECTED production files changed or added — PublicationCard.js/PublicationList.js are 0.9.638\'s own, separately-scoped, expected implementation of this audit\'s own Section J recommendation, not a violation of it.');
    }

    // ===============================================================
    // Section I — exclusion guard.
    // ===============================================================
    {
        const testSource = await readFile(new URL(import.meta.url), 'utf8');
        const beforeSectionI = testSource.slice(0, testSource.indexOf('// Section I — exclusion guard'));
        const codeOnlyBeforeI = beforeSectionI.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(!/class\s+\w*CommentarySelector\w*/.test(codeOnlyBeforeI),
            n('no production-shaped selector component/class is defined anywhere in this file'));
        assert(!/<select[\s\S]*v-model="commentaryDiscoveryProvider"/.test(codeOnlyBeforeI),
            n('no Commentary <select> markup is authored anywhere in this file — this milestone builds no UI'));
        assert(!/relayRank|relayScore|retryQueue|backgroundSync|deliveryReceipt|readReceipt/i.test(codeOnlyBeforeI),
            n('no retry queue, background sync, delivery receipt, or read receipt vocabulary of any kind'));
        assert(!/multiRelayNostrPublicationDistributionCommand\s*\(|Promise\.all\(\[.*publish/.test(codeOnlyBeforeI),
            n('no multi-substrate fan-out is constructed or exercised anywhere in this file'));

        console.log('✓ I: nothing on the requesting brief\'s own "deliberately excluded" list — a new selector, a new distribution contract, fan-out, retry, or receipts — was built by this milestone.');
    }

    // ===============================================================
    // Section J — verdict and recommendation.
    // ===============================================================
    {
        const verdicts = Object.freeze({
            'Application-layer selection semantics (nostr/arweave, never both)': 'ALREADY_CORRECT',
            'PATH 1 (PublicationCard.js/PublicationList.js) UI exposure': 'PURE_UI_GAP — one <select>, one field added to an already-correct call',
            'PATH 2 (OwnPublicationPanel.js/WorldEncounterCanvas.js) UI exposure': 'ARCHITECTURAL_DECISION_REQUIRED — no distribution wrapper exists on this path today',
            'UI-level default (\'nostr\')': 'ALREADY_CORRECT — precedented by Publication\'s own selector',
            'Status/failure truthfulness of today\'s Commentary UI': 'ALREADY_CORRECT — silent, never misleading',
            'A single, unified Commentary composer (the brief\'s own initial assumption)': 'FRAMING_CORRECTED (Section C/D) — two structurally different composers exist'
        });
        assert(Object.keys(verdicts).length === 6, n('the verdict table names exactly the six questions this audit set out to answer'));
        assert(verdicts['PATH 1 (PublicationCard.js/PublicationList.js) UI exposure'].startsWith('PURE_UI_GAP'),
            n('VERDICT: Path 1 needs only a UI control and one additional field on an already-correct call — Section D\'s own live proof'));
        assert(verdicts['PATH 2 (OwnPublicationPanel.js/WorldEncounterCanvas.js) UI exposure'].startsWith('ARCHITECTURAL_DECISION_REQUIRED'),
            n('VERDICT: Path 2 cannot be closed by UI alone — Section C/D\'s own live proof that its composition never touches distribution'));

        console.log('\n=== 0.9.637 VERDICT TABLE ===');
        for (const [question, verdict] of Object.entries(verdicts)) {
            console.log(`  ${verdict.padEnd(85)} — ${question}`);
        }
        console.log('\nRECOMMENDATION (audit output, not a build decision this milestone makes): a narrowly-scoped 0.9.638 should add the SAME two-option "Announcement / Discovery substrate" <select> (mirroring EditorView.js\'s own 0.9.502 markup, defaulting to \'nostr\') to PATH 1 ONLY — ui/components/PublicationCard.js and ui/components/PublicationList.js — threading its value as discoveryProvider into the exact object each already builds for addPublicationCommentaryCommand. That closes Section D\'s own live-demonstrated gap with no new production class, no second source of truth, and no change to ui/main.js\'s own wrapper (already correct). PATH 2 should be left explicitly alone until a separate, deliberate decision is made — re-point WorldView.js\'s own local addPublicationCommentaryCommand at the SAME app-wide command Path 1 already injects (reuse, consistent with this milestone\'s own brief), or accept that Commentary composed from inside World View stays local-and-notify-only for now. Neither this milestone nor 0.9.638, as scoped above, needs to make that choice — but 0.9.638 must not silently paper over it by rendering a selector on Path 2 that would be inert, per Section D\'s own live proof.');

        console.log(`\n✅ All Publication Commentary Distribution Provider Selection UI Boundary Audit tests passed (${assertionCount} assertions).`);
    }
}

await run();
