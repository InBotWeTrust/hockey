alter table payments
  add column if not exists receipt_email text;

alter table payments
  drop constraint if exists payments_receipt_email_length_check;

alter table payments
  add constraint payments_receipt_email_length_check
  check (receipt_email is null or char_length(receipt_email) between 3 and 254);
