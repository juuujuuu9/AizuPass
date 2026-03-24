#!/usr/bin/env node
/**
 * Production-style Resend smoke test: same From line as sendQRCodeEmail + tiny PNG attachment.
 *
 * Usage:
 *   node scripts/smoke-prod-email.mjs <recipient@example.com>
 *   SMOKE_TEST_TO=you@example.com node scripts/smoke-prod-email.mjs
 *
 * Loads .env from project root (dotenv). Requires RESEND_API_KEY, FROM_EMAIL, FROM_NAME.
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Resend } from 'resend';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env') });

const apiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev';
const fromName = process.env.FROM_NAME || 'AizuPass';
const to = process.argv[2] || process.env.SMOKE_TEST_TO;

if (!to) {
  console.error('Usage: node scripts/smoke-prod-email.mjs <recipient@example.com>');
  console.error('   or: SMOKE_TEST_TO=you@example.com node scripts/smoke-prod-email.mjs');
  process.exit(1);
}

if (!apiKey) {
  console.error('Missing RESEND_API_KEY in environment or .env');
  process.exit(1);
}

/** Minimal valid PNG (1×1) — verifies attachment path like QR emails */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

const resend = new Resend(apiKey);
const { data, error } = await resend.emails.send({
  from,
  to,
  subject: '[AizuPass smoke] Production sender + attachment test',
  html: `
    <!DOCTYPE html>
    <html><body style="font-family: system-ui, sans-serif; max-width: 700px; margin: 24px auto;">
      <p>This is a <strong>smoke test</strong> from <code>scripts/smoke-prod-email.mjs</code>.</p>
      <p>If the sender shows as <strong>${fromName}</strong> &lt;${fromEmail}&gt; and the PNG attaches, Resend + domain are wired correctly.</p>
      <p style="color:#6b7280;font-size:14px;">Replace this flow with Admin → bulk QR send when validating the full app on Vercel.</p>
    </body></html>
  `,
  attachments: [
    {
      filename: 'smoke-qrcode.png',
      content: PNG_BASE64,
      contentType: 'image/png',
    },
  ],
});

if (error) {
  console.error('Resend error:', error.message || error);
  process.exit(1);
}

console.log('OK — email queued.');
console.log('  From:', from);
console.log('  To:', to);
console.log('  Resend id:', data?.id ?? '(none)');
