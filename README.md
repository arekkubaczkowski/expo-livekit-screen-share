# expo-livekit-screen-share

Expo config plugin that enables screen sharing for [LiveKit](https://livekit.io) React Native apps on **iOS** and **Android**.

## What it does

### iOS

- Creates a **Broadcast Upload Extension** target in your Xcode project
- Downloads the [Jitsi reference implementation](https://github.com/jitsi/jitsi-meet-sdk-samples/tree/master/ios/swift-screensharing/JitsiSDKScreenSharingTest/Broadcast%20Extension) Swift files during prebuild (cached locally)
- Configures **App Groups** for inter-process communication between app and extension
- Sets up `Info.plist`, entitlements, and Xcode build settings automatically

### Android

- Adds `FOREGROUND_SERVICE_MEDIA_PROJECTION` permission to `AndroidManifest.xml`
- Enables LiveKit's screen share foreground service

## Installation

```sh
npx expo install expo-livekit-screen-share
```

## Configuration

Add the plugin to your `app.json` or `app.config.js`:

```json
{
  "plugins": ["expo-livekit-screen-share"]
}
```

### Options

All options are optional with sensible defaults:

```json
{
  "plugins": [
    ["expo-livekit-screen-share", {
      "ios": {
        "extensionName": "ScreenShareExtension",
        "deploymentTarget": "16.0",
        "appGroupIdentifier": "group.com.example.myapp"
      },
      "android": {
        "enableScreenShareService": true,
        "foregroundServicePermission": true
      }
    }]
  ]
}
```

| Option | Platform | Default | Description |
|--------|----------|---------|-------------|
| `ios.extensionName` | iOS | `"ScreenShareExtension"` | Name of the Broadcast Upload Extension target |
| `ios.deploymentTarget` | iOS | `"16.0"` | Minimum iOS deployment target for the extension |
| `ios.appGroupIdentifier` | iOS | `"group.{bundleIdentifier}"` | Custom App Group identifier (if your project uses a different naming convention) |
| `android.enableScreenShareService` | Android | `true` | Enable LiveKit's foreground service for screen sharing |
| `android.foregroundServicePermission` | Android | `true` | Add `FOREGROUND_SERVICE_MEDIA_PROJECTION` permission |

## iOS Setup (Apple Developer Portal)

Before building, you need to register identifiers in the [Apple Developer Portal](https://developer.apple.com). Repeat these steps **for each environment** (development, staging, production):

### 1. Register an App Group

Identifiers > **+** > App Groups:
- Identifier: `group.{your.bundle.identifier}` (e.g. `group.com.example.myapp`)

### 2. Add App Group to your main App ID

Identifiers > find your App ID > Edit > Capabilities > **App Groups** > select the group from step 1.

### 3. Register Extension Bundle ID

Identifiers > **+** > App IDs > type **App**:
- Bundle ID: `{your.bundle.identifier}.ScreenShareExtension`
- Enable **App Groups** capability > select the same group

### 4. Provisioning

If using **Xcode Automatic Signing** (development builds), Xcode handles provisioning profiles automatically.

For **EAS Build**, add `appExtensions` to your config:

```js
// app.config.js
extra: {
  eas: {
    build: {
      experimental: {
        ios: {
          appExtensions: [{
            targetName: 'ScreenShareExtension',
            bundleIdentifier: `${bundleIdentifier}.ScreenShareExtension`,
            entitlements: {
              'com.apple.security.application-groups': [
                `group.${bundleIdentifier}`,
              ],
            },
          }],
        },
      },
    },
  },
}
```

## Usage in your app

### Start screen sharing

```tsx
import { useRoomContext } from '@livekit/react-native';

// Android — call directly:
await room.localParticipant.setScreenShareEnabled(true);

// iOS — show broadcast picker first:
import { ScreenCapturePickerView } from '@livekit/react-native-webrtc';
import { findNodeHandle, NativeModules, Platform } from 'react-native';

// Mount the invisible picker view somewhere in your component tree:
<ScreenCapturePickerView ref={pickerRef} />

// Then trigger it:
if (Platform.OS === 'ios') {
  const tag = findNodeHandle(pickerRef.current);
  await NativeModules.ScreenCapturePickerViewManager.show(tag);
}
await room.localParticipant.setScreenShareEnabled(true);
```

### Check screen share state

```tsx
import { useLocalParticipant } from '@livekit/react-native';

const { isScreenShareEnabled } = useLocalParticipant();
```

## How it works

The iOS Broadcast Upload Extension runs as a separate process that captures the screen via ReplayKit. It communicates with the main app through a Unix domain socket (`rtc_SSFD`) in the shared App Group container. The `@livekit/react-native-webrtc` native module (`ScreenCapturer`) listens on this socket and feeds received frames into the WebRTC pipeline.

Swift source files are downloaded from the [Jitsi reference implementation](https://github.com/jitsi/jitsi-meet-sdk-samples) during `expo prebuild` and cached in `node_modules/.cache/expo-livekit-screen-share/`. Delete this directory to force re-download.

## Troubleshooting

### Download fails during prebuild

If you're building offline or behind a firewall, manually download the Swift files from [Jitsi SDK samples](https://github.com/jitsi/jitsi-meet-sdk-samples/tree/master/ios/swift-screensharing/JitsiSDKScreenSharingTest/Broadcast%20Extension) and place them in `node_modules/.cache/expo-livekit-screen-share/`.

### iOS screen share doesn't start

- Verify App Group identifiers match between the main app and extension
- Check that `RTCScreenSharingExtension` and `RTCAppGroupIdentifier` are set in the main app's `Info.plist`
- Ensure the extension's provisioning profile includes the App Group capability

## License

MIT
