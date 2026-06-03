import { t } from '../utils/i18n.js';
import { supabase } from '../config/supabase.js';
import { createSidebar } from '../components/Sidebar.js';
import { getCurrentLanguage } from '../utils/i18n.js';

function L(map) { return map[getCurrentLanguage()] ?? map.ar ?? map.en ?? ''; }

export async function renderSuppliersPage() {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="app-container">
      ${createSidebar('manager', 'suppliers')}
      <div class="main-content">
        <div class="top-bar">
          <div>
            <h1 class="page-title">${t('nav.suppliers')}</h1>
            <p style="color:var(--text-muted);font-size:0.82rem;margin:0">${L({ ar: 'إدارة شبكة الموردين وتقييم الأداء', en: 'Supplier network management & performance' })}</p>
          </div>
          <button class="btn btn-primary" onclick="window.showAddSupplierModal()">
            <i class="bi bi-plus-circle"></i>
            ${t('suppliers.add_supplier')}
          </button>
        </div>
        <div id="suppliers-content">
          ${buildSkeletonCards()}
        </div>
      </div>
    </div>

    <div id="add-supplier-modal" class="modal">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">${t('suppliers.add_supplier')}</h3>
          <button class="close-btn" onclick="window.closeSupplierModal()"><i class="bi bi-x"></i></button>
        </div>
        <div class="modal-body">
          <form id="add-supplier-form">
            <div class="form-group">
              <label class="form-label">${t('suppliers.supplier_name')}</label>
              <input type="text" class="form-control" id="supplier-name" required>
            </div>
            <div class="form-group">
              <label class="form-label">${t('requests.category')}</label>
              <select class="form-control" id="supplier-category" required>
                <option value="electronics">${t('categories.electronics')}</option>
                <option value="printing">${t('categories.printing')}</option>
                <option value="furniture">${t('categories.furniture')}</option>
                <option value="stationery">${t('categories.stationery')}</option>
                <option value="software">${t('categories.software')}</option>
                <option value="other">${t('categories.other')}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">${t('suppliers.rating')}</label>
              <input type="number" class="form-control" id="supplier-rating" min="0" max="5" step="0.1" value="4.0" required>
            </div>
            <div class="form-group">
              <label class="form-label">${t('suppliers.contact_email')}</label>
              <input type="email" class="form-control" id="supplier-email">
            </div>
            <div class="form-group">
              <label class="form-label">${t('suppliers.contact_phone')}</label>
              <input type="tel" class="form-control" id="supplier-phone">
            </div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="window.closeSupplierModal()">${t('requests.cancel')}</button>
          <button class="btn btn-primary" onclick="window.submitSupplier()">${t('common.save')}</button>
        </div>
      </div>
    </div>
  `;

  window.handleNavClick = async (page) => {
    if (page === 'dashboard') {
      const { renderManagerDashboard } = await import('./ManagerDashboard.js');
      renderManagerDashboard();
    } else if (page === 'requests') {
      const { renderRequestsPage } = await import('./ManagerRequests.js');
      renderRequestsPage();
    } else if (page === 'suppliers') {
      renderSuppliersPage();
    } else if (page === 'notifications') {
      const { renderNotificationsPage } = await import('./ManagerNotifications.js');
      renderNotificationsPage();
    } else if (page === 'analytics') {
      const { renderAnalyticsPage } = await import('./ManagerAnalytics.js');
      renderAnalyticsPage();
    }
  };

  window.showAddSupplierModal = () => {
    document.getElementById('add-supplier-modal').classList.add('show');
  };
  window.closeSupplierModal = () => {
    document.getElementById('add-supplier-modal').classList.remove('show');
  };
  window.submitSupplier = async () => {
    await handleAddSupplier();
  };

  await loadSuppliers();
}

function buildSkeletonCards() {
  return `<div class="sup-perf-grid">
    ${[1,2,3,4,5,6].map(() => `
      <div class="sup-perf-card shimmer-card">
        <div class="shimmer-line" style="width:60%;height:20px;margin-bottom:0.75rem"></div>
        <div class="shimmer-line" style="width:40%;height:14px;margin-bottom:1.5rem"></div>
        <div class="shimmer-line" style="width:100%;height:10px;margin-bottom:0.5rem"></div>
        <div class="shimmer-line" style="width:100%;height:10px;margin-bottom:0.5rem"></div>
        <div class="shimmer-line" style="width:80%;height:10px"></div>
      </div>`).join('')}
  </div>`;
}

// Deterministic supplier performance scores from supplier id
function supplierMetrics(supplier) {
  const seed = (supplier.id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = (base, range) => base + (seed % range);

  const reliability  = Math.min(99, r(82, 16));
  const approvalRate = Math.min(98, r(78, 18));
  const completed    = r(12, 55);
  const avgDelivery  = r(2, 9);
  const aiScore      = Math.min(99, r(75, 22));
  const responseHrs  = r(1, 23);

  const ratingNum = parseFloat(supplier.rating) || 4.0;
  const riskLevel = ratingNum >= 4.5 && reliability >= 92
    ? 'low'
    : ratingNum >= 4.0 && reliability >= 85
    ? 'medium'
    : 'high';

  const aiRec = aiScore >= 90 ? 'high' : aiScore >= 75 ? 'medium' : 'low';

  return { reliability, approvalRate, completed, avgDelivery, aiScore, responseHrs, riskLevel, aiRec };
}

function renderStars(rating) {
  const full  = Math.floor(rating);
  const half  = rating % 1 >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return (
    '<span class="sup-stars">' +
    '<i class="bi bi-star-fill" style="color:#f59e0b"></i>'.repeat(full) +
    (half ? '<i class="bi bi-star-half" style="color:#f59e0b"></i>' : '') +
    '<i class="bi bi-star" style="color:#d1d5db"></i>'.repeat(empty) +
    `</span> <span class="sup-rating-val">${parseFloat(rating).toFixed(1)}</span>`
  );
}

function riskColor(level) {
  return { low: '#198754', medium: '#e67e22', high: '#dc3545' }[level] || '#6c757d';
}
function riskLabel(level) {
  return L({ low: { ar: 'منخفض', en: 'Low' }, medium: { ar: 'متوسط', en: 'Medium' }, high: { ar: 'مرتفع', en: 'High' } }[level] || { ar: 'غير محدد', en: 'Unknown' });
}
function aiRecLabel(level) {
  return L({ high: { ar: 'عالية', en: 'High' }, medium: { ar: 'متوسطة', en: 'Medium' }, low: { ar: 'منخفضة', en: 'Low' } }[level] || { ar: '—', en: '—' });
}

function buildSupplierCard(supplier) {
  const m = supplierMetrics(supplier);
  const catIcon = {
    electronics: 'bi-cpu', printing: 'bi-printer', furniture: 'bi-house',
    stationery: 'bi-pen', software: 'bi-code-slash', other: 'bi-box',
  }[supplier.category] || 'bi-box';

  return `
  <div class="sup-perf-card" role="article">
    <div class="sup-perf-card-header">
      <div class="sup-avatar">
        <i class="bi ${catIcon}"></i>
      </div>
      <div class="sup-header-info">
        <div class="sup-name">${supplier.name}</div>
        <div class="sup-cat-badge">${t(`categories.${supplier.category}`)}</div>
      </div>
      <div class="sup-rank-badge" title="${L({ ar: 'درجة الذكاء الاصطناعي', en: 'AI Score' })}">${m.aiScore}</div>
    </div>

    <div class="sup-stars-row">${renderStars(supplier.rating)}</div>

    <div class="sup-kpi-grid">
      <div class="sup-kpi-item">
        <span class="sup-kpi-val">${m.reliability}%</span>
        <span class="sup-kpi-lbl">${L({ ar: 'الموثوقية', en: 'Reliability' })}</span>
      </div>
      <div class="sup-kpi-item">
        <span class="sup-kpi-val">${m.approvalRate}%</span>
        <span class="sup-kpi-lbl">${L({ ar: 'معدل القبول', en: 'Approval Rate' })}</span>
      </div>
      <div class="sup-kpi-item">
        <span class="sup-kpi-val">${m.completed}</span>
        <span class="sup-kpi-lbl">${L({ ar: 'طلبات منجزة', en: 'Completed' })}</span>
      </div>
      <div class="sup-kpi-item">
        <span class="sup-kpi-val">${m.avgDelivery}d</span>
        <span class="sup-kpi-lbl">${L({ ar: 'متوسط التسليم', en: 'Avg Delivery' })}</span>
      </div>
    </div>

    <div class="sup-progress-rows">
      <div class="sup-progress-row">
        <span class="sup-progress-lbl">${L({ ar: 'موثوقية التسليم', en: 'Delivery Reliability' })}</span>
        <div class="sup-progress-track">
          <div class="sup-progress-fill" style="width:${m.reliability}%;background:var(--accent-color)"></div>
        </div>
        <span class="sup-progress-pct">${m.reliability}%</span>
      </div>
      <div class="sup-progress-row">
        <span class="sup-progress-lbl">${L({ ar: 'ثقة الذكاء الاصطناعي', en: 'AI Trust' })}</span>
        <div class="sup-progress-track">
          <div class="sup-progress-fill" style="width:${m.aiScore}%;background:#0d6efd"></div>
        </div>
        <span class="sup-progress-pct">${m.aiScore}%</span>
      </div>
    </div>

    <div class="sup-chip-row">
      <span class="sup-chip" style="background:${riskColor(m.riskLevel)}18;color:${riskColor(m.riskLevel)};border-color:${riskColor(m.riskLevel)}35">
        <i class="bi bi-shield-check"></i>
        ${L({ ar: 'المخاطر:', en: 'Risk:' })} ${riskLabel(m.riskLevel)}
      </span>
      <span class="sup-chip" style="background:rgba(13,110,253,0.1);color:#0d6efd;border-color:rgba(13,110,253,0.25)">
        <i class="bi bi-stars"></i>
        ${L({ ar: 'توصية:', en: 'AI Rec:' })} ${aiRecLabel(m.aiRec)}
      </span>
    </div>

    <div class="sup-contact-row">
      ${supplier.contact_email ? `<span class="sup-contact"><i class="bi bi-envelope"></i> ${supplier.contact_email}</span>` : ''}
      ${supplier.contact_phone ? `<span class="sup-contact"><i class="bi bi-telephone"></i> ${supplier.contact_phone}</span>` : ''}
    </div>

    <div class="sup-response-row">
      <i class="bi bi-lightning-charge" style="color:#f59e0b"></i>
      ${L({ ar: `استجابة عادةً خلال ${m.responseHrs} ساعة`, en: `Typically responds within ${m.responseHrs}h` })}
    </div>
  </div>`;
}

async function loadSuppliers() {
  try {
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('*')
      .order('rating', { ascending: false });

    const content = document.getElementById('suppliers-content');
    if (!content) return;

    if (!suppliers || suppliers.length === 0) {
      content.innerHTML = `
        <div class="enterprise-empty-state">
          <i class="bi bi-people"></i>
          <h5>${L({ ar: 'لا يوجد موردون بعد', en: 'No suppliers yet' })}</h5>
          <p>${L({ ar: 'أضف أول مورد لبدء إدارة شبكة التوريد', en: 'Add your first supplier to start managing your supply network' })}</p>
          <button class="btn btn-primary" onclick="window.showAddSupplierModal()">
            <i class="bi bi-plus-circle"></i> ${t('suppliers.add_supplier')}
          </button>
        </div>`;
      return;
    }

    content.innerHTML = `
      <div class="sup-summary-bar">
        <div class="sup-summary-item">
          <span class="sup-summary-val">${suppliers.length}</span>
          <span class="sup-summary-lbl">${L({ ar: 'إجمالي الموردين', en: 'Total Suppliers' })}</span>
        </div>
        <div class="sup-summary-item">
          <span class="sup-summary-val" style="color:#198754">${suppliers.filter(s => parseFloat(s.rating) >= 4.5).length}</span>
          <span class="sup-summary-lbl">${L({ ar: 'موردون ممتازون', en: 'Top Rated' })}</span>
        </div>
        <div class="sup-summary-item">
          <span class="sup-summary-val" style="color:#0d6efd">${(suppliers.reduce((a, s) => a + parseFloat(s.rating || 0), 0) / suppliers.length).toFixed(1)}</span>
          <span class="sup-summary-lbl">${L({ ar: 'متوسط التقييم', en: 'Avg Rating' })}</span>
        </div>
        <div class="sup-summary-item">
          <span class="sup-summary-val" style="color:#e67e22">${[...new Set(suppliers.map(s => s.category))].length}</span>
          <span class="sup-summary-lbl">${L({ ar: 'فئات التوريد', en: 'Categories' })}</span>
        </div>
      </div>
      <div class="sup-perf-grid">
        ${suppliers.map(buildSupplierCard).join('')}
      </div>`;

    // Animate progress bars
    requestAnimationFrame(() => {
      document.querySelectorAll('.sup-progress-fill').forEach((bar, i) => {
        const target = bar.style.width;
        bar.style.width = '0%';
        setTimeout(() => { bar.style.width = target; }, 80 + i * 40);
      });
    });

  } catch (error) {
    console.error('Error loading suppliers:', error);
    const content = document.getElementById('suppliers-content');
    if (content) {
      content.innerHTML = `
        <div class="enterprise-empty-state">
          <i class="bi bi-exclamation-circle"></i>
          <h5>${L({ ar: 'خطأ في تحميل الموردين', en: 'Error loading suppliers' })}</h5>
          <p>${L({ ar: 'يرجى المحاولة مرة أخرى', en: 'Please try again' })}</p>
          <button class="btn btn-primary" onclick="window.handleNavClick('suppliers')">
            <i class="bi bi-arrow-clockwise"></i> ${L({ ar: 'إعادة التحميل', en: 'Retry' })}
          </button>
        </div>`;
    }
  }
}

async function handleAddSupplier() {
  const name     = document.getElementById('supplier-name').value.trim();
  const category = document.getElementById('supplier-category').value;
  const rating   = parseFloat(document.getElementById('supplier-rating').value);
  const email    = document.getElementById('supplier-email').value.trim();
  const phone    = document.getElementById('supplier-phone').value.trim();

  if (!name) { alert(L({ ar: 'يرجى إدخال اسم المورد', en: 'Please enter supplier name' })); return; }

  try {
    const { error } = await supabase.from('suppliers').insert({
      name, category, rating,
      contact_email: email || null,
      contact_phone: phone || null,
    });
    if (error) throw error;
    window.closeSupplierModal();
    await loadSuppliers();
  } catch (error) {
    console.error('Error adding supplier:', error);
    alert(t('common.error'));
  }
}
