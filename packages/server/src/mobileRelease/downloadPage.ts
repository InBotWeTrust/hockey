function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatSize(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}

export function renderAndroidDownloadPage(release: {
  versionName: string;
  apkUrl: string;
  apkSizeBytes: number;
  releaseNotes: string;
}): string {
  const version = escapeHtml(release.versionName);
  const notes = escapeHtml(release.releaseNotes);
  const apkUrl = escapeHtml(release.apkUrl);
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Ultimate Hockey для Android</title>
<style>body{margin:0;background:#e9f4fb;color:#0f172a;font:16px system-ui,sans-serif}.card{box-sizing:border-box;max-width:560px;margin:8vh auto;padding:28px;border:1px solid #fff;border-radius:24px;background:rgba(255,255,255,.72);box-shadow:0 24px 80px rgba(15,23,42,.14)}h1{margin-top:0}.meta{color:#64748b}.button{display:block;margin:24px 0;padding:15px 20px;border-radius:999px;background:#0f172a;color:#fff;text-align:center;text-decoration:none;font-weight:800}li{margin:8px 0}.notes{white-space:pre-wrap}</style>
</head><body><main class="card"><h1>Ultimate Hockey</h1><p class="meta">Версия ${version} · ${formatSize(release.apkSizeBytes)} · Android 8.0+</p>
<a class="button" href="${apkUrl}">Скачать APK</a><h2>Как установить</h2><ol><li>Скачайте APK.</li><li>Подтвердите установку из этого источника.</li><li>Откройте Ultimate Hockey.</li></ol>
<h2>Что нового</h2><p class="notes">${notes || 'Улучшения и исправления.'}</p></main></body></html>`;
}
