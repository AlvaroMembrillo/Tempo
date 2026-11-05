import {
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { CalendarEvent, TimeBlock } from './models';
import {
  DAY_MS,
  blockSegments,
  isSameDay,
  occurrenceDay,
  startOfDay,
  weekDays,
} from './date-utils';
import {
  DAY_MINUTES,
  TimeScale,
  collapsibleRanges,
  dayAvailability,
  formatHours,
} from './availability';
import { holidayOn, holidayTitle } from './holidays';

const HOUR_PX = 48;
const COLLAPSED_PX = 18;
const MIN_EVENT_PX = 22;
/** Altura por debajo de la cual el evento se muestra en una sola línea. */
const COMPACT_EVENT_PX = 40;
/** Píxeles que hay que mover el ratón para que cuente como arrastre y no como clic. */
const DRAG_THRESHOLD_PX = 5;
const SNAP_MIN = 15;

interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
  z: number;
}

export interface EventChange {
  event: CalendarEvent;
  start: Date;
  end: Date;
}

interface DragState {
  mode: 'move' | 'resize' | 'create';
  pointerId: number;
  x0: number;
  y0: number;
  dayIndex: number;
  /** Minutos dentro del día (originales). */
  start: number;
  end: number;
  event?: CalendarEvent;
  /** En «move»: distancia (min) entre el inicio del evento y el punto donde se agarró. */
  grabOffset: number;
  active: boolean;
}

interface Preview {
  mode: DragState['mode'];
  eventId?: string;
  dayIndex: number;
  start: number;
  end: number;
}

@Component({
  selector: 'app-week-view',
  imports: [DatePipe],
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `
    <!-- Cabecera con los días -->
    <div
      class="flex overflow-hidden border-b border-gray-200 dark:border-gray-700"
      style="scrollbar-gutter: stable"
    >
      <div class="w-14 shrink-0 sm:w-16"></div>
      @for (col of columns(); track col.day.getTime()) {
        <div class="min-w-0 flex-1 py-2 text-center" [animate.enter]="anim()">
          <button
            type="button"
            class="group mx-auto flex flex-col items-center rounded-xl px-1"
            [title]="dayCount() === 1 ? '' : 'Ver solo este día'"
            (click)="dayOpen.emit(col.day)"
          >
            <span
              class="text-xs font-medium uppercase"
              [class]="isToday(col.day) ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'"
            >
              {{ col.day | date: (dayCount() === 1 ? 'EEEE' : 'EEE') }}
            </span>
            <span
              class="mt-1 flex size-10 items-center justify-center rounded-full text-2xl transition-colors"
              [class]="
                isToday(col.day)
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-800 group-hover:bg-gray-100 dark:text-gray-200 dark:group-hover:bg-gray-800'
              "
            >
              {{ col.day.getDate() }}
            </span>
          </button>
          <!-- Fila reservada para festivos: así todas las columnas quedan alineadas -->
          @if (weekHasHoliday()) {
            <div class="mt-1 h-5 px-1">
              @if (col.holiday; as h) {
                <div
                  class="truncate rounded bg-rose-100 px-1 text-[11px] leading-5 font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300"
                  [title]="holidayTitle(h)"
                >
                  {{ h.name }}
                </div>
              }
            </div>
          }
          @if (showFree()) {
            <div
              class="mt-1 truncate text-[11px]"
              [class]="col.free > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'"
              [title]="col.freeLabel + ' libres para trabajar'"
            >
              {{ col.freeLabel }}<span [class.hidden]="dayCount() > 1" class="lg:inline"> libres</span>
            </div>
          }
        </div>
      }
    </div>

    <!-- Rejilla de horas -->
    <div #scroller class="min-h-0 flex-1 overflow-y-auto" style="scrollbar-gutter: stable">
      <div #grid class="relative flex" [style.height.px]="scale().height">
        <!-- Columna de horas -->
        <div class="relative w-14 shrink-0 sm:w-16">
          @for (h of visibleHours(); track h) {
            @if (h > 0) {
              <span
                class="absolute right-2 -translate-y-1/2 text-xs text-gray-500 tabular-nums dark:text-gray-400"
                [style.top.px]="scale().y(h * 60)"
                >{{ pad(h) }}:00</span
              >
            }
          }
          @for (r of scale().collapsedRows; track r.start) {
            <span
              class="absolute inset-x-0 flex items-center justify-end pr-2 text-[10px] whitespace-nowrap text-gray-400 tabular-nums dark:text-gray-500"
              [style.top.px]="r.top"
              [style.height.px]="r.height"
              [title]="'Horas comprimidas: ' + time(r.start) + '–' + time(r.end)"
            >
              {{ shortRange(r.start, r.end) }}
            </span>
          }
        </div>

        @for (col of columns(); track col.day.getTime(); let ci = $index) {
          <div
            #col
            class="relative flex-1 border-l border-gray-200 dark:border-gray-700"
            [class]="col.holiday ? 'bg-rose-50/50 dark:bg-rose-950/20' : ''"
            [animate.enter]="anim()"
            (pointerdown)="onGridPointerDown($event, ci)"
            (click)="onColumnClick($event, col.day)"
          >
            <!-- Líneas de las horas -->
            @for (h of visibleHours(); track h) {
              @if (h > 0) {
                <div
                  class="pointer-events-none absolute inset-x-0 border-t border-gray-100 dark:border-gray-800"
                  [style.top.px]="scale().y(h * 60)"
                ></div>
              }
            }

            <!-- Tramos comprimidos -->
            @for (r of scale().collapsedRows; track r.start) {
              <div
                class="absolute inset-x-0 cursor-default border-y border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800"
                [style.top.px]="r.top"
                [style.height.px]="r.height"
                (pointerdown)="$event.stopPropagation()"
                (click)="$event.stopPropagation()"
              ></div>
            }

            <!-- Horas no disponibles -->
            @for (a of col.blocks; track a.key) {
              <div
                class="pointer-events-none absolute inset-x-0 overflow-hidden border-y px-1 pt-0.5 text-[11px] leading-tight font-medium"
                [style.top.px]="a.top"
                [style.height.px]="a.height"
                [style.color]="a.color"
                [style.border-color]="a.color + '66'"
                [style.background-image]="
                  'repeating-linear-gradient(135deg, ' + a.color + '2e 0 6px, ' + a.color + '12 6px 12px)'
                "
              >
                @if (a.height > 22) {
                  <button
                    type="button"
                    class="pointer-events-auto flex max-w-full cursor-pointer items-center gap-0.5 rounded px-1 ring-1 ring-current/40 hover:ring-current"
                    [style.background-color]="a.color + '24'"
                    [title]="'Opciones de «' + a.label + '» este día (p. ej. quitarla solo hoy)'"
                    (pointerdown)="$event.stopPropagation()"
                    (click)="$event.stopPropagation(); blockClick.emit({ block: a.block, day: a.day })"
                  >
                    <span class="truncate">{{ a.label }}</span>
                    <span aria-hidden="true" class="shrink-0">▾</span>
                  </button>
                }
              </div>
            }

            <!-- Hueco que se está creando arrastrando -->
            @if (preview(); as p) {
              @if (p.mode === 'create' && p.dayIndex === ci) {
                <div
                  class="pointer-events-none absolute inset-x-1 z-30 rounded-md border-2 border-dashed border-blue-500 bg-blue-500/15 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300"
                  [style.top.px]="scale().y(p.start)"
                  [style.height.px]="scale().y(p.end) - scale().y(p.start)"
                >
                  {{ time(p.start) }} – {{ time(p.end) }}
                </div>
              }
            }

            @for (it of col.items; track it.event.id) {
              <button
                type="button"
                class="group absolute cursor-grab overflow-hidden rounded-md px-1.5 text-left text-xs leading-tight text-white shadow-sm ring-1 ring-white transition-shadow hover:shadow-md hover:brightness-110 dark:ring-gray-900"
                [class]="isDragging(it.event) ? 'z-40 cursor-grabbing opacity-90 shadow-xl ring-2' : ''"
                [class.py-0.5]="it.height >= compactEventPx"
                [style.top.px]="it.top"
                [style.height.px]="it.height"
                [style.left]="'calc(' + it.left + '% + 2px)'"
                [style.width]="'calc(' + it.width + '% - 4px)'"
                [style.z-index]="isDragging(it.event) ? 40 : it.z"
                [style.background-color]="it.event.color"
                [attr.aria-label]="
                  (it.event.title || 'Sin título') +
                  ', de ' +
                  (it.event.start | date: 'HH:mm') +
                  ' a ' +
                  (it.event.end | date: 'HH:mm') +
                  (projectName(it.event) ? ', proyecto ' + projectName(it.event) : '')
                "
                animate.enter="event-enter"
                (pointerdown)="onEventPointerDown($event, it.event, ci, 'move')"
                (click)="onEventClick($event, it.event)"
              >
                @if (it.height < compactEventPx) {
                  <div class="truncate leading-5">
                    <span class="font-medium">{{ it.event.title || '(Sin título)' }}</span>,
                    {{ it.event.start | date: 'HH:mm' }}
                  </div>
                } @else {
                  <div class="truncate font-medium">{{ it.event.title || '(Sin título)' }}</div>
                  <div class="truncate opacity-90">
                    {{ it.event.start | date: 'HH:mm' }} – {{ it.event.end | date: 'HH:mm' }}
                  </div>
                  @if (it.height >= 56 && projectName(it.event); as pn) {
                    <div class="mt-0.5 truncate text-[11px] opacity-80">{{ pn }}</div>
                  }
                }
                <!-- Asa para cambiar la duración -->
                <span
                  class="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize opacity-0 group-hover:opacity-100"
                  aria-hidden="true"
                  (pointerdown)="onEventPointerDown($event, it.event, ci, 'resize')"
                >
                  <span class="mx-auto mt-0.5 block h-0.5 w-6 rounded-full bg-white/80"></span>
                </span>
              </button>
            }

            @if (isToday(col.day)) {
              <div class="pointer-events-none absolute inset-x-0 z-30" [style.top.px]="nowTop()">
                <div class="absolute -top-1.5 -left-1.5 size-3 animate-pulse rounded-full bg-red-500"></div>
                <div class="h-0.5 bg-red-500"></div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class WeekView {
  readonly cursor = input.required<Date>();
  readonly events = input.required<CalendarEvent[]>();
  readonly blocks = input<TimeBlock[]>([]);
  /** Comprimir las horas que no están disponibles ningún día de la semana. */
  readonly compact = input(false);
  /** 1 = vista día, 7 = vista semana. */
  readonly dayCount = input<1 | 7>(7);
  /** Nombre de cada proyecto por id, para mostrarlo en las tarjetas. */
  readonly projectNames = input<ReadonlyMap<string, string>>(new Map());
  /** Clase de animación de entrada para las columnas (cambio de semana/día). */
  readonly anim = input('view-fade');

  /** Clic simple en un hueco: crear evento de 1 h. */
  readonly slotClick = output<Date>();
  /** Hueco seleccionado arrastrando: crear evento con esa duración. */
  readonly rangeSelect = output<{ start: Date; end: Date }>();
  readonly eventClick = output<CalendarEvent>();
  /** Evento movido o con nueva duración. */
  readonly eventChange = output<EventChange>();
  /** Clic en el nombre de una franja no disponible; `day` es el día en que empieza. */
  readonly blockClick = output<{ block: TimeBlock; day: Date }>();
  readonly dayOpen = output<Date>();

  protected readonly compactEventPx = COMPACT_EVENT_PX;
  protected readonly holidayTitle = holidayTitle;
  protected readonly now = signal(new Date());
  protected readonly preview = signal<Preview | null>(null);

  protected readonly days = computed(() =>
    this.dayCount() === 1 ? [startOfDay(this.cursor())] : weekDays(this.cursor()),
  );

  protected readonly scale = computed(
    () =>
      new TimeScale(
        this.compact() ? collapsibleRanges(this.events(), this.blocks(), this.days()) : [],
        HOUR_PX,
        COLLAPSED_PX,
      ),
  );

  protected readonly visibleHours = computed(() => {
    const scale = this.scale();
    return Array.from({ length: 24 }, (_, h) => h).filter(
      (h) => !scale.isHidden(h * 60) && !scale.isCollapsedEdge(h * 60),
    );
  });

  /** Solo tiene sentido mostrar las horas libres si hay franjas no disponibles. */
  protected readonly showFree = computed(() => this.blocks().some((b) => b.enabled));

  /** Eventos con el arrastre en curso aplicado, para verlo moverse en directo. */
  private readonly liveEvents = computed(() => {
    const p = this.preview();
    if (!p || !p.eventId) return this.events();
    const day = this.days()[p.dayIndex];
    return this.events().map((e) =>
      e.id === p.eventId
        ? { ...e, start: atMinute(day, p.start).toISOString(), end: atMinute(day, p.end).toISOString() }
        : e,
    );
  });

  protected readonly columns = computed(() => {
    const scale = this.scale();
    const events = this.liveEvents();
    return this.days().map((day) => {
      const { free } = dayAvailability(this.events(), this.blocks(), day);
      return {
        day,
        free,
        freeLabel: formatHours(free),
        holiday: holidayOn(day),
        items: layoutDay(events, day, scale),
        blocks: blockAreas(this.blocks(), day, scale),
      };
    });
  });

  protected readonly weekHasHoliday = computed(() => this.columns().some((c) => c.holiday));

  protected readonly nowTop = computed(() => {
    const n = this.now();
    return this.scale().y(n.getHours() * 60 + n.getMinutes());
  });

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');
  private readonly grid = viewChild.required<ElementRef<HTMLElement>>('grid');
  private readonly cols = viewChildren<ElementRef<HTMLElement>>('col');

  private drag: DragState | null = null;
  private suppressClick = false;

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => {
      clearInterval(timer);
      this.stopListening();
    });

    // Al abrir: si se ve el día de hoy, centramos la hora actual; si no, las 7:00
    afterNextRender(() => {
      const now = this.now();
      const showsToday = this.days().some((d) => isSameDay(d, now));
      const minute = showsToday ? now.getHours() * 60 + now.getMinutes() - 90 : 7 * 60 - 30;
      this.scroller().nativeElement.scrollTop = Math.max(this.scale().y(Math.max(minute, 0)), 0);
    });
  }

  protected projectName(e: CalendarEvent): string {
    return e.projectId ? (this.projectNames().get(e.projectId) ?? '') : '';
  }

  protected isToday(d: Date): boolean {
    return isSameDay(d, this.now());
  }

  protected isDragging(e: CalendarEvent): boolean {
    return this.preview()?.eventId === e.id;
  }

  protected pad(n: number): string {
    return n.toString().padStart(2, '0');
  }

  /** «0–7 h», o «6:30–7 h» si hay minutos: cabe en la columna de horas. */
  protected shortRange(start: number, end: number): string {
    const fmt = (m: number) => {
      const h = Math.floor(m / 60) % 24;
      return m % 60 ? `${h}:${this.pad(m % 60)}` : `${h}`;
    };
    return `${fmt(start)}–${fmt(end)} h`;
  }

  protected time(minutes: number): string {
    const m = Math.round(minutes);
    return `${this.pad(Math.floor(m / 60) % 24)}:${this.pad(m % 60)}`;
  }

  // -------------------------------------------------------------------------
  // Clics
  // -------------------------------------------------------------------------

  protected onColumnClick(ev: MouseEvent, day: Date): void {
    if (this.suppressClick) return;
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const minute = this.scale().minuteAt(ev.clientY - rect.top);
    if (minute === null) return;
    this.slotClick.emit(atMinute(day, Math.floor(minute / 30) * 30)); // tramos de 30 min
  }

  protected onEventClick(ev: MouseEvent, event: CalendarEvent): void {
    ev.stopPropagation();
    if (this.suppressClick) return;
    this.eventClick.emit(event);
  }

  // -------------------------------------------------------------------------
  // Arrastrar: mover, cambiar duración y crear seleccionando un hueco
  // (solo con ratón o lápiz; en pantallas táctiles el dedo sirve para desplazarse)
  // -------------------------------------------------------------------------

  protected onEventPointerDown(
    ev: PointerEvent,
    event: CalendarEvent,
    dayIndex: number,
    mode: 'move' | 'resize',
  ): void {
    ev.stopPropagation();
    if (ev.button !== 0 || ev.pointerType === 'touch') return;
    const day = this.days()[dayIndex];
    const dayStart = startOfDay(day).getTime();
    const start = Math.max((new Date(event.start).getTime() - dayStart) / 60_000, 0);
    const end = Math.min((new Date(event.end).getTime() - dayStart) / 60_000, DAY_MINUTES);
    this.beginDrag(ev, {
      mode,
      dayIndex,
      start,
      end,
      event,
      grabOffset: this.pointerMinute(ev.clientY) - start,
    });
  }

  protected onGridPointerDown(ev: PointerEvent, dayIndex: number): void {
    if (ev.button !== 0 || ev.pointerType === 'touch') return;
    if ((ev.target as HTMLElement).closest('button')) return;
    const minute = snap(this.pointerMinute(ev.clientY));
    this.beginDrag(ev, { mode: 'create', dayIndex, start: minute, end: minute, grabOffset: 0 });
  }

  private beginDrag(
    ev: PointerEvent,
    s: Omit<DragState, 'pointerId' | 'x0' | 'y0' | 'active'>,
  ): void {
    this.drag = { ...s, pointerId: ev.pointerId, x0: ev.clientX, y0: ev.clientY, active: false };
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
  }

  private readonly onPointerMove = (ev: PointerEvent) => {
    const d = this.drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    if (!d.active) {
      if (Math.hypot(ev.clientX - d.x0, ev.clientY - d.y0) < DRAG_THRESHOLD_PX) return;
      d.active = true;
      document.body.classList.add('dragging');
    }
    ev.preventDefault();
    const minute = this.pointerMinute(ev.clientY);

    if (d.mode === 'move') {
      const duration = d.end - d.start;
      const start = clamp(snap(minute - d.grabOffset), 0, DAY_MINUTES - duration);
      this.preview.set({
        mode: 'move',
        eventId: d.event!.id,
        dayIndex: this.pointerColumn(ev.clientX),
        start,
        end: start + duration,
      });
    } else if (d.mode === 'resize') {
      const end = clamp(snap(minute), d.start + SNAP_MIN, DAY_MINUTES);
      this.preview.set({ mode: 'resize', eventId: d.event!.id, dayIndex: d.dayIndex, start: d.start, end });
    } else {
      const other = snap(minute);
      let start = Math.min(d.start, other);
      let end = Math.max(d.start, other);
      if (end - start < SNAP_MIN) end = Math.min(start + SNAP_MIN, DAY_MINUTES);
      if (end - start < SNAP_MIN) start = end - SNAP_MIN;
      this.preview.set({ mode: 'create', dayIndex: d.dayIndex, start, end });
    }
  };

  private readonly onPointerUp = (ev: PointerEvent) => {
    const d = this.drag;
    if (!d || ev.pointerId !== d.pointerId) return;
    const p = this.preview();
    if (d.active && p) {
      const day = this.days()[p.dayIndex];
      const start = atMinute(day, p.start);
      const end = atMinute(day, p.end);
      if (d.mode === 'create') {
        this.rangeSelect.emit({ start, end });
      } else if (
        d.event &&
        (start.getTime() !== new Date(d.event.start).getTime() ||
          end.getTime() !== new Date(d.event.end).getTime())
      ) {
        this.eventChange.emit({ event: d.event, start, end });
      }
      // El navegador lanza un «click» al soltar: lo ignoramos
      this.suppressClick = true;
      setTimeout(() => (this.suppressClick = false));
    }
    this.endDrag();
  };

  private readonly onPointerCancel = () => this.endDrag();

  private endDrag(): void {
    this.drag = null;
    this.preview.set(null);
    document.body.classList.remove('dragging');
    this.stopListening();
  }

  private stopListening(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
  }

  /** Minuto del día bajo el puntero. */
  private pointerMinute(clientY: number): number {
    const rect = this.grid().nativeElement.getBoundingClientRect();
    return this.scale().minuteAtLoose(clientY - rect.top);
  }

  /** Columna (día) bajo el puntero; si está fuera, la más cercana. */
  private pointerColumn(clientX: number): number {
    const cols = this.cols();
    for (let i = 0; i < cols.length; i++) {
      const r = cols[i].nativeElement.getBoundingClientRect();
      if (clientX < r.right) return i;
    }
    return cols.length - 1;
  }
}

function snap(minute: number): number {
  return Math.round(minute / SNAP_MIN) * SNAP_MIN;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function atMinute(day: Date, minute: number): Date {
  const d = startOfDay(day);
  d.setMinutes(minute);
  return d;
}

/** Zonas sombreadas de las franjas no disponibles en un día. */
function blockAreas(blocks: TimeBlock[], day: Date, scale: TimeScale) {
  return blocks.flatMap((b) =>
    blockSegments(b, day).map(([s, e]) => {
      const top = scale.y(s);
      return {
        key: `${b.id}-${s}`,
        block: b,
        day: occurrenceDay(b, day, s),
        label: b.label,
        color: b.color,
        top,
        height: scale.y(e) - top,
      };
    }),
  );
}

/**
 * Calcula la posición de los eventos de un día. Los eventos que se solapan se
 * reparten en carriles; cada uno se ensancha un poco por encima del siguiente
 * (como en las agendas habituales) para que el texto no quede tan apretado.
 */
function layoutDay(events: CalendarEvent[], day: Date, scale: TimeScale): PositionedEvent[] {
  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + DAY_MS;
  const toMinute = (ms: number) => (ms - dayStart) / 60_000;

  const segments = events
    .map((event) => ({
      event,
      s: Math.max(new Date(event.start).getTime(), dayStart),
      e: Math.min(new Date(event.end).getTime(), dayEnd),
    }))
    .filter((x) => x.e > x.s)
    .sort((a, b) => a.s - b.s || b.e - a.e);

  const result: PositionedEvent[] = [];
  let cluster: ((typeof segments)[number] & { lane: number })[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    const lanes = laneEnds.length;
    const laneWidth = 100 / lanes;
    for (const c of cluster) {
      const top = scale.y(toMinute(c.s));
      const left = c.lane * laneWidth;
      const isLast = c.lane === lanes - 1;
      result.push({
        event: c.event,
        top,
        height: Math.max(scale.y(toMinute(c.e)) - top, MIN_EVENT_PX),
        left,
        width: isLast ? laneWidth : Math.min(laneWidth * 1.7, 100 - left),
        z: 10 + c.lane,
      });
    }
    cluster = [];
    laneEnds = [];
  };

  for (const seg of segments) {
    if (seg.s >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= seg.s);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(seg.e);
    } else {
      laneEnds[lane] = seg.e;
    }
    cluster.push({ ...seg, lane });
    clusterEnd = Math.max(clusterEnd, seg.e);
  }
  flush();

  return result;
}
