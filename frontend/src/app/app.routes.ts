import { Routes } from '@angular/router';
import { CalendarPage } from './calendar/calendar-page';
import { LoginPage } from './login/login-page';
import { authGuard, guestGuard } from './core/auth';

export const routes: Routes = [
  { path: 'login', component: LoginPage, canActivate: [guestGuard], title: 'Entrar · Tempo' },
  { path: '', component: CalendarPage, canActivate: [authGuard], title: 'Tempo' },
  { path: '**', redirectTo: '' },
];
