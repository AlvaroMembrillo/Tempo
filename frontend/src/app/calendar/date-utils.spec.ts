import { blockDuration, blockSegments, overlappingBlocks } from './date-utils';
import { TimeBlock } from './models';

const block = (over: Partial<TimeBlock>): TimeBlock => ({
  id: 'b',
  label: 'Dormir',
  start: '23:00',
  end: '07:00',
  days: [0, 1, 2, 3, 4, 5, 6],
  color: '#6366f1',
  enabled: true,
  ...over,
});

// 2026-11-02 es lunes
const monday = new Date(2026, 10, 2);
const tuesday = new Date(2026, 10, 3);

describe('franjas no disponibles', () => {
  it('calcula la duración aunque cruce la medianoche', () => {
    expect(blockDuration(block({}))).toBe(8 * 60);
    expect(blockDuration(block({ start: '09:00', end: '17:00' }))).toBe(8 * 60);
  });

  it('una franja nocturna ocupa el final de su día y el principio del siguiente', () => {
    expect(blockSegments(block({}), monday)).toEqual([
      [23 * 60, 24 * 60],
      [0, 7 * 60],
    ]);
  });

  it('respeta los días seleccionados', () => {
    const onlyMonday = block({ days: [0] });
    expect(blockSegments(onlyMonday, monday)).toEqual([[23 * 60, 24 * 60]]);
    expect(blockSegments(onlyMonday, tuesday)).toEqual([[0, 7 * 60]]);
    expect(blockSegments(block({ start: '09:00', end: '17:00', days: [0] }), tuesday)).toEqual([]);
  });

  it('ignora franjas desactivadas', () => {
    expect(blockSegments(block({ enabled: false }), monday)).toEqual([]);
  });

  it('detecta eventos que se solapan con una franja', () => {
    const blocks = [block({})];
    const at = (h: number, m = 0) => new Date(2026, 10, 3, h, m);
    expect(overlappingBlocks(blocks, at(6), at(8))).toHaveLength(1);
    expect(overlappingBlocks(blocks, at(7), at(8))).toHaveLength(0);
    expect(overlappingBlocks(blocks, at(22), at(23, 30))).toHaveLength(1);
  });
});
