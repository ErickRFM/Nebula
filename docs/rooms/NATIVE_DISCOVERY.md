# PS-04: Native LAN discovery implementation (not yet release enabled)

The frontend now contains a Capacitor 7 typed bridge `NebulaParty` and displays **Buscar dispositivos en Wi-Fi** only on native clients. Android has an `NsdManager` DNS-SD discovery adapter, and iOS has an `NWBrowser` Bonjour adapter. Both browse the **`_nebula-room._tcp`** service and return anonymized service names; no IP, MAC address, peer media URL or secrets are sent to the backend.

### Integration work still required
1. Generate native `android/` / `ios/` targets with `npx cap add android`, `npx cap add ios` on supported SDK hosts. Existing `capacitor.config.ts` is only a shell.
2. Copy/register the platform implementation in the appropriate app target. The platform snippets in `native/` do **not** automatically compile or install; no APK/IPA has been built.
3. Add required Android local-network and Wi-Fi permissions (including Android 17 / API 37 user permission flow where applicable).
4. Add iOS `NSLocalNetworkUsageDescription` and `NSBonjourServices` = `_nebula-room._tcp`; register the plugin with Capacitor's custom view controller and test on an actual device.
5. **Implement an actual opt-in local beacon/receiver endpoint.** It is intentionally not advertised today: announcing an unbound port would mislead scanning peers. Browser-only clients remain visible through authenticated cloud room presence, not mDNS.
6. Integrate Media3 service and AVFoundation players, media interruptions and Cast; currently native playback methods reject with explicit `not_integrated` responses.
7. Confirm local network isolation, multicast permission, scan stop on unmount and native permission refusal behavior.

Discovery is informational only: an invite and server-side authenticated room membership are still required for connection. Never auto-pair or remotely turn on a speaker because a service is discoverable.

Sources: Android NsdManager documentation and Capacitor custom plugin guides; Apple Network.framework/Bonjour local network privacy docs.

## Opt-in advertising for discovery

Android's NSD registration uses a randomized service label and ephemeral TCP listener. iOS Bonjour uses an `NWListener` with a randomized label. Only a user-initiated "Hacer visible esta app en Wi-Fi" action starts advertising. Closing the screen, explicit opt-out, or plugin destruction cancels service advertisement. Peers can discover device labels but cannot stream music or issue commands through the beacon. These source adapters are still not compiled or registered in a native build, so discovery has NOT been physically validated.
