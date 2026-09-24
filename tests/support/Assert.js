// Test-support only. The plain assertion most tests share; tests that number
// their assertions keep their own counting assert() and n().
export function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
