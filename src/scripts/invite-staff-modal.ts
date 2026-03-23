/**
 * Wires the invite-staff modal (header + [data-open-invite-staff-modal] triggers).
 * Include markup from InviteStaffModal.astro once per page.
 */
export function initInviteStaffModal(): void {
  const modal = document.getElementById('invite-staff-modal');
  const form = document.getElementById('invite-staff-form');
  if (!(modal instanceof HTMLElement) || !(form instanceof HTMLFormElement)) return;

  if (modal.dataset.inviteModalBound === '1') return;
  modal.dataset.inviteModalBound = '1';

  const openButtons = [
    document.getElementById('open-invite-staff-modal-header'),
    ...document.querySelectorAll<HTMLElement>('[data-open-invite-staff-modal]'),
  ].filter((el): el is HTMLElement => el instanceof HTMLElement);

  const cancelButton = document.getElementById('cancel-invite-staff-modal');
  const emailInput = document.getElementById('invite-staff-email');
  const status = document.getElementById('invite-staff-status');
  const pageStatus = document.getElementById('organization-page-status');
  const submitButton = document.getElementById('submit-invite-staff');

  const openModal = () => {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (emailInput instanceof HTMLInputElement) emailInput.focus();
    if (status instanceof HTMLElement) {
      status.textContent = '';
      status.className = 'min-h-5 text-sm text-muted-foreground';
    }
  };

  const closeModal = () => {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    form.reset();
    if (status instanceof HTMLElement) {
      status.textContent = '';
      status.className = 'min-h-5 text-sm text-muted-foreground';
    }
  };

  for (const button of openButtons) {
    button.addEventListener('click', openModal);
  }
  cancelButton?.addEventListener('click', closeModal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const email = emailInput instanceof HTMLInputElement ? emailInput.value.trim() : '';
    if (!email) return;
    if (submitButton instanceof HTMLButtonElement) submitButton.disabled = true;
    if (status instanceof HTMLElement) {
      status.textContent = 'Sending invite...';
      status.className = 'min-h-5 text-sm text-muted-foreground';
    }
    try {
      const res = await fetch('/api/organizations/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        if (status instanceof HTMLElement) {
          status.textContent = (body.error as string) || `Error ${res.status}`;
          status.className = 'min-h-5 text-sm text-[var(--red-11)]';
        }
        return;
      }
      if (status instanceof HTMLElement) {
        const comm = body.communication as { sent?: boolean; error?: string } | undefined;
        if (comm?.sent) {
          status.textContent = 'Invite email sent.';
          status.className = 'min-h-5 text-sm text-[var(--green-11)]';
        } else {
          const reason = comm?.error || 'Email service is not configured';
          status.textContent = `Invite created, but email was not sent: ${reason}`;
          status.className = 'min-h-5 text-sm text-[var(--amber-11)]';
        }
      }
      if (pageStatus instanceof HTMLElement) {
        pageStatus.textContent = 'Invite sent. Refreshing list...';
        pageStatus.className = 'min-h-5 text-sm text-[var(--green-11)]';
      }
      window.setTimeout(() => {
        window.location.reload();
      }, 500);
    } catch {
      if (status instanceof HTMLElement) {
        status.textContent = 'Could not send invite';
        status.className = 'min-h-5 text-sm text-[var(--red-11)]';
      }
    } finally {
      if (submitButton instanceof HTMLButtonElement) submitButton.disabled = false;
    }
  });
}
