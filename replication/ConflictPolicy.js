// Deterministic conflict resolution.
// For concurrent valid revisions, choose the lexicographically smallest
// immutable content identity as the presentation winner.
export class ConflictPolicy {
    selectWinner(revisions) {
        if (!revisions || revisions.length === 0) return null;
        const sorted = [...revisions].sort((a, b) => {
            if (a.hash < b.hash) return -1;
            if (a.hash > b.hash) return 1;
            return 0;
        });
        return sorted[0].hash;
    }
}
