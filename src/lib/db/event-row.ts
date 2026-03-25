export interface EventRow {
  id: string;
  name: string;
  slug: string;
  organizationId?: string;
  micrositeUrl?: string;
  settings?: Record<string, unknown>;
  createdAt?: string;
}

/** Strip secrets before exposing `events.settings` to clients or Astro pages. */
export function sanitizeEventSettings(settings: unknown): Record<string, unknown> | undefined {
  if (settings == null) return undefined;
  let parsed: unknown = settings;
  if (typeof settings === 'string') {
    try {
      parsed = JSON.parse(settings);
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
  const out = { ...(parsed as Record<string, unknown>) };
  const eb = out.eventbrite;
  if (eb && typeof eb === 'object' && !Array.isArray(eb)) {
    const ebo = eb as Record<string, unknown>;
    if ('privateToken' in ebo) {
      const { privateToken: _t, ...rest } = ebo;
      out.eventbrite = { ...rest, credentialsSaved: true };
    }
  }
  return out;
}

export function rowToEvent(row: Record<string, unknown>): EventRow {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    organizationId: row.organization_id as string | undefined,
    micrositeUrl: row.microsite_url as string | undefined,
    settings: sanitizeEventSettings(row.settings),
    createdAt: row.created_at as string | undefined,
  };
}
