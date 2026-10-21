import { interpretPlainCommand } from '../core/building/PlainCommand.js';
import { selectionEditingMethods } from '../application/editorSession/selectionEditingMethods.js';
import { plainCommandVocabulary } from '../ui/i18n/plainCommandWords.js';
import { setAppLocale } from '../ui/i18n/i18n.js';
import { SOURCE_LOCALE } from '../ui/i18n/locales.js';
import { assert } from './support/Assert.js';

// A request in plain words in the Editor's command palette
// (core/building/PlainCommand.js), read with each language's words
// (ui/i18n/plainCommandWords.js), and the Editor session's selectWhere(),
// which carries it out.

function read(query) {
    const plan = interpretPlainCommand(query, plainCommandVocabulary());
    return plan ? [plan.intent, plan.target.kind === 'part' ? plan.target.part : plan.target.kind, plan.colour || ''].join(' ').trim() : null;
}

// English.
{
    await setAppLocale(SOURCE_LOCALE);
    const expected = {
        'paint the roof red': 'paint roof roofRed',
        'select all the windows': 'select window',
        'delete the trees': 'delete tree',
        'remove the lanterns': 'delete lantern',
        'make the doors dark grey': 'paint door slate',
        'paint everything grey': 'paint everything stone',
        'paint all bricks red': 'paint everything roofRed',
        'paint it light blue': 'paint selection sky',
        'paint the windows blue': 'paint window harbor',
        'paint the trees light green': 'paint tree meadow',
        'the bushes green': 'paint bush leaf',
        'select all': 'select everything',
        'paint them yellow': 'paint selection sunflower'
    };
    for (const [query, plan] of Object.entries(expected)) {
        assert(read(query) === plan, `"${query}" is ${plan} (got ${read(query)})`);
    }
    for (const query of ['rotate', 'undo', 'turn it left', 'paint the roof', 'select', '', 'xyzzy']) {
        assert(read(query) === null, `"${query}" is no plain command, so the palette lists actions as before`);
    }
    console.log('✓ English plain commands');
}

// Every language reads its own.
{
    const cases = {
        de: [['das Dach rot streichen', 'paint roof roofRed'], ['alle Fenster auswählen', 'select window'], ['die Bäume löschen', 'delete tree']],
        es: [['pinta el techo de rojo', 'paint roof roofRed'], ['selecciona todas las ventanas', 'select window'], ['borra los árboles', 'delete tree']],
        fr: [['peins le toit en rouge', 'paint roof roofRed'], ['sélectionne toutes les fenêtres', 'select window'], ['supprime les arbres', 'delete tree']],
        id: [['cat atap jadi merah', 'paint roof roofRed'], ['pilih semua jendela', 'select window'], ['hapus pohon', 'delete tree']],
        ja: [['屋根を赤く塗って', 'paint roof roofRed'], ['窓を全部選択', 'select window'], ['木を削除して', 'delete tree'], ['扉を黄緑に塗る', 'paint door meadow']],
        ko: [['지붕을 빨갛게 칠해', 'paint roof roofRed'], ['창문을 모두 선택', 'select window'], ['나무를 삭제해', 'delete tree']],
        'pt-BR': [['pinte o telhado de vermelho', 'paint roof roofRed'], ['selecione todas as janelas', 'select window'], ['apague as árvores', 'delete tree']]
    };
    for (const [code, list] of Object.entries(cases)) {
        await setAppLocale(code);
        for (const [query, plan] of list) assert(read(query) === plan, `${code}: "${query}" is ${plan} (got ${read(query)})`);
    }
    await setAppLocale(SOURCE_LOCALE);
    console.log('✓ every language reads its own plain commands');
}

// selectWhere() selects the bricks a predicate picks, in one selection.
{
    const bricks = [{ id: 'a', definitionId: 'core:window_small' }, { id: 'b', definitionId: 'core:cube' }, { id: 'c', definitionId: 'core:window_large' }];
    let selected = null;
    let drawn = null;
    const session = {
        ...selectionEditingMethods,
        _documentManager: { document: { world: { getBuildings: () => [{ id: 'house', getBricks: () => bricks }] } } },
        _editorContext: { setSelection: (selection) => { selected = selection; } },
        _session: { selectBricks: (ids) => { drawn = ids; } }
    };
    const windows = (brick) => brick.definitionId.startsWith('core:window');
    assert(session.bricksWhere(windows).length === 2, 'bricksWhere() finds the windows');
    assert(session.selectWhere(windows) === 2 && selected.brickIds.join() === 'a,c' && drawn.join() === 'a,c', 'selectWhere() selects them and shows them selected');
    selected = null;
    assert(session.selectWhere(() => false) === 0 && selected === null, 'none found leaves the selection as it was');
    console.log('✓ selectWhere()');
}
