/*
  # Update RLS Policies for Custom Authentication

  ## Changes
  Since we're using custom localStorage-based authentication instead of Supabase Auth,
  we need to temporarily disable RLS or create service-role accessible policies.
  
  For demo purposes, we'll make the tables accessible but still maintain role-based logic in the app.

  ## Security Note
  This is for demonstration. In production, you'd use proper authentication or row-level security with JWT.
*/

-- Disable RLS temporarily for demo (re-enable with proper auth later)
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE procurement_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE request_suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE messages DISABLE ROW LEVEL SECURITY;
