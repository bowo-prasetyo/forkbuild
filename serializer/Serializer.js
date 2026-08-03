// Base class every serializer extends. serialize(object) -> plain
// JSON-safe data; deserialize(json) -> a live object. Both throw by
// default — same discipline as Command: a serializer must explicitly
// implement both directions, there's no assumption that one exists just
// because the other does.
export class Serializer {
    serialize(object) {
        throw new Error('Serializer.serialize() must be implemented by a subclass');
    }

    deserialize(json) {
        throw new Error('Serializer.deserialize() must be implemented by a subclass');
    }
}
