/** Human "next review" string from a due date. */
export function formatDue(due: Date): string {
  const ms = new Date(due).getTime() - Date.now();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'now';
  if (min < 60) return `in ${min} min`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `in ${hr} h`;
  const days = Math.round(hr / 24);
  return `in ${days} day${days === 1 ? '' : 's'}`;
}
