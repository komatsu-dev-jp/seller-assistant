param(
    [string]$CurrentRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) 'output/playwright'),
    [string]$ReferenceRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) 'docs/design'),
    [string]$OutputRoot = (Join-Path (Split-Path -Parent $PSScriptRoot) 'output/playwright/approved-ui-comparison'),
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'

# This script intentionally uses only the Windows-included System.Drawing API.
# It does not download packages, contact a service, or modify application code.
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$referenceCropRoot = Join-Path $OutputRoot 'reference-crops'
$currentCropRoot = Join-Path $OutputRoot 'current-crops'
$sheetRoot = Join-Path $OutputRoot 'sheets'

# The comparison output is the only writable target. Keep -Clean bounded to
# this dedicated folder (or a child folder explicitly supplied by the caller)
# so a typo cannot remove a project root, drive root, or broad directory.
$approvedOutputBase = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'output/playwright/approved-ui-comparison')).TrimEnd('\', '/')
$resolvedOutputRoot = [System.IO.Path]::GetFullPath($OutputRoot).TrimEnd('\', '/')
$approvedOutputPrefix = $approvedOutputBase + [System.IO.Path]::DirectorySeparatorChar
if (-not ($resolvedOutputRoot.Equals($approvedOutputBase, [System.StringComparison]::OrdinalIgnoreCase) -or
          $resolvedOutputRoot.StartsWith($approvedOutputPrefix, [System.StringComparison]::OrdinalIgnoreCase))) {
    throw "OutputRoot must be the dedicated comparison folder or one of its children: $approvedOutputBase"
}
$OutputRoot = $resolvedOutputRoot
$referenceCropRoot = Join-Path $OutputRoot 'reference-crops'
$currentCropRoot = Join-Path $OutputRoot 'current-crops'
$sheetRoot = Join-Path $OutputRoot 'sheets'

if ($Clean -and (Test-Path -LiteralPath $OutputRoot)) {
    Remove-Item -LiteralPath $OutputRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $OutputRoot, $referenceCropRoot, $currentCropRoot, $sheetRoot -Force | Out-Null

function Get-AbsolutePath {
    param([Parameter(Mandatory = $true)][string]$Path)

    if ([System.IO.Path]::IsPathRooted($Path)) {
        return [System.IO.Path]::GetFullPath($Path)
    }
    return [System.IO.Path]::GetFullPath((Join-Path $projectRoot $Path))
}

function Get-RelativeProjectPath {
    param([Parameter(Mandatory = $true)][string]$Path)

    $absolute = [System.IO.Path]::GetFullPath($Path)
    $rootWithSeparator = $projectRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    if ($absolute.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)) {
        return $absolute.Substring($rootWithSeparator.Length).Replace('\', '/')
    }
    return $absolute.Replace('\', '/')
}

function Assert-ImageSize {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][int]$Width,
        [Parameter(Mandatory = $true)][int]$Height
    )

    $bitmap = [System.Drawing.Bitmap]::new($Path)
    try {
        if ($bitmap.Width -ne $Width -or $bitmap.Height -ne $Height) {
            throw "Unexpected approved PNG size: $Path ($($bitmap.Width)x$($bitmap.Height)); expected ${Width}x${Height}."
        }
    }
    finally {
        $bitmap.Dispose()
    }
}

function Save-ReferenceCrop {
    param(
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][int]$X,
        [Parameter(Mandatory = $true)][int]$Y,
        [Parameter(Mandatory = $true)][int]$Width,
        [Parameter(Mandatory = $true)][int]$Height,
        [Parameter(Mandatory = $true)][string]$OutputPath
    )

    $source = [System.Drawing.Bitmap]::new($SourcePath)
    try {
        if ($X -lt 0 -or $Y -lt 0 -or $Width -le 0 -or $Height -le 0 -or
            ($X + $Width) -gt $source.Width -or ($Y + $Height) -gt $source.Height) {
            throw "Reference crop is outside source bounds: $SourcePath [$X,$Y,$Width,$Height]"
        }

        $rectangle = [System.Drawing.Rectangle]::new($X, $Y, $Width, $Height)
        $crop = $source.Clone($rectangle, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $crop.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally {
            $crop.Dispose()
        }
    }
    finally {
        $source.Dispose()
    }
}

function Find-CurrentScreenshot {
    param(
        [Parameter(Mandatory = $true)][string]$Platform,
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][int]$ScreenNumber,
        [string]$BoardNumber = ''
    )

    $names = New-Object System.Collections.Generic.List[string]
    if ($Platform -eq 'mobile') {
        [void]$names.Add("mobile-independent-reaudit-$Key.png")
        [void]$names.Add("mobile-fidelity-final2-$Key.png")
        [void]$names.Add("mobile-fidelity-75-$Key.png")
        [void]$names.Add("mobile-final-all-$Key.png")
        if ($Key -match '^\d+$') {
            [void]$names.Add("mobile-final-$Key.png")
            [void]$names.Add("mobile-audit-$Key.png")
            [void]$names.Add("root-mobile-p0-$Key.png")
            [void]$names.Add("root-mobile-p0b-$Key.png")
            [void]$names.Add("mobile-screen-$Key.png")
        }
        else {
            [void]$names.Add("mobile-final-$Key.png")
            [void]$names.Add("mobile-audit-$Key.png")
            [void]$names.Add("root-mobile-p0-$Key.png")
            [void]$names.Add("root-mobile-p0b-$Key.png")
        }
    }
    else {
        $screen = $ScreenNumber.ToString('00')
        [void]$names.Add("pc-$screen.png")
        [void]$names.Add("pc-fidelity-$screen-1440.png")
        [void]$names.Add("pc-final-all-$screen.png")
        [void]$names.Add("pc-final-$screen.png")
        [void]$names.Add("pc-final-screen-$screen.png")
        [void]$names.Add("pc-audit-$screen.png")
        [void]$names.Add("pc-current-$screen.png")
        [void]$names.Add("pc-screen-$screen.png")
        # The currently captured board screenshot is only used for its own
        # screen number. It is never reused as a different screen's current.
        [void]$names.Add("pc-final-board-$BoardNumber-screen-$screen.png")
    }

    foreach ($name in $names) {
        $directPath = Join-Path $CurrentRoot $name
        if (Test-Path -LiteralPath $directPath -PathType Leaf) {
            return [System.IO.Path]::GetFullPath($directPath)
        }

        if (Test-Path -LiteralPath $CurrentRoot -PathType Container) {
            $nested = Get-ChildItem -LiteralPath $CurrentRoot -Recurse -File -Filter $name -ErrorAction SilentlyContinue |
                Select-Object -First 1
            if ($null -ne $nested) {
                return $nested.FullName
            }
        }
    }

    return $null
}

function New-Frame {
    param(
        [Parameter(Mandatory = $true)][string[]]$Keys,
        [Parameter(Mandatory = $true)][int]$X,
        [Parameter(Mandatory = $true)][int]$Y,
        [Parameter(Mandatory = $true)][int]$Width,
        [Parameter(Mandatory = $true)][int]$Height
    )

    return [pscustomobject]@{
        Keys = $Keys
        X = $X
        Y = $Y
        Width = $Width
        Height = $Height
    }
}

# Measured display-area rectangles for each approved mobile composite. These
# crop inside the black device frame and exclude the board title/number labels.
$mobileBoards = @(
    [pscustomobject]@{ Group = 'mobile-board-01'; Source = 'mobile-ios-redesign-b-board-01-entry-v2.png'; Frames = @(
        (New-Frame @('01') 31 188 227 661),
        (New-Frame @('02') 305 188 227 661),
        (New-Frame @('03') 578 188 227 661),
        (New-Frame @('04') 852 188 228 661),
        (New-Frame @('05') 1126 188 228 661),
        (New-Frame @('06') 1402 188 227 661)
    ) }
    [pscustomobject]@{ Group = 'mobile-board-02'; Source = 'mobile-ios-redesign-b-board-02-purchase-v3.png'; Frames = @(
        (New-Frame @('07') 39 148 279 708),
        (New-Frame @('08') 367 148 279 708),
        (New-Frame @('09') 695 148 279 708),
        (New-Frame @('10') 1023 148 279 708),
        (New-Frame @('11') 1353 148 279 708)
    ) }
    [pscustomobject]@{ Group = 'mobile-board-03'; Source = 'mobile-ios-redesign-b-board-03-putaway-v2.png'; Frames = @(
        (New-Frame @('12') 38 145 283 710),
        (New-Frame @('13') 369 145 283 710),
        (New-Frame @('14') 701 145 283 710),
        (New-Frame @('15') 1032 145 283 710),
        (New-Frame @('16') 1363 145 281 710)
    ) }
    [pscustomobject]@{ Group = 'mobile-board-04'; Source = 'mobile-ios-redesign-b-board-04-inspection-v1.png'; Frames = @(
        (New-Frame @('17') 30 151 230 689),
        (New-Frame @('18') 304 151 230 689),
        (New-Frame @('19') 577 151 231 689),
        (New-Frame @('20') 851 151 231 689),
        (New-Frame @('21') 1125 151 231 689),
        (New-Frame @('22') 1399 151 231 689)
    ) }
    [pscustomobject]@{ Group = 'mobile-board-05'; Source = 'mobile-ios-redesign-b-board-05-photo-measure-v1.png'; Frames = @(
        (New-Frame @('23') 39 156 229 668),
        (New-Frame @('24') 317 156 229 668),
        (New-Frame @('25') 594 156 229 668),
        (New-Frame @('26') 871 156 229 668),
        (New-Frame @('27') 1148 156 229 668),
        (New-Frame @('28') 1425 156 229 668)
    ) }
    [pscustomobject]@{ Group = 'mobile-board-06'; Source = 'mobile-ios-redesign-b-board-06-product-info-v6.png'; Frames = @(
        (New-Frame @('29', 'photo-01') 28 188 204 620),
        (New-Frame @('30', 'photo-02') 261 188 204 620),
        (New-Frame @('31', 'photo-03') 499 188 204 620),
        (New-Frame @('32', 'photo-04') 732 188 204 620),
        (New-Frame @('33', 'photo-05') 965 188 204 620),
        (New-Frame @('photo-06') 1198 188 204 620),
        (New-Frame @('photo-07') 1431 188 204 620)
    ) }
    [pscustomobject]@{ Group = 'mobile-board-07'; Source = 'mobile-ios-redesign-b-board-07-shipping-v4.png'; Frames = @(
        (New-Frame @('34') 47 155 272 708),
        (New-Frame @('35') 365 155 272 708),
        (New-Frame @('36') 695 155 272 708),
        (New-Frame @('37') 1024 155 272 708),
        (New-Frame @('38') 1352 155 272 708)
    ) }
    [pscustomobject]@{ Group = 'mobile-board-08'; Source = 'mobile-ios-redesign-b-board-08-exceptions-v2.png'; Frames = @(
        (New-Frame @('39') 38 146 280 716),
        (New-Frame @('40') 373 146 280 716),
        (New-Frame @('41') 699 146 280 716),
        (New-Frame @('42') 1029 146 280 716),
        (New-Frame @('43') 1359 146 280 716)
    ) }
    [pscustomobject]@{ Group = 'mobile-board-09'; Source = 'mobile-ios-redesign-b-board-09-accounting-v1.png'; Frames = @(
        (New-Frame @('44') 30 163 239 655),
        (New-Frame @('45') 306 163 239 655),
        (New-Frame @('46') 585 163 239 655),
        (New-Frame @('47') 864 163 239 655),
        (New-Frame @('48') 1141 163 239 655),
        (New-Frame @('49') 1420 163 239 655)
    ) }
    [pscustomobject]@{ Group = 'mobile-extra-box'; Source = 'mobile-ios-redesign-wholesale-box-inspection-v3.png'; Frames = @(
        (New-Frame @('box-01') 28 208 204 616),
        (New-Frame @('box-02') 261 208 204 616),
        (New-Frame @('box-03') 494 208 204 616),
        (New-Frame @('box-04') 727 208 204 616),
        (New-Frame @('box-05') 961 208 204 616),
        (New-Frame @('box-06') 1194 208 204 616),
        (New-Frame @('box-07') 1428 208 204 616)
    ) }
    [pscustomobject]@{ Group = 'mobile-extra-sales'; Source = 'mobile-ios-redesign-sales-support-v3.png'; Frames = @(
        (New-Frame @('sales-01') 31 171 230 670),
        (New-Frame @('sales-02') 305 171 230 670),
        (New-Frame @('sales-03') 579 171 230 670),
        (New-Frame @('sales-04') 853 171 230 670),
        (New-Frame @('sales-05') 1127 171 230 670),
        (New-Frame @('sales-06') 1400 171 230 670)
    ) }
    [pscustomobject]@{ Group = 'mobile-extra-genre-suit'; Source = 'mobile-ios-redesign-b-board-10-genre-guide-v2.png'; Frames = @(
        (New-Frame @('genre-suit-01') 38 130 230 661),
        (New-Frame @('genre-suit-02') 312 130 230 661),
        (New-Frame @('genre-suit-03') 585 130 230 661),
        (New-Frame @('genre-suit-04') 859 130 230 661),
        (New-Frame @('genre-suit-05') 1132 130 230 661),
        (New-Frame @('genre-suit-06') 1404 130 230 661)
    ) }
)

# PC approved boards are 1536x1024 composites with four measured 768x512
# quadrants. Each quadrant is one screen; no board image is reused as another
# screen's reference.
$pcSources = @(
    'pc-web-redesign-board-01-home-v1.png',
    'pc-web-redesign-board-02-purchase-box-v3.png',
    'pc-web-redesign-board-03-putaway-v4.png',
    'pc-web-redesign-board-04-inspection-v1.png',
    'pc-web-redesign-board-05-photo-measure-v1.png',
    'pc-web-redesign-board-06-product-listing-v1.png',
    'pc-web-redesign-board-07-sales-support-v2.png',
    'pc-web-redesign-board-08-orders-shipping-v3.png',
    'pc-web-redesign-board-09-inventory-v1.png',
    'pc-web-redesign-board-10-team-v1.png',
    'pc-web-redesign-board-11-analytics-v1.png',
    'pc-web-redesign-board-12-accounting-v1.png',
    'pc-web-redesign-board-13-settings-v1.png'
)

$records = New-Object System.Collections.Generic.List[object]
$mobileNumericKeys = New-Object System.Collections.Generic.List[string]
$mobileExtraKeys = New-Object System.Collections.Generic.List[string]

foreach ($board in $mobileBoards) {
    $sourcePath = Get-AbsolutePath (Join-Path $ReferenceRoot $board.Source)
    Assert-ImageSize -Path $sourcePath -Width 1672 -Height 941

    foreach ($frame in $board.Frames) {
        foreach ($key in $frame.Keys) {
            $id = "mobile:$key"
            $safeKey = $key.Replace('/', '-')
            $referenceRelative = "reference-crops/mobile-$safeKey.png"
            $referencePath = Join-Path $OutputRoot $referenceRelative
            Save-ReferenceCrop -SourcePath $sourcePath -X $frame.X -Y $frame.Y -Width $frame.Width -Height $frame.Height -OutputPath $referencePath

            if ($key -match '^\d+$') {
                [void]$mobileNumericKeys.Add($key)
                $screenNumber = [int]$key
            }
            else {
                [void]$mobileExtraKeys.Add($key)
                $screenNumber = 0
            }

            $currentPath = Find-CurrentScreenshot -Platform 'mobile' -Key $key -ScreenNumber $screenNumber -BoardNumber ''
            $currentRelative = $null
            if ($null -ne $currentPath) {
                $currentRelative = "current-crops/mobile-$safeKey.png"
                Copy-Item -LiteralPath $currentPath -Destination (Join-Path $OutputRoot $currentRelative) -Force
            }

            [void]$records.Add([pscustomobject]@{
                Id = $id
                Platform = 'mobile'
                Key = $key
                ScreenNumber = $screenNumber
                Group = $board.Group
                Source = (Join-Path 'docs/design' $board.Source).Replace('\', '/')
                X = $frame.X
                Y = $frame.Y
                Width = $frame.Width
                Height = $frame.Height
                Reference = $referenceRelative.Replace('\', '/')
                Current = $currentRelative
                CurrentSource = $null
                CurrentStatus = 'missing'
            })
            if ($null -ne $currentPath) {
                $records[$records.Count - 1].CurrentSource = Get-RelativeProjectPath $currentPath
                $records[$records.Count - 1].CurrentStatus = 'found'
            }
        }
    }
}

$expectedMobileNumeric = 1..49 | ForEach-Object { $_.ToString('00') }
$expectedMobileExtras = @(
    'photo-01', 'photo-02', 'photo-03', 'photo-04', 'photo-05', 'photo-06', 'photo-07',
    'box-01', 'box-02', 'box-03', 'box-04', 'box-05', 'box-06', 'box-07',
    'sales-01', 'sales-02', 'sales-03', 'sales-04', 'sales-05', 'sales-06',
    'genre-suit-01', 'genre-suit-02', 'genre-suit-03', 'genre-suit-04', 'genre-suit-05', 'genre-suit-06'
)

$actualMobileNumeric = @($mobileNumericKeys | Sort-Object -Unique)
$actualMobileExtras = @($mobileExtraKeys | Sort-Object -Unique)
if ($actualMobileNumeric.Count -ne 49 -or (@($actualMobileNumeric) -join ',') -ne (@($expectedMobileNumeric) -join ',')) {
    throw "Mobile canonical mapping is not exactly 01..49: $(@($actualMobileNumeric) -join ', ')"
}
if ($actualMobileExtras.Count -ne 26 -or (@($actualMobileExtras | Sort-Object) -join ',') -ne (@($expectedMobileExtras | Sort-Object) -join ',')) {
    throw "Mobile extra mapping is not exactly 26 unique keys: $(@($actualMobileExtras) -join ', ')"
}

for ($boardIndex = 0; $boardIndex -lt $pcSources.Count; $boardIndex++) {
    $boardNumber = ($boardIndex + 1).ToString('00')
    $sourceName = $pcSources[$boardIndex]
    $sourcePath = Get-AbsolutePath (Join-Path $ReferenceRoot $sourceName)
    Assert-ImageSize -Path $sourcePath -Width 1536 -Height 1024

    for ($quadrant = 0; $quadrant -lt 4; $quadrant++) {
        $screenNumber = ($boardIndex * 4) + $quadrant + 1
        $key = $screenNumber.ToString('00')
        $x = 768
        if (($quadrant % 2) -eq 0) {
            $x = 0
        }
        $y = 512
        if ($quadrant -lt 2) {
            $y = 0
        }
        $referenceRelative = "reference-crops/pc-$key.png"
        $referencePath = Join-Path $OutputRoot $referenceRelative
        Save-ReferenceCrop -SourcePath $sourcePath -X $x -Y $y -Width 768 -Height 512 -OutputPath $referencePath

        $currentPath = Find-CurrentScreenshot -Platform 'pc' -Key $key -ScreenNumber $screenNumber -BoardNumber $boardNumber
        $currentRelative = $null
        if ($null -ne $currentPath) {
            $currentRelative = "current-crops/pc-$key.png"
            Copy-Item -LiteralPath $currentPath -Destination (Join-Path $OutputRoot $currentRelative) -Force
        }

        [void]$records.Add([pscustomobject]@{
            Id = "pc:$key"
            Platform = 'pc'
            Key = $key
            ScreenNumber = $screenNumber
            Group = "pc-board-$boardNumber"
            Source = (Join-Path 'docs/design' $sourceName).Replace('\', '/')
            X = $x
            Y = $y
            Width = 768
            Height = 512
            Reference = $referenceRelative.Replace('\', '/')
            Current = $currentRelative
            CurrentSource = $null
            CurrentStatus = 'missing'
        })
        if ($null -ne $currentPath) {
            $records[$records.Count - 1].CurrentSource = Get-RelativeProjectPath $currentPath
            $records[$records.Count - 1].CurrentStatus = 'found'
        }
    }
}

$uniqueIds = @($records | Select-Object -ExpandProperty Id | Sort-Object -Unique)
if ($records.Count -ne 127 -or $uniqueIds.Count -ne 127) {
    throw "Expected 127 unique routes (75 mobile + 52 PC); got $($records.Count) records and $($uniqueIds.Count) IDs."
}

$records |
    Select-Object Id, Platform, Key, ScreenNumber, Group, Source, X, Y, Width, Height, Reference, Current, CurrentSource, CurrentStatus |
    Export-Csv -LiteralPath (Join-Path $OutputRoot 'route-map.csv') -NoTypeInformation -Encoding UTF8

$records |
    ConvertTo-Json -Depth 5 |
    Set-Content -LiteralPath (Join-Path $OutputRoot 'route-map.json') -Encoding UTF8

function Draw-FittedImage {
    param(
        [Parameter(Mandatory = $true)][System.Drawing.Graphics]$Graphics,
        [Parameter(Mandatory = $true)][System.Drawing.Bitmap]$Bitmap,
        [Parameter(Mandatory = $true)][System.Drawing.RectangleF]$Box,
        [Parameter(Mandatory = $true)][System.Drawing.Brush]$BackgroundBrush,
        [switch]$Stretch
    )

    $Graphics.FillRectangle($BackgroundBrush, $Box)
    if ($Stretch) {
        # Approved mobile boards render an iPhone inside a compressed mockup.
        # Normalize that display area to the required 390x844 capture ratio so
        # its coordinates can be compared directly with the browser capture.
        $Graphics.DrawImage($Bitmap, $Box)
        return
    }

    $ratio = [Math]::Min($Box.Width / $Bitmap.Width, $Box.Height / $Bitmap.Height)
    $drawWidth = $Bitmap.Width * $ratio
    $drawHeight = $Bitmap.Height * $ratio
    $drawX = $Box.X + (($Box.Width - $drawWidth) / 2)
    $drawY = $Box.Y + (($Box.Height - $drawHeight) / 2)
    $destination = [System.Drawing.RectangleF]::new($drawX, $drawY, $drawWidth, $drawHeight)
    $Graphics.DrawImage($Bitmap, $destination)
}

function Draw-RoutePair {
    param(
        [Parameter(Mandatory = $true)][System.Drawing.Graphics]$Graphics,
        [Parameter(Mandatory = $true)][pscustomobject]$Record,
        [Parameter(Mandatory = $true)][float]$OffsetX,
        [Parameter(Mandatory = $true)][float]$OffsetY,
        [Parameter(Mandatory = $true)][int]$TileWidth,
        [Parameter(Mandatory = $true)][int]$TileHeight,
        [Parameter(Mandatory = $true)][System.Drawing.Font]$HeaderFont,
        [Parameter(Mandatory = $true)][System.Drawing.Font]$SmallFont,
        [Parameter(Mandatory = $true)][System.Drawing.Font]$MissingFont,
        [Parameter(Mandatory = $true)][System.Drawing.Brush]$TextBrush,
        [Parameter(Mandatory = $true)][System.Drawing.Brush]$MutedBrush,
        [Parameter(Mandatory = $true)][System.Drawing.Brush]$MissingBrush,
        [Parameter(Mandatory = $true)][System.Drawing.Pen]$BorderPen,
        [Parameter(Mandatory = $true)][System.Drawing.Brush]$WhiteBrush,
        [Parameter(Mandatory = $true)][System.Drawing.Brush]$PanelBrush
    )

    $pairGap = 14
    $imageTop = 58
    $imageHeight = $TileHeight - $imageTop - 14
    $halfWidth = [int](($TileWidth - $pairGap) / 2)
    $refBox = [System.Drawing.RectangleF]::new($OffsetX, $OffsetY + $imageTop, $halfWidth, $imageHeight)
    $currentBox = [System.Drawing.RectangleF]::new($OffsetX + $halfWidth + $pairGap, $OffsetY + $imageTop, $halfWidth, $imageHeight)
    if ($Record.Platform -eq 'mobile') {
        $normalizedWidth = [float]($imageHeight * 390 / 844)
        $refBox = [System.Drawing.RectangleF]::new(
            $OffsetX + (($halfWidth - $normalizedWidth) / 2),
            $OffsetY + $imageTop,
            $normalizedWidth,
            $imageHeight
        )
        $currentBox = [System.Drawing.RectangleF]::new(
            $OffsetX + $halfWidth + $pairGap + (($halfWidth - $normalizedWidth) / 2),
            $OffsetY + $imageTop,
            $normalizedWidth,
            $imageHeight
        )
    }

    $headerText = $Record.Platform.ToUpperInvariant() + ' ' + $Record.Key + '  APPROVED'
    $Graphics.DrawString($headerText, $HeaderFont, $TextBrush, $OffsetX, $OffsetY + 4)
    $currentLabel = 'CURRENT (MISSING)'
    $currentLabelBrush = $MutedBrush
    if ($Record.CurrentStatus -eq "found") {
        $currentLabel = 'CURRENT'
        $currentLabelBrush = $TextBrush
    }
    $Graphics.DrawString($currentLabel, $HeaderFont, $currentLabelBrush, $currentBox.X, $OffsetY + 4)

    $Graphics.DrawRectangle($BorderPen, [System.Drawing.Rectangle]::new([int]$refBox.X, [int]$refBox.Y, [int]$refBox.Width, [int]$refBox.Height))
    $Graphics.DrawRectangle($BorderPen, [System.Drawing.Rectangle]::new([int]$currentBox.X, [int]$currentBox.Y, [int]$currentBox.Width, [int]$currentBox.Height))

    $referencePath = Join-Path $OutputRoot $Record.Reference
    $referenceBitmap = [System.Drawing.Bitmap]::new($referencePath)
    try {
        Draw-FittedImage -Graphics $Graphics -Bitmap $referenceBitmap -Box $refBox -BackgroundBrush $WhiteBrush -Stretch:($Record.Platform -eq 'mobile')
    }
    finally {
        $referenceBitmap.Dispose()
    }

    if ($Record.CurrentStatus -eq "found") {
        $currentPath = Join-Path $OutputRoot $Record.Current
        $currentBitmap = [System.Drawing.Bitmap]::new($currentPath)
        try {
            Draw-FittedImage -Graphics $Graphics -Bitmap $currentBitmap -Box $currentBox -BackgroundBrush $WhiteBrush -Stretch:($Record.Platform -eq 'mobile')
        }
        finally {
            $currentBitmap.Dispose()
        }
    }
    else {
        $Graphics.FillRectangle($MissingBrush, $currentBox)
        $Graphics.DrawString('CURRENT MISSING', $MissingFont, $MutedBrush, $currentBox.X + 18, $currentBox.Y + ($currentBox.Height / 2) - 14)
    }

    $caption = "Source: $($Record.Source)  [$($Record.X),$($Record.Y),$($Record.Width),$($Record.Height)]"
    $Graphics.DrawString($caption, $SmallFont, $MutedBrush, $OffsetX, $OffsetY + $TileHeight - 13)
}

$tileWidth = 744
$tileHeight = 590
$sheetColumns = 2
$headerFont = [System.Drawing.Font]::new('Segoe UI', 15, [System.Drawing.FontStyle]::Bold)
$smallFont = [System.Drawing.Font]::new('Segoe UI', 8, [System.Drawing.FontStyle]::Regular)
$missingFont = [System.Drawing.Font]::new('Segoe UI', 17, [System.Drawing.FontStyle]::Bold)
$textBrush = [System.Drawing.Brushes]::MidnightBlue
$mutedBrush = [System.Drawing.Brushes]::DimGray
$missingBrush = [System.Drawing.Brushes]::MistyRose
$whiteBrush = [System.Drawing.Brushes]::White
$panelBrush = [System.Drawing.Brushes]::AliceBlue
$borderPen = [System.Drawing.Pen]::new([System.Drawing.Color]::LightSteelBlue, 1)

try {
    $groups = @($records | Group-Object Group | Sort-Object Name)
    foreach ($group in $groups) {
        $groupRecords = @($group.Group | Sort-Object Platform, ScreenNumber, Key)
        $rows = [Math]::Ceiling($groupRecords.Count / $sheetColumns)
        $groupTileHeight = $tileHeight
        if ($groupRecords[0].Platform -eq 'pc') {
            $groupTileHeight = 370
        }
        $sheetWidth = $tileWidth * $sheetColumns
        $sheetHeight = [int]($groupTileHeight * $rows)
        $sheet = [System.Drawing.Bitmap]::new($sheetWidth, $sheetHeight)
        $graphics = [System.Drawing.Graphics]::FromImage($sheet)
        try {
            $graphics.Clear([System.Drawing.Color]::White)
            $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
            for ($i = 0; $i -lt $groupRecords.Count; $i++) {
                $column = $i % $sheetColumns
                $row = [Math]::Floor($i / $sheetColumns)
                Draw-RoutePair -Graphics $graphics -Record $groupRecords[$i] -OffsetX ($column * $tileWidth + 8) -OffsetY ($row * $groupTileHeight + 8) -TileWidth ($tileWidth - 16) -TileHeight ($groupTileHeight - 16) -HeaderFont $headerFont -SmallFont $smallFont -MissingFont $missingFont -TextBrush $textBrush -MutedBrush $mutedBrush -MissingBrush $missingBrush -BorderPen $borderPen -WhiteBrush $whiteBrush -PanelBrush $panelBrush
            }
            $sheetPath = Join-Path $sheetRoot "$($group.Name).png"
            $sheet.Save($sheetPath, [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally {
            $graphics.Dispose()
            $sheet.Dispose()
        }
    }
}
finally {
    $headerFont.Dispose()
    $smallFont.Dispose()
    $missingFont.Dispose()
    $borderPen.Dispose()
}

$foundCount = @($records | Where-Object CurrentStatus -eq 'found').Count
$missingCount = @($records | Where-Object CurrentStatus -eq 'missing').Count
$readme = @'
# Approved UI comparison sheets

These local sheets place approved reference PNG display areas next to implementation screenshots for visual review. The script uses the built-in PowerShell System.Drawing API only. It makes no network request and installs no package.

## Generate

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\compare-approved-ui.ps1 -Clean
```

To use implementation screenshots from another folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\compare-approved-ui.ps1 -Clean -CurrentRoot .\path\to\current-screenshots
```

## Output

- `sheets/`: board sheets (approved reference on the left, current implementation on the right)
- `reference-crops/`: display areas cropped from each approved PNG
- `current-crops/`: copies of current screenshots that were found
- `route-map.csv` / `route-map.json`: source, measured rectangle, route key, and current status

## Route counts

- Mobile canonical: 49 routes (01-49)
- Mobile extras: 26 routes (photo 7 / box 7 / sales 6 / genre-suit 6)
- PC: 52 routes (13 boards x 2x2)
- Total: 127 unique routes

For the current input, __FOUND_COUNT__ current screenshots were found and __MISSING_COUNT__ were not found. Missing entries are shown as `CURRENT MISSING`; this means a comparison screenshot is absent, not that the implementation is automatically incorrect.
'@
$readme = $readme.Replace('__FOUND_COUNT__', $foundCount.ToString()).Replace('__MISSING_COUNT__', $missingCount.ToString())
Set-Content -LiteralPath (Join-Path $OutputRoot 'README.md') -Value $readme -Encoding UTF8

Write-Output ("Generated 127 unique comparison routes: {0} current found, {1} current missing." -f $foundCount, $missingCount)
