import { createSteemPublicationNoticeDescriber } from './SteemPublicationNoticeCard.js';
import { CreateBrickRegistryUseCase } from '../editor/CreateBrickRegistryUseCase.js';
import { DEFAULT_STEEM_IMAGE_RELAY, createSteemKeychainImageSigner, uploadSteemImage } from '../../steem/SteemImageUpload.js';

// The describer for Signed Claim notices on Steem, in the browser: the build
// comes from the local content store, its thumbnail is drawn by the same
// renderer as the Repository's (320×200, created on first use), and the
// picture is signed through Steem Keychain as `getAccount()` and uploaded to
// the Steem image host, through ForkBuild's relay when the browser can't reach
// the host directly. `onPictureMissing({ title, reason })` hears why a notice
// goes without its picture.
export function composeSteemPublicationNoticeDescriber({ contentStore, getAccount, keychain = () => globalThis.steem_keychain, onPictureMissing = null }) {
    let renderer = null;
    return createSteemPublicationNoticeDescriber({
        loadSnapshotText: async (hash) => {
            const bytes = await readContent(contentStore, { hash });
            return typeof bytes === 'string' ? bytes : (bytes ? new TextDecoder().decode(bytes) : null);
        },
        renderThumbnail: async (document) => {
            if (!renderer) {
                // Imported here, not at the top, so Three.js loads only when a notice needs a picture.
                const { DocumentThumbnailRenderer } = await import('../../renderer/DocumentThumbnailRenderer.js');
                renderer ??= new DocumentThumbnailRenderer(new CreateBrickRegistryUseCase().execute());
            }
            return dataUrlBytes(renderer.renderDocument(document));
        },
        uploadImage: async (bytes) => {
            const account = getAccount();
            if (!account) throw new Error('no Steem account is set');
            const signer = createSteemKeychainImageSigner({ keychain: keychain() });
            return (await uploadSteemImage({ account, bytes, signer, relay: DEFAULT_STEEM_IMAGE_RELAY, fileName: 'forkbuild-build.png' })).url;
        },
        onPictureMissing
    });
}

// A local store may hold content on disk and not yet in memory; getSync()
// then throws an error whose `ready` settles once it is loaded.
async function readContent(contentStore, reference) {
    if (typeof contentStore.getSync !== 'function') return contentStore.get(reference);
    try {
        return contentStore.getSync(reference);
    } catch (error) {
        if (!error?.ready) throw error;
        await error.ready;
        return contentStore.getSync(reference);
    }
}

function dataUrlBytes(dataUrl) {
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}
