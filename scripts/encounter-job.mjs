// Share the current job between the sidebar and its popout. Replace it when an
// actor, a pool, a combatant's side, or a combat setting changes.
const jobs = new WeakMap();

export function cancelEncounterForecast(combat) {
  jobs.get(combat)?.cancel();
  jobs.delete(combat);
}

export function requestEncounterForecast(combat, sides, woundCap) {
  const signature = JSON.stringify([sides, woundCap]);
  const previous = jobs.get(combat);
  if (previous?.signature === signature) return previous.promise;
  cancelEncounterForecast(combat);
  let cancel;
  const promise = new Promise(resolve => {
    let worker, timeout;
    function finish(result) {
      clearTimeout(timeout);
      worker?.terminate();
      resolve(result);
    }
    cancel = () => finish(null);
    try {
      worker = new Worker(new URL("./encounter-worker.mjs", import.meta.url), {type: "module"});
      worker.onmessage = event => finish(event.data);
      worker.onerror = cancel;
      worker.onmessageerror = cancel;
      timeout = setTimeout(cancel, 10000);
      worker.postMessage({sides, woundCap});
    } catch { cancel(); }
  });
  jobs.set(combat, {signature, promise, cancel});
  return promise;
}
