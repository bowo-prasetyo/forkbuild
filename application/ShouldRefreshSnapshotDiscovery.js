// 0.9.186 — World Snapshot Background Discovery.
//
// The pure decision boundary `application/WorldSnapshotDiscoveryMonitor.js`'s
// own header names: a way to tell "the World observation context changed a
// little" apart from "the World observation context changed enough that a
// fresh Snapshot discovery call is actually worth making." Kept as its own
// file, with no I/O and no collaborator of any kind, so it is directly
// testable without a fake command or a fake World session — see this
// file's own test coverage in tests/WorldSnapshotBackgroundDiscovery.test.js.
//
// THE THRESHOLD REUSES `core/WorldSpatialContext.js#deriveSpatialContext()`'s
// OWN EXISTING `streamingRadius` DEFAULT (100), RATHER THAN INVENTING A NEW
// ARBITRARY NUMBER. That radius already names the area a Wanderer's current
// position is treated as "nearby" for — once the Wanderer has moved farther
// than that from wherever the last discovery call was made, the
// previously-observed area is behind them and the last discovery result no
// longer describes what is actually around them. `deriveSpatialContext()`
// exposes that default only as an internal parameter default, never as a
// named export, so this file declares its own copy rather than importing
// it — the two are independent constants that happen to agree today, not a
// shared reference.
import { distanceBetween } from '../core/SpatialQuery.js';

export const DEFAULT_DISCOVERY_REFRESH_RADIUS = 100;

// shouldRefreshSnapshotDiscovery(previousContext, currentContext, radius)
//   -> boolean.
//
// `previousContext`/`currentContext` are duck-typed as "anything exposing a
// `.position` with `{x,y,z}`" — exactly what
// `WorldSpatialContextService#getCurrentContext()` already returns (a
// `WorldSpatialContext` instance). This file never imports that class and
// performs no `instanceof` check.
//
//   - `currentContext` missing, or with no `.position` — nothing to
//     discover around yet (e.g. the World session has not started). Never
//     refreshes.
//   - `previousContext` missing, or with no `.position` — nothing has ever
//     been observed before. Always refreshes; there is no prior discovery
//     call that could still be valid.
//   - Otherwise — refreshes only when the Euclidean distance between the
//     two positions is at least `radius`. A tiny movement inside that
//     radius never refreshes.
export function shouldRefreshSnapshotDiscovery(previousContext, currentContext, radius = DEFAULT_DISCOVERY_REFRESH_RADIUS) {
    if (!currentContext || !currentContext.position) {
        return false;
    }
    if (!previousContext || !previousContext.position) {
        return true;
    }
    return distanceBetween(currentContext.position, previousContext.position) >= radius;
}
