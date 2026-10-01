import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
    checkTranslations, githubSlug, headingAnchors, parseHeader, sourceHash, stampTranslation, updatePages
} from '../scripts/check-doc-translations.mjs';
import { assert } from './support/Assert.js';

// The translated user guides in this repository are in step with their
// English, link to headings that exist, and carry the right language links
// and out-of-date banners. When this fails after editing an English page,
// run: node scripts/check-doc-translations.mjs --update
{
    const { errors } = checkTranslations();
    assert(errors.length === 0, `docs/user translations:\n${errors.join('\n')}`);
    console.log('✓ the translated user guides pass the translation check');
}

// Anchors are worked out the way GitHub does, for English and for headings
// in other scripts.
{
    assert(githubSlug('Edit a Copy — taking something into the Editor') === 'edit-a-copy--taking-something-into-the-editor', 'an em dash leaves two hyphens');
    assert(githubSlug("Why can I place other people's builds?") === 'why-can-i-place-other-peoples-builds', 'punctuation is dropped');
    assert(githubSlug('Structures (Build Library) — Editor only') === 'structures-build-library--editor-only', 'brackets are dropped');
    assert(githubSlug('`Ctrl` and **bold** [link](x.md)') === 'ctrl-and-bold-link', 'markup is reduced to its text');
    assert(githubSlug('複製（エディターのみ）') === '複製エディターのみ', 'full-width brackets are dropped, Japanese kept');
    assert(githubSlug('Escape の優先順位（エディター）') === 'escape-の優先順位エディター', 'mixed scripts');
    const anchors = headingAnchors('# A\n\n## Camera\n\n```\n## Not a heading\n```\n\n### Camera\n');
    assert(anchors.has('camera') && anchors.has('camera-1'), 'a repeated heading gets a number');
    assert(!anchors.has('not-a-heading'), 'headings inside code blocks are ignored');
    console.log('✓ heading anchors follow GitHub');
}

// A translation goes out of date when its English changes, must then carry
// a banner, and is brought back in step by stamping it.
{
    const root = mkdtempSync(join(tmpdir(), 'forkbuild-doc-translations-'));
    const write = (path, text) => {
        mkdirSync(dirname(join(root, path)), { recursive: true });
        writeFileSync(join(root, path), text);
    };
    const read = (path) => readFileSync(join(root, path), 'utf8');
    try {
        const english = '# Guide\n\nIntro.\n\n## Saving your work\n\nPress Ctrl+S.\n';
        write('docs/user/Guide.md', english);
        write('docs/user/Other.md', '# Other\n');
        write('docs/user/ja/Guide.md', `<!-- translation-of: docs/user/Guide.md source-hash: ${sourceHash(english)} -->\n# ガイド\n\n[英語](../Guide.md#saving-your-work) · [保存](#作業を保存する)\n\n## 作業を保存する\n`);

        let result = checkTranslations(root);
        assert(result.errors.length === 2 && result.errors.every((error) => error.includes('--update')), 'missing language links are reported');
        assert(updatePages(root).length === 2, '--update writes both pages');
        assert(read('docs/user/Guide.md').includes('**English** · [日本語](ja/Guide.md)'), 'the English links to its translation');
        assert(read('docs/user/ja/Guide.md').includes('[English](../Guide.md) · **日本語**'), 'the translation links back');
        assert(sourceHash(read('docs/user/Guide.md')) === sourceHash(english), 'language links are not part of the hash');
        result = checkTranslations(root);
        assert(result.errors.length === 0 && result.stale.length === 0, 'in step after --update');

        write('docs/user/Guide.md', read('docs/user/Guide.md').replace('Press Ctrl+S.', 'Press Ctrl+S or click Save.'));
        result = checkTranslations(root);
        assert(result.stale.length === 1 && result.stale[0].path === 'docs/user/ja/Guide.md', 'a changed English puts its translation out of date');
        assert(result.errors.length === 1 && result.errors[0].includes('out-of-date banner'), 'an out-of-date page without a banner fails');
        updatePages(root);
        assert(read('docs/user/ja/Guide.md').includes('<!-- stale -->\n> **注意:**'), '--update adds the banner');
        assert(checkTranslations(root).errors.length === 0, 'with its banner, an out-of-date page passes');

        stampTranslation('docs/user/ja/Guide.md', root);
        updatePages(root);
        assert(!read('docs/user/ja/Guide.md').includes('<!-- stale -->'), 'stamping takes the banner away');
        assert(parseHeader(read('docs/user/ja/Guide.md')).hash === sourceHash(read('docs/user/Guide.md')), 'stamping records the current hash');
        result = checkTranslations(root);
        assert(result.errors.length === 0 && result.stale.length === 0, 'in step after stamping');

        write('docs/user/ja/Guide.md', read('docs/user/ja/Guide.md') + '\n[x](../Missing.md) [y](../Other.md#nowhere) [z](#作業を保存する)\n');
        result = checkTranslations(root);
        assert(result.errors.length === 2, 'a missing page and a missing heading are reported, a good anchor is not');
        assert(result.errors.some((error) => error.includes('Missing.md')) && result.errors.some((error) => error.includes('#nowhere')), 'each broken link is named');

        write('docs/user/ja/Broken.md', '# 見出しなし\n');
        assert(checkTranslations(root).errors.some((error) => error.includes('Broken.md: the first line')), 'a translation without its header is reported');
        console.log('✓ out-of-date translations get a banner until they are stamped');
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
}
