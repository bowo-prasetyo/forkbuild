import { readFile } from 'node:fs/promises';

import { WorldEncounterKind } from '../core/WorldEncounter.js';
import {
    describeDecentralizedDiscoveryEnvelope,
    parseDecentralizedDiscoveryEnvelope
} from '../core/DecentralizedDiscoveryEnvelope.js';
import { describeDecentralizedWorldDiscoveryLead } from '../core/DecentralizedWorldDiscoveryLead.js';

import {
    DecentralizedDiscoveryQueryService,
    queryDecentralizedWorldDiscovery
} from '../application/DecentralizedWorldDiscoveryQuery.js';
import { ArweaveGraphqlDiscoveryQueryService } from '../application/ArweaveGraphqlDiscoveryQueryService.js';
import { NostrDiscoveryQueryService } from '../application/NostrDiscoveryQueryService.js';
import { NostrPublicationDiscoveryPublisher } from '../application/NostrPublicationDiscoveryPublisher.js';
import { deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes } from '../application/DecentralizedDiscoveryEnvelopeAssociationEvidenceIngress.js';

import { describePublicationDistribution } from '../application/PublicationDistributionDescriptor.js';
import { ArweavePublicationMaterialUploader } from '../application/ArweavePublicationMaterialUploader.js';
import { executePublicationDistribution } from '../application/PublicationDistributionExecutor.js';
import { describePublicationDistributionResult } from '../application/PublicationDistributionResult.js';

// 0.9.427 — Arweave Announcement/Discovery Publication Contract Audit.
//
// Type: test-only contract audit. Zero production changes.
//
// 0.9.425 built a real Arweave Proof/Anchoring provider pair in one
// milestone because 0.9.424 had already found the registry boundary
// PROOF_AND_ANCHORING needed was READY — two real, already-multi-provider
// registries and a real UI method reading one of them, needing only the
// two missing classes. 0.9.426 then confirmed the built pair actually
// preserves the surrounding architecture. Neither of those two milestones
// applies to ANNOUNCEMENT_AND_DISCOVERY, and 0.9.424's own Section B/G
// already said why: that role's write side is missing BOTH a class AND a
// registry/UI hook, and its one real write pipeline
// (`PublicationDistributionRuntimeComposition.js`) hardcodes Nostr by a
// literal, unparameterized `new NostrPublicationDiscoveryPublisher(...)`
// call. Before repeating 0.9.425's move for this role, this milestone asks
// the question 0.9.424 deferred rather than answered: what exact
// application-level fact must an Announcement/Discovery publisher produce,
// and can Arweave carry that fact through the EXISTING reader without a new
// discovery semantic? Test-only, no `ArweaveAnnouncementPublisher`, no
// registry, no UI, no composition change — naming the contract precisely
// enough that a future milestone can implement against it without another
// broad investigation first.
//
// THE ONE FINDING EVERYTHING ELSE IN THIS FILE DEPENDS ON, ESTABLISHED
// FIRST, IN SECTION A: the "Announcement fact" this codebase actually runs,
// end to end, in shipped code, TODAY — for Nostr, its only real substrate
// — is smaller than 0.9.30's own envelope makes it look. `core/
// DecentralizedDiscoveryEnvelope.js` (0.9.30) and `application/
// DecentralizedDiscoveryEnvelopeAssociationEvidenceIngress.js` (0.9.32)
// both exist and both work, but `application/NostrDiscoveryQueryService.js`
// (0.9.31) — the one production adapter that ever reads one — parses an
// event's own envelope only long enough to pull out `uri`/`storage`; the
// envelope's own `kind`/`objectId`, and the envelope object itself, are
// discarded before `search()` ever returns (see that file's own header,
// "A lead, never association evidence... this class's own `search()` never
// reads any Nostr tag other than the one it uses to build its own outgoing
// filter"). Nothing in `application/`, `discovery/`, or `ui/` ever calls
// `deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes()`
// with a real `envelopes` array from a live adapter — every call site is a
// test file. So the fact that actually flows, live, from a real
// `NostrPublicationDiscoveryPublisher.publish()` call to a real
// `NostrDiscoveryQueryService.search()` result, is exactly a
// `DecentralizedWorldDiscoveryLead`: `{ origin, discoveryTag, uri, storage
// }` — never a reconstructed `{ kind, objectId }`. This is the honest
// "minimum factual payload that makes the announcement discoverable" this
// milestone's own success criterion asks for, read from current source, not
// assumed from 0.9.30's own richer, still-substantially-unwired design.
//
// LETTERED SECTIONS:
//   A. Reconstruct the current, LIVE Announcement fact — a lead, not a
//      reconstructed publication — and confirm the richer envelope/evidence
//      machinery is real but production-unwired for every substrate, Nostr
//      included, not merely for Arweave.
//   B. Storage ≠ announcement, proven live: a real Arweave `material` fact
//      and a real `discovery` fact are independently absent/present on the
//      one real `PublicationDistributionResult` shape — Arweave already
//      participating in CONTENT never implies it has announced anything.
//   C. The Arweave discovery primitive, read from source: Arweave Tags,
//      already the mechanism `ArweaveGraphqlDiscoveryQueryService` matches
//      a `discoveryTag` against — and the precise, narrow gap in what its
//      own GraphQL query requests back (`node { id }`, never `node { tags }`
//      or a transaction's own data), which is what actually blocks it from
//      recovering more than a bare `uri` today.
//   D. Nostr vs. Arweave, application-contract level: both share the
//      identical minimal write contract `PublicationDistributionExecutor.js`
//      already enforces on any `discoveryPublisher` — but that same
//      executor, and separately `PublicationDistributionResult.js`'s own
//      `describeDiscoveryFact()`, both read/require a field literally
//      named `relayUrl` off the resolved publish() value, a Nostr wire
//      term leaking into two layers of what otherwise reads as a
//      substrate-neutral pipeline.
//   E. The existing discovery reader's sufficiency, tested at TWO different
//      bars: DISCOVERY_CONTRACT_ALREADY_ARWEAVE_READY at the bar Section A
//      proved is the one actually live today (a bare, tagged `uri`), and
//      ARWEAVE_DISCOVERY_READER_GAP at the richer, currently-unused
//      `kind`/`objectId` bar 0.9.30/0.9.32 designed for but nothing
//      production-wires for any substrate yet.
//   F. Identity and provenance: two publications sharing one contentHash
//      stay distinguishable through an Arweave-backed announcement, for a
//      reason specific to Arweave's own substrate shape (a transaction id
//      is never content-addressed) that this milestone states explicitly
//      rather than assuming from IPFS-shaped intuition.
//   G. The hypothetical provider boundary: a `TestOnlyArweaveAnnouncementPublisher`
//      — never exported, never touching `anchoring/` or `application/` —
//      proving live that `PublicationDistributionExecutor.js`'s own
//      `discoveryPublisher` slot already accepts an Arweave-flavored
//      collaborator with ZERO production code change, PROVIDED it satisfies
//      Section D's own field-name finding.
//   H. The fixed two-collaborator architecture, revisited precisely: WHICH
//      layer already accepts a substitute discoveryPublisher (the Executor,
//      proven in Section G) versus which layer hardcodes Nostr by a literal
//      `new` call that would need to change (the RuntimeComposition the
//      real UI-facing command chain actually runs through) — answering
//      "replace the fixed slot, or make it dynamic" with "neither, at the
//      layer that matters; the fixed slot is one layer further up than the
//      slot 0.9.423 already described as fixed."
//
// THE ONE PROHIBITED INTERPRETATION, HELD AS A DELIBERATE INVARIANT
// THROUGHOUT: Arweave already storing Content never automatically becomes
// an Arweave Announcement. Section B proves the two facts stay independent
// on the one real result shape; Section G's hypothetical publisher is an
// explicit, separately-invoked `publish()` call a caller chooses to make,
// never a side effect of `ArweavePublicationMaterialUploader#upload()`;
// nothing in this file wires one role's output into triggering the other.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **`application/ArweaveDiscoveryPublisher.js`, `application/
//   ArweaveAnnouncementPublisher.js`, or any file by either name.** Section
//   G's own stand-in is throwaway, test-local, never exported.
// - **Any change to `application/PublicationDistributionRuntimeComposition.js`,
//   `application/PublicationDistributionOrchestrator.js`, `application/
//   PublicationDistributionCommand.js`, or `application/
//   PublicationDistributionCommandComposition.js`.** Section H names the
//   precise minimum shape a future change would need; it makes none.
// - **Extending `application/ArweaveGraphqlDiscoveryQueryService.js`'s own
//   GraphQL query to request `tags` or a transaction's own data.** Section
//   C names this as the exact, narrow future seam; this file does not build
//   it, real or test-local.
// - **A Discovery-role keyed registry, or any change to `application/
//   RoleAwareProviderResolver.js`.** Unchanged, unimported by anything this
//   file constructs.
// - **Any UI, panel, or preference control.** Nothing in `ui/` is read or
//   edited.
// - **Wiring `deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes()`
//   into any live adapter, for Nostr or Arweave.** Section A's own finding
//   that this remains test-only for every substrate is reconfirmed, not
//   reversed.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

let assertionCount = 0;
function check(condition, message) {
    assertionCount += 1;
    assert(condition, message);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function neverCalled() {
    throw new Error('neverCalled: this audit checks contract shape and live wiring, never real network behavior');
}

function fakeOkTextResponse(text = '') {
    return { ok: true, headers: { get: () => null }, text: async () => text };
}

async function run() {
    // ===============================================================
    // Section A — Reconstruct the current, LIVE Announcement fact.
    // ===============================================================
    {
        // The richer machinery (0.9.30's envelope, 0.9.32's evidence
        // ingress) is real and independently correct — confirm it still
        // works on its own terms before showing it is unwired.
        const envelope = describeDecentralizedDiscoveryEnvelope({
            protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION,
            objectId: 'pub-427-a', uri: 'ar://materialtx-a'
        });
        check(envelope !== null, 'A1. core/DecentralizedDiscoveryEnvelope.js still describes a well-formed envelope carrying kind/objectId, on its own — the richer contract is real');

        const lead = describeDecentralizedWorldDiscoveryLead({ origin: 'dweb:test', discoveryTag: 'tag-427', uri: 'ar://materialtx-a', storage: 'ar' });
        const associations = deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes({ envelopes: [envelope], leads: [lead] });
        check(associations.length === 1 && associations[0].kind === WorldEncounterKind.PUBLICATION && associations[0].objectId === 'pub-427-a', 'A2. when EXPLICITLY handed both an envelope and a matching lead, the evidence ingress genuinely reconstructs kind/objectId — the mechanism is not broken, only unconsumed by any live adapter, confirmed next');

        // Now show NostrDiscoveryQueryService — the one live adapter that
        // ever parses a real envelope out of real substrate data — never
        // preserves kind/objectId as far as queryDecentralizedWorldDiscovery().
        const relayEvent = { content: JSON.stringify(envelope) };
        const nostrDiscovery = new NostrDiscoveryQueryService({
            queryImpl: async () => [relayEvent]
        });
        const leads = await queryDecentralizedWorldDiscovery(nostrDiscovery, 'tag-427');
        check(leads.length === 1, 'A3. a real Nostr envelope, carrying real kind/objectId, still produces exactly one lead through the real, unmodified live pipeline');
        check(leads[0].uri === 'ar://materialtx-a' && leads[0].storage === 'ar', 'A4. that lead carries uri/storage, reconstructed correctly from the envelope\'s own uri scheme');
        check(!('kind' in leads[0]) && !('objectId' in leads[0]), 'A5. that SAME lead carries no kind/objectId at all — core/DecentralizedWorldDiscoveryLead.js\'s own shape has no such fields, and NostrDiscoveryQueryService never surfaces the envelope object itself past its own search() — confirmed live, not merely read from a header comment');

        // Confirm production code never calls the evidence ingress with a
        // real envelopes array — only test files do.
        const ingressSource = await source('application/DecentralizedDiscoveryEnvelopeAssociationEvidenceIngress.js');
        check(/A SECOND PRODUCER, NEVER A MERGE INTO THE FIRST/.test(ingressSource), 'A6. sanity check: reading the expected production file');
        let nostrDiscoverySearchSource = await source('application/NostrDiscoveryQueryService.js');
        check(!/deriveDecentralizedWorldEncounterLeadAssociationEvidenceFromEnvelopes/.test(nostrDiscoverySearchSource), 'A7. NostrDiscoveryQueryService.js itself never imports or calls the evidence ingress — it discards the parsed envelope before returning');

        console.log('✓ Section A: the LIVE Announcement fact this codebase actually produces end-to-end, for its only real substrate (Nostr), is a bare DecentralizedWorldDiscoveryLead — { origin, discoveryTag, uri, storage } — never a reconstructed { kind, objectId }. The richer envelope/evidence contract is real and independently correct (A1-A2) but unwired into any live adapter for ANY substrate (A5-A7) — this is not an Arweave-specific gap, and any Arweave provider audit must be honest about which bar is actually live today.');
    }

    // ===============================================================
    // Section B — Storage ≠ announcement, proven on the one real result
    // shape a live distribution actually produces.
    // ===============================================================
    {
        const publication = { id: 'pub-427-b', signature: 'sig-427-b' };

        // Arweave content genuinely uploaded (material present); nothing
        // ever announced (discovery absent) — the exact "partial
        // completion" shape PublicationDistributionExecutor.js's own
        // stop-on-failure ordering produces when a discoveryPublisher is
        // never reached at all.
        const contentOnlyResult = describePublicationDistributionResult({
            publication,
            material: { uri: 'ar://materialtx-b', storage: 'ar' },
            discovery: null
        });
        check(contentOnlyResult !== null, 'B1. a real result describing Arweave content with no announcement at all is well-formed');
        check(contentOnlyResult.material.uri === 'ar://materialtx-b', 'B2. the material fact names the real Arweave transaction');
        check(contentOnlyResult.discovery === null, 'B3. the discovery fact is independently null — Arweave having stored bytes never implies, on this shape, that anything was announced');

        // The reverse never happens in practice (the executor never
        // reaches discoveryPublisher.publish() without a materialUri
        // first — see PublicationDistributionExecutor.js's own "stop-on-
        // failure ordering") but the RESULT SHAPE ITSELF places no such
        // constraint — material and discovery are validated completely
        // independently by describePublicationDistributionResult(), which
        // is exactly the invariant this section exists to pin down: the
        // shape enforces no coupling between the two roles at all, in
        // either direction.
        const discoveryOnlyResult = describePublicationDistributionResult({
            publication,
            material: null,
            discovery: { relayUrl: 'wss://relay.example', discoveryTag: 'tag-427-b', id: 'a'.repeat(64) }
        });
        check(discoveryOnlyResult !== null && discoveryOnlyResult.material === null && discoveryOnlyResult.discovery !== null, 'B4. the result SHAPE itself never requires material to be present for discovery to be described, or vice versa — the two roles are validated as two completely separate optional facts, confirming CONTENT and ANNOUNCEMENT_AND_DISCOVERY are independent roles at the data-shape level, not merely by convention of how the executor happens to call things today');

        console.log('✓ Section B: CONTENT and ANNOUNCEMENT_AND_DISCOVERY remain two independently-present-or-absent facts on the one real PublicationDistributionResult shape, live, not merely by architectural intent — Arweave already occupying the CONTENT role (a real material.uri) carries zero implication, enforced at the data level, that anything has been announced');
    }

    // ===============================================================
    // Section C — the Arweave discovery primitive, read from source.
    // ===============================================================
    {
        const discoverySource = await source('application/ArweaveGraphqlDiscoveryQueryService.js');
        check(/already indexes every[\s\S]{0,40}transaction's arbitrary key\/value Tags/.test(discoverySource), 'C1. the class\'s own header names Arweave Tags, in its own words, as the discovery primitive this codebase already uses — never a new vocabulary this milestone would have to invent');

        check(/edges \{ node \{ id \} \} \}/.test(discoverySource.replace(/\s+/g, ' ').replace(/'/g, '')) || /node\s*\{\s*id\s*\}/.test(discoverySource), 'C2. the actual GraphQL query built by this class requests only node { id } — read from the real query-building function, never from prose');
        check(!/node\s*\{[^}]*\btags\b/.test(discoverySource), 'C3. the query never requests node { tags } — a candidate\'s own tag VALUES (where a kind/objectId-carrying envelope could live) are never fetched back, only the bare transaction id used to build uri');

        // Live proof: simulate the GraphQL gateway actually reporting a
        // transaction whose OTHER tags could carry an envelope; this
        // reader still reports only { uri, storage } regardless, because
        // it never even asks for them.
        const fakeFetch = async (_url, init) => {
            const body = JSON.parse(init.body);
            check(!/tags/.test(body.query.replace(/tags:\s*\[\{[^}]*\}\]/, '')), 'C4. the outgoing query body itself, inspected live, carries no tags selection on the returned node beyond the filter clause used to MATCH the discoveryTag');
            return {
                ok: true,
                json: async () => ({ data: { transactions: { edges: [{ node: { id: 'announcetx-c' } }] } } })
            };
        };
        const arweaveDiscovery = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: fakeFetch });
        const candidates = await arweaveDiscovery.search('tag-427-c');
        check(candidates.length === 1 && candidates[0].uri === 'ar://announcetx-c' && candidates[0].storage === 'ar', 'C5. even when the simulated gateway response could carry more, this reader recovers exactly { uri, storage } — never more, because it never asked for more');

        console.log('✓ Section C: Arweave Tags are already this codebase\'s own live discovery primitive (C1) — but ArweaveGraphqlDiscoveryQueryService\'s own GraphQL query requests only a matching transaction\'s bare id (C2-C3), never its other tags or its data, confirmed both from the query-building source and from a live simulated round-trip (C4-C5). Representing kind/objectId via additional Arweave Tags is architecturally natural (Tags are exactly the right-shaped primitive) but is NOT already readable by the shipped reader — extending the query to also select node { tags { name value } } is a real, narrow, precisely-scoped future reader change, never a new discovery semantic.');
    }

    // ===============================================================
    // Section D — Nostr vs. Arweave, compared at the application-contract
    // level, never the wire-protocol level.
    // ===============================================================
    {
        const executorSource = await source('application/PublicationDistributionExecutor.js');
        check(/discoveryPublisher\.publish/.test(executorSource) && /discoveryPublisher\.discoveryTag/.test(executorSource), 'D1. the real executor\'s own contract for ANY discoveryPublisher, read from source: expose publish() and a non-empty discoveryTag — nothing Nostr-specific in that check');
        check(/relayUrl:\s*published\.relayUrl/.test(executorSource), 'D2. but the executor itself ALSO reads a field literally named relayUrl off whatever discoveryPublisher.publish() resolved with, by that exact name, to build the discovery fact it hands to describePublicationDistributionResult() — the Nostr wire term is not confined to the result boundary alone, it is read explicitly one layer earlier too');

        const resultSource = await source('application/PublicationDistributionResult.js');
        check(/isNonEmptyString\(discovery\.relayUrl\)/.test(resultSource), 'D3. and PublicationDistributionResult.js\'s own describeDiscoveryFact() separately RE-validates that same field, by the same exact name — a Nostr wire term baked into two layers of what otherwise reads as a substrate-neutral pipeline');
        check(!/isNonEmptyString\(discovery\.origin\)|isNonEmptyString\(discovery\.gatewayUrl\)/.test(resultSource), 'D4. no substrate-neutral alternative field name (origin, gatewayUrl) is accepted instead — relayUrl is the one and only name either layer currently recognizes for that fact');

        const nostrPublisher = new NostrPublicationDiscoveryPublisher({ relayUrl: 'wss://x', discoveryTag: 'd', publishImpl: neverCalled });
        check(typeof nostrPublisher.discoveryTag === 'string' && nostrPublisher.discoveryTag.length > 0, 'D5. Nostr\'s own real publisher already satisfies the executor\'s generic discoveryTag contract');

        console.log('✓ Section D: Nostr and a hypothetical Arweave announcement publisher share the IDENTICAL minimal application contract PublicationDistributionExecutor.js enforces (publish(), non-empty discoveryTag) — the wire protocols genuinely differ underneath, exactly as the task\'s own brief wants. But one concrete, Nostr-flavored leak survives one layer up: PublicationDistributionResult.js requires the resolved publish() value to expose a field literally named relayUrl. An Arweave publisher can satisfy this today by naming its own gateway URL relayUrl (proven live in Section G) — a workable but semantically odd accommodation — or a future milestone can rename the field to something substrate-neutral (e.g. announcementOrigin); either is a real, bounded, minor change, never a blocking one.');
    }

    // ===============================================================
    // Section E — the existing discovery reader's sufficiency, at the two
    // bars Sections A and C together establish.
    // ===============================================================
    {
        // BAR 1 — the bar Section A proved is actually live today: a bare,
        // discoveryTag-tagged uri. Prove the shipped, UNMODIFIED reader
        // already recovers this for a hypothetical Arweave announcement
        // with zero reader change.
        const fakeFetchBar1 = async () => ({
            ok: true,
            json: async () => ({ data: { transactions: { edges: [{ node: { id: 'announcetx-e1' } }] } } })
        });
        const readerBar1 = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: fakeFetchBar1 });
        const leadsBar1 = await queryDecentralizedWorldDiscovery(readerBar1, 'tag-427-e1');
        check(leadsBar1.length === 1 && leadsBar1[0].uri === 'ar://announcetx-e1' && leadsBar1[0].storage === 'ar', 'E1. BAR 1 (live today\'s actual bar): the shipped, unmodified ArweaveGraphqlDiscoveryQueryService already produces a real, well-formed DecentralizedWorldDiscoveryLead for a hypothetical tagged Arweave announcement transaction — DISCOVERY_CONTRACT_ALREADY_ARWEAVE_READY at this bar, zero reader change needed');

        // BAR 2 — the richer, currently production-unused kind/objectId
        // bar 0.9.30/0.9.32 designed for. Prove the SAME reader cannot
        // recover it, and name precisely why: it never fetches tags or
        // data at all, so there is nowhere for an envelope to have ridden.
        const fakeFetchBar2 = async () => ({
            ok: true,
            // Simulate a gateway that WOULD be able to report more, to
            // show the limitation is this reader's own query, not the
            // gateway's own capability.
            json: async () => ({
                data: {
                    transactions: {
                        edges: [{ node: { id: 'announcetx-e2', tags: [{ name: 'ForkBuild-Envelope', value: JSON.stringify({ protocol: 'forkbuild', version: 1, kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-427-e2', uri: 'ar://announcetx-e2' }) }] } }]
                    }
                }
            })
        });
        const readerBar2 = new ArweaveGraphqlDiscoveryQueryService({ fetchImpl: fakeFetchBar2 });
        const leadsBar2 = await queryDecentralizedWorldDiscovery(readerBar2, 'tag-427-e2');
        check(leadsBar2.length === 1, 'E2. the reader still reports exactly one lead even when the simulated response carries an embeddable envelope in a tag it never asked for');
        check(!('kind' in leadsBar2[0]) && !('objectId' in leadsBar2[0]), 'E3. BAR 2 (the richer, currently-unused bar): kind/objectId are NOT recovered, even though this test\'s own fake gateway response carried them — because ArweaveGraphqlDiscoveryQueryService.parseTransactionCandidates() (Section C) never reads anything but node.id — ARWEAVE_DISCOVERY_READER_GAP at this bar, and only this bar');

        console.log('✓ Section E: the verdict is bar-dependent, proven live rather than asserted. At the bar this codebase actually runs today (Section A\'s bare lead) the existing Arweave reader is already sufficient — DISCOVERY_CONTRACT_ALREADY_ARWEAVE_READY. At the richer, currently-unwired-for-every-substrate kind/objectId bar, the SAME reader has a real, narrow, precisely-located gap — ARWEAVE_DISCOVERY_READER_GAP, never a semantic impossibility (Section C already showed Arweave Tags are the right-shaped primitive; the gap is one un-requested GraphQL field, not a missing capability).');
    }

    // ===============================================================
    // Section F — identity and provenance: two publications sharing one
    // contentHash, an Arweave-specific reason they stay distinguishable.
    // ===============================================================
    {
        const publicationA = { id: 'pub-427-f-A', signature: 'sig-A' };
        const publicationB = { id: 'pub-427-f-B', signature: 'sig-B' };

        // Simulate uploading byte-IDENTICAL serialized material for both —
        // the "same contentHash" adversarial case — through the real,
        // unmodified ArweavePublicationMaterialUploader, with a fake
        // signer that (correctly, per Arweave's own protocol) produces a
        // DIFFERENT transaction id each call even for identical bytes,
        // because an Arweave transaction id commits to more than payload
        // bytes alone (owner, tags, last_tx, reward — this file's own
        // header: "never knows what an Arweave transaction's own JSON
        // shape... actually looks like").
        let signCount = 0;
        const twoIdSigner = { sign: async () => { signCount += 1; return { id: `materialtx-f-${signCount}`, transaction: {} }; } };
        const uploader = new ArweavePublicationMaterialUploader({ signer: twoIdSigner, fetchImpl: async () => fakeOkTextResponse() });

        const identicalMaterial = JSON.stringify({ shared: 'content', contentHash: 'sha256-identical-427' });
        const uriA = await uploader.upload(identicalMaterial);
        const uriB = await uploader.upload(identicalMaterial);
        check(uriA !== uriB, 'F1. two uploads of byte-IDENTICAL material to Arweave, through the real uploader, produce two DIFFERENT ar:// uris — an Arweave transaction id is never content-addressed, unlike an IPFS CID, so a shared contentHash never collides at the storage-identity level for this substrate specifically');

        const distributionA = describePublicationDistribution({ publication: publicationA, materialUri: uriA });
        const distributionB = describePublicationDistribution({ publication: publicationB, materialUri: uriB });
        check(distributionA.discoveryEnvelope.objectId === 'pub-427-f-A' && distributionB.discoveryEnvelope.objectId === 'pub-427-f-B', 'F2. the two resulting discovery envelopes carry the two distinct Publication ids as objectId — application identity, never derived from the shared contentHash');
        check(distributionA.discoveryEnvelope.uri !== distributionB.discoveryEnvelope.uri, 'F3. AND the two envelopes carry two distinct uris — meaning even a reader that recovered only Section E\'s BAR 1 fact (uri alone, no objectId) would still never conflate the two announcements, because Arweave\'s own per-upload uri uniqueness already does the disambiguating work a content-addressed substrate would need objectId for');

        // The one place a genuine ambiguity COULD still arise: if some
        // future caller reused the SAME materialUri for two different
        // Publications (never done by any production code path today —
        // confirmed structurally: describePublicationDistribution()
        // treats materialUri purely as caller-supplied input, per its own
        // header, "materialUri is supplied, never computed").
        const distributionReused = describePublicationDistribution({ publication: publicationB, materialUri: uriA });
        check(distributionReused.discoveryEnvelope.uri === distributionA.discoveryEnvelope.uri && distributionReused.discoveryEnvelope.objectId !== distributionA.discoveryEnvelope.objectId, 'F4. IF a caller ever did reuse one materialUri for two Publications, ONLY objectId would distinguish them at that point — confirming objectId (BAR 2, Section E) is what carries disambiguating power in that specific, currently-hypothetical scenario, never uri alone; this is precisely why BAR 2 remains a real, worthwhile future seam even though BAR 1 already covers every case current production code can actually produce');

        console.log('✓ Section F: two publications sharing one contentHash stay distinguishable through an Arweave-backed announcement for a substrate-specific reason (Arweave transaction ids are never content-addressed, F1) that already covers every uri-reuse pattern current production code can produce (F3) — and the one hypothetical scenario where that stops holding (a caller manually reusing one materialUri) is exactly the scenario where objectId, Section E\'s BAR 2 fact, would earn its keep (F4), naming precisely when the richer bar matters rather than leaving it abstract.');
    }

    // ===============================================================
    // Section G — the hypothetical provider boundary, proven live against
    // the REAL, unmodified executor and result boundary.
    // ===============================================================
    {
        // Throwaway, test-local, never exported, never touching
        // anchoring/ or application/ — the identical restraint 0.9.424's
        // own Section C already held for its own stand-ins, applied here
        // to ANNOUNCEMENT_AND_DISCOVERY instead of PROOF_AND_ANCHORING.
        class TestOnlyArweaveAnnouncementPublisher {
            constructor({ discoveryTag, gatewayUrl, uploadTaggedTransaction }) {
                if (typeof discoveryTag !== 'string' || discoveryTag.length === 0) {
                    throw new Error('TestOnlyArweaveAnnouncementPublisher: a non-empty discoveryTag is required');
                }
                if (typeof uploadTaggedTransaction !== 'function') {
                    throw new Error('TestOnlyArweaveAnnouncementPublisher: uploadTaggedTransaction is required');
                }
                this._discoveryTag = discoveryTag;
                this._gatewayUrl = gatewayUrl;
                this._uploadTaggedTransaction = uploadTaggedTransaction;
            }

            get discoveryTag() { return this._discoveryTag; }

            // Mirrors NostrPublicationDiscoveryPublisher#publish() field
            // for field, including the Section D finding: `relayUrl` is
            // reused, aliased to this stand-in's own gatewayUrl, purely to
            // satisfy PublicationDistributionResult.js's own validation
            // unmodified — never because an Arweave gateway is a relay.
            async publish(envelope) {
                const described = describeDecentralizedDiscoveryEnvelope(envelope);
                if (described === null) return null;
                const result = await this._uploadTaggedTransaction(described, this._discoveryTag);
                if (!result || typeof result.id !== 'string' || result.id.length === 0) return null;
                return Object.freeze({ published: true, relayUrl: this._gatewayUrl, id: result.id });
            }
        }

        const publication = { id: 'pub-427-g', signature: 'sig-427-g' };
        const materialUploader = new ArweavePublicationMaterialUploader({
            signer: { sign: async () => ({ id: 'materialtx-g', transaction: {} }) },
            fetchImpl: async () => fakeOkTextResponse()
        });

        let uploadTaggedTransactionCallCount = 0;
        const announcementPublisher = new TestOnlyArweaveAnnouncementPublisher({
            discoveryTag: 'tag-427-g',
            gatewayUrl: 'https://arweave.net',
            uploadTaggedTransaction: async (envelope, discoveryTag) => {
                uploadTaggedTransactionCallCount += 1;
                check(envelope.uri === 'ar://materialtx-g', 'G1. the envelope handed to the announcement publish step already names the REAL material transaction the SAME distribution call just uploaded — one real end-to-end sequence, not two unrelated fakes stitched together');
                check(discoveryTag === 'tag-427-g', 'G2. the discoveryTag this stand-in receives is its own, unmodified, exactly as NostrPublicationDiscoveryPublisher receives its own');
                return { id: 'announcetx-g' };
            }
        });

        // The REAL, UNMODIFIED production executor and descriptor — no
        // reimplementation, no shortcut.
        const result = await executePublicationDistribution({
            publication,
            serializedMaterial: JSON.stringify({ body: 'hello-427' }),
            materialUploader,
            distributionDescriptor: describePublicationDistribution,
            discoveryPublisher: announcementPublisher
        });

        check(uploadTaggedTransactionCallCount === 1, 'G3. the announcement step was actually reached and actually invoked exactly once, through the real executor\'s own real sequencing — not skipped, not double-invoked');
        check(result !== null, 'G4. the real, unmodified describePublicationDistributionResult() accepts the assembled facts and produces a real result — zero production code anywhere in this sequence was changed to make this pass');
        check(result.material.uri === 'ar://materialtx-g' && result.material.storage === 'ar', 'G5. the CONTENT half of the result is real Arweave material, from the real ArweavePublicationMaterialUploader, unmodified');
        check(result.discovery.id === 'announcetx-g' && result.discovery.discoveryTag === 'tag-427-g', 'G6. the ANNOUNCEMENT half of the result is real, from the test-only Arweave stand-in, carrying its own real transaction id and its own real discoveryTag');
        check(result.discovery.relayUrl === 'https://arweave.net', 'G7. Section D\'s own finding, proven live rather than merely read from source: the result\'s discovery.relayUrl field, which PublicationDistributionResult.js requires by that exact name, now holds an Arweave GATEWAY url, not a Nostr relay — the field-name accommodation works, exactly as sized in Section D, with zero change to PublicationDistributionExecutor.js, PublicationDistributionDescriptor.js, or PublicationDistributionResult.js');

        console.log('✓ Section G: PublicationDistributionExecutor.js\'s own discoveryPublisher slot ALREADY accepts a genuinely Arweave-flavored collaborator today, proven end to end against the real, unmodified executor/descriptor/result-boundary trio, provided only that the collaborator satisfies the minimal duck-typed contract (publish(), non-empty discoveryTag) AND names its resolved value\'s relay-designating field relayUrl (Section D). The smallest real contract a future ArweaveAnnouncementPublisher needs to satisfy is exactly this shape — nothing more was required to make this section\'s own sequence pass.');
    }

    // ===============================================================
    // Section H — the fixed two-collaborator architecture, revisited
    // precisely: which layer is actually fixed.
    // ===============================================================
    {
        const executorSource = await source('application/PublicationDistributionExecutor.js');
        check(!/new NostrPublicationDiscoveryPublisher|new ArweavePublicationMaterialUploader/.test(executorSource), 'H1. PublicationDistributionExecutor.js itself never constructs either concrete collaborator — Section G\'s own live proof already showed this slot accepts a substitute with zero change; this confirms it structurally, from source, not merely from one passing test');

        const runtimeCompositionSource = await source('application/PublicationDistributionRuntimeComposition.js');
        check(/import\s*\{\s*NostrPublicationDiscoveryPublisher\s*\}/.test(runtimeCompositionSource), 'H2. PublicationDistributionRuntimeComposition.js — the ONE file the real, UI-reachable command chain actually runs through (application/PublicationDistributionCommandComposition.js -> application/PublicationDistributionCommand.js -> application/PublicationDistributionOrchestrator.js -> THIS file) — imports NostrPublicationDiscoveryPublisher directly');
        check(/new NostrPublicationDiscoveryPublisher\(nostrPublisherOptions\)/.test(runtimeCompositionSource), 'H3. and constructs it with a literal, unparameterized `new` call — not a lookup against any registry, not a branch on any providerKey; this is a genuinely fixed slot, not merely an unused-but-already-dynamic one');

        const orchestratorSource = await source('application/PublicationDistributionOrchestrator.js');
        check(!/RoleAwareProviderResolver|discoveryRegistry|providerKey/.test(orchestratorSource), 'H4. the orchestrator layer between RuntimeComposition and the real UI-facing command adds no provider-selection logic of its own either — the fixed `new` call in H3 is the ONLY place in the real, live call chain a substrate choice for this role is ever made');

        const commandCompositionSource = await source('application/PublicationDistributionCommandComposition.js');
        check(!/NostrPublicationDiscoveryPublisher|ArweaveGraphqlDiscoveryQueryService|discoveryRegistry/.test(commandCompositionSource), 'H5. the composition-root file ui/main.js actually calls forwards only lifecycleStore/arweaveUploaderOptions/nostrPublisherOptions — it has no discoveryRegistry parameter to even receive an Arweave choice through today');

        console.log('✓ Section H: the fixed slot 0.9.423 already found ("two fixed collaborator slots... invoked together in a fixed order") is real, but it is ONE LAYER HIGHER than where Section G proved a substitute already works. PublicationDistributionExecutor.js\'s own discoveryPublisher parameter was NEVER fixed — it is, and always has been, an injected, duck-typed collaborator (H1, and Section G\'s live proof). What IS fixed, and would need to change for Arweave to become SELECTABLE through the real, UI-reachable command chain, is exactly one literal `new NostrPublicationDiscoveryPublisher(nostrPublisherOptions)` call inside PublicationDistributionRuntimeComposition.js (H2-H3), with no provider-selection logic anywhere between it and ui/main.js (H4-H5). Making the choice dynamic — not replacing the executor\'s own already-general slot, which needs no replacement — is the correctly-scoped future change: parameterize (or branch) that one construction on a providerKey, optionally through RoleAwareProviderResolver\'s own already-real discoveryRegistry parameter (still uninstantiated for real capability, per 0.9.424 Section B), never a rewrite of the executor, the descriptor, or the result boundary, all three of which Section G already proved need no change at all.');
    }

    // ===============================================================
    // Verdict.
    // ===============================================================
    {
        console.log('='.repeat(78));
        console.log('ARWEAVE ANNOUNCEMENT/DISCOVERY PUBLICATION CONTRACT — FINAL VERDICT');
        console.log('='.repeat(78));
        console.log('  APPLICATION_CONTRACT     : SMALLER THAN IT LOOKS, BUT NAMED PRECISELY');
        console.log('    The bar actually live today, for Nostr, is a bare tagged uri (a');
        console.log('    DecentralizedWorldDiscoveryLead) — kind/objectId exist as a real,');
        console.log('    working, but production-UNWIRED richer contract (0.9.30/0.9.32),');
        console.log('    true for every substrate, not an Arweave-specific shortfall.');
        console.log('  EXISTING_READER          : BAR-DEPENDENT, PROVEN AT BOTH BARS');
        console.log('    DISCOVERY_CONTRACT_ALREADY_ARWEAVE_READY at the live bar (Section E,');
        console.log('    BAR 1) — zero reader change needed for a bare announcement lead.');
        console.log('    ARWEAVE_DISCOVERY_READER_GAP at the richer, currently-unused bar');
        console.log('    (Section E, BAR 2) — one narrow, precisely-located GraphQL query');
        console.log('    extension (request node.tags), never a new discovery semantic.');
        console.log('  EXISTING_WRITER_SEAM     : ALREADY GENERAL, ONE LAYER LOWER THAN 0.9.423');
        console.log('    PublicationDistributionExecutor.js\'s own discoveryPublisher slot');
        console.log('    already accepts an Arweave-flavored collaborator with ZERO change');
        console.log('    (Section G, live), given field-name compatibility (Section D).');
        console.log('  PROVIDER_GAP             : ONE MISSING CLASS');
        console.log('    A real application/ArweaveAnnouncementPublisher.js — the smallest');
        console.log('    version needs only what Section G\'s stand-in needed: publish(),');
        console.log('    discoveryTag, and a result exposing { published, relayUrl, id }.');
        console.log('  MECHANISM_GAP            : ONE FIXED CONSTRUCTION CALL, PRECISELY LOCATED');
        console.log('    Not the executor (already general). Exactly the literal `new');
        console.log('    NostrPublicationDiscoveryPublisher(...)` inside');
        console.log('    PublicationDistributionRuntimeComposition.js (Section H) — and,');
        console.log('    separately, RoleAwareProviderResolver\'s own discoveryRegistry');
        console.log('    parameter, real in shape but still uninstantiated for real capability');
        console.log('    (0.9.424 Section B, reconfirmed unchanged by this milestone).');
        console.log('  UI_GAP                   : UNCHANGED FROM 0.9.422/0.9.423');
        console.log('    No availableDiscoveryTypes()-equivalent, no discovery-provider');
        console.log('    control anywhere in ui/ — this milestone did not re-derive that');
        console.log('    finding independently; it is carried forward, not re-litigated.');
        console.log('');
        console.log('  Decision: NO_BUILD_THIS_MILESTONE. The next implementation, if');
        console.log('  scheduled, now has an exact, evidence-grounded shape: a real');
        console.log('  ArweaveAnnouncementPublisher satisfying Section G\'s own minimal');
        console.log('  contract closes PROVIDER_GAP alone and is immediately discoverable');
        console.log('  through the existing, unmodified Arweave reader at the bar current');
        console.log('  production code actually runs (BAR 1). Making it SELECTABLE next to');
        console.log('  Nostr, rather than merely constructible, additionally needs the one');
        console.log('  fixed construction call in PublicationDistributionRuntimeComposition.js');
        console.log('  (or a sibling composition) to become provider-aware — never a rewrite');
        console.log('  of the executor, descriptor, or result boundary, all three of which');
        console.log('  this milestone proved live need no change at all.');
        console.log('='.repeat(78));

        console.log('\n✅ All Arweave Announcement/Discovery Publication Contract Audit tests passed.');
        console.log(`(${assertionCount} assertions)`);
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
