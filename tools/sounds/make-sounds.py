#!/usr/bin/env python3
"""Synthesises the seven Hauntology sound clips (docs/SOUNDS.md, party-mode Requirement 20).

Own work: every sample is computed here from noise, sine waves and filters, with fixed random seeds, so the clips are reproducible
and are dedicated to the public domain (CC0 1.0). No recording, no word, no real person's voice, nothing from a film, game or song.

Usage:  python3 tools/sounds/make-sounds.py <out dir>        writes creak.wav ... becoming.wav (mono, 44.1 kHz, 16 bit)
        then tools/sounds/encode-sounds.sh <out dir> <dest>   levels to about -16 LUFS and encodes the .m4a files
Needs numpy and nothing else. A phone speaker has no bass, so every clip keeps its energy between 150 Hz and 6 kHz.
"""
import sys
import wave

import numpy as np

SR = 44100


def rng(seed):
    return np.random.default_rng(seed)


def smoothstep(u):
    u = np.clip(u, 0.0, 1.0)
    return u * u * (3 - 2 * u)


def fade_out(x, sec=0.05):
    k = int(sec * SR)
    x = x.copy()
    x[-k:] *= np.linspace(1, 0, k) ** 2
    return x


def pad_to(x, sec):
    n = int(sec * SR)
    return np.pad(x, (0, max(0, n - len(x))))[:n]


def fft_filter(x, lo=None, hi=None, edge=0.2):
    """Band-pass with smooth edges: below `lo` and above `hi` Hz are removed."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= smoothstep((f - lo * (1 - edge)) / (2 * lo * edge))
    if hi:
        g *= 1 - smoothstep((f - hi * (1 - edge)) / (2 * hi * edge))
    return np.fft.irfft(X * g, len(x))


def sweep_band(x, fc, bw_oct=0.5, frame=4096, hop=1024):
    """A band-pass whose centre moves: fc(t seconds) gives Hz; bw_oct is the half-width in octaves."""
    n = len(x)
    win = np.hanning(frame)
    out = np.zeros(n + frame)
    norm = np.zeros(n + frame)
    f = np.fft.rfftfreq(frame, 1 / SR)
    f[0] = 1.0
    for s in range(0, n, hop):
        seg = x[s:s + frame]
        if len(seg) < frame:
            seg = np.pad(seg, (0, frame - len(seg)))
        c = float(fc((s + frame / 2) / SR))
        g = np.exp(-0.5 * (np.log2(f / c) / bw_oct) ** 2)
        out[s:s + frame] += np.fft.irfft(np.fft.rfft(seg * win) * g, frame) * win
        norm[s:s + frame] += win ** 2
    return out[:n] / np.maximum(norm[:n], 1e-9)


def formants(x, centres, bw_oct=0.3):
    """Adds up band-passes at fixed centres (a vowel colour)."""
    return sum(fft_filter(x, lo=c * 2 ** -bw_oct, hi=c * 2 ** bw_oct) * w for c, w in centres)


def reverb(x, rt60=1.2, wet=0.3, seed=7, damp=5000):
    m = int(rt60 * SR)
    t = np.arange(m) / SR
    ir = rng(seed).normal(size=m) * np.exp(-6.91 * t / rt60)
    ir = fft_filter(ir, hi=damp)
    ramp = int(0.004 * SR)
    ir[:ramp] *= np.linspace(0, 1, ramp)
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + m)))
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:len(x)]
    y *= np.sqrt(np.sum(x ** 2) / max(np.sum(y ** 2), 1e-12))
    return (1 - wet) * x + wet * y


def peak(x, db=-3.0):
    return x / max(np.max(np.abs(x)), 1e-9) * 10 ** (db / 20)


# ---- the seven clips

def creak():
    """One slow floorboard or hinge creak, dry: stick-slip ticks whose rate climbs until they run together into a squeal."""
    r = rng(1)
    n = int(1.9 * SR)
    t = np.arange(n) / SR
    rate = 34 + 150 * smoothstep(t / 1.45) ** 2.2
    jitter = fft_filter(r.normal(size=n), hi=9)
    rate *= 1 + 0.06 * jitter / np.max(np.abs(jitter))
    phase = np.cumsum(rate / SR)
    ticks = np.flatnonzero(np.diff(np.floor(phase)) > 0)
    impulses = np.zeros(n)
    impulses[ticks] = r.uniform(0.55, 1.0, len(ticks))
    m = int(0.02 * SR)
    tt = np.arange(m) / SR
    ring = sum(a * np.exp(-tt / tau) * np.sin(2 * np.pi * f * tt)
               for f, tau, a in [(760, 0.007, 1.0), (1180, 0.005, 0.7), (1720, 0.004, 0.55), (2650, 0.003, 0.3)])
    y = np.convolve(impulses, ring)[:n]
    body = sweep_band(r.normal(size=n), lambda s: 600 + 900 * smoothstep(s / 1.5), 0.6) * 0.04
    env = smoothstep(t / 0.22) * (0.75 + 0.25 * np.sin(2 * np.pi * 3.1 * t)) * (1 - smoothstep((t - 1.5) / 0.3))
    y = fft_filter((y + body) * env, lo=250, hi=5200)
    return pad_to(fade_out(peak(y), 0.03), 1.95)


def whisper():
    """Breathy, no words: one long breath that opens from an 'oo' to an 'ah' and fades, a little distant."""
    r = rng(2)
    n = int(2.4 * SR)
    t = np.arange(n) / SR
    air = r.normal(size=n)
    vowel = sweep_band(air, lambda s: 520 + 430 * smoothstep(s / 1.4), 0.55) + 0.7 * sweep_band(air, lambda s: 1250 + 450 * smoothstep(s / 1.4), 0.5)
    hiss = fft_filter(air, lo=4200, hi=9000) * 0.55
    env = smoothstep(t / 0.65) * (1 - smoothstep((t - 1.25) / 1.05)) * (0.86 + 0.14 * np.sin(2 * np.pi * 5.2 * t + 1))
    y = fft_filter((vowel + hiss) * env, lo=300, hi=9000)
    y = reverb(pad_to(y, 2.9), rt60=0.7, wet=0.28, seed=11)
    return fade_out(peak(y), 0.06)


def bell():
    """One small bell that rings out: inharmonic partials, each with its own decay, and a tiny strike."""
    r = rng(3)
    n = int(2.9 * SR)
    t = np.arange(n) / SR
    f0 = 1175.0
    partials = [(0.5, 0.35, 1.3), (1.0, 1.0, 1.7), (1.183, 0.55, 1.4), (1.506, 0.4, 1.1), (2.0, 0.7, 1.15),
                (2.514, 0.35, 0.85), (2.662, 0.3, 0.75), (3.011, 0.25, 0.62), (4.166, 0.18, 0.45), (5.433, 0.12, 0.33)]
    y = np.zeros(n)
    for ratio, amp, tau in partials:
        for detune in (-0.6, 0.6):
            y += 0.5 * amp * np.exp(-t / tau) * np.sin(2 * np.pi * (f0 * ratio + detune) * t + r.uniform(0, 6.28))
    strike = fft_filter(r.normal(size=n), lo=2000, hi=7000) * np.exp(-t / 0.006) * 0.35
    y = (y + strike) * smoothstep(t / 0.002)
    return fade_out(peak(y), 0.12)


def laugh():
    """Thin, distant and eerie, no words: five breathy 'ha' bursts that slow down and sink, with a ghost of a second voice."""
    r = rng(4)
    total = 2.9
    out = np.zeros(int(total * SR))
    starts = [0.05, 0.34, 0.62, 0.93, 1.30]
    for i, s0 in enumerate(starts):
        dur = 0.19
        n = int(dur * SR)
        t = np.arange(n) / SR
        f = (470 - 28 * i) * (1 + 0.025 * np.sin(2 * np.pi * 5.5 * t))
        ph = np.cumsum(f / SR)
        voice = sum(np.sin(2 * np.pi * k * ph) / k ** 0.8 for k in range(1, 14))
        ghost = sum(np.sin(2 * np.pi * k * ph * 1.0087) / k ** 0.8 for k in range(1, 14))
        air = r.normal(size=n)
        src = 0.75 * voice + 0.4 * ghost + 0.55 * air
        col = formants(src, [(830 - 40 * i, 1.0), (1330, 0.7), (2550, 0.35)], 0.28)
        env = smoothstep(t / 0.016) * np.exp(-t / 0.075) * 0.86 ** i
        k0 = int(s0 * SR)
        out[k0:k0 + n] += col * env
    y = fft_filter(out, lo=280, hi=4300)
    y = reverb(y, rt60=1.5, wet=0.5, seed=13, damp=3500)
    return fade_out(peak(y), 0.08)


def wind():
    """A rising gust with some mid frequencies: it swells for two seconds, then drops away."""
    r = rng(5)
    n = int(2.9 * SR)
    t = np.arange(n) / SR
    air = r.normal(size=n)
    body = sweep_band(air, lambda s: 300 + 850 * smoothstep(s / 2.2), 0.85)
    top = fft_filter(air, lo=2200, hi=4200) * 0.18
    gusts = fft_filter(r.normal(size=n), hi=3.5)
    turb = 1 + 0.35 * gusts / np.max(np.abs(gusts))
    env = smoothstep(t / 2.2) ** 1.6 * (1 - smoothstep((t - 2.2) / 0.65))
    y = fft_filter((body + top) * env * turb, lo=180, hi=5200)
    return fade_out(peak(y), 0.05)


def rumble():
    """A low tremble with its energy between 150 and 800 Hz, because a phone speaker has no bass."""
    r = rng(6)
    n = int(2.8 * SR)
    t = np.arange(n) / SR
    low = fft_filter(r.normal(size=n), lo=150, hi=800)
    wob = fft_filter(r.normal(size=n), hi=14)
    wob = wob / max(np.max(np.abs(wob)), 1e-9)
    trem = 1 + 0.5 * np.sin(2 * np.pi * (10.5 + 2.0 * wob) * t) + 0.35 * wob
    env = smoothstep(t / 0.35) * (1 - smoothstep((t - 1.6) / 1.1))
    y = low * np.clip(trem, 0.05, 2.0) * env
    return fade_out(peak(y), 0.05)


def becoming():
    """A swell, one hit, a fade: a dark chord that opens and brightens for two seconds, one blow, and a long tail."""
    r = rng(8)
    total = 3.9
    n = int(total * SR)
    t = np.arange(n) / SR
    hit = 2.0
    notes = [196.0, 233.1, 293.7, 440.0, 466.2]
    pad = np.zeros(n)
    for f in notes:
        for cents in (-7, 0, 7):
            ph = np.cumsum(np.full(n, f * 2 ** (cents / 1200) / SR))
            pad += 2 * (ph % 1) - 1
    pad = sweep_band(pad, lambda s: 320 + 3400 * smoothstep(s / 2.0) ** 1.4, 1.2)
    swell = (np.clip(t / hit, 0, 1) ** 2.6) * (t < hit)
    riser = fft_filter(r.normal(size=n), lo=1500, hi=6500) * (np.clip(t / hit, 0, 1) ** 3.2) * (t < hit) * 0.5
    swell_part = pad * swell + riser * 0.35
    k0 = int(hit * SR)
    m = n - k0
    tk = np.arange(m) / SR
    thump_f = 55 + 120 * np.exp(-tk / 0.05)
    thump = np.sin(2 * np.pi * np.cumsum(thump_f / SR)) * np.exp(-tk / 0.16)
    body = fft_filter(r.normal(size=m), lo=160, hi=1400) * np.exp(-tk / 0.12)
    stab = pad[k0:] * np.exp(-tk / 0.35) / max(np.max(np.abs(pad)), 1e-9)
    blow = np.zeros(n)
    blow[k0:] = 0.55 * thump + 0.9 * body + 0.7 * stab
    mix = swell_part / max(np.max(np.abs(swell_part)), 1e-9) * 0.55 + blow
    mix = fft_filter(mix, lo=120, hi=7000)
    y = reverb(mix, rt60=2.2, wet=0.55, seed=17)
    return fade_out(peak(y), 0.35)


CLIPS = {'creak': creak, 'whisper': whisper, 'bell': bell, 'laugh': laugh, 'wind': wind, 'rumble': rumble, 'becoming': becoming}


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = sys.argv[1]
    for name, fn in CLIPS.items():
        x = fn()
        write_wav(f'{out}/{name}.wav', x)
        print(f'{name}: {len(x) / SR:.2f} s, peak {np.max(np.abs(x)):.2f}')
