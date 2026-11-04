import { Component, OnInit, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CalendarEvent, EVENT_COLORS, TimeBlock } from './models';
import { fromInputs, overlappingBlocks, toDateInput, toTimeInput } from './date-utils';

@Component({
  selector: 'app-event-dialog',
  imports: [FormsModule],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 dark:bg-black/60 p-4"
      (click)="closed.emit()"
    >
      <form
        class="flex w-full max-w-md flex-col gap-4 rounded-xl bg-white dark:bg-gray-900 p-6 shadow-xl"
        (click)="$event.stopPropagation()"
        (ngSubmit)="submit()"
      >
        <input
          name="title"
          [(ngModel)]="form.title"
          placeholder="Añade un título"
          autofocus
          class="border-b-2 border-gray-200 dark:border-gray-700 pb-1 text-xl outline-none focus:border-blue-600"
        />

        <div class="flex flex-wrap items-center gap-2 text-sm">
          <input
            type="date"
            name="date"
            required
            [(ngModel)]="form.date"
            class="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-1.5"
          />
          <input
            type="time"
            name="startTime"
            required
            step="900"
            [(ngModel)]="form.startTime"
            class="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-1.5"
          />
          <span class="text-gray-500 dark:text-gray-400">–</span>
          <input
            type="time"
            name="endTime"
            required
            step="900"
            [(ngModel)]="form.endTime"
            class="rounded-md bg-gray-100 dark:bg-gray-800 px-2 py-1.5"
          />
        </div>

        <div class="flex gap-2">
          @for (c of colors; track c.value) {
            <button
              type="button"
              class="size-6 rounded-full ring-offset-2 dark:ring-offset-gray-900"
              [class.ring-2]="form.color === c.value"
              [style.background-color]="c.value"
              [style.--tw-ring-color]="c.value"
              [attr.aria-label]="c.label"
              [title]="c.label"
              (click)="form.color = c.value"
            ></button>
          }
        </div>

        <textarea
          name="description"
          rows="3"
          [(ngModel)]="form.description"
          placeholder="Añade una descripción"
          class="resize-none rounded-md bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600"
        ></textarea>

        @if (conflicts(); as names) {
          @if (names.length) {
            <p
              class="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
            >
              ⚠ Coincide con tus horas no disponibles: {{ names.join(', ') }}
            </p>
          }
        }

        @if (error) {
          <p class="text-sm text-red-600 dark:text-red-400">{{ error }}</p>
        }

        <div class="flex items-center gap-2">
          @if (!isNew()) {
            <button
              type="button"
              class="rounded-md px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950"
              (click)="deleted.emit(event().id)"
            >
              Eliminar
            </button>
          }
          <div class="flex-1"></div>
          <button
            type="button"
            class="rounded-md px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            (click)="closed.emit()"
          >
            Cancelar
          </button>
          <button
            type="submit"
            class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Guardar
          </button>
        </div>
      </form>
    </div>
  `,
})
export class EventDialog implements OnInit {
  readonly event = input.required<CalendarEvent>();
  readonly isNew = input(false);
  readonly blocks = input<TimeBlock[]>([]);
  readonly saved = output<CalendarEvent>();
  readonly deleted = output<string>();
  readonly closed = output<void>();

  protected readonly colors = EVENT_COLORS;
  protected error = '';
  protected form = {
    title: '',
    date: '',
    startTime: '',
    endTime: '',
    color: '',
    description: '',
  };

  ngOnInit(): void {
    const e = this.event();
    const start = new Date(e.start);
    const end = new Date(e.end);
    this.form = {
      title: e.title,
      date: toDateInput(start),
      startTime: toTimeInput(start),
      endTime: toTimeInput(end),
      color: e.color,
      description: e.description ?? '',
    };
  }

  /** Nombres de las franjas no disponibles con las que se solapa el evento. */
  protected conflicts(): string[] {
    const { date, startTime, endTime } = this.form;
    if (!date || !startTime || !endTime) return [];
    const start = fromInputs(date, startTime);
    const end = fromInputs(date, endTime);
    if (end <= start) return [];
    return overlappingBlocks(this.blocks(), start, end).map((b) => b.label || 'Sin nombre');
  }

  protected submit(): void {
    const { title, date, startTime, endTime, color, description } = this.form;
    if (!date || !startTime || !endTime) {
      this.error = 'Indica fecha, hora de inicio y hora de fin.';
      return;
    }
    const start = fromInputs(date, startTime);
    const end = fromInputs(date, endTime);
    if (end <= start) {
      this.error = 'La hora de fin debe ser posterior a la de inicio.';
      return;
    }
    this.saved.emit({
      ...this.event(),
      title: title.trim(),
      start: start.toISOString(),
      end: end.toISOString(),
      color,
      description: description.trim() || undefined,
    });
  }
}
