param(
  [string]$EDGE_URL = $(if ($env:EDGE_URL) { $env:EDGE_URL } else { "https://unybqqzhgqxhrwucrofm.supabase.co/functions/v1/lead-intake" }),
  [string]$SLUG = $(if ($env:SLUG) { $env:SLUG } else { "dentalpro" }),
  [string]$TOKEN = $(if ($env:TOKEN) { $env:TOKEN } else { "TOKEN_PUBLICO" }),
  [string]$LANDING_ORIGIN = $(if ($env:LANDING_ORIGIN) { $env:LANDING_ORIGIN } elseif ($env:ORIGIN) { $env:ORIGIN } else { "https://sistema-dental-py.vercel.app" }),
  [int]$BatchSize = 10,
  [int]$PauseAfterBatchSeconds = 610
)

if ($TOKEN -eq "TOKEN_PUBLICO") {
  throw "Configura TOKEN con un landing_token real antes de ejecutar: `$env:TOKEN='lf_...'; .\tests\load-30-leads.ps1"
}

if ($LANDING_ORIGIN.EndsWith("/")) {
  throw "LANDING_ORIGIN debe ir sin slash final. Usa https://sistema-dental-py.vercel.app"
}

$success = 0
$failed = 0
$runId = Get-Random -Minimum 100 -Maximum 999

1..30 | ForEach-Object {
  $suffix = $_.ToString("000")
  $phone = "0981$runId$($_.ToString('000'))"
  $body = @{
    clinic_slug = $SLUG
    landing_token = $TOKEN
    nombre = "LOAD Test Carga $suffix"
    telefono = $phone
    tratamiento = if ($_ % 3 -eq 0) { "Implante dental" } elseif ($_ % 3 -eq 1) { "Ortodoncia / brackets" } else { "Consulta general" }
    urgencia = if ($_ % 2 -eq 0) { "Hoy" } else { "Esta semana" }
    evaluacion_previa = "No"
    situacion = "Quiero agendar una consulta"
    consultation_reason = "Carga controlada 30 leads"
    origen = "tests/load-30-leads.ps1"
    pagina = "load-test"
    consentimiento_contacto = $true
  }

  $json = $body | ConvertTo-Json -Depth 10
  $ip = "198.51.100.$_"
  Write-Host "Enviando lead $suffix"

  try {
    $response = Invoke-WebRequest `
      -Method Post `
      -Uri $EDGE_URL `
      -ContentType "application/json" `
      -Headers @{ "X-Forwarded-For" = $ip; "Origin" = $LANDING_ORIGIN } `
      -Body $json `
      -UseBasicParsing

    $statusCode = [int]$response.StatusCode
    $content = $response.Content
  } catch {
    $response = $_.Exception.Response
    $statusCode = if ($response) { [int]$response.StatusCode } else { 0 }
    $content = $_.Exception.Message
    if ($response) {
      try {
        $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
        $content = $reader.ReadToEnd()
      } catch {
        $content = ""
      }
    }
  }

  if ($statusCode -eq 200) {
    $success += 1
  } else {
    $failed += 1
    Write-Host "Fallo lead $suffix - HTTP $($statusCode): $content" -ForegroundColor Red
  }

  if ($_ -lt 30 -and ($_ % $BatchSize) -eq 0) {
    Write-Host "Pausa de $PauseAfterBatchSeconds segundos para respetar rate limit por IP/formulario."
    Start-Sleep -Seconds $PauseAfterBatchSeconds
  } else {
    Start-Sleep -Milliseconds 150
  }
}

Write-Host "Resultado carga: $success exitosos, $failed fallidos"
if ($success -ne 30) {
  exit 1
}
