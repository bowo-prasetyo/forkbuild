// Base class every storage provider extends. save/load/remove/list, all
// operating on plain string names and JSON-safe values — no knowledge of
// Document, World, or anything domain-shaped. Storage doesn't know
// documents; that pairing happens one layer up, in
// SaveDocumentUseCase/LoadDocumentUseCase (application/). This is why
// storage/ imports nothing from core/, application/, renderer/, or ui/
// at all — it's the most decoupled layer in the engine, even more so
// than serializer/ (which at least needs to know what a World is).
export class StorageProvider {
    save(name, data) {
        throw new Error('StorageProvider.save() must be implemented by a subclass');
    }

    load(name) {
        throw new Error('StorageProvider.load() must be implemented by a subclass');
    }

    remove(name) {
        throw new Error('StorageProvider.remove() must be implemented by a subclass');
    }

    list() {
        throw new Error('StorageProvider.list() must be implemented by a subclass');
    }
}
