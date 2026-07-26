/**
 * Typisierter Pub/Sub-Bus.
 *
 * Zweck: Systeme sollen sich nicht gegenseitig importieren. Das TerrainSystem
 * muss auf einen Qualitätswechsel reagieren, ohne die Qualitäts-UI zu kennen —
 * sonst entsteht über die Phasen hinweg ein Netz aus Querverweisen, das jede
 * spätere Umstellung teuer macht.
 */

export type EventMap = Record<string, unknown>;

export type Unsubscribe = () => void;

export type Handler<T> = (payload: T) => void;

/**
 * Ereignisse ohne Nutzlast werden als `void` deklariert und dann ohne zweites
 * Argument gesendet: `bus.emit('engine:contextlost')`.
 */
type EmitArgs<E extends EventMap, K extends keyof E> = E[K] extends void ? [] : [payload: E[K]];

export class EventBus<Events extends EventMap> {
  readonly #handlers = new Map<keyof Events, Set<Handler<never>>>();

  on<K extends keyof Events>(type: K, handler: Handler<Events[K]>): Unsubscribe {
    let set = this.#handlers.get(type);
    if (!set) {
      set = new Set();
      this.#handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => {
      this.off(type, handler);
    };
  }

  once<K extends keyof Events>(type: K, handler: Handler<Events[K]>): Unsubscribe {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof Events>(type: K, handler: Handler<Events[K]>): void {
    const set = this.#handlers.get(type);
    if (!set) return;
    set.delete(handler as Handler<never>);
    if (set.size === 0) this.#handlers.delete(type);
  }

  emit<K extends keyof Events>(type: K, ...args: EmitArgs<Events, K>): void {
    const set = this.#handlers.get(type);
    if (!set || set.size === 0) return;

    // Die bedingte Tupel-Signatur oben lässt sich im Rumpf nicht auflösen;
    // die Zusicherung hier ist die Umkehrung derselben Regel.
    const [payload] = args as [Events[K]];

    // Kopie: ein Handler darf sich während der Zustellung abmelden.
    for (const handler of [...set]) {
      try {
        (handler as Handler<Events[K]>)(payload);
      } catch (error) {
        // Ein defekter Zuhörer darf den Render-Loop nicht anhalten.
        console.error(`EventBus: Handler für "${String(type)}" hat geworfen.`, error);
      }
    }
  }

  listenerCount<K extends keyof Events>(type: K): number {
    return this.#handlers.get(type)?.size ?? 0;
  }

  clear(): void {
    this.#handlers.clear();
  }
}
