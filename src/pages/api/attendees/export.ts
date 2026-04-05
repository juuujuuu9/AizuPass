import type { APIRoute } from 'astro';
import { csvResponse, errorResponse } from '../../../lib/api-response';
import { fetchAllAttendeesForUser } from '../../../lib/db';
import { requireEventAccess, requireUserId } from '../../../lib/access';
import { formatLocalDate, formatLocalDateTime } from '../../../lib/formatters';

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
  // LO-2: Add try-catch for robust error handling
  try {
    const userId = requireUserId(context);
    if (userId instanceof Response) return userId;
    const { request } = context;
    const url = new URL(request.url);
    const eventId = url.searchParams.get('eventId')?.trim();
    const filterRaw = url.searchParams.get('filter')?.trim().toLowerCase() ?? '';

    if (!eventId) {
      return errorResponse('eventId is required');
    }
    const access = await requireEventAccess(context, eventId);
    if (access instanceof Response) return access;

    const attendees = await fetchAllAttendeesForUser(userId, eventId);
    let rows = attendees;
    if (filterRaw === 'noshows' || filterRaw === 'no-shows') {
      rows = attendees.filter((a) => !a.checkedIn);
    } else if (filterRaw === 'checkedin' || filterRaw === 'checked-in') {
      rows = attendees.filter((a) => a.checkedIn);
    } else if (filterRaw && filterRaw !== 'all') {
      return errorResponse('filter must be all, noShows, or checkedIn');
    }
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
    const csvRows = rows.map((a) =>
      [
        a.firstName,
        a.lastName,
        a.email,
        a.phone ?? '',
        a.company ?? '',
        a.dietaryRestrictions ?? '',
        a.checkedIn ? 'Yes' : 'No',
        a.checkedInAt ? formatLocalDateTime(a.checkedInAt) : '',
        formatLocalDate(a.rsvpAt),
      ]
        .map(escapeCsvField)
        .join(',')
    );
    const csv = [headers.map(escapeCsvField).join(','), ...csvRows].join('\n');
    const day = new Date().toISOString().split('T')[0];
    const suffix =
      filterRaw === 'noshows' || filterRaw === 'no-shows'
        ? '-no-shows'
        : filterRaw === 'checkedin' || filterRaw === 'checked-in'
          ? '-checked-in'
          : '';
    const filename = `event-attendees${suffix}-${day}.csv`;

    return csvResponse(csv, filename);
  } catch (err) {
    console.error('GET /api/attendees/export', err);
    return errorResponse('Failed to export attendees', 500);
  }
};
