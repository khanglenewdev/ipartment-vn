/* Admin CRM page logic - gated by a Supabase admin account */
const Auth = window.ipartmentAuth;
const sb = window.sb;
let currentTab = 'leads';
// Whether the current viewer is an admin. The overview KPIs are public, but the
// detailed per-tab data is shown only when this is true.
let _adminView = false;
const LOCKED_NOTE = '<div class="locked-note"><span class="locked-ico">&#128274;</span><span>For security reasons, only admin accounts can view this data.</span></div>';

function showDash() {
  document.getElementById('login-shell').style.display = 'none';
  document.getElementById('dash').style.display = 'block';
  document.getElementById('link-logout').style.display = 'inline';
  loadAll();
}

// Owner affordance: open the site's auth modal to sign in as admin and unlock the
// detailed tabs. Falls back to a hint if the modal is not available on this page.
window.adminSignIn = function() {
  if (window.ipartmentOpenAuth) { window.ipartmentOpenAuth('login'); }
  else if (window.ipartmentToast) { window.ipartmentToast('Sign in from the main site, then come back here.'); }
  else { window.location.href = 'my-account.html'; }
};

function showLogin(msg) {
  document.getElementById('login-shell').style.display = 'flex';
  document.getElementById('dash').style.display = 'none';
  document.getElementById('link-logout').style.display = 'none';
  const el = document.getElementById('admin-login-msg');
  if (el) { el.textContent = msg || ''; el.style.display = msg ? 'block' : 'none'; }
}

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('admin-email').value.trim();
  const pass = document.getElementById('admin-pass').value;
  if (!email || !pass) return;
  const btn = e.target.querySelector('button');
  const orig = btn.textContent; btn.disabled = true; btn.textContent = 'Logging in...';
  try {
    await Auth.signIn({ email, password: pass });
    const admin = await Auth.isAdmin();
    if (!admin) {
      await Auth.signOut();
      showLogin('That account is not an admin. Ask the site owner for access.');
    } else {
      showLogin('');
      showDash();
    }
  } catch (err) {
    showLogin(/invalid login/i.test((err && err.message) || '') ? 'Incorrect email or password.' : ((err && err.message) || 'Login failed.'));
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
});

document.getElementById('link-logout').addEventListener('click', e => {
  e.preventDefault();
  window.ipartmentConfirmLogout(async () => {
    await Auth.signOut();
    showLogin();
  });
});

document.querySelectorAll('.tab-btn-admin').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('.tab-btn-admin').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  b.classList.add('active');
  document.getElementById('tab-' + b.dataset.tab).classList.add('active');
  currentTab = b.dataset.tab;
}));

function fmtDate(s) {
  try { return new Date(s).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }); }
  catch (e) { return s; }
}

function buildTable(headers, rows, emptyMsg) {
  if (!rows.length) return `<div class="empty-tbl"><strong>No data yet</strong>${emptyMsg ? '<p>'+emptyMsg+'</p>' : ''}</div>`;
  return `<thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>`;
}

function leadTypeTag(type) {
  if (type === 'welcome_popup_voucher') return '<span class="tag-pill popup">Popup</span>';
  if (type === 'newsletter_signup') return '<span class="tag-pill newsletter">Newsletter</span>';
  if (type === 'booking_request') return '<span class="tag-pill booking">Booking</span>';
  if (type === 'career_application') return '<span class="tag-pill career">Career</span>';
  return `<span class="tag-pill">${type || '-'}</span>`;
}

// Overview KPIs come from a public aggregate-counts RPC (totals only, no PII),
// so the headline shows real numbers to everyone, even logged out. The detailed
// rows below stay protected by row-level security (admin accounts only).
async function loadPublicKPIs() {
  try {
    const res = await sb.rpc('crm_public_counts');
    if (res.error || !res.data) return;
    const d = res.data;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    const n = x => Number(x || 0).toLocaleString('en-US');
    set('kpi-visitors', n(d.visitors));
    set('kpi-visitors-sub', n(d.pageviews) + ' page views');
    set('kpi-leads', n(d.leads));
    set('kpi-leads-sub', n(d.lead_emails) + ' unique emails');
    set('kpi-bookings', n(d.bookings));
    set('kpi-users', n(d.users));
    set('kpi-applications', n(d.applications));
  } catch (e) { console.warn('[admin] public counts failed', e); }
}

// For non-admins, fill every detail container with the security note instead of
// data. Only sets innerHTML (never removes the elements), so an admin signing in
// re-renders cleanly.
function renderLockedTabs() {
  const note = LOCKED_NOTE;
  const tableNote = '<tbody><tr><td>' + note + '</td></tr></tbody>';
  ['tbl-leads','tbl-users','tbl-bookings','tbl-vouchers','tbl-applications','tbl-sessions','tbl-quiz','tbl-feedback','tbl-chatbot-miss','tbl-chatbot-leads'].forEach(function(id){ const el = document.getElementById(id); if (el) el.innerHTML = tableNote; });
  ['sessions-summary','chatbot-summary','finder-summary','funnel-view','mag-list'].forEach(function(id){ const el = document.getElementById(id); if (el) el.innerHTML = note; });
}

async function loadAll() {
  // Headline KPIs are public and always real.
  await loadPublicKPIs();
  // The in-depth per-tab data is admin only.
  let isAdminUser = false;
  try { isAdminUser = await Auth.isAdmin(); } catch (e) {}
  _adminView = isAdminUser;
  if (!isAdminUser) { renderLockedTabs(); return; }

  // Everything below is read from Supabase, the single source of truth.
  let profiles = [], bookings = [], vouchers = [], leads = [], apps = [], pageviews = [], quiz = [], chatEvents = [], finderEvents = [], totalViewsExact = null;
  try {
    const [pr, br, vr, lr, ar, sv, cv, qz, fb, ce, fe] = await Promise.all([
      sb.from('profiles').select('*').order('created_at', { ascending: false }),
      sb.from('bookings').select('*').order('created_at', { ascending: false }),
      sb.from('vouchers').select('*').order('created_at', { ascending: false }),
      sb.from('leads').select('*').order('created_at', { ascending: false }),
      sb.from('applications').select('*').order('created_at', { ascending: false }),
      sb.from('events').select('session_id,page,meta,created_at').eq('type', 'pageview').order('created_at', { ascending: false }).limit(1000),
      sb.from('events').select('*', { count: 'exact', head: true }).eq('type', 'pageview'),
      sb.from('password_quiz').select('*').order('created_at', { ascending: false }),
      sb.from('site_feedback').select('*').order('created_at', { ascending: false }),
      sb.from('events').select('name,meta,created_at').eq('type', 'chatbot').order('created_at', { ascending: false }).limit(3000),
      sb.from('events').select('name,meta,created_at').eq('type', 'finder').order('created_at', { ascending: false }).limit(3000)
    ]);
    profiles = pr.data || []; bookings = br.data || []; vouchers = vr.data || [];
    leads = lr.data || []; apps = ar.data || []; pageviews = sv.data || [];
    quiz = qz.data || []; chatEvents = ce.data || []; finderEvents = fe.data || [];
    totalViewsExact = (cv && typeof cv.count === 'number') ? cv.count : null;
    [pr, br, vr, lr, ar, sv, cv, qz, fb, ce, fe].forEach(r => { if (r.error) console.warn('[admin] load:', r.error.message); });
    window.__feedback = fb.data || [];
  } catch (e) { console.warn('[admin] supabase load failed', e); }

  // KPI cards are already populated by loadPublicKPIs() above. Below we only
  // build the detailed per-tab views from the admin-readable rows.

  // VISITORS detail: unique browser sessions + total page views, from the events table.
  // A "visitor" is a unique session_id (one per browser). Total views is an exact
  // server-side count; unique/today figures use the most recent 1000 page views.
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const uniqueVisitors = new Set(pageviews.map(p => p.session_id).filter(Boolean)).size;
  const totalViews = (totalViewsExact != null) ? totalViewsExact : pageviews.length;
  const recentToday = pageviews.filter(p => new Date(p.created_at) >= startToday);
  const visitorsToday = new Set(recentToday.map(p => p.session_id).filter(Boolean)).size;
  const viewsToday = recentToday.length;
  const sumEl = document.getElementById('sessions-summary');
  if (sumEl) {
    const stat = (v, l) => `<div class="mini-stat"><div class="v">${v.toLocaleString('en-US')}</div><div class="l">${l}</div></div>`;
    const note = (totalViewsExact != null && totalViewsExact > pageviews.length)
      ? `Total page views is exact. Unique-visitor and "today" figures are based on the most recent ${pageviews.length.toLocaleString('en-US')} page views.`
      : 'A visitor is a unique browser session. For full historical traffic across devices, turn on Microsoft Clarity or connect a web-analytics tool (see the playbook).';
    sumEl.innerHTML =
      stat(uniqueVisitors, 'Unique visitors') +
      stat(totalViews, 'Total page views') +
      stat(visitorsToday, 'Visitors today') +
      stat(viewsToday, 'Views today') +
      `<div class="note">${note}</div>`;
  }

  // Leads (Supabase)
  document.getElementById('tbl-leads').innerHTML = buildTable(
    ['Date', 'Type', 'Name / Email', 'Phone', 'Source / Notes'],
    leads.map(l => [
      fmtDate(l.created_at),
      leadTypeTag(l.type),
      `${l.name || ''}<br/><small style="color:#999;">${l.email || ''}</small>`,
      l.phone || '-',
      l.booking_ref ? `Ref: ${l.booking_ref}` : l.applied_role ? `Role: ${l.applied_role}` : l.voucher_code || l.source_page || '-'
    ]),
    'Leads appear here when visitors fill the welcome popup, newsletter, or any contact form.'
  );

  // Accounts (Supabase profiles)
  document.getElementById('tbl-users').innerHTML = buildTable(
    ['Joined', 'Name', 'Email', 'Role', 'Phone'],
    profiles.map(u => [
      fmtDate(u.created_at),
      `${u.first_name || ''} ${u.last_name || ''}`.trim() || '-',
      u.email || '-',
      u.role === 'admin' ? '<span class="tag-pill booking">Admin</span>' : 'User',
      u.phone || '-'
    ]),
    'Registered accounts appear here when visitors sign up on the main site.'
  );

  // Bookings (Supabase) - guest contact comes from guests_detail
  document.getElementById('tbl-bookings').innerHTML = buildTable(
    ['Ref', 'Guest', 'Apartment', 'Dates', 'Nights', 'Total', 'Status', 'Created'],
    bookings.map(b => {
      const gd = b.guests_detail || {};
      const who = b.user_id ? 'account' : (gd.email || 'guest');
      return [
        b.booking_ref || (b.id || '').slice(0, 8),
        `${gd.name || '-'}<br/><small style="color:#999;">${who}</small>`,
        `${b.room || ''}, ${b.room_name || ''}`,
        `${b.checkin || '-'} to ${b.checkout || '-'}`,
        b.nights || '-',
        `${(b.total || 0).toLocaleString('vi-VN')} VND`,
        b.status || '-',
        fmtDate(b.created_at)
      ];
    }),
    'Bookings appear here when a guest completes the booking flow.'
  );

  // Vouchers (Supabase)
  document.getElementById('tbl-vouchers').innerHTML = buildTable(
    ['Issued', 'Code', 'Label', 'Discount', 'Status'],
    vouchers.map(v => [fmtDate(v.created_at), v.code, v.label || '-', v.discount || '-', v.status || '-']),
    'Vouchers are auto-issued on signup and appear here.'
  );

  // Applications (Supabase)
  document.getElementById('tbl-applications').innerHTML = buildTable(
    ['Date', 'Role', 'Name', 'Contact', 'Experience'],
    apps.map(a => [
      fmtDate(a.created_at), a.role || '-', `${a.first_name || ''} ${a.last_name || ''}`.trim() || '-',
      `${a.email || ''}<br/><small style="color:#999;">${a.phone || ''}</small>`, a.years_experience || '-'
    ]),
    'Job applications submitted via the Career page.'
  );

  // Page views (Supabase events)
  document.getElementById('tbl-sessions').innerHTML = buildTable(
    ['Time', 'Page', 'Referrer'],
    pageviews.slice(0, 100).map(s => [fmtDate(s.created_at), (s.meta && s.meta.path) || s.page || '-', (s.meta && s.meta.ref) || '-']),
    'Page views are tracked anonymously to show visitor flow.'
  );

  // Forgot-password quiz answers (Supabase)
  document.getElementById('tbl-quiz').innerHTML = buildTable(
    ['Date', 'Email', 'Name', 'Likes the site', 'Dev looks', 'Improvement idea'],
    quiz.map(q => [
      fmtDate(q.created_at), q.email || '-', q.name || '-',
      (q.likes_score != null ? q.likes_score + '/10' : '-'),
      (q.dev_score != null ? q.dev_score + '/10' : '-'),
      q.improve || '-'
    ]),
    'Answers from the playful forgot-password quiz land here. Surprisingly useful feedback.'
  );

  // Website feedback ("Rate my website" footer panel)
  const feedback = window.__feedback || [];
  document.getElementById('tbl-feedback').innerHTML = buildTable(
    ['Date', 'Rating', 'Comment', 'Email (service interest)', 'Page'],
    feedback.map(f => [
      fmtDate(f.created_at), (f.rating ? f.rating + '/5' : '-'), f.comment || '-', f.email || '-', f.source_page || '-'
    ]),
    'Feedback left via the footer "Rate my website" panel will appear here, plus emails from people interested in what we build.'
  );

  // Chatbot: funnel summary + top unanswered questions + recent chatbot leads
  (function renderChatbot() {
    const ev = chatEvents || [];
    const cnt = n => ev.filter(e => e.name === n).length;
    const opens = cnt('open'), qs = cnt('question'), hits = cnt('answer_hit'), misses = cnt('answer_miss');
    const capShown = cnt('capture_shown'), capDone = cnt('capture_done');
    const answered = hits + misses;
    const hitRate = answered ? Math.round(hits / answered * 100) : 0;
    const capRate = capShown ? Math.round(capDone / capShown * 100) : 0;
    const stat = (label, val) => '<span style="display:inline-block;margin:0 22px 12px 0;"><strong style="font-family:var(--font-heading,serif);font-size:24px;color:#fff;display:block;line-height:1;">' + val + '</strong><span style="font-family:var(--font-mono,monospace);font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.55);">' + label + '</span></span>';
    const sum = document.getElementById('chatbot-summary');
    if (sum) sum.innerHTML = stat('Chats opened', opens) + stat('Questions asked', qs) + stat('Answered', hits + ' / ' + hitRate + '%') + stat('Unanswered', misses) + stat('Leads captured', capDone + (capShown ? ' / ' + capRate + '%' : ''));

    // group answer_miss by normalised question so repeats stack into one row
    const groups = {};
    ev.filter(e => e.name === 'answer_miss').forEach(e => {
      const q = ((e.meta && e.meta.q) || '').trim();
      if (!q) return;
      const key = q.toLowerCase().replace(/\s+/g, ' ');
      if (!groups[key]) groups[key] = { q, n: 0, last: e.created_at };
      groups[key].n++;
      if (e.created_at > groups[key].last) groups[key].last = e.created_at;
    });
    const ranked = Object.values(groups).sort((a, b) => b.n - a.n || (b.last > a.last ? 1 : -1)).slice(0, 50);
    document.getElementById('tbl-chatbot-miss').innerHTML = buildTable(
      ['Times asked', 'Question the library could not answer', 'Last asked'],
      ranked.map(g => [g.n, g.q, fmtDate(g.last)]),
      'No unanswered questions yet. When a visitor types something the library cannot answer confidently, it lands here so you can add it.'
    );

    const cbLeads = (leads || []).filter(l => l.type === 'chatbot_capture' || l.type === 'chatbot_qualify');
    document.getElementById('tbl-chatbot-leads').innerHTML = buildTable(
      ['Date', 'Email', 'Phone', 'Triggering question', 'Page'],
      cbLeads.map(l => [fmtDate(l.created_at), l.email || '-', l.phone || '-', (l.meta && l.meta.question) || '-', (l.meta && l.meta.page) || l.source_page || '-']),
      'Leads captured by the chatbot will appear here, each with the question that prompted them.'
    );

    // Finder quiz funnel + the recommendation mix
    const fev = finderEvents || [];
    const fc = n => fev.filter(e => e.name === n).length;
    const recMix = {};
    fev.filter(e => e.name === 'result').forEach(e => { const r = e.meta && e.meta.recommended; if (r) recMix[r] = (recMix[r] || 0) + 1; });
    const recStr = ['XS', 'S', 'M', 'L'].filter(k => recMix[k]).map(k => k + ': ' + recMix[k]).join('   ') || 'none yet';
    const fsum = document.getElementById('finder-summary');
    if (fsum) fsum.innerHTML = stat('Quizzes started', fc('start')) + stat('Completed', fc('result')) + stat('Booking clicks', fc('cta_book_click')) + stat('Leads captured', fc('capture_done')) + stat('Abandoned', fc('abandon')) + '<div style="margin-top:6px;font-family:var(--font-mono,monospace);font-size:11px;letter-spacing:0.06em;color:rgba(255,255,255,0.6);">RECOMMENDED MIX &nbsp;&nbsp; ' + recStr + '</div>';
  })();
}

window.downloadJSON = function() {
  const data = window.ipartmentCRM.exportAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ipartment-crm-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
};

window.downloadCSV = function() {
  const csv = window.ipartmentCRM.exportCSV(currentTab);
  if (!csv) { window.ipartmentToast('No data to export in this tab.'); return; }
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ipartment-${currentTab}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
};

window.clearAll = function() {
  window.ipartmentCRM.clearAll();
  loadAll();
  window.ipartmentToast('All data cleared.');
};

window.loadAll = loadAll;

// ── WEBHOOK / AIRTABLE INTEGRATION CONTROLS ──
function refreshWebhookStatus() {
  const url = window.ipartmentCRM.getWebhook();
  const statusEl = document.getElementById('webhook-status');
  const inputEl = document.getElementById('webhook-url-input');
  if (!statusEl || !inputEl) return;
  if (url) {
    statusEl.innerHTML = `<span style="color:var(--green);">&#10003; Connected.</span> Every new record is forwarded to Make.`;
    inputEl.value = url;
  } else {
    statusEl.innerHTML = `<span style="color:rgba(255,255,255,0.5);">Not connected.</span> Data only stores in this browser until you add a webhook.`;
  }
}

window.saveWebhook = function() {
  const url = document.getElementById('webhook-url-input').value.trim();
  if (url && !/^https?:\/\//.test(url)) {
    window.ipartmentToast('Webhook URL must start with https://');
    return;
  }
  window.ipartmentCRM.setWebhook(url);
  refreshWebhookStatus();
  window.ipartmentToast(url ? 'Webhook saved.' : 'Webhook cleared.');
};

window.testWebhook = function() {
  const url = window.ipartmentCRM.getWebhook();
  if (!url) { window.ipartmentToast('Set a webhook URL first.'); return; }
  window.ipartmentCRM.testWebhook();
  window.ipartmentToast('Test ping sent. Check your Make scenario for activity.');
};

window.clearWebhook = function() {
  if (!confirm('Disconnect the webhook?')) return;
  window.ipartmentCRM.setWebhook('');
  document.getElementById('webhook-url-input').value = '';
  refreshWebhookStatus();
  window.ipartmentToast('Webhook disconnected.');
};

// ── MICROSOFT CLARITY ──
function refreshClarityStatus() {
  const statusEl = document.getElementById('clarity-status');
  const inputEl = document.getElementById('clarity-id-input');
  if (!statusEl || !inputEl) return;
  const id = window.ipartmentGetClarity ? window.ipartmentGetClarity() : '';
  if (id) {
    statusEl.innerHTML = '<span style="color:var(--green);">&#10003; Clarity is on</span> (project ' + id + '). Reload a page to start recording.';
    inputEl.value = id;
  } else {
    statusEl.innerHTML = '<span style="color:rgba(255,255,255,0.5);">Not connected.</span> Paste a project ID to turn on session replay and heatmaps.';
  }
}

window.saveClarity = function() {
  const id = (document.getElementById('clarity-id-input').value || '').trim();
  if (window.ipartmentSetClarity) window.ipartmentSetClarity(id);
  refreshClarityStatus();
  window.ipartmentToast(id ? 'Clarity ID saved. Reload to start recording.' : 'Clarity ID cleared.');
};

window.clearClarity = function() {
  if (window.ipartmentSetClarity) window.ipartmentSetClarity('');
  document.getElementById('clarity-id-input').value = '';
  refreshClarityStatus();
  window.ipartmentToast('Clarity removed.');
};

// Refresh status when the integration tab is opened
document.querySelectorAll('.tab-btn-admin').forEach(b => {
  b.addEventListener('click', () => {
    if (b.dataset.tab === 'integration') { refreshWebhookStatus(); refreshClarityStatus(); }
    if (b.dataset.tab === 'magazine') renderMagazineList();
    if (b.dataset.tab === 'funnel') renderFunnel();
  });
});

// ── BOOKING FUNNEL (Supabase events) ──
async function renderFunnel() {
  const wrap = document.getElementById('funnel-view');
  if (!wrap) return;
  if (!_adminView) { wrap.innerHTML = LOCKED_NOTE; return; }
  wrap.innerHTML = '<p style="color:rgba(255,255,255,0.5);">Loading...</p>';
  const [fres, eres, ares, pres] = await Promise.all([
    sb.from('events').select('name,session_id').eq('type', 'funnel'),
    sb.from('events').select('name,meta').eq('type', 'exit_survey'),
    sb.from('events').select('name,variant').eq('type', 'ab'),
    sb.from('events').select('meta').eq('type', 'preferences')
  ]);
  if (fres.error) { wrap.innerHTML = '<p style="color:#f87171;">Could not load funnel: ' + fres.error.message + '</p>'; return; }
  const rows = fres.data || [];
  const steps = ['step_1', 'step_2', 'step_3', 'step_4', 'step_5'];
  const labels = ['1. Viewed booking', '2. Picked dates', '3. Saw add-ons', '4. Entered details', '5. Confirmed'];
  const sets = steps.map(() => new Set());
  rows.forEach(r => { const idx = steps.indexOf(r.name); if (idx > -1) sets[idx].add(r.session_id); });
  const n = sets.map(s => s.size);
  const top = n[0] || 1;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let html = '';
  if (!rows.length) {
    html += '<div class="empty-tbl"><strong>No funnel data yet</strong><p>Visit the booking page and step through it to see the funnel populate.</p></div>';
  } else {
    html += '<div style="max-width:680px;">';
    for (let i = 0; i < steps.length; i++) {
      const c = n[i];
      const w = Math.round((c / top) * 100);
      let drop = '';
      if (i > 0 && n[i - 1] > 0) drop = ' <span style="color:#f87171;">(-' + Math.round((1 - c / n[i - 1]) * 100) + '%)</span>';
      html += '<div style="margin-bottom:14px;">'
        + '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px;"><span style="font-weight:600;">' + labels[i] + '</span><span>' + c + drop + '</span></div>'
        + '<div style="background:rgba(255,255,255,0.12);height:24px;"><div style="background:var(--yellow);height:24px;width:' + w + '%;min-width:2px;"></div></div>'
        + '</div>';
    }
    const conv = top ? ((n[4] / top) * 100).toFixed(1) : '0';
    html += '<p style="margin-top:18px;font-size:14px;"><strong>Overall conversion:</strong> ' + conv + '% of booking-page visitors complete a booking.</p>';
    html += '<p style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:8px;">Counts are unique sessions that reached each step.</p></div>';
  }

  // Exit-survey: why visitors leave (and what offer would have won them)
  const ex = (eres && !eres.error && eres.data) ? eres.data : [];
  const rl = { price: 'The price', dates: 'Dates did not work', more_info: 'Needed more info', confusing: 'Website was confusing', browsing: 'Just browsing' };
  if (ex.length) {
    const reasons = {}; const details = [];
    ex.forEach(r => {
      // new reason-tailored answers
      if (r.name === 'detail') { if (r.meta && r.meta.answer) details.push({ reason: r.meta.reason, answer: r.meta.answer }); }
      // older "what offer" answers (kept so existing data still shows)
      else if (r.name === 'offer_wish') { if (r.meta && r.meta.offer) details.push({ reason: r.meta.reason, answer: r.meta.offer }); }
      else if (r.name) reasons[r.name] = (reasons[r.name] || 0) + 1;
    });
    html += '<div style="max-width:680px;margin-top:32px;border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;">';
    html += '<h3 style="font-family:var(--font-heading);font-size:20px;font-weight:900;margin-bottom:12px;">Why visitors leave</h3>';
    const keys = Object.keys(reasons);
    if (keys.length) html += '<table style="width:100%;"><tbody>' + keys.map(k => '<tr><td style="padding:6px 0;">' + (rl[k] || esc(k)) + '</td><td style="text-align:right;font-weight:700;">' + reasons[k] + '</td></tr>').join('') + '</tbody></table>';
    if (details.length) {
      html += '<h4 style="font-family:var(--font-heading);font-size:16px;font-weight:900;margin:18px 0 8px;">What they told us</h4>';
      html += '<ul style="margin-left:18px;font-size:13px;color:rgba(255,255,255,0.7);line-height:1.8;list-style:none;padding-left:0;">'
        + details.slice(0, 50).map(d => '<li style="margin-bottom:7px;"><span style="font-family:var(--font-mono);font-size:10px;letter-spacing:0.06em;text-transform:uppercase;color:var(--yellow);">' + esc(rl[d.reason] || d.reason || 'Other') + '</span><br>' + esc(d.answer) + '</li>').join('')
        + '</ul>';
    }
    html += '</div>';
  }

  // A/B test: which welcome offer wins the most emails
  const ab = (ares && !ares.error && ares.data) ? ares.data : [];
  if (ab.length) {
    const exp = {}, conv = {};
    ab.forEach(r => {
      if (!r.variant) return;
      if (r.name === 'exposure') exp[r.variant] = (exp[r.variant] || 0) + 1;
      else if (r.name === 'conversion') conv[r.variant] = (conv[r.variant] || 0) + 1;
    });
    const vl = { pct15: '15% off', pickup: 'Free airport pickup', pack: 'Free welcome pack' };
    const variants = Array.from(new Set(Object.keys(exp).concat(Object.keys(conv))));
    html += '<div style="max-width:680px;margin-top:32px;border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;">';
    html += '<h3 style="font-family:var(--font-heading);font-size:20px;font-weight:900;margin-bottom:12px;">Welcome offer A/B test</h3>';
    html += '<table style="width:100%;font-size:13px;"><thead><tr><th style="text-align:left;padding-bottom:6px;">Offer</th><th style="text-align:right;">Shown</th><th style="text-align:right;">Emails</th><th style="text-align:right;">Rate</th></tr></thead><tbody>';
    let best = null;
    variants.forEach(v => {
      const e = exp[v] || 0, c = conv[v] || 0, rate = e ? (c / e * 100) : 0;
      if (e > 0 && (best === null || rate > best.rate)) best = { v: v, rate: rate };
      html += '<tr><td style="padding:6px 0;">' + (vl[v] || esc(v)) + '</td><td style="text-align:right;">' + e + '</td><td style="text-align:right;">' + c + '</td><td style="text-align:right;font-weight:700;">' + rate.toFixed(1) + '%</td></tr>';
    });
    html += '</tbody></table>';
    if (best && best.rate > 0) html += '<p style="margin-top:10px;font-size:13px;"><strong>Leading offer:</strong> ' + (vl[best.v] || esc(best.v)) + ' at ' + best.rate.toFixed(1) + '%.</p>';
    html += '<p style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:6px;">Each visitor is randomly assigned one offer and sees it consistently.</p>';
    html += '</div>';
  }

  // Demand signals: which not-yet-offered services guests want most (market validation)
  const prefs = (pres && !pres.error && pres.data) ? pres.data : [];
  if (prefs.length) {
    const demand = {}, perfects = [];
    prefs.forEach(r => {
      const m = r.meta || {};
      (m.wishlist || []).forEach(s => { demand[s] = (demand[s] || 0) + 1; });
      if (m.perfect) perfects.push(m.perfect);
    });
    const ranked = Object.keys(demand).sort((a, b) => demand[b] - demand[a]);
    html += '<div style="max-width:680px;margin-top:32px;border-top:1px solid rgba(255,255,255,0.1);padding-top:24px;">';
    html += '<h3 style="font-family:var(--font-heading);font-size:20px;font-weight:900;margin-bottom:6px;">Demand signals (what to build next)</h3>';
    html += '<p style="font-size:13px;color:rgba(255,255,255,0.6);margin-bottom:12px;">Services guests asked us to add, ranked. This is market validation before you spend a dong.</p>';
    if (ranked.length) {
      const maxD = demand[ranked[0]] || 1;
      html += ranked.map(s => {
        const c = demand[s], w = Math.round((c / maxD) * 100);
        return '<div style="margin-bottom:10px;"><div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;"><span style="font-weight:600;">' + esc(s) + '</span><span>' + c + '</span></div><div style="background:rgba(255,255,255,0.12);height:18px;"><div style="background:var(--terracotta);height:18px;width:' + w + '%;min-width:2px;"></div></div></div>';
      }).join('');
    }
    if (perfects.length) {
      html += '<h4 style="font-family:var(--font-heading);font-size:16px;font-weight:900;margin:18px 0 8px;">What would make their stay perfect</h4>';
      html += '<ul style="margin-left:18px;font-size:13px;color:rgba(255,255,255,0.7);line-height:1.7;">' + perfects.slice(0, 40).map(p => '<li>' + esc(p) + '</li>').join('') + '</ul>';
    }
    html += '</div>';
  }
  wrap.innerHTML = html;
}
window.renderFunnel = renderFunnel;

// ── MAGAZINE CMS ──
const escHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const escAttr = escHtml;

function renderMagazineList() {
  const wrap = document.getElementById('mag-list');
  if (!wrap) return;
  if (!_adminView) { wrap.innerHTML = LOCKED_NOTE; return; }
  if (!window.ipartmentMagazine) {
    wrap.innerHTML = '<p style="color:rgba(255,255,255,0.5);">Article data file not loaded.</p>';
    return;
  }
  const all = window.ipartmentMagazine.getAllForAdmin();
  if (!all.length) {
    wrap.innerHTML = '<p style="color:rgba(255,255,255,0.5);">No articles. Click "Add new article" to create one.</p>';
    return;
  }
  // Sort: featured first, then user-added, then defaults
  all.sort((a, b) => {
    const aF = (a.featured === true || a.category === 'featured') ? 0 : 1;
    const bF = (b.featured === true || b.category === 'featured') ? 0 : 1;
    if (aF !== bF) return aF - bF;
    if (a._kind === 'user' && b._kind === 'default') return -1;
    if (a._kind === 'default' && b._kind === 'user') return 1;
    return 0;
  });

  wrap.innerHTML = all.map(a => {
    const kindPill = a._kind === 'user' ? '<span class="mag-kind-pill user">Custom</span>' : '<span class="mag-kind-pill default">Default</span>';
    const hiddenPill = a._hidden ? '<span class="mag-kind-pill hidden">Hidden</span>' : '';
    const featuredPill = (a.featured === true || a.category === 'featured') ? '<span class="mag-kind-pill featured">Featured</span>' : '';
    const isExternal = a.url && /^https?:\/\//.test(a.url);
    const cat = a.tag || a.category || '';
    return `
      <div class="mag-row ${a._hidden ? 'is-hidden' : ''}">
        <div class="thumb" style="background-image:url('${escAttr(a.image)}');"></div>
        <div class="info">
          <div class="tag-row">
            ${kindPill}
            ${featuredPill}
            ${hiddenPill}
            <span style="font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--gray-mid);">${escHtml(cat)}</span>
          </div>
          <div class="title">${escHtml(a.title)}</div>
          <div class="meta">
            ${a.date ? '<span>' + escHtml(a.date) + '</span>' : ''}
            ${a.source ? '<span>' + escHtml(a.source) + '</span>' : ''}
            ${isExternal ? '<a href="' + escAttr(a.url) + '" target="_blank" rel="noopener" class="url-link">View link &#8599;</a>' : ''}
          </div>
        </div>
        <div class="actions">
          ${a._hidden
            ? `<button class="restore" onclick="restoreArticle('${escAttr(a.id)}')">Show again</button>`
            : `<button onclick="editArticle('${escAttr(a.id)}')">Edit</button>
               <button class="danger" onclick="removeArticle('${escAttr(a.id)}')">${a._kind === 'user' ? 'Delete' : 'Hide'}</button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

window.openArticleEditor = function(article) {
  document.getElementById('art-id').value = (article && article.id) || '';
  document.getElementById('art-title').value = (article && article.title) || '';
  document.getElementById('art-excerpt').value = (article && article.excerpt) || '';
  document.getElementById('art-category').value = (article && article.category) || 'local';
  document.getElementById('art-date').value = (article && article.date) || '';
  document.getElementById('art-url').value = (article && article.url) || '';
  document.getElementById('art-source').value = (article && article.source) || '';
  document.getElementById('art-tag').value = (article && article.tag) || '';
  document.getElementById('art-image').value = (article && article.image) || '';
  document.getElementById('art-keywords').value = (article && article.keywords) || '';
  document.getElementById('art-featured').checked = !!(article && (article.featured === true || article.category === 'featured'));
  document.getElementById('art-modal-title').textContent = article ? 'Edit article' : 'Add new article';
  refreshImagePreview();
  document.getElementById('art-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
};

window.closeArticleEditor = function() {
  document.getElementById('art-modal').classList.remove('open');
  document.body.style.overflow = '';
};

window.editArticle = function(id) {
  const a = window.ipartmentMagazine.getById(id);
  if (a) window.openArticleEditor(a);
};

window.removeArticle = function(id) {
  const a = window.ipartmentMagazine.getById(id);
  if (!a) return;
  const isDefault = a._kind === 'default';
  const msg = isDefault
    ? `Hide "${a.title}" from the magazine page? (You can show it again later.)`
    : `Delete "${a.title}" permanently?`;
  if (!confirm(msg)) return;
  const res = window.ipartmentMagazine.remove(id);
  window.ipartmentToast(res.mode === 'deleted' ? 'Article deleted.' : 'Article hidden.');
  renderMagazineList();
};

window.restoreArticle = function(id) {
  window.ipartmentMagazine.restoreDefault(id);
  window.ipartmentToast('Article restored.');
  renderMagazineList();
};

function refreshImagePreview() {
  const url = document.getElementById('art-image').value.trim();
  const prev = document.getElementById('art-image-preview');
  if (url) {
    prev.style.backgroundImage = `url('${url.replace(/'/g, "\\'")}')`;
    prev.style.display = 'block';
  } else {
    prev.style.display = 'none';
  }
}

document.addEventListener('input', e => {
  if (e.target && e.target.id === 'art-image') refreshImagePreview();
});

document.addEventListener('click', e => {
  if (e.target && e.target.id === 'art-close') window.closeArticleEditor();
  if (e.target && e.target.id === 'art-modal') window.closeArticleEditor();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('art-modal').classList.contains('open')) window.closeArticleEditor();
});

document.getElementById('art-form').addEventListener('submit', e => {
  e.preventDefault();
  const id = document.getElementById('art-id').value.trim();
  const data = {
    title: document.getElementById('art-title').value.trim(),
    excerpt: document.getElementById('art-excerpt').value.trim(),
    category: document.getElementById('art-category').value,
    date: document.getElementById('art-date').value.trim(),
    url: document.getElementById('art-url').value.trim(),
    source: document.getElementById('art-source').value.trim(),
    tag: document.getElementById('art-tag').value.trim(),
    image: document.getElementById('art-image').value.trim(),
    keywords: document.getElementById('art-keywords').value.trim(),
    featured: document.getElementById('art-featured').checked,
  };
  // Auto-set tag from category if blank
  if (!data.tag) {
    data.tag = { local: 'Local Guide', regional: 'Regional', business: 'Business', news: 'News', featured: 'Featured' }[data.category] || 'Article';
  }
  if (!data.title || !data.excerpt || !data.image) {
    window.ipartmentToast('Title, excerpt and image URL are required.');
    return;
  }
  if (id) {
    window.ipartmentMagazine.update(id, data);
    window.ipartmentToast('Article updated.');
  } else {
    window.ipartmentMagazine.add(data);
    window.ipartmentToast('Article added.');
  }
  window.closeArticleEditor();
  renderMagazineList();
});

(async function initAdmin() {
  // Gate ON: only an admin account sees the dashboard; everyone else gets the
  // login screen. (The page can be opened to all again by calling showDash()
  // unconditionally here, as it was during the showcase.)
  async function gate() {
    let admin = false;
    try { admin = await Auth.isAdmin(); } catch (e) {}
    if (admin) { showLogin(''); showDash(); }
    else { showLogin(); }
  }
  await gate();
  // Re-evaluate the gate whenever auth state changes, so logging in shows the
  // dashboard and logging out returns to the login screen without a refresh.
  try { Auth.onChange(function () { gate(); }); } catch (e) {}
})();
