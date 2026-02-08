/**
 * UI Utilities Module - Common UI helpers
 * Banners, auth UI toggle, fullscreen, resize handling
 */

let uiBannerTimer = null;

/**
 * Show a connection status banner
 * @param {HTMLElement} bannerEl - The banner element
 * @param {string} message - Message to display
 * @param {string} kind - 'success' | 'error' | 'info'
 */
export function showConnectionBanner(bannerEl, message, kind) {
    if (!bannerEl) return;
    if (uiBannerTimer) {
        clearTimeout(uiBannerTimer);
        uiBannerTimer = null;
    }
    bannerEl.textContent = message || '';
    bannerEl.classList.remove('auth-banner--success', 'auth-banner--error', 'auth-banner--info');
    if (kind === 'success') bannerEl.classList.add('auth-banner--success');
    else if (kind === 'error') bannerEl.classList.add('auth-banner--error');
    else if (kind === 'info') bannerEl.classList.add('auth-banner--info');
    bannerEl.hidden = false;
    uiBannerTimer = setTimeout(() => {
        bannerEl.hidden = true;
    }, 6000);
}

/**
 * Toggle auth UI between password and key modes
 * @param {HTMLSelectElement} authSelect - Auth type select
 * @param {HTMLElement} passwordLabel - Password label element
 * @param {HTMLElement} keyLabel - Key file label element  
 * @param {HTMLElement} passphraseLabel - Passphrase label element
 */
export function setAuthUI(authSelect, passwordLabel, keyLabel, passphraseLabel) {
    if (!authSelect) return;
    if (authSelect.value === 'password') {
        if (passwordLabel) passwordLabel.style.display = '';
        if (keyLabel) keyLabel.style.display = 'none';
        if (passphraseLabel) passphraseLabel.style.display = 'none';
    } else {
        if (passwordLabel) passwordLabel.style.display = 'none';
        if (keyLabel) keyLabel.style.display = '';
        if (passphraseLabel) passphraseLabel.style.display = '';
    }
}

/**
 * Create a fullscreen toggle handler
 * @param {HTMLElement} terminalArea - Element to fullscreen
 * @param {HTMLButtonElement} fullscreenBtn - Fullscreen button
 */
export function initFullscreen(terminalArea, fullscreenBtn) {
    function toggleFullscreen() {
        if (document.fullscreenElement) {
            document.exitFullscreen();
            if (fullscreenBtn) fullscreenBtn.textContent = '⛶ Fullscreen';
        } else {
            terminalArea?.requestFullscreen()?.catch(err => console.error('Fullscreen request failed:', err));
            if (fullscreenBtn) fullscreenBtn.textContent = '⛶ Exit Fullscreen';
        }
    }
    
    if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);
    
    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            if (fullscreenBtn) fullscreenBtn.textContent = '⛶ Fullscreen';
        }
    });
    
    return toggleFullscreen;
}

/**
 * Initialize resize handle for terminal area
 * @param {HTMLElement} resizeHandle - The resize handle element
 * @param {HTMLElement} terminalArea - The terminal area element
 * @param {Function} onResize - Callback after resize (e.g., fit terminal)
 */
export function initResizeHandle(resizeHandle, terminalArea, onResize) {
    if (!resizeHandle || !terminalArea) return;
    
    let isResizing = false;
    let startX = 0, startY = 0, startWidth = 0, startHeight = 0;

    function handleResize(e) {
        if (!isResizing) return;
        const deltaX = e.clientX - startX;
        const deltaY = e.clientY - startY;
        const newWidth = Math.max(300, startWidth + deltaX);
        const newHeight = Math.max(200, startHeight + deltaY);
        terminalArea.style.width = newWidth + 'px';
        terminalArea.style.height = newHeight + 'px';
        if (onResize) onResize();
    }

    function stopResize() {
        isResizing = false;
        document.removeEventListener('mousemove', handleResize);
        document.removeEventListener('mouseup', stopResize);
    }

    resizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = terminalArea.offsetWidth;
        startHeight = terminalArea.offsetHeight;
        document.addEventListener('mousemove', handleResize);
        document.addEventListener('mouseup', stopResize);
    });
}

/**
 * Show auth banner based on URL query parameter
 * @param {HTMLElement} bannerEl - The banner element
 */
export function showAuthBannerFromQuery(bannerEl) {
    try {
        const params = new URLSearchParams(globalThis.location.search || '');
        const status = params.get('auth');
        if (!status) return;

        if (!bannerEl) return;

        let text = '';
        let modifierClass = '';
        if (status === 'success') {
            text = 'Logged in with Google successfully.';
            modifierClass = 'auth-banner--success';
        } else if (status === 'failure') {
            text = 'Login with Google failed. Please try again.';
            modifierClass = 'auth-banner--error';
        } else if (status === 'already') {
            text = 'You are already logged in.';
            modifierClass = 'auth-banner--info';
        } else {
            return;
        }

        bannerEl.textContent = text;
        bannerEl.classList.remove('auth-banner--success', 'auth-banner--error', 'auth-banner--info');
        if (modifierClass) bannerEl.classList.add(modifierClass);
        bannerEl.hidden = false;

        bannerEl.addEventListener('click', () => {
            bannerEl.hidden = true;
        }, { once: true });
    } catch (e) {
        console.warn('Failed to show auth banner from query:', e);
    }
}

/**
 * Handle private key file input
 * @param {HTMLInputElement} keyfileInput - File input element
 * @param {Function} onKeyLoaded - Callback with key text
 */
export function initKeyfileInput(keyfileInput, onKeyLoaded) {
    if (!keyfileInput) return;
    
    keyfileInput.addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
            const text = await f.text();
            if (onKeyLoaded) onKeyLoaded(text);
        } catch (err) {
            console.warn('Failed to read keyfile:', err);
        }
    });
}
