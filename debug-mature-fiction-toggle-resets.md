# Debug Session: mature-fiction-toggle-resets
- **Status**: [OPEN]
- **Issue**: Story setting “Mature fiction (non-graphic)” flips on then reverts to off.
- **Debug Server**: http://127.0.0.1:<port>/event
- **Log File**: .dbg/trae-debug-log-mature-fiction-toggle-resets.ndjson

## Reproduction Steps
1. Open any story.
2. Open Story Settings.
3. Set “Mature fiction (non-graphic)” to On.
4. Observe it reverting to Off.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | `updateStory()` drops `matureFictionMode` when persisting patch (field not included in sanitization/serialization). | High | Low | Pending |
| B | `updateStory()` fails and the UI swallows the error, then state is reset from the unchanged story object. | Med | Low | Pending |
| C | The story record is saved with `matureFictionMode`, but is lost when reloaded from storage (migration/schema omits it). | Med | Med | Pending |
| D | A competing state update overwrites the story record shortly after save (race between debounced update and another write). | Low | Med | Pending |

## Log Evidence
[Key log entries]

## Verification Conclusion
[Pre-fix vs post-fix comparison]

