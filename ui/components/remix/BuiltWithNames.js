import { builtWithParts, builderRoute } from './builtWithText.js';

// The friends who built a build with its author (core/BuiltWith.js), each
// name a link to their page (ui/views/BuilderView.js) when the credit names
// an identity.
export default {
    name: 'BuiltWithNames',
    props: {
        list: { type: Array, default: () => [] }
    },
    computed: {
        parts() {
            return builtWithParts(this.list).map((part) => ({ ...part, to: part.entry ? builderRoute(part.entry.identityId, part.entry.name) : null }));
        }
    },
    template: `
        <span class="built-with-names"><template v-for="(part, index) in parts" :key="index"><router-link v-if="part.to" :to="part.to" class="built-with-name">{{ part.text }}</router-link><template v-else>{{ part.text }}</template></template></span>
    `
};
