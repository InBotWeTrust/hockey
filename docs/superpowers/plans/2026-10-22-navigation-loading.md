# Navigation loading optimization

Approved scope: reduce repeated fullscreen blue loading during section navigation and back. No release or auth changes.

1. Reproduce existing fullscreen route fallback and bar check via regression assertions (RED).
2. Add SectionLoading, an inline status with optional retry, no portal or root lock; use for route fallback and section data loading. Keep StartupSplash for startup/onboarding.
3. Preserve authoritative bar checks; never mount protected bar content before access confirmation. Preserve existing query/store caches and background refresh behavior.
4. Preload common route modules sequentially after startup, with a delay, cleanup, and save-data/slow-network opt-out. No authenticated API mutations or gameplay prefetch.
5. Verify targeted suites, typecheck/build, rendered narrow light/dark layouts, diff. Open PR to dev without deploying.
