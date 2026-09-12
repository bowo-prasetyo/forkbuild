import { ArweavePublicationMaterialUploader } from './ArweavePublicationMaterialUploader.js';
import { describePublicationDistribution } from './PublicationDistributionDescriptor.js';
import { describePublicationDistributionResult } from './PublicationDistributionResult.js';
import { NostrMultiRelayPublicationDiscoveryPublisher } from './NostrMultiRelayPublicationDiscoveryPublisher.js';

// 0.9.444 — Nostr Multi-Relay Announcement Fan-Out.
//
// `NostrMultiRelayPublicationDiscoveryPublisher.js` (this same milestone,
// sibling file) fans a discovery envelope out across many relays; this file
// is the seam that gets one FROM a signed Publication in the first place —
// the direct structural analog of `PublicationDistributionOrchestrator.js`
// (0.9.58) and `PublicationDistributionRuntimeComposition.js` (0.9.47),
// scoped specifically to the Nostr multi-relay case, and nothing more:
//
//   Signed Publication
//        │
//        ├── serializedMaterial
//        ├── materialStorage                (optional)
//        ├── arweaveUploaderOptions        (signer, gatewayUrl, ...)
//        └── nostrRelayUrls + nostrPublisherOptions   (tagName, kind,
//                                             discoveryTag, publishImpl,
//                                             timeoutMs — never relayUrl)
//                    │
//                    ▼
//   application/NostrMultiRelayPublicationDistributionOrchestrator.js  ★ (THIS)
//        orchestrateMultiRelayNostrPublicationDistribution({ ... })
//                    │
//                    ├──► new ArweavePublicationMaterialUploader(...)   (0.9.45, unmodified)
//                    ├──► uploader.upload(serializedMaterial)   -> materialUri | null
//                    ├──► describePublicationDistribution({ ... })   (0.9.44, unmodified)   -> { material, discoveryEnvelope } | null
//                    ├──► new NostrMultiRelayPublicationDiscoveryPublisher(...)   (this milestone)
//                    ├──► multiRelayPublisher.publish(discoveryEnvelope)
//                    │        -> [ { relayUrl, published, id? }, ... ]
//                    └──► describePublicationDistributionResult({ ... })   (0.9.48, unmodified) — ONCE PER RELAY
//                    │
//                    ▼
//        Promise<Array<PublicationDistributionResult>>
//
// ONE MATERIAL UPLOAD, SHARED ACROSS EVERY RELAY — NEVER RE-UPLOADED PER
// RELAY. Material is uploaded to Arweave exactly once per call to this
// file's own function, regardless of how many relays `nostrRelayUrls` names.
// Every resulting `PublicationDistributionResult` in the returned array
// shares the identical `material` fact (or `null`, if the upload itself
// declined) — only `discovery` varies, per relay, per result. This mirrors
// exactly how a real announcement works: the content lives at one place
// (`material.uri`); only WHERE that fact gets announced varies by relay.
//
// STOP-ON-FAILURE ORDERING, IDENTICAL TO 0.9.49's OWN, HELD HERE ONE STEP
// EARLIER THAN THE FAN-OUT. If `uploader.upload()` resolves `null`, no
// `NostrMultiRelayPublicationDiscoveryPublisher` is even constructed, and
// this file resolves a ONE-ELEMENT array holding
// `describePublicationDistributionResult({ publication, material: null,
// discovery: null })` — there is no relay-shaped fact to report because no
// relay was ever contacted. If `describePublicationDistribution()` returns
// `null` (a malformed/unsigned Publication), the already-obtained material
// fact is still reported, again as a single-element array — no
// `discoveryEnvelope` exists for any relay to have been offered. Only once
// both steps genuinely produce something IS `multiRelayPublisher.publish()`
// ever called — mirroring 0.9.49's own "each step only runs if the one
// before it produced something to build on."
//
// EVERY REPORTED RESULT REUSES 0.9.48's OWN, UNMODIFIED
// `describePublicationDistributionResult()` — NEVER A SECOND RESULT SHAPE.
// This file introduces no new result vocabulary of any kind; a caller
// (`application/PublicationDistributionCommand.js`'s own 0.9.444 amendment)
// receiving this file's own array can hand each element to the identical
// lifecycle-description/transition/observation machinery 0.9.50 through
// 0.9.443 already built for a single-relay `PublicationDistributionResult` —
// called once per array element, never once for the whole array. This is
// precisely how "no newly invented aggregate status" is honored at this
// layer: the array itself is the only new shape, and every element inside it
// is exactly the type this codebase already knows how to record.
//
// NO NEW ORCHESTRATION POLICY BEYOND WHAT 0.9.58 ALREADY ESTABLISHED FOR ONE
// RELAY. This file has no `try`/`catch` of its own, performs no retry, and
// forms no opinion about whether a result with some relays present and
// others absent "counts as done" — the identical restraint 0.9.48's, 0.9.49's,
// and 0.9.58's own headers already hold, extended here to a result ARRAY
// rather than a single result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Relay selection, ranking, retry, or failover of any kind.** See
//   `NostrMultiRelayPublicationDiscoveryPublisher.js`'s own header, "fan-out,
//   never failover" — this file adds no policy on top of that file's own.
// - **An `ArweaveAnnouncementPublisher`-flavored multi-gateway counterpart.**
//   Per this milestone's own request, "0.9.444 should modify announcement
//   publication only" and is scoped to Nostr; Arweave's own gateway-failover
//   read path (`content/ArweaveGatewayFailoverContentStore.js`) is untouched
//   and unimported here.
// - **Lifecycle recording of any kind.** This file returns an array of plain
//   `PublicationDistributionResult` values; recording them into a
//   `PublicationDistributionLifecycleMemoryStore` remains entirely
//   `application/PublicationDistributionCommand.js`'s own job, one layer up.
// - **A composition-root decision about WHERE `nostrRelayUrls` comes from.**
//   Exactly as `PublicationDistributionRuntimeComposition.js`'s own header
//   already holds for `nostrPublisherOptions.relayUrl` — a caller supplies
//   the array; this file neither defaults nor discovers one.

function isNonEmptyString(value) {
    return typeof value === 'string' && value.length > 0;
}

// orchestrateMultiRelayNostrPublicationDistribution({ publication,
//   serializedMaterial, materialStorage, arweaveUploaderOptions,
//   nostrRelayUrls, nostrPublisherOptions }) ->
//   Promise<Array<PublicationDistributionResult>>.
//
// See this file's own header for the full contract. Always resolves an
// array with at least one element; a one-element array reports "no relay was
// ever contacted" (upload or descriptor step declined — see "Stop-on-failure
// ordering," above); otherwise one element per normalized relay in
// `nostrRelayUrls`, each sharing the identical `material` fact and carrying
// its own independent `discovery` fact (or `null`). Throws synchronously,
// before any I/O, when `arweaveUploaderOptions` or the combination of
// `nostrRelayUrls`/`nostrPublisherOptions` is malformed in a way 0.9.45's own
// `ArweavePublicationMaterialUploader` or this milestone's own
// `NostrMultiRelayPublicationDiscoveryPublisher` constructor already rejects.
// The returned promise rejects exactly when `uploader.upload()` itself
// rejects — see 0.9.45's own "a genuine transport/signing failure
// propagates"; an individual relay's own genuine failure during the fan-out
// step never rejects this promise — see `NostrMultiRelayPublicationDiscoveryPublisher.js`'s
// own header, "one relay's own genuine failure never prevents another
// relay's result."
export function orchestrateMultiRelayNostrPublicationDistribution({
    publication,
    serializedMaterial,
    materialStorage,
    arweaveUploaderOptions,
    nostrRelayUrls,
    nostrPublisherOptions = {}
} = {}) {
    const uploader = new ArweavePublicationMaterialUploader(arweaveUploaderOptions);
    const multiRelayPublisher = new NostrMultiRelayPublicationDiscoveryPublisher({
        relayUrls: nostrRelayUrls,
        ...nostrPublisherOptions
    });

    return runMultiRelayNostrPublicationDistribution({ publication, serializedMaterial, materialStorage, uploader, multiRelayPublisher });
}

async function runMultiRelayNostrPublicationDistribution({ publication, serializedMaterial, materialStorage, uploader, multiRelayPublisher }) {
    const materialUri = await uploader.upload(serializedMaterial);
    if (materialUri === null) {
        return [describePublicationDistributionResult({ publication, material: null, discovery: null })];
    }

    const uploadedStorage = isNonEmptyString(materialStorage)
        ? materialStorage
        : (isNonEmptyString(uploader.storage) ? uploader.storage : null);

    const distribution = describePublicationDistribution({ publication, materialUri, materialStorage });
    if (distribution === null) {
        return [describePublicationDistributionResult({
            publication,
            material: { uri: materialUri, storage: uploadedStorage },
            discovery: null
        })];
    }

    const material = { uri: distribution.material.uri, storage: distribution.material.storage };

    const relayOutcomes = await multiRelayPublisher.publish(distribution.discoveryEnvelope);

    return relayOutcomes.map((outcome) => describePublicationDistributionResult({
        publication,
        material,
        discovery: outcome.published
            ? { relayUrl: outcome.relayUrl, discoveryTag: multiRelayPublisher.discoveryTag, id: outcome.id }
            : null
    }));
}
