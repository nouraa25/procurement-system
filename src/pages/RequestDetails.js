import { t } from '../utils/i18n.js';
import { supabase } from '../config/supabase.js';
import { getCurrentUser, getSupplierProfile } from '../utils/auth.js';
import { createSidebar } from '../components/Sidebar.js';
import { renderDocumentPanel } from './ProcurementDocuments.js';
import { getCurrentLanguage } from '../utils/i18n.js';

function L(map) { return map[getCurrentLanguage()] ?? map.ar ?? map.en ?? ''; }

// ─── Procurement Workflow Timeline ────────────────────────────────────────────
function buildProcurementTimeline(request, assignments, documents) {
  const hasSupplier  = assignments && assignments.length > 0;
  const hasQuotation = documents   && documents.some(d => d.doc_type === 'quotation');
  const hasApproved  = documents   && documents.some(d => d.status   === 'approved');

  const statusMap = {
    pending:     'pending',
    in_progress: 'active',
    accepted:    'completed',
    rejected:    'rejected',
    completed:   'completed',
  };
  const reqStatus = request.status;

  const steps = [
    {
      key: 'created',
      icon: 'bi-file-earmark-plus',
      label: L({ ar: 'تم إنشاء الطلب', en: 'Request Created' }),
      desc: L({ ar: `بواسطة المدير · ${new Date(request.created_at).toLocaleDateString('ar-AE', { year:'numeric', month:'short', day:'numeric' })}`, en: `By Manager · ${new Date(request.created_at).toLocaleDateString('en-AE', { year:'numeric', month:'short', day:'numeric' })}` }),
      status: 'completed',
    },
    {
      key: 'assigned',
      icon: 'bi-person-check',
      label: L({ ar: 'تعيين المورد', en: 'Supplier Assigned' }),
      desc: hasSupplier
        ? L({ ar: `${assignments.map(a => a.suppliers?.name).join('، ')} · مُعيَّن`, en: `${assignments.map(a => a.suppliers?.name).join(', ')} · Assigned` })
        : L({ ar: 'لم يُعيَّن مورد بعد', en: 'No supplier assigned yet' }),
      status: hasSupplier ? 'completed' : 'pending',
    },
    {
      key: 'quotation',
      icon: 'bi-receipt',
      label: L({ ar: 'رفع عرض السعر', en: 'Quotation Uploaded' }),
      desc: hasQuotation
        ? L({ ar: `${documents.filter(d => d.doc_type === 'quotation').length} عروض أسعار مرفوعة`, en: `${documents.filter(d => d.doc_type === 'quotation').length} quotation(s) uploaded` })
        : L({ ar: 'لا توجد عروض أسعار بعد', en: 'No quotations yet' }),
      status: hasQuotation ? 'completed' : (hasSupplier ? 'active' : 'pending'),
    },
    {
      key: 'review',
      icon: 'bi-search',
      label: L({ ar: 'مراجعة المدير', en: 'Under Manager Review' }),
      desc: hasApproved
        ? L({ ar: 'تمت المراجعة والموافقة', en: 'Reviewed and approved' })
        : hasQuotation
        ? L({ ar: 'بانتظار مراجعة المدير', en: 'Awaiting manager review' })
        : L({ ar: 'يتطلب رفع عرض سعر أولاً', en: 'Requires quotation first' }),
      status: hasApproved ? 'completed' : (hasQuotation ? 'active' : 'pending'),
    },
    {
      key: 'decision',
      icon: reqStatus === 'rejected' ? 'bi-x-circle' : 'bi-check-circle',
      label: reqStatus === 'rejected'
        ? L({ ar: 'تم الرفض', en: 'Rejected' })
        : L({ ar: 'الموافقة النهائية', en: 'Final Approval' }),
      desc: reqStatus === 'accepted' || reqStatus === 'completed'
        ? L({ ar: 'تمت الموافقة على الطلب', en: 'Request approved' })
        : reqStatus === 'rejected'
        ? L({ ar: 'تم رفض الطلب', en: 'Request rejected' })
        : L({ ar: 'بانتظار القرار النهائي', en: 'Awaiting final decision' }),
      status: reqStatus === 'accepted' || reqStatus === 'completed' ? 'completed' : reqStatus === 'rejected' ? 'rejected' : 'pending',
    },
    {
      key: 'notified',
      icon: 'bi-bell-fill',
      label: L({ ar: 'إشعار المورد', en: 'Supplier Notified' }),
      desc: (reqStatus === 'accepted' || reqStatus === 'completed') && hasSupplier
        ? L({ ar: 'تم إشعار المورد بالنتيجة', en: 'Supplier notified of decision' })
        : L({ ar: 'يتطلب الموافقة أولاً', en: 'Requires approval first' }),
      status: (reqStatus === 'accepted' || reqStatus === 'completed') && hasSupplier ? 'completed' : 'pending',
    },
  ];

  const statusIcon = { completed: 'bi-check-circle-fill', active: 'bi-circle-half', pending: 'bi-circle', rejected: 'bi-x-circle-fill' };
  const statusColor = { completed: '#198754', active: '#0d6efd', pending: '#9ca3af', rejected: '#dc3545' };

  return `
  <div class="proc-timeline-card">
    <div class="proc-timeline-header">
      <i class="bi bi-diagram-3-fill" style="color:var(--accent-color)"></i>
      <span>${L({ ar: 'مسار سير العمل', en: 'Procurement Workflow' })}</span>
    </div>
    <div class="proc-timeline">
      ${steps.map((step, idx) => `
        <div class="proc-timeline-item proc-tl-${step.status}">
          <div class="proc-tl-connector ${idx === steps.length - 1 ? 'last' : ''}">
            <div class="proc-tl-dot" style="background:${statusColor[step.status]};box-shadow:0 0 0 4px ${statusColor[step.status]}22">
              <i class="bi ${statusIcon[step.status]}" style="color:#fff;font-size:0.6rem"></i>
            </div>
            ${idx < steps.length - 1 ? `<div class="proc-tl-line proc-tl-line-${step.status}"></div>` : ''}
          </div>
          <div class="proc-tl-body">
            <div class="proc-tl-icon-wrap" style="background:${statusColor[step.status]}15;color:${statusColor[step.status]}">
              <i class="bi ${step.icon}"></i>
            </div>
            <div class="proc-tl-content">
              <div class="proc-tl-label">${step.label}</div>
              <div class="proc-tl-desc">${step.desc}</div>
            </div>
            <span class="proc-tl-status-chip proc-tl-chip-${step.status}">
              ${step.status === 'completed' ? L({ ar: 'مكتمل', en: 'Done' }) :
                step.status === 'active'    ? L({ ar: 'جارٍ', en: 'In Progress' }) :
                step.status === 'rejected'  ? L({ ar: 'مرفوض', en: 'Rejected' }) :
                L({ ar: 'انتظار', en: 'Pending' })}
            </span>
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}

// ─── Manager Quick Actions Panel ─────────────────────────────────────────────
function buildManagerQuickActions(requestId, request, isManager) {
  if (!isManager) return '';
  return `
  <div class="mgr-quick-actions" id="mgr-quick-actions">
    <div class="mqа-title">${L({ ar: 'إجراءات سريعة', en: 'Quick Actions' })}</div>
    <button class="mqa-btn mqa-approve" onclick="window.quickApprove('${requestId}')">
      <i class="bi bi-check-circle-fill"></i>
      <span>${L({ ar: 'موافقة', en: 'Approve' })}</span>
    </button>
    <button class="mqa-btn mqa-reject" onclick="window.quickReject('${requestId}')">
      <i class="bi bi-x-circle-fill"></i>
      <span>${L({ ar: 'رفض', en: 'Reject' })}</span>
    </button>
    <button class="mqa-btn mqa-supplier" onclick="window.goBack()">
      <i class="bi bi-people-fill"></i>
      <span>${L({ ar: 'الموردون', en: 'Suppliers' })}</span>
    </button>
    <button class="mqa-btn mqa-export" onclick="window.exportRequestPDF('${requestId}')">
      <i class="bi bi-file-earmark-pdf-fill"></i>
      <span>${L({ ar: 'تصدير PDF', en: 'Export PDF' })}</span>
    </button>
    <button class="mqa-btn mqa-notify" onclick="window.notifySuppliers('${requestId}')">
      <i class="bi bi-bell-fill"></i>
      <span>${L({ ar: 'إشعار', en: 'Notify' })}</span>
    </button>
  </div>`;
}

export async function renderRequestDetails(requestId) {
  const user = await getCurrentUser();
  const isManager = user.profile.role === 'manager';

  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="app-container">
      ${createSidebar(user.profile.role, 'requests')}

      <div class="main-content">
        <div class="top-bar">
          <h1 class="page-title">${t('requests.request_details')}</h1>
          <button class="btn btn-secondary" onclick="window.goBack()">
            <i class="bi bi-arrow-left"></i>
            ${t('common.close')}
          </button>
        </div>

        <div class="req-details-layout">
          <div id="request-details-content" class="req-details-main">
            <div style="text-align: center; padding: 3rem;">
              <i class="bi bi-hourglass-split" style="font-size: 3rem;"></i>
              <p>${t('common.loading')}</p>
            </div>
          </div>
          ${isManager ? `<div id="quick-actions-slot" class="req-details-sidebar"></div>` : ''}
        </div>
      </div>
    </div>
  `;

  window.goBack = async () => {
    if (isManager) {
      const { renderRequestsPage } = await import('./ManagerRequests.js');
      renderRequestsPage();
    } else {
      const { renderSupplierDashboard } = await import('./SupplierDashboard.js');
      renderSupplierDashboard();
    }
  };

  await loadRequestDetails(requestId, user);
}

async function getUnreadCount(requestId, otherUserId) {
  const currentUser = await getCurrentUser();
  const { count } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('request_id', requestId)
    .eq('sender_id', otherUserId)
    .eq('receiver_id', currentUser.user.id)
    .eq('is_read', false);

  return count || 0;
}

async function loadRequestDetails(requestId, user) {
  try {
    const [{ data: request }, { data: assignments }, { data: documents }] = await Promise.all([
      supabase.from('procurement_requests').select('*').eq('id', requestId).single(),
      supabase.from('request_suppliers').select('*, suppliers(*)').eq('request_id', requestId),
      supabase.from('procurement_documents').select('id,doc_type,status').eq('request_id', requestId),
    ]);

    const content = document.getElementById('request-details-content');

    let assignmentInfo = '';
    if (user.profile.role === 'supplier') {
      const supplierProfile = await getSupplierProfile(user.user.id);
      const myAssignment = assignments.find(a => a.supplier_id === supplierProfile.id);

      if (myAssignment) {
        const unreadCount = await getUnreadCount(requestId, request.created_by);
        const unreadBadge = unreadCount > 0 ? `<span class="notification-badge">${unreadCount}</span>` : '';

        assignmentInfo = `
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">${t('requests.status')}</h3>
            </div>
            <div style="padding: 1rem;">
              <span class="badge badge-${myAssignment.status}" style="font-size: 1rem; padding: 0.75rem 1.5rem;">
                ${t(`status.${myAssignment.status}`)}
              </span>
              ${myAssignment.status === 'pending' ? `
                <div style="margin-top: 1.5rem; display: flex; flex-direction: column; gap: 1rem;">
                  <div style="display: flex; gap: 1rem;">
                    <button class="btn btn-success" onclick="window.acceptRequest('${myAssignment.id}')" style="flex: 1;">
                      <i class="bi bi-check-circle"></i>
                      ${t('supplier_actions.accept')}
                    </button>
                    <button class="btn btn-danger" onclick="window.rejectRequest('${myAssignment.id}')" style="flex: 1;">
                      <i class="bi bi-x-circle"></i>
                      ${t('supplier_actions.reject')}
                    </button>
                  </div>
                  <button class="btn btn-primary" onclick="window.openChat('${requestId}', '${request.created_by}', 'المدير')" style="width: 100%; position: relative;">
                    <i class="bi bi-chat-dots"></i>
                    ${t('chat.chat')}
                    ${unreadBadge}
                  </button>
                </div>
              ` : ''}
              ${myAssignment.status === 'accepted' ? `
                <div style="margin-top: 1.5rem;">
                  <button class="btn btn-primary" onclick="window.openChat('${requestId}', '${request.created_by}', 'المدير')" style="width: 100%; position: relative;">
                    <i class="bi bi-chat-dots"></i>
                    ${t('chat.chat')}
                    ${unreadBadge}
                  </button>
                </div>
              ` : ''}
              ${myAssignment.rejection_reason ? `
                <div style="margin-top: 1rem; padding: 1rem; background-color: var(--sidebar-bg); border-radius: 0.5rem;">
                  <strong>${t('supplier_actions.rejection_reason')}:</strong>
                  <p style="margin: 0.5rem 0 0 0;">${myAssignment.rejection_reason}</p>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      }
    }

    content.innerHTML = `
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">${request.title}</h3>
          <span class="badge badge-${request.status}">${t(`status.${request.status}`)}</span>
        </div>

        <div style="padding: 1.5rem;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem;">
            <div>
              <div style="color: var(--text-muted); margin-bottom: 0.5rem;">${t('requests.category')}</div>
              <div style="font-weight: 600;">${t(`categories.${request.category}`)}</div>
            </div>
            <div>
              <div style="color: var(--text-muted); margin-bottom: 0.5rem;">${t('requests.quantity')}</div>
              <div style="font-weight: 600;">${request.quantity}</div>
            </div>
            <div>
              <div style="color: var(--text-muted); margin-bottom: 0.5rem;">${t('requests.deadline')}</div>
              <div style="font-weight: 600;">${new Date(request.deadline).toLocaleDateString()}</div>
            </div>
          </div>

          ${request.description ? `
            <div style="margin-top: 1.5rem; padding: 1rem; background-color: var(--sidebar-bg); border-radius: 0.5rem;">
              <div style="color: var(--text-muted); margin-bottom: 0.5rem;">${t('requests.description')}</div>
              <div>${request.description}</div>
            </div>
          ` : ''}
        </div>
      </div>

      ${assignmentInfo}

      ${assignments && assignments.length > 0 ? `
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">${t('suppliers.assigned_suppliers')}</h3>
          </div>
          <div class="supplier-list">
            ${assignments.map(a => `
              <div class="supplier-item">
                <div class="supplier-info">
                  <h5>${a.suppliers.name}</h5>
                  <p><i class="bi bi-tag"></i> ${t(`categories.${a.suppliers.category}`)}</p>
                  <p><i class="bi bi-star-fill rating"></i> ${a.suppliers.rating}</p>
                </div>
                <div style="display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-end;">
                  <span class="badge badge-${a.status}">${t(`status.${a.status}`)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${buildProcurementTimeline(request, assignments || [], documents || [])}

      <div id="docs-panel"></div>
    `;

    // Quick action handlers (manager only)
    window.quickApprove = async (rid) => {
      if (!confirm(L({ ar: 'هل تريد الموافقة على هذا الطلب؟', en: 'Approve this request?' }))) return;
      await supabase.from('procurement_requests').update({ status: 'accepted' }).eq('id', rid);
      loadRequestDetails(requestId, user);
    };
    window.quickReject = async (rid) => {
      if (!confirm(L({ ar: 'هل تريد رفض هذا الطلب؟', en: 'Reject this request?' }))) return;
      await supabase.from('procurement_requests').update({ status: 'rejected' }).eq('id', rid);
      loadRequestDetails(requestId, user);
    };
    window.exportRequestPDF = (rid) => {
      window.print();
    };
    window.notifySuppliers = (rid) => {
      alert(L({ ar: 'تم إرسال الإشعار للمورد', en: 'Supplier notification sent' }));
    };

    // Render document panel after main content is injected
    await renderDocumentPanel(requestId, user);

    // Inject quick actions for managers
    const qaSlot = document.getElementById('quick-actions-slot');
    if (qaSlot) {
      qaSlot.innerHTML = buildManagerQuickActions(requestId, request, user.profile.role === 'manager');
    }

    window.acceptRequest = async (assignmentId) => {
      await handleSupplierResponse(assignmentId, 'accepted', null);
    };

    window.rejectRequest = async (assignmentId) => {
      const reason = prompt(t('supplier_actions.rejection_reason'));
      if (reason) {
        await handleSupplierResponse(assignmentId, 'rejected', reason);
      }
    };

    window.openChat = async (requestId, otherUserId, otherUserName) => {
      const badges = document.querySelectorAll('.notification-badge');
      badges.forEach(badge => {
        badge.style.opacity = '0';
        badge.style.transform = 'scale(0)';
        setTimeout(() => badge.remove(), 300);
      });

      await renderChatModal(requestId, otherUserId, otherUserName);
    };

  } catch (error) {
    console.error('Error loading request details:', error);
  }
}

async function handleSupplierResponse(assignmentId, status, reason) {
  try {
    const { error } = await supabase
      .from('request_suppliers')
      .update({
        status,
        rejection_reason: reason,
        responded_at: new Date().toISOString(),
      })
      .eq('id', assignmentId);

    if (error) throw error;

    alert(t('supplier_actions.response_submitted'));
    window.location.reload();
  } catch (error) {
    console.error('Error updating assignment:', error);
    alert(t('common.error'));
  }
}

export async function renderChatModal(requestId, otherUserId, otherUserName) {
  const user = await getCurrentUser();

  const modalHtml = `
    <div id="chat-modal" class="modal show">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">${t('chat.chat')} - ${otherUserName}</h3>
          <button class="close-btn" onclick="window.closeChatModal()">
            <i class="bi bi-x"></i>
          </button>
        </div>
        <div class="modal-body" style="padding: 0;">
          <div class="chat-container">
            <div class="chat-messages" id="chat-messages">
              <div style="text-align: center; color: var(--text-muted);">
                ${t('common.loading')}
              </div>
            </div>
            <div id="file-preview" style="display: none; padding: 1rem; background: #f8f9fa; border-top: 1px solid #dee2e6;">
              <div style="display: flex; align-items: center; gap: 1rem;">
                <img id="preview-image" style="max-width: 100px; max-height: 100px; display: none; border-radius: 4px;">
                <div id="preview-file" style="display: none;">
                  <i class="bi bi-file-earmark" style="font-size: 2rem;"></i>
                  <span id="preview-filename"></span>
                </div>
                <button class="btn btn-sm btn-secondary" onclick="window.cancelFileUpload()">
                  <i class="bi bi-x"></i>
                </button>
              </div>
            </div>
            <div class="chat-input">
              <input type="file" id="file-input" style="display: none;" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onchange="window.handleFileSelect(event)">
              <button class="btn btn-secondary" onclick="document.getElementById('file-input').click()" title="${t('chat.attach_file')}">
                <i class="bi bi-paperclip"></i>
              </button>
              <input type="text" class="form-control" id="chat-message-input" placeholder="${t('chat.type_message')}" onkeypress="if(event.key==='Enter') window.sendMessage()">
              <button class="btn btn-primary" onclick="window.sendMessage()">
                <i class="bi bi-send"></i>
                ${t('chat.send')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const existingModal = document.getElementById('chat-modal');
  if (existingModal) {
    existingModal.remove();
    if (window.chatInterval) {
      clearInterval(window.chatInterval);
    }
  }

  document.body.insertAdjacentHTML('beforeend', modalHtml);

  window.closeChatModal = () => {
    const modal = document.getElementById('chat-modal');
    if (modal) {
      modal.remove();
    }
    if (window.chatInterval) {
      clearInterval(window.chatInterval);
      window.chatInterval = null;
    }
    window.selectedFile = null;
  };

  const modal = document.getElementById('chat-modal');
  const closeBtn = modal.querySelector('.close-btn');
  const modalDialog = modal.querySelector('.modal-dialog');

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.closeChatModal();
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      window.closeChatModal();
    }
  });

  if (modalDialog) {
    modalDialog.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  window.handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    window.selectedFile = file;
    const preview = document.getElementById('file-preview');
    const previewImage = document.getElementById('preview-image');
    const previewFile = document.getElementById('preview-file');
    const previewFilename = document.getElementById('preview-filename');

    preview.style.display = 'block';

    if (file.type.startsWith('image/')) {
      previewImage.src = URL.createObjectURL(file);
      previewImage.style.display = 'block';
      previewFile.style.display = 'none';
    } else {
      previewFilename.textContent = file.name;
      previewFile.style.display = 'flex';
      previewImage.style.display = 'none';
    }
  };

  window.cancelFileUpload = () => {
    window.selectedFile = null;
    document.getElementById('file-input').value = '';
    document.getElementById('file-preview').style.display = 'none';
  };

  window.sendMessage = async () => {
    const input = document.getElementById('chat-message-input');
    const message = input.value.trim();

    if (!message && !window.selectedFile) return;

    try {
      const currentUser = await getCurrentUser();
      if (!currentUser) {
        alert('يجب تسجيل الدخول أولاً');
        return;
      }

      let fileUrl = null;
      let fileName = null;
      let fileType = null;

      if (window.selectedFile) {
        const file = window.selectedFile;
        const fileExt = file.name.split('.').pop();
        const filePath = `${currentUser.user.id}/${Date.now()}.${fileExt}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('chat-attachments')
          .upload(filePath, file);

        if (uploadError) {
          console.error('Upload error:', uploadError);
          alert('فشل رفع الملف');
          return;
        }

        const { data: urlData } = supabase.storage
          .from('chat-attachments')
          .getPublicUrl(filePath);

        fileUrl = urlData.publicUrl;
        fileName = file.name;
        fileType = file.type;
      }

      const { error: insertError } = await supabase.from('messages').insert({
        request_id: requestId,
        sender_id: currentUser.user.id,
        receiver_id: otherUserId,
        message: message || '',
        file_url: fileUrl,
        file_name: fileName,
        file_type: fileType,
      });

      if (insertError) {
        console.error('Insert error:', insertError);
        alert('حدث خطأ أثناء إرسال الرسالة');
        return;
      }

      input.value = '';
      window.cancelFileUpload();
      await loadMessages(requestId, otherUserId);
    } catch (error) {
      console.error('Error sending message:', error);
      alert('حدث خطأ أثناء إرسال الرسالة');
    }
  };

  await loadMessages(requestId, otherUserId);

  window.chatInterval = setInterval(() => {
    loadMessages(requestId, otherUserId);
  }, 3000);
}

async function loadMessages(requestId, otherUserId) {
  try {
    const user = await getCurrentUser();

    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('request_id', requestId)
      .or(`and(sender_id.eq.${user.user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.user.id})`)
      .order('created_at', { ascending: true });

    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('request_id', requestId)
      .eq('sender_id', otherUserId)
      .eq('receiver_id', user.user.id)
      .eq('is_read', false);

    const messagesDiv = document.getElementById('chat-messages');

    if (!messages || messages.length === 0) {
      messagesDiv.innerHTML = `
        <div style="text-align: center; color: var(--text-muted);">
          ${t('chat.no_messages')}
        </div>
      `;
      return;
    }

    messagesDiv.innerHTML = messages.map(msg => {
      const isSent = msg.sender_id === user.user.id;
      let attachmentHtml = '';

      if (msg.file_url) {
        if (msg.file_type && msg.file_type.startsWith('image/')) {
          attachmentHtml = `
            <div style="margin-top: 0.5rem;">
              <a href="${msg.file_url}" target="_blank">
                <img src="${msg.file_url}" alt="${msg.file_name}" style="max-width: 200px; max-height: 200px; border-radius: 8px; cursor: pointer;">
              </a>
            </div>
          `;
        } else {
          attachmentHtml = `
            <div style="margin-top: 0.5rem;">
              <a href="${msg.file_url}" target="_blank" class="btn btn-sm btn-secondary" style="display: inline-flex; align-items: center; gap: 0.5rem;">
                <i class="bi bi-file-earmark"></i>
                ${msg.file_name || 'ملف مرفق'}
              </a>
            </div>
          `;
        }
      }

      return `
        <div class="message ${isSent ? 'sent' : 'received'}">
          ${msg.message ? `<div>${msg.message}</div>` : ''}
          ${attachmentHtml}
          <div class="message-time">${new Date(msg.created_at).toLocaleString()}</div>
        </div>
      `;
    }).join('');

    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  } catch (error) {
    console.error('Error loading messages:', error);
  }
}
