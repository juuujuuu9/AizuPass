import type { APIRoute } from 'astro';
import {
  getEventById,
  createAttendee,
  deleteAttendeesByEventId,
  findAttendeesByEventAndEmails,
  updateAttendeeProfile,
} from '../../../lib/db';
import { getOrCreateQRPayload } from '../../../lib/qr-token';
import { requireEventManage } from '../../../lib/access';

type ImportMode = 'add' | 'merge' | 'replace';
type Delimiter = ',' | ';' | '\t';

type CoreHeaderMapping = Partial<{
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
}>;

type CustomHeaderMapping = {
  sourceHeader: string;
  label: string;
};

type HeaderMappingPayload = {
  core: CoreHeaderMapping;
  custom: CustomHeaderMapping[];
};

type ImportWarning = {
  row?: number;
  type: 'delimiter' | 'encoding' | 'empty_row' | 'duplicate' | 'malformed' | 'replace' | 'size';
  message: string;
};

type ErrorRow = {
  row: number;
  reason: string;
  raw: string;
};

const DEFAULT_IMPORT_MODE: ImportMode = 'add';
const FILE_SIZE_LIMIT_BYTES = 5 * 1024 * 1024; // 5MB
const IMPORT_BATCH_SIZE = 50;

/** Parse a single CSV line respecting quoted fields and delimiter. */
function parseCSVLine(line: string, delimiter: Delimiter): string[] {
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
          } else break;
        } else {
          cell += line[i];
          i += 1;
        }
      }
      out.push(cell);
    } else {
      const delimiterIdx = line.indexOf(delimiter, i);
      const end = delimiterIdx === -1 ? line.length : delimiterIdx;
      out.push(line.slice(i, end).trim());
      i = delimiterIdx === -1 ? line.length : delimiterIdx + 1;
    }
  }
  return out;
}

/** Normalize header to lowercase and strip BOM/spaces. */
function normalizeHeader(h: string): string {
  return h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '_');
}

/** Sanitize a CSV cell value to prevent formula injection attacks.
 * Prefixes dangerous starting characters (=, +, -, @, tab, carriage return)
 * with a single quote to prevent formula execution in spreadsheet applications.
 */
function sanitizeCSVValue(value: string): string {
  if (!value) return value;
  // Check for characters that could trigger formula execution
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];
  const firstChar = value.charAt(0);
  if (dangerousChars.includes(firstChar)) {
    return `'` + value;
  }
  return value;
}

function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase();
}

function normalizeCustomLabel(label: string): string {
  return String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function parseImportMode(raw: string | null): ImportMode {
  if (raw === 'merge' || raw === 'replace' || raw === 'add') return raw;
  return DEFAULT_IMPORT_MODE;
}

function detectDelimiter(headerLine: string): { delimiter: Delimiter; warning?: string } {
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const semicolonCount = (headerLine.match(/;/g) ?? []).length;
  const tabCount = (headerLine.match(/\t/g) ?? []).length;

  const candidates: Array<{ delimiter: Delimiter; count: number }> = [
    { delimiter: ',', count: commaCount },
    { delimiter: ';', count: semicolonCount },
    { delimiter: '\t', count: tabCount },
  ];
  candidates.sort((a, b) => b.count - a.count);

  if (candidates[0].count === 0) {
    return { delimiter: ',' };
  }
  if (candidates[0].delimiter !== ',') {
    return {
      delimiter: candidates[0].delimiter,
      warning:
        candidates[0].delimiter === ';'
          ? 'Detected semicolon-delimited CSV and parsed it automatically.'
          : 'Detected tab-delimited CSV and parsed it automatically.',
    };
  }
  return { delimiter: ',' };
}

function parseHeaderMapping(raw: string | null): HeaderMappingPayload {
  const empty: HeaderMappingPayload = { core: {}, custom: [] };
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty;
    const parsedRecord = parsed as Record<string, unknown>;
    const coreRaw = parsedRecord.core;
    const core = coreRaw && typeof coreRaw === 'object'
      ? (coreRaw as CoreHeaderMapping)
      : {};
    const customRaw = parsedRecord.custom;
    const custom = Array.isArray(customRaw)
      ? customRaw
          .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const sourceHeader = String((entry as Record<string, unknown>).sourceHeader ?? '').trim();
            const label = String((entry as Record<string, unknown>).label ?? '').trim();
            if (!sourceHeader || !label) return null;
            return { sourceHeader, label };
          })
          .filter((entry): entry is CustomHeaderMapping => Boolean(entry))
      : [];
    return { core, custom };
  } catch {
    return empty;
  }
}

function resolveMappedValue(
  headers: string[],
  values: string[],
  mapping: CoreHeaderMapping,
  mappingKey: keyof CoreHeaderMapping,
  fallbackNames: string[]
): string {
  const mappedHeader = mapping[mappingKey];
  if (mappedHeader && typeof mappedHeader === 'string') {
    const normalizedMappedHeader = normalizeHeader(mappedHeader);
    const mappedIndex = headers.indexOf(normalizedMappedHeader);
    if (mappedIndex !== -1 && values[mappedIndex] !== undefined) {
      return sanitizeCSVValue(String(values[mappedIndex]).trim());
    }
  }

  for (const fallbackName of fallbackNames) {
    const index = headers.indexOf(fallbackName);
    if (index !== -1 && values[index] !== undefined) {
      return sanitizeCSVValue(String(values[index]).trim());
    }
  }
  return '';
}

/** Map CSV row (array of values) to attendee fields using header indices. */
function rowToAttendeeFields(
  headers: string[],
  values: string[],
  sourceData: Record<string, unknown>,
  coreMapping: CoreHeaderMapping,
  customMappings: CustomHeaderMapping[]
): { firstName: string; lastName: string; email: string; phone?: string; company?: string; dietaryRestrictions?: string; sourceData: Record<string, unknown> } | null {
  const get = (
    mappingKey: keyof CoreHeaderMapping,
    names: string[]
  ): string => resolveMappedValue(headers, values, coreMapping, mappingKey, names);

  const email = get('email', ['email', 'e-mail', 'email_address', 'guest_email']);
  if (!email || !email.includes('@')) return null;

  const hasFirstNameMapping = Boolean(coreMapping.first_name);
  const hasLastNameMapping = Boolean(coreMapping.last_name);
  const hasFullNameMapping = Boolean(coreMapping.full_name);
  const hasFirstLastPair = hasFirstNameMapping && hasLastNameMapping;

  if (!hasFullNameMapping && !hasFirstLastPair) {
    return null;
  }

  let firstName = hasFirstNameMapping ? get('first_name', ['first_name', 'firstname', 'first']) : '';
  let lastName = hasLastNameMapping ? get('last_name', ['last_name', 'lastname', 'last']) : '';

  if ((!firstName || !lastName) && hasFullNameMapping) {
    const name = get('full_name', ['name', 'full_name', 'fullname', 'full_name_(required)', 'guest']);
    const parts = name ? name.trim().split(/\s+/).filter(Boolean) : [];
    if (parts.length >= 2) {
      if (!firstName) firstName = parts[0];
      if (!lastName) lastName = parts.slice(1).join(' ');
    } else if (parts.length === 1) {
      if (!firstName) firstName = parts[0];
    }
  }
  if (!firstName || !lastName) return null;

  const extra: Record<string, string> = {};
  for (const customMapping of customMappings) {
    const normalizedHeader = normalizeHeader(customMapping.sourceHeader);
    const idx = headers.indexOf(normalizedHeader);
    if (idx === -1 || values[idx] === undefined) continue;
    const value = sanitizeCSVValue(String(values[idx]).trim());
    if (!value) continue;
    const normalizedLabel = normalizeCustomLabel(customMapping.label);
    if (!normalizedLabel) continue;
    extra[normalizedLabel] = value;
  }
  Object.assign(sourceData, extra);

  return {
    firstName,
    lastName,
    email,
    sourceData,
  };
}

function buildErrorRowsCSV(errorRows: ErrorRow[]): string {
  if (errorRows.length === 0) return '';
  const quote = (value: string) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const rows = ['row,reason,raw'];
  for (const row of errorRows) {
    rows.push([quote(String(row.row)), quote(row.reason), quote(row.raw)].join(','));
  }
  return rows.join('\n');
}

export const POST: APIRoute = async (context) => {
  const { request } = context;
  try {
    const formData = await request.formData();
    const eventId = formData.get('eventId')?.toString()?.trim();
    const file = formData.get('file') as File | null;
    const importMode = parseImportMode(formData.get('importMode')?.toString() ?? null);
    const confirmReplace = formData.get('confirmReplace')?.toString() === 'true';
    const mapping = parseHeaderMapping(formData.get('mapping')?.toString() ?? null);
    const coreMapping = mapping.core ?? {};
    const customMappings = mapping.custom ?? [];
    const warnings: ImportWarning[] = [];
    const errorRows: ErrorRow[] = [];

    if (!eventId) {
      return new Response(JSON.stringify({ error: 'eventId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (!file || !(file instanceof File)) {
      return new Response(JSON.stringify({ error: 'file is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (file.size > FILE_SIZE_LIMIT_BYTES) {
      return new Response(
        JSON.stringify({
          error: `File is too large. Max size is ${Math.floor(FILE_SIZE_LIMIT_BYTES / (1024 * 1024))}MB.`,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    if (importMode === 'replace' && !confirmReplace) {
      return new Response(
        JSON.stringify({ error: 'Replace mode requires explicit confirmation.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const event = await getEventById(eventId);
    if (!event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const manage = await requireEventManage(context, eventId);
    if (manage instanceof Response) return manage;

    const text = await file.text();
    if (text.includes('\uFFFD')) {
      warnings.push({
        type: 'encoding',
        message:
          'Some characters look mis-decoded. Save the CSV as UTF-8 to avoid encoding issues (for example, from Excel: CSV UTF-8).',
      });
    }

    const allLines = text.split(/\r?\n/);
    const nonEmptyLineIndices = allLines
      .map((line, idx) => ({ line, idx }))
      .filter(({ line }) => line.trim().length > 0);
    if (nonEmptyLineIndices.length < 2) {
      return new Response(JSON.stringify({ error: 'CSV must have a header row and at least one data row' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const headerLine = nonEmptyLineIndices[0].line;
    const delimiterResult = detectDelimiter(headerLine);
    const delimiter = delimiterResult.delimiter;
    if (delimiterResult.warning) {
      warnings.push({ type: 'delimiter', message: delimiterResult.warning });
    }
    const headers = parseCSVLine(headerLine, delimiter).map(normalizeHeader);
    if (!headers.length) {
      return new Response(
        JSON.stringify({ error: 'Could not parse CSV headers. Please check the delimiter and file format.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const mappedEmailHeader = coreMapping.email ? normalizeHeader(coreMapping.email) : '';
    if (mappedEmailHeader && !headers.includes(mappedEmailHeader)) {
      return new Response(
        JSON.stringify({ error: 'Mapped email column was not found in the uploaded CSV headers.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    if (!mappedEmailHeader) {
      return new Response(
        JSON.stringify({ error: 'Email mapping is required.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const mappedFirstHeader = coreMapping.first_name ? normalizeHeader(coreMapping.first_name) : '';
    const mappedLastHeader = coreMapping.last_name ? normalizeHeader(coreMapping.last_name) : '';
    const mappedFullNameHeader = coreMapping.full_name ? normalizeHeader(coreMapping.full_name) : '';
    const hasFirstLastPair = Boolean(mappedFirstHeader && mappedLastHeader);
    const hasFullNameFallback = Boolean(mappedFullNameHeader);
    if (!hasFirstLastPair && !hasFullNameFallback) {
      return new Response(
        JSON.stringify({
          error: 'Map both first name and last name, or map full name fallback.',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    if (mappedFirstHeader && !headers.includes(mappedFirstHeader)) {
      return new Response(
        JSON.stringify({ error: 'Mapped first-name column was not found in the uploaded CSV headers.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    if (mappedLastHeader && !headers.includes(mappedLastHeader)) {
      return new Response(
        JSON.stringify({ error: 'Mapped last-name column was not found in the uploaded CSV headers.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
    if (mappedFullNameHeader && !headers.includes(mappedFullNameHeader)) {
      return new Response(
        JSON.stringify({ error: 'Mapped full-name fallback column was not found in the uploaded CSV headers.' }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const seenCustomHeaders = new Set<string>();
    const seenCustomLabels = new Set<string>();
    for (const customMapping of customMappings) {
      const normalizedHeader = normalizeHeader(customMapping.sourceHeader);
      if (!headers.includes(normalizedHeader)) {
        return new Response(
          JSON.stringify({ error: `Mapped custom header "${customMapping.sourceHeader}" was not found.` }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      if (!normalizeCustomLabel(customMapping.label)) {
        return new Response(
          JSON.stringify({ error: 'Custom mapped column labels must include at least one letter or number.' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      const normalizedLabel = normalizeCustomLabel(customMapping.label);
      if (seenCustomHeaders.has(normalizedHeader)) {
        return new Response(
          JSON.stringify({ error: `Custom header "${customMapping.sourceHeader}" is mapped more than once.` }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      if (seenCustomLabels.has(normalizedLabel)) {
        return new Response(
          JSON.stringify({ error: `Custom label "${customMapping.label}" is used more than once.` }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      seenCustomHeaders.add(normalizedHeader);
      seenCustomLabels.add(normalizedLabel);
    }

    const dataRows = nonEmptyLineIndices.slice(1).map(({ line, idx }) => ({
      line,
      rowNumber: idx + 1,
    }));
    let imported = 0;
    let updated = 0;
    let deleted = 0;
    let skippedDuplicates = 0;
    let skippedEmptyRows = 0;
    let skippedMalformedRows = 0;
    const importedAttendeeIds: string[] = [];
    const seenEmails = new Set<string>();
    const validRows: Array<{
      rowNumber: number;
      fields: NonNullable<ReturnType<typeof rowToAttendeeFields>>;
      raw: string;
      normalizedEmail: string;
    }> = [];

    for (const { line, rowNumber } of dataRows) {
      const values = parseCSVLine(line, delimiter);
      if (values.every((value) => String(value ?? '').trim() === '')) {
        skippedEmptyRows += 1;
        warnings.push({ row: rowNumber, type: 'empty_row', message: `Row ${rowNumber} is empty and was skipped.` });
        continue;
      }
      const sourceData: Record<string, unknown> = {
        imported: true,
        importedAt: new Date().toISOString(),
        importMode,
      };
      const fields = rowToAttendeeFields(headers, values, sourceData, coreMapping, customMappings);
      if (!fields) {
        skippedMalformedRows += 1;
        warnings.push({
          row: rowNumber,
          type: 'malformed',
          message: `Row ${rowNumber} is missing required identity fields (email + names) and was skipped.`,
        });
        errorRows.push({ row: rowNumber, reason: 'Missing required identity fields', raw: line });
        continue;
      }

      const normalizedEmail = normalizeEmail(fields.email);
      if (seenEmails.has(normalizedEmail)) {
        skippedDuplicates += 1;
        warnings.push({
          row: rowNumber,
          type: 'duplicate',
          message: `Row ${rowNumber} is a duplicate email within this file and was skipped.`,
        });
        errorRows.push({ row: rowNumber, reason: 'Duplicate email in file', raw: line });
        continue;
      }
      seenEmails.add(normalizedEmail);
      validRows.push({ rowNumber, fields, raw: line, normalizedEmail });
    }

    if (validRows.length === 0) {
      const skipped = skippedDuplicates + skippedEmptyRows + skippedMalformedRows;
      return new Response(
        JSON.stringify({
          importMode,
          imported,
          updated,
          deleted,
          skipped,
          skippedDuplicates,
          skippedEmptyRows,
          skippedMalformedRows,
          warnings,
          errorRows,
          errorRowsCsv: buildErrorRowsCSV(errorRows),
          newlyImportedAttendeeIds: importedAttendeeIds,
          importedAttendeeIds,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (importMode === 'replace') {
      deleted = await deleteAttendeesByEventId(eventId);
      warnings.push({
        type: 'replace',
        message: `Replace mode removed ${deleted} existing attendee(s) before import.`,
      });
    }

    const existingByEmail = new Map<string, { id: string }>();
    if (importMode !== 'replace') {
      const existingRows = await findAttendeesByEventAndEmails(
        eventId,
        validRows.map((row) => row.fields.email)
      );
      for (const row of existingRows) {
        existingByEmail.set(normalizeEmail(row.email), { id: row.id });
      }
    }

    for (let start = 0; start < validRows.length; start += IMPORT_BATCH_SIZE) {
      const batch = validRows.slice(start, start + IMPORT_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (row) => {
          const existing = existingByEmail.get(row.normalizedEmail);
          if (existing && importMode === 'add') {
            skippedDuplicates += 1;
            warnings.push({
              row: row.rowNumber,
              type: 'duplicate',
              message: `Row ${row.rowNumber} already exists for this event and was skipped.`,
            });
            errorRows.push({ row: row.rowNumber, reason: 'Duplicate email in event', raw: row.raw });
            return;
          }

          if (existing && importMode === 'merge') {
            await updateAttendeeProfile(existing.id, {
              firstName: row.fields.firstName,
              lastName: row.fields.lastName,
              email: row.fields.email,
              phone: row.fields.phone,
              company: row.fields.company,
              dietaryRestrictions: row.fields.dietaryRestrictions,
              sourceData: Object.keys(row.fields.sourceData).length ? row.fields.sourceData : undefined,
            });
            updated += 1;
            return;
          }

          const attendee = await createAttendee({
            eventId,
            firstName: row.fields.firstName,
            lastName: row.fields.lastName,
            email: row.fields.email,
            phone: row.fields.phone,
            company: row.fields.company,
            dietaryRestrictions: row.fields.dietaryRestrictions,
            sourceData: Object.keys(row.fields.sourceData).length ? row.fields.sourceData : undefined,
          });
          await getOrCreateQRPayload(attendee.id, eventId);
          importedAttendeeIds.push(attendee.id);
          imported += 1;
        })
      );
      void batchResults;
    }

    const skipped = skippedDuplicates + skippedEmptyRows + skippedMalformedRows;
    if (validRows.length >= 500) {
      warnings.push({
        type: 'size',
        message: `Processed ${validRows.length} rows in server batches of ${IMPORT_BATCH_SIZE}.`,
      });
    }

    return new Response(
      JSON.stringify({
        importMode,
        delimiter: delimiter === '\t' ? 'tab' : delimiter,
        imported,
        updated,
        deleted,
        skipped,
        skippedDuplicates,
        skippedEmptyRows,
        skippedMalformedRows,
        warnings,
        errorRows,
        errorRowsCsv: buildErrorRowsCSV(errorRows),
        newlyImportedAttendeeIds: importedAttendeeIds,
        importedAttendeeIds,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[import]', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Import failed' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
