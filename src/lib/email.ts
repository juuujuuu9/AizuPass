import { Resend } from 'resend';

let resend: Resend | null = null;
function getResend() {
  if (!resend) {
    // On Vercel, process.env is the runtime source of truth
    const apiKey = (typeof process !== 'undefined' && process.env.RESEND_API_KEY)
      || (typeof import.meta !== 'undefined' && import.meta.env.RESEND_API_KEY)
      || '';
    resend = new Resend(apiKey || 're_placeholder');
  }
  return resend;
}

const QR_CID = 'qrcode';

function getConfiguredEmailSender() {
  const apiKey = (typeof process !== 'undefined' && process.env.RESEND_API_KEY)
    || (typeof import.meta !== 'undefined' && import.meta.env.RESEND_API_KEY);
  const fromEmail = (typeof process !== 'undefined' && process.env.FROM_EMAIL)
    || (typeof import.meta !== 'undefined' && import.meta.env.FROM_EMAIL)
    || 'onboarding@resend.dev';
  const fromName = (typeof process !== 'undefined' && process.env.FROM_NAME)
    || (typeof import.meta !== 'undefined' && import.meta.env.FROM_NAME)
    || 'Event Check-In';
  return { apiKey, fromEmail, fromName };
}

function dataUrlToBase64(dataUrl: string) {
  const match = /^data:image\/\w+;base64,(.+)$/.exec(dataUrl);
  if (!match) throw new Error('Invalid QR data URL');
  return match[1];
}

export async function sendQRCodeEmail(
  attendee: {
    firstName: string;
    lastName: string;
    email: string;
    company?: string | null;
    dietaryRestrictions?: string | null;
    rsvpAt: string;
  },
  qrCodeBase64: string,
  overrides?: { fromName?: string; eventName?: string }
) {
  const { apiKey, fromEmail, fromName: defaultFromName } = getConfiguredEmailSender();
  if (!apiKey) {
    return { success: false as const, error: 'Email service not configured' };
  }
  const fromName =
    overrides?.fromName
    ?? defaultFromName;
  const eventName = overrides?.eventName ?? 'the event';
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  let attachmentContent: string;
  try {
    attachmentContent = dataUrlToBase64(qrCodeBase64);
  } catch (e) {
    console.error('Invalid QR code data URL:', e);
    return { success: false as const, error: 'Invalid QR code image' };
  }

  const attachments = [
    {
      filename: 'qrcode.png',
      content: attachmentContent,
      contentType: 'image/png' as const,
      contentId: QR_CID,
    },
  ];

  const { data, error } = await getResend().emails.send({
    from,
    to: attendee.email,
    subject: `Your ${eventName} Registration QR Code`,
    attachments,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #374151; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .qr-container { text-align: center; margin: 20px 0; }
          .qr-code { border: 2px solid #e5e7eb; border-radius: 8px; padding: 10px; background: white; }
          .check-in-note { font-size: 1.1em; color: #4b5563; margin: 12px 0 8px; }
          .instructions { text-align: left; margin-top: 16px; padding: 16px; background: white; border-radius: 8px; }
          .instructions ol { margin: 8px 0 0 16px; padding: 0; }
          .instructions li { margin-bottom: 8px; }
          .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="header"><h1>You're Registered!</h1></div>
        <div class="content">
          <p>Hi <strong>${attendee.firstName} ${attendee.lastName}</strong>,</p>
          <p>Thank you for registering for <strong>${eventName}</strong> — we're excited to have you! Your unique QR code is below.</p>
          <div class="qr-container">
            <img src="cid:${QR_CID}" alt="Your QR Code" class="qr-code" />
            <p class="check-in-note"><strong>Your check-in QR code</strong></p>
            <div class="instructions">
              <p><strong>How to check in at ${eventName}:</strong></p>
              <ol>
                <li><strong>Save this email</strong> — Keep it in your inbox or take a screenshot so you can access it offline.</li>
                <li><strong>When you arrive</strong> — Open this email on your phone and scroll to the QR code above.</li>
                <li><strong>Show the code</strong> — A staff member will scan your QR code to check you in. Hold your phone steady and make sure the screen is bright enough to read.</li>
              </ol>
              <p>No need to print — your phone screen works perfectly.</p>
            </div>
          </div>
          <div class="details">
            <h3>Registration Details:</h3>
            <p><strong>Name:</strong> ${attendee.firstName} ${attendee.lastName}</p>
            <p><strong>Email:</strong> ${attendee.email}</p>
            ${attendee.company ? `<p><strong>Company:</strong> ${attendee.company}</p>` : ''}
            ${attendee.dietaryRestrictions ? `<p><strong>Dietary Restrictions:</strong> ${attendee.dietaryRestrictions}</p>` : ''}
            <p><strong>Registration Date:</strong> ${new Date(attendee.rsvpAt).toLocaleDateString()}</p>
          </div>
          <p>We look forward to seeing you at ${eventName}!</p>
        </div>
        <div class="footer"><p>This is an automated message. Please do not reply to this email.</p></div>
      </body>
      </html>
    `,
  });

  if (error) {
    console.error('Resend API error:', error);
    const msg = String(error.message || '');
    if (msg.includes('own email') || msg.includes('verify a domain') || msg.includes('not verified')) {
      return {
        success: false as const,
        error:
          'Resend: Verify your domain at resend.com/domains so you can send to any email. Until then, set FROM_EMAIL=onboarding@resend.dev in .env and only RSVP using the email you signed up to Resend with.',
      };
    }
    return { success: false as const, error: error.message };
  }
  return { success: true as const, data };
}

export async function sendOrganizationInviteEmail(data: {
  toEmail: string;
  organizationName: string;
  inviteUrl: string;
  invitedByEmail?: string | null;
  expiresAt: Date;
}) {
  const { apiKey, fromEmail, fromName } = getConfiguredEmailSender();
  if (!apiKey) {
    return { success: false as const, error: 'Email service not configured' };
  }
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
  const expiresLabel = data.expiresAt.toLocaleString();
  const inviter = data.invitedByEmail ? ` by ${data.invitedByEmail}` : '';
  const subject = `You're invited to join ${data.organizationName}`;

  const { data: resendData, error } = await getResend().emails.send({
    from,
    to: data.toEmail,
    subject,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #374151; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
          .card { background: #fff; border-radius: 8px; border: 1px solid #e5e7eb; padding: 16px; margin-top: 16px; }
          .cta { display: inline-block; margin-top: 18px; background: #111827; color: #fff !important; text-decoration: none; padding: 10px 16px; border-radius: 6px; font-weight: 600; }
          .muted { color: #6b7280; font-size: 13px; margin-top: 12px; }
          .link { word-break: break-all; color: #111827; }
        </style>
      </head>
      <body>
        <div class="header"><h1>Staff Invitation</h1></div>
        <div class="content">
          <p>You were invited${inviter} to join <strong>${data.organizationName}</strong> as staff.</p>
          <div class="card">
            <p><strong>What you get access to:</strong></p>
            <ul>
              <li>Scanner and dashboard access for events in this organization</li>
              <li>No organization settings or organizer-only controls</li>
            </ul>
            <a class="cta" href="${data.inviteUrl}">Accept Invitation</a>
            <p class="muted">This invite expires on ${expiresLabel}.</p>
          </div>
          <p class="muted">If the button does not work, copy and paste this link:</p>
          <p class="link">${data.inviteUrl}</p>
        </div>
      </body>
      </html>
    `,
  });

  if (error) {
    console.error('Resend API error (invite):', error);
    return { success: false as const, error: error.message || 'Failed to send invite email' };
  }
  return { success: true as const, data: resendData };
}
