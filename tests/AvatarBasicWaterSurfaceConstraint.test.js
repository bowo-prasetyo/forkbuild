import { readFile } from 'node:fs/promises';

import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY, WATER_LEVEL } from '../core/TerrainSurface.js';
import { hydrologyFeatureAt, HYDROLOGY_FEATURE, LAKE_SURFACE_HEIGHT, isRiverAt } from '../core/Hydrology.js';
import { DEFAULT_MAX_WALKING_DEPTH } from '../core/AvatarWaterWalkability.js';

// 0.9.615 — Avatar Basic Water Surface Constraint.
//
// tests/AvatarWaterInteractionProductBoundaryAudit.test.js (0.9.613)
// found a real avatar sinking, unclamped, below LAKE_SURFACE_HEIGHT the
// farther it walked into a real generated lake.
// tests/AvatarBasicWaterTraversalBoundaryAudit.test.js (0.9.614) traced
// the cause (position.y is a flat simulated plane by deliberate design;
// terrain height, hill or lake alike, is only ever combined with it at
// the RENDERING layer — application/RenderWorldViewUseCase.js's own
// withGroundElevation()) and test-drove a minimal, TEST-LOCAL candidate
// fix at exactly that layer, never installed anywhere.
//
// This milestone installs that candidate for real: withGroundElevation()
// now floors the avatar's rendered Y at max(terrainHeight,
// LAKE_SURFACE_HEIGHT) wherever the real ground is
// SURFACE_CATEGORY.WATER. Nothing else changes — no new AvatarPresence
// field, no new AvatarMovementState/AvatarAnimationState value, no
// SWIMMING vocabulary, no breath/drowning/stamina mechanic, no new
// persisted state anywhere. This file proves the REAL shipped function
// (extracted from its actual source text, never re-typed by hand)
// satisfies exactly the invariants the milestone's own brief named.
//
// Since application/RenderWorldViewUseCase.js's execute() constructs a
// real renderer/Renderer.js (a real THREE.WebGLRenderer, which needs a
// browser `document` this headless suite does not have — see
// renderer/StructureRelativeFaceSnappingRendering.test.js's own header
// for why THIS codebase's convention is to test a Three.js-adjacent
// unit directly rather than the whole use case), withGroundElevation()
// itself is extracted from the real file text and executed standalone
// with a stub `renderer` whose own terrainHeightAt() is a thin
// pass-through to the SAME real, pure core/TerrainHeightField.js
// function renderer/Renderer.js's own terrainHeightAt() wraps (see that
// file's own 0.2.76 header) — an exact behavioral stand-in, not a
// re-implementation of the function under test itself.
//
//   Section A: extraction — the real function is located and pulled
//              from its real source file, never re-typed by hand.
//   Section B: deep lake — the avatar's rendered Y no longer sinks
//              below the real lake's fixed surface.
//   Section C: river — a real river coordinate is a complete no-op,
//              identical to the pre-0.9.615 formula.
//   Section D: land — ordinary dry terrain is completely unaffected.
//   Section E: shoreline — land -> water -> land leaves no lingering
//              floor once the avatar is back on dry ground.
//   Section F: horizontal movement — only Y is ever touched; X/Z pass
//              through unmodified.
//   Section G: no SWIMMING state — the avatar state model gains no new
//              vocabulary anywhere.
//   Section H: no breath/drowning/stamina mechanics anywhere.
//   Section I: no new persisted avatar/world state — the fix is a pure,
//              stateless function of (renderer, position) alone.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function readSource(relativePath) {
    return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Extracts a balanced-brace function body starting at `startMarker`,
// from the FIRST `{` after the marker through its matching `}` — robust
// to a function DECLARATION (no trailing `;`), unlike a simple
// `indexOf('\n};')` scan.
function extractFunctionBody(source, startMarker) {
    const start = source.indexOf(startMarker);
    if (start === -1) return null;
    const braceStart = source.indexOf('{', start);
    if (braceStart === -1) return null;
    let depth = 0;
    for (let i = braceStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    return null;
}

function findShoreline(seed, halfExtent) {
    for (let x = -halfExtent; x < halfExtent; x++) {
        for (let z = -halfExtent; z < halfExtent; z++) {
            if (surfaceCategoryAt(seed, x, z) !== SURFACE_CATEGORY.WATER) continue;
            const neighbors = [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]];
            for (const [nx, nz] of neighbors) {
                if (surfaceCategoryAt(seed, nx, nz) !== SURFACE_CATEGORY.WATER) {
                    return { shoreX: nx, shoreZ: nz, lakeX: x, lakeZ: z, dirX: x - nx, dirZ: z - nz };
                }
            }
        }
    }
    return null;
}

function findRiverCoordinate(seed, halfExtent) {
    for (let x = -halfExtent; x < halfExtent; x++) {
        for (let z = -halfExtent; z < halfExtent; z++) {
            if (isRiverAt(seed, x, z)) return { x, z };
        }
    }
    return null;
}

function findDryCoordinate(seed, halfExtent) {
    for (let x = -halfExtent; x < halfExtent; x++) {
        for (let z = -halfExtent; z < halfExtent; z++) {
            if (surfaceCategoryAt(seed, x, z) !== SURFACE_CATEGORY.WATER) return { x, z };
        }
    }
    return null;
}

async function run() {
    const seed = DEFAULT_WORLD_SEED;
    const SCAN_HALF_EXTENT = 400;

    const shoreline = findShoreline(seed, SCAN_HALF_EXTENT);
    assert(shoreline !== null, 'setup: a real lake shoreline exists in the scanned region under the default world seed');
    const river = findRiverCoordinate(seed, SCAN_HALF_EXTENT);
    assert(river !== null, 'setup: a real river coordinate exists in the scanned region under the default world seed');
    const dryPoint = findDryCoordinate(seed, SCAN_HALF_EXTENT);
    assert(dryPoint !== null, 'setup: an ordinary dry coordinate exists in the scanned region under the default world seed');

    // AMENDED BY 0.9.634 — this setup originally reproduced 0.9.613/
    // 0.9.614's own interior walk (via AvatarTerrainConstraint, which
    // only ever blocks on SLOPE) to obtain a "deep lake" coordinate. That
    // walk never actually guaranteed a depth beyond any particular
    // threshold — it simply followed gentle real terrain until slope
    // blocked it, and happened to land on a genuinely SHALLOW coordinate
    // (depth well under DEFAULT_MAX_WALKING_DEPTH). Now that 0.9.634 has
    // installed a genuine walkable-depth limit, this section's own
    // "deep lake" assertions (Section B) need a coordinate that is
    // ACTUALLY beyond DEFAULT_MAX_WALKING_DEPTH to remain meaningful —
    // found here by the identical real-terrain census technique
    // tests/AvatarShallowWaterTraversalBoundaryAudit.test.js (0.9.633)
    // already established, never a hand-picked coordinate.
    function findDeepestWaterCoordinate(seedValue, halfExtent, step) {
        let deepest = null;
        for (let x = -halfExtent; x < halfExtent; x += step) {
            for (let z = -halfExtent; z < halfExtent; z += step) {
                const height = terrainHeightAt(seedValue, x, z);
                if (height > WATER_LEVEL) continue;
                const depth = LAKE_SURFACE_HEIGHT - height;
                if (!deepest || depth > deepest.depth) deepest = { x, z, depth };
            }
        }
        return deepest;
    }
    const DEEP_SCAN_HALF_EXTENT = 1000;
    const DEEP_SCAN_STEP = 2;
    const deepestFound = findDeepestWaterCoordinate(seed, DEEP_SCAN_HALF_EXTENT, DEEP_SCAN_STEP);
    assert(deepestFound !== null && deepestFound.depth > DEFAULT_MAX_WALKING_DEPTH,
        `setup: a real, scanned WATER coordinate exists whose depth (${deepestFound ? deepestFound.depth.toFixed(4) : 'n/a'}) genuinely exceeds DEFAULT_MAX_WALKING_DEPTH (${DEFAULT_MAX_WALKING_DEPTH}) — this milestone's own real "too deep to walk" case, not a hypothetical one`);
    const deepInterior = { x: deepestFound.x, y: 0, z: deepestFound.z };
    assert(surfaceCategoryAt(seed, deepInterior.x, deepInterior.z) === SURFACE_CATEGORY.WATER,
        'setup: the scanned deepest coordinate is independently reconfirmed WATER via the real surfaceCategoryAt()');

    // -------------------------------------------------------------
    // Section A — extraction: pull the REAL withGroundElevation()
    // straight out of its real source file, never re-typed by hand.
    // -------------------------------------------------------------
    const renderWorldViewSource = await readSource('application/RenderWorldViewUseCase.js');
    const functionBody = extractFunctionBody(renderWorldViewSource, 'function withGroundElevation(position) {');
    assert(functionBody !== null, '1. application/RenderWorldViewUseCase.js#withGroundElevation() is located and extracted from its real source text');
    assert(functionBody.includes('surfaceCategoryAt') && functionBody.includes('LAKE_SURFACE_HEIGHT') && functionBody.includes('Math.max'),
        '2. the extracted function body genuinely contains the water-floor gate (surfaceCategoryAt/LAKE_SURFACE_HEIGHT/Math.max) — this is testing the shipped fix, not a stand-in for it');

    // AMENDED BY 0.9.634 — the real, current source text now references
    // DEFAULT_MAX_WALKING_DEPTH (core/AvatarWaterWalkability.js) as a
    // free identifier; this dynamic extraction must supply it too, the
    // same reasoning tests/AvatarShallowWaterTraversalBoundaryAudit.test.js
    // (0.9.633) already applied to its own identical extraction.
    const buildWithGroundElevation = new Function(
        'renderer', 'surfaceCategoryAt', 'SURFACE_CATEGORY', 'LAKE_SURFACE_HEIGHT', 'DEFAULT_WORLD_SEED', 'DEFAULT_MAX_WALKING_DEPTH',
        `${functionBody}\nreturn withGroundElevation;`
    );
    // The exact behavioral stand-in for renderer/Renderer.js's own
    // terrainHeightAt() — "a thin pass-through to core/TerrainHeightField.js's
    // own pure function with this renderer's fixed DEFAULT_WORLD_SEED"
    // (that file's own 0.2.76 header, unchanged by this milestone).
    const fakeRenderer = { terrainHeightAt: (x, z) => terrainHeightAt(seed, x, z) };
    const withGroundElevation = buildWithGroundElevation(fakeRenderer, surfaceCategoryAt, SURFACE_CATEGORY, LAKE_SURFACE_HEIGHT, DEFAULT_WORLD_SEED, DEFAULT_MAX_WALKING_DEPTH);

    function rawRenderedY(position) {
        return position.y + terrainHeightAt(seed, position.x, position.z);
    }

    // -------------------------------------------------------------
    // Section B — deep lake: the avatar's rendered Y no longer sinks
    // below the real lake's own fixed surface.
    // -------------------------------------------------------------
    {
        const rawY = rawRenderedY(deepInterior);
        assert(rawY < LAKE_SURFACE_HEIGHT,
            `setup: the raw (pre-0.9.615) formula genuinely sinks below the lake surface at the deep-interior coordinate (raw=${rawY.toFixed(4)}, surface=${LAKE_SURFACE_HEIGHT})`);

        const constrained = withGroundElevation(deepInterior);
        assert(constrained.y >= LAKE_SURFACE_HEIGHT - 1e-9,
            `3. FLAGSHIP — the real, shipped withGroundElevation() holds the avatar AT OR ABOVE the lake surface (${constrained.y.toFixed(4)} >= ${LAKE_SURFACE_HEIGHT}) at the exact coordinate the raw formula sank below it — 0.9.613's own flagship gap is closed for real, in production code`);
        assert(Math.abs(constrained.y - LAKE_SURFACE_HEIGHT) < 1e-9,
            '4. at this deep-interior coordinate the constrained Y sits exactly AT the fixed lake surface (the real terrain height there is genuinely below it), never merely "somewhere above the raw value"');
        assert(constrained.y > rawY,
            '5. the constraint strictly raises the rendered Y versus the raw (unclamped) formula at this coordinate — a real, measurable fix, not a no-op that happens to pass a >= check');
    }

    // -------------------------------------------------------------
    // Section C — river: a real river coordinate is a complete no-op.
    // -------------------------------------------------------------
    {
        const riverPoint = { x: river.x, y: 0, z: river.z };
        assert(hydrologyFeatureAt(seed, river.x, river.z) === HYDROLOGY_FEATURE.RIVER,
            '6. setup: the scanned coordinate genuinely classifies as a river, not a lake');
        assert(surfaceCategoryAt(seed, river.x, river.z) !== SURFACE_CATEGORY.WATER,
            '7. a real river coordinate is never SURFACE_CATEGORY.WATER — confirming the water-floor gate structurally cannot fire for it');

        const constrained = withGroundElevation(riverPoint);
        const raw = rawRenderedY(riverPoint);
        assert(constrained.y === raw,
            '8. the real fix is a byte-for-byte no-op at a real river coordinate — a river needed, and received, zero new handling under this milestone');
    }

    // -------------------------------------------------------------
    // Section D — land: ordinary dry terrain is completely unaffected.
    // -------------------------------------------------------------
    {
        const dry = { x: dryPoint.x, y: 0, z: dryPoint.z };
        const constrained = withGroundElevation(dry);
        const raw = rawRenderedY(dry);
        assert(constrained.y === raw,
            '9. an ordinary dry coordinate renders at exactly the same Y as before this milestone — existing land movement/rendering is unchanged');

        // A non-zero position.y (e.g. mid-jump) still passes through
        // additively, exactly as the pre-existing formula always did.
        const jumping = { x: dryPoint.x, y: 1.4, z: dryPoint.z };
        assert(Math.abs(withGroundElevation(jumping).y - (rawRenderedY(jumping))) < 1e-12,
            '10. a non-zero position.y (e.g. a transient jump offset) is still added on top of dry ground exactly as before — the water gate only ever touches WATER-classified ground');
    }

    // -------------------------------------------------------------
    // Section E — shoreline: land -> water -> land leaves no lingering
    // floor once the avatar is back on dry ground.
    // -------------------------------------------------------------
    {
        const dryBefore = { x: shoreline.shoreX, y: 0, z: shoreline.shoreZ };
        const wet = { x: shoreline.lakeX, y: 0, z: shoreline.lakeZ };

        const beforeY = withGroundElevation(dryBefore).y;
        const wetY = withGroundElevation(wet).y;
        const afterY = withGroundElevation(dryBefore).y; // the SAME dry coordinate, called again after "visiting" water

        assert(beforeY === rawRenderedY(dryBefore),
            '11. the dry shoreline cell, before entering water, renders at its own ordinary terrain height — no floor applied yet');
        // AMENDED BY 0.9.634 — the very next wet cell adjacent to a real
        // shoreline is, by construction, barely wet (a shallow depth well
        // under DEFAULT_MAX_WALKING_DEPTH) — exactly the case 0.9.634
        // exists to change. It no longer floors to the lake surface; it
        // now follows the real lakebed instead (which, at this shallow a
        // depth, is simply its own real, raw terrain height) — the whole
        // point of this milestone. See
        // tests/AvatarShallowWaterTraversal.test.js for the dedicated
        // shallow-water coverage this milestone adds.
        assert(Math.abs(wetY - rawRenderedY(wet)) < 1e-9,
            '12. AMENDED BY 0.9.634: the very next wet cell — genuinely shallow — now renders at its own real (raw) lakebed height, no longer floored up to the lake surface the way 0.9.615\'s original, depth-blind clamp always did; see tests/AvatarShallowWaterTraversal.test.js for the dedicated shallow-water coverage this milestone adds');
        assert(afterY === beforeY,
            '13. calling withGroundElevation() on the SAME dry coordinate again, after the water call, returns the byte-identical result — nothing about visiting water leaves the dry coordinate permanently constrained; the function is stateless, so "returning to land" needs no reset of anything');

        // A fresh, independent dry coordinate on the far side of the
        // walked path is likewise unaffected by every wet call made
        // along the way — no global/shared state leaks between calls.
        const distantDry = { x: dryPoint.x, y: 0, z: dryPoint.z };
        const distantBefore = withGroundElevation(distantDry).y;
        withGroundElevation(deepInterior); // an intervening deep-water call
        const distantAfter = withGroundElevation(distantDry).y;
        assert(distantBefore === distantAfter,
            '14. an unrelated dry coordinate\'s own result is unaffected by an intervening call for a completely different, wet coordinate — confirms no shared/module-level state of any kind');
    }

    // -------------------------------------------------------------
    // Section F — horizontal movement: only Y is ever touched.
    // -------------------------------------------------------------
    {
        for (const point of [deepInterior, { x: river.x, y: 0, z: river.z }, { x: dryPoint.x, y: 0, z: dryPoint.z }]) {
            const result = withGroundElevation(point);
            assert(result.x === point.x && result.z === point.z,
                `15. withGroundElevation() never modifies x/z for (${point.x}, ${point.z}) — only y is ever adjusted, so the avatar can keep moving horizontally through water exactly as it already could; vertical constraint never immobilizes it`);
        }
    }

    // -------------------------------------------------------------
    // Section G — no SWIMMING state anywhere in the avatar state model.
    // -------------------------------------------------------------
    {
        const presenceFiles = [
            'core/AvatarPresence.js',
            'core/AvatarMovementState.js',
            'core/AvatarAnimationState.js',
            'core/AvatarMovementSimulation.js',
            'application/AvatarStepConstraint.js',
            'application/AvatarMovementController.js'
        ];
        for (const file of presenceFiles) {
            const src = codeOnly(await readSource(file));
            assert(!/SWIMMING|WADING/.test(src),
                `16. ${file} introduces no SWIMMING/WADING vocabulary of any kind — the avatar state model stays exactly the shape it already had before this milestone`);
        }

        // The seam 0.9.614 traced (position.y stays a flat simulated
        // plane; no x/z or hydrology reference in the kinematics path)
        // is still exactly where it was — this milestone never touched
        // it, only the rendering layer above it.
        const simulationSrc = codeOnly(await readSource('core/AvatarMovementSimulation.js'));
        assert(!/Hydrology|LAKE_SURFACE_HEIGHT|WATER_LEVEL|surfaceCategoryAt/.test(simulationSrc),
            '17. core/AvatarMovementSimulation.js still contains no water-related reference of any kind — the authoritative simulation is untouched, exactly as 0.9.614 found and this milestone\'s own brief required');
    }

    // -------------------------------------------------------------
    // Section H — no breath/drowning/stamina/buoyancy mechanics.
    // -------------------------------------------------------------
    {
        const forbiddenTerms = /\bbreath\b|\bdrown|\bstamina\b|\bbuoyan/i;
        const renderWorldViewCode = codeOnly(renderWorldViewSource);
        assert(!forbiddenTerms.test(renderWorldViewCode),
            '18. application/RenderWorldViewUseCase.js introduces no breath/drowning/stamina/buoyancy vocabulary — the milestone stayed exactly as narrow as its own brief specified');
        for (const file of ['core/AvatarMovementSimulation.js', 'core/AvatarMovementState.js', 'core/AvatarAnimationState.js']) {
            const src = codeOnly(await readSource(file));
            assert(!forbiddenTerms.test(src), `19. ${file} introduces no breath/drowning/stamina/buoyancy mechanic`);
        }
    }

    // -------------------------------------------------------------
    // Section I — no new persisted avatar/world state: the fix is a
    // pure, stateless function of (renderer, position) alone.
    // -------------------------------------------------------------
    {
        // Extracted function body closes over nothing but its own
        // `renderer` parameter (already captured by the real
        // withGroundElevation()'s own enclosing closure before this
        // milestone) and the three pure, already-existing imports
        // this milestone added — no `let`/module-level mutable
        // variable of its own.
        assert(!/\blet\s+\w+\s*=/.test(functionBody) && !/this\./.test(functionBody),
            '20. withGroundElevation() declares no mutable variable of its own and reads no `this` — every value it produces comes from its own parameter plus pure function calls, nothing it could persist between calls');

        // Two independent calls with the exact same position, and no
        // shared object passed between them, agree exactly — the
        // structural proof that nothing is remembered tick to tick.
        const a = withGroundElevation(deepInterior);
        const b = buildWithGroundElevation(
            { terrainHeightAt: (x, z) => terrainHeightAt(seed, x, z) }, surfaceCategoryAt, SURFACE_CATEGORY, LAKE_SURFACE_HEIGHT, DEFAULT_WORLD_SEED, DEFAULT_MAX_WALKING_DEPTH
        )(deepInterior);
        assert(a.y === b.y,
            '21. a completely fresh instance of the extracted function, given the same position, produces the byte-identical result — confirms there is no persisted avatar/world state anywhere backing this constraint, exactly per this milestone\'s own brief');
    }

    console.log('✅ All Avatar Basic Water Surface Constraint tests passed.');
}

await run();
