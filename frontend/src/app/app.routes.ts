import { Routes } from '@angular/router';
import { CalendarPage } from './calendar/calendar-page';

export const routes: Routes = [
  { path: '', component: CalendarPage },
  { path: '**', redirectTo: '' },
];
