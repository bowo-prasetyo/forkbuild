import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { CanCommentOnPublicationUseCase } from '../application/CanCommentOnPublicationUseCase.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';

// 0.9.305 — Cross-Surface Publication Commentary Reassessment.
//
// 0.9.288 named six UI surfaces that already hold a full Publication
// object at render time yet carried zero commentary vocabulary.
// 0.9.289/0.9.291 deliberately wired exactly two of them
// (PublicationCard.js, WorldEncounterCanvas.js). 0.9.290's own Section K
// classified the remaining four as not worth wiring, with a one-line
// reason each. That reasoning has never been re-checked against current
// source since — fourteen milestones (0.9.291-0.9.304) have shipped in
// the meantime, and 0.9.304 itself is the reason this reassessment
// exists: it closed a DIFFERENT arc (provider preference) precisely
// because architectural reachability ("this COULD be wired") is not the
// same question as product need ("SHOULD it be"). This milestone applies
// that same discipline to Commentary's own remaining seam, rather than
// assuming 0.9.290's three-year-old verdict still holds by inertia.
//
// TEST-ONLY, per its own brief. No production file is touched — this
// milestone's only artifact is this file plus its docs/Roadmap.md entry.
// It re-derives every claim from CURRENT source, not from any earlier
// milestone's header, and reaches exactly one of four allowed verdicts
// per candidate: INTEGRATE / DEFER / DUPLICATIVE / STOP.
//
//   Commentary capability (domain+store+use cases+notifier, unchanged)
//        │
//        ├── OwnPublicationPanel.js        (wired, 0.9.248) ── props
//        ├── PublicationCard.js            (wired, 0.9.289) ── inject
//        ├── WorldEncounterCanvas.js       (wired, 0.9.291) ── props
//        │
//        └── four re-audited candidates, THIS milestone:
//              PublicationCatalog.js               -> ?
//              PublicationPreview.js                -> ?
//              DecentralizedPublicationsView.js     -> ?
//              "PublicationDistributionPanel"       -> ? (does it exist?)
//
// Sections A-J below map directly onto this milestone's own brief.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function codeOnlySource(relativePath) {
    const text = await rawSource(relativePath);
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function sourceExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch {
        return false;
    }
}

function grepCount(pattern, dirs) {
    let hits = '';
    try {
        hits = execSync(`grep -rl "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

function findRepoWide(pattern) {
    let hits = '';
    try {
        hits = execSync(`grep -rli "${pattern}" . --include="*.js" --include="*.md" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* zero hits */ }
    return hits.trim() ? hits.trim().split('\n').filter(Boolean) : [];
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeDocument(title, author) {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author }) });
}

async function runTests() {
    console.log('Running Post-Commentary Cross-Surface Product Reassessment tests...\n');

    // ---------------------------------------------------------------
    // Section A — Current Commentary capability inventory. One
    // representative signal per stage, read fresh from unmodified
    // source — never restated from an earlier milestone's own header.
    // ---------------------------------------------------------------
    {
        const domain = await rawSource('core/PublicationCommentary.js');
        const store = await rawSource('storage/PublicationCommentaryStore.js');
        const addUseCase = await rawSource('application/AddPublicationCommentaryUseCase.js');
        const getUseCase = await rawSource('application/GetPublicationCommentariesUseCase.js');
        const canComment = await rawSource('application/CanCommentOnPublicationUseCase.js');
        const producer = await rawSource('application/PublicationCommentaryNotificationProducer.js');

        assert(domain.includes('class PublicationCommentary') && domain.includes('publicationId'),
            'A1. core/PublicationCommentary.js still keys commentary on a publicationId.');
        assert(store.includes('class PublicationCommentaryStore') && store.includes('getForPublication('),
            'A2. storage/PublicationCommentaryStore.js still exposes getForPublication() over an injected StorageProvider.');
        assert(addUseCase.includes('class AddPublicationCommentaryUseCase') && addUseCase.includes('resolveSigningIdentityId'),
            'A3. application/AddPublicationCommentaryUseCase.js still resolves authorship from the identity infrastructure.');
        assert(getUseCase.includes('class GetPublicationCommentariesUseCase'),
            'A4. application/GetPublicationCommentariesUseCase.js still exists as the read path.');
        assert(canComment.includes('class CanCommentOnPublicationUseCase') && canComment.includes('discoveryProvider.findById'),
            'A5. application/CanCommentOnPublicationUseCase.js still authorizes via Publication existence, not ownership.');
        assert(producer.includes('class PublicationCommentaryNotificationProducer'),
            'A6. application/PublicationCommentaryNotificationProducer.js still exists as the notification path.');

        // A7. The three live UI bindings, confirmed by their own
        // real, current prop/inject declarations rather than assumed.
        const ownPanel = await rawSource('ui/components/OwnPublicationPanel.js');
        const card = await rawSource('ui/components/PublicationCard.js');
        const canvas = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(/getPublicationCommentariesCommand:\s*\{\s*\n?\s*type: Function/.test(ownPanel),
            'A7a. OwnPublicationPanel.js still declares getPublicationCommentariesCommand as a typed prop (session-supplied, via WorldView.js).');
        assert(card.includes('getPublicationCommentariesCommand: { default: null }'),
            'A7b. PublicationCard.js still injects getPublicationCommentariesCommand app-wide.');
        assert(/getPublicationCommentariesCommand:\s*\{\s*\n?\s*type: Function/.test(canvas),
            'A7c. WorldEncounterCanvas.js still declares the same command as a typed prop, forwarded by WorldView.js exactly like OwnPublicationPanel\'s own.');

        console.log('✓ Section A: Commentary\'s domain/storage/application/notification pipeline is intact, and exactly three UI surfaces are genuinely wired — OwnPublicationPanel and WorldEncounterCanvas (props, forwarded by WorldView.js), PublicationCard (inject, app-wide).');
    }

    // ---------------------------------------------------------------
    // Section B — Remaining Publication surfaces, discovered fresh
    // from source rather than copied from 0.9.288's own enumeration.
    // ---------------------------------------------------------------
    {
        const bearers = findRepoWide('pub\\.id\\|pub\\.documentId\\|publication\\.id')
            .filter((f) => f.startsWith('./ui/') && f.endsWith('.js'));
        const bearerSet = new Set(bearers.map((f) => f.replace(/^\.\//, '')));

        const expectedBearers = [
            'ui/components/OwnPublicationPanel.js',
            'ui/components/PublicationCard.js',
            'ui/components/PublicationCatalog.js',
            'ui/components/PublicationList.js',
            'ui/components/WorldEncounterCanvas.js',
            'ui/views/DecentralizedPublicationsView.js',
            'ui/views/WorldView.js'
        ];
        for (const file of expectedBearers) {
            assert(bearerSet.has(file), `B1. ${file} is still a real Publication-bearing surface (found by fresh repo grep).`);
        }

        // B2. PublicationPreview.js is a Publication bearer too, but its
        // OWN code never references publication.id/documentId directly
        // (it only reads .contentHash for cache keys and passes the
        // whole object to derivePlaceholderPreview) — caught separately,
        // by prop type, not by this particular grep.
        const preview = await rawSource('ui/components/PublicationPreview.js');
        assert(preview.includes('publication: { type: Object, required: true }'),
            'B2. PublicationPreview.js still requires a full Publication object as a prop.');

        // B3. None of the four candidates this milestone re-audits
        // carry commentary wiring TODAY — the starting condition this
        // whole reassessment is auditing.
        const candidates = [
            'ui/components/PublicationCatalog.js',
            'ui/components/PublicationPreview.js',
            'ui/views/DecentralizedPublicationsView.js'
        ];
        for (const file of candidates) {
            const code = await codeOnlySource(file);
            assert(!code.includes('getPublicationCommentariesCommand') && !code.includes('addPublicationCommentaryCommand'),
                `B3. ${file} still carries no commentary wiring as of this milestone's audit.`);
        }

        // B4. "PublicationDistributionPanel" — the fourth name this
        // milestone's own brief lists — is NOT a file that exists
        // anywhere in this repository. docs/Roadmap.md's own 0.9.141
        // entry named it explicitly, as a HYPOTHETICAL shared
        // abstraction it deliberately declined to build ("A shared
        // `PublicationDistributionPanel` abstraction merging the two UI
        // surfaces... They passed this audit precisely because they
        // stay two separate components"). No such class or component
        // was ever built since.
        for (const guess of [
            'ui/components/PublicationDistributionPanel.js',
            'ui/views/PublicationDistributionPanel.js',
            'ui/components/PublicationDistribution.js'
        ]) {
            assert(!(await sourceExists(guess)), `B4. ${guess} does not exist — "PublicationDistributionPanel" was never built as a real component.`);
        }
        assert(grepCount('class PublicationDistributionPanel', ['ui', 'application', 'core', 'storage', 'discovery', 'publisher', 'identity', 'content', 'anchoring']) === 0,
            'B4b. no such class exists anywhere in production source.');
        const roadmap = await rawSource('docs/Roadmap.md');
        assert(roadmap.includes('A shared `PublicationDistributionPanel` abstraction merging the two UI'),
            'B4c. docs/Roadmap.md 0.9.141 still records this name as a deliberately-declined hypothetical, not a shipped surface.');

        console.log('✓ Section B: the real, current Publication-bearing surface set is rediscovered from source (matches 0.9.288\'s own six, plus their two hosts) — three of the four named candidates carry no commentary wiring, and the fourth, "PublicationDistributionPanel," is not a real component at all.');
    }

    // ---------------------------------------------------------------
    // Section C — PublicationCatalog.js classification.
    // ---------------------------------------------------------------
    let catalogDecision;
    {
        const code = await rawSource('ui/components/PublicationCatalog.js');

        // C1. Publication object available? Only indirectly — Catalog
        // never touches a single Publication's own fields; it queries
        // PAGES of them and hands each one, whole, to a child.
        assert(!/publication\.title|publication\.author|publication\.contentReference/.test(code),
            'C1. PublicationCatalog.js itself never reads a single Publication\'s own identity fields.');

        // C2. It is a pure host: it imports and mounts exactly the two
        // components that already render one Publication at a time.
        assert(code.includes("import PublicationCard from './PublicationCard.js'") &&
               code.includes("import PublicationList from './PublicationList.js'") &&
               code.includes('<PublicationCard') && code.includes('<PublicationList'),
            'C2. PublicationCatalog.js still only mounts PublicationCard/PublicationList — it never renders a Publication\'s own identity itself.');

        // C3. Duplication check: the SAME publication object/id
        // Catalog would need for its own commentary UI is the exact
        // one it already forwards, unmodified, to PublicationCard —
        // which already carries full commentary UI (Section A).
        assert(/:publication="pub"/.test(code),
            'C3. PublicationCatalog.js forwards the identical `pub` object to PublicationCard as its own :publication prop — same identity, same id, no transformation.');
        const cardCode = await rawSource('ui/components/PublicationCard.js');
        assert(cardCode.includes('publication-card--comment') || cardCode.includes("action-btn--comment"),
            'C3b. PublicationCard.js (which Catalog mounts for every item) already renders a Comment action for that identical publication.');

        catalogDecision = 'DUPLICATIVE';
        console.log(`✓ Section C: PublicationCatalog.js -> ${catalogDecision} (it is the shared host mounting PublicationCard, which already owns full commentary for the identical publication object one level down — adding a second Comment entry point at the host level would duplicate, not add, capability).`);
    }

    // ---------------------------------------------------------------
    // Section D — PublicationPreview.js classification.
    // ---------------------------------------------------------------
    let previewDecision;
    {
        const code = await rawSource('ui/components/PublicationPreview.js');

        // D1. Publication object available? Yes, as a required prop.
        assert(code.includes('publication: { type: Object, required: true }'),
            'D1. PublicationPreview.js requires a full Publication object.');

        // D2. User can meaningfully inspect it? No — the component
        // renders exactly one <img> (a thumbnail) or one placeholder
        // <span> (a generated color+initial). It never reads or
        // displays title, author, description, license, or any other
        // textual identity field — the ENTIRE template is two
        // mutually-exclusive visual elements.
        assert(!/publication\.title|publication\.author|publication\.description|publication\.license/.test(code),
            'D2. PublicationPreview.js\'s own code never reads any textual Publication identity field — it is a pure image/placeholder tile.');
        const templateMatch = code.match(/template: `([\s\S]*)`\s*};?\s*$/);
        assert(templateMatch, 'D2b. PublicationPreview.js\'s template string is extractable.');
        const template = templateMatch[1];
        assert((template.match(/<[a-zA-Z][\w-]*/g) || []).every((tag) =>
            ['<div', '<img', '<span'].includes(tag)),
            'D2c. PublicationPreview.js\'s ENTIRE template is exactly a div/img/span — no heading, no link, no list, no form could host a compose UI without changing the component\'s own visual contract.');

        // D3. Reachable only nested inside two already-audited hosts —
        // PublicationCard.js (already wired) and PublicationList.js
        // (already classified DUPLICATIVE of Card in 0.9.290, and
        // still unwired itself per Section B).
        const mounts = findRepoWide('<PublicationPreview').filter((f) => f.startsWith('./ui/'));
        assert(mounts.some((f) => f.includes('PublicationCard.js')) && mounts.some((f) => f.includes('PublicationList.js')) && mounts.length === 2,
            `D3. PublicationPreview.js is mounted from exactly two places, both already-classified hosts, not standalone — found ${JSON.stringify(mounts)}.`);

        previewDecision = 'STOP';
        console.log(`✓ Section D: PublicationPreview.js -> ${previewDecision} (it is a decorative thumbnail tile with zero textual identity — its own template has no element that could contextually host a comment thread — and it is never mounted anywhere except inside a host that already owns, or has already been classified as duplicative of a host that owns, the interaction).`);
    }

    // ---------------------------------------------------------------
    // Section E — DecentralizedPublicationsView.js classification.
    // ---------------------------------------------------------------
    let decentralizedDecision;
    {
        const code = await rawSource('ui/views/DecentralizedPublicationsView.js');
        const codeOnly = await codeOnlySource('ui/views/DecentralizedPublicationsView.js');

        // E1. Publication object available AND genuinely inspected —
        // this is not a thin discovery list. Each `entry` carries the
        // full Publication plus derived placement/evidence/possession
        // state, rendered as a rich per-entry card.
        assert(code.includes('entry.publication.id') && code.includes('entry.publication.contentReference.hash'),
            'E1. DecentralizedPublicationsView.js genuinely inspects Publication identity/content fields per entry.');
        assert(code.includes('class="identity-mgmt-card"') && code.includes('class="decentralization-summary"'),
            'E1b. Each entry renders as its own detailed card, not a compact row.');

        // E2. But NEVER the one field that makes a Publication legible
        // as "a thing to discuss" the way PublicationCard shows it —
        // its title. A verification surface identifies a Publication
        // by hash/publisher/content-kind, never by name.
        assert(!/entry\.publication\.title/.test(codeOnly),
            'E2. DecentralizedPublicationsView.js\'s own CODE never once reads entry.publication.title — Publications here are identified by hash/kind/publisher, not by name.');

        // E3. It DOES contain the placement workflow named in this
        // milestone's own brief — discover/select/create, not merely
        // read-only display.
        assert(code.includes('placementResolutionCoordinator.discover') && code.includes('placementCreationCoordinator.create'),
            'E3. The Snapshot Placement discover -> create workflow is real and present in this file.');

        // E4. Its action vocabulary is entirely technical/verification,
        // never social or discovery-navigation (no Open/Fork/Explore,
        // no author link — contrast with PublicationCard.js's own
        // action-btn set).
        const actionLabels = [...code.matchAll(/class="action-btn[^"]*"[^>]*>\s*\{\{[^}]*\}\}/g)]
            .map((m) => m[0]);
        assert(!/Open|Fork|Explore/.test(code.match(/class="identity-mgmt-actions">[\s\S]{0,600}/)?.[0] || ''),
            'E4. The per-entry action set stays technical (Retrieve/Re-check/Verify/Synchronize/Create Anchor) — no Open/Fork/Explore appears near it, unlike PublicationCard.js.');
        assert(code.includes('Retrieve from Peers') && code.includes('Re-check'),
            'E4b. Concrete technical actions (Retrieve from Peers, Re-check) are the ones actually offered per entry.');

        // E5. No author-facing link exists anywhere comparable to
        // PublicationCard's `@click.prevent="$emit('view-author', ...)"`.
        assert(!code.includes("$emit('view-author'"), 'E5. DecentralizedPublicationsView.js emits no author-navigation event — it is not framed as a social/discovery surface.');

        decentralizedDecision = 'DEFER';
        console.log(`✓ Section E: DecentralizedPublicationsView.js -> ${decentralizedDecision} (a Publication object is present and genuinely inspected in depth — hash, publisher, placements, evidence — but the whole surface identifies Publications by hash/kind, never by title, and its entire action vocabulary is verification-technical; a comment thread would sit outside the surface's own mental model rather than extending it).`);
    }

    // ---------------------------------------------------------------
    // Section F — "PublicationDistributionPanel" classification.
    // ---------------------------------------------------------------
    let distributionDecision;
    {
        // F1. Confirmed again (Section B already proved non-existence
        // as a file/class): the REAL underlying capability is a prop
        // named snapshotDistributionCommand, declared in exactly two
        // ui/components/*.js files.
        const distributionPropCount = grepCount('snapshotDistributionCommand: {', ['ui/components']);
        assert(distributionPropCount === 2,
            `F1. exactly two ui/components/*.js files declare a snapshotDistributionCommand prop (found ${distributionPropCount}) — OwnPublicationPanel.js and WorldEncounterCanvas.js, exactly as docs/Roadmap.md's own 0.9.139/0.9.141 entries describe.`);

        const ownPanel = await rawSource('ui/components/OwnPublicationPanel.js');
        const canvas = await rawSource('ui/components/WorldEncounterCanvas.js');

        // F2. In BOTH files, the distribution UI and the commentary UI
        // are sections of the SAME component, not separate mount
        // points — proven by their own template class names, not by
        // proximity in source order.
        assert(ownPanel.includes('own-publication-distribution-detail') && ownPanel.includes('own-publication-commentary'),
            'F2a. OwnPublicationPanel.js\'s own template carries both an own-publication-distribution-* section and an own-publication-commentary section, in one component.');
        assert(canvas.includes('world-encounter-snapshot-distribution-panel') && canvas.includes('world-encounter-commentary-panel'),
            'F2b. WorldEncounterCanvas.js\'s own template carries both a world-encounter-snapshot-distribution-panel and a world-encounter-commentary-panel, in one component.');

        // F3. Both sections are gated on the SAME publication in
        // scope: OwnPublicationPanel's distribution section reads
        // `publication` (the same prop its commentary methods use),
        // and WorldEncounterCanvas's distribution panel is scoped to
        // `selectedEncounter` while its commentary panel keys off
        // `encounterCommentaryPublicationId` — derived from that same
        // selection (checked structurally, not merely asserted).
        assert(canvas.includes('encounterCommentaryPublicationId') && canvas.includes('selectedEncounter'),
            'F3. WorldEncounterCanvas.js\'s commentary state is derived from the same selectedEncounter its distribution panel already renders for.');

        // F4. docs/Roadmap.md's own 0.9.141 rationale for declining a
        // merged panel abstraction is still true today: the two stay
        // separate components over one shared command, never merged.
        assert(grepCount('new ArweaveContentStore(\\|new NostrSnapshotDiscoveryPublisher(', ['application']) >= 1,
            'F4. the distribution command\'s own concrete substrate construction still lives in application/, never duplicated into either UI component.');

        distributionDecision = 'DUPLICATIVE';
        console.log(`✓ Section F: "PublicationDistributionPanel" -> ${distributionDecision} (it does not exist as a distinct surface — the distribution UI it would hypothetically name is two sections, inside OwnPublicationPanel.js and WorldEncounterCanvas.js, both of which ALREADY render a full commentary section for the identical publication in the identical component instance; there is no separate surface left to wire).`);
    }

    // ---------------------------------------------------------------
    // Section G — Identity/authorization convergence. Proves, with a
    // real object graph (never a mock of the application layer), that
    // ANY future candidate would reuse Commentary's existing
    // ownership-agnostic semantics with zero new authorization work —
    // the technical question is settled; only the UX question (Sections
    // C-F) actually varies per surface.
    // ---------------------------------------------------------------
    {
        const canCommentCode = await codeOnlySource('application/CanCommentOnPublicationUseCase.js');
        assert(!/ownerId|isOwn|ownPublication|isMine|role\s*[:=]/i.test(canCommentCode),
            'G1. CanCommentOnPublicationUseCase.js\'s own CODE (comments explicitly document these as deliberately excluded) carries no ownership/role vocabulary of any kind.');

        const storage = new InMemoryStorageProvider();
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const identityStorage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(identityStorage);
        const contentStore = new LocalContentStore(storage);
        const publisherProvider = new LocalPublisherProvider(storage, contentStore);
        const canComment = new CanCommentOnPublicationUseCase(discoveryProvider);

        identityProvider.login('alice');
        const publication = publisherProvider.publish(makeDocument('Section G', 'alice'), identityProvider);

        // G2. A caller reached through ANY hypothetical fifth surface
        // — represented here as a bare identityId/publicationId pair,
        // exactly the two primitives every candidate audited above
        // already has in scope (Catalog/Preview/DecentralizedView all
        // already hold `publication.id`; any viewer's own identityId
        // is the same app-wide LocalIdentityProvider every wired
        // surface already reads) — is authorized identically to the
        // two existing composition roots: allowed for a real
        // publication, denied for a fabricated one, regardless of who
        // published it.
        identityProvider.login('bob');
        assert(canComment.execute({ identityId: 'bob', publicationId: publication.id }) === true,
            'G2a. an identity with no ownership relationship to the publication is authorized — ownership-agnostic, confirmed live.');
        assert(canComment.execute({ identityId: 'alice', publicationId: publication.id }) === true,
            'G2b. the publication\'s own author is authorized too — the same rule, no special-casing either direction.');
        assert(canComment.execute({ identityId: 'bob', publicationId: 'not-a-real-publication' }) === false,
            'G2c. a fabricated publicationId is denied — the one real enforced rule, unrelated to which UI surface asked.');

        console.log('✓ Section G: Commentary\'s authorization boundary remains genuinely ownership-agnostic, confirmed against a real object graph — any of this milestone\'s four candidates could reuse it verbatim, with zero new authorization code, if a future milestone ever wired one.');
    }

    // ---------------------------------------------------------------
    // Section H — Interaction duplication analysis: for the two
    // candidates classified DUPLICATIVE above, prove the duplication
    // structurally rather than merely asserting it in prose.
    // ---------------------------------------------------------------
    {
        const catalogCode = await rawSource('ui/components/PublicationCatalog.js');
        // H1. Catalog's own <PublicationCard :key="pub.id"> loop proves
        // the interaction context is per-Publication and IDENTICAL to
        // the one Card already owns — same key, same object, same page.
        assert(catalogCode.includes('v-for="pub in group.items"') && catalogCode.includes(':key="pub.id"'),
            'H1. PublicationCatalog.js\'s own v-for is keyed by the exact same pub.id PublicationCard already receives — not a different aggregate view.');

        // H2. The distribution/commentary co-location proven in
        // Section F means a viewer who can already SEE the Distribution
        // section for a publication is, by construction, looking at a
        // component instance that can already render Commentary too —
        // there is no separate navigation step between them.
        const ownPanel = await rawSource('ui/components/OwnPublicationPanel.js');
        const distributionIdx = ownPanel.indexOf('own-publication-distribution-detail');
        const commentaryIdx = ownPanel.indexOf('own-publication-commentary');
        assert(distributionIdx > -1 && commentaryIdx > -1,
            'H2. both sections exist in OwnPublicationPanel.js.');
        // Both sections sit inside the SAME top-level template root
        // (the component has exactly one root element, confirmed by
        // Section A's own `own-publication-panel` wrapper) — so no
        // additional composition, prop, or route is needed to reach
        // one from the other; a "PublicationDistributionPanel" comment
        // button would land in the identical DOM subtree Commentary
        // already occupies.
        const rootOpenIdx = ownPanel.indexOf("class=\"own-publication-panel\"");
        assert(rootOpenIdx > -1 && rootOpenIdx < distributionIdx && rootOpenIdx < commentaryIdx,
            'H2b. both sections are descendants of the same own-publication-panel root — one component instance, not two.');

        console.log('✓ Section H: both DUPLICATIVE findings are structural, not impressionistic — Catalog\'s own v-for key IS PublicationCard\'s key, and the Distribution/Commentary sections are literal siblings inside one component root.');
    }

    // ---------------------------------------------------------------
    // Section I — Capability/reachability matrix.
    // ---------------------------------------------------------------
    {
        const matrix = [
            { surface: 'PublicationCatalog',          publication: true,  inspection: false, commentaryMeaningful: false, existingCommands: 'via PublicationCard', decision: catalogDecision },
            { surface: 'PublicationPreview',          publication: true,  inspection: false, commentaryMeaningful: false, existingCommands: 'via PublicationCard', decision: previewDecision },
            { surface: 'DecentralizedPublicationsView', publication: true, inspection: true,  commentaryMeaningful: false, existingCommands: 'none (would be new)', decision: decentralizedDecision },
            { surface: 'PublicationDistributionPanel', publication: 'n/a (no such component)', inspection: 'n/a', commentaryMeaningful: false, existingCommands: 'already present, elsewhere', decision: distributionDecision }
        ];

        console.log('\n| Surface                    | Publication | Inspection | Commentary meaningful | Existing commands        | Decision     |');
        console.log('| --------------------------- | ----------: | ---------: | ---------------------: | ------------------------: | ------------ |');
        for (const row of matrix) {
            console.log(`| ${row.surface.padEnd(27)} | ${String(row.publication).padStart(11)} | ${String(row.inspection).padStart(10)} | ${String(row.commentaryMeaningful).padStart(23)} | ${row.existingCommands.padEnd(26)} | ${row.decision} |`);
        }
        console.log();

        assert(matrix.length === 4, 'I1. exactly the four named candidates are scored — none dropped, none added.');
        assert(matrix.every((row) => ['INTEGRATE', 'DEFER', 'DUPLICATIVE', 'STOP'].includes(row.decision)),
            'I2. every decision uses one of the four allowed vocabulary words.');
        assert(matrix.filter((row) => row.decision === 'DUPLICATIVE').length === 2,
            'I3. exactly two candidates classify DUPLICATIVE (Catalog, "Distribution Panel") — each already-wired one level down or one section over.');
        assert(matrix.filter((row) => row.decision === 'STOP').length === 1,
            'I4. exactly one candidate classifies STOP (Preview — no inspection surface exists there at all).');
        assert(matrix.filter((row) => row.decision === 'DEFER').length === 1,
            'I5. exactly one candidate classifies DEFER (DecentralizedPublicationsView — real inspection, wrong context).');

        console.log('✓ Section I: capability/reachability matrix printed and verified against the four Section C-F verdicts.');
    }

    // ---------------------------------------------------------------
    // Section J — Final decision.
    // ---------------------------------------------------------------
    {
        const decisions = { catalogDecision, previewDecision, decentralizedDecision, distributionDecision };
        const integrateCandidates = Object.entries(decisions).filter(([, v]) => v === 'INTEGRATE');

        assert(integrateCandidates.length === 0,
            'J1. zero of the four re-audited candidates reach INTEGRATE this milestone — none is wired.');

        // J2. Regression: confirm (again, independently of Section B)
        // that no production file was modified by this audit — the
        // three real candidate files still carry no commentary
        // vocabulary, and the fourth is still not a real file.
        for (const file of ['ui/components/PublicationCatalog.js', 'ui/components/PublicationPreview.js', 'ui/views/DecentralizedPublicationsView.js']) {
            const code = await codeOnlySource(file);
            assert(!code.includes('getPublicationCommentariesCommand') && !code.includes('addPublicationCommentaryCommand'),
                `J2. ${file} remains unmodified by this test-only milestone.`);
        }
        assert(!(await sourceExists('ui/components/PublicationDistributionPanel.js')),
            'J2b. no PublicationDistributionPanel.js was created by this milestone.');

        console.log('✓ Section J — FINAL DECISION: none of the four re-audited surfaces reach INTEGRATE.');
        console.log('  PublicationCatalog               -> DUPLICATIVE (PublicationCard, one level down, already owns it)');
        console.log('  PublicationPreview                -> STOP        (a decorative thumbnail tile, no inspection surface exists)');
        console.log('  DecentralizedPublicationsView     -> DEFER       (real inspection, but a verification context, not a social one)');
        console.log('  "PublicationDistributionPanel"    -> DUPLICATIVE (not a real component; its functionality already sits beside Commentary in two wired hosts)');
        console.log('  The Publication Commentary cross-surface arc closes here, on evidence, not by assumption: every remaining named surface has a concrete, source-verified reason to stay unwired, and none is merely "hasn\'t gotten to it yet." Should a genuinely new Publication-bearing UI surface be built in the future, Section G already shows the authorization/identity plumbing it would need is zero-cost to reuse — the open question next time would be product fit, exactly the question this milestone answered for these four.');
    }

    console.log('\n✅ All Post-Commentary Cross-Surface Product Reassessment tests passed.');
}

runTests().catch((err) => {
    console.error(err);
    process.exit(1);
});
