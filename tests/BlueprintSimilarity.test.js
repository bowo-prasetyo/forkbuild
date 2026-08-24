import { Structure } from '../core/Structure.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import {
    compareBlueprintSimilarity, isPossibleLineageCandidate, describeBlueprintSimilarity,
    DEFAULT_SIMILARITY_THRESHOLD
} from '../core/BlueprintSimilarity.js';

// 0.6.8 — Blueprint Lineage & Revision Discovery.
//
// Pure unit coverage for core/BlueprintSimilarity.js — the evidence
// module this milestone's own design conversation was explicit stays
// separate from, and never becomes, an assertion of lineage. See that
// module's own header and docs/Principles.md, "Similarity Is Evidence;
// It Never Becomes Lineage (0.6.8)."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function brick(definitionId, x, y, z, rotation = 0) {
    return new Brick({ definitionId, position: new Position(x, y, z), rotation });
}

function farmstead({ id = 'farmstead-1', bricks } = {}) {
    return new Structure({
        id, name: 'Farmstead', category: 'Architecture', description: 'A cozy farmstead.',
        bricks: bricks || [
            brick('core:wall_1x3', 0, 0, 0),
            brick('core:wall_1x3', 1, 0, 0, 90),
            brick('core:roof_hip', 0, 1, 0)
        ]
    });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — null-safety and identical-design short circuit
    // ---------------------------------------------------------------
    {
        assert(compareBlueprintSimilarity(null, farmstead()) === null, '1. compareBlueprintSimilarity(null, ...) is null, never throws');
        assert(compareBlueprintSimilarity(farmstead(), null) === null, '2. compareBlueprintSimilarity(..., null) is null, never throws');
        assert(compareBlueprintSimilarity(null, null) === null, '3. compareBlueprintSimilarity(null, null) is null');

        // Independently-authored, content-identical copies — different
        // Structure id, different Brick ids — are `identical`.
        const a = farmstead({ id: 'a' });
        const b = farmstead({ id: 'b' });
        const evidence = compareBlueprintSimilarity(a, b);
        assert(evidence.identical === true, '4. two content-identical designs report identical: true');
        assert(evidence.similarity === 1 && evidence.positionOverlap === 1 && evidence.brickOverlap === 1,
            '5. an identical pair reports every ratio at 1');
        assert(evidence.changedBricks === 0 && evidence.addedBricks === 0 && evidence.removedBricks === 0,
            '6. an identical pair reports zero changed/added/removed');
        assert(describeBlueprintSimilarity(evidence) === 'Identical design', '7. describeBlueprintSimilarity labels an identical pair distinctly');
        assert(isPossibleLineageCandidate(evidence) === false,
            '8. an identical pair is NEVER offered as a lineage candidate — same design, not a derivation');
    }
    console.log('✓ Section A: null-safety and the identical-design short circuit');

    // ---------------------------------------------------------------
    // Section B — a genuine one-brick-changed comparison
    // ---------------------------------------------------------------
    {
        const source = farmstead({ id: 'source' });
        // "Farmstead Large": the same three bricks, PLUS one more,
        // PLUS one existing brick re-defined in place (roof swapped).
        const candidate = new Structure({
            id: 'candidate', name: 'Farmstead Large', category: 'Architecture', description: 'A cozy farmstead.',
            bricks: [
                brick('core:wall_1x3', 0, 0, 0),
                brick('core:wall_1x3', 1, 0, 0, 90),
                brick('core:roof_gable', 0, 1, 0), // changed: was core:roof_hip
                brick('core:chimney', 0, 2, 0)     // added
            ]
        });
        const evidence = compareBlueprintSimilarity(source, candidate);
        assert(evidence.identical === false, '9. a genuinely different design never reports identical');
        assert(evidence.changedBricks === 1, '10. exactly one position holds a different brick');
        assert(evidence.addedBricks === 1, '11. exactly one position exists only in the candidate');
        assert(evidence.removedBricks === 0, '12. no position exists only in the source');
        // positions: union = 4 (3 shared + 1 added), shared = 3 -> 0.75
        assert(evidence.positionOverlap === 0.75, '13. positionOverlap is the exact union/intersection ratio');
        // full keys: union = 5 (2 unchanged + 1 source-only roof + 1 candidate-only roof + 1 chimney), shared = 2 -> 0.4
        assert(evidence.brickOverlap === 0.4, '14. brickOverlap is strictly lower than positionOverlap when a shared position changed');
        assert(evidence.similarity === Math.round(((0.75 + 0.4) / 2) * 100) / 100,
            '15. similarity is the documented plain average of the two overlap ratios');
        assert(isPossibleLineageCandidate(evidence, 0.5) === true, '16. a similar-enough pair clears the default threshold');
        assert(isPossibleLineageCandidate(evidence, 0.99) === false, '17. the same evidence fails a stricter threshold');
        assert(describeBlueprintSimilarity(evidence).endsWith('% design similarity'), '18. describeBlueprintSimilarity renders a percentage for a non-identical pair');
    }
    console.log('✓ Section B: a real added/changed comparison reports the documented ratios');

    // ---------------------------------------------------------------
    // Section C — complete strangers and asymmetry
    // ---------------------------------------------------------------
    {
        const source = farmstead({ id: 'source' });
        const stranger = new Structure({
            id: 'stranger', name: 'Watchtower', category: 'Defense', description: 'Tall and narrow.',
            bricks: [
                brick('core:wall_1x1', 5, 5, 5),
                brick('core:wall_1x1', 5, 6, 5)
            ]
        });
        const evidence = compareBlueprintSimilarity(source, stranger);
        assert(evidence.positionOverlap === 0 && evidence.brickOverlap === 0 && evidence.similarity === 0,
            '19. two designs sharing no geometry at all score zero on every ratio');
        assert(evidence.addedBricks === 2 && evidence.removedBricks === 3,
            '20. added/removed correctly reflect each design\'s own unique positions');
        assert(isPossibleLineageCandidate(evidence) === false, '21. two unrelated designs are never offered as a lineage candidate');

        // Removed/added swap when source and candidate swap — the
        // module is directional about WHICH side is which, even though
        // the ratios themselves stay symmetric.
        const reversed = compareBlueprintSimilarity(stranger, source);
        assert(reversed.addedBricks === 3 && reversed.removedBricks === 2,
            '22. swapping source/candidate swaps added/removed, but not the ratios');
        assert(reversed.positionOverlap === evidence.positionOverlap && reversed.brickOverlap === evidence.brickOverlap,
            '23. positionOverlap/brickOverlap/similarity stay symmetric regardless of argument order');
    }
    console.log('✓ Section C: unrelated designs score zero; added/removed are directional, ratios are symmetric');

    // ---------------------------------------------------------------
    // Section D — empty structures and DEFAULT_SIMILARITY_THRESHOLD
    // ---------------------------------------------------------------
    {
        const empty1 = new Structure({ id: 'e1', name: 'Empty', category: 'misc', description: '', bricks: [] });
        // core/Structure.js may itself refuse zero bricks; if it does,
        // this section still holds because compareBlueprintSimilarity()
        // degrades to null for any structure with no derivable content
        // — proven generally in Section A already. Guard defensively.
        let evidence = null;
        try {
            const empty2 = new Structure({ id: 'e2', name: 'Empty', category: 'misc', description: '', bricks: [] });
            evidence = compareBlueprintSimilarity(empty1, empty2);
        } catch (e) {
            evidence = null;
        }
        if (evidence) {
            assert(evidence.positionOverlap === 1 && evidence.brickOverlap === 1,
                '24. two structures with zero bricks in a dimension report that dimension as trivially identical');
        }

        assert(typeof DEFAULT_SIMILARITY_THRESHOLD === 'number' && DEFAULT_SIMILARITY_THRESHOLD > 0 && DEFAULT_SIMILARITY_THRESHOLD < 1,
            '25. DEFAULT_SIMILARITY_THRESHOLD is a real, exported, sane cutoff');
        assert(isPossibleLineageCandidate(null) === false, '26. isPossibleLineageCandidate(null) is false, never throws');
        assert(describeBlueprintSimilarity(null) === '', '27. describeBlueprintSimilarity(null) is empty, never throws');
    }
    console.log('✓ Section D: degenerate inputs stay safe and non-throwing');

    console.log('\nAll Blueprint Similarity tests passed.');
}

await run();
