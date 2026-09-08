import { readFile } from 'node:fs/promises';

import { RoleProviderRole, isValidRoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference, isValidRoleProviderKey } from '../core/RoleProviderPreference.js';

// 0.9.293 — Decentralized Role Provider Preference Boundary.
// See docs/Roadmap.md, "0.9.293 — Decentralized Role Provider Preference
// Boundary," and tests/DecentralizedSubstrateCapabilityMatrixAudit.test.js
// (0.9.292), the audit this milestone directly answers.
//
// Section A: role identity — the three roles, frozen, distinguishable,
//            promoted from 0.9.292's own audit-local constants
// Section B: provider key identity — an opaque, self-describing string,
//            never a provider, never validated against any real roster
// Section C: same provider, different roles — three distinct preferences
// Section D: same role, different providers — two distinct preferences
// Section E: immutability — withProviderKey() never mutates, role is
//            never mutable at all
// Section F: invalid role — rejected
// Section G: invalid provider key — rejected
// Section H: no provider imports — architecture sweep of the boundary's
//            own two source files
// Section I: no runtime resolution — construction never instantiates,
//            imports, or looks up a provider
// Section J: no fallback — a preference names exactly one providerKey,
//            with no second/backup slot of any kind
// Section K: no UI dependency — usable with zero browser/DOM globals
// Section L: independent role configuration — a full Discovery/Content/
//            Proof set never collapses into one flat selection
// Section M: nothing in production consumes this yet — the boundary is
//            deliberately unwired, exactly like the milestone brief asks

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {
    // ===============================================================
    // Section A — role identity.
    // ===============================================================
    {
        assert(Object.keys(RoleProviderRole).length === 3, 'A1. exactly three roles — never a fourth, never a merged "network" role');
        assert(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY === 'ANNOUNCEMENT_AND_DISCOVERY', 'A2. ANNOUNCEMENT_AND_DISCOVERY, exactly 0.9.292\'s own audit-local name');
        assert(RoleProviderRole.CONTENT === 'CONTENT', 'A3. CONTENT, exactly 0.9.292\'s own audit-local name');
        assert(RoleProviderRole.PROOF_AND_ANCHORING === 'PROOF_AND_ANCHORING', 'A4. PROOF_AND_ANCHORING, exactly 0.9.292\'s own audit-local name');
        assert(Object.isFrozen(RoleProviderRole), 'A5. the vocabulary itself is frozen — no caller can add a fourth role at runtime');
        assert(isValidRoleProviderRole(RoleProviderRole.CONTENT), 'A6. isValidRoleProviderRole() accepts every real role');
        assert(!isValidRoleProviderRole('NETWORK'), 'A7. "NETWORK" is not a role — the exact noun the milestone brief rejected by name');
        assert(!isValidRoleProviderRole('content'), 'A8. lowercase is not a role — the vocabulary is case-sensitive, never normalized');
        console.log('✓ Section A: three roles, frozen, distinguishable, promoted from 0.9.292\'s own audit-local constants');
    }

    // ===============================================================
    // Section B — provider key identity: opaque, self-describing,
    // never validated against any real provider's roster.
    // ===============================================================
    {
        assert(isValidRoleProviderKey('ipfs'), 'B1. "ipfs" — a real provider key — is valid shape');
        assert(isValidRoleProviderKey('arweave'), 'B2. "arweave" is valid shape');
        assert(isValidRoleProviderKey('bitcoin-op-return'), 'B3. "bitcoin-op-return" — the exact anchorType Bitcoin\'s real ProofVerifier self-declares (0.9.292 Section B) — is valid shape');
        assert(isValidRoleProviderKey('not-a-real-provider-yet'), 'B4. an entirely made-up key is ALSO valid shape — providerKey is an opaque identifier, never checked against any real provider\'s existence, exactly the restraint this milestone\'s own header names');
        assert(!isValidRoleProviderKey(''), 'B5. empty string is never a valid key');
        assert(!isValidRoleProviderKey('IPFS'), 'B6. uppercase is never a valid key — the same case-sensitive discipline as roles');
        assert(!isValidRoleProviderKey('123ipfs'), 'B7. a key may never start with a digit');
        assert(!isValidRoleProviderKey(null), 'B8. null is never a valid key');
        assert(!isValidRoleProviderKey(42), 'B9. a number is never a valid key');
        console.log('✓ Section B: providerKey is a shape-validated opaque string, never a provider — a made-up key and a real one both pass identically, proving no capability check ever runs here');
    }

    // ===============================================================
    // Section C — same provider identifier, three different roles:
    // three genuinely distinct preference values, never collapsed.
    // ===============================================================
    {
        const discoveryArweave = new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'arweave' });
        const contentArweave = new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'arweave' });
        const proofArweave = new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'arweave' });

        assert(discoveryArweave.providerKey === contentArweave.providerKey && contentArweave.providerKey === proofArweave.providerKey, 'C1. all three genuinely name the same providerKey — "arweave everywhere" is exactly the milestone brief\'s own worked example');
        assert(!discoveryArweave.equals(contentArweave), 'C2. Discovery/Arweave ≠ Content/Arweave');
        assert(!contentArweave.equals(proofArweave), 'C3. Content/Arweave ≠ Proof/Arweave');
        assert(!discoveryArweave.equals(proofArweave), 'C4. Discovery/Arweave ≠ Proof/Arweave');
        assert(discoveryArweave !== contentArweave && contentArweave !== proofArweave, 'C5. three distinct object identities, never one shared instance wearing three roles');
        console.log('✓ Section C: "Arweave everywhere" produces three distinct preference values, one per role, exactly as the milestone brief\'s core model requires — a recurring provider identifier never implies a shared or merged preference');
    }

    // ===============================================================
    // Section D — same role, different provider identifiers: two
    // distinct preference values.
    // ===============================================================
    {
        const contentIpfs = new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' });
        const contentArweave = new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'arweave' });
        assert(contentIpfs.role === contentArweave.role, 'D1. both genuinely name the same role');
        assert(!contentIpfs.equals(contentArweave), 'D2. Content/IPFS ≠ Content/Arweave — distinct preference values despite the shared role');
        console.log('✓ Section D: two different providerKeys for the identical role produce two distinct preference values');
    }

    // ===============================================================
    // Section E — immutability: withProviderKey() never mutates `this`,
    // and role can never be changed on an existing instance at all.
    // ===============================================================
    {
        const original = new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' });
        const changed = original.withProviderKey('arweave');
        assert(original.providerKey === 'ipfs', 'E1. the original instance is untouched after deriving a changed one');
        assert(changed.providerKey === 'arweave', 'E2. the derived instance carries the new providerKey');
        assert(changed.role === original.role, 'E3. role survives withProviderKey() unchanged — only the provider varies');
        assert(original !== changed, 'E4. withProviderKey() always returns a brand-new instance, never the same object mutated in place');
        assert(Object.isFrozen(original) && Object.isFrozen(changed), 'E5. both instances are genuinely frozen objects');
        expectThrows(() => { original._providerKey = 'nostr'; }, 'E6. a direct field mutation attempt throws — every file in this codebase is an ES module, always strict mode, so assigning to a frozen object\'s own property is a TypeError, never a silent no-op');
        assert(original.providerKey === 'ipfs', 'E7. …and, regardless of throw behavior, the field\'s own value never actually changed');
        assert(typeof original.withRole === 'undefined', 'E8. there is no withRole() method at all — role is part of a preference\'s own identity, never a field a "with" method can vary');
        console.log('✓ Section E: preferences are immutable by construction — withProviderKey() derives a new, independently frozen instance, never mutates the original, and role has no mutation path whatsoever, "with" or otherwise');
    }

    // ===============================================================
    // Section F — invalid role: rejected.
    // ===============================================================
    {
        expectThrows(() => new RoleProviderPreference({ role: 'NETWORK', providerKey: 'ipfs' }), 'F1. an invented "NETWORK" role is rejected');
        expectThrows(() => new RoleProviderPreference({ role: 'content', providerKey: 'ipfs' }), 'F2. a lowercase role is rejected — no normalization');
        expectThrows(() => new RoleProviderPreference({ role: undefined, providerKey: 'ipfs' }), 'F3. a missing role is rejected');
        expectThrows(() => new RoleProviderPreference({ role: null, providerKey: 'ipfs' }), 'F4. a null role is rejected');
        console.log('✓ Section F: every invalid or invented role is rejected at construction, never silently coerced or defaulted');
    }

    // ===============================================================
    // Section G — invalid provider identifier: rejected according to
    // the provider-key syntax Section B established.
    // ===============================================================
    {
        expectThrows(() => new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: '' }), 'G1. an empty providerKey is rejected');
        expectThrows(() => new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'IPFS' }), 'G2. an uppercase providerKey is rejected');
        expectThrows(() => new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: '123ipfs' }), 'G3. a providerKey starting with a digit is rejected');
        expectThrows(() => new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: null }), 'G4. a null providerKey is rejected');
        expectThrows(() => new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: undefined }), 'G5. a missing providerKey is rejected');
        expectThrows(() => new RoleProviderPreference({ role: RoleProviderRole.CONTENT }), 'G6. omitting providerKey entirely is rejected');
        console.log('✓ Section G: every invalid providerKey is rejected at construction, using the same shape rule Section B exercises directly');
    }

    // ===============================================================
    // Section H — no provider imports: an architecture sweep of the
    // boundary's own two source files, never a guess from this file's
    // own prose.
    // ===============================================================
    {
        const roleSource = await source('core/RoleProviderRole.js');
        const preferenceSource = await source('core/RoleProviderPreference.js');
        const forbiddenImportPattern = /^import\b[^\n]*from\s*['"][^'"]*(nostr|arweave|ipfs|bitcoin|anchoring|content\/|discovery\/|base\/)[^'"]*['"]/im;
        assert(!forbiddenImportPattern.test(roleSource), 'H1. core/RoleProviderRole.js imports no provider implementation, no content/anchoring/discovery module, and no base/ module');
        assert(!forbiddenImportPattern.test(preferenceSource), 'H2. core/RoleProviderPreference.js imports no provider implementation, no content/anchoring/discovery module, and no base/ module — its only import is its own sibling, core/RoleProviderRole.js');
        const importLines = preferenceSource.split('\n').filter((line) => /^import\b/.test(line));
        assert(importLines.length === 1 && /RoleProviderRole\.js/.test(importLines[0]), 'H3. exactly one import statement in the preference file, and it names only its own sibling — no other collaborator of any kind');
        console.log('✓ Section H: neither boundary file imports Nostr, IPFS, Bitcoin, Base, Arweave, or any content/anchoring/discovery module — providerKey stays a plain string, never a live reference to an implementation');
    }

    // ===============================================================
    // Section I — no runtime resolution: construction never
    // instantiates, imports, or looks up a provider of any kind.
    // ===============================================================
    {
        const preference = new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'base' });
        // Base's own real verify half does not exist yet (0.9.292 Section
        // B11) — this construction succeeds anyway, proving the
        // preference never attempted to resolve, validate capability
        // for, or even look up "base" against anything real.
        assert(preference.providerKey === 'base', 'I1. a preference for a KNOWN-INCOMPLETE provider capability (Base/Proof, per 0.9.292) still constructs successfully — no capability check ever ran');
        assert(typeof preference.resolve === 'undefined', 'I2. there is no resolve() method — nothing here ever turns a preference into a concrete provider instance');
        assert(typeof RoleProviderPreference.registry === 'undefined', 'I3. no registry, static or otherwise, is reachable from this class at all');
        console.log('✓ Section I: a preference for a provider whose real capability is still incomplete (0.9.292\'s own Base/Proof gap) constructs identically to one for a fully-capable provider — proof that no resolution or capability check runs at construction time');
    }

    // ===============================================================
    // Section J — no fallback: a preference names exactly one
    // providerKey, with no second/backup slot of any kind.
    // ===============================================================
    {
        const preference = new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' });
        const json = preference.toJSON();
        assert(Object.keys(json).length === 2 && 'role' in json && 'providerKey' in json, 'J1. the plain-data shape carries exactly two fields — role and providerKey — never a fallback/backup/secondary field of any kind');
        assert(typeof preference.fallbackProviderKey === 'undefined', 'J2. no fallbackProviderKey field exists');
        assert(typeof preference.alternates === 'undefined', 'J3. no alternates/backups collection exists');
        console.log('✓ Section J: a preference is a single provider choice, full stop — no fallback, backup, or alternate slot exists to express, matching 0.9.292 Section H\'s own finding that "preferred vs. exclusive" remains a genuinely open, unresolved question this milestone does not attempt to close');
    }

    // ===============================================================
    // Section K — no UI dependency: constructible and usable with zero
    // browser/DOM globals present, exactly like every other core/ value
    // object this codebase already ships.
    // ===============================================================
    {
        assert(typeof window === 'undefined' && typeof document === 'undefined', 'K1. this test itself runs under plain `node tests/*.test.js`, with no browser globals — confirming the environment this file already exercises the boundary under is the same one a future non-UI consumer (persistence, resolution) would run in too');
        const preference = new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'nostr' });
        assert(preference.toJSON().providerKey === 'nostr', 'K2. full construction, comparison, and serialization all succeed with no UI runtime present');
        console.log('✓ Section K: the preference boundary is fully usable with zero browser/UI infrastructure — nothing here depends on ui/ in any way');
    }

    // ===============================================================
    // Section L — independent role configuration: a complete Discovery/
    // Content/Proof set never collapses into one flat "network" value.
    // ===============================================================
    {
        const preferences = [
            new RoleProviderPreference({ role: RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY, providerKey: 'nostr' }),
            new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }),
            new RoleProviderPreference({ role: RoleProviderRole.PROOF_AND_ANCHORING, providerKey: 'bitcoin' })
        ];
        const byRole = Object.fromEntries(preferences.map((p) => [p.role, p.providerKey]));
        assert(byRole[RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY] === 'nostr', 'L1. Discovery = Nostr, independently held');
        assert(byRole[RoleProviderRole.CONTENT] === 'ipfs', 'L2. Content = IPFS, independently held');
        assert(byRole[RoleProviderRole.PROOF_AND_ANCHORING] === 'bitcoin', 'L3. Proof = Bitcoin, independently held');
        assert(new Set(preferences.map((p) => p.providerKey)).size === 3, 'L4. three genuinely different providerKeys, never collapsed into one shared "network" selection — exactly the milestone brief\'s own core model');
        assert(Object.keys(RoleProviderRole).every((role) => preferences.some((p) => p.role === RoleProviderRole[role])), 'L5. every one of the three roles is independently represented in this one configuration');
        console.log('✓ Section L: Discovery/Content/Proof preferences coexist as three independent values — a complete, per-role configuration, never a single flat network choice, exactly the shape the milestone brief\'s core model requires');
    }

    // ===============================================================
    // Section M — nothing in production consumes this yet: the
    // boundary is deliberately unwired, a repo-wide sweep, never a
    // guess from this file's own prose.
    // ===============================================================
    {
        const { readdir } = await import('node:fs/promises');
        async function listJsFiles(relativeDir, results = []) {
            const dirUrl = new URL(relativeDir.endsWith('/') ? relativeDir : `${relativeDir}/`, SOURCE_ROOT);
            let entries;
            try {
                entries = await readdir(dirUrl, { withFileTypes: true });
            } catch {
                return results;
            }
            for (const entry of entries) {
                if (entry.name === 'tests' || entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
                const childRelative = `${relativeDir.replace(/\/+$/, '')}/${entry.name}`;
                if (entry.isDirectory()) {
                    await listJsFiles(childRelative, results);
                } else if (entry.name.endsWith('.js') && childRelative !== 'core/RoleProviderRole.js' && childRelative !== 'core/RoleProviderPreference.js') {
                    results.push(childRelative);
                }
            }
            return results;
        }
        const dirs = ['core', 'application', 'content', 'discovery', 'anchoring', 'base', 'arweave', 'nostr', 'publisher', 'ui', 'identity', 'storage', 'peer', 'replication', 'placement', 'spatial', 'serializer', 'presence', 'collaboration', 'world', 'world-layout', 'persistence', 'server', 'renderer'];
        const allFiles = [];
        for (const dir of dirs) await listJsFiles(dir, allFiles);
        let consumerCount = 0;
        for (const file of allFiles) {
            const text = await source(file);
            if (/RoleProviderPreference|RoleProviderRole/.test(text)) {
                consumerCount += 1;
            }
        }
        assert(consumerCount === 0, `M1. zero other production files reference RoleProviderPreference or RoleProviderRole yet (found ${consumerCount}) — this boundary is deliberately unconsumed; wiring it to a resolver, a registry, or persistence is separate, unscheduled future work`);
        console.log('✓ Section M: repo-wide sweep confirms nothing else in production imports or mentions this boundary yet — 0.9.293 defines what a preference means without making any preference operational');
    }

    console.log('\n✅ All Decentralized Role Provider Preference Boundary tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
