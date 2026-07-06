import { RESEND_API_KEY, FROM_EMAIL, CONSULTATION_EMAIL } from '../config/env.js';

const RESEND_API_URL = 'https://api.resend.com/emails';
const BRAND_COLOR = '#0f5aa8';
const CARD_BACKGROUND = '#f8fafc';

function ensureEmailConfig() {
  if (!RESEND_API_KEY) {
    const error = new Error('Resend API key is not configured.');
    error.statusCode = 500;
    throw error;
  }
  if (!FROM_EMAIL) {
    const error = new Error('Email sender address is not configured.');
    error.statusCode = 500;
    throw error;
  }
  if (!CONSULTATION_EMAIL) {
    const error = new Error('Consultation notification recipient is not configured.');
    error.statusCode = 500;
    throw error;
  }
}

function formatAddress(address) {
  return `MedNova <${address}>`;
}

async function sendResendEmail({ to, subject, html, text, replyTo }) {
  ensureEmailConfig();

  const body = {
    from: formatAddress(FROM_EMAIL),
    to,
    subject,
    html,
    text,
    reply_to: replyTo
  };

  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const textResponse = await response.text();
  let parsedResponse = null;

  try {
    parsedResponse = textResponse ? JSON.parse(textResponse) : null;
  } catch {
    parsedResponse = null;
  }

  if (!response.ok) {
    const message = parsedResponse?.error || parsedResponse?.message || textResponse || 'Resend email request failed.';
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  return parsedResponse || { success: true };
}

function buildNotificationEmailHtml(formData, submittedAt) {
  return `
  <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f3f6fb;color:#1f2937;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center" style="padding:24px;">
          <table width="620" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 20px 50px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:${BRAND_COLOR};padding:24px 32px;">
                <h1 style="margin:0;font-size:24px;color:#ffffff;">New Consultation Booking</h1>
                <p style="margin:8px 0 0;color:#e2e8f0;">A new consultation request has been received.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 18px;font-size:15px;color:#475569;">Submitted at ${submittedAt}</p>
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:collapse;">
                  ${Object.entries({
                    'Full Name': formData.fullName,
                    'Email Address': formData.email,
                    'Phone Number': formData.phone,
                    Organization: formData.organization,
                    'Job Title': formData.jobTitle,
                    Gender: formData.gender,
                    Country: formData.country,
                    'Preferred Service': formData.preferredService,
                    'Preferred Date': formData.consultationDate,
                    'Preferred Time': formData.consultationTime,
                    'Reason for Consultation': formData.reason,
                    'Additional Notes': formData.additionalNotes || 'None'
                  })
                    .map(([label, value]) => `
                      <tr>
                        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;width:180px;font-weight:700;color:#0f172a;">${label}</td>
                        <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#475569;">${value}</td>
                      </tr>
                    `)
                    .join('')}
                </table>
                <p style="margin:24px 0 0;font-size:14px;color:#64748b;">This request was received through the MedNova website consultation booking form.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  `;
}

function buildConfirmationEmailHtml(formData) {
  return `
  <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:${CARD_BACKGROUND};color:#1f2937;">
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td align="center" style="padding:24px;">
          <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="background:${BRAND_COLOR};padding:28px 32px;">
                <h1 style="margin:0;font-size:24px;color:#ffffff;">Thank you for your consultation request</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#334155;">Hi ${formData.fullName},</p>
                <p style="margin:0 0 18px;font-size:15px;line-height:1.7;color:#475569;">Thank you for contacting MedNova. We have received your consultation request and will review the details shortly.</p>
                <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse:separate;border-spacing:0 10px;">
                  ${[['Preferred service', formData.preferredService], ['Preferred date', formData.consultationDate], ['Preferred time', formData.consultationTime]]
                    .map(([label, value]) => `
                      <tr>
                        <td style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#0f172a;font-weight:700;width:170px;">${label}</td>
                        <td style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;color:#334155;">${value || 'Not provided'}</td>
                      </tr>
                    `)
                    .join('')}
                </table>
                <p style="margin:24px 0 0;font-size:15px;line-height:1.7;color:#475569;">A member of the MedNova team will review your request and contact you shortly if any adjustments are required.</p>
                <p style="margin:32px 0 0;font-size:15px;line-height:1.7;color:#475569;">Best regards,<br><strong>MedNova Limited</strong><br>Clinical Research • Pharmacovigilance • Regulatory Affairs</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  `;
}

export async function sendConsultationNotificationEmail(formData) {
  const submittedAt = new Date().toISOString();
  const subject = `New Consultation Booking – ${formData.fullName}`;
  const html = buildNotificationEmailHtml(formData, submittedAt);
  const text = `New consultation booking from ${formData.fullName}.\n\n` +
    `Email: ${formData.email}\n` +
    `Phone: ${formData.phone}\n` +
    `Organization: ${formData.organization}\n` +
    `Job Title: ${formData.jobTitle}\n` +
    `Gender: ${formData.gender}\n` +
    `Country: ${formData.country}\n` +
    `Preferred Service: ${formData.preferredService}\n` +
    `Preferred Date: ${formData.consultationDate}\n` +
    `Preferred Time: ${formData.consultationTime}\n` +
    `Reason: ${formData.reason}\n` +
    `Additional Notes: ${formData.additionalNotes || 'None'}\n` +
    `Submitted at: ${submittedAt}`;

  return sendResendEmail({
    to: CONSULTATION_EMAIL,
    subject,
    html,
    text,
    replyTo: CONSULTATION_EMAIL
  });
}

export async function sendConsultationConfirmationEmail(formData) {
  const subject = 'Your Consultation Request Has Been Received';
  const html = buildConfirmationEmailHtml(formData);
  const text = `Hi ${formData.fullName},\n\n` +
    `Thank you for contacting MedNova. We have received your consultation request for ${formData.preferredService} on ${formData.consultationDate} at ${formData.consultationTime}.\n\n` +
    `A member of the MedNova team will review your request and contact you shortly if any adjustments are required.\n\n` +
    `MedNova Limited\nClinical Research • Pharmacovigilance • Regulatory Affairs`;

  return sendResendEmail({
    to: formData.email,
    subject,
    html,
    text,
    replyTo: CONSULTATION_EMAIL
  });
}
