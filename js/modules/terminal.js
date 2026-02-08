/**
 * Terminal Module - xterm.js initialization and management
 * Handles terminal creation, addons (FitAddon, WebglAddon), and fallback
 */

// Globals from xterm libraries (loaded via script tags before this module)
const Terminal = window.Terminal || null;
const FitAddon = (window.FitAddon && (window.FitAddon.FitAddon || window.FitAddon)) || null;
const WebglAddon = (window.WebglAddon && (window.WebglAddon.WebglAddon || window.WebglAddon)) || null;

// Module state
let term = null;
let fit = null;

/**
 * Get the terminal instance
 * @returns {Terminal|null}
 */
export function getTerminal() {
    return term;
}

/**
 * Get the FitAddon instance
 * @returns {FitAddon|null}
 */
export function getFitAddon() {
    return fit;
}

/**
 * Create a fallback terminal stub when xterm.js fails to load
 * @param {HTMLElement} termEl - The terminal container element
 */
export function fallbackTerminal(termEl) {
    console.error('xterm Terminal constructor not found on window');
    term = {
        write: (s) => { if (termEl) termEl.textContent += s; },
        writeln: (s) => { if (termEl) termEl.textContent += s + '\n'; },
        onData: () => {},
        open: () => {},
        focus: () => {},
        clear: () => {},
        cols: 80,
        rows: 24,
        loadAddon: () => {},
        setOption: () => {}
    };
    if (termEl) termEl.textContent = '\n[Terminal not available: xterm.js failed to load]\n';
    
    // Expose fallback terminal globally
    window.KeySocket = { terminal: term };
    
    return term;
}

/**
 * Initialize the xterm.js terminal with addons
 * @param {HTMLElement} termEl - The terminal container element
 * @param {Object} options - Optional configuration overrides
 * @returns {Promise<{term: Terminal, fit: FitAddon}>}
 */
export async function initTerminal(termEl, options = {}) {
    // Wait for fonts to be ready before initializing terminal
    await document.fonts.ready;
    
    if (!Terminal || typeof Terminal !== 'function') {
        fallbackTerminal(termEl);
        return { term, fit };
    }
    
    const defaultTheme = {
        background: '#0b1220',
        foreground: '#cbd5e1'
    };
    
    term = new Terminal({
        cursorBlink: true,
        fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
        fontSize: 14,
        allowTransparency: false,
        theme: options.theme || defaultTheme,
        ...options
    });

    // Load FitAddon
    if (FitAddon && (typeof FitAddon === 'function' || typeof FitAddon === 'object')) {
        try {
            fit = new (FitAddon.FitAddon || FitAddon)();
        } catch (e) {
            try {
                fit = new FitAddon();
            } catch (ee) {
                fit = null;
            }
        }
        try {
            if (fit && typeof fit.fit === 'function') term.loadAddon(fit);
        } catch (e) {
            /* ignore addon load errors */
        }
    }

    // Load WebGL addon for GPU-accelerated rendering
    if (WebglAddon && (typeof WebglAddon === 'function' || typeof WebglAddon === 'object')) {
        try {
            term.loadAddon(new (WebglAddon.WebglAddon || WebglAddon)());
        } catch (e) {
            console.error('WebGL addon failed to load', e);
        }
    } else {
        console.warn('WebGL addon not found, using canvas renderer');
    }

    // Open terminal
    try {
        term.open(termEl);
    } catch (e) {
        console.error('term.open failed', e);
    }

    // Fit to container
    try {
        if (fit && typeof fit.fit === 'function') fit.fit();
    } catch (e) { /* ignore fit errors */ }

    return { term, fit };
}

/**
 * Apply a theme to the terminal
 * @param {Object} themeConfig - Theme configuration with background/foreground
 */
export function applyTerminalTheme(themeConfig) {
    if (term && typeof term.setOption === 'function' && themeConfig) {
        try {
            term.setOption('theme', {
                background: themeConfig.background,
                foreground: themeConfig.foreground
            });
        } catch (e) {
            console.error('Failed to apply terminal theme', e);
        }
    }
}

/**
 * Fit the terminal to its container
 */
export function fitTerminal() {
    if (fit && typeof fit.fit === 'function') {
        try {
            fit.fit();
        } catch (e) {
            console.error('fit.fit error:', e);
        }
    }
}
