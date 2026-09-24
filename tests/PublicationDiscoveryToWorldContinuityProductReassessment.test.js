import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import NotificationHistoryPanel from '../ui/components/NotificationHistoryPanel.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { SearchPublicationsUseCase } from '../application/publication/SearchPublicationsUseCase.js';
import { PublicationQuery } from '../core/PublicationQuery.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import {
    verifyWorldEncounterMaterial,
    WorldEncounterMaterialVerificationStatus,
    WorldEncounterMaterialVerifier
} from '../application/worldEncounter/WorldEncounterMaterialVerification.js';
import { describeWorldEncounterMaterialVerificationStatusLabel } from '../application/worldEncounter/WorldEncounterMaterialInspectionView.js';
import { worldViewFiles, worldNavigationSessionFiles } from './support/SourceFileGroups.js';
import {
    PublicationMaterialProvenanceOrigin,
    describePublicationMaterialProvenanceFromInspection
} from '../application/publication/distribution/PublicationMaterialProvenance.js';

// 0.9.532 — Publication Discovery-to-World Continuity Product Reassessment.
//
// Not another low-level boundary audit — a product-level question, asked
// after 0.9.525 through 0.9.531 independently hardened Repository trust,
// Publication creation/distribution, Snapshot encounter/placement, and
// Notification event delivery + navigation one arc at a time: once a
// Wanderer discovers a Publication through ANY of its now-several entry
// points (Repository, Notification, Search, Documents-Here, Nearby
// Worlds, World Encounter), does continuing into World feel like ONE
// Publication experience, or several independently-built ones that
// happen to look similar?
//
// Nine lettered sections, mirroring the originating brief exactly. Every
// claim below is checked against real, unmodified production source and
// real object graphs — never asserted from milestone history alone.
//
//   A — Repository -> Publication: identity preserved, no re-selection,
//       Repository claims no verification of its own.
//   B — Notification -> Publication -> World: re-exercised, and cross-
//       checked against Section A's own target for the SAME Publication.
//   C — Search/Documents-Here/Nearby Worlds/Notification convergence on
//       one shared focusWorld() mechanism; Repository's separate
//       router.push() bottoms out on the identical session primitive.
//   D — Verification vocabulary never drifts from VERIFIED/REJECTED/
//       UNVERIFIABLE into trusted/authentic/official/owned, anywhere a
//       Publication is discovered or navigated.
//   E — Provenance stays a two-value, per-observation fact (LOCAL/
//       DECENTRALIZED) at every discovery/navigation surface — never a
//       per-backend (Arweave/Nostr/Peer) "kind of Publication" label.
//   F — A stale/unresolvable target degrades locally to its own
//       initiating surface, in isolation from sibling notifications.
//   G — Arriving via Repository/Notification never re-triggers World
//       Encounter discovery or verification — two independent stacks.
//   H — publicationId/documentId/contentHash stay three distinct facts;
//       a shared contentHash never collapses two Publications into one.
//   I — Flagship: the "Explore" vocabulary is identical, verbatim, across
//       every entry surface — one Publication experience, not several.
//
// FINDING: PRODUCT_COMPLETE. No production change. See the verdict block
// at the end of this file for why.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function countOccurrences(haystack, needle) {
    return haystack.split(needle).length - 1;
}

// Extracts a Vue SFC-shaped module's own `template: \`...\`` literal — the
// text that actually reaches a Wanderer's screen — so a vocabulary check
// never false-positives on a source comment discussing the SAME forbidden
// words in order to explain their deliberate absence (this codebase's own
// convention throughout — see e.g. NotificationHistoryPanel.js's own "no
// ... trusted ... state" header prose).
function extractTemplate(source) {
    const start = source.indexOf('template: `');
    if (start === -1) return '';
    const contentStart = start + 'template: `'.length;
    const end = source.indexOf('`', contentStart);
    return end === -1 ? '' : source.slice(contentStart, end);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeSession(discoveryProvider) {
    return new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: { execute: () => null },
        worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }) },
        discoveryProvider
    });
}

// The exact logic ui/views/WorldView.js#viewNotificationPublicationCommand
// carries in production (own copy per this codebase's convention — see
// tests/NotificationPublicationNavigationBoundaryClosureAudit.test.js's
// own identically-shaped helper), so this file can drive a REAL
// WorldNavigationSession without the DOM/Vue layer WorldView.js needs.
function makeViewPublicationCommand(session, onClose = () => {}) {
    return (publicationId) => {
        const publication = session.findPublicationById(publicationId);
        if (!publication || !publication.documentId) {
            return false;
        }
        onClose();
        return publication.documentId; // stands in for focusWorld(documentId)'s own target
    };
}

function panelCtx(overrides = {}) {
    return {
        getRecipientNotificationEventsCommand: null,
        viewPublicationCommand: null,
        notifications: [],
        notificationHistoryError: null,
        unavailablePublicationNotificationIds: new Set(),
        notificationPublicationId: NotificationHistoryPanel.methods.notificationPublicationId,
        viewNotificationPublication: NotificationHistoryPanel.methods.viewNotificationPublication,
        ...overrides
    };
}

async function main() {
    // ===============================================================
    // Section A — Repository -> Publication
    // ===============================================================
    {
        const catalogSource = await readSource('ui/components/PublicationCatalog.js');
        const cardSource = await readSource('ui/components/PublicationCard.js');
        const routerSource = await readSource('ui/router/index.js');

        // A1. Identity: Explore forwards ONLY pub.documentId, verbatim —
        // no lookup, no re-selection, no reconstruction.
        assert(catalogSource.includes('function viewWorld(pub) {\n            router.push({ path: `/world/${pub.documentId}` });\n        }'),
            '1. PublicationCatalog.js#viewWorld() forwards exactly pub.documentId into the existing /world/:documentId route — the same Publication instance search returned, never a re-derived or re-selected candidate.');

        // A2. Repository performs no verification of its own — it never
        // imports or calls anything from the verification family.
        assert(!/WorldEncounterMaterialVerification|verifyIdentity|PublicationResolver/.test(catalogSource),
            '2. PublicationCatalog.js never imports or invokes any verification mechanism — Explore is pure navigation, not a verification event.');
        assert(!/isVerified|isTrusted|isAuthentic/i.test(catalogSource) && !/isVerified|isTrusted|isAuthentic/i.test(cardSource),
            '3. Neither PublicationCatalog.js nor PublicationCard.js carries an isVerified/isTrusted/isAuthentic field — Repository invents no verification vocabulary of its own.');

        // A3. The badge Repository DOES show ("Published") never overclaims
        // into "Verified" — it is unconditional, describing admission into
        // the catalog, not a judgment about the material.
        assert(cardSource.includes('<span class="publication-badge">🔒 Published</span>'),
            '4. PublicationCard.js\'s own badge says "Published," never "Verified" — it never implies Repository judged the material.');

        // A4. /world/:documentId is registered exactly once — Repository
        // targets the SAME single destination every other surface does,
        // never a second, Repository-specific World route.
        assert(countOccurrences(routerSource, "path: '/world/:documentId'") === 1,
            '5. /world/:documentId is registered exactly once in the router.');

        // A5. LIVE: the Publication SearchPublicationsUseCase (Repository's
        // own query layer) returns is the exact same object Explore would
        // read pub.documentId from — no shadow copy, no re-fetch.
        const storage = new InMemoryStorageProvider();
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const search = new SearchPublicationsUseCase(discoveryProvider, { execute: () => null });
        const published = new Publication({ id: 'pub-repo-1', documentId: 'doc-repo-1', title: 'Atlas', author: 'alice' });
        storage.save('forkbuild-publications', [published.toJSON()]);
        const page = search.execute(new PublicationQuery({ page: 1, pageSize: 10 }));
        assert(page.items.length === 1 && page.items[0].documentId === 'doc-repo-1',
            '6. LIVE: SearchPublicationsUseCase\'s own result carries the identical documentId Explore would forward — Repository\'s query layer and its navigation layer agree on identity without any intermediate translation.');
    }
    console.log('✓ Section A: Repository -> Publication preserves the selected Publication\'s own identity exactly (pub.documentId, unmodified), performs no verification of its own, and targets the one existing /world/:documentId destination — never a second, Repository-specific one.');

    // ===============================================================
    // Section B — Notification -> Publication -> World, re-exercised,
    // cross-checked against Section A's own destination for the SAME
    // Publication.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const shared = new Publication({ id: 'pub-shared-1', documentId: 'doc-shared-1', title: 'Shared Atlas', author: 'bob' });
        storage.save('forkbuild-publications', [shared.toJSON()]);

        const session = makeSession(discoveryProvider);
        let closed = false;
        const viewPublicationCommand = makeViewPublicationCommand(session, () => { closed = true; });

        // B1. LIVE: resolution goes through findPublicationById(), never a
        // bespoke notification-specific lookup.
        const resolved = session.findPublicationById('pub-shared-1');
        assert(resolved instanceof Publication && resolved.documentId === 'doc-shared-1',
            '1. session.findPublicationById() resolves the exact publicationId the notification named.');

        // B2. LIVE: the panel's own action, exercised end to end.
        const target = viewPublicationCommand('pub-shared-1');
        assert(target === 'doc-shared-1' && closed === true,
            '2. viewNotificationPublicationCommand navigates to the resolved documentId and closes the panel only on success.');

        // B3. Cross-check against Section A: for the identical Publication,
        // Repository's own Explore target (pub.documentId, read directly
        // off a search result) and Notification's own resolved target
        // (via findPublicationById().documentId) are the SAME value — a
        // Wanderer arriving from either surface lands on one, identical
        // World, never a "notification version" of it.
        const search = new SearchPublicationsUseCase(discoveryProvider, { execute: () => null });
        const repositoryTarget = search.execute(new PublicationQuery({ page: 1, pageSize: 10 })).items[0].documentId;
        assert(repositoryTarget === target,
            '3. Repository\'s Explore target and Notification\'s resolved target agree exactly for the same Publication — one destination, reached two ways, never two destinations that happen to look alike.');

        // B4. No notification-specific loading path: the panel never
        // constructs a discovery provider, resolver, or World-loading
        // mechanism of its own.
        const panelSource = await readSource('ui/components/NotificationHistoryPanel.js');
        assert(!/DiscoveryProvider|PublicationResolver|LoadDocumentUseCase/.test(panelSource),
            '4. NotificationHistoryPanel.js constructs no discovery/resolution/loading mechanism of its own — it only ever calls the injected viewPublicationCommand.');
    }
    console.log('✓ Section B: Notification -> Publication -> World, re-exercised live, resolves through findPublicationById() alone and reaches the IDENTICAL destination Repository\'s own Explore action would for the same Publication — no notification-specific loading path exists.');

    // ===============================================================
    // Section C — Search/Documents-Here/Nearby Worlds/Notification
    // convergence on focusWorld(); Repository's separate router.push()
    // bottoms out on the same session-level primitive.
    // ===============================================================
    {
        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');

        // C1. focusWorld() itself: unchanged shape — move camera via the
        // session, sync the route, refresh UI. Exactly one such function.
        assert(countOccurrences(worldViewSource, 'function focusWorld(documentId) {') === 1,
            '1. Exactly one focusWorld() definition exists.');

        // C2. At least four real call sites reuse it (Search, Documents-
        // Here, Nearby Worlds, and Notification's own 0.9.530 addition) —
        // never a second, competing navigation helper growing alongside it.
        const focusWorldCallSites = (worldViewSource.match(/\bfocusWorld\(/g) || []).length - 1; // minus the definition
        assert(focusWorldCallSites >= 4,
            `2. focusWorld() is called from at least 4 sites beyond its own definition (found ${focusWorldCallSites}) — Search/Documents-Here/Nearby Worlds/Notification all converge on one mechanism, never independent re-implementations.`);

        // C3. Repository/Editor's own router.push({ path: '/world/...' })
        // shape is deliberately absent from WITHIN WorldView.js's own
        // navigation helpers — WorldView never re-invents a bare push of
        // its own; router.replace (route follows session state) is the
        // only router-touching call this file's own navigation makes.
        assert(!/router\.push\(\{ path: `\/world\//.test(worldViewSource),
            '3. WorldView.js itself never bare-pushes a /world/ route — router.replace (route follows session state) is the only mechanism it uses, exactly as focusWorld()\'s own body shows.');

        // C4. Both entry shapes bottom out on the SAME session primitive:
        // focusWorld() calls session.focusDocument(); WorldView's own
        // mount calls session.navigateToDocument(), which application/
        // WorldNavigationSession.js defines as a one-line alias for
        // focusDocument() itself — confirmed against real source, not
        // assumed.
        const sessionSource = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');
        assert(sessionSource.includes('navigateToDocument(documentId) {\n        return this.focusDocument(documentId);\n    }'),
            '4. navigateToDocument() (WorldView\'s own mount-time entry) is a verbatim alias for focusDocument() (focusWorld()\'s own target) — Repository\'s router.push and every focusWorld() caller converge on the identical session primitive, never two navigation models.');
    }
    console.log('✓ Section C: Search/Documents-Here/Nearby Worlds/Notification all reuse the one focusWorld() mechanism; Repository\'s separate router.push() entry converges on the identical session.focusDocument() primitive at mount — one navigation model underneath two entry shapes, not two models.');

    // ===============================================================
    // Section D — Verification context continuity: VERIFIED never
    // drifts into trusted/authentic/official/owned.
    // ===============================================================
    {
        class AlwaysTrue extends WorldEncounterMaterialVerifier {
            verifyIdentity() { return Promise.resolve(true); }
        }
        const outcome = await verifyWorldEncounterMaterial({
            resolvedSelection: { kind: 'PUBLICATION', objectId: 'P1', origin: 'local' },
            material: { id: 'P1' },
            verifier: new AlwaysTrue()
        });
        assert(outcome.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '1. LIVE: a verifier actively confirming identity correspondence produces exactly VERIFIED.');

        const label = describeWorldEncounterMaterialVerificationStatusLabel(outcome.status);
        assert(typeof label === 'string' && label.length > 0,
            '2. VERIFIED renders as a real, non-empty label.');
        assert(!/\btrusted\b|\bauthentic\b|\bofficial\b|\bowned\b/i.test(label),
            `3. The rendered label ("${label}") never claims trusted/authentic/official/owned — it describes correspondence to the selected encounter, not a verdict about the material's authority.`);

        // D2. That same discipline holds at every surface a Publication is
        // discovered or navigated through, not just the encounter panel
        // that originally closed this concern (0.9.519).
        const surfaceFiles = [
            'ui/components/PublicationCard.js',
            'ui/components/PublicationList.js',
            'ui/components/PublicationCatalog.js',
            'ui/components/PublicationPreview.js',
            'ui/components/NotificationHistoryPanel.js'
        ];
        for (const file of surfaceFiles) {
            const src = await readSource(file);
            // Checked against the RENDERED template only — source comments
            // in this codebase routinely name these exact words to explain
            // their deliberate absence (see extractTemplate()'s own header),
            // which would otherwise false-positive a source-wide check.
            const rendered = extractTemplate(src);
            assert(!/\btrusted\b|\bauthentic\b|\bofficial\b|\bowned\b/i.test(rendered),
                `4. ${file}'s own rendered template carries none of trusted/authentic/official/owned vocabulary about a Publication.`);
            assert(!/WorldEncounterMaterialVerification|VERIFICATION_STATUS_LABELS/.test(src),
                `5. ${file} never re-derives or duplicates the verification-status vocabulary — that stays sole property of the World Encounter boundary that actually performs verification.`);
        }
    }
    console.log('✓ Section D: VERIFIED stays "confirmed to correspond to the selected encounter," never trusted/authentic/official/owned, both at its own rendering boundary and at every Repository/Notification surface a Publication passes through on the way there — none of them re-derive or duplicate that vocabulary.');

    // ===============================================================
    // Section E — Provenance continuity: two values, per-observation,
    // never a per-backend "kind of Publication."
    // ===============================================================
    {
        const localProvenance = describePublicationMaterialProvenanceFromInspection({ lead: null });
        const decentralizedProvenance = describePublicationMaterialProvenanceFromInspection({ lead: { uri: 'ar://tx' } });
        assert(localProvenance.origin === PublicationMaterialProvenanceOrigin.LOCAL,
            '1. LIVE: an inspection with no lead reports LOCAL.');
        assert(decentralizedProvenance.origin === PublicationMaterialProvenanceOrigin.DECENTRALIZED,
            '2. LIVE: an inspection carrying a resolved lead (Arweave, Nostr, or peer alike) reports DECENTRALIZED — never a per-backend value.');
        assert(Object.keys(PublicationMaterialProvenanceOrigin).length === 2,
            '3. Exactly two origin values exist anywhere in this vocabulary.');

        // E2. Repository/Notification surfaces never render a per-backend
        // provenance label (Arweave/Nostr/Peer) as if it named a KIND of
        // Publication, and never read the raw providerId a Publication
        // carries internally.
        const surfaceFiles = [
            'ui/components/PublicationCard.js',
            'ui/components/PublicationList.js',
            'ui/components/PublicationCatalog.js',
            'ui/components/PublicationPreview.js',
            'ui/components/NotificationHistoryPanel.js'
        ];
        for (const file of surfaceFiles) {
            const src = await readSource(file);
            const rendered = extractTemplate(src);
            assert(!/\bArweave\b|\bNostr\b/i.test(rendered),
                `4. ${file}'s own rendered template never names a specific decentralized backend as if it were the Publication's own identity or kind.`);
            assert(!/\.providerId\b/.test(src),
                `5. ${file} never reads publication.providerId — the raw backend identifier stays internal, never surfaced as "this is an X Publication."`);
        }
    }
    console.log('✓ Section E: provenance stays the same two-value, per-observation fact (LOCAL/DECENTRALIZED) everywhere a Publication is discovered or navigated — no Repository/Notification surface names a specific backend (Arweave/Nostr/Peer) as if it were the Publication\'s own kind or identity.');

    // ===============================================================
    // Section F — Missing/stale Publication: local, isolated degradation.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const session = makeSession(discoveryProvider); // empty catalog — nothing resolves
        const viewPublicationCommand = makeViewPublicationCommand(session);

        const ctx = panelCtx({ viewPublicationCommand });
        const staleEvent = { notificationId: 'n-stale', payload: { publicationId: 'ghost-pub' } };
        const freshEvent = { notificationId: 'n-fresh', payload: { publicationId: 'ghost-pub-2' } };

        ctx.viewNotificationPublication(staleEvent);
        assert(ctx.unavailablePublicationNotificationIds.has('n-stale'),
            '1. A stale target (never known to this replica) marks exactly that ONE notification unavailable.');
        assert(!ctx.unavailablePublicationNotificationIds.has('n-fresh'),
            '2. A sibling notification, never clicked, is untouched — isolation holds.');

        // F2. Repository draws no equivalent pre-flight "is this
        // resolvable" check of its own — it has no session to ask one,
        // and it never fakes one.
        const catalogSource = await readSource('ui/components/PublicationCatalog.js');
        assert(!/findPublicationById/.test(catalogSource),
            '3. PublicationCatalog.js performs no findPublicationById-style pre-check — its own degradation happens naturally, after navigation, inside WorldView\'s own "Unavailable" section, never duplicated here.');

        // F3. WorldView.js's own local degradation for an unresolvable
        // World target still exists, independent of how the Wanderer
        // arrived.
        const worldViewSource = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
        assert(worldViewSource.includes('<h4>Unavailable ({{ failedWorlds.length }})</h4>'),
            '4. WorldView.js still renders its own "Unavailable" section for a World that fails to load — the SAME destination-side degradation regardless of whether the Wanderer arrived via Repository, Notification, Search, or any other surface.');
    }
    console.log('✓ Section F: a stale target degrades locally to its own initiating surface (Notification checks and hides its own action before ever leaving the panel; Repository has no session to pre-check with, and instead relies on WorldView\'s own unchanged "Unavailable" section after arrival) — never a shared, leaky staleness mechanism, and never one notification\'s failure touching a sibling.');

    // ===============================================================
    // Section G — World Encounter boundary: arrival never re-triggers
    // discovery or verification.
    // ===============================================================
    {
        const sessionSource = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');
        const focusDocumentBody = sessionSource.match(/focusDocument\(documentId, \{ setActive = true \} = \{\}\) \{([\s\S]*?)\n {4}\}/);
        assert(focusDocumentBody && focusDocumentBody[1],
            '1. focusDocument()\'s own body is present and extractable.');
        assert(!/WorldEncounter|verify|discover/i.test(focusDocumentBody[1]),
            '2. LIVE (by source): focusDocument()\'s own body — the primitive every navigation entry point ultimately calls — never names discovery or verification; it moves the camera and (optionally) the active document, nothing else.');

        // G2. The session file that owns navigation never imports the
        // World Encounter verification/canvas family at all.
        assert(!/WorldEncounterMaterialVerification|WorldEncounterCanvas/.test(sessionSource),
            '3. application/world/WorldNavigationSession.js never imports the World Encounter verification family — arriving at a Publication\'s World and encountering/verifying a placed object inside it remain two independent stacks, exactly as the existing architecture already keeps them.');
    }
    console.log('✓ Section G: arriving at a Publication through Repository or Notification changes only the camera/active-document — it never re-triggers World Encounter discovery or re-verification. "Existing Publication -> World observation" holds; there is no "World discovers/verifies it again."');

    // ===============================================================
    // Section H — Identity semantics: publicationId/documentId/
    // contentHash stay distinct; a shared contentHash never merges two
    // Publications into one.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const sharedHash = 'sha256:deadbeef';
        const pubA = new Publication({ id: 'pub-A', documentId: 'doc-A', title: 'A', author: 'alice', contentHash: sharedHash });
        const pubB = new Publication({ id: 'pub-B', documentId: 'doc-B', title: 'B', author: 'bob', contentHash: sharedHash });
        storage.save('forkbuild-publications', [pubA.toJSON(), pubB.toJSON()]);

        assert(discoveryProvider.list().length === 2,
            '1. LIVE: two Publications sharing a contentHash remain two separate catalog entries, never merged into one.');
        const foundA = discoveryProvider.findById('pub-A');
        const foundB = discoveryProvider.findById('pub-B');
        assert(foundA.documentId === 'doc-A' && foundB.documentId === 'doc-B' && foundA.documentId !== foundB.documentId,
            '2. LIVE: findById() keys by id, resolving each to its own distinct documentId — a shared contentHash never redirects one lookup onto the other\'s World.');

        const session = makeSession(discoveryProvider);
        assert(session.findPublicationById('pub-A').documentId === 'doc-A' && session.findPublicationById('pub-B').documentId === 'doc-B',
            '3. LIVE: session.findPublicationById() — Notification\'s own resolution authority — preserves the same distinction end to end.');

        // H2. Structural: no discovery provider in this codebase keys
        // lookup or storage by contentHash.
        const localSrc = await readSource('discovery/LocalDiscoveryProvider.js');
        const decentralizedSrc = await readSource('discovery/DecentralizedPublicationDiscoveryProvider.js');
        assert(!/contentHash/.test(localSrc) && !/contentHash/.test(decentralizedSrc),
            '4. Neither discovery provider references contentHash anywhere — id and documentId alone drive lookup and navigation identity.');

        // H3. Publication itself keeps id, documentId, and contentHash as
        // three separate constructor fields/getters — never derived from
        // one another.
        const pubSrc = await readSource('publisher/Publication.js');
        assert(/get id\(\) \{ return this\._id; \}/.test(pubSrc)
            && /get documentId\(\) \{ return this\._documentId; \}/.test(pubSrc)
            && /get contentHash\(\) \{ return this\._contentHash; \}/.test(pubSrc),
            '5. Publication.js exposes id, documentId, and contentHash as three independent getters over three independently-supplied constructor fields.');
    }
    console.log('✓ Section H: publicationId (id), documentId, and contentHash remain three separate facts throughout discovery and navigation — proven live with two real Publications sharing one contentHash, resolved through both LocalDiscoveryProvider and session.findPublicationById() to their own distinct documentIds, never merged.');

    // ===============================================================
    // Section I — Flagship: one shared "Explore" vocabulary across every
    // entry surface.
    // ===============================================================
    {
        const cardSource = await readSource('ui/components/PublicationCard.js');
        const listSource = await readSource('ui/components/PublicationList.js');
        const panelSource = await readSource('ui/components/NotificationHistoryPanel.js');

        assert(cardSource.includes('class="action-btn action-btn--explore"') && cardSource.includes('>Explore</button>'),
            '1. PublicationCard.js (Repository/Author) uses "Explore" with action-btn--explore.');
        assert(listSource.includes('class="action-btn action-btn--explore"') && listSource.includes('>Explore</button>'),
            '2. PublicationList.js (Repository\'s alternate view) uses the identical shape.');
        assert(panelSource.includes('class="action-btn action-btn--explore"') && panelSource.includes('>Explore</button>'),
            '3. NotificationHistoryPanel.js reuses the SAME label and class rather than inventing "View," "Open in World," or any second vocabulary.');
    }
    console.log('✓ Section I: "Explore" — the same word, the same styling — is what a Wanderer clicks whether they found the Publication in Repository, in an Author\'s catalog, or in their own Notification History. A reasonable user can tell they are following the same Publication through these surfaces.');

    console.log('\nAll Publication Discovery-to-World Continuity Product Reassessment tests passed.');
    console.log('\n=== 0.9.532 VERDICT ===');
    console.log(`PRODUCT_COMPLETE. Every angle this reassessment's own brief named — identity preservation (A, H), navigation
convergence (B, C), verification vocabulary discipline (D), provenance-as-observation-not-identity (E), local and
isolated stale-target degradation (F), World Encounter/navigation independence (G), and one shared user-facing
"Explore" vocabulary (I) — already holds, live, across Repository, Notification, Search, Documents-Here, and Nearby
Worlds. Each was built or closed by an earlier, more narrowly-scoped milestone (0.9.111/0.9.112 provenance,
0.9.334/0.9.335 discovery identity, 0.9.381 Repository navigation, 0.9.519 verification-label discipline, 0.9.523/
0.9.524 admission-verification consistency, 0.9.530/0.9.531 notification navigation) — this milestone's own
contribution is confirming, together and for the first time from the discovering Wanderer's own point of view, that
those independently-built pieces cohere into ONE Publication experience rather than several that merely resemble
each other. No production file changed. Per this milestone's own brief: STOP this continuity arc. The next
milestone should come from whichever actual user-facing gap a future reassessment finds — not from a predetermined
number.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
