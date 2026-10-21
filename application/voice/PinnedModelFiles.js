// Holds every speech model file transformers.js reads to its pin
// (application/voice/SpeechModelPins.js): what it fetches from Hugging Face,
// and what it finds in this browser's cache. Given to transformers.js as its
// `env.fetch` and its `env.customCache` (application/voice/SpeechRuntime.js).
//
// A file is known by its address: `${host}${model}/resolve/${revision}/${path}`.
// One at the pinned revision whose path is pinned is fetched (or read from the
// cache), hashed, and handed on only when its SHA-256 is the pinned one; a
// cached copy that isn't is thrown away and fetched again, and a download
// that isn't is refused. Any other address, under the model or not, is
// answered as missing (404) without being fetched, so nothing unpinned is
// ever read: transformers.js asks `env.fetch` only for the model's files
// (SpeechRuntime turns its engine cache, the one other asker, off), and a
// version that one day wants another file stops loading, loudly, until that
// file is pinned too.
//
// One exception, which transformers.js 4.3 needs: pipeline() works out which
// files a model has before it passes the revision on, so it reads config.json,
// and asks whether tokenizer_config.json and preprocessor_config.json exist,
// at the main branch. A pinned path asked for at main is the same file at the
// pinned commit: fetched from the commit's address, kept under it, and held to
// its pin like any other, so what main holds today never matters.
//
// transformers.js asks whether a file exists, and how big it is, with a
// request for its first byte (`Range: bytes=0-0`). Such a request for a pinned
// file is passed on to its address at the commit and answered with the
// file's size only: no byte of it is handed on unchecked.
const BRANCH = 'main';

function hex(buffer) {
    return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class PinnedModelFiles {
    // `fetch` and `caches` as the browser's; `subtle` WebCrypto;
    // `onProgress(path, loaded, total)` while a pinned file downloads.
    constructor({ model, revision, files, host = 'https://huggingface.co/', fetch: fetchResource, caches: cacheStorage, cacheName, subtle, onProgress = () => {} }) {
        this._prefix = `${host}${model}/resolve/`;
        this._revision = revision;
        this._files = files;
        this._fetch = fetchResource;
        this._caches = cacheStorage;
        this._cacheName = cacheName;
        this._subtle = subtle;
        this._onProgress = onProgress;
    }

    // The pinned file `url` names: { path, sha256, url }, `url` its address at
    // the pinned commit; { path: null } for a file under the model that is
    // not pinned; null for anything else.
    pinOf(url) {
        const address = String(url && url.url ? url.url : url);
        if (!address.startsWith(this._prefix)) return null;
        const rest = address.slice(this._prefix.length).split('?')[0];
        const slash = rest.indexOf('/');
        const revision = slash === -1 ? rest : rest.slice(0, slash);
        const path = slash === -1 ? '' : decodeURIComponent(rest.slice(slash + 1));
        if ((revision !== this._revision && revision !== BRANCH) || !Object.hasOwn(this._files, path)) return { path: null };
        return { path, sha256: this._files[path], url: `${this._prefix}${this._revision}/${path}` };
    }

    async _verified(bytes, sha256) {
        return hex(await this._subtle.digest('SHA-256', bytes)) === sha256;
    }

    // transformers.js's env.fetch.
    async fetch(url, init) {
        const pin = this.pinOf(url);
        if (pin === null || pin.path === null) return new Response(null, { status: 404, statusText: 'Not pinned' });
        if (new Headers(init?.headers).has('Range')) return this._size(pin.url, init);
        const response = await this._fetch(pin.url, { ...init, credentials: 'omit' });
        if (!response.ok) return response;
        const bytes = await this._read(response, pin.path);
        if (!(await this._verified(bytes, pin.sha256))) {
            throw new Error(`speech model: ${pin.path} is not the pinned file (its SHA-256 differs)`);
        }
        return new Response(bytes, { status: 200, headers: { 'Content-Length': String(bytes.byteLength) } });
    }

    // A pinned file's size, for a request for its first byte: the answer's
    // status and Content-Range (or Content-Length), without its bytes.
    async _size(url, init) {
        const response = await this._fetch(url, { ...init, credentials: 'omit' });
        try {
            await response.body?.cancel();
        } catch {
            // Nothing more is read either way.
        }
        const headers = {};
        for (const name of ['Content-Range', 'Content-Length']) {
            const value = response.headers?.get?.(name);
            if (value) headers[name] = value;
        }
        return new Response(null, { status: response.status, headers });
    }

    async _read(response, path) {
        const total = Number(response.headers?.get?.('Content-Length')) || 0;
        if (!response.body?.getReader) {
            const bytes = await response.arrayBuffer();
            this._onProgress(path, bytes.byteLength, total || bytes.byteLength);
            return bytes;
        }
        const reader = response.body.getReader();
        const chunks = [];
        let loaded = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            this._onProgress(path, loaded, total || loaded);
        }
        const bytes = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
        }
        return bytes.buffer;
    }

    // transformers.js's env.customCache: the Cache API's match() and put().
    get cache() {
        return {
            match: (request) => this._match(request),
            put: (request, response) => this._put(request, response)
        };
    }

    async _match(request) {
        const pin = this.pinOf(request);
        if (!pin || pin.path === null) return undefined;
        const cache = await this._caches.open(this._cacheName);
        const kept = await cache.match(pin.url);
        if (!kept) return undefined;
        const bytes = await kept.arrayBuffer();
        if (await this._verified(bytes, pin.sha256)) {
            return new Response(bytes, { status: 200, headers: { 'Content-Length': String(bytes.byteLength) } });
        }
        await cache.delete(pin.url);
        return undefined;
    }

    async _put(request, response) {
        const pin = this.pinOf(request);
        if (!pin || pin.path === null) return;
        const cache = await this._caches.open(this._cacheName);
        await cache.put(pin.url, response);
    }
}
