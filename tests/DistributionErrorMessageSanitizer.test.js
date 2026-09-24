import { sanitizeDistributionErrorMessage } from '../application/publication/distribution/DistributionErrorMessageSanitizer.js';
import { assert } from './support/Assert.js';

// Post-Publish Distribution Error Sanitization.
//
// EditorView.js's own distributePublishedDocument() previously reported one
// fixed, generic notice on ANY distribution failure — safe, but useless to
// a user trying to tell "no wallet extension installed" apart from a real,
// unexpected failure. sanitizeDistributionErrorMessage() lets that caller
// show the underlying cause when it can be stripped down to something safe
// to display, and returns null (never a guess, never an empty string) when
// it cannot — see that module's own header for the full rationale.

async function run() {
    {
        assert(sanitizeDistributionErrorMessage(null) === null, '1. null input -> null');
        assert(sanitizeDistributionErrorMessage(undefined) === null, '2. undefined input -> null');
        assert(sanitizeDistributionErrorMessage('') === null, '3. empty string input -> null');
        assert(sanitizeDistributionErrorMessage(new Error('')) === null, '4. an Error with an empty message -> null');
        assert(sanitizeDistributionErrorMessage({}) === null, '5. a plain object with no message field -> null');
        console.log('✓ Section A: absent/empty input always yields null, never a guess or an empty string');
    }

    {
        const plain = 'User rejected the request.';
        assert(sanitizeDistributionErrorMessage(new Error(plain)) === plain, '6. an ordinary Error message with nothing sensitive passes through unchanged');
        assert(sanitizeDistributionErrorMessage(plain) === plain, '7. a bare string is accepted exactly like an Error\'s own .message');
        console.log('✓ Section B: a safe, ordinary message passes through unchanged, from either an Error or a bare string');
    }

    {
        const nostrMessage = 'This device has no Nostr (NIP-07) publishing capability configured yet.';
        const arweaveMessage = 'This device has no Arweave wallet/signing capability configured yet.';
        assert(sanitizeDistributionErrorMessage(new Error(nostrMessage)) === nostrMessage, '8. the existing "no Nostr capability" message survives unchanged — the single most common, actionable cause');
        assert(sanitizeDistributionErrorMessage(new Error(arweaveMessage)) === arweaveMessage, '9. the existing "no Arweave wallet capability" message survives unchanged');
        console.log('✓ Section C: FLAGSHIP — the codebase\'s own existing "no wallet configured" messages survive sanitization verbatim, so the most common real failure becomes actionable');
    }

    {
        const withUrl = sanitizeDistributionErrorMessage(new Error('Failed to connect to relay wss://relay.example.com/v1'));
        assert(withUrl === 'Failed to connect to relay [redacted]', `10. a URL is redacted, the surrounding cause kept: got "${withUrl}"`);
        const withHost = sanitizeDistributionErrorMessage(new Error('DNS lookup failed for internal-signer.corp.local'));
        assert(withHost.includes('[redacted]') && !withHost.includes('internal-signer'), `11. a bare hostname is redacted: got "${withHost}"`);
        console.log('✓ Section D: URLs and hostnames are redacted, never shown to the user');
    }

    {
        const withIPv4 = sanitizeDistributionErrorMessage(new Error('Could not reach 10.0.4.201:8443'));
        assert(withIPv4 === 'Could not reach [redacted]', `12. an IPv4 address (with port) is redacted: got "${withIPv4}"`);
        console.log('✓ Section E: IP addresses are redacted, never shown to the user');
    }

    {
        const withPath = sanitizeDistributionErrorMessage(new Error('ENOENT: no such file or directory, open /var/lib/app/secrets/wallet.key'));
        assert(!withPath.includes('/var/lib') && !withPath.includes('wallet.key'), `13. a filesystem path is redacted: got "${withPath}"`);
        console.log('✓ Section F: filesystem paths are redacted, never shown to the user');
    }

    {
        const withStack = sanitizeDistributionErrorMessage(new Error('signing failed\n    at Object.sign (file.js:42:10)\n    at async distribute (other.js:9:3)'));
        assert(withStack === 'signing failed', `14. only the first line survives — a stack trace never reaches the user: got "${withStack}"`);
        const withInlineFrame = sanitizeDistributionErrorMessage(new Error('signing failed at Object.sign (file.js:42:10)'));
        assert(withInlineFrame === 'signing failed', `15. an inline " at <frame>" marker is stripped even without a newline: got "${withInlineFrame}"`);
        console.log('✓ Section G: stack traces are stripped down to the first line, on their own line or inline');
    }

    {
        const withVersion = sanitizeDistributionErrorMessage(new Error('incompatible provider version 2.14.3-beta.1 detected'));
        assert(!withVersion.includes('2.14.3'), `16. a semantic version string is redacted: got "${withVersion}"`);
        console.log('✓ Section H: library version strings are redacted, never shown to the user');
    }

    {
        const withToken = sanitizeDistributionErrorMessage(new Error('rejected token 9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c signature'));
        assert(!withToken.includes('9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c'), `17. a long opaque token is redacted: got "${withToken}"`);
        console.log('✓ Section I: long opaque tokens (keys, hashes, auth material) are redacted, never shown to the user');
    }

    {
        // FLAGSHIP regression — the exact false positive a real wallet
        // extension failure produced live: a long, pure-letter PascalCase
        // class/file name (no digits) is NOT an opaque token and must
        // survive, since it's exactly what makes an attributed error
        // ("X: wallet extension rejected sign() — ...") useful in the
        // first place.
        const attributed = sanitizeDistributionErrorMessage(new Error('ArweaveInjectedProviderSigner: wallet extension rejected sign() — expected to be not undefined'));
        assert(attributed === 'ArweaveInjectedProviderSigner: wallet extension rejected sign() — expected to be not undefined',
            `17b. a long pure-letter identifier with no digits (a class/file name) passes through unredacted: got "${attributed}"`);
        console.log('✓ Section I2: a long PascalCase identifier with no digits (a class/file name attributing the failure) is never mistaken for an opaque token');
    }

    {
        const allSensitive = sanitizeDistributionErrorMessage(new Error('https://relay.example.com/9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c'));
        assert(allSensitive === null, `18. a message that is ENTIRELY sensitive content redacts down to nothing, and returns null rather than a bare "[redacted]": got "${allSensitive}"`);
        console.log('✓ Section J: a message with no safe residual returns null — never a bare redaction marker standing in for a real message');
    }

    {
        const long = 'this went wrong and then '.repeat(15).trim();
        const truncated = sanitizeDistributionErrorMessage(new Error(long));
        assert(truncated.length <= 161, `19. an overlong safe message is truncated: got length ${truncated.length}`);
        assert(truncated.endsWith('…'), '20. a truncated message is marked with an ellipsis so it never reads as complete');
        console.log('✓ Section K: an overlong message is truncated with a trailing ellipsis, never left to grow unbounded');
    }

    console.log('\nAll DistributionErrorMessageSanitizer tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
