/**
 * Validation module
 * Handles IP validation and host validation for SSRF protection
 */

const net = require('node:net');
const dns = require('node:dns').promises;
const { logger } = require('./logging');

/**
 * Check if an IP/hostname is private or local
 * Prevents SSRF attacks by detecting private IP ranges and local hostnames
 * @param {string} input - IP address or hostname
 * @returns {boolean} True if the address is private or local
 */
function isPrivateOrLocalIP(input) {
  let ip = input;

  // Helper: Convert integer to Dotted-Quad string (e.g. 2130706433 -> 127.0.0.1)
  const intToIp = (int) => {
    return [
      (int >>> 24) & 0xFF,
      (int >>> 16) & 0xFF,
      (int >>> 8) & 0xFF,
      int & 0xFF
    ].join('.');
  };

  // 1. Handle Hex (0x...) - handles dotted (0x7f.0x0... or 0x7f000001)
  if (ip.toLowerCase().includes('0x')) {
    try {
      // Parse hex string to integer, then convert to IP
      const hexNum = Number.parseInt(ip.replace(/0x/gi, ''), 16);
      ip = intToIp(hexNum);
    } catch (error) {
      // If parsing fails, continue with original input
    }
  }
  // 2. Handle Octal (leading 0) - e.g., 0177.0.0.1
  else if (ip.startsWith('0') && ip.includes('.') && /^[0-7.]+$/.test(ip)) {
    try {
      // Convert octal to decimal for each octet
      ip = ip.split('.').map(octet => String(Number.parseInt(octet, 8))).join('.');
    } catch (error) {
      // If parsing fails, continue with original input
    }
  }

  // Basic localhost variations
  if (ip === 'localhost' || ip === '127.0.0.1' || ip === '::1') return true;

  // Standard Node.js IP checks
  if (net.isIP(ip)) {
    return (
      net.isIPv4(ip) && (
        ip.startsWith('10.') ||
        ip.startsWith('192.168.') ||
        (ip.startsWith('172.') && {
          '16': true, '17': true, '18': true, '19': true,
          '20': true, '21': true, '22': true, '23': true,
          '24': true, '25': true, '26': true, '27': true,
          '28': true, '29': true, '30': true, '31': true
        }[ip.split('.')[1]]) ||
        ip.startsWith('169.254.') ||
        ip.startsWith('127.') ||
        ip === '0.0.0.0'
      ) ||
      net.isIPv6(ip) && (
        ip.startsWith('fe80::') ||
        ip.startsWith('fc') ||
        ip.startsWith('fd') ||
        ip === '::1' ||
        ip.startsWith('::ffff:127') ||
        ip.startsWith('::ffff:192.168.') ||
        ip.startsWith('::ffff:10.') ||
        ip.startsWith('::ffff:172.') ||
        ip === '::'
      )
    );
  }

  return false;
}

/**
 * Enhanced host validation with DNS rebinding protection
 * @param {string} hostname - Hostname to validate
 * @param {string} originalHost - Original host from request
 * @param {string} sourceIP - IP address of the requester
 * @param {string} userEmail - Email of the authenticated user
 * @returns {Promise<string>} The resolved IP address
 * @throws {Error} If validation fails
 */
async function validateHost(hostname, originalHost, sourceIP, userEmail) {
  try {
    // First, check if the hostname itself is suspicious
    if (isPrivateOrLocalIP(hostname)) {
      const error = new Error(`Host validation failed: ${hostname} is a private/local IP`);
      error.code = 'PRIVATE_IP';
      logger.warn('Blocked private IP in hostname', {
        hostname: hostname,
        source_ip: sourceIP,
        user_email: userEmail
      });
      throw error;
    }

    // Tighten hostname blocking with exact patterns
    const blockedPatterns = [
      /^\.?localhost$/,
      /\.local$/,
      /^\.?internal$/,
      /^\.?private$/,
      /^169\.254\.169\.254$/,
      /^\[?fd[0-9a-fA-F:]+\]?$/,
      /^\[?fc[0-9a-fA-F:]+\]?$/
    ];

    // Block known metadata domains (case-insensitive)
    const blockedDomains = [
      'metadata.google.internal',
      'metadata.azure.com',
      'instance-data.ec2.internal',
      'instance-data.amazonaws.com'
    ];

    const lowerHost = hostname.toLowerCase();

    // Check blocked patterns (exact or suffix matches)
    if (blockedPatterns.some(pattern => pattern.test(lowerHost))) {
      const error = new Error(`Host validation failed: ${hostname} matches blocked pattern`);
      error.code = 'BLOCKED_PATTERN';
      logger.warn('Blocked hostname pattern', {
        hostname: hostname,
        source_ip: sourceIP,
        user_email: userEmail
      });
      throw error;
    }

    // Check blocked domains (exact or subdomain matches)
    if (blockedDomains.some(domain => lowerHost === domain || lowerHost.endsWith('.' + domain))) {
      const error = new Error(`Host validation failed: ${hostname} is a blocked metadata domain`);
      error.code = 'BLOCKED_DOMAIN';
      logger.warn('Blocked metadata domain', {
        hostname: hostname,
        source_ip: sourceIP,
        user_email: userEmail
      });
      throw error;
    }

    // Check for IP addresses that might have slipped through (e.g., in hostnames)
    const ipMatch = lowerHost.match(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    if (ipMatch && isPrivateOrLocalIP(ipMatch[0])) {
      const error = new Error(`Host validation failed: ${hostname} contains private IP`);
      error.code = 'PRIVATE_IP_IN_HOSTNAME';
      logger.warn('Blocked hostname containing private IP', {
        hostname: hostname,
        ip_found: ipMatch[0],
        source_ip: sourceIP,
        user_email: userEmail
      });
      throw error;
    }

    // Enhanced DNS resolution with multiple methods to prevent host file poisoning
    let lookupResults, resolve4Results, resolve6Results;

    try {
      lookupResults = await dns.lookup(hostname, { all: true });
    } catch (err) {
      logger.debug('dns.lookup failed', { hostname, error: err.message });
    }

    try {
      resolve4Results = await dns.resolve4(hostname);
    } catch (err) {
      logger.debug('dns.resolve4 failed', { hostname, error: err.message });
    }

    try {
      resolve6Results = await dns.resolve6(hostname);
    } catch (err) {
      logger.debug('dns.resolve6 failed', { hostname, error: err.message });
    }

    // Combine all results from different resolution methods
    const allResults = [];

    if (lookupResults && lookupResults.length > 0) {
      allResults.push(...lookupResults);
    }
    if (resolve4Results && resolve4Results.length > 0) {
      allResults.push(...resolve4Results.map(ip => ({ address: ip, family: 4 })));
    }
    if (resolve6Results && resolve6Results.length > 0) {
      allResults.push(...resolve6Results.map(ip => ({ address: ip, family: 6 })));
    }

    if (allResults.length === 0) {
      const error = new Error(`Host validation failed: ${hostname} did not resolve`);
      error.code = 'RESOLUTION_FAILED';
      logger.warn('Host resolution failed', { hostname, source_ip: sourceIP, user_email: userEmail });
      throw error;
    }

    // Check for consistency between resolution methods
    const lookupIPs = new Set(lookupResults ? lookupResults.map(r => r.address) : []);
    const directIPs = new Set([...(resolve4Results || []), ...(resolve6Results || [])]);

    // If we have both methods and they disagree, that's suspicious
    if (lookupIPs.size > 0 && directIPs.size > 0) {
      let hasConsistency = false;
      for (const ip of lookupIPs) {
        if (directIPs.has(ip)) {
          hasConsistency = true;
          break;
        }
      }
      if (!hasConsistency) {
        logger.warn('DNS resolution mismatch detected (possible DNS rebinding)', {
          hostname: hostname,
          lookup_ips: Array.from(lookupIPs),
          direct_ips: Array.from(directIPs),
          source_ip: sourceIP,
          user_email: userEmail
        });
      }
    }

    // Check all resolved IP addresses from all methods
    for (const result of allResults) {
      const resolvedIP = result.address || result;
      if (isPrivateOrLocalIP(resolvedIP)) {
        const error = new Error(`Host validation failed: ${hostname} resolved to private IP ${resolvedIP}`);
        error.code = 'RESOLVED_TO_PRIVATE';
        logger.warn('Hostname resolved to private IP', {
          hostname: hostname,
          resolved_ip: resolvedIP,
          source_ip: sourceIP,
          user_email: userEmail
        });
        throw error;
      }
    }

    // Return the first IP from lookup results (maintains compatibility)
    return lookupResults && lookupResults.length > 0 ? lookupResults[0].address : allResults[0].address;
  } catch (error) {
    logger.error('Host validation failed', {
      hostname: hostname,
      error: error.message,
      source_ip: sourceIP,
      user_email: userEmail
    });
    throw error;
  }
}

module.exports = {
  isPrivateOrLocalIP,
  validateHost
};
