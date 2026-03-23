const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export function json(data: unknown, status = 200, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: headers ? { ...JSON_HEADERS, ...headers } : JSON_HEADERS,
  });
}

export function errorResponse(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/** CSV download — not JSON; keeps attachment headers in one place. */
export function csvResponse(body: string, filename: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
