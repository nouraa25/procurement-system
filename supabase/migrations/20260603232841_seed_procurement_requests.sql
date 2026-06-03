/*
  # Seed Procurement Requests

  Inserts demo procurement requests linked to the manager account.
  These requests allow the Requests page to show real data.

  ## New Data
  - 5 sample requests across different categories and statuses
  - All created by manager@procurement.com
  - Dates set relative to 2026-06-03
*/

INSERT INTO procurement_requests (title, category, description, budget, quantity, deadline, status, created_by)
SELECT
  r.title, r.category, r.description, r.budget, r.quantity, r.deadline::date, r.status, u.id
FROM users u
CROSS JOIN (VALUES
  ('Laptop Computers for IT Team', 'electronics', 'High-performance laptops for the development team', 45000.00, 10, '2026-07-15', 'pending'),
  ('Office Printing Services Q3', 'printing', 'Quarterly brochure and document printing contract', 12000.00, 5000, '2026-06-30', 'in_progress'),
  ('Conference Room Furniture', 'furniture', 'Chairs, tables and whiteboards for new conference room', 28000.00, 1, '2026-08-01', 'pending'),
  ('Annual Software Licenses', 'software', 'Renewal of enterprise software licenses for all staff', 67000.00, 150, '2026-06-20', 'completed'),
  ('Office Stationery Bundle', 'stationery', 'Monthly stationery and paper supplies restock', 3500.00, 200, '2026-06-10', 'rejected')
) AS r(title, category, description, budget, quantity, deadline, status)
WHERE u.email = 'manager@procurement.com'
ON CONFLICT DO NOTHING;
