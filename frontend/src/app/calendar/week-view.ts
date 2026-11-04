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
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { CalendarEvent, TimeBlock } from './models';
import { DAY_MS, blockSegments, isSameDay, occurrenceDay, startOfDay, weekDays } from './date-utils';
import { TimeScale, collapsibleRanges, dayAvailability, formatHours } from './availability';
import { holidayOn, holidayTitle } from './holidays';

const HOUR_PX = 48;
const COLLAPSED_PX = 18;
const MIN_EVENT_PX = 20;

interface PositionedEvent {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
}

@Component({
  selector: 'app-week-view',
  imports: [DatePipe],
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `
    <!-- Cabecera con los días -->
    <div class="flex overflow-hidden border-b border-gray-200 dark:border-gray-700" style="scrollbar-gutter: stable">
      <div class="w-16 shrink-0"></div>
      @for (col of columns(); track col.day.getTime()) {
        <div class="min-w-0 flex-1 py-2 text-center">
          <div
            class="text-xs font-medium uppercase"
            [class]="isToday(col.day) ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'"
          >
            {{ col.day | date: 'EEE' }}
          </div>
          <div
            class="mx-auto mt-1 flex size-10 items-center justify-center rounded-full text-2xl"
            [class]="isToday(col.day) ? 'bg-blue-600 text-white' : 'text-gray-800 dark:text-gray-200'"
          >
            {{ col.day.getDate() }}
          </div>
          @if (col.holiday; as h) {
            <div
              class="mx-1 mt-1 truncate rounded bg-rose-100 px-1 text-[11px] font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-300"
              [title]="holidayTitle(h)"
            >
              {{ h.name }}
            </div>
          }
          @if (showFree()) {
            <div
              class="mt-1 truncate text-[11px]"
              [class]="col.free > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400 dark:text-gray-500'"
              [title]="col.freeLabel + ' libres para trabajar'"
            >
              {{ col.freeLabel }}<span class="hidden lg:inline"> libres</span>
            </div>
          }
        </div>
      }
    </div>

    <!-- Rejilla de horas -->
    <div #scroller class="min-h-0 flex-1 overflow-y-auto" style="scrollbar-gutter: stable">
      <div class="relative flex" [style.height.px]="scale().height">
        <!-- Columna de horas -->
        <div class="relative w-16 shrink-0">
          @for (h of visibleHours(); track h) {
            @if (h > 0) {
              <span
                class="absolute right-2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400"
                [style.top.px]="scale().y(h * 60)"
                >{{ pad(h) }}:00</span
              >
            }
          }
          @for (r of scale().collapsedRows; track r.start) {
            <span
              class="absolute inset-x-0 flex items-center justify-end pr-2 text-[10px] text-gray-400 dark:text-gray-500"
              [style.top.px]="r.top"
              [style.height.px]="r.height"
              [title]="'Horas ocultas: ' + time(r.start) + '–' + time(r.end)"
            >
              {{ time(r.start) }}–{{ time(r.end) }}
            </span>
          }
        </div>

        @for (col of columns(); track col.day.getTime()) {
          <div
            class="relative flex-1 cursor-pointer border-l border-gray-200 dark:border-gray-700"
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
                @if (a.height >= 18) {
                  <button
                    type="button"
                    class="pointer-events-auto flex max-w-full cursor-pointer items-center gap-0.5 rounded px-1 ring-1 ring-current/40 hover:ring-current"
                    [style.background-color]="a.color + '24'"
                    [title]="'Opciones de «' + a.label + '» este día (p. ej. quitarla solo hoy)'"
                    (click)="$event.stopPropagation(); blockClick.emit({ block: a.block, day: a.day })"
                  >
                    <span class="truncate">{{ a.label }}</span>
                    <span aria-hidden="true" class="shrink-0">▾</span>
                  </button>
                }
              </div>
            }

            @for (it of col.items; track it.event.id) {
              <button
                type="button"
                class="absolute overflow-hidden rounded-md px-1.5 py-0.5 text-left text-xs leading-tight text-white shadow-sm ring-1 ring-white hover:brightness-110 dark:ring-gray-900"
                [style.top.px]="it.top"
                [style.height.px]="it.height"
                [style.left]="'calc(' + it.left + '% + 2px)'"
                [style.width]="'calc(' + it.width + '% - 4px)'"
                [style.background-color]="it.event.color"
                (click)="$event.stopPropagation(); eventClick.emit(it.event)"
              >
                <div class="truncate font-medium">{{ it.event.title || '(Sin título)' }}</div>
                <div class="truncate opacity-90">
                  {{ it.event.start | date: 'HH:mm' }} – {{ it.event.end | date: 'HH:mm' }}
                </div>
              </button>
            }

            @if (isToday(col.day)) {
              <div class="pointer-events-none absolute inset-x-0 z-10" [style.top.px]="nowTop()">
                <div class="absolute -top-1.5 -left-1.5 size-3 rounded-full bg-red-500"></div>
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
  readonly slotClick = output<Date>();
  readonly eventClick = output<CalendarEvent>();
  /** Clic en el nombre de una franja no disponible; `day` es el día en que empieza. */
  readonly blockClick = output<{ block: TimeBlock; day: Date }>();

  protected readonly now = signal(new Date());
  protected readonly days = computed(() => weekDays(this.cursor()));

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
    return Array.from({ length: 24 }, (_, h) => h).filter((h) => !scale.isHidden(h * 60));
  });

  /** Solo tiene sentido mostrar las horas libres si hay franjas no disponibles. */
  protected readonly showFree = computed(() => this.blocks().some((b) => b.enabled));

  protected readonly columns = computed(() => {
    const scale = this.scale();
    return this.days().map((day) => {
      const { free } = dayAvailability(this.events(), this.blocks(), day);
      return {
        day,
        free,
        freeLabel: formatHours(free),
        holiday: holidayOn(day),
        items: layoutDay(this.events(), day, scale),
        blocks: blockAreas(this.blocks(), day, scale),
      };
    });
  });

  protected readonly nowTop = computed(() => {
    const n = this.now();
    return this.scale().y(n.getHours() * 60 + n.getMinutes());
  });

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  constructor() {
    const timer = setInterval(() => this.now.set(new Date()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));

    // Al abrir, desplazamos la vista a las 7:00
    afterNextRender(() => {
      this.scroller().nativeElement.scrollTop = this.scale().y(7 * 60);
    });
  }

  protected readonly holidayTitle = holidayTitle;

  protected isToday(d: Date): boolean {
    return isSameDay(d, this.now());
  }

  protected pad(n: number): string {
    return n.toString().padStart(2, '0');
  }

  protected time(minutes: number): string {
    return `${this.pad(Math.floor(minutes / 60) % 24)}:${this.pad(minutes % 60)}`;
  }

  protected onColumnClick(ev: MouseEvent, day: Date): void {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const minute = this.scale().minuteAt(ev.clientY - rect.top);
    if (minute === null) return;
    const start = new Date(day);
    start.setMinutes(Math.floor(minute / 30) * 30); // tramos de 30 min
    this.slotClick.emit(start);
  }
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
 * Calcula la posición de los eventos de un día. Los eventos que se solapan
 * se reparten en columnas ("carriles") para que no se tapen entre sí.
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
    for (const c of cluster) {
      const top = scale.y(toMinute(c.s));
      result.push({
        event: c.event,
        top,
        height: Math.max(scale.y(toMinute(c.e)) - top, MIN_EVENT_PX),
        left: (c.lane / lanes) * 100,
        width: 100 / lanes,
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
