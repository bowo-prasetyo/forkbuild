// Compares ways of hearing voice building's recordings, as saved by
// scripts/evaluate-voice-commands.mjs (`--save-heard`), against the first
// (the baseline), and says whether each other one should be used: the
// decision rule below was fixed before any was measured
// (docs/reviews/VoicePrompt-2026-10-30.md).
//
//   node scripts/compare-voice-prompts.mjs --run A=heard-none.json
//        --run B=heard-vocabulary.json [--run C=…] [--out report.md]
//
// `--run E=heard-none.json+heard-en.json` reads the second file's
// recordings in place of the first's: a prompt in English only, heard with
// `--language en`, and the rest without.
//
// `--run AG=heard-none.json,guard` reads a run as the app does with its
// guards against what the model makes up (core/voice/Transcript.js
// #heardNothing() and #repeatsItself(), from what --save-heard keeps of how
// sure the model was): a run of the baseline's own recordings with guards is
// judged by the guards' rule; every other run is then judged against it.
//
// For each, per language and in all: commands right, rejected (nothing done)
// and wrong (something else done); false activations (something done for a
// recording that asked for nothing: words that aren't a command, or a sound
// that isn't speech); word error rate (character error rate in Japanese and
// Korean, written without spaces between words) against what was said; and
// the median time to hear a command. Then, recording by recording against
// the baseline, the commands each fixed and broke.
//
// The rule, in this order:
// 1. Rejected if, in any language, more is done that has to be undone (false
//    activations plus wrong commands) than the baseline did. A gain anywhere
//    else never pays for that.
// 2. Rejected if hearing a command takes more than MAX_SLOWER longer (median).
// 3. Used only if it fixes more commands than it breaks, recording by
//    recording, beyond chance (a two-sided sign test, p < 0.05).
//
// The guards' rule (the same recordings, read with and without them), fixed
// before they were measured:
// 1. Rejected if, in any language, more is done that must be undone.
// 2. Rejected if commands right fall by more than MAX_GUARD_LOSS (a share of
//    all commands) in all.
import { readFileSync, writeFileSync } from 'node:fs';
import { voicePhrases, SAID } from './voiceCommandPhrases.mjs';
import { verdict, voiceReader } from './voiceCommandOutcome.mjs';
import { heardNothing, repeatsItself } from '../core/voice/Transcript.js';

export const MAX_SLOWER = 0.25;
export const MAX_GUARD_LOSS = 0.01;
export const SIGNIFICANCE = 0.05;
const BY_CHARACTER = new Set(['ja', 'ko']);

// What was said, made comparable: lower case, no punctuation, single spaces.
function normalized(text) {
    return String(text || '').toLocaleLowerCase().normalize('NFKC').replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();
}

// The units an error rate counts in `text` of `language`: words, or, in
// Japanese and Korean, characters.
export function units(text, language) {
    const clean = normalized(text);
    if (!clean) return [];
    return BY_CHARACTER.has(language) ? [...clean.replace(/\s/g, '')] : clean.split(' ');
}

// The fewest words (or characters) added, dropped or changed to make
// `heard` into `said`.
export function editDistance(said, heard) {
    let previous = Array.from({ length: heard.length + 1 }, (_, j) => j);
    for (let i = 1; i <= said.length; i += 1) {
        const current = [i];
        for (let j = 1; j <= heard.length; j += 1) {
            current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (said[i - 1] === heard[j - 1] ? 0 : 1));
        }
        previous = current;
    }
    return previous[heard.length];
}

// Two-sided sign test: how likely `a` against `b` (or more lopsided) is by chance.
export function signTest(a, b) {
    const n = a + b;
    if (n === 0) return 1;
    const k = Math.min(a, b);
    let tail = 0;
    let choose = 1;
    for (let i = 0; i <= k; i += 1) {
        if (i > 0) choose = (choose * (n - i + 1)) / i;
        tail += choose;
    }
    return Math.min(1, (2 * tail) / 2 ** n);
}

const median = (values) => (values.length ? [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)] : 0);
const pct = (part, whole) => (whole ? `${((100 * part) / whole).toFixed(1)}%` : '–');

// The measures of `rows` (each with `verdict`, `expect`, `edits`, `length`, `ms`).
export function measures(rows) {
    const commands = rows.filter((row) => row.expect !== 'none');
    const nothingAsked = rows.filter((row) => row.expect === 'none');
    const spoken = rows.filter((row) => row.length > 0);
    return {
        commands: commands.length,
        right: commands.filter((row) => row.verdict === 'right').length,
        rejected: commands.filter((row) => row.verdict === 'nothing').length,
        wrong: commands.filter((row) => row.verdict === 'wrong').length,
        nothingAsked: nothingAsked.length,
        falseActivations: nothingAsked.filter((row) => row.verdict === 'wrong').length,
        errorRate: spoken.reduce((sum, row) => sum + row.edits, 0) / Math.max(1, spoken.reduce((sum, row) => sum + row.length, 0)),
        ms: median(commands.filter((row) => row.ms).map((row) => row.ms))
    };
}

// Reads `heard` (saved transcripts) as the app would, recording by
// recording; with `guard`, what the guards throw away as nothing.
async function scored(heard, { guard = false } = {}) {
    const phrases = new Map(voicePhrases().map((phrase) => [`${phrase.language}/${phrase.id}`, phrase]));
    const rows = [];
    for (const language of Object.keys(SAID)) {
        const reader = await voiceReader(language);
        for (const clip of heard.filter((each) => each.language === language)) {
            const phrase = phrases.get(`${language}/${clip.id}`);
            if (!phrase) continue;
            const kept = guard && (heardNothing(clip) || repeatsItself(clip.transcript)) ? '' : clip.transcript || '';
            const did = reader.did(kept, phrase.view);
            const said = units(phrase.text, language);
            rows.push({
                key: `${language}/${clip.speaker}/${clip.id}`,
                language,
                expect: phrase.expect,
                verdict: verdict(phrase.expect, did),
                did,
                text: phrase.text,
                transcript: (clip.transcript || '').trim(),
                edits: said.length ? editDistance(said, units(clip.transcript, language)) : 0,
                length: said.length,
                ms: clip.ms || 0
            });
        }
    }
    return rows;
}

// The rule, for `run` against `baseline` (each `{ rows }`).
export function decide(baseline, run) {
    const reasons = [];
    for (const language of Object.keys(SAID)) {
        const before = measures(baseline.rows.filter((row) => row.language === language));
        const after = measures(run.rows.filter((row) => row.language === language));
        const undoBefore = before.falseActivations + before.wrong;
        const undoAfter = after.falseActivations + after.wrong;
        if (undoAfter > undoBefore) reasons.push(`${language}: ${undoAfter} things done that must be undone, not ${undoBefore} (${after.falseActivations} false activations, ${after.wrong} wrong commands)`);
    }
    if (reasons.length) return { use: false, rule: 1, reasons };
    const before = measures(baseline.rows);
    const after = measures(run.rows);
    if (after.ms > before.ms * (1 + MAX_SLOWER)) return { use: false, rule: 2, reasons: [`a command takes ${(after.ms / 1000).toFixed(1)} s, not ${(before.ms / 1000).toFixed(1)} s`] };
    const { fixed, broken } = paired(baseline, run);
    const p = signTest(fixed, broken);
    if (fixed <= broken || p >= SIGNIFICANCE) return { use: false, rule: 3, reasons: [`${fixed} commands fixed and ${broken} broken (p = ${p.toFixed(3)})`] };
    return { use: true, rule: null, reasons: [`${fixed} commands fixed and ${broken} broken (p = ${p.toFixed(3)})`] };
}

// The guards' rule, for `guarded` against `baseline`: the same recordings.
export function decideGuards(baseline, guarded) {
    const reasons = [];
    for (const language of Object.keys(SAID)) {
        const before = measures(baseline.rows.filter((row) => row.language === language));
        const after = measures(guarded.rows.filter((row) => row.language === language));
        if (after.falseActivations + after.wrong > before.falseActivations + before.wrong) reasons.push(`${language}: more done that must be undone`);
    }
    if (reasons.length) return { use: false, rule: 1, reasons };
    const before = measures(baseline.rows);
    const after = measures(guarded.rows);
    const lost = (before.right - after.right) / Math.max(1, before.commands);
    const undone = (m) => m.falseActivations + m.wrong;
    const said = `${undone(before) - undone(after)} fewer things done that must be undone; commands right ${(100 * before.right / before.commands).toFixed(1)}% to ${(100 * after.right / after.commands).toFixed(1)}%`;
    return lost > MAX_GUARD_LOSS ? { use: false, rule: 2, reasons: [said] } : { use: true, rule: null, reasons: [said] };
}

// Commands `run` got right that `baseline` didn't (fixed), and the other way (broken).
export function paired(baseline, run, language = null) {
    const before = new Map(baseline.rows.map((row) => [row.key, row]));
    let fixed = 0;
    let broken = 0;
    for (const row of run.rows) {
        if (row.expect === 'none' || (language && row.language !== language)) continue;
        const was = before.get(row.key);
        if (!was) continue;
        if (row.verdict === 'right' && was.verdict !== 'right') fixed += 1;
        if (row.verdict !== 'right' && was.verdict === 'right') broken += 1;
    }
    return { fixed, broken };
}

function report(runs) {
    const [baseline] = runs;
    const languages = Object.keys(SAID);
    const head = '| | Commands right | Rejected | Wrong | False activations | Error rate | Median time |\n|---|---|---|---|---|---|---|';
    const line = (label, m) => `| ${label} | ${pct(m.right, m.commands)} | ${pct(m.rejected, m.commands)} | ${pct(m.wrong, m.commands)} (${m.wrong}) | ${pct(m.falseActivations, m.nothingAsked)} (${m.falseActivations} of ${m.nothingAsked}) | ${(100 * m.errorRate).toFixed(1)}% | ${(m.ms / 1000).toFixed(1)} s |`;
    const out = [`# Voice prompts compared`, '', `${baseline.rows.length} recordings each; error rate is words, characters in ja and ko.`, ''];
    out.push('## In all', '', head, ...runs.map((run) => line(run.label, measures(run.rows))), '');
    for (const language of languages) {
        out.push(`## ${language}`, '', head, ...runs.map((run) => line(run.label, measures(run.rows.filter((row) => row.language === language)))), '');
    }
    out.push('## Recording by recording, against ' + baseline.label, '', '| | ' + languages.join(' | ') + ' | All |', '|---|' + languages.map(() => '---|').join('') + '---|');
    for (const run of runs.slice(1)) {
        const cells = [...languages.map((language) => paired(baseline, run, language)), paired(baseline, run)].map(({ fixed, broken }) => `+${fixed} −${broken}`);
        out.push(`| ${run.label} | ${cells.join(' | ')} |`);
    }
    out.push('', '## Decision', '');
    const guarded = runs.slice(1).find((run) => run.guard && run.path === baseline.path);
    for (const run of runs.slice(1)) {
        const against = run === guarded ? baseline : (guarded || baseline);
        const { use, rule, reasons } = run === guarded ? decideGuards(baseline, run) : decide(against, run);
        const rules = run === guarded ? "the guards' rule" : `against ${against.label}`;
        out.push(`- **${run.label} (${rules}): ${use ? 'use' : `don't use (rule ${rule})`}.** ${reasons.join('; ')}.`);
    }
    out.push('', '## What was done that must be undone', '', '| | Language | Said | Heard | Did |', '|---|---|---|---|---|');
    for (const run of runs) {
        for (const row of run.rows.filter((each) => each.verdict === 'wrong')) {
            out.push(`| ${run.label} | ${row.language} | ${row.text || `(${row.key.split('/').pop()})`} | ${row.transcript.replace(/\|/g, '/')} | ${row.did} |`);
        }
    }
    return `${out.join('\n')}\n`;
}

// What was heard in `path`, or in `a.json+b.json`: b's recordings in place
// of a's, as a prompt in one language only would hear them.
export function heardIn(path, read = (file) => JSON.parse(readFileSync(file, 'utf8'))) {
    const clips = new Map();
    for (const file of path.split('+')) for (const clip of read(file)) clips.set(`${clip.language}/${clip.speaker}/${clip.id}`, clip);
    return [...clips.values()];
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const runs = [];
    process.argv.forEach((value, i) => {
        if (value !== '--run') return;
        const [label, spec] = process.argv[i + 1].split('=');
        const [path, ...flags] = spec.split(',');
        runs.push({ label, path, guard: flags.includes('guard') });
    });
    if (runs.length < 2) {
        console.error('Usage: node scripts/compare-voice-prompts.mjs --run A=heard.json --run B=heard.json [--out report.md]');
        process.exit(2);
    }
    for (const run of runs) run.rows = await scored(heardIn(run.path), { guard: run.guard });
    const text = report(runs);
    const at = process.argv.indexOf('--out');
    if (at >= 0) writeFileSync(process.argv[at + 1], text);
    else process.stdout.write(text);
}
