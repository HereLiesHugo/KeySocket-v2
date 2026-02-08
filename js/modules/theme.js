/**
 * Theme Module - Terminal and UI theme management
 * Handles theme presets, CSS variable application, and persistence
 */

const STORAGE_KEY = 'ks_theme';

// Theme preset definitions
export const themePresets = {
    dark: {
        css: {
            '--bg': '#0f1720',
            '--panel': '#0b1220',
            '--muted': '#9aa6b2',
            '--accent': '#6ee7b7',
            '--glass': 'rgba(255, 255, 255, 0.02)',
            '--border-subtle': 'rgba(255, 255, 255, 0.04)',
            '--border-light': 'rgba(255, 255, 255, 0.08)',
            '--text-primary': '#cbd5e1'
        },
        terminal: {
            background: '#0b1220',
            foreground: '#cbd5e1'
        }
    },
    darker: {
        css: {
            '--bg': '#020617',
            '--panel': '#020617',
            '--muted': '#6b7280',
            '--accent': '#22c55e',
            '--glass': 'rgba(15, 23, 42, 0.9)',
            '--border-subtle': 'rgba(148, 163, 184, 0.2)',
            '--border-light': 'rgba(148, 163, 184, 0.35)',
            '--text-primary': '#e5e7eb'
        },
        terminal: {
            background: '#020617',
            foreground: '#e5e7eb'
        }
    },
    light: {
        css: {
            '--bg': '#f3f4f6',
            '--panel': '#ffffff',
            '--muted': '#6b7280',
            '--accent': '#0ea5e9',
            '--glass': 'rgba(148, 163, 184, 0.08)',
            '--border-subtle': 'rgba(148, 163, 184, 0.4)',
            '--border-light': 'rgba(148, 163, 184, 0.7)',
            '--text-primary': '#111827'
        },
        terminal: {
            background: '#ffffff',
            foreground: '#111827'
        }
    },
    monokai: {
        css: {
            '--bg': '#272822',
            '--panel': '#1e1f1c',
            '--muted': '#a1a1aa',
            '--accent': '#facc15',
            '--glass': 'rgba(39, 40, 34, 0.85)',
            '--border-subtle': 'rgba(161, 161, 170, 0.4)',
            '--border-light': 'rgba(250, 204, 21, 0.7)',
            '--text-primary': '#f5f5f4'
        },
        terminal: {
            background: '#272822',
            foreground: '#f5f5f4'
        }
    },
    dracula: {
        css: {
            '--bg': '#282a36',
            '--panel': '#20222d',
            '--muted': '#9ea2b8',
            '--accent': '#bd93f9',
            '--glass': 'rgba(40, 42, 54, 0.9)',
            '--border-subtle': 'rgba(189, 147, 249, 0.25)',
            '--border-light': 'rgba(189, 147, 249, 0.45)',
            '--text-primary': '#f8f8f2'
        },
        terminal: {
            background: '#282a36',
            foreground: '#f8f8f2'
        }
    },
    'solarized-dark': {
        css: {
            '--bg': '#002b36',
            '--panel': '#073642',
            '--muted': '#93a1a1',
            '--accent': '#b58900',
            '--glass': 'rgba(7, 54, 66, 0.95)',
            '--border-subtle': 'rgba(147, 161, 161, 0.35)',
            '--border-light': 'rgba(181, 137, 0, 0.6)',
            '--text-primary': '#eee8d5'
        },
        terminal: {
            background: '#002b36',
            foreground: '#eee8d5'
        }
    },
    'solarized-light': {
        css: {
            '--bg': '#fdf6e3',
            '--panel': '#fffef7',
            '--muted': '#657b83',
            '--accent': '#268bd2',
            '--glass': 'rgba(233, 225, 201, 0.9)',
            '--border-subtle': 'rgba(101, 123, 131, 0.35)',
            '--border-light': 'rgba(38, 139, 210, 0.6)',
            '--text-primary': '#073642'
        },
        terminal: {
            background: '#fdf6e3',
            foreground: '#073642'
        }
    }
};

// Current theme state
let currentTheme = 'dark';

/**
 * Get current theme key
 * @returns {string}
 */
export function getCurrentTheme() {
    return currentTheme;
}

/**
 * Apply a theme to the UI and terminal
 * @param {string} themeKey - Theme preset key
 * @param {Object} options - Optional config
 * @param {Function} options.applyTerminalTheme - Function to apply terminal theme
 * @param {HTMLSelectElement} options.themeSelect - Theme select element to sync
 */
export function applyTheme(themeKey, options = {}) {
    const root = document.documentElement;
    const preset = themePresets[themeKey] || themePresets.dark;
    currentTheme = themeKey in themePresets ? themeKey : 'dark';
    
    // Apply CSS variables
    const css = preset.css || {};
    Object.keys(css).forEach((k) => {
        root.style.setProperty(k, css[k]);
    });
    
    // Apply terminal-specific CSS variables
    if (preset.terminal) {
        try {
            root.style.setProperty('--terminal-bg', preset.terminal.background);
            root.style.setProperty('--terminal-fg', preset.terminal.foreground);
        } catch (e) {
            console.warn('Failed to set terminal CSS variables:', e);
        }
        
        // Apply to terminal instance if callback provided
        if (options.applyTerminalTheme) {
            options.applyTerminalTheme(preset.terminal);
        }
    }
    
    // Save to localStorage
    try {
        localStorage.setItem(STORAGE_KEY, currentTheme);
    } catch (e) {
        console.warn('Failed to save theme to localStorage:', e);
    }
    
    // Sync select element
    if (options.themeSelect) {
        options.themeSelect.value = currentTheme;
    }
}

/**
 * Load and apply theme from localStorage
 * @param {Object} options - Same as applyTheme options
 */
export function applyThemeFromStorage(options = {}) {
    let stored = null;
    try {
        stored = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
        console.warn('Failed to read theme from localStorage:', e);
    }
    if (!stored) stored = 'dark';
    applyTheme(stored, options);
}

/**
 * Initialize theme management with select element
 * @param {HTMLSelectElement} themeSelect - Theme select element
 * @param {Object} options - Theme options passed to applyTheme
 */
export function initThemeManagement(themeSelect, options = {}) {
    if (!themeSelect) {
        applyThemeFromStorage(options);
        return;
    }
    
    let stored = null;
    try {
        stored = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
        console.warn('Failed to read theme from localStorage:', e);
    }
    if (!stored) stored = 'dark';
    if (!(stored in themePresets)) stored = 'dark';
    
    themeSelect.value = stored;
    applyTheme(stored, { ...options, themeSelect });
    
    themeSelect.addEventListener('change', () => {
        const v = themeSelect.value || 'dark';
        applyTheme(v, { ...options, themeSelect });
    });
}
