/**
 * Postinstall patch for react-native-health-connect@3.5.0
 *
 * Adds try-catch safety to native methods in HealthConnectManager.kt
 * so they reject the JS Promise instead of crashing the app.
 *
 * Run automatically via `postinstall` in package.json.
 */
const fs = require("fs");
const path = require("path");

const filePath = path.join(
  __dirname,
  "../node_modules/react-native-health-connect/android/src/main/java/dev/matinzd/healthconnect/HealthConnectManager.kt",
);

if (!fs.existsSync(filePath)) {
  console.log("[patch-health-connect] File not found, skipping patch.");
  process.exit(0);
}

let content = fs.readFileSync(filePath, "utf8");

// --- Patch 1: openHealthConnectSettings ---
const original1 = `  fun openHealthConnectSettings() {
    val intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
    applicationContext.currentActivity?.startActivity(intent)
  }`;
const patched1 = `  fun openHealthConnectSettings() {
    try {
      val intent = Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
      applicationContext.currentActivity?.startActivity(intent)
    } catch (e: Exception) {
      // Silently ignore if settings can't be opened
    }
  }`;

// --- Patch 2: openHealthConnectDataManagement ---
const original2 = `  fun openHealthConnectDataManagement(providerPackageName: String?) {
    val intent = providerPackageName?.let {
      HealthConnectClient.getHealthConnectManageDataIntent(applicationContext, it)
    } ?: HealthConnectClient.getHealthConnectManageDataIntent(applicationContext)
    applicationContext.currentActivity?.startActivity(intent)
  }`;
const patched2 = `  fun openHealthConnectDataManagement(providerPackageName: String?) {
    try {
      val intent = providerPackageName?.let {
        HealthConnectClient.getHealthConnectManageDataIntent(applicationContext, it)
      } ?: HealthConnectClient.getHealthConnectManageDataIntent(applicationContext)
      applicationContext.currentActivity?.startActivity(intent)
    } catch (e: Exception) {
      // Silently ignore if data management can't be opened
    }
  }`;

// --- Patch 3: getSdkStatus ---
const original3 = `  fun getSdkStatus(providerPackageName: String, promise: Promise) {
    val status = HealthConnectClient.getSdkStatus(applicationContext, providerPackageName)
    return promise.resolve(status)
  }`;
const patched3 = `  fun getSdkStatus(providerPackageName: String, promise: Promise) {
    try {
      val status = HealthConnectClient.getSdkStatus(applicationContext, providerPackageName)
      return promise.resolve(status)
    } catch (e: Exception) {
      promise.rejectWithException(e)
    }
  }`;

// --- Patch 4: requestPermission inner coroutine ---
const original4 = `          val granted = HealthConnectPermissionDelegate.launchPermissionsDialog(PermissionUtils.parsePermissions(reactPermissions))
          promise.resolve(PermissionUtils.mapPermissionResult(granted))`;
const patched4 = `        try {
          val granted = HealthConnectPermissionDelegate.launchPermissionsDialog(PermissionUtils.parsePermissions(reactPermissions))
          promise.resolve(PermissionUtils.mapPermissionResult(granted))
        } catch (e: Exception) {
          promise.rejectWithException(e)
        }`;

let patched = false;

function applyPatch(orig, repl, name) {
  if (content.includes(repl)) {
    console.log(`[patch-health-connect] ${name}: already applied, skipping.`);
    return;
  }
  if (content.includes(orig)) {
    content = content.replace(orig, repl);
    console.log(`[patch-health-connect] ${name}: applied successfully.`);
    patched = true;
  } else {
    console.log(
      `[patch-health-connect] ${name}: original not found, skipping (may already be patched or version mismatch).`,
    );
  }
}

applyPatch(original1, patched1, "openHealthConnectSettings");
applyPatch(original2, patched2, "openHealthConnectDataManagement");
applyPatch(original3, patched3, "getSdkStatus");
applyPatch(original4, patched4, "requestPermission coroutine");

if (patched) {
  fs.writeFileSync(filePath, content, "utf8");
  console.log(
    "[patch-health-connect] HealthConnectManager.kt patched successfully.",
  );
} else {
  console.log("[patch-health-connect] No changes needed.");
}
