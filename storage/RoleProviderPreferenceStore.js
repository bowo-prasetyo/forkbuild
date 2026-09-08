import { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { RoleProviderRole, isValidRoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference, isValidRoleProviderKey } from '../core/RoleProviderPreference.js';

const ROLE_PROVIDER_PREFERENCE_STORE_KEY = 'role-provider-preference:by-role';

// 0.9.294 — Decentralized Role Provider Preference Persistence Boundary.
//
// 0.9.293 deliberately left `RoleProviderPreference` unconsumed — "a real,
// well-formed statement of what a user wants," constructible, comparable,
// and serializable, but with no caller anywhere and no storage key of any
// kind (see core/RoleProviderPreference.js's own header, "No persistence").
// This file is the direct, named answer to that restraint, and only that:
// the seam that lets a `RoleProviderPreference` survive an application
// restart, without making it operational.
//
//   core/RoleProviderRole.js          (0.9.293, unmodified)
//   core/RoleProviderPreference.js    (0.9.293, unmodified)
//                    │
//                    │   toJSON() / fromJSON() — the same plain-data
//                    │   convenience every value object in this codebase
//                    │   already carries
//                    ▼
//   storage/RoleProviderPreferenceStore.js   ★ (THIS)
//        save(preference) / get(role) / loadAll()
//                    │
//                    ▼
//   storage/StorageProvider.js        (generic, JSON-safe, injected —
//        defaults to storage/LocalStorageProvider.js, the identical seam
//        storage/PublicationCommentaryStore.js already established)
//
//   (unscheduled) a future Role-Aware Provider Resolver reads a saved
//   preference's `providerKey` back out of THIS store and looks it up in
//   a THEN-existing per-role registry — this file does not build that
//   resolver, and does not need it to exist to be meaningful on its own,
//   the identical restraint 0.9.293's own header held one layer up.
//
// PERSISTS BY ROLE, NEVER BY PROVIDER. Storage holds ONE flat object,
// `{ [role]: providerKey }` — `role` is the map key, so "at most one
// persisted preference per role" is a structural invariant of the storage
// shape itself, never a rule this class has to separately enforce by
// scanning for duplicates. Saving `CONTENT → arweave` after `CONTENT →
// ipfs` REPLACES the one entry under the `CONTENT` key; it can never
// leave two Content entries behind, and it never touches the entries
// under `ANNOUNCEMENT_AND_DISCOVERY` or `PROOF_AND_ANCHORING` at all —
// see this file's own tests, Sections C/D. This is deliberately unlike
// storage/PublicationCommentaryStore.js's own append-only, id-keyed
// history (a `commentaryId` collision there is a conflict to reject,
// because a commentary is a historical fact); a role provider preference
// is current user CONFIGURATION, so replacement is the correct semantic,
// exactly as this milestone's own brief names it.
//
// MALFORMED DATA DEGRADES; A GENUINE STORAGE FAILURE PROPAGATES — these
// are deliberately NOT the same handling, which is the one place this
// file departs from storage/PublicationCommentaryStore.js's own
// precedent (that class's `_loadCollection()` catches every error its
// injected provider's `load()` can throw, including a truly broken
// provider, and degrades all of them to an empty collection alike). That
// blurs a question this milestone's own brief asks to keep separate: "the
// bytes on file don't describe a valid preference" is not the same fact
// as "the storage layer itself is failing," and a caller deciding whether
// to retry, surface an error, or fall back to defaults needs to tell
// them apart. So here:
//   - a persisted value that isn't a plain object (wrong shape entirely),
//     or a per-role entry whose `providerKey` fails
//     `isValidRoleProviderKey()`, or names a role outside the frozen
//     `RoleProviderRole` vocabulary — all DEGRADE, silently, to "absent
//     for that role" (get() returns null; loadAll() omits it) — see
//     Section F below.
//   - the injected `StorageProvider`'s own `load()`/`save()` THROWING —
//     a real backend failure (quota exceeded, a broken adapter, corrupted
//     bytes the provider itself cannot parse) — is never caught here at
//     all, and propagates straight out of `save()`/`get()`/`loadAll()` to
//     the caller, exactly like application/
//     LocalPublicationSnapshotPlacementStore.js's own `_loadAll()` already
//     lets a throwing provider propagate unmodified — see Section G.
//
// PROVIDER-OPAQUE, BY DESIGN, NOT BY OVERSIGHT. This class never imports
// content/, anchoring/, discovery/, nostr/, arweave/, or base/, never
// asks whether a `providerKey` can actually satisfy its `role`, never
// consults any provider registry, and never resolves a `providerKey` into
// a concrete provider — the same four restraints core/
// RoleProviderPreference.js's own header already names, carried forward
// unweakened. It happily persists `PROOF_AND_ANCHORING → base` even
// though 0.9.292 Section B found Base's own verify half incomplete — see
// Section H below, the regression guard proving persistence never
// secretly becomes capability resolution.
//
// "NO PREFERENCE CONFIGURED" IS NEVER "PREFER PROVIDER X." `get(role)`
// returns `null` — never another role's preference, never a made-up
// default — when nothing has been saved for that role yet. There is no
// fallback of any kind inside this class; see Section I below.
export class RoleProviderPreferenceStore {
    constructor(storageProvider = new LocalStorageProvider()) {
        if (!(storageProvider instanceof StorageProvider)) {
            throw new Error('RoleProviderPreferenceStore requires a StorageProvider');
        }
        this._storageProvider = storageProvider;
    }

    // Persists `preference` (a RoleProviderPreference instance — this
    // method performs no duck-typing and constructs nothing of its own
    // from a plain object), replacing whatever was previously on file for
    // `preference.role` and leaving every other role's own entry
    // untouched. Returns nothing; the write either lands or the injected
    // provider's own `save()` throws (see this file's own header,
    // "a genuine storage failure propagates").
    save(preference) {
        if (!(preference instanceof RoleProviderPreference)) {
            throw new Error('RoleProviderPreferenceStore.save() requires a RoleProviderPreference instance');
        }
        const byRole = this._loadMap();
        byRole[preference.role] = preference.providerKey;
        this._storageProvider.save(ROLE_PROVIDER_PREFERENCE_STORE_KEY, byRole);
    }

    // The RoleProviderPreference on file for `role`, re-hydrated through
    // core/RoleProviderPreference.js's own constructor — never a plain
    // object, and never a record this class re-validates by any rule of
    // its own beyond what that constructor already enforces. Returns
    // `null` when nothing is on file for `role`, OR when what's on file
    // for `role` is malformed (see this file's own header) — both cases
    // are indistinguishable to a caller, deliberately: "absent" and
    // "unreadable" both mean this store has no valid preference to hand
    // back for that role right now.
    get(role) {
        if (!isValidRoleProviderRole(role)) {
            throw new Error(`RoleProviderPreferenceStore.get(): unknown role "${role}"`);
        }
        const byRole = this._loadMap();
        const providerKey = byRole[role];
        if (!isValidRoleProviderKey(providerKey)) {
            return null;
        }
        return new RoleProviderPreference({ role, providerKey });
    }

    // Every RoleProviderPreference currently on file, one per role that
    // has a valid entry, in `RoleProviderRole`'s own fixed declaration
    // order (Discovery, Content, Proof) — never the raw storage object's
    // own key order, which JSON round-tripping never guarantees. A role
    // with no entry, or a malformed one, is simply omitted — never `null`
    // padding, and never a thrown error.
    loadAll() {
        const byRole = this._loadMap();
        const preferences = [];
        for (const role of Object.values(RoleProviderRole)) {
            const providerKey = byRole[role];
            if (isValidRoleProviderKey(providerKey)) {
                preferences.push(new RoleProviderPreference({ role, providerKey }));
            }
        }
        return preferences;
    }

    // Reads the full persisted `{ [role]: providerKey }` map. A payload
    // that isn't a plain object at all (missing, `null`, an array, a
    // string, ...) degrades to `{}` — an empty, freshly-allocated object,
    // never the caller's own storage-backed reference, so mutating it in
    // `save()` can never reach back into whatever the injected provider
    // itself holds. Never catches an error the injected provider's own
    // `load()` throws — see this file's own header, "a genuine storage
    // failure propagates."
    _loadMap() {
        const raw = this._storageProvider.load(ROLE_PROVIDER_PREFERENCE_STORE_KEY);
        if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
            return {};
        }
        return { ...raw };
    }
}
