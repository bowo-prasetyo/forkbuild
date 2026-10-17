// What a video of a build (core/BuildVideo.js) shows over the picture,
// drawn into its canvas's 2D context: the build's name along the bottom, and
// the end card. Shared by renderer/BuildVideoRecorder.js and
// renderer/WorldFilmRecorder.js. `text` is in the viewer's language:
// `{ title, credit, badge, call, address, hint }`.

const STRIP_COLOR = 'rgba(17, 24, 39, 0.72)';
const CARD_COLOR = 'rgba(17, 24, 39, 0.86)';
const ACCENT_COLOR = '#fbbf24';
const FONT = 'system-ui, sans-serif';

// The build's name along the bottom, and "Made in ForkBuild" beside it (or
// under it, in a tall frame).
export function drawStrip(context, width, height, text) {
    const tall = height > width;
    const unit = Math.min(width, height) / 720;
    const padding = 32 * unit;
    const stripHeight = (tall ? 128 : 72) * unit;
    context.fillStyle = STRIP_COLOR;
    context.fillRect(0, height - stripHeight, width, stripHeight);
    context.textBaseline = 'middle';
    context.fillStyle = '#ffffff';
    if (tall) {
        context.textAlign = 'left';
        context.font = `700 ${36 * unit}px ${FONT}`;
        context.fillText(fit(context, text.title, width - 2 * padding), padding, height - stripHeight + 44 * unit);
        context.font = `600 ${26 * unit}px ${FONT}`;
        context.fillText(fit(context, text.badge, width - 2 * padding), padding, height - stripHeight + 90 * unit);
        return;
    }
    const middle = height - stripHeight / 2;
    context.textAlign = 'right';
    context.font = `600 ${26 * unit}px ${FONT}`;
    context.fillText(text.badge, width - padding, middle);
    const badgeWidth = text.badge ? context.measureText(text.badge).width + padding : 0;
    context.textAlign = 'left';
    context.font = `700 ${30 * unit}px ${FONT}`;
    context.fillText(fit(context, text.title, width - 2 * padding - badgeWidth), padding, middle);
}

// The end card over the last frame, faded in by `opacity`: the build's title
// and who built it, then where to remix it.
export function drawEndCard(context, width, height, text, opacity) {
    const unit = Math.min(width, height) / 720;
    const room = width - 96 * unit;
    context.save();
    context.globalAlpha = opacity;
    context.fillStyle = CARD_COLOR;
    context.fillRect(0, 0, width, height);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const middle = width / 2;
    const lines = [
        { text: text.title, font: `800 ${56 * unit}px ${FONT}`, color: '#ffffff', gap: 0 },
        { text: text.credit, font: `500 ${30 * unit}px ${FONT}`, color: '#e5e7eb', gap: 64 },
        { text: text.call, font: `700 ${40 * unit}px ${FONT}`, color: '#ffffff', gap: 112 },
        { text: text.address, font: `700 ${34 * unit}px ${FONT}`, color: ACCENT_COLOR, gap: 60 },
        { text: text.hint, font: `500 ${26 * unit}px ${FONT}`, color: '#e5e7eb', gap: 56 }
    ].filter((line) => line.text);
    const total = lines.reduce((sum, line, index) => sum + (index === 0 ? 0 : line.gap * unit), 0);
    let y = height / 2 - total / 2;
    lines.forEach((line, index) => {
        if (index > 0) y += line.gap * unit;
        context.font = line.font;
        context.fillStyle = line.color;
        context.fillText(fit(context, line.text, room), middle, y);
    });
    context.restore();
}

// `text`, shortened with an ellipsis to fit `width` in the context's font.
function fit(context, text, width) {
    if (!text || context.measureText(text).width <= width) return text || '';
    let end = text.length;
    while (end > 0 && context.measureText(`${text.slice(0, end)}…`).width > width) end--;
    return end > 0 ? `${text.slice(0, end)}…` : '';
}
