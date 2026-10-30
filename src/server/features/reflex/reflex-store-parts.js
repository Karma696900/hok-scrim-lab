// reflex store, small helpers: present.

export const present = row => ({
  id: row.id,
  period: row.period,
  metric: row.metric,
  amount: Number(row.amount),
  exercise: row.exercise,
  createdAt: Number(row.created_at)
});
