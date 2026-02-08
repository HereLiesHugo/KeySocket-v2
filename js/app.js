/**
 * KeySocket Frontend Application
 * Main orchestrator - initializes all modules and wires them together
 * 
 * This file imports ES modules from js/modules/ and coordinates initialization
 */

// Import all modules
import { initTerminal, getTerminal, getFitAddon, applyTerminalTheme, fitTerminal } from './modules/terminal.js';
import { initVirtualKeyboard } from './modules/keyboard.js';
import { getConnections, saveConnection, loadSaved, renderAppManagementConnections, initAppManagement } from './modules/connections.js';
import { applyThemeFromStorage, initThemeManagement } from './modules/theme.js';
import { showConnectionBanner, setAuthUI, initFullscreen, initResizeHandle, showAuthBannerFromQuery, initKeyfileInput } from './modules/ui.js';
import { connect, disconnect, getSocket } from './modules/websocket-client.js';
import { initTurnstile, reRunTurnstile, getTurnstileToken, isTokenValid, checkAuthStatus } from './modules/turnstile.js';

// DOM element references (gathered once on load)
const elements = {
    termEl: document.getElementById('terminal'),
    form: document.getElementById('connect-form'),
    authBannerEl: document.getElementById('auth-banner'),
    authSelect: document.getElementById('auth-select'),
    passwordLabel: document.getElementById('password-label'),
    keyLabel: document.getElementById('key-label'),
    passphraseLabel: document.getElementById('passphrase-label'),
    keyfileInput: document.getElementById('keyfile'),
    connectBtn: document.getElementById('connect-btn'),
    disconnectBtn: document.getElementById('disconnect-btn'),
    saveBtn: document.getElementById('save-conn'),
    savedList: document.getElementById('saved-list'),
    fullscreenBtn: document.getElementById('fullscreen-btn'),
    terminalArea: document.querySelector('.terminal-area'),
    resizeHandle: document.getElementById('resize-handle'),
    appManagementOverlay: document.getElementById('app-management-overlay'),
    appManagementToggle: document.getElementById('app-management-toggle'),
    appManagementClose: document.getElementById('app-management-close'),
    appManagementConnectionsList: document.getElementById('app-management-connections-list'),
    appThemeSelect: document.getElementById('app-theme-select'),
    keyboardContainer: document.querySelector('.keyboard-container')
};

// Application state
let privateKeyText = null;
let isAuthenticated = false;

/**
 * Initialize all application modules
 */
async function initApp() {
    // Initialize terminal
    await initTerminal(elements.termEl);
    
    // Apply stored theme after terminal is ready (with small delay for xterm init)
    setTimeout(() => {
        try {
            applyThemeFromStorage({
                applyTerminalTheme: applyTerminalTheme
            });
        } catch (err) {
            console.warn('Failed to apply theme from storage:', err);
        }
    }, 0);
    
    // Initialize virtual keyboard
    initVirtualKeyboard(elements.keyboardContainer, {
        getSocket,
        getTerminal
    });
    
    // Initialize UI components
    initFullscreen(elements.terminalArea, elements.fullscreenBtn);
    initResizeHandle(elements.resizeHandle, elements.terminalArea, fitTerminal);
    
    // Initialize auth select toggle
    if (elements.authSelect) {
        elements.authSelect.addEventListener('change', () => {
            setAuthUI(elements.authSelect, elements.passwordLabel, elements.keyLabel, elements.passphraseLabel);
        });
        setAuthUI(elements.authSelect, elements.passwordLabel, elements.keyLabel, elements.passphraseLabel);
    }
    
    // Initialize keyfile input
    initKeyfileInput(elements.keyfileInput, (keyText) => {
        privateKeyText = keyText;
    });
    
    // Initialize saved connections
    loadSaved(elements.savedList, (list) => {
        renderAppManagementConnections(elements.appManagementConnectionsList, list);
    });
    
    // Saved list selection handler
    if (elements.savedList) {
        elements.savedList.addEventListener('change', () => {
            const idx = elements.savedList.value;
            if (idx === '') return;
            const list = getConnections();
            const c = list[Number.parseInt(idx, 10)];
            if (!c || !elements.form) return;
            elements.form.host.value = c.host || '';
            elements.form.port.value = c.port || '22';
            elements.form.username.value = c.username || '';
            if (elements.authSelect) elements.authSelect.value = c.auth || 'password';
            setAuthUI(elements.authSelect, elements.passwordLabel, elements.keyLabel, elements.passphraseLabel);
        });
    }
    
    // Save button handler
    if (elements.saveBtn) {
        elements.saveBtn.addEventListener('click', () => {
            saveConnection(elements.form, elements.authSelect, () => {
                loadSaved(elements.savedList, (list) => {
                    renderAppManagementConnections(elements.appManagementConnectionsList, list);
                });
            });
        });
    }
    
    // Initialize app management dialog
    initAppManagement({
        overlay: elements.appManagementOverlay,
        toggleBtn: elements.appManagementToggle,
        closeBtn: elements.appManagementClose,
        connectionsList: elements.appManagementConnectionsList
    }, {
        setAuthUI: () => setAuthUI(elements.authSelect, elements.passwordLabel, elements.keyLabel, elements.passphraseLabel),
        loadSavedConnections: () => loadSaved(elements.savedList, (list) => {
            renderAppManagementConnections(elements.appManagementConnectionsList, list);
        }),
        populateForm: (conn) => {
            if (!elements.form) return;
            elements.form.host.value = conn.host || '';
            elements.form.port.value = conn.port || '22';
            elements.form.username.value = conn.username || '';
            if (elements.authSelect) elements.authSelect.value = conn.auth || 'password';
            try {
                elements.form.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (e) {}
        }
    });
    
    // Initialize theme management
    initThemeManagement(elements.appThemeSelect, {
        applyTerminalTheme: applyTerminalTheme
    });
    
    // Connect form handler
    if (elements.form) {
        elements.form.addEventListener('submit', handleConnect);
    }
    
    // Disconnect button handler
    if (elements.disconnectBtn) {
        elements.disconnectBtn.addEventListener('click', handleDisconnect);
    }
    
    // Show auth banner from query string
    showAuthBannerFromQuery(elements.authBannerEl);
    
    // Check authentication status
    checkAuthStatus({
        connectBtn: elements.connectBtn,
        onAuthenticated: () => {
            isAuthenticated = true;
        },
        onUnauthenticated: () => {
            isAuthenticated = false;
        }
    });
}

/**
 * Handle connect form submission
 */
function handleConnect(e) {
    if (e) e.preventDefault();
    
    const term = getTerminal();
    const fit = getFitAddon();
    
    // Check token validity
    if (!isTokenValid()) {
        reRunTurnstile({
            isAuthenticated,
            connectBtn: elements.connectBtn
        });
        if (term) {
            try { term.writeln('\r\n[INFO] Turnstile token missing or expired; please complete verification.'); } catch (e) {}
        }
        showConnectionBanner(elements.authBannerEl, 'Turnstile verification required before connecting.', 'info');
        return;
    }
    
    connect({
        form: elements.form,
        authSelect: elements.authSelect,
        privateKeyText,
        turnstileToken: getTurnstileToken(),
        terminal: term,
        fitAddon: fit,
        terminalArea: elements.terminalArea
    }, {
        onConnecting: () => {
            if (elements.connectBtn) elements.connectBtn.disabled = true;
            if (elements.disconnectBtn) elements.disconnectBtn.disabled = false;
        },
        onReady: () => {},
        onClose: () => {
            if (elements.connectBtn) elements.connectBtn.disabled = false;
            if (elements.disconnectBtn) elements.disconnectBtn.disabled = true;
        },
        onError: () => {},
        showBanner: (msg, kind) => showConnectionBanner(elements.authBannerEl, msg, kind),
        reRunTurnstile: () => reRunTurnstile({
            isAuthenticated,
            connectBtn: elements.connectBtn
        }),
        checkAuthStatus: () => checkAuthStatus({
            connectBtn: elements.connectBtn,
            onAuthenticated: () => { isAuthenticated = true; },
            onUnauthenticated: () => { isAuthenticated = false; }
        })
    });
}

/**
 * Handle disconnect button click
 */
function handleDisconnect() {
    disconnect({
        onDisconnect: () => {
            if (elements.connectBtn) elements.connectBtn.disabled = false;
            if (elements.disconnectBtn) elements.disconnectBtn.disabled = true;
        }
    });
}

// Expose Turnstile callback for Cloudflare script
globalThis.ksInitTurnstile = () => {
    initTurnstile({
        isAuthenticated,
        connectBtn: elements.connectBtn
    });
};

// Expose KeySocket API for external access
globalThis.KeySocket = {
    connect: handleConnect,
    disconnect: handleDisconnect,
    get terminal() { return getTerminal(); }
};

// Initialize application
initApp();