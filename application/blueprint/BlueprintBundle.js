// Every structure in My Structures in one file: a list of the same
// blueprint packages Export Blueprint writes, so each one is validated on
// import exactly as a single file would be.
export const BLUEPRINT_BUNDLE_KIND = 'forkbuild-blueprint-bundle';
export const BLUEPRINT_BUNDLE_FORMAT_VERSION = 1;

export function isBlueprintBundle(value) {
    return Boolean(value) && typeof value === 'object' && value.kind === BLUEPRINT_BUNDLE_KIND;
}

export function buildBlueprintBundle(packages) {
    return { kind: BLUEPRINT_BUNDLE_KIND, formatVersion: BLUEPRINT_BUNDLE_FORMAT_VERSION, exportedAt: new Date().toISOString(), blueprints: packages };
}

// The packages in `bundle`; throws for a bundle this version can't read.
export function blueprintBundlePackages(bundle) {
    if (!isBlueprintBundle(bundle) || !Array.isArray(bundle.blueprints)) {
        throw new Error('That is not a ForkBuild blueprint bundle.');
    }
    if (bundle.formatVersion !== BLUEPRINT_BUNDLE_FORMAT_VERSION) {
        throw new Error('This bundle was made by a newer version of ForkBuild. Update this copy first.');
    }
    return bundle.blueprints;
}
