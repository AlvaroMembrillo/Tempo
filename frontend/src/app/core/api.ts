import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, InjectionToken, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Dirección del backend (FastAPI). */
export const API_URL = new InjectionToken<string>('API_URL', {
  factory: () => 'http://localhost:8000',
});

/** Llamadas al backend con promesas (más cómodas que observables para este uso). */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_URL);

  get<T>(path: string, params?: Record<string, string>): Promise<T> {
    return firstValueFrom(this.http.get<T>(this.base + path, { params }));
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.post<T>(this.base + path, body));
  }

  /** POST como formulario (lo exige el inicio de sesión OAuth2). */
  postForm<T>(path: string, fields: Record<string, string>): Promise<T> {
    return firstValueFrom(
      this.http.post<T>(this.base + path, new HttpParams({ fromObject: fields }), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(this.base + path, body));
  }

  delete(path: string): Promise<unknown> {
    return firstValueFrom(this.http.delete(this.base + path));
  }
}

/** Mensaje legible para el usuario a partir de un error de la API. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'No se puede conectar con el servidor';
    const detail = err.error?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) return 'Algún dato no es válido';
    return `Error del servidor (${err.status})`;
  }
  return 'Error inesperado';
}
