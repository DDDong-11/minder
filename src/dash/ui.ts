import type { WatchState } from "../watch/state.js";
import { PROXY_METRICS_DISCLAIMER } from "../watch/alert.js";

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderDashboardHtml(state: WatchState | null): string {
  const sessions = state?.sessions ?? [];
  const updated = state?.updatedAt ?? "never";
  const disclaimer = state?.disclaimer ?? PROXY_METRICS_DISCLAIMER;
  const rows = sessions
    .map((s) => {
      const flag = s.alerting ? "ALERT" : "ok";
      return `<tr class="${s.alerting ? "alert" : ""}">
  <td><button data-id="${esc(s.id)}" class="preview-btn">${esc(s.id)}</button></td>
  <td>${s.bytes}</td>
  <td>${s.turns}</td>
  <td>${flag}</td>
  <td>${new Date(s.mtimeMs).toISOString()}</td>
</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>minder dashboard</title>
  <meta http-equiv="refresh" content="15" />
  <style>
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 1.5rem; background: #0b1020; color: #e8ecf7; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #243049; padding: 0.5rem; text-align: left; }
    tr.alert { background: #3a1520; }
    .disclaimer { opacity: 0.8; font-size: 0.9rem; margin-bottom: 1rem; }
    #preview { white-space: pre-wrap; background: #121a2f; padding: 1rem; border-radius: 8px; margin-top: 1rem; }
    button.preview-btn { background: none; border: none; color: #8ec7ff; cursor: pointer; font: inherit; padding: 0; }
  </style>
</head>
<body>
  <h1>minder</h1>
  <p class="disclaimer">${esc(disclaimer)}</p>
  <p>Updated: ${esc(updated)} · auto-refresh 15s · <a href="/" style="color:#8ec7ff">manual refresh</a></p>
  <table>
    <thead><tr><th>Session</th><th>Bytes</th><th>Turns</th><th>Status</th><th>Updated</th></tr></thead>
    <tbody>
      ${rows || `<tr><td colspan="5">No sessions yet. Run <code>minder watch</code>.</td></tr>`}
    </tbody>
  </table>
  <h2>Preview</h2>
  <div id="preview">Click a session id to load a short transcript summary (not full render).</div>
  <script>
    document.querySelectorAll('.preview-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const res = await fetch('/api/session/' + encodeURIComponent(id) + '/preview');
        const data = await res.json();
        document.getElementById('preview').textContent = data.preview || data.error || 'No preview';
      });
    });
  </script>
</body>
</html>`;
}
