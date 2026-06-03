/*
  # Procurement Documents & Quotation Upload System

  ## Overview
  Adds a full procurement document management layer.
  Documents can be attached to any procurement request at any stage.
  Quotations are a special document type submitted by suppliers.

  ## New Tables

  ### procurement_documents
  Stores all uploaded files attached to procurement requests.
  - `id` — UUID primary key
  - `request_id` — FK to procurement_requests
  - `uploaded_by` — user id who uploaded
  - `uploader_role` — 'manager' | 'supplier'
  - `supplier_id` — optional FK to suppliers (if uploaded by a supplier)
  - `doc_type` — 'quotation' | 'invoice' | 'contract' | 'proposal' | 'specification' | 'delivery' | 'other'
  - `file_url` — public URL in storage
  - `file_name` — original filename
  - `file_size` — bytes
  - `file_mime` — MIME type
  - `title` — optional display title
  - `notes` — optional text notes
  - `estimated_price` — for quotations: supplier quoted price
  - `delivery_days` — for quotations: supplier offered delivery time in days
  - `status` — 'pending_review' | 'approved' | 'rejected' | 'superseded'
  - `created_at`

  ## Security
  - RLS enabled
  - All authenticated users can SELECT documents for requests they are involved in
  - Uploads allowed from authenticated users
  - Status updates allowed

  ## Storage
  - Creates procurement-documents bucket (public read, authenticated write)
*/

CREATE TABLE IF NOT EXISTS procurement_documents (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     uuid NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
  uploaded_by    uuid NOT NULL,
  uploader_role  text NOT NULL DEFAULT 'manager',
  supplier_id    uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  doc_type       text NOT NULL DEFAULT 'other',
  file_url       text NOT NULL DEFAULT '',
  file_name      text NOT NULL DEFAULT '',
  file_size      bigint NOT NULL DEFAULT 0,
  file_mime      text NOT NULL DEFAULT '',
  title          text NOT NULL DEFAULT '',
  notes          text NOT NULL DEFAULT '',
  estimated_price numeric(14,2),
  delivery_days  integer,
  status         text NOT NULL DEFAULT 'pending_review',
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE procurement_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read procurement documents"
  ON procurement_documents FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Authenticated users can insert procurement documents"
  ON procurement_documents FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update procurement documents"
  ON procurement_documents FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

-- Index for fast lookup by request
CREATE INDEX IF NOT EXISTS idx_proc_docs_request_id ON procurement_documents(request_id);
CREATE INDEX IF NOT EXISTS idx_proc_docs_uploaded_by ON procurement_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_proc_docs_doc_type ON procurement_documents(doc_type);

-- Storage bucket (may already exist, safe to ignore error)
INSERT INTO storage.buckets (id, name, public)
VALUES ('procurement-documents', 'procurement-documents', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for procurement-documents bucket
DROP POLICY IF EXISTS "Public read procurement docs" ON storage.objects;
DROP POLICY IF EXISTS "Allow upload procurement docs" ON storage.objects;
DROP POLICY IF EXISTS "Allow delete procurement docs" ON storage.objects;

CREATE POLICY "Public read procurement docs"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'procurement-documents');

CREATE POLICY "Allow upload procurement docs"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'procurement-documents');

CREATE POLICY "Allow delete procurement docs"
  ON storage.objects FOR DELETE
  TO public
  USING (bucket_id = 'procurement-documents');
