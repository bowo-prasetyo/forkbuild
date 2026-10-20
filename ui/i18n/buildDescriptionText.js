// A build's description and a remix's changes (core/catalog/BuildDescription.js)
// as sentences in the chosen language: for a screen reader on the picture of
// a build, the Editor's Describe the Build, and "What changed" under a
// shared build's "Remixed from".
import { intlLocale, t } from './i18n.js';
import { libraryItemName } from './libraryText.js';

// "A, B and C", the language's way.
function joined(items) {
    try {
        return new Intl.ListFormat(intlLocale(), { type: 'conjunction', style: 'long' }).format(items);
    } catch {
        return items.join(', ');
    }
}

// Sentences one after another; Japanese and Chinese ones need no space.
function sentences(list) {
    return list.join(' ').replace(/([。！？]) /g, '$1');
}

function thingsOf({ structures = [], parts = [] }) {
    return [
        ...structures.map(({ id, count }) => t('buildDescription.structure', { count, name: libraryItemName({ id, name: id }) })),
        ...parts.map(({ part, count }) => t(`buildDescription.part.${part}`, { count }))
    ];
}

function colourName(id) {
    return t(`villagePalette.${id}`);
}

// What a build is made of, in a few sentences.
export function buildDescriptionText(facts) {
    if (!facts || !(facts.brickCount > 0)) return t('buildDescription.empty');
    const { brickCount, size } = facts;
    const said = [t('buildDescription.summary', { count: brickCount, width: size.width, depth: size.depth, height: size.height })];
    const things = thingsOf(facts);
    if (things.length > 0) said.push(t('buildDescription.has', { things: joined(things) }));
    if (facts.colours?.length > 0) said.push(t('buildDescription.colours', { colours: joined(facts.colours.map(colourName)) }));
    return sentences(said);
}

// What a remix changed, in a sentence or three; null when it isn't known.
export function remixChangesText(changes) {
    if (!changes) return null;
    if (!changes.changed) return t('remixChanges.none');
    const said = [];
    const { added, repainted, removed } = changes;
    if (added.brickCount > 0) {
        const things = thingsOf(added);
        if (things.length > 0) {
            if (added.otherBricks > 0) things.push(t('remixChanges.otherBricks', { count: added.otherBricks }));
            said.push(t('remixChanges.added', { things: joined(things) }));
        } else {
            said.push(t('remixChanges.addedBricks', { count: added.brickCount }));
        }
    }
    if (repainted.brickCount > 0) {
        said.push(repainted.colours?.length > 0
            ? t('remixChanges.repaintedTo', { count: repainted.brickCount, colour: colourName(repainted.colours[0]) })
            : t('remixChanges.repainted', { count: repainted.brickCount }));
    }
    if (removed.brickCount > 0) said.push(t('remixChanges.removed', { count: removed.brickCount }));
    return t('remixChanges.lead', { changes: sentences(said) });
}
