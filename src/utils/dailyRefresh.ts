// Simple event bus for the debug panel to trigger a Daily data reload.
// Lives outside DailyScreen so importing it doesn't pull the whole screen
// into the entry bundle (DailyScreen is lazy-loaded).

let listeners: Array<() => void> = [];

export function triggerDailyRefresh(): void {
  listeners.forEach(fn => fn());
}

export function addDailyRefreshListener(listener: () => void): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(fn => fn !== listener);
  };
}
