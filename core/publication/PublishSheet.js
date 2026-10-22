import { LicenseId } from '../document/License.js';

// A first Publish is one sheet (docs/Pillars.md, "Infrastructure, kept out of
// sight"; ui/components/PublishSheet.js): whatever Publish still needs to
// know, asked together, with remixing and Everyone already chosen, rather
// than three dialogs in turn (docs/reviews/CreativeDirection-2026-10-22.md,
// finding 1).
//
// Pure: which rows the sheet shows, what it starts with, the license a
// remix choice becomes, and the number in a suggested name.

export const PublishSheetRow = Object.freeze({
    // A name to sign with, on a device that has none yet.
    NAME: 'name',
    // Whether others may remix it, for a build with no license.
    REMIX: 'remix',
    // Who can find it, before this device's first publish.
    FIND: 'find'
});

// What the sheet starts with: remixing is the pillar that makes ForkBuild
// different, so a build is remixable, and found by everyone, unless its
// builder says otherwise.
export const PUBLISH_SHEET_DEFAULTS = Object.freeze({ remix: true, everyone: true });

// The rows to show, in order; none means Publish needs to ask nothing.
export function publishSheetRows({ needsName = false, needsLicense = false, needsFindability = false } = {}) {
    const rows = [];
    if (needsName) rows.push(PublishSheetRow.NAME);
    if (needsLicense) rows.push(PublishSheetRow.REMIX);
    if (needsFindability) rows.push(PublishSheetRow.FIND);
    return Object.freeze(rows);
}

// The license the remix choice becomes: CC BY 4.0 lets anyone copy and
// change it with credit; All Rights Reserved lets people look.
export function licenseForRemix(allowed) {
    return allowed ? LicenseId.CC_BY_4_0 : LicenseId.ALL_RIGHTS_RESERVED;
}

// The number in a suggested name ("Builder 427"), 100 to 999, from
// `random()` (0 up to 1).
export function suggestedNameNumber(random = Math.random) {
    const value = Number(random());
    const share = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999) : 0;
    return 100 + Math.floor(share * 900);
}
