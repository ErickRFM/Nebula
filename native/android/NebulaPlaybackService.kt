package com.nebula.music

import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService

/** Receives locally authorized controls while Android app is backgrounded. */
class NebulaPlaybackService : MediaSessionService() {
    private var player: ExoPlayer? = null
    private var session: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val exo = ExoPlayer.Builder(this).build()
        exo.setHandleAudioBecomingNoisy(true)
        exo.addListener(object : Player.Listener {
            override fun onAudioSessionIdChanged(audioSessionId: Int) {
                NebulaAudioEffects.shared.attach(audioSessionId)
            }
        })
        NebulaAudioEffects.shared.attach(exo.audioSessionId)
        player = exo
        session = MediaSession.Builder(this, exo).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

    override fun onDestroy() {
        NebulaAudioEffects.shared.attach(0)
        session?.release()
        session = null
        player?.release()
        player = null
        super.onDestroy()
    }
}
