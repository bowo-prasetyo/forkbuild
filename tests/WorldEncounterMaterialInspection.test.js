import { readFile } from 'node:fs/promises';
import {
    inspectWorldEncounterMaterial
} from '../application/WorldEncounterMaterialInspection.js';
import { WorldEncounterMaterialLoadStatus, WorldEncounterMaterialSource } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterMaterialVerificationStatus, WorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerification.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';

// 0.9.39 — World Encounter Material Inspection Orchestration.
// See docs/Roadmap.md, "0.9.39 — World Encounter Material Inspection
// Orchestration & UI Integration."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function selectionOf({ kind = WorldEncounterKind.PUBLICATION, objectId = 'P1', origin = LOCAL_WORLD_DISCOVERY_ORIGIN } = {}) {
    return Object.freeze({ kind, objectId, origin });
}

function leadOf({ uri = 'ar://tx-abc', origin = 'nostr:wss://relay.example', discoveryTag = 'forkbuild_tag', storage = 'ar' } = {}) {
    return Object.freeze({ origin, discoveryTag, uri, storage });
}

class FakeSource extends WorldEncounterMaterialSource {
    constructor(material) {
        super();
        this.material = material;
        this.calls = [];
    }

    async load(resolvedSelection, resolvedLead) {
        this.calls.push({ resolvedSelection, resolvedLead });
        return typeof this.material === 'function' ? this.material(resolvedSelection, resolvedLead) : this.material;
    }
}

class ThrowingSource extends WorldEncounterMaterialSource {
    async load() {
        throw new Error('ThrowingSource should never be called for this routing decision');
    }
}

class FakeVerifier extends WorldEncounterMaterialVerifier {
    constructor(outcome) {
        super();
        this.outcome = outcome;
        this.calls = [];
    }

    async verifyIdentity(resolvedSelection, material, resolvedLead) {
        this.calls.push({ resolvedSelection, material, resolvedLead });
        return typeof this.outcome === 'function' ? this.outcome(resolvedSelection, material, resolvedLead) : this.outcome;
    }
}

async function run() {
    // ---------------------------------------------------------------------
    // 1. Flagship: a local-origin resolved selection, no lead, a registered
    //    local source, and a confirming verifier — AVAILABLE + VERIFIED,
    //    with every input forwarded verbatim through both nested results.
    // ---------------------------------------------------------------------
    {
        const resolvedSelection = selectionOf({ objectId: 'P1', origin: LOCAL_WORLD_DISCOVERY_ORIGIN });
        const material = Object.freeze({ id: 'P1', title: 'A Local Publication' });
        const localSource = new FakeSource(material);
        const verifier = new FakeVerifier(true);

        const result = await inspectWorldEncounterMaterial({
            resolvedSelection,
            materialSources: { local: localSource },
            verifier
        });

        assert(Object.isFrozen(result), '1. FLAGSHIP — the returned envelope is frozen');
        assert(result.selection === resolvedSelection, '2. FLAGSHIP — selection is the caller\'s own resolvedSelection, by reference');
        assert(result.lead === null, '3. FLAGSHIP — lead is null when none was supplied');
        assert(result.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '4. FLAGSHIP — loading resolves AVAILABLE via the local source');
        assert(result.loading.material === material, '5. FLAGSHIP — loading.material is the source\'s own material, by reference');
        assert(result.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '6. FLAGSHIP — verification resolves VERIFIED');
        assert(localSource.calls.length === 1 && localSource.calls[0].resolvedSelection === resolvedSelection, '7. FLAGSHIP — the local source is asked exactly once, with the real selection');
        assert(verifier.calls.length === 1 && verifier.calls[0].material === material, '8. FLAGSHIP — the verifier is asked exactly once, with the loaded material');

        console.log('✓ Flagship: a resolved local selection loads material and verifies it, end to end');
    }

    // ---------------------------------------------------------------------
    // 2. No resolvedLead supplied routes through the plain (origin-routed)
    //    loading boundary — a decentralized source is never even touched.
    // ---------------------------------------------------------------------
    {
        const resolvedSelection = selectionOf({ origin: LOCAL_WORLD_DISCOVERY_ORIGIN });
        const localSource = new FakeSource({ id: 'P1' });
        const decentralizedSource = new ThrowingSource();

        const result = await inspectWorldEncounterMaterial({
            resolvedSelection,
            materialSources: { local: localSource, decentralized: decentralizedSource },
            verifier: new FakeVerifier(true)
        });

        assert(result.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '9. no lead — the plain loading boundary is used and succeeds via materialSources.local');
        assert(localSource.calls.length === 1, '10. no lead — the local source is the one actually called');

        console.log('✓ Omitting resolvedLead routes through the origin-routed loading boundary alone');
    }

    // ---------------------------------------------------------------------
    // 3. A supplied resolvedLead routes through the lead-aware loading
    //    boundary — local/peer sources are never even touched.
    // ---------------------------------------------------------------------
    {
        const resolvedSelection = selectionOf({ origin: 'decentralized:nostr' });
        const resolvedLead = leadOf({ uri: 'ar://tx-xyz' });
        const decentralizedSource = new FakeSource({ id: 'P1' });
        const localSource = new ThrowingSource();
        const peerSource = new ThrowingSource();

        const result = await inspectWorldEncounterMaterial({
            resolvedSelection,
            resolvedLead,
            materialSources: { local: localSource, peer: peerSource, decentralized: decentralizedSource },
            verifier: new FakeVerifier(true)
        });

        assert(result.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '11. a supplied resolvedLead — the lead-aware loading boundary is used and succeeds via materialSources.decentralized');
        assert(decentralizedSource.calls.length === 1 && decentralizedSource.calls[0].resolvedLead === resolvedLead, '12. the decentralized source alone is called, with the real resolvedLead');
        assert(result.lead === resolvedLead, '13. lead is the caller\'s own resolvedLead, by reference');
        assert(result.loading.resolvedLead === resolvedLead, '14. the nested loading result also carries the real resolvedLead, by reference (0.9.34\'s own contract)');
        assert(result.verification.resolvedLead === resolvedLead, '15. the nested verification result also carries the real resolvedLead, by reference (0.9.37\'s own contract)');

        console.log('✓ A supplied resolvedLead routes through the lead-aware loading boundary alone');
    }

    // ---------------------------------------------------------------------
    // 4. Material that cannot be loaded (no source registered) verifies as
    //    UNVERIFIABLE, automatically — never REJECTED, and the injected
    //    verifier is never even called.
    // ---------------------------------------------------------------------
    {
        const resolvedSelection = selectionOf();
        const verifier = new FakeVerifier(true);

        const result = await inspectWorldEncounterMaterial({
            resolvedSelection,
            materialSources: {},
            verifier
        });

        assert(result.loading.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, '16. no registered source — loading is UNAVAILABLE');
        assert(result.verification.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE, '17. UNAVAILABLE material verifies as UNVERIFIABLE, never REJECTED');
        assert(verifier.calls.length === 0, '18. an injected verifier is never consulted when there is no material to judge');

        console.log('✓ Unavailable material verifies as UNVERIFIABLE without ever consulting the injected verifier');
    }

    // ---------------------------------------------------------------------
    // 5. A verifier actively contradicting identity correspondence surfaces
    //    as REJECTED, distinct from UNVERIFIABLE.
    // ---------------------------------------------------------------------
    {
        const resolvedSelection = selectionOf({ objectId: 'P1' });
        const material = Object.freeze({ id: 'P999' });
        const result = await inspectWorldEncounterMaterial({
            resolvedSelection,
            materialSources: { local: new FakeSource(material) },
            verifier: new FakeVerifier(false)
        });

        assert(result.loading.status === WorldEncounterMaterialLoadStatus.AVAILABLE, '19. material still loads successfully');
        assert(result.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED, '20. a verifier actively contradicting identity resolves REJECTED');

        console.log('✓ Loaded material a verifier actively rejects surfaces as REJECTED');
    }

    // ---------------------------------------------------------------------
    // 6. A missing/malformed resolvedSelection degrades gracefully through
    //    both nested boundaries — never throws.
    // ---------------------------------------------------------------------
    {
        for (const resolvedSelection of [undefined, null, {}, { kind: 'PUBLICATION' }]) {
            const result = await inspectWorldEncounterMaterial({
                resolvedSelection,
                materialSources: { local: new FakeSource({ id: 'P1' }) },
                verifier: new FakeVerifier(true)
            });
            assert(result.loading.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE, `21. a malformed resolvedSelection ${serialize(resolvedSelection)} degrades loading to UNAVAILABLE, never throws`);
            assert(result.verification.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE, `22. a malformed resolvedSelection ${serialize(resolvedSelection)} degrades verification to UNVERIFIABLE, never throws`);
            assert(result.selection === (resolvedSelection || null), `23. selection mirrors exactly the malformed input supplied (or null when omitted) for ${serialize(resolvedSelection)}`);
        }

        console.log('✓ A missing or malformed resolvedSelection degrades both loading and verification gracefully, never throws');
    }

    // ---------------------------------------------------------------------
    // 7. Zero arguments never throws.
    // ---------------------------------------------------------------------
    {
        const result = await inspectWorldEncounterMaterial();
        assert(result.selection === null && result.lead === null, '24. calling with no arguments at all degrades to a fully-null envelope, never throws');
        assert(result.loading.status === WorldEncounterMaterialLoadStatus.UNAVAILABLE && result.verification.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE, '25. zero-argument loading/verification both degrade to their own "nothing to report" status');

        console.log('✓ Calling with zero arguments degrades gracefully, never throws');
    }

    // ---------------------------------------------------------------------
    // 8. A genuine rejection from the loading boundary's own source
    //    propagates unchanged — the verification boundary is never reached.
    // ---------------------------------------------------------------------
    {
        const resolvedSelection = selectionOf();
        const verifier = new FakeVerifier(true);
        let threw = false;
        try {
            await inspectWorldEncounterMaterial({
                resolvedSelection,
                materialSources: { local: new ThrowingSource() },
                verifier
            });
        } catch (error) {
            threw = true;
            assert(error.message.includes('ThrowingSource'), '26. the genuine rejection propagates unchanged, never swallowed or translated');
        }
        assert(threw, '27. a rejected load() propagates to this function\'s own caller');
        assert(verifier.calls.length === 0, '28. verification is never attempted once loading itself has thrown');

        console.log('✓ A genuine loading rejection propagates unchanged; verification is never reached');
    }

    // ---------------------------------------------------------------------
    // 9. A genuine rejection from the verifier itself propagates unchanged.
    // ---------------------------------------------------------------------
    {
        const resolvedSelection = selectionOf();
        class ThrowingVerifier extends WorldEncounterMaterialVerifier {
            async verifyIdentity() {
                throw new Error('ThrowingVerifier deliberately fails');
            }
        }

        let threw = false;
        try {
            await inspectWorldEncounterMaterial({
                resolvedSelection,
                materialSources: { local: new FakeSource({ id: 'P1' }) },
                verifier: new ThrowingVerifier()
            });
        } catch (error) {
            threw = true;
            assert(error.message.includes('ThrowingVerifier'), '29. a genuine verifier rejection propagates unchanged');
        }
        assert(threw, '30. a rejected verifyIdentity() propagates to this function\'s own caller');

        console.log('✓ A genuine verification rejection propagates unchanged');
    }

    // ---------------------------------------------------------------------
    // 10. No caching, no retry — two separate calls each invoke the source
    //     and the verifier exactly once more; nothing is memoized.
    // ---------------------------------------------------------------------
    {
        const resolvedSelection = selectionOf();
        const localSource = new FakeSource({ id: 'P1' });
        const verifier = new FakeVerifier(true);

        await inspectWorldEncounterMaterial({ resolvedSelection, materialSources: { local: localSource }, verifier });
        await inspectWorldEncounterMaterial({ resolvedSelection, materialSources: { local: localSource }, verifier });

        assert(localSource.calls.length === 2, '31. no caching — the source is asked fresh on every call');
        assert(verifier.calls.length === 2, '32. no caching — the verifier is asked fresh on every call');

        console.log('✓ No caching or memoization: repeated calls each hit the source and verifier fresh');
    }

    // ---------------------------------------------------------------------
    // 11. Determinism — byte-identical inputs produce byte-identical
    //     (non-reference) results.
    // ---------------------------------------------------------------------
    {
        const resolvedSelection = selectionOf();
        const material = Object.freeze({ id: 'P1' });
        const materialSources = { local: new FakeSource(material) };
        const verifier = new FakeVerifier(true);

        const first = await inspectWorldEncounterMaterial({ resolvedSelection, materialSources, verifier });
        const second = await inspectWorldEncounterMaterial({ resolvedSelection, materialSources, verifier });

        assert(serialize(first) === serialize(second), '33. byte-identical inputs produce byte-identical results across separate calls');

        console.log('✓ Deterministic across repeated calls with identical inputs');
    }

    // ---------------------------------------------------------------------
    // 12. Architectural regression — this file names exactly the three
    //     boundaries it orchestrates, never a fourth loader, never a second
    //     verifier, never `core/WorldEncounter.js`, never selection
    //     resolution, and no rank/trust/score vocabulary.
    // ---------------------------------------------------------------------
    {
        const source = await readFile(new URL('../application/WorldEncounterMaterialInspection.js', import.meta.url), 'utf8');
        const importLines = source.split('\n').filter((line) => line.trim().startsWith('import '));
        const executableCode = source.slice(source.indexOf('export async function'));

        assert(importLines.some((line) => line.includes("from './WorldEncounterMaterialLoading.js'")), '34. imports the 0.9.21 loading boundary');
        assert(importLines.some((line) => line.includes("from './DecentralizedWorldEncounterLeadAwareMaterialLoading.js'")), '35. imports the 0.9.34 lead-aware loading boundary');
        assert(importLines.some((line) => line.includes("from './WorldEncounterMaterialVerification.js'")), '36. imports the 0.9.37 verification boundary');
        assert(importLines.length === 3, '37. exactly three imports — no fourth loader, no concrete verifier, no core/ module');
        assert(!importLines.some((line) => line.includes('core/')), '38. never imports any core/ module — no kind-specific field reads of its own');
        assert(!importLines.some((line) => line.includes('WorldEncounterSelectionOutcome') || line.includes('WorldEncounterSelectionResolution')), '39. never imports selection resolution — this file accepts only an already-resolved selection');
        assert(!/\brank|\btrust|\bscore|\bpreferred/i.test(executableCode), '40. no rank/trust/score/preferred vocabulary in this file\'s own executable code');
        assert(!executableCode.includes('.signature'), '41. never reads a signature field of any kind');

        console.log('✓ Architectural regression: exactly the three intended boundaries, no invented vocabulary or shortcuts');
    }

    console.log('\nAll WorldEncounterMaterialInspection tests passed.');
}

run().catch((error) => {
    console.error('WorldEncounterMaterialInspection.test.js FAILED:', error);
    process.exitCode = 1;
});
