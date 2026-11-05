import { Component, ElementRef, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../core/auth';
import { apiErrorMessage } from '../core/api';
import { readLocalData } from '../core/local-migration';
import { ThemeService } from '../theme';

type Mode = 'login' | 'register';

@Component({
  selector: 'app-login-page',
  host: {
    class:
      'flex min-h-dvh items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-100 p-4 text-gray-900 dark:from-gray-950 dark:via-gray-900 dark:to-indigo-950 dark:text-gray-100',
  },
  template: `
    <button
      type="button"
      class="fixed top-4 right-4 flex size-9 items-center justify-center rounded-full text-gray-600 hover:bg-white/60 dark:text-gray-300 dark:hover:bg-gray-800"
      [attr.aria-label]="theme.theme() === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'"
      (click)="theme.toggle()"
    >
      {{ theme.theme() === 'dark' ? '☀︎' : '☾' }}
    </button>

    <main
      class="w-full max-w-sm rounded-2xl bg-white/90 p-8 shadow-xl ring-1 ring-gray-200 backdrop-blur dark:bg-gray-900/90 dark:ring-gray-800"
      animate.enter="toast-enter"
    >
      <div class="mb-6 flex flex-col items-center gap-3 text-center">
        <img src="favicon.svg" alt="" class="size-14" />
        <h1 class="text-2xl font-semibold">
          {{ mode() === 'login' ? 'Entra en Tempo' : 'Crea tu cuenta' }}
        </h1>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          {{
            mode() === 'login'
              ? 'Tus horas, proyectos y disponibilidad, en todos tus dispositivos.'
              : 'Solo necesitas un email y una contraseña.'
          }}
        </p>
      </div>

      @if (expired) {
        <p class="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
          Tu sesión ha caducado. Vuelve a entrar.
        </p>
      }

      <form class="flex flex-col gap-3" novalidate (submit)="submit($event)">
        @if (mode() === 'register') {
          <label class="flex flex-col gap-1 text-sm" animate.enter="view-fade">
            <span class="font-medium">Nombre <span class="font-normal text-gray-500">(opcional)</span></span>
            <input
              name="name"
              autocomplete="name"
              class="rounded-lg bg-gray-100 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-800"
            />
          </label>
        }
        <label class="flex flex-col gap-1 text-sm">
          <span class="font-medium">Email</span>
          <input
            #emailInput
            name="email"
            type="email"
            autocomplete="email"
            required
            class="rounded-lg bg-gray-100 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-800"
          />
        </label>
        <label class="flex flex-col gap-1 text-sm">
          <span class="font-medium">Contraseña</span>
          <input
            name="password"
            type="password"
            required
            [attr.autocomplete]="mode() === 'login' ? 'current-password' : 'new-password'"
            [attr.minlength]="mode() === 'register' ? 8 : null"
            class="rounded-lg bg-gray-100 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-600 dark:bg-gray-800"
          />
          @if (mode() === 'register') {
            <span class="text-xs text-gray-500 dark:text-gray-400">Al menos 8 caracteres.</span>
          }
        </label>

        @if (error()) {
          <p class="text-sm text-red-600 dark:text-red-400" role="alert" animate.enter="view-fade">
            {{ error() }}
          </p>
        }

        <button
          type="submit"
          class="mt-2 flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          [disabled]="busy()"
        >
          @if (busy()) {
            <span class="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>
          }
          {{ mode() === 'login' ? 'Entrar' : 'Crear cuenta' }}
        </button>
      </form>

      @if (hasLocalData) {
        <p class="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:bg-blue-950/50 dark:text-blue-200">
          Al entrar, lo que tienes guardado en este navegador se subirá a tu cuenta.
        </p>
      }

      <p class="mt-6 text-center text-sm text-gray-600 dark:text-gray-300">
        {{ mode() === 'login' ? '¿Aún no tienes cuenta?' : '¿Ya tienes cuenta?' }}
        <button
          type="button"
          class="font-medium text-blue-600 hover:underline dark:text-blue-400"
          (click)="switchMode()"
        >
          {{ mode() === 'login' ? 'Créala' : 'Entra' }}
        </button>
      </p>
    </main>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly theme = inject(ThemeService);

  protected readonly mode = signal<Mode>('login');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly expired = inject(ActivatedRoute).snapshot.queryParamMap.get('sesion') === 'caducada';
  protected readonly hasLocalData = readLocalData() !== null;

  private readonly emailInput = viewChild.required<ElementRef<HTMLInputElement>>('emailInput');

  constructor() {
    afterNextRender(() => this.emailInput().nativeElement.focus());
  }

  protected switchMode(): void {
    this.mode.update((m) => (m === 'login' ? 'register' : 'login'));
    this.error.set('');
  }

  /**
   * Los valores se leen del formulario al enviarlo (y no con ngModel): así no se
   * pierde nada que el navegador rellene solo nada más cargar la página.
   */
  protected async submit(ev: SubmitEvent): Promise<void> {
    ev.preventDefault();
    if (this.busy()) return;
    const form = new FormData(ev.target as HTMLFormElement);
    const name = String(form.get('name') ?? '');
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (!email || !password) {
      this.error.set('Escribe tu email y tu contraseña.');
      return;
    }
    if (this.mode() === 'register' && password.length < 8) {
      this.error.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    this.busy.set(true);
    this.error.set('');
    try {
      if (this.mode() === 'login') await this.auth.login(email, password);
      else await this.auth.register(email, password, name);
      await this.router.navigate(['/']);
    } catch (err) {
      this.error.set(loginErrorMessage(err));
    } finally {
      this.busy.set(false);
    }
  }
}

function loginErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse && err.status === 422) return 'Revisa el email: no parece válido.';
  if (err instanceof HttpErrorResponse && err.status === 0) {
    return 'No se puede conectar con el servidor. ¿Está arrancado el backend?';
  }
  return apiErrorMessage(err);
}
