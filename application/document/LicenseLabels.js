import { LicenseId } from '../../core/License.js';
import { message } from '../../core/Message.js';

// 0.2.21: human-readable labels for LicenseId, shared by the license
// selector (Document Properties editor) and the Document Info panel's
// read view — one place, so the two never drift apart, same reasoning
// as DocumentLifecycleStatus. Each label is a message (core/Message.js); a
// license id this version doesn't know is shown as the id itself.
const LICENSE_KEYS = Object.freeze({
    [LicenseId.CC0_1_0]: 'license.cc0',
    [LicenseId.CC_BY_4_0]: 'license.ccBy',
    [LicenseId.CC_BY_SA_4_0]: 'license.ccBySa',
    [LicenseId.CC_BY_ND_4_0]: 'license.ccByNd',
    [LicenseId.CC_BY_NC_4_0]: 'license.ccByNc',
    [LicenseId.ALL_RIGHTS_RESERVED]: 'license.allRightsReserved',
    [LicenseId.UNSPECIFIED]: 'license.unspecified'
});

export function describeLicense(licenseId) {
    if (LICENSE_KEYS[licenseId]) {
        return message(LICENSE_KEYS[licenseId]);
    }
    return licenseId ? message('license.other', { id: licenseId }) : message(LICENSE_KEYS[LicenseId.UNSPECIFIED]);
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
