/**
 * Festivos que aplican en Sevilla capital: nacionales, autonómicos de Andalucía y locales.
 *
 * Fuentes:
 * - 2026: Decreto 101/2025, de 14 de mayo (BOJA nº 93, 19/05/2025) y fiestas locales
 *   publicadas en BOJA de 14/10/2025.
 * - 2027: Decreto 84/2026, de 29 de abril (BOJA nº 84, 05/05/2026) y acuerdo del Pleno
 *   del Ayuntamiento de Sevilla de junio de 2026 (fiestas locales).
 *
 * Los años siguientes se añaden cuando se publiquen sus calendarios oficiales
 * (Andalucía: hacia mayo del año anterior; Sevilla: hacia junio-octubre).
 */

export type HolidayScope = 'España' | 'Andalucía' | 'Sevilla';

export interface Holiday {
  /** `YYYY-MM-DD` */
  date: string;
  name: string;
  scope: HolidayScope;
  /** Aclaración, p. ej. si es un traslado. */
  note?: string;
}

export const HOLIDAYS: Holiday[] = [
  // ---- 2026 ----
  { date: '2026-01-01', name: 'Año Nuevo', scope: 'España' },
  { date: '2026-01-06', name: 'Epifanía del Señor', scope: 'España' },
  { date: '2026-02-28', name: 'Día de Andalucía', scope: 'Andalucía' },
  { date: '2026-04-02', name: 'Jueves Santo', scope: 'Andalucía' },
  { date: '2026-04-03', name: 'Viernes Santo', scope: 'España' },
  { date: '2026-04-22', name: 'Miércoles de Feria', scope: 'Sevilla' },
  { date: '2026-05-01', name: 'Fiesta del Trabajo', scope: 'España' },
  { date: '2026-06-04', name: 'Corpus Christi', scope: 'Sevilla' },
  { date: '2026-08-15', name: 'Asunción de la Virgen', scope: 'España' },
  { date: '2026-10-12', name: 'Fiesta Nacional de España', scope: 'España' },
  {
    date: '2026-11-02',
    name: 'Todos los Santos',
    scope: 'Andalucía',
    note: 'Trasladado del domingo 1 de noviembre',
  },
  {
    date: '2026-12-07',
    name: 'Día de la Constitución',
    scope: 'Andalucía',
    note: 'Trasladado del domingo 6 de diciembre',
  },
  { date: '2026-12-08', name: 'Inmaculada Concepción', scope: 'España' },
  { date: '2026-12-25', name: 'Natividad del Señor', scope: 'España' },

  // ---- 2027 ----
  { date: '2027-01-01', name: 'Año Nuevo', scope: 'España' },
  { date: '2027-01-06', name: 'Epifanía del Señor', scope: 'España' },
  {
    date: '2027-03-01',
    name: 'Día de Andalucía',
    scope: 'Andalucía',
    note: 'Trasladado del domingo 28 de febrero',
  },
  { date: '2027-03-25', name: 'Jueves Santo', scope: 'Andalucía' },
  { date: '2027-03-26', name: 'Viernes Santo', scope: 'España' },
  { date: '2027-04-14', name: 'Miércoles de Feria', scope: 'Sevilla' },
  { date: '2027-05-01', name: 'Fiesta del Trabajo', scope: 'España' },
  { date: '2027-05-27', name: 'Corpus Christi', scope: 'Sevilla' },
  {
    date: '2027-08-16',
    name: 'Asunción de la Virgen',
    scope: 'Andalucía',
    note: 'Trasladado del domingo 15 de agosto',
  },
  { date: '2027-10-12', name: 'Fiesta Nacional de España', scope: 'España' },
  { date: '2027-11-01', name: 'Todos los Santos', scope: 'España' },
  { date: '2027-12-06', name: 'Día de la Constitución', scope: 'España' },
  { date: '2027-12-08', name: 'Inmaculada Concepción', scope: 'España' },
  { date: '2027-12-25', name: 'Natividad del Señor', scope: 'España' },
];

const byDate = new Map(HOLIDAYS.map((h) => [h.date, h]));

const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function holidayOn(day: Date): Holiday | undefined {
  return byDate.get(key(day));
}

export function holidayTitle(h: Holiday): string {
  return `Festivo (${h.scope}): ${h.name}${h.note ? ` · ${h.note}` : ''}`;
}
