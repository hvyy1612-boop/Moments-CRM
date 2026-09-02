-- Package: distinguish add-ons (film, super 8, album) from base packages
ALTER TABLE "packages" ADD COLUMN "is_add_on" BOOLEAN NOT NULL DEFAULT false;

-- InvoiceLine: separate item/package name (bold heading) from its description detail (SN-style)
ALTER TABLE "invoice_lines" ADD COLUMN "item_name" VARCHAR(200);
