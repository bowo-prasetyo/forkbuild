// 0.8.17 — Evidence Provenance & Observation Boundary.
//
// The smallest possible vocabulary for "how did THIS replica come to
// know about this anchor" — three values, deliberately never more:
//
//   LOCAL    — this replica itself signed the anchor (application/
//              CreatePublicationAnchorUseCase.js).
//   PACKAGE  — the anchor arrived bundled inside a Blueprint Package
//              (application/ImportPackageAnchorsUseCase.js).
//   PEER     — the anchor arrived over a live peer connection, whether
//              an unsolicited ANNOUNCE or a REQUEST/RESPONSE synchronize
//              (application/PublicationAnchorPeerExchange.js). The two
//              transports are deliberately NOT distinguished — see this
//              milestone's own docs/Roadmap.md entry on why
//              PEER_ANNOUNCEMENT/PEER_DISCOVERY would be unnecessary
//              taxonomy: both mean exactly the same thing, "another
//              authenticated replica supplied a signed anchor claim."
//
// Deliberately excludes RESTORED. Surviving a restart is not a new way a
// replica learned an anchor — application/
// RestorePublicationAnchorCatalogUseCase.js re-earns trust in an anchor
// already on file, and application/LocalAnchorKnowledgeStore.js's own
// first-seen-wins persistence means the ORIGINAL acquisition kind is
// still exactly what a restarted replica reports; see that file's own
// header.
//
// THIS IS NOT A RANKING. No value here is more or less authoritative
// than another, and no caller may ever compare two of these values to
// decide which anchor to prefer, trust more, or display first. See
// docs/Principles.md, "Acquisition Provenance Is Not Evidence Rank
// (0.8.17)."
export const AnchorAcquisitionKind = Object.freeze({
    LOCAL: 'local',
    PACKAGE: 'package',
    PEER: 'peer'
});

export function isValidAnchorAcquisitionKind(value) {
    return Object.values(AnchorAcquisitionKind).includes(value);
}
