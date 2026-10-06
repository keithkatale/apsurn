-- Atomic credit accounting. adjustCredits() used to read the balance and then
-- write it back, so two concurrent spends could both pass the "enough
-- credits?" check and overspend. These functions do the check and the write
-- in one statement, and optionally charge an agent task's budget in the same
-- transaction so a task can never exceed what the user approved.

create or replace function spend_credits(
  p_user uuid,
  p_amount integer,
  p_action text,
  p_metadata jsonb default '{}'::jsonb,
  p_task uuid default null
)
returns integer
language plpgsql
as $$
declare
  v_balance integer;
begin
  if p_amount <= 0 then
    select coalesce((select balance from credit_balances where user_id = p_user), 0) into v_balance;
    return v_balance;
  end if;

  update credit_balances
     set balance = balance - p_amount,
         lifetime_spent = lifetime_spent + p_amount,
         updated_at = now()
   where user_id = p_user
     and balance >= p_amount
  returning balance into v_balance;

  if v_balance is null then
    raise exception 'Not enough credits. Buy a top-up or upgrade your plan.' using errcode = 'P0001', hint = 'credits_exhausted';
  end if;

  if p_task is not null then
    update agent_tasks
       set spent_credits = spent_credits + p_amount,
           updated_at = now()
     where id = p_task
       and spent_credits + p_amount <= budget_credits;
    if not found then
      -- Rolls back the balance decrement above too.
      raise exception 'This task reached its credit budget.' using errcode = 'P0001', hint = 'budget_exhausted';
    end if;
  end if;

  insert into credit_ledger (user_id, delta, balance_after, reason, action, metadata)
  values (p_user, -p_amount, v_balance, 'spend', p_action, coalesce(p_metadata, '{}'::jsonb) || coalesce(jsonb_build_object('taskId', p_task), '{}'::jsonb));

  return v_balance;
end;
$$;

create or replace function grant_credits(
  p_user uuid,
  p_amount integer,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
as $$
declare
  v_balance integer;
begin
  insert into credit_balances (user_id, balance, lifetime_granted, lifetime_spent, updated_at)
  values (p_user, greatest(p_amount, 0), greatest(p_amount, 0), 0, now())
  on conflict (user_id) do update
     set balance = credit_balances.balance + greatest(p_amount, 0),
         lifetime_granted = credit_balances.lifetime_granted + greatest(p_amount, 0),
         updated_at = now()
  returning balance into v_balance;

  if p_amount > 0 then
    insert into credit_ledger (user_id, delta, balance_after, reason, action, metadata)
    values (p_user, p_amount, v_balance, p_reason, null, coalesce(p_metadata, '{}'::jsonb));
  end if;

  return v_balance;
end;
$$;
