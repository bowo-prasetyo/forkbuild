import { readFile } from 'node:fs/promises';
import { guideChapterFiles, guideIndex, guideSections, headingSlug, plainText, questionTerms, searchGuide } from '../core/help/GuideSearch.js';
import { GuideLibrary } from '../application/help/GuideLibrary.js';
import { splitWordList } from '../core/library/LibrarySearch.js';
import { headingAnchors } from '../scripts/check-doc-translations.mjs';
import { setAppLocale, t } from '../ui/i18n/i18n.js';
import { LOCALES, SOURCE_LOCALE } from '../ui/i18n/locales.js';
import { userGuideDirectory, userGuideSectionUrl } from '../ui/i18n/userGuide.js';
import { assert } from './support/Assert.js';

// Help: a question answered from the user guide (core/help/GuideSearch.js),
// read as this site serves it (application/help/GuideLibrary.js), in every
// language, against the real guides in docs/user/.

const fromDisk = new GuideLibrary({ fetchText: (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8') });

// Reading Markdown.
{
    assert(plainText('See [the guide](x.md) and **bold**, *it*, `code` <b>tag</b>.') === 'See the guide and bold, it, code tag.', 'links, emphasis, code and tags become their words');
    assert(plainText('| **T** | Tilt |') === 'T — Tilt' && plainText('|---|---|') === '', 'a table row reads as its cells; its rule is dropped');
    const sections = guideSections('# 02 — The Editor\n\n<!-- languages -->\n**English** · [Deutsch](de/x.md)\n<!-- /languages -->\n\nIntro.\n\n## Undo\n\nPress **Ctrl+Z**.\n\n```\n## not a heading\n```\n\n## Undo\n\nAgain.\n', '02.md');
    assert(sections.length === 3 && sections[0].heading === '02 — The Editor' && sections[0].paragraphs.join() === 'Intro.', 'one section a heading, the language links left out');
    assert(sections[1].anchor === 'undo' && sections[2].anchor === 'undo-1' && sections[1].paragraphs[0] === 'Press Ctrl+Z.', 'anchors repeat as GitHub\'s do; code blocks are not headings');
    assert(sections.every((section) => section.chapter === '02 — The Editor' && section.file === '02.md'), 'each knows its chapter');
    const markdown = await readFile(new URL('../docs/user/02-TheEditor.md', import.meta.url), 'utf8');
    const anchors = headingAnchors(markdown);
    assert(guideSections(markdown, '02-TheEditor.md').every((section) => anchors.has(section.anchor)), 'every anchor is one the guide\'s link check knows');
    assert(headingSlug('Build with me: building together, live') === 'build-with-me-building-together-live', 'a heading\'s anchor');
    assert(guideChapterFiles('[a](01-A.md) [b](02-B.md#x) [c](../Other.md) [d](01-A.md) [e](README.md)').join() === '01-A.md,02-B.md', 'chapters are the contents page\'s own links, once each');
    console.log('✓ reading the guide');
}

// Searching.
{
    assert(questionTerms('How do I tilt a brick?', ['how']).join() === 'tilt,brick', 'a question\'s words, without short ones and ignored ones');
    assert(questionTerms('ブロックを倒すには？', ['には']).includes('倒す') && !questionTerms('ブロックを倒すには？', ['には']).includes('には'), 'Japanese is searched by pairs of letters');
    const index = guideIndex([
        { file: 'a.md', chapter: 'A', heading: 'Moving and tilting', anchor: 'moving', paragraphs: ['T tilts a brick onto its next side.', 'Moving bricks.'] },
        { file: 'a.md', chapter: 'A', heading: 'Brick colours', anchor: 'colours', paragraphs: ['Paint a brick any color.'] },
        { file: 'a.md', chapter: 'A', heading: 'Bricks', anchor: 'bricks', paragraphs: ['Every brick is a brick.'] }
    ]);
    const tilt = searchGuide('how do I tilt a brick', index, { ignoredWords: ['how'] });
    assert(tilt[0].section.anchor === 'moving' && tilt[0].snippet === 'T tilts a brick onto its next side.', 'the rare word decides, and the snippet is the paragraph that has it');
    assert(searchGuide('change the colour', index)[0].section.anchor === 'colours', 'a spelling one letter apart still matches');
    assert(searchGuide('zebra', index).length === 0 && searchGuide('', index).length === 0, 'nothing found, nothing shown');
    assert(userGuideSectionUrl('de', '02-TheEditor.md', 'gruppen').endsWith('/docs/user/de/02-TheEditor.md#gruppen') && userGuideDirectory('en') === 'docs/user', 'a section links to its place in the guide');
    console.log('✓ searching');
}

// Every language: its own examples, and its placeholder, find the sections
// that answer them in its own guide.
{
    const expected = {
        en: ['Moving, rotating, and deleting', 'Undo and redo'],
        de: ['Verschieben, drehen und löschen', 'Rückgängig und Wiederholen'],
        es: ['Mover, girar y eliminar', 'Deshacer y rehacer'],
        fr: ['Déplacer, faire pivoter et supprimer', 'Annuler et rétablir'],
        id: ['Memindahkan, memutar, dan menghapus', 'Urungkan dan ulangi'],
        ja: ['移動、回転、削除', '元に戻す・やり直す'],
        ko: ['이동, 회전, 삭제', '실행 취소와 다시 실행'],
        'pt-BR': ['Mover, girar e excluir', 'Desfazer e refazer']
    };
    for (const { code } of LOCALES.filter((locale) => expected[locale.code])) {
        await setAppLocale(code);
        const guide = await fromDisk.load(userGuideDirectory(code));
        assert(guide.chapters.length >= 15 && guide.index.entries.length > 200, `${code}: the whole guide is read (${guide.chapters.length} chapters)`);
        const ignoredWords = splitWordList(t('help.ignoredWords'));
        const examples = splitWordList(t('help.examples'));
        assert(examples.length === 4 && examples[0] === t('help.placeholder'), `${code}: four examples, the first the placeholder`);
        for (const [i, heading] of expected[code].entries()) {
            const answers = searchGuide(examples[i], guide.index, { ignoredWords });
            assert(answers[0]?.section.heading === heading, `${code}: "${examples[i]}" is answered by "${heading}" (got "${answers[0]?.section.heading}")`);
        }
        for (const example of examples) {
            assert(searchGuide(example, guide.index, { ignoredWords }).length > 0, `${code}: "${example}" finds something`);
        }
    }
    await setAppLocale(SOURCE_LOCALE);
    console.log('✓ every language answers its own examples from its own guide');
}

// The library reads a guide once, and a chapter it can't read is left out.
{
    let reads = 0;
    const files = { 'g/README.md': '[A](01-A.md) [B](02-B.md)', 'g/01-A.md': '# A\n\n## Tilt\n\nTilting.' };
    const library = new GuideLibrary({ fetchText: async (path) => { reads += 1; if (!(path in files)) throw new Error('missing'); return files[path]; } });
    const guide = await library.load('g');
    await library.load('g');
    assert(reads === 3 && guide.chapters.join() === '01-A.md,02-B.md' && guide.index.entries.length === 2, 'read once; the missing chapter left out');
    let failed = false;
    try {
        await new GuideLibrary({ fetchText: async () => { throw new Error('offline'); } }).load('g');
    } catch {
        failed = true;
    }
    assert(failed, 'no contents page, no guide');
    console.log('✓ the guide library');
}
