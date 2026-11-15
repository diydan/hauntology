# TEMP: experiment copy

Copied from BandSim `tools/character-builder` on 2026-11-15 to try a character and shot builder for Hauntology.
Not part of the product. The pack art in `character-builder/assets/` (about 46 MB) is git-ignored on purpose: Mixamo clips cannot be redistributed.

Run it:
    cd tools/character-builder/character-builder && npx serve .

## Face print (added 2026-11-15)
Look panel, "Face print (test)". Two test portraits: The Whisper and Mr. Ashby (copied from `docs/story/art/` into `character-builder/assets/faces/`, git-ignored).
- The 11 face-shape morphs are fitted first to hand-marked landmarks (`FACES` in `index.html`), then the photo is projected from the front onto the head skin and onto the eyeballs.
- The print follows the shape morphs only, so blink, jaw and lip sync still move it like a printed hood.
- Skin match: the body skin colour is set from the photo's forehead and cheeks (hue from the Skin chip if the photo is black and white), and a seamless grain tile cut from the forehead is laid over all skin (neck, hands, arms, ears). Sliders: Skin texture, Body skin tone. "None" restores your skin colour.
- Hair: the closest pack style is picked per face, the hair colour (dark and light tone) and a strand texture come from the photo's own hair pixels. Mouth: teeth and tongue take the photo's highlight and lip tones and are shaded by depth. Skin: a closed loop renders the head, compares the face with the neck and corrects the body skin until they match.
- Hair shading upgrade (all hair, with or without a print): Kajiya-Kay strand highlight (two lobes per light, per-strand shift), darker roots and lighter tips, strand streaks. Sliders "Hair shine" and "Hair roots" in the Hair section.
- Front/side view guessing: done with the MediaPipe Face Landmarker (3D landmarks give the depth guess, blendshape scores give the resting expression; eye size, nose length and the 11 shape morphs are fitted). The old note below about it not being done is out of date.
- Hair prototype (2026-11-15): MediaPipe multiclass segmenter (`assets/mediapipe/selfie_multiclass_256x256.tflite`, hair = class 1) gives the photo's hair mask. Five hair-only shape morphs (volume, width, height, length, fringe) are fitted to the mask's outline. The photo's hair is printed on the hair shell from the front and the shell is cut by the mask. Toggle: Hair print. Rough on bobs (the lower hair keeps the pack texture); good on short styles.
- Clothes (2026-11-15): from the shoulders picture the segmenter's clothes mask gives the main colours (k-means, taken from the lower part so the cloth below the print matches), a fabric grain tile, and the photo is printed on the garment from the front through the mask (fades out where the picture ends). The garment style comes from a per-face table in `FACES` (Whisper: outfit.003, Mr. Ashby: top.005 + bot.001). A render-and-compare loop sets the brightness.
- Body (2026-11-15): the full-body picture goes through MediaPipe Pose Landmarker (`assets/mediapipe/pose_landmarker_full.task`). Leg, arm, shoulder and hip lengths against stature, compared with typical adult proportions (assumed constants in `BODY_REF`), move the Legs, Arms, Build and Head sliders. The pack is stylised, so only the difference from typical moves the sliders.
- Fade (2026-11-15): the photo's skin mask (face + neck) is printed on the neck and ears with a soft edge; the hair print's cut uses alpha-to-coverage instead of a hard discard.
- Skin clipping fix: `insetBody()` casts a short ray into the body from skin vertices near garments; where it hits a garment, the vertex is sunk under it (`aInset`, keyed by position so body pieces stay joined). Runs after any garment or body-shape change. Checked on 12 garment/body combinations.
- Hem + shoes: `fitHem()` lengthens the lower garment (table value `hem`: 'ankle' trousers to the boots, 'floor' a long dress). Shoe style comes from the table, colour from the feet in the full-body picture.
- MASTER STYLE slider (Face print section, first row): 0 stylised .. 1 realistic. Scales the print on face, neck, hair and clothes, skin and fabric grain, hides the pack's brows and lashes, and widens the body ranges (limbs about +-31% instead of +-14%); the pose fit re-solves with it.
- Hair pass 2 (2026-11-15): the photo's hair is printed over the WHOLE hair shell. A "bled" copy of the photo (hair pixels pushed outward into the gaps, from the hair core only) is wrapped round the sides and back like a label and softened, so colour and strand direction continue with no seam; the mask cuts the front like a cookie cutter (soft edge); hair that stands in front of the photo's face skin is cut; the scalp takes the hair colour; hair keeps more of the photo's own light (stage rim lights no longer stripe it).
- Face pass (2026-11-15): 8 new face-shape morphs (ear size, ear angle, ear height, mouth width, mouth height, lip fullness, nose bridge, nose tip), estimated from the photo (ears from the skin outside the face oval; mouth width, lips and nose tip from landmarks). Ears are printed from the photo too.
- Six more faces wired (vane, thorne, pike, percy, dunmore, cora): body gender switches, hats, bun add-ons, hem and shoes from tables.
- BEAUTIFY (selfies only, `FP.id === 'custom'`, never presets): slider + "Show original". On-device. At 100%: edge-preserving skin retouch in the print, grain 60% weaker, face-shape morphs pulled 25% toward neutral, a faint smile, brighter eyes and teeth.
- (old note) Front/side view guessing is NOT done. Downloaded for it, never run: `character-builder/assets/mediapipe/` (MediaPipe Face Landmarker model + WASM from jsdelivr and Google storage, git-ignored).
- Not done: automatic landmarks for selfies (the "Your image..." option has no shape fit), a fix for the pack's body skin poking through the jacket at the chest.

## Realistic hair: strand cards (test, 2026-11-15)
- Realistic style (Style > 0.5) grows strand cards over the pack's hair shell (`makeHairCards`). Cards are thin strips with see-through strands (canvas texture, 8 variants), flowing down and back over the shell, ending at the shell's hem in each direction and never crossing in front of the face.
- Each card copies the shell's skin weights (it swings with the hair bones) and has the same face and hair morphs (photo fitting moves it too). Colour comes from the photo's bled hair texture; the lights shape the strands but do not tint them.
- Length by style: short cuts up to 4 cm, medium 22 cm, long 34 cm. The photo-facing front keeps the printed photo.
- Off the printed front, the shell is lit with a smooth normal (`aShellN`) so the pack's leaves stop showing.
- Toggle: Face print > Real hair > "Strands on/off". Made here, so no asset licence.
- Bought or free hair assets: MakeHuman Hair 01 is CC0 but mostly low-poly/stylised; Hair 02/03 are CC-BY. Reallusion content is not allowed in an in-game character creator without an Enterprise licence. Paid hair-card packs (about $19 each) need a per-pack licence check.

## Head size, skin under clothes, skirts (2026-11-15)
- Head: the realistic style shrinks the pack's heads to 0.87 (real eye spacing over stature vs the pack's). The full-body photo may move the head only +-7% around that (its stature guess is noisy; it had set Vane to 1.21).
- Skin under clothes: skin a garment fully covers is not drawn (`aHide`, set in `insetBody`), so it cannot poke through in any pose. Long skirts and dresses also hide all leg skin inside their outline down to the (lengthened) hem. The hem fit now runs before this, so the lengthened part counts.
- Skirts and dresses (closed between the legs): leg weights go to the hips plus both thighs, each side leaning to its own leg; below the knee the cloth follows both shins, so seated it hangs straight down instead of a stiff tube. Re-run after every hem fit, always from the pack's own weights. Trousers are untouched.
- Seated skirts: the middle panel follows the hips more (it sags between spread knees), and each side leans only gently to its own leg, so a seated skirt no longer balloons.
- Skin calibration fix: the loop compared the lit neck (pink rim light, chin shadow) with the printed face and chased the hue to the clamps (Vane: body x2.5 red/green, x0.4 blue = yellow). Now it matches brightness freely (0.5-1.8x) and hue only within 15%, and it draws only the face and neck while measuring (no hand, mic, collar or hair in front of the sample).

## Side faces from one front photo (2026-11-15)
- Smear fade: where the surface turns away from the camera, the photo is replaced by its own blurred local tone; the skin grain tile adds the detail back.
- Mirror: the narrow (turned-away) cheek, measured from nose tip to face edge, takes the near cheek's pixels mirrored, at its own brightness (`uFpMirror`, up to 85%).
- De-light: the photo's baked light and shade is divided out (blurred brightness vs the skin mean, `uFpDelight` 0.6 x Style), so the 3D lights shade the face and the sides match the front.

## Beautify v2 (selfies only)
- Adds: even tone (blotches take the surrounding skin's hue; saturation and brightness detail kept so the face does not go grey), lighter under-eyes (lifted toward the cheek's brightness, never past it), shine pressed down, slightly softer light.
- v1 smoothing made gentler (keeps more real texture). Still no slimming and no skin lightening.

## Two-step Beautify (selfies only)
- Step 1, the photo (`fpRetouch`, slider "Photo retouch"): the selfie itself is retouched once on the device, inside the skin only (face oval minus eyes, brows, lips, from the landmarks): edge-preserving smoothing, hue-only tone evening, under-eye lift, shine down; teeth less yellow, eye whites a little brighter. The retouched copy replaces the printed photo; the analysis (skin, hair, clothes colour) still reads the original.
- Step 2, the 3D head (slider "3D beautify"): face shape 25% toward neutral, a faint smile, softer light, weaker grain, whiter 3D teeth.
- "Show original" turns both off. The shader's old 2D retouch is removed (it lives in step 1 now).
- Fix: the face's mean brightness for the de-light was never set (a comment swallowed the line); the de-light now also applies to the eyeballs, so no dark ring round the eyes.
- Face fit fix: the fit is linear about the unstretched face, so a face-width row in the photo is now matched to the mesh row at the same proportion of eye-to-chin (not the same height). Before, a long face's jaw row landed on the short mesh's narrow chin, so the fit maxed out jaw width and cheeks (wide, short look).
- Eyes and nose: new morphs `eyeWidth` (eye openings narrowed about each eye's centre, reaching the deep outer corner) and `noseWings` (the nostril wings in or out; the pack's nose is ~5.9 cm across them, a real one ~3.5 cm). 'Nose width' only moves the bridge, which is why the fit could not narrow noses before. Eye-width fit weight 0.3 -> 0.6; nose width range -2.5.
- Eye outline fix: the pack's big eyeballs bulged out past the eyelids, so a soft almond of eyeball showed round each eye. With a photo face, the eyeballs sink 0.4 cm (x Style) behind the lids (`EYE_SINK`; 0.65 opened gaps at the corners). Also: eyelid skin printed on the eyeball is lit like the face (head-forward normal, no rim tint), the print is never metallic, and the side-face smear/mirror only act on the outer face (|x| > 4.8 cm), not on eyelid rims or nose sides.
- Holes at knees and ankles fix: hidden skin is now only skin WELL inside a garment. Skin stays drawn within 9 cm above the garment's bottom hem straight below it (found by column, so it works for doubled hems with no open edge), within 4 cm of a sleeve end or a shoe top. The "hide all leg inside the skirt" rule is for long skirts only. Discard only fully hidden triangles.
- Started (not wired to strands yet): `fpHairWave`, a waviness measure from the photo's hair (structure-tensor coherence). Calibration so far: selfie 0.59, Ashby 0.69, Whisper 0.66, Pike 0.77, Percy 0.86, Vane 0.66, Cora 0.76.
- Wavy strands: `fpHairWave` coherence maps to `HC.wave` (0.66 -> 0, 0.54 -> 1; the wavy selfie reads 0.61, every preset ~0). Wavy hair bends each strand card side to side (about 3.5 cm a wave, roots still) and blends in a wavy strand atlas.
- Long dresses: leg skin a little outside the resting outline (+2 cm) is hidden too; seam points share one set of skin weights; the inside of every garment is drawn in shadow (a slit or open hem reads as dark, not lit pink). Small leg flecks can still show when Vane steps wide.
- Dress slit: seam points within 3 mm share skin weights (stitch), garment insides get no shine or rim light, and under a long dress the boot/sock shaft above hem+14 cm is cut (`SOCK_CUT`; it poked through when the cloth folded). A hairline still shows down Vane's dress front in a wide step.
- Elbows: checked in 12 arm poses (Ashby's sweater, Pike's jacket): no holes; the same "well inside only" hide rule covers sleeves (4 cm from a sleeve end).

## Clipping review (2026-11-15): 10 body/clothing setups x 4 poses, plus hair with hoods, collars and hats
- Fixed: trousers, overalls and the racing suit were being taken for skirts (their inner leg seams sit near the middle in the bind pose). That made legs stiff, split trousers at the knee, cut the shoes and threw pieces round the feet. A skirt now needs cloth at the FRONT surface across the middle between the knees. Only the long dress and the short skirt count.
- Fixed: Vane's "slit" was thigh skin poking through the dress front: skin near the dress's centre line always counts as inside, and skin inside a long dress stays hidden except near its hem.
- Clean: elbows, knees and ankles in all setups; thin and heavy builds; trousers, jeans, overalls, racing suit, loose trousers, shorts, big shorts, hoodie, blazer, shirt.
- Still open: a heavy build's thigh can poke through a short skirt mid-stride; the inside of short skirts and big shorts reads pinkish when seated (up-skirt view); long hair's strand cards end in dark, blocky tips; 'hair.tied.001' via S.hair rendered the same as the medium style (check the id).
- Long hair tips: strand cards taper to a point and fade out over their last 40% (they ended in dark blocks).
- Short skirts: tighter keep-drawn margins under a skirt (4 cm), thigh just above a skirt hem sinks 1.3 cm, skin that pokes out through a garment at rest counts as covered, and the "inside the outline" rule now covers short skirts too (long ones still cut the boot shaft). Still open: on a heavy build a patch of front thigh shows through the short skirt mid-stride (inner-front thigh, about 6-15 cm above the hem; not yet explained).
- Fixed the heavy-build short-skirt thigh patch: the hem rule kept skin up to 9 cm above "the hem below it", and only used the skirt's 4 cm when skirt cloth sat in the exact same column. The nearest hem now carries whether it is a skirt's. Also: a top's hem tucked inside a skirt no longer counts as an opening.
- Still open: heavy build + skinny jeans: the jeans' cloth splits at the knee when bent (dark gaps); a garment tear, not skin.
- Ripped jeans: the "dark gaps" at the knees were the jeans' own rips (by design) with the skin behind hidden. Any non-opening hole in the cloth now keeps the skin behind it drawn (3 cm round). Seam weights are welded on every garment, not only skirts.
- Scarf: lies over the jacket (scarf vertices inside the top/outfit move to 0.5 cm above it).
- Feet on the floor: every frame the character moves so the lowest foot/toe bone is as high as at rest (`groundFeet`). Before: short legs sank up to 12 cm, normal 2-3 cm, long legs floated 5-7 cm when seated. Now within about 1 cm; the drum pose is 2-3 cm low (toe pointed at the pedal). Not checked: whether seated characters still meet the stool in the full app (thumbnail mode hides it).
