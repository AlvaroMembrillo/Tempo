import { buildCsv, minutesWithin, projectTotals } from './projects';
import { CalendarEvent, Project } from './models';

const acme: Project = { id: 'a', name: 'Web Acme', client: 'Acme; S.L.', color: '#2563eb', hourlyRate: 40 };
const libre: Project = { id: 'b', name: 'Proyecto personal', color: '#16a34a' };

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m);
const ev = (id: string, start: Date, end: Date, projectId?: string, title = id): CalendarEvent => ({
  id,
  title,
  start: start.toISOString(),
  end: end.toISOString(),
  color: '#000',
  projectId,
});

const events = [
  ev('e1', at(9, 9), at(9, 11, 30), 'a', 'Maquetación'), // 2,5 h
  ev('e2', at(10, 16), at(10, 17), 'a', 'Reunión "kick-off"'), // 1 h
  ev('e3', at(10, 18), at(10, 20), 'b'), // 2 h sin tarifa
  ev('e4', at(11, 10), at(11, 11)), // sin proyecto
  ev('e5', at(20, 10), at(20, 12), 'a'), // fuera del periodo
  ev('e6', at(12, 9), at(12, 10), 'borrado'), // proyecto que ya no existe
];
const from = at(9, 0);
const to = at(16, 0);

describe('proyectos', () => {
  it('recorta los minutos al periodo', () => {
    expect(minutesWithin(ev('x', at(8, 23), at(9, 1)), from, to)).toBe(60);
    expect(minutesWithin(ev('y', at(20, 9), at(20, 10)), from, to)).toBe(0);
  });

  it('suma horas e importe por proyecto, con «sin proyecto» al final', () => {
    const totals = projectTotals(events, [acme, libre], from, to);
    expect(totals.map((t) => [t.project?.id ?? null, t.minutes / 60, t.amount])).toEqual([
      ['a', 3.5, 140],
      ['b', 2, null],
      [null, 2, null], // e4 y e6 (su proyecto ya no existe)
    ]);
  });

  it('exporta un CSV listo para Excel en español', () => {
    const csv = buildCsv(events, [acme, libre], from, to, 'a');
    expect(csv.startsWith('\ufeff')).toBe(true);
    // trim() quitaría también el BOM, así que se recorta aparte
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Fecha;Inicio;Fin;Horas;Proyecto;Cliente;Evento;Tarifa (€/h);Importe (€)');
    expect(lines[1]).toBe('2026-11-09;09:00;11:30;2,50;Web Acme;"Acme; S.L.";Maquetación;40,00;100,00');
    expect(lines[2]).toBe('2026-11-10;16:00;17:00;1,00;Web Acme;"Acme; S.L.";"Reunión ""kick-off""";40,00;40,00');
    expect(lines[3]).toBe('Total;;;3,50;;;;;140,00');
    expect(lines).toHaveLength(4);
  });

  it('«todos» exporta solo eventos con proyecto existente', () => {
    const lines = buildCsv(events, [acme, libre], from, to, 'all').trim().split('\r\n');
    expect(lines).toHaveLength(5); // cabecera + e1, e2, e3 + total
    expect(lines[3]).toContain('Proyecto personal');
    expect(lines[3].endsWith(';;')).toBe(true); // sin tarifa ni importe
  });
});
