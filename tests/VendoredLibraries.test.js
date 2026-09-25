import { existsSync, readdirSync } from 'node:fs';
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

// GitHub Pages runs Jekyll unless the site has a .nojekyll file, and Jekyll
// drops every file whose name starts with "_" (noble-hashes ships _md.js and
// _u64.js), which leaves the app a blank page.
{
    const root = new URL('../', import.meta.url);
    const underscored = [];
    const walk = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) walk(new URL(entry.name + '/', dir));
            else if (entry.name.startsWith('_')) underscored.push(entry.name);
        }
    };
    walk(new URL('vendor/', root));
    assert(underscored.length === 0 || existsSync(new URL('.nojekyll', root)),
        `vendor/ has files starting with "_" (${underscored.join(', ')}), so the repository needs a .nojekyll file for GitHub Pages to publish them`);
    console.log('✓ files starting with "_" are published on GitHub Pages (.nojekyll)');
}

console.log('\n✅ All VendoredLibraries tests passed.');
