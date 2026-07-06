import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store/store';
import { GraphCanvas } from './canvas/GraphCanvas';
import { Inspector } from './canvas/Inspector';
import { StatsPanel } from './stats/StatsPanel';
import { requestPersistence } from './db/persist';
import {
  exportBackup,
  downloadBackup,
  importBackup,
  getLastExport,
  type Backup,
} from './db/backup';
import { EXPORT_NUDGE_DAYS } from './review/config';
import { initSync } from './sync/sync';
import { SyncChip } from './sync/SyncChip';
import { FilePicker } from './files/FilePicker';

export default function App() {
  const loaded = useStore((s) => s.loaded);
  const init = useStore((s) => s.init);
  const nodes = useStore((s) => s.nodes);
  const mode = useStore((s) => s.mode);
  const startStudy = useStore((s) => s.startStudy);
  const dueCount = useStore((s) => s.dueCount);
  const loadSeed = useStore((s) => s.loadSeed);
  const reloadFromDb = useStore((s) => s.reloadFromDb);
  const lastDeleted = useStore((s) => s.lastDeleted);
  const undoLastDelete = useStore((s) => s.undoLastDelete);
  const dismissDeleted = useStore((s) => s.dismissDeleted);

  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [exportedAt, setExportedAt] = useState<number | null>(getLastExport());
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initSync(); // must run before init() so it can register remote.firstPull
    void init();
    void requestPersistence().then(setPersisted);
  }, [init]);

  // Auto-dismiss the delete-undo toast after 8s.
  useEffect(() => {
    if (!lastDeleted) return;
    const t = setTimeout(() => dismissDeleted(), 8000);
    return () => clearTimeout(t);
  }, [lastDeleted, dismissDeleted]);

  // Recompute due count against a fresh clock whenever cards change.
  const cards = useStore((s) => s.cards);
  const due = useMemo(() => dueCount(new Date()), [cards, dueCount]);

  const onExport = async () => {
    const backup = await exportBackup();
    downloadBackup(backup);
    setExportedAt(backup.exportedAt);
    setNotice('Exported a JSON backup.');
  };

  // Nudge to back up if there's a graph and the last export is missing or stale.
  const staleExport =
    exportedAt == null || Date.now() - exportedAt > EXPORT_NUDGE_DAYS * 86_400_000;
  const showExportNudge = nodes.length > 0 && staleExport;

  const onImportFile = async (file: File) => {
    if (
      !window.confirm(
        'Restore all: this REPLACES every file with the backup’s contents. To add a backup as a separate file instead, use the file menu’s “Import backup into new file”. Continue?',
      )
    )
      return;
    try {
      const backup = JSON.parse(await file.text()) as Backup;
      const counts = await importBackup(backup);
      await reloadFromDb();
      setNotice(`Imported ${counts.nodes} nodes, ${counts.reviewLogs} review logs.`);
    } catch (err) {
      setNotice(`Import failed: ${(err as Error).message}`);
    }
  };

  if (!loaded) {
    return <div className="loading">Loading…</div>;
  }

  return (
    <div className="app">
      <header className="toolbar">
        <div className="toolbar__left">
          <FilePicker />
          <div className="mode-toggle">
            <button
              className={mode === 'build' ? 'active' : ''}
              onClick={() => useStore.getState().setMode('build')}
            >
              Build
            </button>
            <button
              className={mode === 'study' ? 'active' : ''}
              onClick={startStudy}
              disabled={due === 0}
              title={due === 0 ? 'Nothing due right now' : `${due} due`}
            >
              Study{due > 0 ? ` · ${due}` : ''}
            </button>
          </div>
        </div>

        <div className="toolbar__right">
          {nodes.length === 0 && (
            <button onClick={() => void loadSeed()}>Load “Learning Claude” seed</button>
          )}
          <button onClick={() => setShowStats(true)}>Stats</button>
          <button onClick={() => void onExport()}>Export</button>
          <button onClick={() => fileInput.current?.click()} title="Replaces ALL files with a backup">
            Restore all
          </button>
          <SyncChip />
          <input
            ref={fileInput}
            type="file"
            accept="application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = '';
            }}
          />
          <span
            className={`persist-dot ${persisted ? 'ok' : 'warn'}`}
            title={
              persisted
                ? 'Storage is persistent — safe from eviction'
                : 'Storage persistence not granted; export backups regularly'
            }
          >
            {persisted ? '● persistent' : '○ not persisted'}
          </span>
        </div>
      </header>

      {notice && (
        <div className="notice" onClick={() => setNotice(null)}>
          {notice} <span className="notice__x">✕</span>
        </div>
      )}

      {showExportNudge && !notice && (
        <div className="nudge">
          <span>
            {exportedAt == null
              ? 'You haven’t backed up yet — the review log is the product.'
              : 'It’s been a while since your last backup.'}
          </span>
          <button className="primary" onClick={() => void onExport()}>
            Export backup
          </button>
        </div>
      )}

      <main className="main">
        <GraphCanvas />
        {mode === 'build' && <Inspector />}
      </main>

      {showStats && <StatsPanel onClose={() => setShowStats(false)} />}

      {lastDeleted && (
        <div className="undo-toast">
          <span>
            {lastDeleted.kind === 'node' ? 'Node' : 'Connection'} deleted
            {lastDeleted.label ? ` — “${lastDeleted.label}”` : ''}
          </span>
          <button onClick={() => void undoLastDelete()}>Undo</button>
        </div>
      )}
    </div>
  );
}
