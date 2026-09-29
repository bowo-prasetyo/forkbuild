import { message } from '../../core/Message.js';

// The line shown while content is being stored on Steem, from the progress
// SteemContentStore reports, as a message (core/Message.js), or null when
// nothing is in progress. Finished and failed uploads are shown by their
// result or error instead. Each combination of resuming and Resource Credits
// is its own whole message, since sentences aren't joined the same way in
// every language.
export function describeSteemContentUploadProgress(state) {
    if (!state || !['describing', 'checking', 'posting'].includes(state.phase)) return null;
    if (state.phase === 'describing') return message('steemUpload.describing');
    if (state.phase === 'checking') return message('steemUpload.checking');
    const params = { done: state.done, count: state.total };
    const credits = state.resourceCredits
        ? { needed: state.resourceCredits.neededPercent, available: state.resourceCredits.availablePercent }
        : null;
    const variant = `${state.resumed ? 'Resumed' : ''}${credits ? 'WithCredits' : ''}`;
    return message(`steemUpload.posting${variant}`, credits ? { ...params, ...credits } : params);
}
