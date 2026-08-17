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
const ACCESSORY_MARKER_COLOR = 0xffd54f;

function hexColor(value, fallback) {
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
        ? new THREE.Color(value)
        : new THREE.Color(fallback);
}

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
            appearance.accessories.forEach((accessoryId, index) => {
                const marker = new THREE.Mesh(
                    new THREE.BoxGeometry(0.1, 0.1, 0.1),
                    new THREE.MeshStandardMaterial({ color: ACCESSORY_MARKER_COLOR })
                );
                marker.position.set(0.35, 1.4 - index * 0.15, 0);
                poseGroup.add(marker);
                parts[`accessory:${accessoryId}`] = marker;
            });
        }

        poseGroup.userData.avatarParts = parts;
        return { root, poseGroup };
    }

    // Applies a STATIC pose to an already-built poseGroup — never
    // rebuilds geometry, never touches root's own position/rotation
    // (that stays exclusively AvatarPresence's to decide).
    applyPose(poseGroup, animation) {
        const offsets = getAvatarPoseOffsets(animation);
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
