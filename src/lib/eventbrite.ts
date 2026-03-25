/**
 * Minimal Eventbrite REST client (server-side only).
 * @see https://www.eventbrite.com/platform/docs/attendees
 */

const EB_API = 'https://www.eventbriteapi.com/v3';

export type EventbriteAttendeeRow = {
  id: string;
  cancelled: boolean;
  refunded: boolean;
  checked_in: boolean;
  status?: string;
  order_id?: string;
  profile?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    name?: string;
  };
};

type EbListResponse = {
  attendees?: EventbriteAttendeeRow[];
  pagination?: {
    page_number: number;
    page_count: number;
    has_more_items?: boolean;
  };
};

type EbErrorBody = {
  error?: string;
  error_description?: string;
};

export class EventbriteApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'EventbriteApiError';
  }
}

export async function fetchAllEventAttendees(
  eventbriteEventId: string,
  privateToken: string
): Promise<EventbriteAttendeeRow[]> {
  const results: EventbriteAttendeeRow[] = [];
  let page = 1;
  let pageCount = 1;

  do {
    const url = new URL(`${EB_API}/events/${encodeURIComponent(eventbriteEventId)}/attendees/`);
    url.searchParams.set('page', String(page));

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${privateToken}`,
        Accept: 'application/json',
      },
    });

    const body = (await res.json()) as EbListResponse & EbErrorBody;

    if (!res.ok) {
      const msg =
        body.error_description ||
        body.error ||
        `Eventbrite request failed (${res.status})`;
      throw new EventbriteApiError(msg, res.status);
    }

    const batch = body.attendees ?? [];
    results.push(...batch);

    const pag = body.pagination;
    pageCount = pag?.page_count ?? 1;
    page += 1;
  } while (page <= pageCount);

  return results;
}
