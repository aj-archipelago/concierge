import { NextResponse } from "next/server";

/**
 * GET /wp-editor/bundle.js
 *
 * Serves a standalone JavaScript bundle for WordPress editor integration.
 * This dynamically generates a bundle from the /wp-editor page.
 */
export async function GET(request) {
    try {
        const host = request.headers.get("host") || "localhost:3000";
        const protocol =
            process.env.NODE_ENV === "production" ? "https" : "http";
        const baseUrl = `${protocol}://${host}`;

        // Enable debug mode for development
        const DEBUG_MODE = process.env.NODE_ENV !== "production";

        // Generate the bundle that WordPress will load
        const bundle = `
/**
 * Labeeb WordPress Editor Bundle
 * Generated dynamically from Next.js /wp-editor page
 */

(function() {
    'use strict';
    
    // Configuration constants
    const CONFIG = {
        POPUP_WIDTH: 600,
        POPUP_HEIGHT: 700,
        MAX_POLL_ATTEMPTS: 240,
        POLL_INTERVAL_MS: 500,
        PING_INTERVAL_MS: 200,
        MAX_PING_ATTEMPTS: 10,
        PONG_TIMEOUT_MS: 2000,
        Z_INDEX: 99999
    };
    
    const DEBUG = ${DEBUG_MODE};
    const BASE_URL = '${baseUrl}';
    
    // Debug logger
    const log = DEBUG ? console.log.bind(console) : function() {};
    const logError = console.error.bind(console);
    
    log('Labeeb Bundle Starting - Base URL:', BASE_URL);
    
    // Create container for Labeeb modals
    const container = document.createElement('div');
    container.id = 'labeeb-wp-editor-root';
    container.style.cssText = \`position: fixed; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: \${CONFIG.Z_INDEX};\`;
    document.body.appendChild(container);
    
    // Create loading overlay for auth flow
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'labeeb-auth-loading';
    loadingOverlay.style.cssText = \`
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: \${CONFIG.Z_INDEX + 1};
        pointer-events: auto;
    \`;
    
    const loadingContent = document.createElement('div');
    loadingContent.style.cssText = \`
        background: white;
        padding: 30px 40px;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        text-align: center;
        max-width: 400px;
    \`;
    
    const loadingSpinner = document.createElement('div');
    loadingSpinner.style.cssText = \`
        border: 4px solid #f3f3f3;
        border-top: 4px solid #3498db;
        border-radius: 50%;
        width: 40px;
        height: 40px;
        animation: spin 1s linear infinite;
        margin: 0 auto 20px;
    \`;
    
    const loadingText = document.createElement('div');
    loadingText.id = 'labeeb-auth-loading-text';
    loadingText.style.cssText = \`
        font-size: 16px;
        color: #333;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        line-height: 1.5;
    \`;
    loadingText.textContent = 'Connecting to Labeeb AI...';
    
    const loadingSubtext = document.createElement('div');
    loadingSubtext.id = 'labeeb-auth-loading-subtext';
    loadingSubtext.style.cssText = \`
        font-size: 13px;
        color: #666;
        margin-top: 10px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    \`;
    loadingSubtext.textContent = 'Please complete authentication in the popup window';
    
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Cancel';
    cancelButton.style.cssText = \`
        margin-top: 20px;
        padding: 8px 20px;
        background: #f0f0f0;
        border: 1px solid #ccc;
        border-radius: 4px;
        cursor: pointer;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        font-size: 14px;
        color: #333;
        transition: background 0.2s;
    \`;
    cancelButton.onmouseover = () => { cancelButton.style.background = '#e0e0e0'; };
    cancelButton.onmouseout = () => { cancelButton.style.background = '#f0f0f0'; };
    cancelButton.onclick = () => {
        log('User cancelled authentication');
        closeAuthPopup();
        stopPopupPolling();
        hideLoadingOverlay();
    };
    
    loadingContent.appendChild(loadingSpinner);
    loadingContent.appendChild(loadingText);
    loadingContent.appendChild(loadingSubtext);
    loadingContent.appendChild(cancelButton);
    loadingOverlay.appendChild(loadingContent);
    document.body.appendChild(loadingOverlay);
    
    // Add spinner animation
    const style = document.createElement('style');
    style.textContent = \`
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    \`;
    document.head.appendChild(style);
    
    // Create iframe to load Labeeb /wp-editor page (lazy loaded on first user action)
    const iframe = document.createElement('iframe');
    iframe.id = 'labeeb-wp-editor-frame';
    iframe.style.cssText = \`position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none; display: none; pointer-events: auto; z-index: \${CONFIG.Z_INDEX};\`;
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms allow-modals');
    container.appendChild(iframe);
    
    // State management
    let isAuthenticated = false;
    let authPopupWindow = null;
    let authPopupCheckInterval = null;
    let pongReceived = false;
    let pongHandler = null;
    let iframeLoaded = false;
    let pendingCommands = [];
    
    // Utility functions
    const showLoadingOverlay = (message, subtext) => {
        loadingText.textContent = message || 'Connecting to Labeeb AI...';
        loadingSubtext.textContent = subtext || 'Please wait...';
        loadingOverlay.style.display = 'flex';
        log('Loading overlay shown:', message);
    };
    
    const hideLoadingOverlay = () => {
        loadingOverlay.style.display = 'none';
        log('Loading overlay hidden');
    };
    
    const updateLoadingStatus = (message, subtext) => {
        loadingText.textContent = message;
        if (subtext) {
            loadingSubtext.textContent = subtext;
        }
        log('Loading status updated:', message);
    };
    
    const reloadIframe = () => {
        const separator = iframe.src.includes('?') ? '&' : '?';
        iframe.src = \`\${iframe.src}\${separator}_t=\${Date.now()}\`;
    };
    
    const closeAuthPopup = () => {
        if (!authPopupWindow || authPopupWindow.closed) return;
        try {
            authPopupWindow.close();
            log('Auth popup closed');
        } catch (e) {
            log('Could not close popup:', e);
        }
    };
    
    const stopPopupPolling = () => {
        if (authPopupCheckInterval) {
            clearInterval(authPopupCheckInterval);
            authPopupCheckInterval = null;
        }
    };
    
    const isLoginRedirect = (url) => {
        try {
            const urlObj = new URL(url);
            return urlObj.pathname.includes('/auth/login') || urlObj.pathname.includes('/login');
        } catch (e) {
            log('Error parsing URL:', e);
            return false;
        }
    };
    
    const loadIframe = () => {
        if (iframeLoaded) return;
        log('Loading iframe on user action');
        showLoadingOverlay('Loading Labeeb AI...', 'Connecting to the editor');
        iframeLoaded = true;
        iframe.src = BASE_URL + '/wp-editor';
    };
    
    const completeAuthentication = () => {
        log('Authentication complete');
        isAuthenticated = true;
        pongReceived = true;
        stopPopupPolling();
        updateLoadingStatus('Authentication successful!', 'Loading AI features...');
        setTimeout(() => {
            hideLoadingOverlay();
        }, 800);
    };
    
    /**
     * Opens authentication popup window
     */
    const showAuthPane = (redirectUrl) => {
        log('Opening auth popup');
        
        // Show loading overlay
        showLoadingOverlay(
            'Authenticating with Labeeb AI...',
            'Please complete the login in the popup window'
        );
        
        const authUrl = redirectUrl || BASE_URL + '/wp-editor';
        const left = (window.screen.width - CONFIG.POPUP_WIDTH) / 2;
        const top = (window.screen.height - CONFIG.POPUP_HEIGHT) / 2;
        
        authPopupWindow = window.open(
            authUrl,
            'labeeb-auth',
            \`width=\${CONFIG.POPUP_WIDTH},height=\${CONFIG.POPUP_HEIGHT},left=\${left},top=\${top},toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes\`
        );
        
        if (!authPopupWindow) {
            logError('Failed to open popup - may be blocked');
            hideLoadingOverlay();
            alert('Please allow popups for this site to authenticate with Labeeb AI.');
            return;
        }
        
        log('Popup opened successfully');
        updateLoadingStatus(
            'Waiting for authentication...',
            'Please log in with your credentials in the popup'
        );
        
        // Monitor the popup
        let pollCount = 0;
        authPopupCheckInterval = setInterval(() => {
            pollCount++;
            
            // Update status every few seconds
            if (pollCount % 6 === 0) { // Every 3 seconds (6 * 500ms)
                const secondsElapsed = Math.floor(pollCount * CONFIG.POLL_INTERVAL_MS / 1000);
                updateLoadingStatus(
                    'Waiting for authentication...',
                    \`Authenticating... (\${secondsElapsed}s)\`
                );
            }
            
            try {
                // Check if popup was closed
                try {
                    if (authPopupWindow.closed) {
                        log('Popup closed by user');
                        stopPopupPolling();
                        hideLoadingOverlay();
                        reloadIframe();
                        return;
                    }
                } catch (coopError) {
                    if (pollCount === 1) {
                        log('Cannot check popup.closed (COOP), relying on postMessage');
                    }
                }
                
                // Stop polling after max attempts
                if (pollCount >= CONFIG.MAX_POLL_ATTEMPTS) {
                    log('Max popup polling attempts reached');
                    stopPopupPolling();
                    hideLoadingOverlay();
                    return;
                }
                
                // Check if we can access popup's location (same-origin after auth)
                try {
                    const popupUrl = authPopupWindow.location.href;
                    if (popupUrl.includes('${host}') && !isLoginRedirect(popupUrl)) {
                        log('Authentication successful');
                        stopPopupPolling();
                        closeAuthPopup();
                        completeAuthentication();
                        reloadIframe();
                    }
                } catch (e) {
                    // Expected - can't access location yet
                }
            } catch (e) {
                logError('Error checking popup:', e);
                stopPopupPolling();
                hideLoadingOverlay();
            }
        }, CONFIG.POLL_INTERVAL_MS);
    };
    
    // Message type categorization
    const MESSAGE_TYPES = {
        INTERNAL: ['__MODAL_OPENED__', '__MODAL_CLOSED__', '__LABEEB_INIT__', '__AUTH_SUCCESS__', '__LABEEB_PING__', '__LABEEB_PONG__'],
        OPERATION: ['replaceText', 'replaceSelection', 'select_topics']
    };
    
    const isInternalMessage = (type) => MESSAGE_TYPES.INTERNAL.includes(type);
    const isOperationMessage = (type) => MESSAGE_TYPES.OPERATION.includes(type);
    const isResultMessage = (data) => data.result && data.command;
    
    /**
     * Main message handler - consolidated event listener
     */
    window.addEventListener('message', function(event) {
        if (!event.data || !event.data.type) return;
        
        const data = event.data;
        const isFromPopup = authPopupWindow && event.source === authPopupWindow;
        
        log('Received message:', data.type, 'from:', 
            event.source === iframe.contentWindow ? 'iframe' : 
            isFromPopup ? 'popup' : 'other');
        
        // Handle authentication required
        if (data.type === '__AUTH_REQUIRED__') {
            if (!authPopupWindow || authPopupWindow.closed) {
                showAuthPane();
            }
            return;
        }
        
        // Handle authentication success from popup
        if (data.type === '__AUTH_POPUP_SUCCESS__') {
            log('Auth success message received');
            updateLoadingStatus('Verifying authentication...', 'Almost done!');
            closeAuthPopup();
            completeAuthentication();
            reloadIframe();
            return;
        }
        
        // Handle modal state changes
        if (data.type === '__MODAL_OPENED__') {
            iframe.style.display = 'block';
            return;
        }
        
        if (data.type === '__MODAL_CLOSED__') {
            iframe.style.display = 'none';
            return;
        }
        
        // Handle pong response
        if (data.type === '__LABEEB_PONG__') {
            log('Pong received');
            return;
        }
        
        // Forward TinyMCE commands to iframe
        const shouldForward = iframe.contentWindow && 
                             data.type && 
                             !isResultMessage(data) && 
                             !isInternalMessage(data.type) && 
                             !isOperationMessage(data.type);
        
        if (shouldForward) {
            // Lazy load iframe on first command
            if (!iframeLoaded) {
                log('First command received, loading iframe');
                loadIframe();
                pendingCommands.push(data);
                log('Command queued:', data.type);
                return;
            }
            
            // Check if iframe is ready
            if (!pongReceived && !isAuthenticated) {
                log('Command received but iframe not ready, showing auth');
                // Queue the command for later
                pendingCommands.push(data);
                showAuthPane();
                return;
            }
            
            log('Forwarding command to iframe:', data.type);
            iframe.contentWindow.postMessage(data, '*');
        }
    });
    
    /**
     * Handle iframe load event
     */
    iframe.addEventListener('load', function() {
        if (!iframeLoaded || !iframe.src) {
            return;
        }
        
        log('Iframe load event - isAuthenticated:', isAuthenticated);
        
        // Reset pong state
        pongReceived = false;
        if (pongHandler) {
            window.removeEventListener('message', pongHandler);
            pongHandler = null;
        }
        
        // Try to detect if we're on a login page
        let isLoginPage = false;
        try {
            const iframeUrl = iframe.contentWindow.location.href;
            if (isLoginRedirect(iframeUrl)) {
                log('Login page detected - waiting for user action');
                isLoginPage = true;
                isAuthenticated = false;
                hideLoadingOverlay();
                return;
            }
            log('Iframe loaded successfully');
            updateLoadingStatus('Editor loaded!', 'Setting up workspace...');
        } catch (e) {
            // Cross-origin access blocked - use ping/pong mechanism
            log('Cannot read iframe URL (cross-origin) - using ping/pong');
            updateLoadingStatus('Verifying connection...', 'Checking if editor is ready');
            
            try {
                pongHandler = (event) => {
                    if (event.data.type === '__LABEEB_PONG__' && event.source === iframe.contentWindow) {
                        log('Pong received - app is responding');
                        pongReceived = true;
                        updateLoadingStatus('Connection established!', 'Initializing editor...');
                        if (pongHandler) {
                            window.removeEventListener('message', pongHandler);
                            pongHandler = null;
                        }
                    }
                };
                window.addEventListener('message', pongHandler);
                
                // Send multiple pings to catch React component after mount
                let pingCount = 0;
                const pingInterval = setInterval(() => {
                    if (pongReceived || pingCount >= CONFIG.MAX_PING_ATTEMPTS) {
                        clearInterval(pingInterval);
                        return;
                    }
                    pingCount++;
                    log('Sending ping #' + pingCount);
                    
                    // Update status every few pings
                    if (pingCount % 3 === 0) {
                        updateLoadingStatus('Verifying connection...', \`Attempt \${pingCount}/\${CONFIG.MAX_PING_ATTEMPTS}\`);
                    }
                    
                    try {
                        iframe.contentWindow.postMessage({ type: '__LABEEB_PING__' }, '*');
                    } catch (e) {
                        logError('Error sending ping:', e);
                        clearInterval(pingInterval);
                        hideLoadingOverlay();
                    }
                }, CONFIG.PING_INTERVAL_MS);
                
                setTimeout(() => {
                    clearInterval(pingInterval);
                    if (!pongReceived) {
                        log('No pong response after ' + pingCount + ' pings');
                        if (!isAuthenticated) {
                            log('User not authenticated - will prompt when they use AI feature');
                            hideLoadingOverlay();
                        } else {
                            initializeIframe();
                            // Hide overlay after init
                            setTimeout(hideLoadingOverlay, 500);
                        }
                    } else {
                        log('App loaded successfully');
                        initializeIframe();
                        // Hide overlay after successful init
                        setTimeout(hideLoadingOverlay, 500);
                    }
                    if (pongHandler) {
                        window.removeEventListener('message', pongHandler);
                        pongHandler = null;
                    }
                }, CONFIG.PONG_TIMEOUT_MS);
                
                return;
            } catch (sendError) {
                logError('Error in ping/pong setup:', sendError);
                hideLoadingOverlay();
            }
        }
        
        if (isLoginPage) {
            return;
        }
        
        initializeIframe();
        // Hide overlay after successful initialization
        setTimeout(hideLoadingOverlay, 500);
    });
    
    /**
     * Initialize iframe after successful load
     */
    function initializeIframe() {
        log('Initializing iframe - isAuthenticated:', isAuthenticated);
        
        try {
            log('Sending init message to iframe');
            iframe.contentWindow.postMessage({
                type: '__LABEEB_INIT__',
                config: window.AIModules || {},
                apiUrl: window.arc_ai_editor_api_url ? window.arc_ai_editor_api_url[0] : ''
            }, '*');
            
            // Process pending commands
            if (pendingCommands.length > 0) {
                log('Processing ' + pendingCommands.length + ' pending commands');
                pendingCommands.forEach((cmd) => {
                    log('Forwarding queued command:', cmd.type);
                    iframe.contentWindow.postMessage(cmd, '*');
                });
                pendingCommands = [];
            }
        } catch (e) {
            logError('Failed to initialize iframe:', e);
        }
    }
    
    log('Labeeb WordPress Editor bundle loaded');
})();
`;

        return new NextResponse(bundle, {
            headers: {
                "Content-Type": "application/javascript; charset=utf-8",
                "Cache-Control":
                    process.env.NODE_ENV === "production"
                        ? "public, max-age=7200, s-maxage=86400, stale-while-revalidate=3600"
                        : "no-cache, no-store, must-revalidate",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        console.error("Error generating WordPress editor bundle:", error);

        // Don't expose error details in production
        const errorMessage =
            process.env.NODE_ENV === "production"
                ? "Failed to load Labeeb WordPress Editor"
                : `Failed to load Labeeb WordPress Editor: ${error.message}`;

        return new NextResponse(`console.error('${errorMessage}');`, {
            status: 500,
            headers: {
                "Content-Type": "application/javascript; charset=utf-8",
                "Cache-Control": "no-cache, no-store, must-revalidate",
            },
        });
    }
}

export async function OPTIONS(request) {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}
