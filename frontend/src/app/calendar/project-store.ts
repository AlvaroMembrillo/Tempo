import { Injectable, computed, effect, signal } from '@angular/core';
import { EVENT_COLORS, Project } from './models';

const STORAGE_KEY = 'tempo.projects';

/** Proyectos del usuario, persistidos en localStorage. */
@Injectable({ providedIn: 'root' })
export class ProjectStore {
  private readonly _projects = signal<Project[]>(load());
  readonly projects = this._projects.asReadonly();
  /** Proyectos que se pueden elegir al crear un evento. */
  readonly active = computed(() => this._projects().filter((p) => !p.archived));
  readonly byId = computed(() => new Map(this._projects().map((p) => [p.id, p])));

  constructor() {
    effect(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._projects()));
      } catch {
        // almacenamiento no disponible
      }
    });
  }

  /** Crea un proyecto; si no se indica color, usa el siguiente libre de la paleta. */
  add(data: Omit<Project, 'id' | 'color'> & { color?: string }): Project {
    const used = new Set(this._projects().map((p) => p.color));
    const color =
      data.color ?? EVENT_COLORS.find((c) => !used.has(c.value))?.value ?? EVENT_COLORS[0].value;
    const project: Project = { ...data, name: data.name.trim(), color, id: crypto.randomUUID() };
    this._projects.update((list) => [...list, project]);
    return project;
  }

  update(id: string, patch: Partial<Omit<Project, 'id'>>): void {
    this._projects.update((list) => list.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  remove(id: string): void {
    this._projects.update((list) => list.filter((p) => p.id !== id));
  }

  /** Vuelve a añadir un proyecto borrado (para «Deshacer»). */
  restore(project: Project): void {
    this._projects.update((list) => (list.some((p) => p.id === project.id) ? list : [...list, project]));
  }
}

function load(): Project[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Project[]) : [];
  } catch {
    return [];
  }
}
