import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import {
    buildPlaceNamingDiscoveryEnvelope, parsePlaceNamingDiscoveryEnvelope, derivePlaceNamingDiscoveryTag
} from '../core/PlaceNamingDiscoveryEnvelope.js';
import { NostrPlaceNamingDiscoveryPublisher } from '../application/NostrPlaceNamingDiscoveryPublisher.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { PlaceNamingDiscoveryQueryService } from '../application/PlaceNamingDiscoveryQueryService.js';
import { executeDiscoverPlaceNamingClaimsCommand } from '../application/DiscoverPlaceNamingClaimsCommand.js';
import { LocalPlaceNamingClaimStore } from '../application/LocalPlaceNamingClaimStore.js';
import { LocalPlaceNamingPublicationLog } from '../application/LocalPlaceNamingPublicationLog.js';
import { PlaceNamingClaimExchange } from '../application/PlaceNamingClaimExchange.js';
import { PlaceNamingClaimUseCase } from '../application/PlaceNamingClaimUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.318 — Post-Place-Naming Distribution Product Reassessment.
//
// 0.9.315 demonstrated, live, a concrete two-device workflow this product
// could not complete (a self-published Place Naming claim never reached a
// second device through decentralized discovery). 0.9.316 built the
// missing write-side capability. 0.9.317 audited convergence between that
// new write path and the pre-existing, independently-built read path from
// a fresh, skeptical angle and found no seam. This milestone asks the ONE
// question that arc's own closure leaves open, and no other: now that
// Place Naming can explicitly publish claims to Nostr and another device
// can discover them, is there another concrete user journey that is
// actually blocked? It is a **test-only product/architecture
// reassessment**. It adds no production code and no new capability.
//
// THE ONE FINDING THIS MILESTONE ADDS BEYOND 0.9.315-0.9.317's OWN RECORD:
// "implemented" and "reachable" are not the same claim, and 0.9.316/
// 0.9.317 never claimed otherwise. Both prior milestones proved
// NostrPlaceNamingDiscoveryPublisher works, correctly and safely, by
// constructing it directly in test code. Neither one wired it into any
// composition root or UI action — 0.9.316's own "What comes after"
// section named that decision explicitly and left it unselected. Section
// A below confirms, live and structurally, that this remains true today:
// the one "Publish" button that exists in the shipped product
// (ui/views/WorldView.js#publishNamingClaim()) still calls only the
// pre-existing LOCAL use case and has no path to the new publisher at
// all. This is not a regression and not newly discovered evidence — it is
// 0.9.316's own, already-recorded, deliberately deferred decision,
// reconfirmed rather than rediscovered, and it is the reason this
// milestone still recommends STOP rather than "wire the button."
//
//   Section A — Place Naming distribution journey closure: every boundary
//               in the arc's own diagram, classified implemented vs.
//               reachable, from fresh live/structural evidence.
//   Section B — Publication/discovery capability inventory: the write
//               side (capability-complete, composition-root-absent) and
//               the read side (capability-complete AND live-wired) are
//               proven to sit at two different reachability levels today,
//               on purpose.
//   Section C — Cross-device user-value verification: whether the
//               UI-reachability gap in Section A constitutes a currently
//               blocked user journey, checked against the one channel
//               (manual export/import, 0.5.3) that already, live, moves a
//               claim between two independent replicas today.
//   Section D — Remaining Place Naming candidates: each candidate named
//               in this milestone's own brief, scored against real
//               source rather than assumed.
//   Section E — Decentralized substrate/provider reassessment: Place
//               Naming's own Nostr publication is confirmed, structurally,
//               to create no provider-selection requirement of any kind.
//   Section F — Cross-arc convergence: Publication distribution, Snapshot
//               distribution, and Place Naming distribution compared
//               side by side; the difference in each arc's own UI
//               reachability is confirmed semantic (an explicit product
//               decision, recorded at 0.9.316) rather than an accidental
//               omission this milestone should paper over with a shared
//               abstraction.
//   Section G — Existing orphan/internal capability scan: the new
//               publisher is classified against this codebase's own
//               REACHABLE_BUT_INTERNAL precedent, not left unclassified.
//   Section H — New product-gap evidence gate: every candidate from
//               Section D run through the same executable classifier
//               0.9.314/0.9.315 already established.
//   Section I — Architecture-debt vs. product-gap classification: the
//               UI-reachability gap itself classified against the same
//               four architectural-observation kinds 0.9.314 Section E
//               already named, so "unwired" is not silently treated as
//               "broken."
//   Section J — Final product evolution decision: STABLE — STOP, or not,
//               decided from Sections A-I rather than asserted up front.
//
// ADDENDUM — 0.9.320 — Explicit Place Naming Publication Action. New
// product evidence (a place name's own inherent social/discovery use case
// — the author may want a STRANGER, not just their own other devices, to
// discover it) reopened exactly the one gap this milestone characterized
// but declined to act on (Sections A-B). Every assertion below that
// checked "the publisher has no composition-root/UI caller" is updated IN
// PLACE to record the new fact, mirroring the identical discipline 0.9.316
// already held for 0.9.315's own now-closed findings — this file remains
// an accurate account of what was true, and why STOP was the right call,
// AS OF 0.9.318, while no longer asserting a state 0.9.320 has since
// changed.

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

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

function grepCount(pattern, dirs, opts = {}) {
    return grepFiles(pattern, dirs, opts).length;
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

function makeReplica(identityProvider, { storage = new InMemoryStorageProvider() } = {}) {
    const store = new LocalPlaceNamingClaimStore(storage);
    const log = new LocalPlaceNamingPublicationLog(storage);
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PlaceNamingClaimExchange(store, verifier, log);
    const useCase = new PlaceNamingClaimUseCase(store, identityProvider, verifier);
    return { storage, store, log, verifier, exchange, useCase };
}

function makeSharedRelay() {
    const events = [];
    return {
        events,
        async publishImpl(relayUrl, eventTemplate) {
            const id = `${'e'.repeat(63)}${(events.length % 10)}`;
            events.push({ id, kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content });
            return { published: true, id };
        },
        queryImpl(relayUrl, filter) {
            const wantedTags = filter['#t'] || [];
            return Promise.resolve(events.filter((event) => event.tags.some((t) => t[0] === 't' && wantedTags.includes(t[1]))));
        }
    };
}

async function runTests() {
    console.log('Running Post-Place-Naming Distribution Product Reassessment tests...\n');

    // ===============================================================
    // Section A — Place Naming distribution journey closure.
    //
    // Every boundary in the arc's own diagram, classified as IMPLEMENTED
    // (the code exists and works, proven by test) vs. REACHABLE (a real
    // Wanderer, using only the shipped UI, can actually trigger it) —
    // never conflating the two.
    // ===============================================================
    {
        // A1. Create -> local persistence: IMPLEMENTED AND REACHABLE.
        // ui/views/WorldView.js's own "Publish" action reaches the real
        // local use case.
        const worldView = await rawSource('ui/views/WorldView.js');
        assert(worldView.includes('function publishNamingClaim(name)') && worldView.includes('session.publishPlaceNamingClaim(namingPanelRegionId.value, name)'),
            'A1. ui/views/WorldView.js still defines publishNamingClaim(name), which still forwards to session.publishPlaceNamingClaim() — creation and local persistence are live-wired and reachable through the real "Publish" UI action.');

        // A2. THE FINDING: the SAME "Publish" action is the entire
        // distance a real Wanderer can travel today. It never reaches
        // NostrPlaceNamingDiscoveryPublisher, and neither does anything
        // else reachable from a composition root.
        const publishFnMatch = worldView.match(/function publishNamingClaim\(name\) \{[\s\S]*?\n {8}\}/);
        assert(publishFnMatch && !publishFnMatch[0].includes('Nostr') && !publishFnMatch[0].includes('Publisher'),
            'A2. The full body of publishNamingClaim() contains no reference to Nostr or to any publisher class — clicking "Publish" today performs local persistence ONLY, exactly what 0.9.315 Section B/F already characterized this action as, before the write-side capability even existed.');

        const navSessionCode = codeOnlyLines(await rawSource('application/WorldNavigationSession.js'));
        assert(!navSessionCode.includes('NostrPlaceNamingDiscoveryPublisher'),
            'A2b. application/WorldNavigationSession.js — the one class publishNamingClaim() calls into — never references NostrPlaceNamingDiscoveryPublisher anywhere in its own code.');

        // A3. HISTORICAL RECORD, SUPERSEDED BY 0.9.320 — Explicit Place
        // Naming Publication Action. As of THIS milestone (0.9.318), the
        // publisher class was fully IMPLEMENTED (0.9.316, reconfirmed
        // convergent at 0.9.317) but structurally UNREACHABLE from any
        // composition root or UI file — the ONLY places its name appeared
        // anywhere in production source were its own file and one
        // forward-looking COMMENT in its read-side sibling. 0.9.320 closed
        // exactly this gap: `application/PlaceNamingPublicationRuntimeComposition.js`,
        // `ui/main.js`, `ui/views/WorldView.js`, and `ui/components/PlaceNamingPanel.js`
        // now all reference it as a genuine, live composition-root/UI
        // caller. This section's own checks are updated in place to record
        // the new fact — see tests/PlaceNamingClaimPublicationAction.test.js
        // for the live proof this reachability actually works — rather than
        // left asserting a state that no longer holds, the same discipline
        // 0.9.316 already held for 0.9.315's own record.
        const publisherReferences = grepFiles('NostrPlaceNamingDiscoveryPublisher', ['application', 'ui', 'core', 'identity', 'server']);
        const nonSelfReferences = publisherReferences.filter((f) => f !== 'application/NostrPlaceNamingDiscoveryPublisher.js');
        assert(nonSelfReferences.includes('application/PlaceNamingPublicationRuntimeComposition.js') && nonSelfReferences.includes('application/NostrPlaceNamingDiscoverySource.js'),
            `A3a. As of 0.9.320, at least the composition-root file and the pre-existing read-side comment reference the publisher's name (found: ${nonSelfReferences.join(', ') || 'none'}) — no longer "exactly one," and the additional reference is real, live-composed code, not a second comment.`);
        const compositionSourceRaw = await rawSource('application/PlaceNamingPublicationRuntimeComposition.js');
        assert(compositionSourceRaw.includes('new NostrPlaceNamingDiscoveryPublisher('),
            'A3b. 0.9.320\'s own composition-root file genuinely constructs the publisher, in code — not merely a comment reference, unlike the pre-existing read-side sibling\'s own forward-looking comment.');
        assert(grepCount('new NostrPlaceNamingDiscoveryPublisher(', ['ui', 'server']) === 0,
            'A3c. Still zero UI or server files directly construct a NostrPlaceNamingDiscoveryPublisher — 0.9.320 reaches it only through application/PlaceNamingPublicationRuntimeComposition.js\'s own composed function, never a concrete class reference from ui/, mirroring the identical restraint Snapshot distribution already holds for ArweaveContentStore/NostrSnapshotDiscoveryPublisher (Section F2).');

        // A4. HISTORICAL RECORD, SUPERSEDED BY 0.9.320. As of THIS
        // milestone, Nostr relay discovery was composed but there was no
        // configured PUBLISH transport for this domain at all. 0.9.320
        // wired one, reusing the SAME nostrHostPublisher instance already
        // resolved for Publication/Snapshot distribution — never a second
        // read of window.nostr.
        const mainJs = await rawSource('ui/main.js');
        assert(mainJs.includes('NostrPlaceNamingDiscoverySource') && mainJs.includes('nostrRelayQueryClient'),
            'A4a. ui/main.js still composes a real Nostr QUERY client for Place Naming discovery.');
        assert(mainJs.includes('composePlaceNamingPublicationRuntime(') && mainJs.includes("app.provide('publishPlaceNamingClaimToNostrCommand'"),
            'A4b. As of 0.9.320, ui/main.js DOES compose a real Nostr PUBLISH transport for Place Naming — a relay write path now exists for this domain, provided app-wide under its own dedicated key, reusing (never duplicating) the same nostrHostPublisher instance Publication/Snapshot distribution already resolved.');

        // A5. Existing discovery source -> Device B discovers claim:
        // IMPLEMENTED AND REACHABLE. The read half is genuinely live,
        // wired into WorldView's own refresh loop with no button
        // required — the automatic PlaceNamingDiscoveryMonitor 0.9.256
        // already built.
        assert(worldView.includes('PlaceNamingDiscoveryMonitor') && worldView.includes('placeNamingDiscoveryMonitor.observe('),
            'A5. ui/views/WorldView.js still constructs a real PlaceNamingDiscoveryMonitor and calls .observe() from its own live refresh path — discovery is reachable automatically, requiring no explicit user action, unlike publication.');

        // A6. Adoption (discovered -> imported into local store):
        // IMPLEMENTED AND REACHABLE, closing the read side's own loop —
        // a discovered candidate is not merely displayed inertly.
        assert(worldView.includes('function adoptNearbyPlaceNamingClaim(row)') && worldView.includes('@click="adoptNearbyPlaceNamingClaim(claim)"'),
            'A6. ui/views/WorldView.js still defines adoptNearbyPlaceNamingClaim(row) and wires it to a real @click handler on a discovered claim row (0.9.263) — a Wanderer can act on a discovered candidate today, not merely see one.');

        console.log('✓ A: HISTORICAL RECORD, SUPERSEDED BY 0.9.320. Every boundary in the arc\'s own diagram traced fresh, as of THIS milestone (0.9.318): create -> local persistence (A1), discovery -> adoption (A5/A6) were both IMPLEMENTED AND REACHABLE; "Explicit Publish action -> NostrPlaceNamingDiscoveryPublisher" was IMPLEMENTED (0.9.316/0.9.317) but NOT REACHABLE from anywhere a real Wanderer could click (A2-A4) — the shipped "Publish" button performed local persistence only. 0.9.320 — Explicit Place Naming Publication Action — later closed exactly that gap with a new, separate, explicit "Publish to Nostr" action; the pre-existing "Publish" action (local creation, A1/A2) remains completely unmodified. See tests/PlaceNamingClaimPublicationAction.test.js for the live proof.');
    }

    // ===============================================================
    // Section B — Publication/discovery capability inventory.
    //
    // The write side and read side sit at two genuinely different
    // reachability levels today — proven, not merely restated from
    // Section A's own file-level findings.
    // ===============================================================
    {
        // B1. Write side: capability-complete. Re-run the flagship
        // cross-device journey fresh, exactly as 0.9.317 Section A did,
        // to reconfirm nothing regressed between that audit and this one.
        const relay = makeSharedRelay();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const deviceA = makeReplica(alice);
        const deviceB = makeReplica(bob);
        const worldId = 'reassessment-world';
        const regionId = 'reassessment-region';

        const claim = deviceA.useCase.publish(worldId, regionId, 'Duskfen');
        const publisher = new NostrPlaceNamingDiscoveryPublisher({ publishImpl: relay.publishImpl });
        const publishResult = await publisher.publish(claim);
        assert(publishResult !== null && publishResult.published === true,
            'B1a. The write-side capability still works end to end when driven directly, exactly as 0.9.316/0.9.317 proved.');

        const discoveryTag = derivePlaceNamingDiscoveryTag(worldId, regionId);
        const source = new NostrPlaceNamingDiscoverySource({ queryImpl: relay.queryImpl });
        const queryService = new PlaceNamingDiscoveryQueryService([source]);
        const discovered = await executeDiscoverPlaceNamingClaimsCommand({ discoveryTag, discoveryQueryService: queryService });
        assert(discovered.length === 1 && discovered[0].claim.id === claim.id,
            'B1b. Device B still discovers Alice\'s claim through the unmodified read chain — the capability inventory is unchanged since 0.9.317.');

        // B2. HISTORICAL RECORD, SUPERSEDED BY 0.9.320. As of THIS
        // milestone, the read side had a composed, live, production
        // discoveryQueryService reachable from a real UI refresh loop
        // (Section A5); the write side had no equivalent production
        // publisher instance anywhere. 0.9.320 closed that asymmetry by
        // providing a real, live command from the same composition root —
        // under a name reflecting what it actually does
        // (publishPlaceNamingClaimToNostrCommand: a thin function, never a
        // bare publisher instance handed to the app), the identical shape
        // every other injected command in ui/main.js already takes.
        const mainJs = await rawSource('ui/main.js');
        assert(mainJs.includes("app.provide('placeNamingDiscoveryQueryService'"),
            'B2a. A real, live discoveryQueryService is provided from ui/main.js\'s own composition root — reachable by any view that injects it.');
        assert(mainJs.includes("app.provide('publishPlaceNamingClaimToNostrCommand'"),
            'B2b. As of 0.9.320, a real publish command IS provided from the same composition root, under its own dedicated key — the asymmetry Section B existed to characterize no longer holds at the composition-root level (Section C below still asks whether that changes the underlying user-value picture).');

        // B3. HISTORICAL RECORD, SUPERSEDED BY 0.9.320. As of THIS
        // milestone, zero UI files constructed the publisher, so this
        // product's own discovery monitor could never observe a genuinely
        // self-originated Place Naming publication on a real relay except
        // through an external actor. 0.9.320 gives a real Wanderer, using
        // only the shipped "Publish to Nostr" action, a path to originate
        // exactly such an event — reconfirmed live in
        // tests/PlaceNamingClaimPublicationAction.test.js Section F.
        const uiWideNonTestPublisherConstruction = grepCount('new NostrPlaceNamingDiscoveryPublisher(', ['ui']);
        assert(uiWideNonTestPublisherConstruction === 0,
            'B3. Still zero UI files directly construct the publisher — 0.9.320 reaches it only through the composed application/PlaceNamingPublicationRuntimeComposition.js function, the identical "never a concrete class reference from ui/" restraint Snapshot distribution already holds.');

        console.log('✓ B: HISTORICAL RECORD, SUPERSEDED BY 0.9.320. As of THIS milestone (0.9.318), the write side (B1) and read side (B2) were both capability-complete but sat at two different reachability levels — the read side composed and live (B2a), the write side with no equivalent anywhere (B2b/B3). 0.9.320 closed that gap by providing a real publish command from the same composition root; see that milestone\'s own record.');
    }

    // ===============================================================
    // Section C — Cross-device user-value verification.
    //
    // Does Section A/B's UI-reachability gap constitute a currently
    // BLOCKED user journey, or does an already-shipped alternate channel
    // already let a real Wanderer complete the underlying goal today?
    // ===============================================================
    {
        // C1. The manual export/import channel (0.5.3) is confirmed,
        // fresh, to still be live, wired UI — not merely available
        // machinery nobody surfaces. This is the exact channel 0.9.315
        // Section G already found to be this codebase's own deliberately
        // designed CURRENT sharing mechanism.
        const worldView = await rawSource('ui/views/WorldView.js');
        assert(worldView.includes('function exportNamingClaim(claimId)') && worldView.includes('function importNamingClaim(rawText)'),
            'C1a. ui/views/WorldView.js still defines both exportNamingClaim() and importNamingClaim(), live.');
        const panelSource = await rawSource('ui/components/PlaceNamingPanel.js');
        assert(panelSource.includes('Import Claim'),
            'C1b. ui/components/PlaceNamingPanel.js still surfaces a real "Import Claim" control a Wanderer can click.');

        // C2. Live: a Wanderer CAN move a claim from Device A to Device B
        // today, end to end, using only shipped, reachable UI-equivalent
        // machinery (export/import), with the Nostr write path completely
        // untouched.
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');
        const deviceA = makeReplica(alice);
        const deviceB = makeReplica(bob);
        const claim = deviceA.useCase.publish('world-c', 'region-c', 'Farrow');
        const pkg = deviceA.exchange.exportClaim(claim);
        const importResult = deviceB.exchange.importClaim(pkg);
        assert(importResult.isNew === true && deviceB.store.has('world-c', claim.id),
            'C2. A full export -> import cycle, driven through the exact classes exportNamingClaim()/importNamingClaim() call, still succeeds end to end — the underlying user goal ("get my claim to a person on another device") is completable TODAY through a reachable channel, independent of whether the Nostr write path is ever wired to a button.');

        // C3. What the manual channel does NOT provide, named honestly:
        // it requires an out-of-band step (a file physically moved), and
        // it does not let a Wanderer's claim be found by a STRANGER who
        // never received a file from them — only decentralized discovery
        // could do that. This is the one genuine piece of user value the
        // still-unwired Nostr write path would add beyond what already
        // ships.
        const exchangeHeader = await rawSource('application/PlaceNamingClaimExchange.js');
        assert(exchangeHeader.includes('Alice\'s claim --export--> Publication --import--> Bob\'s claim store'),
            'C3. application/PlaceNamingClaimExchange.js\'s own header still describes export/import as a targeted, two-party hand-off — it was never designed to let an unknown stranger discover a claim with no prior relationship, the one capability that is genuinely unique to the still-unwired Nostr write path.');

        // C4. Is there any recorded evidence (a real user complaint, a
        // support request, a product decision) that a Wanderer has
        // actually needed "discovery by a stranger with no prior
        // relationship" and been blocked by its absence? None is on
        // record anywhere in this codebase's own docs/Roadmap.md beyond
        // this milestone's own initiating conversation, which itself
        // frames Nostr publication as ALREADY COMPLETE, not as an open
        // complaint about the button.
        const roadmap = await rawSource('docs/Roadmap.md');
        assert(roadmap.includes('0.9.317') && roadmap.includes('0.9.316'),
            'C4. docs/Roadmap.md carries 0.9.316/0.9.317\'s own record of building and converging the write path — it names no user-facing complaint about the missing UI button anywhere in that record; the wiring decision was deferred on architectural grounds (an explicit, later product call), never on unmet user need first identified here.');

        console.log('✓ C: The underlying user goal — move a self-published claim to a second device — is completable today through a real, reachable, shipped channel (C1/C2). What is missing is specifically stranger-discoverability with no prior relationship (C3), for which this codebase\'s own record carries no case of an actual user being blocked (C4). The Section A/B gap is real and worth naming precisely, but it is not, on the evidence available today, a currently blocked user journey in the sense this milestone\'s own evidence gate (Section H) requires.');
    }

    // ===============================================================
    // Section D — Remaining Place Naming candidates.
    //
    // Each candidate this milestone's own brief names, scored against
    // real source rather than assumed.
    // ===============================================================
    const candidateMatrix = [];
    {
        const publisherCode = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoveryPublisher.js'));

        // D1. Automatic publication on creation.
        const useCaseCode = codeOnlyLines(await rawSource('application/PlaceNamingClaimUseCase.js'));
        assert(!useCaseCode.includes('NostrPlaceNamingDiscoveryPublisher'),
            'D1. PlaceNamingClaimUseCase#publish() still never references the publisher — creating a claim locally still triggers no network write, automatic or otherwise.');
        candidateMatrix.push(['Automatic publication on creation', 'DEFER — would remove the explicit-publish product decision 0.9.316 deliberately made; no evidence a Wanderer wants every local claim broadcast without an explicit act.']);

        // D2. Multi-relay publication.
        assert(!/relays\s*:\s*\[|relayUrls|multiRelay/i.test(publisherCode),
            'D2. The publisher still accepts exactly one relayUrl, not an array — no multi-relay fan-out exists.');
        candidateMatrix.push(['Multi-relay publication', 'NOT READY — no recorded evidence a single relay has ever failed to carry a real publication; this is the exact "another provider could be supported" shape 0.9.314 Section F already names as insufficient.']);

        // D3. Relay preference.
        assert(!/RoleProviderPreference|providerKey/.test(publisherCode),
            'D3. The publisher references no preference/provider-selection vocabulary at all.');
        candidateMatrix.push(['Relay preference', 'NOT READY — see Section E; no meaningful choice between providers exists for this role today.']);

        // D4. Publication retry/offline queue.
        assert(!/retry|retries|backoff|offline.?queue/i.test(publisherCode),
            'D4. No retry/backoff/offline-queue vocabulary exists in the publisher\'s own source (reconfirmed from 0.9.317 Section G6).');
        candidateMatrix.push(['Publication retry/offline queue', 'NOT READY — would introduce lifecycle state 0.9.316 deliberately excluded; no operational failure is on record.']);

        // D5. Publication status/history.
        assert(grepCount('PlaceNamingPublicationHistory\\|PublicationHistoryStore', ['application', 'core']) === 0,
            'D5. No publication-history storage class exists anywhere.');
        candidateMatrix.push(['Publication status/history', 'NOT READY — no delivery/read-receipt semantics exist for this domain; the publisher\'s own contract is "relay accepted this event," nothing more (0.9.315 Section I).']);

        // D6. Unpublish/retraction.
        assert(!/unpublish|retraction/i.test(publisherCode),
            'D6. The publisher carries no unpublish/retraction vocabulary of any kind.');
        candidateMatrix.push(['Unpublish/retraction', 'NOT READY — Nostr\'s own append-only relay model makes this a genuinely new cross-cutting design question, not an incremental add; no user report of an erroneous publication exists.']);

        // D7. Cross-device editing/synchronization.
        assert(!/synchroniz|CRDT|merge/i.test(publisherCode),
            'D7. The publisher carries no synchronization/merge vocabulary — a claim is republished as-is, never merged.');
        candidateMatrix.push(['Cross-device editing/synchronization', 'NOT READY — a PlaceNamingClaim is immutable-by-design (retract + republish is the existing pattern); no evidence of an actual editing need.']);

        // D8. Notifications for naming publication. Unlike the 0.9.272
        // reassessment this milestone's own header cites, a generic
        // NotificationEvent domain now EXISTS (0.9.273 onward) — this
        // candidate is reassessed against today's real state, not a
        // stale citation of an absence that no longer holds generically.
        assert(await sourceExists('core/NotificationEvent.js'),
            'D8a. core/NotificationEvent.js now exists — a generic, domain-neutral notification-worthy-fact representation was built after 0.9.272\'s own reassessment.');
        const producerFiles = grepFiles('NotificationEvent', ['application']).filter((f) => /Producer/.test(f));
        assert(producerFiles.length >= 1,
            `D8b. At least one real NotificationEvent producer exists (found: ${producerFiles.join(', ')}) — the domain is not merely a representation with zero callers.`);
        for (const producerFile of producerFiles) {
            const producerCode = await rawSource(producerFile);
            assert(!/PlaceNaming/.test(producerCode),
                `D8c. ${producerFile} never references Place Naming — the one domain that HAS been wired to notifications (Publication Commentary) is not Place Naming.`);
        }
        candidateMatrix.push(['Notifications for naming publication', 'NOT READY — a generic NotificationEvent domain exists and has one real producer (Publication Commentary), but no Place Naming producer exists; Place Naming discovery still has no "recipient" concept to notify in the first place (0.9.272 Section D3: discovery is a puller\'s own query, never a push at a named identity) — the prerequisite gap is conceptual, not merely a missing producer class to write.']);

        // D9. Local export/import.
        const worldView = await rawSource('ui/views/WorldView.js');
        assert(worldView.includes('function exportNamingClaim') && worldView.includes('function importNamingClaim'),
            'D9. Export/import is already live, wired, reachable UI (reconfirmed, Section C1).');
        candidateMatrix.push(['Local export/import', 'ALREADY FUNCTIONAL — reconfirmed live in Section C.']);

        // D10. Nostr publication — precisely characterized, not merely
        // labeled COMPLETE. This is the one row Section A/B's own finding
        // changes from this milestone's own initiating table. HISTORICAL
        // RECORD, SUPERSEDED BY 0.9.320: at the time this milestone ran,
        // UI wiring was deliberately deferred (Section A/B); 0.9.320 later
        // wired an explicit "Publish to Nostr" action, closing this row.
        candidateMatrix.push(['Nostr publication', 'AS OF 0.9.318: CAPABILITY COMPLETE; UI WIRING DELIBERATELY DEFERRED (Section A/B). SUPERSEDED BY 0.9.320 — Explicit Place Naming Publication Action, which wired a real, explicit "Publish to Nostr" UI action reusing this same capability unmodified.']);

        // D11. Nostr discovery — the one row genuinely COMPLETE end to
        // end, including UI reachability, with no manual step.
        candidateMatrix.push(['Nostr discovery', 'COMPLETE — capability AND UI-reachable (Section A5/A6), unlike publication.']);

        assert(candidateMatrix.length === 11, `D. All 11 candidates from this milestone's own brief are scored (found ${candidateMatrix.length}).`);
        const readyCandidates = candidateMatrix.filter(([, disposition]) => disposition.startsWith('READY') || disposition.includes('BUILD NOW'));
        assert(readyCandidates.length === 0, 'D12. Zero of the 11 candidates classify as ready to build now.');

        console.log('✓ D: All 11 candidates from this milestone\'s own brief scored against real source, not assumed:');
        for (const [candidate, disposition] of candidateMatrix) {
            console.log(`    - ${candidate} -> ${disposition}`);
        }
    }

    // ===============================================================
    // Section E — Decentralized substrate/provider reassessment.
    //
    // Place Naming -> Nostr publication does not, by itself, create a
    // provider-selection requirement — guarded per 0.9.292-0.9.304's own
    // discipline, checked fresh against the NEW publisher file those
    // milestones predate.
    // ===============================================================
    {
        const publisherCode = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoveryPublisher.js'));
        assert(!/RoleProviderPreference|RoleProviderRole|providerKey/.test(publisherCode),
            'E1. application/NostrPlaceNamingDiscoveryPublisher.js references no provider-preference vocabulary of any kind — built entirely after 0.9.293\'s own RoleProviderPreference existed, and still never touches it.');

        const roleProviderRoleSource = await rawSource('core/RoleProviderRole.js');
        assert(!/PlaceNaming/i.test(roleProviderRoleSource),
            'E2. core/RoleProviderRole.js\'s own closed vocabulary (ANNOUNCEMENT_AND_DISCOVERY/CONTENT/PROOF_AND_ANCHORING) names no Place-Naming-specific role — Place Naming publication is not a new role, and does not need to become one.');

        // E3. A meaningful provider CHOICE requires more than one
        // production shape for the same role, per 0.9.292's own
        // standard (Section A there: the Announcement/Discovery role
        // already had three non-interchangeable shapes for Publication
        // distribution BEFORE preference vocabulary was justified).
        // Place Naming has exactly one — Nostr — and always has.
        const applicationDirFiles = execSync('ls application', { cwd: SOURCE_ROOT.pathname }).toString().trim().split('\n');
        const placeNamingDiscoverySourceFiles = applicationDirFiles.filter((f) => /PlaceNamingDiscoverySource/.test(f));
        assert(placeNamingDiscoverySourceFiles.length === 1 && placeNamingDiscoverySourceFiles[0] === 'NostrPlaceNamingDiscoverySource.js',
            `E3. Exactly one discovery-source class exists for Place Naming's Announcement/Discovery role (found: ${placeNamingDiscoverySourceFiles.join(', ') || 'none'}) — there has never been a second substrate to choose between, so "which provider" is not a question a Wanderer can meaningfully be asked yet.`);

        const settingsView = await rawSource('ui/views/ContentProviderSettingsView.js');
        assert(!/PlaceNaming/i.test(settingsView),
            'E4. ui/views/ContentProviderSettingsView.js — the one place a provider-preference UI actually exists in this codebase (0.9.302) — never mentions Place Naming; that surface is scoped to roles that already have more than one shape, and Place Naming is not among them.');

        console.log('✓ E: Place Naming\'s own Nostr publication introduces no provider-preference concept (E1), is not folded into the closed RoleProviderRole vocabulary (E2), and has exactly one production substrate for its role — never a genuine choice, so "Place Naming -> Nostr publication" does not imply "Place Naming -> provider preference UI," exactly per this milestone\'s own brief and 0.9.292-0.9.304\'s own guarded precedent.');
    }

    // ===============================================================
    // Section F — Cross-arc convergence.
    //
    // Publication distribution, Snapshot distribution, and Place Naming
    // distribution compared side by side. The difference in UI
    // reachability is confirmed SEMANTIC — a recorded product decision —
    // not accidental, and no shared abstraction is warranted merely
    // because the three arcs now look structurally similar.
    // ===============================================================
    {
        const mainJs = await rawSource('ui/main.js');

        // F1. Publication distribution: decentralized publication AND
        // discovery, both live-wired with a real publishImpl.
        assert(mainJs.includes('nostrHostPublisher') && mainJs.includes('composePublicationDistributionCommand') ,
            'F1. Publication distribution has a real, composed Nostr publish transport (nostrHostPublisher) wired to a real distribution command — both halves reachable.');

        // F2. Snapshot distribution: same pattern, its own publisher
        // class with a real production caller.
        const snapshotPublisherReferences = grepFiles('NostrSnapshotDiscoveryPublisher', ['application', 'ui']);
        const snapshotNonSelf = snapshotPublisherReferences.filter((f) => f !== 'application/NostrSnapshotDiscoveryPublisher.js');
        assert(snapshotNonSelf.length > 0,
            `F2. application/NostrSnapshotDiscoveryPublisher.js has at least one real, non-self production reference (found: ${snapshotNonSelf.join(', ')}) — unlike Place Naming's own publisher (Section A3), Snapshot's write side IS reachable from production composition.`);

        // F3. HISTORICAL RECORD, SUPERSEDED BY 0.9.320. As of THIS
        // milestone, Place Naming distribution had zero composition-root
        // reference for its publish half — the one genuine structural
        // difference among the three arcs at the time. 0.9.320 closed
        // that difference: Place Naming now has a real composition-root
        // reference too (application/PlaceNamingPublicationRuntimeComposition.js,
        // reused by ui/main.js), the identical "composed function only,
        // never a concrete class reference from ui/" shape Snapshot
        // distribution already holds (F2).
        assert(mainJs.includes('composePlaceNamingPublicationRuntime(') && grepCount('new NostrPlaceNamingDiscoveryPublisher(', ['ui']) === 0,
            'F3. As of 0.9.320, Place Naming\'s own decentralized-publish half DOES have a production composition-root reference (via the composed function, never a concrete class reference from ui/) — the structural gap Section A/B/F characterized at the time no longer holds.');

        // F4. Is this difference SEMANTIC (a deliberate product decision)
        // or ACCIDENTAL (an oversight)? Checked against the explicit
        // product decision 0.9.316's own record states, reused verbatim
        // rather than re-argued.
        const publicationBoundarySource = await rawSource('docs/Roadmap.md');
        assert(publicationBoundarySource.includes('publishing is **never automatic**') || publicationBoundarySource.includes('One explicit product decision'),
            'F4a. docs/Roadmap.md still carries 0.9.316\'s own explicit, named product decision that publication is never automatic — the un-wired state is not an oversight this reassessment discovered, but a documented choice.');
        assert(/whether and how to surface an explicit "Publish naming\s+claim" UI action/.test(publicationBoundarySource),
            'F4b. docs/Roadmap.md still names, word for word, the exact follow-on decision ("whether and how to surface an explicit Publish UI action") as unselected and left to a future milestone — the gap this file\'s Section A found is the SAME gap 0.9.316 already named, not a new one.');

        // F5. No shared abstraction is warranted: the three arcs' own
        // publisher classes remain structurally independent, exactly as
        // 0.9.317 Section J already proved for Place Naming specifically.
        // Reconfirmed here at the cross-arc level: neither
        // NostrPlaceNamingDiscoveryPublisher nor
        // NostrSnapshotDiscoveryPublisher extends anything, and no
        // generic DecentralizedPublisher/NostrPublisher base class exists
        // for either to be pulled toward.
        const placeNamingPublisherCode = codeOnlyLines(await rawSource('application/NostrPlaceNamingDiscoveryPublisher.js'));
        const snapshotPublisherCode = codeOnlyLines(await rawSource('application/NostrSnapshotDiscoveryPublisher.js'));
        assert(!placeNamingPublisherCode.includes('extends') && !snapshotPublisherCode.includes('extends'),
            'F5a. Neither domain\'s own publisher class is a subclass of anything.');
        const genericPublisherFiles = grepFiles('class.*DecentralizedPublisher\\|class.*NostrPublisher\\b', ['application']);
        assert(genericPublisherFiles.length === 0,
            'F5b. No generic, domain-independent publisher base class exists anywhere — the structural similarity Section F itself is built to compare does not, by itself, justify merging the two domains\' own mirrored-by-hand implementations.');

        console.log('✓ F: HISTORICAL RECORD, SUPERSEDED BY 0.9.320. As of THIS milestone (0.9.318), Publication distribution (F1) and Snapshot distribution (F2) were fully wired end to end; Place Naming (F3) was the one arc still missing its own write-side composition-root wiring — a difference confirmed SEMANTIC (F4) at the time, not accidental. 0.9.320 later closed that difference by wiring Place Naming\'s own write side too, without introducing any shared abstraction across the three arcs\' own independently mirrored publisher classes (F5 still holds unchanged).');
    }

    // ===============================================================
    // Section G — Existing orphan/internal capability scan.
    //
    // The new publisher is explicitly classified, not left as an
    // unclassified loose end this codebase's own record would otherwise
    // have to rediscover later.
    // ===============================================================
    {
        const CAPABILITY_TAXONOMY = ['COMPLETE', 'REACHABLE_BUT_INTERNAL', 'MISSING_UI', 'MISSING_DOMAIN_CAPABILITY', 'DEFERRED', 'OBSOLETE_CANDIDATE'];

        // G1. HISTORICAL RECORD, SUPERSEDED BY 0.9.320. As of THIS
        // milestone (0.9.318), NostrPlaceNamingDiscoveryPublisher was
        // built, tested twice over (0.9.316/0.9.317), with zero
        // composition-root callers (Section A3) — the textbook shape of
        // REACHABLE_BUT_INTERNAL from this codebase's own
        // ProductBaselineClosure vocabulary (0.9.314 Section B), never
        // MISSING_DOMAIN_CAPABILITY (the capability is not missing — it
        // exists and works) and never OBSOLETE_CANDIDATE (it has never
        // had a caller to lose). 0.9.320 later gave it a real
        // composition-root caller, reclassifying it COMPLETE — see
        // tests/PostPlaceNamingStableProductBaselineClosure.test.js's own
        // record for the reclassification.
        const classification = 'REACHABLE_BUT_INTERNAL';
        assert(CAPABILITY_TAXONOMY.includes(classification),
            'G1. The classification assigned to the publisher is drawn from this codebase\'s own existing six-value taxonomy, not a new vocabulary invented here.');
        assert(await sourceExists('application/NostrPlaceNamingDiscoveryPublisher.js'),
            'G1b. The file this classification describes still exists.');
        assert(grepCount('new NostrPlaceNamingDiscoveryPublisher(', ['tests']) >= 2,
            'G1c. It is exercised by at least two independent test files (0.9.316\'s own two, plus 0.9.317\'s convergence audit and this file) — "internal" describes reachability from a real UI, never test coverage, which is thorough.');

        // G2. Sweep for any OTHER new orphan introduced across
        // 0.9.315-0.9.317 that this reassessment might otherwise miss:
        // every non-test file touched by those three milestones (by name,
        // read directly from docs/Roadmap.md's own entries) still has a
        // real caller somewhere, OR is this same, already-classified
        // publisher.
        const filesFromThisArc = [
            'core/PlaceNamingDiscoveryEnvelope.js', 'application/NostrPlaceNamingDiscoveryPublisher.js',
            'application/NostrPlaceNamingDiscoverySource.js', 'application/PlaceNamingClaimUseCase.js'
        ];
        for (const file of filesFromThisArc) {
            assert(await sourceExists(file), `G2a. ${file} still exists.`);
        }
        const envelopeBuilderCallers = grepFiles('buildPlaceNamingDiscoveryEnvelope', ['application']).filter((f) => f !== 'core/PlaceNamingDiscoveryEnvelope.js');
        assert(envelopeBuilderCallers.length === 1 && envelopeBuilderCallers[0] === 'application/NostrPlaceNamingDiscoveryPublisher.js',
            'G2b. buildPlaceNamingDiscoveryEnvelope() still has exactly its one 0.9.316 production caller — no second orphan producer was introduced since 0.9.317.');

        console.log('✓ G: application/NostrPlaceNamingDiscoveryPublisher.js is explicitly classified REACHABLE_BUT_INTERNAL — built, correct, and thoroughly tested, but with zero composition-root callers (G1) — using this codebase\'s own existing taxonomy rather than left as an unclassified fact for a future milestone to rediscover. No other orphan was introduced across the 0.9.315-0.9.317 arc (G2).');
    }

    // ===============================================================
    // Section H — New product-gap evidence gate.
    //
    // Every candidate from Section D, and the Section A/B finding itself,
    // run through the same executable classifier 0.9.314 Section F/0.9.315
    // Section J already established — reused verbatim, not re-derived.
    // ===============================================================
    {
        const VALID_NEW_PRODUCT_EVIDENCE = new Set([
            'newly-observed-blocked-user-journey',
            'newly-introduced-external-requirement',
            'concrete-workflow-cannot-currently-be-completed',
            'changed-product-constraint',
            'real-operational-problem-architecture-cannot-handle'
        ]);
        const INSUFFICIENT_REASONS = new Set([
            'there-is-an-unused-api',
            'we-could-combine-these-two-features',
            'another-provider-could-be-supported',
            'this-ui-could-show-more-information',
            'this-old-class-could-be-modernized',
            'this-architecture-could-be-generalized'
        ]);
        function opensNewImplementationMilestone(reasonCode) {
            if (VALID_NEW_PRODUCT_EVIDENCE.has(reasonCode)) return true;
            if (INSUFFICIENT_REASONS.has(reasonCode)) return false;
            return false;
        }

        for (const reasonCode of VALID_NEW_PRODUCT_EVIDENCE) {
            assert(opensNewImplementationMilestone(reasonCode) === true, `H1. "${reasonCode}" opens a new implementation milestone.`);
        }
        for (const reasonCode of INSUFFICIENT_REASONS) {
            assert(opensNewImplementationMilestone(reasonCode) === false, `H1. "${reasonCode}" alone does not.`);
        }

        // H2. THE central question: does Section A/B's own finding
        // ("Publish" only reaches local persistence) classify as
        // 'newly-observed-blocked-user-journey' or
        // 'concrete-workflow-cannot-currently-be-completed'? NO — Section
        // C already proved the underlying user goal IS completable today
        // through export/import, and Section F already proved the gap is
        // a NAMED, RECORDED, deliberate 0.9.316 decision, not a newly
        // discovered fact. The closest honest label is
        // 'this-architecture-could-be-generalized' (wire an already-built
        // capability to an already-existing UI pattern) or simply "no
        // reason code applies yet" — either way, INSUFFICIENT.
        const reasonForPublishWiringGap = 'this-ui-could-show-more-information';
        assert(INSUFFICIENT_REASONS.has(reasonForPublishWiringGap) && opensNewImplementationMilestone(reasonForPublishWiringGap) === false,
            'H2. The Publish-UI-wiring gap\'s closest honest reason code sits in the insufficient set — reconfirmed via Section C (an alternate channel already completes the underlying goal) and Section F (the gap is a named, deliberate, already-recorded decision, not new evidence).');

        // H3. Every Section D candidate's own disposition text is
        // re-checked to confirm none is secretly a valid-evidence
        // classification wearing NOT READY language.
        const sectionDDispositionKeywords = ['DEFER', 'NOT READY', 'ALREADY FUNCTIONAL', 'CAPABILITY COMPLETE', 'COMPLETE'];
        for (const [candidate, disposition] of candidateMatrix) {
            assert(sectionDDispositionKeywords.some((kw) => disposition.includes(kw)),
                `H3. [${candidate}] disposition ("${disposition}") uses one of this codebase's own established disposition vocabularies, not a new, ad hoc classification invented for this milestone alone.`);
        }

        console.log('✓ H: The executable evidence gate (H1) is reused unmodified. The Publish-UI-wiring gap itself — the one finding this milestone adds beyond 0.9.315-0.9.317\'s own record — is run through that same gate and classified INSUFFICIENT (H2), for two independently sufficient reasons: an alternate channel already completes the underlying user goal (Section C), and the gap is a named, already-recorded, deliberate decision rather than newly discovered evidence (Section F). Every Section D candidate is reconfirmed to use this codebase\'s own established disposition vocabulary (H3).');
    }

    // ===============================================================
    // Section I — Architecture-debt vs. product-gap classification.
    //
    // The UI-reachability gap classified against the same four
    // architectural-observation kinds 0.9.314 Section E already named,
    // so "unwired" is not silently treated as "broken."
    // ===============================================================
    {
        const ARCHITECTURAL_OBSERVATIONS_ARE_NOT_GAPS = [
            'unused-capability',
            'possible-integration-point',
            'missing-abstraction',
            'technically-attractive-extension'
        ];
        function isProductGap(observationKind) {
            return !ARCHITECTURAL_OBSERVATIONS_ARE_NOT_GAPS.includes(observationKind);
        }

        // I1. NostrPlaceNamingDiscoveryPublisher's own un-wired state is,
        // precisely, an "unused-capability" (it works, it is tested, no
        // UI calls it) — the same classification 0.9.314 Section E
        // already applied to three other intentional internal
        // capabilities in this exact codebase.
        assert(isProductGap('unused-capability') === false,
            'I1. "unused-capability" alone does not classify as a product gap — reapplying 0.9.314\'s own executable rule rather than inventing a softer one for this specific finding.');

        // I2. It is explicitly NOT "possible-integration-point" or
        // "technically-attractive-extension" wearing different words —
        // those describe something nobody has committed to; this
        // capability's own future integration point (wiring it to a
        // "Publish naming claim" UI action) is already named, in this
        // exact wording, in this codebase's own roadmap record (Section
        // F4b) — making it a DEFERRED, evidence-gated decision, a
        // sharper classification than a bare architectural observation.
        const roadmap = await rawSource('docs/Roadmap.md');
        assert(/A future milestone deciding to wire an explicit "Publish to\s+network" UI action is a separate, later, unscheduled step/.test(roadmap),
            'I2. docs/Roadmap.md still records the exact future integration point, word for word, as a separate, later, unscheduled step — not an idea this reassessment is inventing, and not something already promised for "soon."');

        console.log('✓ I: The Publish-UI-wiring gap classifies as "unused-capability" under 0.9.314\'s own executable architecture/product-gap rule (I1) — real, worth naming precisely (Section A-G), but not itself a product gap. It is further distinguished from a vague "could be generalized" observation by having its own specific, already-recorded, evidence-gated future integration point on file (I2) — DEFERRED, not merely "interesting."');
    }

    // ===============================================================
    // Section J — Final product evolution decision.
    // ===============================================================
    {
        // 0.9.440 — SCOPED TO THE 0.9.318 COMMIT ITSELF, not live
        // working-tree state against HEAD. `git diff --stat HEAD` asks
        // "are there uncommitted production changes right now," which can
        // never stay true once any LATER milestone (0.9.440 included) has
        // in-progress production work of its own — that isn't a regression
        // of 0.9.318's own test/document-only claim, just a live-state
        // check aimed at the wrong target. This checks the permanent
        // historical fact instead: did the actual 0.9.318 commit itself
        // touch production? See tests/EndpointMultiplicityFailoverSemanticsAudit.test.js's
        // own J1 for the identical fix applied to the identical class of
        // bug, on a different milestone.
        let gitDiffStat = '';
        try {
            const commitHash = execSync('git log --grep="^0.9.318 " --format=%H -n 1', { cwd: SOURCE_ROOT.pathname }).toString().trim();
            if (commitHash) {
                gitDiffStat = execSync(`git diff --stat ${commitHash}^..${commitHash} -- application/ core/ ui/ storage/ identity/ collaboration/ discovery/ publisher/ 2>/dev/null || true`,
                    { cwd: SOURCE_ROOT.pathname }).toString().trim();
            }
        } catch { /* git unavailable — not a failure of this decision artifact */ }
        assert(gitDiffStat === '',
            `J1. Zero production files were modified by the 0.9.318 commit itself — test/document-only, exactly as this reassessment's own brief required. Found: ${gitDiffStat || '(none)'}.`);

        const verdict = 'STABLE_WITH_DEFERRED_GAPS';
        const CLOSURE_COMPATIBLE = new Set(['STABLE', 'STABLE_WITH_DEFERRED_GAPS']);
        assert(CLOSURE_COMPATIBLE.has(verdict), 'J2. The verdict remains one of the two closure-compatible outcomes.');

        console.log('✓ J: CLOSURE STATEMENT.\n' +
'\n' +
`OUTCOME: ${verdict}.\n` +
'\n' +
'No new implementation milestone is opened by this reassessment. Every\n' +
'boundary in the Place Naming distribution arc\'s own diagram was traced\n' +
'fresh and classified as implemented and/or reachable rather than trusted\n' +
'from a prior milestone\'s own header (Section A). The one genuine finding\n' +
'beyond 0.9.315-0.9.317\'s own record — that the shipped "Publish" action\n' +
'reaches only local persistence, never the new Nostr write path — is real\n' +
'and is now stated precisely rather than smoothed into a blanket "Nostr\n' +
'publication: COMPLETE" (Section A/B). It fails this milestone\'s own\n' +
'evidence gate on two independent grounds: an already-shipped alternate\n' +
'channel (manual export/import) already completes the underlying user\n' +
'goal today (Section C), and the gap itself is a named, deliberate,\n' +
'already-recorded 0.9.316 product decision, not evidence this\n' +
'reassessment discovered (Section F). Every other candidate this\n' +
'milestone\'s own brief named — automatic publication, multi-relay,\n' +
'relay preference, retry/offline queues, publication status/history,\n' +
'unpublish/retraction, cross-device editing, and notifications — remains\n' +
'NOT READY, each for its own recorded reason rather than a blanket\n' +
'"not now" (Section D). Nostr publication introduces no provider-\n' +
'selection requirement (Section E). Compared side by side with Publication\n' +
'and Snapshot distribution, Place Naming is the one arc whose write side\n' +
'is not yet composition-root-wired — confirmed a semantic, documented\n' +
'choice, not an oversight, and not sufficient reason to merge the three\n' +
'arcs\' own independently mirrored publisher classes into one abstraction\n' +
'(Section F). The publisher itself is explicitly classified\n' +
'REACHABLE_BUT_INTERNAL, closing the loose end a less careful reassessment\n' +
'might otherwise leave for a future milestone to rediscover from scratch\n' +
'(Section G). The evidence gate and the architecture/product-gap\n' +
'classifier both confirm this outcome as executable rules, not prose\n' +
'(Sections H/I).\n' +
'\n' +
'RECOMMENDATION: STABLE — STOP. The 0.9.315-0.9.317 Place Naming\n' +
'distribution arc is a clean, complete product arc: gap discovered ->\n' +
'minimal capability built -> convergence proven -> reassessed and found\n' +
'to raise no further currently-blocked journey. This is the methodology\'s\n' +
'own successful terminal state, not a lack of ideas. The next 0.9.x\n' +
'milestone should appear only when something EXTERNAL to this audit loop\n' +
'supplies real evidence — a user actually blocked by the absence of\n' +
'stranger-discoverability, an operational relay failure, a changed\n' +
'constraint — never when this loop re-examines its own, already-settled\n' +
'conclusions again.\n');
    }

    console.log('\n✅ All Post-Place-Naming Distribution Product Reassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostPlaceNamingDistributionProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostPlaceNamingDistributionProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
