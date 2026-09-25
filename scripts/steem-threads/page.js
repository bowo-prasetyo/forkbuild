import {
    STEEM_DISCOVERY_FAMILIES,
    STEEM_DISCOVERY_THREAD_ACCOUNT,
    describeSteemDiscoveryThreadPost,
    isSteemAccountName,
    steemDiscoveryPeriodOf,
    steemDiscoveryPeriodsFrom,
    steemDiscoveryThreadOperations
} from '../../core/SteemDiscoveryThread.js';
import { DEFAULT_STEEM_API_NODES, createSteemRpcClient } from '../../steem/SteemRpcClient.js';
import { createSteemKeychainBroadcaster } from '../../steem/SteemKeychainBroadcaster.js';
import { checkSteemDiscoveryThreads, createSteemDiscoveryThreads, planSteemDiscoveryThreads } from './SteemThreadCreation.js';

// The current month plus twelve ahead, as docs/Protocol.md asks.
const DEFAULT_MONTHS = 13;

const $ = (id) => document.getElementById(id);
const form = $('settings');
const checkButton = $('check');
const createButton = $('create');
const stopButton = $('stop');
const statusLine = $('status');
const table = $('threads');
const preview = $('preview');

let checked = null;
let running = null;

$('account').value = STEEM_DISCOVERY_THREAD_ACCOUNT;
$('node').value = DEFAULT_STEEM_API_NODES[0];
$('start').value = steemDiscoveryPeriodOf(new Date());
$('months').value = String(DEFAULT_MONTHS);
for (const family of STEEM_DISCOVERY_FAMILIES) {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.name = 'family';
    box.value = family;
    box.checked = true;
    label.append(box, family);
    $('families').append(label);
}

// Any change to the settings makes an earlier check stale.
form.addEventListener('input', () => {
    if (running) return;
    checked = null;
    createButton.disabled = true;
});

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const settings = readSettings();
    if (!settings) return;
    setBusy(true);
    try {
        const targets = planSteemDiscoveryThreads(settings);
        renderRows(targets);
        setStatus(`Checking ${targets.length} threads…`);
        const rpc = createSteemRpcClient({ nodes: [settings.node] });
        const results = await checkSteemDiscoveryThreads({
            rpc,
            account: settings.account,
            targets,
            onChecked: (result) => renderState(result.permlink, describeCheck(result))
        });
        checked = { settings, results };
        const missing = results.filter((r) => !r.exists);
        const broken = results.filter((r) => r.exists && r.problems.length > 0);
        renderPreview(settings.account, missing[0]);
        setStatus([
            `${results.length - missing.length - broken.length} ready, ${missing.length} missing`,
            broken.length > 0 ? `, ${broken.length} with problems (fix those on the chain; this page never edits a thread)` : '',
            missing.length > 0 ? `. Creating them takes about ${Math.ceil(missing.length * 5.25)} minutes.` : '.'
        ].join(''));
        createButton.disabled = missing.length === 0;
    } catch (error) {
        setStatus(`Check failed: ${error.message}`, 'bad');
    } finally {
        setBusy(false);
    }
});

createButton.addEventListener('click', async () => {
    if (!checked) return;
    const broadcaster = createSteemKeychainBroadcaster({ keychain: window.steem_keychain });
    if (!broadcaster) {
        setStatus('Steem Keychain was not found. Install it, unlock it, and reload this page.', 'bad');
        return;
    }
    const { settings, results } = checked;
    const targets = results.filter((r) => !r.exists);
    running = new AbortController();
    setBusy(true);
    createButton.disabled = true;
    stopButton.disabled = false;
    let done = 0;
    let countdown = null;
    try {
        await createSteemDiscoveryThreads({
            rpc: createSteemRpcClient({ nodes: [settings.node] }),
            broadcast: broadcaster.broadcast,
            account: settings.account,
            targets,
            signal: running.signal,
            onProgress(event) {
                clearInterval(countdown);
                const name = event.target.permlink;
                if (event.type === 'waiting') {
                    const tick = () => setStatus(`${done} of ${targets.length} created. Next: ${name} in ${formatWait(event.until - Date.now())} (the chain allows one root post every 5 minutes).`);
                    tick();
                    countdown = setInterval(tick, 1000);
                } else if (event.type === 'signing') {
                    setStatus(`Approve ${name} in Steem Keychain…`);
                    renderState(name, { text: 'waiting for approval', kind: 'missing' });
                } else if (event.type === 'broadcast') {
                    renderState(name, { text: 'broadcast, waiting for it to appear', kind: 'missing' });
                } else if (event.type === 'created' || event.type === 'exists') {
                    done += 1;
                    renderState(name, describeCheck(event.check));
                }
            }
        });
        setStatus(`Done: ${done} of ${targets.length} threads created or already present.`, 'ok');
    } catch (error) {
        const stopped = running.signal.aborted;
        setStatus(stopped ? `Stopped after ${done} of ${targets.length}. Check again before continuing.` : `Stopped: ${error.message}. Check again before continuing.`, stopped ? undefined : 'bad');
    } finally {
        clearInterval(countdown);
        running = null;
        checked = null;
        stopButton.disabled = true;
        createButton.disabled = true;
        setBusy(false);
    }
});

stopButton.addEventListener('click', () => running?.abort(new DOMException('Stopped', 'AbortError')));

window.addEventListener('beforeunload', (event) => {
    if (running) event.preventDefault();
});

function readSettings() {
    const account = $('account').value.trim();
    const node = $('node').value.trim();
    const start = $('start').value;
    const months = Number($('months').value);
    const families = [...document.querySelectorAll('input[name="family"]:checked')].map((box) => box.value);
    if (!isSteemAccountName(account)) return fail(`"${account}" is not a Steem account name.`);
    if (!/^https:\/\//.test(node)) return fail('The API node must be an https:// URL.');
    if (!/^\d{4}-\d{2}$/.test(start)) return fail('Choose a first month.');
    if (!Number.isInteger(months) || months < 1 || months > 36) return fail('Months must be between 1 and 36.');
    if (families.length === 0) return fail('Choose at least one family.');
    return { account, node, families, periods: steemDiscoveryPeriodsFrom(start, months) };
}

function fail(message) {
    setStatus(message, 'bad');
    return null;
}

function describeCheck(result) {
    if (!result.exists) return { text: 'missing', kind: 'missing' };
    if (result.problems.length > 0) return { text: result.problems.join('; '), kind: 'problem' };
    return { text: 'ready', kind: 'ok' };
}

function renderRows(targets) {
    const body = table.tBodies[0];
    body.replaceChildren(...targets.map((target) => {
        const row = document.createElement('tr');
        row.dataset.permlink = target.permlink;
        for (const text of [target.period, target.family, target.permlink, 'checking…']) {
            const cell = document.createElement('td');
            cell.textContent = text;
            row.append(cell);
        }
        return row;
    }));
    table.hidden = false;
}

function renderState(permlink, { text, kind }) {
    const row = [...table.tBodies[0].rows].find((r) => r.dataset.permlink === permlink);
    if (!row) return;
    const cell = row.cells[3];
    cell.textContent = text;
    cell.className = `state-${kind}`;
}

function renderPreview(account, target) {
    preview.hidden = !target;
    if (!target) return;
    const post = describeSteemDiscoveryThreadPost({ account, family: target.family, period: target.period });
    preview.querySelector('pre').textContent = JSON.stringify(steemDiscoveryThreadOperations(post), null, 2);
}

function setBusy(busy) {
    checkButton.disabled = busy;
    for (const input of form.querySelectorAll('input')) input.disabled = busy;
}

function setStatus(text, kind) {
    statusLine.textContent = text;
    statusLine.className = kind ? `state-${kind}` : '';
}

function formatWait(ms) {
    const seconds = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
