import { t } from '../../i18n/i18n.js';
import { remixFamilySize } from '../../../core/RemixFamily.js';

// A build's family tree (core/RemixFamily.js): what it was remixed from,
// back to the original, then this build, then the remixes made from it.
// `routeFor(member)` gives a member's route, or null to show it as text.
const RemixFamilyMembers = {
    name: 'RemixFamilyMembers',
    props: {
        members: { type: Array, required: true },
        routeFor: { type: Function, required: true }
    },
    setup() {
        return { t, label: memberLabel };
    },
    template: `
        <ul class="remix-family-remixes">
            <li v-for="member in members" :key="member.documentId" class="remix-family-member">
                <router-link v-if="routeFor(member)" :to="routeFor(member)" class="remix-family-link">{{ label(member) }}</router-link>
                <span v-else>{{ label(member) }}</span>
                <RemixFamilyMembers v-if="member.remixes.length" :members="member.remixes" :route-for="routeFor" />
            </li>
        </ul>
    `
};

function memberLabel(member) {
    const title = member.title || t('remixFamily.untitled');
    return member.author ? t('remixFamily.byAuthor', { title, author: member.author }) : title;
}

export default {
    name: 'RemixFamilyTree',
    components: { RemixFamilyMembers },
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
                    <router-link v-if="routeFor(member)" :to="routeFor(member)" class="remix-family-link">{{ label(member) }}</router-link>
                    <span v-else>{{ member.title || member.author ? label(member) : t('remixFamily.unseen') }}</span>
                </li>
                <li class="remix-family-member remix-family-self" aria-current="true">
                    <strong>{{ label(family.build) }}</strong> <span class="remix-family-self-mark">{{ t('remixFamily.thisBuild') }}</span>
                    <RemixFamilyMembers v-if="family.remixes.length" :members="family.remixes" :route-for="routeFor" />
                </li>
            </ol>
            <p v-if="family.more" class="remix-family-more">{{ t('remixFamily.more', { count: family.more }) }}</p>
        </section>
    `
};
