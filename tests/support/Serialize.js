// Test-support only. Compares plain values structurally by their JSON text.
export function serialize(value) {
    return JSON.stringify(value);
}
