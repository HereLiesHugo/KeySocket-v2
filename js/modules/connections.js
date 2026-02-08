/**
 * Connections Module - Saved SSH connections management
 * Handles localStorage persistence, saved list UI, and app management dialog
 */

const STORAGE_KEY = 'ks_connections';
const MAX_CONNECTIONS = 20;

/**
 * Get saved connections from localStorage
 * @returns {Array<Object>}
 */
export function getConnections() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch (e) {
        console.warn('Failed to parse saved connections:', e);
        return [];
    }
}

/**
 * Save connections to localStorage
 * @param {Array<Object>} list - Array of connection objects
 */
export function setConnections(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_CONNECTIONS)));
}

/**
 * Save current form values as a new connection
 * @param {HTMLFormElement} form - The connection form element
 * @param {HTMLSelectElement} authSelect - The auth type select element
 * @param {Function} onSaved - Callback after saving
 */
export function saveConnection(form, authSelect, onSaved) {
    if (!form) return;
    const obj = {
        host: form.host.value,
        port: form.port.value,
        username: form.username.value,
        auth: authSelect ? authSelect.value : 'password'
    };
    const list = getConnections();
    list.unshift(obj);
    setConnections(list);
    if (onSaved) onSaved();
}

/**
 * Load and render saved connections into the dropdown
 * @param {HTMLSelectElement} savedList - The saved connections select element
 * @param {Function} renderManagementList - Optional function to render app management list
 */
export function loadSaved(savedList, renderManagementList) {
    const list = getConnections();
    if (!savedList) return;
    savedList.innerHTML = '<option value="">Saved connections</option>' + 
        list.map((c, i) => ` <option value="${i}">${c.username}@${c.host}:${c.port} (${c.auth})</option>`).join('\n');
    if (renderManagementList) renderManagementList(list);
}

/**
 * Render connections in the app management dialog
 * @param {HTMLElement} container - Container element for the list
 * @param {Array<Object>} list - Connections list
 */
export function renderAppManagementConnections(container, list) {
    if (!container) return;
    if (!list?.length) {
        container.innerHTML = '<p class="app-management-help">No saved connections yet. Save a connection from the main form, then manage it here.</p>';
        return;
    }
    container.innerHTML = list.map((c, i) => {
        const host = c.host || '';
        const port = c.port || '22';
        const username = c.username || '';
        const auth = c.auth || 'password';
        const main = (username ? (username + '@') : '') + host + ':' + port;
        const sub = auth === 'password' ? 'Password auth' : 'Private key auth';
        return '<div class="connection-item" data-index="' + i + '">' +
            '<div class="connection-meta">' +
            '<div class="connection-meta-main">' + main + '</div>' +
            '<div class="connection-meta-sub">' + sub + '</div>' +
            '</div>' +
            '<div class="connection-actions">' +
            '<button type="button" class="edit-btn">Edit</button>' +
            '<button type="button" class="delete-btn">Delete</button>' +
            '</div>' +
            '</div>';
    }).join('');
}

/**
 * Initialize app management dialog functionality
 * @param {Object} elements - DOM elements
 * @param {Object} callbacks - Callback functions
 */
export function initAppManagement(elements, callbacks) {
    const { 
        overlay, 
        toggleBtn, 
        closeBtn, 
        connectionsList 
    } = elements;
    
    const { 
        setAuthUI, 
        loadSavedConnections, 
        populateForm 
    } = callbacks;

    // Open dialog
    if (toggleBtn && overlay) {
        toggleBtn.addEventListener('click', () => {
            overlay.hidden = false;
            overlay.style.display = 'flex';
        });
    }

    // Close dialog
    if (closeBtn && overlay) {
        closeBtn.addEventListener('click', () => {
            overlay.hidden = true;
            overlay.style.display = 'none';
        });
    }

    // Close on backdrop click
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.hidden = true;
                overlay.style.display = 'none';
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !overlay.hidden) {
                overlay.hidden = true;
                overlay.style.display = 'none';
            }
        });
    }

    // Handle edit/delete clicks on connections
    if (connectionsList) {
        connectionsList.addEventListener('click', (e) => {
            const target = e.target;
            if (!target) return;
            const item = target.closest('.connection-item');
            if (!item) return;
            const idxStr = item.dataset.index;
            if (idxStr === null) return;
            const idx = Number.parseInt(idxStr, 10);
            if (Number.isNaN(idx)) return;
            const list = getConnections();
            const conn = list[idx];
            if (!conn) return;

            if (target.classList.contains('edit-btn')) {
                populateForm(conn);
                setAuthUI();
                if (overlay) {
                    overlay.hidden = true;
                    overlay.style.display = 'none';
                }
            } else if (target.classList.contains('delete-btn')) {
                list.splice(idx, 1);
                setConnections(list);
                loadSavedConnections();
            }
        });
    }

    // Initial render
    renderAppManagementConnections(connectionsList, getConnections());
}
