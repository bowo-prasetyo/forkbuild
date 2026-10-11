// The service groups (ui/serviceGroups.js, defined in ui/main.js) each page
// needs, loaded beside the page's own modules the first time it opens. A
// page not listed needs only what the app provides at startup.
// tests/ServiceGroupCoverage.test.js fails if a page injects a service from a
// group not listed for it, or lists a group it does not use.
export const PAGE_SERVICE_GROUPS = Object.freeze({
    EditorView: ['distribution', 'sound'],
    WorldView: ['distribution', 'sound'],
    PublicationLinkView: ['distribution'],
    WalkTogetherJoinView: ['distribution'],
    DecentralizedPublicationsView: ['anchoring', 'distribution', 'observationArchive'],
    AnchorProviderSettingsView: ['anchoring']
});
