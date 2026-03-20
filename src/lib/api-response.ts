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
