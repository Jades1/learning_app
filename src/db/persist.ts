// Ask the browser to make our IndexedDB storage persistent (R2). Without this,
// Safari ITP evicts script-writable storage after ~7 days of non-use and Chrome
// evicts under pressure — which for an SRS app would destroy the review log that
// IS the product. Best-effort; returns whether persistence is granted.

export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    if (navigator.storage.persisted && (await navigator.storage.persisted())) {
      return true;
    }
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

/** Estimated bytes used / quota, for the UI to surface. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}
