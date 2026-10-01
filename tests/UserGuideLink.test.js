import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOCALES, PSEUDO_LOCALE, SOURCE_LOCALE } from '../ui/i18n/locales.js';
import { userGuidePath, userGuideUrl } from '../ui/i18n/userGuide.js';
import { assert } from './support/Assert.js';

// The About page links to the user guide in the language the app is
// showing, and that guide exists for every language the app ships.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

{
    assert(userGuidePath(SOURCE_LOCALE) === 'docs/user/README.md', 'English uses the English guide');
    assert(userGuidePath(PSEUDO_LOCALE) === 'docs/user/README.md', 'the pseudo-locale reads as English');
    assert(userGuidePath('ja') === 'docs/user/ja/README.md', 'a translation uses its own guide');
    assert(userGuidePath('PT-br') === 'docs/user/pt-BR/README.md', 'codes match whatever their case');
    assert(userGuidePath('xx') === 'docs/user/README.md' && userGuidePath(null) === 'docs/user/README.md', 'an unknown locale falls back to English');
    assert(userGuideUrl('de') === 'https://github.com/bowo-prasetyo/forkbuild/blob/main/docs/user/de/README.md', 'the link points at the repository');
    console.log('✓ the user guide link follows the app\'s language');
}

{
    const missing = LOCALES.map((locale) => userGuidePath(locale.code)).filter((path) => !existsSync(join(root, path)));
    assert(missing.length === 0, `every shipped language has a user guide (missing: ${missing.join(', ')})`);
    console.log('✓ every shipped language has a user guide');
}
