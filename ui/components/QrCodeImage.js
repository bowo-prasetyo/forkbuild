import { computed } from 'vue';
import { encodeQrCode } from '../../core/QrCode.js';

// `text` as a QR code (core/QrCode.js): an SVG of dark modules on white,
// with the four-module quiet zone scanners need. Always dark on light,
// whatever the page's theme: cameras read that best.
export default {
    name: 'QrCodeImage',
    props: {
        text: { type: String, required: true },
        label: { type: String, default: '' }
    },
    setup(props) {
        const QUIET_ZONE = 4;
        const symbol = computed(() => {
            const { size, modules } = encodeQrCode(props.text);
            let path = '';
            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    if (modules[y][x]) path += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`;
                }
            }
            return { extent: size + QUIET_ZONE * 2, path };
        });
        return { symbol };
    },
    template: `
        <svg class="qr-code-image" :viewBox="'0 0 ' + symbol.extent + ' ' + symbol.extent"
             role="img" :aria-label="label" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
            <rect :width="symbol.extent" :height="symbol.extent" fill="#ffffff" />
            <path :d="symbol.path" fill="#000000" />
        </svg>
    `
};
