@description('Location for all resources')
param location string = 'westus2'

@description('Name prefix for resources')
param namePrefix string = 'seaairspace'

@description('Container image to deploy')
param containerImage string

@description('ACR server URL')
param acrServer string

@description('ACR username')
param acrUsername string

@description('ACR password')
@secure()
param acrPassword string

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
        server: acrServer
        username: acrUsername
        password: acrPassword
      }
    ]
    restartPolicy: 'Always'
  }
}

// Outputs
output containerFqdn string = containerGroup.properties.ipAddress.fqdn
output containerIpAddress string = containerGroup.properties.ipAddress.ip
