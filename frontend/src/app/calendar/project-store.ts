import { Injectable, computed, inject, signal } from '@angular/core';
import { Api } from '../core/api';
import { SyncQueue } from '../core/sync-queue';
import { EVENT_COLORS, Project } from './models';

/** Proyectos del usuario, guardados en el servidor. */
@Injectable({ providedIn: 'root' })
export class ProjectStore {
  private readonly api = inject(Api);
  private readonly sync = inject(SyncQueue);

  private readonly _projects = signal<Project[]>([]);
  readonly projects = this._projects.asReadonly();
  /** Proyectos que se pueden elegir al crear un evento. */
  readonly active = computed(() => this._projects().filter((p) => !p.archived));
  readonly byId = computed(() => new Map(this._projects().map((p) => [p.id, p])));

  async load(): Promise<void> {
    this._projects.set(await this.api.get<Project[]>('/projects'));
  }

  clear(): void {
    this._projects.set([]);
  }

  /** Crea un proyecto; si no se indica color, usa el siguiente libre de la paleta. */
  add(data: Omit<Project, 'id' | 'color'> & { color?: string }): Project {
    const used = new Set(this._projects().map((p) => p.color));
    const color =
      data.color ?? EVENT_COLORS.find((c) => !used.has(c.value))?.value ?? EVENT_COLORS[0].value;
    const project: Project = { ...data, name: data.name.trim(), color, id: crypto.randomUUID() };
    this._projects.update((list) => [...list, project]);
    this.create(project);
    return project;
  }

  /** Los cambios seguidos (p. ej. al escribir el nombre) se envían juntos. */
  update(id: string, patch: Partial<Omit<Project, 'id'>>): void {
    this._projects.update((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    this.sync.debounce(
      `project:${id}`,
      () => {
        const project = this.byId().get(id);
        return project ? this.api.patch(`/projects/${id}`, projectPayload(project)) : undefined;
      },
      () => this.reload(),
    );
  }

  remove(id: string): void {
    this.sync.cancel(`project:${id}`);
    this._projects.update((list) => list.filter((p) => p.id !== id));
    void this.sync.run(() => this.api.delete(`/projects/${id}`), () => this.reload());
  }

  /** Vuelve a añadir un proyecto borrado (para «Deshacer»), con el mismo id. */
  restore(project: Project): void {
    if (this._projects().some((p) => p.id === project.id)) return;
    this._projects.update((list) => [...list, project]);
    this.create(project);
  }

  private create(project: Project): void {
    void this.sync.run(
      () => this.api.post('/projects', { id: project.id, ...projectPayload(project) }),
      () => this.reload(),
    );
  }

  private reload(): void {
    this.load().catch(() => undefined);
  }
}

function projectPayload(p: Project) {
  return {
    name: p.name.trim() || 'Sin nombre',
    client: p.client?.trim() || null,
    color: p.color,
    // El servidor guarda la tarifa con 2 decimales
    hourlyRate: p.hourlyRate != null ? Math.round(p.hourlyRate * 100) / 100 : null,
    archived: !!p.archived,
  };
}
