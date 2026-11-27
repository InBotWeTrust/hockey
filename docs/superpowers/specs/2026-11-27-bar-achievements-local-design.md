# Bar achievement local preview

Build a local-only, interactive preview of the agreed 54 numbered requirements (95 cards / 268 levels) inside the existing achievements interface. Use the reward proposal from this chat. Preserve the existing production API flow. No database changes, account creation, credentials, authentication state changes, pushes or deployments.

Use the current origin/dev base d7892827946db4698a1f7e95e9897b408a1f66f1. The original checkout has unrelated edits and remains untouched.

The preview shows beginner and amateur variants without changing the authentication store. Reuse AchievementCard, AccessibleModal, SegmentedTabs and the existing achievement styles. Add only the Bar filter. All bar achievements appear in one list, without secondary mode or game filters, per the user correction. A beginner sees opaque locked placeholders for unavailable character content; no character, game, title, reward or requirement leaks through accessible labels or details. Online availability follows the existing novice rules, rather than automatically inheriting a character restriction.

Include all reward levels, a clean-start view and a clearly labelled demonstration-progress view. Claims affect only in-memory preview state and open the next level once. Reset restores the selected demo scenario. The route is gated by import.meta.env.DEV and performs no remote API calls. Assets use existing local files.

This stage demonstrates the interface and agreed catalogue; ingestion of real game events, database migrations and production reward issuance are outside this local presentation stage. Report this boundary explicitly.
