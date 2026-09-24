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
