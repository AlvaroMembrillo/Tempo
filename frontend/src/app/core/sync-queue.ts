import { Injectable, computed, inject, signal } from '@angular/core';
import { ToastService } from '../ui/toast';
import { apiErrorMessage } from './api';

type Task = () => Promise<unknown> | undefined;

/**
 * Cola de guardado en el servidor.
 *
 * Los cambios se aplican al momento en pantalla y aquí se envían en orden, uno
 * detrás de otro (así, por ejemplo, un proyecto recuperado con «Deshacer» existe
 * antes de volver a asignárselo a sus eventos). Si algo falla se avisa y se
 * llama a `onError` para recargar los datos del servidor.
 */
@Injectable({ providedIn: 'root' })
export class SyncQueue {
  private readonly toasts = inject(ToastService);
  private chain: Promise<void> = Promise.resolve();
  private readonly debounced = new Map<string, { timer: ReturnType<typeof setTimeout>; task: Task; onError?: () => void }>();
  private readonly pendingCount = signal(0);

  /** Hay cambios sin guardar todavía. */
  readonly saving = computed(() => this.pendingCount() > 0);

  run(task: Task, onError?: () => void): Promise<void> {
    this.pendingCount.update((n) => n + 1);
    this.chain = this.chain
      .then(() => task())
      .then(
        () => undefined,
        (err: unknown) => {
          this.toasts.show(`No se pudo guardar: ${apiErrorMessage(err)}`);
          onError?.();
        },
      )
      .finally(() => this.pendingCount.update((n) => n - 1));
    return this.chain;
  }

  /**
   * Agrupa cambios seguidos de un mismo elemento (p. ej. al escribir su nombre)
   * en una sola petición. La tarea se evalúa al enviarse, con el estado más reciente.
   */
  debounce(key: string, task: Task, onError?: () => void, ms = 500): void {
    const existing = this.debounced.get(key);
    if (existing) clearTimeout(existing.timer);
    else this.pendingCount.update((n) => n + 1);
    const timer = setTimeout(() => this.flush(key), ms);
    this.debounced.set(key, { timer, task, onError });
  }

  /** Envía ya un cambio agrupado pendiente. */
  flush(key: string): void {
    const entry = this.debounced.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.debounced.delete(key);
    this.pendingCount.update((n) => n - 1);
    void this.run(entry.task, entry.onError);
  }

  /** Descarta un cambio agrupado pendiente (p. ej. si el elemento se borra). */
  cancel(key: string): void {
    const entry = this.debounced.get(key);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.debounced.delete(key);
    this.pendingCount.update((n) => n - 1);
  }

  /** Envía todo lo pendiente y espera a que termine. */
  async flushAll(): Promise<void> {
    for (const key of [...this.debounced.keys()]) this.flush(key);
    await this.chain;
  }

  /** Olvida todo lo pendiente (al cerrar sesión). */
  reset(): void {
    for (const key of [...this.debounced.keys()]) this.cancel(key);
  }
}
