# Party Sound acoustic QA — measurement contract

This phase adds deterministic waveform analysis in `@nebula/room-sync` for measuring transients captured by **one common hardware clock**. The functions are useful for a test microphone or a stereo recording of independent outputs and for computing P95 absolute delay over repeated clicks.

**Important:** separate Android and laptop recordings cannot simply be compared by their timestamps because recorder clocks differ. The algorithm does NOT automatically recognize individual speakers from a shared mono mix and does NOT perform acoustic calibration on its own. The real-world process requires a reference recorder/microphones, known click stimulus, background-noise control and a report of hardware/codec, distance, output route and measured delay. A better algorithm or custom capture rig may be necessary for complex sound fields.

Suggested evidence: record ten synchronized-start click trials, isolate each source to a separate channel on one recording clock, compute `relativeAcousticDelayMs` and `acousticDelaySummary`, record median/P95 and adjust each output's existing manual latency profile.

**Release status:** pure TypeScript analysis and synthetic unit tests delivered; physical acoustic QA is NOT EXECUTED by CI.

## Evidence quality improvements (V2)

The browser recorder now uses `alignAcousticPeaks` rather than pairing left/right clicks strictly by array index. It estimates a common delay candidate, allows some missed clicks, reports the unmatched count and measures signed median delay and approximate drift (ms/min) if the clip spans at least five seconds.

**Do not treat ambiguous alignment as success.** Periodic identical impulses can produce two equally plausible pairings when an early impulse is missing. Such results show an explicit error instead of a potentially wrong 800–1500 ms latency figure. To improve identifiability, use mildly irregular stimulus intervals (e.g. 0.7, 1.1, 0.9, 1.3 seconds), and clearly isolate the left reference microphone from the right microphone. The algorithm flags poor coverage as a limited sample.

The exported JSON record now has schema `version: 2` and contains quality, unmatched channels and optional drift. Drift is estimated from the relative acoustic offsets of a **single shared-clock stereo recording** and is not necessarily a network clock defect. It may include playback hardware and room effects.

**Physical acceptance still requires actual hardware:** two phones, Bluetooth codecs and test routes, repeated calibrated trials, and an external stereo capture system; CI uses only synthetic sound and cannot certify synchronization.
