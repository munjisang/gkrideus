(function () {
  'use strict';

  var form = document.getElementById('evInquiryForm');
  if (!form) return;

  var venueSelect = document.getElementById('evEventVenue');
  var venueOther = document.getElementById('evEventVenueOther');
  var submitBtn = document.getElementById('evInquirySubmit');
  var successPanel = document.getElementById('evInquirySuccess');
  var resetBtn = document.getElementById('evInquiryReset');

  function setError(field, isError) {
    if (!field) return;
    var group = field.closest('.ev-inquiry-field, .ev-inquiry-consent');
    if (group) group.classList.toggle('is-error', isError);
  }

  // 1. Venue "기타" → direct-input toggle
  if (venueSelect && venueOther) {
    venueSelect.addEventListener('change', function () {
      var isOther = venueSelect.value === '기타';
      venueOther.classList.toggle('is-visible', isOther);
      if (isOther) {
        venueOther.setAttribute('required', 'required');
      } else {
        venueOther.removeAttribute('required');
        venueOther.value = '';
        setError(venueOther, false);
      }
    });
  }

  // 2. Clear error on user input
  form.querySelectorAll('.inquiry-input, .inquiry-textarea, .ev-inquiry-select').forEach(function (el) {
    el.addEventListener('input', function () { setError(el, false); });
    el.addEventListener('change', function () { setError(el, false); });
  });

  var consentCheckbox = document.getElementById('evPrivacyConsent');
  if (consentCheckbox) {
    consentCheckbox.addEventListener('change', function () {
      setError(consentCheckbox, !consentCheckbox.checked);
    });
  }

  // 3. Submit — frontend only (backend TBD)
  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var firstInvalid = null;
    var fields = form.querySelectorAll('[required]');
    fields.forEach(function (el) {
      var isValid = el.checkValidity();
      setError(el, !isValid);
      if (!isValid && !firstInvalid) firstInvalid = el;
    });

    if (firstInvalid) {
      firstInvalid.focus({ preventScroll: true });
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Collect payload (for future backend integration)
    var payload = {
      eventName: form.eventName.value.trim(),
      eventDate: form.eventDate.value,
      eventVenue: venueSelect && venueSelect.value === '기타'
        ? (venueOther ? venueOther.value.trim() : '')
        : (venueSelect ? venueSelect.value : ''),
      groupSize: form.groupSize.value,
      departure: form.departure.value.trim(),
      phone: form.phone.value.trim(),
      memo: form.memo.value.trim(),
      privacyConsent: consentCheckbox ? consentCheckbox.checked : false,
      submittedAt: new Date().toISOString()
    };

    // Placeholder: log payload until backend endpoint is wired up
    if (typeof console !== 'undefined' && console.info) {
      console.info('[K.Rideus Inquiry]', payload);
    }

    // Switch to success state
    submitBtn.disabled = true;
    form.classList.add('is-submitted');
    if (successPanel) successPanel.classList.add('is-visible');

    // Scroll to success so user sees confirmation
    if (successPanel) {
      successPanel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // 4. Reset — return to the form.
  // Confirm before wiping if the user has typed anything. Skip the prompt
  // in the post-submit success state (form.is-submitted) since values
  // are already sent and "resetting" there just returns to an empty form.
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      if (!form.classList.contains('is-submitted')) {
        var hasInput = Array.prototype.some.call(form.elements, function (el) {
          if (!el || el.disabled) return false;
          if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
          return el.value && typeof el.value === 'string' && el.value.trim() !== '';
        });
        if (hasInput) {
          var isEn = document.documentElement.lang === 'en';
          var msg = isEn
            ? 'Your entries will be cleared. Continue?'
            : '작성 중인 내용이 모두 삭제됩니다. 계속할까요?';
          if (!window.confirm(msg)) return;
        }
      }
      form.reset();
      form.classList.remove('is-submitted');
      if (successPanel) successPanel.classList.remove('is-visible');
      if (venueOther) venueOther.classList.remove('is-visible');
      form.querySelectorAll('.is-error').forEach(function (el) {
        el.classList.remove('is-error');
      });
      if (submitBtn) submitBtn.disabled = false;
      var firstField = document.getElementById('evEventName');
      if (firstField) firstField.focus();
    });
  }
})();
