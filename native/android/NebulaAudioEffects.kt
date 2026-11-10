package com.nebula.music

import android.media.audiofx.BassBoost
import android.media.audiofx.Equalizer
import android.media.audiofx.LoudnessEnhancer
import android.media.audiofx.Virtualizer
import kotlin.math.ln

/**
 * Native DSP for the ExoPlayer path (party/cloud audio).
 *
 * Mirrors the intent of the Web Audio immersion engine with stable platform
 * effects: device equalizer for the profile curve, bass boost, virtualizer for
 * width and a loudness enhancer used as a leveler. Every call is guarded so a
 * device that rejects one effect still gets the rest instead of failing audio.
 *
 * Local library playback stays on Web Audio; this path never touches files.
 */
class NebulaAudioEffects private constructor() {
    private data class Settings(
        val enabled: Boolean,
        val intensity: Int,
        val bass: Int,
        val width: Int,
        val dynamics: Int,
        val bands: FloatArray,
    )

    private val anchors = doubleArrayOf(60.0, 150.0, 400.0, 1000.0, 2400.0, 6000.0, 12000.0)
    private var sessionId = 0
    private var equalizer: Equalizer? = null
    private var bassBoost: BassBoost? = null
    private var virtualizer: Virtualizer? = null
    private var loudness: LoudnessEnhancer? = null
    private var pending: Settings? = null

    /** Attaches to a new ExoPlayer audio session; 0 detaches and releases. */
    @Synchronized
    fun attach(audioSessionId: Int) {
        if (audioSessionId == sessionId && audioSessionId != 0) return
        releaseEffects()
        sessionId = audioSessionId
        if (audioSessionId == 0) return
        equalizer = tryCreate { Equalizer(0, audioSessionId) }
        bassBoost = tryCreate { BassBoost(0, audioSessionId) }
        virtualizer = tryCreate { Virtualizer(0, audioSessionId) }
        loudness = tryCreate { LoudnessEnhancer(audioSessionId) }
        pending?.let { applyInternal(it) }
    }

    @Synchronized
    fun apply(
        enabled: Boolean,
        intensity: Int,
        bass: Int,
        width: Int,
        dynamics: Int,
        bands: FloatArray,
    ) {
        val settings = Settings(
            enabled = enabled,
            intensity = intensity.coerceIn(0, 100),
            bass = bass.coerceIn(0, 100),
            width = width.coerceIn(0, 100),
            dynamics = dynamics.coerceIn(0, 100),
            bands = bands.copyOf(),
        )
        pending = settings
        if (sessionId != 0) applyInternal(settings)
    }

    private fun applyInternal(settings: Settings) {
        val depth = settings.intensity / 100f
        if (!settings.enabled || depth <= 0f) {
            disableAll()
            return
        }

        equalizer?.let { effect ->
            try {
                if (!effect.hasControl()) effect.enabled = true
                if (effect.hasControl()) {
                    val range = effect.bandLevelRange
                    val minimum = range[0].toInt()
                    val maximum = range[1].toInt()
                    for (band in 0 until effect.numberOfBands.toInt()) {
                        val hz = effect.getCenterFreq(band.toShort()) / 1000.0
                        val level = (interpolate(settings.bands, hz) * depth * 100.0)
                            .toInt()
                            .coerceIn(minimum, maximum)
                        effect.setBandLevel(band.toShort(), level.toShort())
                    }
                }
            } catch (_: Exception) {
            }
        }

        bassBoost?.let { effect ->
            try {
                if (!effect.hasControl()) effect.enabled = true
                val strength = (settings.bass / 100f * depth * 700f).toInt().coerceIn(0, 1000)
                effect.setStrength(strength.toShort())
                effect.enabled = strength > 0
            } catch (_: Exception) {
            }
        }

        virtualizer?.let { effect ->
            try {
                if (!effect.hasControl()) effect.enabled = true
                // Below 50 the listener wants a narrower image; the platform
                // virtualizer can only widen, so it stays off.
                val widening = ((settings.width - 50) / 50f).coerceIn(0f, 1f)
                val strength = (widening * depth * 800f).toInt().coerceIn(0, 1000)
                effect.setStrength(strength.toShort())
                effect.enabled = strength > 0
            } catch (_: Exception) {
            }
        }

        loudness?.let { effect ->
            try {
                if (!effect.hasControl()) effect.enabled = true
                val gainMb = (settings.dynamics / 100f * depth * 600f).toInt().coerceIn(0, 600)
                effect.setTargetGain(gainMb)
                effect.enabled = gainMb > 0
            } catch (_: Exception) {
            }
        }
    }

    /** Log-frequency interpolation between the seven Web Audio anchor bands. */
    private fun interpolate(bands: FloatArray, hz: Double): Float {
        if (bands.size != anchors.size) return 0f
        if (hz <= anchors.first()) return bands.first()
        if (hz >= anchors.last()) return bands.last()
        for (index in 0 until anchors.size - 1) {
            val low = anchors[index]
            val high = anchors[index + 1]
            if (hz < low || hz >= high) continue
            val span = ln(high / low)
            if (span <= 0.0) return bands[index]
            val ratio = ((ln(hz) - ln(low)) / span).toFloat()
            return bands[index] + (bands[index + 1] - bands[index]) * ratio
        }
        return 0f
    }

    private fun disableAll() {
        equalizer?.let { try { it.enabled = false } catch (_: Exception) {} }
        bassBoost?.let { try { it.setStrength(0); it.enabled = false } catch (_: Exception) {} }
        virtualizer?.let { try { it.setStrength(0); it.enabled = false } catch (_: Exception) {} }
        loudness?.let { try { it.setTargetGain(0); it.enabled = false } catch (_: Exception) {} }
    }

    private fun releaseEffects() {
        disableAll()
        equalizer?.let { try { it.release() } catch (_: Exception) {} }
        bassBoost?.let { try { it.release() } catch (_: Exception) {} }
        virtualizer?.let { try { it.release() } catch (_: Exception) {} }
        loudness?.let { try { it.release() } catch (_: Exception) {} }
        equalizer = null
        bassBoost = null
        virtualizer = null
        loudness = null
        sessionId = 0
    }

    private inline fun <T> tryCreate(block: () -> T): T? = try {
        block()
    } catch (_: Exception) {
        null
    }

    companion object {
        /** The service attaches the session; the Capacitor plugin applies settings. */
        val shared = NebulaAudioEffects()
    }
}
