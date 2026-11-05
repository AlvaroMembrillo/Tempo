import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { EventStore } from './event-store';
import { ThemeService } from '../theme';
import { ToastService } from '../ui/toast';
import { AuthService } from '../core/auth';
import { Session } from '../core/session';
import { SyncQueue } from '../core/sync-queue';
import { EventChange, WeekView } from './week-view';
import { MonthView } from './month-view';
import { EventDialog } from './event-dialog';
import { AvailabilityDialog } from './availability-dialog';
import { ProjectsDialog, ProjectsTab } from './projects-dialog';
import { ProjectStore } from './project-store';
import { formatMoney, projectTotals } from './projects';
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
  startOfMonth,
  startOfWeek,
  toDateInput,
  weekDays,
} from './date-utils';

interface Editing {
  event: CalendarEvent;
  isNew: boolean;
}

const VIEW_KEY = 'tempo.view';
const VIEWS: { id: CalendarView; label: string; short: string; key: string }[] = [
  { id: 'day', label: 'Día', short: 'Día', key: 'D' },
  { id: 'week', label: 'Semana', short: 'Sem.', key: 'S' },
  { id: 'month', label: 'Mes', short: 'Mes', key: 'M' },
];

const monthYear = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
const shortMonth = new Intl.DateTimeFormat('es-ES', { month: 'short' });
const longDay = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDay = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
const hourMin = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });

const ICON_BTN =
  'flex size-9 shrink-0 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800';

@Component({
  selector: 'app-calendar-page',
  imports: [DatePipe, WeekView, MonthView, EventDialog, AvailabilityDialog, ProjectsDialog],
  host: {
    class: 'flex h-dvh flex-col bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100',
    '(document:keydown)': 'onKeydown($event)',
  },
  template: `
    <!-- Barra superior -->
    <header
      class="flex flex-wrap items-center gap-1 border-b border-gray-200 px-2 py-2 sm:flex-nowrap sm:gap-3 sm:px-4 dark:border-gray-700"
    >
      <span class="mr-1 hidden items-center gap-2 text-xl font-semibold text-blue-600 sm:flex dark:text-blue-400">
        <img src="favicon.svg" alt="" class="size-8" />
        Tempo
      </span>
      <button
        type="button"
        class="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
        title="Ir a hoy (T)"
        (click)="goToday()"
      >
        Hoy
      </button>
      <div class="flex shrink-0">
        <button type="button" [class]="iconBtn + ' text-xl'" [attr.aria-label]="'Anterior (←)'" title="Anterior (←)" (click)="move(-1)">‹</button>
        <button type="button" [class]="iconBtn + ' text-xl'" [attr.aria-label]="'Siguiente (→)'" title="Siguiente (→)" (click)="move(1)">›</button>
      </div>
      <!-- En móvil el título va en su propia fila, encima de los controles -->
      <h1
        class="order-first w-full truncate px-1 pb-1 text-lg font-medium first-letter:uppercase sm:order-none sm:w-auto sm:min-w-0 sm:flex-1 sm:p-0 sm:text-xl"
      >
        {{ title() }}
      </h1>
      <div class="flex-1 sm:hidden"></div>

      @if (sync.saving()) {
        <span
          class="hidden shrink-0 items-center gap-1.5 text-xs text-gray-500 sm:flex dark:text-gray-400"
          animate.enter="view-fade"
          animate.leave="toast-leave"
          role="status"
        >
          <span class="size-3 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></span>
          Guardando…
        </span>
      }
      <button
        type="button"
        [class]="iconBtn + ' max-sm:hidden'"
        [attr.aria-label]="theme.theme() === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
        [title]="theme.theme() === 'dark' ? 'Modo claro' : 'Modo oscuro'"
        (click)="theme.toggle()"
      >
        @if (theme.theme() === 'dark') {
          <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" animate.enter="view-fade">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        } @else {
          <svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" animate.enter="view-fade">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        }
      </button>

      <!-- Selector de vista con indicador deslizante -->
      <div
        class="relative grid shrink-0 grid-cols-3 rounded-lg bg-gray-100 p-0.5 text-sm font-medium dark:bg-gray-800"
        role="tablist"
        aria-label="Vista del calendario"
      >
        <span
          class="absolute inset-y-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-md bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.3,1.3,0.5,1)] dark:bg-gray-700"
          [style.transform]="'translateX(' + viewIndex() * 100 + '%)'"
          aria-hidden="true"
        ></span>
        @for (v of views; track v.id) {
          <button
            type="button"
            role="tab"
            class="relative z-10 px-2.5 py-1 sm:px-4"
            [class]="view() === v.id ? 'text-blue-700 dark:text-blue-300' : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'"
            [attr.aria-selected]="view() === v.id"
            [title]="v.label + ' (' + v.key + ')'"
            (click)="setView(v.id)"
          >
            <span class="sm:hidden">{{ v.short }}</span>
            <span class="hidden sm:inline">{{ v.label }}</span>
          </button>
        }
      </div>

      <!-- Cuenta -->
      <div class="relative shrink-0">
        <button
          type="button"
          class="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-semibold text-white hover:ring-4 hover:ring-blue-500/25"
          aria-haspopup="menu"
          [attr.aria-expanded]="menuOpen()"
          [attr.aria-label]="'Tu cuenta: ' + (auth.user()?.email ?? '')"
          [title]="auth.user()?.email ?? ''"
          (click)="menuOpen.set(!menuOpen())"
        >
          {{ initial() }}
        </button>
        @if (menuOpen()) {
          <div class="fixed inset-0 z-40" (click)="menuOpen.set(false)"></div>
          <div
            role="menu"
            class="absolute top-11 right-0 z-50 w-64 origin-top-right rounded-xl bg-white p-1.5 shadow-xl ring-1 ring-gray-200 dark:bg-gray-800 dark:ring-gray-700"
            animate.enter="toast-enter"
            animate.leave="toast-leave"
            (document:keydown.escape)="menuOpen.set(false)"
          >
            <div class="px-3 py-2">
              @if (auth.user()?.name; as name) {
                <div class="truncate font-medium">{{ name }}</div>
              }
              <div class="truncate text-sm text-gray-500 dark:text-gray-400">{{ auth.user()?.email }}</div>
            </div>
            <div class="my-1 border-t border-gray-200 dark:border-gray-700"></div>
            <!-- En escritorio estas dos opciones ya están en el lateral -->
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 md:hidden dark:hover:bg-gray-700"
              (click)="menuOpen.set(false); openProjects('projects')"
            >
              Proyectos
            </button>
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 md:hidden dark:hover:bg-gray-700"
              (click)="menuOpen.set(false); showAvailability.set(true)"
            >
              Horas no disponibles
            </button>
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
              (click)="theme.toggle()"
            >
              {{ theme.theme() === 'dark' ? 'Modo claro' : 'Modo oscuro' }}
            </button>
            <button
              type="button"
              role="menuitem"
              class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
              (click)="logout()"
            >
              Cerrar sesión
            </button>
          </div>
        }
      </div>
    </header>

    <div class="flex min-h-0 flex-1">
      <!-- Lateral -->
      <aside class="hidden w-64 shrink-0 flex-col gap-6 overflow-y-auto p-4 md:flex">
        <button
          type="button"
          class="flex w-fit items-center gap-2 rounded-2xl bg-white px-5 py-3 font-medium shadow-md ring-1 ring-gray-200 hover:shadow-lg hover:ring-blue-300 dark:bg-gray-900 dark:ring-gray-700 dark:hover:ring-blue-700"
          title="Crear evento (C)"
          (click)="createNow()"
        >
          <span class="text-2xl leading-none text-blue-600 dark:text-blue-400">+</span> Crear
        </button>

        <!-- Mini calendario -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <span class="text-sm font-medium first-letter:uppercase">{{ miniTitle() }}</span>
            <div class="flex">
              <button type="button" [class]="iconBtn + ' size-7 text-xl'" aria-label="Mes anterior" (click)="moveMini(-1)">‹</button>
              <button type="button" [class]="iconBtn + ' size-7 text-xl'" aria-label="Mes siguiente" (click)="moveMini(1)">›</button>
            </div>
          </div>
          <div class="grid grid-cols-7 text-center text-xs">
            @for (d of miniDays().slice(0, 7); track d.getTime()) {
              <span class="py-1 text-gray-500 uppercase dark:text-gray-400">{{ d | date: 'EEEEE' }}</span>
            }
            @for (d of miniDays(); track d.getTime()) {
              <button
                type="button"
                class="relative mx-auto flex size-7 items-center justify-center rounded-full"
                [class]="miniDayClass(d)"
                [title]="holidayName(d)"
                (click)="jumpTo(d)"
              >
                {{ d.getDate() }}
                @if (inVisibleRange(d) && view() !== 'month') {
                  <span class="absolute inset-0 -z-10 rounded-full bg-blue-50 dark:bg-blue-950/50" aria-hidden="true"></span>
                }
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
            <dd class="text-right font-medium text-emerald-700 tabular-nums dark:text-emerald-400">
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
            <div
              class="h-full rounded-full bg-blue-600 transition-[width] duration-500 ease-out"
              [style.width.%]="plannedPercent()"
            ></div>
          </div>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {{ plannedPercent() }} % del tiempo disponible planificado
          </p>
        </div>

        <!-- Horas por proyecto en el periodo visible -->
        <div>
          <div class="mb-2 flex items-center justify-between">
            <div class="min-w-0">
              <div class="text-sm font-medium">Proyectos</div>
              <div class="truncate text-xs text-gray-500 first-letter:uppercase dark:text-gray-400">{{ periodLabel() }}</div>
            </div>
            <button
              type="button"
              class="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-gray-100 dark:text-blue-400 dark:hover:bg-gray-800"
              title="Proyectos (P)"
              (click)="openProjects('projects')"
            >
              {{ projects.projects().length ? 'Gestionar' : 'Crear' }}
            </button>
          </div>
          @for (t of periodTotals(); track t.project?.id ?? 'none') {
            <div class="flex items-center gap-2 px-1 py-1 text-sm" animate.enter="event-enter">
              <span class="size-2.5 shrink-0 rounded-full" [style.background-color]="t.project?.color ?? '#9ca3af'"></span>
              <span class="truncate" [class.text-gray-500]="!t.project">{{ t.project?.name ?? 'Sin proyecto' }}</span>
              <span class="ml-auto shrink-0 text-right text-xs tabular-nums">
                {{ hours(t.minutes) }}
                @if (t.amount != null) {
                  <span class="block text-gray-500 dark:text-gray-400">{{ money(t.amount) }}</span>
                }
              </span>
            </div>
          } @empty {
            <p class="text-xs text-gray-500 dark:text-gray-400">
              @if (projects.projects().length) {
                No hay horas en proyectos en este periodo. Elige un proyecto al crear o editar un evento.
              } @else {
                Crea proyectos para saber cuántas horas (y cuánto dinero) dedicas a cada uno.
              }
            </p>
          }
          @if (periodBillable() > 0) {
            <div class="mt-1 flex justify-between border-t border-gray-200 px-1 pt-1 text-sm font-medium dark:border-gray-700">
              <span>Total facturable</span>
              <span class="tabular-nums">{{ money(periodBillable()) }}</span>
            </div>
          }
          @if (periodTotals().length) {
            <button
              type="button"
              class="mt-2 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              (click)="openProjects('report')"
            >
              Ver informe y exportar →
            </button>
          }
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
            <label class="mt-2 flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
              <input
                type="checkbox"
                class="size-4 accent-blue-600"
                [checked]="timeBlocks.compact()"
                (change)="timeBlocks.compact.set(!timeBlocks.compact())"
              />
              Comprimir horas no disponibles
            </label>
          } @else {
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Marca las horas en las que no puedes trabajar (sueño, estudios...).
            </p>
          }
        </div>

        <!-- Atajos de teclado -->
        <div class="mt-auto text-xs text-gray-500 dark:text-gray-400">
          <div class="mb-1 font-medium text-gray-600 dark:text-gray-300">Atajos de teclado</div>
          <div class="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
            <span><kbd class="kbd">←</kbd> <kbd class="kbd">→</kbd></span><span>anterior / siguiente</span>
            <span><kbd class="kbd">T</kbd></span><span>hoy</span>
            <span><kbd class="kbd">D</kbd> <kbd class="kbd">S</kbd> <kbd class="kbd">M</kbd></span><span>día / semana / mes</span>
            <span><kbd class="kbd">C</kbd></span><span>crear evento</span>
            <span><kbd class="kbd">P</kbd></span><span>proyectos</span>
          </div>
          <p class="mt-2">Arrastra un evento para moverlo, o su borde inferior para cambiar la duración.
            Arrastra sobre un hueco vacío para crear un evento con esa duración.</p>
        </div>
      </aside>

      <!-- Vista principal -->
      <main class="min-h-0 min-w-0 flex-1">
        @if (session.status() === 'error') {
          <div class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center" animate.enter="view-fade">
            <p class="font-medium">No se pudieron cargar tus datos</p>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ session.error() }}</p>
            <button
              type="button"
              class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              (click)="session.retry()"
            >
              Reintentar
            </button>
          </div>
        } @else if (session.status() !== 'ready') {
          <div class="flex h-full items-center justify-center gap-3 text-sm text-gray-500 dark:text-gray-400" role="status">
            <span class="size-5 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600"></span>
            Cargando tus datos…
          </div>
        } @else if (view() === 'month') {
          <app-month-view
            [cursor]="cursor()"
            [events]="displayEvents()"
            [anim]="navAnim()"
            (dayClick)="create(atHour($event, 9))"
            (dayOpen)="openDay($event)"
            (eventClick)="edit($event)"
            (moreClick)="openDay($event)"
          />
        } @else {
          <app-week-view
            [cursor]="cursor()"
            [events]="displayEvents()"
            [projectNames]="projectNames()"
            [blocks]="blocks()"
            [compact]="timeBlocks.compact()"
            [dayCount]="view() === 'day' ? 1 : 7"
            [anim]="navAnim()"
            (blockClick)="blockAction.set($event)"
            (slotClick)="create($event)"
            (rangeSelect)="create($event.start, $event.end)"
            (eventClick)="edit($event)"
            (eventChange)="moveEvent($event)"
            (dayOpen)="openDay($event)"
          />
        }
      </main>
    </div>

    <!-- Botón flotante para crear en móvil (en escritorio está en el lateral) -->
    <button
      type="button"
      class="fixed right-4 bottom-6 z-40 flex size-14 items-center justify-center rounded-2xl bg-blue-600 text-3xl text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 md:hidden"
      aria-label="Crear evento"
      (click)="createNow()"
    >
      +
    </button>

    @if (blockAction(); as ba) {
      <div
        class="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center sm:p-4 dark:bg-black/60"
        animate.enter="modal-enter"
        animate.leave="modal-leave"
        (click)="blockAction.set(null)"
        (document:keydown.escape)="blockAction.set(null)"
      >
        <div
          class="modal-panel flex w-full max-w-sm flex-col gap-4 rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-xl dark:bg-gray-900"
          role="dialog"
          aria-modal="true"
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
              class="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              (click)="skipBlockDay(ba.block, ba.day)"
            >
              Quitar solo este día
            </button>
          </div>
        </div>
      </div>
    }

    @if (showAvailability()) {
      <app-availability-dialog
        animate.enter="modal-enter"
        animate.leave="modal-leave"
        (closed)="showAvailability.set(false)"
      />
    }

    @if (projectsDialog(); as pd) {
      <app-projects-dialog
        animate.enter="modal-enter"
        animate.leave="modal-leave"
        [initialTab]="pd"
        [rangeStart]="visibleRange().from"
        [rangeEnd]="visibleRange().to"
        (closed)="projectsDialog.set(null)"
      />
    }

    @if (editing(); as ed) {
      <app-event-dialog
        animate.enter="modal-enter"
        animate.leave="modal-leave"
        [event]="ed.event"
        [isNew]="ed.isNew"
        [blocks]="blocks()"
        (saved)="save($event, ed.isNew)"
        (deleted)="remove($event)"
        (closed)="editing.set(null)"
      />
    }

  `,
  styles: `
    .kbd {
      display: inline-block;
      min-width: 1.25rem;
      padding: 0 0.25rem;
      border: 1px solid currentColor;
      border-bottom-width: 2px;
      border-radius: 0.25rem;
      font-family: inherit;
      font-size: 0.7rem;
      line-height: 1.1rem;
      text-align: center;
      opacity: 0.8;
    }
  `,
})
export class CalendarPage {
  private readonly store = inject(EventStore);
  private readonly toasts = inject(ToastService);
  protected readonly auth = inject(AuthService);
  protected readonly session = inject(Session);
  protected readonly sync = inject(SyncQueue);
  protected readonly menuOpen = signal(false);
  protected readonly initial = computed(() =>
    (this.auth.user()?.name || this.auth.user()?.email || '?').charAt(0).toUpperCase(),
  );
  protected readonly theme = inject(ThemeService);
  protected readonly timeBlocks = inject(TimeBlockStore);
  protected readonly projects = inject(ProjectStore);

  protected readonly iconBtn = ICON_BTN;
  protected readonly views = VIEWS;
  protected readonly hours = formatHours;
  protected readonly money = formatMoney;

  protected readonly events = this.store.events;
  protected readonly blocks = this.timeBlocks.blocks;
  protected readonly view = signal<CalendarView>(initialView());
  protected readonly cursor = signal(startOfDay(new Date()));
  protected readonly miniCursor = signal(startOfDay(new Date()));
  protected readonly editing = signal<Editing | null>(null);
  protected readonly showAvailability = signal(false);
  protected readonly projectsDialog = signal<ProjectsTab | null>(null);

  /** Los eventos con proyecto se pintan con el color del proyecto. */
  protected readonly displayEvents = computed(() => {
    const byId = this.projects.byId();
    return this.events().map((e) => {
      const p = e.projectId ? byId.get(e.projectId) : undefined;
      return p ? { ...e, color: p.color } : e;
    });
  });
  protected readonly projectNames = computed(
    () => new Map(this.projects.projects().map((p) => [p.id, p.name])),
  );

  /** Periodo que se ve en pantalla: el día, la semana o el mes (fin no incluido). */
  protected readonly visibleRange = computed(() => {
    const c = this.cursor();
    switch (this.view()) {
      case 'day':
        return { from: startOfDay(c), to: addDays(startOfDay(c), 1) };
      case 'week':
        return { from: startOfWeek(c), to: addDays(startOfWeek(c), 7) };
      default:
        return { from: startOfMonth(c), to: addMonths(startOfMonth(c), 1) };
    }
  });
  protected readonly periodLabel = computed(() => {
    const { from } = this.visibleRange();
    const today = new Date();
    switch (this.view()) {
      case 'day':
        return isSameDay(from, today) ? 'hoy' : shortDay.format(from);
      case 'week':
        return isSameDay(from, startOfWeek(today)) ? 'esta semana' : 'semana del ' + shortDay.format(from);
      default:
        return monthYear.format(from);
    }
  });
  protected readonly periodTotals = computed(() => {
    const { from, to } = this.visibleRange();
    // Solo proyectos: los eventos sin proyecto no aportan nada aquí
    return projectTotals(this.events(), this.projects.projects(), from, to).filter((t) => t.project);
  });
  protected readonly periodBillable = computed(() =>
    this.periodTotals().reduce((sum, t) => sum + (t.amount ?? 0), 0),
  );
  protected readonly blockAction = signal<{ block: TimeBlock; day: Date } | null>(null);
  /** Animación con la que entra la vista: depende de si vamos hacia delante o hacia atrás. */
  protected readonly navAnim = signal('view-fade');

  protected readonly viewIndex = computed(() => VIEWS.findIndex((v) => v.id === this.view()));

  constructor() {
    // Sube lo que hubiera en el navegador y carga los datos de la cuenta
    void this.session.start();

    // Recordar la última vista elegida
    effect(() => {
      try {
        localStorage.setItem(VIEW_KEY, this.view());
      } catch {
        // almacenamiento no disponible
      }
    });
  }

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

  protected readonly title = computed(() => {
    const c = this.cursor();
    switch (this.view()) {
      case 'day':
        return longDay.format(c);
      case 'month':
        return monthYear.format(c);
      default: {
        const days = weekDays(c);
        const first = days[0];
        const last = days[6];
        if (first.getMonth() === last.getMonth()) return monthYear.format(first);
        const year =
          first.getFullYear() === last.getFullYear()
            ? `${last.getFullYear()}`
            : `${first.getFullYear()} – ${last.getFullYear()}`;
        return `${shortMonth.format(first)} – ${shortMonth.format(last)} ${year}`;
      }
    }
  });

  protected readonly miniTitle = computed(() => monthYear.format(this.miniCursor()));
  protected readonly miniDays = computed(() => monthGrid(this.miniCursor()));

  // -------------------------------------------------------------------------
  // Navegación
  // -------------------------------------------------------------------------

  /** Cambia la fecha mostrada animando en la dirección del cambio. */
  private navigate(date: Date): void {
    const from = this.periodStart(this.cursor()).getTime();
    const to = this.periodStart(date).getTime();
    if (to !== from) this.navAnim.set(to > from ? 'view-next' : 'view-prev');
    this.cursor.set(date);
    this.miniCursor.set(date);
  }

  private periodStart(d: Date): Date {
    switch (this.view()) {
      case 'day':
        return startOfDay(d);
      case 'week':
        return startOfWeek(d);
      default:
        return startOfMonth(d);
    }
  }

  protected goToday(): void {
    this.navigate(startOfDay(new Date()));
  }

  protected move(dir: 1 | -1): void {
    const c = this.cursor();
    const view = this.view();
    this.navigate(view === 'day' ? addDays(c, dir) : view === 'week' ? addDays(c, 7 * dir) : addMonths(c, dir));
  }

  protected setView(view: CalendarView): void {
    if (view === this.view()) return;
    this.navAnim.set('view-fade');
    this.view.set(view);
  }

  protected jumpTo(d: Date): void {
    this.navigate(d);
  }

  protected openDay(day: Date): void {
    this.navAnim.set('view-fade');
    this.cursor.set(startOfDay(day));
    this.miniCursor.set(startOfDay(day));
    this.view.set('day');
  }

  protected moveMini(dir: 1 | -1): void {
    this.miniCursor.update((d) => addMonths(d, dir));
  }

  /** ¿Está el día dentro de lo que se ve ahora (ese día o esa semana)? */
  protected inVisibleRange(d: Date): boolean {
    return this.view() === 'day'
      ? isSameDay(d, this.cursor())
      : isSameDay(startOfWeek(d), startOfWeek(this.cursor()));
  }

  protected holidayName(d: Date): string {
    return holidayOn(d)?.name ?? '';
  }

  protected miniDayClass(d: Date): string {
    const hover = ' hover:bg-gray-100 dark:hover:bg-gray-800';
    if (isSameDay(d, new Date())) return 'bg-blue-600 text-white';
    if (isSameDay(d, this.cursor())) return 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200';
    if (d.getMonth() !== this.miniCursor().getMonth()) return 'text-gray-400 dark:text-gray-500' + hover;
    if (holidayOn(d)) return 'font-semibold text-rose-600 dark:text-rose-400' + hover;
    return 'text-gray-700 dark:text-gray-300' + hover;
  }

  // -------------------------------------------------------------------------
  // Atajos de teclado
  // -------------------------------------------------------------------------

  protected onKeydown(ev: KeyboardEvent): void {
    if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.defaultPrevented) return;
    const target = ev.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (this.editing() || this.showAvailability() || this.blockAction() || this.projectsDialog()) return;
    if (this.menuOpen() || this.session.status() !== 'ready') return;

    const actions: Record<string, () => void> = {
      ArrowLeft: () => this.move(-1),
      ArrowRight: () => this.move(1),
      t: () => this.goToday(),
      d: () => this.setView('day'),
      s: () => this.setView('week'),
      w: () => this.setView('week'),
      m: () => this.setView('month'),
      c: () => this.createNow(),
      p: () => this.openProjects('projects'),
    };
    const action = actions[ev.key] ?? actions[ev.key.toLowerCase()];
    if (action) {
      ev.preventDefault();
      action();
    }
  }

  // -------------------------------------------------------------------------
  // Eventos y franjas
  // -------------------------------------------------------------------------

  protected atHour(day: Date, hour: number): Date {
    const d = new Date(day);
    d.setHours(hour, 0, 0, 0);
    return d;
  }

  /** Crea un evento en la próxima hora en punto del día seleccionado. */
  protected createNow(): void {
    const now = new Date();
    this.create(this.atHour(this.cursor(), Math.min(now.getHours() + 1, 23)));
  }

  protected create(start: Date, end = new Date(start.getTime() + 60 * 60 * 1000)): void {
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

  /** Antes de salir se envían los cambios que queden pendientes. */
  protected async logout(): Promise<void> {
    this.menuOpen.set(false);
    await this.sync.flushAll();
    this.auth.logout();
  }

  protected openProjects(tab: ProjectsTab): void {
    this.projectsDialog.set(tab);
  }

  /** El evento tal como está guardado (los que se pintan llevan el color del proyecto). */
  private original(event: CalendarEvent): CalendarEvent {
    return this.events().find((e) => e.id === event.id) ?? event;
  }

  protected edit(event: CalendarEvent): void {
    this.editing.set({ event: this.original(event), isNew: false });
  }

  protected save(event: CalendarEvent, isNew: boolean): void {
    const previous = this.events().find((e) => e.id === event.id);
    this.store.save(event);
    this.editing.set(null);
    if (isNew) {
      this.toasts.show(`«${event.title || 'Sin título'}» creado`);
    } else if (previous) {
      this.toasts.undoable('Cambios guardados', () => this.store.save(previous));
    }
  }

  protected remove(id: string): void {
    const event = this.events().find((e) => e.id === id);
    this.store.remove(id);
    this.editing.set(null);
    if (event) {
      this.toasts.undoable(`«${event.title || 'Sin título'}» eliminado`, () => this.store.save(event));
    }
  }

  /** Evento movido o redimensionado arrastrando. */
  protected moveEvent({ event: shown, start, end }: EventChange): void {
    const event = this.original(shown);
    this.store.save({ ...event, start: start.toISOString(), end: end.toISOString() });
    this.toasts.undoable(
      `«${event.title || 'Sin título'}»: ${shortDay.format(start)}, ${hourMin.format(start)}–${hourMin.format(end)}`,
      () => this.store.save(event),
    );
  }

  protected skipBlockDay(block: TimeBlock, day: Date): void {
    const date = toDateInput(day);
    this.timeBlocks.skipDay(block.id, date);
    this.blockAction.set(null);
    this.toasts.undoable(`«${block.label || 'Franja'}» quitada el ${shortDay.format(day)}`, () =>
      this.timeBlocks.restoreDay(block.id, date),
    );
  }
}

function initialView(): CalendarView {
  try {
    const saved = localStorage.getItem(VIEW_KEY);
    if (saved === 'day' || saved === 'week' || saved === 'month') return saved;
  } catch {
    // almacenamiento no disponible
  }
  // En pantallas pequeñas, siete columnas no se leen bien
  return window.matchMedia('(max-width: 640px)').matches ? 'day' : 'week';
}
