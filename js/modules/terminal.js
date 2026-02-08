/**
 * Terminal Module - xterm.js initialization and management
 * Handles terminal creation, addons (FitAddon, WebglAddon), and fallback
 */

// Globals from xterm libraries (loaded via script tags before this module)
const Terminal = globalThis.Terminal || null;
const FitAddon = (globalThis.FitAddon && (globalThis.FitAddon.FitAddon || globalThis.FitAddon)) || null;
const WebglAddon = (globalThis.WebglAddon && (globalThis.WebglAddon.WebglAddon || globalThis.WebglAddon)) || null;

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
    globalThis.KeySocket = { terminal: term };
    
    return term;
}

/**
 * Try to create FitAddon instance with fallback
 * @returns {Object|null}
 */
function tryLoadFitAddon() {
    if (!FitAddon || (typeof FitAddon !== 'function' && typeof FitAddon !== 'object')) {
        return null;
    }
    try {
        return new (FitAddon.FitAddon || FitAddon)();
    } catch (e) {
        console.warn('FitAddon.FitAddon constructor failed, trying fallback:', e);
        try {
            return new FitAddon();
        } catch (error_) {
            console.warn('FitAddon fallback constructor failed:', error_);
            return null;
        }
    }
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
    fit = tryLoadFitAddon();
    if (fit && typeof fit.fit === 'function') {
        try {
            term.loadAddon(fit);
        } catch (e) {
            console.warn('Failed to load FitAddon into terminal:', e);
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
    if (fit && typeof fit.fit === 'function') {
        try {
            fit.fit();
        } catch (e) {
            console.warn('Initial fit.fit() failed:', e);
        }
    }

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
