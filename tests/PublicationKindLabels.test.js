// The kind under each card's name on the Publications page: the kinds this
// version knows get their own translated name, so a World's record reads
// "Shared World" rather than repeating the page's own word, "Publication";
// a kind this version doesn't know is still named, from its own string.
import { humanizeContentKind } from '../ui/views/decentralizedPublications/presentation.js';
import { PUBLICATION_CONTENT_KIND } from '../application/publication/PublicationContentValidator.js';
import { PLACE_NAMING_CLAIM_PUBLICATION_KIND } from '../application/placeNaming/PlaceNamingClaimPublication.js';
import { BLUEPRINT_ATTRIBUTION_KIND } from '../core/BlueprintAttribution.js';
import { assert } from './support/Assert.js';

assert(humanizeContentKind(PUBLICATION_CONTENT_KIND) === 'Shared World', 'a World\'s record is a Shared World');
assert(humanizeContentKind(BLUEPRINT_ATTRIBUTION_KIND) === 'Blueprint Attribution', 'an attribution keeps its name');
assert(humanizeContentKind(PLACE_NAMING_CLAIM_PUBLICATION_KIND) === 'Place Naming Claim', 'a place name claim keeps its name');
assert(humanizeContentKind('forkbuild.something-new') === 'Something New', 'an unknown kind is named from its own string');
assert(humanizeContentKind('').length > 0, 'a missing kind still gets a label');

console.log('✓ each publication kind is named, and a World\'s is Shared World');
