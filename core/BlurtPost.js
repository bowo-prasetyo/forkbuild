import { isNonEmptyString, isPlainObject } from '../utils/typeGuards.js';
import { STEEM_NOTICE_AUTHOR_MAX, STEEM_NOTICE_TITLE_MAX, isSteemNoticeImageUrl, steemNoticeClean, steemNoticeEscape, steemNoticeText } from './SteemContentManifest.js';
import { descriptionPlainText, parseDescription } from './DescriptionMarkup.js';

// What ForkBuild posts on Blurt (docs/Protocol.md, "Proposed: Blurt
// Substrate"): build posts, top-level posts by the poster's own account that
// carry announcements and anchors in `json_metadata.forkbuild`, and content
// manifests and parts, replies under a build post. This file builds the
// operations and reads posts back; posting, network and signing live
// elsewhere. Nothing here declines payout: Blurt has no downvotes, so posts
// keep the chain's default payout.

export const BLURT_STORAGE = 'blurt';
export const BLURT_CATEGORY = 'forkbuild';
export const BLURT_POST_VERSION = 1;
export const BLURT_FAMILIES = Object.freeze(['publication', 'snapshot', 'place-naming', 'commentary']);
// The chain refuses a transaction larger than this.
export const BLURT_MAX_TRANSACTION_BYTES = 64 * 1024;
// A build post grows by edits; past these it is full and a new one starts.
export const BLURT_BUILD_POST_MAX_ANNOUNCEMENTS = 16;
export const BLURT_BUILD_POST_MAX_ANCHORS = 16;
export const BLURT_BUILD_POST_MAX_BYTES = 56 * 1024;
export const BLURT_CONTENT_URI_PREFIX = 'blurt://';
export const BLURT_CONTENT_ENCODINGS = Object.freeze(['utf8', 'gzip-base64']);
// As on Steem: the most encoded text one post holds, measured escaped as a
// JSON string, and the most parts one upload may have.
export const BLURT_CONTENT_PART_MAX_BYTES = 48 * 1024;
export const BLURT_CONTENT_MAX_PARTS = 20;

const BLURT_FRONT_END_URL = 'https://blurt.blog';
const PROJECT_URL = 'https://github.com/bowo-prasetyo/forkbuild';
const ABOUT_URL = `${PROJECT_URL}/blob/main/docs/Protocol.md#proposed-blurt-substrate`;
const PERMLINK_SUFFIX_PATTERN = /^[a-z0-9]{8}$/;
// Blurt permlinks: lowercase letters, digits and hyphens, at most 256.
const PERMLINK_PATTERN = /^[a-z0-9-]{1,256}$/;
// Blurt account names: 3–16 characters, dot-separated segments that start
// with a letter, as on Steem.
const ACCOUNT_PATTERN = /^(?=.{3,16}$)[a-z][a-z0-9-]*[a-z0-9](\.[a-z][a-z0-9-]*[a-z0-9])*$/;
const TITLE_MAX = 100;

const FAMILY_LINES = Object.freeze({
    publication: 'an announcement of where its signed publication record is stored',
    snapshot: "an announcement of where the build's data is stored, with its content hash",
    'place-naming': 'a signed name for a place in a ForkBuild world',
    commentary: 'a signed comment on a ForkBuild publication'
});
const FAMILY_TITLES = Object.freeze({
    publication: 'A build made with ForkBuild',
    snapshot: 'A build made with ForkBuild',
    'place-naming': 'A place named in ForkBuild',
    commentary: 'A comment on a ForkBuild build'
});

export function isBlurtAccountName(account) {
    return typeof account === 'string' && ACCOUNT_PATTERN.test(account);
}

export function isBlurtFamily(family) {
    return BLURT_FAMILIES.includes(family);
}

// The tag a family's announcements are listed under, the same string as the
// family's Nostr tag.
export function blurtFamilyTag(family) {
    if (!isBlurtFamily(family)) throw new TypeError(`unknown Blurt family: ${family}`);
    return `${BLURT_CATEGORY}-${family}`;
}

export function blurtPostUrl(author, permlink) {
    return `${BLURT_FRONT_END_URL}/@${author}/${permlink}`;
}

export function blurtTagUrl(tag) {
    return `${BLURT_FRONT_END_URL}/created/${tag}`;
}

// A build post's permlink: unique per author, from the time and eight random
// lowercase letters or digits the caller supplies.
export function blurtBuildPostPermlink(timeMs, suffix) {
    return `${BLURT_CATEGORY}-${permlinkStamp(timeMs, suffix)}`;
}

export function blurtContentManifestPermlink(timeMs, suffix) {
    return `${BLURT_CATEGORY}-c-${permlinkStamp(timeMs, suffix)}`;
}

export function blurtContentPartPermlink(manifestPermlink, index) {
    if (!PERMLINK_PATTERN.test(manifestPermlink ?? '')) throw new TypeError(`not a Blurt permlink: ${manifestPermlink}`);
    if (!Number.isInteger(index) || index < 0) throw new TypeError(`index must be a non-negative integer, got ${index}`);
    return `${manifestPermlink}-p${index}`;
}

function permlinkStamp(timeMs, suffix) {
    if (!Number.isInteger(timeMs) || timeMs < 0) throw new TypeError(`timeMs must be a non-negative integer, got ${timeMs}`);
    if (!PERMLINK_SUFFIX_PATTERN.test(suffix)) throw new TypeError(`suffix must be eight lowercase letters or digits, got ${suffix}`);
    return `${timeMs.toString(36)}-${suffix}`;
}

// An upper bound on the signed transaction's size: the chain's binary form
// is smaller than the operations' JSON.
export function blurtOperationsByteLength(operations) {
    return new TextEncoder().encode(JSON.stringify(operations)).length;
}

// --- Build posts --------------------------------------------------------

// What a build post carries, as the poster keeps it between edits:
// `announcements` ([{ family, envelope }]), `anchors` (contentHashes),
// `storedCount` (content manifests replying to it), and, for people,
// `card` ({ title, author, description, imageUrl }) and `viewUrl` (the
// app's view of the build).
export function emptyBlurtBuildPost() {
    return Object.freeze({ announcements: Object.freeze([]), anchors: Object.freeze([]), storedCount: 0, card: null, viewUrl: null });
}

// Whether `state` can take one more announcement or anchor.
export function blurtBuildPostHasRoom(state, { announcement = false, anchor = false } = {}) {
    if (announcement && state.announcements.length >= BLURT_BUILD_POST_MAX_ANNOUNCEMENTS) return false;
    if (anchor && state.anchors.length >= BLURT_BUILD_POST_MAX_ANCHORS) return false;
    return true;
}

// The one `comment` operation that posts, or edits, a build post.
export function blurtBuildPostOperation({ author, permlink, state, appVersion = null }) {
    if (!isBlurtAccountName(author)) throw new TypeError(`not a Blurt account name: ${author}`);
    if (!PERMLINK_PATTERN.test(permlink ?? '')) throw new TypeError(`not a Blurt permlink: ${permlink}`);
    const announcements = state.announcements.map(({ family, envelope }) => {
        if (!isBlurtFamily(family)) throw new TypeError(`unknown Blurt family: ${family}`);
        if (!isPlainObject(envelope)) throw new TypeError('an announcement\'s envelope must be an object');
        return { family, envelope };
    });
    if (announcements.length > BLURT_BUILD_POST_MAX_ANNOUNCEMENTS) throw new TypeError('too many announcements for one build post');
    if (state.anchors.length > BLURT_BUILD_POST_MAX_ANCHORS || !state.anchors.every(isNonEmptyString)) throw new TypeError('anchors must be at most 16 contentHashes');
    const families = [...new Set(announcements.map(({ family }) => family))];
    const card = cardFor(state);
    const metadata = {
        ...(isNonEmptyString(appVersion) ? { app: `forkbuild/${appVersion}` } : {}),
        tags: [BLURT_CATEGORY, ...families.map(blurtFamilyTag)],
        ...(card && isSteemNoticeImageUrl(card.imageUrl) ? { image: [card.imageUrl] } : {}),
        forkbuild: { version: BLURT_POST_VERSION, announcements, anchors: [...state.anchors] }
    };
    return ['comment', {
        parent_author: '',
        parent_permlink: BLURT_CATEGORY,
        author,
        permlink,
        title: blurtBuildPostTitle(state),
        body: blurtBuildPostBody(state),
        json_metadata: JSON.stringify(metadata)
    }];
}

// The card is shown only with a link to show the build at.
function cardFor(state) {
    return state.viewUrl && state.card && typeof state.card === 'object' ? state.card : null;
}

export function blurtBuildPostTitle(state) {
    const card = cardFor(state);
    const title = blurtTitleText(card?.title);
    if (title) return title;
    const families = state.announcements.map(({ family }) => family);
    for (const family of BLURT_FAMILIES) {
        if (families.includes(family)) return FAMILY_TITLES[family];
    }
    if (state.anchors.length > 0) return 'A ForkBuild anchor';
    return 'Data stored by ForkBuild';
}

// A plain-text title: one line, without control or direction-override
// characters, at most 100 characters. Front ends show titles as text, so
// nothing is escaped.
export function blurtTitleText(value) {
    if (typeof value !== 'string') return '';
    const text = value.normalize('NFC')
        .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const characters = Array.from(text);
    return characters.length > TITLE_MAX ? `${characters.slice(0, TITLE_MAX - 1).join('').trimEnd()}…` : text;
}

export function blurtBuildPostBody(state) {
    const card = cardFor(state);
    const sections = [];
    if (card) sections.push(...cardLines(state.viewUrl, card));
    else if (state.viewUrl) sections.push(`[See it in 3D](${state.viewUrl})`);
    const carried = [];
    const families = state.announcements.map(({ family }) => family);
    for (const family of BLURT_FAMILIES) {
        const count = families.filter((f) => f === family).length;
        if (count > 0) carried.push(`- ${count === 1 ? FAMILY_LINES[family] : `${count} × ${FAMILY_LINES[family]}`}`);
    }
    if (state.storedCount > 0) carried.push(`- data stored for the app, in ${state.storedCount === 1 ? 'the reply' : 'the replies'} below`);
    if (state.anchors.length > 0) carried.push(`- ${state.anchors.length === 1 ? 'an anchor for a build\'s content hash' : `anchors for ${state.anchors.length} builds' content hashes`}`);
    sections.push(
        `Made with [ForkBuild](${PROJECT_URL}), where builds are shared without a central server. This post carries, for the ForkBuild app:`,
        carried.join('\n'),
        `The app reads them from this post's metadata and checks every content hash and signature itself; it doesn't treat the Blurt account that posted them as their author. [What this is](${ABOUT_URL})`
    );
    return sections.join('\n\n');
}

// The longest description a Blurt post shows, in characters.
export const BLURT_POST_DESCRIPTION_MAX = 2000;

function cardLines(viewUrl, { title = null, author = null, description = null, imageUrl = null }) {
    const safeTitle = steemNoticeText(title, STEEM_NOTICE_TITLE_MAX) || 'An untitled build';
    const safeAuthor = steemNoticeText(author, STEEM_NOTICE_AUTHOR_MAX);
    const paragraphs = sameWords(descriptionPlainText(description), title) ? [] : descriptionMarkdown(description, BLURT_POST_DESCRIPTION_MAX);
    return [
        ...(isSteemNoticeImageUrl(imageUrl) ? [`[![${safeTitle}](${imageUrl})](${viewUrl})`] : []),
        `**${safeTitle}**${safeAuthor ? ` by ${safeAuthor}` : ''}`,
        ...paragraphs,
        `[See it in 3D](${viewUrl})`
    ];
}

// The build's description in a Blurt post: unlike Steem's one-line preview,
// the post is its author's own, so the description is shown whole, with
// the formatting it may use (core/DescriptionMarkup.js: paragraphs,
// headings, bullet lists, bold, italic) written back as Markdown and
// everything else made safe as on Steem: no links or HTML, other Markdown
// escaped, mentions and tags broken. It is cut with "…" only past
// `maxLength` characters of text (every byte is paid for, on every edit too).
// Returns its blocks, each one Markdown paragraph.
function descriptionMarkdown(description, maxLength) {
    if (typeof description !== 'string') return [];
    const cleaned = description.replace(/\r\n?/g, '\n').split('\n').map(steemNoticeClean).join('\n');
    let left = maxLength;
    let cut = false;
    // The runs' Markdown, within what is left of `maxLength`.
    const write = (runs) => {
        let markdown = '';
        for (const run of runs) {
            if (cut) break;
            let text = run.text;
            const length = Array.from(text).length;
            if (length > left) {
                text = `${Array.from(text).slice(0, Math.max(0, left - 1)).join('').trimEnd()}…`;
                cut = true;
            }
            left -= Math.min(length, left);
            markdown += styled(steemNoticeEscape(text), run);
        }
        return markdown;
    };
    const markdownBlocks = [];
    for (const block of parseDescription(cleaned)) {
        if (cut) break;
        if (left <= 0) {
            // Text left over after the last block shown is marked as cut.
            markdownBlocks[markdownBlocks.length - 1] += '…';
            break;
        }
        if (block.type === 'heading') {
            markdownBlocks.push(`### ${write(block.runs)}`);
        } else if (block.type === 'list') {
            const items = [];
            for (const item of block.items) {
                if (cut || left <= 0) break;
                items.push(`- ${write(item)}`);
            }
            markdownBlocks.push(items.join('\n'));
        } else {
            const lines = [];
            for (const line of block.lines) {
                if (cut || left <= 0) break;
                lines.push(lineStart(write(line)));
            }
            // A line break within a paragraph: two spaces, then the next line.
            markdownBlocks.push(lines.join('  \n'));
        }
    }
    return markdownBlocks.filter((block) => block.trim() !== '');
}

// Bold and italic around text that is already escaped. Markers may not sit
// next to spaces, so those stay outside them.
function styled(escaped, { bold, italic }) {
    const marker = `${bold ? '**' : ''}${italic ? '*' : ''}`;
    if (!marker) return escaped;
    const [, before, inner, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(escaped);
    return inner ? `${before}${marker}${inner}${[...marker].reverse().join('')}${after}` : escaped;
}

// A paragraph line that would read as an ordered list item stays text.
function lineStart(markdown) {
    return markdown.replace(/^(\d+)([.)])/, '$1\\$2');
}

// Whether two texts say the same, ignoring case, spacing and punctuation.
function sameWords(a, b) {
    const words = (text) => (typeof text === 'string' ? text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() : '');
    return words(a) !== '' && words(a) === words(b);
}

// Returns `{ author, permlink, created, announcements, anchors }` for a
// build post as condenser_api returns it, or null for anything else.
// Anyone can post under the tag, so null is the common case for noise and
// never an error.
export function parseBlurtBuildPost(post) {
    if (!isPlainObject(post) || post.parent_author !== '' || post.parent_permlink !== BLURT_CATEGORY) return null;
    if (!isBlurtAccountName(post.author) || !isNonEmptyString(post.permlink)) return null;
    const forkbuild = forkbuildOf(post.json_metadata);
    if (!forkbuild || forkbuild.version !== BLURT_POST_VERSION || !Array.isArray(forkbuild.announcements)) return null;
    const announcements = forkbuild.announcements
        .slice(0, BLURT_BUILD_POST_MAX_ANNOUNCEMENTS)
        .filter((entry) => isPlainObject(entry) && isBlurtFamily(entry.family) && isPlainObject(entry.envelope))
        .map(({ family, envelope }) => Object.freeze({ family, envelope }));
    const anchors = Array.isArray(forkbuild.anchors) ? forkbuild.anchors.filter(isNonEmptyString).slice(0, BLURT_BUILD_POST_MAX_ANCHORS) : [];
    return Object.freeze({
        author: post.author,
        permlink: post.permlink,
        created: typeof post.created === 'string' ? post.created : null,
        announcements: Object.freeze(announcements),
        anchors: Object.freeze(anchors)
    });
}

// --- Anchors ------------------------------------------------------------

// The contentHashes a post's `json_metadata` commits to: its `anchors`, its
// Snapshot announcements' contentHashes, and a content manifest's own.
export function blurtPostCommitments(jsonMetadata) {
    const forkbuild = forkbuildOf(jsonMetadata);
    const hashes = new Set();
    if (!forkbuild || forkbuild.version !== BLURT_POST_VERSION) return hashes;
    if (Array.isArray(forkbuild.anchors)) {
        for (const hash of forkbuild.anchors) if (isNonEmptyString(hash)) hashes.add(hash);
    }
    if (Array.isArray(forkbuild.announcements)) {
        for (const entry of forkbuild.announcements) {
            if (entry?.family === 'snapshot' && isNonEmptyString(entry.envelope?.contentHash)) hashes.add(entry.envelope.contentHash);
        }
    }
    if (isNonEmptyString(forkbuild.content?.contentHash)) hashes.add(forkbuild.content.contentHash);
    return hashes;
}

// --- Content --------------------------------------------------------------

export function blurtContentLocator(author, permlink) {
    if (!isBlurtAccountName(author)) throw new TypeError(`not a Blurt account name: ${author}`);
    if (!PERMLINK_PATTERN.test(permlink ?? '')) throw new TypeError(`not a Blurt permlink: ${permlink}`);
    return `${BLURT_CONTENT_URI_PREFIX}${author}/${permlink}`;
}

// `{ author, permlink }` for a `blurt://<author>/<permlink>` locator, or
// null for anything else.
export function parseBlurtContentLocator(uri) {
    if (typeof uri !== 'string' || !uri.startsWith(BLURT_CONTENT_URI_PREFIX)) return null;
    const [author, permlink, ...rest] = uri.slice(BLURT_CONTENT_URI_PREFIX.length).split('/');
    if (rest.length > 0 || !isBlurtAccountName(author) || !PERMLINK_PATTERN.test(permlink ?? '')) return null;
    return Object.freeze({ author, permlink });
}

// The body of a manifest or part: what the post is, for people. A Signed
// Claim's manifest links to the app's view of it, with the build's card
// when there is one.
export function blurtContentNotice({ parts = 0, part = null, viewUrl = null, card = null } = {}) {
    const end = `It is read by the ForkBuild app, not meant to be read here. [What this is](${ABOUT_URL})`;
    if (part) return `Part ${part.index + 1} of ${part.count} of data stored by ForkBuild. ${end}`;
    if (viewUrl && card) return [...cardLines(viewUrl, card).slice(0, -1), `[See it in 3D](${viewUrl}) · This reply holds the build's signed record for the ForkBuild app. [What this is](${ABOUT_URL})`].join('\n\n');
    if (viewUrl) return `A build made with ForkBuild: [see it in 3D](${viewUrl}). This reply holds its signed record for the ForkBuild app. [What this is](${ABOUT_URL})`;
    if (parts > 0) return `Data stored by ForkBuild, continued in ${parts} ${parts === 1 ? 'reply' : 'replies'} below. ${end}`;
    return `Data stored by ForkBuild. ${end}`;
}

// A manifest, a reply to the build post `parentPermlink` by the same
// author. `content` describes the content (`parts` listing each part's
// `{ permlink, length, sha256 }`); `data` is the encoded content when it is
// inline.
export function blurtContentManifestOperation({ author, parentPermlink, permlink, content, data, appVersion = null, viewUrl = null, card = null }) {
    if (!isBlurtAccountName(author)) throw new TypeError(`not a Blurt account name: ${author}`);
    if (!PERMLINK_PATTERN.test(parentPermlink ?? '')) throw new TypeError(`not a Blurt permlink: ${parentPermlink}`);
    if (!PERMLINK_PATTERN.test(permlink ?? '')) throw new TypeError(`not a Blurt permlink: ${permlink}`);
    const problem = contentProblem(content);
    if (problem) throw new TypeError(`the content description is malformed: ${problem}`);
    const inline = content.parts.length === 0;
    if (inline && (typeof data !== 'string' || data.length !== content.encodedLength)) {
        throw new TypeError('an inline manifest\'s data must be the encoded content');
    }
    if (viewUrl !== null && !/^https:\/\/[^\s()]+$/.test(viewUrl)) throw new TypeError(`not a link for a notice: ${viewUrl}`);
    const withCard = viewUrl !== null && card !== null && typeof card === 'object';
    const metadata = {
        ...(isNonEmptyString(appVersion) ? { app: `forkbuild/${appVersion}` } : {}),
        ...(withCard && isSteemNoticeImageUrl(card.imageUrl) ? { image: [card.imageUrl] } : {}),
        forkbuild: { version: BLURT_POST_VERSION, content: copyContent(content), ...(inline ? { data } : {}) }
    };
    return ['comment', {
        parent_author: author,
        parent_permlink: parentPermlink,
        author,
        permlink,
        title: '',
        body: blurtContentNotice({ parts: content.parts.length, viewUrl, card: withCard ? card : null }),
        json_metadata: JSON.stringify(metadata)
    }];
}

// Part `index` of `count`: a reply to the manifest. Posting it again with
// the same permlink edits it.
export function blurtContentPartOperation({ author, manifestPermlink, index, count, data, appVersion = null }) {
    if (!isBlurtAccountName(author)) throw new TypeError(`not a Blurt account name: ${author}`);
    if (!Number.isInteger(count) || count < 1 || count > BLURT_CONTENT_MAX_PARTS || !Number.isInteger(index) || index < 0 || index >= count) {
        throw new TypeError(`part ${index} of ${count} is out of range`);
    }
    if (typeof data !== 'string' || data.length === 0) throw new TypeError('a part\'s data must be non-empty text');
    const metadata = {
        ...(isNonEmptyString(appVersion) ? { app: `forkbuild/${appVersion}` } : {}),
        forkbuild: { version: BLURT_POST_VERSION, part: { index, count }, data }
    };
    return ['comment', {
        parent_author: author,
        parent_permlink: manifestPermlink,
        author,
        permlink: blurtContentPartPermlink(manifestPermlink, index),
        title: '',
        body: blurtContentNotice({ part: { index, count } }),
        json_metadata: JSON.stringify(metadata)
    }];
}

// The encoded text a part carries, or null when there is none.
export function blurtContentPartData(post) {
    if (!isPlainObject(post)) return null;
    const forkbuild = forkbuildOf(post.json_metadata);
    if (!forkbuild || forkbuild.version !== BLURT_POST_VERSION) return null;
    return typeof forkbuild.data === 'string' ? forkbuild.data : null;
}

// Whether a post is part `index` of `manifest`, as the manifest lists it.
// The hash is checked by the caller, which has WebCrypto. Returns a problem,
// or null.
export function blurtContentPartProblem(post, manifest, index) {
    const listed = manifest.parts[index];
    const which = `part ${index + 1} of ${manifest.parts.length}`;
    if (!isPlainObject(post) || !post.author) return `${which} is missing`;
    if (post.author !== manifest.author || post.parent_author !== manifest.author || post.parent_permlink !== manifest.permlink || post.permlink !== listed.permlink) {
        return `${which} is not the one the manifest lists`;
    }
    const data = blurtContentPartData(post);
    if (data === null) return `${which} carries no ForkBuild data (its json_metadata is missing or was cut short)`;
    if (data.length !== listed.length) return `${which} has been changed since the content was stored`;
    return null;
}

// Reads what `condenser_api.get_content` returned for a manifest. Returns
// `{ manifest, problem }`. A missing post comes back as `author: ''`.
export function describeBlurtContentManifest(post) {
    if (!isPlainObject(post) || !post.author) return failure('the post does not exist');
    if (!isNonEmptyString(post.permlink)) return failure('the post has no permlink');
    const forkbuild = forkbuildOf(post.json_metadata);
    if (!forkbuild || forkbuild.version !== BLURT_POST_VERSION || !isPlainObject(forkbuild.content)) {
        return failure('the post does not describe ForkBuild content');
    }
    const problem = contentProblem(forkbuild.content);
    if (problem) return failure(`the content description is malformed: ${problem}`);
    const content = copyContent(forkbuild.content);
    const inline = content.parts.length === 0;
    const data = inline ? forkbuild.data : null;
    if (inline && (typeof data !== 'string' || data.length !== content.encodedLength)) {
        return failure('the post has been changed since the content was stored');
    }
    if (!inline) {
        if (content.parts.length > BLURT_CONTENT_MAX_PARTS) return failure(`it lists ${content.parts.length} parts, more than the ${BLURT_CONTENT_MAX_PARTS} ForkBuild reads`);
        if (content.parts.some((part, index) => part.permlink !== blurtContentPartPermlink(post.permlink, index))) {
            return failure('its parts are not replies ForkBuild would have made');
        }
        if (content.parts.reduce((sum, part) => sum + part.length, 0) !== content.encodedLength) {
            return failure("its parts' lengths don't add up to the content's length");
        }
    }
    return Object.freeze({
        manifest: Object.freeze({ author: post.author, permlink: post.permlink, ...content, inline, data }),
        problem: null
    });
}

function contentProblem(content) {
    if (!isPlainObject(content)) return 'no content description';
    if (!isNonEmptyString(content.contentHash)) return 'no contentHash';
    if (!isNonEmptyString(content.algorithm)) return 'no algorithm';
    if (!isNonEmptyString(content.mediaType)) return 'no mediaType';
    if (!Number.isInteger(content.size) || content.size < 0) return 'size is not a non-negative integer';
    if (!BLURT_CONTENT_ENCODINGS.includes(content.encoding)) return `unknown encoding ${content.encoding}`;
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

// `json_metadata.forkbuild`, or null. condenser_api returns the metadata as
// text; some APIs return it parsed.
function forkbuildOf(jsonMetadata) {
    let metadata = jsonMetadata;
    if (typeof metadata === 'string') {
        if (metadata.length === 0) return null;
        try {
            metadata = JSON.parse(metadata);
        } catch {
            return null;
        }
    }
    return isPlainObject(metadata) && isPlainObject(metadata.forkbuild) ? metadata.forkbuild : null;
}
