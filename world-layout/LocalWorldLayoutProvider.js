import { WorldLayoutProvider } from './WorldLayoutProvider.js';
import { WorldPosition } from '../core/WorldPosition.js';

const GRID_SPACING = 40;

// Deterministic local layout: arranges every known publication on a
// simple 2D grid in the XZ plane. No persistence, no blockchain, no
// GPS — just a pure function of the discovery catalog so the spatial
// boundary can be exercised before external complexity is introduced.
export class LocalWorldLayoutProvider extends WorldLayoutProvider {
    constructor(discoveryProvider) {
        super();
        this._discoveryProvider = discoveryProvider;
        this._positions = new Map();
    }

    findVisibleDocuments(viewCenter, viewRadius = 100) {
        this._rebuild();
        const visible = [];
        for (const [documentId, pos] of this._positions) {
            const dx = pos.x - viewCenter.x;
            const dy = pos.y - viewCenter.y;
            const dz = pos.z - viewCenter.z;
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist <= viewRadius) {
                visible.push(documentId);
            }
        }
        return visible;
    }

    getPosition(documentId) {
        this._rebuild();
        return this._positions.get(documentId) || new WorldPosition(0, 0, 0);
    }

    _rebuild() {
        this._positions.clear();
        const publications = this._discoveryProvider.list();
        for (let i = 0; i < publications.length; i++) {
            const pub = publications[i];
            const row = Math.floor(i / 4);
            const col = i % 4;
            this._positions.set(pub.documentId, new WorldPosition(
                col * GRID_SPACING,
                0,
                row * GRID_SPACING
            ));
        }
    }
}
