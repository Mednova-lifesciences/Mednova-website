(function () {
  const modal = document.getElementById('consultationModal');
  const bookingSection = document.getElementById('book-consultation');
  const form = document.getElementById('consultationForm');
  const confirmationCard = document.getElementById('consultationConfirmation');
  const formCard = document.getElementById('consultationFormCard');
  const submitButton = document.getElementById('consultationSubmit');
  const modalDismissedKey = 'mednova-consultation-modal-dismissed';

  if (!modal || !bookingSection || !form || !confirmationCard || !formCard || !submitButton) {
    return;
  }

  const openButtons = document.querySelectorAll('[data-open-consultation]');
  const timeButtons = Array.from(document.querySelectorAll('.time-slot'));
  const timeGroup = document.querySelector('.time-slot-group');
  const fieldWrappers = Array.from(document.querySelectorAll('.field'));
  const dateInput = document.getElementById('consultationDate');
  const firstNameInput = document.getElementById('consultationName');
  const summaryFields = {
    name: document.getElementById('confirmationName'),
    service: document.getElementById('confirmationService'),
    date: document.getElementById('confirmationDate'),
    time: document.getElementById('confirmationTime'),
    email: document.getElementById('confirmationEmail')
  };
  const fieldElements = {
    fullName: document.getElementById('consultationName'),
    email: document.getElementById('consultationEmail'),
    phone: document.getElementById('consultationPhone'),
    organization: document.getElementById('consultationOrganization'),
    service: document.getElementById('consultationService'),
    date: document.getElementById('consultationDate'),
    reason: document.getElementById('consultationReason')
  };

  const validationMessages = {
    fullName: document.getElementById('fullNameError'),
    email: document.getElementById('emailError'),
    phone: document.getElementById('phoneError'),
    organization: document.getElementById('organizationError'),
    service: document.getElementById('serviceError'),
    date: document.getElementById('dateError'),
    reason: document.getElementById('reasonError'),
    time: document.getElementById('timeError')
  };

  function setDateMin() {
    if (!dateInput) return;
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    dateInput.min = `${yyyy}-${mm}-${dd}`;
  }

  function openModal() {
    window.requestAnimationFrame(() => {
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('modal-open');
    });
  }

  function closeModal() {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    sessionStorage.setItem(modalDismissedKey, 'true');
  }

  function revealBookingForm() {
    formCard.classList.remove('is-hidden');
    confirmationCard.classList.remove('is-visible');
  }

  function scrollToBooking() {
    bookingSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => {
      revealBookingForm();
      if (firstNameInput) {
        firstNameInput.focus({ preventScroll: true });
      }
    }, 420);
  }

  function resetValidation() {
    Object.entries(validationMessages).forEach(([key, el]) => {
      if (el) el.textContent = '';
    });
    fieldWrappers.forEach((field) => field.classList.remove('invalid'));
    if (timeGroup) timeGroup.classList.remove('invalid');
  }

  function setFieldState(fieldName, isValid, message) {
    const field = fieldElements[fieldName];
    const messageEl = validationMessages[fieldName];
    const wrapper = field?.closest('.field');
    if (!field || !wrapper) return;
    wrapper.classList.toggle('invalid', !isValid);
    if (messageEl) {
      messageEl.textContent = isValid ? '' : message;
    }
  }

  function validateField(fieldName) {
    const field = fieldElements[fieldName];
    if (!field) return true;

    const value = field.value.trim();

    switch (fieldName) {
      case 'fullName':
        if (!value) {
          setFieldState(fieldName, false, 'Please enter your full name.');
          return false;
        }
        break;
      case 'email':
        if (!value) {
          setFieldState(fieldName, false, 'Please enter your email address.');
          return false;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          setFieldState(fieldName, false, 'Please enter a valid email address.');
          return false;
        }
        break;
      case 'phone':
        if (!value) {
          setFieldState(fieldName, false, 'Please enter your phone number.');
          return false;
        }
        if (!/^[+()\-\s0-9]{7,15}$/.test(value)) {
          setFieldState(fieldName, false, 'Please enter a valid phone number.');
          return false;
        }
        break;
      case 'organization':
        if (!value) {
          setFieldState(fieldName, false, 'Please tell us your organization.');
          return false;
        }
        break;
      case 'service':
        if (!value) {
          setFieldState(fieldName, false, 'Please select a preferred service.');
          return false;
        }
        break;
      case 'date':
        if (!value) {
          setFieldState(fieldName, false, 'Please choose a consultation date.');
          return false;
        }
        const selectedDate = new Date(`${value}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (selectedDate < today) {
          setFieldState(fieldName, false, 'Please choose today or a future date.');
          return false;
        }
        break;
      case 'reason':
        if (!value) {
          setFieldState(fieldName, false, 'Please briefly describe the reason for your consultation.');
          return false;
        }
        break;
      default:
        break;
    }

    setFieldState(fieldName, true, '');
    return true;
  }

  function validateTimeSelection() {
    const selectedTime = timeButtons.find((button) => button.classList.contains('is-active'))?.dataset.time || '';
    if (!selectedTime) {
      if (timeGroup) timeGroup.classList.add('invalid');
      if (validationMessages.time) validationMessages.time.textContent = 'Please choose a preferred time.';
      return false;
    }
    if (timeGroup) timeGroup.classList.remove('invalid');
    if (validationMessages.time) validationMessages.time.textContent = '';
    return true;
  }

  function validateForm() {
    resetValidation();
    const validFields = Object.keys(fieldElements).every((fieldName) => validateField(fieldName));
    const validTime = validateTimeSelection();
    return validFields && validTime;
  }

  function setSubmitting(isSubmitting) {
    submitButton.disabled = isSubmitting;
    submitButton.classList.toggle('is-loading', isSubmitting);
    submitButton.innerHTML = isSubmitting
      ? '<span class="submit-button__spinner" aria-hidden="true"></span>Submitting request...'
      : 'Submit Consultation Request';
  }

  function populateSummary(values) {
    if (summaryFields.name) summaryFields.name.textContent = values.fullName;
    if (summaryFields.service) summaryFields.service.textContent = values.service;
    if (summaryFields.date) summaryFields.date.textContent = values.date;
    if (summaryFields.time) summaryFields.time.textContent = values.time;
    if (summaryFields.email) summaryFields.email.textContent = values.email;
  }

  function showConfirmation(values) {
    formCard.classList.add('is-hidden');
    confirmationCard.classList.add('is-visible');
    populateSummary(values);
    confirmationCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetForm() {
    form.reset();
    timeButtons.forEach((button) => button.classList.remove('is-active'));
    resetValidation();
    formCard.classList.remove('is-hidden');
    confirmationCard.classList.remove('is-visible');
  }

  async function submitConsultationRequest(values) {
    const response = await fetch(window.getApiUrl('/api/forms/consultation'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        formType: 'consultation',
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        organization: values.organization,
        jobTitle: values.jobTitle,
        gender: values.gender,
        country: values.country,
        preferredService: values.service,
        consultationDate: values.date,
        consultationTime: values.time,
        reason: values.reason,
        additionalNotes: values.notes
      })
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Unable to submit your consultation request right now.');
    }

    return result;
  }

  openButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      closeModal();
      scrollToBooking();
    });
  });

  modal.addEventListener('click', (event) => {
    if (event.target === modal || event.target.closest('[data-close-modal]')) {
      closeModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    }
  });

  Object.entries(fieldElements).forEach(([fieldName, field]) => {
    if (!field) return;
    field.addEventListener('input', () => validateField(fieldName));
    field.addEventListener('blur', () => validateField(fieldName));
    field.addEventListener('change', () => validateField(fieldName));
  });

  timeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      timeButtons.forEach((item) => item.classList.remove('is-active'));
      button.classList.add('is-active');
      validateTimeSelection();
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!validateForm()) {
      const firstInvalidField = document.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea, .time-slot-group.invalid');
      if (firstInvalidField) {
        firstInvalidField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    const formData = new FormData(form);
    const values = {
      fullName: formData.get('fullName')?.toString().trim() || '',
      email: formData.get('email')?.toString().trim() || '',
      phone: formData.get('phone')?.toString().trim() || '',
      organization: formData.get('organization')?.toString().trim() || '',
      jobTitle: formData.get('jobTitle')?.toString().trim() || '',
      gender: formData.get('gender')?.toString().trim() || '',
      country: formData.get('country')?.toString().trim() || '',
      service: formData.get('service')?.toString().trim() || '',
      date: formData.get('date')?.toString().trim() || '',
      time: document.querySelector('.time-slot.is-active')?.dataset.time || '',
      reason: formData.get('reason')?.toString().trim() || '',
      notes: formData.get('notes')?.toString().trim() || ''
    };

    setSubmitting(true);
    try {
      await submitConsultationRequest(values);
      showConfirmation(values);
    } catch (error) {
      submitButton.textContent = error.message || 'Unable to submit your request right now.';
      submitButton.classList.remove('is-loading');
      submitButton.disabled = false;
      window.setTimeout(() => {
        setSubmitting(false);
      }, 800);
      return;
    }
    setSubmitting(false);
  });

  document.getElementById('bookAnotherConsultation')?.addEventListener('click', () => {
    resetForm();
    scrollToBooking();
  });

  document.getElementById('returnHome')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  setDateMin();
  if (!sessionStorage.getItem(modalDismissedKey)) {
    window.addEventListener('load', () => {
      window.setTimeout(openModal, 260);
    });
  }
})();
