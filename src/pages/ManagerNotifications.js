import { t } from '../utils/i18n.js';
import { getCurrentUser } from '../utils/auth.js';
import { createSidebar } from '../components/Sidebar.js';
import { renderRequestsPage } from './ManagerRequests.js';
import { renderSuppliersPage } from './ManagerSuppliers.js';
import {
  fetchNotifications, markAllRead, markOneRead, getUnreadCount,
  seedDemoNotifications, renderNotificationPanel, renderNotifItem,
  groupNotifications, generateLiveAlerts, buildEmailSimulation,
  NOTIF_TYPES, PRIORITY_COLORS,
} from '../utils/notificationEngine.js';

// ─── module-level refs ────────────────────────────────────────────────────────
let _allNotifs    = [];
let _activeFilter = 'all';
let _userId       = null;

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export async function renderNotificationsPage() {
  const user = await getCurrentUser();
  if (!user) return;
  _userId = user.user.id;
  const app = document.getElementById('app');

  await seedDemoNotifications(_userId);

  app.innerHTML = `
    <div class="app-container">
      ${createSidebar('manager', 'notifications')}
      <div class="main-content">
        <div class="top-bar">
          <div style="display:flex;align-items:center;gap:0.75rem">
            <i class="bi bi-bell-fill" style="font-size:1.3rem;color:var(--accent-color)"></i>
            <h1 class="page-title">${t('notifications.notification_center')}</h1>
            <span id="notif-unread-badge" class="notif-count-badge" style="display:none"></span>
          </div>
          <div style="display:flex;gap:0.5rem;align-items:center">
            <button class="btn btn-secondary" onclick="window.markAllNotifRead()">
              <i class="bi bi-check-all"></i> ${t('notifications.mark_all_read')}
            </button>
          </div>
        </div>

        <!-- Live alerts bar -->
        <div id="notif-live-alerts"></div>

        <div class="notif-page-layout">
          <!-- Main notifications column -->
          <div class="notif-main-col">
            <div class="notif-filter-bar">
              <button class="notif-filter-btn active" onclick="window.setNotifFilter('all',this)">
                ${t('notifications.filter_all')}
              </button>
              <button class="notif-filter-btn" onclick="window.setNotifFilter('unread',this)">
                ${t('notifications.filter_unread')}
              </button>
              <button class="notif-filter-btn" onclick="window.setNotifFilter('approval',this)">
                <i class="bi bi-patch-check"></i> ${t('notifications.cat_approval')}
              </button>
              <button class="notif-filter-btn" onclick="window.setNotifFilter('ai',this)">
                <i class="bi bi-robot"></i> ${t('notifications.cat_ai')}
              </button>
              <button class="notif-filter-btn" onclick="window.setNotifFilter('supplier',this)">
                <i class="bi bi-people"></i> ${t('notifications.cat_supplier')}
              </button>
              <button class="notif-filter-btn" onclick="window.setNotifFilter('delivery',this)">
                <i class="bi bi-truck"></i> ${t('notifications.cat_delivery')}
              </button>
            </div>

            <div id="notif-list">
              <div style="text-align:center;padding:3rem;color:var(--text-muted)">
                <i class="bi bi-hourglass-split" style="font-size:2rem"></i>
                <p>${t('common.loading')}</p>
              </div>
            </div>
          </div>

          <!-- Side column: stats + email simulation -->
          <div class="notif-side-col">
            <div id="notif-stats-card"></div>
            ${buildEmailPanel()}
          </div>
        </div>
      </div>
    </div>`;

  // Wire nav
  window.handleNavClick = async (page) => {
    if      (page === 'dashboard')     { const m = await import('./ManagerDashboard.js');   m.renderManagerDashboard(); }
    else if (page === 'requests')      renderRequestsPage();
    else if (page === 'suppliers')     renderSuppliersPage();
    else if (page === 'notifications') renderNotificationsPage();
    else if (page === 'analytics')     { const m = await import('./ManagerAnalytics.js');   m.renderAnalyticsPage(); }
  };

  // Navigation from clicking a notification with a request link
  window.notifNavigate = async (requestId, category) => {
    if (category === 'approval' || category === 'request' || category === 'supplier' || category === 'delivery') {
      const { renderRequestDetails } = await import('./RequestDetails.js');
      renderRequestDetails(requestId);
    } else if (category === 'analytics') {
      const m = await import('./ManagerAnalytics.js');
      m.renderAnalyticsPage();
    }
  };

  window.setNotifFilter = (filter, btn) => {
    _activeFilter = filter;
    document.querySelectorAll('.notif-filter-btn').forEach(b => b.classList.remove('active'));
    btn?.classList.add('active');
    renderList();
  };

  window.markAllNotifRead = async () => {
    await markAllRead(_userId);
    await load();
  };

  window.markNotifRead = async (id, el) => {
    await markOneRead(id);
    el?.classList.remove('notif-unread');
    el?.querySelector('.notif-unread-dot')?.remove();
    const idx = _allNotifs.findIndex(n => n.id === id);
    if (idx >= 0) _allNotifs[idx].is_read = true;
    updateBadge(_allNotifs.filter(n => !n.is_read).length);
    updateStats();
  };

  window.switchEmailTemplate = (type, btn) => {
    document.querySelectorAll('.notif-email-tab').forEach(b => b.classList.remove('active'));
    btn?.classList.add('active');
    const params = EMAIL_DEMO_PARAMS;
    const sim = buildEmailSimulation(type, params);
    const body = document.getElementById('notif-email-body');
    if (body) body.innerHTML = renderEmailCard(sim);
  };

  await load();
}

// ─────────────────────────────────────────────────────────────────────────────
// LOAD + RENDER HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function load() {
  _allNotifs = await fetchNotifications(_userId);
  renderList();
  renderLiveAlerts();
  updateBadge(_allNotifs.filter(n => !n.is_read).length);
  updateStats();
}

function renderList() {
  const list = document.getElementById('notif-list');
  if (!list) return;

  const filtered = _allNotifs.filter(n => {
    if (_activeFilter === 'unread') return !n.is_read;
    if (_activeFilter !== 'all')    return n.category === _activeFilter;
    return true;
  });

  if (!filtered.length) {
    list.innerHTML = `
      <div class="notif-empty">
        <i class="bi bi-bell-slash" style="font-size:2.5rem;color:var(--text-muted)"></i>
        <p style="color:var(--text-muted);margin-top:0.5rem">${t('notifications.no_notifications')}</p>
      </div>`;
    return;
  }

  list.innerHTML = `<div class="notif-list-inner">${renderNotificationPanel(filtered)}</div>`;
}

function renderLiveAlerts() {
  const container = document.getElementById('notif-live-alerts');
  if (!container) return;
  const alerts = generateLiveAlerts(_allNotifs);
  if (!alerts.length) { container.innerHTML = ''; return; }

  const ALERT_STYLES = {
    danger:  { bg:'#fff1f2', border:'#fecaca', color:'#dc3545' },
    warning: { bg:'#fff7ed', border:'#fed7aa', color:'#e67e22' },
    info:    { bg:'#eff6ff', border:'#bfdbfe', color:'#0d6efd' },
    success: { bg:'#f0fdf4', border:'#bbf7d0', color:'#198754' },
  };

  container.innerHTML = `
    <div class="notif-alerts-bar">
      ${alerts.map(a => {
        const s = ALERT_STYLES[a.type] || ALERT_STYLES.info;
        return `
          <div class="notif-live-alert" style="background:${s.bg};border-color:${s.border};color:${s.color}">
            <i class="bi ${a.icon}" style="flex-shrink:0"></i>
            <span>${a.text}</span>
          </div>`;
      }).join('')}
    </div>`;
}

function updateBadge(count) {
  const badge = document.getElementById('notif-unread-badge');
  if (!badge) return;
  if (count > 0) { badge.textContent = count; badge.style.display = 'inline-flex'; }
  else badge.style.display = 'none';
}

function updateStats() {
  const el = document.getElementById('notif-stats-card');
  if (!el) return;
  const total    = _allNotifs.length;
  const unread   = _allNotifs.filter(n => !n.is_read).length;
  const critical = _allNotifs.filter(n => n.priority === 'critical').length;
  const groups   = groupNotifications(_allNotifs);

  el.innerHTML = `
    <div class="notif-stats-card">
      <div class="notif-stats-title"><i class="bi bi-bar-chart-fill" style="color:var(--accent-color)"></i> ${t('analytics.title')}</div>
      <div class="notif-stats-grid">
        <div class="notif-stat-item">
          <div class="notif-stat-val">${total}</div>
          <div class="notif-stat-lbl">${t('notifications.filter_all')}</div>
        </div>
        <div class="notif-stat-item">
          <div class="notif-stat-val" style="color:var(--accent-color)">${unread}</div>
          <div class="notif-stat-lbl">${t('notifications.filter_unread')}</div>
        </div>
        <div class="notif-stat-item">
          <div class="notif-stat-val" style="color:#dc3545">${critical}</div>
          <div class="notif-stat-lbl">${t('notifications.priority_critical')}</div>
        </div>
      </div>
      <div class="notif-cat-summary">
        ${groups.map(g => `
          <div class="notif-cat-row" onclick="window.setNotifFilter('${g.category}', null)" style="cursor:pointer">
            <span>${g.label}</span>
            <div style="display:flex;align-items:center;gap:0.35rem">
              <span class="notif-cat-count">${g.items.length}</span>
              ${g.unread > 0 ? `<span class="notif-cat-unread-dot">${g.unread}</span>` : ''}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL SIMULATION PANEL
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_TEMPLATES = [
  { key: 'approval_request',        labelKey: 'notifications.cat_approval'  },
  { key: 'procurement_confirmation', labelKey: 'notifications.cat_request'   },
  { key: 'supplier_assignment',      labelKey: 'notifications.cat_supplier'  },
  { key: 'finance_approval',         labelKey: 'notifications.cat_approval'  },
];

const EMAIL_DEMO_PARAMS = {
  requestTitle:  'Laptop Procurement Q2',
  supplierName:  'Tech Solutions Inc',
  recipientName: 'Ahmed Al-Rashidi',
  budget:        42000,
};

function renderEmailCard(sim) {
  if (!sim) return '<p style="color:var(--text-muted);padding:1rem">—</p>';
  return `
    <div class="notif-email-card">
      <div class="notif-email-field">
        <span class="notif-email-field-label">${t('notifications.email_subject')}:</span>
        <span>${sim.subject()}</span>
      </div>
      <div class="notif-email-body-text">${sim.body().replace(/\n/g, '<br>')}</div>
    </div>`;
}

function buildEmailPanel() {
  const sim = buildEmailSimulation('approval_request', EMAIL_DEMO_PARAMS);
  return `
    <div class="notif-email-panel">
      <div class="notif-email-header">
        <i class="bi bi-envelope-fill" style="color:var(--accent-color)"></i>
        <span>${t('notifications.email_simulation')}</span>
        <span class="notif-sim-badge">${t('notifications.simulated_label')}</span>
      </div>
      <div class="notif-email-tabs">
        ${EMAIL_TEMPLATES.map((tpl, i) => `
          <button class="notif-email-tab ${i === 0 ? 'active' : ''}"
            onclick="window.switchEmailTemplate('${tpl.key}',this)">
            ${t(tpl.labelKey)}
          </button>`).join('')}
      </div>
      <div id="notif-email-body">${renderEmailCard(sim)}</div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION BELL (for dashboard top-bars)
// ─────────────────────────────────────────────────────────────────────────────

export async function renderNotificationBell(userId) {
  const count = await getUnreadCount(userId);
  return `
    <button class="notif-bell-btn" onclick="window.handleNavClick('notifications')"
            title="${t('notifications.title')}">
      <i class="bi bi-bell${count > 0 ? '-fill' : ''}"></i>
      ${count > 0 ? `<span class="notif-bell-badge">${count > 99 ? '99+' : count}</span>` : ''}
    </button>`;
}
