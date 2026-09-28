// tests/support/StripHtmlComments.js removes every HTML comment from template
// text, including the ones a single replace pass would leave behind.
import { stripHtmlComments } from './support/StripHtmlComments.js';
import { assert } from './support/Assert.js';

assert(stripHtmlComments('<p>a</p><!-- note --><p>b</p>') === '<p>a</p><p>b</p>', 'a comment is removed');
assert(stripHtmlComments('<!-- one\n  spanning lines -->x<!--two-->y') === 'xy', 'several, across lines');
assert(!stripHtmlComments('<!<!-- a -->-- b -->c').includes('<!--'), 'a comment joined by removing another is removed too');
assert(stripHtmlComments('before<!-- never closed') === 'before', 'an unterminated comment runs to the end');
assert(stripHtmlComments('no comments -- here > <!') === 'no comments -- here > <!', 'text without comments is unchanged');
console.log('✓ stripHtmlComments leaves no <!-- behind');
