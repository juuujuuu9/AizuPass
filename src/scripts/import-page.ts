import { create as createFilePond } from 'filepond';
import 'filepond/dist/filepond.min.css';

interface ImportPageData {
  eventId: string | undefined;
  eventName: string;
  organizationName: string;
  fromEmail: string;
}

interface CustomMappingRow {
  rowWrap: HTMLDivElement;
  headerSelect: HTMLSelectElement;
  labelInput: HTMLInputElement;
  removeBtn: HTMLButtonElement;
}

function getPageData(): ImportPageData | null {
  const el = document.getElementById('import-page-data');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}

export function initImportPage(): void {
  const data = getPageData();
  if (!data) return;

  const { eventId, eventName, organizationName, fromEmail } = data;

  const form = document.getElementById('import-form');
  if (!form || !eventId) return;

  const fileInput = form.querySelector<HTMLInputElement>('input[name="file"]');
  let csvPond: ReturnType<typeof createFilePond> | null = null;

  function getSelectedPondFile() {
    return csvPond?.getFiles()[0] ?? null;
  }

  function clearCsvFileUiState() {
    errorEl?.classList.add('hidden');
    successEl?.classList.add('hidden');
    importNoteEl?.classList.add('hidden');
    warningsEl?.classList.add('hidden');
    if (errorRowsObjectUrl) {
      URL.revokeObjectURL(errorRowsObjectUrl);
      errorRowsObjectUrl = null;
    }
    if (errorRowsDownload) errorRowsDownload.classList.add('hidden');
    csvHeaders = [];
    selectedDelimiter = ',';
    resetCustomMappingRows();
    setSelectOptions(mappingSelects.email, [], '');
    setSelectOptions(mappingSelects.first_name, [], '');
    setSelectOptions(mappingSelects.last_name, [], '');
    setSelectOptions(mappingSelects.full_name, [], '');
    mappingPanel?.classList.add('hidden');
    delimiterEl?.classList.add('hidden');
  }
  const errorEl = document.getElementById('form-error');
  const successEl = document.getElementById('form-success');
  const importNoteEl = document.getElementById('form-import-note');
  const warningsEl = document.getElementById('form-warnings');
  const errorRowsDownload = document.getElementById('error-rows-download') as HTMLAnchorElement | null;
  const submitBtn = document.getElementById('submit-btn') as HTMLButtonElement | null;
  const submitLabel = document.getElementById('submit-label');
  const submitSpinner = document.getElementById('submit-spinner');

  const mappingPanel = document.getElementById('mapping-panel');
  const delimiterEl = document.getElementById('detected-delimiter');
  const importModeSelect = document.getElementById('import-mode') as HTMLSelectElement | null;
  const replaceConfirmRow = document.getElementById('replace-confirm-row');
  const replaceConfirm = document.getElementById('replace-confirm') as HTMLInputElement | null;
  const mappingSelects = {
    email: document.getElementById('map-email') as HTMLSelectElement | null,
    first_name: document.getElementById('map-first-name') as HTMLSelectElement | null,
    last_name: document.getElementById('map-last-name') as HTMLSelectElement | null,
    full_name: document.getElementById('map-full-name') as HTMLSelectElement | null,
  };
  const customMappingList = document.getElementById('custom-mapping-list');
  const addCustomMappingBtn = document.getElementById('add-custom-mapping');

  const bulkEmailSection = document.getElementById('bulk-email-section');
  const bulkCount = document.getElementById('bulk-count');
  const bulkSendBtn = document.getElementById('bulk-send-btn') as HTMLButtonElement | null;
  const bulkSendLabel = document.getElementById('bulk-send-label');
  const bulkSendSpinner = document.getElementById('bulk-send-spinner');
  const bulkProgress = document.getElementById('bulk-progress');
  const bulkResult = document.getElementById('bulk-result');
  const resultSent = document.getElementById('result-sent');
  const resultFailed = document.getElementById('result-failed');
  const resultTotal = document.getElementById('result-total');
  const resultErrors = document.getElementById('result-errors');
  const skipEmailLink = document.getElementById('skip-email-link') as HTMLAnchorElement | null;
  const bulkDialog = document.getElementById('bulk-email-dialog') as HTMLDialogElement | null;
  const fromNameOrgOption = document.getElementById('from-name-org-option') as HTMLInputElement | null;
  const fromNameCustomOption = document.getElementById('from-name-custom-option') as HTMLInputElement | null;
  const fromNameCustomRow = document.getElementById('from-name-custom-row');
  const fromNameInput = document.getElementById('from-name-input') as HTMLInputElement | null;
  const fromSenderPreview = document.getElementById('from-sender-preview');
  const eventNameInput = document.getElementById('event-name-input') as HTMLInputElement | null;
  const dialogCount = document.getElementById('dialog-count');
  const dialogError = document.getElementById('bulk-dialog-error');
  const dialogCancel = document.getElementById('bulk-dialog-cancel');
  const dialogSend = document.getElementById('bulk-dialog-send');

  let importedAttendeeIds: string[] = [];
  let csvHeaders: string[] = [];
  let selectedDelimiter = ',';
  let errorRowsObjectUrl: string | null = null;
  let customMappingRows: CustomMappingRow[] = [];

  function updateFromNameCustomVisibility() {
    const customSelected = Boolean(fromNameCustomOption?.checked);
    if (!fromNameCustomRow || !fromNameInput) return;
    fromNameCustomRow.classList.toggle('hidden', !customSelected);
    fromNameInput.disabled = !customSelected;
    if (!customSelected) fromNameInput.value = '';
  }

  function resolveSelectedFromName(): string {
    const usingOrganizationName = Boolean(fromNameOrgOption?.checked && String(organizationName || '').trim());
    if (usingOrganizationName) return String(organizationName).trim();
    return fromNameInput?.value.trim() || '';
  }

  function updateFromSenderPreview() {
    if (!fromSenderPreview) return;
    const selectedName = resolveSelectedFromName();
    if (selectedName) {
      fromSenderPreview.textContent = `${selectedName} <${fromEmail}>`;
      return;
    }
    fromSenderPreview.textContent = `<${fromEmail}>`;
  }

  function validateAndSendFromDialog() {
    const from = resolveSelectedFromName();
    const evName = eventNameInput?.value.trim() || '';
    if (!from) {
      if (dialogError) {
        dialogError.textContent = 'Please choose an organization name or enter a custom From name.';
        dialogError.classList.remove('hidden');
      }
      return;
    }
    if (!evName) {
      if (dialogError) {
        dialogError.textContent = 'Please enter an Event name.';
        dialogError.classList.remove('hidden');
      }
      return;
    }
    executeBulkSend(from, evName);
  }

  function normalizeHeader(header: string): string {
    return String(header || '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '_');
  }

  function normalizeCustomLabel(label: string): string {
    return String(label || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function parseCSVLine(line: string, delimiter: string): string[] {
    const out: string[] = [];
    let i = 0;
    while (i < line.length) {
      if (line[i] === '"') {
        i += 1;
        let cell = '';
        while (i < line.length) {
          if (line[i] === '"') {
            i += 1;
            if (line[i] === '"') {
              cell += '"';
              i += 1;
            } else {
              break;
            }
          } else {
            cell += line[i];
            i += 1;
          }
        }
        out.push(cell);
      } else {
        const idx = line.indexOf(delimiter, i);
        const end = idx === -1 ? line.length : idx;
        out.push(line.slice(i, end).trim());
        i = idx === -1 ? line.length : idx + 1;
      }
    }
    return out;
  }

  function detectDelimiter(headerLine: string): string {
    const commaCount = (headerLine.match(/,/g) || []).length;
    const semicolonCount = (headerLine.match(/;/g) || []).length;
    const tabCount = (headerLine.match(/\t/g) || []).length;
    const counts = [
      { delimiter: ',', count: commaCount },
      { delimiter: ';', count: semicolonCount },
      { delimiter: '\t', count: tabCount },
    ].sort((a, b) => b.count - a.count);
    return counts[0].count > 0 ? counts[0].delimiter : ',';
  }

  function setSelectOptions(select: HTMLSelectElement | null, headers: string[], selectedValue = '') {
    if (!select) return;
    const safeSelected = headers.includes(selectedValue) ? selectedValue : '';
    select.innerHTML = '';
    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = '(Not mapped)';
    select.appendChild(emptyOption);
    for (const header of headers) {
      const option = document.createElement('option');
      option.value = header;
      option.textContent = header;
      option.selected = header === safeSelected;
      select.appendChild(option);
    }
  }

  function getFirstHeaderMatch(headers: string[], aliases: string[]): string {
    const byNormalized = new Map(headers.map((header) => [normalizeHeader(header), header]));
    for (const alias of aliases) {
      const found = byNormalized.get(alias);
      if (found) return found;
    }
    return '';
  }

  function buildAutoMapping(headers: string[]) {
    return {
      email: getFirstHeaderMatch(headers, ['email', 'e-mail', 'email_address', 'guest_email']),
      first_name: getFirstHeaderMatch(headers, ['first_name', 'firstname', 'first']),
      last_name: getFirstHeaderMatch(headers, ['last_name', 'lastname', 'last']),
      full_name: getFirstHeaderMatch(headers, ['name', 'full_name', 'fullname', 'guest']),
    };
  }

  function currentMappingPayload() {
    const custom = customMappingRows
      .map((row) => ({
        sourceHeader: row.headerSelect?.value || '',
        label: row.labelInput?.value?.trim() || '',
      }))
      .filter((row) => row.sourceHeader && row.label);
    return {
      core: {
        email: mappingSelects.email?.value || '',
        first_name: mappingSelects.first_name?.value || '',
        last_name: mappingSelects.last_name?.value || '',
        full_name: mappingSelects.full_name?.value || '',
      },
      custom,
    };
  }

  function refreshCustomHeaderOptions() {
    for (const row of customMappingRows) {
      const selected = row.headerSelect?.value || '';
      setSelectOptions(row.headerSelect, csvHeaders, selected);
    }
  }

  function createCustomMappingRow(initialHeader = '', initialLabel = '') {
    if (!customMappingList) return;
    const rowWrap = document.createElement('div');
    rowWrap.className = 'grid gap-2';

    const headerSelect = document.createElement('select');
    headerSelect.className = 'w-full rounded border border-input bg-background px-2 py-2 text-sm text-foreground';
    setSelectOptions(headerSelect, csvHeaders, initialHeader);

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.className = 'w-full rounded border border-input bg-background px-2 py-2 text-sm text-foreground';
    labelInput.placeholder = 'label (e.g. table_number)';
    labelInput.value = initialLabel;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'rounded border border-border px-2 py-2 text-xs text-muted-foreground hover:bg-muted';
    removeBtn.textContent = 'Remove';

    const row: CustomMappingRow = { rowWrap, headerSelect, labelInput, removeBtn };
    removeBtn.addEventListener('click', () => {
      customMappingRows = customMappingRows.filter((entry) => entry !== row);
      rowWrap.remove();
    });

    rowWrap.appendChild(headerSelect);
    rowWrap.appendChild(labelInput);
    rowWrap.appendChild(removeBtn);
    customMappingList.appendChild(rowWrap);
    customMappingRows.push(row);
  }

  function resetCustomMappingRows() {
    customMappingRows = [];
    if (customMappingList) customMappingList.innerHTML = '';
  }

  function updateReplaceConfirmVisibility() {
    if (!replaceConfirmRow || !importModeSelect) return;
    const replaceMode = importModeSelect.value === 'replace';
    replaceConfirmRow.classList.toggle('hidden', !replaceMode);
    replaceConfirmRow.classList.toggle('flex', replaceMode);
    if (!replaceMode && replaceConfirm) replaceConfirm.checked = false;
  }

  async function parseHeadersFromFile(file: File) {
    if (!mappingPanel || !delimiterEl) return;
    const sampleText = await file.slice(0, 256 * 1024).text();
    const lines = sampleText.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (!lines.length) throw new Error('CSV appears empty.');
    selectedDelimiter = detectDelimiter(lines[0]);
    csvHeaders = parseCSVLine(lines[0], selectedDelimiter).map((header) => String(header).trim()).filter(Boolean);
    if (!csvHeaders.length) throw new Error('Could not read CSV headers.');

    const autoMap = buildAutoMapping(csvHeaders);
    setSelectOptions(mappingSelects.email, csvHeaders, autoMap.email);
    setSelectOptions(mappingSelects.first_name, csvHeaders, autoMap.first_name);
    setSelectOptions(mappingSelects.last_name, csvHeaders, autoMap.last_name);
    setSelectOptions(mappingSelects.full_name, csvHeaders, autoMap.full_name);
    resetCustomMappingRows();

    mappingPanel.classList.remove('hidden');
    const delimiterLabel = selectedDelimiter === '\t' ? 'tab' : selectedDelimiter;
    delimiterEl.classList.remove('hidden');
    delimiterEl.textContent = `Detected delimiter: ${delimiterLabel}`;
  }

  if (importModeSelect) {
    importModeSelect.addEventListener('change', updateReplaceConfirmVisibility);
    updateReplaceConfirmVisibility();
  }

  if (addCustomMappingBtn) {
    addCustomMappingBtn.addEventListener('click', () => {
      if (csvHeaders.length === 0) return;
      createCustomMappingRow();
      refreshCustomHeaderOptions();
    });
  }

  if (fileInput) {
    csvPond = createFilePond(fileInput, {
      credits: false,
      allowMultiple: false,
      maxFiles: 1,
      instantUpload: false,
      labelIdle:
        'Drag & drop your CSV, or <span class="filepond--label-action">Browse</span>',
      beforeAddFile: (item) => /\.csv$/i.test(item.file.name),
    });

    csvPond.on('addfile', async (_err, fileItem) => {
      if (!errorEl || !successEl || _err) return;
      clearCsvFileUiState();
      try {
        await parseHeadersFromFile(fileItem.file);
      } catch (err) {
        errorEl.textContent = err instanceof Error ? err.message : 'Could not parse CSV headers.';
        errorEl.classList.remove('hidden');
        mappingPanel?.classList.add('hidden');
        csvPond?.removeFile(fileItem);
      }
    });

    csvPond.on('removefile', () => {
      clearCsvFileUiState();
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (bulkDialog?.open && dialogSend && eventNameInput) {
      validateAndSendFromDialog();
      return;
    }

    if (!errorEl || !successEl || !submitBtn) return;
    const pondFile = getSelectedPondFile();
    if (!pondFile?.file) {
      errorEl.textContent = 'Please choose a CSV file.';
      errorEl.classList.remove('hidden');
      return;
    }
    errorEl.classList.add('hidden');
    successEl.classList.add('hidden');
    importNoteEl?.classList.add('hidden');
    warningsEl?.classList.add('hidden');
    if (errorRowsDownload) errorRowsDownload.classList.add('hidden');

    if (csvHeaders.length === 0) {
      errorEl.textContent = 'Please choose a CSV file so we can map headers first.';
      errorEl.classList.remove('hidden');
      return;
    }

    const mappingPayload = currentMappingPayload();
    const core = mappingPayload.core;
    if (!core.email) {
      errorEl.textContent = 'Email mapping is required.';
      errorEl.classList.remove('hidden');
      return;
    }
    const hasFirstLastPair = Boolean(core.first_name && core.last_name);
    const hasFullNameFallback = Boolean(core.full_name);
    if (!hasFirstLastPair && !hasFullNameFallback) {
      errorEl.textContent = 'Map both first and last name, or map a full-name fallback column.';
      errorEl.classList.remove('hidden');
      return;
    }

    const selectedCustomHeaders = new Set<string>();
    const selectedCustomLabels = new Set<string>();
    for (const row of customMappingRows) {
      const sourceHeader = row.headerSelect?.value || '';
      const labelRaw = row.labelInput?.value?.trim() || '';
      if (!sourceHeader && !labelRaw) continue;
      if (!sourceHeader || !labelRaw) {
        errorEl.textContent = 'Each additional column mapping needs both a source column and a label.';
        errorEl.classList.remove('hidden');
        return;
      }
      const normalizedLabel = normalizeCustomLabel(labelRaw);
      if (!normalizedLabel) {
        errorEl.textContent = 'Additional column labels must contain letters or numbers.';
        errorEl.classList.remove('hidden');
        return;
      }
      if (selectedCustomHeaders.has(sourceHeader)) {
        errorEl.textContent = `Additional column "${sourceHeader}" is mapped more than once.`;
        errorEl.classList.remove('hidden');
        return;
      }
      if (selectedCustomLabels.has(normalizedLabel)) {
        errorEl.textContent = `Additional label "${labelRaw}" is used more than once.`;
        errorEl.classList.remove('hidden');
        return;
      }
      selectedCustomHeaders.add(sourceHeader);
      selectedCustomLabels.add(normalizedLabel);
    }

    const importMode = importModeSelect?.value || 'add';
    if (importMode === 'replace' && !replaceConfirm?.checked) {
      errorEl.textContent = 'Please confirm replace mode before importing.';
      errorEl.classList.remove('hidden');
      return;
    }

    submitBtn.disabled = true;
    if (submitLabel) submitLabel.textContent = 'Importing…';
    if (submitSpinner) submitSpinner.classList.remove('hidden');
    const formData = new FormData();
    formData.append('eventId', eventId);
    formData.append('file', pondFile.file, pondFile.filename);
    formData.append('importMode', importMode);
    formData.append('confirmReplace', importMode === 'replace' && replaceConfirm?.checked ? 'true' : 'false');
    formData.append('mapping', JSON.stringify(mappingPayload));
    try {
      const res = await fetch('/api/attendees/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errorEl.textContent = data.error || `Error ${res.status}`;
        errorEl.classList.remove('hidden');
        return;
      }

      importedAttendeeIds = data.newlyImportedAttendeeIds || data.importedAttendeeIds || [];
      const summaryBits = [
        `Imported ${data.imported || 0}`,
        `Updated ${data.updated || 0}`,
        `Deleted ${data.deleted || 0}`,
        `Skipped ${data.skipped || 0}`,
      ];
      successEl.textContent = `${summaryBits.join(' · ')} attendee(s).`;
      successEl.classList.remove('hidden');

      const allWarnings = Array.isArray(data.warnings) ? data.warnings : [];
      const batchNotes = allWarnings.filter((w: { type?: string }) => w.type === 'size');
      const realWarnings = allWarnings.filter((w: { type?: string }) => w.type !== 'size');

      if (batchNotes.length > 0 && importNoteEl) {
        const lines = batchNotes.map(
          (w: { message?: string }) => w.message || 'Large imports use small server batches; this is normal.'
        );
        importNoteEl.innerHTML = `<p class="font-medium text-foreground">Import note</p><p class="mt-1.5">${lines.join(' ')}</p>`;
        importNoteEl.classList.remove('hidden');
      }

      if (realWarnings.length > 0 && warningsEl) {
        const warningLines = realWarnings
          .slice(0, 10)
          .map((warning: { message?: string }) => `• ${warning.message || 'Import warning'}`);
        warningsEl.innerHTML = `<strong>Warnings</strong><br>${warningLines.join('<br>')}`;
        warningsEl.classList.remove('hidden');
      }

      if (data.errorRowsCsv && errorRowsDownload) {
        if (errorRowsObjectUrl) URL.revokeObjectURL(errorRowsObjectUrl);
        const blob = new Blob([data.errorRowsCsv], { type: 'text/csv;charset=utf-8' });
        errorRowsObjectUrl = URL.createObjectURL(blob);
        errorRowsDownload.href = errorRowsObjectUrl;
        errorRowsDownload.classList.remove('hidden');
      }

      const formActions = document.getElementById('form-actions');
      if (formActions) formActions.classList.add('hidden');

      if (importedAttendeeIds.length > 0 && bulkEmailSection) {
        bulkEmailSection.classList.remove('hidden');
        if (bulkCount) bulkCount.textContent = String(importedAttendeeIds.length);
        if (skipEmailLink) skipEmailLink.href = `/admin?event=${eventId}`;
      } else if (bulkEmailSection) {
        bulkEmailSection.classList.add('hidden');
      }
    } catch {
      errorEl.textContent = 'Import failed. Try again.';
      errorEl.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      if (submitLabel) submitLabel.textContent = 'Import';
      if (submitSpinner) submitSpinner.classList.add('hidden');
    }
  });

  function openBulkEmailDialog() {
    if (!bulkDialog || importedAttendeeIds.length === 0) return;
    if (eventNameInput) eventNameInput.value = eventName || '';
    if (fromNameOrgOption && String(organizationName || '').trim()) {
      fromNameOrgOption.checked = true;
    } else if (fromNameCustomOption) {
      fromNameCustomOption.checked = true;
    }
    if (fromNameInput) fromNameInput.value = '';
    updateFromNameCustomVisibility();
    updateFromSenderPreview();
    if (dialogCount) dialogCount.textContent = String(importedAttendeeIds.length);
    if (dialogError) {
      dialogError.textContent = '';
      dialogError.classList.add('hidden');
    }
    bulkDialog.showModal();
  }

  if (fromNameOrgOption) {
    fromNameOrgOption.addEventListener('change', () => {
      updateFromNameCustomVisibility();
      updateFromSenderPreview();
    });
  }
  if (fromNameCustomOption) {
    fromNameCustomOption.addEventListener('change', () => {
      updateFromNameCustomVisibility();
      updateFromSenderPreview();
    });
  }
  if (fromNameInput) {
    fromNameInput.addEventListener('input', updateFromSenderPreview);
  }
  updateFromNameCustomVisibility();
  updateFromSenderPreview();

  if (dialogCancel) {
    dialogCancel.addEventListener('click', () => bulkDialog?.close());
  }

  async function executeBulkSend(fromName: string, eventNameValue: string) {
    if (importedAttendeeIds.length === 0) return;

    const confirmMsg = `⚠️ WARNING: You are about to send ${importedAttendeeIds.length} emails to real people.\n\n` +
      `This will dispatch QR codes to ALL imported attendees.\n\n` +
      `Are you absolutely sure you want to continue?`;
    if (!confirm(confirmMsg)) return;

    bulkDialog?.close();
    if (bulkSendBtn) bulkSendBtn.disabled = true;
    if (bulkSendLabel) bulkSendLabel.textContent = 'Sending...';
    if (bulkSendSpinner) bulkSendSpinner.classList.remove('hidden');
    if (bulkProgress) bulkProgress.classList.remove('hidden');
    if (bulkResult) bulkResult.classList.add('hidden');

    try {
      const res = await fetch('/api/attendees/send-bulk-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attendeeIds: importedAttendeeIds,
          eventId: eventId,
          fromName: fromName?.trim() || undefined,
          eventName: eventNameValue?.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (bulkProgress) bulkProgress.classList.add('hidden');
      if (bulkResult) bulkResult.classList.remove('hidden');

      if (res.ok && data.success) {
        if (resultSent) resultSent.textContent = data.sent;
        if (resultFailed) resultFailed.textContent = data.failed;
        if (resultTotal) resultTotal.textContent = data.total;

        if (data.errors && data.errors.length > 0 && resultErrors) {
          resultErrors.classList.remove('hidden');
          resultErrors.innerHTML = '<strong>Errors:</strong><br>' +
            data.errors.map((e: { error?: string }) => `• ${e.error}`).join('<br>');
        } else {
          if (resultErrors) resultErrors.classList.add('hidden');
        }

        if (bulkSendLabel) bulkSendLabel.textContent = 'Sent!';
      } else {
        if (bulkSendLabel) bulkSendLabel.textContent = 'Failed';
        if (resultErrors) {
          resultErrors.classList.remove('hidden');
          resultErrors.textContent = data.error || 'Failed to send emails';
        }
      }
    } catch {
      if (bulkProgress) bulkProgress.classList.add('hidden');
      if (bulkResult) bulkResult.classList.remove('hidden');
      if (bulkSendLabel) bulkSendLabel.textContent = 'Failed';
      if (resultErrors) {
        resultErrors.classList.remove('hidden');
        resultErrors.textContent = 'Network error. Please try again.';
      }
    } finally {
      if (bulkSendBtn) bulkSendBtn.disabled = false;
      if (bulkSendSpinner) bulkSendSpinner.classList.add('hidden');
    }
  }

  if (bulkSendBtn) {
    bulkSendBtn.addEventListener('click', () => {
      if (importedAttendeeIds.length === 0) return;
      openBulkEmailDialog();
    });
  }

  if (dialogSend && eventNameInput) {
    dialogSend.addEventListener('click', () => {
      validateAndSendFromDialog();
    });
  }
}
