import { ArweavePlaceNamingDiscoveryPublisher } from './ArweavePlaceNamingDiscoveryPublisher.js';
import { responseContentLength, byteLength } from '../../utils/responseSize.js';

const DEFAULT_GRAPHQL_URL = 'https://arweave.net/graphql';
const DEFAULT_GATEWAY_URL = 'https://arweave.net';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_MAX_ENVELOPE_BYTES = 48 * 1024;
const TRANSACTION_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

// Place naming claims from Arweave: the reading side of
// ArweavePlaceNamingDiscoveryPublisher. Searches GraphQL for transactions
// carrying the same per-region tag under the same Tag NAME, then fetches each
// one's body from the gateway. Like the Nostr and Steem sources, it returns
// raw payloads for PlaceNamingDiscoveryQueryService to parse and verify, and
// rejects when the tag search itself could not be read. A single transaction
// that is missing, oversized or unreadable is skipped.
export class ArweavePlaceNamingDiscoverySource {
    constructor({
        graphqlUrl = DEFAULT_GRAPHQL_URL,
        gatewayUrl = DEFAULT_GATEWAY_URL,
        tagName = ArweavePlaceNamingDiscoveryPublisher.DEFAULT_TAG_NAME,
        fetchImpl = null,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        maxResults = DEFAULT_MAX_RESULTS,
        maxEnvelopeBytes = DEFAULT_MAX_ENVELOPE_BYTES
    } = {}) {
        if (typeof graphqlUrl !== 'string' || graphqlUrl.trim().length === 0) {
            throw new Error('ArweavePlaceNamingDiscoverySource: a non-empty graphqlUrl is required');
        }
        if (typeof tagName !== 'string' || tagName.length === 0) {
            throw new Error('ArweavePlaceNamingDiscoverySource: a non-empty tagName is required');
        }
        this._fetch = fetchImpl || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
        if (typeof this._fetch !== 'function') {
            throw new Error('ArweavePlaceNamingDiscoverySource: no fetch implementation available — pass fetchImpl explicitly');
        }
        this._graphqlUrl = graphqlUrl;
        this._gatewayUrl = (typeof gatewayUrl === 'string' && gatewayUrl.trim().length > 0 ? gatewayUrl : DEFAULT_GATEWAY_URL).replace(/\/+$/, '');
        this._tagName = tagName;
        this._timeoutMs = timeoutMs;
        this._maxResults = Number.isInteger(maxResults) && maxResults > 0 ? maxResults : DEFAULT_MAX_RESULTS;
        this._maxEnvelopeBytes = Number.isInteger(maxEnvelopeBytes) && maxEnvelopeBytes > 0 ? maxEnvelopeBytes : DEFAULT_MAX_ENVELOPE_BYTES;
    }

    get graphqlUrl() { return this._graphqlUrl; }
    get gatewayUrl() { return this._gatewayUrl; }
    get tagName() { return this._tagName; }

    async search(discoveryTag) {
        const transactionIds = await this._searchTransactionIds(discoveryTag);
        const payloads = [];
        for (const transactionId of transactionIds) {
            const text = await this._fetchTransactionText(transactionId);
            if (text !== null) {
                payloads.push(text);
            }
        }
        return payloads;
    }

    async _searchTransactionIds(discoveryTag) {
        const body = await this._request(this._graphqlUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: buildDiscoveryTagQuery(this._tagName, discoveryTag, this._maxResults) })
        }, async (response) => {
            if (!response.ok) {
                throw new Error(`ArweavePlaceNamingDiscoverySource: GraphQL search failed (HTTP ${response.status})`);
            }
            return response.json();
        });
        const edges = body && body.data && body.data.transactions && body.data.transactions.edges;
        if (!Array.isArray(edges)) {
            throw new Error('ArweavePlaceNamingDiscoverySource: GraphQL search returned no transactions list');
        }
        return edges
            .map((edge) => (edge && edge.node && typeof edge.node.id === 'string' ? edge.node.id : null))
            .filter((id) => id !== null && TRANSACTION_ID_PATTERN.test(id));
    }

    async _fetchTransactionText(transactionId) {
        try {
            return await this._request(`${this._gatewayUrl}/${transactionId}`, { method: 'GET' }, async (response) => {
                if (!response.ok) return null;
                const declaredLength = responseContentLength(response);
                if (declaredLength !== null && declaredLength > this._maxEnvelopeBytes) return null;
                const text = await response.text();
                return byteLength(text) > this._maxEnvelopeBytes ? null : text;
            });
        } catch {
            return null;
        }
    }

    // Runs fetch and the response handler under one timeout, so a body that
    // never finishes arriving is cut off too.
    async _request(url, init, handleResponse) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this._timeoutMs);
        try {
            const response = await this._fetch(url, { ...init, signal: controller.signal });
            return await handleResponse(response);
        } finally {
            clearTimeout(timer);
        }
    }
}

ArweavePlaceNamingDiscoverySource.DEFAULT_GRAPHQL_URL = DEFAULT_GRAPHQL_URL;
ArweavePlaceNamingDiscoverySource.DEFAULT_GATEWAY_URL = DEFAULT_GATEWAY_URL;

function buildDiscoveryTagQuery(tagName, discoveryTag, maxResults) {
    return 'query { transactions(tags: [{ name: ' + JSON.stringify(tagName)
        + ', values: [' + JSON.stringify(discoveryTag) + '] }], first: ' + maxResults + ') '
        + '{ edges { node { id } } } }';
}
