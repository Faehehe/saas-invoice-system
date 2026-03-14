-- Drop failed policies first (they might be partially created)
DROP POLICY IF EXISTS tenant_isolation ON tenants;
DROP POLICY IF EXISTS tenant_isolation ON users;
DROP POLICY IF EXISTS tenant_isolation ON customers;
DROP POLICY IF EXISTS tenant_isolation ON products;
DROP POLICY IF EXISTS tenant_isolation ON invoices;
DROP POLICY IF EXISTS tenant_isolation ON payments;
DROP POLICY IF EXISTS tenant_isolation ON invoice_line_items;

-- Create policies (text comparison, no uuid cast)
CREATE POLICY tenant_isolation ON tenants
  USING (id = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation ON users
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation ON customers
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation ON products
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation ON payments
  USING (tenant_id = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation ON invoice_line_items
  USING (
    invoice_id IN (
      SELECT id FROM invoices
      WHERE tenant_id = current_setting('app.current_tenant_id', true)
    )
  );