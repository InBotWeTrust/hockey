# Local Durak computer opponents

Added in the local `feature/durak-multiplayer-tables` checkout. No deployment is implied by this document.

The three new characters use the supplied `setka_grisha.png`, `setka_arsenich.png`, and `setka_daria.png` identity sheets. Existing Maria `playing-v1.webp` provides pose and illustration style. Generated with the built-in image generation tool; source PNGs are preserved in the Codex generated-images folder for conversation `01a11730-ea29-7fc2-93df-cec3a1c576c7`.

Each new character has transparent `playing`, `invite`, `player-win`, and `player-loss` WebP illustrations in `packages/web/public/bar/cards`, all 1000 pixels high. The original version 1 avatars were 400-pixel square crops; the current card-free portraits are described below. Background and table are reused by the UI. Original reference sheets are unchanged.

Source PNG filenames (variants in the order above):

- Grigory: `exec-2e77c0f7-c44e-4647-85a8-b7c6619997e2.png`, `exec-2648b6ae-c23f-42c8-a23f-430cbf1c5e49.png`, `exec-b09fe836-0c6a-4d02-89bb-96d753e78e77.png`, `exec-a2368db4-6e68-407d-abcf-3edf40c91822.png`.
- Daria: `exec-25193ac9-f2b9-4fd7-b75f-8914f394d3ec.png`, `exec-03c45d2c-484f-42f1-a334-94239d6f5a5a.png`, `exec-9d26e62f-541e-46d0-866b-fe18d399ccf9.png`, `exec-1ebaf15f-dfac-403d-9b51-87957ba08000.png`.
- Arsenich: `exec-86b968b1-ed51-40af-b97e-61f37ad79faf.png`, `exec-1d01e915-fb02-4fb9-82a8-518d170168d4.png`, `exec-2f8170ad-3291-4844-a7f1-c78ac887451b.png`, `exec-6e71fe7e-5a66-4a6a-9a54-95fea841b75f.png`.

Local profiles use only their own hand, public table and discards, opponent card count and deck count. Grigory may try an illegal throw at most twice per game. Catching him before a completed response only returns that card; it never draws a penalty. This exception is confined to the local controller and does not change shared online rules.

Preview: `http://127.0.0.1:5192/durak-preview.html?computer=demo#/bar/cards/online` provides an empty synthetic lobby for local computer-game inspection. Result fixtures are `?layout=win` / `?layout=loss` with `/bar/cards/computer/{daria,maria,grigory,arsenich}` routes. These fixtures are not evidence of live online gameplay.

## Card-free avatar revision

The lobby order is Daria, Grigory, Maria, Arsenich. Difficulty subtitles are hidden; the computer group has a 16-pixel gap below its section title. Both lobby and game menu use the new `avatar-v2` assets. Portrait canvases are 1000 pixels square, with at least 120 pixels above the hair/hat. Initial 400-pixel avatars remain preserved as unused version 1 assets.

New portrait sources:

- Daria: `exec-4f97902b-92ec-40d8-aea2-2696e3b006ce.png`.
- Grigory: `exec-089c13a1-033c-4f98-b748-de0fbc3dc5e2.png`.
- Arsenich: `exec-58e93afd-02b3-4681-82fb-ba7fc8d69748.png`.
- Maria: `exec-b5b4611f-3c20-4ce7-9e01-cd6bdb7db18e.png`. The final portrait restores the reference figure and places the apron waistband at the natural waist. Background alpha is transparent; the old opaque fragment behind her hair is absent in the rendered avatar.

Local rendered checks covered all four launch dialogs, initial hands/menu portraits, surrender results and replay. All eight win/loss fixtures load their matching artwork. These checks use synthetic local state and do not prove deployed or live multiplayer behavior.
