import * as React from 'react';
import { SignOutButton } from '@clerk/astro/react';
import { Settings, LogOut, Plus } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { cn } from '@/lib/utils';

type MobileAccountMenuProps = {
  initials: string;
  displayName: string;
  subtitle: string;
  /** e.g. Organizer, Staff — shown as a pill under the subtitle */
  roleLabel?: string;
  manageAccountHref?: string;
  signOutRedirectUrl?: string;
  showSignOut?: boolean;
};

export function MobileAccountMenu({
  initials,
  displayName,
  subtitle,
  roleLabel = '',
  manageAccountHref = '/onboarding/profile',
  signOutRedirectUrl = '/',
  showSignOut = true,
}: MobileAccountMenuProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex md:hidden h-9 w-9 shrink-0 items-center justify-center rounded-full',
          'bg-primary/15 text-xs font-semibold text-primary',
          'hover:bg-primary/25 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none'
        )}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={displayName ? `Account menu, signed in as ${displayName}` : 'Account menu'}
      >
        {initials}
      </button>

      <DialogContent
        showCloseButton={false}
        overlayClassName="z-100"
        className={cn(
          'fixed top-16 right-4 left-auto z-101 w-[min(calc(100vw-2rem),20rem)] translate-x-0 translate-y-0',
          'gap-0 rounded-xl border border-border bg-card p-4 shadow-lg sm:max-w-none'
        )}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Account</DialogTitle>

        <div className="flex gap-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary"
            aria-hidden
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate font-semibold text-foreground">{displayName || 'Account'}</p>
            {subtitle ? (
              <p className="truncate text-sm text-muted-foreground">{subtitle}</p>
            ) : null}
            <div className="mt-1.5 flex min-h-9 items-center justify-between gap-2">
              {roleLabel ? (
                <span className="inline-flex w-fit shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  {roleLabel}
                </span>
              ) : (
                <span className="min-w-0 flex-1" aria-hidden />
              )}
              <span className="shrink-0 [&_button]:h-9 [&_button]:w-9">
                <ThemeToggle />
              </span>
            </div>
          </div>
        </div>

        <div
          className={cn('mt-4 grid gap-2', showSignOut ? 'grid-cols-2' : 'grid-cols-1')}
        >
          <Button variant="outline" className="h-auto w-full justify-center gap-2 border-border py-2.5" asChild>
            <a href={manageAccountHref} onClick={() => setOpen(false)}>
              <Settings className="size-4 shrink-0" aria-hidden />
              Account
            </a>
          </Button>
          {showSignOut ? (
            <SignOutButton redirectUrl={signOutRedirectUrl}>
              <Button
                variant="outline"
                className="h-auto w-full justify-center gap-2 border-border py-2.5"
                type="button"
              >
                <LogOut className="size-4 shrink-0" aria-hidden />
                Sign out
              </Button>
            </SignOutButton>
          ) : null}
        </div>

        <div className="my-4 h-px bg-border" />

        <button
          type="button"
          disabled
          className={cn(
            'flex w-full items-center gap-3 rounded-lg py-2 text-left text-sm font-medium text-muted-foreground',
            'cursor-not-allowed opacity-70'
          )}
          aria-disabled="true"
          title="Coming soon"
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-dashed border-border"
            aria-hidden
          >
            <Plus className="size-4" />
          </span>
          Add account
        </button>
      </DialogContent>
    </Dialog>
  );
}
