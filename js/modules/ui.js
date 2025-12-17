/* UI Module */
export function initUI(termModule, sendToSocket) {
    // Theme presets
    const themePresets = {
        dark: { css: { '--bg': '#0f1720', '--panel': '#0b1220', '--text-primary': '#cbd5e1' }, terminal: { background: '#0b1220', foreground: '#cbd5e1' } },
        light: { css: { '--bg': '#f3f4f6', '--panel': '#ffffff', '--text-primary': '#111827' }, terminal: { background: '#ffffff', foreground: '#111827' } }
    };

    function applyTheme(key) {
        const t = themePresets[key] || themePresets.dark;
        const root = document.documentElement;
        Object.keys(t.css).forEach(k => root.style.setProperty(k, t.css[k]));
        if (termModule && t.terminal) termModule.applyTheme(t.terminal);
        localStorage.setItem('ks_theme', key);
        const sel = document.getElementById('app-theme-select');
        if (sel) sel.value = key;
    }

    const saved = localStorage.getItem('ks_theme') || 'dark';
    applyTheme(saved);

    const themeSelect = document.getElementById('app-theme-select');
    if (themeSelect) themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));

    // Keyboard Logic
    const container = document.querySelector('.keyboard-container');
    if (container) {
        // Virtual Keyboard Implementation
        const rows = [
            ['Esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', 'Bksp'],
            ['Tab', 'q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', '\\'],
            ['Caps', 'a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", 'Enter'],
            ['Shift', 'z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', 'Up'],
            ['Ctrl', 'Alt', 'Space', 'Left', 'Down', 'Right']
        ];
        
        const state = { shift: false, ctrl: false, caps: false };
        let html = '<div class="vk-board">';
        
        rows.forEach(row => {
            html += '<div class="vk-row">';
            row.forEach(key => {
                let label = key;
                let classes = 'vk-key';
                if (['Esc', 'Bksp', 'Tab', 'Caps', 'Shift', 'Enter', 'Ctrl', 'Alt', 'Up', 'Left', 'Down', 'Right'].includes(key)) {
                    classes += ' vk-special';
                }
                if (key === 'Space') classes += ' vk-space';
                
                html += `<button type="button" class="${classes}" data-key="${key}">${label}</button>`;
            });
            html += '</div>';
        });
        html += '</div>';
        container.innerHTML = html;

        // Helper to handle modifier keys return true if handled
        const handleModifier = (key, btn) => {
            if (key === 'Shift') {
                state.shift = !state.shift;
                btn.classList.toggle('active', state.shift);
                return true;
            }
            if (key === 'Ctrl') {
                state.ctrl = !state.ctrl;
                btn.classList.toggle('active', state.ctrl);
                return true;
            }
            if (key === 'Caps') {
                state.caps = !state.caps;
                btn.classList.toggle('active', state.caps);
                return true;
            }
            return false;
        };

        const getChar = (key) => {
            const special = {
                'Esc': '\x1b', 'Tab': '\t', 'Bksp': '\x7f', 'Enter': '\r',
                'Up': '\x1b[A', 'Down': '\x1b[B', 'Right': '\x1b[C', 'Left': '\x1b[D', 'Space': ' '
            };
            if (special[key]) return special[key];
            
            // Normal keys logic
            if (state.caps || state.shift) return key.toUpperCase();
            return key.toLowerCase();
        };

        // Event Handling
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.vk-key');
            if (!btn) return;
            e.preventDefault(); // prevent focus loss from terminal
            
            const key = btn.dataset.key;
            
            if (handleModifier(key, btn)) return;

            let charToSend = getChar(key);

            // Apply Ctrl modifier (for a-z)
            if (state.ctrl && charToSend.length === 1 && /[a-z]/i.test(charToSend)) {
                const code = charToSend.toUpperCase().codePointAt(0) - 64;
                charToSend = String.fromCodePoint(code);
                // Auto-reset ctrl after use? Usually nicer for touch
                state.ctrl = false; 
                const ctrlBtn = container.querySelector('[data-key="Ctrl"]');
                if (ctrlBtn) ctrlBtn.classList.remove('active');
            }
            
            // Auto-reset shift
            if (state.shift) {
                 state.shift = false;
                 const shiftBtn = container.querySelector('[data-key="Shift"]');
                 if (shiftBtn) shiftBtn.classList.remove('active');
            }

            if (sendToSocket) sendToSocket(charToSend);
            if (termModule) termModule.focus();
        });
    }

    // Fullscreen
    const fsBtn = document.getElementById('fullscreen-btn');
    if (fsBtn) {
        fsBtn.addEventListener('click', () => {
             if (document.fullscreenElement) document.exitFullscreen();
             else document.documentElement.requestFullscreen().catch(()=>{});
        });
    }
}

export function showBanner(msg, type) {
    const el = document.getElementById('auth-banner');
    if (!el) return;
    el.textContent = msg;
    el.className = 'auth-banner ' + (type === 'error' ? 'auth-banner--error' : 'auth-banner--success');
    el.hidden = false;
    setTimeout(() => el.hidden = true, 5000);
}
