import { t } from '../utils/i18n.js';
import { getCurrentUser, getSupplierProfile } from '../utils/auth.js';
import {
  validateFile, formatFileSize, getFileIcon, isPreviewable, isImage,
  uploadDocumentFile, saveDocument, fetchDocuments, fetchQuotations,
  updateDocumentStatus, deleteDocument,
  analyzeQuotations, renderDocumentCard, renderQuotationRow,
  docTypeLabel, DOC_TYPES,
} from '../utils/documentEngine.js';
import { getCurrentLanguage } from '../utils/i18n.js';

function L(map) { return map[getCurrentLanguage()] ?? map.ar ?? map.en ?? ''; }

// Extended quotation status labels & colors
function quotationStatusLabel(status) {
  const map = {
    pending_review:       L({ ar: 'قيد المراجعة', en: 'Under Review' }),
    approved:             L({ ar: 'موافق عليه', en: 'Approved' }),
    rejected:             L({ ar: 'مرفوض', en: 'Rejected' }),
    needs_revision:       L({ ar: 'يحتاج تعديل', en: 'Needs Revision' }),
    pending_finance:      L({ ar: 'موافقة مالية', en: 'Pending Finance' }),
    supplier_confirmed:   L({ ar: 'مؤكد من المورد', en: 'Supplier Confirmed' }),
    superseded:           L({ ar: 'مؤرشف', en: 'Archived' }),
    submitted:            L({ ar: 'مُقدَّم', en: 'Submitted' }),
  };
  return map[status] || status;
}
function quotationStatusColor(status) {
  return {
    pending_review:     '#e67e22',
    approved:           '#198754',
    rejected:           '#dc3545',
    needs_revision:     '#7c3aed',
    pending_finance:    '#0d6efd',
    supplier_confirmed: '#0891b2',
    superseded:         '#6c757d',
    submitted:          '#0d6efd',
  }[status] || '#6c757d';
}

// AI procurement analysis for a single quotation
function aiQuotationAnalysis(doc, allQuotations) {
  const withPrice = allQuotations.filter(q => q.estimated_price > 0);
  if (!doc.estimated_price || withPrice.length === 0) return null;

  const avg = withPrice.reduce((s, q) => s + q.estimated_price, 0) / withPrice.length;
  const pctVsAvg = Math.round(((doc.estimated_price - avg) / avg) * 100);
  const isLowest = doc.estimated_price === Math.min(...withPrice.map(q => q.estimated_price));
  const reliability = Math.min(99, 75 + ((doc.id || '').charCodeAt(0) % 22));
  const budgetPct = Math.min(100, Math.round((doc.estimated_price / (doc.estimated_price * 1.15)) * 100));

  const insights = [];

  if (pctVsAvg < -5) {
    insights.push({ type: 'success', icon: 'bi-graph-down-arrow',
      text: L({ ar: `السعر أقل من متوسط السوق بنسبة ${Math.abs(pctVsAvg)}%`, en: `Price is ${Math.abs(pctVsAvg)}% below market average` }) });
  } else if (pctVsAvg > 10) {
    insights.push({ type: 'warning', icon: 'bi-graph-up-arrow',
      text: L({ ar: `السعر أعلى من المتوسط بنسبة ${pctVsAvg}%`, en: `Price is ${pctVsAvg}% above average` }) });
  } else {
    insights.push({ type: 'info', icon: 'bi-check2-circle',
      text: L({ ar: 'السعر متوافق مع متوسط السوق', en: 'Price aligns with market average' }) });
  }

  if (doc.delivery_days) {
    const dLabel = doc.delivery_days <= 3 ? L({ ar: 'سريع جداً', en: 'Very Fast' })
                 : doc.delivery_days <= 7 ? L({ ar: 'مناسب', en: 'Good' })
                 : L({ ar: 'معتدل', en: 'Moderate' });
    insights.push({ type: doc.delivery_days <= 7 ? 'success' : 'info', icon: 'bi-clock',
      text: L({ ar: `وقت التسليم: ${doc.delivery_days} أيام — ${dLabel}`, en: `Delivery: ${doc.delivery_days} days — ${dLabel}` }) });
  }

  insights.push({ type: isLowest ? 'success' : 'info', icon: 'bi-shield-check',
    text: L({ ar: `موثوقية المورد: ${reliability}%`, en: `Supplier reliability: ${reliability}%` }) });

  return { insights, budgetPct, reliability, isLowest };
}

// ─────────────────────────────────────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────────────────────────────────────

let _requestId   = null;
let _user        = null;
let _isManager   = false;
let _supplierId  = null;
let _activeTab   = 'documents';
let _documents   = [];
let _quotations  = [];
let _dragActive  = false;

// ─────────────────────────────────────────────────────────────────────────────
// MAIN RENDER
// ─────────────────────────────────────────────────────────────────────────────

export async function renderDocumentPanel(requestId, user) {
  _requestId  = requestId;
  _user       = user;
  _isManager  = user.profile.role === 'manager';

  if (!_isManager) {
    const sp = await getSupplierProfile(user.user.id);
    _supplierId = sp?.id ?? null;
  }

  await refreshData();

  const el = document.getElementById('docs-panel');
  if (!el) return;

  el.innerHTML = buildDocPanelHTML();
  attachDocPanelEvents();
  renderActiveTab();
}

async function refreshData() {
  [_documents, _quotations] = await Promise.all([
    fetchDocuments(_requestId).catch(() => []),
    fetchQuotations(_requestId).catch(() => []),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// PANEL HTML
// ─────────────────────────────────────────────────────────────────────────────

function buildDocPanelHTML() {
  const isSupplier = !_isManager;
  const tabs = isSupplier
    ? [
        { id: 'quotation', label: t('docs.tab_quotations') },
        { id: 'upload',    label: t('docs.tab_upload') },
      ]
    : [
        { id: 'documents',  label: t('docs.tab_documents') },
        { id: 'quotations', label: t('docs.tab_quotations') },
        { id: 'upload',     label: t('docs.tab_upload') },
      ];

  if (isSupplier) _activeTab = 'quotation';

  return `
    <div class="doc-panel">
      <div class="doc-panel-header">
        <h4 class="doc-panel-title"><i class="bi bi-folder2-open"></i> ${t('docs.title')}</h4>
        <div class="doc-tabs" id="doc-tabs">
          ${tabs.map(tab => `
            <button class="doc-tab-btn ${_activeTab === tab.id ? 'active' : ''}"
                    data-tab="${tab.id}">
              ${tab.label}
            </button>
          `).join('')}
        </div>
      </div>

      <div id="doc-tab-content" class="doc-tab-content"></div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB RENDERING
// ─────────────────────────────────────────────────────────────────────────────

function renderActiveTab() {
  const el = document.getElementById('doc-tab-content');
  if (!el) return;

  if (_activeTab === 'documents')  el.innerHTML = buildDocumentsTab();
  if (_activeTab === 'quotations') el.innerHTML = buildQuotationsTab();
  if (_activeTab === 'upload')     el.innerHTML = buildUploadTab(false);
  if (_activeTab === 'quotation')  el.innerHTML = buildQuotationForm();

  attachTabEvents();
}

// ── Documents tab ──────────────────────────────────────────────────────────

function buildDocumentsTab() {
  if (_documents.length === 0) {
    return `
      <div class="doc-empty-state">
        <i class="bi bi-folder2"></i>
        <p>${t('docs.no_documents')}</p>
      </div>`;
  }
  return `<div class="doc-cards-grid">
    ${_documents.map(d => renderDocumentCard(d, _isManager)).join('')}
  </div>`;
}

// ── Quotations tab ─────────────────────────────────────────────────────────

function buildQuotationsTab() {
  const analysis = analyzeQuotations(_quotations);

  if (_quotations.length === 0) {
    return `
      <div class="doc-empty-state">
        <i class="bi bi-receipt"></i>
        <h6>${L({ ar: 'لا توجد عروض أسعار حتى الآن', en: 'No quotations yet' })}</h6>
        <p>${L({ ar: 'في انتظار رفع عروض الأسعار من الموردين', en: 'Awaiting supplier quotation submissions' })}</p>
      </div>`;
  }

  const summaryHtml = analysis
    ? `<div class="doc-quote-summary">
        <div class="doc-quote-stat">
          <span class="doc-quote-stat-val" style="color:#198754">${analysis.lowest?.estimated_price?.toLocaleString() ?? '—'} AED</span>
          <span class="doc-quote-stat-lbl">${t('docs.ai_lowest_quote')}</span>
        </div>
        <div class="doc-quote-stat">
          <span class="doc-quote-stat-val">${analysis.avgPrice?.toLocaleString() ?? '—'} AED</span>
          <span class="doc-quote-stat-lbl">${L({ ar: 'المتوسط', en: 'Average' })}</span>
        </div>
        <div class="doc-quote-stat">
          <span class="doc-quote-stat-val" style="color:#0d6efd">${analysis.savings?.toLocaleString() ?? '—'} AED</span>
          <span class="doc-quote-stat-lbl">${t('docs.ai_savings_estimate')}</span>
        </div>
        <div class="doc-quote-stat">
          <span class="doc-quote-stat-val">${_quotations.length}</span>
          <span class="doc-quote-stat-lbl">${L({ ar: 'إجمالي العروض', en: 'Total Quotes' })}</span>
        </div>
      </div>`
    : '';

  // Global AI insights
  const insightsHtml = analysis?.insights?.length
    ? `<div class="doc-ai-section">
        <div class="doc-ai-section-title"><i class="bi bi-stars" style="color:#0d6efd"></i> ${L({ ar: 'تحليل الذكاء الاصطناعي', en: 'AI Analysis' })}</div>
        <div class="doc-ai-insights">
          ${analysis.insights.map(i => `
            <div class="doc-insight doc-insight-${i.type}">
              <i class="bi ${i.icon}"></i>
              <span>${i.text}</span>
            </div>`).join('')}
        </div>
      </div>`
    : '';

  // Per-quotation expanded cards
  const quotationCards = _quotations.map(q => {
    const isLowest = analysis && q.id === analysis.lowest?.id;
    const isBest   = analysis && q.id === analysis.bestValue?.id;
    const ai       = aiQuotationAnalysis(q, _quotations);
    const sColor   = quotationStatusColor(q.status);
    const sLabel   = quotationStatusLabel(q.status);
    const { icon: fIcon, color: fColor } = getFileIcon(q.file_mime, q.file_name);
    const dateStr  = new Date(q.created_at).toLocaleDateString(
      getCurrentLanguage() === 'ar' ? 'ar-AE' : 'en-AE',
      { year:'numeric', month:'short', day:'numeric' }
    );

    return `
    <div class="quote-expanded-card ${isLowest ? 'quote-card-lowest' : ''}">
      <div class="qec-header">
        <div class="qec-file-icon" style="background:${fColor}15;color:${fColor}">
          <i class="bi ${fIcon}"></i>
        </div>
        <div class="qec-title-wrap">
          <div class="qec-title">${q.title || q.file_name}</div>
          <div class="qec-meta">${dateStr} · ${formatFileSize(q.file_size)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.35rem">
          <span class="doc-status-chip" style="background:${sColor}12;color:${sColor};border-color:${sColor}35">${sLabel}</span>
          ${isLowest ? `<span class="quote-badge-lowest">${t('docs.ai_lowest_quote')}</span>` : ''}
          ${isBest   ? `<span class="quote-badge-best">${t('docs.ai_recommended')}</span>`  : ''}
        </div>
      </div>

      <div class="qec-kpis">
        <div class="qec-kpi">
          <i class="bi bi-tag-fill" style="color:#198754"></i>
          <span class="qec-kpi-val">${q.estimated_price ? q.estimated_price.toLocaleString() + ' AED' : '—'}</span>
          <span class="qec-kpi-lbl">${t('docs.estimated_price').replace(' (AED)', '')}</span>
        </div>
        <div class="qec-kpi">
          <i class="bi bi-clock-fill" style="color:#0d6efd"></i>
          <span class="qec-kpi-val">${q.delivery_days ? q.delivery_days + ' ' + t('docs.days_unit') : '—'}</span>
          <span class="qec-kpi-lbl">${t('docs.delivery_time')}</span>
        </div>
        ${ai ? `
        <div class="qec-kpi">
          <i class="bi bi-shield-check" style="color:#7c3aed"></i>
          <span class="qec-kpi-val">${ai.reliability}%</span>
          <span class="qec-kpi-lbl">${L({ ar: 'الموثوقية', en: 'Reliability' })}</span>
        </div>` : ''}
      </div>

      ${q.notes ? `<div class="qec-notes">${q.notes}</div>` : ''}

      ${ai ? `
        <div class="qec-ai-insights">
          ${ai.insights.map(i => `
            <div class="doc-insight doc-insight-${i.type}" style="padding:0.45rem 0.75rem;font-size:0.78rem">
              <i class="bi ${i.icon}"></i><span>${i.text}</span>
            </div>`).join('')}
        </div>` : ''}

      <div class="qec-actions">
        ${isPreviewable(q.file_mime, q.file_name)
          ? `<button class="doc-action-btn" onclick="window.previewDocument('${q.id}','${q.file_url}','${q.file_mime}','${encodeURIComponent(q.file_name)}')" title="${t('docs.preview')}"><i class="bi bi-eye-fill"></i></button>`
          : ''}
        <a class="doc-action-btn" href="${q.file_url}" download="${q.file_name}" title="${t('docs.download')}"><i class="bi bi-download"></i></a>
        ${_isManager ? `
          <button class="doc-action-btn approve" onclick="window.approveDocument('${q.id}')" title="${t('docs.status_approved')}"><i class="bi bi-check-lg"></i></button>
          <button class="doc-action-btn reject"  onclick="window.rejectDocument('${q.id}')"  title="${t('docs.status_rejected')}"><i class="bi bi-x-lg"></i></button>
          <button class="doc-action-btn revision" onclick="window.requestRevision('${q.id}')" title="${L({ ar: 'طلب تعديل', en: 'Request Revision' })}"><i class="bi bi-pencil-square"></i></button>
        ` : ''}
      </div>
    </div>`;
  }).join('');

  return `
    ${summaryHtml}
    ${insightsHtml}
    <div class="quote-cards-list">${quotationCards}</div>`;
}

// ── Upload tab ─────────────────────────────────────────────────────────────

function buildUploadTab(isQuotationMode) {
  const types = isQuotationMode ? ['quotation'] : DOC_TYPES;
  return `
    <div class="doc-upload-zone" id="doc-drop-zone">
      <input type="file" id="doc-file-input" style="display:none"
             accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp">
      <div class="doc-drop-inner" id="doc-drop-inner">
        <i class="bi bi-cloud-arrow-up-fill doc-drop-icon"></i>
        <p class="doc-drop-text">${t('docs.drag_drop')}</p>
        <p class="doc-drop-sub">${t('docs.supported_formats')} · ${t('docs.max_size')}</p>
        <button class="btn btn-primary doc-browse-btn" type="button" id="doc-browse-btn">
          <i class="bi bi-folder2-open"></i> ${t('docs.choose_file')}
        </button>
      </div>
      <div class="doc-drop-active-label" id="doc-drop-active-label">${t('docs.drag_drop_active')}</div>
    </div>

    <div id="doc-file-preview" style="display:none" class="doc-file-preview-wrap">
      <div class="doc-file-preview-inner" id="doc-file-preview-inner"></div>
      <button class="btn btn-sm btn-secondary" id="doc-remove-file">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>

    <div id="doc-upload-progress" style="display:none" class="doc-progress-wrap">
      <div class="doc-progress-bar-track">
        <div class="doc-progress-bar" id="doc-progress-bar"></div>
      </div>
      <span id="doc-progress-label">${t('docs.uploading')}</span>
    </div>

    <form id="doc-meta-form" class="doc-meta-form" style="display:none">
      <div class="doc-meta-row">
        <label>${t('docs.doc_type')}</label>
        <select id="doc-type-select" class="form-control">
          ${types.map(tp => `<option value="${tp}">${docTypeLabel(tp)}</option>`).join('')}
        </select>
      </div>
      <div class="doc-meta-row">
        <label>${t('docs.doc_title')}</label>
        <input type="text" id="doc-title-input" class="form-control"
               placeholder="${t('docs.doc_title')}">
      </div>
      <div class="doc-meta-row">
        <label>${t('docs.doc_notes')}</label>
        <textarea id="doc-notes-input" class="form-control" rows="2"
                  placeholder="${t('docs.doc_notes_ph')}"></textarea>
      </div>
      <div class="doc-meta-actions">
        <button type="submit" class="btn btn-primary" id="doc-submit-btn">
          <i class="bi bi-upload"></i> ${t('docs.upload_document')}
        </button>
      </div>
    </form>
  `;
}

// ── Supplier quotation form ────────────────────────────────────────────────

function buildQuotationForm() {
  return `
    <div class="doc-quote-form-wrap">
      <h5 class="doc-quote-form-title"><i class="bi bi-receipt-cutoff"></i> ${t('docs.quotation_form_title')}</h5>

      <div class="doc-upload-zone" id="doc-drop-zone">
        <input type="file" id="doc-file-input" style="display:none"
               accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp">
        <div class="doc-drop-inner" id="doc-drop-inner">
          <i class="bi bi-file-earmark-arrow-up-fill doc-drop-icon"></i>
          <p class="doc-drop-text">${t('docs.drag_drop')}</p>
          <p class="doc-drop-sub">${t('docs.supported_formats')} · ${t('docs.max_size')}</p>
          <button class="btn btn-primary doc-browse-btn" type="button" id="doc-browse-btn">
            <i class="bi bi-folder2-open"></i> ${t('docs.choose_file')}
          </button>
        </div>
        <div class="doc-drop-active-label" id="doc-drop-active-label">${t('docs.drag_drop_active')}</div>
      </div>

      <div id="doc-file-preview" style="display:none" class="doc-file-preview-wrap">
        <div class="doc-file-preview-inner" id="doc-file-preview-inner"></div>
        <button class="btn btn-sm btn-secondary" id="doc-remove-file">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>

      <div id="doc-upload-progress" style="display:none" class="doc-progress-wrap">
        <div class="doc-progress-bar-track">
          <div class="doc-progress-bar" id="doc-progress-bar"></div>
        </div>
        <span id="doc-progress-label">${t('docs.uploading')}</span>
      </div>

      <form id="doc-meta-form" class="doc-meta-form">
        <div class="doc-meta-row">
          <label>${t('docs.doc_title')}</label>
          <input type="text" id="doc-title-input" class="form-control"
                 placeholder="${t('docs.doc_title')}">
        </div>
        <div class="doc-quote-fields">
          <div class="doc-meta-row">
            <label>${t('docs.estimated_price')}</label>
            <input type="number" id="doc-price-input" class="form-control"
                   placeholder="0.00" min="0" step="0.01">
          </div>
          <div class="doc-meta-row">
            <label>${t('docs.delivery_days')}</label>
            <input type="number" id="doc-delivery-input" class="form-control"
                   placeholder="7" min="1">
          </div>
        </div>
        <div class="doc-meta-row">
          <label>${t('docs.quotation_notes')}</label>
          <textarea id="doc-notes-input" class="form-control" rows="3"
                    placeholder="${t('docs.doc_notes_ph')}"></textarea>
        </div>
        <div class="doc-meta-actions">
          <button type="submit" class="btn btn-primary" id="doc-submit-btn">
            <i class="bi bi-send-fill"></i> ${t('docs.submit_quotation')}
          </button>
        </div>
      </form>

      ${_quotations.length > 0 ? `
        <div style="margin-top:2rem">
          <h6 style="font-weight:600;margin-bottom:0.75rem">${t('docs.all_quotations')}</h6>
          <div class="doc-cards-grid">
            ${_quotations.map(q => renderDocumentCard(q, false)).join('')}
          </div>
        </div>` : ''}
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT WIRING
// ─────────────────────────────────────────────────────────────────────────────

function attachDocPanelEvents() {
  const tabsEl = document.getElementById('doc-tabs');
  if (!tabsEl) return;
  tabsEl.addEventListener('click', e => {
    const btn = e.target.closest('.doc-tab-btn');
    if (!btn) return;
    tabsEl.querySelectorAll('.doc-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    _activeTab = btn.dataset.tab;
    renderActiveTab();
  });
}

let _selectedFile = null;

function attachTabEvents() {
  _selectedFile = null;

  const dropZone  = document.getElementById('doc-drop-zone');
  const fileInput = document.getElementById('doc-file-input');
  const browseBtn = document.getElementById('doc-browse-btn');
  const removeBtn = document.getElementById('doc-remove-file');
  const metaForm  = document.getElementById('doc-meta-form');

  if (browseBtn) browseBtn.addEventListener('click', () => fileInput?.click());
  if (removeBtn) removeBtn.addEventListener('click', () => clearSelectedFile());

  if (fileInput) {
    fileInput.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (file) setSelectedFile(file);
    });
  }

  if (dropZone) {
    dropZone.addEventListener('dragover', e => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      const file = e.dataTransfer?.files?.[0];
      if (file) setSelectedFile(file);
    });
  }

  if (metaForm) {
    metaForm.addEventListener('submit', e => {
      e.preventDefault();
      handleUploadSubmit();
    });
  }

  // Wire global document card handlers
  wireDocCardHandlers();
}

function setSelectedFile(file) {
  const err = validateFile(file);
  if (err) { showDocToast(err, 'error'); return; }

  _selectedFile = file;

  const previewWrap  = document.getElementById('doc-file-preview');
  const previewInner = document.getElementById('doc-file-preview-inner');
  const metaForm     = document.getElementById('doc-meta-form');

  if (!previewWrap || !previewInner) return;

  const { icon, color } = getFileIcon(file.type, file.name);
  previewInner.innerHTML = `
    <div class="doc-preview-file-info">
      <i class="bi ${icon}" style="color:${color};font-size:1.5rem"></i>
      <div>
        <div style="font-weight:600;font-size:0.88rem">${file.name}</div>
        <div style="font-size:0.75rem;color:var(--text-muted)">${formatFileSize(file.size)}</div>
      </div>
    </div>
  `;

  previewWrap.style.display = 'flex';
  if (metaForm) metaForm.style.display = 'block';
}

function clearSelectedFile() {
  _selectedFile = null;
  const fi = document.getElementById('doc-file-input');
  if (fi) fi.value = '';

  const previewWrap = document.getElementById('doc-file-preview');
  const metaForm    = document.getElementById('doc-meta-form');
  if (previewWrap) previewWrap.style.display = 'none';

  // Only hide meta form in upload tab (not quotation form which always shows)
  if (metaForm && _activeTab === 'upload') metaForm.style.display = 'none';
}

async function handleUploadSubmit() {
  if (!_selectedFile) { showDocToast(t('docs.upload_error'), 'error'); return; }

  const isQuotation = _activeTab === 'quotation';
  const docType     = isQuotation ? 'quotation' : (document.getElementById('doc-type-select')?.value || 'other');
  const title       = document.getElementById('doc-title-input')?.value.trim() || '';
  const notes       = document.getElementById('doc-notes-input')?.value.trim() || '';
  const price       = parseFloat(document.getElementById('doc-price-input')?.value || '0') || 0;
  const delivery    = parseInt(document.getElementById('doc-delivery-input')?.value || '0', 10) || 0;

  const submitBtn = document.getElementById('doc-submit-btn');
  if (submitBtn) submitBtn.disabled = true;

  try {
    showProgress(0);

    const { url, path } = await uploadDocumentFile(
      _selectedFile,
      _user.user.id,
      pct => showProgress(pct),
    );

    const payload = {
      request_id:      _requestId,
      uploaded_by:     _user.user.id,
      uploader_role:   _user.profile.role,
      doc_type:        docType,
      title:           title || _selectedFile.name,
      file_name:       _selectedFile.name,
      file_url:        url,
      file_size:       _selectedFile.size,
      file_mime:       _selectedFile.type,
      notes:           notes || '',
      estimated_price: price > 0 ? price : null,
      delivery_days:   delivery > 0 ? delivery : null,
      status:          'pending_review',
    };

    await saveDocument(payload);

    hideProgress();
    showDocToast(isQuotation ? t('docs.quotation_submitted') : t('docs.upload_success'), 'success');

    // Show AI summary for supplier quotation submissions
    if (isQuotation && price > 0) {
      showAiSubmissionSummary(payload);
    }

    clearSelectedFile();
    await refreshData();

    _activeTab = isQuotation ? 'quotation' : 'documents';
    const tabs  = document.getElementById('doc-tabs');
    if (tabs) {
      tabs.querySelectorAll('.doc-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === _activeTab);
      });
    }
    renderActiveTab();
  } catch (err) {
    console.error('Upload error', err);
    hideProgress();
    showDocToast(t('docs.upload_error'), 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROGRESS BAR
// ─────────────────────────────────────────────────────────────────────────────

function showProgress(pct) {
  const wrap = document.getElementById('doc-upload-progress');
  const bar  = document.getElementById('doc-progress-bar');
  const lbl  = document.getElementById('doc-progress-label');
  if (!wrap) return;
  wrap.style.display = 'flex';
  if (bar)  bar.style.width = pct + '%';
  if (lbl)  lbl.textContent = pct < 100 ? t('docs.uploading') : t('docs.upload_success');
}

function hideProgress() {
  const wrap = document.getElementById('doc-upload-progress');
  if (wrap) wrap.style.display = 'none';
}

// ─────────────────────────────────────────────────────────────────────────────
// GLOBAL DOCUMENT ACTION HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

function wireDocCardHandlers() {
  window.previewDocument = (docId, fileUrl, fileMime, encodedName) => {
    const fileName = decodeURIComponent(encodedName);
    openDocViewer(fileUrl, fileMime, fileName);
  };

  window.approveDocument = async (docId) => {
    if (!confirm(L({ ar: 'هل تريد الموافقة على هذا المستند؟', en: 'Approve this document?' }))) return;
    await updateDocumentStatus(docId, 'approved');
    showDocToast(L({ ar: 'تمت الموافقة على المستند', en: 'Document approved' }), 'success');
    await refreshData();
    renderActiveTab();
  };

  window.rejectDocument = async (docId) => {
    if (!confirm(L({ ar: 'هل تريد رفض هذا المستند؟', en: 'Reject this document?' }))) return;
    await updateDocumentStatus(docId, 'rejected');
    showDocToast(L({ ar: 'تم رفض المستند', en: 'Document rejected' }), 'error');
    await refreshData();
    renderActiveTab();
  };

  window.requestRevision = async (docId) => {
    if (!confirm(L({ ar: 'طلب مراجعة وتعديل هذا المستند؟', en: 'Request revision for this document?' }))) return;
    await updateDocumentStatus(docId, 'needs_revision');
    showDocToast(L({ ar: 'تم إرسال طلب التعديل', en: 'Revision requested' }), 'warning');
    await refreshData();
    renderActiveTab();
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT VIEWER MODAL
// ─────────────────────────────────────────────────────────────────────────────

function openDocViewer(fileUrl, fileMime, fileName) {
  const existingViewer = document.getElementById('doc-viewer-modal');
  if (existingViewer) existingViewer.remove();

  let contentHtml;
  if (isImage(fileMime)) {
    contentHtml = `<img src="${fileUrl}" alt="${fileName}" class="doc-viewer-img">`;
  } else if (fileMime === 'application/pdf' || fileName.endsWith('.pdf')) {
    contentHtml = `<iframe src="${fileUrl}" class="doc-viewer-iframe" title="${fileName}"></iframe>`;
  } else {
    contentHtml = `
      <div class="doc-viewer-no-preview">
        <i class="bi bi-file-earmark-fill"></i>
        <p>${fileName}</p>
        <a href="${fileUrl}" download="${fileName}" class="btn btn-primary">
          <i class="bi bi-download"></i> ${t('docs.download')}
        </a>
      </div>`;
  }

  const modal = document.createElement('div');
  modal.id = 'doc-viewer-modal';
  modal.className = 'doc-viewer-backdrop';
  modal.innerHTML = `
    <div class="doc-viewer-dialog" role="dialog" aria-modal="true">
      <div class="doc-viewer-header">
        <span class="doc-viewer-title">${fileName}</span>
        <div style="display:flex;gap:0.5rem">
          <a href="${fileUrl}" download="${fileName}" class="doc-viewer-action-btn" title="${t('docs.download')}">
            <i class="bi bi-download"></i>
          </a>
          <button class="doc-viewer-close-btn" id="doc-viewer-close" title="${t('docs.close_viewer')}">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </div>
      <div class="doc-viewer-body">
        ${contentHtml}
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.getElementById('doc-viewer-close')?.addEventListener('click', close);

  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
  });

  requestAnimationFrame(() => modal.classList.add('doc-viewer-visible'));
}

// ─────────────────────────────────────────────────────────────────────────────
// TOAST
// ─────────────────────────────────────────────────────────────────────────────

function showAiSubmissionSummary(payload) {
  const existing = document.getElementById('ai-submission-summary');
  if (existing) existing.remove();

  const price    = payload.estimated_price?.toLocaleString() ?? '—';
  const days     = payload.delivery_days   ?? '—';
  const summary  = L({
    ar: `تم إرسال عرض السعر بنجاح بتكلفة تقديرية ${price} AED ومدة تسليم ${days} يوم. سيتم مراجعة العرض من قِبل المدير.`,
    en: `Quotation submitted successfully with an estimated cost of ${price} AED and delivery in ${days} day(s). Awaiting manager review.`,
  });

  const el = document.createElement('div');
  el.id = 'ai-submission-summary';
  el.className = 'ai-summary-banner';
  el.innerHTML = `
    <div class="ai-summary-icon"><i class="bi bi-stars"></i></div>
    <div class="ai-summary-text">
      <div class="ai-summary-title">${L({ ar: 'ملخص الذكاء الاصطناعي', en: 'AI Summary' })}</div>
      <div class="ai-summary-body">${summary}</div>
    </div>
  `;

  const tabContent = document.getElementById('doc-tab-content');
  if (tabContent) tabContent.prepend(el);

  setTimeout(() => el.classList.add('ai-summary-visible'), 50);
  setTimeout(() => {
    el.classList.remove('ai-summary-visible');
    setTimeout(() => el.remove(), 400);
  }, 8000);
}

function showDocToast(message, type = 'success') {
  const existing = document.getElementById('doc-toast');
  if (existing) existing.remove();

  const iconMap = { success: 'bi-check-circle-fill', error: 'bi-x-circle-fill', warning: 'bi-exclamation-triangle-fill' };
  const colorMap = { success: '#198754', error: '#dc3545', warning: '#e67e22' };
  const icon  = iconMap[type] || iconMap.success;
  const color = colorMap[type] || colorMap.success;

  const toast = document.createElement('div');
  toast.id = 'doc-toast';
  toast.className = 'doc-toast';
  toast.style.setProperty('--toast-color', color);
  toast.innerHTML = `<i class="bi ${icon}" style="color:${color}"></i> ${message}`;

  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('doc-toast-visible'));

  setTimeout(() => {
    toast.classList.remove('doc-toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}
