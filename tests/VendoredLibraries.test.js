import { vendorDifferences } from '../scripts/vendor.mjs';
import { assert } from './support/Assert.js';

// Every third-party module the browser runs is served from vendor/. It must
// be exactly what scripts/vendor.mjs produces from the pinned npm packages,
// so nothing in it can be edited by hand or drift from package.json.
{
    const differences = vendorDifferences();
    assert(differences.length === 0,
        `vendor/ matches the pinned packages (run node scripts/vendor.mjs):\n  ${differences.join('\n  ')}`);
    console.log('✓ vendor/ matches the pinned npm packages');
}

console.log('\n✅ All VendoredLibraries tests passed.');
