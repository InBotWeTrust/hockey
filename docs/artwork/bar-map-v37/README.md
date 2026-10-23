# Layered bar panorama for dev

The dev build uses one continuous 2172 x 724 panorama with independent character, counter and game-table layers. Production keeps the classic scene until separately released.

The accepted day panorama is `public/bar/map-v35/background-v1.webp`. Morning, sunset and night are fresh full-image generations in `public/bar/map-v37/`, using day only as the composition/style blueprint. The PNG masters are preserved in local `artifacts/bar-lighting-v37/`; this directory contains their exact prompts. Each runtime image is WebP quality 88 with a versioned URL, compatible with the existing image cache.

Transparent neutral sprites and tables use the accepted v30/v36 layers. The new Arsenich armchair sprite was generated from the original identity sheet, not the rejected unreferenced attempt. Source prompts are included here. Emotion variants for the new seated masters remain future work; the scene deliberately keeps their neutral furniture stable.

Foreground coordinates belong to the source panorama, independent of screen width. The dock is ordered by physical position. Grigory and cards occupy Arsenich's old place; Arsenich and checkers occupy Grigory's old place. All click targets follow their props. Rings expand around a fixed center; the television ring is dark for contrast. Igor's lower body is occluded behind the complete counter.

Avatar navigation retains smooth scrolling after controlled selection updates. Initial positioning and real viewport resizing use instant alignment; dragging remains native on touch/trackpad and uses the existing mouse-pan helper. Physical taps/holds and incoming terminal invitations retain their existing contracts.

Validation: focused bar and weather suites, TypeScript, web/server builds, workflow/Compose syntax and exact asset availability. A policy restriction prevents fresh rendered browser inspection in this session; local source and deployed-asset checks must not be reported as visual acceptance.

Image generation: built-in imagegen. Prompting guidance attribution: Serge Shima / smixs visual-skills, CC BY 4.0, https://github.com/smixs/visual-skills.
