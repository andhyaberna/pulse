[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$Cleanup,
  [string]$RepoRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
  param(
    [Parameter(Mandatory = $true)]
    [string]$StartPath
  )

  $current = [System.IO.Path]::GetFullPath($StartPath)
  if (-not (Test-Path -LiteralPath $current)) {
    throw "Start path not found: $StartPath"
  }

  while ($true) {
    if (Test-Path -LiteralPath (Join-Path $current '.git')) {
      return $current
    }

    $parent = Split-Path -Path $current -Parent
    if ([string]::IsNullOrWhiteSpace($parent) -or $parent -eq $current) {
      break
    }

    $current = $parent
  }

  throw "Unable to locate git repository root from: $StartPath"
}

function Get-JsoncObject {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
  $withoutBlockComments = [regex]::Replace($raw, '(?s)/\*.*?\*/', '')
  $lines = $withoutBlockComments -split "`r?`n"
  $cleanLines = foreach ($line in $lines) {
    if ($line -match '^\s*//') {
      continue
    }

    $trimmed = [regex]::Replace($line, '\s*//.*$', '')
    if (-not [string]::IsNullOrWhiteSpace($trimmed)) {
      $trimmed
    }
  }

  $json = ($cleanLines -join [Environment]::NewLine).Trim()
  if ([string]::IsNullOrWhiteSpace($json)) {
    return $null
  }

  return $json | ConvertFrom-Json
}

function Merge-Object {
  param(
    [Parameter(Mandatory = $true)]
    $Base,
    [Parameter(Mandatory = $true)]
    $Overlay
  )

  $result = @{}
  foreach ($key in $Base.PSObject.Properties.Name) {
    $value = $Base.$key
    if ($value -is [System.Collections.IDictionary]) {
      $nested = @{}
      foreach ($nestedKey in $value.Keys) {
        $nested[$nestedKey] = $value[$nestedKey]
      }
      $result[$key] = $nested
    }
    elseif ($value -is [System.Array]) {
      $result[$key] = @($value)
    }
    else {
      $result[$key] = $value
    }
  }

  foreach ($key in $Overlay.PSObject.Properties.Name) {
    $value = $Overlay.$key
    if ($result.ContainsKey($key) -and $result[$key] -is [System.Collections.IDictionary] -and $value -is [System.Collections.IDictionary]) {
      $nested = @{}
      foreach ($nestedKey in $result[$key].Keys) {
        $nested[$nestedKey] = $result[$key][$nestedKey]
      }
      foreach ($nestedKey in $value.Keys) {
        $nested[$nestedKey] = $value[$nestedKey]
      }
      $result[$key] = $nested
      continue
    }

    $result[$key] = $value
  }

  return [pscustomobject]$result
}

function Resolve-WorkspacePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,
    [Parameter(Mandatory = $true)]
    [string]$RelativePath
  )

  $fullRoot = [System.IO.Path]::GetFullPath($Root)
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $fullRoot $RelativePath))
  $rootPrefix = $fullRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

  if (-not $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase) -and
      -not $candidate.Equals($fullRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to operate outside repo root: $RelativePath"
  }

  return $candidate
}

function Invoke-Git {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,
    [Parameter(Mandatory = $true)]
    [string[]]$Args
  )

  & git -C $Root @Args
}

function Split-GitStatus {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Lines
  )

  $result = [ordered]@{
    BranchLine = $null
    Modified   = @()
    Untracked  = @()
    Ignored    = @()
  }

  foreach ($line in $Lines) {
    if ([string]::IsNullOrWhiteSpace($line)) {
      continue
    }

    if ($line.StartsWith('##')) {
      $result.BranchLine = $line
      continue
    }

    if ($line.StartsWith('?? ')) {
      $result.Untracked += $line.Substring(3)
      continue
    }

    if ($line.StartsWith('!! ')) {
      $result.Ignored += $line.Substring(3)
      continue
    }

    if ($line.Length -ge 4) {
      $result.Modified += $line.Substring(3)
    }
  }

  return [pscustomobject]$result
}

function Get-PressurePercent {
  param(
    [Parameter(Mandatory = $true)]
    [int]$TrackedSignals,
    [Parameter(Mandatory = $true)]
    [int]$MaxTrackedSignals
  )

  $safeMax = [math]::Max(1, $MaxTrackedSignals)
  $ratio = [math]::Min(1.0, $TrackedSignals / [double]$safeMax)
  return [int][math]::Round($ratio * 100, 0)
}

$scriptRoot = if ($PSScriptRoot) { $PSScriptRoot } else { Get-Location }
$resolvedRepoRoot = if ($RepoRoot) { Get-RepoRoot -StartPath $RepoRoot } else { Get-RepoRoot -StartPath $scriptRoot }
$configPath = Join-Path $resolvedRepoRoot 'dcp.jsonc'
$rawConfig = Get-JsoncObject -Path $configPath

$defaultConfig = [pscustomobject]@{
  workspace = [pscustomobject]@{
    name = 'meta_ads_internal_app'
    root = '.'
  }
  contextBudget = [pscustomobject]@{
    hotContextTarget   = 0.5
    hotContextWarning  = 0.65
    hotContextCritical = 0.8
    maxTrackedSignals  = 10
  }
  watchdog = [pscustomobject]@{
    signals = @(
      'git status --short --branch',
      'git diff --stat',
      'git status --ignored --short'
    )
    safeCleanupPaths = @(
      'apps_script/node_modules',
      'cloudflare_worker/node_modules',
      'cloudflare_worker/.wrangler'
    )
    reviewOnlyPaths = @(
      'apps_script/.clasp.json'
    )
  }
}

$config = if ($null -ne $rawConfig) { Merge-Object -Base $defaultConfig -Overlay $rawConfig } else { $defaultConfig }

$statusLines = @(Invoke-Git -Root $resolvedRepoRoot -Args @('status', '--short', '--branch'))
$ignoredStatusLines = @(Invoke-Git -Root $resolvedRepoRoot -Args @('status', '--ignored', '--short'))
$diffStatLines = @(Invoke-Git -Root $resolvedRepoRoot -Args @('diff', '--stat'))

$status = Split-GitStatus -Lines $ignoredStatusLines
$branch = $status.BranchLine
if ([string]::IsNullOrWhiteSpace($branch) -and $statusLines.Count -gt 0) {
  $branch = $statusLines[0]
}

$safeCleanupPaths = @($config.watchdog.safeCleanupPaths)
$reviewOnlyPaths = @($config.watchdog.reviewOnlyPaths)
$safeCleanupCandidates = foreach ($relativePath in $safeCleanupPaths) {
  $candidate = Resolve-WorkspacePath -Root $resolvedRepoRoot -RelativePath $relativePath
  if (Test-Path -LiteralPath $candidate) {
    [pscustomobject]@{
      RelativePath = $relativePath
      FullPath     = $candidate
    }
  }
}
$reviewOnlyArtifacts = foreach ($relativePath in $reviewOnlyPaths) {
  $candidate = Resolve-WorkspacePath -Root $resolvedRepoRoot -RelativePath $relativePath
  if (Test-Path -LiteralPath $candidate) {
    [pscustomobject]@{
      RelativePath = $relativePath
      FullPath     = $candidate
    }
  }
}
$generatedArtifacts = @($safeCleanupCandidates) + @($reviewOnlyArtifacts)

$trackedSignals = @($status.Modified).Count + @($status.Untracked).Count + @($generatedArtifacts).Count
$pressurePercent = Get-PressurePercent -TrackedSignals $trackedSignals -MaxTrackedSignals $config.contextBudget.maxTrackedSignals

$warningThreshold = [int][math]::Round(([double]$config.contextBudget.hotContextWarning) * 100, 0)
$targetThreshold = [int][math]::Round(([double]$config.contextBudget.hotContextTarget) * 100, 0)
$criticalThreshold = [int][math]::Round(([double]$config.contextBudget.hotContextCritical) * 100, 0)

$recommendedAction = if ($pressurePercent -ge $criticalThreshold) {
  'Trim generated artifacts and compress active context before taking on more work.'
}
elseif ($pressurePercent -ge $warningThreshold) {
  'Stay inside the current scope and avoid spawning extra work until the workspace is trimmed.'
}
elseif ($pressurePercent -ge $targetThreshold) {
  'Compress hot context now and avoid adding new workspace signals if you can defer them.'
}
else {
  'Continue with the current scope and keep cleanup optional.'
}

$cleanupResults = @()
if ($Cleanup) {
  foreach ($relativePath in $safeCleanupPaths) {
    $candidate = Resolve-WorkspacePath -Root $resolvedRepoRoot -RelativePath $relativePath
    if (-not (Test-Path -LiteralPath $candidate)) {
      $cleanupResults += [pscustomobject]@{
        RelativePath = $relativePath
        Removed      = $false
        Reason       = 'Not present'
      }
      continue
    }

    if ($PSCmdlet.ShouldProcess($candidate, 'Remove generated artifact')) {
      Remove-Item -LiteralPath $candidate -Recurse -Force
      $cleanupResults += [pscustomobject]@{
        RelativePath = $relativePath
        Removed      = $true
        Reason       = 'Removed'
      }
    }
  }

  $statusLines = @(Invoke-Git -Root $resolvedRepoRoot -Args @('status', '--short', '--branch'))
  $ignoredStatusLines = @(Invoke-Git -Root $resolvedRepoRoot -Args @('status', '--ignored', '--short'))
  $diffStatLines = @(Invoke-Git -Root $resolvedRepoRoot -Args @('diff', '--stat'))
  $status = Split-GitStatus -Lines $ignoredStatusLines
  $safeCleanupCandidates = foreach ($relativePath in $safeCleanupPaths) {
    $candidate = Resolve-WorkspacePath -Root $resolvedRepoRoot -RelativePath $relativePath
    if (Test-Path -LiteralPath $candidate) {
      [pscustomobject]@{
        RelativePath = $relativePath
        FullPath     = $candidate
      }
    }
  }
  $reviewOnlyArtifacts = foreach ($relativePath in $reviewOnlyPaths) {
    $candidate = Resolve-WorkspacePath -Root $resolvedRepoRoot -RelativePath $relativePath
    if (Test-Path -LiteralPath $candidate) {
      [pscustomobject]@{
        RelativePath = $relativePath
        FullPath     = $candidate
      }
    }
  }
  $generatedArtifacts = @($safeCleanupCandidates) + @($reviewOnlyArtifacts)
  $trackedSignals = @($status.Modified).Count + @($status.Untracked).Count + @($generatedArtifacts).Count
  $pressurePercent = Get-PressurePercent -TrackedSignals $trackedSignals -MaxTrackedSignals $config.contextBudget.maxTrackedSignals
  $recommendedAction = if ($pressurePercent -ge $criticalThreshold) {
    'Trim generated artifacts and compress active context before taking on more work.'
  }
  elseif ($pressurePercent -ge $warningThreshold) {
    'Stay inside the current scope and avoid spawning extra work until the workspace is trimmed.'
  }
  elseif ($pressurePercent -ge $targetThreshold) {
    'Compress hot context now and avoid adding new workspace signals if you can defer them.'
  }
  else {
    'Continue with the current scope and keep cleanup optional.'
  }
}

$summary = [pscustomobject]@{
  RepoRoot = $resolvedRepoRoot
  Branch   = $branch
  Config   = [pscustomobject]@{
    HotContextTarget   = $config.contextBudget.hotContextTarget
    HotContextWarning  = $config.contextBudget.hotContextWarning
    HotContextCritical = $config.contextBudget.hotContextCritical
    MaxTrackedSignals  = $config.contextBudget.maxTrackedSignals
  }
  ContextPressureProxyPercent = $pressurePercent
  ContextPressureTargetPercent = $targetThreshold
  ContextPressureNote = 'Approximate workspace proxy only; this is not a model token meter.'
  GitState = [pscustomobject]@{
    ModifiedCount  = @($status.Modified).Count
    UntrackedCount = @($status.Untracked).Count
    IgnoredCount   = @($status.Ignored).Count
    DiffStat       = $diffStatLines
  }
  ActiveFiles = @($status.Modified)
  UntrackedFiles = @($status.Untracked)
  IgnoredFiles = @($status.Ignored)
  GeneratedArtifacts = @($generatedArtifacts)
  SafeCleanupCandidates = @($safeCleanupCandidates)
  ReviewOnlyArtifacts = @($reviewOnlyArtifacts)
  RecommendedAction = $recommendedAction
  CleanupPerformed = [bool]$Cleanup
  CleanupResults = @($cleanupResults)
  Signals = @($config.watchdog.signals)
}

$summary
