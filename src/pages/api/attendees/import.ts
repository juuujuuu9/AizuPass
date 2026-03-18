import type { APIRoute } from 'astro';
import {
  getEventById,
  createAttendee,
  findAttendeeByEventAndEmail,
} from '../../../lib/db';
import { getOrCreateQRPayload } from '../../../lib/qr-token';

/** Parse a single CSV line respecting quoted fields. */
function parseCSVLine(line: string): string[] {
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
      const comma = line.indexOf(',', i);
      const end = comma === -1 ? line.length : comma;
      out.push(line.slice(i, end).trim());
      i = comma === -1 ? line.length : comma + 1;
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

/** Map CSV row (array of values) to attendee fields using header indices. */
function rowToAttendeeFields(
  headers: string[],
  values: string[],
  sourceData: Record<string, unknown>
): { firstName: string; lastName: string; email: string; phone?: string; company?: string; dietaryRestrictions?: string; sourceData: Record<string, unknown> } | null {
  const get = (names: string[]): string => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i !== -1 && values[i] !== undefined) {
        return sanitizeCSVValue(String(values[i]).trim());
      }
    }
    return '';
  };
  const email = get(['email', 'e-mail', 'email_address']);
  if (!email || !email.includes('@')) return null;

  let firstName = get(['first_name', 'firstname', 'first']);
  let lastName = get(['last_name', 'lastname', 'last']);
  if ((!firstName && !lastName) || (firstName === '' && lastName === '')) {
    const name = get(['name', 'full_name', 'fullname']);
    const parts = name ? name.trim().split(/\s+/).filter(Boolean) : [];
    if (parts.length >= 2) {
      firstName = parts[0];
      lastName = parts.slice(1).join(' ');
    } else if (parts.length === 1) {
      firstName = parts[0];
      lastName = '';
    } else {
      firstName = 'Imported';
      lastName = '';
    }
  }
  if (!firstName) firstName = 'Imported';

  const phone = get(['phone', 'phone_number', 'mobile', 'tel']) || undefined;
  const company = get(['company', 'organization', 'org']) || undefined;
  const dietaryRestrictions = get(['dietary_restrictions', 'dietary', 'diet']) || undefined;

  // Store any extra columns in source_data for reference
  const extra: Record<string, string> = {};
  headers.forEach((h, i) => {
    if (values[i] !== undefined && values[i] !== '') {
      const key = h.replace(/^_+/, '');
      if (!['email', 'first_name', 'last_name', 'firstname', 'lastname', 'first', 'last', 'name', 'full_name', 'fullname', 'phone', 'phone_number', 'mobile', 'tel', 'company', 'organization', 'org', 'dietary_restrictions', 'dietary', 'diet'].includes(key)) {
        extra[key] = sanitizeCSVValue(String(values[i]).trim());
      }
    }
  });
  Object.assign(sourceData, extra);

  return {
    firstName,
    lastName,
    email,
    phone: phone || undefined,
    company: company || undefined,
    dietaryRestrictions: dietaryRestrictions || undefined,
    sourceData,
  };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const formData = await request.formData();
    const eventId = formData.get('eventId')?.toString()?.trim();
    const file = formData.get('file') as File | null;

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

    const event = await getEventById(eventId);
    if (!event) {
      return new Response(JSON.stringify({ error: 'Event not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      return new Response(JSON.stringify({ error: 'CSV must have a header row and at least one data row' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const headerLine = lines[0];
    const headers = parseCSVLine(headerLine).map(normalizeHeader);
    let imported = 0;
    let skipped = 0;
    const importedAttendeeIds: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const sourceData: Record<string, unknown> = {
        imported: true,
        importedAt: new Date().toISOString(),
      };
      const fields = rowToAttendeeFields(headers, values, sourceData);
      if (!fields) continue;

      const existing = await findAttendeeByEventAndEmail(eventId, fields.email);
      if (existing) {
        skipped += 1;
        continue;
      }

      const attendee = await createAttendee({
        eventId,
        firstName: fields.firstName,
        lastName: fields.lastName,
        email: fields.email,
        phone: fields.phone,
        company: fields.company,
        dietaryRestrictions: fields.dietaryRestrictions,
        sourceData: Object.keys(sourceData).length ? sourceData : undefined,
      });
      await getOrCreateQRPayload(attendee.id, eventId);
      importedAttendeeIds.push(attendee.id);
      imported += 1;
    }

    return new Response(
      JSON.stringify({ imported, skipped, importedAttendeeIds }),
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
