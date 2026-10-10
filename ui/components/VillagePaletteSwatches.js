import { VILLAGE_PALETTE } from '../../core/VillagePalette.js';
import { toCssHex } from '../../core/ColorHex.js';
import { t } from '../i18n/i18n.js';

// A row of the village colour palette (core/VillagePalette.js). Clicking a
// swatch emits its colour; `selected` (0xRRGGBB or null) marks the one in use.
export default {
    name: 'VillagePaletteSwatches',
    props: {
        selected: { type: Number, default: null }
    },
    emits: ['choose'],
    setup() {
        const swatches = VILLAGE_PALETTE.map((swatch) => ({
            ...swatch,
            css: toCssHex(swatch.color),
            label: t(`villagePalette.${swatch.id}`)
        }));
        return { t, swatches };
    },
    template: `
        <div class="village-palette" role="group" :aria-label="t('villagePalette.label')">
            <button
                v-for="swatch in swatches"
                :key="swatch.id"
                type="button"
                :class="['village-palette-swatch', { 'village-palette-swatch--selected': swatch.color === selected }]"
                :style="{ background: swatch.css }"
                :title="swatch.label"
                :aria-label="swatch.label"
                :aria-pressed="swatch.color === selected ? 'true' : 'false'"
                @click="$emit('choose', swatch.color)"
            ></button>
        </div>
    `
};
