/**
 * Notification Engine — enterprise procurement notifications.
 * Handles creation, fetching, rendering, smart grouping, and email simulation.
 */

import { supabase } from '../config/supabase.js';
import { getCurrentLanguage, t } from './i18n.js';

function L(map) { return map[getCurrentLanguage()] ?? map.ar ?? map.en ?? ''; }

// ─────────────────────────────────────────────────────────────────────────────
// STYLE CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export const NOTIF_TYPES = {
  success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#198754', icon: 'bi-check-circle-fill'          },
  warning: { bg: '#fff7ed', border: '#fed7aa', color: '#e67e22', icon: 'bi-exclamation-triangle-fill'  },
  urgent:  { bg: '#fff1f2', border: '#fecaca', color: '#dc3545', icon: 'bi-bell-fill'                  },
  info:    { bg: '#eff6ff', border: '#bfdbfe', color: '#0d6efd', icon: 'bi-info-circle-fill'           },
};

export const PRIORITY_COLORS = {
  critical: '#dc3545',
  high:     '#e67e22',
  medium:   '#f59e0b',
  low:      '#6c757d',
};

// ─────────────────────────────────────────────────────────────────────────────
// EVENT FACTORY
// ─────────────────────────────────────────────────────────────────────────────

export function buildNotification(event, params = {}) {
  const { requestTitle = '', supplierName = '', budget = 0, category = '', days = 0 } = params;

  const events = {
    // ── Requests ──────────────────────────────────────────────────────────────
    request_submitted: {
      type: 'info', category: 'request', priority: 'medium',
      title:   () => L({ ar: 'تم إرسال الطلب',        en: 'Request Submitted'          }),
      message: () => L({ ar: `تم إرسال طلب "${requestTitle}" بنجاح. يمر الآن بمراحل الموافقة.`,
                         en: `Request "${requestTitle}" submitted. It is now in the approval queue.` }),
    },
    request_draft_saved: {
      type: 'info', category: 'request', priority: 'low',
      title:   () => L({ ar: 'تم حفظ المسودة',        en: 'Draft Saved'                }),
      message: () => L({ ar: `تم حفظ مسودة الطلب "${requestTitle}" بنجاح.`,
                         en: `Draft for "${requestTitle}" has been saved.` }),
    },

    // ── Approvals ─────────────────────────────────────────────────────────────
    approval_received: {
      type: 'success', category: 'approval', priority: 'high',
      title:   () => L({ ar: 'تمت الموافقة',           en: 'Approval Received'          }),
      message: () => L({ ar: `تمت الموافقة على طلب "${requestTitle}". يمكن المتابعة مع المورد.`,
                         en: `Request "${requestTitle}" approved. Proceed with supplier assignment.` }),
    },
    request_rejected: {
      type: 'urgent', category: 'approval', priority: 'high',
      title:   () => L({ ar: 'تم رفض الطلب',           en: 'Request Rejected'           }),
      message: () => L({ ar: `رُفض طلب "${requestTitle}". راجع الملاحظات وأعد التقديم.`,
                         en: `Request "${requestTitle}" was rejected. Review comments and resubmit.` }),
    },
    revision_requested: {
      type: 'warning', category: 'approval', priority: 'medium',
      title:   () => L({ ar: 'طلب مراجعة',             en: 'Revision Requested'         }),
      message: () => L({ ar: `طُلب تعديل على "${requestTitle}". يرجى مراجعة ملاحظات المعتمد.`,
                         en: `Revision required for "${requestTitle}". Review approver comments.` }),
    },
    approval_overdue: {
      type: 'urgent', category: 'approval', priority: 'critical',
      title:   () => L({ ar: 'موافقة متأخرة',           en: 'Approval Overdue'           }),
      message: () => L({ ar: `الطلب "${requestTitle}" ينتظر الموافقة منذ ${days} أيام. تجاوز المدة المحددة.`,
                         en: `Request "${requestTitle}" has been pending approval for ${days} days — SLA breached.` }),
    },
    finance_review_required: {
      type: 'warning', category: 'approval', priority: 'high',
      title:   () => L({ ar: 'مراجعة مالية مطلوبة',    en: 'Finance Review Required'    }),
      message: () => L({ ar: `الطلب "${requestTitle}" (${budget.toLocaleString()} AED) يتطلب مراجعة مالية قبل المتابعة.`,
                         en: `Request "${requestTitle}" (${budget.toLocaleString()} AED) requires finance review.` }),
    },

    // ── Suppliers ────────────────────────────────────────────────────────────
    supplier_selected: {
      type: 'success', category: 'supplier', priority: 'medium',
      title:   () => L({ ar: 'تم اختيار مورد',          en: 'Supplier Assigned'          }),
      message: () => L({ ar: `تم تعيين "${supplierName}" للطلب "${requestTitle}".`,
                         en: `"${supplierName}" assigned to "${requestTitle}".` }),
    },
    supplier_response_received: {
      type: 'info', category: 'supplier', priority: 'medium',
      title:   () => L({ ar: 'رد المورد',               en: 'Supplier Responded'         }),
      message: () => L({ ar: `رد "${supplierName}" على طلب "${requestTitle}".`,
                         en: `"${supplierName}" responded to request "${requestTitle}".` }),
    },
    supplier_rejected_request: {
      type: 'warning', category: 'supplier', priority: 'high',
      title:   () => L({ ar: 'رفض المورد الطلب',        en: 'Supplier Declined'          }),
      message: () => L({ ar: `رفض "${supplierName}" الطلب "${requestTitle}". قد تحتاج لمورد بديل.`,
                         en: `"${supplierName}" declined "${requestTitle}". Consider an alternative supplier.` }),
    },
    supplier_quotation_received: {
      type: 'info', category: 'supplier', priority: 'medium',
      title:   () => L({ ar: 'عرض سعر وارد',            en: 'Quotation Received'         }),
      message: () => L({ ar: `استلمت عرض سعر من "${supplierName}" للطلب "${requestTitle}".`,
                         en: `Received a quotation from "${supplierName}" for "${requestTitle}".` }),
    },

    // ── Delivery ─────────────────────────────────────────────────────────────
    delivery_scheduled: {
      type: 'info', category: 'delivery', priority: 'low',
      title:   () => L({ ar: 'تم جدولة التسليم',        en: 'Delivery Scheduled'         }),
      message: () => L({ ar: `تم جدولة تسليم "${requestTitle}" من "${supplierName}".`,
                         en: `Delivery for "${requestTitle}" from "${supplierName}" is scheduled.` }),
    },
    delivery_dispatched: {
      type: 'info', category: 'delivery', priority: 'medium',
      title:   () => L({ ar: 'تم شحن الطلب',            en: 'Order Dispatched'           }),
      message: () => L({ ar: `شحن "${supplierName}" الطلب "${requestTitle}". في طريقه إليك.`,
                         en: `"${supplierName}" dispatched "${requestTitle}". On its way.` }),
    },
    delivery_completed: {
      type: 'success', category: 'delivery', priority: 'low',
      title:   () => L({ ar: 'اكتمل التسليم',           en: 'Delivery Completed'         }),
      message: () => L({ ar: `تم تسليم "${requestTitle}" بنجاح.`,
                         en: `"${requestTitle}" delivered successfully.` }),
    },
    procurement_delayed: {
      type: 'warning', category: 'delivery', priority: 'high',
      title:   () => L({ ar: 'تأخير في التسليم',        en: 'Delivery Delayed'           }),
      message: () => L({ ar: `رصد الذكاء الاصطناعي تأخيراً محتملاً في تسليم "${requestTitle}".`,
                         en: `AI detected a potential delivery delay for "${requestTitle}".` }),
    },

    // ── AI ───────────────────────────────────────────────────────────────────
    budget_anomaly: {
      type: 'urgent', category: 'ai', priority: 'critical',
      title:   () => L({ ar: 'شذوذ في الميزانية',       en: 'Budget Anomaly Detected'    }),
      message: () => L({ ar: `ميزانية "${requestTitle}" (${budget.toLocaleString()} AED) تتجاوز حد التخصيص القسمي.`,
                         en: `Budget for "${requestTitle}" (${budget.toLocaleString()} AED) exceeds department allocation.` }),
    },
    ai_better_supplier: {
      type: 'info', category: 'ai', priority: 'medium',
      title:   () => L({ ar: 'توصية: مورد أفضل',        en: 'AI: Better Supplier Found'  }),
      message: () => L({ ar: `الذكاء الاصطناعي وجد أسعاراً أفضل لفئة "${category}". راجع التوصيات.`,
                         en: `AI found better pricing for "${category}". Review AI recommendations.` }),
    },
    ai_delivery_risk: {
      type: 'warning', category: 'ai', priority: 'high',
      title:   () => L({ ar: 'تحذير: خطر تسليم',        en: 'AI: Delivery Risk Detected' }),
      message: () => L({ ar: `رصد الذكاء الاصطناعي خطراً في أداء "${supplierName}".`,
                         en: `AI detected delivery risk with "${supplierName}".` }),
    },
    bulk_discount: {
      type: 'info', category: 'ai', priority: 'low',
      title:   () => L({ ar: 'فرصة خصم كمية',          en: 'AI: Bulk Discount Available' }),
      message: () => L({ ar: `الشراء بكميات أكبر في فئة "${category}" قد يوفر خصماً مجمعاً.`,
                         en: `Bulk procurement in "${category}" may unlock a volume discount.` }),
    },
    ai_approval_prediction: {
      type: 'info', category: 'ai', priority: 'low',
      title:   () => L({ ar: 'توقع الموافقة',           en: 'AI Approval Forecast'       }),
      message: () => L({ ar: `الذكاء الاصطناعي يتوقع موافقة بنسبة عالية على "${requestTitle}".`,
                         en: `AI predicts high approval probability for "${requestTitle}".` }),
    },
  };

  const def = events[event];
  if (!def) return null;
  return {
    type:     def.type,
    category: def.category,
    priority: def.priority,
    title:    def.title(),
    message:  def.message(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function createNotification(userId, event, params = {}, relatedRequestId = null) {
  try {
    const notif = buildNotification(event, params);
    if (!notif) return;
    await supabase.from('notifications').insert({
      user_id:            userId,
      type:               notif.type,
      category:           notif.category,
      priority:           notif.priority,
      title:              notif.title,
      message:            notif.message,
      related_request_id: relatedRequestId,
      is_read:            false,
    });
  } catch (err) {
    console.error('createNotification error:', err);
  }
}

export async function fetchNotifications(userId, limit = 60) {
  try {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    return data || [];
  } catch { return []; }
}

export async function markAllRead(userId) {
  try {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId)
      .eq('is_read', false);
  } catch (err) { console.error('markAllRead error:', err); }
}

export async function markOneRead(notifId) {
  try {
    await supabase.from('notifications').update({ is_read: true }).eq('id', notifId);
  } catch { /* silent */ }
}

export async function getUnreadCount(userId) {
  try {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
    return count || 0;
  } catch { return 0; }
}

// ─────────────────────────────────────────────────────────────────────────────
// TIME FORMATTING
// ─────────────────────────────────────────────────────────────────────────────

export function formatTimeAgo(dateStr) {
  const diff  = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 2)  return t('notifications.just_now');
  if (mins  < 60) return `${mins} ${t('notifications.minutes_ago')}`;
  if (hours < 24) return `${hours} ${t('notifications.hours_ago')}`;
  return `${days} ${t('notifications.days_ago')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// GROUP BY CATEGORY
// ─────────────────────────────────────────────────────────────────────────────

export function groupNotifications(notifications) {
  const groups = {};
  notifications.forEach(n => {
    if (!groups[n.category]) groups[n.category] = [];
    groups[n.category].push(n);
  });
  // Sort: urgent first, then by most recent
  const catOrder = ['approval', 'ai', 'supplier', 'request', 'delivery', 'system'];
  return catOrder.filter(c => groups[c]).map(c => ({
    category: c,
    label:    t('notifications.cat_' + c) || c,
    items:    groups[c],
    unread:   groups[c].filter(n => !n.is_read).length,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// RENDER PANEL (flat list)
// ─────────────────────────────────────────────────────────────────────────────

export function renderNotificationPanel(notifications) {
  if (!notifications.length) return `
    <div class="notif-empty">
      <i class="bi bi-bell-slash" style="font-size:2.5rem;color:var(--text-muted)"></i>
      <p style="color:var(--text-muted);margin-top:0.5rem">${t('notifications.no_notifications')}</p>
    </div>`;

  return notifications.map(n => renderNotifItem(n)).join('');
}

export function renderNotifItem(n) {
  const style    = NOTIF_TYPES[n.type] || NOTIF_TYPES.info;
  const priColor = PRIORITY_COLORS[n.priority] || '#6c757d';
  const catLabel = t('notifications.cat_' + n.category) || n.category;
  const link     = n.related_request_id
    ? `onclick="window.notifNavigate('${n.related_request_id}','${n.category}')"`
    : `onclick="window.markNotifRead('${n.id}',this)"`;

  return `
    <div class="notif-item ${n.is_read ? '' : 'notif-unread'}"
         style="border-inline-start-color:${style.color};background:${n.is_read ? 'var(--card-bg)' : style.bg}"
         ${link}
         data-id="${n.id}">
      <div class="notif-item-icon" style="background:${style.color}20;color:${style.color}">
        <i class="bi ${style.icon}"></i>
      </div>
      <div class="notif-item-body">
        <div class="notif-item-header">
          <span class="notif-item-title">${n.title}</span>
          <div class="notif-chips">
            <span class="notif-priority-chip"
                  style="background:${priColor}12;color:${priColor};border-color:${priColor}35">
              ${t('notifications.priority_' + n.priority) || n.priority}
            </span>
            <span class="notif-cat-chip">${catLabel}</span>
          </div>
        </div>
        <p class="notif-item-msg">${n.message}</p>
        <div class="notif-item-footer">
          <span class="notif-time"><i class="bi bi-clock" style="font-size:0.7rem"></i> ${formatTimeAgo(n.created_at)}</span>
          ${n.related_request_id ? `<span class="notif-action-link">${t('requests.view')} <i class="bi bi-arrow-right-short"></i></span>` : ''}
        </div>
      </div>
      ${!n.is_read ? '<div class="notif-unread-dot"></div>' : ''}
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL SIMULATION
// ─────────────────────────────────────────────────────────────────────────────

export function buildEmailSimulation(event, params = {}) {
  const { requestTitle = '', supplierName = '', recipientName = '', budget = 0 } = params;
  const templates = {
    approval_request: {
      subject: () => L({ ar: `[طلب موافقة] ${requestTitle}`, en: `[Approval Request] ${requestTitle}` }),
      body: () => L({
        ar: `عزيزي ${recipientName}،\n\nيرجى مراجعة طلب الشراء "${requestTitle}" والبت فيه.\nالميزانية التقديرية: ${budget.toLocaleString()} AED\nالأولوية: مرتفعة\n\nيُرجى الرد خلال 3 أيام عمل.\n\nمع التحية،\nنظام المشتريات الذكي`,
        en: `Dear ${recipientName},\n\nPlease review and action procurement request "${requestTitle}".\nEstimated Budget: ${budget.toLocaleString()} AED\nPriority: High\n\nResponse required within 3 business days.\n\nBest regards,\nAI Procurement System`,
      }),
    },
    procurement_confirmation: {
      subject: () => L({ ar: `[تأكيد الشراء] ${requestTitle}`, en: `[Procurement Confirmation] ${requestTitle}` }),
      body: () => L({
        ar: `عزيزي ${recipientName}،\n\nيسعدنا إخطارك باعتماد طلب الشراء "${requestTitle}".\nالمورد المحدد: ${supplierName}\nالميزانية المعتمدة: ${budget.toLocaleString()} AED\n\nسيتم إعلامك بتحديثات التسليم.\n\nمع التحية،\nنظام المشتريات الذكي`,
        en: `Dear ${recipientName},\n\nProcurement request "${requestTitle}" has been approved and confirmed.\nSelected Supplier: ${supplierName}\nApproved Budget: ${budget.toLocaleString()} AED\n\nYou will be notified of delivery updates.\n\nBest regards,\nAI Procurement System`,
      }),
    },
    supplier_assignment: {
      subject: () => L({ ar: `[إشعار مورد] طلب جديد — ${requestTitle}`, en: `[Supplier Notification] New Request — ${requestTitle}` }),
      body: () => L({
        ar: `عزيز ${supplierName}،\n\nتم تعيينك لتنفيذ طلب الشراء "${requestTitle}".\nيرجى مراجعة المواصفات وتأكيد القدرة على التوريد.\n\nالمهلة: 48 ساعة للرد.\n\nمع التحية،\nنظام المشتريات الذكي`,
        en: `Dear ${supplierName},\n\nYou have been assigned to procurement request "${requestTitle}".\nPlease review specifications and confirm supply capability.\n\nDeadline: 48 hours to respond.\n\nBest regards,\nAI Procurement System`,
      }),
    },
    finance_approval: {
      subject: () => L({ ar: `[مراجعة مالية] ${requestTitle} — ${budget.toLocaleString()} AED`, en: `[Finance Review] ${requestTitle} — ${budget.toLocaleString()} AED` }),
      body: () => L({
        ar: `عزيزي ${recipientName}،\n\nطلب الشراء "${requestTitle}" يتطلب مراجعة مالية بسبب ارتفاع الميزانية.\nالميزانية المطلوبة: ${budget.toLocaleString()} AED\n\nيرجى الاطلاع على وثائق التبرير المرفقة.\n\nمع التحية،\nنظام المشتريات الذكي`,
        en: `Dear ${recipientName},\n\nProcurement request "${requestTitle}" requires financial review due to elevated budget.\nRequested Budget: ${budget.toLocaleString()} AED\n\nPlease review the attached justification documents.\n\nBest regards,\nAI Procurement System`,
      }),
    },
  };
  return templates[event] || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE ALERTS — contextual banner notifications from analytics data
// ─────────────────────────────────────────────────────────────────────────────

export function generateLiveAlerts(notifications) {
  const alerts = [];
  const unread  = notifications.filter(n => !n.is_read);

  const critical = unread.filter(n => n.priority === 'critical');
  if (critical.length > 0)
    alerts.push({ type: 'danger', icon: 'bi-exclamation-octagon-fill',
      text: L({ ar: `${critical.length} تنبيه(ات) حرجة تتطلب اهتمامك الفوري.`, en: `${critical.length} critical alert(s) require immediate attention.` }) });

  const overdueApprovals = unread.filter(n => n.category === 'approval' && n.type === 'urgent');
  if (overdueApprovals.length > 0)
    alerts.push({ type: 'warning', icon: 'bi-clock-history',
      text: L({ ar: `${overdueApprovals.length} موافقة(ات) متأخرة في انتظار إجراء.`, en: `${overdueApprovals.length} approval(s) are overdue and awaiting action.` }) });

  const aiInsights = unread.filter(n => n.category === 'ai' && n.type === 'info');
  if (aiInsights.length > 0)
    alerts.push({ type: 'info', icon: 'bi-robot',
      text: L({ ar: `${aiInsights.length} توصية(ات) ذكية جديدة من نظام الذكاء الاصطناعي.`, en: `${aiInsights.length} new AI recommendation(s) available.` }) });

  return alerts.slice(0, 3);
}

// ─────────────────────────────────────────────────────────────────────────────
// DEMO SEED
// ─────────────────────────────────────────────────────────────────────────────

export async function seedDemoNotifications(userId) {
  const count = await getUnreadCount(userId);
  if (count > 0) return;

  const demos = [
    { event: 'approval_overdue',        params: { requestTitle: 'Server Infrastructure Upgrade', days: 4 } },
    { event: 'ai_better_supplier',       params: { category: 'Electronics' } },
    { event: 'ai_delivery_risk',         params: { supplierName: 'Tech Hardware Hub' } },
    { event: 'bulk_discount',            params: { category: 'Printing' } },
    { event: 'supplier_quotation_received', params: { supplierName: 'Office Supplies Co', requestTitle: 'Q2 Stationery' } },
    { event: 'request_submitted',        params: { requestTitle: 'Office Chairs Q2' } },
    { event: 'approval_received',        params: { requestTitle: 'Laptop Procurement' } },
    { event: 'finance_review_required',  params: { requestTitle: 'Server Infrastructure Upgrade', budget: 85000 } },
    { event: 'supplier_selected',        params: { supplierName: 'Office Furniture Plus', requestTitle: 'Conference Room Chairs' } },
    { event: 'delivery_dispatched',      params: { supplierName: 'Tech Solutions Inc', requestTitle: 'Laptop Procurement' } },
    { event: 'ai_approval_prediction',   params: { requestTitle: 'Office Chairs Q2' } },
    { event: 'budget_anomaly',           params: { requestTitle: 'Server Infrastructure Upgrade', budget: 125000 } },
  ];

  for (const d of demos) {
    await createNotification(userId, d.event, d.params);
    // stagger timestamps slightly for realism
    await new Promise(r => setTimeout(r, 20));
  }
}
