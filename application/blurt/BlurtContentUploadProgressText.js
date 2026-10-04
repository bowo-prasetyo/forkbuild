import { message } from '../../core/Message.js';

// The line shown while something is being posted to Blurt, from the progress
// BlurtContentStore reports (or the poster's wait for the chain's interval
// between top-level posts), as a message (core/Message.js), or null when
// nothing is in progress. Each combination of resuming and fees is its own
// whole message, since sentences aren't joined the same way in every
// language.
export function describeBlurtContentUploadProgress(state, now = Date.now()) {
    if (!state || !['describing', 'checking', 'posting', 'waiting'].includes(state.phase)) return null;
    if (state.phase === 'waiting') {
        return message('blurtUpload.waiting', { count: Math.max(1, Math.ceil(((state.untilMs ?? now) - now) / 60000)) });
    }
    if (state.phase === 'describing') return message('blurtUpload.describing');
    if (state.phase === 'checking') return message('blurtUpload.checking');
    const params = { done: state.done, count: state.total };
    const fees = state.fees ? { needed: state.fees.needed, balance: state.fees.balance } : null;
    const variant = `${state.resumed ? 'Resumed' : ''}${fees ? 'WithFees' : ''}`;
    return message(`blurtUpload.posting${variant}`, fees ? { ...params, ...fees } : params);
}

// The warning shown when a Blurt post went without its build's picture,
// from `{ title, reason, at }`, as a message, or null. Only a problem from
// `since` (ms) on is shown.
export function describeBlurtNoticePictureProblem(problem, since = 0) {
    if (!problem || typeof problem.at !== 'number' || problem.at < since) return null;
    const reason = typeof problem.reason === 'string' && problem.reason.trim() ? problem.reason.trim() : '?';
    return problem.title
        ? message('blurtUpload.noPicture', { title: problem.title, reason })
        : message('blurtUpload.noPictureUntitled', { reason });
}
