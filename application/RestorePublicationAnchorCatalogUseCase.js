import { PublicationAnchor } from '../core/PublicationAnchor.js';
import { validatePublicationAnchor, PublicationAnchorError } from './PublicationAnchorValidator.js';

// 0.8.15 — Persistent External Evidence Catalog & Restart Recovery.
//
// application/LocalPublicationAnchorCatalog.js has always been backed by
// durable storage (a `StorageProvider`, now behind application/
// LocalPublicationAnchorStore.js), and a fresh catalog instance has
// always transparently served whatever was already on file the moment it
// was constructed — there was never a moment where a restarted replica's
// catalog was actually empty. What a restart never did, until this class,
// is re-earn the trust an anchor originally had to pass through to get
// there. A record already sitting in storage before this process started
// could be exactly what application/PublicationAnchorExchange.js#
// importAnchor() originally validated and verified — or it could be
// something else entirely: bit rot, a bug in some earlier version of this
// codebase, a hand-edited devtools entry, another script sharing the same
// origin's storage. application/LocalPublicationAnchorStore.js's own
// header calls this what it is: an UNTRUSTED byte source, no more
// entitled to automatic trust than a peer message or an imported package.
//
// This class is the ONE place that re-earns it, run ONCE, EXPLICITLY, at
// startup (see application/CreatePublicationAnchorPeerExchangeUseCase.js)
// — never lazily, never on every catalog read (application/
// LocalPublicationAnchorCatalog.js's own reads stay exactly as cheap and
// exactly as trusting as they always were; see that file's own header for
// why re-verifying on every read was never the right fix). It reuses the
// IDENTICAL two-of-three-step boundary application/
// PublicationAnchorExchange.js#importAnchor() already established for an
// anchor arriving from a stranger over a peer connection:
//
//   1. validate  — application/PublicationAnchorValidator.js (is this
//                   even a well-formed PublicationAnchor envelope?)
//   2. construct — a real core/PublicationAnchor.js instance
//   3. verify    — identity/LocalAuthorizationVerifier.js#
//                   verifyPublicationAnchor() (did the claimed
//                   anchorIdentity really sign exactly this tuple?)
//
// and DELIBERATELY STOPS THERE — see application/PublicationAnchorExchange
// .js's own header, "Signature Verification Is Not Proof Verification."
// This class never imports application/ExternalAnchorVerifier.js, never
// touches the network, and never re-checks whether the external system a
// restored anchor names actually recorded anything. Restarting this
// replica is not an occasion to re-litigate every anchor's PROOF, only to
// decide, once, whether each stored envelope is still the genuine signed
// claim it always was. See docs/Principles.md, "Restoration Re-Earns
// Trust In The Claim; It Never Re-Asks The External System (0.8.15)."
//
// A record that fails either step is PRUNED — removed from the store via
// its own `remove()` — rather than merely skipped. Leaving a known-bad
// record sitting in storage forever would let it silently keep failing
// this exact check on every future restart with no way for a person to
// ever notice or clear it; a record that never once passed validate +
// verify was never genuinely cataloged evidence in the first place; see
// this milestone's own docs/Principles.md entry on why pruning is not the
// same act as application/LocalPublicationAnchorCatalog.js#remove()
// withdrawing an anchor a caller once trusted.
//
// A record that DOES pass is left exactly where it already was — this
// class never calls `catalog.add()` and never touches `receivedAt` in any
// way. application/LocalPublicationAnchorCatalog.js already serves it,
// with its own original `receivedAt` untouched, the moment this class
// returns; there is no separate "now populate the catalog" step, because
// the catalog was never actually unpopulated to begin with (see this
// class's own header, first paragraph).
export const AnchorRestorationRejectionReason = Object.freeze({
    INVALID_STRUCTURE: 'invalid-structure',
    INVALID_SIGNATURE: 'invalid-signature'
});

export class RestorePublicationAnchorCatalogUseCase {
    // store: an application/LocalPublicationAnchorStore.js instance —
    // the SAME one application/LocalPublicationAnchorCatalog.js was
    // constructed over, so pruning a record here is immediately reflected
    // in every subsequent catalog read.
    // verifier: an identity/LocalAuthorizationVerifier.js instance (or
    // anything shaped like one) — signature verification ONLY, never an
    // application/ExternalAnchorVerifier.js. See this class's own header.
    constructor(store, verifier) {
        if (!store || typeof store.list !== 'function' || typeof store.remove !== 'function') {
            throw new Error('RestorePublicationAnchorCatalogUseCase: a LocalPublicationAnchorStore is required');
        }
        if (!verifier || typeof verifier.verifyPublicationAnchor !== 'function') {
            throw new Error('RestorePublicationAnchorCatalogUseCase: an authorization verifier is required');
        }
        this._store = store;
        this._verifier = verifier;
    }

    // Runs every record currently on file through the discipline
    // described in this class's own header. Never throws for a bad
    // record — a single forged or corrupted entry is pruned and reported,
    // never allowed to abort restoring the rest, the same per-entry
    // tolerance application/ImportPackageAnchorsUseCase.js already applies
    // to a package's own bundled anchors.
    //
    // Returns `{ restoredAnchors, rejectedAnchors }`:
    //   restoredAnchors — real PublicationAnchor instances that passed
    //                     validate + verify; informational only (a caller
    //                     that wants to log "N anchors restored" has
    //                     something to count) — never written anywhere,
    //                     since they were already durably on file.
    //   rejectedAnchors — `{ anchorId, reason, message }`; `anchorId` is
    //                      null when the record was too malformed to even
    //                      carry a usable id. `reason` is
    //                      INVALID_STRUCTURE (failed application/
    //                      PublicationAnchorValidator.js) or
    //                      INVALID_SIGNATURE (parsed, but did not verify)
    execute() {
        const entries = this._store.list();
        const restoredAnchors = [];
        const rejectedAnchors = [];

        for (const entry of entries) {
            const raw = entry ? entry.anchor : null;
            try {
                validatePublicationAnchor(raw);
                const anchor = PublicationAnchor.fromJSON(raw);
                const result = this._verifier.verifyPublicationAnchor(raw);
                if (!result.valid) {
                    throw new Error(result.reason || 'signature did not verify');
                }
                restoredAnchors.push(anchor);
            } catch (error) {
                const reason = error instanceof PublicationAnchorError
                    ? AnchorRestorationRejectionReason.INVALID_STRUCTURE
                    : AnchorRestorationRejectionReason.INVALID_SIGNATURE;
                const anchorId = raw && typeof raw.id === 'string' && raw.id ? raw.id : null;
                if (anchorId) {
                    this._store.remove(anchorId);
                }
                rejectedAnchors.push({ anchorId, reason, message: error.message });
            }
        }

        return { restoredAnchors, rejectedAnchors };
    }
}
