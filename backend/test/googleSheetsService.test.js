import test from 'node:test';
import assert from 'node:assert/strict';

process.env.GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL || 'https://example.com';

const { sendToGoogleSheets } = await import('../src/services/googleSheetsService.js');

test('treats HTML Apps Script error responses as failures', async () => {
  const originalFetch = global.fetch;

  global.fetch = async () => new Response('<!DOCTYPE html><html><body>ReferenceError: data is not defined</body></html>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' }
  });

  try {
    await assert.rejects(
      () => sendToGoogleSheets({ formType: 'compliance', name: 'Test User', email: 'test@example.com' }),
      /ReferenceError|Google Sheets submission failed/
    );
  } finally {
    global.fetch = originalFetch;
  }
});
