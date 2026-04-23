const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
</network-security-config>
`;

function withNetworkSecurityConfig(config) {
  // Step 1: Write network_security_config.xml to res/xml/
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const xmlDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "res",
        "xml"
      );
      fs.mkdirSync(xmlDir, { recursive: true });
      fs.writeFileSync(
        path.join(xmlDir, "network_security_config.xml"),
        NETWORK_SECURITY_CONFIG
      );
      console.log(
        "[withNetworkSecurityConfig] Created network_security_config.xml allowing cleartext HTTP"
      );
      return config;
    },
  ]);

  // Step 2: Reference it in AndroidManifest <application>
  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application[0];
    application.$["android:networkSecurityConfig"] =
      "@xml/network_security_config";
    console.log(
      "[withNetworkSecurityConfig] Added networkSecurityConfig to AndroidManifest"
    );
    return config;
  });

  return config;
}

module.exports = withNetworkSecurityConfig;
