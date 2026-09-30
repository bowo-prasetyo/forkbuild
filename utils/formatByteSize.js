const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'];

// { value, unit } for a byte count: { value: 1.4, unit: 'MB' } for 1,468,006,
// rounded as formatByteSize() shows it. Decimal units, as browsers report
// storage quotas. Null for anything that isn't a byte count.
export function byteSizeParts(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return null;
    let value = bytes;
    let unit = 0;
    while (value >= 1000 && unit < UNITS.length - 1) {
        value /= 1000;
        unit++;
    }
    if (unit === 0) return { value, unit: UNITS[0] };
    return { value: value < 10 ? Math.round(value * 10) / 10 : Math.round(value), unit: UNITS[unit] };
}

// "1.4 MB" for 1,468,006, in English; ui/i18n/sizeText.js writes it in the
// chosen language.
export function formatByteSize(bytes) {
    const parts = byteSizeParts(bytes);
    if (!parts) return '';
    return parts.unit === UNITS[0] ? `${parts.value} bytes` : `${parts.value < 10 ? parts.value.toFixed(1) : parts.value} ${parts.unit}`;
}
