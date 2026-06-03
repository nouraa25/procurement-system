import { t } from '../utils/i18n.js';
import { supabase } from '../config/supabase.js';
import { getCurrentUser } from '../utils/auth.js';
import { createSidebar } from '../components/Sidebar.js';
import { renderRequestDetails } from './RequestDetails.js';
import { analyzeRequest, SUPPLIER_TAGS_BY_SCORE, CATEGORY_ICONS, generateSupplierInsight, recomputeForSupplier, approvalWorkflowLabel } from '../utils/aiRequestAssistant.js';
import { createWorkflowForRequest, buildApprovalRoute, getApprovalAlerts, estimateApprovalTime } from '../utils/workflowEngine.js';
import { createNotification } from '../utils/notificationEngine.js';

export async function renderRequestsPage() {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="app-container">
      ${createSidebar('manager', 'requests')}

      <div class="main-content">
        <div class="top-bar">
          <h1 class="page-title">${t('nav.requests')}</h1>
          <button class="btn btn-primary" onclick="window.showCreateRequestModal()">
            <i class="bi bi-plus-circle"></i>
            ${t('requests.create_request')}
          </button>
        </div>

        <div id="requests-content">
          <div style="text-align: center; padding: 3rem;">
            <i class="bi bi-hourglass-split" style="font-size: 3rem; margin-bottom: 1rem;"></i>
            <p>${t('common.loading')}</p>
          </div>
        </div>
      </div>
    </div>

    <div id="create-request-modal" class="modal">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">${t('requests.create_request')}</h3>
          <button class="close-btn" onclick="window.closeModal()">
            <i class="bi bi-x"></i>
          </button>
        </div>
        <div class="modal-body">
          <div class="ai-assistant-panel">
            <div class="ai-assistant-header">
              <span class="ai-assistant-icon">
                <i class="bi bi-stars"></i>
              </span>
              <div>
                <div class="ai-assistant-title">AI Request Assistant</div>
                <div class="ai-assistant-subtitle">${t('requests.ai_assistant_label')}</div>
              </div>
            </div>
            <div class="ai-input-row">
              <textarea
                class="form-control ai-describe-input"
                id="ai-describe-input"
                rows="2"
                placeholder="${t('requests.ai_assistant_placeholder')}"
              ></textarea>
              <button type="button" class="btn ai-generate-btn" onclick="window.runAIAssistant()">
                <i class="bi bi-stars"></i>
                ${t('requests.ai_generate_btn')}
              </button>
            </div>
            <div id="ai-loading" class="ai-loading" style="display:none;">
              <div class="ai-loading-dots">
                <span></span><span></span><span></span>
              </div>
              <span class="ai-loading-text">${t('requests.ai_analyzing')}</span>
            </div>
            <div id="ai-insights-card" class="ai-insights-card" style="display:none;"></div>
          </div>

          <form id="create-request-form">
            <div class="form-group">
              <label class="form-label">${t('requests.title')}</label>
              <input type="text" class="form-control" id="req-title" required>
            </div>

            <div class="form-group">
              <label class="form-label">${t('requests.category')}</label>
              <select class="form-control" id="req-category" required onchange="window.handleCategoryChange()">
                <option value="electronics">${t('categories.electronics')}</option>
                <option value="printing">${t('categories.printing')}</option>
                <option value="furniture">${t('categories.furniture')}</option>
                <option value="stationery">${t('categories.stationery')}</option>
                <option value="software">${t('categories.software')}</option>
                <option value="other">${t('categories.other')}</option>
              </select>
            </div>

            <div class="form-group" id="custom-category-group" style="display: none;">
              <label class="form-label">${t('requests.custom_category')}</label>
              <input type="text" class="form-control" id="custom-category" placeholder="${t('requests.enter_category')}">
            </div>

            <div class="form-group">
              <label class="form-label">${t('requests.description')}</label>
              <textarea class="form-control" id="req-description"></textarea>
            </div>

            <div class="form-group">
              <label class="form-label">${t('requests.quantity')}</label>
              <input type="number" class="form-control" id="req-quantity" required min="1">
            </div>

            <div class="form-group">
              <label class="form-label">${t('requests.deadline')}</label>
              <input type="date" class="form-control" id="req-deadline" required>
            </div>

            <div class="form-group">
              <label class="form-label">${t('requests.supplier_assignment')}</label>
              <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
                <button type="button" class="btn btn-secondary" onclick="window.showManualSupplierSelection()" style="flex: 1;">
                  <i class="bi bi-hand-index"></i>
                  ${t('requests.manual_selection')}
                </button>
                <button type="button" class="btn btn-primary" onclick="window.showAISuggestion()" style="flex: 1;">
                  <i class="bi bi-stars"></i>
                  ${t('requests.ai_suggestion')}
                </button>
              </div>
            </div>

            <div id="selected-suppliers-list"></div>
          </form>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="window.closeModal()">${t('requests.cancel')}</button>
          <button class="btn btn-primary" onclick="window.submitRequest()">${t('requests.submit')}</button>
        </div>
      </div>
    </div>

    <div id="supplier-modal" class="modal">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title" id="supplier-modal-title">${t('suppliers.view_suppliers')}</h3>
          <button class="close-btn" onclick="window.closeAssignSuppliersModal()">
            <i class="bi bi-x"></i>
          </button>
        </div>
        <div class="modal-body">
          <div id="supplier-modal-content"></div>
        </div>
      </div>
    </div>
  `;

  window.handleNavClick = async (page) => {
    if      (page === 'dashboard')     { const m = await import('./ManagerDashboard.js');   m.renderManagerDashboard(); }
    else if (page === 'suppliers')     { const m = await import('./ManagerSuppliers.js');   m.renderSuppliersPage(); }
    else if (page === 'notifications') { const m = await import('./ManagerNotifications.js'); m.renderNotificationsPage(); }
    else if (page === 'analytics')     { const m = await import('./ManagerAnalytics.js');   m.renderAnalyticsPage(); }
    else if (page === 'requests')      renderRequestsPage();
  };

  window.showCreateRequestModal = () => {
    document.getElementById('create-request-modal').classList.add('show');
    window.selectedSuppliers = [];
    window._aiResult = null;
    window._aiSelectedIdx = 0;
    const insightsCard = document.getElementById('ai-insights-card');
    if (insightsCard) { insightsCard.style.display = 'none'; insightsCard.innerHTML = ''; }
    const aiInput = document.getElementById('ai-describe-input');
    if (aiInput) aiInput.value = '';
    // Clear AI badges from labels
    document.querySelectorAll('.ai-gen-badge').forEach(b => b.remove());
    updateSelectedSuppliersList();
  };

  window.closeModal = () => {
    document.getElementById('create-request-modal').classList.remove('show');
  };

  // ── Rendering constants ───────────────────────────────────────────────────

  const PRIORITY_COLORS  = { urgent:'#dc3545', high:'#e67e22', medium:'#17a2b8', low:'#28a745' };
  const PRIORITY_DOT     = { urgent:'🔴', high:'🟠', medium:'🟡', low:'🟢' };
  const INSIGHT_COLORS   = { success:'#198754', warning:'#e67e22', danger:'#dc3545', info:'#0d6efd' };
  const INSIGHT_BG       = { success:'#f0fdf4', warning:'#fff7ed', danger:'#fff1f1', info:'#eff6ff' };
  const INSIGHT_BORDER   = { success:'#bbf7d0', warning:'#fed7aa', danger:'#fecaca', info:'#bfdbfe' };
  const SPEED_ICONS  = { urgent:'⚡', high:'🚀', medium:'📦', low:'🐢' };
  const speedLabel   = (p) => t(`requests.ai_speed_${p === 'urgent' ? 'instant' : p === 'high' ? 'fast' : p === 'low' ? 'flexible' : 'normal'}`);
  const matchLabel   = (pct) => `${pct}% ${t('requests.ai_match_col')}`;
  const RELIABILITY_DATA = () => [
    { label: t('requests.ai_rel_high'),   badge:'🛡', color:'#198754' },
    { label: t('requests.ai_rel_medium'), badge:'✅', color:'#ffc107' },
    { label: t('requests.ai_rel_normal'), badge:'⚪', color:'#6c757d' },
  ];

  function effColor(v)      { return v >= 85 ? '#198754' : v >= 70 ? '#ffc107' : '#dc3545'; }
  function approvalColor(v) { return v >= 80 ? '#198754' : v >= 60 ? '#ffc107' : '#dc3545'; }
  function starRating(n) {
    const full = Math.floor(n), half = (n % 1) >= 0.5 ? 1 : 0;
    return '<i class="bi bi-star-fill" style="color:#f59e0b"></i>'.repeat(full)
      + (half ? '<i class="bi bi-star-half" style="color:#f59e0b"></i>' : '');
  }

  // ── Loading shimmer ───────────────────────────────────────────────────────
  function showShimmer(container) {
    container.innerHTML = `
      <div class="ai-shimmer-wrap">
        <div class="ai-shimmer ai-shimmer-title"></div>
        <div class="ai-shimmer ai-shimmer-bar"></div>
        <div class="ai-shimmer-row">
          <div class="ai-shimmer ai-shimmer-kpi"></div>
          <div class="ai-shimmer ai-shimmer-kpi"></div>
          <div class="ai-shimmer ai-shimmer-kpi"></div>
        </div>
        <div class="ai-shimmer ai-shimmer-card"></div>
        <div class="ai-shimmer ai-shimmer-card ai-shimmer-card-sm"></div>
        <div class="ai-shimmer ai-shimmer-card ai-shimmer-card-sm"></div>
      </div>`;
    container.style.display = 'block';
  }

  // ── KPI row ───────────────────────────────────────────────────────────────
  function buildKpiRow(r, eff, approval) {
    const pc = PRIORITY_COLORS[r.priority] || '#17a2b8';
    const pd = PRIORITY_DOT[r.priority]    || '🟡';
    const ec = effColor(eff), ac = approvalColor(approval);
    return `
      <div class="ai-kpi-row">
        <div class="ai-kpi-item">
          <div class="ai-kpi-label"><i class="bi bi-tag"></i> ${t('requests.ai_category_label')}</div>
          <div class="ai-kpi-value">${t('categories.' + r.category)}</div>
        </div>
        <div class="ai-kpi-item">
          <div class="ai-kpi-label"><i class="bi bi-speedometer2"></i> ${t('requests.ai_priority_label')}</div>
          <div class="ai-kpi-value" style="color:${pc}">${pd} ${r.priorityLabel}</div>
        </div>
        <div class="ai-kpi-item">
          <div class="ai-kpi-label"><i class="bi bi-clock"></i> ${t('requests.ai_delivery_label')}</div>
          <div class="ai-kpi-value">${r.delivery.label()}</div>
        </div>
        <div class="ai-kpi-item">
          <div class="ai-kpi-label"><i class="bi bi-graph-up-arrow"></i> ${t('requests.ai_efficiency_label')}</div>
          <div class="ai-kpi-value" style="color:${ec}" id="ai-dyn-efficiency">${eff}%</div>
        </div>
        <div class="ai-kpi-item">
          <div class="ai-kpi-label"><i class="bi bi-patch-check"></i> ${t('requests.ai_approval_label')}</div>
          <div class="ai-kpi-value" style="color:${ac}" id="ai-dyn-approval">${approval}%</div>
        </div>
        <div class="ai-kpi-item">
          <div class="ai-kpi-label"><i class="bi bi-layers"></i> ${t('requests.ai_complexity_label')}</div>
          <div class="ai-kpi-value" style="color:${r.complexity.color}">${r.complexity.label()}</div>
        </div>
      </div>
      <div class="ai-efficiency-bar-wrap">
        <div class="ai-efficiency-bar" id="ai-dyn-eff-bar" style="width:${eff}%;background:${ec}"></div>
      </div>`;
  }

  // ── Budget tiers — Economy always lowest, Premium always highest ──────────
  function buildTiers(tiers, suppliers) {
    return `
      <div class="ai-section-title"><i class="bi bi-wallet2"></i> ${t('requests.ai_budget_title')}</div>
      <div class="ai-budget-tiers">
        <div class="ai-tier ai-tier-budget">
          <div class="ai-tier-label">💰 ${t('requests.ai_economy_tier')}</div>
          <div class="ai-tier-price">${tiers.budget.price.toLocaleString()} <span class="ai-tier-unit">AED</span></div>
          ${suppliers[1] ? `<div class="ai-tier-supplier"><i class="bi ${CATEGORY_ICONS[suppliers[1].category]||'bi-building'}"></i> ${suppliers[1].name}</div><div class="ai-tier-rating">${starRating(suppliers[1].rating)} ${suppliers[1].rating}</div>` : ''}
        </div>
        <div class="ai-tier ai-tier-standard">
          <div class="ai-tier-badge-top">${t('requests.ai_best_value_badge')}</div>
          <div class="ai-tier-label">⭐ ${t('requests.ai_standard_tier')}</div>
          <div class="ai-tier-price">${tiers.standard.price.toLocaleString()} <span class="ai-tier-unit">AED</span></div>
          ${suppliers[0] ? `<div class="ai-tier-supplier"><i class="bi ${CATEGORY_ICONS[suppliers[0].category]||'bi-building'}"></i> ${suppliers[0].name}</div><div class="ai-tier-rating">${starRating(suppliers[0].rating)} ${suppliers[0].rating}</div>` : ''}
        </div>
        <div class="ai-tier ai-tier-premium">
          <div class="ai-tier-label">💎 ${t('requests.ai_premium_tier')}</div>
          <div class="ai-tier-price">${tiers.premium.price.toLocaleString()} <span class="ai-tier-unit">AED</span></div>
          ${suppliers[2] ? `<div class="ai-tier-supplier"><i class="bi ${CATEGORY_ICONS[suppliers[2].category]||'bi-building'}"></i> ${suppliers[2].name}</div><div class="ai-tier-rating">${starRating(suppliers[2].rating)} ${suppliers[2].rating}</div>` : ''}
        </div>
      </div>`;
  }

  // ── Comparison table ──────────────────────────────────────────────────────
  function buildComparisonTable(suppliers, priority) {
    if (!suppliers.length) return '';
    return `
      <div class="ai-section-title" style="margin-top:1rem;"><i class="bi bi-table"></i> ${t('requests.ai_comparison_title')}</div>
      <div class="ai-comp-scroll-wrap">
        <div class="ai-comparison-table">
          <div class="ai-comp-header">
            <span>${t('requests.ai_supplier_col')}</span>
            <span>${t('requests.ai_rating_col')}</span>
            <span>${t('requests.ai_price_col')}</span>
            <span>${t('requests.ai_delivery_col')}</span>
            <span>${t('requests.ai_reliability_col')}</span>
            <span>${t('requests.ai_match_col')}</span>
          </div>
          ${suppliers.map((s, i) => {
            const rel    = RELIABILITY_DATA()[i] || RELIABILITY_DATA()[2];
            const rowSpd = i === 0 ? `${SPEED_ICONS[priority]||'📦'} ${speedLabel(priority)}` : i === 2 ? `🚀 ${t('requests.ai_speed_fast')}` : `📦 ${t('requests.ai_speed_normal')}`;
            return `
            <div class="ai-comp-row ${i === 0 ? 'ai-comp-top' : ''}" onclick="window.aiSelectSupplier(${i})" style="cursor:pointer">
              <div class="ai-comp-name">
                ${i === 0 ? `<span class="ai-best-value-badge">${t('requests.ai_best_value_badge_table')}</span>` : ''}
                <i class="bi ${CATEGORY_ICONS[s.category]||'bi-building'} ai-comp-cat-icon"></i>
                <span>${s.name}</span>
                ${s.whyNot ? `<span class="ai-rejection-note"><i class="bi bi-info-circle"></i> ${s.whyNot}</span>` : ''}
              </div>
              <div class="ai-comp-rating">${starRating(s.rating)} <strong>${s.rating || '—'}</strong></div>
              <div class="ai-comp-price"><strong>${(s.estimatedPrice || 0).toLocaleString()}</strong> AED</div>
              <div class="ai-comp-cell">${rowSpd}</div>
              <div class="ai-comp-cell" style="color:${rel.color}">${rel.badge} ${rel.label}</div>
              <div class="ai-comp-score">
                <div class="ai-score-bar-wrap"><div class="ai-score-bar" style="width:${s.matchScore}%"></div></div>
                <span class="ai-score-pct">${s.matchScore}%</span>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  // ── Supplier cards ────────────────────────────────────────────────────────
  function buildSupplierCards(suppliers, selectedId, isManualMode) {
    if (!suppliers.length) return '';
    return `
      <div class="ai-section-title" style="margin-top:1rem;">
        <i class="bi bi-people-fill"></i> ${t('requests.ai_supplier_cards_title')}
        <span class="ai-mode-hint">${t('requests.ai_click_to_select')}</span>
      </div>
      <div class="ai-mode-toggle">
        <button class="ai-mode-btn ai-mode-accept ${!isManualMode ? 'active' : ''}"
          onclick="window.aiAcceptRecommendation()">
          <i class="bi bi-stars"></i> ${t('requests.ai_accept_btn')}
        </button>
        <button class="ai-mode-btn ai-mode-manual ${isManualMode ? 'active' : ''}"
          onclick="window.aiManualMode()">
          <i class="bi bi-hand-index"></i> ${t('requests.ai_manual_btn')}
        </button>
      </div>
      ${isManualMode ? `<div class="ai-manual-badge"><i class="bi bi-info-circle"></i> ${t('requests.ai_manual_active')}</div>` : ''}
      <div id="ai-supplier-cards-list">
        ${suppliers.map((s, i) => {
          const isSelected = s.id === selectedId;
          const catIcon = CATEGORY_ICONS[s.category] || 'bi-building';
          const tags = (s.tags || []).map(tag => {
            const info = SUPPLIER_TAGS_BY_SCORE[tag];
            return info ? `<span class="ai-tag" style="background:${info.color}20;color:${info.color};border-color:${info.color}40">${info.label ? info.label() : (info.labelAr || tag)}</span>` : '';
          }).join('');
          return `
            <div class="ai-supplier-card ${isSelected ? 'ai-supplier-card-selected' : ''} ${i === 0 ? 'ai-supplier-card-top' : ''}"
              data-supplier-idx="${i}"
              onclick="window.aiSelectSupplier(${i})">
              <div class="ai-supplier-card-head">
                <div class="ai-supplier-card-name">
                  ${i === 0 ? '<span class="ai-rank-badge">★ #1</span>' : `<span class="ai-rank-num">#${i+1}</span>`}
                  <i class="bi ${catIcon} ai-supplier-cat-icon"></i>
                  <span>${s.name}</span>
                </div>
                <div class="ai-supplier-card-meta">
                  <span class="ai-star-rating">${starRating(s.rating)} ${s.rating || '—'}</span>
                  <span class="ai-match-chip">${matchLabel(s.matchScore)}</span>
                  ${isSelected ? `<span class="ai-selected-badge"><i class="bi bi-check-circle-fill"></i> ${t('requests.ai_current_supplier')}</span>` : ''}
                </div>
              </div>
              <div class="ai-supplier-card-score-bar">
                <div class="ai-supplier-score-fill" style="width:${s.matchScore}%"></div>
              </div>
              ${tags ? `<div class="ai-tag-row">${tags}</div>` : ''}
              <div class="ai-supplier-reason-text"><i class="bi bi-lightbulb"></i> ${s.reason}</div>
              ${s.whyNot && !isSelected ? `<div class="ai-why-not"><i class="bi bi-x-circle"></i> ${s.whyNot}</div>` : ''}
            </div>`;
        }).join('')}
      </div>`;
  }

  // ── Insights ──────────────────────────────────────────────────────────────
  function buildInsights(insights) {
    if (!insights.length) return '';
    return `
      <div class="ai-section-title" style="margin-top:1rem;"><i class="bi bi-robot"></i> ${t('requests.ai_insights_section')}</div>
      <div class="ai-insight-msgs" id="ai-dyn-insights">
        ${insights.map(ins => `
          <div class="ai-insight-msg" style="background:${INSIGHT_BG[ins.type]||'#f8fdf9'};border-color:${INSIGHT_BORDER[ins.type]||'#ddf0e5'}">
            <i class="bi ${ins.icon}" style="color:${INSIGHT_COLORS[ins.type]||'#198754'};flex-shrink:0;margin-top:0.1rem;"></i>
            <span>${ins.text}</span>
          </div>`).join('')}
      </div>`;
  }

  const RISK_ICON     = { danger:'bi-exclamation-octagon-fill', warning:'bi-exclamation-triangle-fill', info:'bi-info-circle-fill' };
  const RISK_COLOR    = { danger:'#dc3545', warning:'#e67e22', info:'#0d6efd' };
  const RISK_BG       = { danger:'#fff1f2', warning:'#fff7ed', info:'#eff6ff' };
  const RISK_BORDER   = { danger:'#fecaca', warning:'#fed7aa', info:'#bfdbfe' };

  function buildRisks(risks) {
    if (!risks.length) return '';
    return `
      <div class="ai-risk-warnings" id="ai-dyn-risks" style="margin-bottom:0.75rem;">
        ${risks.map(r => {
          const sev = typeof r === 'string' ? 'warning' : (r.severity || 'warning');
          const txt = typeof r === 'string' ? r : r.text;
          return `<div class="ai-risk-item" style="background:${RISK_BG[sev]};border-color:${RISK_BORDER[sev]}">
            <i class="bi ${RISK_ICON[sev]}" style="color:${RISK_COLOR[sev]}"></i> ${txt}
          </div>`;
        }).join('')}
      </div>`;
  }

  // ── Final decision box ────────────────────────────────────────────────────
  function buildDecisionBox(supplier, approvalProb, efficiency, complexity, category, totalBudget) {
    if (!supplier) return '';
    const ac        = approvalColor(approvalProb);
    const ec        = effColor(efficiency);
    const riskLabel = t(`requests.ai_risk_${complexity.level}`) || t('requests.ai_risk_medium');
    const riskColor = complexity.color;
    const workflow  = approvalWorkflowLabel(approvalProb, totalBudget || 0);
    const catName   = t(`requests.ai_cat_${category}`) || t('categories.' + category) || category;
    const approvalBg = approvalProb >= 80 ? '#f0fdf4' : approvalProb >= 60 ? '#fff7ed' : '#fff1f2';
    return `
      <div class="ai-decision-box" id="ai-dyn-decision">
        <div class="ai-decision-header">
          <i class="bi bi-clipboard2-check-fill"></i>
          ${t('requests.ai_decision_title')}
          <span class="ai-decision-header-sub">${t('requests.ai_generated_label')}</span>
        </div>
        <div class="ai-decision-supplier-hero">
          <div class="ai-decision-supplier-icon">
            <i class="bi ${CATEGORY_ICONS[supplier.category]||'bi-building'}"></i>
          </div>
          <div>
            <div class="ai-decision-supplier-name">${supplier.name}</div>
            <div class="ai-decision-supplier-sub">${starRating(supplier.rating)} <span style="color:#6c757d;font-size:0.78rem">${supplier.rating}/5</span></div>
          </div>
        </div>
        <div class="ai-decision-reason">${supplier.reason || catName}</div>
        <div class="ai-decision-kpis">
          <div class="ai-decision-kpi" style="background:${approvalBg}">
            <div class="ai-decision-kpi-val" style="color:${ac}">${approvalProb}%</div>
            <div class="ai-decision-kpi-label">${t('requests.ai_decision_approval')}</div>
          </div>
          <div class="ai-decision-kpi">
            <div class="ai-decision-kpi-val" style="color:${riskColor}">${riskLabel}</div>
            <div class="ai-decision-kpi-label">${t('requests.ai_decision_risk')}</div>
          </div>
          <div class="ai-decision-kpi">
            <div class="ai-decision-kpi-val" style="color:${ec}">${efficiency}%</div>
            <div class="ai-decision-kpi-label">${t('requests.ai_decision_efficiency')}</div>
          </div>
        </div>
        <div class="ai-decision-workflow">
          <i class="bi bi-diagram-3-fill"></i> ${workflow}
        </div>
        <div class="ai-decision-footer">${t('requests.ai_generated_label')}</div>
      </div>`;
  }

  function buildSummary(text) {
    if (!text) return '';
    return `
      <div class="ai-summary-box">
        <div class="ai-summary-label"><i class="bi bi-stars"></i> ${t('requests.ai_summary_label')}</div>
        <p class="ai-summary-text" id="ai-dyn-summary">${text}</p>
        <div class="ai-summary-generated">${t('requests.ai_generated_label')}</div>
      </div>`;
  }

  function animateBars(container) {
    requestAnimationFrame(() => {
      container.querySelectorAll('.ai-supplier-score-fill, .ai-score-bar, .ai-efficiency-bar').forEach(bar => {
        const target = bar.style.width;
        bar.style.width = '0%';
        requestAnimationFrame(() => { bar.style.width = target; });
      });
    });
  }

  // ── Main AI runner ────────────────────────────────────────────────────────
  window.runAIAssistant = async () => {
    const input = document.getElementById('ai-describe-input');
    const text = input ? input.value.trim() : '';
    if (!text) {
      input.classList.add('ai-input-shake');
      setTimeout(() => input.classList.remove('ai-input-shake'), 500);
      return;
    }

    const loading      = document.getElementById('ai-loading');
    const insightsCard = document.getElementById('ai-insights-card');
    const generateBtn  = document.querySelector('.ai-generate-btn');

    loading.style.display = 'flex';
    showShimmer(insightsCard);
    if (generateBtn) { generateBtn.disabled = true; generateBtn.classList.add('ai-btn-loading'); }

    try {
      const r = await analyzeRequest(text);
      window._aiResult       = r;
      window._aiSelectedIdx  = 0;
      window._aiManualMode   = false;

      if (r.suppliers[0]) {
        window.selectedSuppliers = [{ id: r.suppliers[0].id, name: r.suppliers[0].name }];
        updateSelectedSuppliersList();
      }

      const setWithBadge = (id, value) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = value;
        el.classList.remove('ai-filled-field');
        void el.offsetWidth;
        el.classList.add('ai-filled-field');
        const label = el.closest('.form-group')?.querySelector('.form-label');
        if (label && !label.querySelector('.ai-gen-badge'))
          label.insertAdjacentHTML('beforeend', '<span class="ai-gen-badge"><i class="bi bi-stars"></i> AI</span>');
      };
      setWithBadge('req-title',       r.title);
      setWithBadge('req-quantity',    r.quantity);
      setWithBadge('req-description', r.description);

      const categorySelect = document.getElementById('req-category');
      const validCats = ['electronics','printing','furniture','stationery','software','other'];
      if (validCats.includes(r.category)) {
        categorySelect.value = r.category;
        window.handleCategoryChange();
        const catLabel = categorySelect.closest('.form-group')?.querySelector('.form-label');
        if (catLabel && !catLabel.querySelector('.ai-gen-badge'))
          catLabel.insertAdjacentHTML('beforeend', '<span class="ai-gen-badge"><i class="bi bi-stars"></i> AI</span>');
      }

      const costBannerHtml = r.delivery.costIncreasePct ? `
        <div class="ai-cost-banner">
          <i class="bi bi-arrow-up-circle-fill"></i>
          ${t('requests.ai_urgent_note')} ${r.delivery.costIncreasePct}%
        </div>` : '';

      insightsCard.innerHTML = `
        <div class="ai-card-topbar">
          <div class="ai-card-topbar-left">
            <i class="bi bi-stars ai-insights-icon"></i>
            <span class="ai-card-title">${t('requests.ai_insights_title')}</span>
          </div>
          <div class="ai-card-topbar-right">
            <div class="ai-confidence-pill" title="Based on request clarity, supplier data, and procurement history.">
              <i class="bi bi-cpu"></i> ${t('requests.ai_confidence')}: ${r.confidence}%
              <i class="bi bi-info-circle" style="opacity:0.75;font-size:0.65rem;"></i>
            </div>
          </div>
        </div>
        <div class="ai-filled-notice">
          <i class="bi bi-check-circle-fill"></i> ${t('requests.ai_filled_notice')}
        </div>
        ${buildKpiRow(r, r.efficiency, r.approvalProb)}
        ${costBannerHtml}
        ${buildRisks(r.risks)}
        ${buildTiers(r.tiers, r.suppliers)}
        ${buildComparisonTable(r.suppliers, r.priority)}
        ${buildSupplierCards(r.suppliers, r.suppliers[0]?.id, false)}
        ${buildInsights(r.insights)}
        ${buildDecisionBox(r.suppliers[0], r.approvalProb, r.efficiency, r.complexity, r.category, r.tiers.standard.price)}
        ${buildSummary(r.summary)}
      `;

      insightsCard.style.display = 'block';
      insightsCard.classList.remove('ai-card-appear');
      void insightsCard.offsetWidth;
      insightsCard.classList.add('ai-card-appear');
      animateBars(insightsCard);

    } catch (err) {
      console.error('AI assistant error:', err);
      document.getElementById('ai-insights-card').style.display = 'none';
    } finally {
      loading.style.display = 'none';
      if (generateBtn) { generateBtn.disabled = false; generateBtn.classList.remove('ai-btn-loading'); }
    }
  };

  // ── Interactive supplier selection ────────────────────────────────────────
  window.aiSelectSupplier = (idx) => {
    const r = window._aiResult;
    if (!r || !r.suppliers[idx]) return;

    window._aiSelectedIdx = idx;
    const supplier = r.suppliers[idx];
    const isManual = idx !== 0;
    window._aiManualMode = isManual;

    window.selectedSuppliers = [{ id: supplier.id, name: supplier.name }];
    updateSelectedSuppliersList();

    const patch = recomputeForSupplier(supplier, r);

    // Highlight cards
    document.querySelectorAll('.ai-supplier-card').forEach((card, i) => {
      const isNow = i === idx;
      card.classList.toggle('ai-supplier-card-selected', isNow);
      const metaEl  = card.querySelector('.ai-supplier-card-meta');
      const badgeEl = card.querySelector('.ai-selected-badge');
      if (isNow && !badgeEl && metaEl)
        metaEl.insertAdjacentHTML('beforeend', `<span class="ai-selected-badge"><i class="bi bi-check-circle-fill"></i> ${t('requests.ai_current_supplier')}</span>`);
      else if (!isNow && badgeEl)
        badgeEl.remove();
    });

    // Mode buttons
    const acceptBtn = document.querySelector('.ai-mode-accept');
    const manualBtn = document.querySelector('.ai-mode-manual');
    if (acceptBtn) acceptBtn.classList.toggle('active', !isManual);
    if (manualBtn) manualBtn.classList.toggle('active', isManual);

    // Manual badge visibility
    const existingManualBadge = document.querySelector('.ai-manual-badge');
    if (isManual && !existingManualBadge) {
      document.querySelector('.ai-mode-toggle')?.insertAdjacentHTML('afterend',
        `<div class="ai-manual-badge ai-insight-new"><i class="bi bi-info-circle"></i> ${t('requests.ai_manual_active')}</div>`);
      setTimeout(() => document.querySelector('.ai-manual-badge')?.classList.remove('ai-insight-new'), 500);
    } else if (!isManual && existingManualBadge) {
      existingManualBadge.remove();
    }

    // KPI update
    const effEl  = document.getElementById('ai-dyn-efficiency');
    const apprEl = document.getElementById('ai-dyn-approval');
    const barEl  = document.getElementById('ai-dyn-eff-bar');
    const ec = effColor(patch.efficiency), ac = approvalColor(patch.approvalProb);
    if (effEl)  { effEl.textContent = patch.efficiency + '%'; effEl.style.color = ec; }
    if (apprEl) { apprEl.textContent = patch.approvalProb + '%'; apprEl.style.color = ac; }
    if (barEl)  { barEl.style.width = patch.efficiency + '%'; barEl.style.background = ec; }

    // Risks
    const risksEl = document.getElementById('ai-dyn-risks');
    if (risksEl)
      risksEl.innerHTML = patch.risks.map(r => {
        const sev = typeof r === 'string' ? 'warning' : (r.severity || 'warning');
        const txt = typeof r === 'string' ? r : r.text;
        return `<div class="ai-risk-item" style="background:${RISK_BG[sev]};border-color:${RISK_BORDER[sev]}">
          <i class="bi ${RISK_ICON[sev]}" style="color:${RISK_COLOR[sev]}"></i> ${txt}
        </div>`;
      }).join('');

    // Summary
    const summaryEl = document.getElementById('ai-dyn-summary');
    if (summaryEl) {
      summaryEl.classList.add('ai-summary-updating');
      setTimeout(() => {
        summaryEl.textContent = patch.summary;
        summaryEl.classList.remove('ai-summary-updating');
      }, 180);
    }

    // Decision box
    const decisionEl = document.getElementById('ai-dyn-decision');
    if (decisionEl) {
      decisionEl.classList.add('ai-summary-updating');
      setTimeout(() => {
        const newBox = buildDecisionBox(supplier, patch.approvalProb, patch.efficiency, r.complexity, r.category, r.tiers.standard.price);
        decisionEl.outerHTML = newBox;
        setTimeout(() => document.getElementById('ai-dyn-decision')?.classList.remove('ai-summary-updating'), 50);
      }, 180);
    }

    // Dynamic insight at top of list
    const insightsEl = document.getElementById('ai-dyn-insights');
    if (insightsEl && patch.insight) {
      const ins = patch.insight;
      const newHtml = `<div class="ai-insight-msg ai-insight-dynamic ai-insight-new"
        style="background:${INSIGHT_BG[ins.type]||'#f8fdf9'};border-color:${INSIGHT_BORDER[ins.type]||'#ddf0e5'}">
        <i class="bi ${ins.icon}" style="color:${INSIGHT_COLORS[ins.type]||'#198754'};flex-shrink:0;margin-top:0.1rem;"></i>
        <span>${ins.text}</span>
      </div>`;
      const existing = insightsEl.querySelector('.ai-insight-dynamic');
      if (existing) existing.outerHTML = newHtml;
      else insightsEl.insertAdjacentHTML('afterbegin', newHtml);
      setTimeout(() => insightsEl.querySelector('.ai-insight-new')?.classList.remove('ai-insight-new'), 500);
    }
  };

  window.aiAcceptRecommendation = () => window.aiSelectSupplier(0);
  window.aiManualMode = () => {
    const r = window._aiResult;
    if (r && r.suppliers.length > 1) window.aiSelectSupplier(1);
  };

  window.closeAssignSuppliersModal = () => {
    document.getElementById('supplier-modal').classList.remove('show');
  };

  window.handleCategoryChange = () => {
    const category = document.getElementById('req-category').value;
    const customGroup = document.getElementById('custom-category-group');

    if (category === 'other') {
      customGroup.style.display = 'block';
    } else {
      customGroup.style.display = 'none';
    }
  };

  window.selectedSuppliers = [];

  window.showManualSupplierSelection = async () => {
    const category = document.getElementById('req-category').value;
    await showSupplierSelection(category, false);
  };

  window.showAISuggestion = async () => {
    const category = document.getElementById('req-category').value;
    await showSupplierSelection(category, true);
  };

  window.submitRequest = async () => {
    await handleCreateRequest();
  };

  window.viewRequest = (requestId) => {
    renderRequestDetails(requestId);
  };

  await loadRequests();
}

async function loadRequests() {
  try {
    const user = await getCurrentUser();

    const { data: requests } = await supabase
      .from('procurement_requests')
      .select('*')
      .eq('created_by', user.user.id)
      .order('created_at', { ascending: false });

    const content = document.getElementById('requests-content');
    if (!content) return;

    if (!requests || requests.length === 0) {
      content.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <i class="bi bi-inbox"></i>
            <p>${t('requests.no_requests')}</p>
          </div>
        </div>
      `;
      return;
    }

    content.innerHTML = `
      <div class="card">
        <div class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>${t('requests.title')}</th>
                <th>${t('requests.category')}</th>
                <th>${t('requests.quantity')}</th>
                <th>${t('requests.deadline')}</th>
                <th>${t('requests.status')}</th>
                <th>${t('requests.actions')}</th>
              </tr>
            </thead>
            <tbody>
              ${requests.map(req => `
                <tr>
                  <td>${req.title}</td>
                  <td>${t(`categories.${req.category}`)}</td>
                  <td>${req.quantity}</td>
                  <td>${new Date(req.deadline).toLocaleDateString()}</td>
                  <td><span class="badge badge-${req.status}">${t(`status.${req.status}`)}</span></td>
                  <td>
                    <button class="btn btn-sm btn-primary" onclick="window.viewRequest('${req.id}')">
                      <i class="bi bi-eye"></i>
                      ${t('requests.view')}
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error loading requests:', error);
    const content = document.getElementById('requests-content');
    if (content) {
      content.innerHTML = `
        <div class="card">
          <div class="empty-state">
            <i class="bi bi-exclamation-circle"></i>
            <p>${t('common.error')}</p>
          </div>
        </div>`;
    }
  }
}

const testSuppliers = [
  { id: 'test-1', name: 'Emirates Technology Solutions', category: 'electronics', rating: 4.8 },
  { id: 'test-2', name: 'Dubai Print House', category: 'printing', rating: 4.5 },
  { id: 'test-3', name: 'Abu Dhabi Furniture Co.', category: 'furniture', rating: 4.7 },
  { id: 'test-4', name: 'Gulf Office Supplies', category: 'stationery', rating: 4.6 },
  { id: 'test-5', name: 'UAE Software Systems', category: 'software', rating: 4.9 },
  { id: 'test-6', name: 'Sharjah Electronics Trading', category: 'electronics', rating: 4.4 },
  { id: 'test-7', name: 'Al Ain Office Equipment', category: 'stationery', rating: 4.3 },
  { id: 'test-8', name: 'Dubai Smart Solutions', category: 'electronics', rating: 4.6 },
];

async function showSupplierSelection(category, isAI) {
  try {
    let suppliers;

    const { data: dbSuppliers } = await supabase
      .from('suppliers')
      .select('*')
      .order('name');

    if (dbSuppliers && dbSuppliers.length > 0) {
      const activeSuppliersOnly = dbSuppliers.filter(s => s.user_id !== null);

      if (isAI) {
        suppliers = activeSuppliersOnly
          .filter(s => s.category === category)
          .sort((a, b) => b.rating - a.rating)
          .slice(0, 3);
        document.getElementById('supplier-modal-title').textContent = t('suppliers.ai_suggestion_title');
      } else {
        suppliers = activeSuppliersOnly;
        document.getElementById('supplier-modal-title').textContent = t('suppliers.view_suppliers');
      }
    } else {
      if (isAI) {
        suppliers = testSuppliers
          .filter(s => s.category === category)
          .sort((a, b) => b.rating - a.rating)
          .slice(0, 3);
        document.getElementById('supplier-modal-title').textContent = t('suppliers.ai_suggestion_title');
      } else {
        suppliers = testSuppliers;
        document.getElementById('supplier-modal-title').textContent = t('suppliers.view_suppliers');
      }
    }

    const modalContent = document.getElementById('supplier-modal-content');

    if (suppliers.length === 0) {
      modalContent.innerHTML = `
        <div class="empty-state">
          <i class="bi bi-inbox"></i>
          <p>لا توجد موردين متاحين</p>
        </div>
      `;
    } else {
      if (isAI) {
        modalContent.innerHTML = `
          <p style="color: var(--text-muted); margin-bottom: 1rem;">${t('suppliers.top_suppliers')}</p>
          <div class="supplier-list">
            ${suppliers.map(supplier => `
              <div class="supplier-item">
                <div class="supplier-info">
                  <h5>${supplier.name}</h5>
                  <p><i class="bi bi-tag"></i> ${t(`categories.${supplier.category}`)}</p>
                  <p><i class="bi bi-star-fill rating"></i> ${supplier.rating}</p>
                </div>
                <button class="btn btn-sm btn-primary" onclick="window.selectSupplier('${supplier.id}', '${supplier.name}')">
                  <i class="bi bi-check-circle"></i>
                  ${t('suppliers.select_supplier')}
                </button>
              </div>
            `).join('')}
          </div>
        `;
      } else {
        modalContent.innerHTML = `
          <div class="form-group">
            <label class="form-label">اختر المورد</label>
            <select class="form-control" id="supplier-select" onchange="window.handleSupplierSelect()">
              <option value="">-- اختر مورد --</option>
              ${suppliers.map(supplier => `
                <option value="${supplier.id}" data-name="${supplier.name}">
                  ${supplier.name} - ${t(`categories.${supplier.category}`)} - ⭐ ${supplier.rating}
                </option>
              `).join('')}
            </select>
          </div>
          <div style="margin-top: 1rem; display: flex; justify-content: flex-end;">
            <button class="btn btn-primary" onclick="window.confirmSupplierSelection()">
              <i class="bi bi-check-circle"></i>
              تأكيد الاختيار
            </button>
          </div>
        `;
      }
    }

    document.getElementById('supplier-modal').classList.add('show');
  } catch (error) {
    console.error('Error loading suppliers:', error);
  }
}

window.handleSupplierSelect = () => {
  // Just track that a supplier was selected
};

window.confirmSupplierSelection = () => {
  const selectElement = document.getElementById('supplier-select');
  const supplierId = selectElement.value;
  const supplierName = selectElement.options[selectElement.selectedIndex].dataset.name;

  if (!supplierId) {
    alert('الرجاء اختيار مورد');
    return;
  }

  if (!window.selectedSuppliers) {
    window.selectedSuppliers = [];
  }

  if (!window.selectedSuppliers.find(s => s.id === supplierId)) {
    window.selectedSuppliers.push({ id: supplierId, name: supplierName });
    updateSelectedSuppliersList();
  }

  window.closeAssignSuppliersModal();
};

window.selectSupplier = (supplierId, supplierName) => {
  if (!window.selectedSuppliers) {
    window.selectedSuppliers = [];
  }

  if (!window.selectedSuppliers.find(s => s.id === supplierId)) {
    window.selectedSuppliers.push({ id: supplierId, name: supplierName });
    updateSelectedSuppliersList();
  }

  window.closeAssignSuppliersModal();
};

function updateSelectedSuppliersList() {
  const listDiv = document.getElementById('selected-suppliers-list');

  if (!window.selectedSuppliers || window.selectedSuppliers.length === 0) {
    listDiv.innerHTML = '';
    return;
  }

  listDiv.innerHTML = `
    <div style="margin-top: 1rem; padding: 1rem; background-color: var(--sidebar-bg); border-radius: 0.5rem;">
      <p style="font-weight: 600; margin-bottom: 0.5rem;">${t('suppliers.assigned_suppliers')}:</p>
      ${window.selectedSuppliers.map(s => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem; margin-bottom: 0.5rem; background-color: var(--card-bg); border-radius: 0.3rem;">
          <span>${s.name}</span>
          <button class="btn btn-sm btn-danger" onclick="window.removeSupplier('${s.id}')">
            <i class="bi bi-x"></i>
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

window.removeSupplier = (supplierId) => {
  window.selectedSuppliers = window.selectedSuppliers.filter(s => s.id !== supplierId);
  updateSelectedSuppliersList();
};

async function handleCreateRequest() {
  try {
    const user = await getCurrentUser();

    if (!user || !user.user || !user.user.id) {
      alert('الرجاء تسجيل الدخول أولاً');
      return;
    }

    const title = document.getElementById('req-title').value;
    let category = document.getElementById('req-category').value;
    const description = document.getElementById('req-description').value;
    const quantity = parseInt(document.getElementById('req-quantity').value);
    const deadline = document.getElementById('req-deadline').value;

    if (!title || !category || !quantity || !deadline) {
      alert('الرجاء ملء جميع الحقول المطلوبة بشكل صحيح');
      return;
    }

    if (category === 'other') {
      const customCategory = document.getElementById('custom-category').value.trim();
      if (customCategory) {
        category = customCategory;
      } else {
        alert('الرجاء إدخال اسم الفئة المخصصة');
        return;
      }
    }

    if (!window.selectedSuppliers || window.selectedSuppliers.length === 0) {
      alert('الرجاء اختيار مورد واحد على الأقل');
      return;
    }

    console.log('Creating request with data:', {
      title,
      category,
      description,
      quantity,
      deadline,
      created_by: user.user.id,
    });

    const { data: request, error: reqError } = await supabase
      .from('procurement_requests')
      .insert({
        title,
        category,
        description,
        budget: window._aiResult?.tiers?.standard?.price ?? 0,
        quantity,
        deadline,
        created_by: user.user.id,
      })
      .select()
      .single();

    if (reqError) {
      console.error('Error creating request:', reqError);
      throw reqError;
    }

    // ── Feature 2: Create approval workflow ──────────────────────────────────
    const aiResult = window._aiResult;
    const estimatedBudget = aiResult?.tiers?.standard?.price || 0;
    const aiPriority      = aiResult?.priority || 'medium';
    await createWorkflowForRequest(request.id, estimatedBudget, aiPriority, category, quantity);

    // ── Feature 3: Create submission notification ─────────────────────────────
    await createNotification(user.user.id, 'request_submitted', { requestTitle: title }, request.id);
    if (estimatedBudget > 50000)
      await createNotification(user.user.id, 'finance_review_required', { requestTitle: title, budget: estimatedBudget }, request.id);

    if (window.selectedSuppliers && window.selectedSuppliers.length > 0) {
      const realSupplierIds = window.selectedSuppliers.filter(s => !s.id.startsWith('test-'));

      if (realSupplierIds.length > 0) {
        const assignments = realSupplierIds.map(s => ({
          request_id: request.id,
          supplier_id: s.id,
        }));

        console.log('Assigning suppliers:', assignments);

        const { error: assignError } = await supabase
          .from('request_suppliers')
          .insert(assignments);

        if (assignError) {
          console.error('Error assigning suppliers:', assignError);
        }
      } else {
        console.log('Only test suppliers selected, skipping assignment');
      }
    }

    window.closeModal();
    document.getElementById('create-request-form').reset();
    document.getElementById('custom-category-group').style.display = 'none';
    window.selectedSuppliers = [];
    await loadRequests();

    const successModal = document.createElement('div');
    successModal.className = 'modal';
    successModal.style.display = 'flex';
    successModal.innerHTML = `
      <div class="modal-dialog" style="max-width: 400px;">
        <div class="modal-body" style="text-align: center; padding: 2rem;">
          <div style="width: 64px; height: 64px; background: #28a745; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
            <i class="bi bi-check-lg" style="font-size: 2rem; color: white;"></i>
          </div>
          <h3 style="margin-bottom: 0.5rem; color: #1a1a1a;">تم إنشاء الطلب بنجاح!</h3>
          <p style="color: #666; margin-bottom: 1.5rem;">سيتم إشعار الموردين المحددين بالطلب الجديد</p>
          <button class="btn btn-primary" onclick="this.closest('.modal').remove()" style="width: 100%;">
            حسناً
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(successModal);
    setTimeout(() => successModal.remove(), 3000);
  } catch (error) {
    console.error('Error creating request:', error);
    alert('حدث خطأ أثناء إنشاء الطلب: ' + (error.message || 'خطأ غير معروف'));
  }
}
