-- Apply in a fresh Supabase project. No service-role key is used by the app.
create extension if not exists pgcrypto;
create table public.campuses(id uuid primary key default gen_random_uuid(),name text not null,slug text unique not null,city text not null,is_active boolean not null default true,created_at timestamptz not null default now());
insert into public.campuses values('11111111-1111-4111-8111-111111111111','Evergreen Campus','evergreen-demo','Bengaluru',true,now());
create table public.profiles(id uuid primary key references auth.users on delete cascade,display_name text not null check(length(display_name) between 1 and 80),campus_id uuid not null references public.campuses,role text not null default 'student' check(role in ('student','moderator')),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create function public.on_signup() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$begin insert into profiles(id,display_name,campus_id) values(new.id,'Campus neighbour','11111111-1111-4111-8111-111111111111');return new;end$$;
create trigger create_profile after insert on auth.users for each row execute function public.on_signup();
alter table public.profiles add column match_notifications boolean not null default true;
create table public.mutation_keys(user_id uuid references public.profiles on delete cascade,request_id uuid,result jsonb not null,primary key(user_id,request_id));
alter table public.mutation_keys enable row level security;
revoke all on public.mutation_keys from anon,authenticated;
create table public.item_reports(id uuid primary key default gen_random_uuid(),reporter_id uuid not null references public.profiles on delete cascade,campus_id uuid not null references public.campuses,type text not null check(type in ('lost','found')),title text not null check(length(title) between 3 and 100),description text not null check(length(description) between 15 and 2000),category text not null check(category in ('Electronics','Bags and wallets','Keys','ID cards and documents','Clothing and accessories','Books and stationery','Water bottles and containers','Other')),color text not null default '' check(length(color)<=40),brand text not null default '' check(length(brand)<=60),location_label text not null check(location_label in ('Central Library','Cafeteria','Sports Complex','Academic Block','Student Centre','Main Gate')),event_date date not null check(event_date<=current_date),status text not null default 'active' check(status in ('active','under_review','resolved','closed')),image text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),resolved_at timestamptz);
create index reports_filter on public.item_reports(campus_id,status,type,category,event_date desc);
create index reports_search on public.item_reports using gin(to_tsvector('english',title||' '||description));
alter table public.campuses add column match_threshold integer not null default 65 check(match_threshold between 40 and 100);
create table public.item_images(id uuid primary key default gen_random_uuid(),report_id uuid not null references public.item_reports on delete cascade,storage_path text not null,alt_text text not null,created_at timestamptz default now());
create table public.item_matches(id uuid primary key default gen_random_uuid(),lost_report_id uuid not null references public.item_reports on delete cascade,found_report_id uuid not null references public.item_reports on delete cascade,score integer not null check(score between 0 and 100),reasons jsonb not null,status text not null default 'suggested' check(status in ('suggested','dismissed','confirmed')),created_at timestamptz default now(),unique(lost_report_id,found_report_id),check(lost_report_id<>found_report_id));
create function public.check_match_pair() returns trigger language plpgsql set search_path=public,pg_temp as $$begin if not exists(select 1 from item_reports l join item_reports f on f.id=new.found_report_id where l.id=new.lost_report_id and l.type='lost' and f.type='found' and l.campus_id=f.campus_id) then raise exception 'Invalid match pair';end if;return new;end$$;
create trigger valid_match before insert or update on public.item_matches for each row execute function public.check_match_pair();
create table public.claims(id uuid primary key default gen_random_uuid(),item_report_id uuid not null references public.item_reports on delete cascade,claimant_id uuid not null references public.profiles on delete cascade,message text not null check(length(message) between 15 and 2000),status text not null default 'pending' check(status in ('pending','under_review','approved','rejected','withdrawn','completed')),review_note text not null default '',reviewed_by uuid references public.profiles,reviewed_at timestamptz,created_at timestamptz not null default now(),history jsonb not null default '[]');
create unique index one_winning_claim on public.claims(item_report_id) where status in ('approved','completed');
create unique index one_active_claim on public.claims(item_report_id,claimant_id) where status in ('pending','under_review','approved');
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles on delete cascade,title text not null,body text not null,report_id uuid references public.item_reports on delete cascade,read boolean not null default false,dedupe_key text unique,created_at timestamptz not null default now());
create index notification_user on public.notifications(user_id,created_at desc);
create table public.report_flags(id uuid primary key default gen_random_uuid(),report_id uuid not null references public.item_reports on delete cascade,reporter_id uuid not null references public.profiles on delete cascade,reason text not null check(length(reason) between 5 and 1000),status text not null default 'pending' check(status in ('pending','reviewed')),created_at timestamptz default now());
create function public.my_campus() returns uuid language sql stable security definer set search_path=public,pg_temp as $$select campus_id from profiles where id=auth.uid()$$;
create function public.is_moderator() returns boolean language sql stable security definer set search_path=public,pg_temp as $$select coalesce((select role='moderator' from profiles where id=auth.uid()),false)$$;
alter table public.campuses enable row level security;
alter table public.profiles enable row level security;
alter table public.item_reports enable row level security;
alter table public.item_images enable row level security;
alter table public.item_matches enable row level security;
alter table public.claims enable row level security;
alter table public.notifications enable row level security;
alter table public.report_flags enable row level security;
create policy campus_read on public.campuses for select using(is_active);
create policy profile_self on public.profiles for select using(id=auth.uid());
create policy report_read on public.item_reports for select using(campus_id=coalesce(public.my_campus(),'11111111-1111-4111-8111-111111111111'::uuid) and (status='active' or reporter_id=auth.uid() or public.is_moderator() or exists(select 1 from public.claims c where c.item_report_id=item_reports.id and c.claimant_id=auth.uid())));
-- Use SECURITY DEFINER helper to avoid recursive report/claim policies.
create function public.can_read_claim(rid uuid, claimant uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$select auth.uid()=claimant or exists(select 1 from item_reports r where r.id=rid and r.campus_id=public.my_campus() and (r.reporter_id=auth.uid() or public.is_moderator()))$$;
create policy claim_read on public.claims for select using(public.can_read_claim(item_report_id,claimant_id));
create policy notification_self on public.notifications for select using(user_id=auth.uid());
create policy flag_moderator on public.report_flags for select using(public.is_moderator() and exists(select 1 from public.item_reports r where r.id=report_id and r.campus_id=public.my_campus()));
create policy match_read on public.item_matches for select using(exists(select 1 from public.item_reports r where r.id=lost_report_id) and exists(select 1 from public.item_reports r where r.id=found_report_id));
create policy image_read on public.item_images for select using(exists(select 1 from public.item_reports r where r.id=report_id));
-- No direct writes: every mutation is validated in app_mutate below.
revoke all on public.profiles,public.item_reports,public.item_images,public.item_matches,public.claims,public.notifications,public.report_flags from anon,authenticated;
grant select on public.campuses,public.profiles,public.item_reports,public.item_images,public.item_matches,public.claims,public.notifications,public.report_flags to anon,authenticated;
create function public.token_similarity(a text,b text) returns numeric language sql immutable as $$with x as(select distinct unnest(regexp_split_to_array(trim(regexp_replace(lower(a),'[^[:alnum:]]+',' ','g')),' +')) t), y as(select distinct unnest(regexp_split_to_array(trim(regexp_replace(lower(b),'[^[:alnum:]]+',' ','g')),' +')) t) select coalesce((select count(*)::numeric from(select t from x intersect select t from y) z where t<>'')/nullif((select count(*) from(select t from x union select t from y) z where t<>''),0),0)$$;
create function public.refresh_matches(cid uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$declare l item_reports;f item_reports;points numeric;weight numeric;sim numeric;score_value integer;why jsonb;begin
 delete from item_matches m where exists(select 1 from item_reports r where r.campus_id=cid and r.status<>'active' and r.id in (m.lost_report_id,m.found_report_id));
 for l in select * from item_reports where campus_id=cid and type='lost' and status='active' loop
 for f in select * from item_reports where campus_id=cid and type='found' and status='active' and category=l.category loop
 points:=20;weight:=20;why:='["Same item category"]';sim:=token_similarity(l.title,f.title);points:=points+25*sim;weight:=weight+25;if sim>=0.5 then why:=why||'"Similar item titles"'::jsonb;end if;
 sim:=token_similarity(l.description,f.description);points:=points+20*sim;weight:=weight+20;if sim>=0.5 then why:=why||'"Shared description details"'::jsonb;end if;
 if l.color<>'' and f.color<>'' then weight:=weight+10;if lower(l.color)=lower(f.color) then points:=points+10;why:=why||to_jsonb('Both described as '||l.color);end if;end if;
 if l.brand<>'' and f.brand<>'' then weight:=weight+10;if lower(l.brand)=lower(f.brand) then points:=points+10;why:=why||to_jsonb('Same brand: '||l.brand);end if;end if;
 sim:=greatest(0,1-abs(l.event_date-f.event_date)::numeric/14);weight:=weight+10;points:=points+10*sim;if sim>=0.5 then why:=why||'"Lost and found dates are close"'::jsonb;end if;
 weight:=weight+5;if l.location_label=f.location_label then points:=points+5;why:=why||'"Same campus location"'::jsonb;end if;
 score_value:=least(round(points/weight*100)::integer,case when token_similarity(l.title,f.title)<0.1 then 55 else 100 end);
 if score_value>=40 then insert into item_matches(lost_report_id,found_report_id,score,reasons) values(l.id,f.id,score_value,why) on conflict(lost_report_id,found_report_id) do update set score=excluded.score,reasons=excluded.reasons;
 if score_value>=(select match_threshold from campuses where id=cid) then insert into notifications(user_id,title,body,report_id,dedupe_key) select r.reporter_id,'A possible match is waiting',score_value||' similarity score. Review details before claiming.',r.id,'match:'||l.id||':'||f.id||':'||r.reporter_id from item_reports r join profiles p on p.id=r.reporter_id where r.id in(l.id,f.id) and p.match_notifications on conflict(dedupe_key) do nothing;end if;
 else delete from item_matches where lost_report_id=l.id and found_report_id=f.id;end if;
 end loop;end loop;end$$;
revoke execute on function public.refresh_matches(uuid) from public,anon,authenticated;
create function public.app_snapshot() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$select jsonb_build_object('reports',coalesce((select jsonb_agg(r order by created_at desc) from (select * from item_reports limit 500)r),'[]'::jsonb),'claims',coalesce((select jsonb_agg(c) from claims c),'[]'::jsonb),'matches',coalesce((select jsonb_agg(m) from item_matches m),'[]'::jsonb),'notifications',coalesce((select jsonb_agg(n) from notifications n),'[]'::jsonb),'flags',coalesce((select jsonb_agg(f) from report_flags f),'[]'::jsonb),'profiles','[]'::jsonb)$$;
create function public.app_mutate(operation text,payload jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare actor profiles;r item_reports;c claims;result_id uuid;next_status text;note text;cached jsonb;begin
 select * into actor from profiles where id=auth.uid();if actor.id is null then raise exception 'Authentication required';end if;
 if operation='profile' then update profiles set display_name=trim(payload->>'display_name'),match_notifications=coalesce((payload->>'match_notifications')::boolean,true),updated_at=now() where id=actor.id;return '{"ok":true}'::jsonb;end if;
 if operation='report' and payload->>'request_id' is not null then perform pg_advisory_xact_lock(hashtextextended(actor.id::text||(payload->>'request_id'),0));select result into cached from mutation_keys where user_id=actor.id and request_id=(payload->>'request_id')::uuid;if cached is not null then return cached;end if;end if;
 if operation in('report','edit') then
 if operation='edit' then select * into r from item_reports where id=(payload->>'id')::uuid for update;if r.reporter_id<>actor.id or r.status<>'active' or r.id is null then raise exception 'Unauthorized edit';end if;
 if coalesce(payload->>'image','')<>'' and not (payload->>'image') like actor.id::text||'/%' then raise exception 'Invalid image owner';end if;
 update item_reports set title=payload->>'title',description=payload->>'description',category=payload->>'category',location_label=payload->>'location_label',event_date=(payload->>'event_date')::date,color=coalesce(payload->>'color',''),brand=coalesce(payload->>'brand',''),image=nullif(payload->>'image',''),updated_at=now() where id=r.id;result_id:=r.id;
 else
 if coalesce(payload->>'image','')<>'' and not (payload->>'image') like actor.id::text||'/%' then raise exception 'Invalid image owner';end if;
 insert into item_reports(reporter_id,campus_id,type,title,description,category,location_label,event_date,color,brand,image) values(actor.id,actor.campus_id,payload->>'type',payload->>'title',payload->>'description',payload->>'category',payload->>'location_label',(payload->>'event_date')::date,coalesce(payload->>'color',''),coalesce(payload->>'brand',''),nullif(payload->>'image','')) returning id into result_id;
 end if;perform refresh_matches(actor.campus_id);if operation='report' and payload->>'request_id' is not null then insert into mutation_keys values(actor.id,(payload->>'request_id')::uuid,jsonb_build_object('id',result_id));end if;return jsonb_build_object('id',result_id);
 elsif operation='claim' then
 select * into r from item_reports where id=(payload->>'report_id')::uuid for update;
 if r.id is null or r.campus_id<>actor.campus_id or r.type<>'found' or r.status<>'active' or r.reporter_id=actor.id then raise exception 'Ineligible claim';end if;
 insert into claims(item_report_id,claimant_id,message,history) values(r.id,actor.id,payload->>'message',jsonb_build_array(jsonb_build_object('status','pending','at',now()))) returning id into result_id;
 insert into notifications(user_id,title,body,report_id) values(r.reporter_id,'New ownership claim','A student submitted private ownership evidence.',r.id);return jsonb_build_object('id',result_id);
 elsif operation='review' then
 -- Lock the report first to serialize competing claims on the same item.
 select ir.* into r from item_reports ir join claims cl on cl.item_report_id=ir.id where cl.id=(payload->>'id')::uuid for update of ir;
 select * into c from claims where id=(payload->>'id')::uuid for update;next_status:=payload->>'status';note:=left(coalesce(payload->>'note',''),2000);
 if c.id is null or r.campus_id<>actor.campus_id then raise exception 'Unavailable claim';end if;
 if next_status='withdrawn' then if c.claimant_id<>actor.id or c.status not in('pending','under_review','approved') then raise exception 'Cannot withdraw';end if;
 else
 if c.claimant_id=actor.id or (r.reporter_id<>actor.id and actor.role<>'moderator') or r.status not in('active','under_review') then raise exception 'Unauthorized review';end if;
 if not ((c.status='pending' and next_status in('under_review','approved','rejected')) or(c.status='under_review' and next_status in('approved','rejected')) or(c.status='approved' and next_status='completed')) then raise exception 'Invalid transition';end if;
 if next_status='completed' then update item_reports set status='resolved',resolved_at=now() where id=r.id;insert into notifications(user_id,title,body,report_id) select claimant_id,'Claim closed after recovery','The item was returned following another verified claim.',r.id from claims where item_report_id=r.id and id<>c.id and status in('pending','under_review');update claims set status='rejected',history=history||jsonb_build_array(jsonb_build_object('status','rejected','at',now())) where item_report_id=r.id and id<>c.id and status in('pending','under_review');end if;
 end if;
 update claims set status=next_status,review_note=note,reviewed_by=actor.id,reviewed_at=now(),history=history||jsonb_build_array(jsonb_build_object('status',next_status,'at',now())) where id=c.id;
 insert into notifications(user_id,title,body,report_id) values(c.claimant_id,'Claim '||next_status,'Your ownership claim has been updated. Review the private details.',r.id);perform refresh_matches(actor.campus_id);
 elsif operation='status' then
 select * into r from item_reports where id=(payload->>'id')::uuid for update;
 if r.id is null or r.campus_id<>actor.campus_id or (r.reporter_id<>actor.id and actor.role<>'moderator') or r.status<>'active' or payload->>'status' not in('closed','resolved') then raise exception 'Unauthorized transition';end if;
 if r.type='found' and payload->>'status'='resolved' then raise exception 'Complete the approved claim handover';end if;
 if exists(select 1 from claims where item_report_id=r.id and status in('pending','under_review','approved')) and not(actor.role='moderator' and payload->>'status'='closed') then raise exception 'Review claims first';end if;
 if actor.role='moderator' and payload->>'status'='closed' then
 insert into notifications(user_id,title,body,report_id) select claimant_id,'Claim closed by moderator','The associated report was removed from the noticeboard.',r.id from claims where item_report_id=r.id and status in('pending','under_review','approved');
 update claims set status='rejected',history=history||jsonb_build_array(jsonb_build_object('status','rejected','at',now())) where item_report_id=r.id and status in('pending','under_review','approved');end if;
 update item_reports set status=payload->>'status',resolved_at=case when payload->>'status'='resolved' then now() end where id=r.id;insert into notifications(user_id,title,body,report_id) values(r.reporter_id,'Report '||(payload->>'status'),'Your report status has been updated.',r.id);perform refresh_matches(actor.campus_id);
 elsif operation='read' then update notifications set read=true where user_id=actor.id;
 elsif operation='refresh' then perform refresh_matches(actor.campus_id);
 elsif operation='flag' then
 if not exists(select 1 from item_reports where id=(payload->>'id')::uuid and campus_id=actor.campus_id and status='active') then raise exception 'Report unavailable';end if;
 insert into report_flags(report_id,reporter_id,reason) values((payload->>'id')::uuid,actor.id,payload->>'reason');
 elsif operation='moderate' then
 if actor.role<>'moderator' then raise exception 'Moderator required';end if;
 update report_flags set status='reviewed' where id=(payload->>'id')::uuid and exists(select 1 from item_reports r where r.id=report_id and r.campus_id=actor.campus_id);
 else raise exception 'Unknown operation';end if;return '{"ok":true}'::jsonb;end$$;
revoke execute on function public.app_mutate(text,jsonb) from public,anon;
grant execute on function public.app_mutate(text,jsonb) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('item-images','item-images',false,5242880,array['image/webp']);
create policy image_upload on storage.objects for insert to authenticated with check(bucket_id='item-images' and (storage.foldername(name))[1]=auth.uid()::text);
create policy image_download on storage.objects for select using(bucket_id='item-images' and exists(select 1 from public.item_reports r where r.image=name));
create policy image_delete on storage.objects for delete to authenticated using(bucket_id='item-images' and (storage.foldername(name))[1]=auth.uid()::text);

