import type { APIRoute } from 'astro';
import { errorResponse } from '../../../lib/api-response';
import { getAllAttendeesForUser } from '../../../lib/db';
import { requireEventAccess, requireUserId } from '../../../lib/access';

function escapeCsvField(val: string | number | null | undefined): string {
  if (val == null) return '""';
  const s = String(val);
  return `"${s.replace(/"/g, '""')}"`;
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

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
