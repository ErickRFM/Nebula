// Integrate our custom Capacitor 7/Media3 plugin in a freshly generated native project.
// Re-runnable, fails closed on incompatible Capacitor templates.
import { readFileSync, writeFileSync, cpSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const android = join(root, 'android');
const files = {
  manifest: join(android, 'app/src/main/AndroidManifest.xml'),
  rootGradle: join(android, 'build.gradle'),
  appGradle: join(android, 'app/build.gradle'),
  sourceDir: join(android, 'app/src/main/java/com/nebula/music'),
};
if (!Object.values(files).every(p => existsSync(p))) {
  throw new Error('Capacitor Android project is missing. Run npx cap add android first.');
}

function update(path, search, replacement) {
  let value = readFileSync(path, 'utf8');
  if (value.includes(replacement)) return;
  if (!value.includes(search)) throw new Error('Template changed; missing anchor in ' + path + ': ' + search);
  value = value.replace(search, replacement);
  writeFileSync(path, value);
}
update(files.rootGradle, "classpath 'com.android.tools.build:gradle:",
  "classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.0'\n        classpath 'com.android.tools.build:gradle:");
update(files.appGradle, "apply plugin: 'com.android.application'",
  "apply plugin: 'com.android.application'\napply plugin: 'org.jetbrains.kotlin.android'");
update(files.appGradle, "    implementation project(':capacitor-android')",
  "    implementation \"androidx.media3:media3-exoplayer:1.11.1\"\n" +
  "    implementation \"androidx.media3:media3-session:1.11.1\"\n" +
  "    implementation \"androidx.core:core-ktx:1.17.0\"\n" +
  "    implementation project(':capacitor-android')");

const main = join(files.sourceDir, 'MainActivity.java');
if (!existsSync(main)) throw new Error('Expected com.nebula.music MainActivity.java');
const activity = String.raw`package com.nebula.music;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  @Override public void onCreate(Bundle savedInstanceState) {
    registerPlugin(NebulaPartyPlugin.class);
    super.onCreate(savedInstanceState);
  }
}
`;
writeFileSync(main, activity);
for (const name of ['NebulaPartyPlugin.kt', 'NebulaPlaybackService.kt']) {
  cpSync(join(root, 'native/android', name), join(files.sourceDir, name));
}
const permissions = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.POST_NOTIFICATIONS',
];
let manifest = readFileSync(files.manifest, 'utf8');
for (const permission of permissions) {
  if (!manifest.includes('android:name="' + permission + '"')) {
    manifest = manifest.replace('<application', '    <uses-permission android:name="' + permission + '" />\n    <application');
  }
}
const service = String.raw`<service
            android:name=".NebulaPlaybackService"
            android:exported="true"
            android:foregroundServiceType="mediaPlayback">
            <intent-filter>
                <action android:name="androidx.media3.session.MediaSessionService" />
            </intent-filter>
        </service>`;
if (!manifest.includes('android:name=".NebulaPlaybackService"')) {
  if (!manifest.includes('</application>')) throw new Error('Invalid Android application manifest');
  manifest = manifest.replace('</application>', service + '\n    </application>');
}
writeFileSync(files.manifest, manifest);
console.log('Integrated NÉBULA Capacitor Android plugin, Media3 service and permissions.');
