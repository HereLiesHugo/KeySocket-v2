/**
 * Theme Module - Terminal and UI theme management
 * Handles theme presets, CSS variable application, and persistence
 */

const STORAGE_KEY = 'ks_theme';

// Theme preset definitions
export const themePresets = {
    dark: {
        css: {
            '--color-bg-dark': '#0a0e27',
            '--color-bg-card': '#141829',
            '--color-bg-hover': '#1a1f3a',
            '--color-accent-primary': '#6366f1',
            '--color-accent-secondary': '#ec4899',
            '--color-accent-success': '#10b981',
            '--color-accent-error': '#ef4444',
            '--color-accent-warning': '#f59e0b',
            '--color-accent-info': '#06b6d4',
            '--color-text-primary': '#f1f5f9',
            '--color-text-secondary': '#cbd5e1',
            '--color-text-muted': '#94a3b8',
            '--color-text-subtle': '#64748b',
            '--color-border': 'rgba(100, 116, 139, 0.2)',
            '--color-border-light': 'rgba(148, 163, 184, 0.15)',
            '--color-glass': 'rgba(255, 255, 255, 0.05)',
            '--color-glass-hover': 'rgba(255, 255, 255, 0.08)'
        },
        terminal: {
            background: '#0a0e27',
            foreground: '#f1f5f9'
        }
    },
    darker: {
        css: {
            '--color-bg-dark': '#010205',
            '--color-bg-card': '#0a0d1a',
            '--color-bg-hover': '#0f1220',
            '--color-accent-primary': '#22c55e',
            '--color-accent-secondary': '#84cc16',
            '--color-accent-success': '#16a34a',
            '--color-accent-error': '#dc2626',
            '--color-accent-warning': '#d97706',
            '--color-accent-info': '#0891b2',
            '--color-text-primary': '#f5f5f4',
            '--color-text-secondary': '#d4d4d8',
            '--color-text-muted': '#a1a1aa',
            '--color-text-subtle': '#71717a',
            '--color-border': 'rgba(113, 113, 122, 0.2)',
            '--color-border-light': 'rgba(161, 161, 170, 0.15)',
            '--color-glass': 'rgba(255, 255, 255, 0.03)',
            '--color-glass-hover': 'rgba(255, 255, 255, 0.05)'
        },
        terminal: {
            background: '#010205',
            foreground: '#f5f5f4'
        }
    },
    light: {
        css: {
            '--color-bg-dark': '#f8fafc',
            '--color-bg-card': '#ffffff',
            '--color-bg-hover': '#f1f5f9',
            '--color-accent-primary': '#0ea5e9',
            '--color-accent-secondary': '#06b6d4',
            '--color-accent-success': '#10b981',
            '--color-accent-error': '#ef4444',
            '--color-accent-warning': '#f59e0b',
            '--color-accent-info': '#0284c7',
            '--color-text-primary': '#0f172a',
            '--color-text-secondary': '#1e293b',
            '--color-text-muted': '#64748b',
            '--color-text-subtle': '#94a3b8',
            '--color-border': 'rgba(15, 23, 42, 0.2)',
            '--color-border-light': 'rgba(15, 23, 42, 0.1)',
            '--color-glass': 'rgba(15, 23, 42, 0.05)',
            '--color-glass-hover': 'rgba(15, 23, 42, 0.08)'
        },
        terminal: {
            background: '#ffffff',
            foreground: '#0f172a'
        }
    },
    monokai: {
        css: {
            '--color-bg-dark': '#272822',
            '--color-bg-card': '#1e1f1c',
            '--color-bg-hover': '#3e3d32',
            '--color-accent-primary': '#f92672',
            '--color-accent-secondary': '#fd971f',
            '--color-accent-success': '#a6e22e',
            '--color-accent-error': '#f92672',
            '--color-accent-warning': '#fd971f',
            '--color-accent-info': '#66d9ef',
            '--color-text-primary': '#f5f5f4',
            '--color-text-secondary': '#e6db74',
            '--color-text-muted': '#a1a1aa',
            '--color-text-subtle': '#75715e',
            '--color-border': 'rgba(161, 161, 170, 0.2)',
            '--color-border-light': 'rgba(161, 161, 170, 0.1)',
            '--color-glass': 'rgba(39, 40, 34, 0.5)',
            '--color-glass-hover': 'rgba(39, 40, 34, 0.7)'
        },
        terminal: {
            background: '#272822',
            foreground: '#f5f5f4'
        }
    },
    dracula: {
        css: {
            '--color-bg-dark': '#282a36',
            '--color-bg-card': '#1e1f29',
            '--color-bg-hover': '#44475a',
            '--color-accent-primary': '#bd93f9',
            '--color-accent-secondary': '#ff79c6',
            '--color-accent-success': '#50fa7b',
            '--color-accent-error': '#ff5555',
            '--color-accent-warning': '#f1fa8c',
            '--color-accent-info': '#8be9fd',
            '--color-text-primary': '#f8f8f2',
            '--color-text-secondary': '#f1fa8c',
            '--color-text-muted': '#6272a4',
            '--color-text-subtle': '#44475a',
            '--color-border': 'rgba(189, 147, 249, 0.2)',
            '--color-border-light': 'rgba(189, 147, 249, 0.1)',
            '--color-glass': 'rgba(40, 42, 54, 0.5)',
            '--color-glass-hover': 'rgba(40, 42, 54, 0.7)'
        },
        terminal: {
            background: '#282a36',
            foreground: '#f8f8f2'
        }
    },
    'solarized-dark': {
        css: {
            '--color-bg-dark': '#002b36',
            '--color-bg-card': '#073642',
            '--color-bg-hover': '#586e75',
            '--color-accent-primary': '#268bd2',
            '--color-accent-secondary': '#2aa198',
            '--color-accent-success': '#859900',
            '--color-accent-error': '#dc322f',
            '--color-accent-warning': '#b58900',
            '--color-accent-info': '#2aa198',
            '--color-text-primary': '#eee8d5',
            '--color-text-secondary': '#93a1a1',
            '--color-text-muted': '#657b83',
            '--color-text-subtle': '#586e75',
            '--color-border': 'rgba(147, 161, 161, 0.2)',
            '--color-border-light': 'rgba(147, 161, 161, 0.1)',
            '--color-glass': 'rgba(7, 54, 66, 0.5)',
            '--color-glass-hover': 'rgba(7, 54, 66, 0.7)'
        },
        terminal: {
            background: '#002b36',
            foreground: '#eee8d5'
        }
    },
    'solarized-light': {
        css: {
            '--color-bg-dark': '#fdf6e3',
            '--color-bg-card': '#fffef7',
            '--color-bg-hover': '#eee8d5',
            '--color-accent-primary': '#268bd2',
            '--color-accent-secondary': '#2aa198',
            '--color-accent-success': '#859900',
            '--color-accent-error': '#dc322f',
            '--color-accent-warning': '#b58900',
            '--color-accent-info': '#2aa198',
            '--color-text-primary': '#073642',
            '--color-text-secondary': '#586e75',
            '--color-text-muted': '#657b83',
            '--color-text-subtle': '#93a1a1',
            '--color-border': 'rgba(101, 123, 131, 0.2)',
            '--color-border-light': 'rgba(101, 123, 131, 0.1)',
            '--color-glass': 'rgba(233, 225, 201, 0.5)',
            '--color-glass-hover': 'rgba(233, 225, 201, 0.7)'
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
