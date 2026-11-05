import { CalendarEvent, TimeBlock } from './models';
import { blockSegments, startOfDay } from './date-utils';

/** Intervalo `[inicio, fin)` en minutos dentro de un día (0–1440). */
export type Interval = [number, number];

export const DAY_MINUTES = 24 * 60;

// ---------------------------------------------------------------------------
// Aritmética de intervalos
// ---------------------------------------------------------------------------

export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const out: Interval[] = [];
  for (const [s, e] of sorted) {
    const last = out.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

export function totalMinutes(list: Interval[]): number {
  return mergeIntervals(list).reduce((t, [s, e]) => t + e - s, 0);
}

export function intersect(a: Interval[], b: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [as, ae] of mergeIntervals(a)) {
    for (const [bs, be] of mergeIntervals(b)) {
      const s = Math.max(as, bs);
      const e = Math.min(ae, be);
      if (e > s) out.push([s, e]);
    }
  }
  return out;
}

/** Partes de `a` que no están cubiertas por `b`. */
export function subtract(a: Interval[], b: Interval[]): Interval[] {
  const cuts = mergeIntervals(b);
  const out: Interval[] = [];
  for (const [s0, e] of mergeIntervals(a)) {
    let s = s0;
    for (const [cs, ce] of cuts) {
      if (ce <= s || cs >= e) continue;
      if (cs > s) out.push([s, cs]);
      s = Math.max(s, ce);
    }
    if (s < e) out.push([s, e]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Disponibilidad
// ---------------------------------------------------------------------------

export function blockedIntervals(blocks: TimeBlock[], day: Date): Interval[] {
  return mergeIntervals(blocks.flatMap((b) => blockSegments(b, day)));
}

export function eventIntervals(events: CalendarEvent[], day: Date): Interval[] {
  const dayStart = startOfDay(day).getTime();
  return mergeIntervals(
    events.map((e): Interval => [
      Math.max((new Date(e.start).getTime() - dayStart) / 60_000, 0),
      Math.min((new Date(e.end).getTime() - dayStart) / 60_000, DAY_MINUTES),
    ]),
  );
}

export interface Availability {
  /** Minutos fuera de las horas no disponibles. */
  available: number;
  /** Minutos con eventos dentro del tiempo disponible. */
  planned: number;
  /** Minutos disponibles que aún no tienen eventos. */
  free: number;
}

export function dayAvailability(
  events: CalendarEvent[],
  blocks: TimeBlock[],
  day: Date,
): Availability {
  const blocked = blockedIntervals(blocks, day);
  const available = DAY_MINUTES - totalMinutes(blocked);
  const planned = totalMinutes(subtract(eventIntervals(events, day), blocked));
  return { available, planned, free: available - planned };
}

export function sumAvailability(list: Availability[]): Availability {
  return list.reduce(
    (t, a) => ({
      available: t.available + a.available,
      planned: t.planned + a.planned,
      free: t.free + a.free,
    }),
    { available: 0, planned: 0, free: 0 },
  );
}

const hoursFormat = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 });

/** 390 → "6,5 h" */
export function formatHours(minutes: number): string {
  return `${hoursFormat.format(minutes / 60)} h`;
}

// ---------------------------------------------------------------------------
// Vista compacta
// ---------------------------------------------------------------------------

/**
 * Tramos que se pueden comprimir en la vista semana: los que no están disponibles
 * en *todos* los días mostrados y no tienen ningún evento. Solo tramos de 1 h o más.
 */
export function collapsibleRanges(
  events: CalendarEvent[],
  blocks: TimeBlock[],
  days: Date[],
  minMinutes = 60,
): Interval[] {
  if (days.length === 0) return [];
  let common: Interval[] = [[0, DAY_MINUTES]];
  for (const d of days) common = intersect(common, blockedIntervals(blocks, d));
  const busy = days.flatMap((d) => eventIntervals(events, d));
  return subtract(common, busy).filter(([s, e]) => e - s >= minMinutes);
}

export interface TimeScaleRow {
  start: number;
  end: number;
  top: number;
  height: number;
  collapsed: boolean;
}

/** Correspondencia minutos ↔ píxeles en la que algunos tramos ocupan muy poca altura. */
export class TimeScale {
  readonly rows: TimeScaleRow[] = [];
  readonly height: number;

  constructor(collapsed: Interval[], hourPx: number, collapsedPx: number) {
    let cur = 0;
    let top = 0;
    const push = (start: number, end: number, isCollapsed: boolean) => {
      const height = isCollapsed ? collapsedPx : ((end - start) / 60) * hourPx;
      this.rows.push({ start, end, top, height, collapsed: isCollapsed });
      top += height;
    };
    for (const [s, e] of mergeIntervals(collapsed)) {
      if (s > cur) push(cur, s, false);
      push(s, e, true);
      cur = e;
    }
    if (cur < DAY_MINUTES) push(cur, DAY_MINUTES, false);
    this.height = top;
  }

  get collapsedRows(): TimeScaleRow[] {
    return this.rows.filter((r) => r.collapsed);
  }

  /** Posición vertical (px) de un minuto del día. */
  y(minute: number): number {
    const r = this.rows.find((row) => minute >= row.start && minute <= row.end) ?? this.rows.at(-1)!;
    return r.top + ((minute - r.start) / (r.end - r.start)) * r.height;
  }

  /** Minuto del día en una posición vertical, o `null` si cae en un tramo comprimido. */
  minuteAt(px: number): number | null {
    const r = this.rows.find((row) => px >= row.top && px < row.top + row.height);
    if (!r || r.collapsed) return null;
    return r.start + ((px - r.top) / r.height) * (r.end - r.start);
  }

  /** Como `minuteAt`, pero nunca devuelve `null`: útil al arrastrar. */
  minuteAtLoose(px: number): number {
    const clamped = Math.min(Math.max(px, 0), this.height - 0.001);
    const r = this.rows.find((row) => clamped >= row.top && clamped < row.top + row.height) ?? this.rows.at(-1)!;
    return r.start + ((clamped - r.top) / r.height) * (r.end - r.start);
  }

  /** ¿Es el minuto el borde de un tramo comprimido? */
  isCollapsedEdge(minute: number): boolean {
    return this.rows.some((r) => r.collapsed && (minute === r.start || minute === r.end));
  }

  /** ¿Está el minuto dentro (sin contar bordes) de un tramo comprimido? */
  isHidden(minute: number): boolean {
    return this.rows.some((r) => r.collapsed && minute > r.start && minute < r.end);
  }
}
