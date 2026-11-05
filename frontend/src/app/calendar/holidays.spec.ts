import { HOLIDAYS, holidayOn } from './holidays';
import { blockSegments, keepsOnHolidays } from './date-utils';
import { TimeBlock } from './models';

const block = (over: Partial<TimeBlock>): TimeBlock => ({
  id: 'b',
  label: 'Estudios',
  start: '17:30',
  end: '20:30',
  days: [0, 1, 2, 3, 4],
  color: '#0d9488',
  enabled: true,
  ...over,
});

describe('festivos', () => {
  const corpus2026 = new Date(2026, 5, 4); // jueves 4 de junio de 2026
  const dayAfter = new Date(2026, 5, 5);

  it('no hay fechas repetidas y todas son válidas', () => {
    const dates = HOLIDAYS.map((h) => h.date);
    expect(new Set(dates).size).toBe(dates.length);
    for (const d of dates) expect(Number.isNaN(new Date(d).getTime())).toBe(false);
  });

  it('reconoce los festivos de Sevilla', () => {
    expect(holidayOn(corpus2026)?.name).toBe('Corpus Christi');
    expect(holidayOn(dayAfter)).toBeUndefined();
  });

  it('en un festivo quita las franjas salvo las de dormir', () => {
    expect(blockSegments(block({}), corpus2026)).toEqual([]);
    expect(blockSegments(block({}), dayAfter)).toHaveLength(1);

    const sleep = block({ label: 'Dormir', start: '23:00', end: '07:00', days: [0, 1, 2, 3, 4, 5, 6] });
    expect(keepsOnHolidays(sleep)).toBe(true);
    expect(blockSegments(sleep, corpus2026)).toHaveLength(2);
  });

  it('respeta la preferencia explícita del usuario', () => {
    expect(blockSegments(block({ keepOnHolidays: true }), corpus2026)).toHaveLength(1);
    expect(keepsOnHolidays(block({ label: 'Dormir', keepOnHolidays: false }))).toBe(false);
  });
});
