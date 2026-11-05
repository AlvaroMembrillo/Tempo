import { Injectable, effect, signal } from '@angular/core';
import { TimeBlock } from './models';

const STORAGE_KEY = 'tempo.timeBlocks';
const COMPACT_KEY = 'tempo.compactHours';

/** Franjas horarias no disponibles del usuario, persistidas en localStorage. */
@Injectable({ providedIn: 'root' })
export class TimeBlockStore {
  private readonly _blocks = signal<TimeBlock[]>(load());
  readonly blocks = this._blocks.asReadonly();

  /** Si es true, la vista semana comprime las horas no disponibles. */
  readonly compact = signal<boolean>(loadCompact());

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._blocks()));
      } catch {
        // almacenamiento no disponible
      }
    });
    effect(() => {
      try {
        localStorage.setItem(COMPACT_KEY, String(this.compact()));
      } catch {
        // almacenamiento no disponible
      }
    });
  }

  add(block: Omit<TimeBlock, 'id'>): void {
    this._blocks.update((list) => [
      ...list,
      { ...block, days: [...block.days], id: crypto.randomUUID() },
    ]);
  }

  update(id: string, patch: Partial<Omit<TimeBlock, 'id'>>): void {
    this._blocks.update((list) => list.map((b) => (b.id === id ? { ...b, ...patch } : b)));
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
  }

  /** Vuelve a aplicar la franja en una fecha que se había quitado. */
  restoreDay(id: string, date: string): void {
    this._blocks.update((list) =>
      list.map((b) =>
        b.id === id ? { ...b, exceptions: (b.exceptions ?? []).filter((d) => d !== date) } : b,
      ),
    );
  }

  remove(id: string): void {
    this._blocks.update((list) => list.filter((b) => b.id !== id));
  }
}

function loadCompact(): boolean {
  try {
    return localStorage.getItem(COMPACT_KEY) === 'true';
  } catch {
    return false;
  }
}

function load(): TimeBlock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as TimeBlock[]) : [];
  } catch {
    return [];
  }
}
