# Translating ForkBuild

ForkBuild is being prepared for translation. The pieces that make it
possible are in place: a translator in `ui/i18n/`, a **Language** page, and
a pseudo-locale for finding text that isn't ready yet. Most of the app's text
is still written straight into its components, and is moved over area by
area. Until an area is moved, it shows in English whatever language is
chosen.

## What is ready

| Area | Status |
|---|---|
| Header, navigation, Language page, sound control | Translated |
| Editor: toolbar, sidebar, Build Library, dialogs, touch bar, feedback | Translated |
| Editor actions, license, placement, document status, presence labels, passphrase rules, opening a shared link | Translated |
| World View: panels, dialogs, prompts, the Explore sidebar, the map, the compass, feedback | Translated |
| Publications page | English |
| Identity, Peers, Chat, Following, settings pages | English |
| Resident speech in World View | English |
| Undo/redo and history labels, a new document's default title | English (stored in documents; needs its own change) |

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

`tests/I18nMessageKeys.test.js` runs these modules and checks that every
descriptor they produce has an English message.
