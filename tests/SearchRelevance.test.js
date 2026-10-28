import { readFile } from 'node:fs/promises';
import { GuideLibrary } from '../application/help/GuideLibrary.js';
import { searchGuide } from '../core/help/GuideSearch.js';
import { interpretPlainCommand } from '../core/building/PlainCommand.js';
import { splitWordList } from '../core/library/LibrarySearch.js';
import { CoreLibrary } from '../core/library/CoreLibrary.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { CollectionLibrary } from '../core/library/CollectionLibrary.js';
import { BRICK_SEARCH, STRUCTURE_SEARCH, foundIds } from '../ui/components/BuildLibraryPanel.js';
import { librarySearchIgnoredWords } from '../ui/i18n/libraryText.js';
import { plainCommandVocabulary } from '../ui/i18n/plainCommandWords.js';
import { setAppLocale, t } from '../ui/i18n/i18n.js';
import { LOCALES, SOURCE_LOCALE } from '../ui/i18n/locales.js';
import { assert } from './support/Assert.js';

// How well the app's three searches answer what a player types, in every
// language it speaks: Help's questions to the user guide
// (core/help/GuideSearch.js), the Editor palette's plain commands
// (core/building/PlainCommand.js), and the Build Library's descriptions
// (core/library/LibrarySearch.js). GuideHelp, PlainCommand and LibrarySearch
// test how each works; these sets measure how often it gets the answer
// right, asked in a player's own words rather than the words each search
// was written with.
//
// Each language is held at what it scores now (its floor): a change that
// loses an answer fails here, and one that wins answers should raise the
// floor. Add questions players really ask, with the answers a person would
// give; never reword a question until it passes.

// The languages the app speaks, not its pseudo-locale (ui/i18n/pseudoLocalize.js).
const CODES = LOCALES.filter((entry) => !entry.pseudo).map((entry) => entry.code);
const rate = (part, whole) => `${part}/${whole} (${Math.round((100 * part) / whole)}%)`;

// ---- Help: questions to the user guide -------------------------------------
// The right answers are sections, as <chapter file>#<its place in that file>:
// every language's guide has the same sections in the same order
// (scripts/check-doc-translations.mjs keeps them in step). Right is a right
// section among the first two shown.
const GUIDE_QUESTIONS = [
    [["02-TheEditor#9", "InteractiveTransformGizmo#4", "ControlsReference#12"],
        {"en": "How do I rotate a brick?", "de": "Wie drehe ich einen Stein?", "es": "¿Cómo giro un bloque?", "fr": "Comment faire pivoter une brique ?", "id": "Bagaimana cara memutar balok?", "ja": "ブロックを回転させるには?", "ko": "블록을 회전하려면?", "pt-BR": "Como faço para girar uma peça?"}],
    [["02-TheEditor#10"],
        {"en": "How do I change the colour of a brick?", "de": "Wie ändere ich die Farbe eines Steins?", "es": "¿Cómo cambio el color de un bloque?", "fr": "Comment changer la couleur d'une brique ?", "id": "Bagaimana cara mengubah warna balok?", "ja": "ブロックの色を変えるには?", "ko": "블록 색을 바꾸려면?", "pt-BR": "Como mudo a cor de uma peça?"}],
    [["02-TheEditor#13", "ControlsReference#22"],
        {"en": "How can I undo a mistake?", "de": "Wie mache ich einen Fehler rückgängig?", "es": "¿Cómo deshago un error?", "fr": "Comment annuler une erreur ?", "id": "Bagaimana cara mengurungkan kesalahan?", "ja": "間違えた操作を元に戻すには?", "ko": "실수를 되돌리려면?", "pt-BR": "Como desfaço um erro?"}],
    [["01-GettingStarted#5", "02-TheEditor#24"],
        {"en": "How do I save my work?", "de": "Wie speichere ich meine Arbeit?", "es": "¿Cómo guardo mi trabajo?", "fr": "Comment enregistrer mon travail ?", "id": "Bagaimana cara menyimpan pekerjaan saya?", "ja": "作品を保存するには?", "ko": "작업을 저장하려면?", "pt-BR": "Como salvo meu trabalho?"}],
    [["04-PublishingAndForking#1", "02-TheEditor#24"],
        {"en": "How do I publish my build?", "de": "Wie veröffentliche ich mein Bauwerk?", "es": "¿Cómo publico mi construcción?", "fr": "Comment publier ma construction ?", "id": "Bagaimana cara menerbitkan bangunan saya?", "ja": "作品を公開するには?", "ko": "작품을 게시하려면?", "pt-BR": "Como publico minha construção?"}],
    [["04-PublishingAndForking#3", "04-PublishingAndForking#9", "04-PublishingAndForking#8", "FAQ#5"],
        {"en": "How do I share my build with a friend?", "de": "Wie teile ich mein Bauwerk mit einem Freund?", "es": "¿Cómo comparto mi construcción con un amigo?", "fr": "Comment partager ma construction avec un ami ?", "id": "Bagaimana cara berbagi bangunan dengan teman?", "ja": "作品を友だちに共有するには?", "ko": "친구에게 작품을 공유하려면?", "pt-BR": "Como compartilho minha construção com um amigo?"}],
    [["FAQ#35"],
        {"en": "Can I use ForkBuild offline?", "de": "Kann ich ForkBuild offline nutzen?", "es": "¿Puedo usar ForkBuild sin conexión?", "fr": "Puis-je utiliser ForkBuild hors ligne ?", "id": "Bisakah ForkBuild dipakai secara offline?", "ja": "ForkBuildはオフラインで使えますか?", "ko": "오프라인에서도 ForkBuild를 쓸 수 있나요?", "pt-BR": "Posso usar o ForkBuild offline?"}],
    [["13-YourData#3", "13-YourData#5"],
        {"en": "How do I back up my builds?", "de": "Wie sichere ich meine Bauwerke?", "es": "¿Cómo hago una copia de seguridad de mis construcciones?", "fr": "Comment sauvegarder mes constructions ?", "id": "Bagaimana cara mencadangkan bangunan saya?", "ja": "作品をバックアップするには?", "ko": "작품을 백업하려면?", "pt-BR": "Como faço backup das minhas construções?"}],
    [["FAQ#17", "13-YourData#2"],
        {"en": "How do I move my work to another computer?", "de": "Wie bringe ich meine Arbeit auf einen anderen Computer?", "es": "¿Cómo paso mi trabajo a otra computadora?", "fr": "Comment transférer mon travail sur un autre ordinateur ?", "id": "Bagaimana cara memindahkan pekerjaan saya ke komputer lain?", "ja": "別のパソコンに作品を移すには?", "ko": "다른 컴퓨터로 작업을 옮기려면?", "pt-BR": "Como passo meu trabalho para outro computador?"}],
    [["04-PublishingAndForking#2", "03-WorldView#5"],
        {"en": "How do I walk inside my build?", "de": "Wie laufe ich in meinem Bauwerk herum?", "es": "¿Cómo camino dentro de mi construcción?", "fr": "Comment me promener dans ma construction ?", "id": "Bagaimana cara berjalan di dalam bangunan saya?", "ja": "作品の中を歩くには?", "ko": "내 작품 안을 걸어 다니려면?", "pt-BR": "Como ando dentro da minha construção?"}],
    [["04-PublishingAndForking#22", "04-PublishingAndForking#21"],
        {"en": "How do I remix someone else's build?", "de": "Wie remixe ich das Bauwerk von jemand anderem?", "es": "¿Cómo remezclo la construcción de otra persona?", "fr": "Comment remixer la construction de quelqu'un d'autre ?", "id": "Bagaimana cara me-remix bangunan orang lain?", "ja": "他の人の作品をリミックスするには?", "ko": "다른 사람의 작품을 리믹스하려면?", "pt-BR": "Como faço um remix da construção de outra pessoa?"}],
    [["04-PublishingAndForking#26"],
        {"en": "How do I join the weekly challenge?", "de": "Wie mache ich bei der Wochen-Challenge mit?", "es": "¿Cómo participo en el desafío semanal?", "fr": "Comment participer au défi de la semaine ?", "id": "Bagaimana cara ikut tantangan mingguan?", "ja": "週間チャレンジに参加するには?", "ko": "주간 챌린지에 참여하려면?", "pt-BR": "Como participo do desafio da semana?"}],
    [["04-PublishingAndForking#3"],
        {"en": "How do I make a video of my build?", "de": "Wie mache ich ein Video von meinem Bauwerk?", "es": "¿Cómo hago un vídeo de mi construcción?", "fr": "Comment faire une vidéo de ma construction ?", "id": "Bagaimana cara membuat video bangunan saya?", "ja": "作品の動画を作るには?", "ko": "작품 영상을 만들려면?", "pt-BR": "Como faço um vídeo da minha construção?"}],
    [["FAQ#36", "02-TheEditor#26"],
        {"en": "Can I 3D print my build?", "de": "Kann ich mein Bauwerk mit einem 3D-Drucker drucken?", "es": "¿Puedo imprimir mi construcción en 3D?", "fr": "Puis-je imprimer ma construction en 3D ?", "id": "Bisakah saya mencetak 3D bangunan saya?", "ja": "作品を3Dプリントできますか?", "ko": "작품을 3D 프린팅할 수 있나요?", "pt-BR": "Posso imprimir minha construção em 3D?"}],
    [["08-ChatAndConversations#1", "08-ChatAndConversations#3", "FAQ#31"],
        {"en": "How do I chat with a friend?", "de": "Wie chatte ich mit einem Freund?", "es": "¿Cómo chateo con un amigo?", "fr": "Comment discuter avec un ami ?", "id": "Bagaimana cara mengobrol dengan teman?", "ja": "友だちとチャットするには?", "ko": "친구와 채팅하려면?", "pt-BR": "Como converso com um amigo?"}],
    [["06-AvatarsAndPresence#1"],
        {"en": "How do I change my avatar?", "de": "Wie ändere ich meinen Avatar?", "es": "¿Cómo cambio mi avatar?", "fr": "Comment modifier mon avatar ?", "id": "Bagaimana cara mengubah avatar saya?", "ja": "アバターを変えるには?", "ko": "아바타를 바꾸려면?", "pt-BR": "Como mudo meu avatar?"}],
    [["02-TheEditor#29", "03-WorldView#11"],
        {"en": "How do I use voice commands?", "de": "Wie benutze ich Sprachbefehle?", "es": "¿Cómo uso los comandos de voz?", "fr": "Comment utiliser les commandes vocales ?", "id": "Bagaimana cara memakai perintah suara?", "ja": "音声コマンドの使い方は?", "ko": "음성 명령은 어떻게 쓰나요?", "pt-BR": "Como uso os comandos de voz?"}],
    [["FAQ#15", "05-IdentityAndLogin#7"],
        {"en": "I forgot my passphrase", "de": "Ich habe meine Passphrase vergessen", "es": "Olvidé mi frase de contraseña", "fr": "J'ai oublié ma phrase secrète", "id": "Saya lupa frasa sandi saya", "ja": "パスフレーズを忘れました", "ko": "패스프레이즈를 잊어버렸어요", "pt-BR": "Esqueci minha frase secreta"}],
    [["FAQ#7", "04-PublishingAndForking#11"],
        {"en": "Why can't anyone remix my build?", "de": "Warum kann niemand mein Bauwerk remixen?", "es": "¿Por qué nadie puede remezclar mi construcción?", "fr": "Pourquoi personne ne peut remixer ma construction ?", "id": "Kenapa tidak ada yang bisa me-remix bangunan saya?", "ja": "なぜ誰も私の作品をリミックスできないの?", "ko": "왜 아무도 내 작품을 리믹스할 수 없나요?", "pt-BR": "Por que ninguém consegue fazer remix da minha construção?"}],
    [["02-TheEditor#14", "ControlsReference#19"],
        {"en": "How do I group bricks together?", "de": "Wie gruppiere ich Steine?", "es": "¿Cómo agrupo bloques?", "fr": "Comment grouper des briques ?", "id": "Bagaimana cara membuat grup balok?", "ja": "ブロックをグループにするには?", "ko": "블록을 그룹으로 묶으려면?", "pt-BR": "Como agrupo peças?"}],
    [["FAQ#34", "02-TheEditor#32"],
        {"en": "Does ForkBuild work on a phone?", "de": "Funktioniert ForkBuild auf dem Handy?", "es": "¿ForkBuild funciona en el móvil?", "fr": "ForkBuild fonctionne-t-il sur un téléphone ?", "id": "Apakah ForkBuild bisa dipakai di ponsel?", "ja": "ForkBuildはスマホで使えますか?", "ko": "ForkBuild를 휴대폰에서 쓸 수 있나요?", "pt-BR": "O ForkBuild funciona no celular?"}]
];
// Measured 2026-10-28. Missed in every language: "how do I remix" and
// "change my avatar", whose topic word is in more than a sixth of the guide
// and so is left out of the search.
const GUIDE_FLOOR = { en: 18, de: 17, es: 15, fr: 16, id: 16, ja: 15, ko: 15, 'pt-BR': 18 };

{
    const fromDisk = new GuideLibrary({ fetchText: (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8') });
    assert(CODES.every((code) => GUIDE_QUESTIONS.every(([, asked]) => asked[code])), '1. every question is asked in every language');
    const scores = [];
    for (const code of CODES) {
        await setAppLocale(code);
        const { index } = await fromDisk.load(code === SOURCE_LOCALE ? 'docs/user' : `docs/user/${code}`);
        const place = new Map();
        const seen = {};
        for (const { section } of index.entries) {
            const file = section.file.replace(/\.md$/, '');
            seen[file] = (seen[file] ?? -1) + 1;
            place.set(section, `${file}#${seen[file]}`);
        }
        const ignoredWords = splitWordList(t('help.ignoredWords'));
        const right = GUIDE_QUESTIONS.filter(([answers, asked]) => searchGuide(asked[code], index, { ignoredWords, limit: 2 })
            .some(({ section }) => answers.includes(place.get(section)))).length;
        scores.push(`${code} ${right}`);
        assert(right >= GUIDE_FLOOR[code], `2. ${code}: Help answers ${rate(right, GUIDE_QUESTIONS.length)} in its first two, below ${GUIDE_FLOOR[code]}`);
    }
    console.log(`✓ Help answers questions (of ${GUIDE_QUESTIONS.length}, in the first two): ${scores.join(', ')}`);
}

// ---- The Editor palette: plain commands ------------------------------------
// What each request should do (intent, then a part, everything or the
// selection, then a colour), or null for words that aren't a request: those
// must do nothing.
const PLAIN_PLANS = ["paint roof roofRed", "paint door oak", "delete tree", "select window", "paint fence cream", "delete lantern", "paint chimney slate", "select stairs", "paint lawn sunflower", "paint everything harbor", "delete rock", "paint bush meadow", "select furniture", "paint selection terracotta", null, null, null, "paint arch thatch"];
const PLAIN_SAID = {
    en: ["make the roof red", "can you paint the doors brown", "get rid of all the trees", "select every window", "paint the fence white", "remove the lamps", "colour the chimneys dark grey", "highlight the stairs", "turn the grass yellow", "paint everything blue", "delete the rocks", "make the bushes light green", "choose all the tables", "paint this orange", "rotate the roof", "how do I save", "make it bigger", "please paint the arches gold"],
    de: ["mach das Dach rot", "kannst du die Türen braun streichen", "entferne alle Bäume", "wähle jedes Fenster aus", "streiche den Zaun weiß", "lösche die Lampen", "färbe die Schornsteine dunkelgrau", "markiere die Treppe", "mach den Rasen gelb", "streiche alles blau", "lösche die Felsen", "mach die Büsche hellgrün", "wähle alle Tische", "streiche das orange", "dreh das Dach", "wie speichere ich", "mach es größer", "bitte die Bögen golden streichen"],
    es: ["pon el techo rojo", "puedes pintar las puertas de marrón", "quita todos los árboles", "selecciona cada ventana", "pinta la valla de blanco", "borra las lámparas", "pinta las chimeneas de gris oscuro", "resalta las escaleras", "pinta el césped de amarillo", "pinta todo de azul", "borra las rocas", "pinta los arbustos de verde claro", "elige todas las mesas", "pinta esto de naranja", "gira el techo", "cómo guardo", "hazlo más grande", "por favor pinta los arcos de dorado"],
    fr: ["mets le toit en rouge", "tu peux peindre les portes en marron", "enlève tous les arbres", "sélectionne chaque fenêtre", "peins la clôture en blanc", "supprime les lampes", "colore les cheminées en gris foncé", "surligne les escaliers", "peins la pelouse en jaune", "peins tout en bleu", "supprime les rochers", "peins les buissons en vert clair", "choisis toutes les tables", "peins ça en orange", "tourne le toit", "comment enregistrer", "rends-le plus grand", "peins les arches en doré s'il te plaît"],
    id: ["buat atap jadi merah", "bisa cat pintu jadi cokelat", "singkirkan semua pohon", "pilih setiap jendela", "cat pagar jadi putih", "hapus lampu", "warnai cerobong jadi abu-abu tua", "sorot tangga", "cat rumput jadi kuning", "cat semuanya biru", "hapus batu", "cat semak jadi hijau muda", "pilih semua meja", "cat ini oranye", "putar atap", "bagaimana cara menyimpan", "buat lebih besar", "tolong cat lengkungan jadi emas"],
    ja: ["屋根を赤にして", "ドアを茶色に塗ってくれる", "木を全部消して", "窓をすべて選んで", "柵を白く塗って", "ランプを削除", "煙突を濃い灰色に塗る", "階段を選択", "芝生を黄色にして", "全部青く塗って", "岩を消して", "茂みを黄緑に塗って", "テーブルを全部選んで", "これをオレンジに塗って", "屋根を回転して", "保存のしかた", "もっと大きくして", "アーチを金色に塗ってください"],
    ko: ["지붕을 빨간색으로 해줘", "문을 갈색으로 칠해 줄래", "나무를 전부 지워", "창문을 모두 골라", "울타리를 하얗게 칠해", "램프를 삭제해", "굴뚝을 짙은 회색으로 칠해", "계단을 선택해", "잔디를 노랗게 칠해", "전부 파랗게 칠해", "바위를 삭제해", "덤불을 연두색으로 칠해", "테이블을 모두 선택해", "이거 주황색으로 칠해", "지붕을 회전해", "저장하는 방법", "더 크게 해줘", "아치를 금색으로 칠해 주세요"],
    'pt-BR': ["deixa o telhado vermelho", "pode pintar as portas de marrom", "tira todas as árvores", "seleciona cada janela", "pinta a cerca de branco", "apaga as lanternas", "pinta as chaminés de cinza escuro", "destaca as escadas", "pinta a grama de amarelo", "pinta tudo de azul", "apaga as pedras", "pinta os arbustos de verde claro", "escolhe todas as mesas", "pinta isso de laranja", "gira o telhado", "como eu salvo", "deixa maior", "por favor pinta os arcos de dourado"]
};
// Measured 2026-10-28, after the words these found missing were added.
const PLAIN_FLOOR = { en: 18, de: 18, es: 18, fr: 18, id: 18, ja: 18, ko: 18, 'pt-BR': 18 };

{
    assert(CODES.every((code) => PLAIN_SAID[code]?.length === PLAIN_PLANS.length), '3. every request is said in every language');
    const scores = [];
    for (const code of CODES) {
        await setAppLocale(code);
        const vocabulary = plainCommandVocabulary();
        let right = 0;
        PLAIN_SAID[code].forEach((said, i) => {
            const plan = interpretPlainCommand(said, vocabulary);
            const did = plan ? [plan.intent, plan.target.kind === 'part' ? plan.target.part : plan.target.kind, plan.colour || ''].join(' ').trim() : null;
            // Something else done is worse than nothing done: it has to be undone.
            assert(did === PLAIN_PLANS[i] || did === null, `4. ${code}: "${said}" should do ${PLAIN_PLANS[i]}, and does ${did}`);
            if (did === PLAIN_PLANS[i]) right += 1;
        });
        scores.push(`${code} ${right}`);
        assert(right >= PLAIN_FLOOR[code], `5. ${code}: the palette reads ${rate(right, PLAIN_PLANS.length)}, below ${PLAIN_FLOOR[code]}`);
    }
    console.log(`✓ the palette reads plain commands (of ${PLAIN_PLANS.length}, never as something else): ${scores.join(', ')}`);
}

// ---- The Build Library: things described ------------------------------------
// Right is a right item found among five or fewer: the library shows every
// item a search finds, so a search that finds half of it hasn't helped.
const LIBRARY_SHOWN = 5;
const LIBRARY_WANTED = [
    ['structure', ["village:stable"]],
    ['structure', ["village:granary", "village:silo", "collection:mill_and_granary"]],
    ['structure', ["village:watchtower", "village:round_tower"]],
    ['structure', ["village:village_hall", "showcase:village_square"]],
    ['structure', ["village:well"]],
    ['structure', ["collection:lighthouse", "collection:keepers_lighthouse"]],
    ['structure', ["village:dock", "showcase:harbor_island"]],
    ['structure', ["village:small_chapel"]],
    ['structure', ["showcase:castle"]],
    ['structure', ["village:mill", "collection:mill_and_granary"]],
    ['brick', ["core:bench"]],
    ['brick', ["core:hearth"]],
    ['brick', ["core:ladder", "core:stair", "core:stair_wide"]],
    ['brick', ["core:barrel"]],
    ['brick', ["core:rock"]],
    ['brick', ["core:table"]]
];
const LIBRARY_ASKED = {
    en: ["somewhere to keep my horses", "a place to store grain", "a tower to keep watch", "a building where the village meets", "a place to get water", "a light to guide ships at sea", "somewhere to moor a boat", "a small church", "a fortress for a king", "somewhere to grind flour", "something to sit on", "a fire to keep warm", "climb up to the loft", "something to store wine in", "a stone for the garden", "something to eat at"],
    de: ["wo ich meine Pferde unterbringe", "ein Ort, um Getreide zu lagern", "ein Turm zum Wache halten", "ein Gebäude, wo sich das Dorf trifft", "ein Ort, um Wasser zu holen", "ein Licht, das Schiffe auf See leitet", "wo ich ein Boot festmachen kann", "eine kleine Kirche", "eine Festung für einen König", "wo man Mehl mahlt", "etwas zum Sitzen", "ein Feuer zum Wärmen", "auf den Dachboden klettern", "etwas, um Wein aufzubewahren", "ein Stein für den Garten", "etwas, woran man isst"],
    es: ["un sitio para mis caballos", "un lugar para guardar grano", "una torre para vigilar", "un edificio donde se reúne el pueblo", "un lugar para sacar agua", "una luz que guía a los barcos en el mar", "un sitio para amarrar un barco", "una iglesia pequeña", "una fortaleza para un rey", "un lugar para moler harina", "algo para sentarse", "un fuego para calentarse", "subir al desván", "algo para guardar vino", "una piedra para el jardín", "algo donde comer"],
    fr: ["un endroit pour mes chevaux", "un lieu pour stocker le grain", "une tour pour monter la garde", "un bâtiment où le village se réunit", "un endroit pour puiser de l'eau", "une lumière qui guide les bateaux en mer", "un endroit pour amarrer un bateau", "une petite église", "une forteresse pour un roi", "un endroit pour moudre la farine", "quelque chose pour s'asseoir", "un feu pour se réchauffer", "grimper au grenier", "quelque chose pour garder du vin", "une pierre pour le jardin", "pour prendre les repas"],
    id: ["tempat untuk kuda saya", "tempat menyimpan gandum", "menara untuk berjaga", "bangunan tempat warga desa berkumpul", "tempat mengambil air", "lampu yang memandu kapal di laut", "tempat menambatkan perahu", "gereja kecil", "benteng untuk raja", "tempat menggiling tepung", "sesuatu untuk duduk", "api untuk menghangatkan badan", "naik ke loteng", "tempat menyimpan anggur", "batu untuk taman", "tempat untuk makan"],
    ja: ["馬を飼う場所", "穀物をしまう場所", "見張りをする塔", "村の人が集まる建物", "水をくむ場所", "海の船を導く明かり", "ボートをつなぐ場所", "小さな教会", "王様のための要塞", "小麦粉をひく場所", "座るもの", "暖まるための火", "屋根裏に登る", "ワインをしまうもの", "庭に置く石", "ご飯を食べるところ"],
    ko: ["말을 기르는 곳", "곡식을 저장하는 곳", "망을 보는 탑", "마을 사람들이 모이는 건물", "물을 긷는 곳", "바다의 배를 안내하는 불빛", "배를 매어 두는 곳", "작은 교회", "왕을 위한 요새", "밀가루를 빻는 곳", "앉을 것", "몸을 녹일 불", "다락에 올라가기", "와인을 보관할 것", "정원에 둘 돌", "밥 먹을 곳"],
    'pt-BR': ["um lugar para os meus cavalos", "um lugar para guardar grãos", "uma torre para vigiar", "um prédio onde a vila se reúne", "um lugar para pegar água", "uma luz que guia os navios no mar", "um lugar para amarrar um barco", "uma igreja pequena", "uma fortaleza para um rei", "um lugar para moer farinha", "algo para sentar", "um fogo para se aquecer", "subir até o sótão", "algo para guardar vinho", "uma pedra para o jardim", "um lugar para fazer as refeições"]
};
// Measured 2026-10-28, after wine and meals were added to the Barrel's and
// the Table's words.
const LIBRARY_FLOOR = { en: 14, de: 15, es: 16, fr: 16, id: 15, ja: 15, ko: 16, 'pt-BR': 16 };

{
    assert(CODES.every((code) => LIBRARY_ASKED[code]?.length === LIBRARY_WANTED.length), '6. every description is asked in every language');
    const structures = [VillageLibrary, ShowcaseLibrary, CollectionLibrary].flatMap((library) => library.structures);
    const scores = [];
    for (const code of CODES) {
        await setAppLocale(code);
        const ignoredWords = librarySearchIgnoredWords();
        const right = LIBRARY_ASKED[code].filter((asked, i) => {
            const [kind, wanted] = LIBRARY_WANTED[i];
            const found = [...(kind === 'structure'
                ? foundIds(asked, structures, STRUCTURE_SEARCH, ignoredWords)
                : foundIds(asked, CoreLibrary.definitions, BRICK_SEARCH, ignoredWords))];
            return found.length <= LIBRARY_SHOWN && found.some((id) => wanted.includes(id));
        }).length;
        scores.push(`${code} ${right}`);
        assert(right >= LIBRARY_FLOOR[code], `7. ${code}: the Build Library finds ${rate(right, LIBRARY_WANTED.length)}, below ${LIBRARY_FLOOR[code]}`);
    }
    console.log(`✓ the Build Library finds what's described (of ${LIBRARY_WANTED.length}): ${scores.join(', ')}`);
}

await setAppLocale(SOURCE_LOCALE);
console.log('✅ All search relevance tests passed.');
