param(
  [string]$EDGE_URL = $(if ($env:EDGE_URL) { $env:EDGE_URL } else { "https://kfpdworxksqofipmjijz.supabase.co/functions/v1/lead-intake" }),
  [string]$SLUG = $(if ($env:SLUG) { $env:SLUG } else { "dentalpro" }),
  [string]$TOKEN = $(if ($env:TOKEN) { $env:TOKEN } else { "TOKEN_PUBLICO" }),
  [string]$ORIGIN = $(if ($env:ORIGIN) { $env:ORIGIN } else { "http://localhost:5173" })
)

if ($TOKEN -eq "TOKEN_PUBLICO") {
  throw "Configura TOKEN con un landing_token real antes de ejecutar: `$env:TOKEN='lf_...'; .\tests\lead-intake-test.ps1"
}

$script:Passed = 0
$script:Failed = 0
$script:PhoneSeed = Get-Random -Minimum 100000 -Maximum 899999
$script:IpSeed = Get-Random -Minimum 10 -Maximum 180

function New-TestPhone {
  $script:PhoneSeed += 1
  return "0981$($script:PhoneSeed.ToString('000000'))"
}

function New-TestIp {
  $script:IpSeed += 1
  return "203.0.113.$($script:IpSeed % 250)"
}

function Invoke-LeadIntake {
  param(
    [hashtable]$Body,
    [string]$Ip = $(New-TestIp)
  )

  $json = $Body | ConvertTo-Json -Depth 10
  try {
    $response = Invoke-WebRequest `
      -Method Post `
      -Uri $EDGE_URL `
      -ContentType "application/json" `
      -Headers @{ "X-Forwarded-For" = $Ip; "Origin" = $ORIGIN } `
      -Body $json `
      -UseBasicParsing

    return Convert-HttpResult -Response $response
  } catch {
    return Convert-HttpError -ErrorRecord $_
  }
}

function Convert-HttpResult {
  param([object]$Response)

  $data = $null
  if ($Response.Content) {
    try {
      $data = $Response.Content | ConvertFrom-Json
    } catch {
      $data = $null
    }
  }

  return [pscustomobject]@{
    StatusCode = [int]$Response.StatusCode
    Data = $data
    Raw = $Response.Content
  }
}

function Convert-HttpError {
  param([object]$ErrorRecord)

  $response = $ErrorRecord.Exception.Response
  if (-not $response) {
    return [pscustomobject]@{
      StatusCode = 0
      Data = $null
      Raw = $ErrorRecord.Exception.Message
    }
  }

  $statusCode = [int]$response.StatusCode
  $content = ""
  try {
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $content = $reader.ReadToEnd()
  } catch {
    $content = ""
  }

  $data = $null
  if ($content) {
    try {
      $data = $content | ConvertFrom-Json
    } catch {
      $data = $null
    }
  }

  return [pscustomobject]@{
    StatusCode = $statusCode
    Data = $data
    Raw = $content
  }
}

function Assert-True {
  param(
    [string]$Name,
    [bool]$Condition,
    [string]$Detail = ""
  )

  if ($Condition) {
    $script:Passed += 1
    Write-Host "PASS - $Name"
    return
  }

  $script:Failed += 1
  Write-Host "FAIL - $Name $Detail" -ForegroundColor Red
}

function Assert-Status {
  param(
    [string]$Name,
    [object]$Result,
    [int]$Expected
  )

  Assert-True -Name $Name -Condition ($Result.StatusCode -eq $Expected) -Detail "Esperado $Expected, obtuvo $($Result.StatusCode): $($Result.Raw)"
}

function New-BaseLead {
  param(
    [string]$Phone = $(New-TestPhone),
    [string]$Treatment = "Implante dental",
    [string]$Urgency = "Hoy",
    [string]$Evaluation = "Tengo estudios / radiografia",
    [string]$Situation = "Quiero agendar una consulta",
    [string]$Name = "Lead Test QA"
  )

  return @{
    clinic_slug = $SLUG
    landing_token = $TOKEN
    nombre = $Name
    telefono = $Phone
    tratamiento = $Treatment
    urgencia = $Urgency
    evaluacion_previa = $Evaluation
    situacion = $Situation
    consultation_reason = "Test automatizado"
    origen = "tests/lead-intake-test.ps1"
    pagina = "test"
  }
}

Write-Host "1. Token correcto"
$ok = Invoke-LeadIntake -Body (New-BaseLead)
Assert-Status "token correcto devuelve 200" $ok 200
Assert-True "token correcto success true" ($ok.Data.success -eq $true)

Write-Host "2. Token falso"
$badToken = New-BaseLead
$badToken.landing_token = "lf_TOKEN_FALSO_000000000000000000000000"
$badTokenResult = Invoke-LeadIntake -Body $badToken
Assert-Status "token falso devuelve 403" $badTokenResult 403

Write-Host "3. clinic_id manipulado se ignora"
$manipulated = New-BaseLead
$manipulated.clinic_id = "00000000-0000-0000-0000-000000000000"
$manipulatedResult = Invoke-LeadIntake -Body $manipulated
Assert-Status "clinic_id manipulado no bloquea lead valido" $manipulatedResult 200
Assert-True "clinic_id manipulado recibe lead_id" ([string]::IsNullOrWhiteSpace($manipulatedResult.Data.lead_id) -eq $false)

Write-Host "4. Telefono invalido"
$badPhone = New-BaseLead -Phone "123"
$badPhoneResult = Invoke-LeadIntake -Body $badPhone
Assert-Status "telefono invalido devuelve 400" $badPhoneResult 400

Write-Host "5. Formulario incompleto"
$incomplete = New-BaseLead
$incomplete.nombre = ""
$incompleteResult = Invoke-LeadIntake -Body $incomplete
Assert-Status "formulario incompleto devuelve 400" $incompleteResult 400

Write-Host "6. Duplicado"
$duplicate = New-BaseLead
$firstDuplicate = Invoke-LeadIntake -Body $duplicate
$secondDuplicate = Invoke-LeadIntake -Body $duplicate
Assert-Status "duplicado primera submission 200" $firstDuplicate 200
Assert-Status "duplicado segunda submission 200" $secondDuplicate 200
Assert-True "duplicado conserva lead_id" ($firstDuplicate.Data.lead_id -eq $secondDuplicate.Data.lead_id)

Write-Host "7. Lead caliente"
$hot = Invoke-LeadIntake -Body (New-BaseLead -Treatment "Implante dental" -Urgency "Hoy" -Evaluation "Tengo estudios / radiografia" -Situation "Quiero agendar una consulta")
Assert-Status "lead caliente devuelve 200" $hot 200
Assert-True "lead caliente clasifica correcto" ($hot.Data.classification -eq "Lead Caliente")

Write-Host "8. Lead medio"
$medium = Invoke-LeadIntake -Body (New-BaseLead -Treatment "Ortodoncia / brackets" -Urgency "Esta semana" -Evaluation "No" -Situation "Quiero saber precios")
Assert-Status "lead medio devuelve 200" $medium 200
Assert-True "lead medio clasifica correcto" ($medium.Data.classification -eq "Lead Medio")

Write-Host "9. Lead frio"
$cold = Invoke-LeadIntake -Body (New-BaseLead -Treatment "Consulta general" -Urgency "Solo estoy consultando" -Evaluation "No estoy seguro" -Situation "Estoy comparando opciones")
Assert-Status "lead frio devuelve 200" $cold 200
if ([string]$cold.Data.classification -like "Lead Fr*o") {
  $cold.Data.classification = "Lead Frio"
}
Assert-True "lead frio clasifica correcto" ($cold.Data.classification -eq "Lead Frio" -or $cold.Data.classification -eq "Lead Frío")

Write-Host "10. Rate limit mismo telefono"
$rateLead = New-BaseLead
$rateIp = "203.0.113.240"
$rateResults = 1..4 | ForEach-Object { Invoke-LeadIntake -Body $rateLead -Ip $rateIp }
Assert-Status "rate limit cuarto envio devuelve 429" $rateResults[-1] 429

Write-Host "11. CORS OPTIONS"
try {
  $options = Invoke-WebRequest -Method Options -Uri $EDGE_URL -Headers @{ Origin = $ORIGIN } -UseBasicParsing
  Assert-True "OPTIONS devuelve 200" ([int]$options.StatusCode -eq 200)
} catch {
  $optionsError = Convert-HttpError -ErrorRecord $_
  Assert-True "OPTIONS devuelve 200" ($optionsError.StatusCode -eq 200) "Obtuvo $($optionsError.StatusCode): $($optionsError.Raw)"
}

Write-Host "Resultado: $script:Passed passed, $script:Failed failed"
if ($script:Failed -gt 0) {
  exit 1
}
