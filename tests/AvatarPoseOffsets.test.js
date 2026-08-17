import { getAvatarPoseOffsets } from '../core/AvatarPoseOffsets.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';

// 0.2.35 — pure pose math, no Three.js, no rendering. Same "pure
// geometry, independently testable" split PreviewCameraFraming.test.js
// (0.2.32) already established for camera framing, applied here.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    {
        const idle = getAvatarPoseOffsets(AvatarAnimationState.IDLE);
        assert(idle.legSplayDegrees === 0 && idle.armSwingDegrees === 0 && idle.bodyTiltDegrees === 0 && idle.hopHeight === 0,
            '1. IDLE is the neutral pose (every offset zero)');
    }

    {
        const walking = getAvatarPoseOffsets(AvatarAnimationState.WALKING);
        const running = getAvatarPoseOffsets(AvatarAnimationState.RUNNING);
        assert(walking.legSplayDegrees > 0, '2. WALKING has a non-zero leg splay');
        assert(running.legSplayDegrees > walking.legSplayDegrees, '3. RUNNING splays legs further than WALKING (physically sensible ordering)');
        assert(running.bodyTiltDegrees > walking.bodyTiltDegrees, '4. RUNNING leans the body forward more than WALKING');
    }

    {
        const jumping = getAvatarPoseOffsets(AvatarAnimationState.JUMPING);
        assert(jumping.hopHeight > 0, '5. JUMPING is the only state that lifts the avatar (non-zero hopHeight)');
        const others = [AvatarAnimationState.IDLE, AvatarAnimationState.WALKING, AvatarAnimationState.RUNNING]
            .map(getAvatarPoseOffsets);
        assert(others.every((pose) => pose.hopHeight === 0), '6. no other state lifts the avatar');
    }

    {
        const a = getAvatarPoseOffsets(AvatarAnimationState.WALKING);
        const b = getAvatarPoseOffsets(AvatarAnimationState.WALKING);
        assert(JSON.stringify(a) === JSON.stringify(b), '7. the same animation state always produces the identical pose (deterministic)');
    }

    {
        let threw = false;
        let pose = null;
        try { pose = getAvatarPoseOffsets('not-a-real-animation-state'); } catch (e) { threw = true; }
        assert(!threw, '8. an unrecognized animation state never throws');
        assert(pose.legSplayDegrees === 0 && pose.hopHeight === 0, '9. ...and falls back to the neutral pose rather than an arbitrary one');
    }

    {
        const undefinedPose = getAvatarPoseOffsets(undefined);
        assert(undefinedPose.hopHeight === 0, '10. undefined/missing animation also falls back to neutral, not a crash');
    }

    console.log('✅ All Avatar Pose Offsets tests passed.');
}

// Top-level await — see tests/AvatarRendering.test.js's comment for
// why the usual fire-and-forget `runTests().catch(...)` pattern isn't
// reliably safe even for a file with no real macrotask scheduling.
await runTests();
