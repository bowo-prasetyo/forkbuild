import { readFile } from 'node:fs/promises';
import {
    PublicationMaterialProvenanceOrigin,
    isValidPublicationMaterialProvenanceOrigin,
    describePublicationMaterialProvenance,
    describePublicationMaterialProvenanceFromInspection
} from '../application/PublicationMaterialProvenance.js';

// 0.9.112 — Publication Provenance in World View.
// See docs/Roadmap.md, "0.9.112 — Publication Provenance in World View."
//
//   Section A: a deliberately closed, two-value vocabulary
//   Section B: describePublicationMaterialProvenance() — frozen { origin },
//              null for anything malformed
//   Section C: describePublicationMaterialProvenanceFromInspection() — the
//              one derivation this file exists to provide
//   Section D: no mutation of the underlying inspection/material/Publication
//   Section E: determinism — byte-identical inputs, byte-identical (but
//              non-reference) outputs
//   Section F: architectural regression — no trust/rank vocabulary, no
//              import of any kind

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

async function run() {
    // ---------------------------------------------------------------------
    // A. A deliberately closed, two-value vocabulary.
    // ---------------------------------------------------------------------
    {
        assert(PublicationMaterialProvenanceOrigin.LOCAL === 'LOCAL', '1. LOCAL is exactly "LOCAL"');
        assert(PublicationMaterialProvenanceOrigin.DECENTRALIZED === 'DECENTRALIZED', '2. DECENTRALIZED is exactly "DECENTRALIZED"');
        assert(Object.keys(PublicationMaterialProvenanceOrigin).length === 2, '3. exactly two origin values — deliberately, never more');
        assert(Object.isFrozen(PublicationMaterialProvenanceOrigin), '4. the enum itself is frozen');

        assert(isValidPublicationMaterialProvenanceOrigin('LOCAL'), '5. LOCAL validates');
        assert(isValidPublicationMaterialProvenanceOrigin('DECENTRALIZED'), '6. DECENTRALIZED validates');
        for (const bad of ['local', 'PEER', 'TRUSTED', '', null, undefined, 0, {}]) {
            assert(!isValidPublicationMaterialProvenanceOrigin(bad), `7. ${serialize(bad)} never validates`);
        }

        console.log('✓ Section A: a deliberately closed, two-value origin vocabulary');
    }

    // ---------------------------------------------------------------------
    // B. describePublicationMaterialProvenance() — frozen { origin }, null
    //    for anything malformed.
    // ---------------------------------------------------------------------
    {
        const local = describePublicationMaterialProvenance(PublicationMaterialProvenanceOrigin.LOCAL);
        assert(local && local.origin === 'LOCAL', '8. LOCAL describes to { origin: "LOCAL" }');
        assert(Object.isFrozen(local), '9. the returned fact is frozen');
        assert(Object.keys(local).length === 1, '10. the fact carries exactly one field — origin, nothing else');

        const decentralized = describePublicationMaterialProvenance(PublicationMaterialProvenanceOrigin.DECENTRALIZED);
        assert(decentralized && decentralized.origin === 'DECENTRALIZED', '11. DECENTRALIZED describes to { origin: "DECENTRALIZED" }');

        for (const bad of ['local', 'TRUSTED', '', null, undefined, 42]) {
            assert(describePublicationMaterialProvenance(bad) === null, `12. describePublicationMaterialProvenance(${serialize(bad)}) is null, never throws`);
        }
        assert(describePublicationMaterialProvenance() === null, '13. calling with no argument at all is null, never throws');

        console.log('✓ Section B: describePublicationMaterialProvenance() produces a frozen { origin } fact, or null for anything malformed');
    }

    // ---------------------------------------------------------------------
    // C. describePublicationMaterialProvenanceFromInspection() — the one
    //    derivation this file exists to provide.
    // ---------------------------------------------------------------------
    {
        assert(describePublicationMaterialProvenanceFromInspection(null) === null, '14. no inspection, no provenance — null');
        assert(describePublicationMaterialProvenanceFromInspection(undefined) === null, '15. undefined inspection, no provenance — null');

        const localInspection = Object.freeze({
            selection: Object.freeze({ kind: 'PUBLICATION', objectId: 'P1', origin: 'local' }),
            lead: null,
            loading: Object.freeze({ status: 'AVAILABLE' }),
            verification: Object.freeze({ status: 'VERIFIED' })
        });
        const localProvenance = describePublicationMaterialProvenanceFromInspection(localInspection);
        assert(localProvenance && localProvenance.origin === PublicationMaterialProvenanceOrigin.LOCAL, '16. an inspection with no lead — LOCAL');

        const decentralizedInspection = Object.freeze({
            selection: Object.freeze({ kind: 'PUBLICATION', objectId: 'P1', origin: 'dweb:arweave-graphql' }),
            lead: Object.freeze({ origin: 'dweb:arweave-graphql', discoveryTag: 'tag', uri: 'ar://tx', storage: 'ar' }),
            loading: Object.freeze({ status: 'AVAILABLE' }),
            verification: Object.freeze({ status: 'VERIFIED' })
        });
        const decentralizedProvenance = describePublicationMaterialProvenanceFromInspection(decentralizedInspection);
        assert(decentralizedProvenance && decentralizedProvenance.origin === PublicationMaterialProvenanceOrigin.DECENTRALIZED, '17. an inspection carrying a lead — DECENTRALIZED');

        // C — provenance does not affect verification: a rejected
        // decentralized inspection stays DECENTRALIZED + REJECTED, never a
        // new combined status.
        const rejectedDecentralizedInspection = Object.freeze({
            selection: decentralizedInspection.selection,
            lead: decentralizedInspection.lead,
            loading: Object.freeze({ status: 'AVAILABLE' }),
            verification: Object.freeze({ status: 'REJECTED' })
        });
        const rejectedProvenance = describePublicationMaterialProvenanceFromInspection(rejectedDecentralizedInspection);
        assert(rejectedProvenance.origin === PublicationMaterialProvenanceOrigin.DECENTRALIZED, '18. a REJECTED decentralized inspection still reports DECENTRALIZED — provenance never folds into a new combined status');
        assert(rejectedDecentralizedInspection.verification.status === 'REJECTED', '19. verification itself is untouched by deriving provenance');

        // Malformed/degenerate inspection shapes never throw.
        for (const malformed of [{}, { lead: undefined }, { loading: null, verification: null }]) {
            let threw = false;
            let result;
            try {
                result = describePublicationMaterialProvenanceFromInspection(malformed);
            } catch (error) {
                threw = true;
            }
            assert(!threw, `20. a malformed inspection ${serialize(malformed)} never throws`);
            assert(result.origin === PublicationMaterialProvenanceOrigin.LOCAL, `21. a malformed inspection with no truthy lead degrades to LOCAL for ${serialize(malformed)}`);
        }

        console.log('✓ Section C: describePublicationMaterialProvenanceFromInspection() derives LOCAL/DECENTRALIZED from the existing lead fact alone, and is unaffected by verification/resolution outcome');
    }

    // ---------------------------------------------------------------------
    // D. No mutation of the underlying inspection/material/Publication —
    //    the provenance wrapper is a brand-new value, never a patch.
    // ---------------------------------------------------------------------
    {
        const material = Object.freeze({ id: 'P1', title: 'Untouched' });
        const inspection = Object.freeze({
            selection: Object.freeze({ kind: 'PUBLICATION', objectId: 'P1', origin: 'local' }),
            lead: null,
            loading: Object.freeze({ status: 'AVAILABLE', material }),
            verification: Object.freeze({ status: 'VERIFIED', material })
        });
        const before = serialize(inspection);

        const provenance = describePublicationMaterialProvenanceFromInspection(inspection);

        assert(serialize(inspection) === before, '22. the inspection object is byte-identical after deriving provenance from it');
        assert(inspection.loading.material === material, '23. the loading.material reference is untouched, by identity');
        assert(!('origin' in inspection) && !('provenance' in inspection), '24. no origin/provenance field is ever written onto the inspection itself');
        assert(!('provenance' in material) && !('origin' in material), '25. the underlying material/Publication is never touched at all');
        assert(provenance !== inspection && provenance !== inspection.loading, '26. the provenance fact is its own new object, never the inspection (or loading) reference reused');

        console.log('✓ Section D: deriving provenance never clones or mutates the underlying inspection/material/Publication');
    }

    // ---------------------------------------------------------------------
    // E. Determinism — byte-identical inputs, byte-identical (but
    //    non-reference) outputs across separate calls.
    // ---------------------------------------------------------------------
    {
        const inspection = Object.freeze({
            selection: Object.freeze({ kind: 'PUBLICATION', objectId: 'P1', origin: 'local' }),
            lead: Object.freeze({ origin: 'dweb:x', discoveryTag: 't', uri: 'ar://y', storage: 'ar' }),
            loading: Object.freeze({ status: 'AVAILABLE' }),
            verification: Object.freeze({ status: 'VERIFIED' })
        });
        const first = describePublicationMaterialProvenanceFromInspection(inspection);
        const second = describePublicationMaterialProvenanceFromInspection(inspection);
        assert(serialize(first) === serialize(second), '27. byte-identical inputs produce byte-identical results across separate calls');
        assert(first !== second, '28. each call returns its own fresh object — no caching/memoization');

        console.log('✓ Section E: deterministic, non-memoized across repeated calls with identical inputs');
    }

    // ---------------------------------------------------------------------
    // F. Architectural regression — this file imports nothing, and never
    //    carries trust/rank/preference/persistence vocabulary of any kind.
    // ---------------------------------------------------------------------
    {
        const source = await readFile(new URL('../application/PublicationMaterialProvenance.js', import.meta.url), 'utf8');
        const importLines = source.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 0, '29. PublicationMaterialProvenance.js imports nothing — a pure, leaf fact');

        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        for (const term of ['trust', 'rank', 'prefer', 'score', 'reliab', 'confiden', 'reputation', 'fresh', 'quality', 'localstorage', 'fetch(']) {
            assert(!codeOnly.includes(term), `30. PublicationMaterialProvenance.js's own code never carries "${term}"`);
        }
        assert(Object.keys(PublicationMaterialProvenanceOrigin).every((key) => key === 'LOCAL' || key === 'DECENTRALIZED'), '31. no third origin value exists anywhere in the enum');

        console.log('✓ Section F: architectural regression — a pure, dependency-free, trust-free leaf fact');
    }

    console.log('\nAll PublicationMaterialProvenance tests passed.');
}

run().catch((error) => {
    console.error('PublicationMaterialProvenance.test.js FAILED:', error);
    process.exitCode = 1;
});
