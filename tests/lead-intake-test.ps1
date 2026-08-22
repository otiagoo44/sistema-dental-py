param(
  [string]$EDGE_URL = $(if ($env:EDGE_URL) { $env:EDGE_URL } else { "https://unybqqzhgqxhrwucrofm.supabase.co/functions/v1/lead-intake" }),
  [string]$SLUG = $(if ($env:SLUG) { $env:SLUG } else { "dentalpro" }),
  [string]$TOKEN = $(if ($env:TOKEN) { $env:TOKEN } else { "TOKEN_PUBLICO" }),
  [string]$LANDING_ORIGIN = $(if ($env:LANDING_ORIGIN) { $env:LANDING_ORIGIN } elseif ($env:ORIGIN) { $env:ORIGIN } else { "https://sistema-dental-n0vygq1wm-ortegatiago733-2656s-projects.vercel.app" }),
  [string]$PRODUCTION_ORIGIN = $(if ($env:PRODUCTION_ORIGIN) { $env:PRODUCTION_ORIGIN } else { "https://sistema-dental-py.vercel.app" }),
  [string]$LOCAL_ORIGIN = $(if ($env:LOCAL_ORIGIN) { $env:LOCAL_ORIGIN } else { "http://localhost:5173" }),
  [string]$OLD_NETLIFY_ORIGIN = $(if ($env:OLD_NETLIFY_ORIGIN) { $env:OLD_NETLIFY_ORIGIN } else { "https://sistema-dentalpro-py.netlify.app" }),
  [string]$INVALID_ORIGIN = $(if ($env:INVALID_ORIGIN) { $env:INVALID_ORIGIN } else { "https://invalid-origin.example" })
)

if ($TOKEN -eq "TOKEN_PUBLICO") {
  throw "Configura TOKEN con un landing_token real antes de ejecutar: `$env:TOKEN='lf_...'; .\tests\lead-intake-test.ps1"
}

if ($LANDING_ORIGIN.EndsWith("/")) {
  throw "LANDING_ORIGIN debe ir sin slash final. Usa https://sistema-dental-py.vercel.app"
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
    Headers = $Response.Headers
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
      Headers = $null
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
    Headers = $response.Headers
  }
}

function Invoke-EdgeRequest {
  param(
    [string]$Method = "Post",
    [hashtable]$Body = $null,
    [string]$RawBody = $null,
    [string]$Origin = $LANDING_ORIGIN,
    [string]$Ip = $(New-TestIp)
  )

  $headers = @{
    "X-Forwarded-For" = $Ip
  }

  if ($Origin) {
    $headers["Origin"] = $Origin
  }

  $params = @{
    Method = $Method
    Uri = $EDGE_URL
    Headers = $headers
    UseBasicParsing = $true
  }

  if ($Method -notin @("Get", "Options")) {
    $params.ContentType = "application/json"
    $params.Body = if (-not [string]::IsNullOrEmpty($RawBody)) { $RawBody } else { $Body | ConvertTo-Json -Depth 10 }
  }

  try {
    $response = Invoke-WebRequest @params
    return Convert-HttpResult -Response $response
  } catch {
    return Convert-HttpError -ErrorRecord $_
  }
}

function Invoke-LeadIntake {
  param(
    [hashtable]$Body,
    [string]$Origin = $LANDING_ORIGIN,
    [string]$Ip = $(New-TestIp)
  )

  return Invoke-EdgeRequest -Method "Post" -Body $Body -Origin $Origin -Ip $Ip
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

function Assert-CorsOrigin {
  param(
    [string]$Name,
    [object]$Result,
    [string]$Expected
  )

  $actual = if ($Result.Headers) { [string]$Result.Headers["Access-Control-Allow-Origin"] } else { "" }
  Assert-True -Name $Name -Condition ($actual -eq $Expected) -Detail "Esperado '$Expected', obtuvo '$actual'"
}

function New-BaseLead {
  param(
    [string]$Phone = $(New-TestPhone),
    [string]$Treatment = "Implante dental",
    [string]$Urgency = "Hoy",
    [string]$Evaluation = "Tengo estudios / radiografia",
    [string]$Situation = "Quiero agendar una consulta",
    [string]$Name = "Lead Test QA",
    [string]$ClinicSlug = $SLUG,
    [string]$LandingToken = $TOKEN
  )

  return @{
    clinic_slug = $ClinicSlug
    landing_token = $LandingToken
    nombre = $Name
    telefono = $Phone
    tratamiento = $Treatment
    urgencia = $Urgency
    evaluacion_previa = $Evaluation
    situacion = $Situation
    consultation_reason = "Test automatizado"
    origen = "tests/lead-intake-test.ps1"
    pagina = "test"
    consentimiento_contacto = $true
    website = ""
    company = ""
  }
}

Write-Host "1. Origin correcto Vercel"
$ok = Invoke-LeadIntake -Body (New-BaseLead -Name "QA Vercel Origin Correcto") -Origin $LANDING_ORIGIN
Assert-Status "origin Vercel devuelve 200" $ok 200
Assert-True "origin Vercel success true" ($ok.Data.success -eq $true)
Assert-True "origin Vercel lead_id presente" ([string]::IsNullOrWhiteSpace($ok.Data.lead_id) -eq $false)
Assert-CorsOrigin "origin preview devuelve ACAO exacto" $ok $LANDING_ORIGIN

Write-Host "1b. Origin produccion"
$production = Invoke-LeadIntake -Body (New-BaseLead -Name "QA Produccion Origin Correcto") -Origin $PRODUCTION_ORIGIN
Assert-Status "origin produccion devuelve 200" $production 200
Assert-CorsOrigin "origin produccion devuelve ACAO exacto" $production $PRODUCTION_ORIGIN

Write-Host "1c. Origin localhost"
$localhost = Invoke-LeadIntake -Body (New-BaseLead -Name "QA Localhost Origin Correcto") -Origin $LOCAL_ORIGIN
Assert-Status "origin localhost devuelve 200" $localhost 200
Assert-CorsOrigin "origin localhost devuelve ACAO exacto" $localhost $LOCAL_ORIGIN

Write-Host "2. Origin viejo Netlify"
$oldOrigin = Invoke-LeadIntake -Body (New-BaseLead -Name "QA Origin Viejo Netlify") -Origin $OLD_NETLIFY_ORIGIN
Assert-Status "origin viejo Netlify devuelve 403" $oldOrigin 403

Write-Host "3. Origin invalido"
$invalidOrigin = Invoke-LeadIntake -Body (New-BaseLead -Name "QA Origin Invalido") -Origin $INVALID_ORIGIN
Assert-Status "origin invalido devuelve 403" $invalidOrigin 403
Assert-CorsOrigin "origin invalido no se refleja" $invalidOrigin ""

Write-Host "3b. Request sin Origin"
$missingOrigin = Invoke-LeadIntake -Body (New-BaseLead -Name "QA Sin Origin") -Origin ""
Assert-Status "request sin Origin devuelve 403" $missingOrigin 403
Assert-CorsOrigin "request sin Origin no recibe ACAO" $missingOrigin ""

Write-Host "4. GET no permitido"
$getResult = Invoke-EdgeRequest -Method "Get" -Origin $LANDING_ORIGIN
Assert-Status "GET devuelve 405" $getResult 405
Assert-CorsOrigin "GET permitido conserva ACAO" $getResult $LANDING_ORIGIN

Write-Host "5. Clinica inexistente"
$missingClinic = Invoke-LeadIntake -Body (New-BaseLead -ClinicSlug "clinica-inexistente-qa" -Name "QA Clinica Inexistente")
Assert-Status "clinica inexistente devuelve 403" $missingClinic 403
Assert-CorsOrigin "clinica inexistente conserva ACAO permitido" $missingClinic $LANDING_ORIGIN

Write-Host "6. XSS controlado"
$xss = Invoke-LeadIntake -Body (New-BaseLead -Name "<script>alert(1)</script>")
Assert-Status "XSS en nombre queda rechazado por validacion" $xss 400

Write-Host "7. Payload grande"
$largePayload = New-BaseLead -Name "QA Payload Grande"
$largePayload.notes = "x" * 17000
$largeRaw = $largePayload | ConvertTo-Json -Depth 10
$largeResult = Invoke-EdgeRequest -Method "Post" -RawBody $largeRaw -Origin $LANDING_ORIGIN
Assert-Status "payload grande devuelve 400" $largeResult 400

Write-Host "8. Honeypot"
$honeypot = New-BaseLead -Name "QA Honeypot"
$honeypot.website = "https://spam.example"
$honeypotResult = Invoke-LeadIntake -Body $honeypot
Assert-Status "honeypot devuelve 403" $honeypotResult 403
Assert-CorsOrigin "honeypot conserva ACAO permitido" $honeypotResult $LANDING_ORIGIN

Write-Host "9. Token falso"
$badToken = New-BaseLead -Name "QA Token Falso"
$badToken.landing_token = "lf_TOKEN_FALSO_000000000000000000000000"
$badTokenResult = Invoke-LeadIntake -Body $badToken
Assert-Status "token falso devuelve 403" $badTokenResult 403
Assert-CorsOrigin "token falso conserva ACAO permitido" $badTokenResult $LANDING_ORIGIN

Write-Host "10. clinic_id manipulado se ignora"
$manipulated = New-BaseLead -Name "QA Clinic Id Manipulado"
$manipulated.clinic_id = "00000000-0000-0000-0000-000000000000"
$manipulatedResult = Invoke-LeadIntake -Body $manipulated
Assert-Status "clinic_id manipulado no bloquea lead valido" $manipulatedResult 200
Assert-True "clinic_id manipulado recibe lead_id" ([string]::IsNullOrWhiteSpace($manipulatedResult.Data.lead_id) -eq $false)

Write-Host "11. Telefono invalido"
$badPhone = New-BaseLead -Phone "123" -Name "QA Telefono Invalido"
$badPhoneResult = Invoke-LeadIntake -Body $badPhone
Assert-Status "telefono invalido devuelve 400" $badPhoneResult 400
Assert-CorsOrigin "telefono invalido conserva ACAO permitido" $badPhoneResult $LANDING_ORIGIN

Write-Host "12. Formulario incompleto"
$incomplete = New-BaseLead
$incomplete.nombre = ""
$incompleteResult = Invoke-LeadIntake -Body $incomplete
Assert-Status "formulario incompleto devuelve 400" $incompleteResult 400

Write-Host "12b. Consentimiento faltante"
$missingConsent = New-BaseLead -Name "QA Sin Consentimiento"
$missingConsent.Remove("consentimiento_contacto")
$missingConsentResult = Invoke-LeadIntake -Body $missingConsent
Assert-Status "consentimiento faltante devuelve 400" $missingConsentResult 400
Assert-CorsOrigin "consentimiento faltante conserva ACAO permitido" $missingConsentResult $LANDING_ORIGIN

Write-Host "13. Duplicado"
$duplicate = New-BaseLead -Name "QA Duplicado"
$firstDuplicate = Invoke-LeadIntake -Body $duplicate
$secondDuplicate = Invoke-LeadIntake -Body $duplicate
Assert-Status "duplicado primera submission 200" $firstDuplicate 200
Assert-Status "duplicado segunda submission 200" $secondDuplicate 200
Assert-True "duplicado conserva lead_id" ($firstDuplicate.Data.lead_id -eq $secondDuplicate.Data.lead_id)

Write-Host "14. Lead caliente"
$hot = Invoke-LeadIntake -Body (New-BaseLead -Treatment "Implante dental" -Urgency "Hoy" -Evaluation "Tengo estudios / radiografia" -Situation "Quiero agendar una consulta" -Name "QA Lead Caliente")
Assert-Status "lead caliente devuelve 200" $hot 200
Assert-True "lead caliente clasifica correcto" ($hot.Data.classification -eq "Lead Caliente")

Write-Host "15. Lead medio"
$medium = Invoke-LeadIntake -Body (New-BaseLead -Treatment "Ortodoncia / brackets" -Urgency "Esta semana" -Evaluation "No" -Situation "Quiero saber precios" -Name "QA Lead Medio")
Assert-Status "lead medio devuelve 200" $medium 200
Assert-True "lead medio clasifica correcto" ($medium.Data.classification -eq "Lead Medio")

Write-Host "16. Lead frio"
$cold = Invoke-LeadIntake -Body (New-BaseLead -Treatment "Consulta general" -Urgency "Solo estoy consultando" -Evaluation "No estoy seguro" -Situation "Estoy comparando opciones" -Name "QA Lead Frio")
Assert-Status "lead frio devuelve 200" $cold 200
Assert-True "lead frio clasifica correcto" ([string]$cold.Data.classification -like "Lead Fr*o")

Write-Host "17. Rate limit mismo telefono"
$rateLead = New-BaseLead -Name "QA Rate Limit"
$rateIp = "203.0.113.240"
$rateResults = 1..4 | ForEach-Object { Invoke-LeadIntake -Body $rateLead -Ip $rateIp }
Assert-Status "rate limit cuarto envio devuelve 429" $rateResults[-1] 429

Write-Host "17b. Rate limit misma IP"
$ipRateAddress = "203.0.113.241"
$ipRateResults = 1..61 | ForEach-Object {
  Invoke-LeadIntake -Body (New-BaseLead -Name "QA Rate IP $_") -Ip $ipRateAddress
}
Assert-Status "rate limit IP envio sesenta y uno devuelve 429" $ipRateResults[-1] 429

Write-Host "18. CORS OPTIONS"
$options = Invoke-EdgeRequest -Method "Options" -Origin $LANDING_ORIGIN
Assert-Status "OPTIONS preview devuelve 200" $options 200
Assert-CorsOrigin "OPTIONS preview devuelve ACAO exacto" $options $LANDING_ORIGIN

$productionOptions = Invoke-EdgeRequest -Method "Options" -Origin $PRODUCTION_ORIGIN
Assert-Status "OPTIONS produccion devuelve 200" $productionOptions 200
Assert-CorsOrigin "OPTIONS produccion devuelve ACAO exacto" $productionOptions $PRODUCTION_ORIGIN

$localOptions = Invoke-EdgeRequest -Method "Options" -Origin $LOCAL_ORIGIN
Assert-Status "OPTIONS localhost devuelve 200" $localOptions 200
Assert-CorsOrigin "OPTIONS localhost devuelve ACAO exacto" $localOptions $LOCAL_ORIGIN

$invalidOptions = Invoke-EdgeRequest -Method "Options" -Origin $INVALID_ORIGIN
Assert-Status "OPTIONS invalido devuelve 403" $invalidOptions 403
Assert-CorsOrigin "OPTIONS invalido no refleja origin" $invalidOptions ""

Write-Host "Resultado: $script:Passed passed, $script:Failed failed"
if ($script:Failed -gt 0) {
  exit 1
}
