const UNITS = ['bytes', 'KB', 'MB', 'GB', 'TB'];

// "1.4 MB" for 1,468,006. Decimal units, as browsers report storage quotas.
export function formatByteSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '';
    let value = bytes;
    let unit = 0;
    while (value >= 1000 && unit < UNITS.length - 1) {
        value /= 1000;
        unit++;
    }
    return unit === 0 ? `${value} bytes` : `${value < 10 ? value.toFixed(1) : Math.round(value)} ${UNITS[unit]}`;
}
