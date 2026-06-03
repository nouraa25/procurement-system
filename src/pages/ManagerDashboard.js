import { t } from '../utils/i18n.js';
import { supabase } from '../config/supabase.js';
import { getCurrentUser } from '../utils/auth.js';
import { createSidebar } from '../components/Sidebar.js';
import { renderRequestsPage } from './ManagerRequests.js';
import { renderSuppliersPage } from './ManagerSuppliers.js';
import { renderNotificationsPage, renderNotificationBell } from './ManagerNotifications.js';
import { renderAnalyticsPage } from './ManagerAnalytics.js';
import { getUnreadCount } from '../utils/notificationEngine.js';
import { getCurrentLanguage } from '../utils/i18n.js';

function L(map) { return map[getCurrentLanguage()] ?? map.ar ?? map.en ?? ''; }

let currentView = 'dashboard';

export async function renderManagerDashboard() {
  currentView = 'dashboard';
  await loadDashboard();
}

async function loadDashboard() {
  const user = await getCurrentUser();
  if (!user) return;

  const unreadCount = await getUnreadCount(user.user.id);
  const bellHtml    = await renderNotificationBell(user.user.id);

  // Guard: user may have navigated away while we were loading
  if (currentView !== 'dashboard') return;

  const app         = document.getElementById('app');

  app.innerHTML = `
    <div class="app-container">
      ${createSidebar('manager', currentView, unreadCount)}
      <div class="main-content">
        <div class="top-bar">
          <h1 class="page-title">${t('nav.dashboard')}</h1>
          <div style="display:flex;align-items:center;gap:0.75rem">
            ${bellHtml}
            <button class="btn btn-primary" onclick="window.handleNavClick('analytics')">
              <i class="bi bi-bar-chart-line-fill"></i> ${t('analytics.title')}
            </button>
          </div>
        </div>
        <div id="dashboard-content">
          <div style="text-align:center;padding:3rem;color:var(--text-muted)">
            <i class="bi bi-hourglass-split" style="font-size:3rem;margin-bottom:1rem;"></i>
            <p>${t('common.loading')}</p>
          </div>
        </div>
      </div>
    </div>`;

  window.handleNavClick = async (page) => {
    currentView = page;
    if      (page === 'dashboard')     await loadDashboard();
    else if (page === 'requests')      renderRequestsPage();
    else if (page === 'suppliers')     renderSuppliersPage();
    else if (page === 'notifications') renderNotificationsPage();
    else if (page === 'analytics')     renderAnalyticsPage();
  };

  await loadKPIs(user);
  await loadRecentRequests(user);
  loadActivityFeed(user);
}

async function loadKPIs(user) {
  try {
    const { data: requests } = await supabase
      .from('procurement_requests')
      .select('*')
      .eq('created_by', user.user.id);

    const total    = requests?.length || 0;
    const pending  = requests?.filter(r => r.status === 'pending').length || 0;

    const { data: assignments } = await supabase
      .from('request_suppliers')
      .select('*, procurement_requests!inner(*)')
      .eq('procurement_requests.created_by', user.user.id);

    const accepted = assignments?.filter(a => a.status === 'accepted').length || 0;
    const rejected = assignments?.filter(a => a.status === 'rejected').length || 0;

    // Approval workflow metrics
    const { data: workflows } = await supabase.from('approval_workflows').select('*');
    const pendingApprovals  = workflows?.filter(w => w.status === 'pending').length  || 0;
    const delayedApprovals  = workflows?.filter(w => {
      return w.status === 'pending' && (Date.now() - new Date(w.created_at).getTime()) > 3 * 86400000;
    }).length || 0;

    const contentDiv = document.getElementById('dashboard-content');
    if (!contentDiv) return;
    contentDiv.innerHTML = `
      <div class="kpi-cards">
        <div class="kpi-card">
          <div class="kpi-header">
            <div><div class="kpi-value">${total}</div><div class="kpi-label">${t('dashboard.total_requests')}</div></div>
            <div class="kpi-icon primary"><i class="bi bi-clipboard-check"></i></div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-header">
            <div><div class="kpi-value">${pending}</div><div class="kpi-label">${t('dashboard.pending_requests')}</div></div>
            <div class="kpi-icon warning"><i class="bi bi-clock-history"></i></div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-header">
            <div><div class="kpi-value">${accepted}</div><div class="kpi-label">${t('dashboard.accepted_requests')}</div></div>
            <div class="kpi-icon success"><i class="bi bi-check-circle"></i></div>
          </div>
        </div>
        <div class="kpi-card">
          <div class="kpi-header">
            <div><div class="kpi-value">${rejected}</div><div class="kpi-label">${t('dashboard.rejected_requests')}</div></div>
            <div class="kpi-icon danger"><i class="bi bi-x-circle"></i></div>
          </div>
        </div>
      </div>

      ${pendingApprovals > 0 || delayedApprovals > 0 ? `
        <div class="dash-approval-bar">
          ${pendingApprovals > 0 ? `
            <div class="dash-approval-chip warning">
              <i class="bi bi-clock-history"></i>
              ${t('analytics.pending_approvals')}: <strong>${pendingApprovals}</strong>
            </div>` : ''}
          ${delayedApprovals > 0 ? `
            <div class="dash-approval-chip danger">
              <i class="bi bi-exclamation-triangle-fill"></i>
              ${t('analytics.delayed_approvals')}: <strong>${delayedApprovals}</strong>
            </div>` : ''}
          <button class="btn btn-sm btn-primary" onclick="window.handleNavClick('analytics')">
            <i class="bi bi-bar-chart-line-fill"></i> ${t('analytics.title')}
          </button>
        </div>` : ''}

      <div id="recent-requests-section"></div>
      <div id="activity-feed-section"></div>`;

    // Animate KPI counters
    requestAnimationFrame(() => {
      document.querySelectorAll('.kpi-value').forEach(el => {
        const target = parseInt(el.textContent) || 0;
        let current  = 0;
        const step   = Math.max(1, Math.ceil(target / 20));
        const tick   = setInterval(() => {
          current = Math.min(current + step, target);
          el.textContent = current;
          if (current >= target) clearInterval(tick);
        }, 40);
      });
    });

  } catch (error) {
    console.error('Error loading KPIs:', error);
  }
}

async function loadRecentRequests(user) {
  try {
    const { data: requests } = await supabase
      .from('procurement_requests')
      .select('*')
      .eq('created_by', user.user.id)
      .order('created_at', { ascending: false })
      .limit(5);

    const section = document.getElementById('recent-requests-section');
    if (!section) return;

    if (!requests || requests.length === 0) {
      section.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">${t('requests.request_details')}</h3>
            <button class="btn btn-primary" onclick="window.handleNavClick('requests')">
              <i class="bi bi-plus-circle"></i> ${t('requests.create_request')}
            </button>
          </div>
          <div class="empty-state"><i class="bi bi-inbox"></i><p>${t('common.loading')}</p></div>
        </div>`;
      return;
    }

    const requestsWithSuppliers = await Promise.all(requests.map(async req => {
      const { data: assignments } = await supabase
        .from('request_suppliers')
        .select('*, suppliers(*)')
        .eq('request_id', req.id);

      const suppliersWithUnread = await Promise.all((assignments || []).map(async a => {
        if (!a.suppliers?.user_id) return { ...a, unreadCount: 0 };
        const { count } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('request_id', req.id)
          .eq('sender_id', a.suppliers.user_id)
          .eq('receiver_id', user.user.id)
          .eq('is_read', false);
        return { ...a, unreadCount: count || 0 };
      }));

      return { ...req, allSuppliers: suppliersWithUnread };
    }));

    section.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${t('nav.requests')}</h3>
          <button class="btn btn-primary" onclick="window.handleNavClick('requests')">
            <i class="bi bi-plus-circle"></i> ${t('requests.create_request')}
          </button>
        </div>
        <div class="table-responsive">
          <table class="table">
            <thead><tr>
              <th>${t('requests.title')}</th>
              <th>${t('requests.category')}</th>
              <th>${t('requests.quantity')}</th>
              <th>${t('requests.deadline')}</th>
              <th>${t('requests.status')}</th>
            </tr></thead>
            <tbody>
              ${requestsWithSuppliers.map(req => `
                <tr>
                  <td>${req.title}</td>
                  <td>${t('categories.' + req.category)}</td>
                  <td>${req.quantity}</td>
                  <td>${new Date(req.deadline).toLocaleDateString()}</td>
                  <td>
                    <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
                      <span class="badge badge-${req.status}">${t('status.' + req.status)}</span>
                      ${req.allSuppliers.map(a => `
                        <button class="btn btn-sm btn-primary" style="position:relative"
                          onclick="window.openDashboardChat('${req.id}','${a.suppliers?.user_id}','${a.suppliers?.name}')"
                          title="${t('chat.chat')}">
                          <i class="bi bi-chat-dots"></i>
                          ${a.unreadCount > 0 ? `<span class="notification-badge">${a.unreadCount}</span>` : ''}
                        </button>`).join('')}
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;

    window.openDashboardChat = async (requestId, otherUserId, otherUserName) => {
      document.querySelectorAll('.notification-badge').forEach(b => {
        b.style.opacity = '0'; b.style.transform = 'scale(0)';
        setTimeout(() => b.remove(), 300);
      });
      const { renderChatModal } = await import('./RequestDetails.js');
      await renderChatModal(requestId, otherUserId, otherUserName);
      setTimeout(() => loadRecentRequests(user), 500);
    };

  } catch (error) {
    console.error('Error loading requests:', error);
  }
}

async function loadActivityFeed(user) {
  try {
    const [{ data: recentRequests }, { data: recentDocs }, { data: recentAssignments }] = await Promise.all([
      supabase.from('procurement_requests').select('id,title,status,created_at,category').order('created_at', { ascending: false }).limit(4),
      supabase.from('procurement_documents').select('id,title,doc_type,uploader_role,created_at,file_name').order('created_at', { ascending: false }).limit(4),
      supabase.from('request_suppliers').select('id,status,assigned_at,responded_at,suppliers(name)').order('assigned_at', { ascending: false }).limit(4),
    ]);

    const events = [];

    (recentRequests || []).forEach(r => {
      events.push({
        time: new Date(r.created_at),
        icon: 'bi-file-earmark-plus',
        color: '#0d6efd',
        text: L({ ar: `تم إنشاء طلب: "${r.title}"`, en: `Request created: "${r.title}"` }),
      });
    });

    (recentDocs || []).forEach(d => {
      const byRole = d.uploader_role === 'supplier'
        ? L({ ar: 'المورد', en: 'Supplier' })
        : L({ ar: 'المدير', en: 'Manager' });
      events.push({
        time: new Date(d.created_at),
        icon: d.doc_type === 'quotation' ? 'bi-receipt' : 'bi-file-earmark-arrow-up',
        color: d.doc_type === 'quotation' ? '#198754' : '#e67e22',
        text: L({
          ar: `${byRole} رفع ${d.doc_type === 'quotation' ? 'عرض سعر' : 'مستنداً'}: "${d.title || d.file_name}"`,
          en: `${byRole} uploaded ${d.doc_type === 'quotation' ? 'quotation' : 'document'}: "${d.title || d.file_name}"`,
        }),
      });
    });

    (recentAssignments || []).forEach(a => {
      if (a.status !== 'pending') {
        events.push({
          time: new Date(a.responded_at || a.assigned_at),
          icon: a.status === 'accepted' ? 'bi-check-circle' : 'bi-x-circle',
          color: a.status === 'accepted' ? '#198754' : '#dc3545',
          text: L({
            ar: `${a.suppliers?.name ?? 'مورد'} ${a.status === 'accepted' ? 'قبل' : 'رفض'} الطلب`,
            en: `${a.suppliers?.name ?? 'Supplier'} ${a.status === 'accepted' ? 'accepted' : 'rejected'} request`,
          }),
        });
      }
    });

    events.sort((a, b) => b.time - a.time);
    const top = events.slice(0, 8);

    const section = document.getElementById('activity-feed-section');
    if (!section) return;

    if (top.length === 0) {
      section.innerHTML = '';
      return;
    }

    const relTime = (date) => {
      const diff = Date.now() - date.getTime();
      const m = Math.floor(diff / 60000);
      const h = Math.floor(diff / 3600000);
      const d = Math.floor(diff / 86400000);
      if (m < 1) return L({ ar: 'الآن', en: 'Just now' });
      if (m < 60) return L({ ar: `منذ ${m} دقيقة`, en: `${m}m ago` });
      if (h < 24) return L({ ar: `منذ ${h} ساعة`, en: `${h}h ago` });
      return L({ ar: `منذ ${d} يوم`, en: `${d}d ago` });
    };

    section.innerHTML = `
      <div class="card act-feed-card">
        <div class="card-header">
          <h3 class="card-title">
            <i class="bi bi-activity" style="color:var(--accent-color)"></i>
            ${L({ ar: 'النشاط الأخير', en: 'Live Activity' })}
          </h3>
          <span class="act-feed-live-badge">
            <span class="act-live-dot"></span>
            ${L({ ar: 'مباشر', en: 'Live' })}
          </span>
        </div>
        <div class="act-feed-list">
          ${top.map(ev => `
            <div class="act-feed-item">
              <div class="act-feed-icon" style="background:${ev.color}15;color:${ev.color}">
                <i class="bi ${ev.icon}"></i>
              </div>
              <div class="act-feed-content">
                <div class="act-feed-text">${ev.text}</div>
                <div class="act-feed-time">${relTime(ev.time)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  } catch (err) {
    console.error('Activity feed error', err);
  }
}
