// A handle returned by EventBus.subscribe(). Callers hold onto this instead
// of remembering (eventType, listener) themselves just to unsubscribe later.
export class EventListener {
    constructor(eventBus, eventType, listener) {
        this._eventBus = eventBus;
        this._eventType = eventType;
        this._listener = listener;
    }

    unsubscribe() {
        this._eventBus.unsubscribe(this._eventType, this._listener);
    }
}
