# Party Sound acoustic QA — measurement contract

This phase adds deterministic waveform analysis in `@nebula/room-sync` for measuring transients captured by **one common hardware clock**. The functions are useful for a test microphone or a stereo recording of independent outputs and for computing P95 absolute delay over repeated clicks.

**Important:** separate Android and laptop recordings cannot simply be compared by their timestamps because recorder clocks differ. The algorithm does NOT automatically recognize individual speakers from a shared mono mix and does NOT perform acoustic calibration on its own. The real-world process requires a reference recorder/microphones, known click stimulus, background-noise control and a report of hardware/codec, distance, output route and measured delay. A better algorithm or custom capture rig may be necessary for complex sound fields.

Suggested evidence: record ten synchronized-start click trials, isolate each source to a separate channel on one recording clock, compute `relativeAcousticDelayMs` and `acousticDelaySummary`, record median/P95 and adjust each output's existing manual latency profile.

**Release status:** pure TypeScript analysis and synthetic unit tests delivered; physical acoustic QA is NOT EXECUTED by CI.
