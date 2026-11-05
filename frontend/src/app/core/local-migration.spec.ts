import { BACKUP_KEY, readLocalData, toImportPayload, uploadLocalData } from './local-migration';
import { Api } from './api';

/** localStorage en memoria para no tocar el del navegador de los tests */
function memoryStorage(initial: Record<string, unknown> = {}): Storage {
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  };
}

const project = { id: 'p1', name: '  Web Acme ', color: '#2563eb', hourlyRate: 40.555, client: '' };
const event = {
  id: 'e1',
  title: 'Reunión',
  start: '2026-11-09T09:00:00.000Z',
  end: '2026-11-09T10:00:00.000Z',
  color: '#2563eb',
  projectId: 'p1',
};
const backwards = { ...event, id: 'e2', start: event.end, end: event.start };
const block = {
  id: 'b1',
  label: 'Estudios',
  start: '17:30',
  end: '20:30',
  days: [0, 1, 2, 3, 4],
  color: '#0d9488',
  enabled: true,
};

describe('subir los datos del navegador', () => {
  it('no hay nada que subir si no hay datos', () => {
    expect(readLocalData(memoryStorage())).toBeNull();
    expect(readLocalData(memoryStorage({ 'tempo.events': [], 'tempo.projects': 'roto' }))).toBeNull();
  });

  it('adapta los datos a lo que acepta el backend', () => {
    const data = readLocalData(
      memoryStorage({ 'tempo.projects': [project], 'tempo.events': [event, backwards], 'tempo.timeBlocks': [block] }),
    )!;
    const payload = toImportPayload(data);
    expect(payload.projects[0]).toEqual({
      id: 'p1',
      name: 'Web Acme',
      client: null,
      color: '#2563eb',
      hourlyRate: 40.56, // el backend admite 2 decimales
      archived: false,
    });
    expect(payload.events.map((e) => e.id)).toEqual(['e1']); // el que acaba antes de empezar se descarta
    expect(payload.events[0].description).toBeNull();
    expect(payload.timeBlocks[0]).toMatchObject({ keepOnHolidays: null, exceptions: [] });
  });

  it('sube los datos, los borra del navegador y deja una copia', async () => {
    const storage = memoryStorage({ 'tempo.events': [event], 'tempo.theme': 'dark' });
    const posted: unknown[] = [];
    const api = {
      post: async (path: string, body: unknown) => {
        posted.push([path, body]);
        return { projects: 0, events: 1, timeBlocks: 0 };
      },
    } as unknown as Api;

    expect(await uploadLocalData(api, storage)).toEqual({ projects: 0, events: 1, timeBlocks: 0 });
    expect(posted).toHaveLength(1);
    expect(storage.getItem('tempo.events')).toBeNull();
    expect(storage.getItem('tempo.theme')).toBe('"dark"'); // las preferencias no se tocan
    expect(JSON.parse(storage.getItem(BACKUP_KEY)!).events).toHaveLength(1);
    // La segunda vez ya no hay nada que subir
    expect(await uploadLocalData(api, storage)).toBeNull();
  });

  it('si falla la subida, los datos se quedan en el navegador', async () => {
    const storage = memoryStorage({ 'tempo.events': [event] });
    const api = { post: async () => Promise.reject(new Error('sin red')) } as unknown as Api;

    await expect(uploadLocalData(api, storage)).rejects.toThrow('sin red');
    expect(readLocalData(storage)?.events).toHaveLength(1);
    expect(storage.getItem(BACKUP_KEY)).toBeNull();
  });
});
