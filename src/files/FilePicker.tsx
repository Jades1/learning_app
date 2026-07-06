// The file switcher: a toolbar dropdown to switch / rename / delete files and create new
// ones. A "file" is one graph (its own canvas + review queue). Studying is one file at a time.
import { useRef, useState } from 'react';
import { useStore } from '../store/store';
import { importIntoNewFile, type Backup } from '../db/backup';

export function FilePicker() {
  const graph = useStore((s) => s.graph);
  const graphs = useStore((s) => s.graphs);
  const createFile = useStore((s) => s.createFile);
  const switchFile = useStore((s) => s.switchFile);
  const renameFile = useStore((s) => s.renameFile);
  const deleteFile = useStore((s) => s.deleteFile);

  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setRenamingId(null);
    setConfirmDeleteId(null);
    setErr(null);
  };

  const commitRename = () => {
    if (renamingId) void renameFile(renamingId, draft);
    setRenamingId(null);
  };

  const onImport = async (file: File) => {
    try {
      const backup = JSON.parse(await file.text()) as Backup;
      const id = await importIntoNewFile(backup);
      if (id) await switchFile(id);
      close();
    } catch (e) {
      setErr(`Import failed: ${(e as Error).message}`);
    }
  };

  const onlyFile = graphs.length <= 1;

  return (
    <div className="filepicker">
      <button className="filepicker__current" onClick={() => (open ? close() : setOpen(true))} title="Switch file">
        {graph?.title ?? 'learning_app'} <span className="filepicker__caret">▾</span>
      </button>

      {open && (
        <div className="filepicker__panel" onMouseLeave={close}>
          {graphs.map((g) => (
            <div key={g.id} className={`filepicker__row ${g.id === graph?.id ? 'active' : ''}`}>
              <div className="filepicker__row-main">
                {renamingId === g.id ? (
                  <input
                    className="filepicker__rename"
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={commitRename}
                  />
                ) : (
                  <button
                    className="filepicker__name"
                    onClick={() => {
                      void switchFile(g.id);
                      close();
                    }}
                  >
                    {g.title}
                  </button>
                )}
                <div className="filepicker__row-actions">
                  <button
                    title="Rename"
                    onClick={() => {
                      setRenamingId(g.id);
                      setDraft(g.title);
                    }}
                  >
                    ✎
                  </button>
                  <button
                    title={onlyFile ? 'Can’t delete your only file' : 'Delete file'}
                    disabled={onlyFile}
                    onClick={() => setConfirmDeleteId(g.id)}
                  >
                    🗑
                  </button>
                </div>
              </div>
              {confirmDeleteId === g.id && (
                <div className="filepicker__confirm">
                  Delete “{g.title}”? Its graph, nodes &amp; cards are removed on all synced devices.
                  Review history is kept.
                  <div className="filepicker__confirm-actions">
                    <button onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                    <button
                      className="danger"
                      onClick={() => {
                        void deleteFile(g.id);
                        setConfirmDeleteId(null);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {err && <div className="filepicker__err">{err}</div>}

          <div className="filepicker__footer">
            <button
              onClick={() => {
                void createFile();
                close();
              }}
            >
              + New file
            </button>
            <button onClick={() => fileInput.current?.click()}>Import backup into new file…</button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImport(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
