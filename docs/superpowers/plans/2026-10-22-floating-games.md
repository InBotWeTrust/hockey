# Floating game navigation

Approved behavior: draggable rounded square on all signed-in screens, muted in gameplay. Click opens the existing complete game card/carousel in a window; Minimize2 collapses it. Remove the duplicate summary header. Persist position per account. Count unfinished daily/training neutrally, unfinished duel/tournament entries urgently in red; urgent entries take priority when opening. Do not deploy without new release authorization.

1. Add failing tests for unfinished/finished/mixed counters and urgent priority, opening/minimizing, and dragging without activation.
2. Share the existing shortcut drag implementation with chat, keeping its storage keys, boundaries, cancellation, unread badge, and side preference working.
3. Add a floating presentation for the existing GameHub cards. Preserve game actions and entry navigation; avoid background refreshes affecting an active shot. Bootstrap missing shared snapshots once and retain existing event polling.
4. Mount the floating hub in the app shell. Remove the embedded map panel; keep venue status available through shared UI context.
5. Verify relevant Vitest suites, web typecheck/build, changed-file lint, and diff. Inspect mobile-sized light/dark local previews with neutral, urgent, completed and mixed fixtures. Record live gameplay/device gaps.
6. Save on feature/floating-games and open a PR to dev. No merge or deployment is authorized by this feature request.
