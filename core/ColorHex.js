// Pure conversion between the 0xRRGGBB numbers Three.js materials and
// BrickDefinition/Brick colors use internally, and the "#rrggbb" strings
// HTML's <input type="color"> reads and writes. Colocated in core/ (not
// ui/ or renderer/) purely as a pure-function utility, the same "logic
// lives in something headlessly testable" precedent core/sortStructures.js
// already established for ui/components/BuildLibraryPanel.js to import.
export function toCssHex(color) {
    const value = Number.isFinite(color) ? color : 0;
    return `#${(value & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function fromCssHex(css) {
    return Number.parseInt(String(css).replace('#', ''), 16) || 0;
}
