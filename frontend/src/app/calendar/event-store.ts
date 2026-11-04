import { Injectable, effect, signal } from '@angular/core';
import { CalendarEvent } from './models';

const STORAGE_KEY = 'tempo.events';

/**
 * Almacén de eventos. De momento persiste en localStorage;
 * cuando exista el backend basta con cambiar load/persist por llamadas HTTP.
 */
@Injectable({ providedIn: 'root' })
export class EventStore {
  private readonly _events = signal<CalendarEvent[]>(load());
  readonly events = this._events.asReadonly();

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._events()));
      } catch {
        // almacenamiento no disponible (modo privado, etc.)
      }
    });
  }

  save(event: CalendarEvent): void {
    this._events.update((list) =>
      list.some((e) => e.id === event.id)
        ? list.map((e) => (e.id === event.id ? event : e))
        : [...list, event],
    );
  }

  remove(id: string): void {
    this._events.update((list) => list.filter((e) => e.id !== id));
  }
}

function load(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CalendarEvent[]) : [];
  } catch {
    return [];
  }
}
