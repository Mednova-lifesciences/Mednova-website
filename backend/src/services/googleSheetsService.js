import { GOOGLE_SCRIPT_URL } from '../config/env.js';

const REQUEST_TIMEOUT_MS = 10000;

function getRequiredFields(formType) {
  switch (formType) {
    case 'consultation':
      return ['fullName', 'email', 'phone', 'organization', 'preferredService', 'consultationDate', 'consultationTime', 'reason'];
    case 'compliance':
      return ['name', 'email'];
    case 'clinical':
      return ['name', 'email', 'organization', 'inquiryType', 'trialStage', 'projectDescription'];
    case 'pharmacovigilance':
      return ['name', 'email', 'organization', 'role', 'projectDescription'];
    case 'regulatory':
      return ['name', 'email', 'organization', 'inquiryType', 'productCategory', 'projectDescription'];
    default:
      return [];
  }
}

function validateFormData(formType, formData) {
  const missingFields = getRequiredFields(formType).filter((field) => {
    const value = formData[field];
    return typeof value !== 'string' || value.trim() === '';
  });

  if (missingFields.length > 0) {
    return {
      isValid: false,
      message: `Please complete the required fields: ${missingFields.join(', ')}`
    };
  }

  if (formType === 'consultation') {
    const email = (formData.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { isValid: false, message: 'Please provide a valid email address.' };
    }
    const phone = (formData.phone || '').trim();
    if (!/^[+()\-\s0-9]{7,15}$/.test(phone)) {
      return { isValid: false, message: 'Please provide a valid phone number.' };
    }
  }

  if (formType === 'compliance') {
    const email = (formData.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { isValid: false, message: 'Please provide a valid email address.' };
    }
  }

  return { isValid: true, message: '' };
}

function createPayload(formType, formData) {
  switch (formType) {
    case 'consultation':
      return {
        formType: 'consultation',
        fullName: formData.fullName || '',
        email: formData.email || '',
        phone: formData.phone || '',
        organization: formData.organization || '',
        jobTitle: formData.jobTitle || '',
        gender: formData.gender || '',
        country: formData.country || '',
        preferredService: formData.preferredService || '',
        consultationDate: formData.consultationDate || '',
        consultationTime: formData.consultationTime || '',
        reason: formData.reason || '',
        additionalNotes: formData.additionalNotes || ''
      };
    case 'compliance':
      return {
        formType: 'compliance',
        name: formData.name || '',
        email: formData.email || ''
      };
    case 'clinical':
      return {
        formType: 'clinical',
        name: formData.name || '',
        email: formData.email || '',
        organization: formData.organization || '',
        inquiryType: formData.inquiryType || '',
        trialStage: formData.trialStage || '',
        projectDescription: formData.projectDescription || ''
      };
    case 'pharmacovigilance':
      return {
        formType: 'pharmacovigilance',
        name: formData.name || '',
        email: formData.email || '',
        organization: formData.organization || '',
        role: formData.role || '',
        projectDescription: formData.projectDescription || ''
      };
    case 'regulatory':
      return {
        formType: 'regulatory',
        name: formData.name || '',
        email: formData.email || '',
        organization: formData.organization || '',
        inquiryType: formData.inquiryType || '',
        productCategory: formData.productCategory || '',
        projectDescription: formData.projectDescription || ''
      };
    default:
      return formData;
  }
}

export async function sendToGoogleSheets(formData) {
  const formType = formData?.formType;

  if (!formType) {
    throw new Error('Form type is required.');
  }

  const validation = validateFormData(formType, formData);
  if (!validation.isValid) {
    const error = new Error(validation.message);
    error.statusCode = 400;
    throw error;
  }

  if (!GOOGLE_SCRIPT_URL) {
    const error = new Error('Google Apps Script URL is not configured.');
    error.statusCode = 500;
    throw error;
  }

  const payload = createPayload(formType, formData);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    console.log('[GoogleSheets] Sending payload to Apps Script:', payload);

    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const text = await response.text();
    let parsedResponse = null;
    const contentType = response.headers.get('content-type') || '';
    const looksLikeHtmlError = /text\/html|application\/xhtml\+xml/i.test(contentType) || /<!doctype html|<html/i.test(text);

    try {
      parsedResponse = text ? JSON.parse(text) : null;
    } catch {
      parsedResponse = null;
    }

    console.log('[GoogleSheets] Apps Script status:', response.status);
    console.log('[GoogleSheets] Apps Script response body:', text);

    if (!response.ok || looksLikeHtmlError) {
      const message = parsedResponse?.message || parsedResponse?.error || text || 'Google Sheets submission failed.';
      const error = new Error(message);
      error.statusCode = response.status;
      throw error;
    }

    if (parsedResponse && parsedResponse.success === false) {
      const error = new Error(parsedResponse.message || 'Google Sheets submission failed.');
      error.statusCode = 502;
      throw error;
    }

    return {
      success: true,
      message: parsedResponse?.message || 'Submission received successfully.'
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error('Google Sheets request timed out.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
