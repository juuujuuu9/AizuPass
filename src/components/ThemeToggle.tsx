import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { applyTheme, readThemeIsDark, THEME_CHANGE_EVENT } from '@/lib/theme';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

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

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      className="h-9 w-9"
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {dark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </Button>
  );
}
