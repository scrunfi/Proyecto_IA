param(
  [string]$BaseUrl = "http://localhost:8000",
  [int]$BatchSize = 100,
  [bool]$OnlyMissing = $true,
  [bool]$ForceRefresh = $false,
  [int]$StartSkip = 0,
  [int]$MaxBatches = 0,
  [int]$DelaySeconds = 1
)

if ($BatchSize -le 0) {
  throw "BatchSize must be greater than 0"
}

$endpoint = "$BaseUrl/shops/ai-analysis/precompute-all"
$batch = 0
$skip = $StartSkip
$totalProcessed = 0
$totalN8n = 0
$totalFallback = 0
$totalErrors = 0

while ($true) {
  if ($MaxBatches -gt 0 -and $batch -ge $MaxBatches) {
    break
  }

  $currentSkip = if ($OnlyMissing -and -not $ForceRefresh) { 0 } else { $skip }
  $uri = "{0}?limit={1}&skip={2}&only_missing={3}&force_refresh={4}" -f $endpoint, $BatchSize, $currentSkip, $OnlyMissing.ToString().ToLowerInvariant(), $ForceRefresh.ToString().ToLowerInvariant()

  try {
    $response = Invoke-RestMethod -Uri $uri -Method POST -TimeoutSec 1800
  }
  catch {
    Write-Error "Batch $($batch + 1) failed: $($_.Exception.Message)"
    break
  }

  $processed = [int]$response.processed
  $n8nCount = [int]$response.source_breakdown.n8n
  $fallbackCount = [int]$response.source_breakdown.fallback
  $errorsCount = [int]$response.errors

  $totalProcessed += $processed
  $totalN8n += $n8nCount
  $totalFallback += $fallbackCount
  $totalErrors += $errorsCount

  $batch += 1
  Write-Host ("Batch {0}: processed={1}, n8n={2}, fallback={3}, errors={4}, total_candidates={5}" -f $batch, $processed, $n8nCount, $fallbackCount, $errorsCount, $response.total_candidates)

  if ($processed -eq 0) {
    break
  }

  if (-not ($OnlyMissing -and -not $ForceRefresh)) {
    $skip += $BatchSize
  }

  if ($DelaySeconds -gt 0) {
    Start-Sleep -Seconds $DelaySeconds
  }
}

Write-Host "Done"
Write-Host ("Batches={0}, Processed={1}, n8n={2}, fallback={3}, errors={4}" -f $batch, $totalProcessed, $totalN8n, $totalFallback, $totalErrors)
