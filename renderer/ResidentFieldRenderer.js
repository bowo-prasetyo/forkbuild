import { AvatarRenderer } from './AvatarRenderer.js';
import { AvatarVisual } from './AvatarVisual.js';
import { residentFacingFor, RESIDENT_REACTION } from './ResidentReaction.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarInteractionKind } from '../core/AvatarInteractionKind.js';

// How long a resident's wave lasts.
const WAVE_SECONDS = 2.2;

// The walking stride of the avatar gait (core/AvatarPoseOffsets.js swings
// its legs at 2 cycles a second for an avatar walking 3 units a second):
// the ground one gait cycle covers. A resident's legs advance by the
// distance it actually walked, so they keep time with its slower stroll
// instead of scurrying.
const GROUND_PER_GAIT_SECOND = 3;

const RADIANS_TO_DEGREES = 180 / Math.PI;

// Draws World Residents: each one an ordinary avatar body
// (renderer/AvatarVisual.js) dressed as a resident, posed every frame from
// application/world/ResidentRuntime.js's poses. The resident counterpart of
// renderer/AnimalFieldRenderer.js.
//
// A resident's AvatarVisual is never registered anywhere an avatar's is:
// not in the facade's remote-avatar map, so it is never picked, inspected
// or listed as a person, and never hidden by "show other players".
//
// Also where a resident notices the viewer (renderer/ResidentReaction.js):
// the facing is stateless; the wave is the one piece of memory, per
// resident, kept only here and only for this viewer.
export class ResidentFieldRenderer {
    // `appearanceFor(id)` -> { template, appearance } dresses a resident;
    // `groundAt({ x, z })` -> { x, y, z } puts its feet on the ground.
    constructor({ appearanceFor, groundAt = ({ x, z }) => ({ x, y: 0, z }), avatarRenderer = new AvatarRenderer() } = {}) {
        this._appearanceFor = appearanceFor;
        this._groundAt = groundAt;
        this._avatarRenderer = avatarRenderer;
        this._entries = new Map(); // resident id -> { visual, last, waved, waveSeconds }
    }

    // Brings the drawn residents in line with `poses` (from
    // ResidentRuntime#posesNear()), watched by `observer` ({ x, z } or null).
    // Returns { added, removed }: the root objects a caller adds to and
    // removes from the scene.
    sync(poses, observer = null) {
        const added = [];
        const removed = [];
        const seen = new Set();
        for (const pose of poses) {
            seen.add(pose.id);
            let entry = this._entries.get(pose.id);
            if (!entry) {
                const { template, appearance } = this._appearanceFor(pose.id);
                const visual = new AvatarVisual(this._avatarRenderer);
                visual.setAppearance(template, appearance);
                entry = { visual, last: null, waved: false, waveSeconds: 0 };
                this._entries.set(pose.id, entry);
                added.push(visual.root);
            }
            this._pose(entry, pose, observer);
        }
        for (const [id, entry] of this._entries) {
            if (seen.has(id)) continue;
            removed.push(entry.visual.root);
            entry.visual.dispose();
            this._entries.delete(id);
        }
        return { added, removed };
    }

    // Advances every resident's animation clocks: the gait by the ground it
    // covered since the last frame, a wave by real time.
    tick(deltaSeconds) {
        for (const entry of this._entries.values()) {
            const walked = entry.walkedSinceTick || 0;
            entry.walkedSinceTick = 0;
            entry.visual.tick(entry.walking ? walked / GROUND_PER_GAIT_SECOND : deltaSeconds);
            if (entry.waveSeconds > 0) {
                entry.waveSeconds -= deltaSeconds;
                if (entry.waveSeconds <= 0) {
                    entry.visual.setGesture(null);
                }
            }
        }
    }

    getObject(id) {
        const entry = this._entries.get(id);
        return entry ? entry.visual.root : null;
    }

    trackedResidentIds() {
        return Array.from(this._entries.keys());
    }

    clear() {
        const removed = [];
        for (const entry of this._entries.values()) {
            removed.push(entry.visual.root);
            entry.visual.dispose();
        }
        this._entries.clear();
        return removed;
    }

    _pose(entry, pose, observer) {
        const { visual } = entry;
        const facing = residentFacingFor(pose, observer);
        visual.setPose(this._groundAt({ x: pose.x, z: pose.z }), { y: facing.rotationY * RADIANS_TO_DEGREES });
        visual.setAnimation(pose.moving ? AvatarAnimationState.WALKING : AvatarAnimationState.IDLE);

        entry.walking = pose.moving;
        if (entry.last) {
            entry.walkedSinceTick = (entry.walkedSinceTick || 0) + Math.hypot(pose.x - entry.last.x, pose.z - entry.last.z);
        }
        entry.last = { x: pose.x, z: pose.z };

        // One wave per approach: when you come close while it faces you.
        if (facing.distance > RESIDENT_REACTION.rearmRadius) {
            entry.waved = false;
        }
        if (!entry.waved && facing.distance < RESIDENT_REACTION.waveRadius && facing.attention >= RESIDENT_REACTION.waveAttention) {
            entry.waved = true;
            entry.waveSeconds = WAVE_SECONDS;
            visual.setGesture(AvatarInteractionKind.WAVE);
        }
        // Setting off (or turning away) ends a wave early.
        if (entry.waveSeconds > 0 && facing.attention < RESIDENT_REACTION.waveAttention / 2) {
            entry.waveSeconds = 0;
            visual.setGesture(null);
        }
    }
}
