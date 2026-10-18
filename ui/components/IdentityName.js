import { builderRoute } from './remix/builtWithText.js';
import { shortIdentityId } from '../views/following/followedPeople.js';
import { t } from '../i18n/i18n.js';

// A person by name, a link to their builder page (ui/views/BuilderView.js),
// for a comment's author or someone who hearted a build. The name comes from
// the app's `identityNames` (application/publication/identityNames.js): this
// device's own name, else the one they publish builds under, else
// `chosenName` (what the record itself says they're called). With none, a
// short form of the identity. A name can't be told from another person's
// look-alike, so the identity is always on hover.
export default {
    name: 'IdentityName',
    inject: { identityNames: { default: null } },
    props: {
        identityId: { type: String, required: true },
        chosenName: { type: String, default: null }
    },
    computed: {
        resolved() {
            return this.identityNames ? this.identityNames.nameFor(this.identityId, this.chosenName) : (this.chosenName ? { name: this.chosenName, source: 'chosen' } : null);
        },
        text() {
            return this.resolved ? this.resolved.name : shortIdentityId(this.identityId);
        },
        to() {
            return builderRoute(this.identityId, this.resolved ? this.resolved.name : null);
        },
        title() {
            return t('identityName.title', { id: shortIdentityId(this.identityId) });
        }
    },
    // A plain name where there is no router (a component mounted alone).
    template: `<router-link v-if="$router" :to="to" class="identity-name" :title="title">{{ text }}</router-link><span v-else class="identity-name" :title="title">{{ text }}</span>`
};
