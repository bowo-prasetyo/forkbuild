import { LicenseId } from '../core/document/License.js';
import { PUBLISH_SHEET_DEFAULTS, PublishSheetRow, licenseForRemix, publishSheetRows, suggestedNameNumber } from '../core/publication/PublishSheet.js';
import { assert } from './support/Assert.js';

// What a first Publish's one sheet asks (core/publication/PublishSheet.js;
// docs/Pillars.md, "Infrastructure, kept out of sight").

{
    assert(publishSheetRows().length === 0, 'with nothing unknown, nothing is asked');
    assert(publishSheetRows({ needsName: true, needsLicense: true, needsFindability: true }).join() === 'name,remix,find', 'all three, the name first');
    assert(publishSheetRows({ needsFindability: true, needsLicense: true }).join() === 'remix,find', 'only what is unknown');
    assert(publishSheetRows({ needsName: true }).join() === PublishSheetRow.NAME, 'a name alone');
    assert(Object.isFrozen(publishSheetRows({ needsName: true })), 'the rows are frozen');
}
console.log('✓ the rows: only what is unknown, the name first');

{
    assert(PUBLISH_SHEET_DEFAULTS.remix === true && PUBLISH_SHEET_DEFAULTS.everyone === true, 'remixing and Everyone start on');
    assert(Object.isFrozen(PUBLISH_SHEET_DEFAULTS), 'and stay so');
    assert(licenseForRemix(true) === LicenseId.CC_BY_4_0, 'remixable is CC BY 4.0');
    assert(licenseForRemix(false) === LicenseId.ALL_RIGHTS_RESERVED, 'only to look at is All Rights Reserved');
}
console.log('✓ remixing on by default, and the license each choice becomes');

{
    assert(suggestedNameNumber(() => 0) === 100, 'the lowest is 100');
    assert(suggestedNameNumber(() => 0.9999999) === 999, 'the highest 999');
    assert(suggestedNameNumber(() => 1) === 999, 'even at 1');
    assert(suggestedNameNumber(() => 0.5) === 550, 'in between, in proportion');
    assert(suggestedNameNumber(() => NaN) === 100 && suggestedNameNumber(() => -3) === 100, 'anything odd gives the lowest');
    for (let i = 0; i < 200; i += 1) {
        const number = suggestedNameNumber();
        assert(Number.isInteger(number) && number >= 100 && number <= 999, `three digits (${number})`);
    }
}
console.log('✓ a suggested name\'s number has three digits');

console.log('✅ All publish sheet tests passed.');
