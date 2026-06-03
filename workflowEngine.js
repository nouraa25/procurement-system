/**
 * Workflow Engine — Feature 2
 * Multi-level procurement approval routing, SLA tracking, decision management.
 */

import { supabase } from '../config/supabase.js';
import { getCurrentLanguage, t } from './i18n.js';

function L(map) { return map[getCurrentLanguage()] ?? map.ar ?? map.en ?? ''; }

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL ROUTING RULES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine the approval route based on budget, urgency, category, complexity.
 * Returns an ordered array of approval levels.
 */
export function buildApprovalRoute(totalBudget, priority, category, quantity) {
  const levels = [];

  // Level 1 — Manager always required
  levels.push({
    level: 1,
    role: 'manager',
    label: () => t('workflow.level_manager'),
    sla: () => priority === 'urgent' ? t('workflow.sla_urgent') : t('workflow.sla_medium'),
    slaDays: priority === 'urgent' ? 0.17 : 3,
  });

  // Level 2 — Department Manager for medium+ budget or large quantity
  if (totalBudget > 15000 || quantity > 30) {
    levels.push({
      level: 2,
      role: 'dept_manager',
      label: () => t('workflow.level_dept_manager'),
      sla: () => priority === 'urgent' ? t('workflow.sla_high') : t('workflow.sla_medium'),
      slaDays: priority === 'urgent' ? 1 : 3,
    });
  }

  // Level 3 — Finance for high budgets or critical categories
  if (totalBudget > 50000 || category === 'software' || (category === 'electronics' && totalBudget > 30000)) {
    levels.push({
      level: 3,
      role: 'finance',
      label: () => t('workflow.level_finance'),
      sla: () => priority === 'urgent' ? t('workflow.sla_high') : t('workflow.sla_medium'),
      slaDays: priority === 'urgent' ? 1 : 3,
    });
  }

  // Level 4 — Procurement Director for very large or complex
  if (totalBudget > 100000 || (priority === 'urgent' && totalBudget > 50000)) {
    levels.push({
      level: 4,
      role: 'procurement',
      label: () => t('workflow.level_procurement'),
      sla: () => t('workflow.sla_medium'),
      slaDays: 3,
    });
  }

  // Level 5 — Executive for critical/strategic
  if (totalBudget > 200000 || (priority === 'urgent' && category === 'software')) {
    levels.push({
      level: 5,
      role: 'executive',
      label: () => t('workflow.level_executive'),
      sla: () => t('workflow.sla_high'),
      slaDays: 1,
    });
  }

  return levels;
}

/**
 * Get the current workflow status label for a request based on its approval levels.
 */
export function getWorkflowStatus(levels) {
  if (!levels || levels.length === 0) return t('workflow.draft');
  const pending = levels.find(l => l.status === 'pending');
  if (!pending) {
    const allApproved = levels.every(l => l.status === 'approved');
    if (allApproved) return t('workflow.approved');
    const rejected = levels.find(l => l.status === 'rejected');
    if (rejected) return t('workflow.rejected');
    return t('workflow.under_revision');
  }
  const roleMap = {
    manager:    () => t('workflow.pending_manager'),
    finance:    () => t('workflow.pending_finance'),
    procurement: () => t('workflow.pending_procurement'),
    dept_manager: () => t('workflow.pending_manager'),
    executive:  () => t('workflow.pending_manager'),
  };
  return (roleMap[pending.role] || (() => t('workflow.status_pending')))();
}

/**
 * Smart approval alerts based on route and budget.
 */
export function getApprovalAlerts(totalBudget, priority, category, quantity) {
  const alerts = [];
  if (totalBudget > 50000)
    alerts.push({ type: 'warning', icon: 'bi-exclamation-triangle-fill', text: t('workflow.alert_budget_threshold') });
  if (priority === 'urgent')
    alerts.push({ type: 'urgent', icon: 'bi-lightning-fill', text: t('workflow.alert_urgent_escalate') });
  if (quantity > 50)
    alerts.push({ type: 'info', icon: 'bi-boxes', text: t('workflow.alert_large_qty') });
  return alerts;
}

/**
 * Estimate total approval time in days.
 */
export function estimateApprovalTime(levels, priority) {
  const base = levels.reduce((sum, l) => sum + (l.slaDays || 1), 0);
  const factor = priority === 'urgent' ? 0.5 : priority === 'low' ? 1.5 : 1;
  return Math.max(0.5, Math.round(base * factor * 10) / 10);
}

/**
 * Predict approval probability based on route complexity, budget, rating.
 */
export function predictApprovalOutcome(totalBudget, priority, topRating, levels) {
  let prob = 78;
  prob += topRating >= 4.7 ? 10 : topRating >= 4.3 ? 5 : -5;
  if (priority === 'urgent') prob -= 6;
  if (totalBudget > 200000) prob -= 18;
  else if (totalBudget > 100000) prob -= 10;
  else if (totalBudget > 50000) prob -= 5;
  else if (totalBudget < 10000) prob += 8;
  if (levels.length >= 4) prob -= 8;
  else if (levels.length === 1) prob += 10;
  return Math.min(Math.max(prob, 35), 97);
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function createWorkflowForRequest(requestId, totalBudget, priority, category, quantity) {
  try {
    const levels = buildApprovalRoute(totalBudget, priority, category, quantity);
    const rows = levels.map(l => ({
      request_id:    requestId,
      level:         l.level,
      approver_role: l.role,
      status:        'pending',
    }));
    await supabase.from('approval_workflows').insert(rows);
    return levels;
  } catch (err) {
    console.error('createWorkflowForRequest error:', err);
    return [];
  }
}

export async function fetchWorkflowForRequest(requestId) {
  try {
    const { data } = await supabase
      .from('approval_workflows')
      .select('*')
      .eq('request_id', requestId)
      .order('level', { ascending: true });
    return data || [];
  } catch { return []; }
}

export async function updateWorkflowStep(stepId, status, comments) {
  try {
    await supabase
      .from('approval_workflows')
      .update({ status, comments, decided_at: new Date().toISOString() })
      .eq('id', stepId);
  } catch (err) {
    console.error('updateWorkflowStep error:', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WORKFLOW TIMELINE RENDERER
// ─────────────────────────────────────────────────────────────────────────────

const STEP_ICONS = {
  created:          'bi-file-earmark-plus-fill',
  pending_approval: 'bi-clock-history',
  approved:         'bi-patch-check-fill',
  supplier:         'bi-people-fill',
  processing:       'bi-gear-fill',
  delivered:        'bi-box-seam-fill',
};

export function renderApprovalTimeline(dbSteps, requestStatus) {
  const allSteps = [
    { key: 'created',          label: () => t('workflow.step_created'),           done: true  },
    { key: 'pending_approval', label: () => t('workflow.step_pending_approval'),  done: dbSteps.length > 0 },
    { key: 'approved',         label: () => t('workflow.step_approved'),           done: dbSteps.length > 0 && dbSteps.every(s => s.status === 'approved') },
    { key: 'supplier',         label: () => t('workflow.step_supplier_assigned'),  done: ['processing','ordered','delivered'].includes(requestStatus) },
    { key: 'processing',       label: () => t('workflow.step_processing'),         done: ['ordered','delivered'].includes(requestStatus) },
    { key: 'delivered',        label: () => t('workflow.step_delivered'),          done: requestStatus === 'delivered' },
  ];

  return `
    <div class="wf-timeline">
      ${allSteps.map((step, i) => `
        <div class="wf-timeline-step ${step.done ? 'done' : i === allSteps.findIndex(s => !s.done) ? 'active' : ''}">
          <div class="wf-timeline-dot">
            <i class="bi ${STEP_ICONS[step.key]}"></i>
          </div>
          ${i < allSteps.length - 1 ? '<div class="wf-timeline-line"></div>' : ''}
          <div class="wf-timeline-label">${step.label()}</div>
        </div>
      `).join('')}
    </div>`;
}

/**
 * Render the approval levels card with decision buttons.
 */
export function renderApprovalLevels(dbSteps, canDecide = false) {
  if (!dbSteps || dbSteps.length === 0) {
    return `<div class="wf-auto-note"><i class="bi bi-lightning-fill"></i> ${t('workflow.auto_approve_note')}</div>`;
  }

  const ROLE_LABELS = {
    manager:      () => t('workflow.level_manager'),
    dept_manager: () => t('workflow.level_dept_manager'),
    finance:      () => t('workflow.level_finance'),
    procurement:  () => t('workflow.level_procurement'),
    executive:    () => t('workflow.level_executive'),
  };

  const STATUS_STYLES = {
    pending:  { bg: '#fff7ed', border: '#fed7aa', color: '#e67e22', icon: 'bi-clock-history' },
    approved: { bg: '#f0fdf4', border: '#bbf7d0', color: '#198754', icon: 'bi-check-circle-fill' },
    rejected: { bg: '#fff1f2', border: '#fecaca', color: '#dc3545', icon: 'bi-x-circle-fill' },
    revision: { bg: '#eff6ff', border: '#bfdbfe', color: '#0d6efd', icon: 'bi-pencil-fill' },
  };

  return `
    <div class="wf-levels">
      ${dbSteps.map((step, i) => {
        const style  = STATUS_STYLES[step.status] || STATUS_STYLES.pending;
        const roleLabel = (ROLE_LABELS[step.approver_role] || (() => step.approver_role))();
        const statusLabel = t(`workflow.status_${step.status}`) || step.status;
        const isActive = step.status === 'pending' && (i === 0 || dbSteps[i - 1]?.status === 'approved');
        return `
          <div class="wf-level-row" style="border-color:${style.border};background:${style.bg}">
            <div class="wf-level-left">
              <div class="wf-level-num" style="background:${style.color}20;color:${style.color}">${step.level}</div>
              <div>
                <div class="wf-level-role">${roleLabel}</div>
                ${step.comments ? `<div class="wf-level-comment"><i class="bi bi-chat-quote"></i> ${step.comments}</div>` : ''}
                ${step.decided_at ? `<div class="wf-level-date">${new Date(step.decided_at).toLocaleDateString()}</div>` : ''}
              </div>
            </div>
            <div class="wf-level-right">
              <span class="wf-status-chip" style="background:${style.color}15;color:${style.color};border-color:${style.color}40">
                <i class="bi ${style.icon}"></i> ${statusLabel}
              </span>
              ${canDecide && isActive ? `
                <div class="wf-decision-btns" style="margin-top:0.5rem;display:flex;gap:0.4rem;flex-wrap:wrap">
                  <button class="btn btn-sm wf-btn-approve" onclick="window.workflowDecide('${step.id}','approved')">
                    <i class="bi bi-check-lg"></i> ${t('workflow.approve')}
                  </button>
                  <button class="btn btn-sm wf-btn-reject" onclick="window.workflowDecide('${step.id}','rejected')">
                    <i class="bi bi-x-lg"></i> ${t('workflow.reject')}
                  </button>
                  <button class="btn btn-sm wf-btn-revision" onclick="window.workflowDecide('${step.id}','revision')">
                    <i class="bi bi-pencil"></i> ${t('workflow.request_revision')}
                  </button>
                </div>
              ` : ''}
            </div>
          </div>`;
      }).join('')}
    </div>`;
}
