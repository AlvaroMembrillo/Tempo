import { Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { CalendarEvent } from './models';
import { eventsOnDay, isSameDay, monthGrid } from './date-utils';
import { holidayOn, holidayTitle } from './holidays';

const MAX_VISIBLE = 3;

@Component({
  selector: 'app-month-view',
  imports: [DatePipe],
  host: { class: 'flex h-full min-h-0 flex-col' },
  template: `
    <div class="grid grid-cols-7 border-b border-gray-200 dark:border-gray-700">
      @for (c of cells().slice(0, 7); track c.day.getTime()) {
        <div class="py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
          {{ c.day | date: 'EEE' }}
        </div>
      }
    </div>

    <div class="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
      @for (c of cells(); track c.day.getTime()) {
        <div
          class="flex min-h-0 cursor-pointer flex-col gap-0.5 overflow-hidden border-r border-b border-gray-200 p-1 transition-colors hover:bg-blue-50/50 dark:border-gray-700 dark:hover:bg-blue-950/20"
          [animate.enter]="anim()"
          title="Clic para crear un evento este día"
          [class]="
            c.holiday
              ? 'bg-rose-50 dark:bg-rose-950/40'
              : c.inMonth
                ? ''
                : 'bg-gray-50 dark:bg-gray-950'
          "
          [class.opacity-60]="!c.inMonth"
          (click)="dayClick.emit(c.day)"
        >
          <div class="flex justify-center">
            <button
              type="button"
              class="flex size-6 items-center justify-center rounded-full text-xs"
              [class]="
                c.isToday
                  ? 'bg-blue-600 text-white'
                  : (c.inMonth ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500') +
                    ' hover:bg-gray-200 dark:hover:bg-gray-700'
              "
              [title]="'Ver el día ' + c.day.getDate()"
              (click)="$event.stopPropagation(); dayOpen.emit(c.day)"
            >
              {{ c.day.getDate() }}
            </button>
          </div>

          @if (c.holiday; as h) {
            <div
              class="truncate px-1 text-[11px] font-medium text-rose-700 dark:text-rose-300"
              [title]="holidayTitle(h)"
            >
              {{ h.name }}
            </div>
          }

          @for (e of c.visible; track e.id) {
            <button
              type="button"
              class="flex w-full items-center gap-1 truncate rounded px-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-800"
              (click)="$event.stopPropagation(); eventClick.emit(e)"
            >
              <span class="size-2 shrink-0 rounded-full" [style.background-color]="e.color"></span>
              <span class="hidden text-gray-500 sm:inline dark:text-gray-400">{{ e.start | date: 'HH:mm' }}</span>
              <span class="truncate text-gray-800 dark:text-gray-200">{{ e.title || '(Sin título)' }}</span>
            </button>
          }

          @if (c.hidden > 0) {
            <button
              type="button"
              class="rounded px-1 text-left text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
              (click)="$event.stopPropagation(); moreClick.emit(c.day)"
            >
              {{ c.hidden }} más
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class MonthView {
  readonly cursor = input.required<Date>();
  readonly events = input.required<CalendarEvent[]>();
  readonly dayClick = output<Date>();
  readonly eventClick = output<CalendarEvent>();
  readonly moreClick = output<Date>();
  readonly dayOpen = output<Date>();
  /** Clase de animación de entrada para las casillas (cambio de mes). */
  readonly anim = input('view-fade');

  protected readonly holidayTitle = holidayTitle;

  protected readonly cells = computed(() => {
    const month = this.cursor().getMonth();
    const today = new Date();
    return monthGrid(this.cursor()).map((day) => {
      const all = eventsOnDay(this.events(), day);
      return {
        day,
        inMonth: day.getMonth() === month,
        isToday: isSameDay(day, today),
        holiday: holidayOn(day),
        visible: all.slice(0, MAX_VISIBLE),
        hidden: Math.max(all.length - MAX_VISIBLE, 0),
      };
    });
  });
}
