<# 
Daily safety sync for the StoryGenerator repo.

Behaviour (per Lyra's spec):
1) If there are NO uncommitted changes (git status --porcelain is empty) -> exit, do nothing.
2) npm run build; if it fails -> stop (no commit/push).
3) git pull --rebase origin main; if it fails/conflicts -> stop (no push).
4) git add -A
5) Commit: "chore: daily sync YYYY-MM-DD" where date is TODAY in London time; if nothing to commit -> exit.
6) git push origin main

Non-interactive: if auth is required, git should fail and this script will stop with the error output.
#>

[CmdletBinding()]
param(
  [string] $Remote = "origin",
  [string] $Branch = "main"
)

$ErrorActionPreference = "Stop"

function Assert-LastExitCode {
  param(
    [Parameter(Mandatory=$true)][string] $StepName
  )
  if ($LASTEXITCODE -ne 0) {
    throw "$StepName failed (exit code: $LASTEXITCODE)."
  }
}

# Ensure git never prompts (e.g., for credentials).
$env:GIT_TERMINAL_PROMPT = "0"

# Helps some tooling behave non-interactively.
$env:CI = "1"

# Script lives in StoryGenerator/scripts; repo root is StoryGenerator/
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

Write-Host "Repo: $repoRoot"

Write-Host "Step 1/6: Checking for uncommitted changes..."
$status = & git -C $repoRoot status --porcelain
Assert-LastExitCode "git status"

if ([string]::IsNullOrWhiteSpace($status)) {
  Write-Host "Working tree clean; exiting without doing anything."
  exit 0
}

Write-Host "Step 2/6: npm run build..."
Push-Location $repoRoot
try {
  & npm run build
  Assert-LastExitCode "npm run build"
} finally {
  Pop-Location
}

Write-Host "Step 3/6: git pull --rebase $Remote $Branch..."
& git -C $repoRoot pull --rebase $Remote $Branch
Assert-LastExitCode "git pull --rebase"

Write-Host "Step 4/6: git add -A..."
& git -C $repoRoot add -A
Assert-LastExitCode "git add -A"

Write-Host "Step 5/6: committing (if needed)..."
& git -C $repoRoot diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host "No staged changes to commit; exiting."
  exit 0
}

$tz = [TimeZoneInfo]::FindSystemTimeZoneById("GMT Standard Time") # London (handles DST correctly on Windows)
$londonNow = [TimeZoneInfo]::ConvertTimeFromUtc((Get-Date).ToUniversalTime(), $tz)
$dateStr = $londonNow.ToString("yyyy-MM-dd")
$commitMsg = "chore: daily sync $dateStr"

& git -C $repoRoot commit -m $commitMsg
Assert-LastExitCode "git commit"

Write-Host "Step 6/6: git push $Remote $Branch..."
& git -C $repoRoot push $Remote $Branch
Assert-LastExitCode "git push"

Write-Host "Daily safety sync complete."

