-- FIX: Hạch toán giao dịch ngân hàng bị "mất" bút toán
-- ==================================================================
-- Nguyên nhân: bảng journal_entries có ràng buộc CHECK chỉ cho phép
-- type ∈ ('closing','adjustment','accrual','invoice'), nhưng khi hạch
-- toán từ sao kê ngân hàng app ghi type = 'income' / 'expense'.
-- => INSERT bị DB từ chối, nhưng giao dịch vẫn bị đánh dấu "đã hạch toán"
--    nên không có bút toán nào được tạo (không xem được, không lên cân đối).
--
-- Chạy 1 lần trong Supabase SQL Editor. An toàn khi chạy lại nhiều lần.
-- ==================================================================

-- 1) Nới ràng buộc type để chấp nhận đủ các loại bút toán app đang dùng.
--    Thiếu 'income'/'expense' (ngân hàng) và 'cash' (sổ quỹ tiền mặt) là
--    lý do bút toán bị DB từ chối.
alter table journal_entries
  drop constraint if exists journal_entries_type_check;

alter table journal_entries
  add constraint journal_entries_type_check
  check (type in ('closing', 'adjustment', 'accrual', 'invoice', 'income', 'expense', 'cash', 'opening'));

-- 1b) Đảm bảo cột liên kết bút toán tồn tại (app dùng cột này để mở lại bút toán)
alter table bank_transactions
  add column if not exists journal_entry_id uuid references journal_entries(id) on delete set null;

-- 2) Sửa dữ liệu cũ: các giao dịch ngân hàng đã bị đánh dấu "matched"
--    nhưng KHÔNG có bút toán thật => đưa về "unmatched" để kế toán
--    hạch toán lại (lần này sẽ tạo được bút toán).
--    Chỉ đụng vào giao dịch mồ côi, không đụng giao dịch đã book đúng.
update bank_transactions bt
set status = 'unmatched',
    journal_entry_id = null
where bt.status = 'matched'
  and (
    bt.journal_entry_id is null
    or not exists (
      select 1 from journal_entries je where je.id = bt.journal_entry_id
    )
  );
