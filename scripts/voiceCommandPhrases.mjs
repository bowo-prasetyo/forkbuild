// What players say to voice building, in each language the app speaks, and
// what each should do: the phrases scripts/synthesize-voice-corpus.mjs speaks
// and scripts/evaluate-voice-commands.mjs measures, and that
// tests/VoicePhrases.test.js checks, typed, against the words the app hears
// (so a phrase that fails when spoken failed in the speech model, not here).
// Not part of the app.
//
// `expect` is what the phrase should do:
//   'paint <part|everything> <colour>', 'select <part>', 'delete <part>'
//                       a plain command in the Editor (core/building/PlainCommand.js)
//   'action <id>'       an Editor action (application/editor/EditorActionRegistry.js)
//   'goTo <place>'      in World View, go to one of PLACES (by its key)
//   '<command>'         another World View command (core/voice/WorldVoiceCommand.js)
//   'none'              not a command: nothing should be done
// `view` is 'editor' or 'world'.

// Two places in a World's Locations, named as a player of each language would.
export const PLACES = Object.freeze({
    en: { mill: 'The Old Mill', bridge: 'Stone Bridge' },
    de: { mill: 'Alte Mühle', bridge: 'Steinbrücke' },
    es: { mill: 'El Molino Viejo', bridge: 'Puente de Piedra' },
    fr: { mill: 'Le Vieux Moulin', bridge: 'Pont de Pierre' },
    id: { mill: 'Kincir Tua', bridge: 'Jembatan Batu' },
    ja: { mill: '古い水車小屋', bridge: '石の橋' },
    ko: { mill: '옛 물레방아', bridge: '돌다리' },
    'pt-BR': { mill: 'Moinho Velho', bridge: 'Ponte de Pedra' }
});

// [id, view, expect], each said in every language below, in this order.
export const COMMANDS = Object.freeze([
    ['paint-roof-red', 'editor', 'paint roof roofRed'],
    ['select-windows', 'editor', 'select window'],
    ['delete-trees', 'editor', 'delete tree'],
    ['paint-all-green', 'editor', 'paint everything leaf'],
    ['undo', 'editor', 'action history.undo'],
    ['redo', 'editor', 'action history.redo'],
    ['rotate', 'editor', 'action transform.rotateClockwise'],
    ['copy', 'editor', 'action clipboard.copy'],
    ['duplicate', 'editor', 'action selection.duplicate'],
    ['go-mill', 'world', 'goTo mill'],
    ['go-bridge', 'world', 'goTo bridge'],
    ['home', 'world', 'home'],
    ['first-person', 'world', 'firstPerson'],
    ['sound-off', 'world', 'soundOff'],
    ['sound-on', 'world', 'soundOn'],
    ['talk', 'world', 'talk'],
    ['chatter-editor', 'editor', 'none'],
    ['chatter-world', 'world', 'none']
]);

export const SAID = Object.freeze({
    en: ['Paint the roof red.', 'Select all the windows.', 'Delete the trees.', 'Paint everything green.', 'Undo.', 'Redo.', 'Rotate clockwise.', 'Copy.', 'Duplicate.',
        'Take me to the old mill.', 'Go to the stone bridge.', 'Go home.', 'First person.', 'Sound off.', 'Unmute.', 'Say hello.',
        'What a lovely day it is.', 'I really like this castle.'],
    de: ['Streiche das Dach rot.', 'Wähle alle Fenster.', 'Lösche die Bäume.', 'Male alles grün.', 'Rückgängig.', 'Wiederholen.', 'Im Uhrzeigersinn drehen.', 'Kopieren.', 'Duplizieren.',
        'Bring mich zur alten Mühle.', 'Geh zur Steinbrücke.', 'Nach Hause.', 'Ich-Perspektive.', 'Ton aus.', 'Ton an.', 'Sag hallo.',
        'Was für ein schöner Tag.', 'Diese Burg gefällt mir sehr.'],
    es: ['Pinta el tejado de rojo.', 'Selecciona todas las ventanas.', 'Borra los árboles.', 'Pinta todo de verde.', 'Deshacer.', 'Rehacer.', 'Girar en sentido horario.', 'Copiar.', 'Duplicar.',
        'Llévame al molino viejo.', 'Ve al puente de piedra.', 'Vuelve a casa.', 'Primera persona.', 'Silencio.', 'Activa el sonido.', 'Hola.',
        'Qué día tan bonito hace.', 'Me gusta mucho el castillo.'],
    fr: ['Peins le toit en rouge.', 'Sélectionne toutes les fenêtres.', 'Supprime les arbres.', 'Peins tout en vert.', 'Annuler.', 'Rétablir.', 'Pivoter dans le sens horaire.', 'Copier.', 'Dupliquer.',
        'Emmène-moi au vieux moulin.', 'Va au pont de pierre.', 'Rentre à la maison.', 'Première personne.', 'Coupe le son.', 'Remets le son.', 'Bonjour.',
        'Quelle belle journée.', 'J’aime beaucoup le château.'],
    id: ['Cat atapnya merah.', 'Pilih semua jendela.', 'Hapus pohon-pohonnya.', 'Cat semuanya hijau.', 'Urungkan.', 'Ulangi.', 'Putar searah jarum jam.', 'Salin.', 'Duplikat.',
        'Bawa aku ke kincir tua.', 'Pergi ke jembatan batu.', 'Pulang.', 'Orang pertama.', 'Matikan suara.', 'Nyalakan suara.', 'Halo.',
        'Hari yang sangat indah.', 'Aku suka sekali kastel itu.'],
    ja: ['屋根を赤く塗って。', '窓を全部選択して。', '木を削除して。', '全部緑に塗って。', '元に戻す。', 'やり直す。', '時計回りに回転。', 'コピー。', '複製。',
        '古い水車小屋に連れて行って。', '石の橋に行って。', '家に帰る。', '一人称。', '音を消して。', '音を出して。', 'こんにちは。',
        'いい天気ですね。', 'このお城が大好きです。'],
    ko: ['지붕을 빨간색으로 칠해 줘.', '창문을 모두 선택해 줘.', '나무를 삭제해 줘.', '전부 초록색으로 칠해 줘.', '실행 취소.', '다시 실행.', '시계 방향 회전.', '복사.', '복제.',
        '옛 물레방아로 데려가 줘.', '돌다리로 가 줘.', '집으로 가.', '1인칭.', '소리 꺼 줘.', '소리 켜 줘.', '안녕.',
        '날씨가 정말 좋네요.', '이 성이 정말 좋아요.'],
    'pt-BR': ['Pinte o telhado de vermelho.', 'Selecione todas as janelas.', 'Apague as árvores.', 'Pinte tudo de verde.', 'Desfazer.', 'Refazer.', 'Girar no sentido horário.', 'Copiar.', 'Duplicar.',
        'Me leve para o moinho velho.', 'Vá para a ponte de pedra.', 'Volta pra casa.', 'Primeira pessoa.', 'Desliga o som.', 'Liga o som.', 'Olá.',
        'Que dia lindo.', 'Gostei muito desse castelo.']
});

// Every phrase: `{ id, language, view, expect, text }`.
export function voicePhrases() {
    return Object.entries(SAID).flatMap(([language, texts]) => COMMANDS.map(([id, view, expect], i) => ({ id, language, view, expect, text: texts[i] })));
}
