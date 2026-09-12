const loginStyles = document.createElement('style');
loginStyles.textContent = '.app-shell[hidden]{display:none!important}.login-gate{position:fixed;inset:0;background:linear-gradient(90deg,#172321cc,#17232166),url("https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=2200&q=85") center/cover;display:grid;grid-template-columns:minmax(0,1fr) minmax(360px,430px);align-items:center;gap:7vw;padding:clamp(24px,8vw,120px);z-index:20}.login-gate[hidden]{display:none}.login-visual{color:#fff;max-width:560px}.login-visual .brand-mark{display:grid;margin-bottom:28px;background:#d8f2df;color:#294e55}.login-visual-label{font:700 14px "Space Grotesk";letter-spacing:2px}.login-visual h1{font:600 clamp(38px,5vw,70px) "Space Grotesk";line-height:1.02;letter-spacing:-2px;margin:24px 0 18px}.login-visual h1 em{color:#bfe8ca;font-style:normal}.login-visual p{max-width:390px;color:#e5eee8;font-size:15px;line-height:1.6}.login-card{position:relative;width:100%;background:#fff;border-radius:12px;padding:30px;box-shadow:0 24px 70px #0005}.login-card h2{font:600 25px Space Grotesk;margin:9px 0}.login-card p{color:#75817d;font-size:12px;line-height:1.5;margin:0 0 22px}.login-card label{display:grid;gap:6px;font-size:11px;font-weight:700;color:#52615c;margin:13px 0}.password-field{display:flex;align-items:center;border:1px solid #e7ece8;border-radius:6px}.password-field input{min-width:0;flex:1;border:0!important;outline:0!important}.login-card input{border:1px solid #e7ece8;border-radius:6px;padding:11px;font:13px DM Sans;outline-color:#2f8f5b}.password-toggle{width:auto!important;margin:0!important;padding:8px 10px;border:0;background:transparent;color:#2f8f5b;font:600 11px DM Sans;cursor:pointer}.login-card button.upload-button{width:100%;margin-top:9px}.login-mode-tabs{display:none}.login-mode{border:0;background:transparent;color:#2f8f5b;padding:10px 0 0;font:600 12px DM Sans;cursor:pointer}.login-mode:hover{text-decoration:underline}.company-login{background:#294e55;border:0;color:#fff;border-radius:6px;padding:11px;font:600 12px DM Sans;cursor:pointer}.logout-button{width:100%;margin-top:9px;padding:10px;border:1px solid #db6b62;border-radius:6px;background:#fff;color:#bc5c52;font:600 12px DM Sans;cursor:pointer}.login-card small{display:block;color:#bc5c52;margin-top:12px;min-height:14px}.account-button{border:0;cursor:pointer}.close-button{position:absolute;top:12px;right:16px;width:auto!important;margin:0!important;padding:2px 7px;border:0;background:transparent;color:#75817d;font-size:24px;cursor:pointer}@media(max-width:760px){.login-gate{grid-template-columns:1fr;padding:24px}.login-visual{display:none}}';
document.head.appendChild(loginStyles);
const loginGate = document.getElementById('login-gate');
const loginForm = document.getElementById('login-form');
const appShell = document.getElementById('app-shell');
const staticDemo = window.location.hostname.endsWith('github.io');
const demoPasswordKey = 'worktrack-demo-password';

function demoPassword() { return localStorage.getItem(demoPasswordKey) || 'change-me-now'; }
function staticDemoSession(username) { return { authenticated: true, user: { username, role: 'admin' } }; }

function setAccountUser(username) {
  const accountButton = document.getElementById('account-button');
  accountButton.textContent = username || 'admin';
  accountButton.title = `${username || 'admin'} account settings`;
}

function setLoginVisible(visible) {
  loginGate.hidden = !visible;
  appShell.hidden = visible;
}

async function checkSession() {
  let session;
  let config = {};
  try {
    const response = await fetch('/api/session');
    if (!response.ok) throw new Error('API unavailable');
    session = await response.json();
    const configResponse = await fetch('/api/config');
    if (configResponse.ok) config = await configResponse.json();
  } catch (error) {
    if (!staticDemo) throw error;
    session = { authenticated: false, user: null };
  }
  if (config.companyLoginUrl) {
    const companyLogin = document.getElementById('company-login');
    companyLogin.hidden = false;
    companyLogin.addEventListener('click', () => { window.location.href = config.companyLoginUrl; });
  }
  setAccountUser(session.user?.username);
  setLoginVisible(!session.authenticated);
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.getElementById('login-error');
  error.textContent = '';
  try {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    let response;
    if (staticDemo) {
      if (username !== 'admin' || password !== demoPassword()) {
        error.textContent = 'Invalid username or password.';
        return;
      }
      response = { ok: true };
    } else response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
    if (!response.ok) {
      error.textContent = response.status === 404 ? 'Login service is not available on this website.' : 'Invalid username or password.';
      return;
    }
    setAccountUser(username);
    setLoginVisible(false);
    if (!staticDemo) await loadReports();
    await loadBundledReport();
  } catch (requestError) {
    error.textContent = 'Cannot reach the login service. Start the WorkTrack server or deploy the Python backend.';
    console.error(requestError);
  }
});

const loginPasswordForm = document.getElementById('login-password-form');
const loginModeButton = document.getElementById('login-mode-button');
const changeModeButton = document.getElementById('change-mode-button');
loginModeButton.hidden = true;
loginForm.after(changeModeButton);
function showLoginMode(mode) {
  const changing = mode === 'change';
  loginForm.hidden = changing;
  loginPasswordForm.hidden = !changing;
  changeModeButton.textContent = changing ? 'Back to sign in' : 'Change password';
}
loginModeButton.addEventListener('click', () => showLoginMode('login'));
changeModeButton.addEventListener('click', () => showLoginMode('change'));
loginPasswordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.getElementById('login-password-error');
  const submitButton = loginPasswordForm.querySelector('button[type="submit"]');
  const newPassword = document.getElementById('login-new-password').value;
  error.textContent = '';
  if (newPassword !== document.getElementById('login-confirm-password').value) {
    error.textContent = 'New passwords do not match.';
    return;
  }
  submitButton.disabled = true;
  try {
    const username = document.getElementById('change-username').value.trim();
    let response;
    let result = {};
    if (staticDemo) {
      if (username !== 'admin' || document.getElementById('change-current-password').value !== demoPassword()) {
        error.textContent = 'Current password is incorrect.';
        return;
      }
      localStorage.setItem(demoPasswordKey, newPassword);
      response = { ok: true };
    } else {
      response = await fetch('/api/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, currentPassword: document.getElementById('change-current-password').value, newPassword }) });
      result = await response.json();
    }
    if (!response.ok) {
      error.textContent = result.error || 'Could not update password.';
      return;
    }
    loginPasswordForm.reset();
    document.getElementById('login-username').value = username;
    showLoginMode('login');
    document.getElementById('login-error').textContent = 'Password updated. Sign in with your new password.';
  } catch (requestError) {
    error.textContent = 'Cannot reach the password service. Please try again.';
    console.error(requestError);
  } finally {
    submitButton.disabled = false;
  }
});

const accountPanel = document.getElementById('account-panel');
document.getElementById('account-button').addEventListener('click', () => { accountPanel.hidden = false; });
document.getElementById('close-account').addEventListener('click', () => { accountPanel.hidden = true; });
document.getElementById('logout-button').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  accountPanel.hidden = true;
  setLoginVisible(true);
});
document.querySelectorAll('.password-toggle').forEach((toggle) => toggle.addEventListener('click', () => {
  const input = document.getElementById(toggle.dataset.passwordTarget);
  const visible = input.type === 'text';
  input.type = visible ? 'password' : 'text';
  toggle.textContent = visible ? 'Show' : 'Hide';
  toggle.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
}));

document.getElementById('password-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const error = document.getElementById('password-error');
  const newPassword = document.getElementById('new-password').value;
  error.textContent = '';
  if (newPassword !== document.getElementById('confirm-password').value) {
    error.textContent = 'New passwords do not match.';
    return;
  }
  const response = await fetch('/api/change-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ currentPassword: document.getElementById('current-password').value, newPassword }) });
  const result = await response.json();
  if (!response.ok) {
    error.textContent = result.error || 'Could not update password.';
    return;
  }
  event.target.reset();
  accountPanel.hidden = true;
  showToast('Password updated successfully.');
});

checkSession().catch(() => setLoginVisible(true));
