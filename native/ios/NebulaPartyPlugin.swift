import Foundation
import Capacitor
import Network
import AVFoundation

/// Receivers are discoverable only after publishing _nebula-room._tcp via a
/// separately implemented opt-in beacon; discovered labels are NOT credentials.
@objc(NebulaPartyPlugin)
public class NebulaPartyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NebulaPartyPlugin"
    public let jsName = "NebulaParty"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopScan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startBeacon", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopBeacon", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "playAuthorizedAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pauseAudio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopAudio", returnType: CAPPluginReturnPromise)
    ]

    private var browser: NWBrowser?
    private let queue = DispatchQueue(label: "com.nebula.party.discovery")
    private let bonjourType = "_nebula-room._tcp"
    private var beacon: NWListener?
    private var audio: AVPlayer?

    @objc public func startScan(_ call: CAPPluginCall) {
        if browser != nil {
            call.resolve(["started": true])
            return
        }
        let parameters = NWParameters()
        parameters.includePeerToPeer = false
        let next = NWBrowser(for: .bonjour(type: bonjourType, domain: nil), using: parameters)
        next.browseResultsChangedHandler = { [weak self] results, _ in
            guard let self = self else { return }
            let devices: [[String: String]] = results.compactMap { result in
                guard case let .service(name, _, _, _) = result.endpoint else { return nil }
                return ["id": String(name.prefix(128)), "name": String(name.prefix(80))]
            }
            DispatchQueue.main.async {
                self.notifyListeners("servicesChanged", data: ["services": devices])
            }
        }
        next.stateUpdateHandler = { state in
            if case .failed = state { next.cancel() }
        }
        browser = next
        next.start(queue: queue)
        call.resolve(["started": true])
    }

    @objc public func stopScan(_ call: CAPPluginCall) {
        browser?.cancel()
        browser = nil
        notifyListeners("servicesChanged", data: ["services": []])
        call.resolve()
    }
    @objc public func startBeacon(_ call: CAPPluginCall) {
        if beacon != nil { call.resolve(["started": true]); return }
        do {
            let next = try NWListener(using: .tcp, on: .any)
            let name = "Nebula-" + String(UUID().uuidString.prefix(8))
            next.service = NWListener.Service(name: name, type: bonjourType)
            next.newConnectionHandler = { connection in
                // Not an authenticated streaming endpoint. No remote commands.
                connection.cancel()
            }
            next.stateUpdateHandler = { [weak self] state in
                if case .failed = state {
                    next.cancel()
                    self?.beacon = nil
                }
            }
            beacon = next
            next.start(queue: queue)
            call.resolve(["started": true])
        } catch {
            call.reject("local_beacon_unavailable", nil, error)
        }
    }

    @objc public func stopBeacon(_ call: CAPPluginCall) {
        beacon?.cancel()
        beacon = nil
        call.resolve()
    }
    @objc public func playAuthorizedAudio(_ call: CAPPluginCall) {
        guard let value = call.getString("url"), let url = URL(string: value),
              url.scheme == "https", url.host != nil else {
            call.reject("authorized_https_audio_required")
            return
        }
        DispatchQueue.main.async {
            do {
                try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
                try AVAudioSession.sharedInstance().setActive(true)
                self.audio?.pause()
                self.audio = AVPlayer(url: url)
                self.audio?.play()
                call.resolve()
            } catch {
                call.reject("native_audio_unavailable", nil, error)
            }
        }
    }
    @objc public func pauseAudio(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.audio?.pause(); call.resolve() }
    }
    @objc public func stopAudio(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.audio?.pause()
            self.audio?.replaceCurrentItem(with: nil)
            self.audio = nil
            call.resolve()
        }
    }

    override public func handleOnDestroy() {
        beacon?.cancel()
        beacon = nil
        browser?.cancel()
        browser = nil
    }
}
