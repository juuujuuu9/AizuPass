#!/usr/bin/env node
/**
 * QR Check-In Edge Case Tests
 * Run with: node scripts/test-edge-cases.mjs [baseUrl]
 * Example: node scripts/test-edge-cases.mjs http://localhost:4321
 *
 * Staff APIs require auth bypass. Start dev server with BYPASS_AUTH_FOR_TESTS=true,
 * then run tests with same env. Script sends X-Test-Mode: 1 header.
 */

const BASE_URL = process.argv[2] || 'http://localhost:4321';
const TEST_HEADERS = process.env.BYPASS_AUTH_FOR_TESTS === 'true'
  ? { 'X-Test-Mode': '1' }
  : {};
const RESULTS = [];

/** Required on every staff check-in; must match QR payload event or attendee's event. */
const DUMMY_SCANNER_EVENT = '00000000-0000-4000-8000-000000000000';
const FAKE_QR_EVENT = '00000000-0000-0000-0000-000000000001';

function log(type, message) {
  const icon = type === 'PASS' ? '✓' : type === 'FAIL' ? '✗' : type === 'WARN' ? '⚠' : 'ℹ';
  console.log(`${icon} ${message}`);
  RESULTS.push({ type, message });
}

async function test(name, fn) {
  try {
    await fn();
    log('PASS', name);
  } catch (err) {
    log('FAIL', `${name}: ${err.message}`);
  }
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
    const { status, data } = await post('/api/webhooks/entry', { eventSlug: 'test' });
    if (status !== 401) {
      throw new Error(`Expected 401, got ${status}: ${JSON.stringify(data)}`);
    }
  });

  // 11. Webhook: Wrong auth
  await test('Webhook: Wrong authorization', async () => {
    const { status, data } = await post(
      '/api/webhooks/entry',
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
    });
    if (attendeeCreate.status !== 201 || !attendeeCreate.data?.id) {
      throw new Error(`Failed to create attendee for race test: ${attendeeCreate.status}`);
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
