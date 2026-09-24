// Adds groups of methods to a class prototype exactly as if they had been
// written in the class body: non-enumerable, writable, configurable. Lets a
// large class keep one public shape while its methods live in several
// modules. A name defined twice is an error, never a silent override.
export function installMethods(targetClass, ...groups) {
    for (const group of groups) {
        for (const [name, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(group))) {
            if (Object.prototype.hasOwnProperty.call(targetClass.prototype, name)) {
                throw new Error(`${targetClass.name}.${name} is defined twice`);
            }
            Object.defineProperty(targetClass.prototype, name, { ...descriptor, enumerable: false });
        }
    }
}
