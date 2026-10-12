// What casts a shadow and what a shadow falls on, when World View's sun and
// moon cast them (renderer/SunShadows.js). Set once, where each thing's
// meshes are made; with shadows off (the Editor, thumbnails, or a device
// that turned them off) these flags draw nothing.
//
//   casts and receives  bricks and builds, trees
//   casts               avatars, vehicles, animals
//   receives            the ground
//   neither             water, life under water, markers, the sun and moon

// `object` and every mesh under it cast shadows, and receive them too when
// `receive` says so. Returns `object`.
export function castShadows(object, { receive = false } = {}) {
    if (object) {
        object.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                if (receive) child.receiveShadow = true;
            }
        });
    }
    return object;
}

// `mesh` has shadows fall on it but casts none. Returns `mesh`.
export function receiveShadows(mesh) {
    if (mesh) mesh.receiveShadow = true;
    return mesh;
}
