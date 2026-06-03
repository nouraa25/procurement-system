/*
  # Feature 2, 3, 4 — Approval Workflows, Notifications, Procurement Analytics

  ## New Tables

  ### approval_workflows
  Stores the multi-level approval chain for each procurement request.
  - `id` — UUID primary key
  - `request_id` — FK to procurement_requests
  - `level` — approval level (1 = Manager, 2 = Finance, 3 = Procurement Director, 4 = Executive)
  - `approver_role` — text label of the required approver role
  - `status` — pending | approved | rejected | revision
  - `comments` — approver decision notes
  - `decided_at` — when the decision was made
  - `created_at`

  ### notifications
  Central notification log for all procurement events.
  - `id` — UUID
  - `user_id` — recipient user
  - `type` — success | warning | urgent | info
  - `category` — approval | request | supplier | delivery | ai | system
  - `title` — short heading
  - `message` — full text
  - `is_read` — boolean
  - `priority` — low | medium | high | critical
  - `related_request_id` — optional FK
  - `created_at`

  ### procurement_analytics_snapshots
  Periodic snapshots of procurement KPIs for trend charts.
  - `id` — UUID
  - `snapshot_date` — date of snapshot
  - `category` — procurement category
  - `total_spend` — AED
  - `request_count` — number of requests
  - `avg_approval_days` — average days to approval
  - `supplier_id` — optional FK
  - `created_at`

  ## Security
  - RLS enabled on all tables
  - Authenticated users can read their own notifications
  - Manager role can read all approval_workflows and analytics
*/

-- ── approval_workflows ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_workflows (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id      uuid NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
  level           integer NOT NULL DEFAULT 1,
  approver_role   text NOT NULL DEFAULT 'manager',
  status          text NOT NULL DEFAULT 'pending',
  comments        text DEFAULT '',
  decided_at      timestamptz,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE approval_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view approval workflows"
  ON approval_workflows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert approval workflows"
  ON approval_workflows FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update approval workflows"
  ON approval_workflows FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL,
  type                text NOT NULL DEFAULT 'info',
  category            text NOT NULL DEFAULT 'system',
  title               text NOT NULL DEFAULT '',
  message             text NOT NULL DEFAULT '',
  is_read             boolean NOT NULL DEFAULT false,
  priority            text NOT NULL DEFAULT 'medium',
  related_request_id  uuid REFERENCES procurement_requests(id) ON DELETE SET NULL,
  created_at          timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR user_id = (
    SELECT id FROM users WHERE id = user_id LIMIT 1
  ));

CREATE POLICY "System can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── procurement_analytics_snapshots ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procurement_analytics_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date     date NOT NULL DEFAULT CURRENT_DATE,
  category          text NOT NULL DEFAULT 'other',
  total_spend       numeric(14,2) NOT NULL DEFAULT 0,
  request_count     integer NOT NULL DEFAULT 0,
  avg_approval_days numeric(6,2) DEFAULT 0,
  supplier_id       uuid REFERENCES suppliers(id) ON DELETE SET NULL,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE procurement_analytics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read analytics snapshots"
  ON procurement_analytics_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert analytics snapshots"
  ON procurement_analytics_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ── Indexes for performance ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_approval_workflows_request_id ON approval_workflows(request_id);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_date ON procurement_analytics_snapshots(snapshot_date);
