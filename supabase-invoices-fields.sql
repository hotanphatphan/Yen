-- Thêm trường địa chỉ người mua/bán + diễn giải cho hóa đơn.
-- An toàn: chỉ thêm cột nullable, không ảnh hưởng dữ liệu cũ.
-- Chạy 1 lần trong Supabase SQL editor.

alter table invoices add column if not exists seller_address text;
alter table invoices add column if not exists buyer_address text;
alter table invoices add column if not exists description text;
