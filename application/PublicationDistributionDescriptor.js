import { WorldEncounterKind } from '../core/WorldEncounter.js';
import {
    describeDecentralizedDiscoveryEnvelope,
    DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL,
    DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION
} from '../core/DecentralizedDiscoveryEnvelope.js';

const URI_SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//;

// 0.9.44 — Publication Discovery Distribution Model.
//
// 0.9.24 through 0.9.43 built the entire CONSUMPTION side of decentralized
// discovery: a query service reports a lead, an envelope or a signed
// Publication's own location claim turns a lead into association evidence,
// resolution picks exactly one, retrieval fetches its bytes, and
// verification decides whether to believe them. Every one of those files
// answers a question that only makes sense once something has already been
// published somewhere. Nothing in this codebase has ever asked the question
// from the other side: what, exactly, does ForkBuild publish, where does
// the material go, and how does it announce that material so another
// ForkBuild instance can discover it? This file is the first, deliberately
// small answer — the publication-side contract, not yet the Arweave upload
// or the Nostr publish that will eventually satisfy it.
//
//   Publication   (publisher/Publication.js, 0.2.16 — already signed,
//        .id           unmodified by this milestone)
//        .signature
//                    │
//                    │   materialUri — wherever a caller already put (or
//                    │   will put) this publication's serialized material;
//                    │   this file never produces one, never uploads
//                    │   anything, and never guesses — see "No I/O of any
//                    │   kind," below
//                    ▼
//   application/PublicationDistributionDescriptor.js   ★ (THIS)
//        describePublicationDistribution()
//                    │
//                    ▼
//        { kind, objectId, material: { uri, storage },
//          discoveryEnvelope: { protocol, version, kind, objectId, uri } }
//                    │
//                    ▼
//        (future, unscheduled — 0.9.45 supplies a real Arweave materialUri;
//         0.9.46 takes discoveryEnvelope, serializes it, and publishes it
//         to Nostr as an event's own content, tagged with 0.9.24's own
//         discoveryTag; 0.9.47 composes both into one runtime pipeline)
//
// THE CONTRACT THIS MILESTONE DEFINES, IN ONE SENTENCE: a Publication's
// material goes to a material substrate and gets a uri; that uri, wrapped
// in 0.9.30's own discovery envelope shape, is what gets announced on a
// discovery substrate. Nothing here decides which substrate is which — see
// "Substrate-neutral," below — and nothing here performs either step.
//
// NEVER A SECOND ENVELOPE FORMAT. This file does not invent its own
// "distribution" JSON shape for the discovery half of its own output. It
// calls `core/DecentralizedDiscoveryEnvelope.js`'s own
// `describeDecentralizedDiscoveryEnvelope()`, unmodified, with this file's
// own `objectId`/`uri` plugged into the exact `protocol`/`version` the
// consumption side (0.9.30 through 0.9.43) already knows how to read — the
// same envelope a Nostr adapter's own `search()` already parses via
// `parseDecentralizedDiscoveryEnvelope()` (0.9.31). A publisher and a
// consumer agreeing on one shape, defined once, is the entire reason 0.9.30
// exists; this file honors that rather than quietly drifting from it.
//
// A SIGNED PUBLICATION IS REQUIRED — DUCK-TYPED, NEVER A CLASS IMPORT, THE
// SAME RESTRAINT `core/DecentralizedPublicationLocationClaim.js` (0.9.29)
// ALREADY HOLDS FOR THE IDENTICAL REASON. This file never imports
// `Publication` from `publisher/Publication.js`; it reads exactly two
// duck-typed fields off whatever `publication` a caller hands it: `id` and
// `signature`. `signature` is checked only for presence, exactly as 0.9.29's
// own header already draws the line — "confirm ONE THING IS TRUE: SOME
// signature is attached," never a cryptographic check of that signature's
// bytes. This file distributes nothing for an unsigned Publication, without
// itself signing, verifying, or even reading what the signature contains.
//
// `materialUri` IS SUPPLIED, NEVER COMPUTED, AND DELIBERATELY NOT READ OFF
// `publication.contentReference` — THE ONE DECISION THAT KEEPS THIS
// MILESTONE FROM QUIETLY RE-DESCRIBING THE EXISTING IPFS/BITCOIN/BASE
// MODEL. `publisher/Publication.js` has carried a `contentReference` since
// 0.2.14, naming wherever the existing content backends already put a
// publication's bytes — reading it here would make this file a second,
// redundant view onto a distribution decision the 0.2.x backends already
// made, for substrates this milestone is explicitly not evaluating. This
// file's own `materialUri` is a distinct fact a caller supplies directly —
// today, a hypothetical or already-known uri; from 0.9.45 onward, the real
// `ar://<transaction-id>` an Arweave uploader (unscheduled here) actually
// produced. Nothing about that decoupling favors Arweave over
// `contentReference`'s own backends, or says the latter are wrong — see
// this file's own "Deliberately excluded," below, and the milestone note in
// `docs/Roadmap.md`: existing backends may remain useful for other
// purposes; this file just never conflates the two.
//
// SUBSTRATE-NEUTRAL — `material.storage` IS INFERRED FROM `materialUri`'s
// OWN SCHEME, NEVER HARD-CODED, THE SAME OPEN INFERENCE `core/
// ContentReference.js` AND `application/NostrDiscoveryQueryService.js`
// ALREADY DRAW. This file names no storage backend in code. A caller may
// supply `materialStorage` explicitly (mirroring `ContentReference`'s own
// constructor-supplied `storage`); when omitted, it is read off
// `materialUri`'s own `scheme://` prefix — `ar://…` implies `"ar"`,
// `ipfs://…` implies `"ipfs"` — degrading to `null` for a uri with no
// recognizable scheme, never a reason to reject the whole descriptor.
//
// `kind` IS ALWAYS `WorldEncounterKind.PUBLICATION` — NEVER A PARAMETER,
// NEVER GUESSED, THE SAME RESTRAINT 0.9.29's OWN CLAIM READER ALREADY
// HOLDS. `publisher/Publication.js` remains the only signed structure this
// codebase can distribute today; an avatar-side equivalent, if this
// codebase ever builds a signed avatar structure, is unscheduled, later
// work with its own milestone, exactly as 0.9.29's own header already left
// it one layer earlier.
//
// A MODEL, NEVER MACHINERY — NO I/O OF ANY KIND. This file never imports
// `fetch`, `WebSocket`, `StorageProvider`, `identity/
// LocalAuthorizationVerifier.js`, or anything that signs, uploads,
// publishes, or retrieves. It performs no Arweave upload, no Nostr publish,
// no key management, and constructs no signature of its own — the task
// that requested this milestone named each of these explicitly as
// deliberately later work, and this file builds none of them. Calling
// `describePublicationDistribution()` never has a side effect anywhere;
// calling it twice with byte-identical input returns a byte-identical
// result.
//
// THE DISCOVERY ANNOUNCEMENT NEVER BECOMES THE CANONICAL COPY. This file's
// own `discoveryEnvelope` names only where material CLAIMS to live —
// exactly as unproven as every other envelope 0.9.30 already describes; see
// that file's own header, "a self-declared claim, never evidence." Nothing
// in this file's own output is ever treated as the material itself, and
// nothing here shortcuts the verification pipeline 0.9.37 through 0.9.43
// already built for the consuming side — a discovery announcement stays
// exactly what 0.9.30 already named it, on the publishing side too.
//
// MALFORMED INPUT DEGRADES TO `null`, NEVER THROWS — inherited unchanged
// from every file in this whole family. `describePublicationDistribution()`
// returns `null` when `publication` is missing/not an object; when its
// `id` is missing, empty, or not a string; when it carries no `signature`
// at all; when `materialUri` is missing, empty, or not a string; or when
// the resulting candidate fails `describeDecentralizedDiscoveryEnvelope()`'s
// own validation (defensive — every field this file supplies is already
// validated before that call, so this can only trip if 0.9.30's own
// contract ever changes underneath this file).
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. Every
// value this file returns is `Object.freeze()`'d, at every level; nothing
// passed in is ever mutated.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Uploading a Publication's serialized material to Arweave, or any
//   other material substrate, and producing a real `materialUri`.** 0.9.45,
//   unscheduled — see "materialUri is supplied, never computed," above.
// - **Publishing the described `discoveryEnvelope` to Nostr, or any other
//   discovery substrate.** 0.9.46, unscheduled.
// - **Private/public key management, or signing anything — a new Nostr
//   event, a new envelope field, or a new Publication.** This file reads
//   only whether `publication.signature` is already present; it never
//   constructs, requests, or verifies one.
// - **Replacing, deprecating, or migrating the existing IPFS/Bitcoin/Base
//   `contentReference` distribution model.** See "materialUri is supplied,
//   never computed," above — those backends are untouched, and this file
//   forms no opinion on whether they should be.
// - **A runtime composition that actually wires an Arweave uploader and a
//   Nostr publisher together into one pipeline.** 0.9.47, unscheduled.
// - **Automatic retries, scheduling, or replication policy of any kind.**
//   This file describes one distribution for one already-supplied
//   `materialUri`, once, synchronously — nothing here decides when, or how
//   often, a caller should call it again.
// - **Choosing between Arweave and any other storage backend.** This file
//   accepts whatever `materialUri` a caller already decided on; see
//   "Substrate-neutral," above.
// - **Reading, wiring, or automatically feeding this file's own output into
//   `application/NostrDiscoveryQueryService.js`, `application/
//   DecentralizedDiscoveryEnvelopeAssociationEvidenceIngress.js`, or any
//   other consumption-side file.** Those already work, unmodified, on
//   whatever a real publisher eventually announces; this milestone builds
//   the model a future publisher will use to produce that announcement, and
//   stops there.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

// Pure. Reads the `scheme` a `scheme://...` uri names — the identical
// inference `application/NostrDiscoveryQueryService.js`'s own private
// `extractUriScheme()` already performs one layer over, on the consumption
// side; that helper is not exported, so this file mirrors it rather than
// importing it. Returns `null` for a uri with no recognizable `scheme://`
// prefix.
function extractUriScheme(uri) {
    const match = URI_SCHEME_PATTERN.exec(uri);
    return match ? match[1] : null;
}

// Pure. Describes ONE publication distribution — the discovery envelope
// that would announce where an already-signed `publication`'s material,
// already placed at `materialUri` by a caller this file never asks about,
// can be found. See this file's own header for the full contract. Returns
// `null`, never throws, when `publication` is missing/not an object; when
// `publication.id` is missing, empty, or not a string; when
// `publication.signature` is missing/falsy; or when `materialUri` is
// missing, empty, or not a string. `materialStorage` is optional and
// degrades to an inference off `materialUri`'s own scheme; see this file's
// own header, "Substrate-neutral."
export function describePublicationDistribution({ publication, materialUri, materialStorage } = {}) {
    if (!publication || typeof publication !== 'object') {
        return null;
    }
    if (!isNonEmptyString(publication.id)) {
        return null;
    }
    if (!publication.signature) {
        return null;
    }
    if (!isNonEmptyString(materialUri)) {
        return null;
    }

    const discoveryEnvelope = describeDecentralizedDiscoveryEnvelope({
        protocol: DECENTRALIZED_DISCOVERY_ENVELOPE_PROTOCOL,
        version: DECENTRALIZED_DISCOVERY_ENVELOPE_VERSION,
        kind: WorldEncounterKind.PUBLICATION,
        objectId: publication.id,
        uri: materialUri
    });
    if (discoveryEnvelope === null) {
        return null;
    }

    const storage = isNonEmptyString(materialStorage) ? materialStorage : extractUriScheme(materialUri);

    return Object.freeze({
        kind: WorldEncounterKind.PUBLICATION,
        objectId: publication.id,
        material: Object.freeze({ uri: materialUri, storage }),
        discoveryEnvelope
    });
}
