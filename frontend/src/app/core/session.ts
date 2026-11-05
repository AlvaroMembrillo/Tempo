import { Injectable, inject, signal } from '@angular/core';
import { EventStore } from '../calendar/event-store';
import { setHolidays, Holiday } from '../calendar/holidays';
import { ProjectStore } from '../calendar/project-store';
import { TimeBlockStore } from '../calendar/time-block-store';
import { ToastService } from '../ui/toast';
import { Api, apiErrorMessage } from './api';
import { AuthService } from './auth';
import { uploadLocalData } from './local-migration';
import { SyncQueue } from './sync-queue';

/** Carga los datos del usuario al entrar y los vacía al salir. */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);
  private readonly sync = inject(SyncQueue);
  private readonly events = inject(EventStore);
  private readonly projects = inject(ProjectStore);
  private readonly blocks = inject(TimeBlockStore);

  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly error = signal('');

  constructor() {
    this.auth.onLogout(() => this.clear());
  }

  /** Prepara los datos de la sesión (solo la primera vez que se llama). */
  async start(): Promise<void> {
    if (this.status() === 'loading' || this.status() === 'ready') return;
    this.status.set('loading');

    // 1) Lo que hubiera guardado en este navegador se sube a la cuenta
    try {
      const uploaded = await uploadLocalData(this.api);
      if (uploaded) this.toasts.show(uploadedMessage(uploaded), { duration: 10000 });
    } catch (err) {
      this.toasts.show(
        `No se pudieron subir los datos de este navegador (${apiErrorMessage(err)}). ` +
          'Siguen guardados aquí y se volverá a intentar la próxima vez.',
        { duration: 12000 },
      );
    }

    // 2) Se carga todo desde el servidor
    try {
      await Promise.all([
        this.auth.user() ? Promise.resolve() : this.auth.loadUser(),
        this.events.load(),
        this.projects.load(),
        this.blocks.load(),
        this.api.get<Holiday[]>('/holidays').then(setHolidays),
      ]);
      this.status.set('ready');
    } catch (err) {
      // Un 401 ya cierra la sesión desde el interceptor
      this.error.set(apiErrorMessage(err));
      this.status.set('error');
    }
  }

  async retry(): Promise<void> {
    this.status.set('idle');
    await this.start();
  }

  private clear(): void {
    this.sync.reset();
    this.events.clear();
    this.projects.clear();
    this.blocks.clear();
    setHolidays([]);
    this.status.set('idle');
  }
}

function uploadedMessage({ events, projects, timeBlocks }: { events: number; projects: number; timeBlocks: number }): string {
  const parts = [
    plural(events, 'evento', 'eventos'),
    plural(projects, 'proyecto', 'proyectos'),
    plural(timeBlocks, 'franja', 'franjas'),
  ].filter(Boolean);
  return `Hemos subido a tu cuenta lo que tenías en este navegador: ${parts.join(', ')}.`;
}

function plural(n: number, one: string, many: string): string {
  return n ? `${n} ${n === 1 ? one : many}` : '';
}
