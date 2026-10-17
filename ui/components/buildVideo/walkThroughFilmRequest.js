// A walk-through asked for in Make a video (BuildVideoDialog), handed to
// World View, which films it (ui/views/worldView/useWalkThroughFilm.js): the
// dialog asks, then opens `/world/<documentId>?film=walk`, and World View
// takes the request. Kept in memory only, so reopening that address later
// (a reload, a bookmark) films nothing.
let pending = null;

// `request`: `{ documentId, shape, music, name, text, description }`.
export function requestWalkThroughFilm(request) {
    pending = Object.freeze({ ...request });
}

// The request for `documentId`, once, or null.
export function takeWalkThroughFilmRequest(documentId) {
    if (!pending || pending.documentId !== documentId) return null;
    const request = pending;
    pending = null;
    return request;
}
