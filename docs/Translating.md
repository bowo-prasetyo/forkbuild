# Translating ForkBuild

ForkBuild can be shown in another language: every page's text is a message
(`ui/i18n/`), chosen on the **Language** page, with a pseudo-locale for
finding text that isn't ready. It ships in English, German, Bahasa
Indonesia and Japanese; the table below lists the few things that stay in the language they were written
in.

## Languages

| Language | Code | Messages |
|---|---|---|
| English (source) | `en` | `ui/i18n/messages/en.js` |
| Deutsch (German) | `de` | `ui/i18n/messages/de.js`, complete (see "German" below) |
| Bahasa Indonesia | `id` | `ui/i18n/messages/id.js`, complete (see "Indonesian" below) |
| 日本語 (Japanese) | `ja` | `ui/i18n/messages/ja.js`, complete (see "Japanese" below) |

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

## Translating the user guide

The user guide in `docs/user/` is translated page by page. A translation
lives in `docs/user/<code>/` under the English page's file name
(`docs/user/ja/FAQ.md`); `docs/Privacy.md`, which is written for users too,
is translated there as well (`docs/user/ja/Privacy.md`). The rest of
`docs/` is for developers and stays in English.

Translated so far, in German, Indonesian and Japanese: every page of the
user guide, and `Privacy.md`.

Writing a translation:

- Use the app's own words for everything on screen. A bold label in the
  English (**Back Up to a File**) is the text of a button or heading; find
  it in `ui/i18n/messages/en.js` and use the same key's text from your
  language's file (`de.js`: **In eine Datei sichern**, `id.js`:
  **Cadangkan ke File**, `ja.js`: **ファイルにバックアップ**). The word lists
  under "German", "Indonesian" and "Japanese" above apply here too.
- Text the app shows only in English (a publish error from `application/`,
  say) stays in English, with a translation beside it.
- Link to the translated page when there is one (`FAQ.md`), and to the
  English otherwise (`../02-TheEditor.md`), marked as English: "(Englisch)",
  "(bahasa Inggris)", "（英語）". An anchor into a translated page is made from its
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
4. Choose the language on the **Language** page and look around the app.

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
