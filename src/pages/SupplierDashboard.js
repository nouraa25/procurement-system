import { t } from '../utils/i18n.js';
import { supabase } from '../config/supabase.js';
import { getCurrentUser, getSupplierProfile } from '../utils/auth.js';
import { createSidebar } from '../components/Sidebar.js';
import { renderRequestDetails } from './RequestDetails.js';
import { getCurrentLanguage } from '../utils/i18n.js';

function L(map) { return map[getCurrentLanguage()] ?? map.ar ?? map.en ?? ''; }

function relTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);
  if (m < 1) return L({ ar: 'الآن', en: 'Just now' });
  if (m < 60) return L({ ar: `منذ ${m} دقيقة`, en: `${m}m ago` });
  if (h < 24) return L({ ar: `منذ ${h} ساعة`, en: `${h}h ago` });
  return L({ ar: `منذ ${d} يوم`, en: `${d}d ago` });
}

let currentView = 'dashboard';

export async function renderSupplierDashboard() {
  currentView = 'dashboard';
  await loadDashboard();
}

async function loadDashboard() {
  const user = await getCurrentUser();
  if (!user) return;

  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="app-container">
      ${createSidebar('supplier', currentView)}

      <div class="main-content">
        <div class="top-bar">
          <h1 class="page-title">${t('dashboard.welcome')}</h1>
        </div>

        <div id="dashboard-content">
          <div style="text-align: center; padding: 3rem; color: var(--text-muted);">
            <i class="bi bi-hourglass-split" style="font-size: 3rem; margin-bottom: 1rem;"></i>
            <p>${t('common.loading')}</p>
          </div>
        </div>
      </div>
    </div>
  `;

  window.handleNavClick = (page) => {
    currentView = page;
    if (page === 'dashboard') {
      loadDashboard();
    } else if (page === 'requests') {
      renderIncomingRequests();
    }
  };

  await loadSupplierKPIs();
  await loadIncomingRequests();
}

async function loadSupplierKPIs() {
  try {
    const user = await getCurrentUser();
    const supplierProfile = await getSupplierProfile(user.user.id);

    const { data: assignments } = await supabase
      .from('request_suppliers')
      .select('*')
      .eq('supplier_id', supplierProfile.id);

    const total = assignments?.length || 0;
    const pending = assignments?.filter(a => a.status === 'pending').length || 0;
    const accepted = assignments?.filter(a => a.status === 'accepted').length || 0;
    const rejected = assignments?.filter(a => a.status === 'rejected').length || 0;

    const contentDiv = document.getElementById('dashboard-content');
    contentDiv.innerHTML = `
      <div class="kpi-cards">
        <div class="kpi-card">
          <div class="kpi-header">
            <div>
              <div class="kpi-value">${total}</div>
              <div class="kpi-label">${t('dashboard.total_requests')}</div>
            </div>
            <div class="kpi-icon primary">
              <i class="bi bi-inbox"></i>
            </div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <div>
              <div class="kpi-value">${pending}</div>
              <div class="kpi-label">${t('dashboard.pending_requests')}</div>
            </div>
            <div class="kpi-icon warning">
              <i class="bi bi-clock-history"></i>
            </div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <div>
              <div class="kpi-value">${accepted}</div>
              <div class="kpi-label">${t('dashboard.accepted_requests')}</div>
            </div>
            <div class="kpi-icon success">
              <i class="bi bi-check-circle"></i>
            </div>
          </div>
        </div>

        <div class="kpi-card">
          <div class="kpi-header">
            <div>
              <div class="kpi-value">${rejected}</div>
              <div class="kpi-label">${t('dashboard.rejected_requests')}</div>
            </div>
            <div class="kpi-icon danger">
              <i class="bi bi-x-circle"></i>
            </div>
          </div>
        </div>
      </div>

      <div id="incoming-requests-section"></div>
    `;

    // Animate KPI counters
    requestAnimationFrame(() => {
      document.querySelectorAll('.kpi-value').forEach(el => {
        const target = parseInt(el.textContent) || 0;
        let current = 0;
        const step = Math.max(1, Math.ceil(target / 20));
        const tick = setInterval(() => {
          current = Math.min(current + step, target);
          el.textContent = current;
          if (current >= target) clearInterval(tick);
        }, 40);
      });
    });

  } catch (error) {
    console.error('Error loading supplier KPIs:', error);
  }
}

async function loadIncomingRequests() {
  try {
    const user = await getCurrentUser();
    const supplierProfile = await getSupplierProfile(user.user.id);

    const { data: assignments } = await supabase
      .from('request_suppliers')
      .select('*, procurement_requests(*)')
      .eq('supplier_id', supplierProfile.id)
      .order('assigned_at', { ascending: false })
      .limit(5);

    const section = document.getElementById('incoming-requests-section');

    if (!assignments || assignments.length === 0) {
      section.innerHTML = `
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">${t('dashboard.incoming_requests')}</h3>
          </div>
          <div class="enterprise-empty-state">
            <i class="bi bi-inbox"></i>
            <h5>${L({ ar: 'لا توجد طلبات واردة', en: 'No incoming requests' })}</h5>
            <p>${L({ ar: 'ستظهر هنا الطلبات المُعيَّنة إليك', en: 'Assigned procurement requests will appear here' })}</p>
          </div>
        </div>`;
      return;
    }

    section.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">
            <i class="bi bi-inbox-fill" style="color:var(--accent-color)"></i>
            ${t('dashboard.incoming_requests')}
          </h3>
          <span style="font-size:0.78rem;color:var(--text-muted)">${assignments.length} ${L({ ar: 'طلبات', en: 'requests' })}</span>
        </div>
        <div class="sup-request-cards">
          ${assignments.map(a => {
            const req = a.procurement_requests;
            const daysLeft = Math.ceil((new Date(req.deadline) - Date.now()) / 86400000);
            const urgent   = daysLeft <= 3;
            return `
            <div class="sup-req-card ${urgent ? 'sup-req-urgent' : ''}">
              <div class="sup-req-card-header">
                <div>
                  <div class="sup-req-title">${req.title}</div>
                  <div class="sup-req-meta">
                    <span><i class="bi bi-tag"></i> ${t(`categories.${req.category}`)}</span>
                    <span><i class="bi bi-boxes"></i> ${req.quantity}</span>
                    <span class="sup-req-time">${relTime(a.assigned_at)}</span>
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.35rem">
                  <span class="badge badge-${a.status}">${t(`status.${a.status}`)}</span>
                  ${urgent ? `<span class="sup-req-urgent-badge"><i class="bi bi-lightning-fill"></i> ${L({ ar: 'عاجل', en: 'Urgent' })}</span>` : ''}
                </div>
              </div>
              <div class="sup-req-deadline ${urgent ? 'urgent' : ''}">
                <i class="bi bi-calendar-event"></i>
                ${L({ ar: `تاريخ التسليم: ${new Date(req.deadline).toLocaleDateString('ar-AE')}`, en: `Deadline: ${new Date(req.deadline).toLocaleDateString('en-AE')}` })}
                ${daysLeft > 0 ? ` — ${L({ ar: `${daysLeft} يوم متبقي`, en: `${daysLeft} days left` })}` : ` — ${L({ ar: 'انتهى الموعد', en: 'Overdue' })}`}
              </div>
              <div class="sup-req-actions">
                <button class="btn btn-sm btn-primary" onclick="window.viewRequest('${req.id}')">
                  <i class="bi bi-eye"></i> ${t('requests.view')}
                </button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;

    window.viewRequest = (requestId) => {
      renderRequestDetails(requestId);
    };

  } catch (error) {
    console.error('Error loading incoming requests:', error);
  }
}

async function renderIncomingRequests() {
  const user = await getCurrentUser();
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="app-container">
      ${createSidebar('supplier', 'requests')}

      <div class="main-content">
        <div class="top-bar">
          <h1 class="page-title">${t('dashboard.incoming_requests')}</h1>
        </div>

        <div id="requests-content">
          <div style="text-align: center; padding: 3rem;">
            <i class="bi bi-hourglass-split" style="font-size: 3rem;"></i>
            <p>${t('common.loading')}</p>
          </div>
        </div>
      </div>
    </div>
  `;

  window.handleNavClick = (page) => {
    if (page === 'dashboard') {
      renderSupplierDashboard();
    }
  };

  try {
    const supplierProfile = await getSupplierProfile(user.user.id);

    const { data: assignments } = await supabase
      .from('request_suppliers')
      .select('*, procurement_requests(*)')
      .eq('supplier_id', supplierProfile.id)
      .order('assigned_at', { ascending: false });

    const content = document.getElementById('requests-content');

    if (!assignments || assignments.length === 0) {
      content.innerHTML = `
        <div class="enterprise-empty-state">
          <i class="bi bi-inbox"></i>
          <h5>${L({ ar: 'لا توجد طلبات واردة', en: 'No incoming requests' })}</h5>
          <p>${L({ ar: 'ستظهر هنا الطلبات المُعيَّنة إليك', en: 'Assigned requests will appear here' })}</p>
        </div>`;
      return;
    }

    content.innerHTML = `
      <div class="sup-request-cards">
        ${assignments.map(a => {
          const req = a.procurement_requests;
          const daysLeft = Math.ceil((new Date(req.deadline) - Date.now()) / 86400000);
          const urgent   = daysLeft <= 3;
          return `
          <div class="sup-req-card ${urgent ? 'sup-req-urgent' : ''}">
            <div class="sup-req-card-header">
              <div>
                <div class="sup-req-title">${req.title}</div>
                <div class="sup-req-meta">
                  <span><i class="bi bi-tag"></i> ${t(`categories.${req.category}`)}</span>
                  <span><i class="bi bi-boxes"></i> ${req.quantity}</span>
                  <span class="sup-req-time">${relTime(a.assigned_at)}</span>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.35rem">
                <span class="badge badge-${a.status}">${t(`status.${a.status}`)}</span>
                ${urgent ? `<span class="sup-req-urgent-badge"><i class="bi bi-lightning-fill"></i> ${L({ ar: 'عاجل', en: 'Urgent' })}</span>` : ''}
              </div>
            </div>
            <div class="sup-req-deadline ${urgent ? 'urgent' : ''}">
              <i class="bi bi-calendar-event"></i>
              ${L({ ar: `تاريخ التسليم: ${new Date(req.deadline).toLocaleDateString('ar-AE')}`, en: `Deadline: ${new Date(req.deadline).toLocaleDateString('en-AE')}` })}
              ${daysLeft > 0 ? ` — ${L({ ar: `${daysLeft} يوم متبقي`, en: `${daysLeft} days left` })}` : ` — ${L({ ar: 'انتهى الموعد', en: 'Overdue' })}`}
            </div>
            <div class="sup-req-actions">
              <button class="btn btn-sm btn-primary" onclick="window.viewRequest('${req.id}')">
                <i class="bi bi-eye"></i> ${t('requests.view')}
              </button>
            </div>
          </div>`;
        }).join('')}
      </div>`;

    window.viewRequest = (requestId) => {
      renderRequestDetails(requestId);
    };

  } catch (error) {
    console.error('Error loading requests:', error);
  }
}
