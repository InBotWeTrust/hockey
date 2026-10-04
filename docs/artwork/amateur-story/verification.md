# Local verification

Base: origin/dev bf30e1bae00ad4dba3f4f2f7a700690ccc76a44a. Branch: feature/amateur-onboarding-story. Both existing dirty checkouts preserved; no merge from large Arsenich branch.

Observed RED: new story component/data absent; /me missing amateur completion flag (2 assertions failed); required cinematic playback/profile series integration (5 tests failed); first amateur frame priority low instead of high. Corresponding GREEN recorded below.

PASS: 117 targeted web tests in 12 files, including first/second series, published preview lifecycle, game-exit gate, profile catalog/replay, all 12 WebP files, image caching and existing section introductions. PASS: 2 server profile-contract unit tests. Web/server typecheck and build passed. Scoped source eslint and git diff --check passed.

Asset test initially used sharp metadata.size for a filesystem input (undefined); corrected test to statSync(path). All asset assertions then passed. No application workaround introduced.

Rendered in internal browser: localhost5190/dev/amateur-onboarding, same shared replay component, 390x844 and320x568. Direct gaze/handshake, professional arena reveal, open stadium entrance, frameA on scene entry, decoded941x1672 images and no horizontal overflow verified. Compact copy uses18px font and higher shade for readable text. Replay completion restarts local preview; preview does not write account progress.

Boundary: authenticated server-backed promotion/completion not manually performed in browser, and no real user/auth/progress reset. Mandatory lifecycle, final save/retry and direct profile access covered by focused automated tests. No CI, dev deployment or production deployment for this branch.

Images total2,972,092 bytes; individual165–318KiB. WebP quality82/effort6, no geometry modification, per-content cache hashes, decode current/next pair, high priority first pair. Rejected artwork absent from public directory.
