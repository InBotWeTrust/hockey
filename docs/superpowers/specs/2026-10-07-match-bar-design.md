# Match bar

Approved in chat: implement now, inline, no additional approvals or delegation.

A separate /bar page, accessible from Sections (second navigation tab), with beer restaurant artwork on its entry card and interior background. One list with Online and Upcoming segmented filters. Include ordinary duels (including targeted invitations) and tournament fixtures; exclude daily, training, bonus and classic solo tournament sessions. Upcoming fixtures with known participants and schedule are shown. Online includes breaks; cancelled/expired invitations and finished matches disappear. An already open finished match shows the final score.

Spectating opens two read-only rinks. Replay only committed shot outcomes, never aiming. Approximately three seconds of delay plus delivery latency. Use existing rink and player assets and confirmed-shot geometry; never send seeds or private gameplay DTOs. Keep spectator API entirely read-only.

One refresh loop per watched resource per server process, no per-viewer DB polling, two-second cadence, Redis short cache, bounded pages and recent event buffers. No viewers means no timers. Hidden tabs disconnect; reconnect fetches an authoritative snapshot and resumes recent unseen shots without unbounded backlog. Slow sockets close rather than accumulate data. No gameplay mutation hooks or new gameplay writes. Local verification and synthetic rendering do not prove production capacity.

The shared board shows the current live score as requested. The detailed rink score uses the same three-second cutoff as replay events. Each tournament attempt has a playback identity; moving to a scheduled replay clears prior animation queues. Index migration uses concurrent, nontransactional statements. Terminal snapshots stop refresh after the final-event delivery grace.

The spectator uses the same Pixi Player, Goal, Goalie and Puck actors and shared perspective options as gameplay. Public two-second coordinate tracks are computed once per watched match and interpolated locally, capped at 30 FPS and resolution 1.5; hidden pages stop rendering. Confirmed shots supply replay geometry. Between-shot motion is reconstructed from saved input clocks and rule frequencies, not full client telemetry: loadout/fatigue/clock adjustments may differ until the next committed shot. Real-match comparison remains required before release.
