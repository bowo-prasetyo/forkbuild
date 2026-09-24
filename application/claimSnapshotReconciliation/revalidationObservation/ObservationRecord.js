// Shape checks and identity for stored revalidation observation records.
// Kept free of imports so views can share it without taking on decision,
// plan or archive vocabulary.

export function isGenuineObservation(entry) {
    return (
        entry !== null && typeof entry === 'object'
        && entry.observed === true
        && typeof entry.observedAt === 'string'
    );
}

// The six fields that identify one observation. Two observations that
// differ only in observedAt stay distinct.
export function canonicalObservationKey(entry) {
    return JSON.stringify({
        decision: entry.decision,
        planIdentity: entry.planIdentity,
        candidatePresent: entry.candidatePresent,
        candidateType: entry.candidateType,
        candidateMatchesPlan: entry.candidateMatchesPlan,
        observedAt: entry.observedAt
    });
}
