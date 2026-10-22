alter table public.item_reports add column search_document tsvector generated always as(to_tsvector('english',title||' '||description)) stored;
create index reports_document on public.item_reports using gin(search_document);
create function public.search_reports(filters jsonb) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
with query as(select case when coalesce(trim(filters->>'q'),'')='' then null else websearch_to_tsquery('english',filters->>'q') end q), filtered as(
 select r.*,case when query.q is not null then ts_rank_cd(r.search_document,query.q) else 0 end relevance from item_reports r cross join query
 where (case when coalesce(filters->>'own','false')='true' then r.reporter_id=auth.uid() else r.status='active' end)
 and(coalesce(filters->>'type','all')='all' or r.type=filters->>'type')
 and(coalesce(filters->>'category','')='' or r.category=filters->>'category')
 and(coalesce(filters->>'location','')='' or r.location_label=filters->>'location')
 and(coalesce(filters->>'status','')='' or r.status=filters->>'status')
 and(coalesce(filters->>'from','')='' or r.event_date>=nullif(filters->>'from','')::date)
 and(coalesce(filters->>'to','')='' or r.event_date<=nullif(filters->>'to','')::date)
 and(query.q is null or r.search_document@@query.q)
), page as(select * from filtered order by case when filters->>'sort'='relevance' then relevance else 0 end desc,created_at desc,id limit least(60,greatest(1,coalesce((filters->>'limit')::integer,9))) offset greatest(0,coalesce((filters->>'offset')::integer,0)))
select jsonb_build_object('reports',coalesce((select jsonb_agg(to_jsonb(page)-'search_document'-'relevance') from page),'[]'::jsonb),'total',(select count(*) from filtered))$$;

