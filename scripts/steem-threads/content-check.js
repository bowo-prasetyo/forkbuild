import { STEEM_DISCOVERY_THREAD_ACCOUNT, isSteemAccountName } from '../../core/SteemDiscoveryThread.js';
import { parseSteemContentLocator } from '../../core/SteemContentManifest.js';
import { SteemContentStore } from '../../content/SteemContentStore.js';
import { DEFAULT_STEEM_API_NODES, createSteemRpcClient } from '../../steem/SteemRpcClient.js';
import { createSteemKeychainBroadcaster } from '../../steem/SteemKeychainBroadcaster.js';
import { createSteemAnnouncer } from '../../application/steem/SteemAnnouncer.js';
import { createSteemResourceCreditEstimator } from '../../application/steem/SteemResourceCreditEstimator.js';
import { describeSteemContentUploadProgress } from '../../application/steem/SteemContentUploadProgressText.js';
import { readSteemContentCheck, steemContentCheckText, storeSteemContentCheck } from './SteemContentCheck.js';

const $ = (id) => document.getElementById(id);
const form = $('settings');
const storeButton = $('store');
const readButton = $('read');
const statusLine = $('status');
const table = $('results');

let running = false;

$('threadAccount').value = STEEM_DISCOVERY_THREAD_ACCOUNT;
$('nodes').value = DEFAULT_STEEM_API_NODES.join('\n');

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const settings = readSettings();
    if (!settings) return;
    if (!isSteemAccountName(settings.account)) return fail(`"${settings.account}" is not a Steem account name.`);
    const broadcaster = createSteemKeychainBroadcaster({ keychain: window.steem_keychain });
    if (!broadcaster) return fail('Steem Keychain was not found. Install it, unlock it, and reload this page.');
    setBusy(true);
    try {
        const rpc = createSteemRpcClient({ nodes: [settings.nodes[0]] });
        const announcer = createSteemAnnouncer({
            rpc,
            getAccount: () => settings.account,
            getBroadcaster: () => broadcaster,
            threadAccount: settings.threadAccount
        });
        const store = new SteemContentStore({
            rpc,
            announcer,
            threadAccounts: [settings.threadAccount],
            estimator: createSteemResourceCreditEstimator({ rpc })
        });
        const stored = await storeSteemContentCheck({
            store,
            text: steemContentCheckText(),
            onProgress: (state) => {
                const line = describeSteemContentUploadProgress(state);
                if (line) setStatus(line);
            }
        });
        $('locator').value = `${stored.uri}#${stored.hash}`;
        setStatus('Stored. Reading it back from each node…');
        await readBack(settings, stored);
    } catch (error) {
        setStatus(`Storing failed: ${error.message}`, 'bad');
    } finally {
        setBusy(false);
    }
});

readButton.addEventListener('click', async () => {
    const settings = readSettings();
    if (!settings) return;
    const [uri, hash] = $('locator').value.trim().split('#');
    if (!parseSteemContentLocator(uri) || !hash) return fail('Store test content first, or paste a stored one as steem://account/permlink#contenthash.');
    setBusy(true);
    try {
        await readBack(settings, { uri, hash });
    } finally {
        setBusy(false);
    }
});

window.addEventListener('beforeunload', (event) => {
    if (running) event.preventDefault();
});

async function readBack(settings, { uri, hash }) {
    renderRows(settings.nodes);
    const results = await readSteemContentCheck({
        uri,
        hash,
        nodes: settings.nodes,
        threadAccounts: [settings.threadAccount],
        onResult: (result) => renderResult(result)
    });
    const failed = results.filter((r) => !r.ok).length;
    setStatus(failed === 0
        ? `Every node returned the stored content unchanged (${uri}).`
        : `${failed} of ${results.length} nodes did not return the stored content (${uri}).`, failed === 0 ? 'ok' : 'bad');
}

function readSettings() {
    const account = $('account').value.trim();
    const threadAccount = $('threadAccount').value.trim();
    const nodes = $('nodes').value.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!isSteemAccountName(threadAccount)) return fail(`"${threadAccount}" is not a Steem account name.`);
    if (nodes.length === 0) return fail('Add at least one API node.');
    const bad = nodes.find((node) => !/^https:\/\//.test(node));
    if (bad) return fail(`${bad} is not an https:// URL.`);
    return { account, threadAccount, nodes };
}

function fail(message) {
    setStatus(message, 'bad');
    return null;
}

function renderRows(nodes) {
    table.tBodies[0].replaceChildren(...nodes.map((node) => {
        const row = document.createElement('tr');
        row.dataset.node = node;
        for (const text of [node, 'reading…']) {
            const cell = document.createElement('td');
            cell.textContent = text;
            row.append(cell);
        }
        return row;
    }));
    table.hidden = false;
}

function renderResult({ node, ok, message }) {
    const row = [...table.tBodies[0].rows].find((r) => r.dataset.node === node);
    if (!row) return;
    row.cells[1].textContent = message;
    row.cells[1].className = ok ? 'state-ok' : 'state-bad';
}

function setBusy(busy) {
    running = busy;
    storeButton.disabled = busy;
    readButton.disabled = busy;
    for (const input of form.querySelectorAll('input, textarea')) input.disabled = busy;
}

function setStatus(text, kind) {
    statusLine.textContent = text;
    statusLine.className = kind ? `state-${kind}` : '';
}
