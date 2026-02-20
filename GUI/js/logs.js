
// Logs Page Logic

async function loadLogs() {
    const terminal = document.getElementById('logsTerminal');
    if (!terminal) return;

    terminal.innerHTML = '<div class="text-gray-500 text-center mt-10">Loading logs...</div>';

    try {
        const logs = await window.electronAPI.getRecentLogs(500); // Fetch last 500 lines

        if (logs) {
            // Escape HTML to prevent XSS and preserve format
            const safeLogs = logs.replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");

            terminal.innerHTML = `<pre class="logs-content">${safeLogs}</pre>`;

            // Auto scroll to bottom
            terminal.scrollTop = terminal.scrollHeight;
        } else {
            terminal.innerHTML = '<div class="text-gray-500 text-center mt-10">No logs found.</div>';
        }
    } catch (error) {
        console.error('Failed to load logs:', error);
        terminal.innerHTML = `<div class="text-red-500 text-center mt-10">Error loading logs: ${error.message}</div>`;
    }
}

async function refreshLogs() {
    const btn = document.querySelector('button[onclick="refreshLogs()"] i');
    if (btn) btn.classList.add('fa-spin');

    await loadLogs();

    if (btn) setTimeout(() => btn.classList.remove('fa-spin'), 500);
}

async function copyLogs() {
    const terminal = document.getElementById('logsTerminal');
    if (!terminal) return;

    const content = terminal.innerText;
    if (!content) return;

    try {
        await navigator.clipboard.writeText(content);

        const btn = document.querySelector('button[onclick="copyLogs()"]');
        const originalText = btn.innerHTML;

        btn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => {
            btn.innerHTML = originalText;
        }, 2000);
    } catch (err) {
        console.error('Failed to copy logs:', err);
    }
}

async function openLogsFolder() {
    await window.electronAPI.openLogsFolder();
}

function openLogs() {
    // Navigation is handled by sidebar logic, but we can trigger a refresh
    window.LauncherUI.showPage('logs-page');
    window.LauncherUI.setActiveNav('logs');
    refreshLogs();
}

// Expose functions globally
window.refreshLogs = refreshLogs;
window.copyLogs = copyLogs;
window.openLogsFolder = openLogsFolder;
window.openLogs = openLogs;

// Auto-load logs when the page becomes active
const logsObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.target.classList.contains('active') && mutation.target.id === 'logs-page') {
            loadLogs();
        }
    });
});

document.addEventListener('DOMContentLoaded', () => {
    const logsPage = document.getElementById('logs-page');
    if (logsPage) {
        logsObserver.observe(logsPage, { attributes: true, attributeFilter: ['class'] });
    }
});
