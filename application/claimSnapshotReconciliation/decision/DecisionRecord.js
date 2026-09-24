// Shape checks and identity for stored reconciliation decision records.
// Kept free of imports so views can share it without taking on plan or
// discovery vocabulary.

export function isGenuineDecision(entry) {
    return (
        entry !== null && typeof entry === 'object'
        && entry.decided === true
        && entry.candidate !== null && typeof entry.candidate === 'object'
        && typeof entry.candidate.type === 'string'
        && (entry.decision === 'OBSERVE' || entry.decision === 'DEFER')
        && typeof entry.decidedAt === 'string'
    );
}

// A decision's identity is its candidate, decision and decidedAt together;
// nothing narrower.
export function canonicalDecisionKey(record) {
    return JSON.stringify({ candidate: record.candidate, decision: record.decision, decidedAt: record.decidedAt });
}
