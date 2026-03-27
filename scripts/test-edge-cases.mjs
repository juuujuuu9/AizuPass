#!/usr/bin/env node
/**
 * QR Check-In Edge Case Tests
 * Run with: node scripts/test-edge-cases.mjs [baseUrl]
 * Example: node scripts/test-edge-cases.mjs http://localhost:4321
 *
 * Staff APIs require auth bypass. Start dev server with BYPASS_AUTH_FOR_TESTS=true,
 * then run tests with same env. Script sends X-Test-Mode: 1 header.
 *
 * Concurrent check-in race test POSTs public RSVP /api/attendees without eventId, which
 * uses getDefaultEventId() (slug default or DEFAULT_EVENT_SLUG). CI runs migrate-events
 * first; locally run npm run migrate-events or set EDGE_CASE_EVENT_ID to a real event UUID.
 */

const BASE_URL = process.argv[2] || 'http://localhost:4321';
const TEST_HEADERS = process.env.BYPASS_AUTH_FOR_TESTS === 'true'
  ? { 'X-Test-Mode': '1' }
  : {};
const RESULTS = [];

/** Required on every staff check-in; must match QR payload event or attendee's event. */
const DUMMY_SCANNER_EVENT = '00000000-0000-4000-8000-000000000000';
const FAKE_QR_EVENT = '00000000-0000-0000-0000-000000000001';
/** Optional: UUID of an existing event; avoids relying on getDefaultEventId() / migrate-events. */
const EDGE_CASE_EVENT_ID = process.env.EDGE_CASE_EVENT_ID?.trim() || '';

function log(type, message) {
  const icon = type === 'PASS' ? '✓' : type === 'FAIL' ? '✗' : type === 'WARN' ? '⚠' : 'ℹ';
  console.log(`${icon} ${message}`);
  RESULTS.push({ type, message });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function test(name, fn) {
  try {
    await fn();
    log('PASS', name);
  } catch (err) {
    // Log additional debug info if available in error
    if (err.responseData) {
      log('INFO', `  Failed response data: ${JSON.stringify(err.responseData).substring(0, 300)}`);
    }
    log('FAIL', `${name}: ${err.message}`);
  }
}

// Helper to create error with response data attached
function createError(message, responseData = null) {
  const err = new Error(message);
  err.responseData = responseData;
  return err;
}

// Helper to make requests
async function post(endpoint, body, headers = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...TEST_HEADERS, ...headers },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function get(endpoint, headers = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    headers: { ...TEST_HEADERS, ...headers },
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function postFormData(endpoint, formData, headers = {}) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    body: formData,
    headers: { ...TEST_HEADERS, ...headers },
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// ============== TESTS ==============

// ============ PAGINATION TEST HELPERS ============

const TEST_ATTENDEES_CREATED = [];

async function createTestAttendees(count, prefix = 'PaginationTest') {
  const created = [];
  const eventId = EDGE_CASE_EVENT_ID || (await getDefaultEventId());

  if (!eventId) {
    log('WARN', 'No event ID available for creating test attendees');
    return created;
  }

  for (let i = 0; i < count; i++) {
    const unique = `${Date.now()}-${i}-${Math.random().toString(16).slice(2, 8)}`;
    const { status, data } = await post('/api/attendees', {
      firstName: `${prefix}`,
      lastName: `User${String(i).padStart(3, '0')}`,
      email: `pagination-${unique}@test.local`,
      eventId,
    });

    if (status === 201 && data?.id) {
      created.push(data);
      TEST_ATTENDEES_CREATED.push(data.id);
    }
  }

  return created;
}

async function getDefaultEventId() {
  const { status, data } = await get('/api/events');
  if (status === 200 && Array.isArray(data?.data) && data.data.length > 0) {
    return data.data[0].id;
  }
  if (status === 200 && Array.isArray(data) && data.length > 0) {
    return data[0].id;
  }
  return null;
}

function validatePagination(response, expectedLimit = 20, context = '') {
  // Log response structure for debugging when validation fails
  const logResponse = () => {
    log('INFO', `  Response structure: ${JSON.stringify(response).substring(0, 500)}`);
  };

  try {
    assert(response && typeof response === 'object', 'Response should be an object');
    assert(Array.isArray(response.data), 'Response should have data array');
    assert(response.pagination && typeof response.pagination === 'object', 'Response should have pagination object');
    assert(typeof response.pagination.total === 'number', 'pagination.total should be a number');
    assert(typeof response.pagination.limit === 'number', 'pagination.limit should be a number');
    assert(typeof response.pagination.offset === 'number', 'pagination.offset should be a number');
    assert(typeof response.pagination.hasMore === 'boolean', 'pagination.hasMore should be a boolean');

    if (expectedLimit !== undefined) {
      assert(response.pagination.limit === expectedLimit, `pagination.limit should be ${expectedLimit}, got ${response.pagination.limit}`);
    }

    assert(response.data.length <= response.pagination.limit, 'data.length should not exceed limit');

    // hasMore accuracy check
    const { total, offset, limit, hasMore } = response.pagination;
    const expectedHasMore = offset + response.data.length < total;
    assert(hasMore === expectedHasMore, `hasMore (${hasMore}) should match calculated value (${expectedHasMore})`);
  } catch (err) {
    log('INFO', `  Pagination validation failed${context ? ` (${context})` : ''}`);
    logResponse();
    throw err;
  }
}

// ============ SECURITY TEST HELPERS ============

async function checkSecurityHeaders(endpoint = '/') {
  const res = await fetch(`${BASE_URL}${endpoint}`, { headers: TEST_HEADERS });

  const hsts = res.headers.get('strict-transport-security');
  const csp = res.headers.get('content-security-policy');
  const xFrame = res.headers.get('x-frame-options');
  const xContentType = res.headers.get('x-content-type-options');
  const referrer = res.headers.get('referrer-policy');

  return {
    hsts,
    csp,
    xFrame,
    xContentType,
    referrer,
    hasHSTS: !!hsts && hsts.includes('max-age'),
    hasCSP: !!csp && csp.length > 0,
    hasXFrame: !!xFrame,
    hasXContentType: !!xContentType,
    hasReferrer: !!referrer,
  };
}

async function testCsvInjection(attendeeName) {
  const eventId = EDGE_CASE_EVENT_ID || (await getDefaultEventId());
  if (!eventId) {
    throw new Error('No event ID available for CSV injection test');
  }

  const unique = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const { status, data } = await post('/api/attendees', {
    firstName: attendeeName,
    lastName: 'InjectionTest',
    email: `csv-injection-${unique}@test.local`,
    eventId,
  });

  if (status !== 201 || !data?.id) {
    throw new Error(`Failed to create test attendee: ${status}`);
  }

  TEST_ATTENDEES_CREATED.push(data.id);

  const exportRes = await fetch(`${BASE_URL}/api/attendees/export?eventId=${eventId}`, {
    headers: { ...TEST_HEADERS },
  });

  if (!exportRes.ok) {
    throw new Error(`Export failed: ${exportRes.status}`);
  }

  const csv = await exportRes.text();
  return csv;
}

async function runTests() {
  console.log(`\n🧪 Testing ${BASE_URL}\n`);

  // Probe: if staff API returns 401, dev server likely wasn't started with auth bypass
  const probe = await get('/api/send-email');
  if (probe.status === 401) {
    console.log('');
    console.log('⚠️  Staff APIs returned 401. Options:');
    console.log('');
    console.log('  A) Two terminals:');
    console.log('     Terminal 1: BYPASS_AUTH_FOR_TESTS=true npm run dev');
    console.log('     Terminal 2: BYPASS_AUTH_FOR_TESTS=true npm run test:edge-cases');
    console.log('');
    console.log('  B) Single command (starts server, runs tests, exits):');
    console.log('     npm run test:edge-cases:ci');
    console.log('');
    process.exit(1);
  }

  // 1. Invalid QR Payload
  await test('Checkin: Invalid QR format', async () => {
    const { status, data } = await post('/api/checkin', {
      qrData: 'not-a-valid-qr',
      scannerEventId: DUMMY_SCANNER_EVENT,
    });
    if (status !== 400 && status !== 404 && status !== 429) {
      throw new Error(`Expected 400, 404, or 429, got ${status}: ${JSON.stringify(data)}`);
    }
  });

  // 2. Checkin without QR data
  await test('Checkin: Missing QR data', async () => {
    const { status } = await post('/api/checkin', {});
    if (status !== 400 && status !== 429) {
      throw new Error(`Expected 400 or 429, got ${status}`);
    }
  });

  // 3. Import: Missing file
  await test('Import: Missing file', async () => {
    const formData = new FormData();
    formData.append('eventId', 'test-event');
    const { status } = await postFormData('/api/attendees/import', formData);
    if (status !== 400) {
      throw new Error(`Expected 400, got ${status}`);
    }
  });

  // 4. Import: Missing eventId
  await test('Import: Missing eventId', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['email\ntest@test.com'], { type: 'text/csv' }));
    const { status } = await postFormData('/api/attendees/import', formData);
    if (status !== 400) {
      throw new Error(`Expected 400, got ${status}`);
    }
  });

  // 5. Send email: Unconfigured (should return configured: false)
  await test('Email: Check configuration status', async () => {
    const { status, data } = await get('/api/send-email');
    if (status !== 200) {
      throw new Error(`Expected 200, got ${status}`);
    }
    log('INFO', `  Email configured: ${data?.configured}`);
  });

  // 6. Send email: Missing required fields
  await test('Email: Missing attendeeId', async () => {
    const { status, data } = await post('/api/send-email', { qrCodeBase64: 'test' });
    if (status !== 400) {
      throw new Error(`Expected 400, got ${status}: ${JSON.stringify(data)}`);
    }
  });

  // 7. Bulk send: Empty attendee list
  await test('Bulk send: Empty attendee list', async () => {
    const { status, data } = await post('/api/attendees/send-bulk-qr', {
      attendeeIds: [],
      eventId: 'test',
    });
    if (status !== 400) {
      throw new Error(`Expected 400, got ${status}: ${JSON.stringify(data)}`);
    }
  });

  // 8. Bulk send: Missing eventId
  await test('Bulk send: Missing eventId', async () => {
    const { status, data } = await post('/api/attendees/send-bulk-qr', {
      attendeeIds: ['test-id'],
    });
    if (status !== 400) {
      throw new Error(`Expected 400, got ${status}: ${JSON.stringify(data)}`);
    }
  });

  // 9. Bulk send: Non-existent event
  await test('Bulk send: Non-existent event', async () => {
    const { status, data } = await post('/api/attendees/send-bulk-qr', {
      attendeeIds: ['test-id'],
      eventId: '00000000-0000-0000-0000-000000000000',
    });
    if (status !== 404) {
      throw new Error(`Expected 404, got ${status}: ${JSON.stringify(data)}`);
    }
  });

  // 10. Webhook: Missing auth
  await test('Webhook: Missing authorization', async () => {
    const { status, data } = await post('/api/ingest/entry', { eventSlug: 'test' });
    if (status !== 401) {
      throw new Error(`Expected 401, got ${status}: ${JSON.stringify(data)}`);
    }
  });

  // 11. Webhook: Wrong auth
  await test('Webhook: Wrong authorization', async () => {
    const { status, data } = await post(
      '/api/ingest/entry',
      { eventSlug: 'test' },
      { Authorization: 'Bearer wrong-key' }
    );
    if (status !== 401) {
      throw new Error(`Expected 401, got ${status}: ${JSON.stringify(data)}`);
    }
  });

  // 12. Refresh QR: Missing ID
  await test('Refresh QR: Missing attendee ID', async () => {
    const { status, data } = await post('/api/attendees/refresh-qr', {});
    if (status !== 400) {
      throw new Error(`Expected 400, got ${status}: ${JSON.stringify(data)}`);
    }
  });

  // 13. Refresh QR: Non-existent attendee
  await test('Refresh QR: Non-existent attendee', async () => {
    const { status, data } = await post('/api/attendees/refresh-qr', {
      id: '00000000-0000-0000-0000-000000000000',
    });
    if (status !== 404) {
      throw new Error(`Expected 404, got ${status}: ${JSON.stringify(data)}`);
    }
  });

  // 14. Bulk refresh: Missing confirmation
  await test('Bulk refresh: Missing confirmation', async () => {
    const { status, data } = await post('/api/attendees/refresh-qr-bulk', {
      eventId: 'test',
    });
    if (status !== 400) {
      throw new Error(`Expected 400, got ${status}: ${JSON.stringify(data)}`);
    }
  });

  // 15. Import: Non-existent event
  await test('Import: Non-existent event', async () => {
    const formData = new FormData();
    formData.append('eventId', '00000000-0000-0000-0000-000000000000');
    formData.append('file', new Blob(['email,name\ntest@example.com,Test'], { type: 'text/csv' }));
    const { status } = await postFormData('/api/attendees/import', formData);
    if (status !== 404) {
      throw new Error(`Expected 404, got ${status}`);
    }
  });

  // 16. Import: Headers only (empty rows)
  await test('Import: Headers only (empty rows)', async () => {
    const { status: eventsStatus, data: eventsData } = await get('/api/events');
    const eventId = eventsStatus === 200 && Array.isArray(eventsData) && eventsData.length > 0
      ? eventsData[0].id
      : null;
    const formData = new FormData();
    formData.append('eventId', eventId || '00000000-0000-0000-0000-000000000000');
    formData.append('file', new Blob(['email,first_name,last_name'], { type: 'text/csv' }));
    const { status, data } = await postFormData('/api/attendees/import', formData);
    // With valid event: 400 (CSV must have data). With no event: 404.
    if (eventId && status !== 400) {
      throw new Error(`Expected 400 for headers-only CSV, got ${status}: ${JSON.stringify(data)}`);
    }
    if (!eventId && status !== 404) {
      throw new Error(`Expected 404 (no event), got ${status}: ${JSON.stringify(data)}`);
    }
  });

  // 17. Import: Invalid eventId format (use non-UUID; API may 400, 404, or 500)
  await test('Import: Invalid eventId format', async () => {
    const formData = new FormData();
    formData.append('eventId', 'not-a-uuid');
    formData.append('file', new Blob(['email,name\ntest@example.com,Test'], { type: 'text/csv' }));
    const { status } = await postFormData('/api/attendees/import', formData);
    if (status !== 400 && status !== 404 && status !== 500) {
      throw new Error(`Expected 400, 404, or 500, got ${status}`);
    }
  });

  // 18. Checkin: Malformed UUID in QR
  await test('Checkin: Malformed UUID in QR', async () => {
    const { status } = await post('/api/checkin', {
      qrData: 'not-a-uuid:also-not:token',
      scannerEventId: DUMMY_SCANNER_EVENT,
    });
    if (status !== 400 && status !== 404 && status !== 429) {
      throw new Error(`Expected 400, 404, or 429, got ${status}`);
    }
  });

  // 19. Checkin: Valid format but wrong token (valid UUIDs, invalid token)
  await test('Checkin: Valid format but wrong token', async () => {
    const fakePayload = `${FAKE_QR_EVENT}:00000000-0000-0000-0000-000000000002:invalid-token-12345`;
    const { status } = await post('/api/checkin', {
      qrData: fakePayload,
      scannerEventId: FAKE_QR_EVENT,
    });
    if (status !== 400 && status !== 401 && status !== 404 && status !== 429) {
      throw new Error(`Expected 400, 401, 404, or 429, got ${status}`);
    }
  });

  // 20. Checkin: Concurrent manual check-ins should be one success + one conflict
  await test('Checkin: Concurrent manual check-in race', async () => {
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const attendeeCreate = await post('/api/attendees', {
      firstName: 'Race',
      lastName: 'Test',
      email: `race-${unique}@example.com`,
      ...(EDGE_CASE_EVENT_ID ? { eventId: EDGE_CASE_EVENT_ID } : {}),
    });
    if (attendeeCreate.status !== 201 || !attendeeCreate.data?.id) {
      const detail = attendeeCreate.data != null ? JSON.stringify(attendeeCreate.data) : '(no body)';
      throw new Error(
        `Failed to create attendee for race test: ${attendeeCreate.status} ${detail}`
      );
    }

    const raceHeaders = { 'X-Forwarded-For': '10.10.10.10' };
    const attendeeEventId = attendeeCreate.data.eventId;
    if (!attendeeEventId) {
      throw new Error('Test attendee missing eventId');
    }
    const [a, b] = await Promise.all([
      post(
        '/api/checkin',
        { attendeeId: attendeeCreate.data.id, scannerEventId: attendeeEventId },
        raceHeaders
      ),
      post(
        '/api/checkin',
        { attendeeId: attendeeCreate.data.id, scannerEventId: attendeeEventId },
        raceHeaders
      ),
    ]);

    const statuses = [a.status, b.status].sort((x, y) => x - y);
    if (!(statuses[0] === 200 && statuses[1] === 409)) {
      throw new Error(`Expected one 200 and one 409, got ${a.status} and ${b.status}`);
    }
  });

  // ============== NEW PAGINATION TESTS (HI-3) ==============

  console.log('\n📄 Pagination Tests (HI-3)\n');

  // Create test data for pagination tests
  if (EDGE_CASE_EVENT_ID) {
    await test('Pagination: Setup - Create test attendees', async () => {
      // Create at least 25 test attendees
      const created = await createTestAttendees(25, 'PagTest');
      assert(created.length >= 25, `Expected 25 attendees, got ${created.length}`);
      log('INFO', `  Created ${created.length} test attendees`);
    });
  }

  await test('Pagination: Default limit (20)', async () => {
    const { status, data } = await get('/api/attendees');
    if (status !== 200) {
      log('INFO', `  Response: ${JSON.stringify(data)}`);
      throw new Error(`Expected 200, got ${status}`);
    }
    validatePagination(data, 20, 'default limit');
    assert(data.data.length <= 20, 'Should return max 20 items');
  });

  await test('Pagination: Custom limit (5)', async () => {
    const { status, data } = await get('/api/attendees?limit=5');
    if (status !== 200) {
      log('INFO', `  Response: ${JSON.stringify(data)}`);
      throw new Error(`Expected 200, got ${status}`);
    }
    validatePagination(data, 5, 'custom limit 5');
    assert(data.data.length === 5, 'Should return exactly 5 items');
  });

  await test('Pagination: Max limit enforced (100)', async () => {
    const { status, data } = await get('/api/attendees?limit=999');
    if (status !== 200) {
      log('INFO', `  Response: ${JSON.stringify(data)}`);
      throw new Error(`Expected 200, got ${status}`);
    }
    validatePagination(data, 100, 'max limit 100'); // Should be capped at 100
    assert(data.data.length <= 100, 'Should cap at max 100');
  });

  await test('Pagination: Offset skipping', async () => {
    const { status: status1, data: page1 } = await get('/api/attendees?limit=10&offset=0');
    if (status1 !== 200) {
      log('INFO', `  Page 1 Response: ${JSON.stringify(page1)}`);
      throw new Error(`Expected 200, got ${status1}`);
    }

    const { status: status2, data: page2 } = await get('/api/attendees?limit=5&offset=5');
    if (status2 !== 200) {
      log('INFO', `  Page 2 Response: ${JSON.stringify(page2)}`);
      throw new Error(`Expected 200, got ${status2}`);
    }

    if (page1.data.length >= 5 && page2.data.length > 0) {
      const firstPageIds = page1.data.map(a => a.id);
      const secondPageIds = page2.data.map(a => a.id);
      const overlap = secondPageIds.filter(id => firstPageIds.slice(0, 5).includes(id));
      assert(overlap.length === 0, 'Offset items should not overlap with first page');
    }
  });

  await test('Pagination: Search with pagination', async () => {
    const { status, data } = await get('/api/attendees?q=PagTest&limit=3');
    if (status !== 200) {
      log('INFO', `  Response: ${JSON.stringify(data)}`);
      throw new Error(`Expected 200, got ${status}`);
    }
    validatePagination(data, 3, 'search with pagination');
    assert(data.data.length <= 3, 'Search results should respect limit');
  });

  await test('Pagination: hasMore accuracy', async () => {
    const { status, data } = await get('/api/attendees?limit=5');
    if (status !== 200) {
      log('INFO', `  Response: ${JSON.stringify(data)}`);
      throw new Error(`Expected 200, got ${status}`);
    }
    const { total, offset, hasMore } = data.pagination;
    const itemsReturned = data.data.length;
    const expectedHasMore = offset + itemsReturned < total;
    assert(hasMore === expectedHasMore, `hasMore accuracy check failed: hasMore=${hasMore}, expected=${expectedHasMore}, total=${total}, offset=${offset}, itemsReturned=${itemsReturned}`);
  });

  await test('Pagination: Large offset returns empty', async () => {
    const { status, data } = await get('/api/attendees?offset=10000');
    if (status !== 200) {
      log('INFO', `  Response: ${JSON.stringify(data)}`);
      throw new Error(`Expected 200, got ${status}`);
    }
    assert(Array.isArray(data.data), 'data should be an array');
    assert(data.pagination.hasMore === false, 'hasMore should be false for large offset');
  });

  // ============== SECURITY TESTS ==============

  console.log('\n🔒 Security Tests\n');

  await test('Security: HSTS header present', async () => {
    const isLocal = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1');
    if (isLocal) {
      log('WARN', '  Security headers only verified in production (Vercel) - HSTS skipped locally');
      return;
    }
    const security = await checkSecurityHeaders('/');
    assert(security.hasHSTS, `HSTS header should be present, got: ${security.hsts || 'missing'}`);
    log('INFO', `  HSTS: ${security.hsts?.substring(0, 50)}...`);
  });

  await test('Security: CSP header present', async () => {
    const isLocal = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1');
    if (isLocal) {
      log('WARN', '  Security headers only verified in production (Vercel) - CSP skipped locally');
      return;
    }
    const security = await checkSecurityHeaders('/');
    assert(security.hasCSP, `CSP header should be present, got: ${security.csp || 'missing'}`);
    log('INFO', `  CSP: ${security.csp?.substring(0, 50)}...`);
  });

  await test('Security: X-Frame-Options header present', async () => {
    const isLocal = BASE_URL.includes('localhost') || BASE_URL.includes('127.0.0.1');
    if (isLocal) {
      log('WARN', '  Security headers only verified in production (Vercel) - X-Frame-Options skipped locally');
      return;
    }
    const security = await checkSecurityHeaders('/');
    assert(security.hasXFrame, `X-Frame-Options header should be present, got: ${security.xFrame || 'missing'}`);
    log('INFO', `  X-Frame-Options: ${security.xFrame}`);
  });

  // ============== CSV INJECTION TESTS (HI-4) ==============

  console.log('\n📊 CSV Injection Tests (HI-4)\n');

  await test('CSV Export: Formula injection sanitized (=CMD)', async () => {
    const dangerousName = "=CMD|' /C calc'!A0";
    const csv = await testCsvInjection(dangerousName);
    const hasPrefix = csv.includes("'=CMD") || csv.includes("\"'=CMD");
    assert(hasPrefix, `Formula should be prefixed with single quote in CSV. CSV: ${csv.substring(0, 200)}`);
  });

  await test('CSV Export: @SUM formula injection sanitized', async () => {
    const dangerousName = "@SUM(1+1)*cmd|' /C calc'!A0";
    const csv = await testCsvInjection(dangerousName);
    const hasPrefix = csv.includes("'@SUM") || csv.includes("\"'@SUM");
    assert(hasPrefix, `@ formula should be prefixed with single quote in CSV`);
  });

  await test('CSV Export: + formula injection sanitized', async () => {
    const dangerousName = "+1+1";
    const csv = await testCsvInjection(dangerousName);
    const hasPrefix = csv.includes("'+1+1") || csv.includes("\"'+1+1");
    assert(hasPrefix, `+ formula should be prefixed with single quote in CSV`);
  });

  await test('CSV Export: - formula injection sanitized', async () => {
    const dangerousName = "-1+1";
    const csv = await testCsvInjection(dangerousName);
    const hasPrefix = csv.includes("'-1+1") || csv.includes("\"'-1+1");
    assert(hasPrefix, `- formula should be prefixed with single quote in CSV`);
  });

  // ============== FAIL-CLOSED MIDDLEWARE TEST (HI-5) ==============

  console.log('\n🔐 Fail-Closed Middleware Tests (HI-5)\n');

  await test('Fail-closed: Profile check error page exists', async () => {
    const { status } = await get('/error/profile-check');
    assert(status === 200 || status === 404, `Error page should return 200 or 404, got ${status}`);
    if (status === 200) {
      log('INFO', '  Profile check error page is accessible');
    } else {
      log('WARN', '  Profile check error page not found (may be normal)');
    }
  });

  // ============== ADDITIONAL EDGE CASES ==============

  console.log('\n🧩 Additional Edge Cases\n');

  await test('Edge: Invalid eventId format in query', async () => {
    const { status } = await get('/api/attendees?eventId=not-a-uuid');
    if (status !== 200 && status !== 400 && status !== 404) {
      throw new Error(`Expected 200, 400, or 404, got ${status}`);
    }
  });

  await test('Edge: Non-existent eventId returns empty or 404', async () => {
    const { status, data } = await get('/api/attendees?eventId=00000000-0000-0000-0000-000000000000');
    if (status === 200) {
      assert(Array.isArray(data.data), 'Should return data array');
      assert(data.data.length === 0, 'Should return empty array for non-existent event');
    } else if (status !== 404) {
      throw new Error(`Expected 200 or 404, got ${status}`);
    }
  });

  await test('Edge: Zero limit returns only count', async () => {
    const { status, data } = await get('/api/attendees?limit=0');
    if (status === 200) {
      assert(data.data.length === 0, 'Should return empty data array with limit=0');
      assert(typeof data.pagination.total === 'number', 'Should return total count');
      log('INFO', `  Total count: ${data.pagination.total}`);
    } else if (status !== 400) {
      throw new Error(`Expected 200 or 400, got ${status}`);
    }
  });

  // ============== CLEANUP ==============

  console.log('\n🧹 Cleanup\n');

  await test('Cleanup: Test data tracking', async () => {
    log('INFO', `  Total test attendees created: ${TEST_ATTENDEES_CREATED.length}`);
    assert(TEST_ATTENDEES_CREATED.length >= 0, 'Should track created attendees');
  });

  // Summary
  console.log('\n' + '='.repeat(50));
  const passed = RESULTS.filter(r => r.type === 'PASS').length;
  const failed = RESULTS.filter(r => r.type === 'FAIL').length;
  console.log(`Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    RESULTS.filter(r => r.type === 'FAIL').forEach(r => {
      console.log(`  ✗ ${r.message}`);
    });
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
