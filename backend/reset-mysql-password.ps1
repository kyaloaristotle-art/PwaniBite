#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

$serviceName = 'MySQL80'
$mysqlBin = 'C:\Program Files\MySQL\MySQL Server 8.0\bin'
$defaultsFile = 'C:\ProgramData\MySQL\MySQL Server 8.0\my.ini'
$backendDir = $PSScriptRoot
$envFile = Join-Path $backendDir '.env'
$mysqlServer = Join-Path $mysqlBin 'mysqld.exe'
$mysqlClient = Join-Path $mysqlBin 'mysql.exe'
$mysqlAdmin = Join-Path $mysqlBin 'mysqladmin.exe'

function Invoke-MySqlCommand {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $id = [guid]::NewGuid().ToString('N')
    $stdout = Join-Path $env:TEMP "pwani-mysql-command-$id.out.log"
    $stderr = Join-Path $env:TEMP "pwani-mysql-command-$id.err.log"
    $quotedArguments = foreach ($argument in $Arguments) {
        '"' + $argument.Replace('"', '\"') + '"'
    }
    $process = Start-Process -FilePath $Executable -ArgumentList ($quotedArguments -join ' ') -PassThru -Wait -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    $exitCode = $process.ExitCode
    Remove-Item -LiteralPath $stdout, $stderr -Force -ErrorAction SilentlyContinue
    return $exitCode
}

function Convert-SecureStringToPlainText {
    param([Parameter(Mandatory = $true)][System.Security.SecureString]$SecureValue)
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureValue)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}

foreach ($requiredPath in @($envFile, $defaultsFile, $mysqlServer, $mysqlClient, $mysqlAdmin)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "Required MySQL or backend file was not found: $requiredPath"
    }
}

$envText = [System.IO.File]::ReadAllText($envFile)
$portMatch = [regex]::Match($envText, '(?m)^DB_PORT\s*=\s*(\d+)\s*$')
if ($portMatch.Success -and $portMatch.Groups[1].Value -ne '3306') {
    throw "backend/.env uses port $($portMatch.Groups[1].Value), but MySQL80 is configured for port 3306. No changes were made."
}
if ($envText -notmatch '(?m)^DB_PASSWORD\s*=') {
    throw 'backend/.env has no DB_PASSWORD entry. Add the entry and retry.'
}
$configuredPasswordMatch = [regex]::Match($envText, '(?m)^DB_PASSWORD\s*=(.*)$')
$configuredPassword = $configuredPasswordMatch.Groups[1].Value.Trim()

$securePassword = Read-Host 'Choose your new MySQL root password (16-128 characters; use uppercase, lowercase, number, symbol; allowed symbols !@$%^&*()_+=.,:-)' -AsSecureString
$secureConfirm = Read-Host 'Enter the new password again to confirm' -AsSecureString
$firstPassword = Convert-SecureStringToPlainText $securePassword
$confirmPassword = Convert-SecureStringToPlainText $secureConfirm
try {
    if ($firstPassword -cne $confirmPassword) { throw 'The passwords do not match. No changes were made.' }
    if ($firstPassword -notmatch '^[A-Za-z0-9!@$%^&*()_+=.,:\-]{16,128}$' -or
        $firstPassword -notmatch '[A-Z]' -or $firstPassword -notmatch '[a-z]' -or
        $firstPassword -notmatch '\d' -or $firstPassword -notmatch '[!@$%^&*()_+=.,:\-]') {
        throw 'Choose 16-128 characters with uppercase, lowercase, a number, and a symbol from !@$%^&*()_+=.,:-. Quotes, backslashes, spaces, and # are not supported.'
    }
    $newPassword = $firstPassword
}
finally {
    $firstPassword = $null
    $confirmPassword = $null
    $securePassword.Dispose()
    $secureConfirm.Dispose()
}

$service = Get-Service -Name $serviceName -ErrorAction Stop

# Recover cleanly if an earlier reset changed the password but left the
# temporary standalone server running instead of restoring the Windows service.
if ($service.Status -ne 'Running' -and $configuredPassword) {
    $recoveryClient = Join-Path $env:TEMP ("pwani-mysql-recovery-" + [guid]::NewGuid().ToString('N') + '.ini')
    $recoveryOut = Join-Path $env:TEMP ("pwani-mysql-recovery-" + [guid]::NewGuid().ToString('N') + '.out.log')
    $recoveryErr = Join-Path $env:TEMP ("pwani-mysql-recovery-" + [guid]::NewGuid().ToString('N') + '.err.log')
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($recoveryClient, "[client]`r`nuser=root`r`npassword=$configuredPassword`r`nprotocol=TCP`r`nhost=127.0.0.1`r`nport=3306`r`n", $utf8NoBom)
    try {
        $probeCode = Invoke-MySqlCommand $mysqlClient @("--defaults-extra-file=$recoveryClient", '--batch', '--skip-column-names', '--execute', 'SELECT 1')
        if ($probeCode -eq 0) {
            $oldRunIds = Get-ChildItem -Path $env:TEMP -Filter 'pwani-mysql-client-*.ini' -ErrorAction SilentlyContinue |
                ForEach-Object { [regex]::Match($_.Name, '^pwani-mysql-client-([a-f0-9]+)\.ini$').Groups[1].Value } |
                Where-Object { $_ }
            if ((Invoke-MySqlCommand $mysqlAdmin @("--defaults-extra-file=$recoveryClient", 'shutdown')) -ne 0) {
                throw 'Could not gracefully stop the temporary MySQL process from the interrupted reset.'
            }
            for ($attempt = 0; $attempt -lt 30; $attempt++) {
                $remaining = Get-CimInstance -ClassName Win32_Process -Filter "Name = 'mysqld.exe'" |
                    Where-Object { $_.ExecutablePath -and $_.ExecutablePath -ieq $mysqlServer }
                if (-not $remaining) { break }
                Start-Sleep -Seconds 1
            }
            if ($remaining) { throw 'Temporary MySQL stopped accepting clients but did not exit. Restart was cancelled.' }

            Start-Service -Name $serviceName
            (Get-Service -Name $serviceName).WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
            if ((Invoke-MySqlCommand $mysqlClient @("--defaults-extra-file=$recoveryClient", '--batch', '--skip-column-names', '--execute', 'SELECT 1')) -ne 0) {
                throw 'MySQL80 started, but the credential stored in backend/.env did not verify.'
            }

            foreach ($oldRunId in $oldRunIds) {
                Remove-Item -LiteralPath (Join-Path $env:TEMP "pwani-mysql-client-$oldRunId.ini"),
                    (Join-Path $env:TEMP "pwani-mysql-init-$oldRunId.sql"),
                    (Join-Path $env:TEMP "pwani-mysql-$oldRunId.out.log"),
                    (Join-Path $env:TEMP "pwani-mysql-$oldRunId.err.log") -Force -ErrorAction SilentlyContinue
            }
            Write-Output 'Recovered the MySQL80 Windows service using the verified credential in backend/.env.'
        }
    }
    finally {
        Remove-Item -LiteralPath $recoveryClient, $recoveryOut, $recoveryErr -Force -ErrorAction SilentlyContinue
    }
}
$service = Get-Service -Name $serviceName -ErrorAction Stop

$tempId = [guid]::NewGuid().ToString('N')
$initFile = Join-Path $env:TEMP "pwani-mysql-init-$tempId.sql"
$clientFile = Join-Path $env:TEMP "pwani-mysql-client-$tempId.ini"
$stdoutFile = Join-Path $env:TEMP "pwani-mysql-$tempId.out.log"
$stderrFile = Join-Path $env:TEMP "pwani-mysql-$tempId.err.log"
$manualServer = $null

try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($initFile, "ALTER USER 'root'@'localhost' IDENTIFIED BY '$newPassword';`r`n", $utf8NoBom)
    [System.IO.File]::WriteAllText($clientFile, "[client]`r`nuser=root`r`npassword=$newPassword`r`nprotocol=TCP`r`nhost=127.0.0.1`r`nport=3306`r`n", $utf8NoBom)

    if ($service.Status -eq 'Running') {
        Stop-Service -Name $serviceName -Force
        (Get-Service -Name $serviceName).WaitForStatus('Stopped', [TimeSpan]::FromSeconds(45))
    }

    # A previous interrupted run may have left a standalone MySQL 8.0 process
    # behind after the Windows service stopped. Only target this exact binary.
    $orphanedServers = Get-CimInstance -ClassName Win32_Process -Filter "Name = 'mysqld.exe'" |
        Where-Object { $_.ExecutablePath -and $_.ExecutablePath -ieq $mysqlServer }
    foreach ($orphan in $orphanedServers) {
        Stop-Process -Id $orphan.ProcessId -Force
    }
    if ($orphanedServers) { Start-Sleep -Seconds 2 }

    $serverArgs = "--defaults-file=`"$defaultsFile`" --init-file=`"$initFile`" --console"
    $manualServer = Start-Process -FilePath $mysqlServer -ArgumentList $serverArgs -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdoutFile -RedirectStandardError $stderrFile

    $ready = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if ($manualServer.HasExited) { break }
        if ((Invoke-MySqlCommand $mysqlClient @("--defaults-extra-file=$clientFile", '--batch', '--skip-column-names', '--execute', 'SELECT 1')) -eq 0) {
            $ready = $true
            break
        }
        Start-Sleep -Seconds 1
    }
    if (-not $ready) {
        $serverLog = if (Test-Path $stderrFile) { Get-Content $stderrFile -Raw } else { '' }
        throw "MySQL did not accept the reset password. Check the instance configuration. $serverLog"
    }

    if ((Invoke-MySqlCommand $mysqlClient @("--defaults-extra-file=$clientFile", '--batch', '--skip-column-names', '--execute', 'SELECT 1')) -ne 0) {
        throw 'MySQL password verification failed before restarting the service.'
    }

    $envText = [regex]::Replace($envText, '(?m)^DB_PASSWORD\s*=.*$', "DB_PASSWORD=$newPassword")
    [System.IO.File]::WriteAllText($envFile, $envText, $utf8NoBom)

    if ((Invoke-MySqlCommand $mysqlAdmin @("--defaults-extra-file=$clientFile", 'shutdown')) -ne 0) {
        throw 'Could not shut down the temporary MySQL process cleanly.'
    }
    $manualServer.WaitForExit(30000) | Out-Null
    if (-not $manualServer.HasExited) { throw 'The temporary MySQL process did not stop in time.' }
    $manualServer = $null

    Start-Service -Name $serviceName
    (Get-Service -Name $serviceName).WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
    if ((Invoke-MySqlCommand $mysqlClient @("--defaults-extra-file=$clientFile", '--batch', '--skip-column-names', '--execute', 'SELECT 1')) -ne 0) {
        throw 'MySQL service restarted, but the saved credential could not be verified.'
    }

    Write-Output 'MySQL root password was reset and saved to backend/.env. The MySQL80 service is running.'
}
finally {
    if ($manualServer -and -not $manualServer.HasExited) {
        if ($newPassword -and (Test-Path $clientFile)) {
            try {
                Invoke-MySqlCommand $mysqlAdmin @("--defaults-extra-file=$clientFile", 'shutdown') | Out-Null
                $manualServer.WaitForExit(15000) | Out-Null
            } catch { }
        }
        if (-not $manualServer.HasExited) { Stop-Process -Id $manualServer.Id -Force -ErrorAction SilentlyContinue }
    }
    $currentService = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($currentService -and $currentService.Status -ne 'Running') {
        try {
            Start-Service -Name $serviceName -ErrorAction Stop
            (Get-Service -Name $serviceName).WaitForStatus('Running', [TimeSpan]::FromSeconds(60))
        } catch {
            Write-Warning "MySQL80 could not be restarted automatically: $($_.Exception.Message)"
        }
    }
    Remove-Item -LiteralPath $initFile, $clientFile -Force -ErrorAction SilentlyContinue
    if (Test-Path $stderrFile) {
        Write-Warning "MySQL startup log retained for diagnosis: $stderrFile"
    }
}
