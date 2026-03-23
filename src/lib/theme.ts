/** Fired on the window after the document theme class / color-scheme are updated. */
export const THEME_CHANGE_EVENT = 'qr-theme-change';

export function readThemeIsDark(): boolean {
  return document.documentElement.classList.contains('dark');
}

/** Applies class + color-scheme, persists, snaps colors (no transition stagger), notifies listeners. */
export function applyTheme(dark: boolean): void {
  const root = document.documentElement;
  root.classList.add('theme-flash');
  root.classList.toggle('dark', dark);
  root.style.colorScheme = dark ? 'dark' : 'light';
  try {
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  } catch {
    /* private / blocked storage */
  }
  requestAnimationFrame(() => {
    root.classList.remove('theme-flash');
  });
  window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
}
