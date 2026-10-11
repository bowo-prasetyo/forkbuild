import { t } from '../../i18n/i18n.js';
import I18nText from '../../i18n/I18nText.js';
import { remixFamilySize } from '../../../core/RemixFamily.js';
import { createVerifiedPublisherResolver } from '../../../application/publication/FollowingFeed.js';
import { Publication } from '../../../publisher/Publication.js';
import { builtWithNames, builderRoute } from './builtWithText.js';
import BuiltWithNames from './BuiltWithNames.js';

// A build's family tree (core/RemixFamily.js): what it was remixed from,
// back to the original, then this build, then the remixes made from it.
// `routeFor(member)` gives a member's route, or null to show it as text.

// One member's line: its title, a link to the build; its author, a link to
// their page when the build's signature verifies (ui/views/BuilderView.js);
// and who built it with them, each name a link (core/BuiltWith.js).
const RemixFamilyMemberLabel = {
    name: 'RemixFamilyMemberLabel',
    components: { I18nText, BuiltWithNames },
    props: {
        member: { type: Object, required: true },
        routeFor: { type: Function, required: true },
        // The build's own line: its title, bold, rather than a link.
        self: { type: Boolean, default: false }
    },
    setup(props) {
        return { t, keypath: () => memberKeypath(props.member), title: () => props.member.title || t('remixFamily.untitled'), authorRoute: () => authorRouteOf(props.member) };
    },
    template: `
        <I18nText :keypath="keypath()" class="remix-family-label">
            <template #title><strong v-if="self">{{ title() }}</strong><router-link v-else-if="routeFor(member)" :to="routeFor(member)" class="remix-family-link">{{ title() }}</router-link><template v-else>{{ title() }}</template></template>
            <template #author><router-link v-if="authorRoute()" :to="authorRoute()" class="remix-family-author">{{ member.author }}</router-link><template v-else>{{ member.author }}</template></template>
            <template #names><BuiltWithNames :list="member.builtWith || []" /></template>
        </I18nText>
    `
};

const RemixFamilyMembers = {
    name: 'RemixFamilyMembers',
    components: { RemixFamilyMemberLabel },
    props: {
        members: { type: Array, required: true },
        routeFor: { type: Function, required: true }
    },
    template: `
        <ul class="remix-family-remixes">
            <li v-for="member in members" :key="member.documentId" class="remix-family-member">
                <RemixFamilyMemberLabel :member="member" :route-for="routeFor" />
                <RemixFamilyMembers v-if="member.remixes.length" :members="member.remixes" :route-for="routeFor" />
            </li>
        </ul>
    `
};

// The message for a member's line, by what is known of it.
function memberKeypath(member) {
    const credits = Array.isArray(member.builtWith) && member.builtWith.length > 0;
    if (member.author) return credits ? 'remixFamily.byAuthorWith' : 'remixFamily.byAuthor';
    return credits ? 'remixFamily.titleWith' : 'remixFamily.titleOnly';
}

// Whose page a member's author links to: only the identity whose signature
// on its Publication verifies, never one a copy merely claims.
const verifiedPublisherOf = createVerifiedPublisherResolver();
function authorRouteOf(member) {
    if (!member.author || !member.publication) return null;
    let signer = null;
    try {
        const publication = member.publication instanceof Publication ? member.publication : Publication.fromJSON(member.publication);
        signer = verifiedPublisherOf(publication);
    } catch {
        signer = null;
    }
    return builderRoute(signer, member.author);
}

// "Harbor by Ana, built with Kim", as text (for an accessible name or a test).
export function memberLabel(member) {
    const title = member.title || t('remixFamily.untitled');
    const names = builtWithNames(member.builtWith);
    if (names) {
        return member.author ? t('remixFamily.byAuthorWith', { title, author: member.author, names }) : t('remixFamily.titleWith', { title, names });
    }
    return member.author ? t('remixFamily.byAuthor', { title, author: member.author }) : title;
}
export default {
    name: 'RemixFamilyTree',
    components: { RemixFamilyMembers, RemixFamilyMemberLabel },
    props: {
        family: { type: Object, default: null },
        routeFor: { type: Function, default: () => null },
        // A heading level for where the tree sits.
        heading: { type: String, default: 'h3' }
    },
    setup() {
        return { t, label: memberLabel, size: remixFamilySize };
    },
    template: `
        <section v-if="family && size(family) > 0" class="remix-family" :aria-label="t('remixFamily.title')">
            <component :is="heading" class="remix-family-title">{{ t('remixFamily.title') }}</component>
            <ol class="remix-family-line">
                <li v-for="member in family.ancestors" :key="member.documentId" class="remix-family-member remix-family-ancestor">
                    <RemixFamilyMemberLabel v-if="member.title || member.author" :member="member" :route-for="routeFor" />
                    <span v-else>{{ t('remixFamily.unseen') }}</span>
                </li>
                <li class="remix-family-member remix-family-self" aria-current="true">
                    <RemixFamilyMemberLabel :member="family.build" :route-for="routeFor" self /> <span class="remix-family-self-mark">{{ t('remixFamily.thisBuild') }}</span>
                    <RemixFamilyMembers v-if="family.remixes.length" :members="family.remixes" :route-for="routeFor" />
                </li>
            </ol>
            <p v-if="family.more" class="remix-family-more">{{ t('remixFamily.more', { count: family.more }) }}</p>
        </section>
    `
};
