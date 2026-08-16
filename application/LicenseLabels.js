import { LicenseId } from '../core/License.js';

// 0.2.21: human-readable labels for LicenseId, shared by the license
// selector (Document Properties editor) and the Document Info panel's
// read view — one place, so the two never drift apart, same reasoning
// as DocumentLifecycleStatus.
const LICENSE_LABELS = Object.freeze({
    [LicenseId.CC0_1_0]: 'CC0 1.0 — Public Domain',
    [LicenseId.CC_BY_4_0]: 'CC BY 4.0 — Attribution',
    [LicenseId.CC_BY_SA_4_0]: 'CC BY-SA 4.0 — Attribution, ShareAlike',
    [LicenseId.CC_BY_ND_4_0]: 'CC BY-ND 4.0 — Attribution, No Derivatives',
    [LicenseId.CC_BY_NC_4_0]: 'CC BY-NC 4.0 — Attribution, NonCommercial',
    [LicenseId.ALL_RIGHTS_RESERVED]: 'All Rights Reserved',
    [LicenseId.UNSPECIFIED]: 'No license specified'
});

export function describeLicense(licenseId) {
    return LICENSE_LABELS[licenseId] || licenseId || LICENSE_LABELS[LicenseId.UNSPECIFIED];
}

// Selector options in a deliberate order: the permissive end first,
// UNSPECIFIED last as the explicit "I haven't decided" choice rather
// than the top of the list.
export const LICENSE_OPTIONS = [
    LicenseId.CC0_1_0,
    LicenseId.CC_BY_4_0,
    LicenseId.CC_BY_SA_4_0,
    LicenseId.CC_BY_NC_4_0,
    LicenseId.CC_BY_ND_4_0,
    LicenseId.ALL_RIGHTS_RESERVED,
    LicenseId.UNSPECIFIED
].map((id) => ({ id, label: describeLicense(id) }));
