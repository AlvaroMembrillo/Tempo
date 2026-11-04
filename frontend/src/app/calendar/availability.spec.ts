import {
  TimeScale,
  collapsibleRanges,
  dayAvailability,
  subtract,
  totalMinutes,
} from './availability';
import { CalendarEvent, TimeBlock } from './models';
import { weekDays } from './date-utils';

const sleep: TimeBlock = {
  id: 's',
  label: 'Dormir',
  start: '23:00',
  end: '07:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  color: '#6366f1',
  enabled: true,
};
const work: TimeBlock = { ...sleep, id: 'w', label: 'Trabajo', start: '09:00', end: '17:00', days: [0, 1, 2, 3, 4] };

const event = (start: Date, end: Date): CalendarEvent => ({
  id: crypto.randomUUID(),
  title: '',
  start: start.toISOString(),
  end: end.toISOString(),
  color: '#000',
});

// 2026-11-02 es lunes
const monday = new Date(2026, 10, 2);
const at = (h: number, m = 0) => new Date(2026, 10, 2, h, m);

describe('intervalos', () => {
  it('suma uniendo solapes y resta tramos', () => {
    expect(totalMinutes([[0, 60], [30, 90], [120, 180]])).toBe(150);
    expect(subtract([[0, 600]], [[60, 120], [300, 700]])).toEqual([[0, 60], [120, 300]]);
  });
});

describe('horas disponibles', () => {
  it('descuenta sueño y trabajo, y los eventos fuera de esas franjas', () => {
    const events = [event(at(18), at(20)), event(at(10), at(11))]; // el de las 10 cae en horario de trabajo
    expect(dayAvailability(events, [sleep, work], monday)).toEqual({
      available: 8 * 60,
      planned: 2 * 60,
      free: 6 * 60,
    });
  });
});

describe('vista compacta', () => {
  const days = weekDays(monday);

  it('solo comprime lo que no está disponible ningún día', () => {
    expect(collapsibleRanges([], [sleep, work], days)).toEqual([[0, 7 * 60], [23 * 60, 24 * 60]]);
  });

  it('no comprime horas que tienen eventos', () => {
    const early = [event(at(5), at(6))];
    expect(collapsibleRanges(early, [sleep], days)).toEqual([[0, 5 * 60], [6 * 60, 7 * 60], [23 * 60, 24 * 60]]);
  });

  it('convierte minutos en píxeles y al revés', () => {
    const scale = new TimeScale([[0, 7 * 60]], 48, 18);
    expect(scale.height).toBe(18 + 17 * 48);
    expect(scale.y(7 * 60)).toBe(18);
    expect(scale.y(8 * 60)).toBe(18 + 48);
    expect(scale.minuteAt(10)).toBeNull();
    expect(scale.minuteAt(18 + 48)).toBe(8 * 60);
  });
});
