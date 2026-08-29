param()

$ErrorActionPreference = 'Stop'

# This script extracts only the photo rectangles from the approved PC boards.
# It never contacts a service and never changes the existing approved-assets
# folders.  Coordinates refer to the original 1536x1024 source PNGs.
$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceRoot = Join-Path $projectRoot 'docs/design'
$outputRoot = Join-Path $projectRoot 'apps/web/public/approved-assets/pc-fidelity'

Add-Type -AssemblyName System.Drawing
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

    $outputPath = Join-Path $outputRoot $Output
    $outputDirectory = Split-Path -Parent $outputPath
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

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

$crops = @(
    # PC01 / login: the approved blue garment mark with four corner brackets.
    @{ Source = 'pc-web-redesign-board-01-home-v1.png'; Output = 'login/logo-blue-garment.png'; X = 358; Y = 94; Width = 115; Height = 104 },

    # PC04 / screens 13-16: six clean garment photos on the approved type grid.
    @{ Source = 'pc-web-redesign-board-04-inspection-v1.png'; Output = 'inspection/shirt-blue.png'; X = 124; Y = 130; Width = 82; Height = 106 },
    @{ Source = 'pc-web-redesign-board-04-inspection-v1.png'; Output = 'inspection/knit-beige.png'; X = 335; Y = 130; Width = 82; Height = 106 },
    @{ Source = 'pc-web-redesign-board-04-inspection-v1.png'; Output = 'inspection/outer-black.png'; X = 547; Y = 130; Width = 86; Height = 106 },
    @{ Source = 'pc-web-redesign-board-04-inspection-v1.png'; Output = 'inspection/pants-beige.png'; X = 124; Y = 272; Width = 82; Height = 103 },
    @{ Source = 'pc-web-redesign-board-04-inspection-v1.png'; Output = 'inspection/dress-green.png'; X = 335; Y = 272; Width = 82; Height = 103 },
    @{ Source = 'pc-web-redesign-board-04-inspection-v1.png'; Output = 'inspection/bag-black.png'; X = 547; Y = 272; Width = 86; Height = 103 },

    # PC05 / screens 17-20: the approved beige tote photo set.  These crops
    # deliberately exclude card labels and action buttons.
    @{ Source = 'pc-web-redesign-board-05-photo-measure-v1.png'; Output = 'product/beige-tote-front.png'; X = 138; Y = 135; Width = 104; Height = 149 },
    @{ Source = 'pc-web-redesign-board-05-photo-measure-v1.png'; Output = 'product/beige-tote-back.png'; X = 258; Y = 135; Width = 104; Height = 149 },
    @{ Source = 'pc-web-redesign-board-05-photo-measure-v1.png'; Output = 'product/beige-tote-brand-tag.png'; X = 379; Y = 135; Width = 111; Height = 149 },
    @{ Source = 'pc-web-redesign-board-05-photo-measure-v1.png'; Output = 'product/beige-tote-quality-label.png'; X = 509; Y = 135; Width = 104; Height = 149 },
    @{ Source = 'pc-web-redesign-board-05-photo-measure-v1.png'; Output = 'product/beige-tote-detail.png'; X = 629; Y = 135; Width = 112; Height = 149 },

    # PC20 / measurement evidence: the five numbered ruler photos shown next
    # to the measurement table (and the optional circumference proof).
    @{ Source = 'pc-web-redesign-board-05-photo-measure-v1.png'; Output = 'measurement/tote-height.png'; X = 1245; Y = 653; Width = 45; Height = 55 },
    @{ Source = 'pc-web-redesign-board-05-photo-measure-v1.png'; Output = 'measurement/tote-opening-width.png'; X = 1294; Y = 653; Width = 45; Height = 55 },
    @{ Source = 'pc-web-redesign-board-05-photo-measure-v1.png'; Output = 'measurement/tote-flat-width.png'; X = 1343; Y = 653; Width = 45; Height = 55 },
    @{ Source = 'pc-web-redesign-board-05-photo-measure-v1.png'; Output = 'measurement/tote-base-width.png'; X = 1392; Y = 653; Width = 45; Height = 55 },
    @{ Source = 'pc-web-redesign-board-05-photo-measure-v1.png'; Output = 'measurement/tote-gusset.png'; X = 1441; Y = 653; Width = 46; Height = 55 },
    @{ Source = 'pc-web-redesign-board-05-photo-measure-v1.png'; Output = 'measurement/tote-circumference.png'; X = 1245; Y = 718; Width = 96; Height = 76 },

    # PC22 / product summary: the approved light-blue shirt hero and its six
    # evidence thumbnails. These are product-photo crops, never whole-screen
    # reference images.
    @{ Source = 'pc-web-redesign-board-06-product-listing-v1.png'; Output = 'product/light-blue-shirt-hero.png'; X = 923; Y = 68; Width = 138; Height = 111 },
    @{ Source = 'pc-web-redesign-board-06-product-listing-v1.png'; Output = 'product/light-blue-shirt-front.png'; X = 1048; Y = 220; Width = 54; Height = 55 },
    @{ Source = 'pc-web-redesign-board-06-product-listing-v1.png'; Output = 'product/light-blue-shirt-back.png'; X = 1103; Y = 220; Width = 54; Height = 55 },
    @{ Source = 'pc-web-redesign-board-06-product-listing-v1.png'; Output = 'product/light-blue-shirt-collar.png'; X = 1158; Y = 220; Width = 54; Height = 55 },
    @{ Source = 'pc-web-redesign-board-06-product-listing-v1.png'; Output = 'product/light-blue-shirt-cuff.png'; X = 1048; Y = 277; Width = 54; Height = 55 },
    @{ Source = 'pc-web-redesign-board-06-product-listing-v1.png'; Output = 'product/light-blue-shirt-button.png'; X = 1103; Y = 277; Width = 54; Height = 55 },
    @{ Source = 'pc-web-redesign-board-06-product-listing-v1.png'; Output = 'product/light-blue-shirt-label.png'; X = 1158; Y = 277; Width = 54; Height = 55 },

    # PC24 / official-screen handoff: the approved twelve-photo stack shown
    # inside step one.
    @{ Source = 'pc-web-redesign-board-06-product-listing-v1.png'; Output = 'product/light-blue-shirt-stack.png'; X = 923; Y = 688; Width = 154; Height = 112 },

    # PC25 / saved product pages: six approved catalogue photos, cropped from
    # the cards without labels or action controls.
    @{ Source = 'pc-web-redesign-board-07-sales-support-v2.png'; Output = 'sales/catalog-tote-gray.png'; X = 142; Y = 191; Width = 68; Height = 91 },
    @{ Source = 'pc-web-redesign-board-07-sales-support-v2.png'; Output = 'sales/catalog-passport-wallet-navy.png'; X = 347; Y = 190; Width = 67; Height = 92 },
    @{ Source = 'pc-web-redesign-board-07-sales-support-v2.png'; Output = 'sales/catalog-sneaker-white.png'; X = 550; Y = 193; Width = 80; Height = 86 },
    @{ Source = 'pc-web-redesign-board-07-sales-support-v2.png'; Output = 'sales/catalog-backpack-black.png'; X = 142; Y = 324; Width = 68; Height = 94 },
    @{ Source = 'pc-web-redesign-board-07-sales-support-v2.png'; Output = 'sales/catalog-shirt-beige.png'; X = 345; Y = 323; Width = 74; Height = 91 },
    @{ Source = 'pc-web-redesign-board-07-sales-support-v2.png'; Output = 'sales/catalog-pants-khaki.png'; X = 550; Y = 322; Width = 74; Height = 96 },

    # PC31 / packing workflow: the actual headphone example is on the
    # approved shipping board (the similarly named existing crop is a tote).
    @{ Source = 'pc-web-redesign-board-08-orders-shipping-v3.png'; Output = 'shipping/headphones.png'; X = 143; Y = 775; Width = 162; Height = 115 },

    # PC38 / assignment: approved black sneaker product photo.
    @{ Source = 'pc-web-redesign-board-10-team-v1.png'; Output = 'team/sneaker-black.png'; X = 915; Y = 168; Width = 74; Height = 75 }
    ,@{ Source = 'pc-web-redesign-board-02-purchase-box-v3.png'; Output = 'purchase/register-black-handbag.png'; X = 368; Y = 684; Width = 134; Height = 85 }
    ,@{ Source = 'pc-web-redesign-board-02-purchase-box-v3.png'; Output = 'purchase/research-beige-bag.png'; X = 1125; Y = 681; Width = 72; Height = 51 }
    ,@{ Source = 'pc-web-redesign-board-02-purchase-box-v3.png'; Output = 'purchase/research-watch.png'; X = 1125; Y = 744; Width = 72; Height = 51 }
    ,@{ Source = 'pc-web-redesign-board-02-purchase-box-v3.png'; Output = 'purchase/research-leather-detail.png'; X = 1125; Y = 870; Width = 72; Height = 51 }
    ,@{ Source = 'pc-web-redesign-board-07-sales-support-v2.png'; Output = 'sales/official-screen-pants.png'; X = 1337; Y = 249; Width = 145; Height = 172 }
)

$records = foreach ($crop in $crops) {
    Export-Crop @crop
}

$records | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $outputRoot 'crop-manifest.json') -Encoding UTF8
Write-Output ("Extracted {0} PC fidelity crops to {1}" -f $records.Count, $outputRoot)
