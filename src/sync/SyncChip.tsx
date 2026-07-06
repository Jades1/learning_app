// Toolbar sync chip + sign-in modal. The app NEVER gates on auth — this is a
// small opt-in control: signed-out shows "Sign in to sync"; signed-in shows a
// live status dot and a menu to sign out.
import { useState } from 'react';
import { useSyncStore, resyncAll, type SyncStatus } from './sync';

const DOT: Record<SyncStatus, { cls: string; text: string; title: string }> = {
  signedOut: { cls: 'off', text: 'Sign in to sync', title: 'Sync is off — your data is only in this browser' },
  idle: { cls: 'ok', text: '● Synced', title: 'Synced to the cloud' },
  syncing: { cls: 'busy', text: '↻ Syncing…', title: 'Syncing…' },
  error: { cls: 'err', text: '⚠ Sync error', title: 'Sync error — click for details' },
};

export function SyncChip() {
  const { email, status, error, lastSyncedAt } = useSyncStore();
  const signIn = useSyncStore((s) => s.signIn);
  const signOutNow = useSyncStore((s) => s.signOutNow);
  const [open, setOpen] = useState(false); // login modal
  const [menu, setMenu] = useState(false); // signed-in popover
  const [em, setEm] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const d = DOT[status];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setFormErr(null);
    const err = await signIn(em, pw);
    setBusy(false);
    if (err) setFormErr(err);
    else {
      setOpen(false);
      setPw('');
    }
  };

  return (
    <>
      <button
        className={`sync-chip ${d.cls}`}
        title={d.title}
        onClick={() => (status === 'signedOut' ? setOpen(true) : setMenu((v) => !v))}
      >
        {d.text}
      </button>

      {menu && status !== 'signedOut' && (
        <div className="sync-menu" onMouseLeave={() => setMenu(false)}>
          <div className="sync-menu__email">{email}</div>
          {lastSyncedAt && (
            <div className="sync-menu__meta">Last synced {new Date(lastSyncedAt).toLocaleTimeString()}</div>
          )}
          {error && <div className="sync-menu__err">{error}</div>}
          <button
            onClick={() => {
              setMenu(false);
              void resyncAll();
            }}
            title="Re-upload everything and pull — guarantees this device and the cloud match"
          >
            Sync now (full)
          </button>
          <button
            onClick={() => {
              setMenu(false);
              void signOutNow();
            }}
          >
            Sign out
          </button>
        </div>
      )}

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form className="modal sync-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h2>Sign in to sync</h2>
            <p className="sync-modal__note">
              Syncs this graph across your devices via Supabase. Your data stays local too — sync is
              optional.
            </p>
            <label>
              Email
              <input
                type="email"
                value={em}
                onChange={(e) => setEm(e.target.value)}
                autoFocus
                required
              />
            </label>
            <label>
              Password
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required />
            </label>
            {formErr && <div className="sync-modal__err">{formErr}</div>}
            <div className="sync-modal__actions">
              <button type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
