import { t, toggleLanguage } from '../utils/i18n.js';
import { logout } from '../utils/auth.js';
import { navigateTo } from '../main.js';

export function createSidebar(role, activePage = 'dashboard', unreadNotifCount = 0) {
  const managerItems = [
    { id: 'dashboard',     icon: 'bi-speedometer2',       label: () => t('nav.dashboard')     },
    { id: 'requests',      icon: 'bi-clipboard-check',    label: () => t('nav.requests')      },
    { id: 'suppliers',     icon: 'bi-people',             label: () => t('nav.suppliers')     },
    { id: 'notifications', icon: 'bi-bell-fill',          label: () => t('nav.notifications'), badge: unreadNotifCount },
    { id: 'analytics',     icon: 'bi-bar-chart-line-fill',label: () => t('nav.analytics')     },
  ];

  const supplierItems = [
    { id: 'dashboard', icon: 'bi-speedometer2',    label: () => t('nav.dashboard') },
    { id: 'requests',  icon: 'bi-inbox',           label: () => t('nav.requests')  },
  ];

  const menuItems = role === 'manager' ? managerItems : supplierItems;

  return `
    <div class="sidebar">
      <div class="sidebar-header">
        <h4>${t('app_title')}</h4>
      </div>

      <nav class="sidebar-nav">
        ${menuItems.map(item => `
          <div class="nav-item ${activePage === item.id ? 'active' : ''}" onclick="window.handleNavClick('${item.id}')">
            <i class="bi ${item.icon}"></i>
            <span>${item.label()}</span>
            ${item.badge > 0 ? `<span class="sidebar-notif-badge">${item.badge > 99 ? '99+' : item.badge}</span>` : ''}
          </div>
        `).join('')}

        <div class="nav-item" onclick="window.toggleLang()">
          <i class="bi bi-translate"></i>
          <span>${t('auth.login') === 'Login' ? 'عربي' : 'English'}</span>
        </div>

        <div class="nav-item" onclick="window.handleLogout()">
          <i class="bi bi-box-arrow-right"></i>
          <span>${t('auth.logout')}</span>
        </div>
      </nav>
    </div>`;
}

window.handleLogout = async () => {
  try {
    await logout();
    navigateTo('login');
  } catch (error) {
    console.error('Logout error:', error);
  }
};

window.toggleLang = () => { toggleLanguage(); };
