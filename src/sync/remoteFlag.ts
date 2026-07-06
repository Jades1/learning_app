// Leaf module (imports nothing) shared by the Dexie hooks (db.ts) and the sync
// engine (sync.ts) to break what would otherwise be an import cycle.
//
// - `applying`   : true while the engine is writing PULLED cloud rows into Dexie.
//                  The hooks check it so they DON'T re-stamp `updatedAt` (which
//                  would clobber the cloud timestamp and echo the row straight
//                  back on the next push).
// - `onLocalWrite`: the engine registers its debounced-push scheduler here; the
//                  hooks call it after any genuine LOCAL write. Default no-op so
//                  the app (and tests) work with sync never initialised.
// - `firstPull`  : resolves once the first post-sign-in pull has completed (or
//                  immediately if signed out). `store.init()` awaits it before
//                  creating a fresh graph, so a newly signed-in empty device
//                  adopts the cloud graph instead of forking a new one.
export const remote: {
  applying: boolean;
  onLocalWrite: () => void;
  firstPull: Promise<void>;
} = {
  applying: false,
  onLocalWrite: () => {},
  firstPull: Promise.resolve(),
};
