// A byte count in the chosen language: "1,4 MB" in Indonesian, "1.4 MB" in
// English (utils/formatByteSize.js does the rounding). KB, MB, GB and TB are
// written the same everywhere; "bytes" is a message.
import { byteSizeParts } from '../../utils/formatByteSize.js';
import { formatNumber, t } from './i18n.js';

export function byteSizeText(bytes) {
    const parts = byteSizeParts(bytes);
    if (!parts) return '';
    if (parts.unit === 'bytes') return t('units.bytes', { count: parts.value });
    const digits = parts.value < 10 ? 1 : 0;
    return `${formatNumber(parts.value, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${parts.unit}`;
}
