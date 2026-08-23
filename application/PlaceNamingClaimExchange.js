import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { buildPlaceNamingClaimPublication } from './PlaceNamingClaimPublication.js';
import { validatePlaceNamingClaimPublication } from './PlaceNamingClaimPublicationValidator.js';

// 0.5.3 — Decentralized Place Name Exchange.
//
// 0.5.2 built the whole naming MODEL — claim, view, local store, local
// preference — and drew its own boundary exactly where the design
// conversation that closed it out said to: "a decentralized exchange
// transport... named directly... as its own next milestone... 0.5.3."
// This class is that missing piece, and nothing more:
//
//   Alice's claim --export--> Publication --import--> Bob's claim store
//
// The critical rule the design conversation stated plainly, and this
// class exists to enforce structurally, not just by convention:
//
//   Naming exchange DISTRIBUTES claims; it never ESTABLISHES truth.
//
// Every question of "which name should I show" stays exactly where 0.5.2
// left it — core/PlaceNamingView.js#namingView() — and this file never
// answers it, never ranks anything, and never decides which of two
// disagreeing claims "wins." It only ever moves a claim from one
// replica's store into another's, unchanged, still carrying its own
// signature, still independently verifiable at the far end.
//
// Deliberately protocol-independent: this class knows nothing about
// files, clipboards, WebRTC, or any other transport. A caller (today:
// ui/views/WorldView.js's own file-download/file-read handlers, mirroring
// application/ExportBlueprintUseCase.js/ImportBlueprintUseCase.js's own
// file-boundary split one domain over) hands it a plain package object
// and gets a plain package object back — see this milestone's own
// docs/Roadmap.md entry for why the FIRST transport is deliberately
// boring, and why that boredom is the point: every future transport
// (WebRTC peer exchange, a rendezvous relay, a future DHT) plugs into
// THIS class's importClaim()/exportClaim(), never into
// core/PlaceNamingView.js or application/LocalPlaceNamingClaimStore.js
// directly.
export class PlaceNamingClaimExchange {
    constructor(store, verifier, publicationLog) {
        if (!store) {
            throw new Error('PlaceNamingClaimExchange: a PlaceNamingClaim store is required');
        }
        if (!verifier) {
            throw new Error('PlaceNamingClaimExchange: an authorization verifier is required');
        }
        if (!publicationLog) {
            throw new Error('PlaceNamingClaimExchange: a publication log is required');
        }
        this._store = store;
        this._verifier = verifier;
        this._publicationLog = publicationLog;
    }

    // Builds a portable publication package for a claim this replica
    // already has — see application/PlaceNamingClaimPublication.js's own
    // header for the exact wire shape. Pure passthrough; the actual
    // "validate first, construct second, never execute untrusted input"
    // discipline this class is named for lives entirely on the IMPORT
    // side, exactly like application/ExportBlueprintUseCase.js never
    // needing to re-validate a Structure it already knows is real.
    exportClaim(claim) {
        return buildPlaceNamingClaimPublication(claim);
    }

    // The three-step discipline this milestone's own design conversation
    // named, always in this order, never fewer:
    //
    //   1. validate  — application/PlaceNamingClaimPublicationValidator.js
    //                   (is this even a well-formed publication?)
    //   2. construct — a real core/PlaceNamingClaim.js from the package's
    //                   own fields (never trusted as-is)
    //   3. verify    — identity/LocalAuthorizationVerifier.js#
    //                   verifyPlaceNamingClaim() (does it actually carry
    //                   a valid signature FROM its own claimed author?)
    //
    // Only after all three succeed does anything get persisted. A
    // package that fails any step throws — this is untrusted input that
    // may have crossed devices, been hand-edited, or been forged
    // outright, so nothing here ever "imports, then figures out it was
    // bad" the way application/ImportBlueprintUseCase.js's own header
    // insists a blueprint import must not either.
    //
    // Deduplicates by the claim's own `id` — see
    // application/LocalPlaceNamingClaimStore.js#has()'s own header on why
    // that id (already bound into the signed payload) is sufficient
    // identity for "have I already got this exact claim," with no need
    // for a second, separately-derived content hash. Receiving the SAME
    // claim a second, third, or hundredth time (the ordinary cost of any
    // gossip-style transport) is always a no-op on the store — one
    // author, one claim, however many times it happened to arrive.
    //
    // Returns `{ claim, isNew }`: `claim` is always the PlaceNamingClaim
    // now on file (freshly stored, or the one already there);
    // `isNew` is false for a claim this replica already knew about.
    // Never throws for a duplicate — a duplicate is a completely
    // ordinary, expected outcome of exchange, never an error condition.
    importClaim(pkg) {
        validatePlaceNamingClaimPublication(pkg);

        const claim = PlaceNamingClaim.fromJSON(pkg.claim);
        const result = this._verifier.verifyPlaceNamingClaim(claim.toJSON());
        if (!result.valid) {
            throw new Error(`PlaceNamingClaimExchange: refusing to import an unverifiable claim — ${result.reason}`);
        }

        if (this._store.has(claim.worldId, claim.id)) {
            this._publicationLog.recordReceipt(claim.worldId, claim.id);
            const existing = this._store.listForRegion(claim.worldId, claim.regionId)
                .find((known) => known.id === claim.id);
            return { claim: existing || claim, isNew: false };
        }

        this._store.save(claim);
        this._publicationLog.recordReceipt(claim.worldId, claim.id);
        return { claim, isNew: true };
    }
}
