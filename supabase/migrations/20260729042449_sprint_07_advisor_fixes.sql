create index tax_provider_credentials_vault_secret_idx
  on private.tax_provider_credentials (vault_secret_id);

create index tax_documents_tenant_order_fk_idx
  on public.tax_documents (tenant_id, order_id);

create index tax_documents_tenant_original_fk_idx
  on public.tax_documents (tenant_id, original_tax_document_id)
  where original_tax_document_id is not null;

create index tax_sale_records_tenant_payment_fk_idx
  on public.tax_sale_records (tenant_id, payment_id);
