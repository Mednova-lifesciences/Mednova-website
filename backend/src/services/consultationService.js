import { sendToGoogleSheets } from './googleSheetsService.js';
import { sendConsultationNotificationEmail, sendConsultationConfirmationEmail } from './emailService.js';

export async function processConsultationSubmission(formData) {
  console.log('[Consultation] Sending consultation payload to Google Sheets.');
  const sheetsResult = await sendToGoogleSheets(formData);
  console.log('[Consultation] Google Sheets submission succeeded.');

  console.log('[Consultation] Sending internal notification email.');
  await sendConsultationNotificationEmail(formData);
  console.log('[Consultation] Internal notification email sent.');

  console.log('[Consultation] Sending customer confirmation email.');
  await sendConsultationConfirmationEmail(formData);
  console.log('[Consultation] Confirmation email sent.');

  return sheetsResult;
}
