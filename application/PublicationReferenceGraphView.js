import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { describePublicationReferenceRecordHistory } from './PublicationReferenceRecordHistoryView.js';

// 0.8.105 — Publication Reference Graph Projection.
//
// 0.8.104 gave this codebase its first durable fact ABOUT TWO
// PUBLICATIONS TOGETHER — `PublicationReferenceRecord`'s own
// `{ sourcePublicationIdentity, referencedPublicationIdentity, createdAt }`
// — and deliberately stopped there: an append-only list, narrated in
// insertion order, with no grouping, no per-publication view, and no
// count beyond the flat total. This file is the projection that was
// always left for later:
//
//   Publication Reference Records (0.8.104), append-only, oldest first
//         │
//         │  describePublicationReferenceRecordHistory()   (0.8.104, UNCHANGED)
//         ▼
//   Publication Reference Graph (0.8.105)
//     { edgeCount, edges,
//       distinctSourcePublicationCount, distinctReferencedPublicationCount,
//       nodes: [ { identity, outgoingReferences, outgoingReferenceCount,
//                  incomingReferences, incomingReferenceCount }, ... ] }
//
// A RECONSTRUCTION, NEVER A NEW DURABLE COLLECTION — the identical
// restraint application/AchievementBadgeView.js's own header already held
// one layer up (0.8.103). `application/PublicationObservationArchive.js`
// gains nothing from this milestone: no tenth collection, no
// `SCHEMA_VERSION` bump, no new `appendXxx()` method, no cached graph, no
// mutable node, no network call. This file recomputes the graph fresh,
// every time, from `publicationReferenceRecords` the archive already
// holds — calling it twice with a byte-identical archive returns a
// byte-identical result.
//
// TWO A -> B REFERENCES STAY TWO EDGES — NEVER SILENTLY COLLAPSED INTO
// ONE. Exactly as application/PublicationReferenceRecordHistory.js's own
// header already established ("Reference Count And Distinct Referencing
// Publisher Count Are Two Different Facts, Deliberately Never Merged"),
// `edges` below carries every `PublicationReferenceRecord` this archive
// holds, one entry per record, in the exact order
// `describePublicationReferenceRecordHistory()` (0.8.104, called here
// UNCHANGED — never a second, competing edge narration) already returns
// them — oldest first, never sorted, grouped, or deduplicated. A
// publication's own `outgoingReferences`/`incomingReferences` below are
// built by grouping that SAME edge list, so a publication referencing
// another three times shows three entries in `outgoingReferences`, never
// one.
//
// NODE IDENTITY IS `blockchain` + `chainReference` — NEVER `contentHash`,
// THE ONE RULE THIS FILE HOLDS AS STRICTLY AS 0.8.104 ITSELF DID. A
// publication node is looked up and grouped by
// `BlockchainPublicationIdentity#sameAs()`'s (0.8.89) own two fields,
// never by resemblance. Internally, nodes are grouped by the string key
// `${blockchain}:${chainReference}` — the identical shorthand
// `ui/views/DecentralizedPublicationsView.js`'s own
// `knownPublicationIdentityOptions()` (0.8.104) already uses for the same
// two fields, and provably equivalent to `sameAs()` here: `blockchain` is
// always one of the closed `BlockchainKind` values (application/
// BlockchainKind.js), none of which can ever contain the `:` separator,
// so no two distinct `(blockchain, chainReference)` pairs can ever
// collide onto the same key. Two publications sharing an identical
// `contentHash` — on the same chain or across chains — remain two
// entirely separate nodes here, exactly as they already are everywhere
// else in this codebase.
//
// `distinctSourcePublicationCount`/`distinctReferencedPublicationCount`
// ARE GRAPH-SHAPE FACTS, NOT THE EXCLUDED PER-PUBLICATION REDUCTION.
// application/PublicationReferenceRecordHistory.js's own header names a
// distinct-REFERENCING-PUBLISHER count — "how many different publications
// reference THIS ONE publication" — as real, separately sized future work
// it deliberately does not build. This file builds something narrower and
// already-in-scope for a graph projection: how many DISTINCT publications
// appear as a source (or as a referenced target) ANYWHERE in the graph —
// a count over `nodes`, not a per-publication achievement threshold. It
// answers "how large is this graph," never "how popular is this
// publication" — the achievement-shaped reduction 0.8.104 named stays
// real, separate, future work.
//
// `nodes` IS ORDERED BY FIRST APPEARANCE IN `edges` — NEVER BY REFERENCE
// COUNT, NEVER ALPHABETICALLY, NEVER "MOST REFERENCED FIRST." Sorting
// nodes by their own `incomingReferenceCount` would silently manufacture
// a ranking this milestone exists to avoid — see docs/Principles.md, "The
// UI Displays Observations; It Does Not Turn Them Into A Verdict
// (0.8.57)." Node order is therefore exactly the order each publication
// identity is first seen while walking `edges` oldest first — fully
// deterministic for a given archive, and carrying no meaning beyond
// "which publication this replica happened to observe a reference
// touching first."
//
// NO VERDICT, NO WEIGHT, NO SCORE, NO RANK. This file carries no
// `weight`, `strength`, `popularity`, `influence`, `score`, or `rank`
// field anywhere in its output — a reference graph is inspectable, not
// evaluative. "Publication B has 7 incoming references" is a fact this
// file states plainly; it is never dressed up as "Publication B is
// better." See application/PublicationReferenceRecord.js's own header,
// held here once more, one layer up over the graph those records form.
//
// PURE AND STATELESS: NO ARCHIVE ACCESS OF ITS OWN, NO NETWORK ACCESS.
// `describePublicationReferenceGraph()` receives a plain array of
// already-constructed `PublicationReferenceRecord` instances and projects
// them; `reconstructPublicationReferenceGraph()` below is the ONE, thin,
// separate function in this file that reads an archive — mirroring
// application/AchievementBadgeView.js's own
// `reconstructAchievementBadges()` exactly.

// The one, local key this file uses to group nodes — never exported, and
// never treated as an identity of its own. A caller outside this file has
// no reason to build or compare this string directly; every public
// surface below exchanges genuine `BlockchainPublicationIdentity`
// instances, never this key.
function identityKey(identity) {
    return `${identity.blockchain}:${identity.chainReference}`;
}

function nodeBucket(nodesByKey, identity) {
    const key = identityKey(identity);
    let bucket = nodesByKey.get(key);
    if (!bucket) {
        bucket = { identity, outgoingReferences: [], incomingReferences: [] };
        nodesByKey.set(key, bucket);
    }
    return bucket;
}

// The pure computation. Receives the archive's own raw
// `publicationReferenceRecords` array — the identical shape
// `describePublicationReferenceRecordHistory()` itself accepts — and
// returns `{ edgeCount, edges, distinctSourcePublicationCount,
// distinctReferencedPublicationCount, nodes }`. Malformed or absent input
// behaves exactly as `describePublicationReferenceRecordHistory()` itself
// already does: never throws, simply produces an empty graph.
export function describePublicationReferenceGraph(publicationReferenceRecords = []) {
    const history = describePublicationReferenceRecordHistory(publicationReferenceRecords);
    const edges = history.records;

    const nodesByKey = new Map();
    edges.forEach((edge) => {
        nodeBucket(nodesByKey, edge.sourcePublicationIdentity).outgoingReferences.push(edge);
        nodeBucket(nodesByKey, edge.referencedPublicationIdentity).incomingReferences.push(edge);
    });

    const nodes = Array.from(nodesByKey.values()).map((bucket) => Object.freeze({
        identity: bucket.identity,
        outgoingReferences: Object.freeze(bucket.outgoingReferences),
        outgoingReferenceCount: bucket.outgoingReferences.length,
        incomingReferences: Object.freeze(bucket.incomingReferences),
        incomingReferenceCount: bucket.incomingReferences.length
    }));

    const distinctSourcePublicationCount = nodes.filter((node) => node.outgoingReferenceCount > 0).length;
    const distinctReferencedPublicationCount = nodes.filter((node) => node.incomingReferenceCount > 0).length;

    return Object.freeze({
        edgeCount: history.count,
        edges,
        distinctSourcePublicationCount,
        distinctReferencedPublicationCount,
        nodes: Object.freeze(nodes)
    });
}

// reconstructPublicationReferenceGraph() — the ONE, thin, archive-reading
// entry point, mirroring application/AchievementBadgeView.js's own
// `reconstructAchievementBadges()` exactly. An invalid/missing archive is
// treated as `PublicationObservationArchive.empty()` — an empty graph,
// never an error.
export function reconstructPublicationReferenceGraph(archive) {
    const safeArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();
    return describePublicationReferenceGraph(safeArchive.publicationReferenceRecords);
}

// Convenience lookup over an already-computed graph's own `nodes` —
// returns the exact node for `identity` via `sameAs()` (0.8.89), or
// `null` when this graph holds no edge touching that publication at all.
// Never a second, competing grouping; it only searches what
// `describePublicationReferenceGraph()`/`reconstructPublicationReferenceGraph()`
// already built.
export function findPublicationReferenceGraphNode(graph, identity) {
    if (!graph || !Array.isArray(graph.nodes)) return null;
    if (!identity || typeof identity.sameAs !== 'function') return null;
    return graph.nodes.find((node) => node.identity.sameAs(identity)) || null;
}
