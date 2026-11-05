import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { API_URL, Api } from './api';

const TOKEN_KEY = 'tempo.token';

export interface User {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  holidayRegion: string;
}

/** Sesión del usuario: token (guardado en el navegador) y datos de la cuenta. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(readToken());
  readonly user = signal<User | null>(null);
  readonly isLoggedIn = computed(() => this.token() !== null);
  /** Callbacks al cerrar sesión (vaciar los datos en memoria, etc.). */
  private readonly logoutHandlers: (() => void)[] = [];

  async login(email: string, password: string): Promise<void> {
    const { access_token } = await this.api.postForm<{ access_token: string }>('/auth/token', {
      username: email.trim(),
      password,
    });
    this.setToken(access_token);
    await this.loadUser();
  }

  async register(email: string, password: string, name?: string): Promise<void> {
    await this.api.post('/auth/register', { email: email.trim(), password, name: name?.trim() || null });
    await this.login(email, password);
  }

  async loadUser(): Promise<void> {
    this.user.set(await this.api.get<User>('/auth/me'));
  }

  onLogout(handler: () => void): void {
    this.logoutHandlers.push(handler);
  }

  logout(reason?: 'expired'): void {
    this.setToken(null);
    this.user.set(null);
    this.logoutHandlers.forEach((h) => h());
    void this.router.navigate(['/login'], {
      queryParams: reason === 'expired' ? { sesion: 'caducada' } : {},
    });
  }

  private setToken(token: string | null): void {
    this.token.set(token);
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // almacenamiento no disponible: la sesión dura lo que la pestaña
    }
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Añade el token a las peticiones al backend y cierra la sesión si ha caducado. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  if (!req.url.startsWith(inject(API_URL))) return next(req);

  const token = auth.token();
  const authed = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(authed).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && token) {
        auth.logout('expired');
      }
      return throwError(() => err);
    }),
  );
};

/** Solo deja pasar con sesión iniciada. */
export const authGuard: CanActivateFn = () =>
  inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/login']);

/** La pantalla de acceso no tiene sentido con la sesión ya iniciada. */
export const guestGuard: CanActivateFn = () =>
  !inject(AuthService).isLoggedIn() || inject(Router).createUrlTree(['/']);
