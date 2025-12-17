/* Terminal Module */
export let term = null;
export let fit = null;

export function initTerminal(containerId) {
    const Terminal = window.Terminal;
    const FitAddon = window.FitAddon && (window.FitAddon.FitAddon || window.FitAddon);
    const WebglAddon = window.WebglAddon && (window.WebglAddon.WebglAddon || window.WebglAddon);

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
        try { fit = new FitAddon(); term.loadAddon(fit); } catch (e) {}
    }

    if (WebglAddon) {
        try { term.loadAddon(new WebglAddon()); } catch (e) {}
    }

    const el = document.getElementById(containerId);
    if (el) term.open(el);
    if (fit) try { fit.fit(); } catch(e){}

    // Global resize observer could go here or in app.js
    window.addEventListener('resize', () => {
        if (fit) try { fit.fit(); } catch(e){}
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
