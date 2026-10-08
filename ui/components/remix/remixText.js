import { t } from '../../i18n/i18n.js';

// The words for a build's remix lineage (core/RemixLineage.js), the same on
// a shared link's arrival screen and on the Repository's cards and list.

// "Remixed from …" for describeRemixSource()'s `{ title, author }`, or ''
// for a build that isn't a remix.
export function remixedFromText(source) {
    if (!source) return '';
    if (source.title && source.author) return t('remix.fromBy', { title: source.title, author: source.author });
    if (source.title) return t('remix.from', { title: source.title });
    if (source.author) return t('remix.fromAuthor', { author: source.author });
    return t('remix.fromUnknown');
}

// "Remixed N times", or '' for none.
export function remixCountText(count) {
    return Number.isInteger(count) && count > 0 ? t('remix.count', { count }) : '';
}
