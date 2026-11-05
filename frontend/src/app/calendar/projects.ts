import { CalendarEvent, Project } from './models';
import { toDateInput, toTimeInput } from './date-utils';

export interface ProjectTotal {
  /** `null` = eventos sin proyecto. */
  project: Project | null;
  minutes: number;
  /** Importe en €; `null` si el proyecto no tiene tarifa. */
  amount: number | null;
}

/** Minutos del evento que caen dentro de [from, to). */
export function minutesWithin(event: CalendarEvent, from: Date, to: Date): number {
  const s = Math.max(new Date(event.start).getTime(), from.getTime());
  const e = Math.min(new Date(event.end).getTime(), to.getTime());
  return e > s ? (e - s) / 60_000 : 0;
}

export function amountFor(minutes: number, project: Project | null | undefined): number | null {
  return project?.hourlyRate != null ? (minutes / 60) * project.hourlyRate : null;
}

/**
 * Horas (e importe) por proyecto en el periodo [from, to).
 * Ordenado de más a menos horas, con «sin proyecto» al final.
 */
export function projectTotals(
  events: CalendarEvent[],
  projects: Project[],
  from: Date,
  to: Date,
): ProjectTotal[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const minutes = new Map<string | null, number>();
  for (const e of events) {
    const m = minutesWithin(e, from, to);
    if (!m) continue;
    const key = e.projectId && byId.has(e.projectId) ? e.projectId : null;
    minutes.set(key, (minutes.get(key) ?? 0) + m);
  }
  return [...minutes.entries()]
    .map(([id, m]) => {
      const project = id ? byId.get(id)! : null;
      return { project, minutes: m, amount: amountFor(m, project) };
    })
    .sort((a, b) => {
      if (!a.project !== !b.project) return a.project ? -1 : 1;
      return b.minutes - a.minutes;
    });
}

const money = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });

export function formatMoney(amount: number): string {
  return money.format(amount);
}

// ---------------------------------------------------------------------------
// Exportar a CSV (separado por «;» y con coma decimal, como lo abre Excel en español)
// ---------------------------------------------------------------------------

const CSV_HEADER = [
  'Fecha',
  'Inicio',
  'Fin',
  'Horas',
  'Proyecto',
  'Cliente',
  'Evento',
  'Tarifa (€/h)',
  'Importe (€)',
];

const decimal = (n: number) => n.toFixed(2).replace('.', ',');

function csvField(value: string): string {
  return /[;"\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * CSV con un evento por fila y una fila final de total.
 * `projectId`: un proyecto concreto, o `'all'` para todos los eventos que tienen proyecto.
 */
export function buildCsv(
  events: CalendarEvent[],
  projects: Project[],
  from: Date,
  to: Date,
  projectId: string | 'all' = 'all',
): string {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const rows = events
    .filter((e) => e.projectId && byId.has(e.projectId))
    .filter((e) => projectId === 'all' || e.projectId === projectId)
    .filter((e) => minutesWithin(e, from, to) > 0)
    .sort((a, b) => a.start.localeCompare(b.start));

  let totalMinutes = 0;
  let totalAmount = 0;
  let anyAmount = false;
  const lines = rows.map((e) => {
    const p = byId.get(e.projectId!)!;
    const minutes = minutesWithin(e, from, to);
    const amount = amountFor(minutes, p);
    totalMinutes += minutes;
    if (amount != null) {
      totalAmount += amount;
      anyAmount = true;
    }
    const start = new Date(e.start);
    const end = new Date(e.end);
    return [
      toDateInput(start),
      toTimeInput(start),
      toTimeInput(end),
      decimal(minutes / 60),
      p.name,
      p.client ?? '',
      e.title || 'Sin título',
      p.hourlyRate != null ? decimal(p.hourlyRate) : '',
      amount != null ? decimal(amount) : '',
    ];
  });

  lines.push(['Total', '', '', decimal(totalMinutes / 60), '', '', '', '', anyAmount ? decimal(totalAmount) : '']);

  // BOM para que Excel reconozca los acentos
  return '\ufeff' + [CSV_HEADER, ...lines].map((r) => r.map(csvField).join(';')).join('\r\n') + '\r\n';
}

/** Descarga un texto como archivo. */
export function downloadFile(filename: string, content: string, type = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
