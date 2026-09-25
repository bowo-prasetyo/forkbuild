// Test-support only. Every key name in a JSON-like value, at any depth,
// lowercased. Vocabulary checks ("no field is named score") look at field
// names only: values hold random signatures and did:key identifiers, which
// can contain any short word by chance.
export function keyNames(value) {
    if (Array.isArray(value)) return value.flatMap(keyNames);
    if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([key, child]) => [key.toLowerCase(), ...keyNames(child)]);
    }
    return [];
}
