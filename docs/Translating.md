# Translating ForkBuild

ForkBuild is being prepared for translation. The pieces that make it
possible are in place: a translator in `ui/i18n/`, a **Language** page, and
a pseudo-locale for finding text that isn't ready yet. Most of the app's text
is still written straight into its components, and is moved over area by
area. Until an area is moved, it shows in English whatever language is
chosen.

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
- `core/` and `application/` never call `t()`: they return a key and its
  parameters (or an error code), and the UI turns them into text.
- Check your work in the pseudo-locale (**Language → For translators**). It
  shows every translated message accented, padded and bracketed:
  `⟦Šöüñð öñ ~~~⟧`. Plain English that is left shows text still written
  into a component. A cut-off bracket shows a layout too narrow for a longer
  translation.
