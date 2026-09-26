// The line shown while content is being stored on Steem, from the progress
// SteemContentStore reports, or null when nothing is in progress. Finished
// and failed uploads are shown by their result or error instead.
export function describeSteemContentUploadProgress(state) {
    if (!state || !['describing', 'checking', 'posting'].includes(state.phase)) return null;
    if (state.phase === 'describing') return 'Storing on Steem: adding a picture of the build. Approve signing the picture in Steem Keychain.';
    if (state.phase === 'checking') return 'Storing on Steem: checking your Resource Credits…';
    const sentences = [`Storing on Steem: ${state.done} of ${state.total} ${state.total === 1 ? 'post' : 'posts'} made. Approve each post in Steem Keychain.`];
    if (state.resumed) sentences.push('Resuming an earlier upload of this build.');
    if (state.resourceCredits) {
        sentences.push(`Uses about ${state.resourceCredits.neededPercent}% of your Resource Credits (${state.resourceCredits.availablePercent}% available).`);
    }
    return sentences.join(' ');
}
