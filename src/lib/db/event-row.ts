export interface EventRow {
  id: string;
  name: string;
  slug: string;
  organizationId?: string;
  micrositeUrl?: string;
  settings?: Record<string, unknown>;
  createdAt?: string;
}

export function rowToEvent(row: Record<string, unknown>): EventRow {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    organizationId: row.organization_id as string | undefined,
    micrositeUrl: row.microsite_url as string | undefined,
    settings: row.settings as Record<string, unknown> | undefined,
    createdAt: row.created_at as string | undefined,
  };
}
