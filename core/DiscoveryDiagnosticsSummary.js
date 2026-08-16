// 0.2.30 — turns the raw counters `spatial/DiscoveryDiagnostics.js`
// (0.2.19) already accumulates during a decentralized discovery query
// into the compact, honest shape a UI actually needs: "is there a
// trust layer to ask at all, and if so, what does it say?"
//
// This is deliberately a PURE function over a plain, duck-typed
// diagnostics-shaped object — not a class, not an import of
// spatial/DiscoveryDiagnostics.js — so core/ stays dependency-free
// downward (see core/SpatialQuery.js, core/SpatialOverlap.js for the
// same posture) and so a caller can pass either a real
// DiscoveryDiagnostics instance or a plain object with the same
// counters (as the test suite does) without this module caring which.
//
// The whole point of this milestone is stated directly in the design
// doc that requested it: "the UI doesn't invent trust information. It
// receives it from the discovery layer." This function does not
// invent anything either — every field in its output is either a
// direct pass-through of a real counter or the ABSENCE of one. There
// is no "assume valid" branch anywhere in here.
//
// Four states a caller can distinguish, matching the three-way (really
// four-way) epistemic distinction the milestone asked for:
//
//   available: false            -> no trust-capable discovery provider
//                                   was even consulted. This is NOT a
//                                   claim that the world is empty or
//                                   that everything found is trusted —
//                                   it is an honest "this replica has
//                                   no trust layer wired for this
//                                   query" (today's default: the live
//                                   World View still runs on the plain
//                                   LocalWorldLayoutProvider/
//                                   LocalDiscoveryProvider scan
//                                   established in 0.2.26/0.2.28/
//                                   0.2.29, which has no manifest/root/
//                                   signature concept to report on at
//                                   all — see docs/Principles.md).
//   available: true, fatal: msg -> a trust-capable provider WAS
//                                   consulted, but the root/authority
//                                   itself could not be trusted at all
//                                   (DecentralizedSpatialDiscoveryProvider
//                                   throws for exactly this case — an
//                                   untrusted/equivocating/tampered
//                                   root). Nothing about this region's
//                                   index could be verified this pass.
//   available: true, complete: true
//                                -> the trust layer ran and found
//                                   nothing to complain about: every
//                                   manifest loaded, every record
//                                   checked out.
//   available: true, complete: false, warnings: [...]
//                                -> the trust layer ran and found
//                                   SOME real issue — a missing or
//                                   corrupt manifest, a rejected
//                                   record, a stale accelerator entry,
//                                   an unresolved conflict, or a
//                                   downstream equivocation warning
//                                   that didn't rise to `fatal`.
export function summarizeDiscoveryDiagnostics(diagnostics, { fatal = null } = {}) {
    if (fatal) {
        return { available: true, fatal, complete: false, warnings: [] };
    }
    if (!diagnostics) {
        return { available: false, fatal: null, complete: false, warnings: [] };
    }

    const warnings = [];
    const push = (status, count, message) => {
        if (count > 0) {
            warnings.push({ status, count, message });
        }
    };

    push('MISSING', diagnostics.manifestsMissing || 0,
        `${diagnostics.manifestsMissing} spatial index manifest${diagnostics.manifestsMissing === 1 ? '' : 's'} unavailable`);
    push('INTEGRITY_FAILURE', diagnostics.manifestsInvalid || 0,
        `${diagnostics.manifestsInvalid} spatial index manifest${diagnostics.manifestsInvalid === 1 ? '' : 's'} failed integrity check`);
    push('UNAVAILABLE', diagnostics.recordsRejected || 0,
        `${diagnostics.recordsRejected} placement record${diagnostics.recordsRejected === 1 ? '' : 's'} could not be trusted`);
    push('STALE', diagnostics.staleEntries || 0,
        `${diagnostics.staleEntries} stale entr${diagnostics.staleEntries === 1 ? 'y' : 'ies'} in the spatial index accelerator`);
    push('CONFLICTING', diagnostics.conflicts || 0,
        `${diagnostics.conflicts} placement${diagnostics.conflicts === 1 ? '' : 's'} with an unresolved conflict`);
    push('EQUIVOCATING', diagnostics.equivocations || 0,
        `${diagnostics.equivocations} index authorit${diagnostics.equivocations === 1 ? 'y' : 'ies'} signed conflicting roots`);

    return {
        available: true,
        fatal: null,
        complete: warnings.length === 0,
        warnings
    };
}
