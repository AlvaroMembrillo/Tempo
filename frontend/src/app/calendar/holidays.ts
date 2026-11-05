import { signal } from '@angular/core';

/**
 * Festivos de la región del usuario. Vienen del backend (GET /holidays) y se
 * guardan en una señal: las vistas que preguntan por un día se actualizan solas
 * en cuanto llegan.
 */

/** España, Andalucía, Sevilla... */
export type HolidayScope = string;

export interface Holiday {
  /** `YYYY-MM-DD` */
  date: string;
  name: string;
  scope: HolidayScope;
  /** Aclaración, p. ej. si es un traslado. */
  note?: string | null;
}

const byDate = signal<ReadonlyMap<string, Holiday>>(new Map());

export function setHolidays(list: Holiday[]): void {
  byDate.set(new Map(list.map((h) => [h.date, h])));
}

const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function holidayOn(day: Date): Holiday | undefined {
  return byDate().get(key(day));
}

export function holidayTitle(h: Holiday): string {
  return `Festivo (${h.scope}): ${h.name}${h.note ? ` · ${h.note}` : ''}`;
}
