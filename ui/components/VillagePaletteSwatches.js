import { VILLAGE_PALETTE } from '../../core/building/VillagePalette.js';
import { toCssHex } from '../../core/building/ColorHex.js';
import { ref, computed } from 'vue';
import { t } from '../i18n/i18n.js';

// A row of the village colour palette (core/building/VillagePalette.js). Clicking a
// swatch emits its colour; `selected` (0xRRGGBB or null) marks the one in use.
// From the keyboard the row is one Tab stop (the swatch in use, else the last
// one focused, else the first) and the arrow keys, Home and End move along it.
export default {
    name: 'VillagePaletteSwatches',
    props: {
        selected: { type: Number, default: null }
    },
    emits: ['choose'],
    setup(props) {
        const swatches = VILLAGE_PALETTE.map((swatch) => ({
            ...swatch,
            css: toCssHex(swatch.color),
            label: t(`villagePalette.${swatch.id}`)
        }));
        const row = ref(null);
        const focusedIndex = ref(null);
        const tabStop = computed(() => {
            const selected = swatches.findIndex((swatch) => swatch.color === props.selected);
            if (selected >= 0) return selected;
            return focusedIndex.value ?? 0;
        });
        const MOVES = {
            ArrowLeft: (i) => i - 1, ArrowUp: (i) => i - 1,
            ArrowRight: (i) => i + 1, ArrowDown: (i) => i + 1,
            Home: () => 0, End: () => swatches.length - 1
        };
        function onKeydown(event, index) {
            const move = MOVES[event.key];
            if (!move) return;
            event.preventDefault();
            const next = Math.min(swatches.length - 1, Math.max(0, move(index)));
            focusedIndex.value = next;
            row.value?.querySelectorAll('.village-palette-swatch')[next]?.focus();
        }
        return { t, swatches, row, focusedIndex, tabStop, onKeydown };
    },
    template: `
        <div ref="row" class="village-palette" role="group" :aria-label="t('villagePalette.label')">
            <button
                v-for="(swatch, index) in swatches"
                :key="swatch.id"
                type="button"
                :class="['village-palette-swatch', { 'village-palette-swatch--selected': swatch.color === selected }]"
                :style="{ background: swatch.css }"
                :title="swatch.label"
                :aria-label="swatch.label"
                :aria-pressed="swatch.color === selected ? 'true' : 'false'"
                :tabindex="index === tabStop ? 0 : -1"
                @focus="focusedIndex = index"
                @keydown="onKeydown($event, index)"
                @click="$emit('choose', swatch.color)"
            ></button>
        </div>
    `
};
