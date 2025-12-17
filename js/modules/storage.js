/* Storage Module */
const KEY = 'ks_connections';
const MAX = 20;

export function getConnections() {
    try {
        return JSON.parse(localStorage.getItem(KEY) || '[]');
    } catch (e) { return []; }
}

export function saveConnection(conn) {
    const list = getConnections();
    // Add to top
    list.unshift(conn);
    // Dedup? Simple version: just slice
    const trimmed = list.slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
}

export function updateConnections(list) {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
}
