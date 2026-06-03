/**
 * Document Engine — procurement file & quotation management.
 * Handles upload, storage, AI analysis, and rendering for procurement documents.
 */

import { supabase } from '../config/supabase.js';
import { getCurrentLanguage, t } from './i18n.js';

function L(map) { return map[getCurrentLanguage()] ?? map.ar ?? map.en ?? ''; }

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
];

export const ALLOWED_EXTENSIONS = ['pdf','doc','docx','xls','xlsx','png','jpg','jpeg','webp'];

export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export const DOC_TYPES = ['quotation','invoice','contract','proposal','specification','delivery','other'];

// ─────────────────────────────────────────────────────────────────────────────
// FILE UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

export function validateFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) return t('docs.file_type_invalid');
  if (file.size > MAX_FILE_BYTES) return t('docs.file_too_large');
  return null;
}

export function formatFileSize(bytes) {
  if (bytes < 1024 * 1024)
    return (bytes / 1024).toFixed(0) + ' ' + t('docs.file_size_kb');
  return (bytes / (1024 * 1024)).toFixed(1) + ' ' + t('docs.file_size_mb');
}

export function getFileIcon(mime, name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  if (mime?.startsWith('image/'))                      return { icon: 'bi-file-earmark-image-fill',  color: '#0d6efd' };
  if (mime === 'application/pdf' || ext === 'pdf')     return { icon: 'bi-file-earmark-pdf-fill',    color: '#dc3545' };
  if (['doc','docx'].includes(ext))                    return { icon: 'bi-file-earmark-word-fill',   color: '#0d6efd' };
  if (['xls','xlsx'].includes(ext))                    return { icon: 'bi-file-earmark-excel-fill',  color: '#198754' };
  return { icon: 'bi-file-earmark-fill', color: '#6c757d' };
}

export function isImage(mime) {
  return mime?.startsWith('image/');
}

export function isPreviewable(mime, name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return mime?.startsWith('image/') || mime === 'application/pdf' || ext === 'pdf';
}

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE UPLOAD
// ─────────────────────────────────────────────────────────────────────────────

export async function uploadDocumentFile(file, userId, onProgress) {
  const ext      = file.name.split('.').pop().toLowerCase();
  const filePath = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

  // Simulate progress steps (storage API doesn't expose real progress)
  if (onProgress) onProgress(20);

  const { data, error } = await supabase.storage
    .from('procurement-documents')
    .upload(filePath, file, { contentType: file.type, upsert: false });

  if (error) throw error;
  if (onProgress) onProgress(80);

  const { data: urlData } = supabase.storage
    .from('procurement-documents')
    .getPublicUrl(filePath);

  if (onProgress) onProgress(100);
  return { url: urlData.publicUrl, path: filePath };
}

// ─────────────────────────────────────────────────────────────────────────────
// DATABASE OPERATIONS
// ─────────────────────────────────────────────────────────────────────────────

export async function saveDocument(payload) {
  const { data, error } = await supabase
    .from('procurement_documents')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchDocuments(requestId) {
  const { data, error } = await supabase
    .from('procurement_documents')
    .select('*')
    .eq('request_id', requestId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchQuotations(requestId) {
  const { data, error } = await supabase
    .from('procurement_documents')
    .select('*')
    .eq('request_id', requestId)
    .eq('doc_type', 'quotation')
    .order('estimated_price', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function updateDocumentStatus(docId, status) {
  const { error } = await supabase
    .from('procurement_documents')
    .update({ status })
    .eq('id', docId);
  if (error) throw error;
}

export async function deleteDocument(docId, filePath) {
  if (filePath) {
    await supabase.storage.from('procurement-documents').remove([filePath]);
  }
  await supabase.from('procurement_documents').delete().eq('id', docId);
}

// ─────────────────────────────────────────────────────────────────────────────
// AI QUOTATION ANALYSIS
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeQuotations(quotations) {
  const withPrice = quotations.filter(q => q.estimated_price > 0);
  if (withPrice.length === 0) return null;

  withPrice.sort((a, b) => a.estimated_price - b.estimated_price);

  const lowest     = withPrice[0];
  const highest    = withPrice[withPrice.length - 1];
  const avgPrice   = withPrice.reduce((s, q) => s + q.estimated_price, 0) / withPrice.length;
  const savings    = withPrice.length > 1
    ? Math.round(highest.estimated_price - lowest.estimated_price)
    : 0;
  const savingsPct = highest.estimated_price > 0
    ? Math.round((savings / highest.estimated_price) * 100)
    : 0;

  // Find fastest delivery
  const withDelivery = withPrice.filter(q => q.delivery_days > 0);
  const fastest      = withDelivery.length
    ? withDelivery.reduce((a, b) => a.delivery_days < b.delivery_days ? a : b)
    : null;

  // Best value = lowest price with reasonable delivery
  const bestValue = lowest;

  const insights = [];

  // Price comparison
  if (withPrice.length >= 2) {
    const nameLowest  = supplierLabel(lowest);
    const nameHighest = supplierLabel(highest);
    const diff        = Math.round(((highest.estimated_price - lowest.estimated_price) / highest.estimated_price) * 100);
    insights.push({
      type: 'success', icon: 'bi-graph-down-arrow',
      text: L({ ar: `عرض "${nameLowest}" أرخص بنسبة ${diff}% مقارنةً بـ "${nameHighest}".`,
                 en: `"${nameLowest}" quotation is ${diff}% cheaper than "${nameHighest}".` }),
    });
  }

  // Savings
  if (savings > 0) {
    insights.push({
      type: 'success', icon: 'bi-piggy-bank-fill',
      text: L({ ar: `اختيار أقل عرض سعر يُوفّر ${savings.toLocaleString()} AED مقارنةً بأغلى عرض.`,
                 en: `Choosing the lowest quote saves ${savings.toLocaleString()} AED vs the highest.` }),
    });
  }

  // Fastest delivery
  if (fastest && fastest.id !== lowest.id) {
    insights.push({
      type: 'info', icon: 'bi-lightning-fill',
      text: L({ ar: `عرض "${supplierLabel(fastest)}" يوفر أسرع تسليم (${fastest.delivery_days} يوم).`,
                 en: `"${supplierLabel(fastest)}" offers the fastest delivery (${fastest.delivery_days} days).` }),
    });
  }

  // Missing price fields
  const missing = quotations.filter(q => !q.estimated_price || q.estimated_price <= 0);
  if (missing.length > 0) {
    insights.push({
      type: 'warning', icon: 'bi-exclamation-triangle-fill',
      text: L({ ar: `${missing.length} عرض(أسعار) بدون سعر تقديري. يُنصح بطلب التحديث.`,
                 en: `${missing.length} quotation(s) are missing a price estimate.` }),
    });
  }

  return {
    lowest, highest, bestValue, fastest, avgPrice: Math.round(avgPrice),
    savings, savingsPct, insights, count: withPrice.length,
  };
}

function supplierLabel(doc) {
  return doc.title || doc.file_name || L({ ar: 'مورد', en: 'Supplier' });
}

// ─────────────────────────────────────────────────────────────────────────────
// DOC TYPE LABEL
// ─────────────────────────────────────────────────────────────────────────────

export function docTypeLabel(type) {
  const map = {
    quotation:     () => t('docs.type_quotation'),
    invoice:       () => t('docs.type_invoice'),
    contract:      () => t('docs.type_contract'),
    proposal:      () => t('docs.type_proposal'),
    specification: () => t('docs.type_specification'),
    delivery:      () => t('docs.type_delivery'),
    other:         () => t('docs.type_other'),
  };
  return (map[type] || map.other)();
}

// Status label
export function docStatusLabel(status) {
  const map = {
    pending_review: () => t('docs.status_pending'),
    approved:       () => t('docs.status_approved'),
    rejected:       () => t('docs.status_rejected'),
    superseded:     () => t('docs.status_superseded'),
  };
  return (map[status] || map.pending_review)();
}

export function docStatusColor(status) {
  return { pending_review:'#e67e22', approved:'#198754', rejected:'#dc3545', superseded:'#6c757d' }[status] || '#6c757d';
}

// ─────────────────────────────────────────────────────────────────────────────
// DOCUMENT CARD HTML
// ─────────────────────────────────────────────────────────────────────────────

export function renderDocumentCard(doc, showActions = false) {
  const { icon, color } = getFileIcon(doc.file_mime, doc.file_name);
  const statusColor = docStatusColor(doc.status);
  const sizeStr     = formatFileSize(doc.file_size);
  const typeLabel   = docTypeLabel(doc.doc_type);
  const statusLabel = docStatusLabel(doc.status);
  const uploaderLabel = doc.uploader_role === 'supplier'
    ? t('docs.supplier_label')
    : t('docs.manager_label');
  const dateStr = new Date(doc.created_at).toLocaleDateString(
    getCurrentLanguage() === 'ar' ? 'ar-AE' : 'en-AE',
    { year:'numeric', month:'short', day:'numeric' }
  );

  const priceRow = doc.estimated_price
    ? `<div class="doc-card-meta-row"><i class="bi bi-tag-fill" style="color:#198754"></i> ${doc.estimated_price.toLocaleString()} AED</div>`
    : '';
  const deliveryRow = doc.delivery_days
    ? `<div class="doc-card-meta-row"><i class="bi bi-clock-fill" style="color:#0d6efd"></i> ${doc.delivery_days} ${t('docs.days_unit')}</div>`
    : '';

  return `
    <div class="doc-card" data-id="${doc.id}">
      <div class="doc-card-icon-wrap" style="background:${color}15;color:${color}">
        <i class="bi ${icon}"></i>
      </div>
      <div class="doc-card-body">
        <div class="doc-card-name" title="${doc.file_name}">${doc.title || doc.file_name}</div>
        <div class="doc-card-meta">
          <span class="doc-type-badge">${typeLabel}</span>
          <span class="doc-status-chip" style="background:${statusColor}12;color:${statusColor};border-color:${statusColor}35">${statusLabel}</span>
        </div>
        ${priceRow}${deliveryRow}
        <div class="doc-card-footer">
          <span style="color:var(--text-muted);font-size:0.72rem">${uploaderLabel} · ${dateStr} · ${sizeStr}</span>
          <div class="doc-card-actions">
            ${isPreviewable(doc.file_mime, doc.file_name)
              ? `<button class="doc-action-btn" onclick="window.previewDocument('${doc.id}','${doc.file_url}','${doc.file_mime}','${encodeURIComponent(doc.file_name)}')" title="${t('docs.preview')}"><i class="bi bi-eye-fill"></i></button>`
              : ''}
            <a class="doc-action-btn" href="${doc.file_url}" download="${doc.file_name}" title="${t('docs.download')}"><i class="bi bi-download"></i></a>
            ${showActions ? `
              <button class="doc-action-btn approve" onclick="window.approveDocument('${doc.id}')" title="${t('docs.status_approved')}"><i class="bi bi-check-lg"></i></button>
              <button class="doc-action-btn reject" onclick="window.rejectDocument('${doc.id}')" title="${t('docs.status_rejected')}"><i class="bi bi-x-lg"></i></button>
            ` : ''}
          </div>
        </div>
      </div>
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// QUOTATION TABLE ROW
// ─────────────────────────────────────────────────────────────────────────────

export function renderQuotationRow(doc, isLowest = false, isBest = false) {
  const { icon, color } = getFileIcon(doc.file_mime, doc.file_name);
  const statusColor = docStatusColor(doc.status);
  const dateStr     = new Date(doc.created_at).toLocaleDateString();

  return `
    <tr class="quote-row ${isLowest ? 'quote-row-lowest' : ''}" data-id="${doc.id}">
      <td>
        <div style="display:flex;align-items:center;gap:0.5rem">
          <i class="bi ${icon}" style="color:${color}"></i>
          <div>
            <div style="font-weight:600;font-size:0.85rem">${doc.title || doc.file_name}</div>
            ${doc.notes ? `<small style="color:var(--text-muted)">${doc.notes.slice(0,60)}${doc.notes.length>60?'…':''}</small>` : ''}
          </div>
        </div>
      </td>
      <td>
        <strong style="color:${isLowest?'#198754':'var(--text-light)'}">
          ${doc.estimated_price ? doc.estimated_price.toLocaleString() + ' AED' : '—'}
        </strong>
        ${isLowest ? `<span class="quote-badge-lowest">${t('docs.ai_lowest_quote')}</span>` : ''}
        ${isBest ? `<span class="quote-badge-best">${t('docs.ai_recommended')}</span>` : ''}
      </td>
      <td>${doc.delivery_days ? doc.delivery_days + ' ' + t('docs.days_unit') : '—'}</td>
      <td><span class="doc-status-chip" style="background:${statusColor}12;color:${statusColor};border-color:${statusColor}35">${docStatusLabel(doc.status)}</span></td>
      <td style="font-size:0.78rem;color:var(--text-muted)">${dateStr}</td>
      <td>
        <div style="display:flex;gap:0.35rem">
          ${isPreviewable(doc.file_mime, doc.file_name)
            ? `<button class="btn btn-sm btn-secondary" onclick="window.previewDocument('${doc.id}','${doc.file_url}','${doc.file_mime}','${encodeURIComponent(doc.file_name)}')" title="${t('docs.preview')}"><i class="bi bi-eye-fill"></i></button>`
            : ''}
          <a class="btn btn-sm btn-secondary" href="${doc.file_url}" download="${doc.file_name}" title="${t('docs.download')}"><i class="bi bi-download"></i></a>
        </div>
      </td>
    </tr>`;
}
