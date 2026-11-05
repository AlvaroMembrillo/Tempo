import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

/** Debe coincidir con la clave que lee el script de index.html. */
const STORAGE_KEY = 'tempo.theme';

/**
 * Tema claro/oscuro. Se guarda la elección del usuario en localStorage;
 * si nunca ha elegido, se sigue la preferencia del sistema operativo.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(initialTheme());

  constructor() {
    effect(() => {
      const theme = this.theme();
      document.documentElement.classList.toggle('dark', theme === 'dark');
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // almacenamiento no disponible
      }
    });
  }

  /** Cambia de tema con un fundido suave (View Transitions) donde el navegador lo soporte. */
  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    const apply = () => {
      document.documentElement.classList.toggle('dark', next === 'dark');
      this.theme.set(next);
    };
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion && 'startViewTransition' in document) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  }
}

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignoramos y usamos la preferencia del sistema
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
