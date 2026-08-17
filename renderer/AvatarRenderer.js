import * as THREE from 'three';
import { getAvatarPoseOffsets } from '../core/AvatarPoseOffsets.js';

// 0.2.35 — the "dumb executor" that turns a declarative
// AvatarTemplate + effective appearance into actual Three.js geometry
// — same one-way relationship DocumentThumbnailRenderer (0.2.32) has
// with PreviewCameraFraming: all the DECISIONS (which colors, which
// components exist, what a pose's numeric offsets are) come from
// core/ data this class only ever applies; it never invents an
// appearance or animation choice of its own.
//
// core/AvatarTemplate.js's own header explains why component ->
// GEOMETRY is deliberately NOT part of the template's own declarative
// data: an appearance option is a closed vocabulary id ("hair-07"),
// never a mesh reference — see docs/Principles.md, "A Template Is A
// Closed Vocabulary, Not An Asset Loader." Something still has to
// decide what "hair" or "shirt" or "accessories" look like as
// geometry, and that decision belongs here, in code, not in template
// data — exactly the same split BrickDefinition (declarative:
// width/height/depth/category) has with ThreeBrickFactory (code: what
// a "core:cube" actually looks like).
//
// Skin-option-id -> color is a presentation-only lookup LOCAL to this
// file — a separate, smaller copy of the same idea
// ui/views/AvatarSettingsView.js already uses for its own lightweight
// SVG preview. The two are not shared on purpose: one drives a flat
// SVG swatch, the other drives a real Three.js material, and they
// don't need to agree on anything beyond "roughly this color."
const SKIN_TONE_COLORS = {
    'skin-01': 0xffe0bd,
    'skin-02': 0xf1c27d,
    'skin-03': 0xe0ac69,
    'skin-04': 0xc68642,
    'skin-05': 0x8d5524,
    'skin-06': 0x4a2c17
};
const DEFAULT_SKIN_COLOR = 0xe0ac69;
const DEFAULT_HAIR_COLOR = 0x3b2416;
const DEFAULT_SHIRT_COLOR = 0x3366cc;
const DEFAULT_PANTS_COLOR = 0x222222;
const UNKNOWN_ACCESSORY_MARKER_COLOR = 0xffd54f;

function hexColor(value, fallback) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
        ? new THREE.Color(value)
        : new THREE.Color(fallback);
}

// Component -> geometry is this renderer's job (see the file header),
// and that applies to EACH accessory option individually, not just to
// "accessories" as a whole: an option id like "glasses-01" is a closed
// vocabulary entry (core/library/CoreAvatarTemplateLibrary.js), never
// a mesh reference, so something in code has to decide glasses sit on
// the face, a hat sits on the head, a scarf wraps the neck, and a
// backpack sits against the back. One builder per known accessory id,
// each returning an already-positioned mesh sized/placed relative to
// the head/torso built above — this is presentation detail local to
// this file, exactly like SKIN_TONE_COLORS above it.
const ACCESSORY_COLORS = {
    'glasses-01': 0x1a1a1a,
    'hat-01': 0x8b3a3a,
    'backpack-01': 0x5b3a29,
    'scarf-01': 0xb33939
};

function buildGlassesAccessory() {
    const glasses = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.06, 0.04),
        new THREE.MeshStandardMaterial({ color: ACCESSORY_COLORS['glasses-01'] })
    );
    // Flat against the front of the face, at eye height.
    glasses.position.set(0, 1.58, 0.26);
    return glasses;
}

function buildHatAccessory() {
    const hat = new THREE.Mesh(
        new THREE.ConeGeometry(0.24, 0.26, 12),
        new THREE.MeshStandardMaterial({ color: ACCESSORY_COLORS['hat-01'] })
    );
    // Resting on top of the hair hemisphere built above.
    hat.position.y = 2.1;
    return hat;
}

function buildScarfAccessory() {
    const scarf = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.05, 8, 16),
        new THREE.MeshStandardMaterial({ color: ACCESSORY_COLORS['scarf-01'] })
    );
    // Wraps the neck, in the gap between the head and the torso.
    scarf.position.y = 1.32;
    scarf.rotation.x = Math.PI / 2;
    return scarf;
}

function buildBackpackAccessory() {
    const backpack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.16, 0.2, 0.45, 8),
        new THREE.MeshStandardMaterial({ color: ACCESSORY_COLORS['backpack-01'] })
    );
    // Against the back of the torso, standing upright.
    backpack.position.set(0, 1.05, -0.27);
    return backpack;
}

// Falls back to the original generic marker for any accessory id a
// template declares but this renderer doesn't yet have a real shape
// for — forward-compatible with a future accessory option shipping in
// core/ data before its geometry lands here, same "degrade instead of
// throw" spirit as the skin/hair/shirt/pants color fallbacks above.
function buildUnknownAccessory() {
    const marker = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.1),
        new THREE.MeshStandardMaterial({ color: UNKNOWN_ACCESSORY_MARKER_COLOR })
    );
    marker.position.set(0.35, 1.4, 0);
    return marker;
}

const ACCESSORY_BUILDERS = {
    'glasses-01': buildGlassesAccessory,
    'hat-01': buildHatAccessory,
    'backpack-01': buildBackpackAccessory,
    'scarf-01': buildScarfAccessory
};

export class AvatarRenderer {
    // Builds a fresh avatar object graph. Returns:
    //   root      — the object a caller adds to/removes from the
    //               scene; its position/rotation.y are the ONLY
    //               things AvatarVisual ever writes on it directly
    //               (driven by AvatarPresence — see AvatarVisual.js).
    //   poseGroup — a child of root holding every body part; ALL pose
    //               (animation-driven) transforms apply only inside
    //               here, so "where is the avatar in the world" and
    //               "what pose is it striking" can never write to the
    //               same transform and fight each other.
    build(template, appearance) {
        const root = new THREE.Group();
        const poseGroup = new THREE.Group();
        root.add(poseGroup);

        const parts = {};

        const skinColor = SKIN_TONE_COLORS[appearance.skin] !== undefined
            ? SKIN_TONE_COLORS[appearance.skin]
            : DEFAULT_SKIN_COLOR;
        const head = new THREE.Mesh(
            new THREE.SphereGeometry(0.28, 12, 10),
            new THREE.MeshStandardMaterial({ color: skinColor })
        );
        head.position.y = 1.55;
        poseGroup.add(head);
        parts.head = head;

        if (template.hasComponent('hair')) {
            const hair = new THREE.Mesh(
                new THREE.SphereGeometry(0.3, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
                new THREE.MeshStandardMaterial({ color: hexColor(appearance.hairColor, DEFAULT_HAIR_COLOR) })
            );
            hair.position.y = 1.68;
            poseGroup.add(hair);
            parts.hair = hair;
        }

        if (template.hasComponent('shirt')) {
            const torso = new THREE.Mesh(
                new THREE.BoxGeometry(0.6, 0.7, 0.35),
                new THREE.MeshStandardMaterial({ color: hexColor(appearance.shirtColor, DEFAULT_SHIRT_COLOR) })
            );
            torso.position.y = 1.05;
            poseGroup.add(torso);
            parts.torso = torso;
        }

        if (template.hasComponent('pants')) {
            const legs = new THREE.Mesh(
                new THREE.BoxGeometry(0.55, 0.65, 0.32),
                new THREE.MeshStandardMaterial({ color: hexColor(appearance.pantsColor, DEFAULT_PANTS_COLOR) })
            );
            legs.position.y = 0.35;
            poseGroup.add(legs);
            parts.legs = legs;
        }

        if (template.hasComponent('accessories') && Array.isArray(appearance.accessories)) {
            appearance.accessories.forEach((accessoryId) => {
                const build = ACCESSORY_BUILDERS[accessoryId] || buildUnknownAccessory;
                const accessory = build();
                poseGroup.add(accessory);
                parts[`accessory:${accessoryId}`] = accessory;
            });
        }

        poseGroup.userData.avatarParts = parts;
        return { root, poseGroup };
    }

    // Applies a pose to an already-built poseGroup — never rebuilds
    // geometry, never touches root's own position/rotation (that
    // stays exclusively AvatarPresence's to decide). `animationTimeSeconds`
    // (0.2.36) lets WALKING/RUNNING read as an actual gait cycle
    // rather than one frozen frame — see core/AvatarPoseOffsets.js.
    applyPose(poseGroup, animation, animationTimeSeconds = 0) {
        const offsets = getAvatarPoseOffsets(animation, animationTimeSeconds);
        const parts = poseGroup.userData.avatarParts || {};
        if (parts.legs) {
            parts.legs.rotation.x = THREE.MathUtils.degToRad(offsets.legSplayDegrees);
        }
        if (parts.torso) {
            parts.torso.rotation.x = THREE.MathUtils.degToRad(offsets.bodyTiltDegrees);
        }
        if (parts.head) {
            parts.head.rotation.x = THREE.MathUtils.degToRad(offsets.headTiltDegrees);
        }
        poseGroup.position.y = offsets.hopHeight;
    }

    dispose(root) {
        root.traverse((object) => {
            if (object.geometry) {
                object.geometry.dispose();
            }
            if (object.material) {
                object.material.dispose();
            }
        });
    }
}
