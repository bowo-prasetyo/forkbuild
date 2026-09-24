// Test-support only. Tests that pin a file's dependencies count its import
// lines. Imports of the shared leaf helpers below carry no feature
// vocabulary, so those tests leave them out of the count.
const SHARED_HELPER_IMPORT = /from '(\.\.?\/)+([\w]+\/)*(utils\/\w+|CandidateIdentityKey|DecisionRecord|ObservationRecord)\.js';/;

// The shared helpers that live inside application/claimSnapshotReconciliation/.
export const SHARED_RECONCILIATION_HELPER_FILES = ['CandidateIdentityKey.js', 'DecisionRecord.js', 'ObservationRecord.js'];

export function isSharedHelperImport(line) {
    return SHARED_HELPER_IMPORT.test(line);
}

// The top-level import lines of `source`, without shared-helper imports.
export function featureImportLines(source) {
    return source.split('\n').filter((line) => line.startsWith('import ') && !isSharedHelperImport(line));
}
