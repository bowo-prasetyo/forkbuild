import { collectionFamilies } from '../../../core/library/CollectionLibrary.js';
import { CreateStructureRegistryUseCase } from '../../../application/editor/CreateStructureRegistryUseCase.js';
import { libraryItemName } from '../../i18n/libraryText.js';
import { t } from '../../i18n/i18n.js';

// The built-in remix families (core/library/CollectionLibrary.js) as family
// trees: each original, then its remixes, each level indented under the one it
// came from, in the family tree's own look (ui/components/remix/RemixFamilyTree.js).
// Every build opens in the Editor as a copy of the visitor's own
// (`/editor?start=<id>`), the same as a ready-made build's card. They are the
// app's own examples, never shown as anyone's publications, so the
// Repository and an empty challenge week show what a family of remixes looks
// like before anyone has made one.
const CollectionFamilyMembers = {
    name: 'CollectionFamilyMembers',
    props: {
        members: { type: Array, required: true }
    },
    template: `
        <ul class="remix-family-remixes">
            <li v-for="member in members" :key="member.id" class="remix-family-member">
                <router-link :to="member.to" class="remix-family-link">{{ member.name }}</router-link>
                <CollectionFamilyMembers v-if="member.remixes.length" :members="member.remixes" />
            </li>
        </ul>
    `
};

export default {
    name: 'CollectionFamilies',
    components: { CollectionFamilyMembers },
    props: {
        // A heading level for where the families sit.
        heading: { type: String, default: 'h3' }
    },
    setup() {
        const registry = new CreateStructureRegistryUseCase().execute();
        const member = (node) => {
            const structure = registry.get(node.id);
            return {
                id: node.id,
                name: structure ? libraryItemName(structure) : node.id,
                to: { path: '/editor', query: { start: node.id } },
                remixes: node.remixes.map(member)
            };
        };
        return { t, families: collectionFamilies().map(member) };
    },
    template: `
        <section class="collection-families" :aria-label="t('collectionFamilies.label')">
            <component :is="heading" class="remix-family-title">{{ t('collectionFamilies.title') }}</component>
            <p class="collection-families-lead">{{ t('collectionFamilies.lead') }}</p>
            <div class="collection-families-list">
                <div v-for="family in families" :key="family.id" class="remix-family collection-family">
                    <router-link :to="family.to" class="remix-family-link collection-family-original">{{ family.name }}</router-link>
                    <CollectionFamilyMembers v-if="family.remixes.length" :members="family.remixes" />
                </div>
            </div>
        </section>
    `
};
