-- Landing-Pages: page_type (recruiting | webdesign)
alter table landing_pages
  add column if not exists page_type text not null default 'recruiting';

alter table landing_pages
  add constraint landing_pages_page_type_check
  check (page_type in ('recruiting', 'webdesign'));
