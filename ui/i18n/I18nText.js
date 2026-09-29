// A whole message with markup inside it: a link, a button, bold text. The
// message keeps its sentence in one piece, `{name}` marking where each part
// goes, and the part itself is a slot of the same name:
//
//   <I18nText keypath="publications.intro">
//       <template #peer><router-link to="/peers">{{ t('publications.peer') }}</router-link></template>
//   </I18nText>
//
// with 'publications.intro': '… or one a connected {peer} announced. …' A translation can
// move `{peer}` wherever its grammar needs it; splitting the sentence into
// pieces around the link would fix the English word order for every language.
// A `{name}` in `params` is filled in as t() does; one with neither a slot nor
// a param is left as written, like any other missing value.
import { t } from './i18n.js';

const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/g;

// The message split at each `{name}` that has a slot: text and slot names,
// in order.
export function messageParts(text, slotNames) {
    const parts = [];
    let last = 0;
    for (const match of text.matchAll(PLACEHOLDER)) {
        if (!slotNames.includes(match[1])) {
            continue;
        }
        if (match.index > last) {
            parts.push({ text: text.slice(last, match.index) });
        }
        parts.push({ slot: match[1] });
        last = match.index + match[0].length;
    }
    if (last < text.length) {
        parts.push({ text: text.slice(last) });
    }
    return parts;
}

export default {
    name: 'I18nText',
    props: {
        keypath: { type: String, required: true },
        params: { type: Object, default: () => ({}) },
        tag: { type: String, default: 'span' }
    },
    computed: {
        parts() {
            return messageParts(t(this.keypath, this.params), Object.keys(this.$slots));
        }
    },
    template: `
        <component :is="tag"><template v-for="(part, index) in parts" :key="index"><slot v-if="part.slot" :name="part.slot"></slot><template v-else>{{ part.text }}</template></template></component>
    `
};
