import { t } from '../utils/i18n.js';
import { getCurrentUser } from '../utils/auth.js';
import { createSidebar } from '../components/Sidebar.js';
import { renderRequestsPage } from './ManagerRequests.js';
import { renderSuppliersPage } from './ManagerSuppliers.js';
import { renderNotificationsPage } from './ManagerNotifications.js';
import {
  fetchAnalyticsData, computeKPIs, computeCategoryBreakdown, computeMonthlyTrend,
  computeSupplierPerformance, detectProcurementRisks, generateAnalyticsInsights,
  generateForecast, computeHealthScores, generateSmartRecommendations,
  CAT_COLORS, estimateSpend,
} from '../utils/analyticsEngine.js';

// ─── module-level state so event listeners can always reference latest data ──
let _trend     = [];
let _breakdown = [];
let _supplierPerf = [];
let _activeCatFilter = null;   // null = all, string = single category
let _activeMonthFilter = null; // null = all, number = month index
let _chartTooltipEl = null;

export async function renderAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) return;
  const app = document.getElementById('app');

  // Reset filters on page load
  _activeCatFilter   = null;
  _activeMonthFilter = null;

  app.innerHTML = `
    <div class="app-container">
      ${createSidebar('manager', 'analytics')}
      <div class="main-content">
        <div class="top-bar">
          <div>
            <h1 class="page-title">
              <i class="bi bi-bar-chart-line-fill" style="color:var(--accent-color);margin-inline-end:0.5rem;"></i>
              ${t('analytics.title')}
            </h1>
            <div style="font-size:0.82rem;color:var(--text-muted);margin-top:0.2rem;">${t('analytics.subtitle')}</div>
          </div>
          <button class="btn btn-secondary" onclick="window.refreshAnalytics()" title="${t('common.loading')}">
            <i class="bi bi-arrow-clockwise"></i>
          </button>
        </div>
        <div id="analytics-content">
          <div class="an-shimmer-wrap">
            ${[...Array(6)].map(() => '<div class="an-shimmer an-shimmer-kpi"></div>').join('')}
          </div>
        </div>
      </div>
    </div>`;

  window.handleNavClick = async (page) => {
    if      (page === 'dashboard')     { const m = await import('./ManagerDashboard.js'); m.renderManagerDashboard(); }
    else if (page === 'requests')      renderRequestsPage();
    else if (page === 'suppliers')     renderSuppliersPage();
    else if (page === 'notifications') renderNotificationsPage();
    else if (page === 'analytics')     renderAnalyticsPage();
  };

  window.refreshAnalytics = () => renderAnalyticsPage();

  await loadAndRender(user.user.id);
}

async function loadAndRender(userId) {
  const { requests, assigns, suppliers, workflows } = await fetchAnalyticsData(userId);

  const kpis       = computeKPIs(requests, assigns, suppliers, workflows);
  const breakdown  = computeCategoryBreakdown(requests);
  const trend      = computeMonthlyTrend(requests);
  const suppPerf   = computeSupplierPerformance(assigns, suppliers);
  const risks      = detectProcurementRisks(requests, assigns, workflows);
  const insights   = generateAnalyticsInsights(kpis, breakdown, trend, suppPerf);
  const forecast   = generateForecast(trend, kpis);
  const health     = computeHealthScores(kpis, suppPerf);
  const recs       = generateSmartRecommendations(kpis, breakdown, suppPerf);

  _trend        = trend;
  _breakdown    = breakdown;
  _supplierPerf = suppPerf;

  const content = document.getElementById('analytics-content');
  if (!content) return;

  const hasData = requests.length > 0;
  content.innerHTML = hasData
    ? buildPage(kpis, breakdown, trend, suppPerf, risks, insights, forecast, health, recs)
    : buildEmptyState();

  if (!hasData) return;

  // Attach tooltip container
  _chartTooltipEl = document.getElementById('an-chart-tooltip');

  requestAnimationFrame(() => {
    drawTrendChart();
    drawCategoryChart();
    animateBars();
    attachSupplierTooltips();
  });

  // Filter handlers
  window.anFilterCat = (cat, btn) => {
    _activeCatFilter = _activeCatFilter === cat ? null : cat;
    document.querySelectorAll('.an-cat-legend-btn').forEach(b => b.classList.remove('active'));
    if (_activeCatFilter) btn.classList.add('active');
    drawTrendChartFiltered();
    drawCategoryChart();
  };

  window.anResetFilters = () => {
    _activeCatFilter   = null;
    _activeMonthFilter = null;
    document.querySelectorAll('.an-cat-legend-btn').forEach(b => b.classList.remove('active'));
    drawTrendChart();
    drawCategoryChart();
  };

  // Workflow decision handler (used from workflow cards if embedded)
  window.workflowDecide = async (stepId, status) => {
    const comment = status !== 'approved'
      ? prompt(t('workflow.comment_placeholder') || 'Add a comment (optional):') || ''
      : '';
    const { updateWorkflowStep } = await import('../utils/workflowEngine.js');
    await updateWorkflowStep(stepId, status, comment);
    await renderAnalyticsPage();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────

function buildEmptyState() {
  return `
    <div class="an-empty-state">
      <div class="an-empty-icon"><i class="bi bi-bar-chart-line"></i></div>
      <h3>${t('analytics.title')}</h3>
      <p>${t('common.loading')}</p>
      <p style="color:var(--text-muted);font-size:0.85rem;max-width:340px">
        ${t('analytics.subtitle')}
      </p>
      <button class="btn btn-primary" onclick="window.handleNavClick('requests')">
        <i class="bi bi-plus-circle"></i> ${t('requests.create_request')}
      </button>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE LAYOUT
// ─────────────────────────────────────────────────────────────────────────────

function buildPage(kpis, breakdown, trend, suppPerf, risks, insights, forecast, health, recs) {
  return `
    <div id="an-chart-tooltip" class="an-chart-tooltip" style="display:none"></div>
    ${buildKPICards(kpis)}
    ${buildHealthScores(health)}
    <div class="an-row">
      <div class="an-col-60">
        ${buildTrendSection(trend)}
        ${buildSupplierTable(suppPerf)}
      </div>
      <div class="an-col-40">
        ${buildCategorySection(breakdown)}
        ${buildForecastCard(forecast)}
      </div>
    </div>
    ${buildAIInsights(insights)}
    ${buildRisksSection(risks)}
    ${buildRecommendations(recs)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI CARDS
// ─────────────────────────────────────────────────────────────────────────────

function buildKPICards(kpis) {
  const cards = [
    { icon:'bi-cash-coin',         color:'#198754', label:t('analytics.total_spend'),
      value: kpis.totalSpend.toLocaleString() + ' AED',
      sub: kpis.totalRequests + ' ' + t('analytics.requests_count'), trend:null },
    { icon:'bi-graph-up',          color:'#0d6efd', label:t('analytics.monthly_volume'),
      value: kpis.monthlyVolume.toLocaleString() + ' AED',
      sub: t('dashboard.pending_requests') + ': ' + kpis.pendingApprovals, trend:null },
    { icon:'bi-people-fill',       color:'#20c997', label:t('analytics.active_suppliers'),
      value: kpis.activeSuppliers,
      sub: t('analytics.delivery_performance'), trend:null },
    { icon:'bi-patch-check-fill',  color:'#f59e0b', label:t('analytics.approval_rate'),
      value: kpis.approvalRate + '%',
      sub: t('analytics.delayed_approvals') + ': ' + kpis.delayedApprovals,
      trend: kpis.approvalRate >= 75 ? 'up' : 'down' },
    { icon:'bi-clock-fill',        color:'#e67e22', label:t('analytics.avg_procurement_time'),
      value: kpis.avgApprovalDays + ' ' + t('analytics.days'),
      sub: t('analytics.avg_approval_time'),
      trend: kpis.avgApprovalDays <= 2 ? 'up' : 'down' },
    { icon:'bi-speedometer2',      color:'#8b5cf6', label:t('analytics.efficiency_score'),
      value: kpis.efficiencyScore + '%',
      sub: t('analytics.workflow_efficiency'),
      trend: kpis.efficiencyScore >= 70 ? 'up' : 'down' },
  ];
  return `
    <div class="an-kpi-grid">
      ${cards.map(c => `
        <div class="an-kpi-card" style="--kpi-color:${c.color}">
          <div class="an-kpi-icon-wrap" style="background:${c.color}18">
            <i class="bi ${c.icon}" style="color:${c.color}"></i>
          </div>
          <div class="an-kpi-body">
            <div class="an-kpi-value">${c.value}</div>
            <div class="an-kpi-label">${c.label}</div>
            <div class="an-kpi-sub">
              ${c.trend ? `<i class="bi bi-arrow-${c.trend}-short" style="color:${c.trend==='up'?'#198754':'#dc3545'}"></i>` : ''}
              ${c.sub}
            </div>
          </div>
        </div>`).join('')}
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH SCORES
// ─────────────────────────────────────────────────────────────────────────────

function buildHealthScores(h) {
  const items = [
    { label:t('analytics.procurement_health'),    score:h.procurementHealth    },
    { label:t('analytics.supplier_intelligence'), score:h.supplierIntelligence },
    { label:t('analytics.workflow_efficiency'),   score:h.workflowEfficiency   },
    { label:t('analytics.financial_score'),       score:h.financialScore       },
  ];
  return `
    <div class="an-card an-health-card">
      <div class="an-card-title"><i class="bi bi-heart-pulse-fill"></i> ${t('analytics.procurement_health')}</div>
      <div class="an-health-grid">
        ${items.map(item => `
          <div class="an-health-item">
            <div class="an-health-row">
              <span class="an-health-label">${item.label}</span>
              <span class="an-health-score" style="color:${h.healthColor(item.score)}">
                ${item.score}% <small>${h.healthLabel(item.score)}</small>
              </span>
            </div>
            <div class="an-health-bar-wrap">
              <div class="an-health-bar an-animate-bar"
                   data-target="${item.score}"
                   style="background:${h.healthColor(item.score)};width:0%"></div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TREND CHART — interactive canvas
// ─────────────────────────────────────────────────────────────────────────────

function buildTrendSection(trend) {
  // Build filter pill for each active month
  const hasSpend = trend.some(m => m.spend > 0);
  return `
    <div class="an-card">
      <div class="an-card-header-row">
        <div class="an-card-title"><i class="bi bi-graph-up-arrow"></i> ${t('analytics.monthly_trend')}</div>
        <button class="an-reset-btn" onclick="window.anResetFilters()">
          <i class="bi bi-x-circle"></i> ${t('common.close')}
        </button>
      </div>
      ${!hasSpend ? `<div class="an-chart-empty"><i class="bi bi-bar-chart"></i><p>${t('analytics.subtitle')}</p></div>` : ''}
      <div style="position:relative">
        <canvas id="an-trend-chart" style="width:100%;cursor:crosshair"></canvas>
      </div>
    </div>`;
}

// Shared chart drawing state
const TREND_PAD = { l:58, r:20, t:24, b:44 };

function getTrendPoints(canvas) {
  const W = canvas.offsetWidth || 500;
  canvas.width  = W;
  canvas.height = 220;
  const filtered = _activeCatFilter
    ? _trend  // month filter not implemented separately – category filter affects donut only
    : _trend;
  const maxSpend = Math.max(...filtered.map(m => m.spend), 1);
  const { l, r, t, b } = TREND_PAD;
  const cW = W - l - r;
  const cH = canvas.height - t - b;
  return {
    pts: filtered.map((m, i) => ({
      x: l + (cW / Math.max(filtered.length - 1, 1)) * i,
      y: t + cH - (m.spend / maxSpend) * cH,
      spend: m.spend,
      count: m.count,
      label: m.label,
    })),
    maxSpend, cW, cH, W,
  };
}

function drawTrendChart() {
  const canvas = document.getElementById('an-trend-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { pts, maxSpend, cW, cH, W } = getTrendPoints(canvas);
  const { l, r, t: padT, b } = TREND_PAD;

  ctx.clearRect(0, 0, W, canvas.height);

  // Grid
  ctx.strokeStyle = '#e2f0e8'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (cH / 4) * i;
    ctx.beginPath(); ctx.moveTo(l, y); ctx.lineTo(l + cW, y); ctx.stroke();
    const val = Math.round(maxSpend - (maxSpend / 4) * i);
    ctx.fillStyle = '#8c97a0'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'end';
    ctx.fillText(val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val, l - 6, y + 4);
  }

  if (!pts.length) return;

  // Area gradient
  ctx.beginPath();
  ctx.moveTo(pts[0].x, padT + cH);
  pts.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(pts[pts.length - 1].x, padT + cH);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, padT, 0, padT + cH);
  grad.addColorStop(0, 'rgba(45,95,63,0.18)');
  grad.addColorStop(1, 'rgba(45,95,63,0.02)');
  ctx.fillStyle = grad; ctx.fill();

  // Smooth bezier line
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const cp1x = pts[i - 1].x + (pts[i].x - pts[i - 1].x) / 3;
    const cp2x = pts[i].x     - (pts[i].x - pts[i - 1].x) / 3;
    ctx.bezierCurveTo(cp1x, pts[i - 1].y, cp2x, pts[i].y, pts[i].x, pts[i].y);
  }
  ctx.strokeStyle = '#2d5f3f'; ctx.lineWidth = 2.5; ctx.stroke();

  // Points
  pts.forEach(p => {
    ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = '#2d5f3f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#495057'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'center';
    ctx.fillText(p.label, p.x, padT + cH + 22);
  });

  attachTrendInteraction(canvas, pts);
}

function drawTrendChartFiltered() { drawTrendChart(); }

function attachTrendInteraction(canvas, pts) {
  const tt   = _chartTooltipEl;
  const rect = canvas.getBoundingClientRect();

  const findNearest = (clientX) => {
    const relX = clientX - rect.left;
    return pts.reduce((best, p) => Math.abs(p.x - relX) < Math.abs(best.x - relX) ? p : best, pts[0]);
  };

  const showTip = (p, clientX, clientY) => {
    if (!tt) return;
    const prev = pts[pts.indexOf(p) - 1];
    let growthHTML = '';
    if (prev && prev.spend > 0) {
      const pct = Math.round(((p.spend - prev.spend) / prev.spend) * 100);
      const col = pct >= 0 ? '#198754' : '#dc3545';
      growthHTML = `<div style="color:${col};font-weight:600">${pct >= 0 ? '+' : ''}${pct}%</div>`;
    }
    tt.innerHTML = `
      <div class="an-tt-title">${p.label}</div>
      <div class="an-tt-row"><span>${t('analytics.chart_spend')}:</span><strong>${p.spend.toLocaleString()} AED</strong></div>
      <div class="an-tt-row"><span>${t('analytics.chart_requests')}:</span><strong>${p.count}</strong></div>
      ${growthHTML}`;
    tt.style.display = 'block';
    positionTooltip(tt, clientX, clientY);
  };

  canvas.onmousemove = e => {
    const p = findNearest(e.clientX);
    showTip(p, e.clientX, e.clientY);
    redrawWithHighlight(canvas, pts, p);
  };
  canvas.onmouseleave = () => {
    if (tt) tt.style.display = 'none';
    drawTrendChart();
  };
  canvas.ontouchstart = e => {
    e.preventDefault();
    const touch = e.touches[0];
    const p = findNearest(touch.clientX);
    showTip(p, touch.clientX, touch.clientY);
  };
  canvas.ontouchmove = e => {
    e.preventDefault();
    const touch = e.touches[0];
    const p = findNearest(touch.clientX);
    showTip(p, touch.clientX, touch.clientY);
    redrawWithHighlight(canvas, pts, p);
  };
  canvas.ontouchend = () => { if (tt) tt.style.display = 'none'; drawTrendChart(); };
  canvas.onclick = e => {
    const p = findNearest(e.clientX);
    showTip(p, e.clientX, e.clientY);
  };
}

function redrawWithHighlight(canvas, pts, active) {
  drawTrendChart();
  const ctx = canvas.getContext('2d');
  const { t: padT, b } = TREND_PAD;
  const cH = canvas.height - padT - b;
  // Vertical indicator line
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = '#2d5f3f';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(active.x, padT); ctx.lineTo(active.x, padT + cH); ctx.stroke();
  ctx.setLineDash([]);
  // Larger highlight dot
  ctx.beginPath(); ctx.arc(active.x, active.y, 6.5, 0, Math.PI * 2);
  ctx.fillStyle = '#2d5f3f'; ctx.fill();
  ctx.beginPath(); ctx.arc(active.x, active.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY DONUT CHART — interactive with legend toggle
// ─────────────────────────────────────────────────────────────────────────────

function buildCategorySection(breakdown) {
  const legendItems = breakdown.map(c => `
    <button class="an-cat-legend-btn ${_activeCatFilter === c.category ? 'active' : ''}"
      onclick="window.anFilterCat('${c.category}', this)"
      data-cat="${c.category}">
      <span class="an-legend-dot" style="background:${CAT_COLORS[c.category]}"></span>
      <span>${c.label}</span>
      <span class="an-legend-val">${c.spend.toLocaleString()}</span>
    </button>`).join('');

  return `
    <div class="an-card">
      <div class="an-card-title"><i class="bi bi-pie-chart-fill"></i> ${t('analytics.spend_by_category')}</div>
      ${breakdown.length === 0
        ? `<div class="an-chart-empty"><i class="bi bi-pie-chart"></i><p>—</p></div>`
        : `<div style="position:relative;display:flex;justify-content:center">
             <canvas id="an-cat-chart" width="200" height="200" style="cursor:pointer"></canvas>
           </div>`}
      <div class="an-legend an-legend-interactive" id="an-cat-legend">${legendItems}</div>
    </div>`;
}

function drawCategoryChart() {
  const canvas = document.getElementById('an-cat-chart');
  if (!canvas) return;

  const data = _activeCatFilter
    ? _breakdown.filter(c => c.category === _activeCatFilter)
    : _breakdown;
  if (!data.length) return;

  const ctx  = canvas.getContext('2d');
  const W = 200, H = 200, cx = W / 2, cy = H / 2, R = 82, r = 50;
  canvas.width = W; canvas.height = H;
  ctx.clearRect(0, 0, W, H);

  const total   = data.reduce((s, c) => s + c.spend, 0) || 1;
  const slices  = [];
  let angle     = -Math.PI / 2;

  data.forEach(cat => {
    const span  = (cat.spend / total) * Math.PI * 2;
    const color = CAT_COLORS[cat.category] || '#6c757d';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, angle, angle + span);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    slices.push({ start: angle, end: angle + span, ...cat, color });
    angle += span;
  });

  // Hole
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();

  // Centre text
  ctx.fillStyle = '#2d5f3f'; ctx.font = 'bold 10px Segoe UI'; ctx.textAlign = 'center';
  ctx.fillText(t('analytics.total_spend'), cx, cy - 4);
  ctx.fillStyle = '#6c757d'; ctx.font = '10px Segoe UI';
  ctx.fillText((total / 1000).toFixed(0) + 'k AED', cx, cy + 12);

  attachDonutInteraction(canvas, slices, cx, cy, R, r, total);
}

function attachDonutInteraction(canvas, slices, cx, cy, R, r, total) {
  const tt = _chartTooltipEl;

  const hitSlice = (e) => {
    const rect  = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const mx = (clientX - rect.left) * scaleX - cx;
    const my = (clientY - rect.top)  * scaleY - cy;
    const dist  = Math.sqrt(mx * mx + my * my);
    if (dist < r || dist > R) return null;
    let ang = Math.atan2(my, mx);
    if (ang < -Math.PI / 2) ang += Math.PI * 2;
    return slices.find(s => ang >= s.start && ang < s.end) || null;
  };

  const showDonutTip = (slice, clientX, clientY) => {
    if (!tt || !slice) return;
    const pct = Math.round((slice.spend / total) * 100);
    tt.innerHTML = `
      <div class="an-tt-title" style="color:${slice.color}">${slice.label}</div>
      <div class="an-tt-row"><span>${t('analytics.chart_spend')}:</span><strong>${slice.spend.toLocaleString()} AED</strong></div>
      <div class="an-tt-row"><span>${t('analytics.requests_count')}:</span><strong>${slice.count}</strong></div>
      <div class="an-tt-row"><span>${t('analytics.approval_rate')}:</span><strong>${pct}%</strong></div>`;
    tt.style.display = 'block';
    positionTooltip(tt, clientX, clientY);
  };

  canvas.onmousemove = e => {
    const s = hitSlice(e);
    if (s) showDonutTip(s, e.clientX, e.clientY);
    else if (tt) tt.style.display = 'none';
    highlightSlice(canvas, slices, s, cx, cy, R, r, total);
  };
  canvas.onmouseleave = () => {
    if (tt) tt.style.display = 'none';
    drawCategoryChart();
  };
  canvas.onclick = e => {
    const s = hitSlice(e);
    if (s) {
      const btn = document.querySelector(`[data-cat="${s.category}"]`);
      window.anFilterCat(s.category, btn);
    }
  };
  canvas.ontouchstart = e => {
    e.preventDefault();
    const s = hitSlice(e);
    if (s) showDonutTip(s, e.touches[0].clientX, e.touches[0].clientY);
  };
  canvas.ontouchend = () => { if (tt) tt.style.display = 'none'; };
}

function highlightSlice(canvas, slices, active, cx, cy, R, r, total) {
  drawCategoryChart();
  if (!active) return;
  const ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, R + 6, active.start, active.end);
  ctx.closePath();
  ctx.fillStyle = active.color;
  ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPLIER TABLE WITH INTERACTIVE BARS
// ─────────────────────────────────────────────────────────────────────────────

function buildSupplierTable(suppPerf) {
  if (!suppPerf.length) return `
    <div class="an-card">
      <div class="an-card-title"><i class="bi bi-trophy-fill"></i> ${t('analytics.supplier_performance')}</div>
      <div class="an-chart-empty"><i class="bi bi-people"></i><p>—</p></div>
    </div>`;

  return `
    <div class="an-card">
      <div class="an-card-title"><i class="bi bi-trophy-fill"></i> ${t('analytics.supplier_performance')}</div>
      <div class="an-table-wrap">
        <table class="an-table">
          <thead><tr>
            <th>${t('suppliers.supplier_name')}</th>
            <th>${t('analytics.delivery_performance')}</th>
            <th>${t('analytics.reliability_score')}</th>
            <th>${t('analytics.pricing_competitiveness')}</th>
            <th>${t('suppliers.rating')}</th>
          </tr></thead>
          <tbody>
            ${suppPerf.map((s, i) => `
              <tr class="an-supplier-row" data-idx="${i}" style="cursor:pointer">
                <td>
                  <strong>${s.name}</strong>
                  <br><small style="color:var(--text-muted)">${t('categories.' + s.category)}</small>
                </td>
                <td>${miniBar(s.deliveryScore,    '#0d6efd', i, 'd')}</td>
                <td>${miniBar(s.reliabilityScore, '#198754', i, 'r')}</td>
                <td>${miniBar(s.pricingScore,     '#e67e22', i, 'p')}</td>
                <td>
                  <span class="an-star-rating" style="color:#f59e0b">
                    ${'★'.repeat(Math.round(s.rating))}${'☆'.repeat(5 - Math.round(s.rating))}
                  </span>
                  <br><small style="color:var(--text-muted)">${s.rating}</small>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function miniBar(value, color, rowIdx, key) {
  return `
    <div class="an-minibar-wrap"
         data-tip="${t('suppliers.rating')}: ${value}%"
         onmouseenter="window.showSupplierTip(event,'${value}%',this)"
         onmouseleave="window.hideSupplierTip()">
      <div style="flex:1;height:7px;background:#e9ecef;border-radius:4px;overflow:hidden">
        <div class="an-animate-bar" data-target="${value}"
             style="height:100%;background:${color};width:0%;border-radius:4px"></div>
      </div>
      <span style="font-size:0.76rem;font-weight:600;color:${color};min-width:32px;text-align:end">${value}%</span>
    </div>`;
}

function attachSupplierTooltips() {
  window.showSupplierTip = (e, text, el) => {
    const tt = _chartTooltipEl;
    if (!tt) return;
    tt.innerHTML = `<div class="an-tt-title">${text}</div>`;
    tt.style.display = 'block';
    positionTooltip(tt, e.clientX, e.clientY);
  };
  window.hideSupplierTip = () => {
    if (_chartTooltipEl) _chartTooltipEl.style.display = 'none';
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FORECAST CARD
// ─────────────────────────────────────────────────────────────────────────────

function buildForecastCard(forecast) {
  const delayColor = { high:'#dc3545', medium:'#e67e22', low:'#198754' }[forecast.delayRisk] || '#6c757d';
  const growthBadge = forecast.growthPct !== undefined
    ? `<span style="font-size:0.72rem;color:${forecast.growthPct>=0?'#198754':'#dc3545'}">
         ${forecast.growthPct>=0?'+':''}${forecast.growthPct}%
       </span>`
    : '';
  return `
    <div class="an-card an-forecast-card">
      <div class="an-card-title"><i class="bi bi-stars"></i> ${t('analytics.ai_forecast')}</div>
      <div class="an-forecast-grid">
        <div class="an-forecast-item">
          <div class="an-forecast-val">${forecast.forecastSpend.toLocaleString()}</div>
          ${growthBadge}
          <div class="an-forecast-label">${t('analytics.forecast_spend')} (AED)</div>
        </div>
        <div class="an-forecast-item">
          <div class="an-forecast-val">${forecast.forecastCount}</div>
          <div class="an-forecast-label">${t('analytics.forecast_demand')}</div>
        </div>
        <div class="an-forecast-item">
          <div class="an-forecast-val" style="color:${delayColor}">${forecast.delayRiskLabel}</div>
          <div class="an-forecast-label">${t('analytics.forecast_delay')}</div>
        </div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI INSIGHTS
// ─────────────────────────────────────────────────────────────────────────────

const INS_STYLE = {
  success: { bg:'#f0fdf4', border:'#bbf7d0', color:'#198754' },
  warning: { bg:'#fff7ed', border:'#fed7aa', color:'#e67e22' },
  danger:  { bg:'#fff1f2', border:'#fecaca', color:'#dc3545' },
  info:    { bg:'#eff6ff', border:'#bfdbfe', color:'#0d6efd' },
};

function buildAIInsights(insights) {
  if (!insights.length) return '';
  return `
    <div class="an-card">
      <div class="an-card-title"><i class="bi bi-robot"></i> ${t('analytics.ai_insights')}</div>
      <div class="an-insights-list">
        ${insights.map(ins => {
          const s = INS_STYLE[ins.type] || INS_STYLE.info;
          return `
            <div class="an-insight-item" style="background:${s.bg};border-color:${s.border}">
              <i class="bi ${ins.icon}" style="color:${s.color};font-size:1rem;flex-shrink:0"></i>
              <span>${ins.text}</span>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RISKS
// ─────────────────────────────────────────────────────────────────────────────

function buildRisksSection(risks) {
  if (!risks.length) return '';
  return `
    <div class="an-card">
      <div class="an-card-title"><i class="bi bi-shield-exclamation"></i> ${t('analytics.risk_overview')}</div>
      <div class="an-insights-list">
        ${risks.map(r => {
          const s = INS_STYLE[r.severity] || INS_STYLE.warning;
          return `
            <div class="an-insight-item" style="background:${s.bg};border-color:${s.border}">
              <i class="bi ${r.icon}" style="color:${s.color};flex-shrink:0"></i>
              <span>${r.text}</span>
            </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────────────────────

function buildRecommendations(recs) {
  if (!recs.length) return '';
  const priColor = { high:'#dc3545', medium:'#e67e22', low:'#198754' };
  return `
    <div class="an-card">
      <div class="an-card-title"><i class="bi bi-lightbulb-fill"></i> ${t('requests.ai_insights_section')}</div>
      <div class="an-recs-list">
        ${recs.map(r => `
          <div class="an-rec-item">
            <div class="an-rec-icon" style="background:${(priColor[r.priority]||'#6c757d')}18;color:${priColor[r.priority]||'#6c757d'}">
              <i class="bi ${r.icon}"></i>
            </div>
            <span>${r.text}</span>
          </div>`).join('')}
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOLTIP POSITIONING
// ─────────────────────────────────────────────────────────────────────────────

function positionTooltip(tt, clientX, clientY) {
  const ttW = 200, margin = 12;
  const vW = window.innerWidth, vH = window.innerHeight;
  let left = clientX + margin;
  let top  = clientY - 10;
  if (left + ttW + margin > vW) left = clientX - ttW - margin;
  if (top + 120 > vH) top = clientY - 120;
  tt.style.left = left + 'px';
  tt.style.top  = top  + 'px';
}

// ─────────────────────────────────────────────────────────────────────────────
// ANIMATE BARS
// ─────────────────────────────────────────────────────────────────────────────

function animateBars() {
  document.querySelectorAll('.an-animate-bar, .an-health-bar').forEach(bar => {
    const target = parseFloat(bar.dataset.target) || 0;
    bar.style.width = '0%';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      bar.style.transition = 'width 0.9s ease';
      bar.style.width = target + '%';
    }));
  });
}
