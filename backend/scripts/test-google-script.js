import 'dotenv/config';

const scriptUrl = process.env.GOOGLE_SCRIPT_URL;

if (!scriptUrl) {
  console.error('GOOGLE_SCRIPT_URL is not set in the backend environment.');
  process.exit(1);
}

const payload = {
  formType: 'consultation',
  fullName: 'John Doe',
  email: 'john@example.com',
  phone: '08012345678',
  organization: 'ABC Pharma',
  jobTitle: 'Research Scientist',
  gender: 'Male',
  country: 'Nigeria',
  preferredService: 'Clinical Development',
  consultationDate: '2026-07-15',
  consultationTime: '10:00 AM',
  reason: 'Discuss an upcoming Phase II clinical trial.',
  additionalNotes: 'Looking forward to the consultation.'
};

console.log('Sending sample consultation payload to Google Apps Script...');

const response = await fetch(scriptUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify(payload)
});

const responseText = await response.text();
console.log(`Status: ${response.status} ${response.statusText}`);
console.log('Response body:');
console.log(responseText || '<empty>');

if (response.ok) {
  console.log('Submission appears successful.');
} else {
  console.log('Submission was not successful.');
}
