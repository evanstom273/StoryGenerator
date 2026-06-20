# Debug Session: job-cancel-timeout [OPEN]

## Symptom
- Completed / failed / cancelled jobs stick around in the Story Settings job list indefinitely.
- Cancelling an indexing job does not reliably stop work; user still sees timeouts / failures.

## Expected
- Finished jobs auto-expire after a grace period (or keep only last N).
- Cancel stops the in-flight work promptly and the job ends as `cancelled` (not `failed`).

## Hypotheses
1. Cancel sets DB status to `cancelled`, but the running async indexing loop does not receive/observe an abort signal quickly enough, so it continues and later throws a timeout.
2. Provider calls inside deep indexing do not accept an external `AbortSignal`, so cancelling cannot interrupt in-flight network requests (only future steps).
3. A race exists: job runner writes `running` after the UI marks `cancelled`, or overwrites status on completion/error.
4. No cleanup/retention policy exists for backgroundJobs, so terminal states never get removed.
5. Android/WebView networking differs (long requests more likely to timeout), amplifying the above.

## Evidence Plan
- Instrument: job state transitions, abort signal propagation, and the exact stage where timeout occurs.
- Reproduce on web (same code path) to collect logs; then apply minimal fix and verify.

## Status
- [OPEN]
