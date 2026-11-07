[#] [OPEN] Debug Session: archive-pdf-no-op

## Symptom
- On Android (Capacitor APK), tapping **Archive PDF** results in "nothing" (no share sheet, no file, no visible error).

## Expected
- Tapping **Archive PDF** should either:
  - Show progress text (checking index / indexing / generating), then open Android share sheet, OR
  - Show a visible error message if export fails.

## Hypotheses (falsifiable)
1. The tap handler is not firing (UI overlay / disabled / wrong component path on Android).
2. The handler fires but stalls on pre-export steps (fetchStoryState / re-index / exportStory bundle assembly).
3. PDF generation stalls or throws (jsPDF output / memory pressure / large transcript) and the error is not surfaced in the UI.
4. `downloadFile()` reaches native path but `Filesystem.writeFile` or `Share.share` fails, and failure is swallowed or not displayed.
5. Export succeeds but share sheet opens with a bad URI/mime/filename and silently fails on some Android versions.

## Instrumentation Plan
- Add runtime event reporting (HTTP) at these checkpoints:
  - Archive PDF click start
  - Index freshness decision
  - Bundle assembled
  - PDF serialized (byte length)
  - Native download path: writeFile + share start + share result/cancel/error

## Repro Plan (Android)
- Connect phone via USB (debugging enabled).
- Run: `adb reverse tcp:7777 tcp:7777`
- Tap **Archive PDF** again and capture logs from the debug server.

## Notes
- Debug server endpoint: `http://127.0.0.1:7777/event` (device-side localhost via adb reverse).

