// Review-history / stats view. The longitudinal review log IS the product, so it
// needs to be visible: progress today, all-time rating mix, the card-state
// breakdown, storage safety, and last-backup age. Read-only over Dexie.
import { useEffect, useMemo, useState } from 'react';
import { State } from 'ts-fsrs';
import { db } from '../db/db';
import { storageEstimate } from '../db/persist';
import { startOfAnkiDay } from '../scheduler/fsrs';
import { ROLLOVER_HOUR } from '../review/config';
import { getLastExport } from '../db/backup';
import { useStore } from '../store/store';
import type { Grade, ReviewLog } from '../types';

const RATINGS: Grade[] = ['Again', 'Hard', 'Good', 'Easy'];

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function fmtAgo(ts: number | null): string {
  if (!ts) return 'never';
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

export function StatsPanel({ onClose }: { onClose: () => void }) {
  const cards = useStore((s) => s.cards);
  const nodes = useStore((s) => s.nodes);
  const graph = useStore((s) => s.graph);
  const dueCount = useStore((s) => s.dueCount);
  const newIntroducedToday = useStore((s) => s.newIntroducedToday);

  const [logs, setLogs] = useState<ReviewLog[] | null>(null);
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  useEffect(() => {
    // Stats are per-file: scope the review log to the active graph (re-reads on file switch).
    const gid = graph?.id;
    if (gid) void db.reviewLogs.where('graphId').equals(gid).toArray().then(setLogs);
    else setLogs([]);
    void storageEstimate().then(setStorage);
  }, [graph?.id]);

  const dayStart = useMemo(() => startOfAnkiDay(new Date(), ROLLOVER_HOUR).getTime(), []);

  const stats = useMemo(() => {
    const all = logs ?? [];
    const today = all.filter((l) => l.ts >= dayStart);
    const dist = (rows: ReviewLog[]) => {
      const d: Record<Grade, number> = { Again: 0, Hard: 0, Good: 0, Easy: 0 };
      for (const r of rows) d[r.derivedRating]++;
      return d;
    };
    const retained = (rows: ReviewLog[]) => {
      if (rows.length === 0) return null;
      const notAgain = rows.filter((r) => r.derivedRating !== 'Again').length;
      return Math.round((notAgain / rows.length) * 100);
    };
    return {
      total: all.length,
      today: today.length,
      distAll: dist(all),
      retainedAll: retained(all),
      retainedToday: retained(today),
    };
  }, [logs, dayStart]);

  const cardStates = useMemo(() => {
    let neu = 0;
    let learning = 0;
    let review = 0;
    for (const c of cards) {
      if (c.fsrs.state === State.New) neu++;
      else if (c.fsrs.state === State.Review) review++;
      else learning++; // Learning + Relearning
    }
    return { neu, learning, review };
  }, [cards]);

  const due = dueCount(new Date());

  return (
    <div className="review-overlay" onClick={onClose}>
      <div className="stats-panel" onClick={(e) => e.stopPropagation()}>
        <div className="review-panel__head">
          <span className="review-panel__count">Progress — {graph?.title ?? 'file'}</span>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="stat-grid">
          <Stat label="Due now" value={due} />
          <Stat label="Reviews today" value={stats.today} />
          <Stat label="Reviews all-time" value={stats.total} />
          <Stat
            label="Retention today"
            value={stats.retainedToday == null ? '—' : `${stats.retainedToday}%`}
          />
        </div>

        <h3 className="stats-h">Cards ({cards.length} across {nodes.length} nodes)</h3>
        <div className="stat-grid">
          <Stat label="New" value={cardStates.neu} tone="new" />
          <Stat label="Learning" value={cardStates.learning} tone="learning" />
          <Stat label="Review" value={cardStates.review} tone="review" />
          <Stat label="New introduced today" value={newIntroducedToday} />
        </div>

        <h3 className="stats-h">All-time ratings</h3>
        <div className="rating-bars">
          {RATINGS.map((r) => {
            const n = stats.distAll[r];
            const pct = stats.total ? Math.round((n / stats.total) * 100) : 0;
            return (
              <div className="rating-row" key={r}>
                <span className="rating-name">{r}</span>
                <div className="rating-track">
                  <div className={`rating-fill rating-${r}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="rating-num">{n}</span>
              </div>
            );
          })}
        </div>
        {stats.retainedAll != null && (
          <p className="stats-note">
            {stats.retainedAll}% of all reviews were recalled without a reveal/fail.
          </p>
        )}

        <h3 className="stats-h">Data safety</h3>
        <div className="stat-grid stat-grid--2">
          <Stat
            label="Storage used"
            value={storage ? fmtBytes(storage.usage) : '—'}
            sub={storage && storage.quota ? `of ${fmtBytes(storage.quota)}` : undefined}
          />
          <Stat label="Last backup" value={fmtAgo(getLastExport())} />
        </div>
        <p className="stats-note">
          The review log is the product — export a JSON backup regularly so it can't be
          lost to storage eviction.
        </p>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'new' | 'learning' | 'review';
}) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
      {sub && <div className="stat__sub">{sub}</div>}
    </div>
  );
}
