$ErrorActionPreference = "Stop"

# This script intentionally contains ASCII characters only.
# It repairs UTF-8 text that was accidentally decoded as Windows-1252.
# Every changed file is backed up before it is overwritten.

$projectRoot = Split-Path -Parent $PSScriptRoot
$desktop = [Environment]::GetFolderPath("Desktop")
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"

$backupRoot = Join-Path $desktop "handzettel-encoding-backup-$timestamp"
$reportPath = Join-Path $desktop "handzettel-encoding-report-$timestamp.txt"

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

$allowedExtensions = @(
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".json",
    ".css",
    ".scss",
    ".md",
    ".txt",
    ".sql",
    ".html",
    ".yml",
    ".yaml"
)

$excludedDirectoryPatterns = @(
    "\\node_modules\\",
    "\\.next\\",
    "\\.git\\",
    "\\.vercel\\",
    "\\dist\\",
    "\\build\\",
    "\\coverage\\",
    "\\out\\",
    "\\.turbo\\"
)

$excludedFilePatterns = @(
    "\.bak$",
    "\.backup$",
    "\.map$",
    "\.min\.js$",
    "package-lock\.json$",
    "fix-encoding\.ps1$"
)

$utf8Strict = New-Object System.Text.UTF8Encoding($false, $true)
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$windows1252 = [System.Text.Encoding]::GetEncoding(
    1252,
    [System.Text.EncoderExceptionFallback]::new(),
    [System.Text.DecoderExceptionFallback]::new()
)

function Test-ExcludedPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FullPath
    )

    foreach ($pattern in $excludedDirectoryPatterns) {
        if ($FullPath -match $pattern) {
            return $true
        }
    }

    foreach ($pattern in $excludedFilePatterns) {
        if ($FullPath -match $pattern) {
            return $true
        }
    }

    return $false
}

function Get-RelativeProjectPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FullPath
    )

    return $FullPath.Substring($projectRoot.Length).TrimStart("\")
}

function Backup-ProjectFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FullPath
    )

    $relativePath = Get-RelativeProjectPath -FullPath $FullPath
    $backupPath = Join-Path $backupRoot $relativePath
    $backupDirectory = Split-Path -Parent $backupPath

    if (-not (Test-Path -LiteralPath $backupDirectory)) {
        New-Item -ItemType Directory -Path $backupDirectory -Force |
            Out-Null
    }

    Copy-Item `
        -LiteralPath $FullPath `
        -Destination $backupPath `
        -Force
}

function Get-MojibakeScore {
    param(
        [AllowEmptyString()]
        [string]$Text
    )

    if ([string]::IsNullOrEmpty($Text)) {
        return 0
    }

    $score = 0

    foreach ($character in $Text.ToCharArray()) {
        $code = [int][char]$character

        switch ($code) {
            0x00C2 { $score += 4 }
            0x00C3 { $score += 4 }
            0x00E2 { $score += 4 }
            0x00EF { $score += 4 }
            0x0192 { $score += 3 }
            0x201A { $score += 2 }
            0x20AC { $score += 2 }
            0x017E { $score += 2 }
            0x0153 { $score += 2 }
            0x0161 { $score += 2 }
            0xFFFD { $score += 20 }
        }
    }

    return $score
}

function Convert-MojibakeLine {
    param(
        [AllowEmptyString()]
        [string]$Line
    )

    if ([string]::IsNullOrEmpty($Line)) {
        return $Line
    }

    $current = $Line

    for ($attempt = 0; $attempt -lt 3; $attempt++) {
        $currentScore = Get-MojibakeScore -Text $current

        if ($currentScore -eq 0) {
            break
        }

        try {
            $candidateBytes = $windows1252.GetBytes($current)
            $candidate = $utf8Strict.GetString($candidateBytes)
        }
        catch {
            break
        }

        $candidateScore = Get-MojibakeScore -Text $candidate

        if ($candidateScore -lt $currentScore) {
            $current = $candidate
            continue
        }

        break
    }

    return $current
}

function Convert-MojibakeContent {
    param(
        [AllowEmptyString()]
        [string]$Content
    )

    if ([string]::IsNullOrEmpty($Content)) {
        return $Content
    }

    $normalized = $Content.Replace("`r`n", "`n").Replace("`r", "`n")
    $lines = $normalized.Split("`n")
    $convertedLines = New-Object System.Collections.Generic.List[string]

    foreach ($line in $lines) {
        $convertedLines.Add(
            (Convert-MojibakeLine -Line $line)
        )
    }

    return [string]::Join("`r`n", $convertedLines)
}

function Read-ProjectTextFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FullPath
    )

    $bytes = [System.IO.File]::ReadAllBytes($FullPath)

    if ($bytes.Length -eq 0) {
        return ""
    }

    try {
        return $utf8Strict.GetString($bytes)
    }
    catch {
        return $windows1252.GetString($bytes)
    }
}

function Test-SuspiciousText {
    param(
        [AllowEmptyString()]
        [string]$Line
    )

    if ([string]::IsNullOrEmpty($Line)) {
        return $false
    }

    $uUmlaut = [char]0x00FC
    $aUmlaut = [char]0x00E4
    $oUmlaut = [char]0x00F6
    $eszett = [char]0x00DF

    $patterns = @(
        ("pr" + $uUmlaut + "fene"),
        "StraBe",
        "Grusse",
        "prufen",
        "gultig",
        "hinzugefugt",
        "Warenkorbe",
        "geoffnet",
        "zuruck",
        "fuer",
        "uber",
        "grossen",
        "Strasse"
    )

    foreach ($pattern in $patterns) {
        if ($Line.IndexOf(
            $pattern,
            [System.StringComparison]::OrdinalIgnoreCase
        ) -ge 0) {
            return $true
        }
    }

    if ($Line -match "<br\s*/?>\\n") {
        return $true
    }

    return $false
}

$files = Get-ChildItem `
    -LiteralPath $projectRoot `
    -Recurse `
    -File |
    Where-Object {
        ($allowedExtensions -contains $_.Extension.ToLowerInvariant()) -and
        (-not (Test-ExcludedPath -FullPath $_.FullName))
    }

$changedFiles = New-Object System.Collections.Generic.List[string]
$remainingFindings = New-Object System.Collections.Generic.List[string]
$textFindings = New-Object System.Collections.Generic.List[string]
$errors = New-Object System.Collections.Generic.List[string]

foreach ($file in $files) {
    $relativePath = Get-RelativeProjectPath -FullPath $file.FullName

    try {
        $original = Read-ProjectTextFile -FullPath $file.FullName
        $updated = Convert-MojibakeContent -Content $original

        if ($updated -ne $original) {
            Backup-ProjectFile -FullPath $file.FullName

            [System.IO.File]::WriteAllText(
                $file.FullName,
                $updated,
                $utf8NoBom
            )

            $changedFiles.Add($relativePath)
        }

        $lines = $updated -split "`r?`n"

        for ($index = 0; $index -lt $lines.Count; $index++) {
            $lineNumber = $index + 1
            $line = $lines[$index]
            $score = Get-MojibakeScore -Text $line

            if ($score -gt 0) {
                $remainingFindings.Add(
                    "${relativePath}:${lineNumber} :: score=${score} :: $line"
                )
            }

            if (Test-SuspiciousText -Line $line) {
                $textFindings.Add(
                    "${relativePath}:${lineNumber} :: $line"
                )
            }
        }
    }
    catch {
        $errors.Add(
            "${relativePath} :: $($_.Exception.Message)"
        )
    }
}

$report = New-Object System.Collections.Generic.List[string]

$report.Add("HANDZETTEL-SCHULEN.DE ENCODING REPORT")
$report.Add("Created: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')")
$report.Add("Project: $projectRoot")
$report.Add("Backup: $backupRoot")
$report.Add("")
$report.Add("Files scanned: $($files.Count)")
$report.Add("Files changed: $($changedFiles.Count)")
$report.Add("Remaining encoding findings: $($remainingFindings.Count)")
$report.Add("Suspicious text findings: $($textFindings.Count)")
$report.Add("Errors: $($errors.Count)")
$report.Add("")

$report.Add("============================================================")
$report.Add("CHANGED FILES")
$report.Add("============================================================")

if ($changedFiles.Count -eq 0) {
    $report.Add("No files changed.")
}
else {
    foreach ($item in $changedFiles) {
        $report.Add($item)
    }
}

$report.Add("")
$report.Add("============================================================")
$report.Add("REMAINING ENCODING FINDINGS")
$report.Add("============================================================")

if ($remainingFindings.Count -eq 0) {
    $report.Add("No remaining findings.")
}
else {
    foreach ($item in $remainingFindings) {
        $report.Add($item)
    }
}

$report.Add("")
$report.Add("============================================================")
$report.Add("SUSPICIOUS OCR OR TEXT FINDINGS")
$report.Add("============================================================")

if ($textFindings.Count -eq 0) {
    $report.Add("No suspicious text findings.")
}
else {
    foreach ($item in $textFindings) {
        $report.Add($item)
    }
}

$report.Add("")
$report.Add("============================================================")
$report.Add("ERRORS")
$report.Add("============================================================")

if ($errors.Count -eq 0) {
    $report.Add("No errors.")
}
else {
    foreach ($item in $errors) {
        $report.Add($item)
    }
}

[System.IO.File]::WriteAllLines(
    $reportPath,
    $report,
    $utf8NoBom
)

Write-Host ""
Write-Host "Encoding check completed." -ForegroundColor Green
Write-Host "Files scanned: $($files.Count)"
Write-Host "Files changed: $($changedFiles.Count)"
Write-Host "Remaining findings: $($remainingFindings.Count)"
Write-Host "Suspicious text findings: $($textFindings.Count)"
Write-Host "Errors: $($errors.Count)"
Write-Host ""
Write-Host "Backup:"
Write-Host $backupRoot
Write-Host ""
Write-Host "Report:"
Write-Host $reportPath