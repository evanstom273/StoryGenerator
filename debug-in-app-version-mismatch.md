# Debug Session: in-app-version-mismatch [OPEN]

## Symptom
- APK filename and Android package version show **1.18.3**
- In-app UI still displays **1.18.2**

## Hypotheses
1. UI version label is hardcoded to `1.18.2` in a visible component.
2. UI is showing a persisted changelog selection rather than current app version.
3. Android is serving cached 1.18.2 web assets (service worker / WebView cache), even inside a 1.18.3 APK.
4. UI uses a different version source than Android `versionName` / `APP_VERSION`.

## Plan
- Locate the UI element that displays the version.
- Instrument that render path to report: displayed text + `APP_VERSION` + any persisted selection.
- Reproduce in local web build (since Android cannot reach localhost debug collector).
- Apply minimal fix once confirmed.

## Status
- [OPEN]
