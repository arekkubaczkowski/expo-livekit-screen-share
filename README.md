# expo-livekit-screen-share

Expo config plugin that enables screen sharing for [LiveKit](https://livekit.io) React Native apps on **iOS** and **Android**.

## What it does

### iOS
- Creates a **Broadcast Upload Extension** target in your Xcode project
- Downloads reference Swift implementation from [Jitsi SDK samples](https://github.com/jitsi/jitsi-meet-sdk-samples) (cached locally)
- Configures **App Groups** for inter-process communication
- Sets up `Info.plist`, entitlements, and build settings automatically

### Android
- Adds `FOREGROUND_SERVICE_MEDIA_PROJECTION` permission
- Enables LiveKit's screen share foreground service via `AndroidManifest.xml` meta-data

## Prerequisites

### iOS (one-time setup in Apple Developer Portal)

1. **Register an App Group**: `group.{your.bundle.identifier}`
2. **Add App Group** to your main app's App ID capabilities
3. **Register Extension Bundle ID**: `{your.bundle.identifier}.ScreenShareExtension`
4. **Add App Group** to the extension's App ID capabilities

## Installation

```sh
npx expo install expo-livekit-screen-share
```

## Configuration

Add the plugin to your `app.json` or `app.config.js`:

```json
{
  "plugins": [
    "expo-livekit-screen-share"
  ]
}
```

### Options

```json
{
  "plugins": [
    ["expo-livekit-screen-share", {
      "ios": {
        "extensionName": "ScreenShareExtension",
        "deploymentTarget": "16.0"
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
| `android.enableScreenShareService` | Android | `true` | Enable LiveKit's foreground service for screen sharing |
| `android.foregroundServicePermission` | Android | `true` | Add `FOREGROUND_SERVICE_MEDIA_PROJECTION` permission |

## Usage in your app

```tsx
import { useLocalParticipant, useRoomContext } from '@livekit/react-native';
import { ScreenCapturePickerView } from '@livekit/react-native-webrtc';
import { findNodeHandle, NativeModules, Platform } from 'react-native';

// iOS: Mount ScreenCapturePickerView somewhere in your tree
<ScreenCapturePickerView ref={pickerRef} />

// Toggle screen share
async function toggleScreenShare() {
  if (Platform.OS === 'ios') {
    const tag = findNodeHandle(pickerRef.current);
    await NativeModules.ScreenCapturePickerViewManager.show(tag);
  }
  await room.localParticipant.setScreenShareEnabled(!isScreenShareEnabled);
}
```

## EAS Build

For automatic provisioning, add `appExtensions` to your `app.config.js`:

```js
extra: {
  eas: {
    build: {
      experimental: {
        ios: {
          appExtensions: [{
            targetName: 'ScreenShareExtension',
            bundleIdentifier: `${bundleIdentifier}.ScreenShareExtension`,
            entitlements: {
              'com.apple.security.application-groups': [`group.${bundleIdentifier}`],
            },
          }],
        },
      },
    },
  },
}
```

## How it works

The plugin uses the [Jitsi Meet SDK samples](https://github.com/jitsi/jitsi-meet-sdk-samples/tree/master/ios/swift-screensharing/JitsiSDKScreenSharingTest/Broadcast%20Extension) as the reference implementation for the iOS Broadcast Upload Extension. These Swift files implement the socket-based IPC protocol expected by `@livekit/react-native-webrtc`'s `ScreenCapturer`.

Swift files are **downloaded during `expo prebuild`** and cached in `node_modules/.cache/expo-livekit-screen-share/`. Delete this directory to force re-download.

## License

MIT
