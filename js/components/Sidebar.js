import BrickPalette from './BrickPalette.js';

export default {
    name: 'Sidebar',
    components: { BrickPalette },
    template: `
        <aside class="sidebar">
            <BrickPalette />
        </aside>
    `
};
