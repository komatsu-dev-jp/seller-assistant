param(
    [switch]$Clean
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $projectRoot 'docs/design'
$outputRoot = Join-Path $projectRoot 'apps/web/public/approved-assets'

Add-Type -AssemblyName System.Drawing

if ($Clean -and (Test-Path -LiteralPath $outputRoot)) {
    Remove-Item -LiteralPath $outputRoot -Recurse -Force
}

New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null

function Export-Crop {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Output,
        [Parameter(Mandatory = $true)][int]$X,
        [Parameter(Mandatory = $true)][int]$Y,
        [Parameter(Mandatory = $true)][int]$Width,
        [Parameter(Mandatory = $true)][int]$Height
    )

    $sourcePath = Join-Path $sourceRoot $Source
    if (-not (Test-Path -LiteralPath $sourcePath)) {
        throw "Source PNG was not found: $sourcePath"
    }

    $relativeDirectory = Split-Path -Parent $Output
    $outputDirectory = Join-Path $outputRoot $relativeDirectory
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    $outputPath = Join-Path $outputRoot $Output

    $sourceBitmap = [System.Drawing.Bitmap]::new($sourcePath)
    try {
        if ($X -lt 0 -or $Y -lt 0 -or $Width -le 0 -or $Height -le 0 -or
            ($X + $Width) -gt $sourceBitmap.Width -or ($Y + $Height) -gt $sourceBitmap.Height) {
            throw "Crop is outside source bounds ($($sourceBitmap.Width)x$($sourceBitmap.Height)): $Source [$X,$Y,$Width,$Height]"
        }

        $cropRectangle = [System.Drawing.Rectangle]::new($X, $Y, $Width, $Height)
        $cropBitmap = $sourceBitmap.Clone($cropRectangle, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        try {
            $cropBitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
        }
        finally {
            $cropBitmap.Dispose()
        }
    }
    finally {
        $sourceBitmap.Dispose()
    }

    [pscustomobject]@{
        output = ($Output -replace '\\', '/')
        source = ($Source -replace '\\', '/')
        x = $X
        y = $Y
        width = $Width
        height = $Height
    }
}

# Coordinates refer to the original approved composite PNGs, not to a resized
# browser preview. Crops intentionally stop inside the photo area so device
# frames, labels, buttons, and surrounding UI are not copied into runtime art.
$crops = @(
    # Clothing photos and close-ups from the approved mobile photo/measurement board.
    @{ Source = 'mobile-ios-redesign-b-board-03-putaway-v2.png'; Output = 'product/putaway-shirt-confirm.png'; X = 386; Y = 452; Width = 241; Height = 143 },
    @{ Source = 'mobile-ios-redesign-b-board-05-photo-measure-v1.png'; Output = 'product/shirt-front.png'; X = 330; Y = 299; Width = 90; Height = 91 },
    @{ Source = 'mobile-ios-redesign-b-board-05-photo-measure-v1.png'; Output = 'product/shirt-back.png'; X = 432; Y = 299; Width = 90; Height = 91 },
    @{ Source = 'mobile-ios-redesign-b-board-05-photo-measure-v1.png'; Output = 'product/brand-tag.png'; X = 330; Y = 411; Width = 91; Height = 77 },
    @{ Source = 'mobile-ios-redesign-b-board-05-photo-measure-v1.png'; Output = 'product/quality-label.png'; X = 432; Y = 411; Width = 91; Height = 77 },
    @{ Source = 'mobile-ios-redesign-b-board-05-photo-measure-v1.png'; Output = 'product/button-detail.png'; X = 330; Y = 523; Width = 91; Height = 77 },
    @{ Source = 'mobile-ios-redesign-b-board-05-photo-measure-v1.png'; Output = 'product/defect-detail.png'; X = 432; Y = 523; Width = 91; Height = 77 },
    @{ Source = 'mobile-ios-redesign-b-board-05-photo-measure-v1.png'; Output = 'product/shirt-flat-lay.png'; X = 594; Y = 246; Width = 225; Height = 177 },
    @{ Source = 'mobile-ios-redesign-b-board-05-photo-measure-v1.png'; Output = 'product/cuff-large.png'; X = 58; Y = 348; Width = 132; Height = 88 },
    @{ Source = 'mobile-ios-redesign-b-board-10-genre-guide-v2.png'; Output = 'product/suit-jacket.png'; X = 51; Y = 221; Width = 85; Height = 104 },
    @{ Source = 'mobile-ios-redesign-b-board-10-genre-guide-v2.png'; Output = 'product/suit-pants.png'; X = 51; Y = 374; Width = 84; Height = 121 },
    @{ Source = 'mobile-ios-redesign-b-board-10-genre-guide-v2.png'; Output = 'product/setup-top.png'; X = 875; Y = 222; Width = 74; Height = 96 },
    @{ Source = 'mobile-ios-redesign-b-board-10-genre-guide-v2.png'; Output = 'product/setup-bottom.png'; X = 875; Y = 374; Width = 74; Height = 110 },
    @{ Source = 'mobile-ios-redesign-wholesale-box-inspection-v3.png'; Output = 'product/box-item-shirt.png'; X = 530; Y = 354; Width = 176; Height = 157 },
    # Measurement source retains the ruler/guide because that is the evidence
    # a human checks; surrounding action controls are outside this rectangle.
    @{ Source = 'mobile-ios-redesign-b-board-05-photo-measure-v1.png'; Output = 'measurement/shoulder-ruler.png'; X = 1131; Y = 281; Width = 226; Height = 278 },
    @{ Source = 'pc-web-redesign-board-05-photo-measure-v1.png'; Output = 'measurement/bag-measurement.png'; X = 918; Y = 649; Width = 150; Height = 243 },
    # Approved storage/location evidence.
    @{ Source = 'mobile-ios-redesign-b-board-03-putaway-v2.png'; Output = 'storage/shelf-location-mobile.png'; X = 716; Y = 315; Width = 241; Height = 180 },
    @{ Source = 'pc-web-redesign-board-03-putaway-v4.png'; Output = 'storage/room-wide.png'; X = 294; Y = 614; Width = 135; Height = 111 },
    @{ Source = 'pc-web-redesign-board-03-putaway-v4.png'; Output = 'storage/shelf-front.png'; X = 449; Y = 614; Width = 130; Height = 111 },
    @{ Source = 'pc-web-redesign-board-03-putaway-v4.png'; Output = 'storage/position-label.png'; X = 594; Y = 614; Width = 137; Height = 111 },
    @{ Source = 'pc-web-redesign-board-03-putaway-v4.png'; Output = 'storage/product-on-shelf.png'; X = 916; Y = 806; Width = 335; Height = 126 },
    @{ Source = 'pc-web-redesign-board-09-inventory-v1.png'; Output = 'storage/inventory-shelf-01.png'; X = 299; Y = 159; Width = 96; Height = 103 },
    @{ Source = 'pc-web-redesign-board-09-inventory-v1.png'; Output = 'storage/inventory-shelf-02.png'; X = 405; Y = 159; Width = 96; Height = 103 },
    @{ Source = 'pc-web-redesign-board-09-inventory-v1.png'; Output = 'storage/inventory-shelf-03.png'; X = 511; Y = 159; Width = 101; Height = 103 },
    # The approved mobile receipt flow contains the clearest invoice paper.
    @{ Source = 'mobile-ios-redesign-b-board-02-purchase-v3.png'; Output = 'documents/invoice-preview.png'; X = 714; Y = 365; Width = 237; Height = 314 },
    @{ Source = 'pc-web-redesign-board-02-purchase-box-v3.png'; Output = 'documents/invoice-preview-pc.png'; X = 373; Y = 132; Width = 131; Height = 260 },
    # Shipping/packing evidence from the approved PC workflow.
    @{ Source = 'pc-web-redesign-board-08-orders-shipping-v3.png'; Output = 'shipping/packing-box.png'; X = 347; Y = 775; Width = 174; Height = 80 },
    @{ Source = 'pc-web-redesign-board-02-purchase-box-v3.png'; Output = 'shipping/product-example.png'; X = 367; Y = 663; Width = 138; Height = 69 },
    @{ Source = 'pc-web-redesign-board-08-orders-shipping-v3.png'; Output = 'shipping/shelf-order-photo.png'; X = 1290; Y = 171; Width = 211; Height = 143 },
    # Mobile 35 uses a different, wider shelf photo than the PC shipping flow.
    @{ Source = 'mobile-ios-redesign-b-board-07-shipping-v4.png'; Output = 'shipping/mobile-pickup-shelf-approved.png'; X = 380; Y = 438; Width = 249; Height = 141 },
    # Higher-resolution label close-ups from the approved PC listing board.
    @{ Source = 'pc-web-redesign-board-06-product-listing-v1.png'; Output = 'product/brand-tag-pc.png'; X = 160; Y = 139; Width = 146; Height = 125 },
    @{ Source = 'pc-web-redesign-board-06-product-listing-v1.png'; Output = 'product/quality-label-pc.png'; X = 314; Y = 139; Width = 143; Height = 125 },
    @{ Source = 'pc-web-redesign-board-06-product-listing-v1.png'; Output = 'product/size-label-pc.png'; X = 160; Y = 273; Width = 146; Height = 117 },
    @{ Source = 'pc-web-redesign-board-06-product-listing-v1.png'; Output = 'product/text-label-pc.png'; X = 314; Y = 273; Width = 143; Height = 117 },
    @{ Source = 'pc-web-redesign-board-06-product-listing-v1.png'; Output = 'product/listing-shirt.png'; X = 919; Y = 68; Width = 140; Height = 112 }
)

$records = foreach ($crop in $crops) {
    Export-Crop @crop
}

$records | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputRoot 'crop-manifest.json') -Encoding UTF8
Write-Output ("Extracted {0} approved UI photo crops to {1}" -f $records.Count, $outputRoot)
