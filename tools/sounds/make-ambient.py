#!/usr/bin/env python3
"""Synthesises the twelve ambient loops of the conditions spec (task 4.3): `<weather>-<day|night>.wav` for clear, cloud, fog, rain, storm and snow.

Own work, like `make-sounds.py`: every sample is computed from noise, sine waves and filters with fixed seeds, so the loops are reproducible and are dedicated to the
public domain (CC0 1.0). No recording, no voice, nothing from a film, game or song. Each loop is 10 seconds and is seamless by construction: noise is filtered in the
frequency domain (a circular operation), every slow movement is a whole number of cycles, and every event (a drop, a cricket) wraps round the end.
A phone speaker has no bass, so every loop keeps its energy above 150 Hz.

Usage:  python3 tools/sounds/make-ambient.py <out dir>        writes clear-day.wav ... snow-night.wav (mono, 44.1 kHz, 16 bit)
        then, for each file: node tools/sounds/encode-sounds.mjs --one <in.wav> <out dir>/<name>.m4a     (about -16 LUFS; the Viewer plays them at gain 0.3 at most)
Needs numpy and nothing else.
"""
import importlib.util
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location('make_sounds', os.path.join(HERE, 'make-sounds.py'))
ms = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ms)
SR = ms.SR
SECONDS = 10
N = SR * SECONDS
T = np.arange(N) / SR


def noise(seed):
    return ms.rng(seed).normal(size=N)


def band(x, lo=None, hi=None):
    return ms.fft_filter(x, lo=lo, hi=hi)


def swell(cycles, depth, phase=0.0):
    """A slow movement of `cycles` whole cycles over the loop: 1 - depth at its lowest, 1 at its highest."""
    return 1 - depth * (0.5 + 0.5 * np.sin(2 * np.pi * (cycles * T / SECONDS + phase)))


def wobble(seed, hi_hz, depth):
    """Random slow movement made periodic by filtering in the frequency domain."""
    w = band(noise(seed), hi=hi_hz)
    return 1 + depth * w / max(np.max(np.abs(w)), 1e-9)


def add_event(buf, at, event, gain=1.0):
    """Adds `event` at sample `at`, wrapping round the end of the loop."""
    idx = (at + np.arange(len(event))) % len(buf)
    np.add.at(buf, idx, event * gain)


def drops(seed, per_second, lo, hi, gain):
    r = ms.rng(seed)
    out = np.zeros(N)
    for _ in range(int(per_second * SECONDS)):
        n = int(r.uniform(0.004, 0.012) * SR)
        tick = band(r.normal(size=n), lo=lo, hi=hi) * np.exp(-np.arange(n) / (0.0018 * SR))
        add_event(out, int(r.integers(0, N)), tick, gain * r.uniform(0.3, 1.0))
    return out


def crickets(seed, count, gain):
    """Short trills of a 4.3 kHz tone, a dozen pulses each, scattered round the loop."""
    r = ms.rng(seed)
    out = np.zeros(N)
    for _ in range(count):
        pulses = int(r.integers(8, 16))
        f = r.uniform(4100, 4500)
        trill = np.zeros(int(pulses * 0.05 * SR))
        for p in range(pulses):
            m = int(0.022 * SR)
            pulse = np.sin(2 * np.pi * f * np.arange(m) / SR) * np.hanning(m)
            s = int(p * 0.05 * SR)
            trill[s:s + m] += pulse
        add_event(out, int(r.integers(0, N)), trill, gain * r.uniform(0.4, 1.0))
    return out


def hum(f0, level):
    """A low steady note with a little beat, on frequencies a phone speaker can play."""
    whole = lambda f: round(f * SECONDS) / SECONDS  # a whole number of cycles in the loop, so the end meets the start
    return level * (np.sin(2 * np.pi * whole(f0) * T) + 0.6 * np.sin(2 * np.pi * whole(f0 * 1.503) * T + 0.7) + 0.35 * np.sin(2 * np.pi * whole(f0 * 2.01) * T + 1.9))


def finish(x):
    return ms.peak(x - np.mean(x), -3.0)


def clear(night):
    air = band(noise(11), lo=300, hi=2600) * swell(2, 0.35) * (0.5 if night else 0.8)
    hiss = band(noise(12), lo=3000, hi=7000) * 0.05
    y = air + hiss
    if night:
        y = y + crickets(13, 22, 0.16) + hum(168, 0.02)
    return finish(y)


def cloud(night):
    air = band(noise(21), lo=200, hi=1800) * swell(2, 0.5) * wobble(22, 0.6, 0.25)
    y = air + band(noise(23), lo=2500, hi=5000) * 0.04
    if night:
        y = y * 0.8 + hum(152, 0.035)
    return finish(y)


def fog(night):
    muffled = band(noise(31), lo=150, hi=700) * swell(1, 0.45) * wobble(32, 0.4, 0.2)
    y = muffled * (0.9 if night else 0.7) + hum(160 if night else 175, 0.03)
    return finish(y)


def rain(night):
    hiss = band(noise(41), lo=1200, hi=8500) * (0.55 if night else 0.7) * wobble(42, 1.0, 0.15)
    patter = drops(43, 70, 1800, 7000, 0.35)
    body = band(noise(44), lo=250, hi=900) * 0.22
    y = hiss + patter + body
    if night:
        y = y * 0.85 + hum(155, 0.018)
    return finish(y)


def storm(night):
    r = noise(51)
    downpour = band(r, lo=900, hi=9000) * 0.85 * wobble(52, 1.4, 0.2)
    patter = drops(53, 110, 1600, 7000, 0.45)
    gust = band(noise(54), lo=250, hi=1100) * swell(3, 0.55) * 0.55 * wobble(55, 0.8, 0.3)
    low = band(noise(56), lo=150, hi=420) * swell(1, 0.85, 0.25) * 0.75
    y = downpour + patter + gust + low
    if night:
        y = y * 0.9 + hum(150, 0.03)
    return finish(y)


def snow(night):
    hush = band(noise(61), lo=2200, hi=6000) * 0.16 * wobble(62, 0.8, 0.3)
    breath = band(noise(63), lo=220, hi=650) * swell(2, 0.5) * (0.5 if night else 0.4)
    y = hush + breath
    if night:
        y = y + hum(158, 0.02)
    return finish(y)


LOOPS = {'clear': clear, 'cloud': cloud, 'fog': fog, 'rain': rain, 'storm': storm, 'snow': snow}

if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = sys.argv[1]
    for weather, fn in LOOPS.items():
        for bucket, night in (('day', False), ('night', True)):
            x = fn(night)
            ms.write_wav(f'{out}/{weather}-{bucket}.wav', x)
            print(f'{weather}-{bucket}: {len(x) / SR:.1f} s, peak {np.max(np.abs(x)):.2f}')
