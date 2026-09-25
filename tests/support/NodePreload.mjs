// Test-support only, preloaded by tests/run.mjs for every Node test file.
// It gives Node the two browser pieces the app code expects:
//
// - Vue: the bare `vue` specifier resolves to MinimalVueCompositionApiShim.js
//   (see VueShimLoader.mjs), so ui/ modules can be imported without a DOM.
// - WebRTC: libdatachannel's RTCPeerConnection (node-datachannel) is
//   installed as the browser globals, so peer tests open real connections.
//
// To run one test file by hand:
//
//   node --import ./tests/support/NodePreload.mjs tests/WebRtcPeerTransport.test.js
import { register } from 'node:module';
import * as webRtc from 'node-datachannel/polyfill';

register(new URL('./VueShimLoader.mjs', import.meta.url));

// Test connections run between processes on this machine, so they need
// only local ICE candidates. The app's default STUN servers are dropped:
// reaching them depends on the network (where it is blocked, gathering waits
// out the app's 8-second limit on every connection). Tests that check which
// ICE servers reach a connection inject their own RTCPeerConnection.
//
// Every connection is also recorded, so RunTestFile.mjs can tell when none
// is still open.
const connections = new Set();
globalThis[Symbol.for('forkbuild.tests.peerConnections')] = connections;
class RTCPeerConnection extends webRtc.RTCPeerConnection {
    constructor(configuration = {}, ...rest) {
        super({ ...configuration, iceServers: [] }, ...rest);
        connections.add(new WeakRef(this));
    }
}

for (const [name, value] of Object.entries({ ...webRtc, RTCPeerConnection })) {
    if (name !== 'default' && globalThis[name] === undefined) {
        globalThis[name] = value;
    }
}

// Tests never reach the internet. WebSocket and fetch to anything but this
// machine fail at once, as they would with no network: otherwise a test
// that accidentally reaches a real server passes offline but, where the
// network is open, depends on that server and can hold its process open.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
function isLoopback(url) {
    try { return LOOPBACK_HOSTS.has(new URL(String(url)).hostname); } catch { return true; }
}

const NodeWebSocket = globalThis.WebSocket;
if (NodeWebSocket) {
    globalThis.WebSocket = class WebSocket extends EventTarget {
        constructor(url, protocols) {
            if (isLoopback(url)) return new NodeWebSocket(url, protocols);
            super();
            this.url = String(url);
            this.readyState = WebSocket.CONNECTING;
            setTimeout(() => {
                this.readyState = WebSocket.CLOSED;
                this.dispatchEvent(new Event('error'));
                this.dispatchEvent(Object.assign(new Event('close'), { code: 1006, reason: '', wasClean: false }));
            }, 0);
        }
        send() { throw new Error('WebSocket is not open'); }
        close() {}
    };
    Object.assign(globalThis.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });
}

const nodeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
    const url = typeof input === 'object' && input !== null && 'url' in input ? input.url : input;
    if (!isLoopback(url)) return Promise.reject(new TypeError(`fetch failed: tests do not reach the internet (${url})`));
    return nodeFetch(input, init);
};
