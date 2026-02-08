/**
 * Turnstile Module - Cloudflare Turnstile verification
 * Handles widget rendering, token verification, and refresh
 */

const SITEKEY = '0x4AAAAAACDdgapByiL54XqC';

// Module state
let turnstileToken = null;
let turnstileVerifiedAt = 0;
let turnstileTTL = 0;
let turnstileWidgetId = null;
let turnstileRendered = false;

/**
 * Get current Turnstile token
 * @returns {string|null}
 */
export function getTurnstileToken() {
    return turnstileToken;
}

/**
 * Check if token is valid (not expired)
 * @returns {boolean}
 */
export function isTokenValid() {
    if (!turnstileToken) return false;
    const now = Date.now();
    // 2 second safety margin
    return !(turnstileTTL && (now > (turnstileVerifiedAt + turnstileTTL - 2000)));
}

/**
 * Get Turnstile state for debugging
 * @returns {Object}
 */
export function getTurnstileState() {
    return {
        token: turnstileToken,
        verifiedAt: turnstileVerifiedAt,
        ttl: turnstileTTL,
        widgetId: turnstileWidgetId,
        rendered: turnstileRendered
    };
}

/**
 * Show error message in turnstile overlay
 * @param {string} msg - Error message
 */
export function showTurnstileError(msg) {
    try {
        const ov = document.getElementById('turnstile-overlay');
        if (!ov) return;
        let el = document.getElementById('turnstile-error');
        if (!el) {
            el = document.createElement('div');
            el.id = 'turnstile-error';
            el.style.color = '#ffdddd';
            el.style.background = '#600';
            el.style.padding = '8px';
            el.style.marginTop = '8px';
            el.style.borderRadius = '4px';
            el.style.fontSize = '14px';
            ov.appendChild(el);
        }
        el.textContent = msg;
    } catch (e) { console.error('showTurnstileError failed', e); }
}

/**
 * Verify token with server (includes retry logic)
 * @param {string} token - Turnstile token
 * @param {number} attempt - Current retry attempt
 * @returns {Promise<Object>}
 */
export function verifyTurnstileToken(token, attempt = 0) {
    const MAX = 2;
    const backoff = 200 * Math.pow(2, attempt);
    return fetch('/turnstile-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
        credentials: 'same-origin'
    }).then(res => {
        if (res.status >= 500) {
            if (attempt < MAX) {
                return new Promise((resolve, reject) => 
                    setTimeout(() => verifyTurnstileToken(token, attempt + 1).then(resolve).catch(reject), backoff)
                );
            }
            throw new Error('Verification provider unavailable (server error). Please try again later.');
        }
        if (res.status === 502 || res.status === 503) {
            throw new Error('Verification provider temporarily unavailable');
        }
        const ct = res.headers.get('content-type') || '';
        if (!/application\/json/.test(ct)) {
            throw new Error('Unexpected response from verification provider');
        }
        return res.json();
    });
}

/**
 * Initialize Turnstile widget
 * @param {Object} callbacks - Callbacks for token handling
 */
export function initTurnstile(callbacks = {}) {
    const { isAuthenticated, connectBtn } = callbacks;
    
    try {
        if (connectBtn && !isAuthenticated) connectBtn.disabled = true;
        const widgetEl = document.getElementById('turnstile-widget');
        if (!widgetEl) return;

        // Prevent double-rendering
        if (widgetEl.dataset?.turnstileRendered === '1') {
            return;
        }

        if (globalThis.turnstile) {
            try {
                widgetEl.innerHTML = '';
                turnstileWidgetId = globalThis.turnstile.render('#turnstile-widget', { 
                    sitekey: SITEKEY, 
                    callback: (token) => handleTurnstileToken(token, callbacks)
                });
                turnstileRendered = true;
                if (widgetEl.dataset) widgetEl.dataset.turnstileRendered = '1';
            } catch (e) {
                console.error('turnstile render error', e);
            }
        } else {
            // Load dynamically
            widgetEl.innerHTML = `<div style="color:#b00">Loading verification...</div>`;
            const loadScript = () => {
                try {
                    const s = document.createElement('script');
                    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=ksInitTurnstile&render=explicit';
                    s.async = true; 
                    s.defer = true;
                    document.head.appendChild(s);
                } catch (e) {
                    console.warn('Failed to load Turnstile script:', e);
                }
            };
            loadScript();
        }
    } catch (e) { console.error('initTurnstile', e); }
}

/**
 * Clean up Turnstile widget after verification
 * @param {boolean} isAuthenticated - Whether user is authenticated
 */
function cleanupTurnstileWidget(isAuthenticated) {
    try {
        const widgetEl = document.getElementById('turnstile-widget');
        if (widgetEl && !isAuthenticated) { 
            widgetEl.innerHTML = ''; 
            delete widgetEl.dataset.turnstileRendered; 
        }
        turnstileWidgetId = null;
        turnstileRendered = false;
    } catch (e) {
        console.warn('Failed to clean up Turnstile widget:', e);
    }
}

/**
 * Handle successful token verification
 * @param {Object} response - Server response
 * @param {Object} callbacks - Callbacks
 */
function handleVerificationSuccess(response, callbacks) {
    const { isAuthenticated, connectBtn, onVerified } = callbacks;
    
    turnstileToken = response.token;
    turnstileTTL = Number.parseInt(response.ttl || '30000', 10) || 30000;
    turnstileVerifiedAt = Date.now();

    if (isAuthenticated) {
        const ov = document.getElementById('turnstile-overlay');
        if (ov) ov.style.display = 'none';
        if (connectBtn) connectBtn.disabled = false;
    } else {
        globalThis.location.href = '/auth/google';
    }

    cleanupTurnstileWidget(isAuthenticated);
    
    if (onVerified) onVerified(turnstileToken);
}

/**
 * Handle token received from Turnstile
 * @param {string} token - Raw token from widget
 * @param {Object} callbacks - Callbacks
 */
function handleTurnstileToken(token, callbacks) {
    if (!token) return;
    
    const { onError } = callbacks;
    
    verifyTurnstileToken(token).then(response => {
        if (response?.ok && response.token) {
            handleVerificationSuccess(response, callbacks);
        } else {
            console.warn('Turnstile verify failed', response);
            showTurnstileError('Verification failed. Please try again.');
            if (onError) onError(response);
        }
    }).catch(err => {
        console.error('turnstile verify error', err);
        showTurnstileError(err?.message ?? 'Verification error');
        if (onError) onError(err);
    });
}

/**
 * Reset existing widget or render new one
 * @param {Object} callbacks - Callbacks for token handling
 */
function renderOrResetWidget(callbacks) {
    if (turnstileWidgetId) {
        try { 
            globalThis.turnstile.reset(turnstileWidgetId); 
        } catch (e) {
            console.warn('Failed to reset Turnstile widget, re-rendering:', e);
            turnstileWidgetId = globalThis.turnstile.render('#turnstile-widget', { 
                sitekey: SITEKEY, 
                callback: (token) => handleTurnstileToken(token, callbacks)
            }); 
        }
    } else {
        turnstileWidgetId = globalThis.turnstile.render('#turnstile-widget', { 
            sitekey: SITEKEY, 
            callback: (token) => handleTurnstileToken(token, callbacks)
        });
    }
}

/**
 * Re-run Turnstile (for expired tokens)
 * @param {Object} callbacks - Same as initTurnstile
 */
export function reRunTurnstile(callbacks = {}) {
    const ov = document.getElementById('turnstile-overlay');
    if (ov) ov.style.display = 'flex';
    try {
        if (globalThis.turnstile) {
            renderOrResetWidget(callbacks);
        }
    } catch (e) { console.error('reRunTurnstile', e); }
}

/**
 * Check authentication status with server
 * @param {Object} callbacks - Callbacks for auth state handling
 */
export function checkAuthStatus(callbacks = {}) {
    const { onAuthenticated, onUnauthenticated, connectBtn } = callbacks;
    
    setTimeout(() => {
        fetch('/auth/status', {
            method: 'GET',
            credentials: 'same-origin'
        }).then(r => r.json()).then(data => {
            console.log('Auth status check:', data);
            const isAuth = !!(data?.authenticated);
            
            if (isAuth) {
                const ov = document.getElementById('turnstile-overlay');
                if (ov) ov.style.display = 'none';
                if (connectBtn) connectBtn.disabled = false;
                
                // Initialize turnstile for token
                initTurnstile({ ...callbacks, isAuthenticated: true });
                console.log('User authenticated, Turnstile ready for connection verification');
                
                if (onAuthenticated) onAuthenticated(data);
            } else {
                initTurnstile({ ...callbacks, isAuthenticated: false });
                if (onUnauthenticated) onUnauthenticated();
            }
        }).catch(err => {
            console.log('Auth check failed, showing Turnstile', err);
            initTurnstile({ ...callbacks, isAuthenticated: false });
            if (onUnauthenticated) onUnauthenticated();
        });
    }, 100);
}
