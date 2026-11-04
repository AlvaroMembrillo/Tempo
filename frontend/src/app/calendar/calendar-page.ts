import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { EventStore } from './event-store';
import { ThemeService } from '../theme';
import { WeekView } from './week-view';
import { MonthView } from './month-view';
import { EventDialog } from './event-dialog';
import { AvailabilityDialog } from './availability-dialog';
import { TimeBlockStore } from './time-block-store';
import { dayAvailability, formatHours, sumAvailability } from './availability';
import { holidayOn } from './holidays';
import { CalendarEvent, CalendarView, EVENT_COLORS, TimeBlock } from './models';
import {
  addDays,
  addMonths,
  isSameDay,
  monthGrid,
  startOfDay,
  toDateInput,
  weekDays,
} from './date-utils';

interface Editing {
  event: CalendarEvent;
  isNew: boolean;
}

const monthYear = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const shortMonth = new Intl.DateTimeFormat('es-ES', { month: 'short' });

@Component({
  selector: 'app-calendar-page',
  imports: [DatePipe, WeekView, MonthView, EventDialog, AvailabilityDialog],
  host: { class: 'flex h-dvh flex-col bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100' },
  template: `
    <!-- Barra superior -->
    <header class="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 px-4 py-2 sm:gap-4">
      <span class="mr-2 text-xl font-semibold text-blue-600 dark:text-blue-400">Tempo</span>
      <button
        type="button"
        class="rounded-md border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800"
        (click)="goToday()"
      >
        Hoy
      </button>
      <div class="flex">
        <button type="button" class="flex size-9 items-center justify-center rounded-full text-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Anterior" (click)="move(-1)">‹</button>
        <button type="button" class="flex size-9 items-center justify-center rounded-full text-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800" aria-label="Siguiente" (click)="move(1)">›</button>
      </div>
      <h1 class="truncate text-lg font-medium first-letter:uppercase sm:text-xl">{{ title() }}</h1>
      <div class="flex-1"></div>
      <button
        type="button"
        class="flex size-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 md:hidden dark:text-gray-300 dark:hover:bg-gray-800"
        aria-label="Horas no disponibles"
        title="Horas no disponibles"
        (click)="showAvailability.set(true)"
      >
        <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      </button>
      <button
        type="button"
        class="flex size-9 items-center justify-center rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        [attr.aria-label]="theme.theme() === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
        [title]="theme.theme() === 'dark' ? 'Modo claro' : 'Modo oscuro'"
        (click)="theme.toggle()"
      >
        @if (theme.theme() === 'dark') {
          <!-- Sol -->
          <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        } @else {
          <!-- Luna -->
          <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        }
      </button>
      <div class="flex rounded-md border border-gray-300 dark:border-gray-600 text-sm font-medium">
        <button
          type="button"
          class="rounded-l-md px-3 py-1.5"
          [class]="view() === 'week' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
          (click)="view.set('week')"
        >
          Semana
        </button>
        <button
          type="button"
          class="rounded-r-md border-l border-gray-300 dark:border-gray-600 px-3 py-1.5"
          [class]="view() === 'month' ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
          (click)="view.set('month')"
        >
          Mes
        </button>
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <!-- Lateral -->
      <aside class="hidden w-64 shrink-0 flex-col gap-6 overflow-y-auto p-4 md:flex">
        <button
          type="button"
          class="flex w-fit items-center gap-2 rounded-2xl bg-white dark:bg-gray-900 px-5 py-3 font-medium shadow-md ring-1 ring-gray-200 dark:ring-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
          (click)="createNow()"
        >
          <span class="text-2xl leading-none text-blue-600 dark:text-blue-400">+</span> Crear
        </button>

        <!-- Mini calendario -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium first-letter:uppercase">{{ miniTitle() }}</span>
            <div class="flex">
              <button type="button" class="flex size-7 items-center justify-center rounded-full text-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800" (click)="moveMini(-1)">‹</button>
              <button type="button" class="flex size-7 items-center justify-center rounded-full text-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800" (click)="moveMini(1)">›</button>
            </div>
          </div>
          <div class="grid grid-cols-7 text-center text-xs">
            @for (d of miniDays().slice(0, 7); track d.getTime()) {
              <span class="py-1 text-gray-500 dark:text-gray-400 uppercase">{{ d | date: 'EEEEE' }}</span>
            }
            @for (d of miniDays(); track d.getTime()) {
              <button
                type="button"
                class="mx-auto flex size-7 items-center justify-center rounded-full"
                [class]="miniDayClass(d)"
                [title]="holidayName(d)"
                (click)="cursor.set(d); miniCursor.set(d)"
              >
                {{ d.getDate() }}
              </button>
            }
          </div>
        </div>

        <!-- Resumen de la semana -->
        <div class="rounded-xl bg-gray-100 p-3 text-sm dark:bg-gray-800">
          <div class="mb-2 font-medium first-letter:uppercase">{{ weekLabel() }}</div>
          <dl class="grid grid-cols-[1fr_auto] gap-y-1">
            <dt class="text-gray-600 dark:text-gray-300">Disponible</dt>
            <dd class="text-right tabular-nums">{{ hours(week().available) }}</dd>
            <dt class="text-gray-600 dark:text-gray-300">Planificado</dt>
            <dd class="text-right tabular-nums">{{ hours(week().planned) }}</dd>
            <dt class="font-medium text-emerald-700 dark:text-emerald-400">Libre</dt>
            <dd class="text-right font-medium tabular-nums text-emerald-700 dark:text-emerald-400">
              {{ hours(week().free) }}
            </dd>
          </dl>
          <div
            class="mt-2 h-2 overflow-hidden rounded-full bg-emerald-200 dark:bg-emerald-900"
            role="progressbar"
            aria-label="Tiempo disponible ya planificado"
            [attr.aria-valuenow]="plannedPercent()"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div class="h-full rounded-full bg-blue-600" [style.width.%]="plannedPercent()"></div>
          </div>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {{ plannedPercent() }} % del tiempo disponible planificado
          </p>
        </div>

        <!-- Horas no disponibles -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium">Horas no disponibles</span>
            <button
              type="button"
              class="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-gray-100 dark:text-blue-400 dark:hover:bg-gray-800"
              (click)="showAvailability.set(true)"
            >
              {{ blocks().length ? 'Editar' : 'Añadir' }}
            </button>
          </div>
          @for (b of blocks(); track b.id) {
            <label
              class="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <input
                type="checkbox"
                class="size-4"
                [style.accent-color]="b.color"
                [checked]="b.enabled"
                (change)="timeBlocks.update(b.id, { enabled: !b.enabled })"
              />
              <span class="truncate">{{ b.label || 'Sin nombre' }}</span>
              <span class="ml-auto shrink-0 text-xs text-gray-500 dark:text-gray-400">{{ b.start }}–{{ b.end }}</span>
            </label>
          }
          @if (blocks().length) {
            <div class="mt-2">
              <label class="flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                class="size-4 accent-blue-600"
                [checked]="timeBlocks.compact()"
                (change)="timeBlocks.compact.set(!timeBlocks.compact())"
              />
              Comprimir horas no disponibles
            </label>
            </div>
          } @else {
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Marca las horas en las que no puedes trabajar (sueño, estudios...).
            </p>
          }
        </div>
      </aside>

      <!-- Vista principal -->
      <main class="min-h-0 min-w-0 flex-1">
        @if (view() === 'week') {
          <app-week-view
            [cursor]="cursor()"
            [events]="events()"
            [blocks]="blocks()"
            [compact]="timeBlocks.compact()"
            (blockClick)="blockAction.set($event)"
            (slotClick)="create($event)"
            (eventClick)="edit($event)"
          />
        } @else {
          <app-month-view
            [cursor]="cursor()"
            [events]="events()"
            (dayClick)="create(atHour($event, 9))"
            (eventClick)="edit($event)"
            (moreClick)="openWeek($event)"
          />
        }
      </main>
    </div>

    @if (blockAction(); as ba) {
      <div
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 dark:bg-black/60"
        (click)="blockAction.set(null)"
        (document:keydown.escape)="blockAction.set(null)"
      >
        <div
          class="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900"
          role="dialog"
          aria-labelledby="block-action-title"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-start gap-3">
            <span class="mt-1.5 size-3 shrink-0 rounded-full" [style.background-color]="ba.block.color"></span>
            <div>
              <h2 id="block-action-title" class="text-lg font-medium">{{ ba.block.label || 'Sin nombre' }}</h2>
              <p class="text-sm text-gray-500 first-letter:uppercase dark:text-gray-400">
                {{ ba.day | date: 'EEEE d MMMM y' }} · {{ ba.block.start }}–{{ ba.block.end }}
              </p>
            </div>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-300">
            ¿Este día no tienes «{{ ba.block.label || 'esta franja' }}» (festivo, vacaciones...)?
            Puedes quitarla solo para este día; el resto de días y semanas no cambian.
          </p>
          <div class="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              class="rounded-md px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              (click)="blockAction.set(null); showAvailability.set(true)"
            >
              Editar franjas
            </button>
            <button
              type="button"
              class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              (click)="skipBlockDay(ba.block, ba.day)"
            >
              Quitar solo este día
            </button>
          </div>
        </div>
      </div>
    }

    @if (showAvailability()) {
      <app-availability-dialog (closed)="showAvailability.set(false)" />
    }

    @if (editing(); as ed) {
      <app-event-dialog
        [event]="ed.event"
        [isNew]="ed.isNew"
        [blocks]="blocks()"
        (saved)="save($event)"
        (deleted)="remove($event)"
        (closed)="editing.set(null)"
      />
    }
  `,
})
export class CalendarPage {
  private readonly store = inject(EventStore);
  protected readonly theme = inject(ThemeService);

  protected readonly events = this.store.events;
  protected readonly view = signal<CalendarView>('week');
  protected readonly cursor = signal(startOfDay(new Date()));
  protected readonly miniCursor = signal(startOfDay(new Date()));
  protected readonly editing = signal<Editing | null>(null);
  protected readonly timeBlocks = inject(TimeBlockStore);
  protected readonly blocks = this.timeBlocks.blocks;
  protected readonly showAvailability = signal(false);
  protected readonly blockAction = signal<{ block: TimeBlock; day: Date } | null>(null);

  /** Disponibilidad de la semana que contiene la fecha seleccionada. */
  protected readonly week = computed(() =>
    sumAvailability(
      weekDays(this.cursor()).map((d) => dayAvailability(this.events(), this.blocks(), d)),
    ),
  );
  protected readonly plannedPercent = computed(() => {
    const { available, planned } = this.week();
    return available ? Math.round((planned / available) * 100) : 0;
  });
  protected readonly weekLabel = computed(() => {
    const days = weekDays(this.cursor());
    if (days.some((d) => isSameDay(d, new Date()))) return 'Esta semana';
    const fmt = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
    return `Semana del ${fmt.format(days[0])} al ${fmt.format(days[6])}`;
  });
  protected readonly hours = formatHours;

  protected readonly title = computed(() => {
    const c = this.cursor();
    if (this.view() === 'month') return monthYear.format(c);
    const days = weekDays(c);
    const first = days[0];
    const last = days[6];
    if (first.getMonth() === last.getMonth()) return monthYear.format(first);
    const year =
      first.getFullYear() === last.getFullYear()
        ? `${last.getFullYear()}`
        : `${first.getFullYear()} – ${last.getFullYear()}`;
    return `${shortMonth.format(first)} – ${shortMonth.format(last)} ${year}`;
  });

  protected readonly miniTitle = computed(() => monthYear.format(this.miniCursor()));
  protected readonly miniDays = computed(() => monthGrid(this.miniCursor()));

  protected skipBlockDay(block: TimeBlock, day: Date): void {
    this.timeBlocks.skipDay(block.id, toDateInput(day));
    this.blockAction.set(null);
  }

  protected goToday(): void {
    const today = startOfDay(new Date());
    this.cursor.set(today);
    this.miniCursor.set(today);
  }

  protected move(dir: 1 | -1): void {
    const next =
      this.view() === 'week' ? addDays(this.cursor(), 7 * dir) : addMonths(this.cursor(), dir);
    this.cursor.set(next);
    this.miniCursor.set(next);
  }

  protected moveMini(dir: 1 | -1): void {
    this.miniCursor.update((d) => addMonths(d, dir));
  }

  protected holidayName(d: Date): string {
    return holidayOn(d)?.name ?? '';
  }

  protected miniDayClass(d: Date): string {
    if (isSameDay(d, new Date())) return 'bg-blue-600 text-white';
    if (isSameDay(d, this.cursor())) return 'bg-blue-100 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200';
    if (d.getMonth() !== this.miniCursor().getMonth()) return 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800';
    if (holidayOn(d)) return 'font-semibold text-rose-600 dark:text-rose-400 hover:bg-gray-100 dark:hover:bg-gray-800';
    return 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800';
  }

  protected atHour(day: Date, hour: number): Date {
    const d = new Date(day);
    d.setHours(hour, 0, 0, 0);
    return d;
  }

  protected openWeek(day: Date): void {
    this.cursor.set(day);
    this.view.set('week');
  }

  /** Crea un evento en la próxima hora en punto del día seleccionado. */
  protected createNow(): void {
    const now = new Date();
    const start = this.atHour(this.cursor(), Math.min(now.getHours() + 1, 23));
    this.create(start);
  }

  protected create(start: Date): void {
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    this.editing.set({
      isNew: true,
      event: {
        id: crypto.randomUUID(),
        title: '',
        start: start.toISOString(),
        end: end.toISOString(),
        color: EVENT_COLORS[0].value,
      },
    });
  }

  protected edit(event: CalendarEvent): void {
    this.editing.set({ event, isNew: false });
  }

  protected save(event: CalendarEvent): void {
    this.store.save(event);
    this.editing.set(null);
  }

  protected remove(id: string): void {
    this.store.remove(id);
    this.editing.set(null);
  }
}
