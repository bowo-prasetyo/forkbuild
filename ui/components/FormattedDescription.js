import { parseDescription } from '../../core/DescriptionMarkup.js';

// A build's description with the little formatting it may use
// (core/DescriptionMarkup.js): paragraphs, headings, bullet lists, bold and
// italic. Everything is drawn as elements around plain text, never as HTML,
// so a description can't inject markup or links. A description without
// formatting reads as before.

// One line's runs, each in <strong> and/or <em> as it asks.
const RUNS = (runs) => `<template v-for="(run, r) in ${runs}" :key="r"><strong v-if="run.bold && run.italic"><em>{{ run.text }}</em></strong><strong v-else-if="run.bold">{{ run.text }}</strong><em v-else-if="run.italic">{{ run.text }}</em><template v-else>{{ run.text }}</template></template>`;

export default {
    name: 'FormattedDescription',
    props: {
        text: { type: String, default: '' }
    },
    computed: {
        blocks() {
            return parseDescription(this.text);
        }
    },
    template: `
        <div class="formatted-description">
            <template v-for="(block, b) in blocks" :key="b">
                <p v-if="block.type === 'heading'" class="formatted-description-heading">${RUNS('block.runs')}</p>
                <ul v-else-if="block.type === 'list'" class="formatted-description-list">
                    <li v-for="(item, i) in block.items" :key="i">${RUNS('item')}</li>
                </ul>
                <p v-else class="formatted-description-paragraph"><template v-for="(line, l) in block.lines" :key="l"><br v-if="l > 0">${RUNS('line')}</template></p>
            </template>
        </div>
    `
};
