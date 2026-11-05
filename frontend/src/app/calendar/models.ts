export interface CalendarEvent {
  id: string;
  title: string;
  /** Fecha/hora de inicio en formato ISO. */
  start: string;
  /** Fecha/hora de fin en formato ISO. */
  end: string;
  color: string;
  description?: string;
  /** Proyecto al que se imputan las horas del evento. */
  projectId?: string;
}

export interface Project {
  id: string;
  name: string;
  client?: string;
  color: string;
  /** Tarifa en €/hora; sin tarifa solo se cuentan horas. */
  hourlyRate?: number;
  /** Los proyectos archivados no se ofrecen al crear eventos, pero conservan sus horas. */
  archived?: boolean;
}

export type CalendarView = 'day' | 'week' | 'month';

export const EVENT_COLORS = [
  { value: '#2563eb', label: 'Azul' },
  { value: '#16a34a', label: 'Verde' },
  { value: '#dc2626', label: 'Rojo' },
  { value: '#d97706', label: 'Ámbar' },
  { value: '#9333ea', label: 'Morado' },
  { value: '#0d9488', label: 'Turquesa' },
  { value: '#4b5563', label: 'Gris' },
] as const;

/**
 * Franja horaria recurrente en la que el usuario no está disponible
 * (sueño, trabajo, estudios...). Si `end` <= `start`, la franja cruza la medianoche.
 */
export interface TimeBlock {
  id: string;
  label: string;
  /** Hora de inicio `HH:mm`. */
  start: string;
  /** Hora de fin `HH:mm`. */
  end: string;
  /** Días en los que empieza la franja: 0 = lunes ... 6 = domingo. */
  days: number[];
  color: string;
  enabled: boolean;
  /**
   * Fechas `YYYY-MM-DD` en las que esta franja no se aplica (festivos, vacaciones...).
   * Se quita la franja que *empieza* ese día, aunque termine al día siguiente.
   */
  exceptions?: string[];
  /**
   * Si es true, la franja se mantiene en los días festivos. Si no se indica,
   * solo se mantienen las franjas de sueño (ver `keepsOnHolidays`).
   */
  keepOnHolidays?: boolean;
}

export const BLOCK_COLORS = ['#6366f1', '#64748b', '#0d9488', '#d97706', '#db2777'] as const;

export const BLOCK_PRESETS: { name: string; block: Omit<TimeBlock, 'id'> }[] = [
  {
    name: 'Sueño',
    block: { label: 'Dormir', start: '23:00', end: '07:00', days: [0, 1, 2, 3, 4, 5, 6], color: '#6366f1', enabled: true, keepOnHolidays: true },
  },
  {
    name: 'Trabajo',
    block: { label: 'Trabajo', start: '09:00', end: '17:00', days: [0, 1, 2, 3, 4], color: '#64748b', enabled: true, keepOnHolidays: false },
  },
  {
    name: 'Estudios',
    block: { label: 'Estudios', start: '17:30', end: '20:30', days: [0, 1, 2, 3, 4], color: '#0d9488', enabled: true, keepOnHolidays: false },
  },
  {
    name: 'Personalizada',
    block: { label: 'No disponible', start: '13:00', end: '14:00', days: [0, 1, 2, 3, 4, 5, 6], color: '#d97706', enabled: true, keepOnHolidays: false },
  },
];
