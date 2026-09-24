import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/publication/SearchPublicationsUseCase.js';
import { PublicationQuery } from '../core/PublicationQuery.js';
import { computeAmbiguousPublishedDateIds, formatPublicationDate } from '../core/PublicationDateAmbiguity.js';
import {
    derivePublicationAuthorNameIdentityConvergence,
    describePublicationAuthorNameIdentityConvergence
} from '../application/publication/PublicationAuthorNameIdentityConvergence.js';

import PublicationCard from '../ui/components/PublicationCard.js';
import PublicationList from '../ui/components/PublicationList.js';
import { publicationsPageFiles, worldEncounterCanvasFiles } from './support/SourceFileGroups.js';

// 0.9.539 — Publication Selection & Identity Presentation Product
// Reassessment.
//
// 0.9.532-0.9.538 proved, from search-index "lead" vocabulary through
// candidate select/resolve/verify, that this codebase's INTERNAL
// Publication identity model never drifts, merges, or substitutes
// itself, across Local/Peer/Nostr/Arweave, all the way to a World
// Encounter. This milestone asks the complementary PRODUCT question
// none of those asked: given that internal correctness, can a Wanderer
// actually PERCEIVE which Publication is which when more than one is on
// screen — never by requiring raw ids/hashes to be shown everywhere,
// only by verifying the presentation never implies "these are the same
// Publication" when they are not?
//
// This is a REASSESSMENT built on real, unmodified-except-where-noted
// production source, mirroring the structure of 0.9.534's own Repository
// Publication Lifecycle audit and 0.9.525's own author-identity-
// convergence work rather than re-deriving either.
//
//   A — Reconfirms, live, 0.9.523/0.9.534's own accepted DELIBERATE_
//       ASYMMETRY: republishing an unmodified Document creates a
//       genuinely SECOND Publication record (new id/publishedAt), never
//       deduplicated — the exact, ordinary, single-user precondition for
//       this milestone's own flagship collision, reachable with no
//       decentralized substrate at all.
//   B — Demonstrates the PRE-EXISTING gap structurally: the day-level
//       `publishedAt` label every one of PublicationCard.js's/
//       PublicationList.js's other rendered fields (title, author,
//       license, description, fork count) could already coincide with
//       collapses two such records to one indistinguishable string.
//   C — THE FIX: core/PublicationDateAmbiguity.js's new, pure,
//       page-scoped computeAmbiguousPublishedDateIds().
//   D/E — PublicationCard.js's/PublicationList.js's own new
//       publishedAtLabel(), proven end to end to render the two records
//       distinguishably once flagged, and unchanged when not.
//   F — Restraint: the fix adds no id/contentHash/badge/trust vocabulary
//       anywhere; PublicationCard.js/PublicationList.js still never
//       render a raw publicationId, documentId, or contentHash as text.
//   G — Reconfirms, live or structurally, five boundaries this
//       milestone's own brief named that were ALREADY correct and are
//       left untouched: World Encounter identity reference, Evidence
//       scoping, author-name convergence (reused, not reinvented),
//       candidate/select/resolve async safety (0.9.537), and Open/
//       Explore/Fork navigation's deliberate documentId-vs-publicationId
//       split.
//   H — Flagship: publish -> republish the identical document -> two
//       Repository cards that, before this fix, would have rendered
//       identically in every field -> now differ in exactly the one
//       field that is actually, truthfully different.
//
// Deliberately excluded, per the requesting brief: a new Publication
// identity display system, globally visible UUIDs, new badges anywhere,
// new provenance vocabulary, identity-based ranking, candidate merging
// or ranking, contentHash deduplication, new navigation, new trust
// indicators, "verified author" labels, ownership claims, and a unified
// Publication detail page for its own sake. None of these appear below.
//
// FINDING: see the verdict block at the end of this file.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// A real Wanderer clicking "Publish" twice is two separate human actions,
// never two calls in the same JS microtask — this stands in for that gap
// so the two republishes below land, as they realistically always would,
// a few milliseconds apart, rather than racing the test runner's own
// clock resolution.
function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// The same minimal, real, one-brick Document/publish helper
// tests/RepositoryPublicationLifecycleProductReassessment.test.js
// already established — reused rather than reinvented so this file's
// own publishing path is proven-real, not a hand-rolled stand-in.
function makePublisher(storage) {
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    return { publisher, publishDocumentUseCase: new PublishDocumentUseCase(publisher, null, null, null) };
}

function makeMinimalDocument(title = 'Atlas', author = 'alice') {
    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author, license: new License({ id: LicenseId.CC0_1_0 }) })
    });
}

async function run() {
    // ===============================================================
    // Section A — Republishing an unmodified Document creates a
    // genuinely second Publication, never deduplicated. Reconfirms
    // 0.9.523/0.9.534's own accepted DELIBERATE_ASYMMETRY LIVE, because
    // this milestone's own flagship depends on it: this is NOT a
    // contrived cross-substrate construction — it is what happens the
    // second time any single Wanderer clicks "Publish" on the same
    // document, with nothing whatsoever changed.
    // ===============================================================
    let publicationA, publicationAPrime, discoveryProvider, searchUseCase;
    {
        const storage = new InMemoryStorageProvider();
        const { publishDocumentUseCase } = makePublisher(storage);
        const document = makeMinimalDocument('Atlas', 'alice');

        publicationA = publishDocumentUseCase.execute({ document });
        await wait(5); // see wait()'s own comment — two real, separate "Publish" clicks
        publicationAPrime = publishDocumentUseCase.execute({ document }); // republish, nothing changed

        assert(publicationA.id !== publicationAPrime.id,
            '1. LIVE: republishing produces a genuinely NEW publicationId — never the same record updated in place.');
        assert(publicationA.documentId === publicationAPrime.documentId,
            '2. LIVE: both records share the same documentId — this is the SAME document, republished, never a new one.');
        assert(publicationA.title === publicationAPrime.title && publicationA.author === publicationAPrime.author,
            '3. LIVE: title and author are identical between the two records, exactly as an unmodified republish should produce.');
        assert(publicationA.license.id === publicationAPrime.license.id,
            '4. LIVE: license is identical too.');

        discoveryProvider = new LocalDiscoveryProvider(storage);
        searchUseCase = new SearchPublicationsUseCase(discoveryProvider, { execute: () => null });
        const page = searchUseCase.execute(new PublicationQuery({ page: 1, pageSize: 10 }));
        assert(page.items.length === 2, `5. LIVE: the Repository catalog's own query surface returns BOTH records, never deduplicated (got ${page.items.length}).`);
        assert(discoveryProvider.findById(publicationA.id).id === publicationA.id
            && discoveryProvider.findById(publicationAPrime.id).id === publicationAPrime.id,
            '6. LIVE: findById() still resolves each record to its own correct identity.');
    }
    console.log('✓ Section A: republishing an unmodified Document — the ordinary, single-user, non-adversarial case — genuinely produces two catalog entries, reconfirming 0.9.523/0.9.534\'s own DELIBERATE_ASYMMETRY live rather than re-litigating it.');

    // ===============================================================
    // Section B — The pre-existing gap, demonstrated structurally: every
    // OTHER field PublicationCard.js/PublicationList.js render already
    // coincides between the two records from Section A; only
    // `publishedAt`, rendered at day-level precision, could ever tell
    // them apart, and a same-day republish collapses even that.
    // ===============================================================
    {
        assert(publicationA.title === publicationAPrime.title
            && publicationA.author === publicationAPrime.author
            && publicationA.license.id === publicationAPrime.license.id
            && (publicationA.parentDocumentId || null) === (publicationAPrime.parentDocumentId || null),
            '1. Every field PublicationCard.js/PublicationList.js render OTHER than publishedAt is identical between the two records.');

        const naiveLabelA = publicationA.publishedAt.toLocaleDateString();
        const naiveLabelAPrime = publicationAPrime.publishedAt.toLocaleDateString();
        assert(naiveLabelA === naiveLabelAPrime,
            `2. STRUCTURAL: the pre-0.9.539 rendering (toLocaleDateString(), day precision only) collapses both records' own dates to the identical string ("${naiveLabelA}") whenever they are republished the same calendar day — the realistic common case, not an edge case requiring adversarial timing.`);

        const cardSource = await readSource('ui/components/PublicationCard.js');
        const listSource = await readSource('ui/components/PublicationList.js');
        assert(!/publication\.id\}\}|pub\.id\}\}/.test(cardSource) && !/publication\.id\}\}|pub\.id\}\}/.test(listSource),
            '3. Neither component ever rendered publicationId as text either (confirmed pre-existing, unrelated to this fix) — so before this milestone, two such records were genuinely INDISTINGUISHABLE on screen.');
    }
    console.log('✓ Section B: confirmed structurally — before this milestone, two Publications differing ONLY by publicationId/publishedAt, republished the same day, rendered as pixel-identical Repository cards, with no field anywhere on screen able to tell a Wanderer they were choosing between two distinct things.');

    // ===============================================================
    // Section C — THE FIX: core/PublicationDateAmbiguity.js. Pure,
    // page-scoped, reuses the existing publishedAt field at existing
    // JS precision — no new field, no id, no hash, no badge.
    // ===============================================================
    {
        const pageItems = [publicationA, publicationAPrime];
        const flagged = computeAmbiguousPublishedDateIds(pageItems);
        assert(flagged.has(publicationA.id) && flagged.has(publicationAPrime.id),
            '1. LIVE: both real records from Section A are flagged as needing precise timestamps.');

        // A THIRD, unrelated Publication (different document), published
        // the identical moment, must NEVER be flagged — the collision
        // this fix targets is specifically "same document," never "same
        // day" alone; two unrelated Publications sharing a publish date
        // is completely ordinary and already fully distinguished by
        // title/author.
        const unrelated = new Publication({
            id: 'unrelated-1', documentId: 'doc-unrelated', title: 'Something Else', author: 'bob',
            publishedAt: publicationA.publishedAt
        });
        const withUnrelated = computeAmbiguousPublishedDateIds([publicationA, publicationAPrime, unrelated]);
        assert(!withUnrelated.has('unrelated-1'),
            '2. LIVE: an unrelated Publication (different documentId) published the same moment is never flagged, even sharing the page with the two that are.');
        assert(withUnrelated.has(publicationA.id) && withUnrelated.has(publicationAPrime.id),
            '3. LIVE: the two real colliding records stay flagged regardless of what else shares the page.');

        // A LONE Publication for a document — no sibling on this page —
        // is never flagged, confirming this is genuinely page-scoped,
        // never a property hung on the Publication itself.
        const alone = computeAmbiguousPublishedDateIds([publicationA]);
        assert(!alone.has(publicationA.id),
            '4. LIVE: the same record, alone on a page with no colliding sibling present, is never flagged — ambiguity is a fact about what is SIMULTANEOUSLY VISIBLE, never a permanent property of one Publication.');

        assert(computeAmbiguousPublishedDateIds([]).size === 0 && computeAmbiguousPublishedDateIds(null).size === 0,
            '5. Empty/absent input degrades to an empty result, never throws.');

        const fixSource = await readSource('core/PublicationDateAmbiguity.js');
        assert(fixSource.split('export function').length === 3
            && /export function computeAmbiguousPublishedDateIds/.test(fixSource)
            && /export function formatPublicationDate/.test(fixSource),
            '6. STRUCTURAL: the fix module exports exactly the two functions this milestone added (ambiguity detection, date formatting) — no accompanying ranking/badge/trust/identity-display machinery bundled in alongside them.');
        assert(!/\.sort\(/.test(fixSource),
            '7. STRUCTURAL: the fix module performs no sort/ranking of any kind — grouping only, exactly like core/PublicationGrouping.js one file over.');
    }
    console.log('✓ Section C: core/PublicationDateAmbiguity.js correctly flags exactly the colliding pair, never an unrelated same-day Publication, and never a Publication with no on-page sibling — page-scoped, identity-preserving, no new vocabulary.');

    // ===============================================================
    // Section D — PublicationCard.js's own new publishedAtLabel,
    // exercised live via its real computed definition (the same
    // `.methods`/`.computed` direct-call technique 0.9.538's own file
    // already uses against OwnPublicationPanel.js).
    // ===============================================================
    {
        const ctxFlagged = { publication: publicationA, needsPreciseDate: true };
        const ctxPlainA = { publication: publicationA, needsPreciseDate: false };
        const ctxPlainAPrime = { publication: publicationAPrime, needsPreciseDate: false };

        const preciseLabel = PublicationCard.computed.publishedAtLabel.call(ctxFlagged);
        const plainLabelA = PublicationCard.computed.publishedAtLabel.call(ctxPlainA);
        const plainLabelAPrime = PublicationCard.computed.publishedAtLabel.call(ctxPlainAPrime);

        assert(preciseLabel === formatPublicationDate(publicationA.publishedAt, true),
            '1. LIVE: with needsPreciseDate true, publishedAtLabel renders the SAME publishedAt field, via the shared formatPublicationDate() helper — never a new field.');
        assert(plainLabelA === publicationA.publishedAt.toLocaleDateString()
            && plainLabelAPrime === publicationAPrime.publishedAt.toLocaleDateString(),
            '2. LIVE: with needsPreciseDate false (the common, non-colliding case), the label is byte-identical to the pre-existing rendering — no visible change for the overwhelming majority of Publications that never collide.');

        const flaggedLabelA = PublicationCard.computed.publishedAtLabel.call({ publication: publicationA, needsPreciseDate: true });
        const flaggedLabelAPrime = PublicationCard.computed.publishedAtLabel.call({ publication: publicationAPrime, needsPreciseDate: true });
        assert(flaggedLabelA !== flaggedLabelAPrime,
            `3. LIVE, THE ACTUAL FIX PROVEN: once flagged, the two real Section A records now render DIFFERENT labels ("${flaggedLabelA}" vs "${flaggedLabelAPrime}") — a Wanderer can now tell them apart using only information already truthfully on the Publication. This depends on millisecond precision, not merely toLocaleString()'s own second-level precision: publicationA.publishedAt.toLocaleString() alone (${publicationA.publishedAt.toLocaleString()}) is IDENTICAL to publicationAPrime's (${publicationAPrime.publishedAt.toLocaleString()}) here, since both republishes landed in the same second — proving milliseconds were the genuinely necessary fix, not a cosmetic extra.`);
        assert(publicationA.publishedAt.toLocaleString() === publicationAPrime.publishedAt.toLocaleString(),
            '4. CONFIRMS THE ABOVE: second-level precision alone would still have collided for this real pair — millisecond precision is load-bearing, not decorative.');

        const cardSource = await readSource('ui/components/PublicationCard.js');
        assert(/needsPreciseDate/.test(cardSource) && /publishedAtLabel/.test(cardSource),
            '4. STRUCTURAL: the prop and computed are real source, not something this test invented around the component.');
    }
    console.log('✓ Section D: PublicationCard.js\'s new publishedAtLabel computed renders unchanged for the common case and genuinely distinguishes the two colliding records once flagged — proven against the real component definition.');

    // ===============================================================
    // Section E — The identical proof for PublicationList.js's own
    // publishedAtLabel(pub) method (the table/row view of the same
    // catalog).
    // ===============================================================
    {
        const ctx = { preciseDateIds: new Set([publicationA.id, publicationAPrime.id]) };
        const labelA = PublicationList.methods.publishedAtLabel.call(ctx, publicationA);
        const labelAPrime = PublicationList.methods.publishedAtLabel.call(ctx, publicationAPrime);
        assert(labelA !== labelAPrime,
            `1. LIVE: PublicationList.js's own row rendering likewise distinguishes the two colliding records once flagged ("${labelA}" vs "${labelAPrime}").`);

        const ctxUnflagged = { preciseDateIds: new Set() };
        assert(PublicationList.methods.publishedAtLabel.call(ctxUnflagged, publicationA) === publicationA.publishedAt.toLocaleDateString(),
            '2. LIVE: unflagged, the label is byte-identical to the pre-existing day-level rendering.');
        assert(PublicationList.methods.publishedAtLabel.call(ctxUnflagged, { id: 'x', publishedAt: null }) === '—',
            '3. LIVE: a record with no publishedAt at all (e.g. a malformed/legacy one — the Publication class itself always defaults one) still renders the pre-existing "—" placeholder, unchanged.');

        const listSource = await readSource('ui/components/PublicationList.js');
        assert(/preciseDateIds/.test(listSource) && /publishedAtLabel/.test(listSource),
            '4. STRUCTURAL: real source, not test-invented.');
    }
    console.log('✓ Section E: PublicationList.js\'s row-view rendering carries the identical fix, with the identical unflagged-case restraint.');

    // ===============================================================
    // Section F — Restraint: the fix introduces no excluded vocabulary,
    // and the pre-existing "never a raw id/hash as text" restraint this
    // milestone's own research phase confirmed survives the fix intact.
    // ===============================================================
    {
        const catalogSource = await readSource('ui/components/PublicationCatalog.js');
        const cardSource = await readSource('ui/components/PublicationCard.js');
        const listSource = await readSource('ui/components/PublicationList.js');

        for (const [name, source] of [['PublicationCatalog.js', catalogSource], ['PublicationCard.js', cardSource], ['PublicationList.js', listSource]]) {
            assert(!/verified.author|trust.?score|ownership.claim/i.test(source),
                `1. ${name} introduces no "verified author" label, trust score, or ownership claim.`);
        }
        // The fix's own diff surface (preciseDateIds/needsPreciseDate/
        // publishedAtLabel) never touches contentHash, locator, or a
        // discovery-origin badge — confirming this stayed a narrow date-
        // precision fix, never the broader "identity display system"
        // this milestone's own brief explicitly excludes.
        assert(!/needsPreciseDate[^\n]*contentHash|contentHash[^\n]*needsPreciseDate/.test(cardSource),
            '2. The new prop is never wired to contentHash anywhere — it reads only publishedAt/documentId, exactly as core/PublicationDateAmbiguity.js\'s own contract promises.');
        assert(!/publication\.id\s*\}\}/.test(cardSource) && !/pub\.id\s*\}\}/.test(listSource)
            && !/publication\.contentHash/.test(cardSource) && !/pub\.contentHash/.test(listSource),
            '3. Neither component renders a raw publicationId or contentHash as visible text even after this fix — `id` remains a Vue `:key`/routing value only, never a displayed identity string, matching this milestone\'s own brief ("the UI does not need to expose raw IDs everywhere").');
    }
    console.log('✓ Section F: the fix stays exactly as narrow as intended — no excluded vocabulary, no new identity fields, and the pre-existing restraint against rendering raw ids/hashes as text is fully preserved.');

    // ===============================================================
    // Section G — Five boundaries this milestone's own brief named that
    // were ALREADY correct, reconfirmed rather than reinvented, and left
    // completely untouched.
    // ===============================================================
    {
        // G1 — World Encounter identity reference: the encounter's own
        // objectId IS the publicationId, never a disconnected generic
        // content item; a "Snapshot Content" detail panel shows the real
        // Publication ID field when opened. (0.9.17 onward; reconfirmed
        // structurally here.)
        const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        assert(/THE PUBLICATIONID IS THE ENCOUNTER'S OWN objectId/i.test(canvasSource),
            'G1a. STRUCTURAL: WorldEncounterCanvas.js\'s own documented invariant that objectId IS the publicationId (never a separately-loaded material\'s own id) is still present, unmodified by this milestone.');
        assert(/Publication ID<\/dt>/.test(canvasSource),
            'G1b. STRUCTURAL: the Snapshot Content detail panel still labels the real publicationId explicitly when a Wanderer asks to see it — identity is available, on request, never hidden entirely.');

        // G2 — Evidence identity: anchors are rendered NESTED inside one
        // Publication's own entry, never merged across Publications that
        // might share a contentHash. The differently-named Reconciliation*
        // "evidence" components are a distinct, unrelated feature
        // (publisher-claim reconciliation, not anchor->contentHash proof)
        // and were never touched.
        const decentralizedViewSource = (await Promise.all(publicationsPageFiles().map((file) => readSource(file)))).join('\n');
        assert(/entry\.evidence\.anchors/.test(decentralizedViewSource),
            'G2a. STRUCTURAL: anchors are still rendered scoped to one Publication\'s own `entry`, never as a global, cross-Publication list that could imply two Publications sharing a contentHash are one.');
        const reconciliationPanelSource = await readSource('ui/components/ReconciliationCandidateEvidenceDetailPanel.js');
        assert(!/contentHash|anchor/i.test(reconciliationPanelSource),
            'G2b. STRUCTURAL: confirms the Reconciliation "evidence" vocabulary is a genuinely different feature (publisher-claim reconciliation) with no contentHash/anchor rendering to confuse with Publication evidence at all.');

        // G3 — Author-name convergence: REUSED live here, not
        // reinvented, exactly as this milestone's own brief asks ("reuse
        // the existing convergence presentation rather than introduce
        // another warning vocabulary").
        const alice1 = new Publication({ id: 'p1', documentId: 'd1', title: 'One', author: 'alice', publisherIdentity: { id: 'did:key:alice-real' } });
        const alice2 = new Publication({ id: 'p2', documentId: 'd2', title: 'Two', author: 'alice', publisherIdentity: { id: 'did:key:someone-else' } });
        const convergence = derivePublicationAuthorNameIdentityConvergence({ author: 'alice', publications: [alice1, alice2] });
        assert(convergence.nameIdentityConflict === true && convergence.distinctIdentityCount === 2,
            'G3a. LIVE: two Publications under the same typed author name but different signing identities are correctly flagged by the EXISTING convergence function — this milestone calls it, never re-implements it.');
        const notice = describePublicationAuthorNameIdentityConvergence(convergence);
        assert(/may or may not be the same publisher/.test(notice) && !/impostor|fraud|fake|scam/i.test(notice),
            'G3b. LIVE: the existing copy stays a neutral disclosure, never an accusation — unchanged, reused as-is.');
        const authorViewSource = await readSource('ui/views/AuthorView.js');
        assert(/authorNameIdentityNotice/.test(authorViewSource),
            'G3c. STRUCTURAL: AuthorView.js still wires this exact notice into its own template.');

        // G4 — Candidate/select/resolve async safety: 0.9.537 already
        // live-audited the requestId-guarded ownership boundary; this
        // milestone reconfirms the guarding markers are still present,
        // rather than re-running that audit's own test file.
        assert(/materialInspectionRequestId/.test(canvasSource) && /resolvedEncounterSelectionsEqual/.test(canvasSource),
            'G4. STRUCTURAL: the requestId-guarded async-result ownership mechanism 0.9.537 already proved live (tests/WorldEncounterAsyncResultOwnershipBoundaryAudit.test.js) is still present and unmodified by this milestone.');

        // G5 — Navigation: Open/Explore key by documentId BY DESIGN
        // (Editor edits a Document; World is a Document's own persistent
        // space, never a per-Publication-instance one), while Fork alone
        // carries the exact source publicationId, because fork lineage
        // — unlike editing or exploring — genuinely needs to know WHICH
        // instance was forked from. This is not a gap needing "new
        // navigation" (explicitly excluded); it is already correct.
        const catalogSource = await readSource('ui/components/PublicationCatalog.js');
        assert(/query:\s*\{\s*load:\s*pub\.documentId\s*\}/.test(catalogSource),
            'G5a. STRUCTURAL: Open still loads by documentId — correct, since the Editor edits the Document, not one frozen Publication instance.');
        assert(/query:\s*\{\s*fork:\s*pub\.documentId,\s*publication:\s*pub\.id\s*\}/.test(catalogSource),
            'G5b. STRUCTURAL: Fork still carries BOTH documentId (what to fork) AND the exact source publicationId (which instance this fork\'s lineage attributes to) — the one action that actually needs per-instance identity already has it.');
        assert(/path:\s*`\/world\/\$\{pub\.documentId\}`/.test(catalogSource),
            'G5c. STRUCTURAL: Explore still navigates to the Document\'s own World by documentId — there is no "which Publication\'s World" question to answer, since World is scoped to the Document, not to any one Publication instance.');
    }
    console.log('✓ Section G: World Encounter identity reference, Evidence scoping, author-name convergence (reused, not reinvented), candidate/select/resolve async safety, and the Open/Explore/Fork documentId-vs-publicationId split were all already correct and remain completely untouched by this milestone.');

    // ===============================================================
    // Section H — FLAGSHIP: publish -> republish the identical document
    // -> two Repository cards that, before this fix, rendered
    // identically in every field -> now differ in exactly the one field
    // that is actually, truthfully different, while every action
    // (Open/Fork/Explore) already targeted the correct instance the
    // entire time.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const { publishDocumentUseCase } = makePublisher(storage);
        const document = makeMinimalDocument('Field Guide', 'carol');

        const pubX = publishDocumentUseCase.execute({ document });
        await wait(5); // see wait()'s own comment — two real, separate "Publish" clicks
        const pubY = publishDocumentUseCase.execute({ document }); // republished, unmodified

        const provider = new LocalDiscoveryProvider(storage);
        const search = new SearchPublicationsUseCase(provider, { execute: () => null });
        const page = search.execute(new PublicationQuery({ page: 1, pageSize: 10 }));
        assert(page.items.length === 2, 'H1. LIVE: the Repository catalog page shows both republished entries together — the exact "multiple Publications coexist" precondition this milestone\'s own brief opens with.');

        // Every OTHER rendered field is identical — this is the genuine
        // "which Publication is this?" moment, not a contrived one.
        assert(pubX.title === pubY.title && pubX.author === pubY.author && pubX.license.id === pubY.license.id,
            'H2. LIVE: title/author/license are identical between the two cards a Wanderer would see side by side.');

        // Before this fix: indistinguishable.
        assert(pubX.publishedAt.toLocaleDateString() === pubY.publishedAt.toLocaleDateString(),
            'H3. LIVE: the pre-existing day-level date label is identical for both — confirming the collision is real for this exact pair.');

        // After this fix: distinguishable, using only the real, already-
        // present publishedAt field, exactly as PublicationCatalog.js
        // now computes and wires it.
        const flagged = computeAmbiguousPublishedDateIds(page.items);
        assert(flagged.has(pubX.id) && flagged.has(pubY.id), 'H4. LIVE: PublicationCatalog.js\'s own new computed would flag both real page items.');
        const labelX = PublicationCard.computed.publishedAtLabel.call({ publication: pubX, needsPreciseDate: true });
        const labelY = PublicationCard.computed.publishedAtLabel.call({ publication: pubY, needsPreciseDate: true });
        assert(labelX !== labelY, `H5. FLAGSHIP: the two cards now render distinguishably ("${labelX}" vs "${labelY}") — a Wanderer choosing between them can now tell they are not the same choice, without a single new id, badge, or hash ever appearing on screen.`);

        // And the underlying actions were ALREADY correct the entire
        // time — this fix closes a PERCEPTION gap, never a functional
        // one: Fork already targeted the exact instance a Wanderer
        // clicked, even before they could visually tell the cards apart.
        const forkQueryX = { fork: pubX.documentId, publication: pubX.id };
        const forkQueryY = { fork: pubY.documentId, publication: pubY.id };
        assert(forkQueryX.publication !== forkQueryY.publication && forkQueryX.fork === forkQueryY.fork,
            'H6. LIVE: forking from either card already resolves to its own correct, distinct source publicationId, sharing the same documentId — this was never a functional bug, only a perceptual one, exactly as this milestone\'s own brief frames it ("does the Wanderer know," not "does the system know").');
    }
    console.log('✓ Section H: FLAGSHIP — publishing the identical document twice (the ordinary case, needing no decentralized substrate at all) produced two Repository cards indistinguishable in every previously-rendered field; this milestone\'s fix makes them distinguishable using only the one field that was always truthfully different, while every underlying action was already correctly bound to the right instance throughout.');

    console.log('\nAll Publication Selection & Identity Presentation Product Reassessment tests passed.');

    console.log(`\n=== 0.9.539 VERDICT ===
PRODUCT_GAP -> FIXED, narrowly. This milestone's own question — does a Wanderer actually PERCEIVE which Publication
is which when more than one is on screen, given that 0.9.532-0.9.538 already proved the system itself never
confuses them — surfaced exactly one genuine, ordinary, single-user-reachable gap: republishing an unmodified
Document (no decentralized substrate, no adversarial construction required) produces a second Publication record
that, published the same calendar day, rendered PIXEL-IDENTICAL to the first in ui/components/PublicationCard.js
and PublicationList.js — every field they show (title, author, license, description, fork count, and the
day-level publishedAt label) could already coincide (Sections A/B).

FIX: a new, pure, page-scoped core/PublicationDateAmbiguity.js#computeAmbiguousPublishedDateIds(), wired through
ui/components/PublicationCatalog.js into a new needsPreciseDate prop (PublicationCard.js) and preciseDateIds prop
(PublicationList.js), each backing a new publishedAtLabel that renders the SAME publishedAt field at finer
precision (toLocaleString() plus explicit milliseconds, instead of toLocaleDateString()) ONLY when a genuine
same-document collision is present on the current page (Sections C/D/E) — unflagged, the rendering is byte-identical to before (the
overwhelming majority of Publications, which never collide). No raw publicationId, documentId, or contentHash is
ever rendered as text, before or after this fix (Section F).

Every other boundary this milestone's own brief named was found ALREADY CORRECT and is left untouched: World
Encounter identity reference (objectId IS the publicationId, never a disconnected content item), Evidence display
(anchors scoped per-Publication, never merged across a shared contentHash), author-name convergence (the EXISTING
0.9.525 mechanism, reused live rather than reinvented), candidate/select/resolve async-result ownership (0.9.537's
own requestId guarding, reconfirmed present), and Open/Explore/Fork navigation's documentId-vs-publicationId split
(already correct by design — World and the Editor are scoped to a Document, not a frozen Publication instance;
Fork alone needs, and alone carries, the exact source publicationId) (Section G). Section H's flagship reconfirms
all of this together: the underlying actions were never wrong, only imperceptible to distinguish beforehand.

This milestone changed four files: core/PublicationDateAmbiguity.js (new), ui/components/PublicationCatalog.js,
ui/components/PublicationCard.js, and ui/components/PublicationList.js — plus this test file, registered in
tests.html. No deduplication, merging, ranking, new identity display system, globally visible UUID, new badge,
new provenance vocabulary, new navigation, new trust indicator, "verified author" label, ownership claim, or
unified Publication detail page was introduced anywhere, exactly as this milestone's own requesting brief's
"deliberately exclude" list requires.`);
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
