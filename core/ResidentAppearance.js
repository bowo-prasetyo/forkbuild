// What a World Resident looks like: an ordinary avatar appearance
// (core/AvatarTemplate.js) chosen from the resident's id, so everyone who
// opens the World sees the same resident in the same clothes, with nothing
// stored or sent. A resident is drawn with the same avatar renderer players
// are, but dressed from its own, homespun palette of earthy colors, so a
// crowd of residents reads as the people of a place rather than as players.

// Earthy work clothes and natural hair colors.
const SHIRT_COLORS = Object.freeze(['#8b5a2b', '#6b8e23', '#a0522d', '#556b2f', '#b8860b', '#7a6f5a', '#8fa37f', '#b5835a']);
const PANTS_COLORS = Object.freeze(['#4a3b2a', '#2f3f3f', '#5c4033', '#3a3f47', '#6b5b45']);
const HAIR_COLORS = Object.freeze(['#2b1b10', '#5a3825', '#b08d57', '#1a1a1a', '#8d8d8d', '#7b3f1d']);

// How often a resident wears a hat, when its template has one.
const HAT_CHANCE = 0.3;
const HAT = 'hat-01';

// The one template residents are built on. Any template with the usual
// components works; this is the full-featured core humanoid.
export const RESIDENT_TEMPLATE_ID = 'humanoid-01';

// FNV-1a, then one avalanche step per `salt`, in [0, 1).
function roll(id, salt) {
    let h = 0x811c9dc5;
    const text = `${id}#${salt}`;
    for (let i = 0; i < text.length; i++) {
        h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    }
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
}

function pick(list, id, salt) {
    return list[Math.floor(roll(id, salt) * list.length)];
}

// The appearance of resident `id` on `template` (an AvatarTemplate): each
// component the template has gets one of its own options, and each color
// one from the palettes above. A component the template lacks is left out,
// and the template's own defaults fill the rest, so any template works.
export function residentAppearanceFor(id, template) {
    const key = String(id);
    const appearance = {};
    for (const name of ['skin', 'hair', 'shirt', 'pants']) {
        const component = template.getComponent(name);
        if (component && component.options.length > 0) {
            appearance[name] = pick(component.options, key, name);
        }
    }
    const colors = { hair: HAIR_COLORS, shirt: SHIRT_COLORS, pants: PANTS_COLORS };
    for (const [name, palette] of Object.entries(colors)) {
        const component = template.getComponent(name);
        if (component && component.hasColor) {
            appearance[`${name}Color`] = pick(palette, key, `${name}Color`);
        }
    }
    const accessories = template.getComponent('accessories');
    if (accessories) {
        appearance.accessories = accessories.options.includes(HAT) && roll(key, 'hat') < HAT_CHANCE ? [HAT] : [];
    }
    return template.resolveEffectiveAppearance(appearance);
}
