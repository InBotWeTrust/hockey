# Partners landing design

Approved direction: the Russian brief supplied on 2026-11-24, eight grouped sections proposed in chat, and the user's subsequent instruction to build with temporary video/screenshot slots. The contact is https://t.me/in_bot_we_trust. Following the correction, landing play links use /try, a public alias for the existing demo; /demo remains the login-screen destination.

Build /partners as a separate static HTML entry in the existing Vite project. Use existing game artwork, dark navy surfaces, warm location lighting, large headings and restrained ice-blue accents. Keep all content readable without JavaScript. No new dependencies, game logic, accounts, partner backend, analytics storage, or deployment.

Sections: hero; gameplay/video; city/career; competition; off-ice life/gallery; three partnership categories; illustrative equipment integration; project/principles/contact/footer. Professionality and team play remain future work. Equipment rules vary by mode. All partner formats are proposals. Missing video and screenshots must be visibly labelled, never fabricated. Media is supplied later through one typed manifest. Gallery uses an accessible native dialog when real screenshots are provided. Existing game art is labelled as artwork.

Metadata is present in initial HTML; canonical and OG URL use https://ultimatehockey.ru/partners. Generate a 1200x630 preview from existing artwork and responsive hero derivatives. Preserve UTM allowlisted values only when entering /try. External Telegram links open with rel=noopener noreferrer. No personal query parameters are propagated. Do not claim analytics collection without a receiver.

Avoid the app auth bootstrap and Pixi imports for /partners. Serve /partners and /partners/ directly in nginx and Vite development/preview. Exclude /partners from the PWA navigation fallback and pre-cache so normal app installation is unaffected. /try reuses DemoScreen and the same public-entry exclusions as /demo.

Verification: existing App/demo/PWA tests as baseline; targeted DOM interaction and route tests; typecheck/build/lint touched files; mobile/desktop browser checks including no auth/API/game requests on the landing, keyboard navigation, placeholders, preview metadata, and /try. Physical Telegram/VK/MAX browser acceptance and actual media playback remain pending provided materials and devices. No push/merge/deploy is authorized.
