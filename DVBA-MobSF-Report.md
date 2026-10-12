# MobSF Security Assessment Report

## 1. Assessment Details

| Field | Value |
|---|---|
| Application | DamnVulnerableBank |
| Package | `com.app.damnvulnerablebank` |
| Version | `1.0` |
| File | `dvba.apk` |
| Assessment type | MobSF static analysis |
| Main activity | `com.app.damnvulnerablebank.SplashScreen` |
| Scan date | 2026-09-21 |

## 2. Executive Summary

MobSF identified **6 high-severity findings**, **8 warnings**, and **1 informational finding**.

The highest-risk issues are:

- The application supports Android 5.0-5.0.2 (`minSdk=21`), which is no longer reasonably patched.
- Cleartext traffic is enabled globally.
- The network security configuration trusts user-installed certificates and permits cleartext traffic for all domains.
- App Link verification for `xe.com` is missing or incorrectly configured.

The exported `SendMoney` and `ViewBalance` activities should receive immediate review because other applications can invoke them directly.

## 3. Severity Summary

| Severity | Count |
|---|---:|
| High | 6 |
| Warning | 8 |
| Informational | 1 |
| Secure/positive controls | 1 |

## 4. Findings and Mitigations

### HIGH-01: Vulnerable minimum Android version

**MobSF rule:** `vulnerable_os_version`  
**Evidence:** `minSdk=21` (Android 5.0-5.0.2)  
**Impact:** The application can be installed on devices with known, unpatched platform vulnerabilities. Attackers may exploit weaknesses in the operating system or obsolete platform behavior.

**Mitigation:**

- Raise `minSdk` to at least API 29 (Android 10), or to the minimum version currently supported by the product security policy.
- Review all third-party libraries for the same minimum SDK requirement.
- Reject unsupported devices during release validation and document the supported Android baseline.

### HIGH-02: Cleartext traffic enabled in the manifest

**MobSF rule:** `clear_text_traffic`  
**Evidence:** `android:usesCleartextTraffic=true`  
**Impact:** HTTP and other cleartext connections can be intercepted or modified by a network attacker. Credentials, tokens, and transaction data may be exposed or altered.

**Mitigation:**

- Set `android:usesCleartextTraffic="false"`.
- Use HTTPS for every application endpoint, including redirects, APIs, downloads, and WebViews.
- Add a Network Security Config that denies cleartext traffic by default.
- Permit an exception only for a documented development endpoint, never in production builds.

### HIGH-03: Missing App Link verification for HTTP `xe.com`

**MobSF rule:** `well_known_assetlinks`  
**Evidence:** `com.app.damnvulnerablebank.CurrencyRates`; `http://xe.com`; asset verification returned HTTP 301  
**Impact:** An unverified link can be claimed by another application. This can enable phishing or interception of sensitive URI data such as account recovery tokens.

**Mitigation:**

- Prefer HTTPS App Links and remove the HTTP intent filter.
- Host a valid `https://xe.com/.well-known/assetlinks.json` file containing the app package name and the SHA-256 fingerprint of the release signing certificate.
- Add `android:autoVerify="true"` to the intended App Link filter.
- Verify the link on a clean device after every signing-key or domain change.

### HIGH-04: Missing App Link verification for HTTPS `xe.com`

**MobSF rule:** `well_known_assetlinks`  
**Evidence:** `com.app.damnvulnerablebank.CurrencyRates`; `https://xe.com`; asset verification returned HTTP 403  
**Impact:** The Android system cannot confirm that this application owns the domain. Another application may register the same links and receive sensitive data.

**Mitigation:**

- Configure the domain to serve the `assetlinks.json` file without authentication or blocking verification clients.
- Ensure the JSON uses the production package name and release certificate fingerprint.
- Test with Android App Links verification tools and remove the link if domain ownership cannot be established.

### HIGH-05: Network Security Config permits cleartext traffic globally

**MobSF category:** Network Security  
**Evidence:** Base configuration scope `*`; cleartext traffic permitted to all domains  
**Impact:** The global policy undermines transport confidentiality and allows accidental or malicious HTTP connections anywhere in the application.

**Mitigation:**

Use a restrictive configuration similar to:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="false" />
</network-security-config>
```

Only add narrowly scoped domain configurations when a documented legacy integration requires them.

### HIGH-06: Network Security Config trusts user-installed certificates

**MobSF category:** Network Security  
**Evidence:** Base configuration scope `*`; user-installed certificates are trusted  
**Impact:** On a compromised device or a device with a malicious user certificate installed, an attacker may intercept TLS traffic using a locally trusted certificate.

**Mitigation:**

- Remove trust for user-installed certificates in release builds.
- Use system trust anchors only unless a business requirement is formally approved.
- Consider certificate pinning for high-value API hosts, with a tested backup pin and an operational rotation plan.
- Never disable certificate validation or hostname verification.

### WARNING-01: Application data can be backed up with ADB

**MobSF rule:** `app_allowbackup`  
**Evidence:** `android:allowBackup=true`  
**Impact:** A user with USB debugging access may copy application data from the device. Tokens, cached records, or local databases may be exposed.

**Mitigation:**

- Set `android:allowBackup="false"` unless backup is explicitly required.
- For Android versions that support it, also configure `android:dataExtractionRules` to exclude sensitive data from cloud and device transfers.
- Store authentication tokens and sensitive records in appropriate protected storage and avoid plaintext caches.

### WARNING-02: `CurrencyRates` activity is exported without protection

**MobSF rule:** `exported_intent_filter_exists`  
**Evidence:** `com.app.damnvulnerablebank.CurrencyRates` has an intent filter and is accessible to other applications  
**Impact:** Any installed application may invoke the activity and reach code paths without the expected in-app navigation or authorization checks.

**Mitigation:**

- Set `android:exported="false"` if external invocation is not required.
- If external invocation is required, protect the activity with a signature-level permission.
- Enforce authentication and authorization inside the activity; do not rely only on the caller.
- Validate all incoming Intent actions, extras, and URIs.

### WARNING-03: `SendMoney` activity is explicitly exported

**MobSF rule:** `explicitly_exported`  
**Evidence:** `com.app.damnvulnerablebank.SendMoney` has `android:exported=true`  
**Impact:** Other applications can attempt to launch a money-transfer screen or manipulate its input flow. This may enable unauthorized actions if authorization is only enforced in the UI flow.

**Mitigation:**

- Change to `android:exported="false"` unless a verified external integration needs it.
- Require a signature-level permission for any intentional external access.
- Re-authenticate and authorize the account and transaction server-side before executing transfers.
- Reject untrusted or malformed Intent extras.

### WARNING-04: `ViewBalance` activity is explicitly exported

**MobSF rule:** `explicitly_exported`  
**Evidence:** `com.app.damnvulnerablebank.ViewBalance` has `android:exported=true`  
**Impact:** Other applications may invoke the activity and potentially access balance-related data or bypass the normal authenticated navigation path.

**Mitigation:**

- Set `android:exported="false"` when external access is unnecessary.
- Enforce session validity and authorization at activity entry and in the backend API.
- Use a signature-level permission if another first-party application must launch it.
- Do not place sensitive account data in exported Intent extras.

### WARNING-05: Biometric credential activity is exported

**MobSF rule:** `explicitly_exported`  
**Evidence:** `androidx.biometric.DeviceCredentialHandlerActivity` has `android:exported=true`  
**Impact:** An exported authentication-related component can increase attack surface if it is directly reachable or if the library configuration is outdated.

**Mitigation:**

- Confirm this component is required by the exact AndroidX Biometric version in use.
- Upgrade AndroidX Biometric to a current supported release.
- Do not export custom authentication activities unnecessarily.
- Ensure sensitive operations require a fresh, correctly scoped biometric or device-credential result.

### WARNING-06: Firebase federated sign-in permission protection is not defined locally

**MobSF rule:** `exported_protected_permission_not_defined`  
**Evidence:** `com.google.firebase.auth.internal.FederatedSignInActivity`; permission `com.google.firebase.auth.api.gms.permission.LAUNCH_FEDERATED_SIGN_IN`  
**Impact:** If the permission is declared as `normal` or `dangerous` by its owner, another application may obtain it and interact with the exported component.

**Mitigation:**

- Keep Firebase Authentication and Google Play services dependencies current.
- Confirm the permission is signature-level and supplied only by the expected trusted component.
- Do not create custom exported components around the Firebase sign-in flow.
- Test component access from an unrelated application on a test device.

### WARNING-07: Application can read and write external storage

**MobSF rule:** `android_read_write_external`  
**Evidence:** `com/app/damnvulnerablebank/MainActivity.java:175`  
**Impact:** Data written to shared external storage may be readable or modified by other applications or users. This can expose reports, tokens, files, or transaction data.

**Mitigation:**

- Use internal app storage for sensitive files.
- Use scoped storage and the Storage Access Framework for user-selected documents.
- Encrypt sensitive files before writing them outside private storage.
- Do not store credentials, session tokens, or unencrypted financial data on shared storage.

### WARNING-08: Network Security Config trusts system certificates globally

**MobSF category:** Network Security  
**Evidence:** Base configuration scope `*`; system certificates trusted  
**Impact:** This is normally expected for standard HTTPS, but trusting the full system store increases the trust surface for all domains. Combined with the other network findings, it warrants explicit configuration review.

**Mitigation:**

- Keep system trust only where required for normal HTTPS operation.
- Restrict trust anchors by domain for high-value APIs when practical.
- Combine this with disabled cleartext traffic, hostname verification, and tested certificate pinning for sensitive endpoints.

### INFO-01: Sensitive information may be written to logs

**MobSF rule:** `android_logging`  
**Evidence:** `BankLogin.java:44`, `MainActivity.java:94,198,201`, plus library/decompiled sources  
**Impact:** Logs may be readable through debugging, device tooling, crash collection, or compromised devices. Sensitive credentials, tokens, personal data, or transaction details must not appear in logs.

**Mitigation:**

- Remove logging of passwords, tokens, account data, API responses, and authentication details.
- Use a release logger that strips or disables debug logs.
- Apply structured redaction to exception messages and network logs.
- Review third-party logging and crash-reporting configuration.

## 5. Positive Control

MobSF detected possible root-detection or anti-tampering capability (`MSTG-RESILIENCE-1`). This is not a vulnerability. Treat it only as a defense-in-depth control: root detection must not replace server-side authorization, secure storage, TLS validation, or fraud monitoring.

## 6. Additional Observations

The APK contains references to:

- `https://www.xe.com/`
- `http://localhost`
- `https://plus.google.com/`
- Android framework schema URLs

The `http://localhost` reference should be reviewed to ensure it is not enabled or reachable in production builds. The `xe.com` App Link configuration should be validated against the application's intended domain ownership.

## 7. Recommended Remediation Order

1. Disable cleartext traffic and remove trust for user-installed certificates.
2. Protect or make non-exported `SendMoney`, `ViewBalance`, and `CurrencyRates` activities.
3. Fix HTTPS App Link ownership and remove the HTTP App Link.
4. Raise the minimum supported Android version.
5. Disable backups or exclude all sensitive data from backups.
6. Remove external-storage use for sensitive data.
7. Remove sensitive logging and review release logging configuration.
8. Rebuild and rerun MobSF, then verify the findings on a clean device.
