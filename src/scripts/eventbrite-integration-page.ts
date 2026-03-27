export interface EventbriteIntegrationPageData {
  eventId: string | undefined;
  eventbrite?: {
    eventbriteEventId?: string;
    credentialsSaved?: boolean;
    lastSyncedAt?: string;
  };
  showPanel?: boolean;
}

function getPageData(): EventbriteIntegrationPageData | null {
  const el = document.getElementById('integrations-page-data');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}

export function initEventbriteIntegrationPage(): void {
  const data = getPageData();
  if (!data?.eventId || !data.showPanel) return;

  const eventId = data.eventId;
  const panel = document.getElementById('eventbrite-sync-panel');
  const btn = document.getElementById('eb-sync-btn') as HTMLButtonElement | null;
  const btnLabel = document.getElementById('eb-sync-label');
  const btnSpinner = document.getElementById('eb-sync-spinner');
  const eventIdInput = document.getElementById('eb-event-id') as HTMLInputElement | null;
  const tokenInput = document.getElementById('eb-private-token') as HTMLInputElement | null;
  const saveCb = document.getElementById('eb-save-credentials') as HTMLInputElement | null;
  const errEl = document.getElementById('eb-sync-error');
  const okEl = document.getElementById('eb-sync-success');
  if (!panel || !btn || !btnLabel || !btnSpinner || !eventIdInput || !tokenInput || !saveCb || !errEl || !okEl) return;

  const eb = data.eventbrite;
  if (eb?.eventbriteEventId) {
    eventIdInput.value = eb.eventbriteEventId;
  }

  let credentialsSaved = Boolean(eb?.credentialsSaved);

  btn.addEventListener('click', async () => {
    errEl.classList.add('hidden');
    okEl.classList.add('hidden');
    const eventbriteEventId = eventIdInput.value.trim();
    const privateToken = tokenInput.value.trim();
    const saveCredentials = saveCb.checked;
    const allowEmptyToken = credentialsSaved || panel.dataset.ebCredentialsSaved === '1';
    if (!eventbriteEventId || (!privateToken && !allowEmptyToken)) {
      errEl.textContent = 'Enter the Eventbrite event ID and private token.';
      errEl.classList.remove('hidden');
      return;
    }
    btn.disabled = true;
    btnLabel.textContent = 'Syncing...';
    btnSpinner.classList.remove('hidden');
    try {
      const res = await fetch('/api/integrations/eventbrite/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventId,
          eventbriteEventId,
          ...(privateToken ? { privateToken } : {}),
          saveCredentials,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        errEl.textContent = payload.error || `Sync failed (${res.status})`;
        errEl.classList.remove('hidden');
        return;
      }
      okEl.textContent = `Synced: ${payload.created ?? 0} added, ${payload.updated ?? 0} updated${(payload.skipped ?? 0) > 0 ? `, ${payload.skipped} skipped` : ''}.`;
      okEl.classList.remove('hidden');
      if (saveCredentials) {
        credentialsSaved = true;
        panel.dataset.ebCredentialsSaved = '1';
        tokenInput.value = '';
        tokenInput.placeholder = '•••••••• (saved — leave blank to reuse)';
      }
    } catch {
      errEl.textContent = 'Network error. Try again.';
      errEl.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btnLabel.textContent = 'Sync from Eventbrite';
      btnSpinner.classList.add('hidden');
    }
  });
}
