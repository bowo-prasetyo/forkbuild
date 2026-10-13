import * as THREE from 'three';

// Lets a standalone brick mesh's material (a plaza exhibit, a claimed build,
// a structure placement) shine after dark like the instanced bricks do
// (renderer/BrickInstanceRegistry.js): `glow` (0xRRGGBB) scaled by the shared
// `nightGlow` uniform ({ value } from 0 to 1). Added to the emissive light
// rather than written into material.emissive, which selection highlighting
// owns.
export function makeNightGlowing(material, glow, nightGlow) {
    if (!material || material.userData.nightGlowing) {
        return;
    }
    const glowColor = { value: new THREE.Color(glow) };
    material.userData.nightGlowing = true;
    // On top of what the material already does (its brick surface,
    // renderer/BrickSurfaceMaterial.js).
    const previous = material.onBeforeCompile;
    const previousKey = material.userData.brickSurface ? material.customProgramCacheKey : null;
    material.onBeforeCompile = (shader, renderer) => {
        if (typeof previous === 'function') previous.call(material, shader, renderer);
        shader.uniforms.uNightGlow = nightGlow;
        shader.uniforms.uGlowColor = glowColor;
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', '#include <common>\nuniform float uNightGlow;\nuniform vec3 uGlowColor;')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += uGlowColor * uNightGlow;');
    };
    material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : ''}|forkbuild-night-glow`;
    material.needsUpdate = true;
}
