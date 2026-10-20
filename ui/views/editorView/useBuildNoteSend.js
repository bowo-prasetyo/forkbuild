import { ref, inject } from 'vue';
import { Findability } from '../../../application/settings/FindabilityStore.js';
import { BuildNoteSendOutcome } from '../../../application/buildNotes/PublishBuildNoteUseCase.js';

// After a publish, sends the build to everyone as a build note
// (core/publication/BuildNote.js) when this device's builder chose "Everyone" under
// Who can find it? (application/settings/FindabilityStore.js), and says how
// it went in the Publish notice. Page-local state only.
//
// `noteStatus`: null before a publish; 'sending', 'sent', 'failed',
// 'too-large' or 'unsigned' for a send; 'link' when this device keeps builds
// to their links; 'kept-to-links' once the builder changed that after a send.
export function useBuildNoteSend() {
    const findabilityStore = inject('findabilityStore', null);
    const publishBuildNoteUseCase = inject('publishBuildNoteUseCase', null);
    const funnel = inject('funnelEventCounter', null);
    const noteStatus = ref(null);
    let lastPublication = null;
    let counted = null;

    function findability() {
        try {
            return findabilityStore ? findabilityStore.get() : null;
        } catch {
            return null;
        }
    }

    async function send(publication) {
        if (!publishBuildNoteUseCase) {
            noteStatus.value = null;
            return;
        }
        noteStatus.value = 'sending';
        const result = await publishBuildNoteUseCase.execute(publication);
        if (publication !== lastPublication) return;
        noteStatus.value = {
            [BuildNoteSendOutcome.SENT]: 'sent',
            [BuildNoteSendOutcome.TOO_LARGE]: 'too-large',
            [BuildNoteSendOutcome.UNSIGNED]: 'unsigned'
        }[result.outcome] || 'failed';
        if (noteStatus.value === 'sent' && counted !== publication.id) {
            counted = publication.id;
            funnel?.publishedFound?.();
        }
    }

    // Called with each just-published Publication.
    function onPublishedForNotes(publication) {
        lastPublication = publication;
        if (!publication || !findabilityStore) {
            noteStatus.value = null;
            return;
        }
        if (findability() === Findability.EVERYONE) {
            send(publication);
        } else {
            noteStatus.value = 'link';
            funnel?.publishedLinkOnly?.();
        }
    }

    function retryNote() {
        if (lastPublication) send(lastPublication);
    }

    // "Let everyone find it", from a notice that kept the build to its link:
    // the choice changes for this device, and this build is sent now.
    function letEveryoneFind() {
        try {
            findabilityStore?.set(Findability.EVERYONE);
        } catch {
            // Sent this once anyway.
        }
        if (lastPublication) send(lastPublication);
    }

    // "Only by link from now on", from a notice that sent the build: this
    // build has gone already, the next ones stay with their links.
    function keepToLinks() {
        try {
            findabilityStore?.set(Findability.LINK);
        } catch {
            return;
        }
        noteStatus.value = 'kept-to-links';
    }

    function dismissNote() {
        lastPublication = null;
        noteStatus.value = null;
    }

    return { noteStatus, onPublishedForNotes, retryNote, letEveryoneFind, keepToLinks, dismissNote };
}
