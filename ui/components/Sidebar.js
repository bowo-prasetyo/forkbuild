import BrickPalette from './BrickPalette.js';

export default {
    name: 'Sidebar',
    components: { BrickPalette },
    props: {
        paletteUseCase: {
            type: Object,
            required: true
        }
    },
    template: `
        <aside class="sidebar">
            <BrickPalette :palette-use-case="paletteUseCase" />
        </aside>
    `
};
