export const ConflictRelation = Object.freeze({
    EQUAL: 'EQUAL',
    BEFORE: 'BEFORE', // A happens-before B
    AFTER: 'AFTER',   // B happens-before A
    CONCURRENT: 'CONCURRENT'
});

export class ConflictResolver {
    compare(stampA, stampB) {
        if (!stampA && !stampB) return ConflictRelation.EQUAL;
        if (!stampA) return ConflictRelation.BEFORE; 
        if (!stampB) return ConflictRelation.AFTER;
        
        if (stampA.equals(stampB)) return ConflictRelation.EQUAL;
        if (stampA.happensBefore(stampB)) return ConflictRelation.BEFORE;
        if (stampB.happensBefore(stampA)) return ConflictRelation.AFTER;
        return ConflictRelation.CONCURRENT;
    }
}
