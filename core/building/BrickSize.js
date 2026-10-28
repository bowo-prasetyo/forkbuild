// A brick's size as the Build Library labels it (finding P2-9 of
// docs/reviews/EditorPlacementUX-2026-10-27.md): its footprint, smaller
// side first, then its height, in grid units: "1×1×1" for the Cube,
// "1×1×½" for the Half Cube, "2×4×¼" for the Plate 2×4. Quarters and
// halves read as fractions; anything else goes through `formatNumber`,
// so the caller decides the locale's decimal mark.
const FRACTIONS = new Map([[0.25, '¼'], [0.5, '½'], [0.75, '¾']]);

export function brickSizeLabel(definition, formatNumber = (value) => String(value)) {
    const part = (value) => {
        const whole = Math.floor(value);
        const fraction = FRACTIONS.get(Math.round((value - whole) * 100) / 100);
        if (fraction) return whole > 0 ? `${whole}${fraction}` : fraction;
        return formatNumber(value);
    };
    const [small, large] = [definition.width, definition.depth].sort((a, b) => a - b);
    return `${part(small)}×${part(large)}×${part(definition.height)}`;
}
