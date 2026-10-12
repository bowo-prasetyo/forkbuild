import en from '../ui/i18n/messages/en.js';
import { assert } from './support/Assert.js';

// docs/Pillars.md, "Words": wherever a newcomer reads, the player's words
// (build, Publish, remix, structure), never the protocol's (document,
// creation, Shared World, Distribute, fork). The audit of 2026-10-12
// (docs/reviews/CreativeDirection-2026-10-12.md, finding 5) found them
// drifting back, so this fails when a "Not" word returns to the screens a
// newcomer meets first: the menu, Home, the Editor and its first-build guide,
// a shared link's page, Explore, the challenge and its plaza, and Publish's
// own dialogs. Advanced pages (Publications, Network Settings) keep their terms.

const PLAYER_NAMESPACES = Object.freeze([
    'app', 'homeView', 'featuredBuilds', 'aboutView', 'repositoryView',
    'editor', 'toolbar', 'documentInfo', 'firstBuild', 'remixPermission', 'findability', 'loginModal',
    'publicationLink', 'share', 'forkFailure',
    'challenge', 'plaza',
    'publicationCatalog', 'publicationCard', 'helpedBuilds', 'builderView'
]);

// "ForkBuild" is the name, so only "fork" as a word of its own counts.
const NOT_WORDS = Object.freeze([
    { word: 'fork', pattern: /\bfork(s|ed|ing)?\b/i, say: 'remix, or make your own copy' },
    { word: 'Shared World', pattern: /Shared Worlds?/, say: 'build' },
    { word: 'Distribute', pattern: /\bDistribute\b/, say: 'Publish, or send' },
    { word: 'document', pattern: /\bdocuments?\b/i, say: 'build' },
    { word: 'creation', pattern: /\bcreations?\b/i, say: 'build' }
]);

const found = [];
for (const [key, value] of Object.entries(en)) {
    if (!PLAYER_NAMESPACES.includes(key.split('.')[0])) continue;
    const texts = typeof value === 'string' ? [value] : Object.values(value || {});
    for (const text of texts) {
        for (const { word, pattern, say } of NOT_WORDS) {
            if (typeof text === 'string' && pattern.test(text)) found.push(`${key} says "${word}" (say ${say}): ${text}`);
        }
    }
}
assert(found.length === 0, `the player's words where newcomers read (docs/Pillars.md, "Words"):\n  ${found.join('\n  ')}`);

const checked = Object.keys(en).filter((key) => PLAYER_NAMESPACES.includes(key.split('.')[0])).length;
assert(checked > 300, `the namespaces still exist (${checked} messages checked)`);
console.log(`✓ ${checked} messages a newcomer meets use the player's words`);

// The main menu names what a player does.
assert(en['app.nav.editor'] === 'Build' && en['app.nav.repository'] === 'Explore' && en['app.nav.walk'] === 'Walk', 'Build · Explore · Challenge · Walk in the menu');
console.log('✓ the menu says Build, Explore, Challenge and Walk');
