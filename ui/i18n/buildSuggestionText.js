// Titles and a description to suggest for a build in Build Properties, made
// from what it is made of and what it changed from the build it remixes
// (core/catalog/BuildDescription.js). Suggestions only: the builder picks,
// changes or ignores them.
import { t } from './i18n.js';
import { libraryItemName } from './libraryText.js';
import { joined, remixChangesText, sentences, thingsOf } from './buildDescriptionText.js';

const MAX_TITLES = 5;

function structureName(id) {
    return libraryItemName({ id, name: id });
}

// The part there is most of, or null.
function mainPart(parts = []) {
    let best = null;
    for (const entry of parts) {
        if (!best || entry.count > best.count) best = entry;
    }
    return best ? best.part : null;
}

// Titles to suggest, best first, none the same as `currentTitle`.
// `facts` is describeBricks()'s, `changes` describeRemixChanges()'s from the
// build titled `parentTitle` it remixes (both optional for an original).
export function titleSuggestions({ facts, changes = null, parentTitle = null, currentTitle = '' } = {}) {
    const titles = [];
    if (parentTitle && changes?.changed) {
        const addedStructure = changes.added.structures?.[0];
        const addedPart = mainPart(changes.added.parts);
        if (addedStructure) titles.push(t('titleSuggestion.withStructure', { title: parentTitle, name: structureName(addedStructure.id) }));
        else if (addedPart) titles.push(t(`titleSuggestion.withPart.${addedPart}`, { title: parentTitle }));
    }
    const structures = facts?.structures || [];
    if (structures.length > 1) titles.push(joined(structures.slice(0, 3).map(({ id }) => structureName(id))));
    else if (structures.length === 1) titles.push(structureName(structures[0].id));
    const part = mainPart(facts?.parts);
    if (part) titles.push(t(`titleSuggestion.place.${part}`));
    if (facts?.colours?.length > 0) titles.push(t('titleSuggestion.colour', { colour: t(`villagePalette.${facts.colours[0]}`) }));
    const current = String(currentTitle || '').trim().toLowerCase();
    const seen = new Set();
    return titles.filter((title) => {
        const key = title.trim().toLowerCase();
        if (!key || key === current || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, MAX_TITLES);
}

// A description to suggest: what the build has, its main colours and, for a
// remix, what it changed from the build it remixes. Empty for an empty build.
export function descriptionSuggestion({ facts, changes = null, parentTitle = null } = {}) {
    if (!facts || !(facts.brickCount > 0)) return '';
    const said = [];
    const things = thingsOf(facts);
    if (things.length > 0) said.push(t('descriptionSuggestion.has', { things: joined(things) }));
    if (facts.colours?.length > 0) said.push(t('buildDescription.colours', { colours: joined(facts.colours.map((id) => t(`villagePalette.${id}`))) }));
    if (parentTitle && changes?.changed) said.push(t('descriptionSuggestion.remix', { title: parentTitle, changes: remixChangesText(changes, { lead: false }) }));
    return sentences(said);
}
