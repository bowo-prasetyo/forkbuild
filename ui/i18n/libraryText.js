// Names and descriptions of Build Library items, in the chosen language.
// The built-in libraries (core/library/) keep their English `name` and
// `description`, which documents and other libraries rely on; a translation
// is looked up by the item's id instead: `core:slope_45` →
// `library.core.slope45` and `library.core.slope45.description`. Anything
// without a message (a personal blueprint, a community library) shows its
// own name, which is never translated.
import { hasMessage, t } from './i18n.js';

export function libraryItemKey(id) {
    if (typeof id !== 'string' || !id.includes(':')) {
        return null;
    }
    const [namespace, name] = id.split(':', 2);
    const camel = name.replace(/[_-]+([A-Za-z0-9])/g, (match, letter) => letter.toUpperCase());
    return `library.${namespace}.${camel}`;
}

export function libraryItemName(item) {
    const key = item ? libraryItemKey(item.id) : null;
    return key && hasMessage(key) ? t(key) : (item ? item.name : '');
}

export function libraryItemDescription(item) {
    const key = item ? libraryItemKey(item.id) : null;
    return key && hasMessage(`${key}.description`) ? t(`${key}.description`) : (item ? item.description : '');
}
