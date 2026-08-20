/**
 * Opt-in release measurement harness. It records only browser timing numbers
 * and never reads form values, resume text, JD text, storage, or URLs.
 */
export function startPerformanceLab() {
  if (document.getElementById("morethan-performance-lab")) return;

  const output = document.createElement("output");
  output.id = "morethan-performance-lab";
  output.hidden = true;
  output.dataset.status = "collecting";
  document.body.append(output);

  const values = { cls: 0, inp: 0, lcp: 0, longTasks: 0 };
  const observers = [];
  observe("largest-contentful-paint", (entries) => {
    const last = entries.at(-1);
    if (last) values.lcp = Math.round(last.startTime);
  }, { buffered: true });
  observe("layout-shift", (entries) => {
    for (const entry of entries) if (!entry.hadRecentInput) values.cls += entry.value;
  }, { buffered: true });
  observe("event", (entries) => {
    for (const entry of entries) values.inp = Math.max(values.inp, Math.round(entry.duration));
  }, { buffered: true, durationThreshold: 16 });
  observe("longtask", (entries) => { values.longTasks += entries.filter((entry) => entry.duration >= 200).length; }, { buffered: true });

  const readyTimer = window.setTimeout(() => update("ready"), 2_500);
  const updateTimer = window.setInterval(() => update(output.dataset.status), 250);
  window.addEventListener("pagehide", stop, { once: true });

  function observe(type, handler, options) {
    if (typeof PerformanceObserver === "undefined" || !PerformanceObserver.supportedEntryTypes?.includes(type)) return;
    try {
      const observer = new PerformanceObserver((list) => { handler(list.getEntries()); update(output.dataset.status); });
      observer.observe({ type, ...options });
      observers.push(observer);
    } catch { /* Unsupported entry options are recorded as unavailable. */ }
  }

  function update(status) {
    const navigation = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    Object.assign(output.dataset, {
      status: status || "collecting",
      lcp: String(values.lcp),
      cls: values.cls.toFixed(4),
      inp: String(values.inp),
      longTasks: String(values.longTasks),
      fcp: String(Math.round(fcp?.startTime ?? 0)),
      domContentLoaded: String(Math.round(navigation?.domContentLoadedEventEnd ?? 0)),
      load: String(Math.round(navigation?.loadEventEnd ?? 0)),
    });
  }

  function stop() {
    window.clearTimeout(readyTimer);
    window.clearInterval(updateTimer);
    for (const observer of observers) observer.disconnect();
  }
}
