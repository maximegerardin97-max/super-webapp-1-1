-- design-context schema, table, function, and RLS policies
create schema if not exists design_context;

create or replace function design_context.compute_context_pct(detail_scores jsonb)
returns numeric language sql immutable as $$
  with scores as (
    select (value)::numeric as v
    from jsonb_each_text(detail_scores)
    where value ~ '^\\d+(\\.\\d+)?$'
  )
  select case when count(*) = 0 then 0
              else round(avg(v) * 100.0, 1)
         end
  from scores
$$;

create table if not exists design_context.user_design_style (
  user_id uuid primary key,
  screen_count integer not null default 0,
  primary_colors jsonb not null default '[]'::jsonb,
  accent_colors jsonb not null default '[]'::jsonb,
  bg_mode text check (bg_mode in ('light','dark','auto')),
  type_family text,
  type_scale jsonb not null default '[]'::jsonb,
  density text check (density in ('airy','comfortable','compact')),
  radius text check (radius in ('sharp','soft','rounded')),
  shadow text check (shadow in ('none','subtle','strong')),
  casing text check (casing in ('sentence','title','all_caps')),
  copy_tone text,
  a11y_min_contrast numeric,
  patterns jsonb not null default '[]'::jsonb,
  components jsonb not null default '[]'::jsonb,
  icon_style text,
  illustration_style text,
  notes text,
  detail_scores jsonb not null default '{}'::jsonb,
  context_pct numeric generated always as (
    design_context.compute_context_pct(detail_scores)
  ) stored,
  updated_at timestamptz not null default now()
);

create or replace function design_context.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;$$;

drop trigger if exists trg_user_design_style_updated on design_context.user_design_style;
create trigger trg_user_design_style_updated
before update on design_context.user_design_style
for each row execute function design_context.set_updated_at();

alter table design_context.user_design_style enable row level security;

do $$ begin
  perform 1 from pg_policies where schemaname = 'design_context' and tablename = 'user_design_style' and policyname = 'Allow select own row';
  if not found then
    create policy "Allow select own row" on design_context.user_design_style
      for select using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  perform 1 from pg_policies where schemaname = 'design_context' and tablename = 'user_design_style' and policyname = 'Allow insert own row';
  if not found then
    create policy "Allow insert own row" on design_context.user_design_style
      for insert with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  perform 1 from pg_policies where schemaname = 'design_context' and tablename = 'user_design_style' and policyname = 'Allow update own row';
  if not found then
    create policy "Allow update own row" on design_context.user_design_style
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;



