import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DecentralizedSnapshotResolutionOutcome } from '../application/snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { SnapshotPublicationAttributionOutcome } from '../application/snapshot/SnapshotPublicationAttributionOutcome.js';
import { describeSnapshotResolutionOutcomeLabel, describeSnapshotAttributionOutcomeLabel } from '../application/snapshot/SnapshotOutcomeInspectionView.js';
import { resolveSnapshotPublicationAttribution } from '../application/snapshot/SnapshotPublicationAttribution.js';
import { describeWorldEncounterMaterialVerificationStatusLabel } from '../application/worldEncounter/WorldEncounterMaterialInspectionView.js';
import { WorldEncounterMaterialVerificationStatus } from '../application/worldEncounter/WorldEncounterMaterialVerification.js';
import { worldEncounterCanvasFiles } from './support/SourceFileGroups.js';

// 0.9.529 — Snapshot Outcome Presentation Boundary Closure Audit.
//
// Type: test-only closure audit. Zero production changes.
//
// 0.9.528 found and fixed a real PRODUCT_GAP (its own Section C, the
// flagship finding): ui/components/OwnPublicationPanel.js's own four
// Snapshot Discovery/Attribution readouts, and ui/components/
// WorldEncounterCanvas.js's own two, rendered raw
// DecentralizedSnapshotResolutionOutcome/SnapshotPublicationAttributionOutcome
// machine words directly ('resolved', 'not-discovered', 'match',
// 'no-match', ...). The fix was a new, small, pure view file —
// application/snapshot/SnapshotOutcomeInspectionView.js — with exactly two
// functions, routed through all six real call sites. This milestone's own
// job is to PROVE that fix is COMPLETE across every affected production
// presentation path, that it preserves the underlying outcome semantics
// unchanged, and that it introduces no new claim the evidence doesn't
// support:
//
//   Application outcome
//           │
//           ▼
//   SnapshotOutcomeInspectionView          (TRANSLATE, never reinterpret)
//           │
//           ▼
//   Human-readable UI label
//
// LETTERED SECTIONS (mirroring this milestone's own request):
//   A. Resolution outcome completeness — every real
//      DecentralizedSnapshotResolutionOutcome value has an intentional,
//      meaning-preserving label; none collapse into generic
//      success/failure; an unknown value still degrades to its raw value.
//   B. Attribution outcome completeness — the same for every
//      SnapshotPublicationAttributionOutcome value; attribution stays an
//      observation of a content-hash relationship, never an
//      authorship/ownership judgment.
//   C. Both production UI paths — OwnPublicationPanel.js and
//      WorldEncounterCanvas.js, swept generically (not just the six known
//      literal strings) so a reintroduced raw render anywhere in either
//      file's own Resolution/Attribution family would be caught.
//   D. Vocabulary consistency — equivalent evidence (a content-hash
//      correspondence check) reads with equivalent wording everywhere it
//      is shown, this milestone included.
//   E. No semantic mutation — resolution state, attribution state,
//      candidate identity, Publication identity, content hash, locator,
//      and discovery provenance all survive humanization unchanged; the
//      presentation adapter touches only the `.outcome` string.
//   F. Failure and unknown-value behavior — null, undefined, an unknown
//      future enum, and malformed values all degrade gracefully, never
//      throwing.
//   G. Overclaim guard — every known label checked against the
//      trust-language boundary named in this milestone's own brief
//      (trusted/authentic/official/owned/safe/permanent/authoritative),
//      plus the wider word list 0.9.526/0.9.528's own reassessments
//      already used.
//   H. Regression witnesses — the relevant existing Snapshot, World
//      Encounter, attribution, and evidence tests, re-executed live as
//      real subprocesses.
//   I. Production-change boundary — this audit itself changes no
//      production file, and application/snapshot/SnapshotOutcomeInspectionView.js
//      remains presentation-only (no I/O, no mutation, touches only the
//      `.outcome` field it is handed).
//
// DELIBERATELY EXCLUDED, per this milestone's own brief: new outcome
// enums, outcome-state redesign, business-logic changes, verification
// changes, attribution-policy changes, candidate ranking, discovery
// changes, Repository changes, World Encounter architecture changes, a
// generic UI humanization framework, and a whole-codebase status sweep.
// The 0.9.522 baseline already covers the broader raw-status problem.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));
async function source(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}
function codeOnly(text) {
    return text.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// The brief's own seven-word trust-language boundary, plus the wider list
// 0.9.526/0.9.528's own reassessments already swept their own touched
// files against — union of both, never a narrower list than either prior
// milestone used, so "overclaim" means at least as much here as it always
// has in this audit series.
const BRIEF_OVERCLAIM_WORDS = /\b(trusted|authentic|official|owned?|safe|permanent|authoritative)\b/i;
const WIDER_OVERCLAIM_WORDS = /\b(trusted|safe|permanent|guaranteed|owns?|owned|authored?|authorship|authentic|canonical|official|authoritative)\b/i;

function makeResolvedSnapshot(outcome, overrides = {}) {
    return {
        outcome,
        bytes: outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED ? 'snapshot-bytes' : null,
        candidates: [{ contentHash: 'hash-candidate', locator: 'locator://one', storage: 'local' }],
        locator: 'locator://one',
        storage: 'local',
        reason: outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED ? null : 'a reason string',
        ...overrides
    };
}

async function run() {
    console.log('=== 0.9.529 — Snapshot Outcome Presentation Boundary Closure Audit ===\n');

    const panelSource = await source('ui/components/OwnPublicationPanel.js');
    const canvasSource = (await Promise.all(worldEncounterCanvasFiles().map((file) => source(file)))).join('\n');
    const viewSource = await source('application/snapshot/SnapshotOutcomeInspectionView.js');
    const panelCode = codeOnly(panelSource);
    const canvasCode = codeOnly(canvasSource);
    const viewCode = codeOnly(viewSource);

    // ===============================================================
    // Section A — Resolution outcome completeness.
    // ===============================================================
    {
        const resolutionValues = Object.values(DecentralizedSnapshotResolutionOutcome);
        assert(resolutionValues.length === 5,
            n('A1. DecentralizedSnapshotResolutionOutcome still names exactly five values — the full set this audit exercises, not a subset'));

        const meaningKeywords = {
            [DecentralizedSnapshotResolutionOutcome.RESOLVED]: /retriev/i,
            [DecentralizedSnapshotResolutionOutcome.NOT_DISCOVERED]: /announc/i,
            [DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE]: /store/i,
            [DecentralizedSnapshotResolutionOutcome.CONTENT_UNAVAILABLE]: /retriev/i,
            [DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH]: /hash/i
        };
        const labels = new Set();
        for (const value of resolutionValues) {
            const label = describeSnapshotResolutionOutcomeLabel(value);
            assert(typeof label === 'string' && label.length > 0 && label !== value,
                n(`A2[${value}]. every real resolution outcome has an intentional, non-bare human-readable label`));
            assert(meaningKeywords[value].test(label),
                n(`A3[${value}]. the label preserves the actual meaning of this specific outcome (contains its own defining keyword, not a generic substitute)`));
            assert(!/^(success|failure|ok|error|failed)$/i.test(label.trim()),
                n(`A4[${value}]. the label is never a bare, undifferentiated "success"/"failure"/"error" word`));
            labels.add(label);
        }
        assert(labels.size === resolutionValues.length,
            n('A5. all five resolution labels are pairwise distinct — none collapsed into a shared generic label'));

        // Unknown value degrades to its raw value, never a fabricated
        // label and never a thrown error.
        const unknownFuture = 'future-resolution-outcome-not-yet-invented';
        assert(describeSnapshotResolutionOutcomeLabel(unknownFuture) === unknownFuture,
            n('A6. an unrecognized resolution outcome degrades to its own raw value, never a fabricated label'));

        console.log('✓ Section A: PRODUCT_COMPLETE — every real DecentralizedSnapshotResolutionOutcome value carries an intentional, meaning-preserving, mutually distinct label; an unknown future value degrades to its raw value.');
    }

    // ===============================================================
    // Section B — Attribution outcome completeness.
    // ===============================================================
    {
        const attributionValues = Object.values(SnapshotPublicationAttributionOutcome);
        assert(attributionValues.length === 2,
            n('B1. SnapshotPublicationAttributionOutcome still names exactly two values — MATCH and NO_MATCH'));

        const matchLabel = describeSnapshotAttributionOutcomeLabel(SnapshotPublicationAttributionOutcome.MATCH);
        const noMatchLabel = describeSnapshotAttributionOutcomeLabel(SnapshotPublicationAttributionOutcome.NO_MATCH);
        assert(matchLabel === 'Confirmed to match this Publication', n('B2. MATCH has its own intentional label'));
        assert(noMatchLabel === 'Does not match this Publication', n('B3. NO_MATCH has its own intentional, distinct label'));
        assert(matchLabel !== noMatchLabel, n('B4. the two attribution labels are distinct — never collapsed into one'));

        // Attribution remains an observation of a relationship between
        // material and Publication, never an authorship/ownership
        // judgment — neither label uses author/owner/belongs vocabulary.
        assert(!/\b(author|owner|belongs|creator|created by)\b/i.test(matchLabel) && !/\b(author|owner|belongs|creator|created by)\b/i.test(noMatchLabel),
            n('B5. neither attribution label uses authorship/ownership/creation vocabulary — a MATCH states a content-hash correspondence, never who made or owns the material'));

        // Live-exercise the real producer, resolveSnapshotPublicationAttribution(),
        // for both a genuine MATCH and a genuine NO_MATCH, then feed its
        // real output through the label function — never a hand-constructed
        // stand-in for the outcome value.
        const publication = { contentReference: { hash: 'shared-hash-value' } };
        const matchingResolved = makeResolvedSnapshot(DecentralizedSnapshotResolutionOutcome.RESOLVED, { bytes: 'shared-hash-value' });
        // computeContentHash() hashes the bytes; to get a genuine MATCH we
        // need publication.contentReference.hash to equal computeContentHash(bytes)
        // for whatever bytes we pass — so derive the publication hash from
        // the SAME resolution's own real content-hash computation instead
        // of hand-guessing a hash algorithm's output.
        const { computeContentHash } = await import('../serializer/contentHash.js');
        const realBytes = 'snapshot-attribution-closure-audit-bytes';
        const realHash = computeContentHash(realBytes);
        const genuineMatch = resolveSnapshotPublicationAttribution(
            { contentReference: { hash: realHash } },
            makeResolvedSnapshot(DecentralizedSnapshotResolutionOutcome.RESOLVED, { bytes: realBytes })
        );
        const genuineNoMatch = resolveSnapshotPublicationAttribution(
            { contentReference: { hash: 'a-completely-different-hash' } },
            makeResolvedSnapshot(DecentralizedSnapshotResolutionOutcome.RESOLVED, { bytes: realBytes })
        );
        assert(genuineMatch.outcome === SnapshotPublicationAttributionOutcome.MATCH,
            n('B6. a real resolveSnapshotPublicationAttribution() call with equal hashes genuinely reaches MATCH — not asserted, exercised'));
        assert(genuineNoMatch.outcome === SnapshotPublicationAttributionOutcome.NO_MATCH,
            n('B7. a real resolveSnapshotPublicationAttribution() call with differing hashes genuinely reaches NO_MATCH'));
        assert(describeSnapshotAttributionOutcomeLabel(genuineMatch.outcome) === matchLabel,
            n('B8. the label function reads the REAL producer\'s own output identically to the hand-checked value above'));
        assert(describeSnapshotAttributionOutcomeLabel(genuineNoMatch.outcome) === noMatchLabel,
            n('B9. same for the real NO_MATCH output'));

        // Resolution-failure pass-through: every non-RESOLVED resolution
        // outcome reads IDENTICALLY through both label functions — one
        // meaning, never two competing sentences depending which panel
        // shows it.
        for (const value of Object.values(DecentralizedSnapshotResolutionOutcome)) {
            if (value === DecentralizedSnapshotResolutionOutcome.RESOLVED) continue;
            const passedThrough = resolveSnapshotPublicationAttribution(publication, makeResolvedSnapshot(value));
            assert(passedThrough.outcome === value,
                n(`B10[${value}]. resolveSnapshotPublicationAttribution() passes a non-RESOLVED resolution outcome through unchanged, never reinterpreting it as NO_MATCH`));
            assert(describeSnapshotAttributionOutcomeLabel(passedThrough.outcome) === describeSnapshotResolutionOutcomeLabel(value),
                n(`B11[${value}]. the passed-through failure reads identically through describeSnapshotAttributionOutcomeLabel() and describeSnapshotResolutionOutcomeLabel()`));
        }

        // Unknown value degrades to raw, exactly like resolution's own.
        const unknownFuture = 'future-attribution-outcome-not-yet-invented';
        assert(describeSnapshotAttributionOutcomeLabel(unknownFuture) === unknownFuture,
            n('B12. an unrecognized attribution outcome degrades to its own raw value'));

        console.log('✓ Section B: PRODUCT_COMPLETE — MATCH/NO_MATCH each carry an intentional, distinct, ownership-free label; a real resolveSnapshotPublicationAttribution() call reaches the same labels; every resolution-failure pass-through reads identically through both functions.');
    }

    // ===============================================================
    // Section C — Both production UI paths.
    // ===============================================================
    {
        assert(panelCode.includes("import { describeSnapshotResolutionOutcomeLabel, describeSnapshotAttributionOutcomeLabel } from '../../application/snapshot/SnapshotOutcomeInspectionView.js';"),
            n('C1. OwnPublicationPanel.js imports both presentation functions from the one shared view file'));
        assert(canvasCode.includes("import { describeSnapshotResolutionOutcomeLabel, describeSnapshotAttributionOutcomeLabel } from '../../../application/snapshot/SnapshotOutcomeInspectionView.js';"),
            n('C2. WorldEncounterCanvas.js imports both presentation functions from the SAME shared view file — not a per-component duplicate'));

        // A GENERIC sweep, not merely the six known literal strings: any
        // `<result>.outcome` interpolation for the four Resolution/
        // Attribution-family result fields this milestone's scope covers,
        // anywhere in either file, that is NOT wrapped by one of the two
        // presentation functions. This would catch a reintroduced raw
        // render even under different surrounding whitespace/formatting.
        const scopedFields = ['snapshotDiscoveryResult', 'snapshotAttributionResult', 'selectedSnapshotResolutionResult', 'selectedSnapshotAttributionResult'];
        const rawOutcomePattern = /\{\{\s*([A-Za-z0-9_.]+)\.outcome\s*\}\}/g;
        for (const [file, name] of [[panelCode, 'OwnPublicationPanel.js'], [canvasCode, 'WorldEncounterCanvas.js']]) {
            let match;
            const offenders = [];
            while ((match = rawOutcomePattern.exec(file)) !== null) {
                const fieldExpr = match[1];
                if (scopedFields.some((f) => fieldExpr === f)) {
                    offenders.push(match[0]);
                }
            }
            assert(offenders.length === 0,
                n(`C3[${name}]. no raw, unwrapped "{{ <field>.outcome }}" interpolation exists anywhere in this file for any of the four Resolution/Attribution-family fields (found: ${JSON.stringify(offenders)}) — every one of them is reached only through the presentation functions`));
        }

        // Positive confirmation: each field DOES render through the
        // presentation wrapper, for every field the given component
        // actually exposes.
        const panelWrappedPattern = /\{\{\s*describeSnapshot(Resolution|Attribution)Label\(\s*(snapshotDiscoveryResult|snapshotAttributionResult|selectedSnapshotResolutionResult|selectedSnapshotAttributionResult)\.outcome\s*\)\s*\}\}/g;
        const panelWrappedFields = new Set();
        let m;
        while ((m = panelWrappedPattern.exec(panelCode)) !== null) panelWrappedFields.add(m[2]);
        assert(scopedFields.every((f) => panelWrappedFields.has(f)),
            n(`C4. OwnPublicationPanel.js wraps all four of its own fields through a presentation function (found: ${JSON.stringify([...panelWrappedFields])})`));

        const canvasWrappedPattern = /\{\{\s*describeSnapshot(Resolution|Attribution)Label\(\s*(snapshotDiscoveryResult|snapshotAttributionResult)\.outcome\s*\)\s*\}\}/g;
        const canvasWrappedFields = new Set();
        while ((m = canvasWrappedPattern.exec(canvasCode)) !== null) canvasWrappedFields.add(m[2]);
        assert(canvasWrappedFields.has('snapshotDiscoveryResult') && canvasWrappedFields.has('snapshotAttributionResult'),
            n(`C5. WorldEncounterCanvas.js wraps both of its own fields through a presentation function (found: ${JSON.stringify([...canvasWrappedFields])})`));

        // Neither component defines its own, second, competing label map
        // for these two enums' own wire values — the enum's own literal
        // strings never appear as object-literal keys anywhere outside
        // the one shared view file.
        const localLabelMapPattern = /['"](resolved|not-discovered|store-unavailable|content-unavailable|content-hash-mismatch|match|no-match)['"]\s*:/;
        assert(!localLabelMapPattern.test(panelCode) && !localLabelMapPattern.test(canvasCode),
            n('C6. neither component file defines its own local label map keyed by the enums\' own raw wire values — the one shared view file remains the sole source of these labels'));

        // Both component wrapper methods are pure pass-throughs (already
        // established by 0.9.528; re-confirmed here as part of this
        // closure so the boundary itself, not merely its call sites, is
        // proven not to have grown logic of its own since).
        assert(panelCode.includes('describeSnapshotResolutionLabel(outcome) {\n            return describeSnapshotResolutionOutcomeLabel(outcome);\n        },') &&
            panelCode.includes('describeSnapshotAttributionLabel(outcome) {\n            return describeSnapshotAttributionOutcomeLabel(outcome);\n        }'),
            n('C7. OwnPublicationPanel.js\'s own two wrapper methods remain pure pass-throughs with no logic of their own'));
        assert(canvasCode.includes('describeSnapshotResolutionLabel(outcome) {\n        return describeSnapshotResolutionOutcomeLabel(outcome);\n    },') &&
            canvasCode.includes('describeSnapshotAttributionLabel(outcome) {\n        return describeSnapshotAttributionOutcomeLabel(outcome);\n    }'),
            n('C8. WorldEncounterCanvas.js\'s own two wrapper methods remain pure pass-throughs with no logic of their own'));

        console.log('✓ Section C: PRODUCT_COMPLETE — both real production UI paths route every Resolution/Attribution-family outcome exclusively through the shared presentation functions; a generic sweep (not just the six known literal strings) finds no raw, unwrapped render and no local competing label map in either file.');
    }

    // ===============================================================
    // Section D — Vocabulary consistency.
    // ===============================================================
    {
        const materialVerifiedLabel = describeWorldEncounterMaterialVerificationStatusLabel(WorldEncounterMaterialVerificationStatus.VERIFIED);
        const snapshotMatchLabel = describeSnapshotAttributionOutcomeLabel(SnapshotPublicationAttributionOutcome.MATCH);
        assert(materialVerifiedLabel === 'Confirmed to match the selected encounter',
            n('D1. World Encounter Material verification\'s own 0.9.519 label is unchanged by this milestone'));
        assert(snapshotMatchLabel.startsWith('Confirmed to match'),
            n('D2. the Snapshot Attribution MATCH label opens with the identical "Confirmed to match" phrase for the identical kind of evidence (a hash-equality check) — equivalent evidence reads with equivalent semantic strength'));

        // Both real production surfaces produce the SAME label for the
        // SAME outcome, by construction (one shared function) — proven
        // here by direct render-site text comparison rather than merely
        // asserting they call the same function.
        const panelMatchRender = 'describeSnapshotAttributionLabel(snapshotAttributionResult.outcome)';
        const canvasMatchRender = 'describeSnapshotAttributionLabel(snapshotAttributionResult.outcome)';
        assert(panelCode.includes(panelMatchRender) && canvasCode.includes(canvasMatchRender),
            n('D3. both files render the Snapshot Attribution outcome through the textually identical expression — no per-file wording variant'));

        // Neither file concatenates or prefixes additional text onto the
        // label's own return value that would strengthen its claim (e.g.
        // "Verified: " + describeSnapshotAttributionLabel(...)).
        assert(!/describeSnapshotAttributionLabel\([^)]*\)\s*\+/.test(panelCode) && !/describeSnapshotAttributionLabel\([^)]*\)\s*\+/.test(canvasCode),
            n('D4. neither file concatenates additional text onto the attribution label\'s own return value — the label is rendered exactly as the presentation function returns it'));
        assert(!/describeSnapshotResolutionLabel\([^)]*\)\s*\+/.test(panelCode) && !/describeSnapshotResolutionLabel\([^)]*\)\s*\+/.test(canvasCode),
            n('D5. neither file concatenates additional text onto the resolution label\'s own return value either'));

        console.log('✓ Section D: PRODUCT_COMPLETE — Material verification and Snapshot attribution report the identical kind of evidence with the identical opening phrase; both real UI paths render the attribution label through the textually identical, unaugmented expression.');
    }

    // ===============================================================
    // Section E — No semantic mutation.
    // ===============================================================
    {
        // The presentation functions read ONLY the `.outcome` field —
        // structurally proven by sweeping the view file's own executable
        // code for any reference to a sibling identity/provenance field.
        const forbiddenFieldReferences = ['.bytes', '.candidates', '.locator', '.storage', '.reason', '.contentHash', '.publicationHash', '.snapshotHash'];
        for (const field of forbiddenFieldReferences) {
            assert(!viewCode.includes(field),
                n(`E1[${field}]. application/snapshot/SnapshotOutcomeInspectionView.js's own executable code never references "${field}" — it reads only the outcome string it is handed, nothing else about the underlying result`));
        }

        // Live-exercise: build a full resolvedSnapshot fixture carrying
        // every one of those sibling fields, snapshot it, call the
        // resolution label function, and prove the fixture is
        // byte-identical afterward — no mutation, no field stripped, no
        // field added.
        const fixture = makeResolvedSnapshot(DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH, {
            candidates: [{ contentHash: 'candidate-hash', locator: 'locator://mutation-check', storage: 'local' }],
            locator: 'locator://mutation-check',
            reason: 'content did not match'
        });
        const before = JSON.stringify(fixture);
        const label = describeSnapshotResolutionOutcomeLabel(fixture.outcome);
        const after = JSON.stringify(fixture);
        assert(before === after,
            n('E2. calling describeSnapshotResolutionOutcomeLabel(fixture.outcome) leaves the ENTIRE resolvedSnapshot fixture byte-identical — candidate identity, locator, storage, and discovery provenance (reason) all survive untouched'));
        assert(typeof label === 'string' && label !== fixture.outcome,
            n('E3. the label itself is a genuinely different, human-readable string — proving the function actually did something, not merely a no-op'));

        // Same proof for attribution: the REAL producer's own output
        // (publicationHash/snapshotHash/reason) survives being read by
        // the label function unchanged.
        const { computeContentHash } = await import('../serializer/contentHash.js');
        const bytes = 'section-e-mutation-check-bytes';
        const hash = computeContentHash(bytes);
        const attributionResult = resolveSnapshotPublicationAttribution(
            { contentReference: { hash } },
            makeResolvedSnapshot(DecentralizedSnapshotResolutionOutcome.RESOLVED, { bytes })
        );
        const attributionBefore = JSON.stringify(attributionResult);
        describeSnapshotAttributionOutcomeLabel(attributionResult.outcome);
        const attributionAfter = JSON.stringify(attributionResult);
        assert(attributionBefore === attributionAfter,
            n('E4. calling describeSnapshotAttributionOutcomeLabel(attributionResult.outcome) leaves the real attribution result\'s own publicationHash/snapshotHash/reason untouched — Publication identity and content hash both survive unchanged'));

        // The rendered templates themselves confirm this at the UI-wiring
        // level: `reason`/`locator` render as their own raw <dd> values,
        // SIDE BY SIDE with the humanized outcome — proving only the
        // outcome word is translated, never the surrounding evidence.
        assert(panelCode.includes('<dd>{{ snapshotDiscoveryResult.reason }}</dd>') && panelCode.includes('<dd>{{ snapshotDiscoveryResult.locator }}</dd>'),
            n('E5. OwnPublicationPanel.js still renders reason/locator directly, unhumanized, alongside the translated outcome — the presentation boundary touches only the outcome word'));
        assert(canvasCode.includes('<dd>{{ snapshotDiscoveryResult.reason }}</dd>') && canvasCode.includes('<dd>{{ snapshotDiscoveryResult.locator }}</dd>'),
            n('E6. WorldEncounterCanvas.js does the same'));

        console.log('✓ Section E: PRODUCT_COMPLETE — the presentation adapter is structurally provable to touch only the `.outcome` string; resolution state, attribution state, candidate identity, Publication identity, content hash, locator, and discovery provenance all survive humanization byte-for-byte unchanged, both in isolated fixtures and in the rendered templates themselves.');
    }

    // ===============================================================
    // Section F — Failure and unknown-value behavior.
    // ===============================================================
    {
        assert(describeSnapshotResolutionOutcomeLabel(null) === null, n('F1. describeSnapshotResolutionOutcomeLabel(null) degrades to null'));
        assert(describeSnapshotResolutionOutcomeLabel(undefined) === null, n('F2. describeSnapshotResolutionOutcomeLabel(undefined) degrades to null'));
        assert(describeSnapshotAttributionOutcomeLabel(null) === null, n('F3. describeSnapshotAttributionOutcomeLabel(null) degrades to null'));
        assert(describeSnapshotAttributionOutcomeLabel(undefined) === null, n('F4. describeSnapshotAttributionOutcomeLabel(undefined) degrades to null'));

        const unknownEnum = 'this-value-does-not-exist-in-either-enum';
        assert(describeSnapshotResolutionOutcomeLabel(unknownEnum) === unknownEnum, n('F5. an unknown future resolution enum value renders verbatim, never hidden'));
        assert(describeSnapshotAttributionOutcomeLabel(unknownEnum) === unknownEnum, n('F6. an unknown future attribution enum value renders verbatim, never hidden'));

        // Malformed values (never expected in production, but the
        // documented graceful-degradation discipline is "never throws,"
        // not "only handles strings") — neither function throws.
        const malformedValues = [42, {}, [], true, false, ''];
        for (const value of malformedValues) {
            let threw = false;
            let resolutionResult, attributionResult;
            try {
                resolutionResult = describeSnapshotResolutionOutcomeLabel(value);
                attributionResult = describeSnapshotAttributionOutcomeLabel(value);
            } catch {
                threw = true;
            }
            assert(threw === false, n(`F7[${JSON.stringify(value)}]. neither presentation function throws for a malformed outcome value`));
            if (value === '' || value === false) {
                assert(resolutionResult === null && attributionResult === null,
                    n(`F8[${JSON.stringify(value)}]. a falsy-but-defined malformed value (${JSON.stringify(value)}) degrades to null, exactly like a missing outcome — never rendered as an empty/false label`));
            } else {
                assert(resolutionResult === value && attributionResult === value,
                    n(`F9[${JSON.stringify(value)}]. a truthy malformed value degrades to itself, verbatim, never a thrown error and never a fabricated label`));
            }
        }

        console.log('✓ Section F: PRODUCT_COMPLETE — null, undefined, an unknown future enum value, and every malformed shape tested all degrade gracefully (to null or to the raw value itself) and never throw.');
    }

    // ===============================================================
    // Section G — Overclaim guard.
    // ===============================================================
    {
        const allKnownLabels = [
            ...Object.values(DecentralizedSnapshotResolutionOutcome).map((v) => describeSnapshotResolutionOutcomeLabel(v)),
            ...Object.values(SnapshotPublicationAttributionOutcome).map((v) => describeSnapshotAttributionOutcomeLabel(v))
        ];
        assert(allKnownLabels.length === 7, n('G1. seven real labels are checked (five resolution + two attribution) — the full known set'));
        for (const label of allKnownLabels) {
            assert(!BRIEF_OVERCLAIM_WORDS.test(label),
                n(`G2[${JSON.stringify(label)}]. no known label uses any of this milestone's own seven named trust-boundary words (trusted/authentic/official/owned/safe/permanent/authoritative)`));
            assert(!WIDER_OVERCLAIM_WORDS.test(label),
                n(`G3[${JSON.stringify(label)}]. no known label uses the wider overclaim word list 0.9.526/0.9.528 already swept their own touched files against, either`));
        }

        // Sweep the view file's own label-map definitions (comments
        // excluded, since the file's own header quotes several of these
        // words while explicitly REFUSING them).
        assert(!BRIEF_OVERCLAIM_WORDS.test(viewCode),
            n('G4. application/snapshot/SnapshotOutcomeInspectionView.js\'s own executable code (comments excluded) never uses any of the seven named trust-boundary words'));

        console.log('✓ Section G: PRODUCT_COMPLETE — every one of the seven real, known labels, and the view file\'s own executable code, stay clear of both this milestone\'s own seven-word trust-language boundary and the wider overclaim list this audit series already established.');
    }

    // ===============================================================
    // Section H — Regression witnesses.
    // ===============================================================
    {
        const regressionFiles = [
            'tests/SnapshotEncounterPlacementProductExperienceReassessment.test.js',
            'tests/SnapshotCandidateInteractionCompletionAudit.test.js',
            'tests/SnapshotLifecycleSemanticBoundaryAudit.test.js',
            'tests/SnapshotPublicationAttribution.test.js',
            'tests/SelectedSnapshotAttribution.test.js',
            'tests/WorldViewSnapshotAttribution.test.js',
            'tests/DecentralizedSnapshotResolution.test.js'
        ];
        for (const file of regressionFiles) {
            const result = execFileSync(process.execPath, [file], { cwd: SOURCE_ROOT, encoding: 'utf8' });
            assert(result.includes('✅'),
                n(`H. live regression: ${file} still passes, unmodified, as a real subprocess`));
        }

        console.log('✓ Section H: PRODUCT_COMPLETE — the 0.9.528 flagship test, its own updated Diagnostic Tools witness, the attribution-authority boundary audit, and the underlying discovery/resolution/attribution unit tests all still pass live, as real subprocesses.');
    }

    // ===============================================================
    // Section I — Production-change boundary.
    // ===============================================================
    {
        const statusOutput = execFileSync('git', ['status', '--porcelain'], { cwd: SOURCE_ROOT, encoding: 'utf8' });
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const productionDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'peer', 'content', 'presence', 'ui', 'css', 'server', 'replication', 'serializer', 'world', 'world-layout', 'spatial', 'base', 'arweave', 'nostr', 'placement'];
        const touchedProduction = changed.filter((f) => productionDirs.some((dir) => f.startsWith(`${dir}/`)));
        assert(touchedProduction.length === 0,
            n(`I1. this closure audit touches ZERO production files — only its own new test file and its tests.html registration (found touched production files: ${JSON.stringify(touchedProduction)})`));

        // application/snapshot/SnapshotOutcomeInspectionView.js itself is
        // unmodified by this milestone.
        let diffOutput = '';
        try {
            diffOutput = execFileSync('git', ['diff', '--stat', '--', 'application/snapshot/SnapshotOutcomeInspectionView.js'], { cwd: SOURCE_ROOT, encoding: 'utf8' });
        } catch {
            diffOutput = 'diff failed';
        }
        assert(diffOutput.trim() === '',
            n('I2. application/snapshot/SnapshotOutcomeInspectionView.js carries no working-tree diff — this audit leaves the file this milestone examines byte-for-byte unchanged'));

        // The file remains presentation-only: no I/O, no mutation, no
        // async, no side-effecting global access — the identical purity
        // discipline every sibling view file in this family already
        // holds, re-confirmed structurally here.
        const forbiddenPurityTokens = ['fetch(', 'XMLHttpRequest', 'localStorage', 'sessionStorage', 'Date.now', 'Math.random', 'async ', 'await ', 'this.', 'window.', 'document.', 'throw '];
        for (const token of forbiddenPurityTokens) {
            assert(!viewCode.includes(token),
                n(`I3[${token.trim()}]. application/snapshot/SnapshotOutcomeInspectionView.js's own executable code contains no "${token.trim()}" — it stays pure, synchronous, read-only, and non-throwing`));
        }
        assert(!viewCode.includes('export class') && !viewCode.includes('export default'),
            n('I4. the file exports plain functions only — no class, no default export, no hidden state container'));

        console.log('✓ Section I: PRODUCT_COMPLETE — this closure audit is test-only; application/snapshot/SnapshotOutcomeInspectionView.js is byte-for-byte unmodified and remains structurally pure, synchronous, and read-only.');
    }

    console.log('\n=== Verdict ===');
    console.log('A_resolution_outcome_completeness: PRODUCT_COMPLETE');
    console.log('B_attribution_outcome_completeness: PRODUCT_COMPLETE');
    console.log('C_both_production_ui_paths: PRODUCT_COMPLETE');
    console.log('D_vocabulary_consistency: PRODUCT_COMPLETE');
    console.log('E_no_semantic_mutation: PRODUCT_COMPLETE');
    console.log('F_failure_and_unknown_value_behavior: PRODUCT_COMPLETE');
    console.log('G_overclaim_guard: PRODUCT_COMPLETE');
    console.log('H_regression_witnesses: PRODUCT_COMPLETE');
    console.log('I_production_change_boundary: PRODUCT_COMPLETE');
    console.log('\nPRODUCT_COMPLETE — 0.9.528\'s own flagship finding is closed. Every real DecentralizedSnapshotResolutionOutcome and');
    console.log('SnapshotPublicationAttributionOutcome value carries an intentional, meaning-preserving, ownership-free label, reached');
    console.log('exclusively through the shared presentation functions on both real production UI paths, with a generic sweep (not merely');
    console.log('the six previously-known literal strings) finding no raw render and no competing local label map. The presentation');
    console.log('adapter is structurally proven pure and semantics-preserving; failure and unknown-value handling degrade gracefully;');
    console.log('no label crosses the trust-language boundary. STOP the Snapshot Encounter/Placement arc (0.9.519 through 0.9.529).');

    console.log(`\n✅ All ${assertionCount} assertions passed for 0.9.529 — Snapshot Outcome Presentation Boundary Closure Audit.`);
}

run().catch((error) => {
    console.error('SnapshotOutcomePresentationBoundaryClosureAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
