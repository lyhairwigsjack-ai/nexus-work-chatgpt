$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  function New-Secret {
    $bytes = New-Object byte[] 32
    $rng.GetBytes($bytes)
    [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
  }

  Write-Host "NEXUS_SYNC_TOKEN=$(New-Secret)"
  Write-Host "NEXUS_APP_KEY=$(New-Secret)"
} finally {
  $rng.Dispose()
}
