import type { APIRoute } from 'astro';
import { csvResponse, errorResponse } from '../../../lib/api-response';
import { getAllAttendeesForUser } from '../../../lib/db';
import { requireEventAccess, requireUserId } from '../../../lib/access';

/**
 * Sanitizes CSV values to prevent formula injection.
 * Prefixes dangerous starting characters (=, +, -, @, tab, carriage return)
 * with a single quote to prevent formula execution in spreadsheet applications.
 * HI-4: Applied to CSV export to match import sanitization.
 */
function sanitizeCSVValue(value: string): string {
  if (!value) return value;
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];
  const firstChar = value.charAt(0);
  if (dangerousChars.includes(firstChar)) {
    return `'` + value;
  }
  return value;
}

function escapeCsvField(val: string | number | null | undefined): string {
  if (val == null) return '""';
  const s = String(val);
  // HI-4: Apply formula injection sanitization before quote escaping
  const sanitized = sanitizeCSVValue(s);
  return `"${sanitized.replace(/"/g, '""')}"`;
}

export const GET: APIRoute = async (context) => {
  const userId = requireUserId(context);
  if (userId instanceof Response) return userId;
  const { request } = context;
  const url = new URL(request.url);
  const eventId = url.searchParams.get('eventId')?.trim();

  if (!eventId) {
    return errorResponse('eventId is required');
  }
  const access = await requireEventAccess(context, eventId);
  if (access instanceof Response) return access;

  const attendees = await getAllAttendeesForUser(userId, eventId);
  const headers = [
    'First Name',
    'Last Name',
    'Email',
    'Phone',
    'Company',
    'Dietary Restrictions',
    'Checked In',
    'Check-in Time',
    'Registration Date',
  ];
  const rows = attendees.map((a) =>
    [
      a.firstName,
      a.lastName,
      a.email,
      a.phone ?? '',
      a.company ?? '',
      a.dietaryRestrictions ?? '',
      a.checkedIn ? 'Yes' : 'No',
      a.checkedInAt ? new Date(a.checkedInAt).toLocaleString() : '',
      new Date(a.rsvpAt).toLocaleDateString(),
    ]
      .map(escapeCsvField)
      .join(',')
  );
  const csv = [headers.map(escapeCsvField).join(','), ...rows].join('\n');
  const filename = `event-attendees-${new Date().toISOString().split('T')[0]}.csv`;

  return csvResponse(csv, filename);
};
