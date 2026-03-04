/**
 * Expo Config Plugin: Register Health Connect permission delegate in MainActivity.
 *
 * react-native-health-connect requires HealthConnectPermissionDelegate.setPermissionDelegate(activity)
 * to be called in MainActivity.onCreate() BEFORE super.onCreate(), so that the
 * ActivityResultLauncher is registered before the Activity enters STARTED state.
 * Without this, requestPermission() will crash with UninitializedPropertyAccessException.
 */
const {
  withMainActivity,
  withAndroidManifest,
} = require("expo/config-plugins");

function withHealthConnectPermissions(config) {
  // Step 1: Add setPermissionDelegate to MainActivity
  config = withMainActivity(config, (config) => {
    const contents = config.modResults.contents;

    // Add import if not present
    const importLine =
      "import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate";
    if (!contents.includes(importLine)) {
      config.modResults.contents = contents.replace(
        /import expo\.modules\.ReactActivityDelegateWrapper/,
        `import expo.modules.ReactActivityDelegateWrapper\n\n${importLine}`,
      );
    }

    // Add setPermissionDelegate call before super.onCreate(null)
    const delegateCall =
      "    // Register Health Connect permission delegate before super.onCreate()\n    HealthConnectPermissionDelegate.setPermissionDelegate(this)";
    if (!config.modResults.contents.includes("setPermissionDelegate")) {
      config.modResults.contents = config.modResults.contents.replace(
        /super\.onCreate\(null\)/,
        `${delegateCall}\n    super.onCreate(null)`,
      );
    }

    console.log(
      "[withHealthConnectPermissions] Added HealthConnectPermissionDelegate.setPermissionDelegate() to MainActivity",
    );
    return config;
  });

  // Step 2: Add ViewPermissionUsageActivity alias to AndroidManifest
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application[0];

    // Check if activity-alias already exists
    if (!application["activity-alias"]) {
      application["activity-alias"] = [];
    }

    const aliasExists = application["activity-alias"].some(
      (alias) => alias.$?.["android:name"] === "ViewPermissionUsageActivity",
    );

    if (!aliasExists) {
      application["activity-alias"].push({
        $: {
          "android:name": "ViewPermissionUsageActivity",
          "android:exported": "true",
          "android:targetActivity": ".MainActivity",
          "android:permission":
            "android.permission.START_VIEW_PERMISSION_USAGE",
        },
        "intent-filter": [
          {
            action: [
              {
                $: {
                  "android:name": "android.intent.action.VIEW_PERMISSION_USAGE",
                },
              },
            ],
            category: [
              {
                $: {
                  "android:name": "android.intent.category.HEALTH_PERMISSIONS",
                },
              },
            ],
          },
        ],
      });

      console.log(
        "[withHealthConnectPermissions] Added ViewPermissionUsageActivity alias to AndroidManifest",
      );
    }

    return config;
  });

  return config;
}

module.exports = withHealthConnectPermissions;
