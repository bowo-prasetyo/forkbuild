import { EventListener } from './EventListener.js';

// The whole event system in one tiny class: subscribe, unsubscribe,
// publish. Nothing more. World publishes domain events through this;
// anything else (renderer, and later undo history, autosave, multiplayer,
// a blockchain publisher) subscribes through this. Neither side knows the
// other exists.
export class EventBus {
    constructor() {
        this._listenersByType = new Map();
    }

    subscribe(eventType, listener) {
        if (!this._listenersByType.has(eventType)) {
            this._listenersByType.set(eventType, new Set());
        }
        this._listenersByType.get(eventType).add(listener);

        return new EventListener(this, eventType, listener);
    }

    unsubscribe(eventType, listener) {
        const listeners = this._listenersByType.get(eventType);
        if (listeners) {
            listeners.delete(listener);
        }
    }

    publish(eventType, payload) {
        const listeners = this._listenersByType.get(eventType);
        if (!listeners) {
            return;
        }
        for (const listener of listeners) {
            listener(payload);
        }
    }
}
