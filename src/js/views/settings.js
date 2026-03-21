// src/js/views/settings.js
import { fetchGuiConfig, fetchCoreConfig, fetchStratConfig, saveGuiConfig } from '../services/api.js';

export async function loadSettings() {
    try {
        const [guiRes, coreRes, stratRes] = await Promise.all([
            fetchGuiConfig().catch(e => ({ error: e.message })),
            fetchCoreConfig().catch(e => ({ error: e.message })),
            fetchStratConfig().catch(e => ({ error: e.message }))
        ]);

        const guiConfig = guiRes;
        const coreConfig = coreRes;
        const stratConfig = stratRes;

        // Render GUI Editable
        const guiContainer = document.getElementById('gui-settings-container');
        if (guiContainer) guiContainer.innerHTML = '';

        const guiForm = document.getElementById('gui-settings-form');
        guiForm.innerHTML = '';

        if (guiConfig && !guiConfig.error) {
            for (const [key, val] of Object.entries(guiConfig)) {
                const group = document.createElement('div');
                group.className = 'input-modern-group';
                group.style.flexDirection = 'row';
                group.style.alignItems = 'center';
                group.style.justifyContent = 'space-between';
                group.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                group.style.paddingBottom = '0.5rem';

                group.innerHTML = `
                    <label style="margin-bottom:0; flex:1;">${key}</label>
                    <input type="text" class="input-modern" name="${key}" value="${val}" style="flex:2; max-width: 60%;">
                `;
                guiForm.appendChild(group);
            }
        } else {
            guiForm.innerHTML = `<div style="color:var(--accent-red)">Failed to load GUI configs</div>`;
        }

        // Render Core Read-Only
        renderReadOnlySettings('core-settings-container', coreConfig);

        // Render Strat Read-Only
        renderReadOnlySettings('strat-settings-container', stratConfig);

    } catch (e) {
        console.error("Error loading settings:", e);
    }
}

function renderReadOnlySettings(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (!config || config.error) {
        container.innerHTML = `<div style="color:var(--accent-red)">Unreachable or Error</div>`;
        return;
    }

    // Format as a disabled form to maintain visual homogeneity with RODSIC_GUI settings
    const formMock = document.createElement('div');
    formMock.className = 'settings-form';

    for (const [key, val] of Object.entries(config)) {
        const group = document.createElement('div');
        group.className = 'input-modern-group';
        group.style.flexDirection = 'row';
        group.style.alignItems = 'center';
        group.style.justifyContent = 'space-between';
        group.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
        group.style.paddingBottom = '0.5rem';

        group.innerHTML = `
            <label style="margin-bottom:0; flex:1;">${key}</label>
            <input type="text" class="input-modern" value="${val}" style="flex:2; max-width: 60%; opacity: 0.7; cursor: not-allowed;" disabled>
        `;
        formMock.appendChild(group);
    }

    container.appendChild(formMock);
}

export async function saveGuiSettings() {
    const form = document.getElementById('gui-settings-form');
    const inputs = form.querySelectorAll('input');
    const payload = {};

    inputs.forEach(input => {
        payload[input.name] = input.value;
    });

    try {
        const result = await saveGuiConfig(payload);
        if (result.status === 'success') {
            alert('GUI Settings saved successfully!\\nYou may need to restart the Python server for port changes to apply.');
            loadSettings(); // Reload to confirm
        } else {
            alert('Error saving settings: ' + result.error);
        }
    } catch (e) {
        alert('Exception saving settings: ' + e.message);
    }
}
