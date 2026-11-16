# Viewer spike: hardware frame-rate run (world-viewer task 1, the open half)

The bare Spark page from the spike (`docs/spikes/2.1.md`). What is missing to close
task 1 is one number per LOD on real hardware: an integrated-GPU laptop and a
mid-range phone. The page measures it itself: after the splat loads it counts frames
for 5 seconds and prints `AVG FPS (5 s, lod=…)`.

## Setup (once, in this folder)

```
npm install
mkdir -p assets
ln -sf ../../../scratch/wl-1.1/spz_100k.spz assets/splat-100k.spz
ln -sf ../../../scratch/wl-1.1/spz_150k.spz assets/splat-150k.spz
ln -sf ../../../scratch/wl-1.1/spz_500k.spz assets/splat-500k.spz
ln -sf ../../../scratch/wl-1.1/spz_full_res.spz assets/splat-full.spz
python3 -m http.server 8790 --directory .
```

## Laptop

Open each of these, wait for the AVG FPS line, note the number:

- http://127.0.0.1:8790/index.html?view=spawn&lod=100k
- http://127.0.0.1:8790/index.html?view=spawn&lod=150k
- http://127.0.0.1:8790/index.html?view=spawn&lod=500k

## Phone

Same Wi-Fi: open `http://<this machine's LAN address>:8790/index.html?view=spawn&lod=100k`
(and 150k, 500k). The Python server binds all interfaces by default.

## Then

Send the six numbers (3 per device) back; they go into `docs/spikes/2.1.md`
(Requirements 5.1: at least 30 fps on an integrated-GPU laptop, at least 20 on a
mid-range phone, at the default quality) and task 1 ticks.
