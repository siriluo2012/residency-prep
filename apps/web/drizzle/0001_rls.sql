-- Row-level security for user-owned tables. Content tables are read through the
-- server (service role) so only published rows are exposed; user tables are
-- restricted to the owning auth.uid().
--
-- Apply after drizzle-kit migrations: psql "$DATABASE_URL" -f drizzle/0001_rls.sql

alter table profiles enable row level security;
alter table test_blocks enable row level security;
alter table attempts enable row level security;
alter table fsrs_cards enable row level security;
alter table fsrs_reviews enable row level security;
alter table oet_submissions enable row level security;
alter table item_feedback enable row level security;

drop policy if exists "own profile" on profiles;
drop policy if exists "own blocks" on test_blocks;
drop policy if exists "own attempts" on attempts;
drop policy if exists "own fsrs" on fsrs_cards;
drop policy if exists "own fsrs log" on fsrs_reviews;
drop policy if exists "own oet" on oet_submissions;
drop policy if exists "insert feedback" on item_feedback;
create policy "own profile" on profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own blocks" on test_blocks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own attempts" on attempts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own fsrs" on fsrs_cards for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own fsrs log" on fsrs_reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own oet" on oet_submissions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "insert feedback" on item_feedback for insert with check (auth.uid() = user_id or user_id is null);

-- Published content is readable by anyone (anon key); drafts only via service role.
alter table questions enable row level security;
alter table flashcards enable row level security;
alter table animations enable row level security;
alter table oet_tasks enable row level security;
drop policy if exists "published questions" on questions;
drop policy if exists "published flashcards" on flashcards;
drop policy if exists "published animations" on animations;
drop policy if exists "published oet" on oet_tasks;
create policy "published questions" on questions for select using (status = 'published');
create policy "published flashcards" on flashcards for select using (status = 'published');
create policy "published animations" on animations for select using (status = 'published');
create policy "published oet" on oet_tasks for select using (status = 'published');

-- Auto-create a profile when a user signs up.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Two unresolved error reports send an item back to review.
create or replace function public.requeue_on_feedback() returns trigger
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  select count(*) into n from item_feedback
   where item_type = new.item_type and item_id = new.item_id and resolved = false;
  if n >= 2 then
    if new.item_type = 'question' then update questions set status = 'in_review' where id = new.item_id and status = 'published'; end if;
    if new.item_type = 'flashcard' then update flashcards set status = 'in_review' where id = new.item_id and status = 'published'; end if;
    if new.item_type = 'animation' then update animations set status = 'in_review' where id = new.item_id and status = 'published'; end if;
    insert into review_queue (item_type, item_id, state, priority, auto_flags)
      values (new.item_type, new.item_id, 'pending', 10, '["user_reports"]'::jsonb)
      on conflict (item_type, item_id) do update set state = 'pending', priority = 10;
  end if;
  return new;
end; $$;

drop trigger if exists on_item_feedback on item_feedback;
create trigger on_item_feedback after insert on item_feedback
  for each row execute procedure public.requeue_on_feedback();
