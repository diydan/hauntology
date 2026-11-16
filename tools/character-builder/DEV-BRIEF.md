# Character Builder: developer brief

A working reference implementation of the Neon Foxes character creator, plus everything needed to rebuild its data. Your job is to bring it into the product. The reference is one HTML file on three.js r187; port the behaviour, not the file, if the product runs on something else.

## 1. What it is

A person picks a body (male or female), a head, hair, hats, glasses, a scarf, a top and bottom or a whole outfit, and shoes. They recolour every piece, change skin and eye colour, set the mood, adjust face, leg, arm and build sliders, and choose what the character is playing (singing, rapping, guitar, electric guitar, keyboard, drums) with the right prop. The character blinks and lip-syncs. Everything is shown on a small stage with orbit controls.

Screenshots are in `screenshots/`. `look-example.json` is one complete saved look.

## 2. What is in the package

```
character-builder-handoff/
  DEV-BRIEF.md              this file
  look-example.json         a saved look (the data you persist)
  character-builder/
    index.html              the whole viewer (about 710 lines, three.js r187, no build step)
    make-thumbs.cjs         renders the picture for every option tile (Playwright)
    README.md               build and behaviour notes
  prepare-assets/
    prepare_modular.mjs     turns the Unity pack into web assets (meshes, textures, manifest)
    retarget_cc.mjs         puts Mixamo clips onto the pack's skeleton
    package.json            dependencies (sharp, three, gltf-transform)
  screenshots/
```

A second zip, `character-builder-assets.zip`, holds the built assets (meshes, textures, manifest, option pictures). Unzip both into the same folder and the viewer runs from `character-builder/`. The animation clips are not included (see section 9).

## 3. Run it

1. Unzip both archives into one folder.
2. Serve `character-builder/` over HTTP (`npx serve character-builder`). It loads three.js from jsDelivr, so it needs internet.
3. Open it. Without the animation clips the character stands in its rest pose and the clip buttons are empty.

Rebuilding the data (only needed if the pack or the rules change): `README.md` steps 1 to 4. Short version, from `prepare-assets/` after `npm i`:
- `node prepare_modular.mjs <ModularAnimeCharacter folder> ../character-builder/assets`
- `node retarget_cc.mjs <M_body.fbx> <folder of Mixamo .fbx> ../character-builder/assets/clips_M.glb` (and `F_body.fbx` for `clips_F.glb`)
- `node make-thumbs.cjs` from `character-builder/` (needs `npm i playwright`)

## 4. The data you persist

A look is the object in `look-example.json`. It is the `S` object in `index.html` (minus runtime fields). Store it per user and per character.

| Field | Meaning |
|---|---|
| `gender` | `M` or `F`. Picks the body and the male or female file of each part. |
| `head`, `hair`, `bangs`, `hat`, `glasses`, `scarf`, `top`, `bot`, `outfit`, `shoes` | Item ids from `manifest.json` (`slots`). `null` is none. |
| `variant` | Material variant per item id (index). Only `top.001` (A, B) and `top.008` (flat, stripes) have one. |
| `skin`, `eyes` | Hex colours. |
| `hairCol` | Hex colour for hair, bangs and eyebrows, or `null` for the pack's own. |
| `col` | Per-item colour overrides: `{ slot: { A, B, C } }` as hex. A, B and C are the item's colour regions, ranked by size in the UI as Main, Trim, Detail. |
| `expr` | Mood: `neutral`, `happy`, `happy 2`, `angry`, `sad`, `surprised`, `smirk`. |
| `face` | `eye`, `nose`, `ears`, each 0 to 1 (blendshape weights). |
| `shape` | `legs`, `arms`, `build`, each 0 to 1, 0.5 is the pack's own proportions. |
| `clip`, `prop` | What the character is playing and whether the prop shows. |

Rules the data must obey (all enforced in `setSlot` and `want`):
- Choosing a top or a bottom clears the outfit; an outfit replaces both.
- Bangs, buns, ponytail and twintails are loose pieces over a hairstyle, not hairstyles. They are the `bangs` slot. A tied piece switches the hair to the tied style it was made for (`base` in the manifest).
- With a hat on, the hair loads its hat-fitted version (`hathair[cat]`). The racing helmet (`hat.003`) hides hair and bangs.
- Shoes exist only as female files; the male body uses them.

## 5. Asset format

`assets/manifest.json` (built by `prepare_modular.mjs`):
- `slots`: `body {M,F}`, `head`, `hair`, `hat`, `hathair`, `glasses`, `scarf`, `top`, `bot`, `outfit`, `shoes`. Each item has `id`, `label`, a file (`file`, or `M` and `F`), optionally `cat` (hair length class) and `variants`.
- `materials`: per material key, the colour recipe: `mask` and `normal` texture paths, six colours `A1 A2 B1 B2 C1 C2` (linear RGB), `mf` (mask factor), `remap`, `metallic`, `smooth`, `tint` (rim colour). Plain materials (glasses lens, eyelashes) have `kind: "plain"`.
- `fbxMats`: which material key each FBX material name uses.

Files: `mesh/*.fbx` (96 parts, 29 MB, FBX kept as is), `tex/` (masks as lossless PNG, normals as WebP, all at most 1024 px, 18 MB instead of 80 MB), `thumb/<M|F>/<kind>_<id>.webp` (200 px, 0.7 MB), `clips_<M|F>.glb`.

Only the chosen parts are fetched. A typical look is about 5 MB. Hosting needs plain static files. Where a host cannot serve `.fbx` or `.glb`, the viewer falls back to a `<file>.b64.txt` copy.

## 6. How each behaviour works

Each item names the function in `index.html` to read.

**Colour (`CC_GLSL`, `makeMat`).** The pack tints with an RGB mask texture, not a diffuse map. Per pixel, with mask `m` and `smoothstep(0, mf, x)` as `ss`:
`a = mix(A1, mix(A1, A2, remap(m.r)), ss(m.r))`, `b = mix(B1, B2, remap(m.g))`, `c = mix(C1, C2, remap(m.b))`, `colour = mix(mix(a, b, ss(m.g)), c, ss(m.b))`.
A rim light (`tint`) is added at grazing angles. Skin sets A2 to the skin colour and A1 to `skin * (0.79, 0.38, 0.27)` (the pack's own shadow ratio). Eyes set B2 and B1 (half brightness). Hair sets A2, A1 (half), rim.
Regions are ranked by sampling the mask at every triangle's centre, area-weighted (`computeCoverage`), so the largest is Main.

**Loading and swapping (`prepare`, `install`, `sync`, `want`, `buildAll`).** A replacement part is loaded, coloured and uploaded to the GPU completely before the old part is removed, in the same frame, so nothing ever shows bare. Changes that depend on each other load together (outfit with top and bottom; hat with hair and bangs). A request that was overtaken by a newer one is discarded (per-slot tokens). Randomise on the same body swaps everything at once. A new body, or the first load, hides the character behind smoke until every piece is in, with a progress bar and a line naming what is being fitted ("Choosing pants", "Ironing shirt", "Shining shoes", "Brushing hair"). The loader shows for at least 1.6 s.

**Fit (`bindToBody`, `shrinkBody`).** Every garment is skinned to the same 71-bone `CC_Base` rig and is rebound to the body's bones by name. The body is a full figure under the clothes, so its pieces are pulled in 0.6 to 1.3 cm along their normals; vertices shared between pieces move together so no cracks open. The torso, upper torso and shoulders are not moved (they overlap each other and crack). The FBX gives each skinned piece its own copy of every bone nested inside the real one with no offset; use the first bone of each name as the real one.

**Body shape (`initShape`, `computeShape`, `deformMesh`, `applyShape`).** Not bone scaling at run time (that shears when joints bend). In the rest pose each limb and torso bone gets a scale in its own axes: legs along the leg by 0.86 to 1.14, arms along the arm by the same, Build across the torso, pelvis, legs and (70 percent) arms by 0.8 (slim) to 1.4 (large) with 1.0 in the middle. Every bone origin moves by its parent's scaled offset. Body and garment vertices follow by linear blend skinning from the old rest pose to the new one, and the skeleton is rebound to the new rest pose (bone inverses replaced, rotations unchanged, scales 1). Hands, feet, head and fingers stay rigid. Twist bones copy their limb's scale. Leg length moves the character up or down so the feet stay on the floor. Apply it to every skinned mesh as it is loaded, and again when a slider moves (throttled to one pass per frame).

**Face (`faceUpdate`).** Blinking drives `eyes_closed.01` every 2 to 6 s: close 0.07 s, hold 0.04 s, open 0.15 s, with a 20 percent chance of a quick second blink. Lip sync (fake) while the clip is Singing or Rapping: a new syllable every 0.17 to 0.37 s (0.09 to 0.19 s rapping); each sets a mouth opening of 0.25 to 0.85 (one in six is a closure with `phoneme_MBP` at 0.6), `jaw_open = opening * 0.75`, and one of six vowel phonemes at `opening * 0.9`, all eased (open 26 per second, close 16, vowels 18). Moods ease in at 0.85 (`happy_01` and so on). Eye size, nose and ear sliders drive `eye_size`, `nose_length`, `tuck_ears`. The head mesh has 45 blendshapes; the lip-sync hook is where audio-driven phonemes would go.

**Instruments (`setProps`, `sampleClip`).** Singing and Rapping show the microphone only; it is pinned a few centimetres in front of the mouth while the fist is near it and rides the hand otherwise. The other clips get their own prop, built from simple shapes and fitted to the clip by sampling it at 30 points and reading where the hands, hips and feet go:
- Guitars hang from the chest bone. The neck runs from the strumming hand to the fretting hand; the body faces the way the chest faces (left shoulder minus right, crossed with up the spine).
- Keyboard: on a desk with a solid front panel down to the floor, so nothing can be seen up a skirt from the front. A stool sits under the hips.
- Drums: a snare where the hands come down, two toms, a floor tom, a large kick drum right in front of the knees (also hiding the lap), hi-hat, two cymbals, a stool, sticks in the hands.
Props live in a separate group so a taller or shorter character does not lift them off the floor. They refit when body shape changes.

**Tiles and strips (`stripRow`, `tileEl`).** One tile per option, in a sideways strip: mouse drag, swipe, arrows. Pictures are generated by `make-thumbs.cjs`: the page in `?thumbs` mode (flat background, no stage), A-pose (upper arms dropped 62 degrees), each option set on a plain base look, one 200 px square per option, head and shoulders for everything on the head, torso for tops, legs for bottoms, full body for outfits, feet for shoes.

**Colour picker (`wheel`).** One component for every colour: a hue ring around a saturation and value square, a hex field, and a Default button where a default exists.

**Loader smoke (`smoke`).** About 150 soft point sprites rising and swirling round the stage, coloured pink, violet and cyan, drawn by a small shader. It fades in while loading and bursts, reveals the character, and fades out on completion.

## 7. Acceptance checklist

- Every option appears as a picture; the strips scroll by drag, swipe and arrows.
- Changing any part never shows a bare or missing body part, even on a slow connection.
- First load and body change show smoke and the progress line until everything is in.
- Bangs and ties are never shown as a hairstyle on their own head; a tied piece selects its tied style.
- Every colour uses the same wheel. Skin, eyes, hair and each item region can be set and reset.
- The Legs, Arms and Build sliders change the body and the clothes together, with no cracks, no clothes floating off the body, no skin through clothes in the animation, and feet on the floor at both extremes.
- The microphone appears only for Singing and Rapping; the other clips show their own prop and the Prop button hides it.
- From the front and from a low angle, no one can see up a skirt when the character sits at the keyboard or the drums.
- Blinking runs continuously; lip sync runs while singing or rapping and stops otherwise.
- Works at phone width: the Look panel collapses, tiles stay tappable.
- A saved look reloads to exactly the same character.

## 8. Known limits

- The four heads of each body are nearly the same mesh (average vertex difference about 0.2 mm, at most 6 mm around the eyes and brows, same materials). Real face variety comes from the sliders. Decide whether to keep the Head strip.
- Shoes exist only as female files; on the male body they fit but are the same meshes.
- The drum kit is the roughest fit (some cymbals pass close to the face from some angles). The guitars and keyboard fit well.
- Extreme Build values were checked on singing and drumming, not every item with every clip. Clothes that add their own bones would need to follow the body bones by name.
- Lip sync is random. It is not tied to the audio.
- Not tested on a headset, and frame rate on phones is unmeasured. The default look is about 57,000 vertices (body 17k, head 16k, hair 9k, jacket 9k, jeans 5k, shoes 2k).
- The viewer runs in a plain page and loads three.js from a CDN. For production, pin and self-host it.

## 9. Licence and what must not be redistributed

- **ModularAnimeCharacter pack.** The supplier says commercial use is allowed. Keep the licence on file. The raw pack and the built `mesh/`, `tex/` and `thumb/` files are the pack's art; do not publish them in an open repo or a public download. Credit as the licence requires.
- **Mixamo clips.** Not redistributable as files. They are not in this package, not in the repo, and are git-ignored. To get the clips, download from Mixamo (FBX binary, without skin, 30 fps): `Idle`, `Breathing Idle`, `Happy Idle`, `Weight Shift`, `Bored`, `Thinking`, `Nervously Look Around`, `Looking Behind`, `Scared`, `Terrified`, `Waving`, `Pointing Gesture`, `Pick Up Item` (kept in `tools/animations/`, git-ignored), then run `retarget_cc.mjs`. Whoever owns the Mixamo account can also hand over the built `clips_M.glb` and `clips_F.glb` for internal use.
- three.js (MIT). Fonts Bungee and Barlow Semi Condensed (SIL Open Font Licence) are loaded from Google Fonts.

## 10. Suggested order of work

1. Decide the runtime (three.js in the web client, or something else) and where the assets are hosted (static host or CDN, with caching).
2. Get the character rendering from a look JSON: body, parts bound by name, the mask colour shader, the rest-pose shape bake.
3. Add the animation clips and the props.
4. Add the face: blinking, moods, sliders, lip sync driven by your real audio when it exists.
5. Build the picker UI around your design system (strips, wheel, sliders); regenerate the tile pictures if the frame changes.
6. Save and load looks through your API; use the look JSON as the contract.
7. Loader, phone layout, and the checklist in section 7.
