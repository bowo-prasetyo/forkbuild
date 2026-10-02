# Translating ForkBuild

ForkBuild can be shown in another language: every page's text is a message
(`ui/i18n/`), chosen on the **Language** page, with a pseudo-locale for
finding text that isn't ready. It ships in English, German, Spanish,
French, Bahasa Indonesia, Japanese, Korean and Brazilian Portuguese; the table below lists the few things that stay in the language they were written
in.

## Languages

| Language | Code | Messages |
|---|---|---|
| English (source) | `en` | `ui/i18n/messages/en.js` |
| Deutsch (German) | `de` | `ui/i18n/messages/de.js`, complete (see "German" below) |
| Español (Spanish) | `es` | `ui/i18n/messages/es.js`, complete (see "Spanish" below) |
| Français (French) | `fr` | `ui/i18n/messages/fr.js`, complete (see "French" below) |
| Bahasa Indonesia | `id` | `ui/i18n/messages/id.js`, complete (see "Indonesian" below) |
| 日本語 (Japanese) | `ja` | `ui/i18n/messages/ja.js`, complete (see "Japanese" below) |
| 한국어 (Korean) | `ko` | `ui/i18n/messages/ko.js`, complete (see "Korean" below) |
| Português (Brasil) (Brazilian Portuguese) | `pt-BR` | `ui/i18n/messages/pt-BR.js`, complete (see "Brazilian Portuguese" below) |

## What is ready

| Area | Status |
|---|---|
| Header, navigation, Language page, sound control | Translated |
| Editor: toolbar, sidebar, Build Library, dialogs, touch bar, feedback | Translated |
| Editor actions, license, placement, document status, presence labels, passphrase rules, opening a shared link | Translated |
| World View: panels, dialogs, prompts, the Explore sidebar, the map, the compass, feedback | Translated |
| Publications page, Repository, Recent Worlds, an author's page, leaderboards and reconciliation | Translated |
| Why a publication's check failed (the checker's technical detail) | English |
| Identity, Peers, Chat, Conversations, Following, Your Data, About, settings pages, the sign-in dialog, banners, notifications | Translated |
| Refusals from `application/` (sign in first, already friends, wrong passphrase …) | Translated (`UserFacingError`) |
| Resident speech in World View | Translated |
| Undo/redo and history labels | Translated (a label saved by an older version stays in its English) |
| A new World's title, a fork's "Fork of …" and a copy's "Copy of …" | In the language of whoever made it, saved like any title |
| User guide (`docs/user/`) | Partly: see "Translating the user guide" below |
| Developer documentation (the rest of `docs/`) | English only |

## How it works

- Every piece of text the app shows has a **key**, like `app.nav.home`. The
  English text for every key is in `ui/i18n/messages/en.js`, the source
  language every other one is checked against.
- Components call `t('app.nav.home')` from `ui/i18n/i18n.js` instead of
  writing the English text themselves.
- A translation is a file `ui/i18n/messages/<code>.js` that gives the same
  keys in another language. Any key it leaves out shows in English, so a
  translation can be added before it's complete.
- The language is chosen on the **Language** page, or from the browser's
  languages when nothing is chosen (see `negotiateLocale()` in
  `ui/i18n/locales.js`). It is kept on the device only. Changing it reloads
  the page.

## Messages

A message is plain text, with `{name}` wherever a value goes:

```js
'language.current': 'Showing: {language}',
```

Keep every placeholder exactly as English has it; you can move it anywhere
in the sentence. Numbers passed in are formatted for the language
(`12,345.5` in English, `12.345,5` in German).

A message that depends on a count gives one text per plural form. The forms
are the ones your language uses, from `zero`, `one`, `two`, `few`, `many` and
`other` (see the [Unicode plural rules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html)).
`other` is always required, and `=0`, `=1` and so on match an exact number
first:

```js
'editor.brickCount': { '=0': 'No bricks', one: '{count} brick', other: '{count} bricks' },
// Polish
'editor.brickCount': { one: '{count} klocek', few: '{count} klocki', many: '{count} klocków', other: '{count} klocka' },
// Indonesian has one form
'editor.brickCount': { other: '{count} balok' },
```

Translate whole sentences. Never build a sentence out of separately
translated pieces: word order and grammar differ between languages.

What people write themselves is never translated: publication titles, names,
chat messages, and anything signed or published.

## Indonesian

`ui/i18n/messages/id.js` translates every key. It uses the formal "Anda",
and keeps network and product names (ForkBuild, Arweave, Nostr, IPFS, Steem,
Bitcoin, Base, Kubo, WebRTC, STUN, TURN) and protocol words with no settled
Indonesian form (gateway, relay, endpoint, snapshot, hash, nonce, txid) as
they are. The words it uses for ForkBuild's own ideas:

| English | Indonesian |
|---|---|
| World | Dunia |
| brick | balok |
| build (a creation) | bangunan |
| structure / blueprint | struktur / cetak biru |
| Publication / publish | Publikasi / terbitkan |
| Shared World (a World's signed record) | Dunia Bersama |
| Signed Claim | Klaim Bertanda Tangan |
| fork | fork (di-fork, Fork dari …) |
| peer | rekan |
| identity / passphrase | identitas / frasa sandi |
| landmark / region / resident | penanda / wilayah / penghuni |
| placement / place | penempatan / tempatkan |
| anchor / anchoring | jangkar / penjangkaran |
| undo / redo | urungkan / ulangi |
| sign in / sign out | masuk / keluar |

Indonesian has one plural form, so plural messages give only `other`; the
undo labels also give `=1` ("Tempatkan Balok" rather than "Tempatkan 1
Balok"). Numbers and dates follow `id` (`3,2 km`). Compass points are U, TL,
T, TG, S, BD, B, BL.

## German

`ui/i18n/messages/de.js` translates every key. It uses the formal "Sie",
infinitives for buttons and menu entries ("Speichern", "Bauplan
exportieren"), „…“ for quoted titles, and keeps network and product names
(ForkBuild, Arweave, Nostr, IPFS, Steem, Bitcoin, Base, Kubo, WebRTC, STUN,
TURN) and the protocol words German uses as they are (Gateway, Relay,
Snapshot, Hash, Nonce, txid, Wallet, Peer); endpoint is Endpunkt. The words
it uses for ForkBuild's own ideas:

| English | German |
|---|---|
| World | Welt |
| brick | Stein |
| build (a creation) | Bauwerk |
| structure / blueprint | Struktur / Bauplan |
| Publication / publish | Veröffentlichung / veröffentlichen |
| Shared World (a World's signed record) | Geteilte Welt |
| Signed Claim | Signierter Anspruch |
| fork | Fork (forken, geforkt, „Fork von …“) |
| peer | Peer |
| identity / passphrase | Identität / Passphrase |
| landmark / region / resident | Wahrzeichen / Region / Bewohner |
| placement / place | Platzierung / platzieren |
| anchor / anchoring | Anker / Verankerung |
| undo / redo | Rückgängig / Wiederholen |
| sign in / sign out | anmelden / abmelden |

German has two plural forms, `one` and `other`; the undo labels say "Stein
platzieren" for one brick and "3 Steine platzieren" otherwise. Numbers
follow `de` (`3,2 km`, `1.200`). A resident's `{where}` comes after the
verb: "Ein Fahrrad steht etwa 3,2 km nördlich von hier." Compass points are
N, NO, O, SO, S, SW, W, NW.

## Spanish

`ui/i18n/messages/es.js` translates every key into neutral Latin American
Spanish, for every Spanish-speaking browser (`es-MX`, `es-419`, `es-ES` …).
It uses the formal "usted" (and "ustedes"), never "vos" or "vosotros", and
words understood across Latin America (computadora, agregar, ingresar,
billetera, auto). Buttons and menu entries are infinitives ("Guardar",
"Exportar plano"); quoted titles use “…”. It keeps network and product
names (ForkBuild, Arweave, Nostr, IPFS, Steem, Bitcoin, Base, Kubo, WebRTC,
STUN, TURN) and the protocol words Spanish-speaking developers use as they
are (Snapshot, gateway, relay, endpoint, hash, nonce, txid, pinning). The
words it uses for ForkBuild's own ideas:

| English | Spanish |
|---|---|
| World | Mundo |
| brick | bloque |
| build (a creation) | construcción |
| structure / blueprint | estructura / plano |
| Publication / publish | publicación / publicar |
| Shared World (a World's signed record) | Mundo compartido |
| Signed Claim | Declaración firmada |
| fork | bifurcar, bifurcación (“Bifurcación de …”) |
| peer | par |
| identity / passphrase | identidad / frase de contraseña |
| landmark / region / resident | hito / región / habitante |
| placement / place | colocación / colocar (a Snapshot Placement on the Publications page is an "ubicación") |
| anchor / anchoring | anclaje / anclar |
| wallet | billetera |
| leaderboard / achievement | clasificación / logro |
| undo / redo | Deshacer / Rehacer |
| sign in / sign out | Iniciar sesión / Cerrar sesión |

Spanish has two plural forms here, `one` and `other`; the undo labels say
"Colocar bloque" for one brick and "Colocar 3 bloques" otherwise, after
"Deshacer: ". Numbers follow `es` (`3,2 km`, `12.000`, and `1200` with no
separator, as Spanish groups only from five digits). A resident's `{where}`
reads "a unos 3,2 km al norte". Keyboard keys are Mayús, Supr, RePág and
AvPág. Compass points are N, NE, E, SE, S, SO, O, NO.

## French

`ui/i18n/messages/fr.js` translates every key into French, for every
French-speaking browser (`fr`, `fr-FR`, `fr-CA`, `fr-BE`, `fr-CH` …). It
uses the formal "vous", infinitives for buttons and menu entries
("Enregistrer", "Exporter le plan"), « … » for quoted titles, and the
typographic apostrophe ’ throughout. Following French typography, a
no-break space (U+00A0) goes inside « » and before `:` and `%`, and a
narrow no-break space (U+202F) before `;`, `?` and `!`;
`tests/FrenchLocale.test.js` checks that no plain space is left there. It
keeps network and product names (ForkBuild, Arweave, Nostr, IPFS, Steem,
Bitcoin, Base, Kubo, WebRTC, STUN, TURN) and the protocol words French
developers use as they are (Snapshot, endpoint, backend, hash, nonce,
txid, gas); gateway and relay are passerelle and relais. The words it uses
for ForkBuild's own ideas:

| English | French |
|---|---|
| World | Monde |
| brick | brique |
| build (a creation) | construction |
| structure / blueprint | structure / plan |
| Publication / publish / unpublish | publication / publier / dépublier |
| Shared World (a World's signed record) | Monde partagé |
| Signed Claim | Déclaration signée |
| fork | fork, forker (« Fork de … ») |
| peer | pair |
| identity / passphrase | identité / phrase secrète |
| landmark / region / resident | point de repère / région / habitant |
| placement / place | placement / placer |
| anchor / anchoring | ancre / ancrage, ancrer |
| wallet | portefeuille |
| leaderboard / achievement / badge | classement / succès / badge |
| naming claim (a place name) | proposition de nom |
| authorship / lineage claim | revendication de paternité / de filiation |
| undo / redo | Annuler / Rétablir |
| sign in / sign out | Se connecter / Se déconnecter |

French has three plural forms here, `one`, `many` and `other`. `one` covers
0 and 1 ("0 brique sélectionnée"), and `many` is for round millions, which
take "de": "Déplacer 1 000 000 de briques". Only messages that count bricks
give `many`; elsewhere it falls back to `other`. The undo labels say
"Placer la brique" for one brick and "Placer 3 briques" otherwise, after
"Annuler : ". Numbers follow `fr` (`3,2 km`, `12 000` with a narrow
no-break space). A resident's `{where}` reads "à environ 3,2 km au nord".
Keyboard keys are Maj, Suppr, Échap, Espace, Pg préc and Pg suiv; WASD
stays WASD, since movement follows the letters typed, not their place on
the keyboard. Compass points are N, NE, E, SE, S, SO, O, NO.

## Brazilian Portuguese

`ui/i18n/messages/pt-BR.js` translates every key into Brazilian Portuguese,
and is chosen for every Portuguese-speaking browser (`pt-BR`, `pt-PT`, `pt`),
since it is the only Portuguese shipped. It addresses the reader as "você",
uses infinitives for buttons and menu entries ("Salvar", "Exportar planta"),
“…” for quoted titles, and keeps network and product names (ForkBuild,
Arweave, Nostr, IPFS, Steem, Bitcoin, Base, Kubo, WebRTC, STUN, TURN) and the
protocol words Brazilian developers use as they are (Snapshot, gateway,
relay, endpoint, backend, hash, nonce, txid, pinning). The words it uses for
ForkBuild's own ideas:

| English | Brazilian Portuguese |
|---|---|
| World | Mundo |
| brick | bloco |
| build (a creation) | construção |
| structure / blueprint | estrutura / planta |
| Publication / publish / unpublish | publicação / publicar / despublicar |
| Shared World (a World's signed record) | Mundo compartilhado |
| Signed Claim | Declaração assinada |
| fork | bifurcar, bifurcação (“Bifurcação de …”) |
| peer | par |
| identity / passphrase | identidade / frase secreta |
| landmark / region / resident | marco / região / morador |
| placement / place | posicionamento / colocar (a brick), posicionar |
| anchor / anchoring | âncora / ancoragem, ancorar |
| wallet | carteira |
| leaderboard / achievement / badge | classificação / conquista / emblema |
| undo / redo | Desfazer / Refazer |
| sign in / sign out | Entrar / Sair |

Brazilian Portuguese has two plural forms here, `one` and `other`; the undo
labels say "Colocar bloco" for one brick and "Colocar 3 blocos" otherwise,
after "Desfazer: ". Numbers follow `pt-BR` (`3,2 km`, `1.200`, `12.000`). A
resident's `{where}` reads "a uns 3,2 km ao norte". Keyboard keys keep their
English names (Shift, Delete, PgUp, PgDn, Esc), except Espaço. Compass
points are N, NE, L, SE, S, SO, O, NO.

## Japanese

`ui/i18n/messages/ja.js` translates every key. It uses polite です/ます
sentences and plain noun phrases for buttons and labels, 「」 for quoted
titles, and keeps network and product names (ForkBuild, Arweave, Nostr, IPFS,
Steem, Bitcoin, Base, Kubo, WebRTC, STUN, TURN) in Latin letters. Protocol
words use their usual katakana (ゲートウェイ, リレー, エンドポイント,
スナップショット, ハッシュ); nonce and txid stay as they are. The words it uses
for ForkBuild's own ideas:

| English | Japanese |
|---|---|
| World | ワールド |
| brick | ブロック |
| build (a creation) | 作品 |
| structure / blueprint | 構造物 / ブループリント |
| Publication / publish | 公開物 / 公開する |
| Shared World (a World's signed record) | 共有ワールド |
| Signed Claim | 署名済みクレーム |
| fork | フォーク (…のフォーク) |
| peer | ピア |
| identity / passphrase | アイデンティティ / パスフレーズ |
| landmark / region / resident | ランドマーク / 地域 / 住人 |
| placement / place | 配置 / 配置する |
| anchor / anchoring | アンカー / アンカリング |
| undo / redo | 元に戻す / やり直す |
| sign in / sign out | サインイン / サインアウト |

Japanese has one plural form, so plural messages give only `other`, with a
counter word (`{count}個のブロック`, `{count}件`, `{count}人`); the undo labels
also give `=1` ("ブロックを配置" rather than "1個のブロックを配置"). Another
person's name takes さん where a sentence talks about them. A place comes
before what is there, so a resident's `{where}` reads "北へ約3.2 km行ったところ"
("3.2 km to the north"). Compass points are 北, 北東, 東, 南東, 南, 南西, 西,
北西.

## Korean

`ui/i18n/messages/ko.js` translates every key into Korean, for every
Korean browser (`ko`, `ko-KR`, `ko-KP`). It uses the polite 합니다/하세요
style for sentences and plain noun phrases for buttons and labels ("저장",
"설계도 내보내기"), with “” for quoted titles and ‘’ inside them; a
resident talks in the friendlier 해요 style. Network and product names
(ForkBuild, Arweave, Nostr, IPFS, Steem, Bitcoin, Base, Kubo, WebRTC, STUN,
TURN) stay in Latin letters, and protocol words use their usual loanwords
(게이트웨이, 릴레이, 엔드포인트, 스냅샷, 해시, 트랜잭션, 컨펌). The words it
uses for ForkBuild's own ideas:

| English | Korean |
|---|---|
| World | 월드 |
| brick | 블록 |
| build (a creation) | 작품 |
| structure / blueprint | 구조물 / 설계도 |
| My Structures / Build Library | 내 구조물 / 빌드 라이브러리 |
| Publication / publish | 게시물 / 게시 |
| Shared World (a World's signed record) | 공유 월드 |
| Signed Claim / claim | 서명 클레임 / 클레임 |
| distribute / announce / discover | 배포 / 공지 / 발견 |
| attribution / lineage | 저작자 표시 / 계보 |
| fork | 포크 (…의 포크) |
| peer | 피어 |
| identity / passphrase | 신원 / 암호 문구 |
| landmark / region / resident | 랜드마크 / 지역 / 주민 |
| placement / place | 배치 / 배치 |
| anchor / anchoring | 앵커 / 앵커링 |
| undo / redo | 실행 취소 / 다시 실행 |
| sign in / sign out | 로그인 / 로그아웃 |

Korean has one plural form, so plural messages give only `other`, with a
counter after the number (`블록 {count}개`, `{count}건`, `{count}명`); the
undo labels also give `=1` ("블록 배치" rather than "블록 1개 배치"). The verb
comes last, so an undo label reads "블록 12,000개 이동 실행 취소". Where a
placeholder is followed by a particle whose form depends on the word before
it, the message writes both forms, as Korean software usually does:
`{name}을(를)`, `{name}은(는)`, `{name}이(가)`, `{name}(으)로`,
`{name}와(과)`. Another person's name takes 님 where a sentence talks about
them ("{name} 님과 연결 중"). A place comes before what is there, so a
resident's `{where}` is a place phrase ("북쪽으로 약 3.2km 떨어진 곳") that the
sentence follows with 에. Compass points are 북, 북동, 동, 남동, 남, 남서, 서,
북서, and a direction before a distance takes 쪽 ("서쪽 40m").

## Translating the user guide

The user guide in `docs/user/` is translated page by page. A translation
lives in `docs/user/<code>/` under the English page's file name
(`docs/user/ja/FAQ.md`); `docs/Privacy.md`, which is written for users too,
is translated there as well (`docs/user/ja/Privacy.md`). The rest of
`docs/` is for developers and stays in English.

Translated so far, in German, Spanish, French, Indonesian, Japanese, Korean
and Brazilian Portuguese: every page of the
user guide, and `Privacy.md`.

Writing a translation:

- Use the app's own words for everything on screen. A bold label in the
  English (**Back Up to a File**) is the text of a button or heading; find
  it in `ui/i18n/messages/en.js` and use the same key's text from your
  language's file (`de.js`: **In eine Datei sichern**, `es.js`:
  **Hacer copia de seguridad en un archivo**, `fr.js`:
  **Sauvegarder dans un fichier**, `id.js`:
  **Cadangkan ke File**, `ja.js`: **ファイルにバックアップ**, `ko.js`:
  **파일로 백업**, `pt-BR.js`:
  **Fazer backup em um arquivo**). The word lists under "German",
  "Spanish", "French", "Indonesian", "Japanese", "Korean" and "Brazilian Portuguese" above
  apply here too.
- Text the app shows only in English (a publish error from `application/`,
  say) stays in English, with a translation beside it.
- Link to the translated page when there is one (`FAQ.md`), and to the
  English otherwise (`../02-TheEditor.md`), marked as English: "(Englisch)",
  "(en inglés)", "(en anglais)", "(bahasa Inggris)", "（英語）", "(영어)", "(em inglês)". An anchor into a translated page is made from its
  translated heading, the way GitHub makes it: `ControlsReference.md#タッチ画面`.
- Start the page with the line that names its English original. The hash
  is filled in by `--stamp`:
  ```
  <!-- translation-of: docs/user/FAQ.md source-hash: 0000000000000000 -->
  ```

Then run:

```
node scripts/check-doc-translations.mjs --stamp docs/user/ja/FAQ.md
```

That records which English the translation matches, and adds the line of
language links (`**English** · [Bahasa Indonesia](id/FAQ.md) · [日本語](ja/FAQ.md)`) to the
translation, its English page and the page's other translations.

**Keeping translations in step.** When an English page changes, every
translation of it is out of date. `tests/DocTranslations.test.js` (part of
`npm run test:node`) then fails until each one carries a banner telling
readers so and pointing to the English. After changing an English page,
run:

```
node scripts/check-doc-translations.mjs --update
```

and commit the banners it adds. You don't need to read the language to do
this. For a translator, the same command without `--update` lists the pages
that are out of date and the `git diff` that shows what changed in the
English. Bring the translation up to date, then `--stamp` it, which takes
the banner away. The check also fails on a link in a translation that
leads to a missing page or heading.

Adding a language to the user guide: add it to `LANGUAGES` in
`scripts/check-doc-translations.mjs`, with its out-of-date banner, and
create its folder.

## Adding a language

1. Copy `ui/i18n/messages/en.js` to `ui/i18n/messages/<code>.js`, where
   `<code>` is the language's BCP 47 code (`id`, `ja`, `pt-BR`), and
   translate the text, keeping the keys.
2. Add an entry to `LOCALES` in `ui/i18n/locales.js`, with the language's
   name in that language, its direction (`ltr`, or `rtl` for Arabic, Hebrew
   and others), and a loader:
   ```js
   Object.freeze({ code: 'id', name: 'Bahasa Indonesia', dir: 'ltr', loadMessages: async () => (await import('./messages/id.js')).default }),
   ```
3. Run `npm run test:node -- I18n`. `tests/I18n.test.js` checks that every
   key exists in English, that every placeholder matches English's, and that
   every plural message has an `other` form.
4. Translate at least the user guide's front page, `docs/user/<code>/README.md`
   (see "Translating the user guide" above): the About page links people to
   the guide in the language they chose. `tests/UserGuideLink.test.js` checks
   that every shipped language has one.
5. Choose the language on the **Language** page and look around the app.

Right-to-left languages also need the stylesheet moved to logical
properties (`margin-inline-start` rather than `margin-left`), which isn't
done yet.

## For developers: making text translatable

- Import `t` (and `formatNumber` or `formatDate` for numbers and dates) from
  `ui/i18n/i18n.js`, return it from `setup()` (or add it to `methods` in an
  Options API component), and use it in the template: `{{ t('sound.volume') }}`,
  `:aria-label="t('sound.volume')"`. `ui/components/SoundControl.js` is a
  small example.
- Add the English text to `ui/i18n/messages/en.js`, under the group for the
  screen it belongs to. Keys are dotted camelCase: `<area>.<name>`.
- Call `t()` when rendering, not when a module loads, so it reads the chosen
  language.
- `core/` and `application/` never call `t()` or write English for the
  screen; see the next section.
- Check your work in the pseudo-locale (**Language → For translators**). It
  shows every translated message accented, padded and bracketed:
  `⟦Šöüñð öñ ~~~⟧`. Plain English that is left shows text still written
  into a component. A cut-off bracket shows a layout too narrow for a longer
  translation.

## For developers: text from `core/` and `application/`

Those layers can't import the UI, so they name their text instead of writing
it:

- **A message descriptor**, from `message(key, params)` in `core/Message.js`,
  is what a use case, label module or result returns wherever it used to
  return an English string: `message('passphrase.tooShort', { count: 8 })`.
  The UI shows it with `t(descriptor)`, or `displayText(value)` where a value
  may be either a descriptor or text that is already final (a title someone
  wrote). A descriptor that reaches the screen untranslated shows its key,
  which the pseudo-locale makes easy to spot.
- **A parameter can be a descriptor or a list.** A descriptor is translated
  first (`{ author: message('publicationLink.unknownAuthor') }`) and a list is
  joined the language's way ("a, b, c"). Use these rather than joining
  translated pieces yourself.
- **A `UserFacingError`** (`core/UserFacingError.js`) is an error meant for
  the person using the app: a refused action or an invalid input. It carries
  a descriptor, and its own `.message` stays the key plus a developer detail
  for logs. The UI shows any error with `errorText(error)`, which uses the
  descriptor when there is one. Programmer errors (a missing collaborator, a
  broken invariant) stay plain English `Error`s: nobody using the app reads
  them.
- **Text the 3D view draws** (a resident's speech bubble) can't be translated
  by the renderer, which never imports the UI. The code that makes it returns
  messages (`core/ResidentTalk.js`), and World View hands the session a
  translator (`setResidentSpeechTranslator(displayText)`) so the words are
  turned into text before the renderer gets them. Each sentence is one
  message with its parts as parameters (`{where}`, itself a message holding
  `{distance}`), so a language can reorder them.
- **A label saved with a command** (undo/redo, the history timeline) is
  written as `descriptionMessage: { key, params }`
  (`application/commands/HistoryDescription.js`), so it is translated when
  shown, on this device or a peer's. `description` is left out, so an
  older version falls back to its own label; a `description` an older
  version wrote is English text and is shown as written.
- **Titles the app gives a new document** (a new World, a fork, a copy) are
  saved with it, so they are written once, in the language of whoever made
  it, and read the same for everyone after: they are the document's title
  now, like one a person typed. `application/document/DocumentTitles.js`
  makes them; `ui/main.js` points it at the `document.*` messages at
  start-up.
- **Enum-to-label modules** (`application/document/LicenseLabels.js`,
  `application/avatar/AvatarPresenceLabels.js`) map each value to a key, with
  a message for anything unrecognized.
- **Text people write is never a message**: titles, names, a personal
  blueprint's name. Built-in content that has a stable id is translated by
  looking that id up (`ui/i18n/libraryText.js`: `core:slope_45` →
  `library.core.slope45`), falling back to the item's own name.
- **Editor actions** (`application/editor/EditorActionRegistry.js`) name
  everything after the action's id: `editorAction.<id>` is its label, and
  `.description`, `.done` (what it reports) and `.nothing` (when there was
  nothing to act on) follow it; `editorActionCategory.<category>`,
  `editorActionReason.<reason>` and `editorActionUnavailable.<capability>`
  cover the rest. A new action needs only its English messages.
- **Values core/ keeps as ids** (a compass direction such as `NE`, a region
  kind, a terrain zone, what a collaborator is doing) are translated where
  they reach the screen, by `ui/i18n/worldText.js` (`compassText`,
  `regionKindText`, `spatialActivityText`, `spatialContextDescription`). A
  value without a message is shown as it came, so a newer client's value
  still reads.
- **A sentence with a link or button inside it** is one message, with a
  `{placeholder}` where the element goes, rendered by
  `ui/i18n/I18nText.js`: `<I18nText keypath="…"><template #peer>…</template></I18nText>`.
  Never split the sentence into pieces around the element: other languages
  put it elsewhere.
- **Names of networks and products** (Arweave, Nostr, Steem, IPFS, Bitcoin,
  Base) are not messages.

`tests/I18nMessageKeys.test.js` runs these modules and checks that every
descriptor they produce has an English message.
