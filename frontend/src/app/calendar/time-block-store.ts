import { Injectable, effect, inject, signal } from '@angular/core';
import { Api } from '../core/api';
import { SyncQueue } from '../core/sync-queue';
import { TimeBlock } from './models';

/** Preferencia de pantalla: esta sí se queda en el navegador. */
const COMPACT_KEY = 'tempo.compactHours';

/** Franjas horarias no disponibles del usuario, guardadas en el servidor. */
@Injectable({ providedIn: 'root' })
export class TimeBlockStore {
  private readonly api = inject(Api);
  private readonly sync = inject(SyncQueue);

  private readonly _blocks = signal<TimeBlock[]>([]);
  readonly blocks = this._blocks.asReadonly();

  /** Si es true, la vista semana comprime las horas no disponibles. */
  readonly compact = signal<boolean>(loadCompact());

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(COMPACT_KEY, String(this.compact()));
      } catch {
        // almacenamiento no disponible
      }
    });
  }

  async load(): Promise<void> {
    this._blocks.set(await this.api.get<TimeBlock[]>('/time-blocks'));
  }

  clear(): void {
    this._blocks.set([]);
  }

  add(block: Omit<TimeBlock, 'id'>): void {
    const created: TimeBlock = {
      ...block,
      days: [...block.days],
      exceptions: [...(block.exceptions ?? [])],
      id: crypto.randomUUID(),
    };
    this._blocks.update((list) => [...list, created]);
    void this.sync.run(
      () =>
        this.api.post('/time-blocks', {
          id: created.id,
          ...blockPayload(created),
          exceptions: created.exceptions,
        }),
      () => this.reload(),
    );
  }

  /** Los cambios seguidos (p. ej. al escribir el nombre) se envían juntos. */
  update(id: string, patch: Partial<Omit<TimeBlock, 'id'>>): void {
    this._blocks.update((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    this.sync.debounce(
      `block:${id}`,
      () => {
        const block = this._blocks().find((b) => b.id === id);
        return block ? this.api.patch(`/time-blocks/${id}`, blockPayload(block)) : undefined;
      },
      () => this.reload(),
    );
  }

  /** Quita la franja solo en una fecha concreta (`YYYY-MM-DD`). */
  skipDay(id: string, date: string): void {
    this._blocks.update((list) =>
      list.map((b) =>
        b.id === id && !b.exceptions?.includes(date)
          ? { ...b, exceptions: [...(b.exceptions ?? []), date].sort() }
          : b,
      ),
    );
    void this.sync.run(
      () => this.api.post(`/time-blocks/${id}/exceptions`, { date }),
      () => this.reload(),
    );
  }

  /** Vuelve a aplicar la franja en una fecha que se había quitado. */
  restoreDay(id: string, date: string): void {
    this._blocks.update((list) =>
      list.map((b) =>
        b.id === id ? { ...b, exceptions: (b.exceptions ?? []).filter((d) => d !== date) } : b,
      ),
    );
    void this.sync.run(
      () => this.api.delete(`/time-blocks/${id}/exceptions/${date}`),
      () => this.reload(),
    );
  }

  remove(id: string): void {
    this.sync.cancel(`block:${id}`);
    this._blocks.update((list) => list.filter((b) => b.id !== id));
    void this.sync.run(() => this.api.delete(`/time-blocks/${id}`), () => this.reload());
  }

  private reload(): void {
    this.load().catch(() => undefined);
  }
}

function blockPayload(b: TimeBlock) {
  return {
    label: b.label,
    start: b.start,
    end: b.end,
    days: b.days,
    color: b.color,
    enabled: b.enabled,
    keepOnHolidays: b.keepOnHolidays ?? null,
  };
}

function loadCompact(): boolean {
  try {
    return localStorage.getItem(COMPACT_KEY) === 'true';
  } catch {
    return false;
  }
}
