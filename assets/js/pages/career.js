/* Career - application modal + CRM submit */
let currentRole = '';

window.openApplication = function(role) {
  currentRole = role;
  document.getElementById('app-role-name').textContent = role;
  document.getElementById('app-title').textContent = `Apply for ${role}`;
  document.getElementById('app-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
};

function closeApplication() {
  document.getElementById('app-modal').classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('app-close').addEventListener('click', closeApplication);
document.getElementById('app-modal').addEventListener('click', e => { if (e.target.id === 'app-modal') closeApplication(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeApplication(); });

document.getElementById('app-form').addEventListener('submit', e => {
  e.preventDefault();
  const data = {
    role: currentRole,
    first: document.getElementById('app-first').value.trim(),
    last: document.getElementById('app-last').value.trim(),
    email: document.getElementById('app-email').value.trim(),
    phone: document.getElementById('app-phone').value.trim(),
    years: document.getElementById('app-years').value,
    link: document.getElementById('app-link').value.trim(),
    message: document.getElementById('app-message').value.trim(),
  };
  const stamped = window.ipartmentCRM.add('applications', data);
  window.ipartmentCRM.add('leads', {
    type: 'career_application',
    name: `${data.first} ${data.last}`,
    email: data.email,
    phone: data.phone,
    appliedRole: currentRole,
    appId: stamped.id
  });
  document.querySelector('.app-modal-content').innerHTML = `
    <button class="app-close" id="app-close-2">&times;</button>
    <div style="text-align:center;padding:40px 0;">
      <div style="width:72px;height:72px;background:var(--green);color:var(--white);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:32px;margin:0 auto 24px;">&#10003;</div>
      <h2 style="font-family:var(--font-heading);font-size:30px;font-weight:900;margin-bottom:12px;">Application received!</h2>
      <p style="font-size:15px;color:rgba(255,255,255,0.72);max-width:380px;margin:0 auto 28px;line-height:1.7;">Thanks ${data.first}. We will review your application for the <strong>${currentRole}</strong> role and get back to you within 5 business days.</p>
      <button type="button" class="btn btn-black" onclick="document.getElementById('app-modal').classList.remove('open'); window.location.reload();">Close</button>
    </div>
  `;
  document.getElementById('app-close-2').addEventListener('click', () => window.location.reload());
});
