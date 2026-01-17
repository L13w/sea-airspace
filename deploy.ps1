# Azure Deployment Script for Airspace Visualizer
# Run this script from the project root directory

param(
    [string]$ResourceGroupName = "sea-airspace-rg",
    [string]$Location = "westus2",
    [string]$NamePrefix = "seaairspace"
)

$ErrorActionPreference = "Stop"

Write-Host "=== Airspace Visualizer Azure Deployment ===" -ForegroundColor Cyan

# Check if logged in to Azure
Write-Host "`nChecking Azure login status..." -ForegroundColor Yellow
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    Write-Host "Not logged in to Azure. Please run 'az login' first." -ForegroundColor Red
    exit 1
}
Write-Host "Logged in as: $($account.user.name)" -ForegroundColor Green

# Create resource group
Write-Host "`nCreating resource group '$ResourceGroupName' in '$Location'..." -ForegroundColor Yellow
az group create --name $ResourceGroupName --location $Location

# Deploy ACR first (we need it to push the image)
Write-Host "`nDeploying Azure Container Registry..." -ForegroundColor Yellow
$acrName = "${NamePrefix}acr"
az acr create --resource-group $ResourceGroupName --name $acrName --sku Basic --admin-enabled true

# Get ACR credentials
Write-Host "`nGetting ACR credentials..." -ForegroundColor Yellow
$acrLoginServer = az acr show --name $acrName --query loginServer -o tsv
$acrUsername = az acr credential show --name $acrName --query username -o tsv
$acrPassword = az acr credential show --name $acrName --query "passwords[0].value" -o tsv

# Login to ACR
Write-Host "`nLogging in to ACR..." -ForegroundColor Yellow
az acr login --name $acrName

# Build and push Docker image
Write-Host "`nBuilding Docker image..." -ForegroundColor Yellow
$imageName = "${acrLoginServer}/airspace-visualizer:latest"
docker build -t $imageName .

Write-Host "`nPushing image to ACR..." -ForegroundColor Yellow
docker push $imageName

# Get Mapbox token from .env file
$envContent = Get-Content .env
$mapboxToken = ($envContent | Where-Object { $_ -match "^VITE_MAPBOX_TOKEN=" }) -replace "VITE_MAPBOX_TOKEN=", ""

# Deploy the container instance using Bicep
Write-Host "`nDeploying container instance..." -ForegroundColor Yellow
az deployment group create `
    --resource-group $ResourceGroupName `
    --template-file infra/main.bicep `
    --parameters `
        location=$Location `
        namePrefix=$NamePrefix `
        containerImage=$imageName `
        mapboxToken=$mapboxToken

# Get outputs
Write-Host "`nGetting deployment outputs..." -ForegroundColor Yellow
$fqdn = az container show --resource-group $ResourceGroupName --name "${NamePrefix}-container" --query ipAddress.fqdn -o tsv
$ip = az container show --resource-group $ResourceGroupName --name "${NamePrefix}-container" --query ipAddress.ip -o tsv

Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green
Write-Host "Container FQDN: $fqdn" -ForegroundColor Cyan
Write-Host "Container IP: $ip" -ForegroundColor Cyan
Write-Host "`nYou can access the application at: http://$fqdn" -ForegroundColor Green
Write-Host "`nTo set up your CNAME record, point 'sea-airspace.llew.net' to: $fqdn" -ForegroundColor Yellow
