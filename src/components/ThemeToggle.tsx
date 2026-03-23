import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { applyTheme, readThemeIsDark, THEME_CHANGE_EVENT } from '@/lib/theme';

export function ThemeToggle() {
  /** null until client sync — avoids SSR (always light) vs inline script theme mismatch */
  const [dark, setDark] = useState<boolean | null>(null);

  const syncFromDom = useCallback(() => {
    setDark(readThemeIsDark());
  }, []);

  useLayoutEffect(() => {
    syncFromDom();
  }, [syncFromDom]);

  useEffect(() => {
    window.addEventListener(THEME_CHANGE_EVENT, syncFromDom);
    return () => window.removeEventListener(THEME_CHANGE_EVENT, syncFromDom);
  }, [syncFromDom]);

  const toggle = () => {
    applyTheme(!readThemeIsDark());
  };

  const isDark = dark === true;

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="h-9 w-9"
      aria-label={
        dark === null
          ? 'Toggle color theme'
          : isDark
            ? 'Switch to light mode'
            : 'Switch to dark mode'
      }
    >
      {dark === null ? (
        <Moon className="h-4 w-4 opacity-40" aria-hidden />
      ) : isDark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
