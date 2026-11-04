import { CalendarEvent, TimeBlock } from './models';

export const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Devuelve el día 1 del mes desplazado `n` meses. */
export function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Semana empezando en lunes. */
export function startOfWeek(d: Date): Date {
  const r = startOfDay(d);
  const dow = (r.getDay() + 6) % 7;
  return addDays(r, -dow);
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function weekDays(d: Date): Date[] {
  const first = startOfWeek(d);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** 6 semanas (42 días) que cubren el mes completo. */
export function monthGrid(d: Date): Date[] {
  const first = startOfWeek(startOfMonth(d));
  return Array.from({ length: 42 }, (_, i) => addDays(first, i));
}

/** Eventos que se solapan con el día dado, ordenados por inicio. */
export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const from = startOfDay(day).getTime();
  const to = from + DAY_MS;
  return events
    .filter((e) => new Date(e.start).getTime() < to && new Date(e.end).getTime() > from)
    .sort((a, b) => a.start.localeCompare(b.start));
}

const pad = (n: number) => n.toString().padStart(2, '0');

/** Formato `YYYY-MM-DD` para <input type="date">. */
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Formato `HH:mm` para <input type="time">. */
export function toTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromInputs(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min);
}

const DAY_MINUTES = 24 * 60;

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Duración de una franja en minutos (teniendo en cuenta que puede cruzar la medianoche). */
export function blockDuration(block: TimeBlock): number {
  const d = minutesOf(block.end) - minutesOf(block.start);
  return d > 0 ? d : d + DAY_MINUTES;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Tramos `[inicio, fin)` en minutos (0–1440) que ocupa la franja dentro del día dado.
 * Una franja que cruza la medianoche aporta un tramo al final de su día
 * y otro al principio del día siguiente.
 */
export function blockSegments(block: TimeBlock, day: Date): [number, number][] {
  if (!block.enabled) return [];
  const dow = (day.getDay() + 6) % 7;
  const prevDow = (dow + 6) % 7;
  const s = minutesOf(block.start);
  const e = minutesOf(block.end);
  const out: [number, number][] = [];
  if (e > s) {
    if (block.days.includes(dow)) out.push([s, e]);
  } else {
    if (block.days.includes(dow)) out.push([s, DAY_MINUTES]);
    if (block.days.includes(prevDow) && e > 0) out.push([0, e]);
  }
  return out;
}

/** Franjas no disponibles que se solapan con el intervalo [start, end) de un mismo día. */
export function overlappingBlocks(blocks: TimeBlock[], start: Date, end: Date): TimeBlock[] {
  const day = startOfDay(start);
  const sm = (start.getTime() - day.getTime()) / 60_000;
  const em = Math.min((end.getTime() - day.getTime()) / 60_000, DAY_MINUTES);
  return blocks.filter((b) => blockSegments(b, day).some(([s, e]) => sm < e && em > s));
}
