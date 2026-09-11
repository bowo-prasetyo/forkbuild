import { PublicationObservationArchive } from '../../application/PublicationObservationArchive.js';
import { CreatePublisherLeaderboardSnapshotClaimUseCase } from '../../application/CreatePublisherLeaderboardSnapshotClaimUseCase.js';
import { exportPublisherLeaderboardSnapshotClaim } from '../../application/PublisherLeaderboardSnapshotClaimExchange.js';
import { LocalAuthorizationVerifier } from '../../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';

// 0.9.411 — Publisher Leaderboard Snapshot Claim Authoring & Export.
//
// 0.9.410 Section E found the concrete, remaining product gap in this
// arc: `CreatePublisherLeaderboardSnapshotClaimUseCase` (0.8.121) and
// `exportPublisherLeaderboardSnapshotClaim` (0.8.122) are complete and
// tested, but nothing in `ui/` ever constructs or calls either one — the
// Reconciliation Workspace's own copy (ui/views/ReconciliationWorkspaceView.js)
// literally tells a person to go find an "Export Claim" action on a
// peer's replica, and that action does not exist anywhere for this claim
// type. This file is exactly that missing producer-side surface:
//
//   this replica's own recorded evidence (the SAME archive the
//   Publications page, the Leaderboard, and the Workspace already read)
//                          │
//                          ▼            [Generate & Sign Claim] (explicit click)
//   CreatePublisherLeaderboardSnapshotClaimUseCase#execute() (0.8.121, UNCHANGED)
//                          │
//                          ▼
//                   a signed claim
//                          │
//                          ▼            [Export Claim] (a SEPARATE, later, explicit click)
//    exportPublisherLeaderboardSnapshotClaim() (0.8.122, UNCHANGED)
//                          │
//                          ▼
//        a portable JSON artifact — paste it, or send the downloaded
//        file, into ANOTHER replica's Reconciliation Workspace "Peer
//        Evidence" field (ui/views/ReconciliationWorkspaceView.js,
//        UNCHANGED)
//
// THIS FILE INVOKES THE EXISTING USE CASES; IT NEVER REPRODUCES WHAT
// THEY DO. It imports exactly two production seams —
// `CreatePublisherLeaderboardSnapshotClaimUseCase` and
// `exportPublisherLeaderboardSnapshotClaim` — and nothing about snapshot
// construction, fingerprinting, signing, or the closed nine-field export
// envelope is reimplemented here. There is no UI cryptography, no second
// claim format, and no second exporter anywhere below this comment — the
// identical "compose, never reproduce" discipline
// ui/views/ReconciliationWorkspaceView.js's own header already holds for
// the receiving half of this exact workflow.
//
// CREATE/SIGN AND EXPORT ARE TWO SEPARATE, EXPLICIT ACTIONS — NEVER ONE
// COMBINED CLICK. THE SAME DISTINCTION `ui/components/PlaceNamingPanel.js`
// ALREADY HOLDS FOR A SIBLING REQUIRED-SIGNATURE CLAIM FAMILY: creating/
// signing a name claim and exporting one are two different buttons there
// too (see that file's own "Publish A Name" section versus its own
// per-claim "Export" button). `generateAndSignClaim()` below is the ONLY
// place this file ever constructs `CreatePublisherLeaderboardSnapshotClaimUseCase`
// or calls `.execute()`; `exportClaim()` is the ONLY place this file ever
// calls `exportPublisherLeaderboardSnapshotClaim()`. Neither runs the
// other. A person may generate and sign a claim, look at it, and export
// it only later — or never — exactly the milestone's own "creation and
// export are different actions" requirement.
//
// SIGNING IS NEVER AUTOMATIC — NOTHING HERE RUNS ON MOUNT, ON A WATCHER,
// OR ON A TIMER. There is no `mounted`/`created` hook and no `watch`
// block anywhere in this file. Opening this page, reading `claimCreated`/
// `exported`, or a background archive change never signs or exports
// anything — only an explicit click on "Generate & Sign Claim" or
// "Export Claim" does, mirroring `ui/views/ReconciliationWorkspaceView.js`'s
// own "Explicit execution only" restraint.
//
// WHAT GETS SIGNED IS THIS REPLICA'S OWN CURRENT ARCHIVE — READ FRESH ON
// EVERY CLICK, NEVER CACHED. `localArchive`, inside `generateAndSignClaim()`,
// is `publicationObservationArchiveStorage.load()` — byte-identical to how
// `ui/views/ReconciliationWorkspaceView.js` already obtains its own
// `localArchive` — so an import/export or a reconciliation that happened
// elsewhere on this same replica is always reflected in the next claim
// this page signs.
//
// THE AUTHORED CLAIM IS EPHEMERAL, PAGE-LOCAL STATE — DELIBERATELY NEVER
// PERSISTED. `claim` lives only in this component's own `data()`;
// reloading this page loses it, on purpose. `CreatePublisherLeaderboardSnapshotClaimUseCase`
// itself never persists anything (see its own header, "No persistence —
// deliberately out of scope"), and this file introduces no durable
// authored-claim store, claim history, or version management of its own
// — the identical restraint the milestone's own brief names explicitly.
// A person who wants to keep a claim keeps the exported artifact itself
// (pasted somewhere, or the downloaded file) — not a feature of this page.
//
// FAILURE IS THE USE CASE'S OWN, DISPLAYED VERBATIM — NEVER A SECOND,
// INVENTED "SIGN IN" MESSAGE. `CreatePublisherLeaderboardSnapshotClaimUseCase#execute()`
// already throws its own explicit message when nobody is signed in, or
// when the identity provider cannot sign; `generateAndSignClaim()` below
// catches exactly that thrown error and shows `error.message` unchanged,
// the same "the use case's own vocabulary, never re-labeled" posture
// `ui/views/ReconciliationWorkspaceView.js`'s own "Result presentation"
// already holds for its own outcome literals. `viewerIdentityId`/`signedIn`,
// below, exist ONLY to show an informational hint before the click — they
// never gate, replace, or duplicate the use case's own authentication
// check, mirroring `ui/components/PublicationCard.js`'s own identical,
// read-only `viewerIdentityId` computed.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. Nostr publication of the
// claim, automatic peer distribution, automatic reconciliation, claim
// history, claim version management, claim revocation, claim deletion,
// claim deduplication, notification, social sharing integrations, QR
// codes, clipboard synchronization, new snapshot-generation machinery,
// new cryptographic primitives, and any change to the Leaderboard or the
// Reconciliation Workspace. See this milestone's own request for the
// complete roster.
export default {
    name: 'PublisherLeaderboardSnapshotClaimAuthoringView',
    inject: {
        // The SAME app-wide IdentityUseCase every other injecting
        // component (`ui/components/PublicationCard.js`,
        // `ui/views/AvatarSettingsView.js`, etc.) already reads — never a
        // second identity mechanism, and never constructed here. Optional
        // (`default: null`) purely so this component degrades to an
        // honest "not signed in" state rather than throwing when nothing
        // provides it — the identical shape `PublicationCard.js`'s own
        // `identityUseCase` inject already uses.
        identityUseCase: { default: null },
        // The SAME app-wide storage adapter `ui/main.js` already provides
        // as `publicationObservationArchiveStorage`, and the SAME one
        // `ui/views/ReconciliationWorkspaceView.js` already injects —
        // never a second one. Optional (`default: null`) for the
        // identical reason that file's own header names.
        publicationObservationArchiveStorage: { default: null }
    },
    data() {
        return {
            // `null` until the first explicit "Generate & Sign Claim"
            // click — see this file's own header, "The authored claim is
            // ephemeral, page-local state." The UNCHANGED
            // `PublisherLeaderboardSnapshotClaim` instance
            // `CreatePublisherLeaderboardSnapshotClaimUseCase#execute()`
            // itself returns; this file never re-shapes it.
            claim: null,
            // The use case's own thrown `error.message`, verbatim — see
            // this file's own header, "Failure is the use case's own,
            // displayed verbatim."
            error: null,
            // `null` until the first explicit "Export Claim" click.
            // `json`/`fileName`/`downloadHref` mirror the identical
            // export-package shape
            // `ui/views/DecentralizedPublicationsView.js`'s own
            // `publicationArchiveExportedPackage` already establishes for
            // the sibling Publication Archive export.
            exportedClaimPackage: null
        };
    },
    computed: {
        // Read-only, informational only — see this file's own header,
        // "Failure is the use case's own... `viewerIdentityId`/`signedIn`...
        // never gate, replace, or duplicate the use case's own
        // authentication check." Byte-identical lookup to
        // `ui/components/PublicationCard.js`'s own `viewerIdentityId`.
        viewerIdentityId() {
            if (!this.identityUseCase) {
                return null;
            }
            return resolveSigningIdentityId(this.identityUseCase.provider);
        },
        // Deliberately independent of `viewerIdentityId` above — computed
        // directly from `identityUseCase`, never by reading a SIBLING
        // computed — mirroring `ui/views/ReconciliationWorkspaceView.js`'s
        // own `candidateProduced`/`noReconciliationCandidate`, each of
        // which independently reads `this.result` rather than one reading
        // the other. Keeps every computed here callable in isolation
        // (`Component.computed.<name>.call(ctx)`), exactly the harness
        // this whole codebase's own UI tests already rely on.
        signedIn() {
            if (!this.identityUseCase) {
                return false;
            }
            return Boolean(resolveSigningIdentityId(this.identityUseCase.provider));
        },
        claimCreated() {
            return this.claim !== null;
        },
        exported() {
            return this.exportedClaimPackage !== null;
        }
    },
    methods: {
        // The ONE explicit action that ever creates or signs a claim —
        // see this file's own header, "Create/sign and export are two
        // separate, explicit actions." Constructs the use case fresh on
        // every click, mirroring how
        // `ui/views/ReconciliationWorkspaceView.js`'s own `reconcile()`
        // constructs its own use case instance rather than holding one
        // across calls.
        generateAndSignClaim() {
            this.error = null;
            // A fresh claim is about to be signed over a (possibly new)
            // snapshot — the previously exported artifact, if any, no
            // longer describes this claim, so it is cleared here rather
            // than left silently stale. The previously CREATED claim
            // itself is only replaced on success, below — a thrown error
            // never discards a claim someone already has on screen.
            this.exportedClaimPackage = null;

            const identityProvider = this.identityUseCase ? this.identityUseCase.provider : null;
            // See this file's own header, "What gets signed is this
            // replica's own current archive" — read fresh on every click,
            // never cached, byte-identical to
            // `ui/views/ReconciliationWorkspaceView.js`'s own
            // `localArchive` lookup.
            const localArchive = this.publicationObservationArchiveStorage
                ? this.publicationObservationArchiveStorage.load()
                : PublicationObservationArchive.empty();

            try {
                const useCase = new CreatePublisherLeaderboardSnapshotClaimUseCase(identityProvider, new LocalAuthorizationVerifier());
                this.claim = useCase.execute(localArchive);
            } catch (thrown) {
                this.claim = null;
                this.error = thrown.message;
            }
        },
        // The ONE explicit action that ever exports a claim — never
        // called from `generateAndSignClaim()` above, and never called
        // automatically. A no-op when there is no claim to export yet
        // (the button that calls this is itself only shown once
        // `claimCreated` is true).
        exportClaim() {
            if (!this.claim) {
                return;
            }
            const json = JSON.stringify(exportPublisherLeaderboardSnapshotClaim(this.claim), null, 2);
            this.exportedClaimPackage = {
                json,
                fileName: `leaderboard-snapshot-claim-${this.claim.id}.json`,
                downloadHref: 'data:application/json;charset=utf-8,' + encodeURIComponent(json)
            };
        },
        // Discards every piece of page-local state, letting a person
        // start over. Never persisted anywhere, so this is exactly as
        // reversible as reloading the page — see this file's own header,
        // "The authored claim is ephemeral, page-local state."
        startOver() {
            this.claim = null;
            this.error = null;
            this.exportedClaimPackage = null;
        }
    },
    template: `
        <section class="publisher-leaderboard-snapshot-claim-authoring-view">
            <h1>Publisher Snapshot Claim</h1>
            <p class="reconciliation-leaderboard-note">
                Author and export a signed claim about YOUR OWN replica's current
                leaderboard snapshot — the exact evidence artifact the
                Reconciliation Workspace's own "Peer Evidence" field asks a peer
                to paste. Generating, signing, and exporting are three separate,
                explicit actions; nothing on this page runs automatically.
            </p>

            <p v-if="!signedIn" class="form-hint form-hint--neutral">
                Sign in to an identity before generating a claim —
                <router-link to="/identity">My Identities</router-link>.
            </p>

            <div class="evidence-inspection-adapter">
                <span class="evidence-inspection-adapter-title">Snapshot Claim</span>
                <p class="form-hint form-hint--neutral">
                    Generating computes this replica's own current leaderboard
                    snapshot fresh, right now, from its own recorded evidence,
                    and signs a claim about EXACTLY that snapshot under your
                    own currently signed-in identity.
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--primary" @click="generateAndSignClaim">
                        Generate &amp; Sign Claim
                    </button>
                    <button type="button" class="action-btn action-btn--secondary" v-if="claimCreated || error" @click="startOver">
                        Start Over
                    </button>
                </div>

                <p v-if="error" class="identity-unlock-error">{{ error }}</p>

                <div v-if="claimCreated" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Claim Created</span>
                    <p class="form-hint form-hint--neutral">
                        Claim created successfully — signed by {{ claim.signerIdentityId }}.
                    </p>
                    <dl class="identity-claim-fields">
                        <dt>Evidence fingerprint</dt><dd>{{ claim.evidenceFingerprint }}</dd>
                        <dt>Policy version</dt><dd>{{ claim.policyVersion }}</dd>
                        <dt>Snapshot fingerprint</dt><dd>{{ claim.snapshotFingerprint }}</dd>
                    </dl>
                    <div class="identity-mgmt-actions">
                        <button type="button" class="action-btn action-btn--secondary" @click="exportClaim">
                            Export Claim
                        </button>
                    </div>
                </div>

                <div v-if="exported" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Exported Claim</span>
                    <p class="form-hint form-hint--neutral">
                        Paste this into a peer's Reconciliation Workspace "Peer
                        Evidence" field, or send them the downloaded file.
                    </p>
                    <textarea class="form-input identity-export-json" rows="8" readonly :value="exportedClaimPackage.json"></textarea>
                    <div class="identity-mgmt-actions">
                        <a class="modal-btn modal-btn--primary" :href="exportedClaimPackage.downloadHref" :download="exportedClaimPackage.fileName">Download Claim</a>
                    </div>
                </div>
            </div>
        </section>
    `
};
