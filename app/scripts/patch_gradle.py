"""Patch the prebuild-generated android/app/build.gradle:
 1. strip enableBundleCompression (removed in RN 0.76+, still emitted by template)
 2. inject a release signingConfig (brace-depth tracked) and use it for the release build type
Fails loudly if the expected structure is not found."""
import sys, re

path = sys.argv[1]
lines = open(path, encoding="utf-8").read().split("\n")

# 1. strip enableBundleCompression lines
lines = [l for l in lines if "enableBundleCompression" not in l]

# 2. signingConfigs.release
RELEASE_CFG = [
    "        release {",
    "            storeFile file('release.keystore')",
    "            storePassword System.getenv('KEYSTORE_PASSWORD')",
    "            keyAlias System.getenv('KEY_ALIAS')",
    "            keyPassword System.getenv('KEY_PASSWORD')",
    "        }",
]
out, injected = [], False
for l in lines:
    out.append(l)
    if not injected and re.match(r"^\s*signingConfigs\s*\{", l):
        out.extend(RELEASE_CFG)
        injected = True
if not injected:
    sys.exit("ERROR: signingConfigs block not found")
lines = out

# point buildTypes.release at the release signing config
in_bt, bt_depth, in_rel, rel_depth, replaced = False, 0, False, 0, False
for i, l in enumerate(lines):
    if not in_bt:
        if re.match(r"^\s*buildTypes\s*\{", l):
            in_bt, bt_depth = True, 1
        continue
    if not in_rel and re.match(r"^\s*release\s*\{", l):
        in_rel, rel_depth = True, 0
    if in_rel:
        if "signingConfig " in l and "signingConfigs." in l:
            lines[i] = re.sub(r"signingConfigs\.\w+", "signingConfigs.release", l)
            replaced = True
        rel_depth += l.count("{") - l.count("}")
        if rel_depth <= 0:
            in_rel = False
    bt_depth += l.count("{") - l.count("}")
    if bt_depth <= 0:
        break
if not replaced:
    sys.exit("ERROR: release signingConfig line not found in buildTypes.release")

open(path, "w", encoding="utf-8").write("\n".join(lines))
print("build.gradle patched OK")
