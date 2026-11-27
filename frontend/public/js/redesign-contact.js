/* Contact form: sends enquiries to the existing consultation endpoint. */
(function () {
  'use strict';
  var form = document.getElementById('consult-form');
  var msg = document.getElementById('form-msg');
  if (!form || !msg) return;
  var button = form.querySelector('button[type="submit"]');
  var fields = form.elements;

  var service = new URLSearchParams(window.location.search).get('service');
  if (service && fields.service.querySelector('option[value="' + CSS.escape(service) + '"]')) {
    fields.service.value = service;
  }

  var now = new Date();
  var today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  fields.date.min = today;

  function show(text) {
    msg.hidden = false;
    msg.textContent = text;
  }

  function value(name) {
    return fields[name].value.trim();
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var required = ['name', 'email', 'phone', 'organisation', 'date', 'time', 'reason'];
    var missing = required.filter(function (name) { return !value(name); });
    if (missing.length) {
      show('Please complete all required fields.');
      fields[missing[0]].focus();
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value('email'))) {
      show('Please enter a valid email address.');
      fields.email.focus();
      return;
    }
    if (value('date') < today) {
      show('Please choose today or a future date.');
      fields.date.focus();
      return;
    }

    var phone = value('phone').replace(/[\s().-]/g, '');
    if (!/^\+?[0-9]{7,14}$/.test(phone)) {
      show('Please enter a valid phone number.');
      fields.phone.focus();
      return;
    }

    button.disabled = true;
    show('Sending your enquiry...');

    fetch(window.getApiUrl('/api/forms/consultation'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        formType: 'consultation',
        fullName: value('name'),
        email: value('email'),
        phone: phone,
        organization: value('organisation'),
        country: value('country'),
        preferredService: fields.service.options[fields.service.selectedIndex].text,
        consultationDate: value('date'),
        consultationTime: value('time'),
        reason: value('reason'),
        additionalNotes: value('message')
      })
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (result) {
          if (!response.ok || !result.success) throw new Error('failed');
          form.reset();
          show('Thank you. Your enquiry has been sent.');
        });
      })
      .catch(function () {
        show('Sorry, your enquiry could not be sent. Please try again or email info@mednovalife.com.');
      })
      .then(function () { button.disabled = false; });
  });
})();
