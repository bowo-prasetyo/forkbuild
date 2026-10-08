import { DocumentThumbnailRenderer } from './DocumentThumbnailRenderer.js';

// A picture of a build to post where a link alone wouldn't travel: the build
// drawn as the Repository's thumbnails are, at the size link previews use, with
// a strip along the bottom naming it and where to remix it. A one-off: its
// WebGL context is released before it returns, so it never counts against the
// browser's limit on open contexts.
export const BUILD_PICTURE_WIDTH = 1200;
export const BUILD_PICTURE_HEIGHT = 630;
const STRIP_HEIGHT = 72;
const PADDING = 32;

// `title` and `caption` are text already in the viewer's language. Resolves to
// a PNG Blob.
export async function renderBuildPicture(document, { registry, title = '', caption = '' }) {
    const renderer = new DocumentThumbnailRenderer(registry, { width: BUILD_PICTURE_WIDTH, height: BUILD_PICTURE_HEIGHT });
    let image;
    try {
        image = await loadImage(renderer.renderDocument(document));
    } finally {
        renderer.dispose();
    }
    const canvas = globalThis.document.createElement('canvas');
    canvas.width = BUILD_PICTURE_WIDTH;
    canvas.height = BUILD_PICTURE_HEIGHT;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);

    context.fillStyle = 'rgba(17, 24, 39, 0.72)';
    context.fillRect(0, BUILD_PICTURE_HEIGHT - STRIP_HEIGHT, BUILD_PICTURE_WIDTH, STRIP_HEIGHT);
    context.textBaseline = 'middle';
    const middle = BUILD_PICTURE_HEIGHT - STRIP_HEIGHT / 2;
    context.fillStyle = '#ffffff';
    context.textAlign = 'right';
    context.font = '600 26px system-ui, sans-serif';
    context.fillText(caption, BUILD_PICTURE_WIDTH - PADDING, middle);
    const captionWidth = caption ? context.measureText(caption).width + PADDING : 0;
    context.textAlign = 'left';
    context.font = '700 30px system-ui, sans-serif';
    context.fillText(fit(context, title, BUILD_PICTURE_WIDTH - 2 * PADDING - captionWidth), PADDING, middle);

    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('the picture could not be drawn'))), 'image/png');
    });
}

// `text`, shortened with an ellipsis to fit `width` in the context's font.
function fit(context, text, width) {
    if (!text || context.measureText(text).width <= width) return text;
    let end = text.length;
    while (end > 0 && context.measureText(`${text.slice(0, end)}…`).width > width) end--;
    return end > 0 ? `${text.slice(0, end)}…` : '';
}

function loadImage(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('the picture could not be drawn'));
        image.src = url;
    });
}
