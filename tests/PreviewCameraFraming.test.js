import { SpatialBounds } from '../core/SpatialBounds.js';
import { computeThumbnailCamera } from '../core/PreviewCameraFraming.js';

// 0.2.32 — deterministic camera framing, pure geometry. No Three.js,
// no rendering, no randomness — see core/PreviewCameraFraming.js's own
// comment for the exact guarantee under test: SAME bounds -> SAME
// intended camera shot, always. (Byte-identical pixels across GPUs is
// explicitly NOT the guarantee — that's verified visually, not here.)

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    const small = new SpatialBounds({ min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 1, z: 0.5 } });
    const large = new SpatialBounds({ min: { x: -10, y: 0, z: -10 }, max: { x: 10, y: 5, z: 10 } });
    const offCenter = new SpatialBounds({ min: { x: 100, y: 0, z: 200 }, max: { x: 102, y: 3, z: 203 } });

    // -------------------------------------------------------------
    // 1-2. Determinism: identical input -> identical output, called
    //      repeatedly and independently.
    // -------------------------------------------------------------
    {
        const a = computeThumbnailCamera(small);
        const b = computeThumbnailCamera(small);
        assert(JSON.stringify(a) === JSON.stringify(b),
            '1. the exact same bounds produce the exact same framing every time');

        const c = computeThumbnailCamera(new SpatialBounds({ min: { x: -0.5, y: 0, z: -0.5 }, max: { x: 0.5, y: 1, z: 0.5 } }));
        assert(JSON.stringify(a) === JSON.stringify(c),
            '2. a FRESH SpatialBounds instance with the same numbers produces the identical framing — determinism is about the values, not object identity');
    }

    // -------------------------------------------------------------
    // 3-4. The target is always exactly the bounds' own center — the
    //      camera looks AT the content, never somewhere else.
    // -------------------------------------------------------------
    {
        const framing = computeThumbnailCamera(offCenter);
        const center = offCenter.center;
        assert(framing.target.x === center.x && framing.target.y === center.y && framing.target.z === center.z,
            '3. the framing target is exactly the bounds center');

        const framingLarge = computeThumbnailCamera(large);
        assert(framingLarge.target.x === large.center.x && framingLarge.target.z === large.center.z,
            '4. this holds for a large, off-origin bounds too');
    }

    // -------------------------------------------------------------
    // 5-6. A larger document needs a farther-back camera; a smaller
    //      one needs a closer one — the distance scales with size,
    //      not a fixed constant regardless of content.
    // -------------------------------------------------------------
    {
        const smallFraming = computeThumbnailCamera(small);
        const largeFraming = computeThumbnailCamera(large);
        assert(largeFraming.distance > smallFraming.distance,
            '5. a larger bounding box produces a larger camera distance');

        const ratio = largeFraming.distance / smallFraming.distance;
        assert(ratio > 5,
            '6. the distance scales meaningfully with size, not just marginally (large bounds here are roughly 20x the small one\'s diagonal)');
    }

    // -------------------------------------------------------------
    // 7-9. Degenerate bounds (zero volume — a single point) never
    //      produce NaN, Infinity, or a zero-distance camera sitting
    //      exactly on top of its own target.
    // -------------------------------------------------------------
    {
        const pointBounds = new SpatialBounds({ min: { x: 5, y: 5, z: 5 }, max: { x: 5, y: 5, z: 5 } });
        const framing = computeThumbnailCamera(pointBounds);
        assert(Number.isFinite(framing.distance) && framing.distance > 0,
            '7. a zero-size bounds still produces a finite, positive camera distance');
        assert(Number.isFinite(framing.position.x) && Number.isFinite(framing.position.y) && Number.isFinite(framing.position.z),
            '8. and finite position coordinates — no NaN anywhere');
        const dx = framing.position.x - framing.target.x;
        const dy = framing.position.y - framing.target.y;
        const dz = framing.position.z - framing.target.z;
        assert(Math.sqrt(dx * dx + dy * dy + dz * dz) > 0,
            '9. the camera never collapses onto its own target');
    }

    // -------------------------------------------------------------
    // 10. A caller-supplied field of view is honored and echoed back
    //     (renderer/DocumentThumbnailRenderer.js applies it to the
    //     actual camera).
    // -------------------------------------------------------------
    {
        const framing = computeThumbnailCamera(small, { fovDegrees: 60 });
        assert(framing.fovDegrees === 60, '10. a custom fovDegrees option is honored and returned');
    }

    console.log('✅ All Preview Camera Framing tests passed.');
}

runTests().catch((e) => { console.error(e); throw e; });
