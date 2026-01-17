@description('Location for all resources')
param location string = 'westus2'

@description('Name prefix for resources')
param namePrefix string = 'seaairspace'

@description('Container image to deploy')
param containerImage string

@description('Mapbox API token')
@secure()
param mapboxToken string

// Container Registry
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: '${namePrefix}acr'
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
  }
}

// Container Instance
resource containerGroup 'Microsoft.ContainerInstance/containerGroups@2023-05-01' = {
  name: '${namePrefix}-container'
  location: location
  properties: {
    containers: [
      {
        name: 'airspace-visualizer'
        properties: {
          image: containerImage
          ports: [
            {
              port: 80
              protocol: 'TCP'
            }
          ]
          resources: {
            requests: {
              cpu: 1
              memoryInGB: 1
            }
          }
          environmentVariables: [
            {
              name: 'VITE_MAPBOX_TOKEN'
              secureValue: mapboxToken
            }
          ]
        }
      }
    ]
    osType: 'Linux'
    ipAddress: {
      type: 'Public'
      ports: [
        {
          port: 80
          protocol: 'TCP'
        }
      ]
      dnsNameLabel: namePrefix
    }
    imageRegistryCredentials: [
      {
        server: acr.properties.loginServer
        username: acr.listCredentials().username
        password: acr.listCredentials().passwords[0].value
      }
    ]
    restartPolicy: 'Always'
  }
}

// Outputs
output acrLoginServer string = acr.properties.loginServer
output acrName string = acr.name
output containerFqdn string = containerGroup.properties.ipAddress.fqdn
output containerIpAddress string = containerGroup.properties.ipAddress.ip
