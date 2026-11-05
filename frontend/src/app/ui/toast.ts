import { Component, Injectable, inject, signal } from '@angular/core';

export interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  action?: () => void;
}

/** Avisos breves en la parte inferior, con acción opcional (p. ej. «Deshacer»). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 1;

  show(message: string, opts: { actionLabel?: string; action?: () => void; duration?: number } = {}): void {
    const toast: Toast = { id: this.nextId++, message, actionLabel: opts.actionLabel, action: opts.action };
    // Como mucho 3 avisos a la vez
    this.toasts.update((list) => [...list.slice(-2), toast]);
    setTimeout(() => this.dismiss(toast.id), opts.duration ?? 6000);
  }

  /** Aviso con botón «Deshacer». */
  undoable(message: string, undo: () => void): void {
    this.show(message, { actionLabel: 'Deshacer', action: undo });
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}

@Component({
  selector: 'app-toasts',
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6"
      aria-live="polite"
    >
      @for (t of service.toasts(); track t.id) {
        <div
          class="pointer-events-auto flex max-w-md items-center gap-3 rounded-xl bg-gray-900 py-2.5 pr-2 pl-4 text-sm text-white shadow-xl dark:bg-gray-100 dark:text-gray-900"
          role="status"
          animate.enter="toast-enter"
          animate.leave="toast-leave"
        >
          <span class="min-w-0 flex-1">{{ t.message }}</span>
          @if (t.action) {
            <button
              type="button"
              class="shrink-0 rounded-md px-2 py-1 font-semibold text-blue-300 hover:bg-white/10 dark:text-blue-700 dark:hover:bg-black/5"
              (click)="run(t)"
            >
              {{ t.actionLabel }}
            </button>
          }
          <button
            type="button"
            class="flex size-7 shrink-0 items-center justify-center rounded-md opacity-60 hover:bg-white/10 hover:opacity-100 dark:hover:bg-black/5"
            aria-label="Cerrar aviso"
            (click)="service.dismiss(t.id)"
          >
            ✕
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastHost {
  protected readonly service = inject(ToastService);

  protected run(t: Toast): void {
    t.action?.();
    this.service.dismiss(t.id);
  }
}
