import { SignatureType } from '../publication/Signature.js';
import { createId } from '../document/createId.js';

// Saying something aloud in World View: a short typed line shown in a bubble
// over your avatar, and in a short log, for the people who can see your avatar
// (its presence's own visibility; blocked people never). An EVENT, like a
// gesture (core/avatar/AvatarInteractionAdvertisement.js): sent once, never
// republished or stored, so someone who arrives later never catches up on it
// and nothing of it is kept once it has faded. Pure: no transport, no signing
// key (application/avatar/AvatarSaySigning.js signs it).

// At most this many characters: a line to say while walking, not a letter.
export const MAX_SAY_CHARACTERS = 140;
// One line at most this often, so nobody can fill the view with bubbles.
export const SAY_COOLDOWN_MS = 800;
// How many recent lines the log keeps.
export const SAY_LOG_LIMIT = 6;
// How long a line stays in the log after it was said.
export const SAY_LOG_SECONDS = 60;
// How long a bubble stays over the speaker: longer for longer lines, as a
// resident's does (core/world/ResidentTalk.js).
const BUBBLE_MIN_SECONDS = 4;
const BUBBLE_MAX_SECONDS = 10;
const BUBBLE_SECONDS_PER_WORD = 0.4;

// The line as it is said and shown: control characters out, runs of
// whitespace one space, trimmed, and cut to MAX_SAY_CHARACTERS (counted in
// characters, so an emoji is never split). '' when nothing is left.
export function normalizeSayText(text) {
    if (typeof text !== 'string') return '';
    const cleaned = text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim();
    return Array.from(cleaned).slice(0, MAX_SAY_CHARACTERS).join('').trim();
}

export function canSayAgain(lastSaidAt, now) {
    return !Number.isFinite(lastSaidAt) || now - lastSaidAt >= SAY_COOLDOWN_MS;
}

export function sayBubbleSecondsFor(text) {
    const words = String(text || '').split(/\s+/).filter(Boolean).length;
    return Math.min(BUBBLE_MAX_SECONDS, Math.max(BUBBLE_MIN_SECONDS, 2 + words * BUBBLE_SECONDS_PER_WORD));
}

export function toAvatarSayAdvertisement({ avatarId, ownerIdentity, text, sequence, timestamp = Date.now() }) {
    return { avatarId, ownerIdentity, sayId: createId(), text, sequence, timestamp };
}

export function isValidAvatarSayAdvertisement(value) {
    return Boolean(value) && typeof value === 'object'
        && typeof value.avatarId === 'string' && value.avatarId.length > 0
        && typeof value.sayId === 'string' && value.sayId.length > 0
        && typeof value.text === 'string' && value.text.length > 0 && normalizeSayText(value.text) === value.text
        && Number.isFinite(value.sequence)
        && Number.isFinite(value.timestamp);
}

export function getAvatarSaySigningDescriptor(advertisement) {
    return {
        type: SignatureType.AVATAR_SAY,
        id: advertisement.avatarId,
        revision: advertisement.sequence,
        payload: {
            avatarId: advertisement.avatarId,
            ownerIdentity: advertisement.ownerIdentity,
            sayId: advertisement.sayId,
            text: advertisement.text,
            sequence: advertisement.sequence,
            timestamp: advertisement.timestamp
        }
    };
}
