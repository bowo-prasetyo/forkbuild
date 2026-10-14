import en from '../ui/i18n/messages/en.js';
import { assert } from './support/Assert.js';

// docs/Pillars.md, "Words": wherever a newcomer reads, the player's words
// (build, Publish, remix, structure), never the protocol's (document,
// creation, Shared World, Distribute, fork). The audit of 2026-10-12
// (docs/reviews/CreativeDirection-2026-10-12.md, finding 5) found them
// drifting back, so this fails when a "Not" word returns to the screens a
// newcomer meets first: the menu, Home, the Editor and its first-build guide,
// a shared link's page, Explore, the challenge and its plaza, Publish's own
// dialogs, and World View as a visitor sees it (the second audit of
// 2026-10-12, finding 5). Advanced pages (Publications, Network Settings) and
// World View's advanced panels keep their terms.

const PLAYER_NAMESPACES = Object.freeze([
    'app', 'homeView', 'featuredBuilds', 'aboutView', 'repositoryView',
    'editor', 'toolbar', 'documentInfo', 'firstBuild', 'starterJob', 'remixPermission', 'findability', 'loginModal',
    'publicationLink', 'share', 'forkFailure',
    'challenge', 'plaza',
    'publicationCatalog', 'publicationCard', 'helpedBuilds', 'builderView',
    'worldView', 'worldWelcomePanel', 'worldSearchPanel', 'worldFocusPanel', 'worldMapPanel', 'worldLocationBrowser',
    'worldPresenceIndicator', 'worldCollaboratorIndicator', 'nearbyAvatarsPanel'
]);

// World View's panels a click opens only with Show advanced tools on: a
// brick's inspection.
const ADVANCED_KEYS = new Set([
    'worldView.openTheReferencedDocumentIn'
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
    if (!PLAYER_NAMESPACES.includes(key.split('.')[0]) || ADVANCED_KEYS.has(key)) continue;
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

// There is no account, so nothing a newcomer meets says log in or out: the
// header says Choose a name or the player's name, with Switch name in its
// menu, and so do Publish, a walk or build link and My Avatar
// (docs/reviews/CreativeDirection-2026-10-12c.md).
{
    const namespaces = [...PLAYER_NAMESPACES, 'userWidget', 'walkTogether', 'buildTogether', 'avatarSettingsView'];
    const account = /\blog ?(?:in|out)\b|\blog-?(?:in|out)\b|\blogged (?:in|out)\b|\bsign(?:ed)? ?(?:in|out)\b/i;
    const saying = [];
    for (const [key, value] of Object.entries(en)) {
        if (!namespaces.includes(key.split('.')[0])) continue;
        for (const text of typeof value === 'string' ? [value] : Object.values(value || {})) {
            if (typeof text === 'string' && account.test(text)) saying.push(`${key}: ${text}`);
        }
    }
    assert(saying.length === 0, `say Choose a name or Switch name, never log in or out:\n  ${saying.join('\n  ')}`);
    assert(en['userWidget.chooseName'] === 'Choose a name' && en['userWidget.switchName'] === 'Switch name', 'the header offers Choose a name and Switch name');
    console.log('✓ nothing a newcomer meets says log in or out');
}

// Advanced screens too: nothing anywhere in the app says sign in or log in, or
// calls Explore the Repository (the user-guide audit of 2026-10-13, open item
// 5, found "Sign in" on commentary, Peers, Following, Conversations and Chat,
// and the Repository on My Worlds and a distribution result).
{
    const words = /\bsign(?:ed|ing)?[ -]?(?:in|out)\b|\blog(?:ged|ging)?[ -]?(?:in|out)\b|\blogin\b|\brepositor(?:y|ies)\b/i;
    const saying = [];
    for (const [key, value] of Object.entries(en)) {
        for (const text of typeof value === 'string' ? [value] : Object.values(value || {})) {
            if (typeof text === 'string' && words.test(text.replace(/\{[^}]*\}/g, ''))) saying.push(`${key}: ${text}`);
        }
    }
    assert(saying.length === 0, `say Choose a name and Explore everywhere, never sign in, log in or Repository:\n  ${saying.join('\n  ')}`);
    console.log('✓ no message anywhere says sign in, log in or Repository');
}

// The main menu names what a player does.
assert(en['app.nav.editor'] === 'Build' && en['app.nav.repository'] === 'Explore' && en['app.nav.walk'] === 'Walk', 'Build · Explore · Challenge · Walk in the menu');
console.log('✓ the menu says Build, Explore, Challenge and Walk');
