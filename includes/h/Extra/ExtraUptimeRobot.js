'use strict';

const logger = require("../logger");

// Detect hosting platform and get URL
function detectPlatformAndURL() {
    // Replit
    if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
        return {
            platform: 'Replit',
            url: `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`
        };
    }
    
    // Render
    if (process.env.RENDER_SERVICE_NAME || process.env.RENDER) {
        const serviceName = process.env.RENDER_SERVICE_NAME || process.env.RENDER_EXTERNAL_HOSTNAME;
        if (serviceName) {
            return {
                platform: 'Render',
                url: `https://${serviceName}.onrender.com`
            };
        }
    }
    
    // Railway
    if (process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN) {
        const domain = process.env.RAILWAY_STATIC_URL || process.env.RAILWAY_PUBLIC_DOMAIN;
        return {
            platform: 'Railway',
            url: domain.startsWith('http') ? domain : `https://${domain}`
        };
    }
    
    // GitHub Actions (usually not used for hosting but for CI/CD)
    if (process.env.GITHUB_ACTIONS) {
        return {
            platform: 'GitHub Actions',
            url: null // No URL for GitHub Actions
        };
    }
    
    // Generic detection - check for common hosting env vars
    if (process.env.PORT && (process.env.HOST || process.env.HOSTNAME)) {
        const host = process.env.HOST || process.env.HOSTNAME;
        return {
            platform: 'Generic Hosting',
            url: `https://${host}`
        };
    }
    
    // Check for custom URL in config
    if (global.Fca.Require.Priyansh.UptimeURL) {
        return {
            platform: 'Custom URL',
            url: global.Fca.Require.Priyansh.UptimeURL
        };
    }
    
    return null;
}

module.exports = function() {
    var Logger = global.Fca.Require.logger;
    var Value = global.Fca.Require.Priyansh;
    
    // Skip if uptime is disabled
    if (!Value.Uptime) {
        return;
    }
    
    switch (process.platform) {
        case 'win32': {
            // Windows - only support if custom URL provided
            if (Value.UptimeURL) {
                logger.Normal(`✅ Uptime monitoring enabled for custom URL`);
                logger.Info(`🔗 URL: ${Value.UptimeURL}`);
                return startUptimeMonitoring(Value.UptimeURL, 'Windows (Custom)');
            } else {
                logger.Warning(global.Fca.Require.Language.ExtraUpTime.NotSupport);
                logger.Info('💡 Tip: Set "UptimeURL" in PriyanshFca.json to enable uptime monitoring');
            }
            break;
        }
        case 'darwin': {
            // macOS - only support if custom URL provided
            if (Value.UptimeURL) {
                logger.Normal(`✅ Uptime monitoring enabled for custom URL`);
                logger.Info(`🔗 URL: ${Value.UptimeURL}`);
                return startUptimeMonitoring(Value.UptimeURL, 'macOS (Custom)');
            } else {
                logger.Warning(global.Fca.Require.Language.ExtraUpTime.NotSupport);
                logger.Info('💡 Tip: Set "UptimeURL" in PriyanshFca.json to enable uptime monitoring');
            }
            break;
        }
        case 'linux': {
            // Linux - auto-detect platform or use custom URL
            const platformInfo = detectPlatformAndURL();
            
            if (platformInfo && platformInfo.url) {
                logger.Normal(`✅ Uptime monitoring enabled`);
                logger.Info(`🌐 Platform: ${platformInfo.platform}`);
                logger.Info(`🔗 URL: ${platformInfo.url}`);
                return startUptimeMonitoring(platformInfo.url, platformInfo.platform);
            } else if (platformInfo && !platformInfo.url) {
                logger.Warning(`⚠️  ${platformInfo.platform} detected but no URL available`);
                logger.Info('💡 Set "UptimeURL" in PriyanshFca.json for custom URL monitoring');
            } else {
                logger.Warning(global.Fca.Require.Language.ExtraUpTime.NotSupport);
                logger.Info('💡 Supported: Replit, Render, Railway');
                logger.Info('💡 Or set "UptimeURL" in PriyanshFca.json for custom monitoring');
            }
            break;
        }
        default:
            Logger.Warning(global.Fca.Require.Language.ExtraUpTime.NotSupport);
    }
};

function startUptimeMonitoring(url, platform) {
    var Fetch = global.Fca.Require.Fetch;
    var logger = global.Fca.Require.logger;
    
    // Initial ping
    setTimeout(() => {
        Fetch.get(url).catch(err => {
            logger.Warning(`⚠️  Initial uptime ping failed: ${err.message}`);
        });
    }, 5000);
    
    // Periodic ping every 5 minutes
    return setInterval(function() {
        Fetch.get(url)
            .then(() => {
                // Silent success
            })
            .catch((err) => {
                logger.Warning(`⚠️  Uptime ping failed: ${err.message}`);
            });
    }, 5 * 60 * 1000); // 5 minutes
}
