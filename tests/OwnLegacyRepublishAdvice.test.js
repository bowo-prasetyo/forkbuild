// How the Publications page tells you to publish again something you
// published before content hashes became SHA-256: each display kind in the
// real registry names the step that signs a new record, with a link only
// where one page leads there, and a kind without advice gets a generic one.
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/publication/CreatePublicationDisplayKindRegistryUseCase.js';
import { republishAdviceFor } from '../ui/views/decentralizedPublications/presentation.js';
import { PUBLICATION_CONTENT_KIND } from '../application/publication/PublicationContentValidator.js';
import { PLACE_NAMING_CLAIM_PUBLICATION_KIND } from '../application/placeNaming/PlaceNamingClaimPublication.js';
import { BLUEPRINT_ATTRIBUTION_KIND } from '../core/BlueprintAttribution.js';
import { assert } from './support/Assert.js';

const { kindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();

const world = republishAdviceFor(kindPlugins[PUBLICATION_CONTENT_KIND]);
assert(world.text.includes('Publish the World again') && world.text.includes('Share with Peers'), 'a World is published and shared again');
assert(world.route === '/repository' && world.routeLabel === 'Open Repository', 'from the Repository');

const attribution = republishAdviceFor(kindPlugins[BLUEPRINT_ATTRIBUTION_KIND]);
assert(attribution.text.includes('Re-sign for this design') && attribution.text.includes('Publish to Network'), 'an attribution is re-signed and published');
assert(attribution.route === '/editor' && attribution.routeLabel === 'Open Editor', 'from the Editor');

const placeName = republishAdviceFor(kindPlugins[PLACE_NAMING_CLAIM_PUBLICATION_KIND]);
assert(placeName.text.includes('Publish A Name') && placeName.route === null && placeName.routeLabel === null,
    'a place name is published again in World View, which has no single page to link');

for (const plugin of [undefined, null, { contentKind: 'forkbuild.something-new' }, { republishAdvice: { text: '' } }]) {
    const advice = republishAdviceFor(plugin);
    assert(advice.text.length > 0 && advice.route === null && advice.routeLabel === null, 'a kind without advice still gets a sentence, without a link');
}
assert(republishAdviceFor({ republishAdvice: { text: 'x', route: null, routeLabel: 'Go' } }).routeLabel === null, 'no link label without a route');

console.log('✓ each kind of your own old publication says how to publish it again');
