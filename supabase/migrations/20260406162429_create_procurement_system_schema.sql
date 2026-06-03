/*
  # Procurement Management System Database Schema

  ## Overview
  Complete database schema for AI-powered procurement management system with multi-language support.

  ## New Tables

  ### 1. users
  - `id` (uuid, primary key) - Unique user identifier
  - `email` (text, unique) - User email for login
  - `password` (text) - Hashed password
  - `role` (text) - User role: 'manager' or 'supplier'
  - `is_active` (boolean) - Account status
  - `created_at` (timestamptz) - Account creation timestamp

  ### 2. suppliers
  - `id` (uuid, primary key) - Unique supplier identifier
  - `user_id` (uuid, nullable) - Link to users table (if supplier has account)
  - `name` (text) - Supplier company name
  - `category` (text) - Business category (electronics, printing, furniture, etc.)
  - `rating` (numeric) - Rating out of 5
  - `contact_email` (text, nullable) - Contact email
  - `contact_phone` (text, nullable) - Contact phone
  - `created_at` (timestamptz) - Record creation timestamp

  ### 3. procurement_requests
  - `id` (uuid, primary key) - Unique request identifier
  - `title` (text) - Request title/product name
  - `category` (text) - Product category
  - `description` (text, nullable) - Detailed description
  - `budget` (numeric) - Budget amount
  - `quantity` (integer) - Required quantity
  - `deadline` (date) - Required delivery date
  - `status` (text) - Status: 'pending', 'in_progress', 'completed', 'rejected'
  - `created_by` (uuid) - Manager who created request
  - `created_at` (timestamptz) - Request creation timestamp

  ### 4. request_suppliers
  - `id` (uuid, primary key) - Unique assignment identifier
  - `request_id` (uuid) - Link to procurement_requests
  - `supplier_id` (uuid) - Link to suppliers
  - `status` (text) - Status: 'pending', 'accepted', 'rejected'
  - `rejection_reason` (text, nullable) - Reason if rejected
  - `assigned_at` (timestamptz) - Assignment timestamp
  - `responded_at` (timestamptz, nullable) - Response timestamp

  ### 5. messages
  - `id` (uuid, primary key) - Unique message identifier
  - `request_id` (uuid) - Related procurement request
  - `sender_id` (uuid) - User who sent message
  - `receiver_id` (uuid) - User who receives message
  - `message` (text) - Message content
  - `is_read` (boolean) - Read status
  - `created_at` (timestamptz) - Message timestamp

  ## Security
  - Enable RLS on all tables
  - Managers can manage requests and view all data
  - Suppliers can only view their assigned requests
  - Users can only send/receive their own messages
  - Authentication required for all operations
*/

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  password text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'supplier')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create suppliers table
CREATE TABLE IF NOT EXISTS suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text NOT NULL,
  rating numeric(2,1) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  contact_email text,
  contact_phone text,
  created_at timestamptz DEFAULT now()
);

-- Create procurement_requests table
CREATE TABLE IF NOT EXISTS procurement_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  description text,
  budget numeric(12,2) NOT NULL CHECK (budget > 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  deadline date NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
  created_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

-- Create request_suppliers table
CREATE TABLE IF NOT EXISTS request_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  rejection_reason text,
  assigned_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(request_id, supplier_id)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message text NOT NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for users
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- RLS Policies for suppliers
CREATE POLICY "Managers can view all suppliers"
  ON suppliers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'manager'
    )
  );

CREATE POLICY "Suppliers can view own profile"
  ON suppliers FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Managers can insert suppliers"
  ON suppliers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'manager'
    )
  );

CREATE POLICY "Managers can update suppliers"
  ON suppliers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'manager'
    )
  );

-- RLS Policies for procurement_requests
CREATE POLICY "Managers can view all requests"
  ON procurement_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'manager'
    )
  );

CREATE POLICY "Suppliers can view assigned requests"
  ON procurement_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM request_suppliers rs
      JOIN suppliers s ON s.id = rs.supplier_id
      WHERE rs.request_id = procurement_requests.id
      AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can insert requests"
  ON procurement_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'manager'
    )
    AND created_by = auth.uid()
  );

CREATE POLICY "Managers can update requests"
  ON procurement_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'manager'
    )
  );

-- RLS Policies for request_suppliers
CREATE POLICY "Managers can view all request suppliers"
  ON request_suppliers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'manager'
    )
  );

CREATE POLICY "Suppliers can view own assignments"
  ON request_suppliers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM suppliers
      WHERE suppliers.id = request_suppliers.supplier_id
      AND suppliers.user_id = auth.uid()
    )
  );

CREATE POLICY "Managers can insert request suppliers"
  ON request_suppliers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid() AND users.role = 'manager'
    )
  );

CREATE POLICY "Suppliers can update own assignments"
  ON request_suppliers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM suppliers
      WHERE suppliers.id = request_suppliers.supplier_id
      AND suppliers.user_id = auth.uid()
    )
  );

-- RLS Policies for messages
CREATE POLICY "Users can view own messages"
  ON messages FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid() OR receiver_id = auth.uid());

CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (sender_id = auth.uid());

CREATE POLICY "Users can update own received messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (receiver_id = auth.uid())
  WITH CHECK (receiver_id = auth.uid());

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_suppliers_category ON suppliers(category);
CREATE INDEX IF NOT EXISTS idx_suppliers_rating ON suppliers(rating DESC);
CREATE INDEX IF NOT EXISTS idx_suppliers_user_id ON suppliers(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_created_by ON procurement_requests(created_by);
CREATE INDEX IF NOT EXISTS idx_requests_status ON procurement_requests(status);
CREATE INDEX IF NOT EXISTS idx_request_suppliers_request ON request_suppliers(request_id);
CREATE INDEX IF NOT EXISTS idx_request_suppliers_supplier ON request_suppliers(supplier_id);
CREATE INDEX IF NOT EXISTS idx_messages_request ON messages(request_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);

-- Insert sample data for testing

-- Sample users (passwords are hashed version of 'password123')
INSERT INTO users (email, password, role) VALUES
('manager@procurement.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'manager'),
('supplier1@company.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'supplier'),
('supplier2@company.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'supplier'),
('supplier3@company.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'supplier')
ON CONFLICT (email) DO NOTHING;

-- Sample suppliers
INSERT INTO suppliers (user_id, name, category, rating, contact_email, contact_phone)
SELECT 
  u.id,
  'Tech Solutions Inc',
  'electronics',
  4.8,
  'supplier1@company.com',
  '+1234567890'
FROM users u WHERE u.email = 'supplier1@company.com'
ON CONFLICT DO NOTHING;

INSERT INTO suppliers (user_id, name, category, rating, contact_email, contact_phone)
SELECT 
  u.id,
  'PrintMaster Pro',
  'printing',
  4.5,
  'supplier2@company.com',
  '+1234567891'
FROM users u WHERE u.email = 'supplier2@company.com'
ON CONFLICT DO NOTHING;

INSERT INTO suppliers (user_id, name, category, rating, contact_email, contact_phone)
SELECT 
  u.id,
  'Office Furniture Plus',
  'furniture',
  4.2,
  'supplier3@company.com',
  '+1234567892'
FROM users u WHERE u.email = 'supplier3@company.com'
ON CONFLICT DO NOTHING;

-- Additional suppliers without user accounts
INSERT INTO suppliers (name, category, rating, contact_email, contact_phone) VALUES
('Global Electronics', 'electronics', 4.6, 'sales@globalelectronics.com', '+1234567893'),
('Premium Print Services', 'printing', 4.9, 'info@premiumprint.com', '+1234567894'),
('Modern Office Supply', 'furniture', 4.3, 'contact@modernoffice.com', '+1234567895'),
('Tech Hardware Hub', 'electronics', 4.7, 'support@techhub.com', '+1234567896'),
('Quick Print Shop', 'printing', 4.1, 'hello@quickprint.com', '+1234567897')
ON CONFLICT DO NOTHING;