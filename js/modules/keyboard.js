/**
 * Virtual Keyboard Module - On-screen keyboard for mobile/touch input
 * Supports QWERTY, AZERTY, and symbols layouts with modifier keys
 */

// Key layouts for different keyboard configurations
const keyLayouts = {
    qwerty: [
        // Row 1 (Total: 14 flex units)
        [{ key: '`', shiftKey: '~', code: 'Backquote', flex: 1 }, { key: '1', shiftKey: '!', code: 'Digit1', flex: 1 }, { key: '2', shiftKey: '@', code: 'Digit2', flex: 1 }, { key: '3', shiftKey: '#', code: 'Digit3', flex: 1 }, { key: '4', shiftKey: '$', code: 'Digit4', flex: 1 }, { key: '5', shiftKey: '%', code: 'Digit5', flex: 1 }, { key: '6', shiftKey: '^', code: 'Digit6', flex: 1 }, { key: '7', shiftKey: '&', code: 'Digit7', flex: 1 }, { key: '8', shiftKey: '*', code: 'Digit8', flex: 1 }, { key: '9', shiftKey: '(', code: 'Digit9', flex: 1 }, { key: '0', shiftKey: ')', code: 'Digit0', flex: 1 }, { key: 'backspace', code: 'Backspace', flex: 2 }],
        // Row 2
        [{ key: 'tab', code: 'Tab', flex: 1.5 }, { key: 'q', shiftKey: 'Q', code: 'KeyQ', flex: 1 }, { key: 'w', shiftKey: 'W', code: 'KeyW', flex: 1 }, { key: 'e', shiftKey: 'E', code: 'KeyE', flex: 1 }, { key: 'r', shiftKey: 'R', code: 'KeyR', flex: 1 }, { key: 't', shiftKey: 'T', code: 'KeyT', flex: 1 }, { key: 'y', shiftKey: 'Y', code: 'KeyY', flex: 1 }, { key: 'u', shiftKey: 'U', code: 'KeyU', flex: 1 }, { key: 'i', shiftKey: 'I', code: 'KeyI', flex: 1 }, { key: 'o', shiftKey: 'O', code: 'KeyO', flex: 1 }, { key: 'p', shiftKey: 'P', code: 'KeyP', flex: 1 }, { key: '\\', shiftKey: '|', code: 'Backslash', flex: 1.5 }],
        // Row 3
        [{ key: 'esc', code: 'Escape', flex: 1.5 }, { key: 'a', shiftKey: 'A', code: 'KeyA', flex: 1 }, { key: 's', shiftKey: 'S', code: 'KeyS', flex: 1 }, { key: 'd', shiftKey: 'D', code: 'KeyD', flex: 1 }, { key: 'f', shiftKey: 'F', code: 'KeyF', flex: 1 }, { key: 'g', shiftKey: 'G', code: 'KeyG', flex: 1 }, { key: 'h', shiftKey: 'H', code: 'KeyH', flex: 1 }, { key: 'j', shiftKey: 'J', code: 'KeyJ', flex: 1 }, { key: 'k', shiftKey: 'K', code: 'KeyK', flex: 1 }, { key: 'l', shiftKey: 'L', code: 'KeyL', flex: 1 }, { key: 'enter', code: 'Enter', flex: 2.5 }],
        // Row 4
        [{ key: 'shift', code: 'ShiftLeft', flex: 2.5, modifier: true }, { key: 'z', shiftKey: 'Z', code: 'KeyZ', flex: 1 }, { key: 'x', shiftKey: 'X', code: 'KeyX', flex: 1 }, { key: 'c', shiftKey: 'C', code: 'KeyC', flex: 1 }, { key: 'v', shiftKey: 'V', code: 'KeyV', flex: 1 }, { key: 'b', shiftKey: 'B', code: 'KeyB', flex: 1 }, { key: 'n', shiftKey: 'N', code: 'KeyN', flex: 1 }, { key: 'm', shiftKey: 'M', code: 'KeyM', flex: 1 }, { key: ',', shiftKey: '<', code: 'Comma', flex: 1 }, { key: '.', shiftKey: '>', code: 'Period', flex: 1 }, { key: '/', shiftKey: '?', code: 'Slash', flex: 1 }, { key: 'shift', code: 'ShiftRight', flex: 1.5, modifier: true }],
        // Row 5
        [{ key: 'ctrl', code: 'ControlLeft', flex: 1.5, modifier: true }, { key: 'symbols', code: 'Symbols', flex: 1.5 }, { key: 'lang', code: 'Lang', flex: 1.5 }, { key: 'space', code: 'Space', flex: 5 }, { key: '←', code: 'ArrowLeft', flex: 1.125 }, { key: '↑', code: 'ArrowUp', flex: 1.125 }, { key: '↓', code: 'ArrowDown', flex: 1.125 }, { key: '→', code: 'ArrowRight', flex: 1.125 }]
    ],
    azerty: [
        // Row 1
        [{ key: '`', shiftKey: '~', code: 'Backquote', flex: 1 }, { key: '1', shiftKey: '&', code: 'Digit1', flex: 1 }, { key: '2', shiftKey: 'é', code: 'Digit2', flex: 1 }, { key: '3', shiftKey: '"', code: 'Digit3', flex: 1 }, { key: '4', shiftKey: "'", code: 'Digit4', flex: 1 }, { key: '5', shiftKey: '(', code: 'Digit5', flex: 1 }, { key: '6', shiftKey: '-', code: 'Digit6', flex: 1 }, { key: '7', shiftKey: 'è', code: 'Digit7', flex: 1 }, { key: '8', shiftKey: '_', code: 'Digit8', flex: 1 }, { key: '9', shiftKey: 'ç', code: 'Digit9', flex: 1 }, { key: '0', shiftKey: 'à', code: 'Digit0', flex: 1 }, { key: 'backspace', code: 'Backspace', flex: 2 }],
        // Row 2
        [{ key: 'tab', code: 'Tab', flex: 1.5 }, { key: 'a', shiftKey: 'A', code: 'KeyA', flex: 1 }, { key: 'z', shiftKey: 'Z', code: 'KeyZ', flex: 1 }, { key: 'e', shiftKey: 'E', code: 'KeyE', flex: 1 }, { key: 'r', shiftKey: 'R', code: 'KeyR', flex: 1 }, { key: 't', shiftKey: 'T', code: 'KeyT', flex: 1 }, { key: 'y', shiftKey: 'Y', code: 'KeyY', flex: 1 }, { key: 'u', shiftKey: 'U', code: 'KeyU', flex: 1 }, { key: 'i', shiftKey: 'I', code: 'KeyI', flex: 1 }, { key: 'o', shiftKey: 'O', code: 'KeyO', flex: 1 }, { key: 'p', shiftKey: 'P', code: 'KeyP', flex: 1 }, { key: '\\', shiftKey: '|', code: 'Backslash', flex: 1.5 }],
        // Row 3
        [{ key: 'esc', code: 'Escape', flex: 1.5 }, { key: 'q', shiftKey: 'Q', code: 'KeyQ', flex: 1 }, { key: 's', shiftKey: 'S', code: 'KeyS', flex: 1 }, { key: 'd', shiftKey: 'D', code: 'KeyD', flex: 1 }, { key: 'f', shiftKey: 'F', code: 'KeyF', flex: 1 }, { key: 'g', shiftKey: 'G', code: 'KeyG', flex: 1 }, { key: 'h', shiftKey: 'H', code: 'KeyH', flex: 1 }, { key: 'j', shiftKey: 'J', code: 'KeyJ', flex: 1 }, { key: 'k', shiftKey: 'K', code: 'KeyK', flex: 1 }, { key: 'l', shiftKey: 'L', code: 'KeyL', flex: 1 }, { key: 'm', shiftKey: 'M', code: 'KeyM', flex: 1 }, { key: 'enter', code: 'Enter', flex: 1.5 }],
        // Row 4
        [{ key: 'shift', code: 'ShiftLeft', flex: 2.5, modifier: true }, { key: 'w', shiftKey: 'W', code: 'KeyW', flex: 1 }, { key: 'x', shiftKey: 'X', code: 'KeyX', flex: 1 }, { key: 'c', shiftKey: 'C', code: 'KeyC', flex: 1 }, { key: 'v', shiftKey: 'V', code: 'KeyV', flex: 1 }, { key: 'b', shiftKey: 'B', code: 'KeyB', flex: 1 }, { key: 'n', shiftKey: 'N', code: 'KeyN', flex: 1 }, { key: ',', shiftKey: '?', code: 'Comma', flex: 1 }, { key: ';', shiftKey: '.', code: 'Semicolon', flex: 1 }, { key: ':', shiftKey: '/', code: 'Colon', flex: 1 }, { key: '!', shiftKey: '§', code: 'Exclamation', flex: 1 }, { key: 'shift', code: 'ShiftRight', flex: 1.5, modifier: true }],
        // Row 5
        [{ key: 'ctrl', code: 'ControlLeft', flex: 1.5, modifier: true }, { key: 'symbols', code: 'Symbols', flex: 1.5 }, { key: 'lang', code: 'Lang', flex: 1.5 }, { key: 'space', code: 'Space', flex: 5 }, { key: '←', code: 'ArrowLeft', flex: 1.125 }, { key: '↑', code: 'ArrowUp', flex: 1.125 }, { key: '↓', code: 'ArrowDown', flex: 1.125 }, { key: '→', code: 'ArrowRight', flex: 1.125 }]
    ],
    symbols: [
        // Row 1
        [{ key: '`', shiftKey: '~', code: 'Backquote', flex: 1 }, { key: '1', shiftKey: '!', code: 'Digit1', flex: 1 }, { key: '2', shiftKey: '@', code: 'Digit2', flex: 1 }, { key: '3', shiftKey: '#', code: 'Digit3', flex: 1 }, { key: '4', shiftKey: '$', code: 'Digit4', flex: 1 }, { key: '5', shiftKey: '%', code: 'Digit5', flex: 1 }, { key: '6', shiftKey: '^', code: 'Digit6', flex: 1 }, { key: '7', shiftKey: '&', code: 'Digit7', flex: 1 }, { key: '8', shiftKey: '*', code: 'Digit8', flex: 1 }, { key: '9', shiftKey: '(', code: 'Digit9', flex: 1 }, { key: '0', shiftKey: ')', code: 'Digit0', flex: 1 }, { key: 'backspace', code: 'Backspace', flex: 2 }],
        // Row 2
        [{ key: 'tab', code: 'Tab', flex: 1.5 }, { key: '[', shiftKey: '{', code: 'BracketLeft', flex: 1 }, { key: ']', shiftKey: '}', code: 'BracketRight', flex: 1 }, { key: ';', shiftKey: ':', code: 'Semicolon', flex: 1 }, { key: "'", shiftKey: '"', code: 'Quote', flex: 1 }, { key: '=', shiftKey: '+', code: 'Equal', flex: 1 }, { key: '-', shiftKey: '_', code: 'Minus', flex: 1 }],
        // Row 3 -> Empty on purpose for spacing
        [],
        // Row 4
        [{ key: 'shift', code: 'ShiftLeft', flex: 2.5, modifier: true }],
        // Row 5
        [{ key: 'ctrl', code: 'ControlLeft', flex: 1.5, modifier: true }, { key: 'abc', code: 'Symbols', flex: 1.5 }, { key: 'lang', code: 'Lang', flex: 1.5 }, { key: 'space', code: 'Space', flex: 5 }, { key: '←', code: 'ArrowLeft', flex: 1.125 }, { key: '↑', code: 'ArrowUp', flex: 1.125 }, { key: '↓', code: 'ArrowDown', flex: 1.125 }, { key: '→', code: 'ArrowRight', flex: 1.125 }]
    ]
};

// Escape codes for special keys
const escapeCodes = {
    'Enter': '\r',
    'Backspace': '\x7f',
    'Tab': '\t',
    'Escape': '\x1b',
    'Space': ' ',
    'ArrowUp': '\x1b[A',
    'ArrowDown': '\x1b[B',
    'ArrowRight': '\x1b[C',
    'ArrowLeft': '\x1b[D'
};

/**
 * Initialize the virtual keyboard
 * @param {HTMLElement} container - The keyboard container element
 * @param {Object} dependencies - Required dependencies
 * @param {Function} dependencies.getSocket - Function to get WebSocket instance
 * @param {Function} dependencies.getTerminal - Function to get terminal instance
 */
export function initVirtualKeyboard(container, { getSocket, getTerminal }) {
    if (!container) return;

    const state = { shift: false, ctrl: false, layout: 'qwerty' };

    function sendToSocket(data) {
        const socket = getSocket();
        if (socket?.readyState !== WebSocket.OPEN) return;
        socket.send(new TextEncoder().encode(data));
    }

    function handleModifierKey(code, keyEl) {
        if (code === 'ShiftLeft' || code === 'ShiftRight') {
            state.shift = !state.shift;
            renderKeyboard();
            return true;
        }
        if (code === 'ControlLeft') {
            state.ctrl = !state.ctrl;
            keyEl.classList.toggle('keyboard-key--active', state.ctrl);
            return true;
        }
        if (code === 'Symbols') {
            state.layout = (state.layout === 'qwerty' || state.layout === 'azerty') ? 'symbols' : state.layout;
            renderKeyboard();
            return true;
        }
        if (code === 'Lang') {
            state.layout = state.layout === 'qwerty' ? 'azerty' : 'qwerty';
            renderKeyboard();
            return true;
        }
        return false;
    }

    function sendCharacter(char) {
        if (state.ctrl && char.length === 1) {
            const charCode = char.toUpperCase().codePointAt(0);
            if (charCode >= 65 && charCode <= 90) { // A-Z
                sendToSocket(String.fromCodePoint(charCode - 64));
            } else {
                sendToSocket(char);
            }
        } else {
            sendToSocket(char);
        }
    }

    function renderKeyboard() {
        const layout = keyLayouts[state.layout] || [];
        container.innerHTML = layout.map(row => `
            <div class="keyboard-row">
                ${row.map(key => {
                    const displayChar = state.shift ? (key.shiftKey || key.key.toUpperCase()) : key.key;
                    const keyChar = key.key;
                    const shiftChar = key.shiftKey || key.key.toUpperCase();
                    const flex = key.flex || 1;
                    let className = 'keyboard-key';
                    if (key.modifier && (state.shift || state.ctrl)) className += ' keyboard-key--active';

                    return `<button class="${className}" style="flex-grow: ${flex}" data-code="${key.code}" data-key="${keyChar}" data-shift-key="${shiftChar}">${displayChar}</button>`;
                }).join('')}
            </div>
        `).join('');

        const shiftKeys = container.querySelectorAll('[data-code="ShiftLeft"], [data-code="ShiftRight"]');
        shiftKeys.forEach(k => k.classList.toggle('keyboard-key--active', state.shift));
    }

    container.addEventListener('click', (e) => {
        const keyEl = e.target.closest('.keyboard-key');
        const term = getTerminal();
        if (!keyEl || !term) return;

        const code = keyEl.dataset.code;
        const char = state.shift ? keyEl.dataset.shiftKey : keyEl.dataset.key;

        if (handleModifierKey(code, keyEl)) return;

        if (escapeCodes[code]) {
            sendToSocket(escapeCodes[code]);
        } else if (char) {
            sendCharacter(char);
        }

        if (state.shift) {
            state.shift = false;
            renderKeyboard();
        }
        if (state.ctrl) {
            state.ctrl = false;
            const ctrlKeyEl = document.querySelector('[data-code="ControlLeft"]');
            if (ctrlKeyEl) ctrlKeyEl.classList.remove('keyboard-key--active');
        }
        term.focus();
    });

    renderKeyboard();
}
