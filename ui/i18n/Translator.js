// Turns a message key and its parameters into text in one locale.
//
// A message is either a string or, when it depends on a count, an object of
// plural forms: `{ one: '{count} brick', other: '{count} bricks' }`, keyed by
// the categories Intl.PluralRules gives for the locale (zero, one, two, few,
// many, other), with optional exact matches like '=0' checked first. `other`
// is always required, since every locale has it.
//
// `{name}` in a message is replaced by params.name; numbers are formatted for
// the locale, a message descriptor (core/Message.js) is translated first, and
// a list is joined the locale's way ("a, b, c"). A placeholder with no
// matching parameter is left as written, so a missing value shows up instead
// of silently vanishing.
//
// A key missing from the locale's messages falls back to the source
// (English) messages, then to the key itself, and is reported once to
// `onMissing`.
import { isMessage } from '../../core/Message.js';

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;

export class Translator {
    constructor({ locale, intlLocale = locale, messages, fallbackMessages = messages, onMissing = () => {} }) {
        if (typeof locale !== 'string' || !messages || typeof messages !== 'object') {
            throw new Error('Translator requires a locale and its messages');
        }
        this.locale = locale;
        this.intlLocale = intlLocale;
        this._messages = messages;
        this._fallbackMessages = fallbackMessages;
        this._onMissing = onMissing;
        this._reportedMissing = new Set();
        this._pluralRules = new Intl.PluralRules(intlLocale);
        this._numberFormat = new Intl.NumberFormat(intlLocale);
    }

    translate(key, params = {}) {
        const message = this._lookup(key);
        if (message === undefined) {
            return key;
        }
        const text = typeof message === 'string' ? message : this._pluralForm(message, params.count);
        return this._interpolate(text, params);
    }

    has(key) {
        return Object.prototype.hasOwnProperty.call(this._messages, key)
            || Object.prototype.hasOwnProperty.call(this._fallbackMessages, key);
    }

    formatNumber(value, options) {
        return options ? new Intl.NumberFormat(this.intlLocale, options).format(value) : this._numberFormat.format(value);
    }

    // `value` is a Date, a timestamp or a date string.
    formatDate(value, options) {
        return new Intl.DateTimeFormat(this.intlLocale, options).format(value instanceof Date ? value : new Date(value));
    }

    _lookup(key) {
        if (Object.prototype.hasOwnProperty.call(this._messages, key)) {
            return this._messages[key];
        }
        if (!this._reportedMissing.has(key)) {
            this._reportedMissing.add(key);
            this._onMissing(key, this.locale);
        }
        return Object.prototype.hasOwnProperty.call(this._fallbackMessages, key) ? this._fallbackMessages[key] : undefined;
    }

    _pluralForm(forms, count) {
        const number = Number(count);
        if (Number.isFinite(number)) {
            const exact = forms[`=${number}`];
            if (exact !== undefined) {
                return exact;
            }
            const category = forms[this._pluralRules.select(number)];
            if (category !== undefined) {
                return category;
            }
        }
        return forms.other;
    }

    _interpolate(text, params) {
        return text.replace(PLACEHOLDER, (placeholder, name) => {
            if (!Object.prototype.hasOwnProperty.call(params, name) || params[name] === undefined || params[name] === null) {
                return placeholder;
            }
            return this._paramText(params[name]);
        });
    }

    _paramText(value) {
        if (typeof value === 'number') {
            return this.formatNumber(value);
        }
        if (isMessage(value)) {
            return this.translate(value.key, value.params);
        }
        if (Array.isArray(value)) {
            return new Intl.ListFormat(this.intlLocale, { type: 'unit', style: 'long' }).format(value.map((item) => this._paramText(item)));
        }
        return String(value);
    }
}
