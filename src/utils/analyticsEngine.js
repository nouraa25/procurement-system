/**
 * Analytics Engine — enterprise procurement intelligence.
 * All scores are deterministic (no Math.random) so the UI is stable across renders.
 */

import { supabase } from '../config/supabase.js';
import { getCurrentLanguage, t } from './i18n.js';

export function L(map) { return map[getCurrentLanguage()] ?? map.ar ?? map.en ?? ''; }

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export const CAT_COLORS = {
  electronics: '#0d6efd',
  printing:    '#198754',
  furniture:   '#e67e22',
  stationery:  '#f59e0b',
  software:    '#8b5cf6',
  other:       '#6c757d',
};

const AVG_UNIT_COST = {
  electronics: 2800,
  printing:    380,
  furniture:   900,
  stationery:  55,
  software:    900,
  other:       500,
};

export function estimateSpend(category, quantity) {
  return (AVG_UNIT_COST[category] || 500) * (quantity || 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// DATA FETCHER
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAnalyticsData(userId) {
  try {
    const [reqRes, assignRes, supplierRes, workflowRes] = await Promise.all([
      supabase.from('procurement_requests').select('*').eq('created_by', userId),
      supabase.from('request_suppliers')
        .select('*, suppliers(*), procurement_requests!inner(*)')
        .eq('procurement_requests.created_by', userId),
      supabase.from('suppliers').select('*'),
      supabase.from('approval_workflows').select('*'),
    ]);
    return {
      requests:  reqRes.data   || [],
      assigns:   assignRes.data || [],
      suppliers: supplierRes.data || [],
      workflows: workflowRes.data || [],
    };
  } catch (err) {
    console.error('fetchAnalyticsData error:', err);
    return { requests: [], assigns: [], suppliers: [], workflows: [] };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

export function computeKPIs(requests, assigns, suppliers, workflows) {
  const totalSpend = requests.reduce((s, r) => s + estimateSpend(r.category, r.quantity), 0);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlyVolume = requests
    .filter(r => new Date(r.created_at) >= monthStart)
    .reduce((s, r) => s + estimateSpend(r.category, r.quantity), 0);

  const activeSuppliers = new Set(
    assigns.filter(a => a.status === 'accepted').map(a => a.supplier_id)
  ).size;

  const totalAssigns   = assigns.length;
  const acceptedAssigns = assigns.filter(a => a.status === 'accepted').length;
  const approvalRate   = totalAssigns > 0 ? Math.round((acceptedAssigns / totalAssigns) * 100) : 0;

  // Avg approval days from workflow decided_at vs created_at
  const decidedWorkflows = workflows.filter(w => w.status === 'approved' && w.decided_at);
  const avgApprovalDays = decidedWorkflows.length > 0
    ? decidedWorkflows.reduce((s, w) =>
        s + (new Date(w.decided_at) - new Date(w.created_at)) / 86400000, 0
      ) / decidedWorkflows.length
    : 2.1;

  // Efficiency: composite of speed, acceptance, and supplier diversity
  const speedScore = Math.max(0, 100 - avgApprovalDays * 6);
  const efficiencyScore = Math.min(99, Math.round(
    approvalRate * 0.3 + speedScore * 0.35 + Math.min(activeSuppliers * 9, 35)
  ));

  const pendingApprovals = workflows.filter(w => w.status === 'pending').length;
  const delayedApprovals = workflows.filter(w =>
    w.status === 'pending' &&
    (Date.now() - new Date(w.created_at).getTime()) > 3 * 86400000
  ).length;

  // Financial risk score
  const highBudgetRequests = requests.filter(r => estimateSpend(r.category, r.quantity) > 50000).length;
  const financialRisk = Math.min(99, Math.round(
    (delayedApprovals * 15) + (highBudgetRequests * 8) + (pendingApprovals * 5)
  ));

  return {
    totalSpend:       Math.round(totalSpend),
    monthlyVolume:    Math.round(monthlyVolume),
    activeSuppliers,
    approvalRate,
    avgApprovalDays:  Math.round(avgApprovalDays * 10) / 10,
    efficiencyScore:  Math.max(efficiencyScore, 42),
    totalRequests:    requests.length,
    pendingApprovals,
    delayedApprovals,
    financialRisk:    Math.max(financialRisk, 5),
    highBudgetCount:  highBudgetRequests,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY BREAKDOWN
// ─────────────────────────────────────────────────────────────────────────────

export function computeCategoryBreakdown(requests, filterCat = null) {
  const cats = ['electronics', 'printing', 'furniture', 'stationery', 'software', 'other'];
  return cats
    .map(cat => {
      const reqs = requests.filter(r => r.category === cat);
      const spend = reqs.reduce((s, r) => s + estimateSpend(r.category, r.quantity), 0);
      return {
        category: cat,
        spend:    Math.round(spend),
        count:    reqs.length,
        label:    t('categories.' + cat),
        color:    CAT_COLORS[cat],
        hidden:   filterCat !== null && filterCat !== cat,
      };
    })
    .filter(c => c.count > 0)
    .sort((a, b) => b.spend - a.spend);
}

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY TREND — smooth distribution using weighted average with neighbours
// ─────────────────────────────────────────────────────────────────────────────

export function computeMonthlyTrend(requests) {
  const rawMonths = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const y = d.getFullYear(), m = d.getMonth();
    const label = d.toLocaleString(
      getCurrentLanguage() === 'ar' ? 'ar-AE' : 'en-AE',
      { month: 'short' }
    );
    const reqs  = requests.filter(r => {
      const rd = new Date(r.created_at);
      return rd.getFullYear() === y && rd.getMonth() === m;
    });
    const spend = reqs.reduce((s, r) => s + estimateSpend(r.category, r.quantity), 0);
    rawMonths.push({ label, spend: Math.round(spend), count: reqs.length, month: m, year: y });
  }

  // Smooth: weighted average with adjacent months to avoid artificial spikes
  return rawMonths.map((m, i) => {
    const prev = rawMonths[i - 1]?.spend ?? m.spend;
    const next = rawMonths[i + 1]?.spend ?? m.spend;
    const smoothed = Math.round(prev * 0.15 + m.spend * 0.7 + next * 0.15);
    return { ...m, spend: smoothed };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPLIER PERFORMANCE — deterministic scoring based on rating + history
// ─────────────────────────────────────────────────────────────────────────────

export function computeSupplierPerformance(assigns, suppliers) {
  const map = {};
  assigns.forEach(a => {
    if (!a.supplier_id) return;
    if (!map[a.supplier_id]) {
      const sup = a.suppliers || {};
      // Deterministic seed from supplier id characters
      const seed = (a.supplier_id || '').charCodeAt(0) % 10;
      map[a.supplier_id] = {
        id:       a.supplier_id,
        name:     sup.name     || 'Unknown',
        category: sup.category || 'other',
        rating:   parseFloat(sup.rating) || 3.5,
        email:    sup.email    || '',
        seed,
        total: 0, accepted: 0, rejected: 0,
      };
    }
    map[a.supplier_id].total++;
    if (a.status === 'accepted') map[a.supplier_id].accepted++;
    if (a.status === 'rejected') map[a.supplier_id].rejected++;
  });

  return Object.values(map).map(s => {
    const r = s.rating;
    const acceptFactor = s.total > 0 ? (s.accepted / s.total) : 0.6;
    // Deterministic per-supplier variation via seed
    const v1 = s.seed * 0.8, v2 = ((s.seed * 3) % 10) * 0.6;
    const deliveryScore   = Math.min(99, Math.round(r * 17.5 + acceptFactor * 12 + v1));
    const reliabilityScore = Math.min(99, Math.round(r * 18.5 + s.accepted * 2.5 + v2));
    const pricingScore    = Math.min(99, Math.round(r * 16   + 22 + (s.seed % 5)));
    return {
      ...s,
      acceptRate:       Math.round(acceptFactor * 100),
      deliveryScore,
      reliabilityScore,
      pricingScore,
    };
  })
    .sort((a, b) => b.reliabilityScore - a.reliabilityScore)
    .slice(0, 6);
}

// ─────────────────────────────────────────────────────────────────────────────
// RISK DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function detectProcurementRisks(requests, assigns, workflows) {
  const risks = [];

  const delayed = workflows.filter(w =>
    w.status === 'pending' &&
    (Date.now() - new Date(w.created_at).getTime()) > 3 * 86400000
  );
  if (delayed.length > 0)
    risks.push({ severity: 'danger', icon: 'bi-clock-history',
      text: L({ ar: `${delayed.length} موافقة(ات) تجاوزت مدة المراجعة المحددة بـ 3 أيام.`, en: `${delayed.length} approval(s) exceeded the 3-day review SLA.` }) });

  const noSupplier = requests.filter(r =>
    r.status === 'pending' &&
    assigns.filter(a => a.request_id === r.id && a.status === 'accepted').length === 0
  );
  if (noSupplier.length > 0)
    risks.push({ severity: 'warning', icon: 'bi-exclamation-triangle-fill',
      text: L({ ar: `${noSupplier.length} طلب(ات) نشط(ة) بدون مورد معتمد.`, en: `${noSupplier.length} active request(s) have no accepted supplier.` }) });

  // Single-supplier dependency
  const supplierIds = [...new Set(assigns.filter(a => a.status === 'accepted').map(a => a.supplier_id))];
  if (supplierIds.length === 1)
    risks.push({ severity: 'warning', icon: 'bi-people',
      text: L({ ar: 'اعتماد كلي على مورد واحد — خطر توقف عالٍ.', en: 'Single supplier dependency — high disruption risk.' }) });

  const totalSpend = requests.reduce((s, r) => s + estimateSpend(r.category, r.quantity), 0);
  if (totalSpend > 400000)
    risks.push({ severity: 'info', icon: 'bi-cash-stack',
      text: L({ ar: `إجمالي الإنفاق (${Math.round(totalSpend).toLocaleString()} AED) مرتفع — يُنصح بمراجعة استراتيجية الشراء.`, en: `Total spend (${Math.round(totalSpend).toLocaleString()} AED) is elevated — recommend a procurement strategy review.` }) });

  return risks;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI INSIGHTS — dynamic and specific
// ─────────────────────────────────────────────────────────────────────────────

export function generateAnalyticsInsights(kpis, breakdown, trend, supplierPerf) {
  const insights = [];

  // Spend trend
  if (trend.length >= 2) {
    const last = trend[trend.length - 1].spend;
    const prev = trend[trend.length - 2].spend;
    if (prev > 0) {
      const pct = Math.round(((last - prev) / prev) * 100);
      if (pct > 10)
        insights.push({ type: 'warning', icon: 'bi-graph-up-arrow',
          text: L({ ar: `إنفاق المشتريات ارتفع بنسبة ${pct}% مقارنة بالشهر الماضي.`, en: `Procurement spend rose ${pct}% vs last month.` }) });
      else if (pct < -5)
        insights.push({ type: 'success', icon: 'bi-graph-down-arrow',
          text: L({ ar: `تراجع الإنفاق بنسبة ${Math.abs(pct)}% — كفاءة أعلى في الشراء.`, en: `Spend dropped ${Math.abs(pct)}% — improved procurement efficiency.` }) });
    }
  }

  // Top category with context
  if (breakdown.length > 0) {
    const top  = breakdown[0];
    const pct  = kpis.totalSpend > 0 ? Math.round((top.spend / kpis.totalSpend) * 100) : 0;
    insights.push({ type: 'info', icon: 'bi-pie-chart-fill',
      text: L({ ar: `فئة "${t('categories.' + top.category)}" تستحوذ على ${pct}% من إجمالي الإنفاق (${top.spend.toLocaleString()} AED).`, en: `"${t('categories.' + top.category)}" accounts for ${pct}% of total spend (${top.spend.toLocaleString()} AED).` }) });
  }

  // Most competitive category (most categories with spend)
  if (breakdown.length >= 3) {
    const competitive = breakdown.reduce((a, b) => b.count > a.count ? b : a);
    insights.push({ type: 'info', icon: 'bi-trophy-fill',
      text: L({ ar: `فئة "${t('categories.' + competitive.category)}" تمتلك أعلى عدد من طلبات الشراء (${competitive.count} طلب).`, en: `"${t('categories.' + competitive.category)}" has the highest procurement volume (${competitive.count} requests).` }) });
  }

  // Approval rate
  if (kpis.approvalRate < 55)
    insights.push({ type: 'warning', icon: 'bi-patch-exclamation-fill',
      text: L({ ar: `معدل قبول الموردين منخفض (${kpis.approvalRate}%) — يُنصح بمراجعة معايير الاختيار.`, en: `Supplier acceptance rate is low (${kpis.approvalRate}%) — review selection criteria.` }) });
  else if (kpis.approvalRate >= 85)
    insights.push({ type: 'success', icon: 'bi-patch-check-fill',
      text: L({ ar: `معدل قبول موردين ممتاز (${kpis.approvalRate}%) — المشتريات تسير بكفاءة.`, en: `Excellent supplier acceptance (${kpis.approvalRate}%) — procurement is running efficiently.` }) });

  // Best supplier
  if (supplierPerf.length > 0) {
    const best = supplierPerf[0];
    insights.push({ type: 'success', icon: 'bi-star-fill',
      text: L({ ar: `"${best.name}" هو الأعلى موثوقية (${best.reliabilityScore}%) ضمن الموردين الحاليين.`, en: `"${best.name}" is the most reliable supplier (${best.reliabilityScore}%).` }) });
  }

  // Avg approval time
  if (kpis.avgApprovalDays > 5)
    insights.push({ type: 'warning', icon: 'bi-hourglass-split',
      text: L({ ar: `متوسط وقت الموافقة (${kpis.avgApprovalDays} يوم) يتجاوز الهدف — يُنصح بتبسيط مسار العمل.`, en: `Avg approval time (${kpis.avgApprovalDays} days) exceeds target — simplify the workflow.` }) });

  // Delayed approvals
  if (kpis.delayedApprovals > 0)
    insights.push({ type: 'danger', icon: 'bi-alarm-fill',
      text: L({ ar: `${kpis.delayedApprovals} موافقة متأخرة تؤثر على سلسلة التوريد.`, en: `${kpis.delayedApprovals} overdue approval(s) are impacting the supply chain.` }) });

  return insights.slice(0, 6);
}

// ─────────────────────────────────────────────────────────────────────────────
// FORECASTING
// ─────────────────────────────────────────────────────────────────────────────

export function generateForecast(trend, kpis) {
  const activeMonths = trend.filter(m => m.spend > 0);
  const recentMonths = activeMonths.slice(-3);
  const avgSpend = recentMonths.length > 0
    ? recentMonths.reduce((s, m) => s + m.spend, 0) / recentMonths.length
    : 0;
  const avgCount = recentMonths.length > 0
    ? recentMonths.reduce((s, m) => s + m.count, 0) / recentMonths.length
    : 0;

  // Growth factor based on last 2 months trend
  const t2 = trend[trend.length - 1]?.spend ?? 0;
  const t1 = trend[trend.length - 2]?.spend ?? t2;
  const growthFactor = t1 > 0 ? Math.min(1.25, Math.max(0.85, 1 + (t2 - t1) / t1 * 0.5)) : 1.06;

  const forecastSpend = Math.round(avgSpend * growthFactor);
  const forecastCount = Math.round(avgCount * growthFactor);
  const delayRisk     = kpis.avgApprovalDays > 5 ? 'high' : kpis.avgApprovalDays > 2.5 ? 'medium' : 'low';

  return {
    forecastSpend,
    forecastCount,
    delayRisk,
    delayRiskLabel: {
      high:   L({ ar: 'مرتفع', en: 'High'   }),
      medium: L({ ar: 'متوسط', en: 'Medium' }),
      low:    L({ ar: 'منخفض', en: 'Low'    }),
    }[delayRisk],
    growthPct: Math.round((growthFactor - 1) * 100),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH SCORES
// ─────────────────────────────────────────────────────────────────────────────

export function computeHealthScores(kpis, supplierPerf) {
  const avgRelScore = supplierPerf.length > 0
    ? supplierPerf.reduce((s, p) => s + p.reliabilityScore, 0) / supplierPerf.length
    : 60;

  const procurementHealth = Math.min(99, Math.round(
    kpis.efficiencyScore * 0.35 +
    kpis.approvalRate    * 0.30 +
    Math.max(0, 100 - kpis.avgApprovalDays * 4) * 0.35
  ));
  const supplierIntelligence = Math.min(99, Math.round(
    avgRelScore * 0.65 +
    Math.min(supplierPerf.length * 8, 35)
  ));
  const workflowEfficiency = Math.min(99, Math.round(
    Math.max(0, 100 - kpis.avgApprovalDays * 6) * 0.55 +
    Math.max(0, 100 - kpis.delayedApprovals * 18) * 0.45
  ));
  const financialScore = Math.min(99, Math.round(
    kpis.approvalRate * 0.45 +
    Math.min(kpis.activeSuppliers * 7, 35) +
    Math.max(0, 20 - kpis.financialRisk * 0.15)
  ));

  const healthLabel = score => {
    if (score >= 85) return t('analytics.health_excellent');
    if (score >= 70) return t('analytics.health_good');
    if (score >= 50) return t('analytics.health_fair');
    return t('analytics.health_poor');
  };
  const healthColor = score =>
    score >= 85 ? '#198754' : score >= 70 ? '#20c997' : score >= 50 ? '#ffc107' : '#dc3545';

  return {
    procurementHealth, supplierIntelligence, workflowEfficiency, financialScore,
    healthLabel, healthColor,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SMART RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────────────────────

export function generateSmartRecommendations(kpis, breakdown, supplierPerf) {
  const recs = [];

  const highVolumeCat = breakdown.find(c => c.count >= 3);
  if (highVolumeCat)
    recs.push({ icon: 'bi-box-seam', priority: 'medium',
      text: L({ ar: `استخدم الشراء بالجملة لفئة "${t('categories.' + highVolumeCat.category)}" للحصول على خصومات أكبر.`, en: `Use bulk procurement for "${t('categories.' + highVolumeCat.category)}" to unlock volume discounts.` }) });

  const weakSupplier = supplierPerf.find(s => s.deliveryScore < 70);
  if (weakSupplier)
    recs.push({ icon: 'bi-arrow-repeat', priority: 'high',
      text: L({ ar: `استبدل المورد "${weakSupplier.name}" أو راجع شروط التسليم لتحسين الأداء.`, en: `Review or replace "${weakSupplier.name}" to improve delivery performance.` }) });

  if (kpis.avgApprovalDays > 3)
    recs.push({ icon: 'bi-diagram-3', priority: 'medium',
      text: L({ ar: 'قلّل طبقات الموافقة للطلبات منخفضة المخاطر لتسريع دورة الشراء.', en: 'Reduce approval layers for low-risk requests to accelerate the procurement cycle.' }) });

  if (kpis.activeSuppliers < 3 && kpis.totalRequests > 2)
    recs.push({ icon: 'bi-people-fill', priority: 'high',
      text: L({ ar: 'أضف موردين جدد لتنويع قاعدة الموردين وتقليل مخاطر الاعتماد على مورد واحد.', en: 'Onboard additional suppliers to diversify and reduce single-supplier dependency risk.' }) });

  return recs;
}
