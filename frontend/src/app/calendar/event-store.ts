import { Injectable, inject, signal } from '@angular/core';
import { Api } from '../core/api';
import { SyncQueue } from '../core/sync-queue';
import { CalendarEvent } from './models';

/**
 * Eventos del usuario. Los cambios se ven al momento y se guardan en el
 * servidor en segundo plano (ver SyncQueue).
 */
@Injectable({ providedIn: 'root' })
export class EventStore {
  private readonly api = inject(Api);
  private readonly sync = inject(SyncQueue);

  private readonly _events = signal<CalendarEvent[]>([]);
  readonly events = this._events.asReadonly();

  async load(): Promise<void> {
    this._events.set(await this.api.get<CalendarEvent[]>('/events'));
  }

  clear(): void {
    this._events.set([]);
  }

  /** Crea o actualiza (según exista ya ese id). */
  save(event: CalendarEvent): void {
    const exists = this._events().some((e) => e.id === event.id);
    this._events.update((list) =>
      exists ? list.map((e) => (e.id === event.id ? event : e)) : [...list, event],
    );
    void this.sync.run(
      () =>
        exists
          ? this.api.patch(`/events/${event.id}`, eventPayload(event))
          : this.api.post('/events', { id: event.id, ...eventPayload(event) }),
      () => this.reload(),
    );
  }

  /**
   * Quita el proyecto de todos sus eventos (al borrar el proyecto). Devuelve los
   * afectados. Solo en memoria: el servidor ya lo hace solo al borrar el proyecto.
   */
  unassignProject(projectId: string): CalendarEvent[] {
    const affected = this._events().filter((e) => e.projectId === projectId);
    if (affected.length) {
      this._events.update((list) =>
        list.map((e) => (e.projectId === projectId ? { ...e, projectId: null } : e)),
      );
    }
    return affected;
  }

  remove(id: string): void {
    this._events.update((list) => list.filter((e) => e.id !== id));
    void this.sync.run(() => this.api.delete(`/events/${id}`), () => this.reload());
  }

  private reload(): void {
    this.load().catch(() => undefined);
  }
}

/** Cuerpo para la API: los campos vacíos se envían como null para poder vaciarlos. */
function eventPayload(e: CalendarEvent) {
  return {
    title: e.title,
    description: e.description || null,
    start: e.start,
    end: e.end,
    color: e.color,
    projectId: e.projectId || null,
  };
}
