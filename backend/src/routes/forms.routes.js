import express from 'express';
import { sendToGoogleSheets } from '../services/googleSheetsService.js';
import { processConsultationSubmission } from '../services/consultationService.js';

const router = express.Router();

function mapBodyToPayload(formType, body) {
  if (!body || typeof body !== 'object') {
    return {};
  }

  switch (formType) {
    case 'consultation':
      return {
        formType: 'consultation',
        fullName: body.fullName || body.name || '',
        email: body.email || '',
        phone: body.phone || '',
        organization: body.organization || '',
        jobTitle: body.jobTitle || '',
        gender: body.gender || '',
        country: body.country || '',
        preferredService: body.preferredService || body.service || '',
        consultationDate: body.consultationDate || body.date || '',
        consultationTime: body.consultationTime || body.time || '',
        reason: body.reason || '',
        additionalNotes: body.additionalNotes || body.notes || ''
      };
    case 'compliance':
      return {
        formType: 'compliance',
        name: body.name || '',
        email: body.email || ''
      };
    case 'clinical':
      return {
        formType: 'clinical',
        name: body.name || '',
        email: body.email || '',
        organization: body.organization || '',
        inquiryType: body.inquiryType || body['Type of inquiry'] || '',
        trialStage: body.trialStage || body['Trial stage'] || '',
        projectDescription: body.projectDescription || body.message || ''
      };
    case 'pharmacovigilance':
      return {
        formType: 'pharmacovigilance',
        name: body.name || '',
        email: body.email || '',
        organization: body.organization || '',
        role: body.role || body['I am a'] || body.track || '',
        projectDescription: body.projectDescription || body.message || ''
      };
    case 'regulatory':
      return {
        formType: 'regulatory',
        name: body.name || '',
        email: body.email || '',
        organization: body.organization || '',
        inquiryType: body.inquiryType || body['Type of inquiry'] || '',
        productCategory: body.productCategory || body['Product category'] || body.stage || '',
        projectDescription: body.projectDescription || body.message || ''
      };
    default:
      return body;
  }
}

async function submitForm(req, res, formType) {
  try {
    console.log(`[Forms] Received ${formType} submission.`);
    const payload = mapBodyToPayload(formType, req.body);
    payload.formType = formType;

    let result;
    if (formType === 'consultation') {
      result = await processConsultationSubmission(payload);
    } else {
      console.log(`[Forms] Sending ${formType} submission to Google Sheets.`);
      result = await sendToGoogleSheets(payload);
    }

    console.log(`[Forms] ${formType} submission completed.`);
    return res.status(200).json({ success: true, message: result.message || 'Submission received successfully.' });
  } catch (error) {
    console.error(`[Forms] ${formType} submission failed.`, error.message);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Unable to submit your request right now.'
    });
  }
}

router.post('/consultation', (req, res) => submitForm(req, res, 'consultation'));
router.post('/compliance', (req, res) => submitForm(req, res, 'compliance'));
router.post('/clinical', (req, res) => submitForm(req, res, 'clinical'));
router.post('/pharmacovigilance', (req, res) => submitForm(req, res, 'pharmacovigilance'));
router.post('/regulatory', (req, res) => submitForm(req, res, 'regulatory'));

export default router;
