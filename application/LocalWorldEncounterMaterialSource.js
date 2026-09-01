import { WorldEncounterMaterialSource } from './WorldEncounterMaterialLoading.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { AvatarProfile } from '../core/AvatarProfile.js';

// 0.9.22 — Local World Encounter Material Loader.
//
// 0.9.21 named the seam and refused to cross it: `materialSources.local`
// was an injection point with nothing real ever plugged into it. This
// file is the first real thing plugged into it — a concrete
// `WorldEncounterMaterialSource` that answers "given a resolved,
// local-origin selection, what does ForkBuild's own local storage
// actually hold for it?"
//
//   { kind, objectId, origin: 'local' }
//                │
//                ▼
//   application/WorldEncounterMaterialLoading.js   (0.9.21, unmodified)
//        loadWorldEncounterMaterial()
//                │
//                ▼
//   application/LocalWorldEncounterMaterialSource.js   ★ (THIS milestone)
//        LocalWorldEncounterMaterialSource#load()
//                │
//       kind === PUBLICATION        kind === AVATAR
//                │                          │
//                ▼                          ▼
//   discovery/LocalDiscoveryProvider   a scan over StorageProvider#list()
//        .findById(objectId)           for 'avatar-profile:*' entries
//        (already-existing repository)  (0.9.19's own storage KEY
//                │                       convention, already established
//                │                       by application/
//                │                       AvatarProfileUseCase.js)
//                ▼                          ▼
//           Publication                 AvatarProfile
//        (or null — not found)       (or null — not found)
//
// NO NEW REPOSITORY, NO NEW STORAGE KEY, NO NEW REPRESENTATION. Per the
// task's own framing, this file does not invent a way to store or shape
// local material — it reuses exactly what already exists.
//
// - Publication material is retrieved through `discovery/
//   LocalDiscoveryProvider.js`'s own `findById()` — the same repository
//   `ui/views/RepositoryView.js` and every other publication-discovery
//   call site in this codebase already depends on. This file constructs
//   its own `LocalDiscoveryProvider` from the `storageProvider` it is
//   given, exactly the way `LocalPublisherProvider` constructs its own
//   `LocalContentStore`, rather than re-deriving `LocalDiscoveryProvider`'s
//   own `forkbuild-publications` scan logic a second time here.
// - Avatar material is retrieved by scanning `storageProvider.list()` for
//   names that start with `'avatar-profile:'` — the exact storage key
//   prefix `application/AvatarProfileUseCase.js` already established
//   (`STORAGE_KEY_PREFIX = 'avatar-profile:'`, one profile per owning
//   username) — and comparing each stored record's own `avatarId` against
//   the resolved selection's `objectId`. No new store, no new key scheme:
//   `AvatarProfileUseCase` itself has no "find by avatarId" method (it
//   only ever looks up the CURRENT user's own profile, by owner username),
//   so this is the minimal, generic use of `StorageProvider#list()` — a
//   method every `StorageProvider` already implements — needed to answer
//   a question that repository was never asked before. This is exactly
//   why the task's own framing hedged avatar loading with "if the
//   existing local model supports it": it supports exactly this much,
//   and no more — a `WorldEncounterKind.AVATAR` selection whose
//   `objectId` never appeared in this device's own local storage (a
//   remote Wanderer encountered only through presence, never logged in
//   here) resolves to `null`/`UNAVAILABLE`, never a thrown error and
//   never a guess.
//
// THE ACTUAL MATERIAL, NEVER THE DISCOVERY SUMMARY. `core/WorldEncounter.js`'s
// own `describeEncounterablePublication()`/`describeEncounterableAvatar()`
// intentionally expose only enough to discover and display an encounter —
// `title`/`isSigned`/`position` for a publication, `displayName`/`position`
// for an avatar. This file never re-derives or re-shapes that summary; it
// returns the full underlying `Publication`/`AvatarProfile` domain object
// ForkBuild already regards as that thing's actual material — the exact
// same object `LocalDiscoveryProvider#findById()` and
// `AvatarProfileUseCase#getProfile()` already hand out elsewhere in this
// codebase, never a newly-invented shape assembled just for this file.
//
// `objectId` IS THE ONLY THING THIS FILE MATCHES ON. A publication is
// found by `Publication.id`, an avatar by `AvatarProfile.avatarId` —
// never by title, displayName, position, or any other field a discovery
// record happens to also carry.
//
// NO SIGNATURE VERIFICATION, NO TRUST DECISION. A `Publication` this file
// returns may carry a `signature` field (see `publisher/Publication.js`)
// exactly as it was persisted — this file never reads it, never calls
// anything that verifies it, and never decides whether it is trustworthy.
// Retrieval is this file's entire job; verification is explicitly later,
// unscheduled work.
//
// NO CACHING, NO RETRY, NO FALLBACK, NO DEDUPLICATION, NO RANKING. Every
// call to `load()` re-reads `storageProvider` fresh. A publication miss
// never falls back to scanning avatar profiles or vice versa; a `kind`
// outside `WorldEncounterKind` resolves to `null` without guessing which
// repository might have meant. Two records that happen to share an
// `avatarId` (a local storage anomaly this file never expects, but never
// crashes on either) resolve to whichever one `storageProvider.list()`
// happens to enumerate first — this file makes no attempt to reconcile,
// prefer, or notice a collision.
//
// `null`/`undefined` ON A MISS, NEVER A THROW. Exactly the "not currently
// available" contract `WorldEncounterMaterialSource.load()` (0.9.21)
// already documents, and the same contract `content/
// IpfsGatewayContentStore.js` already holds one layer down. A malformed
// `resolvedSelection` (missing `objectId`, a `kind` outside
// `WorldEncounterKind`) degrades to `null` here too, exactly like a
// genuine miss — this file never throws for bad input, only for a
// genuinely broken `storageProvider` (the same posture every other local
// repository in this codebase already takes).
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **`origin === 'peer:...'` routing, any peer transport, WebRTC, or
//   WebSocket of any kind.** Separate, later, unscheduled work (0.9.23).
// - **Signature verification or any trust decision.** See "No signature
//   verification," above — separate, later, unscheduled work (0.9.24+).
// - **Caching, retrying, deduplication, or ranking.** See "No caching,"
//   above.
// - **Any change to `application/WorldEncounterMaterialLoading.js`
//   (0.9.21) or to `ui/components/WorldEncounterCanvas.js`.** This file
//   is only ever plugged in as `materialSources.local` by a future,
//   unscheduled composition-root wiring milestone.
// - **A new storage key, a new repository class, or a new persisted
//   representation of a publication or an avatar.** See "No new
//   repository," above.

const AVATAR_PROFILE_STORAGE_KEY_PREFIX = 'avatar-profile:';

export class LocalWorldEncounterMaterialSource extends WorldEncounterMaterialSource {
    constructor(storageProvider) {
        super();
        this._storageProvider = storageProvider;
        this._discoveryProvider = new LocalDiscoveryProvider(storageProvider);
    }

    // Returns a Promise resolving to the local `Publication`/`AvatarProfile`
    // named by `resolvedSelection`, or to `null` when this device's own
    // local storage does not currently hold it. See this file's own header
    // for exactly how each kind is retrieved.
    async load(resolvedSelection) {
        const { kind, objectId } = resolvedSelection && typeof resolvedSelection === 'object' ? resolvedSelection : {};
        if (typeof objectId !== 'string' || objectId.length === 0) {
            return null;
        }
        if (kind === WorldEncounterKind.PUBLICATION) {
            return this._loadPublication(objectId);
        }
        if (kind === WorldEncounterKind.AVATAR) {
            return this._loadAvatarProfile(objectId);
        }
        return null;
    }

    _loadPublication(publicationId) {
        return this._discoveryProvider.findById(publicationId);
    }

    _loadAvatarProfile(avatarId) {
        const names = typeof this._storageProvider.list === 'function' ? this._storageProvider.list() : [];
        const nameList = Array.isArray(names) ? names : [];
        for (const name of nameList) {
            if (typeof name !== 'string' || !name.startsWith(AVATAR_PROFILE_STORAGE_KEY_PREFIX)) {
                continue;
            }
            const stored = this._storageProvider.load(name);
            if (stored && stored.avatarId === avatarId) {
                return AvatarProfile.fromJSON(stored);
            }
        }
        return null;
    }
}
