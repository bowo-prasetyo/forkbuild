import { isNonEmptyString, isPlainObject } from '../utils/typeGuards.js';
import { STEEM_CONTENT_FAMILY, isSteemAccountName, steemDeclinedPayoutOptions } from './SteemDiscoveryThread.js';

// Content stored on Steem: a manifest, a direct reply to a monthly content
// thread, whose body is the encoded content (docs/Protocol.md, "Proposed:
// Steem Content Storage"). This file builds and reads a manifest's shape
// and the `steem://` locator; encoding, network and signing live elsewhere.
// Only the inline case is readable so far: a manifest that lists parts is
// described, then refused as not yet supported.

export const STEEM_CONTENT_STORAGE = 'steem';
export const STEEM_CONTENT_MANIFEST_VERSION = 1;
export const STEEM_CONTENT_URI_PREFIX = 'steem://';
export const STEEM_CONTENT_ENCODINGS = Object.freeze(['utf8', 'gzip-base64']);
// The most encoded text one post holds, measured as the UTF-8 length of the
// text escaped as a JSON string, which is how it travels in the operations.
// Leaves room within the chain's 64 KiB transaction for everything else.
export const STEEM_CONTENT_PART_MAX_BYTES = 48 * 1024;

const PERMLINK_SUFFIX_PATTERN = /^[a-z0-9]{8}$/;
// Steem permlinks: lowercase letters, digits and hyphens, at most 256.
const PERMLINK_PATTERN = /^[a-z0-9-]{1,256}$/;
const CONTENT_THREAD_PATTERN = new RegExp(`^forkbuild-${STEEM_CONTENT_FAMILY}-\\d{4}-(0[1-9]|1[0-2])$`);
const PARTS_BODY = 'ForkBuild content, continued in the replies below. Read by the ForkBuild app.';

// A manifest's permlink: unique per author, from the time and eight random
// lowercase letters or digits the caller supplies.
export function steemContentManifestPermlink(timeMs, suffix) {
    if (!Number.isInteger(timeMs) || timeMs < 0) throw new TypeError(`timeMs must be a non-negative integer, got ${timeMs}`);
    if (!PERMLINK_SUFFIX_PATTERN.test(suffix)) throw new TypeError(`suffix must be eight lowercase letters or digits, got ${suffix}`);
    return `forkbuild-c-${timeMs.toString(36)}-${suffix}`;
}

export function steemContentLocator(author, permlink) {
    if (!isSteemAccountName(author)) throw new TypeError(`not a Steem account name: ${author}`);
    if (!PERMLINK_PATTERN.test(permlink)) throw new TypeError(`not a Steem permlink: ${permlink}`);
    return `${STEEM_CONTENT_URI_PREFIX}${author}/${permlink}`;
}

// `{ author, permlink }` for a `steem://<author>/<permlink>` locator, or
// null for anything else.
export function parseSteemContentLocator(uri) {
    if (typeof uri !== 'string' || !uri.startsWith(STEEM_CONTENT_URI_PREFIX)) return null;
    const [author, permlink, ...rest] = uri.slice(STEEM_CONTENT_URI_PREFIX.length).split('/');
    if (rest.length > 0 || !isSteemAccountName(author) || !PERMLINK_PATTERN.test(permlink ?? '')) return null;
    return Object.freeze({ author, permlink });
}

// The length that counts against STEEM_CONTENT_PART_MAX_BYTES.
export function steemContentEncodedByteLength(text) {
    return new TextEncoder().encode(JSON.stringify(text)).length;
}

// The manifest and its options, in one transaction. `content` describes the
// content; `body` is the encoded content when it is inline.
export function steemContentManifestOperations({ author, threadAccount, threadPermlink, permlink, content, body, appVersion = null }) {
    if (!isSteemAccountName(author)) throw new TypeError(`not a Steem account name: ${author}`);
    if (!isSteemAccountName(threadAccount)) throw new TypeError(`not a Steem account name: ${threadAccount}`);
    if (!CONTENT_THREAD_PATTERN.test(threadPermlink ?? '')) throw new TypeError(`not a content thread permlink: ${threadPermlink}`);
    if (!PERMLINK_PATTERN.test(permlink ?? '')) throw new TypeError(`not a Steem permlink: ${permlink}`);
    const problem = contentProblem(content);
    if (problem) throw new TypeError(`the content description is malformed: ${problem}`);
    const inline = content.parts.length === 0;
    if (inline && (typeof body !== 'string' || body.length !== content.encodedLength)) {
        throw new TypeError('an inline manifest body must be the encoded content');
    }
    const metadata = {
        ...(isNonEmptyString(appVersion) ? { app: `forkbuild/${appVersion}` } : {}),
        forkbuild: { version: STEEM_CONTENT_MANIFEST_VERSION, content: copyContent(content) }
    };
    return [
        ['comment', {
            parent_author: threadAccount,
            parent_permlink: threadPermlink,
            author,
            permlink,
            title: '',
            body: inline ? body : PARTS_BODY,
            json_metadata: JSON.stringify(metadata)
        }],
        steemDeclinedPayoutOptions(author, permlink)
    ];
}

// Reads what `condenser_api.get_content` returned for a manifest. Returns
// `{ manifest, problem }`: a manifest when the post is one of ours on a
// content thread of one of `threadAccounts`, otherwise a problem a person
// can read. A missing post comes back from the chain as `author: ''`.
export function describeSteemContentManifest(post, { threadAccounts }) {
    if (!isPlainObject(post) || !post.author) return failure('the post does not exist');
    if (!isNonEmptyString(post.permlink)) return failure('the post has no permlink');
    if (!Array.isArray(threadAccounts) || !threadAccounts.includes(post.parent_author) || !CONTENT_THREAD_PATTERN.test(post.parent_permlink ?? '')) {
        return failure('the post is not a reply to a ForkBuild content thread');
    }
    const forkbuild = parseJsonObject(post.json_metadata)?.forkbuild;
    if (!isPlainObject(forkbuild) || forkbuild.version !== STEEM_CONTENT_MANIFEST_VERSION) {
        return failure('the post does not describe ForkBuild content');
    }
    const problem = contentProblem(forkbuild.content);
    if (problem) return failure(`the content description is malformed: ${problem}`);
    const content = copyContent(forkbuild.content);
    const inline = content.parts.length === 0;
    if (inline && (typeof post.body !== 'string' || post.body.length !== content.encodedLength)) {
        return failure('the post has been changed since the content was stored');
    }
    return Object.freeze({
        manifest: Object.freeze({
            author: post.author,
            permlink: post.permlink,
            ...content,
            inline,
            body: inline ? post.body : null
        }),
        problem: null
    });
}

function contentProblem(content) {
    if (!isPlainObject(content)) return 'no content description';
    if (!isNonEmptyString(content.contentHash)) return 'no contentHash';
    if (!isNonEmptyString(content.algorithm)) return 'no algorithm';
    if (!isNonEmptyString(content.mediaType)) return 'no mediaType';
    if (!Number.isInteger(content.size) || content.size < 0) return 'size is not a non-negative integer';
    if (!STEEM_CONTENT_ENCODINGS.includes(content.encoding)) return `unknown encoding ${content.encoding}`;
    if (!Number.isInteger(content.encodedLength) || content.encodedLength < 0) return 'encodedLength is not a non-negative integer';
    if (!Array.isArray(content.parts)) return 'parts is not a list';
    for (const part of content.parts) {
        if (!isPlainObject(part) || !PERMLINK_PATTERN.test(part.permlink ?? '') || !Number.isInteger(part.length) || !isNonEmptyString(part.sha256)) {
            return 'a part is malformed';
        }
    }
    return null;
}

function copyContent(content) {
    return {
        contentHash: content.contentHash,
        algorithm: content.algorithm,
        mediaType: content.mediaType,
        size: content.size,
        encoding: content.encoding,
        encodedLength: content.encodedLength,
        parts: Object.freeze(content.parts.map((part) => Object.freeze({ permlink: part.permlink, length: part.length, sha256: part.sha256 })))
    };
}

function failure(problem) {
    return Object.freeze({ manifest: null, problem });
}

function parseJsonObject(text) {
    if (typeof text !== 'string' || text.length === 0) return null;
    try {
        const value = JSON.parse(text);
        return isPlainObject(value) ? value : null;
    } catch {
        return null;
    }
}
