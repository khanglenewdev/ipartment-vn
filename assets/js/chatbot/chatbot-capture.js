/* ============================================================
   ipartment chatbot - capture + analytics layer
   Thin wrapper over the EXISTING backend: window.ipartmentCRM (leads)
   and window.ipartmentTrack (events). Does not invent a new pipeline.
   No em dashes or en dashes anywhere.
   ============================================================ */
(function () {
  'use strict';

  var captured = false; // per page-load: do not capture the same visitor twice

  function validateContact(raw) {
    var s = (raw || '').trim();
    if (!s) return { ok: false };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { ok: true, kind: 'email', email: s, phone: null };
    var digits = s.replace(/[^0-9]/g, '');
    if (digits.length >= 8 && digits.length <= 15) return { ok: true, kind: 'phone', email: null, phone: s };
    return { ok: false };
  }

  // Fire-and-forget analytics. Never blocks or throws into the UI.
  function track(name, meta) {
    try { if (window.ipartmentTrack) window.ipartmentTrack('chatbot', name, meta ? { meta: meta } : undefined); }
    catch (e) { /* ignore */ }
  }

  // Write a lead through the existing CRM (localStorage cache + Supabase leads
  // table + Make webhook -> Brevo follow-up email), carrying full context in meta.
  function submitLead(contact, context) {
    var page = (location.pathname.split('/').pop() || 'index.html');
    var payload = {
      type: 'chatbot_capture',
      name: null,
      email: contact.email || null,
      phone: contact.phone || null,
      source: 'chatbot',
      meta: {
        question: (context && context.question) || null,
        page: page,
        lang: (context && context.lang) || 'en',
        intent: (context && context.intent) || null,
        dates: (context && context.dates) || null,
        party: (context && context.party) || null,
        length: (context && context.length) || null,
        consent: 'Asked to be contacted about their stay via the on-site chat. Purpose and no-spam statement shown at capture.'
      }
    };
    try {
      if (window.ipartmentCRM && window.ipartmentCRM.add) window.ipartmentCRM.add('leads', payload);
    } catch (e) { /* the CRM already swallows storage errors; never block the chat */ }
    captured = true;
    track('capture_done', { field: contact.kind });
    return payload;
  }

  // Update an existing capture's qualification answers (sent as a light second
  // lead row tagged as an update, so the human follow-up sees the extra context).
  function submitQualification(context) {
    track('capture_qualify', { intent: context && context.intent || null });
    try {
      if (window.ipartmentCRM && window.ipartmentCRM.add) {
        window.ipartmentCRM.add('leads', {
          type: 'chatbot_qualify',
          email: context.email || null,
          phone: context.phone || null,
          source: 'chatbot',
          meta: { page: (location.pathname.split('/').pop() || 'index.html'), lang: context.lang || 'en', dates: context.dates || null, party: context.party || null, length: context.length || null, question: context.question || null }
        });
      }
    } catch (e) { /* ignore */ }
  }

  window.ipartmentChatCapture = {
    validateContact: validateContact,
    submitLead: submitLead,
    submitQualification: submitQualification,
    track: track,
    hasCaptured: function () { return captured; }
  };
})();
