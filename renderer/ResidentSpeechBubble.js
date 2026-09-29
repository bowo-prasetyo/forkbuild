import * as THREE from 'three';

// A speech bubble over a World Resident's head: `remarks` (plain sentences
// from core/ResidentTalk.js) drawn as TEXT into a canvas and shown as a
// camera-facing sprite. Text only — nothing here interprets markup, so a
// title someone else chose can never become anything but letters.
//
// Returns { object, dispose() }, `object` to add above the resident's head
// (its position is already set), or null where there is no canvas to draw
// into (a test runner without a DOM).

const CANVAS_WIDTH = 512;
const PADDING = 18;
const FONT_SIZE = 25;
const LINE_HEIGHT = 32;
const PARAGRAPH_GAP = 8;
const TAIL = 16;
const RADIUS = 14;
// The bubble's width in world units (meters): readable from the couple of
// steps away you stand to talk.
const WORLD_WIDTH = 2.6;
// Where the bubble's bottom sits above the resident's feet: over its head.
const HEAD_CLEARANCE = 2.15;

function wrap(ctx, text, maxWidth) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
        const candidate = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(candidate).width > maxWidth) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line) lines.push(line);
    return lines;
}

function roundedBubble(ctx, width, height) {
    ctx.beginPath();
    ctx.moveTo(RADIUS, 0);
    ctx.lineTo(width - RADIUS, 0);
    ctx.quadraticCurveTo(width, 0, width, RADIUS);
    ctx.lineTo(width, height - RADIUS);
    ctx.quadraticCurveTo(width, height, width - RADIUS, height);
    ctx.lineTo(width / 2 + TAIL, height);
    ctx.lineTo(width / 2, height + TAIL);
    ctx.lineTo(width / 2 - TAIL, height);
    ctx.lineTo(RADIUS, height);
    ctx.quadraticCurveTo(0, height, 0, height - RADIUS);
    ctx.lineTo(0, RADIUS);
    ctx.quadraticCurveTo(0, 0, RADIUS, 0);
    ctx.closePath();
}

export function createSpeechBubble(remarks) {
    if (typeof document === 'undefined') {
        return null;
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        return null;
    }
    const font = `${FONT_SIZE}px sans-serif`;
    ctx.font = font;
    const paragraphs = remarks.map((remark) => wrap(ctx, String(remark), CANVAS_WIDTH - PADDING * 2));
    const lineCount = paragraphs.reduce((sum, lines) => sum + lines.length, 0);
    const bodyHeight = PADDING * 2 + lineCount * LINE_HEIGHT + Math.max(0, paragraphs.length - 1) * PARAGRAPH_GAP;
    canvas.width = CANVAS_WIDTH;
    canvas.height = bodyHeight + TAIL + 2;

    roundedBubble(ctx, CANVAS_WIDTH, bodyHeight);
    ctx.fillStyle = 'rgba(250, 247, 238, 0.96)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(60, 50, 35, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = font;
    ctx.fillStyle = '#2b241a';
    ctx.textBaseline = 'top';
    let y = PADDING;
    for (const lines of paragraphs) {
        for (const line of lines) {
            ctx.fillText(line, PADDING, y);
            y += LINE_HEIGHT;
        }
        y += PARAGRAPH_GAP;
    }

    const texture = new THREE.CanvasTexture(canvas);
    // The canvas is drawn in sRGB; left linear, and tone-mapped like the lit
    // scene, the bubble would come out washed out.
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true, toneMapped: false });
    const sprite = new THREE.Sprite(material);
    const worldHeight = WORLD_WIDTH * (canvas.height / canvas.width);
    sprite.scale.set(WORLD_WIDTH, worldHeight, 1);
    sprite.position.y = HEAD_CLEARANCE + worldHeight / 2;
    sprite.renderOrder = 10;
    return {
        object: sprite,
        dispose() {
            texture.dispose();
            material.dispose();
        }
    };
}
