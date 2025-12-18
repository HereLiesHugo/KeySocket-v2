/* Terminal Module */
let term = null;
let fit = null;

export function initTerminal(containerId) {
    const Terminal = globalThis.Terminal;
    const FitAddon = globalThis.FitAddon && (globalThis.FitAddon.FitAddon || globalThis.FitAddon);
    const WebglAddon = globalThis.WebglAddon && (globalThis.WebglAddon.WebglAddon || globalThis.WebglAddon);

    if (!Terminal) {
        console.error('xterm not found');
        return;
    }

    term = new Terminal({
        rendererType: 'webgl',
        cursorBlink: true,
        fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
        fontSize: 14,
        allowTransparency: false,
        theme: { background: '#0b1220', foreground: '#cbd5e1' }
    });

    if (FitAddon) {
        try { 
            fit = new FitAddon(); 
            term.loadAddon(fit); 
        } catch (e) {
            console.warn('Failed to load FitAddon', e);
        }
    }

    if (WebglAddon) {
        try { 
            term.loadAddon(new WebglAddon()); 
        } catch (e) {
            console.warn('Failed to load WebglAddon', e);
        }
    }

    const el = document.getElementById(containerId);
    if (el) term.open(el);
    if (fit) {
        try { 
            fit.fit(); 
        } catch(e) {
            console.warn('Fit error', e);
        }
    }

    // Global resize observer could go here or in app.js
    globalThis.addEventListener('resize', () => {
        if (fit) {
            try { 
                fit.fit(); 
            } catch(e) {
                console.warn('Resize fit error', e);
            }
        }
    });
}

export function write(data) {
    if (term) term.write(data);
}

export function onData(callback) {
    if (term) term.onData(callback);
}

export function focus() {
    if (term) term.focus();
}

export function applyTheme(theme) {
    if (term) {
        term.setOption('theme', theme);
    }
}
