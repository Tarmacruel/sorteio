param(
  [ValidateSet("setup", "start", "stop", "status")]
  [string] $Command = "status"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$RuntimeDir = Join-Path $RepoRoot ".runtime"
$LogDir = Join-Path $RepoRoot "logs"
$AppUrlFile = Join-Path $RuntimeDir "app.url"
$RedisPidFile = Join-Path $RuntimeDir "redis.pid"
$WorkerPidFile = Join-Path $RuntimeDir "worker.pid"
$AppPidFile = Join-Path $RuntimeDir "app.pid"

function Ensure-Dirs {
  New-Item -ItemType Directory -Force -Path $RuntimeDir | Out-Null
  New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
}

function Get-PostgresService {
  Get-Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "postgresql*" -or $_.DisplayName -like "*PostgreSQL*" } |
    Select-Object -First 1
}

function Test-Port {
  param([int] $Port)
  return [bool](Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" })
}

function Wait-Port {
  param(
    [int] $Port,
    [int] $TimeoutSeconds = 15
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Port $Port) {
      return $true
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Get-AlivePid {
  param([string] $PidFile)
  if (-not (Test-Path $PidFile)) {
    return $null
  }

  $rawPid = (Get-Content -Path $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  $processId = 0
  if (-not [int]::TryParse($rawPid, [ref] $processId)) {
    return $null
  }

  $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($process) {
    return $processId
  }

  return $null
}

function Find-FreePort {
  param(
    [int] $StartPort = 4000,
    [int] $EndPort = 4010
  )

  for ($port = $StartPort; $port -le $EndPort; $port++) {
    if (-not (Test-Port $port)) {
      return $port
    }
  }

  throw "Nenhuma porta livre encontrada entre $StartPort e $EndPort."
}

function Get-NpmCommand {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) {
    throw "npm.cmd não foi encontrado no PATH."
  }
  return $npm.Source
}

function Get-PsqlCommand {
  $psql = Get-Command psql.exe -ErrorAction SilentlyContinue
  if ($psql) {
    return $psql.Source
  }

  $candidate = Get-ChildItem -Path "C:\Program Files\PostgreSQL" -Recurse -Filter psql.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1

  if ($candidate) {
    return $candidate.FullName
  }

  throw "psql.exe não foi encontrado. Instale o PostgreSQL client ou adicione psql ao PATH."
}

function Ensure-Postgres {
  $service = Get-PostgresService
  if (-not $service) {
    Write-Host "PostgreSQL: serviço não encontrado. Vou assumir que já está disponível por outro meio."
    return
  }

  if ($service.Status -ne "Running") {
    Write-Host "PostgreSQL: iniciando serviço $($service.Name)..."
    Start-Service -Name $service.Name
    $service.WaitForStatus("Running", "00:00:20")
  }

  Write-Host "PostgreSQL: rodando ($($service.Name))."
}

function Ensure-RedisInstalled {
  $redis = Get-Command redis-server -ErrorAction SilentlyContinue
  if ($redis) {
    return $redis.Source
  }

  $scoop = Get-Command scoop -ErrorAction SilentlyContinue
  if (-not $scoop) {
    throw "Redis não está instalado e Scoop não foi encontrado. Instale Redis ou Scoop e rode scripts\setup-sorteio.bat."
  }

  Write-Host "Redis: instalando via Scoop..."
  & scoop install redis
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao instalar Redis via Scoop."
  }

  $redis = Get-Command redis-server -ErrorAction SilentlyContinue
  if (-not $redis) {
    throw "Redis foi instalado, mas redis-server ainda não está no PATH. Abra um novo terminal e tente novamente."
  }

  return $redis.Source
}

function Ensure-Database {
  Ensure-Postgres

  $psql = Get-PsqlCommand
  $env:PGPASSWORD = "postgres"
  $exists = (& $psql -h localhost -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='sorteio'").Trim()

  if ($exists -eq "1") {
    Write-Host "PostgreSQL: banco sorteio já existe."
    return
  }

  Write-Host "PostgreSQL: criando banco sorteio..."
  & $psql -h localhost -U postgres -d postgres -c "CREATE DATABASE sorteio;"
  if ($LASTEXITCODE -ne 0) {
    throw "Falha ao criar banco sorteio."
  }
}

function Start-Redis {
  $redis = Ensure-RedisInstalled

  if (Test-Port 6379) {
    Write-Host "Redis: já está escutando em localhost:6379."
    return
  }

  $existingPid = Get-AlivePid $RedisPidFile
  if ($existingPid) {
    Write-Host "Redis: processo já registrado com PID $existingPid."
    return
  }

  Write-Host "Redis: iniciando em localhost:6379..."
  $process = Start-Process -FilePath $redis -ArgumentList @("--port", "6379") -WorkingDirectory $RepoRoot -WindowStyle Hidden -PassThru
  $process.Id | Set-Content -Path $RedisPidFile

  if (-not (Wait-Port 6379 15)) {
    throw "Redis foi iniciado, mas não respondeu em localhost:6379."
  }

  Write-Host "Redis: rodando com PID $($process.Id)."
}

function Start-Worker {
  $existingPid = Get-AlivePid $WorkerPidFile
  if ($existingPid) {
    Write-Host "Worker: já está rodando com PID $existingPid."
    return
  }

  $npm = Get-NpmCommand
  Write-Host "Worker: iniciando fila instagram-capture..."
  $process = Start-Process -FilePath $npm `
    -ArgumentList @("run", "worker:dev") `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput (Join-Path $LogDir "worker.log") `
    -RedirectStandardError (Join-Path $LogDir "worker-error.log") `
    -WindowStyle Hidden `
    -PassThru

  $process.Id | Set-Content -Path $WorkerPidFile
  Start-Sleep -Seconds 2
  Write-Host "Worker: rodando com PID $($process.Id). Logs em logs\worker.log."
}

function Start-App {
  $existingPid = Get-AlivePid $AppPidFile
  if ($existingPid) {
    $url = if (Test-Path $AppUrlFile) { Get-Content $AppUrlFile | Select-Object -First 1 } else { "http://localhost:4000" }
    Write-Host "Web App: já está rodando com PID $existingPid em $url."
    return
  }

  $port = Find-FreePort 4000 4010
  $url = "http://localhost:$port"
  $npm = Get-NpmCommand

  Write-Host "Web App: iniciando em $url..."
  $process = Start-Process -FilePath $npm `
    -ArgumentList @("exec", "--", "next", "dev", "--hostname", "localhost", "--port", "$port") `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput (Join-Path $LogDir "app.log") `
    -RedirectStandardError (Join-Path $LogDir "app-error.log") `
    -WindowStyle Hidden `
    -PassThru

  $process.Id | Set-Content -Path $AppPidFile
  $url | Set-Content -Path $AppUrlFile

  if (-not (Wait-Port $port 30)) {
    throw "Web App foi iniciado, mas não respondeu em $url."
  }

  Write-Host "Web App: rodando com PID $($process.Id) em $url."
}

function Stop-ByPidFile {
  param(
    [string] $Name,
    [string] $PidFile
  )

  $pidValue = Get-AlivePid $PidFile
  if (-not $pidValue) {
    Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host "${Name}: nenhum processo registrado."
    return
  }

  Write-Host "${Name}: parando PID $pidValue..."
  Stop-ProcessTree $pidValue
  Remove-Item -Path $PidFile -Force -ErrorAction SilentlyContinue
}

function Stop-ProcessTree {
  param([int] $ProcessId)

  $children = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ParentProcessId -eq $ProcessId }

  foreach ($child in $children) {
    Stop-ProcessTree ([int] $child.ProcessId)
  }

  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

function Invoke-Setup {
  Ensure-Dirs
  Ensure-RedisInstalled | Out-Null
  Ensure-Database

  $npm = Get-NpmCommand
  Write-Host "Node: instalando dependências..."
  & $npm install
  if ($LASTEXITCODE -ne 0) {
    throw "npm install falhou."
  }

  Write-Host "Prisma: aplicando migrations..."
  & npx prisma migrate deploy
  if ($LASTEXITCODE -ne 0) {
    throw "prisma migrate deploy falhou."
  }

  Write-Host "Playwright: instalando Chromium..."
  & npx playwright install chromium
  if ($LASTEXITCODE -ne 0) {
    throw "playwright install chromium falhou."
  }

  Write-Host "Setup concluído."
}

function Invoke-Start {
  Ensure-Dirs
  Ensure-Postgres
  Start-Redis
  Start-Worker
  Start-App

  $url = if (Test-Path $AppUrlFile) { Get-Content $AppUrlFile | Select-Object -First 1 } else { "http://localhost:4000" }
  Write-Host ""
  Write-Host "Sorteio rodando."
  Write-Host "App: $url"
  Write-Host "Redis: localhost:6379"
  Write-Host "Worker: fila instagram-capture"
}

function Invoke-Stop {
  Ensure-Dirs
  Stop-ByPidFile "Web App" $AppPidFile
  Stop-ByPidFile "Worker" $WorkerPidFile
  Stop-ByPidFile "Redis" $RedisPidFile
  Remove-Item -Path $AppUrlFile -Force -ErrorAction SilentlyContinue
  Write-Host "Rotinas do Sorteio paradas."
}

function Invoke-Status {
  Ensure-Dirs
  $postgres = Get-PostgresService
  $appUrl = if (Test-Path $AppUrlFile) { Get-Content $AppUrlFile | Select-Object -First 1 } else { "http://localhost:4000" }

  Write-Host "Status Sorteio"
  Write-Host "--------------"
  Write-Host ("PostgreSQL: " + $(if ($postgres) { "$($postgres.Status) ($($postgres.Name))" } else { "serviço não encontrado" }))
  Write-Host ("Redis 6379: " + $(if (Test-Port 6379) { "rodando" } else { "parado" }))
  Write-Host ("Worker: " + $(if (Get-AlivePid $WorkerPidFile) { "rodando (PID $(Get-AlivePid $WorkerPidFile))" } else { "parado" }))
  Write-Host ("Web App: " + $(if (Get-AlivePid $AppPidFile) { "rodando em $appUrl" } else { "parado" }))
  Write-Host "Logs: $LogDir"
}

Set-Location $RepoRoot

switch ($Command) {
  "setup" { Invoke-Setup }
  "start" { Invoke-Start }
  "stop" { Invoke-Stop }
  "status" { Invoke-Status }
}
