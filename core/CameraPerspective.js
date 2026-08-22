// 0.3.2 — Avatar & Camera Experience.
//
// A pure, Three.js-free enum plus a single deterministic derivation:
// given where the avatar IS (a world position) and which way it's
// FACING (a yaw in degrees, same convention core/AvatarFacing.js and
// core/AvatarMovementSimulation.js already use — 0 faces +Z, 90 faces
// +X, dx = sin(radians) * distance, dz = cos(radians) * distance), what
// camera position/target framing does a given perspective produce?
// Same "core deals with geometry/math, application supplies the data"
// split every other movement/collision concern in this codebase already
// follows (core/AvatarCollision.js, core/TerrainWalkability.js,
// core/PreviewCameraFraming.js) — this file has no idea what a session,
// a presence, or a renderer even is, and produces a framing an
// application-layer caller hands straight to
// application/SpatialCameraController.js#applyFraming(), the SAME sole
// write path every other camera-focus caller already uses (see
// application/CameraFocusAnimator.js's own header) — no second
// camera-movement mechanism.
//
// See docs/Principles.md, "Camera Perspective Determines An Offset;
// It Never Replaces The Camera Machinery (0.3.2)."
//
// Deliberately three, no more, for this milestone — ORBIT/FREE (a
// camera perspective is simply "off," `null`, and behaves exactly like
// every pre-0.3.2 World View already does) is not a fourth mode to add
// here, it is the absence of one.
export const CameraPerspective = Object.freeze({
    FIRST_PERSON: 'first-person',
    THIRD_PERSON: 'third-person',
    BIRD_EYE: 'bird-eye'
});

const VALID_PERSPECTIVES = new Set(Object.values(CameraPerspective));

export function isValidCameraPerspective(value) {
    return VALID_PERSPECTIVES.has(value);
}

// Eye height for a standing avatar — roughly matches
// core/AvatarCollision.js's own AVATAR_COLLISION_HEIGHT (1.8) without
// importing it: collision geometry and camera framing are allowed to
// diverge slightly, the same way render geometry already does.
const EYE_HEIGHT = 1.6;
// How far ahead of the avatar a first-person camera looks — purely so
// `target` differs from `position` (a camera can't lookAt its own
// position); the exact distance has no gameplay meaning.
const FIRST_PERSON_LOOK_DISTANCE = 10;
// Third-person: behind and above the avatar, looking slightly down at
// roughly chest height — the classic "see your own character" framing.
const THIRD_PERSON_BACK_DISTANCE = 6;
const THIRD_PERSON_HEIGHT = 3;
const THIRD_PERSON_LOOK_HEIGHT = 1.4;
// Bird's-eye: straight overhead, looking straight down — deliberately
// IGNORES heading (see below) so it never spins with the avatar's own
// turning, and stays well-defined even when heading is unknown (null).
const BIRD_EYE_HEIGHT = 40;

// Pure geometry: no Math.random, no clock, no world/document lookups.
// The same (perspective, avatarPosition, headingDegrees) always
// produces the same {position, target}. `headingDegrees` may be null
// (an avatar/collaborator whose facing isn't known yet) — treated as 0
// (facing +Z) rather than throwing, the same graceful-absence posture
// core/AvatarFacing.js's own callers already follow.
export function computeCameraFraming(perspective, avatarPosition, headingDegrees) {
    const yaw = Number.isFinite(headingDegrees) ? headingDegrees : 0;
    const radians = yaw * (Math.PI / 180);
    const forward = { x: Math.sin(radians), z: Math.cos(radians) };

    switch (perspective) {
        case CameraPerspective.FIRST_PERSON: {
            const position = {
                x: avatarPosition.x,
                y: avatarPosition.y + EYE_HEIGHT,
                z: avatarPosition.z
            };
            return {
                position,
                target: {
                    x: position.x + forward.x * FIRST_PERSON_LOOK_DISTANCE,
                    y: position.y,
                    z: position.z + forward.z * FIRST_PERSON_LOOK_DISTANCE
                }
            };
        }
        case CameraPerspective.THIRD_PERSON: {
            return {
                position: {
                    x: avatarPosition.x - forward.x * THIRD_PERSON_BACK_DISTANCE,
                    y: avatarPosition.y + THIRD_PERSON_HEIGHT,
                    z: avatarPosition.z - forward.z * THIRD_PERSON_BACK_DISTANCE
                },
                target: {
                    x: avatarPosition.x,
                    y: avatarPosition.y + THIRD_PERSON_LOOK_HEIGHT,
                    z: avatarPosition.z
                }
            };
        }
        case CameraPerspective.BIRD_EYE: {
            return {
                position: {
                    x: avatarPosition.x,
                    y: avatarPosition.y + BIRD_EYE_HEIGHT,
                    z: avatarPosition.z
                },
                target: {
                    x: avatarPosition.x,
                    y: avatarPosition.y,
                    z: avatarPosition.z
                }
            };
        }
        default:
            return null;
    }
}
