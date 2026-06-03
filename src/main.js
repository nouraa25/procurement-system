import './styles/main.css';
import { setLanguage, getCurrentLanguage } from './utils/i18n.js';
import { getCurrentUser } from './utils/auth.js';
import { renderLoginPage } from './pages/Login.js';
import { renderManagerDashboard } from './pages/ManagerDashboard.js';
import { renderSupplierDashboard } from './pages/SupplierDashboard.js';

setLanguage(getCurrentLanguage());

let currentPage = null;

export async function init() {
  const user = await getCurrentUser();

  if (!user) {
    renderLoginPage();
    return;
  }

  if (user.profile.role === 'manager') {
    currentPage = 'dashboard';
    renderManagerDashboard();
  } else if (user.profile.role === 'supplier') {
    currentPage = 'dashboard';
    renderSupplierDashboard();
  }
}

export function navigateTo(page, data = {}) {
  currentPage = page;
  window.appState = { ...window.appState, currentPage, pageData: data };

  if (page === 'login') {
    renderLoginPage();
  } else if (page === 'managerDashboard') {
    renderManagerDashboard();
  } else if (page === 'supplierDashboard') {
    renderSupplierDashboard();
  }
}

window.navigateTo = navigateTo;

init().catch(err => {
  console.error('App init error:', err);
  const app = document.getElementById('app');
  if (app && !app.innerHTML.trim()) {
    app.innerHTML = `<div style="padding:2rem;text-align:center;color:#dc3545">
      <p>Failed to start application. Please refresh.</p>
      <small>${err.message}</small>
    </div>`;
  }
});
