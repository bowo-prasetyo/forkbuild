# Telling the speech model what to expect: measured, not used

**Question.** Voice building hears commands with Whisper base, in the
browser, given nothing but the recording and its language. Whisper can also
be given a prompt, text it takes for what was said just before, which leans
it toward those words. Would a prompt of the words the app can act on make
voice better, without making it do things nobody asked for?

**Answer: no, not as it stands.** Both prompts heard many more commands
right, far beyond chance. But both made voice do things that have to be
undone, in more than one language, where it had done none, and the rule set
before measuring rejects that, whatever else improves. The app keeps hearing
without a prompt. The prompt stays measurable, as below, for the changes that
could make it safe.

## What was compared

| | Whisper is given |
|---|---|
| A, baseline | the recording and its language, as the app does now |
| B, vocabulary | as A, and a prompt of each thing the app can do, by its first name |
| C, expanded | as A, and a prompt of every phrasing the app reads |

The prompts are made by `ui/voice/voicePrompt.js` from the words the app
reads a command with, so a new part, colour, action or Location is in them
as soon as the app can act on it, and nothing the app can't act on is.
In the Editor: the action names, then "everything" and "this", the colours,
the parts, and last what to do (paint, delete, select). In World View: its
commands, then "go to" and the World's Locations. The most telling words go
last, where Whisper heeds them most. `application/voice/SpeechRuntime.js`
gives the prompt as Whisper's `<|startofprev|>` text, keeping its last 200
tokens, and returns only what was heard after it. In English, B's Editor
prompt is about 230 tokens, so its first action names were cut; C's Editor
prompts are about twice as long, so they kept roughly their second half, the
colours, parts and words for what to do. World View's prompts are short
enough to be given whole.

**Recordings.** 864 synthetic recordings
(`scripts/synthesize-voice-corpus.mjs`), 108 in each of the eight languages:

- 512 commands, 16 per voice in each language (`scripts/voiceCommandPhrases.mjs`);
- 288 phrases that ask for nothing: the 2 bits of chatter there were, and
  7 new ones per language that name a part, a colour, a place or the sound
  ("Where did I put the windows?", "The old mill is beautiful.", "Is the
  sound too loud?"), each spoken by four voices;
- 64 sounds that aren't speech (`scripts/voiceNoise.mjs`): typing, knocking,
  a few notes of a tune and the murmur of distant talk, two of each in each
  language. Each reaches the model, as a real one would.

Every phrase that asks for nothing does nothing when typed
(`tests/VoicePhrases.test.js`). So anything it does when spoken comes from
what the model heard.

**Measures**, per language and in all (`scripts/compare-voice-prompts.mjs`):

- commands right, rejected (nothing done) and wrong (something else done);
- false activations: something done for a recording that asked for nothing;
- error rate: words, or in Japanese and Korean characters, against what was
  said;
- the median time to hear a command. The three were measured side by side
  on four cores, so the times compare with each other, not with the 4.3 s
  measured alone.

**The rule**, fixed before anything was measured, and kept in
`scripts/compare-voice-prompts.mjs`:

1. Rejected if, in any language, more is done that must be undone (false
   activations plus wrong commands) than without a prompt. Nothing else
   pays for that.
2. Rejected if a command takes more than 25% longer.
3. Used only if, recording by recording, it fixes more commands than it
   breaks, beyond chance (sign test, p < 0.05).

## Results

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 42.6% | 57.0% | 0.4% (2) | 0.0% (0 of 352) | 60.4% | 5.4 s |
| B | 53.3% | 45.1% | 1.6% (8) | 1.4% (5 of 352) | 57.9% | 6.2 s |
| C | 53.9% | 44.5% | 1.6% (8) | 0.6% (2 of 352) | 64.6% | 6.5 s |

Commands right, by language:

| | en | de | es | fr | id | ja | ko | pt-BR |
|---|---|---|---|---|---|---|---|---|
| A | 92.2% | 21.9% | 46.9% | 35.9% | 37.5% | 42.2% | 34.4% | 29.7% |
| B | 89.1% | 40.6% | 43.8% | 50.0% | 54.7% | 54.7% | 53.1% | 40.6% |
| C | 92.2% | 39.1% | 57.8% | 56.3% | 50.0% | 56.3% | 48.4% | 31.3% |

Done that must be undone (false activations plus wrong commands), by language:

| | en | de | es | fr | id | ja | ko | pt-BR |
|---|---|---|---|---|---|---|---|---|
| A | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 |
| B | 4 | 0 | 1 | 2 | 1 | 1 | 1 | 3 |
| C | 2 | 1 | 0 | 2 | 4 | 0 | 0 | 1 |

Recording by recording against A, commands fixed and broken: B +78 −23
(p = 3.6 × 10⁻⁸), C +70 −12 (p = 4.1 × 10⁻¹¹). English gains nothing
(B +1 −3, C +2 −2); German, French, Indonesian, Japanese and Korean gain
most. The full tables, per language, and every recording that was done
wrong are in the appendix, as `scripts/compare-voice-prompts.mjs` wrote them.

**Decision.** B is rejected by rule 1 in English, Spanish, French, Japanese,
Korean and Portuguese. C is rejected by rule 1 in English, German, French
and Indonesian. Both would pass rules 2 (15% and 20% slower) and 3.

## Why

- **From sounds that aren't speech, the model writes the prompt.** Without
  a prompt, Whisper makes up what it makes up from noise everywhere
  ("Thank you.", "Und dann", "SWR 2020"), which the app reads as nothing.
  With one, it makes up the prompt's words: a few notes of a tune became
  "Sound off, sound off, sound off, …" and distant talk "The Old Mill", and
  World View would have muted itself or flown away. All but one false
  activation came from a sound; the other was Japanese chatter, "いい天気ですね"
  (lovely weather), heard under B as "黄色の アーチャー" (yellow arch) over and
  over.
- **The prompt pulls a word toward a command it sounds like.** "Duplicar"
  and "Copier" were heard as "Publicar" and "Publier": Publish, from a
  prompt holding both. "Desfazer" (undo) was heard as "e fazer" and read as
  Redo.
- **A list leads to a list.** Given a comma-separated prompt, Whisper
  sometimes continues it: "Rotate clockwise" became "white, white, white, …",
  and most of English's worse error rate under B comes from such loops.
- **"Select all the windows" with the windows garbled reads as "select
  all".** That is both of A's wrong commands, two of B's and six of C's, in
  French, Indonesian and Portuguese.

## What was found besides

- **Voice can reach Publish.** A command spoken in the Editor can run any
  of its actions but Voice itself (`ui/views/EditorView.js#actOnVoice()`),
  Publish included. For a builder whose name, license and findability are
  already set, that publishes without a further question. The AI/ML review
  said voice could not reach Publish. That was wrong, and it is corrected
  there. Limiting what voice can run is a decision of its own, and is not
  made here.
- **Five sentences do something when typed, before any model hears them**
  (the command reader, not the speech model; they were left out of the
  recordings):
  - "I like the red roof." paints the roof red: a colour and a part read
    as "paint";
  - "How many bricks is that?" paints the selection Brick, the colour;
  - "Who wants to talk?" starts talking to someone;
  - "My home is far away." flies home;
  - in German, *laut* (loud) alone is a word for sound on, so "Ist der Ton
    zu laut?" turns the sound on.

## What could make a prompt safe

Each is a change to measure the same way, against the same rule:

- **Throw away a transcript that repeats itself** ("sound off" sixteen
  times): what Whisper writes from noise, with or without a prompt, often
  does.
- **Give the prompt as a sentence, not a list**, so it isn't continued as
  one.
- **Leave out of the prompt what can't be undone** (Publish, Export, New
  Build), so a near word isn't pulled to it.
- **A prompt only where it helps:** English gains nothing from one.
- **Recordings of people.** These voices are synthetic; a prompt may help
  them more, or less, than it would help a person.

## Reproducing

```bash
node scripts/synthesize-voice-corpus.mjs --piper <piper> --espeak
node scripts/evaluate-voice-commands.mjs --prompt none --save-heard heard-none.json
node scripts/evaluate-voice-commands.mjs --prompt vocabulary --save-heard heard-vocabulary.json
node scripts/evaluate-voice-commands.mjs --prompt expanded --save-heard heard-expanded.json
node scripts/compare-voice-prompts.mjs --run A=heard-none.json --run B=heard-vocabulary.json --run C=heard-expanded.json
```

Each hearing takes about two hours on four cores, the three side by side.

## Appendix: the comparison

864 recordings each; error rate is words, characters in ja and ko.

### In all

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 42.6% | 57.0% | 0.4% (2) | 0.0% (0 of 352) | 60.4% | 5.4 s |
| B | 53.3% | 45.1% | 1.6% (8) | 1.4% (5 of 352) | 57.9% | 6.2 s |
| C | 53.9% | 44.5% | 1.6% (8) | 0.6% (2 of 352) | 64.6% | 6.5 s |

### en

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 92.2% | 7.8% | 0.0% (0) | 0.0% (0 of 44) | 6.7% | 5.7 s |
| B | 89.1% | 10.9% | 0.0% (0) | 9.1% (4 of 44) | 18.3% | 6.1 s |
| C | 92.2% | 7.8% | 0.0% (0) | 4.5% (2 of 44) | 6.4% | 6.5 s |

### de

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 21.9% | 78.1% | 0.0% (0) | 0.0% (0 of 44) | 52.4% | 5.4 s |
| B | 40.6% | 59.4% | 0.0% (0) | 0.0% (0 of 44) | 49.7% | 6.5 s |
| C | 39.1% | 59.4% | 1.6% (1) | 0.0% (0 of 44) | 56.8% | 7.0 s |

### es

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 46.9% | 53.1% | 0.0% (0) | 0.0% (0 of 44) | 60.8% | 6.1 s |
| B | 43.8% | 54.7% | 1.6% (1) | 0.0% (0 of 44) | 38.1% | 7.1 s |
| C | 57.8% | 42.2% | 0.0% (0) | 0.0% (0 of 44) | 40.9% | 8.0 s |

### fr

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 35.9% | 64.1% | 0.0% (0) | 0.0% (0 of 44) | 61.3% | 6.3 s |
| B | 50.0% | 46.9% | 3.1% (2) | 0.0% (0 of 44) | 41.2% | 6.7 s |
| C | 56.3% | 40.6% | 3.1% (2) | 0.0% (0 of 44) | 41.5% | 6.8 s |

### id

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 37.5% | 60.9% | 1.6% (1) | 0.0% (0 of 44) | 43.1% | 5.5 s |
| B | 54.7% | 43.8% | 1.6% (1) | 0.0% (0 of 44) | 33.4% | 6.0 s |
| C | 50.0% | 43.8% | 6.3% (4) | 0.0% (0 of 44) | 40.3% | 6.3 s |

### ja

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 42.2% | 57.8% | 0.0% (0) | 0.0% (0 of 44) | 103.5% | 5.1 s |
| B | 54.7% | 45.3% | 0.0% (0) | 2.3% (1 of 44) | 115.6% | 5.9 s |
| C | 56.3% | 43.8% | 0.0% (0) | 0.0% (0 of 44) | 124.7% | 6.4 s |

### ko

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 34.4% | 65.6% | 0.0% (0) | 0.0% (0 of 44) | 47.1% | 5.1 s |
| B | 53.1% | 45.3% | 1.6% (1) | 0.0% (0 of 44) | 57.3% | 6.0 s |
| C | 48.4% | 51.6% | 0.0% (0) | 0.0% (0 of 44) | 59.0% | 5.8 s |

### pt-BR

| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |
|---|---|---|---|---|---|---|
| A | 29.7% | 68.8% | 1.6% (1) | 0.0% (0 of 44) | 73.9% | 5.3 s |
| B | 40.6% | 54.7% | 4.7% (3) | 0.0% (0 of 44) | 50.8% | 5.3 s |
| C | 31.3% | 67.2% | 1.6% (1) | 0.0% (0 of 44) | 89.8% | 5.6 s |

### Recording by recording, against A

| | en | de | es | fr | id | ja | ko | pt-BR | All |
|---|---|---|---|---|---|---|---|---|---|
| B | +1 −3 | +15 −3 | +5 −7 | +13 −4 | +12 −1 | +11 −3 | +12 −0 | +9 −2 | +78 −23 |
| C | +2 −2 | +12 −1 | +9 −2 | +14 −1 | +8 −0 | +13 −4 | +9 −0 | +3 −2 | +70 −12 |

### Decision

- **B: don't use (rule 1).** en: 4 things done that must be undone, not 0 (4 false activations, 0 wrong commands); es: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands); fr: 2 things done that must be undone, not 0 (0 false activations, 2 wrong commands); ja: 1 things done that must be undone, not 0 (1 false activations, 0 wrong commands); ko: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands); pt-BR: 3 things done that must be undone, not 1 (0 false activations, 3 wrong commands).
- **C: don't use (rule 1).** en: 2 things done that must be undone, not 0 (2 false activations, 0 wrong commands); de: 1 things done that must be undone, not 0 (0 false activations, 1 wrong commands); fr: 2 things done that must be undone, not 0 (0 false activations, 2 wrong commands); id: 4 things done that must be undone, not 1 (0 false activations, 4 wrong commands).

### What was done that must be undone

| | Language | Said | Heard | Did |
|---|---|---|---|---|
| A | id | Pilih semua jendela. | pilih, semua jenk lah. | select everything |
| A | pt-BR | Selecione todas as janelas. | Selecione todas as ginelas. | select everything |
| B | en | (noise-babble) | The Old Mill, | goTo mill |
| B | en | (noise-music) | Sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, | soundOff |
| B | en | (noise-babble) | sound off, | soundOff |
| B | en | (noise-music) | Sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, sound off, | soundOff |
| B | es | Duplicar. | Publicar | action file.publish |
| B | fr | Sélectionne toutes les fenêtres. | sélectionne tout qu'est fait naître. | select everything |
| B | fr | Copier. | Publier | action file.publish |
| B | id | Pilih semua jendela. | pilih, semuanya, lah, | select everything |
| B | ja | いい天気ですね。 | 黄色の アーチャー 黄色の アーチャー 黄色の アーチャー 黄色の アーチャー 黄色の | paint arch sunflower |
| B | ko | 전부 초록색으로 칠해 줘. | 전부, 흐뭇한, 흐뭇한, 주황, | paint everything terracotta |
| B | pt-BR | Duplicar. | Publicar. | action file.publish |
| B | pt-BR | Desfazer. | e fazer. | action history.redo |
| B | pt-BR | Apague as árvores. | apagar, azar, por isso. | delete selection |
| C | en | (noise-babble) | sound off, | soundOff |
| C | en | (noise-babble) | sound off, | soundOff |
| C | de | Nach Hause. | hallo, | talk |
| C | fr | Sélectionne toutes les fenêtres. | sélectionne, tout, réfénet, | select everything |
| C | fr | Sélectionne toutes les fenêtres. | sélectionne, tout le que fait naître. | select everything |
| C | id | Pilih semua jendela. | pilih, semuanya, lah, | select everything |
| C | id | Pilih semua jendela. | pilih semua agenda lah, | select everything |
| C | id | Pilih semua jendela. | pilih semua agenda lah | select everything |
| C | id | Pilih semua jendela. | pilih semua agenda, | select everything |
| C | pt-BR | Desfazer. | e fazer. | action history.redo |
