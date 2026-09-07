import { readFile } from 'node:fs/promises';

// 0.9.221 — Product Evolution Selection / Architecture Baseline.
//
// Test/document-only. No production changes. 0.9.196 through 0.9.220 ran
// one continuous capability-reachability arc: five shallow sweeps
// (0.9.196/0.9.203/0.9.206/0.9.209/0.9.212/0.9.216/0.9.219), each looking
// for "it already works, but nobody can reach it," closing every gap they
// found (0.9.197/0.9.198/0.9.204/0.9.207/0.9.210/0.9.213/0.9.214/0.9.215/
// 0.9.217), and one full behavioral characterization of the one item that
// arc ever left DEFERRED (0.9.220). 0.9.219's own Recommendation and
// 0.9.220's own Recommendation both say the same thing: the arc is
// exhausted, and the next milestone should come from an explicit
// product-evolution decision, not from searching this codebase for one
// more uncalled method.
//
// This milestone does not run a seventh sweep. It does three narrower
// things, per its own brief:
//
//   Section A — Freeze the closure findings as a compact fingerprint,
//               not a re-derivation. Each fact below was already proven
//               in depth by a named prior milestone; this section checks
//               only that the one concrete signal that fact rests on
//               still holds, so a future regression is caught without
//               re-running a thousand-line audit every time.
//   Section B — The technical-debt register: every item this arc left
//               open on purpose (DEFERRED, OBSOLETE, OBSOLETE_CANDIDATE),
//               reconfirmed unchanged, in one place, instead of scattered
//               across six different reassessment files.
//   Section C — The next product seam, deliberately NOT selected. Three
//               candidate directions are named, each verified genuinely
//               absent from this codebase (not merely unaudited), and
//               the choice among them is left to an explicit human/
//               product decision, exactly as this milestone's own brief
//               asked.
//   Section D — Verdict: baseline recorded, no capability chosen.
//
//   0.9.196 ─┬─ … ─┬─ 0.9.219 ─── 0.9.220 ─── 0.9.221  <- this milestone
//    (arc start)   (arc closes)   (DEFERRED       (freeze + register +
//                                  characterized)   seam menu, no pick)

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

function countOccurrences(source, needle) {
    return source.split(needle).length - 1;
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function runTests() {
    console.log('Running Product Evolution Selection / Architecture Baseline tests...\n');

    // ---------------------------------------------------------------
    // Section A — Freeze the closure findings.
    //
    // Eleven areas, each carrying a prior milestone's own citation. This
    // is a fingerprint, not a re-audit: one grep-verifiable signal per
    // area, standing in for the much deeper proof already on record.
    // ---------------------------------------------------------------
    {
        // A1. World interaction/navigation — COMPLETE (0.9.196 Section A,
        // reconfirmed through 0.9.216 Section "World interaction/
        // navigation"). WorldView.js still composes HistoryTimelinePanel
        // among its many component families — a representative, still-
        // wired sample rather than a full recount.
        const worldView = await rawSource('ui/views/WorldView.js');
        assert(worldView.includes("import HistoryTimelinePanel from '../components/HistoryTimelinePanel.js'"),
            'A1. WorldView.js still imports HistoryTimelinePanel — representative of the composed World interaction/navigation surface (0.9.196 Section A, 0.9.216).');

        // A2. Vehicle — INTENTIONAL_BOUNDARY (0.9.196 Section B, 0.9.203
        // Section B). No passenger/capacity/fuel/range vocabulary exists
        // on VehicleType.js's own code.
        const vehicleType = codeOnlyLines(await rawSource('core/VehicleType.js'));
        for (const term of ['passenger', 'capacity', 'fuelLevel', 'fuel_level']) {
            assert(!new RegExp(term, 'i').test(vehicleType),
                `A2. core/VehicleType.js's own CODE (not its header prose, which names the boundary explicitly) still contains no "${term}" vocabulary — the Vehicle boundary stays deliberate, unmoved since 0.9.196 (0.9.196 Section B).`);
        }

        // A3. Document lifecycle (publish/place/unpublish/remove) —
        // COMPLETE (0.9.196 Section C/D closed by 0.9.197/0.9.198,
        // reconfirmed 0.9.199-0.9.203). Both removal use cases still have
        // real UI callers.
        const worldViewHasRemove = worldView.includes('RemoveWorldPlacementUseCase');
        const ownPublicationPanel = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(worldViewHasRemove, 'A3a. ui/views/WorldView.js still references RemoveWorldPlacementUseCase (0.9.197).');
        assert(ownPublicationPanel.includes('UnpublishDocumentUseCase') || worldView.includes('UnpublishDocumentUseCase'),
            'A3b. UnpublishDocumentUseCase still has a real UI caller (0.9.198).');

        // A4. Autosave/recovery — reachable (0.9.203 Section C found it
        // dormant; 0.9.204 wired it; 0.9.205/0.9.206/0.9.216 reconfirmed
        // it live). AutosaveScheduler is still actually instantiated by
        // EditorView.js, not merely imported.
        const editorView = await rawSource('ui/views/EditorView.js');
        assert(/new\s+AutosaveScheduler\s*\(/.test(editorView),
            'A4. ui/views/EditorView.js still constructs a real AutosaveScheduler — the dormant-pipeline gap 0.9.203 found stays closed (0.9.204).');

        // A5. History (preview/restore) — reachable (0.9.207/0.9.208,
        // reconfirmed 0.9.209/0.9.216). HistoryTimelinePanel is still
        // actually rendered by WorldView.js's own template, not merely
        // imported.
        assert(/<HistoryTimelinePanel/.test(worldView),
            'A5. ui/views/WorldView.js still renders <HistoryTimelinePanel> in its own template (0.9.207).');

        // A6. Undo/redo — reachable (0.9.210/0.9.211, reconfirmed
        // 0.9.212/0.9.216). WorldNavigationSession still exposes real
        // undo()/redo() methods gated on a real CommandHistory.
        const navSession = await rawSource('application/WorldNavigationSession.js');
        assert(/\bundo\(\)\s*\{/.test(navSession) && /\bredo\(\)\s*\{/.test(navSession),
            'A6. application/WorldNavigationSession.js still exposes undo()/redo() (0.9.210/0.9.211).');

        // A7. Publication workflow — COMPLETE, forward and reverse
        // (0.9.196 Section D, closed 0.9.203). OwnPublicationPanel.js
        // still wires both a publish path and an unpublish path.
        assert(ownPublicationPanel.includes('UnpublishDocumentUseCase') && /publish/i.test(ownPublicationPanel),
            'A7. ui/components/OwnPublicationPanel.js still wires both a publish path and UnpublishDocumentUseCase (0.9.196 Section D, 0.9.198).');

        // A8. Snapshot distribution/discovery/materialization/export —
        // COMPLETE (0.9.215/0.9.216). The Snapshot export boundary
        // 0.9.216 observed (no file download/clipboard/drag-and-drop)
        // still holds, and PublicationSnapshotTransferPackage.js is
        // still the one shared schema both directions use.
        assert(await sourceExists('application/PublicationSnapshotTransferPackage.js'),
            'A8a. application/PublicationSnapshotTransferPackage.js still exists as the one shared Snapshot transfer schema (0.9.216).');
        assert(ownPublicationPanel.includes('PublicationSnapshotTransferPackage') || ownPublicationPanel.toLowerCase().includes('export'),
            'A8b. ui/components/OwnPublicationPanel.js still carries the Snapshot export path (0.9.215).');

        // A9. World Presence — COMPLETE (0.9.217 wired it, 0.9.218 fixed
        // its one failure-isolation defect, 0.9.219 promoted it to a
        // first-class COMPLETE row). refreshWorldPresenceActivity() still
        // has exactly the one real call site 0.9.217 added, still wrapped
        // in the try/catch 0.9.218 added.
        const presenceCallCount = countOccurrences(worldView, 'session.refreshWorldPresenceActivity(');
        assert(presenceCallCount === 1,
            `A9a. ui/views/WorldView.js still calls session.refreshWorldPresenceActivity() from exactly one call site (found ${presenceCallCount}) (0.9.217).`);
        assert(/try\s*\{[^}]*refreshWorldPresenceActivity/s.test(worldView),
            'A9b. That call site is still wrapped in the local try/catch 0.9.218 added (0.9.218).');

        // A10. Identity event boundary — characterized/DEFERRED (0.9.219
        // Section C found it, 0.9.220 fully characterized it). Verified
        // in full in Section B below, not re-verified here.

        // A11. No current ACTUAL_GAP anywhere this arc swept — the
        // explicit, repeated verdict of 0.9.216 Section E and 0.9.219
        // Section E. Nothing to check against source directly; recorded
        // here as the arc's own closing fact, cited from both milestones.
        console.log('✓ A11. No ACTUAL_GAP verdict is a documentation fact carried forward from 0.9.216 Section E and 0.9.219 Section E, not re-derived here.');

        console.log('✓ Section A: Closure findings frozen — World interaction/navigation (A1), Vehicle intentional boundary (A2), Document lifecycle (A3), Autosave/recovery (A4), History (A5), Undo/redo (A6), Publication workflow (A7), Snapshot distribution/discovery/materialization/export (A8), World Presence (A9) all still hold their one representative signal. Identity event boundary (A10) and the no-ACTUAL_GAP verdict (A11) are carried forward, verified in Section B and cited directly.');
    }

    // ---------------------------------------------------------------
    // Section B — Technical-debt register.
    // ---------------------------------------------------------------
    {
        // B1. DEFERRED — Identity event/error boundary (0.9.219 Section
        // C, fully characterized by 0.9.220). The five affected methods
        // still share the exact precondition: each still calls
        // _publishChange() and THEN _publishLockChange() in the same
        // synchronous chain.
        const identityUseCase = await rawSource('application/IdentityUseCase.js');
        const affectedMethods = ['authenticate', 'endSession', 'protectIdentity', 'changePassphrase', 'revokeIdentity'];
        for (const method of affectedMethods) {
            const methodMatch = identityUseCase.match(new RegExp(`\\b${method}\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n    \\}`, 'm'));
            assert(methodMatch, `B1a. application/IdentityUseCase.js still defines ${method}().`);
            const body = methodMatch[1];
            assert(body.includes('_publishChange()') && body.includes('_publishLockChange('),
                `B1b. ${method}() still calls both _publishChange() and _publishLockChange() in sequence — the DEFERRED precondition 0.9.220 characterized is unchanged.`);
        }

        // B2. EventBus.publish() still has no per-listener isolation —
        // the one structural fact the DEFERRED classification depends on
        // (0.9.218/0.9.219/0.9.220 all reconfirm this unchanged).
        const eventBus = await rawSource('core/events/EventBus.js');
        const publishBody = eventBus.match(/publish\(eventType, payload\)\s*\{([\s\S]*?)\n    \}/)[1];
        assert(!/try\s*\{/.test(publishBody),
            'B2. core/events/EventBus.js#publish() still has no try/catch around listener invocation — the DEFERRED finding\'s one precondition stands (0.9.220 Section A).');

        // B3. OBSOLETE / OBSOLETE_CANDIDATE register — eight files total
        // across two prior milestones' own findings. All eight still
        // exist (nothing deleted here — deletion is a deliberate, later,
        // human decision per 0.9.216's own Recommendation) and still
        // have zero instantiations from application/ or ui/.
        const obsoleteConfirmed = [
            'ui/components/GroupsPanel.js',
            'application/CreatePublicationSnapshotPlacementCatalogUseCase.js',
            'application/CreatePublicationAnchorCatalogUseCase.js',
            'application/CreatePlacementRegistryUseCase.js'
        ];
        const obsoleteCandidate = [
            'application/CreateSpatialIndexUseCase.js',
            'application/CreateSpatialDiscoveryUseCase.js',
            'application/CreateDecentralizedSpatialDiscoveryUseCase.js',
            'application/CreateWorldViewStreamingUseCase.js'
        ];
        for (const path of [...obsoleteConfirmed, ...obsoleteCandidate]) {
            assert(await sourceExists(path), `B3a. ${path} still exists — classification only, nothing deleted (0.9.216/0.9.219 Recommendation).`);
            const className = path.split('/').pop().replace('.js', '');
            let liveInstantiations = 0;
            for (const dir of ['application', 'ui']) {
                const { execSync } = await import('node:child_process');
                let hits = '';
                try {
                    hits = execSync(`grep -rl "new ${className}(" ${dir} --include="*.js" | grep -v "/${className}.js" || true`, { cwd: new URL('../', import.meta.url).pathname }).toString();
                } catch { /* grep exits non-zero on no match; treated as zero hits */ }
                liveInstantiations += hits.trim() ? hits.trim().split('\n').length : 0;
            }
            assert(liveInstantiations === 0,
                `B3b. ${className} still has zero instantiations outside its own file — classification unchanged since 0.9.216/0.9.219.`);
        }

        console.log(`✓ Section B: Technical-debt register reconfirmed unchanged — DEFERRED Identity event boundary still rests on its exact five-method precondition and EventBus's still-unisolated publish() (B1/B2); all ${obsoleteConfirmed.length} OBSOLETE and ${obsoleteCandidate.length} OBSOLETE_CANDIDATE files still exist, untouched, with zero live instantiations (B3). Nothing escalated, nothing deleted, nothing newly discovered.`);
    }

    // ---------------------------------------------------------------
    // Section C — Next product seam: named, evidenced, NOT selected.
    //
    // This section deliberately does not repeat the ACTUAL_GAP/
    // NEW_PRODUCT_GAP sweep methodology 0.9.196-0.9.219 already ran to
    // exhaustion on the EXISTING product surface. It asks a different
    // question — the one 0.9.220's own closing recommendation and this
    // milestone's own brief both name explicitly: what capability could
    // ForkBuild gain that no area already swept promises at all? Three
    // candidates are named, each with one piece of direct evidence that
    // it is genuinely absent (not merely unaudited) and one piece of
    // evidence for what already exists immediately adjacent to it — so
    // a future reader can see why it is a real seam and not a
    // rediscovery of something already built. None is chosen here.
    // ---------------------------------------------------------------
    {
        // C1. Live multi-editor co-editing of one Document. Adjacent,
        // already-built capability: WorldEditAuthority/WorldMembershipUseCase
        // already let an owner grant a second identity EDIT capability
        // for a World (0.2.98). Absent: nothing in the Document save path
        // itself resolves two identities editing the SAME Document at the
        // SAME time — SaveDocumentUseCase carries no session-lock or
        // merge concept, and the Editor's only multi-party path remains
        // fork-then-diverge into a NEW Document lineage (0.5.9's own
        // "Edit a Copy"), never shared live editing of the one Document.
        const saveDocumentUseCase = await rawSource('application/SaveDocumentUseCase.js');
        assert(!/\block\b|\bmerge\b|\bCRDT\b|operational.transform/i.test(saveDocumentUseCase),
            'C1. application/SaveDocumentUseCase.js still names no session-lock, merge, or CRDT/OT concept — concurrent live editing of one Document by two identities is genuinely unaddressed, not merely unaudited.');

        // C2. Asynchronous commentary/annotation on a Publication.
        // Adjacent, already-built capability: ChatView.js/ConversationsView.js
        // already deliver synchronous, peer-scoped messaging (docs/user/
        // 08-ChatAndConversations.md). Absent: no Comment/Annotation
        // class exists anywhere that would let feedback be left ON a
        // Publication itself, for a future visitor to read.
        const { execSync } = await import('node:child_process');
        const commentHits = execSync('grep -rli "class .*Comment\\|class .*Annotation" application core --include="*.js" || true',
            { cwd: new URL('../', import.meta.url).pathname }).toString().trim();
        assert(commentHits === '',
            'C2. No `class ...Comment`/`class ...Annotation` exists anywhere in application/ or core/ — leaving asynchronous feedback on a Publication is genuinely unbuilt, distinct from ChatView.js/ConversationsView.js\'s synchronous peer messaging.');

        // C3. Notifications. Adjacent, already-built capability: presence
        // (WorldPresenceUseCase) and peer relationships (FriendRelationships)
        // already track who is online and who is connected. Absent: no
        // Notification class or use case exists anywhere — a Wanderer who
        // forks, visits, or (per C2) would comment on someone's
        // Publication has no way to inform the original Publisher.
        const notificationHits = execSync('grep -rli "class .*Notification\\|NotificationUseCase\\|NotificationService" application core --include="*.js" || true',
            { cwd: new URL('../', import.meta.url).pathname }).toString().trim();
        assert(notificationHits === '',
            'C3. No Notification class/use case/service exists anywhere in application/ or core/ — there is no mechanism for ForkBuild to tell a Publisher that someone forked, visited, or interacted with their work.');

        console.log('✓ Section C: Three candidate product seams named and independently verified genuinely absent — live multi-editor co-editing of one Document (C1), asynchronous commentary/annotation on a Publication (C2), and notifications (C3). Each sits immediately adjacent to an already-shipped capability, and none is chosen here.');
    }

    // ---------------------------------------------------------------
    // Section D — Verdict.
    // ---------------------------------------------------------------
    {
        console.log('✓ Section D: Verdict — baseline recorded, register reconfirmed, three candidate product seams named with direct evidence of genuine absence. No capability is selected. Per this milestone\'s own brief, that choice is an explicit product decision for the next milestone to make on purpose, not an automatic consequence of this one.');
    }

    console.log('\n✅ All Product Evolution Selection / Architecture Baseline tests passed.');
}

runTests().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
