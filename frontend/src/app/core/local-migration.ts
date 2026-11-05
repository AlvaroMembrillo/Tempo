import { CalendarEvent, Project, TimeBlock } from '../calendar/models';
import { Api } from './api';

/**
 * Datos que la app guardaba en el navegador antes de tener backend.
 * Al iniciar sesión se suben a la cuenta automáticamente y se borran de aquí
 * (queda una copia de seguridad en `BACKUP_KEY`).
 */
const LOCAL_KEYS = {
  projects: 'tempo.projects',
  events: 'tempo.events',
  timeBlocks: 'tempo.timeBlocks',
} as const;
export const BACKUP_KEY = 'tempo.copia-antes-de-subir';

export interface LocalData {
  projects: Project[];
  events: CalendarEvent[];
  timeBlocks: TimeBlock[];
}

export interface ImportResult {
  projects: number;
  events: number;
  timeBlocks: number;
}

/** Lee lo guardado en el navegador; `null` si no hay nada que subir. */
export function readLocalData(storage: Storage = localStorage): LocalData | null {
  const read = <T>(key: string): T[] => {
    try {
      const value = JSON.parse(storage.getItem(key) ?? '[]');
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  const data: LocalData = {
    projects: read<Project>(LOCAL_KEYS.projects),
    events: read<CalendarEvent>(LOCAL_KEYS.events),
    timeBlocks: read<TimeBlock>(LOCAL_KEYS.timeBlocks),
  };
  const empty = !data.projects.length && !data.events.length && !data.timeBlocks.length;
  return empty ? null : data;
}

/** Adapta los datos a lo que acepta `POST /data/import` (y descarta lo que no es válido). */
export function toImportPayload(data: LocalData) {
  return {
    projects: data.projects.map((p) => ({
      id: p.id,
      name: p.name?.trim().slice(0, 200) || 'Sin nombre',
      client: p.client?.trim() || null,
      color: p.color,
      hourlyRate: p.hourlyRate != null ? Math.round(p.hourlyRate * 100) / 100 : null,
      archived: !!p.archived,
    })),
    events: data.events
      .filter((e) => new Date(e.end) > new Date(e.start))
      .map((e) => ({
        id: e.id,
        title: (e.title ?? '').slice(0, 300),
        description: e.description || null,
        start: e.start,
        end: e.end,
        color: e.color,
        projectId: e.projectId || null,
      })),
    timeBlocks: data.timeBlocks.map((b) => ({
      id: b.id,
      label: (b.label ?? '').slice(0, 120),
      start: b.start,
      end: b.end,
      days: b.days,
      color: b.color,
      enabled: b.enabled !== false,
      keepOnHolidays: b.keepOnHolidays ?? null,
      exceptions: b.exceptions ?? [],
    })),
  };
}

/**
 * Sube a la cuenta lo que hubiera en el navegador. Si va bien, lo borra de aquí
 * para no volver a subirlo (guardando antes una copia de seguridad).
 * Si falla, lanza el error y los datos se quedan donde estaban.
 */
export async function uploadLocalData(api: Api, storage: Storage = localStorage): Promise<ImportResult | null> {
  const data = readLocalData(storage);
  if (!data) return null;
  const result = await api.post<ImportResult>('/data/import', toImportPayload(data));
  try {
    storage.setItem(BACKUP_KEY, JSON.stringify({ subidoEl: new Date().toISOString(), ...data }));
  } catch {
    // sin espacio para la copia: no es grave, los datos ya están en el servidor
  }
  Object.values(LOCAL_KEYS).forEach((key) => storage.removeItem(key));
  return result;
}
