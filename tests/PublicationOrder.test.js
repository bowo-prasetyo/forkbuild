// core/publication/PublicationOrder.js: which of two published builds came
// first, by the dates their builders signed, backed or not by when this
// device first saw them.
import { PUBLICATION_ORDERS, order } from '../core/publication/PublicationOrder.js';
import { assert } from './support/Assert.js';

const day = (date) => Date.parse(`${date}T00:00:00Z`);
const build = (claimed, seen = claimed) => ({ claimed: day(claimed), seen: seen === null ? null : day(seen) });

{
    const original = build('2026-09-01');
    assert(order(original, build('2026-08-01', '2026-08-02')) === 'before', '1. a build seen here before the other was dated came before it');
    assert(order(original, build('2026-08-01', '2026-09-01')) === 'before', '2. seen here on the very day the other is dated, too');
    assert(order(original, build('2026-10-01', '2026-10-02')) === 'after', '3. one dated later, and seen later, came after it');
    assert(order(original, build('2026-09-01', '2026-09-03')) === null, '4. the same date says neither');
}
console.log('✓ dates this device can back');

{
    // A copy signed with a date before the original's, first seen here after.
    const original = build('2026-09-01', '2026-09-02');
    const copy = build('2026-08-01', '2026-10-10');
    assert(order(original, copy) === 'datedBefore', '5. beside the original, the copy is only dated before it');
    assert(order(copy, original) === 'seenBefore', '6. beside the copy, the original was seen here first, though dated later');

    // An older build found late: told the same way, never called a copy.
    const foundLate = build('2026-01-01', '2026-10-10');
    assert(order(original, foundLate) === 'datedBefore' && order(foundLate, original) === 'seenBefore', '7. an older build found late is dated before, as it says');

    const unseen = build('2026-08-01', null);
    assert(order(original, unseen) === 'datedBefore', '8. a build with no first-seen time counts as seen late');
    assert(order(unseen, original) === 'seenBefore', '9. so a build beside it that was seen is seen first');
    assert(order(build('2026-08-01', null), build('2026-09-01', null)) === 'after', '10. two builds with no first-seen times keep their dates');
    assert(PUBLICATION_ORDERS.join() === 'before,datedBefore,seenBefore,after', '11. the four orders');
}
console.log('✓ dates this device can\'t back');

console.log('✅ All publication order tests passed.');
