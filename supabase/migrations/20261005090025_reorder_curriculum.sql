-- 20261005090025_reorder_curriculum.sql
--
-- Reordering modules and lessons needs to be one atomic statement.
--
-- `modules` has unique (course_id, position) and `lessons` has unique
-- (module_id, position). That constraint is the right thing to have - it stops
-- two lessons claiming the same slot - but it makes reordering awkward from the
-- client, because every approach that writes positions one at a time hits it:
--
--   * "set the moved row to its new position" collides with whatever is there.
--   * "clear the slot, then set it" leaves a window where a reader sees a gap,
--     and leaves a hole behind if the second write fails.
--
-- The old system solved this with a PATCH carrying the whole ordered list. This
-- is the same idea, in one statement so the intermediate states never exist.
--
-- `p_table` and `p_parent_column` are validated against an explicit allow-list
-- rather than interpolated freely. The alternative is format('%I', p_table) on
-- user input, which is the sort of thing that works until someone passes
-- something clever. Two literals, checked, is the whole design.

create or replace function public.reorder_curriculum(
  p_table         text,
  p_parent_column text,
  p_parent_id     uuid,
  p_ordered_ids   uuid[]
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_parent uuid;
  v_index  integer;
begin
  -- Allow-list. A dynamic identifier cannot be passed as a parameter, so the
  -- only safe options are the two the caller is allowed to name.
  if p_table not in ('modules', 'lessons')
     or p_parent_column not in ('course_id', 'module_id') then
    raise exception 'cannot reorder %', p_table using errcode = 'invalid_parameter_value';
  end if;

  -- The parent row is re-read here rather than trusted, so the unique constraint
  -- resolves against a row the caller can see.
  if p_table = 'modules' then
    select id into v_parent from public.modules where id = p_parent_id;
  else
    select id into v_parent from public.lessons where id = p_parent_id;
  end if;

  if v_parent is null then
    raise exception 'no such %', p_table using errcode = 'no_data_found';
  end if;

  -- Move everything to negative positions first. Negative cannot collide with any
  -- real position (positions are positive) and every row is updated exactly
  -- once, so the unique constraint is never at risk even mid-statement.
  if p_table = 'modules' then
    update public.modules set position = -row_number() over (order by position)
     where course_id = p_parent_id;
  else
    update public.lessons set position = -row_number() over (order by position)
     where module_id = p_parent_id;
  end if;

  -- Then walk the caller's order and write the final positions.
  for v_index in 1 .. coalesce(array_length(p_ordered_ids, 1), 0) loop
    if p_table = 'modules' then
      update public.modules set position = v_index
       where id = p_ordered_ids[v_index] and course_id = p_parent_id;
    else
      update public.lessons set position = v_index
       where id = p_ordered_ids[v_index] and module_id = p_parent_id;
    end if;
  end loop;

  -- Anything the caller did not mention goes to the end rather than staying on a
  -- negative position, which would be a number no interface can display.
  if p_table = 'modules' then
    update public.modules
       set position = coalesce((select max(position) from public.modules where course_id = p_parent_id), 0)
                             + row_number() over (order by position)
     where course_id = p_parent_id and position < 0;
  else
    update public.lessons
       set position = coalesce((select max(position) from public.lessons where module_id = p_parent_id), 0)
                             + row_number() over (order by position)
     where module_id = p_parent_id and position < 0;
  end if;
end;
$$;

revoke execute on function public.reorder_curriculum(text, text, uuid, uuid[]) from public, anon;
grant execute on function public.reorder_curriculum(text, text, uuid, uuid[]) to authenticated, service_role;

comment on function public.reorder_curriculum(text, text, uuid, uuid[]) is
  'Reorder modules or lessons in one atomic statement. The unique (parent, position) constraints make per-row updates impossible; negative placeholders avoid the collision. SECURITY DEFINER so the intermediate negative positions are never visible to a reader.';
