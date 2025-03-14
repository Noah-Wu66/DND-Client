let activeTooltip = null;

function createConditionTooltip() {
    const conditionTooltip = document.createElement('div');
    conditionTooltip.className = 'condition-tooltip';
    conditionTooltip.innerHTML = `
        <button class="condition-tooltip-close">×</button>
        <div class="condition-tooltip-title"></div>
        <div class="condition-tooltip-desc"></div>
    `;
    document.body.appendChild(conditionTooltip);
    conditionTooltip.querySelector('.condition-tooltip-close').addEventListener('click', () => {
        hideConditionTooltip();
    });
    document.addEventListener('click', (e) => {
        if (activeTooltip && !conditionTooltip.contains(e.target) && !e.target.classList.contains('condition-tag')) {
            hideConditionTooltip();
        }
    });
    return conditionTooltip;
}

function showConditionTooltip(tag, tooltip) {
    const title = tag.textContent;
    const desc = tag.title || '无详细说明';
    tooltip.querySelector('.condition-tooltip-title').textContent = title;
    tooltip.querySelector('.condition-tooltip-desc').textContent = desc;
    const tagRect = tag.getBoundingClientRect();
    const tooltipWidth = 300;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
        tooltip.style.left = '50%';
        tooltip.style.top = '50%';
        tooltip.style.transform = 'translate(-50%, -50%)';
        tooltip.style.width = '85%';
    } else {
        let left = tagRect.left + (tagRect.width - tooltipWidth) / 2;
        const rightEdge = document.documentElement.clientWidth;
        if (left + tooltipWidth > rightEdge) {
            left = rightEdge - tooltipWidth - 10;
        }
        if (left < 10) left = 10;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${tagRect.bottom + 10}px`;
        tooltip.style.transform = 'translateY(0)';
    }
    tooltip.classList.add('visible');
    activeTooltip = tag;
}

function hideConditionTooltip() {
    const tooltip = document.querySelector('.condition-tooltip');
    if (tooltip) {
        tooltip.classList.remove('visible');
        activeTooltip = null;
    }
}

function updateSyncStatus(state, message) {
    const syncStatus = document.getElementById("sync-status");
    syncStatus.className = "show";
    if (state === "syncing") syncStatus.classList.add("syncing");
    else if (state === "success") syncStatus.classList.add("success");
    else if (state === "error") syncStatus.classList.add("error");
    syncStatus.querySelector(".sync-text").textContent = message;
    if (state === "success") {
        setTimeout(() => syncStatus.classList.remove("show"), 2000);
    }
}

function showLoadingState(message = "正在加载战斗数据...") {
    hideLoadingState();
    const loadingDiv = document.createElement("div");
    loadingDiv.id = "loading-indicator";
    loadingDiv.innerHTML = `
        <div class="loading-spinner"></div>
        <p class="loading-text">${message}</p>
    `;
    document.body.appendChild(loadingDiv);
}

function hideLoadingState() {
    const existingLoader = document.getElementById("loading-indicator");
    if (existingLoader) existingLoader.remove();
}

function showConnectionError(initializeAppFn) {
    hideErrorMessages();
    const errorDiv = document.createElement("div");
    errorDiv.id = "connection-error";
    errorDiv.className = "error-message";
    errorDiv.innerHTML = `
        <p>无法连接到服务器，请检查网络连接。</p>
        <button id="retry-connection-btn">重试连接</button>
    `;
    document.querySelector('.container').appendChild(errorDiv);
    document.getElementById("retry-connection-btn").addEventListener("click", () => {
        errorDiv.remove();
        initializeAppFn();
    });
}

function showLoadingError(error, loadFromServerFn) {
    hideErrorMessages();
    const errorDiv = document.createElement("div");
    errorDiv.id = "loading-error";
    errorDiv.className = "error-message";
    errorDiv.innerHTML = `
        <p>加载数据失败: ${error.message || "未知错误"}</p>
        <button id="retry-loading-btn">重试加载</button>
    `;
    document.querySelector('.container').appendChild(errorDiv);
    document.getElementById("retry-loading-btn").addEventListener("click", () => {
        errorDiv.remove();
        loadFromServerFn(true);
    });
}

function showSaveError(error, saveToServerFn) {
    updateSyncStatus("error", "同步失败");
    const errorDiv = document.createElement("div");
    errorDiv.id = "save-error";
    errorDiv.className = "error-message";
    errorDiv.innerHTML = `
        <p>保存数据失败: ${error.message || "未知错误"}</p>
        <button id="retry-save-btn">重试保存</button>
    `;
    document.querySelector('.container').appendChild(errorDiv);
    document.getElementById("retry-save-btn").addEventListener("click", () => {
        errorDiv.remove();
        saveToServerFn();
    });
    setTimeout(() => {
        if (document.getElementById("save-error")) {
            document.getElementById("save-error").remove();
        }
    }, 3000);
}

function hideErrorMessages() {
    const errors = document.querySelectorAll('.error-message');
    errors.forEach(error => error.remove());
}

function showEmptyState(container) {
    // 移除所有现有的空状态元素
    const existingEmptyStates = container.querySelectorAll('.empty-state');
    existingEmptyStates.forEach(el => el.remove());
    
    // 创建并添加新的空状态元素
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.textContent = "点击上方按钮添加怪物或冒险者";
    container.appendChild(emptyState);
}

function setButtonsEnabled(enabled) {
    const buttons = [
        document.getElementById("add-monster-btn"),
        document.getElementById("add-adventurer-btn"),
        document.getElementById("reset-all-btn"),
        document.getElementById("manual-sync-btn"),
        document.getElementById("dice-btn")
    ];
    const opacity = enabled ? "1" : "0.6";
    buttons.forEach(button => {
        if (button) {
            button.disabled = !enabled;
            button.style.opacity = opacity;
        }
    });
}

function setupConfirmDialog(onDelete) {
    const confirmDialog = document.getElementById("confirm-dialog");
    const confirmCancelBtn = document.getElementById("confirm-cancel");
    const confirmDeleteBtn = document.getElementById("confirm-delete");
    confirmCancelBtn.addEventListener("click", () => {
        confirmDialog.classList.remove("active");
    });
    confirmDeleteBtn.addEventListener("click", () => {
        confirmDialog.classList.remove("active");
        if (typeof onDelete === 'function') {
            onDelete();
        }
    });
    return {
        show: (message, deleteCallback) => {
            document.getElementById("confirm-message").textContent = message;
            onDelete = deleteCallback;
            confirmDialog.classList.add("active");
        }
    };
}

function setupCopySessionLink() {
    document.getElementById("copy-session-link").addEventListener("click", () => {
        const sessionLink = window.location.href;
        navigator.clipboard.writeText(sessionLink)
            .then(() => alert("会话链接已复制到剪贴板，可以分享给其他人"))
            .catch(err => {
                console.error('复制失败: ', err);
                prompt("请手动复制以下链接:", sessionLink);
            });
    });
}