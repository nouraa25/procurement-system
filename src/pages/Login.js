import { t, toggleLanguage } from '../utils/i18n.js';
import { login } from '../utils/auth.js';
import { navigateTo } from '../main.js';

export function renderLoginPage() {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <h2>${t('app_title')}</h2>
          <p>${t('auth.login')}</p>
        </div>

        <div class="lang-switch" style="justify-content: center; margin-bottom: 1.5rem;">
          <button class="lang-btn" onclick="window.toggleLang()">
            <i class="bi bi-translate"></i>
            ${t('auth.login') === 'Login' ? 'عربي' : 'English'}
          </button>
        </div>

        <div id="login-error"></div>

        <form id="login-form">
          <div class="form-group">
            <label class="form-label">${t('auth.email')}</label>
            <input type="email" class="form-control" id="email" required placeholder="${t('auth.email')}">
          </div>

          <div class="form-group">
            <label class="form-label">${t('auth.password')}</label>
            <input type="password" class="form-control" id="password" required placeholder="${t('auth.password')}">
          </div>

          <button type="submit" class="btn btn-primary" style="width: 100%;">
            ${t('auth.login_button')}
          </button>
        </form>

        <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.85rem;">
          <p style="margin-bottom: 0.5rem;"><strong>Manager:</strong> manager@procurement.com</p>
          <p style="margin-bottom: 0.5rem;"><strong>Supplier 1:</strong> supplier1@company.com</p>
          <p style="margin-bottom: 0.5rem;"><strong>Supplier 2:</strong> supplier2@company.com</p>
          <p><strong>Password:</strong> password123</p>
        </div>
      </div>
    </div>
  `;

  window.toggleLang = () => {
    toggleLanguage();
  };

  const form = document.getElementById('login-form');
  form.addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const errorDiv = document.getElementById('login-error');

  errorDiv.innerHTML = '';

  try {
    const { profile } = await login(email, password);

    if (!profile.is_active) {
      throw new Error('Account is inactive');
    }

    if (profile.role === 'manager') {
      navigateTo('managerDashboard');
    } else if (profile.role === 'supplier') {
      navigateTo('supplierDashboard');
    }
  } catch (error) {
    console.error('Login error:', error);
    errorDiv.innerHTML = `
      <div class="alert alert-danger">
        ${t('auth.invalid_credentials')}
      </div>
    `;
  }
}
