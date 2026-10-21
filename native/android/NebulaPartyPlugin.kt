package com.nebula.music

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import android.content.ComponentName
import android.net.Uri
import androidx.core.content.ContextCompat
import androidx.media3.common.MediaItem
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import java.util.UUID
import java.net.ServerSocket
import java.net.SocketException
import java.util.concurrent.Executors

/**
 * Discovery-only implementation. Local service names are NOT authenticated
 * and must never be used as permission to join or control a room.
 *
 * Copy into a generated Capacitor Android app, register in MainActivity,
 * and verify Android 17+ local network permissions before enabling release.
 */
@CapacitorPlugin(name = "NebulaParty")
class NebulaPartyPlugin : Plugin() {
    private val nsd: NsdManager by lazy {
        context.getSystemService(Context.NSD_SERVICE) as NsdManager
    }
    private val nearby = linkedMapOf<String, String>()
    private var listener: NsdManager.DiscoveryListener? = null
    private val serviceType = "_nebula-room._tcp."
    private var beaconListener: NsdManager.RegistrationListener? = null
    private var beaconSocket: ServerSocket? = null
    private val beaconWorker = Executors.newSingleThreadExecutor()

    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var audioController: MediaController? = null

    private fun usePlayer(call: PluginCall, action: (MediaController) -> Unit) {
        val existing = audioController
        if (existing != null) {
            try { action(existing); call.resolve() }
            catch (error: Exception) { call.reject("native_audio_failed", error) }
            return
        }
        val pending = controllerFuture ?: MediaController.Builder(
            context, SessionToken(context, ComponentName(context, NebulaPlaybackService::class.java))
        ).buildAsync().also { controllerFuture = it }
        pending.addListener({
            try {
                val player = pending.get()
                audioController = player
                action(player)
                call.resolve()
            } catch (error: Exception) {
                call.reject("native_audio_unavailable", error)
            }
        }, ContextCompat.getMainExecutor(context))
    }


    @PluginMethod
    fun startScan(call: PluginCall) {
        if (listener != null) {
            call.resolve(JSObject().put("started", true))
            return
        }
        val next = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                listener = null
                notifyListeners("servicesChanged", JSObject().put("services", JSArray()))
            }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                synchronized(nearby) {
                    val key = serviceInfo.serviceName.take(128)
                    nearby[key] = key.take(80)
                }
                publish()
            }
            override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                synchronized(nearby) { nearby.remove(serviceInfo.serviceName.take(128)) }
                publish()
            }
        }
        listener = next
        try {
            nsd.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, next)
            call.resolve(JSObject().put("started", true))
        } catch (error: Exception) {
            listener = null
            call.reject("local_discovery_unavailable", error)
        }
    }

    private fun publish() {
        val items = JSArray()
        synchronized(nearby) {
            nearby.forEach { (id, name) -> items.put(JSObject().put("id", id).put("name", name)) }
        }
        notifyListeners("servicesChanged", JSObject().put("services", items))
    }

    @PluginMethod
    fun stopScan(call: PluginCall) {
        stopDiscovery()
        call.resolve()
    }

    private fun stopDiscovery() {
        listener?.let {
            try { nsd.stopServiceDiscovery(it) } catch (_: Exception) {}
        }
        listener = null
        synchronized(nearby) { nearby.clear() }
        publish()
    }

    // Advertising is strictly opt-in; the port carries NO room credentials,
    // no control requests, and no audio. Discovery never authenticates peers.
    @PluginMethod
    fun startBeacon(call: PluginCall) {
        if (beaconSocket != null) { call.resolve(JSObject().put("started", true)); return }
        try {
            val server = ServerSocket(0)
            beaconSocket = server
            beaconWorker.execute {
                while (!server.isClosed) {
                    try { server.accept().use { client ->
                        client.soTimeout = 1000
                        // Intentionally no data/control protocol at this stage.
                    } } catch (_: SocketException) { break }
                      catch (_: Exception) { if (server.isClosed) break }
                }
            }
            val info = NsdServiceInfo().apply {
                serviceName = "Nebula-" + UUID.randomUUID().toString().take(8)
                serviceType = this@NebulaPartyPlugin.serviceType
                port = server.localPort
            }
            val registration = object : NsdManager.RegistrationListener {
                override fun onServiceRegistered(serviceInfo: NsdServiceInfo) {}
                override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
                    stopBeaconInternal()
                }
                override fun onServiceUnregistered(serviceInfo: NsdServiceInfo) {}
                override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {}
            }
            beaconListener = registration
            nsd.registerService(info, NsdManager.PROTOCOL_DNS_SD, registration)
            call.resolve(JSObject().put("started", true))
        } catch (error: Exception) {
            stopBeaconInternal()
            call.reject("local_beacon_unavailable", error)
        }
    }

    @PluginMethod
    fun stopBeacon(call: PluginCall) {
        stopBeaconInternal()
        call.resolve()
    }

    private fun stopBeaconInternal() {
        beaconListener?.let { try { nsd.unregisterService(it) } catch (_: Exception) {} }
        beaconListener = null
        try { beaconSocket?.close() } catch (_: Exception) {}
        beaconSocket = null
    }

    @PluginMethod
    fun playAuthorizedAudio(call: PluginCall) {
        val uri = Uri.parse(call.getString("url") ?: "")
        if (uri.scheme != "https" || uri.host.isNullOrBlank()) {
            call.reject("authorized_https_audio_required")
            return
        }
        usePlayer(call) { player ->
            player.setMediaItem(MediaItem.fromUri(uri))
            player.prepare()
            player.play()
        }
    }

    @PluginMethod
    fun pauseAudio(call: PluginCall) { usePlayer(call) { it.pause() } }

    @PluginMethod
    fun stopAudio(call: PluginCall) {
        usePlayer(call) { player -> player.stop(); player.clearMediaItems() }
    }

    override fun handleOnDestroy() {
        stopDiscovery()
        stopBeaconInternal()
        beaconWorker.shutdownNow()
        controllerFuture?.let { MediaController.releaseFuture(it) }
        controllerFuture = null
        audioController = null
        super.handleOnDestroy()
    }
}
