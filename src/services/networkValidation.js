/**
 * Network Validation Service
 * 
 * Provides validation functions for network settings
 */

// IPv4 address validation
export function isValidIpv4(ip) {
  if (!ip) return false;
  
  // Regular expression for IPv4 validation
  const ipv4Regex = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  
  return ipv4Regex.test(ip);
}

// Subnet mask validation
export function isValidSubnetMask(subnet) {
  if (!subnet) return false;
  
  // First check if it's a valid IPv4 address
  if (!isValidIpv4(subnet)) return false;
  
  // Check if it's a valid subnet mask format
  const parts = subnet.split('.');
  const binaryStr = parts
    .map(part => parseInt(part, 10).toString(2).padStart(8, '0'))
    .join('');
  
  // A valid subnet mask should have all 1s followed by all 0s
  return /^1*0*$/.test(binaryStr) && binaryStr.includes('1');
}

// Hostname validation
export function isValidHostname(hostname) {
  if (!hostname) return false;
  
  // Hostname cannot be longer than 63 characters
  if (hostname.length > 63) return false;
  
  // Can only contain letters, numbers, and hyphens
  const hostnameRegex = /^[a-zA-Z0-9-]+$/;
  return hostnameRegex.test(hostname);
}

// Validate all IP configuration settings
export function validateNetworkConfig(config) {
  const errors = {};
  
  // Validate IP Address
  if (!isValidIpv4(config.ipAddress)) {
    errors.ipAddress = 'Please enter a valid IP address (e.g., 192.168.1.100)';
  }
  
  // Validate Gateway
  if (!isValidIpv4(config.gateway)) {
    errors.gateway = 'Please enter a valid gateway address (e.g., 192.168.1.1)';
  }
  
  // Validate Subnet Mask
  if (!isValidSubnetMask(config.subnet)) {
    errors.subnet = 'Please enter a valid subnet mask (e.g., 255.255.255.0)';
  }
  
  // Validate DNS (optional)
  if (config.dns && !isValidIpv4(config.dns)) {
    errors.dns = 'Please enter a valid DNS server address (e.g., 8.8.8.8)';
  }
  
  // Check if IP is on the same subnet as gateway
  if (!errors.ipAddress && !errors.gateway && !errors.subnet) {
    const ipParts = config.ipAddress.split('.').map(part => parseInt(part, 10));
    const gatewayParts = config.gateway.split('.').map(part => parseInt(part, 10));
    const subnetParts = config.subnet.split('.').map(part => parseInt(part, 10));
    
    let onSameSubnet = true;
    for (let i = 0; i < 4; i++) {
      if ((ipParts[i] & subnetParts[i]) !== (gatewayParts[i] & subnetParts[i])) {
        onSameSubnet = false;
        break;
      }
    }
    
    if (!onSameSubnet) {
      errors.ipAddress = 'IP address must be on the same subnet as the gateway';
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
