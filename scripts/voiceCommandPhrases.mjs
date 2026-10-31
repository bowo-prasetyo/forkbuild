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
    ['chatter-world', 'world', 'none'],
    // Words near a command, naming a part, a colour, a place or the sound,
    // that ask for nothing: what a speech model leaning toward the app's
    // words (ui/voice/voicePrompt.js) might turn into one.
    ['near-windows', 'editor', 'none'],
    ['near-paint-later', 'editor', 'none'],
    ['near-door', 'editor', 'none'],
    ['near-roof', 'editor', 'none'],
    ['near-mill', 'world', 'none'],
    ['near-sound', 'world', 'none'],
    ['near-bridge', 'world', 'none'],
    // Sentences the app once acted on even typed: a colour and a part read as
    // paint, Brick the colour, a command word inside a sentence, German's
    // "laut" (docs/reviews/VoicePrompt-2026-10-30.md).
    ['near-red-roof', 'editor', 'none'],
    ['near-how-many-bricks', 'editor', 'none'],
    ['near-who-talks', 'world', 'none'],
    ['near-home-far', 'world', 'none'],
    ['near-loud', 'world', 'none']
]);

export const SAID = Object.freeze({
    en: ['Paint the roof red.', 'Select all the windows.', 'Delete the trees.', 'Paint everything green.', 'Undo.', 'Redo.', 'Rotate clockwise.', 'Copy.', 'Duplicate.',
        'Take me to the old mill.', 'Go to the stone bridge.', 'Go home.', 'First person.', 'Sound off.', 'Unmute.', 'Say hello.',
        'What a lovely day it is.', 'I really like this castle.',
        'Where did I put the windows?', 'Should I paint it later?', 'This door is too small.', 'Let me think about the roof.', 'The old mill is beautiful.', 'Is the sound too loud?', 'I was at the stone bridge yesterday.',
        'I like the red roof.', 'How many bricks is that?', 'Who wants to talk?', 'My home is far away.', 'Is it too loud?'],
    de: ['Streiche das Dach rot.', 'Wähle alle Fenster.', 'Lösche die Bäume.', 'Male alles grün.', 'Rückgängig.', 'Wiederholen.', 'Im Uhrzeigersinn drehen.', 'Kopieren.', 'Duplizieren.',
        'Bring mich zur alten Mühle.', 'Geh zur Steinbrücke.', 'Nach Hause.', 'Ich-Perspektive.', 'Ton aus.', 'Ton an.', 'Sag hallo.',
        'Was für ein schöner Tag.', 'Diese Burg gefällt mir sehr.',
        'Wo habe ich die Fenster hingetan?', 'Soll ich es später streichen?', 'Diese Tür ist zu klein.', 'Lass mich über das Dach nachdenken.', 'Die alte Mühle ist wunderschön.', 'Der Ton ist schön.', 'Gestern war ich an der Steinbrücke.',
        'Mir gefällt das rote Dach.', 'Wie viele Steine sind das?', 'Wer will reden?', 'Mein Zuhause ist weit weg.', 'Ist es zu laut?'],
    es: ['Pinta el tejado de rojo.', 'Selecciona todas las ventanas.', 'Borra los árboles.', 'Pinta todo de verde.', 'Deshacer.', 'Rehacer.', 'Girar en sentido horario.', 'Copiar.', 'Duplicar.',
        'Llévame al molino viejo.', 'Ve al puente de piedra.', 'Vuelve a casa.', 'Primera persona.', 'Silencio.', 'Activa el sonido.', 'Hola.',
        'Qué día tan bonito hace.', 'Me gusta mucho el castillo.',
        '¿Dónde puse las ventanas?', '¿Lo pinto más tarde?', 'Esta puerta es demasiado pequeña.', 'Déjame pensar en el tejado.', 'El molino viejo es precioso.', '¿El sonido está muy alto?', 'Ayer estuve en el puente de piedra.',
        'Me gusta el tejado rojo.', '¿Cuántos ladrillos son?', '¿Quién quiere hablar?', 'Mi casa está muy lejos.', '¿Está demasiado alto?'],
    fr: ['Peins le toit en rouge.', 'Sélectionne toutes les fenêtres.', 'Supprime les arbres.', 'Peins tout en vert.', 'Annuler.', 'Rétablir.', 'Pivoter dans le sens horaire.', 'Copier.', 'Dupliquer.',
        'Emmène-moi au vieux moulin.', 'Va au pont de pierre.', 'Rentre à la maison.', 'Première personne.', 'Coupe le son.', 'Remets le son.', 'Bonjour.',
        'Quelle belle journée.', 'J’aime beaucoup le château.',
        'Où est-ce que j’ai mis les fenêtres ?', 'Je le peins plus tard ?', 'Cette porte est trop petite.', 'Laisse-moi réfléchir au toit.', 'Le vieux moulin est magnifique.', 'Le son est trop fort ?', 'Hier, j’étais au pont de pierre.',
        'J’aime bien le toit rouge.', 'Ça fait combien de briques ?', 'Qui veut parler ?', 'Ma maison est très loin.', 'C’est trop fort ?'],
    id: ['Cat atapnya merah.', 'Pilih semua jendela.', 'Hapus pohon-pohonnya.', 'Cat semuanya hijau.', 'Urungkan.', 'Ulangi.', 'Putar searah jarum jam.', 'Salin.', 'Duplikat.',
        'Bawa aku ke kincir tua.', 'Pergi ke jembatan batu.', 'Pulang.', 'Orang pertama.', 'Matikan suara.', 'Nyalakan suara.', 'Halo.',
        'Hari yang sangat indah.', 'Aku suka sekali kastel itu.',
        'Di mana aku taruh jendelanya?', 'Apa nanti saja aku cat?', 'Pintu ini terlalu kecil.', 'Biar aku pikirkan atapnya dulu.', 'Kincir tua itu indah sekali.', 'Apa suaranya terlalu keras?', 'Kemarin aku ada di jembatan batu.',
        'Aku suka atap merahnya.', 'Itu berapa batu bata?', 'Siapa yang mau bicara?', 'Rumahku jauh sekali.', 'Apa ini terlalu keras?'],
    ja: ['屋根を赤く塗って。', '窓を全部選択して。', '木を削除して。', '全部緑に塗って。', '元に戻す。', 'やり直す。', '時計回りに回転。', 'コピー。', '複製。',
        '古い水車小屋に連れて行って。', '石の橋に行って。', '家に帰る。', '一人称。', '音を消して。', '音を出して。', 'こんにちは。',
        'いい天気ですね。', 'このお城が大好きです。',
        '窓はどこに置いたかな。', 'あとで塗ろうかな。', 'このドアは小さすぎる。', '屋根のことを考えさせて。', '古い水車小屋はきれいだね。', '音が大きすぎるかな。', '昨日は石の橋にいました。',
        '赤い屋根が好き。', 'それは何個のレンガ？', '誰が話したいの？', '私の家は遠いです。', 'うるさすぎる？'],
    ko: ['지붕을 빨간색으로 칠해 줘.', '창문을 모두 선택해 줘.', '나무를 삭제해 줘.', '전부 초록색으로 칠해 줘.', '실행 취소.', '다시 실행.', '시계 방향 회전.', '복사.', '복제.',
        '옛 물레방아로 데려가 줘.', '돌다리로 가 줘.', '집으로 가.', '1인칭.', '소리 꺼 줘.', '소리 켜 줘.', '안녕.',
        '날씨가 정말 좋네요.', '이 성이 정말 좋아요.',
        '창문을 어디에 뒀더라.', '나중에 칠할까?', '이 문은 너무 작아.', '지붕에 대해 생각해 볼게.', '옛 물레방아가 정말 예쁘다.', '소리가 너무 큰가?', '어제는 돌다리에 있었어.',
        '빨간 지붕이 좋아.', '그거 벽돌 몇 개야?', '누가 말하고 싶어?', '우리 집은 멀어.', '너무 시끄러워?'],
    'pt-BR': ['Pinte o telhado de vermelho.', 'Selecione todas as janelas.', 'Apague as árvores.', 'Pinte tudo de verde.', 'Desfazer.', 'Refazer.', 'Girar no sentido horário.', 'Copiar.', 'Duplicar.',
        'Me leve para o moinho velho.', 'Vá para a ponte de pedra.', 'Volta pra casa.', 'Primeira pessoa.', 'Desliga o som.', 'Liga o som.', 'Olá.',
        'Que dia lindo.', 'Gostei muito desse castelo.',
        'Onde eu coloquei as janelas?', 'Será que pinto depois?', 'Essa porta é pequena demais.', 'Deixa eu pensar no telhado.', 'O moinho velho é lindo.', 'O som está alto demais?', 'Ontem eu estava na ponte de pedra.',
        'Eu gosto do telhado vermelho.', 'Quantos tijolos são esses?', 'Quem quer conversar?', 'Minha casa é bem longe.', 'Está alto demais?']
});

// A second phrasing of every row above, in the same order, written before
// any of it was heard, to confirm on recordings nothing was fitted to what
// was measured on the first (docs/reviews/VoicePrompt-2026-10-30.md,
// "Fresh recordings"). The actions said only by their name keep it.
export const FRESH_SAID = Object.freeze({
    en: ['Make the roof red.', 'Pick the windows.', 'Remove all the trees.', 'Colour everything green.', 'Undo that.', 'Redo that.', 'Rotate clockwise.', 'Copy.', 'Duplicate.',
        'Fly to the old mill.', 'Show me the stone bridge.', 'Take me home.', 'Through my eyes.', 'Mute.', 'Turn the sound on.', 'Hello.',
        'This is taking a while.', 'I am a bit hungry.',
        'The windows look nice from here.', 'Maybe I will paint it tomorrow.', 'Is that door big enough?', 'The roof needs more work.', 'Have you seen the old mill?', 'The sound is fine.', 'The stone bridge is far.',
        'That red roof looks good.', 'Do I have enough bricks?', 'Nobody wants to talk.', 'I miss my home.', 'It is very loud here.'],
    de: ['Färbe das Dach rot.', 'Markiere die Fenster.', 'Entferne alle Bäume.', 'Streiche alles grün.', 'Mach das rückgängig.', 'Wiederherstellen.', 'Im Uhrzeigersinn drehen.', 'Kopieren.', 'Duplizieren.',
        'Flieg zur alten Mühle.', 'Zeig mir die Steinbrücke.', 'Heim.', 'Erste Person.', 'Stumm.', 'Ton einschalten.', 'Hallo.',
        'Das dauert ein bisschen.', 'Ich habe ein wenig Hunger.',
        'Die Fenster sehen von hier schön aus.', 'Vielleicht male ich es morgen.', 'Ist die Tür groß genug?', 'Das Dach braucht noch Arbeit.', 'Hast du die alte Mühle gesehen?', 'Der Ton passt so.', 'Die Steinbrücke ist weit.',
        'Das rote Dach sieht gut aus.', 'Habe ich genug Steine?', 'Niemand will reden.', 'Ich vermisse mein Zuhause.', 'Hier ist es sehr laut.'],
    es: ['Colorea el techo de rojo.', 'Marca las ventanas.', 'Quita todos los árboles.', 'Colorea todo de verde.', 'Deshazlo.', 'Rehazlo.', 'Girar en sentido horario.', 'Copiar.', 'Duplicar.',
        'Vuela al molino viejo.', 'Muéstrame el puente de piedra.', 'A casa.', 'Primera persona.', 'Apaga el sonido.', 'Enciende el sonido.', 'Hola, amigo.',
        'Esto tarda un poco.', 'Tengo un poco de hambre.',
        'Las ventanas se ven bonitas desde aquí.', 'Quizás lo pinte mañana.', '¿Esa puerta es bastante grande?', 'Al tejado le falta trabajo.', '¿Has visto el molino viejo?', 'El sonido está bien.', 'El puente de piedra está lejos.',
        'Ese tejado rojo se ve bien.', '¿Tengo suficientes ladrillos?', 'Nadie quiere hablar.', 'Extraño mi casa.', 'Aquí hay mucho ruido.'],
    fr: ['Colore le toit en rouge.', 'Choisis les fenêtres.', 'Enlève tous les arbres.', 'Colore tout en vert.', 'Annule ça.', 'Refais.', 'Pivoter dans le sens horaire.', 'Copier.', 'Dupliquer.',
        'Vole vers le vieux moulin.', 'Montre-moi le pont de pierre.', 'Rentre.', 'Vue subjective.', 'Silence.', 'Active le son.', 'Salut.',
        'Ça prend un peu de temps.', 'J’ai un peu faim.',
        'Les fenêtres sont jolies d’ici.', 'Je le peindrai peut-être demain.', 'Cette porte est assez grande ?', 'Le toit demande encore du travail.', 'Tu as vu le vieux moulin ?', 'Le son est bien.', 'Le pont de pierre est loin.',
        'Ce toit rouge est joli.', 'J’ai assez de briques ?', 'Personne ne veut parler.', 'Ma maison me manque.', 'C’est très bruyant ici.'],
    id: ['Warnai atapnya merah.', 'Tandai jendelanya.', 'Buang semua pohonnya.', 'Warnai semuanya hijau.', 'Batalkan.', 'Kembalikan.', 'Putar searah jarum jam.', 'Salin.', 'Duplikat.',
        'Terbang ke kincir tua.', 'Tunjukkan jembatan batu.', 'Kembali ke rumah.', 'Sudut pandang pertama.', 'Bisukan.', 'Hidupkan suara.', 'Sapa.',
        'Ini agak lama.', 'Aku agak lapar.',
        'Jendelanya bagus dari sini.', 'Mungkin besok aku cat.', 'Pintu itu cukup besar?', 'Atapnya masih perlu dikerjakan.', 'Kamu sudah lihat kincir tua?', 'Suaranya bagus.', 'Jembatan batu itu jauh.',
        'Atap merah itu bagus.', 'Batu batanya cukup?', 'Tidak ada yang mau bicara.', 'Aku rindu rumah.', 'Di sini berisik sekali.'],
    ja: ['屋根を赤に塗って。', '窓を選んで。', '木を全部消して。', 'すべて緑に塗って。', '元に戻す。', 'やり直す。', '時計回りに回転。', 'コピー。', '複製。',
        '古い水車小屋まで行って。', '石の橋を見せて。', 'うちに帰る。', '1人称。', 'ミュート。', '音をつけて。', '話しかけて。',
        'ちょっと時間がかかるね。', '少しお腹がすいた。',
        'ここから見る窓はきれい。', '明日塗るかもしれない。', 'そのドアは十分大きい？', '屋根はまだ作業が必要。', '古い水車小屋を見た？', '音はちょうどいい。', '石の橋は遠い。',
        'あの赤い屋根はいいね。', 'レンガは足りる？', '誰も話したくない。', '家が恋しい。', 'ここはとてもうるさい。'],
    ko: ['지붕을 빨갛게 칠해.', '창문 골라 줘.', '나무를 전부 지워.', '모두 녹색으로 칠해.', '되돌려.', '다시 해.', '시계 방향 회전.', '복사.', '복제.',
        '옛 물레방아에 데려다 줘.', '돌다리 보여 줘.', '홈으로.', '일인칭.', '음소거.', '음소거 해제.', '말 걸어.',
        '시간이 좀 걸리네.', '조금 배고파.',
        '여기서 보니 창문이 예쁘네.', '내일 칠할지도 몰라.', '그 문 충분히 커?', '지붕은 아직 손볼 게 많아.', '옛 물레방아 봤어?', '소리는 괜찮아.', '돌다리는 멀어.',
        '저 빨간 지붕 멋지다.', '벽돌 충분해?', '아무도 이야기하고 싶어 하지 않아.', '집이 그리워.', '여기 너무 시끄러워.'],
    'pt-BR': ['Colore o telhado de vermelho.', 'Marque as janelas.', 'Tire todas as árvores.', 'Colore tudo de verde.', 'Desfaz.', 'Refaz.', 'Girar no sentido horário.', 'Copiar.', 'Duplicar.',
        'Voe para o moinho velho.', 'Me mostra a ponte de pedra.', 'Para casa.', 'Primeira pessoa.', 'Mudo.', 'Com som.', 'Olá, amigo.',
        'Isso está demorando um pouco.', 'Estou com um pouco de fome.',
        'As janelas ficam bonitas daqui.', 'Talvez eu pinte amanhã.', 'Essa porta é grande o bastante?', 'O telhado ainda precisa de trabalho.', 'Você viu o moinho velho?', 'O som está bom.', 'A ponte de pedra é longe.',
        'Aquele telhado vermelho é bonito.', 'Tenho tijolos suficientes?', 'Ninguém quer conversar.', 'Sinto falta da minha casa.', 'Aqui está muito barulhento.']
});

// Sounds that aren't speech (scripts/voiceNoise.mjs), heard in each
// language and view: nothing should be done. [id, view].
export const NOISE_SOUNDS = Object.freeze([
    ['noise-keys', 'editor'],
    ['noise-knock', 'editor'],
    ['noise-music', 'world'],
    ['noise-babble', 'world']
]);

// Every phrase: `{ id, language, view, expect, text }`; a sound's `text` is
// empty. `set` is 'main' (SAID) or 'fresh' (FRESH_SAID).
export function voicePhrases(set = 'main') {
    return Object.entries(set === 'fresh' ? FRESH_SAID : SAID).flatMap(([language, texts]) => [
        ...COMMANDS.map(([id, view, expect], i) => ({ id, language, view, expect, text: texts[i] })),
        ...NOISE_SOUNDS.map(([id, view]) => ({ id, language, view, expect: 'none', text: '' }))
    ]);
}
