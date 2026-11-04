import { Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TimeBlockStore } from './time-block-store';
import { BLOCK_COLORS, BLOCK_PRESETS, TimeBlock } from './models';
import { blockDuration, formatDuration, minutesOf } from './date-utils';

const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

@Component({
  selector: 'app-availability-dialog',
  imports: [FormsModule],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 dark:bg-black/60"
      (click)="closed.emit()"
    >
      <div
        class="flex max-h-full w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900"
        role="dialog"
        aria-labelledby="availability-title"
        (click)="$event.stopPropagation()"
      >
        <div>
          <h2 id="availability-title" class="text-xl font-medium">Horas no disponibles</h2>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Franjas que se repiten cada semana en las que no puedes trabajar: sueño, otro trabajo,
            estudios... Se mostrarán sombreadas en el calendario.
          </p>
        </div>

        <!-- Añadir desde plantilla -->
        <div class="flex flex-wrap gap-2">
          @for (p of presets; track p.name) {
            <button
              type="button"
              class="rounded-full border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
              (click)="store.add(p.block)"
            >
              + {{ p.name }}
            </button>
          }
        </div>

        @if (store.blocks().length) {
          <label class="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              class="size-4 accent-blue-600"
              [checked]="store.compact()"
              (change)="store.compact.set(!store.compact())"
            />
            Comprimir en la vista semana las horas no disponibles todos los días
          </label>
        }

        @if (store.blocks().length === 0) {
          <p class="rounded-lg bg-gray-100 p-4 text-center text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            Aún no tienes franjas. Añade una con los botones de arriba.
          </p>
        }

        @for (b of store.blocks(); track b.id) {
          <div
            class="flex flex-col gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
            [class.opacity-50]="!b.enabled"
          >
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="size-5 shrink-0 rounded-full"
                title="Cambiar color"
                aria-label="Cambiar color"
                [style.background-color]="b.color"
                (click)="nextColor(b)"
              ></button>
              <input
                class="min-w-0 flex-1 border-b border-transparent bg-transparent font-medium outline-none hover:border-gray-300 focus:border-blue-600 dark:hover:border-gray-600"
                aria-label="Nombre de la franja"
                [ngModel]="b.label"
                (ngModelChange)="store.update(b.id, { label: $event })"
              />
              <label class="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  class="size-4 accent-blue-600"
                  [checked]="b.enabled"
                  (change)="store.update(b.id, { enabled: !b.enabled })"
                />
                Activa
              </label>
              <button
                type="button"
                class="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                (click)="store.remove(b.id)"
              >
                Eliminar
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="text-gray-500 dark:text-gray-400">De</span>
              <input
                type="time"
                step="900"
                class="rounded-md bg-gray-100 px-2 py-1 dark:bg-gray-800"
                aria-label="Hora de inicio"
                [value]="b.start"
                (change)="setTime(b, 'start', $event)"
              />
              <span class="text-gray-500 dark:text-gray-400">a</span>
              <input
                type="time"
                step="900"
                class="rounded-md bg-gray-100 px-2 py-1 dark:bg-gray-800"
                aria-label="Hora de fin"
                [value]="b.end"
                (change)="setTime(b, 'end', $event)"
              />
              <span class="text-gray-500 dark:text-gray-400">
                · {{ duration(b) }}{{ crossesMidnight(b) ? ' (hasta el día siguiente)' : '' }}
              </span>
            </div>

            <div class="flex gap-1">
              @for (label of dayLabels; track $index) {
                <button
                  type="button"
                  class="size-8 rounded-full text-xs font-medium"
                  [class]="
                    b.days.includes($index)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                  "
                  [attr.aria-pressed]="b.days.includes($index)"
                  [attr.aria-label]="dayNames[$index]"
                  (click)="toggleDay(b, $index)"
                >
                  {{ label }}
                </button>
              }
            </div>
          </div>
        }

        <div class="flex justify-end">
          <button
            type="button"
            class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            (click)="closed.emit()"
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AvailabilityDialog {
  protected readonly store = inject(TimeBlockStore);
  readonly closed = output<void>();

  protected readonly presets = BLOCK_PRESETS;
  protected readonly dayLabels = DAY_LABELS;
  protected readonly dayNames = DAY_NAMES;

  protected duration(b: TimeBlock): string {
    return formatDuration(blockDuration(b));
  }

  protected crossesMidnight(b: TimeBlock): boolean {
    return minutesOf(b.end) <= minutesOf(b.start);
  }

  protected setTime(b: TimeBlock, field: 'start' | 'end', ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    if (value) this.store.update(b.id, { [field]: value });
  }

  protected toggleDay(b: TimeBlock, day: number): void {
    const days = b.days.includes(day)
      ? b.days.filter((d) => d !== day)
      : [...b.days, day].sort((x, y) => x - y);
    this.store.update(b.id, { days });
  }

  protected nextColor(b: TimeBlock): void {
    const i = BLOCK_COLORS.indexOf(b.color as (typeof BLOCK_COLORS)[number]);
    this.store.update(b.id, { color: BLOCK_COLORS[(i + 1) % BLOCK_COLORS.length] });
  }
}
