import {
  AndroidConfig,
  type ConfigPlugin,
  withAndroidManifest,
  withDangerousMod,
  withEntitlementsPlist,
  withInfoPlist,
  withXcodeProject,
} from "@expo/config-plugins";
import plist from "@expo/plist";
import fs from "fs";
import https from "https";
import path from "path";

// --- Types ---

type ScreenShareOptions = {
  ios?: {
    extensionName?: string;
    appGroupIdentifier?: string;
  };
  android?: {
    enableScreenShareService?: boolean;
    foregroundServicePermission?: boolean;
  };
};

// --- Constants ---

const DEFAULT_EXTENSION_NAME = "ScreenShareExtension";
const DEFAULT_DEPLOYMENT_TARGET = "16.0";

const ANDROID_SCREEN_SHARE_SERVICE_KEY =
  "io.livekit.reactnative.expo.ENABLE_SCREEN_SHARE_SERVICE";

const JITSI_BASE_URL =
  "https://raw.githubusercontent.com/jitsi/jitsi-meet-sdk-samples/master/ios/swift-screensharing/JitsiSDKScreenSharingTest/Broadcast%20Extension";

const SWIFT_FILES = [
  "SampleHandler.swift",
  "SampleUploader.swift",
  "SocketConnection.swift",
  "DarwinNotificationCenter.swift",
  "Atomic.swift",
];

const JITSI_APP_GROUP_PLACEHOLDER =
  "group.com.jitsi.example-screensharing.appgroup";

const CACHE_DIR = "node_modules/.cache/expo-livekit-screen-share";

// --- Helpers ---

function getAppGroupIdentifier(bundleIdentifier: string): string {
  return `group.${bundleIdentifier}`;
}

function getExtensionBundleIdentifier(
  bundleIdentifier: string,
  extensionName: string
): string {
  return `${bundleIdentifier}.${extensionName}`;
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          httpsGet(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
          return;
        }
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

async function downloadSwiftFiles(cacheDir: string): Promise<void> {
  const allCached = SWIFT_FILES.every((file) =>
    fs.existsSync(path.join(cacheDir, file))
  );

  if (allCached) {
    console.log("[expo-livekit-screen-share] Using cached Swift files");
    return;
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  console.log(
    "[expo-livekit-screen-share] Downloading broadcast extension files from Jitsi reference..."
  );

  for (const file of SWIFT_FILES) {
    const url = `${JITSI_BASE_URL}/${file}`;
    try {
      const content = await httpsGet(url);
      fs.writeFileSync(path.join(cacheDir, file), content);
      console.log(`  Downloaded ${file}`);
    } catch (error) {
      throw new Error(
        `[expo-livekit-screen-share] Failed to download ${file}. ` +
          `Ensure you have internet access or manually place the files in ${cacheDir}. ` +
          `Original error: ${error}`
      );
    }
  }
}

// --- iOS Mods ---

function withScreenShareInfoPlist(
  config: ReturnType<ConfigPlugin>,
  extensionName: string,
  appGroupId?: string
): ReturnType<ConfigPlugin> {
  return withInfoPlist(config, (mod) => {
    const bundleId = mod.ios?.bundleIdentifier ?? "";
    const appGroup = appGroupId ?? getAppGroupIdentifier(bundleId);
    mod.modResults.RTCScreenSharingExtension = getExtensionBundleIdentifier(
      bundleId,
      extensionName
    );
    mod.modResults.RTCAppGroupIdentifier = appGroup;
    return mod;
  });
}

function withScreenShareEntitlements(
  config: ReturnType<ConfigPlugin>,
  appGroupId?: string
): ReturnType<ConfigPlugin> {
  return withEntitlementsPlist(config, (mod) => {
    const bundleId = mod.ios?.bundleIdentifier ?? "";
    const appGroup = appGroupId ?? getAppGroupIdentifier(bundleId);
    const existing =
      (mod.modResults["com.apple.security.application-groups"] as string[]) ??
      [];
    if (!existing.includes(appGroup)) {
      mod.modResults["com.apple.security.application-groups"] = [
        ...existing,
        appGroup,
      ];
    }
    return mod;
  });
}

function withScreenShareXcodeProject(
  config: ReturnType<ConfigPlugin>,
  extensionName: string
): ReturnType<ConfigPlugin> {
  return withXcodeProject(config, (mod) => {
    const xcodeProject = mod.modResults;
    const bundleId = mod.ios?.bundleIdentifier ?? "";
    const extensionBundleId = getExtensionBundleIdentifier(
      bundleId,
      extensionName
    );

    const existingTarget = xcodeProject.pbxTargetByName(extensionName);
    if (existingTarget) {
      return mod;
    }

    const target = xcodeProject.addTarget(
      extensionName,
      "app_extension",
      extensionName,
      extensionBundleId
    );

    // Create PBXGroup for extension files
    const group = xcodeProject.addPbxGroup(
      SWIFT_FILES,
      extensionName,
      extensionName,
      '"<group>"'
    );

    // Add group to main project's root group
    const mainGroupId =
      xcodeProject.getFirstProject().firstProject.mainGroup;
    xcodeProject.getPBXGroupByKey(mainGroupId).children.push({
      value: group.uuid,
      comment: extensionName,
    });

    // Add source files to extension target's build phase
    xcodeProject.addBuildPhase(
      SWIFT_FILES.map((f) => `${extensionName}/${f}`),
      "PBXSourcesBuildPhase",
      "Sources",
      target.uuid
    );

    // Configure build settings
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    const targetConfigs =
      xcodeProject.pbxNativeTargetSection()[target.uuid]?.buildConfigurationList;

    if (targetConfigs) {
      const configList =
        xcodeProject.pbxXCConfigurationList()[targetConfigs];
      if (configList?.buildConfigurations) {
        for (const buildConfig of configList.buildConfigurations) {
          const configEntry = configurations[buildConfig.value];
          if (configEntry?.buildSettings) {
            configEntry.buildSettings.SWIFT_VERSION = "5.0";
            configEntry.buildSettings.IPHONEOS_DEPLOYMENT_TARGET =
              DEFAULT_DEPLOYMENT_TARGET;
            configEntry.buildSettings.TARGETED_DEVICE_FAMILY = '"1,2"';
            configEntry.buildSettings.CODE_SIGN_ENTITLEMENTS = `${extensionName}/${extensionName}.entitlements`;
            configEntry.buildSettings.CODE_SIGN_STYLE = "Automatic";
            configEntry.buildSettings.PRODUCT_BUNDLE_IDENTIFIER = `"${extensionBundleId}"`;
            configEntry.buildSettings.GENERATE_INFOPLIST_FILE = "NO";
            configEntry.buildSettings.INFOPLIST_FILE = `${extensionName}/Info.plist`;
            configEntry.buildSettings.CURRENT_PROJECT_VERSION = "1";
            configEntry.buildSettings.MARKETING_VERSION = "1.0";
            // Override compiler — prevents inheriting ccache-clang paths from main project
            configEntry.buildSettings.CC = "clang";
            configEntry.buildSettings.CXX = '"clang++"';
          }
        }
      }
    }

    return mod;
  });
}

function withScreenShareExtensionFiles(
  config: ReturnType<ConfigPlugin>,
  extensionName: string,
  appGroupId?: string
): ReturnType<ConfigPlugin> {
  return withDangerousMod(config, [
    "ios",
    async (mod) => {
      const bundleId = mod.ios?.bundleIdentifier ?? "";
      const appGroup = appGroupId ?? getAppGroupIdentifier(bundleId);
      const iosPath = path.resolve(mod.modRequest.platformProjectRoot);
      const extensionPath = path.join(iosPath, extensionName);
      const projectRoot = mod.modRequest.projectRoot;
      const cacheDir = path.join(projectRoot, CACHE_DIR);

      // Download Swift files (with caching)
      await downloadSwiftFiles(cacheDir);

      fs.mkdirSync(extensionPath, { recursive: true });

      // Build extension Info.plist
      const extensionInfoPlist = {
        CFBundleDevelopmentRegion: "$(DEVELOPMENT_LANGUAGE)",
        CFBundleDisplayName: "Screen Share",
        CFBundleExecutable: "$(EXECUTABLE_NAME)",
        CFBundleIdentifier: "$(PRODUCT_BUNDLE_IDENTIFIER)",
        CFBundleInfoDictionaryVersion: "6.0",
        CFBundleName: "$(PRODUCT_NAME)",
        CFBundlePackageType: "$(PRODUCT_BUNDLE_PACKAGE_TYPE)",
        CFBundleShortVersionString: "$(MARKETING_VERSION)",
        CFBundleVersion: "$(CURRENT_PROJECT_VERSION)",
        NSExtension: {
          NSExtensionPointIdentifier:
            "com.apple.broadcast-services-upload",
          NSExtensionPrincipalClass: "$(PRODUCT_MODULE_NAME).SampleHandler",
        },
      };
      fs.writeFileSync(
        path.join(extensionPath, "Info.plist"),
        plist.build(extensionInfoPlist)
      );

      // Copy Swift files, replacing app group identifier in SampleHandler
      for (const file of SWIFT_FILES) {
        let content = fs.readFileSync(path.join(cacheDir, file), "utf8");

        if (file === "SampleHandler.swift") {
          content = content.replace(JITSI_APP_GROUP_PLACEHOLDER, appGroup);
        }

        fs.writeFileSync(path.join(extensionPath, file), content);
      }

      // Write entitlements
      const entitlements = {
        "com.apple.security.application-groups": [appGroup],
      };
      fs.writeFileSync(
        path.join(extensionPath, `${extensionName}.entitlements`),
        plist.build(entitlements)
      );

      return mod;
    },
  ]);
}

// --- Android Mods ---

function withScreenShareAndroidPermission(
  config: ReturnType<ConfigPlugin>
): ReturnType<ConfigPlugin> {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    if (!manifest["uses-permission"]) {
      manifest["uses-permission"] = [];
    }

    const permission =
      "android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION";
    const exists = manifest["uses-permission"].some(
      (p: { $?: { "android:name"?: string } }) =>
        p.$?.["android:name"] === permission
    );

    if (!exists) {
      manifest["uses-permission"].push({
        $: { "android:name": permission },
      });
    }

    return mod;
  });
}

function withScreenShareAndroidService(
  config: ReturnType<ConfigPlugin>
): ReturnType<ConfigPlugin> {
  return withAndroidManifest(config, (mod) => {
    const mainApplication =
      AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);

    // Remove existing entry for idempotency
    if (mainApplication["meta-data"]) {
      mainApplication["meta-data"] = mainApplication["meta-data"].filter(
        (item: { $?: { "android:name"?: string } }) =>
          item?.$?.["android:name"] !== ANDROID_SCREEN_SHARE_SERVICE_KEY
      );
    }

    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      mainApplication,
      ANDROID_SCREEN_SHARE_SERVICE_KEY,
      "true"
    );

    return mod;
  });
}

// --- Main Plugin ---

const withScreenShare: ConfigPlugin<ScreenShareOptions | undefined> = (
  config,
  options
) => {
  const extensionName =
    options?.ios?.extensionName ?? DEFAULT_EXTENSION_NAME;
  const appGroupId = options?.ios?.appGroupIdentifier;
  const enableAndroidService =
    options?.android?.enableScreenShareService ?? true;
  const enableAndroidPermission =
    options?.android?.foregroundServicePermission ?? true;

  // iOS
  config = withScreenShareInfoPlist(config, extensionName, appGroupId);
  config = withScreenShareEntitlements(config, appGroupId);
  config = withScreenShareXcodeProject(config, extensionName);
  config = withScreenShareExtensionFiles(config, extensionName, appGroupId);

  // Android
  if (enableAndroidPermission) {
    config = withScreenShareAndroidPermission(config);
  }
  if (enableAndroidService) {
    config = withScreenShareAndroidService(config);
  }

  return config;
};

export default withScreenShare;
