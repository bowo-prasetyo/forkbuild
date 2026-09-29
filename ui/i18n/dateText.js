// Dates shown in the chosen language, for the helpers outside ui/ that
// format a date for a person to read.
import { formatPublicationDate } from '../../core/PublicationDateAmbiguity.js';
import { intlLocale } from './i18n.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// utils/formatRelativeVisit.js's reading (today / yesterday / N days ago,
// never finer than a day), worded by Intl.RelativeTimeFormat. Null for no
// timestamp or one in the future, as there.
export function relativeVisitText(epochMs, now = Date.now()) {
    if (typeof epochMs !== 'number' || now - epochMs < 0) {
        return null;
    }
    const days = Math.floor((now - epochMs) / DAY_MS);
    return new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' }).format(-days, 'day');
}

export function publicationDateText(publishedAt, precise) {
    return formatPublicationDate(publishedAt, precise, intlLocale());
}
