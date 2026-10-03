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

// The warning shown when a Steem notice went without its build's picture,
// from `{ title, reason, at }` (ui/main/composeWorldDiscovery.js), as a
// message, or null. Only a problem from `since` (ms) on is shown, so a
// dialog or page never shows one from before it opened.
export function describeSteemNoticePictureProblem(problem, since = 0) {
    if (!problem || typeof problem.at !== 'number' || problem.at < since) return null;
    const reason = typeof problem.reason === 'string' && problem.reason.trim() ? problem.reason.trim() : '?';
    return problem.title
        ? message('steemUpload.noPicture', { title: problem.title, reason })
        : message('steemUpload.noPictureUntitled', { reason });
}
