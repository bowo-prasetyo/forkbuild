import { isNonEmptyString, isPlainObject } from '../utils/typeGuards.js';
import { STEEM_CONTENT_FAMILY, isSteemAccountName, steemDeclinedPayoutOptions } from './SteemDiscoveryThread.js';

// Content stored on Steem: a manifest, a direct reply to a monthly content
// thread, which holds the encoded content or, when that doesn't fit one
// post, whose parts are replies to it (docs/Protocol.md, "Proposed: Steem
// Content Storage"). This file builds and reads the manifest, the parts and
// the `steem://` locator; encoding, hashing, network and signing live
// elsewhere.
//
// Version 2 keeps the encoded content in `json_metadata` (`forkbuild.data`)
// and puts a short notice for people reading Steem in the body. Version 1
// kept the encoded content in the body; posts in it are still read.

export const STEEM_CONTENT_STORAGE = 'steem';
export const STEEM_CONTENT_MANIFEST_VERSION = 2;
export const STEEM_CONTENT_READABLE_VERSIONS = Object.freeze([1, 2]);
export const STEEM_CONTENT_URI_PREFIX = 'steem://';
export const STEEM_CONTENT_ENCODINGS = Object.freeze(['utf8', 'gzip-base64']);
// The most encoded text one post holds, measured as the UTF-8 length of the
// text escaped as a JSON string, which is how it travels in the operations.
// Leaves room within the chain's 64 KiB transaction for everything else.
export const STEEM_CONTENT_PART_MAX_BYTES = 48 * 1024;
// The most parts one upload may have, and a reader accepts.
export const STEEM_CONTENT_MAX_PARTS = 20;

const PERMLINK_SUFFIX_PATTERN = /^[a-z0-9]{8}$/;
// Steem permlinks: lowercase letters, digits and hyphens, at most 256.
const PERMLINK_PATTERN = /^[a-z0-9-]{1,256}$/;
const CONTENT_THREAD_PATTERN = new RegExp(`^forkbuild-${STEEM_CONTENT_FAMILY}-\\d{4}-(0[1-9]|1[0-2])$`);
const ABOUT_URL = 'https://github.com/bowo-prasetyo/forkbuild/blob/main/docs/Protocol.md#proposed-steem-content-storage';
const NOTICE_END = `It is read by the ForkBuild app, not meant to be read here, and its payout is declined. [What this is](${ABOUT_URL})`;

// The body of a version 2 manifest or part: what the post is, for people.
export function steemContentNotice({ parts = 0, part = null } = {}) {
    if (part) return `Part ${part.index + 1} of ${part.count} of data stored by ForkBuild. ${NOTICE_END}`;
    if (parts > 0) return `Data stored by ForkBuild, continued in ${parts} ${parts === 1 ? 'reply' : 'replies'} below. ${NOTICE_END}`;
    return `Data stored by ForkBuild. ${NOTICE_END}`;
}

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

// A part's permlink, from its manifest's and its index.
export function steemContentPartPermlink(manifestPermlink, index) {
    if (!PERMLINK_PATTERN.test(manifestPermlink ?? '')) throw new TypeError(`not a Steem permlink: ${manifestPermlink}`);
    if (!Number.isInteger(index) || index < 0) throw new TypeError(`index must be a non-negative integer, got ${index}`);
    return `${manifestPermlink}-p${index}`;
}

// Splits encoded text into slices that each fit a part. Only ASCII text
// (gzip-base64) is split, so a slice's escaped length is its length plus the
// two quotes.
export function splitSteemContent(encoded) {
    if (typeof encoded !== 'string' || !/^[\x20-\x7e]*$/.test(encoded) || /["\\]/.test(encoded)) {
        throw new TypeError('only ASCII text without quotes or backslashes can be split into parts');
    }
    const size = STEEM_CONTENT_PART_MAX_BYTES - 2;
    const slices = [];
    for (let i = 0; i < encoded.length; i += size) slices.push(encoded.slice(i, i + size));
    return slices;
}

// The length that counts against STEEM_CONTENT_PART_MAX_BYTES.
export function steemContentEncodedByteLength(text) {
    return new TextEncoder().encode(JSON.stringify(text)).length;
}

// The manifest and its options, in one transaction. `content` describes the
// content; `data` is the encoded content when it is inline.
export function steemContentManifestOperations({ author, threadAccount, threadPermlink, permlink, content, data, appVersion = null }) {
    if (!isSteemAccountName(author)) throw new TypeError(`not a Steem account name: ${author}`);
    if (!isSteemAccountName(threadAccount)) throw new TypeError(`not a Steem account name: ${threadAccount}`);
    if (!CONTENT_THREAD_PATTERN.test(threadPermlink ?? '')) throw new TypeError(`not a content thread permlink: ${threadPermlink}`);
    if (!PERMLINK_PATTERN.test(permlink ?? '')) throw new TypeError(`not a Steem permlink: ${permlink}`);
    const problem = contentProblem(content);
    if (problem) throw new TypeError(`the content description is malformed: ${problem}`);
    const inline = content.parts.length === 0;
    if (inline && (typeof data !== 'string' || data.length !== content.encodedLength)) {
        throw new TypeError('an inline manifest\'s data must be the encoded content');
    }
    const metadata = {
        ...(isNonEmptyString(appVersion) ? { app: `forkbuild/${appVersion}` } : {}),
        forkbuild: { version: STEEM_CONTENT_MANIFEST_VERSION, content: copyContent(content), ...(inline ? { data } : {}) }
    };
    return [
        ['comment', {
            parent_author: threadAccount,
            parent_permlink: threadPermlink,
            author,
            permlink,
            title: '',
            body: steemContentNotice({ parts: content.parts.length }),
            json_metadata: JSON.stringify(metadata)
        }],
        steemDeclinedPayoutOptions(author, permlink)
    ];
}

// One part and its options, in one transaction: a reply to the manifest.
// `withOptions: false` leaves out the options, for editing a part that is
// already on the chain (its payout is already declined).
export function steemContentPartOperations({ author, manifestPermlink, index, count, data, appVersion = null, withOptions = true }) {
    if (!isSteemAccountName(author)) throw new TypeError(`not a Steem account name: ${author}`);
    if (!Number.isInteger(count) || count < 1 || count > STEEM_CONTENT_MAX_PARTS || !Number.isInteger(index) || index < 0 || index >= count) {
        throw new TypeError(`part ${index} of ${count} is out of range`);
    }
    if (typeof data !== 'string' || data.length === 0) throw new TypeError('a part\'s data must be non-empty text');
    const permlink = steemContentPartPermlink(manifestPermlink, index);
    const metadata = {
        ...(isNonEmptyString(appVersion) ? { app: `forkbuild/${appVersion}` } : {}),
        forkbuild: { version: STEEM_CONTENT_MANIFEST_VERSION, part: { index, count }, data }
    };
    const comment = ['comment', {
        parent_author: author,
        parent_permlink: manifestPermlink,
        author,
        permlink,
        title: '',
        body: steemContentNotice({ part: { index, count } }),
        json_metadata: JSON.stringify(metadata)
    }];
    return withOptions ? [comment, steemDeclinedPayoutOptions(author, permlink)] : [comment];
}

// The encoded text a part post carries, in the manifest's version: the
// body in version 1, `forkbuild.data` in version 2. Null when there is none.
export function steemContentPartData(post, version = STEEM_CONTENT_MANIFEST_VERSION) {
    if (!isPlainObject(post)) return null;
    if (version === 1) return typeof post.body === 'string' ? post.body : null;
    const forkbuild = parseJsonObject(post.json_metadata)?.forkbuild;
    if (!isPlainObject(forkbuild) || forkbuild.version !== version) return null;
    return typeof forkbuild.data === 'string' ? forkbuild.data : null;
}

// Whether a post returned by the chain is part `index` of `manifest`, as the
// manifest lists it: by the manifest's author, replying to the manifest, at
// the listed permlink and length, in the manifest's version. The hash is
// checked by the caller, which has WebCrypto. Returns a problem, or null.
export function steemContentPartProblem(post, manifest, index) {
    const listed = manifest.parts[index];
    if (!isPlainObject(post) || !post.author) return `part ${index + 1} of ${manifest.parts.length} is missing`;
    if (post.author !== manifest.author || post.parent_author !== manifest.author || post.parent_permlink !== manifest.permlink || post.permlink !== listed.permlink) {
        return `part ${index + 1} of ${manifest.parts.length} is not the one the manifest lists`;
    }
    const data = steemContentPartData(post, manifest.version);
    if (data === null) {
        return `part ${index + 1} of ${manifest.parts.length} carries no ForkBuild data (its json_metadata is missing or was cut short)`;
    }
    if (data.length !== listed.length) {
        return `part ${index + 1} of ${manifest.parts.length} has been changed since the content was stored`;
    }
    return null;
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
    if (!isPlainObject(forkbuild) || !STEEM_CONTENT_READABLE_VERSIONS.includes(forkbuild.version)) {
        return failure('the post does not describe ForkBuild content');
    }
    const version = forkbuild.version;
    const problem = contentProblem(forkbuild.content);
    if (problem) return failure(`the content description is malformed: ${problem}`);
    const content = copyContent(forkbuild.content);
    const inline = content.parts.length === 0;
    const data = inline ? (version === 1 ? post.body : forkbuild.data) : null;
    if (inline && (typeof data !== 'string' || data.length !== content.encodedLength)) {
        return failure('the post has been changed since the content was stored');
    }
    if (!inline) {
        if (content.parts.length > STEEM_CONTENT_MAX_PARTS) return failure(`it lists ${content.parts.length} parts, more than the ${STEEM_CONTENT_MAX_PARTS} ForkBuild reads`);
        if (content.parts.some((part, index) => part.permlink !== steemContentPartPermlink(post.permlink, index))) {
            return failure('its parts are not replies ForkBuild would have made');
        }
        if (content.parts.reduce((sum, part) => sum + part.length, 0) !== content.encodedLength) {
            return failure("its parts' lengths don't add up to the content's length");
        }
    }
    return Object.freeze({
        manifest: Object.freeze({
            author: post.author,
            permlink: post.permlink,
            version,
            ...content,
            inline,
            data
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
        if (!isPlainObject(part) || !PERMLINK_PATTERN.test(part.permlink ?? '') || !Number.isInteger(part.length) || part.length < 1 || !/^[0-9a-f]{64}$/.test(part.sha256 ?? '')) {
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
