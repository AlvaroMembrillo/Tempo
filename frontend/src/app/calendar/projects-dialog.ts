import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { ProjectStore } from './project-store';
import { EventStore } from './event-store';
import { ToastService } from '../ui/toast';
import { EVENT_COLORS, Project } from './models';
import { addDays, addMonths, fromInputs, startOfMonth, startOfWeek, toDateInput } from './date-utils';
import { buildCsv, downloadFile, formatMoney, projectTotals } from './projects';
import { formatHours } from './availability';

export type ProjectsTab = 'projects' | 'report';

@Component({
  selector: 'app-projects-dialog',
  imports: [FormsModule, NgTemplateOutlet],
  host: {
    class:
      'fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4 dark:bg-black/60',
    '(click)': 'closed.emit()',
    '(document:keydown.escape)': 'closed.emit()',
  },
  template: `
    <div
      class="modal-panel flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-xl dark:bg-gray-900"
      role="dialog"
      aria-modal="true"
      aria-labelledby="projects-title"
      (click)="$event.stopPropagation()"
    >
      <!-- Cabecera con pestañas -->
      <div class="flex items-center gap-4 border-b border-gray-200 px-6 pt-5 dark:border-gray-700">
        <h2 id="projects-title" class="sr-only">Proyectos</h2>
        @for (t of tabs; track t.id) {
          <button
            type="button"
            role="tab"
            class="-mb-px border-b-2 pb-3 text-sm font-medium"
            [class]="
              tab() === t.id
                ? 'border-blue-600 text-blue-700 dark:text-blue-300'
                : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
            "
            [attr.aria-selected]="tab() === t.id"
            (click)="tab.set(t.id)"
          >
            {{ t.label }}
          </button>
        }
        <div class="flex-1"></div>
        <button
          type="button"
          class="-mt-2 mb-1 flex size-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          aria-label="Cerrar"
          (click)="closed.emit()"
        >
          ✕
        </button>
      </div>

      <div class="flex flex-col gap-4 overflow-y-auto p-6">
        @if (tab() === 'projects') {
          <!-- Nuevo proyecto -->
          <form class="flex flex-wrap gap-2" (ngSubmit)="create()" animate.enter="view-fade">
            <input
              name="newName"
              [(ngModel)]="newName"
              placeholder="Nombre del nuevo proyecto"
              aria-label="Nombre del nuevo proyecto"
              class="min-w-0 flex-1 rounded-md bg-gray-100 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-800"
            />
            <button
              type="submit"
              class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              [disabled]="!newName.trim()"
            >
              Añadir
            </button>
          </form>

          @if (store.projects().length === 0) {
            <p class="rounded-lg bg-gray-100 p-4 text-center text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              Aún no tienes proyectos. Crea uno para asignarle eventos y saber cuántas horas
              (y cuánto dinero) le dedicas.
            </p>
          }

          @for (p of activeProjects(); track p.id) {
            <ng-container *ngTemplateOutlet="row; context: { $implicit: p }" />
          }

          @if (archivedProjects().length) {
            <details class="group">
              <summary class="cursor-pointer text-sm font-medium text-gray-600 select-none dark:text-gray-300">
                Archivados ({{ archivedProjects().length }})
              </summary>
              <div class="mt-3 flex flex-col gap-3">
                @for (p of archivedProjects(); track p.id) {
                  <ng-container *ngTemplateOutlet="row; context: { $implicit: p }" />
                }
              </div>
            </details>
          }
        } @else {
          <!-- Informe -->
          <div class="flex flex-col gap-4" animate.enter="view-fade">
            <div class="flex flex-wrap gap-2">
              @for (r of presets; track r.label) {
                <button
                  type="button"
                  class="rounded-full border px-3 py-1 text-sm"
                  [class]="
                    isPreset(r)
                      ? 'border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                      : 'border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800'
                  "
                  (click)="applyPreset(r)"
                >
                  {{ r.label }}
                </button>
              }
            </div>
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="text-gray-500 dark:text-gray-400">Del</span>
              <input
                type="date"
                class="rounded-md bg-gray-100 px-2 py-1 dark:bg-gray-800"
                aria-label="Desde"
                [value]="from()"
                (change)="setDate('from', $event)"
              />
              <span class="text-gray-500 dark:text-gray-400">al</span>
              <input
                type="date"
                class="rounded-md bg-gray-100 px-2 py-1 dark:bg-gray-800"
                aria-label="Hasta (incluido)"
                [value]="to()"
                (change)="setDate('to', $event)"
              />
            </div>

            @if (totals().length === 0) {
              <p class="rounded-lg bg-gray-100 p-4 text-center text-sm text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                No hay horas registradas en estas fechas.
              </p>
            } @else {
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-gray-200 text-left text-xs text-gray-500 uppercase dark:border-gray-700 dark:text-gray-400">
                    <th class="py-2 font-medium">Proyecto</th>
                    <th class="py-2 text-right font-medium">Horas</th>
                    <th class="py-2 text-right font-medium">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of totals(); track t.project?.id ?? 'none') {
                    <tr class="border-b border-gray-100 dark:border-gray-800">
                      <td class="py-2">
                        <div class="flex items-center gap-2">
                          <span
                            class="size-2.5 shrink-0 rounded-full"
                            [style.background-color]="t.project?.color ?? '#9ca3af'"
                          ></span>
                          <span [class.text-gray-500]="!t.project">{{ t.project?.name ?? 'Sin proyecto' }}</span>
                          @if (t.project?.client; as c) {
                            <span class="text-gray-500 dark:text-gray-400">· {{ c }}</span>
                          }
                        </div>
                      </td>
                      <td class="py-2 text-right tabular-nums">{{ hours(t.minutes) }}</td>
                      <td class="py-2 text-right tabular-nums">{{ t.amount != null ? money(t.amount) : '—' }}</td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="font-medium">
                    <td class="py-2">Total con proyecto</td>
                    <td class="py-2 text-right tabular-nums">{{ hours(grandTotal().minutes) }}</td>
                    <td class="py-2 text-right tabular-nums">{{ money(grandTotal().amount) }}</td>
                  </tr>
                </tfoot>
              </table>

              <div class="flex flex-wrap items-center gap-2 rounded-lg bg-gray-100 p-3 text-sm dark:bg-gray-800">
                <span class="text-gray-600 dark:text-gray-300">Exportar a CSV:</span>
                <select
                  class="rounded-md bg-white px-2 py-1 dark:bg-gray-900"
                  aria-label="Proyecto a exportar"
                  [(ngModel)]="exportProject"
                >
                  <option value="all">Todos los proyectos</option>
                  @for (p of store.projects(); track p.id) {
                    <option [value]="p.id">{{ p.name }}</option>
                  }
                </select>
                <button
                  type="button"
                  class="rounded-md bg-blue-600 px-3 py-1.5 font-medium text-white shadow-sm hover:bg-blue-700"
                  (click)="exportCsv()"
                >
                  Descargar
                </button>
                <span class="w-full text-xs text-gray-500 dark:text-gray-400">
                  Una fila por evento con fecha, horas, tarifa e importe. Se abre directamente con Excel o
                  Google Sheets.
                </span>
              </div>
            }
          </div>
        }
      </div>
    </div>

    <!-- Fila editable de un proyecto -->
    <ng-template #row let-p>
      <div
        class="flex flex-col gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
        [class.opacity-60]="p.archived"
        animate.enter="event-enter"
      >
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="size-5 shrink-0 rounded-full"
            title="Cambiar color"
            aria-label="Cambiar color"
            [style.background-color]="p.color"
            (click)="nextColor(p)"
          ></button>
          <input
            class="min-w-0 flex-1 border-b border-transparent bg-transparent font-medium outline-none hover:border-gray-300 focus:border-blue-600 dark:hover:border-gray-600"
            aria-label="Nombre del proyecto"
            [ngModel]="p.name"
            (ngModelChange)="store.update(p.id, { name: $event })"
          />
          <button
            type="button"
            class="rounded-md px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            (click)="store.update(p.id, { archived: !p.archived })"
          >
            {{ p.archived ? 'Reactivar' : 'Archivar' }}
          </button>
          <button
            type="button"
            class="rounded-md px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
            (click)="removeProject(p)"
          >
            Eliminar
          </button>
        </div>
        <div class="flex flex-wrap items-center gap-2 text-sm">
          <input
            class="min-w-0 flex-1 rounded-md bg-gray-100 px-2 py-1 dark:bg-gray-800"
            placeholder="Cliente (opcional)"
            aria-label="Cliente"
            [ngModel]="p.client ?? ''"
            (ngModelChange)="store.update(p.id, { client: $event || undefined })"
          />
          <label class="flex items-center gap-1 text-gray-600 dark:text-gray-300">
            <input
              type="number"
              min="0"
              step="0.5"
              inputmode="decimal"
              class="w-20 rounded-md bg-gray-100 px-2 py-1 text-right dark:bg-gray-800"
              placeholder="0"
              aria-label="Tarifa por hora"
              [ngModel]="p.hourlyRate"
              (ngModelChange)="setRate(p, $event)"
            />
            €/h
          </label>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ projectHours(p) }} en total
          </span>
        </div>
      </div>
    </ng-template>
  `,
})
export class ProjectsDialog implements OnInit {
  protected readonly store = inject(ProjectStore);
  private readonly events = inject(EventStore);
  private readonly toasts = inject(ToastService);

  readonly initialTab = input<ProjectsTab>('projects');
  /** Periodo inicial del informe (fin no incluido). */
  readonly rangeStart = input<Date>(startOfMonth(new Date()));
  readonly rangeEnd = input<Date>(addMonths(new Date(), 1));
  readonly closed = output<void>();

  protected readonly tabs: { id: ProjectsTab; label: string }[] = [
    { id: 'projects', label: 'Proyectos' },
    { id: 'report', label: 'Informe de horas' },
  ];
  protected readonly tab = signal<ProjectsTab>('projects');
  protected newName = '';
  protected exportProject = 'all';

  /** Fechas `YYYY-MM-DD`; `to` incluido. */
  protected readonly from = signal('');
  protected readonly to = signal('');

  protected readonly presets = (() => {
    const today = new Date();
    const week = startOfWeek(today);
    const month = startOfMonth(today);
    return [
      { label: 'Esta semana', from: week, to: addDays(week, 7) },
      { label: 'Semana pasada', from: addDays(week, -7), to: week },
      { label: 'Este mes', from: month, to: addMonths(month, 1) },
      { label: 'Mes pasado', from: addMonths(month, -1), to: month },
    ];
  })();

  protected readonly activeProjects = computed(() => this.store.projects().filter((p) => !p.archived));
  protected readonly archivedProjects = computed(() => this.store.projects().filter((p) => p.archived));

  private readonly range = computed(() => ({
    from: fromInputs(this.from(), '00:00'),
    to: addDays(fromInputs(this.to(), '00:00'), 1),
  }));

  protected readonly totals = computed(() => {
    if (!this.from() || !this.to()) return [];
    const { from, to } = this.range();
    return projectTotals(this.events.events(), this.store.projects(), from, to);
  });

  protected readonly grandTotal = computed(() =>
    this.totals()
      .filter((t) => t.project)
      .reduce((acc, t) => ({ minutes: acc.minutes + t.minutes, amount: acc.amount + (t.amount ?? 0) }), {
        minutes: 0,
        amount: 0,
      }),
  );

  private readonly allTimeMinutes = computed(() => {
    const totals = projectTotals(this.events.events(), this.store.projects(), new Date(0), new Date(8.64e15));
    return new Map(totals.filter((t) => t.project).map((t) => [t.project!.id, t.minutes]));
  });

  protected readonly hours = formatHours;
  protected readonly money = formatMoney;

  ngOnInit(): void {
    this.tab.set(this.initialTab());
    this.from.set(toDateInput(this.rangeStart()));
    this.to.set(toDateInput(addDays(this.rangeEnd(), -1)));
  }

  protected create(): void {
    const name = this.newName.trim();
    if (!name) return;
    this.store.add({ name });
    this.newName = '';
  }

  protected setRate(p: Project, value: number | string | null): void {
    const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'));
    this.store.update(p.id, { hourlyRate: Number.isFinite(n) && n >= 0 ? n : undefined });
  }

  protected nextColor(p: Project): void {
    const i = EVENT_COLORS.findIndex((c) => c.value === p.color);
    this.store.update(p.id, { color: EVENT_COLORS[(i + 1) % EVENT_COLORS.length].value });
  }

  protected projectHours(p: Project): string {
    return formatHours(this.allTimeMinutes().get(p.id) ?? 0);
  }

  /** Borra el proyecto; sus eventos se quedan sin proyecto. Se puede deshacer. */
  protected removeProject(p: Project): void {
    const affected = this.events.unassignProject(p.id);
    this.store.remove(p.id);
    const detail = affected.length ? ` (${affected.length} eventos se quedan sin proyecto)` : '';
    this.toasts.undoable(`Proyecto «${p.name}» eliminado${detail}`, () => {
      this.store.restore(p);
      affected.forEach((e) => this.events.save(e));
    });
  }

  protected isPreset(r: { from: Date; to: Date }): boolean {
    return this.from() === toDateInput(r.from) && this.to() === toDateInput(addDays(r.to, -1));
  }

  protected applyPreset(r: { from: Date; to: Date }): void {
    this.from.set(toDateInput(r.from));
    this.to.set(toDateInput(addDays(r.to, -1)));
  }

  protected setDate(which: 'from' | 'to', ev: Event): void {
    const value = (ev.target as HTMLInputElement).value;
    if (value) (which === 'from' ? this.from : this.to).set(value);
  }

  protected exportCsv(): void {
    const { from, to } = this.range();
    const csv = buildCsv(this.events.events(), this.store.projects(), from, to, this.exportProject);
    const project = this.store.byId().get(this.exportProject);
    const slug = (project?.name ?? 'proyectos')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .toLowerCase();
    downloadFile(`horas-${slug}-${this.from()}_${this.to()}.csv`, csv);
  }
}
