// Standardized license identifiers and their application-level permissions.
// ForkBuild interprets these to enforce protocol rules (e.g., blocking forks
// on ND works). The exact legal meaning remains with the license text itself.
export const LicenseId = Object.freeze({
    CC0_1_0: 'CC0-1.0',
    CC_BY_4_0: 'CC-BY-4.0',
    CC_BY_SA_4_0: 'CC-BY-SA-4.0',
    CC_BY_ND_4_0: 'CC-BY-ND-4.0',
    CC_BY_NC_4_0: 'CC-BY-NC-4.0',
    ALL_RIGHTS_RESERVED: 'ALL-RIGHTS-RESERVED',
    UNSPECIFIED: 'UNSPECIFIED'
});

export class License {
    constructor({ id = LicenseId.UNSPECIFIED, attribution = null } = {}) {
        this._id = id;
        this._attribution = attribution ? { ...attribution } : null;
    }

    get id() { return this._id; }
    get attribution() { return this._attribution ? { ...this._attribution } : null; }

    get permissions() { return License.getPermissions(this._id); }
    get forkAllowed() { return this.permissions.forkAllowed; }
    get attributionRequired() { return this.permissions.attributionRequired; }
    get modificationAllowed() { return this.permissions.modificationAllowed; }
    get redistributionAllowed() { return this.permissions.redistributionAllowed; }

    static getPermissions(id) {
        switch (id) {
            case LicenseId.CC0_1_0:
                return { forkAllowed: true, attributionRequired: false, modificationAllowed: true, redistributionAllowed: true };
            case LicenseId.CC_BY_4_0:
            case LicenseId.CC_BY_SA_4_0:
            case LicenseId.CC_BY_NC_4_0:
                return { forkAllowed: true, attributionRequired: true, modificationAllowed: true, redistributionAllowed: true };
            case LicenseId.CC_BY_ND_4_0:
                return { forkAllowed: false, attributionRequired: true, modificationAllowed: false, redistributionAllowed: true };
            case LicenseId.ALL_RIGHTS_RESERVED:
            case LicenseId.UNSPECIFIED:
            default:
                return { forkAllowed: false, attributionRequired: false, modificationAllowed: false, redistributionAllowed: false };
        }
    }

    // The licenses a remix of a build licensed `sourceId` may carry: none
    // that waives the credit the original asks for (CC0), none that drops a
    // ShareAlike or NonCommercial term, so a remix of a non-commercial castle
    // can't be relabelled into one anyone may sell. A source no copy of
    // ForkBuild lets anyone remix (ND, All Rights Reserved, none) was remixed
    // by its own builder, and an id this version doesn't know isn't judged:
    // both may carry any license.
    static remixLicenseIds(sourceId) {
        const all = Object.values(LicenseId);
        switch (sourceId) {
            case LicenseId.CC0_1_0:
                return all;
            case LicenseId.CC_BY_4_0:
                return all.filter((id) => id !== LicenseId.CC0_1_0);
            case LicenseId.CC_BY_SA_4_0:
                return [LicenseId.CC_BY_SA_4_0];
            case LicenseId.CC_BY_NC_4_0:
                return [LicenseId.CC_BY_NC_4_0, LicenseId.ALL_RIGHTS_RESERVED, LicenseId.UNSPECIFIED];
            default:
                return all;
        }
    }

    // The license a remix of a build licensed `source` carries: the same
    // terms, crediting the original (`author`, `title`, where it was
    // published and whose identity built it) and recording the original's
    // license, so relicense() can hold the remix to it.
    static derivedFrom(source, { author = null, title = null, sourcePublicationId = null, sourceDocumentId = null, sourceAuthorIdentityId = null } = {}) {
        const id = License.idOf(source);
        return new License({
            id,
            attribution: { author, title, sourcePublicationId, sourceDocumentId, sourceAuthorIdentityId, sourceLicenseId: id }
        });
    }

    // `next` as the build licensed `prior`, whose author's identity is
    // `authorIdentityId`, may carry it. A remix (its license carries the
    // attribution derivedFrom() stamps) keeps crediting its original whatever
    // license it moves to, and keeps `prior`'s license when `next`'s isn't one
    // remixLicenseIds() allows for the original's, unless whoever built the
    // original is the one relicensing it. Anything else is `next` unchanged.
    static relicense(prior, next, { authorIdentityId = null } = {}) {
        const attribution = prior?.attribution;
        if (!attribution) return next;
        const sourceLicenseId = attribution.sourceLicenseId || prior.id;
        const own = Boolean(authorIdentityId) && authorIdentityId === attribution.sourceAuthorIdentityId;
        const id = own || License.remixLicenseIds(sourceLicenseId).includes(next?.id) ? next.id : prior.id;
        return new License({ id, attribution: { ...attribution, sourceLicenseId } });
    }

    toJSON() {
        return {
            id: this._id,
            attribution: this._attribution
        };
    }

    // The license id to display for a possibly-absent License — the one
    // fallback the Repository catalog's cards, list rows, and license
    // grouping all share, so the three can never label the same
    // unlicensed publication differently.
    static idOf(license) {
        return (license && license.id) || LicenseId.UNSPECIFIED;
    }

    static fromJSON(json) {
        if (!json) return new License();
        return new License({
            id: json.id || LicenseId.UNSPECIFIED,
            attribution: json.attribution || null
        });
    }
}
