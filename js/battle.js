// 全局变量
let monsterCounter = 1;
let adventurerCounter = 1;
let currentCardForStatus = null;
let customConditionCounter = 1;
let cardToDelete = null;
let monsterContainer;

document.addEventListener("DOMContentLoaded", () => {
    monsterContainer = document.getElementById("monster-container");
});

function createMonsterCard(name, maxHp, isAdventurer = false, saveCallback) {
    const monsterId = `monster-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const currentHp = maxHp;
    const tempHp = 0;

    // 移除所有空状态元素
    const emptyStates = monsterContainer.querySelectorAll(".empty-state");
    emptyStates.forEach(emptyState => emptyState.remove());

    const monsterCard = document.createElement("div");
    monsterCard.className = "monster-card";
    monsterCard.dataset.id = monsterId;
    monsterCard.dataset.type = isAdventurer ? "adventurer" : "monster";
    monsterCard.dataset.conditions = "[]";
    monsterCard.innerHTML = `
        <div class="monster-header">
            <div class="monster-info">
                <div class="monster-name" contenteditable="true">${name}</div>
                <div class="tags-container">
                    <span class="status-badge">存活</span>
                </div>
            </div>
            <div class="card-actions">
                <div class="sort-buttons">
                    <button class="sort-btn up-btn" title="上移"></button>
                    <button class="sort-btn down-btn" title="下移"></button>
                </div>
                <button class="card-action-btn status-button" title="管理状态">⚡</button>
                <button class="card-action-btn lock-button" title="锁定卡片">🔓</button>
                <button class="card-action-btn delete-button" title="删除">×</button>
            </div>
        </div>
        <div class="hp-display">
            <span class="hp-text">HP:</span>
            <div class="hp-inputs">
                <input type="number" class="hp-input current-hp-input" value="${currentHp}" min="0" title="当前生命值">
                <span>/</span>
                <input type="number" class="hp-input max-hp-input" value="${maxHp}" min="1" title="最大生命值">
            </div>
        </div>
        <div class="temp-hp-display">
            <span class="temp-hp-text">临时HP:</span>
            <input type="number" class="temp-hp-input" value="${tempHp}" min="0" title="临时生命值">
        </div>
        <div class="hp-bar-container">
            <div class="hp-bar">
                <div class="hp-bar-fill" style="width: 100%"></div>
            </div>
            <div class="temp-hp-bar" style="width: 0%"></div>
            <div class="hp-bar-text">${currentHp}/${maxHp}</div>
        </div>
        <div class="damage-controls">
            <input type="number" class="damage-input" placeholder="数值" min="0">
            <button class="damage-btn">伤害</button>
            <button class="heal-btn">治疗</button>
        </div>
    `;
    monsterCard.querySelector(".delete-button").addEventListener("click", (e) => {
        e.stopPropagation();
        cardToDelete = monsterCard;
        window.confirmDialog.show(`确定要删除 "${monsterCard.querySelector('.monster-name').textContent}" 吗？`, () => {
            deleteCard(monsterCard);
        });
    });
    const lockButton = monsterCard.querySelector(".lock-button");
    lockButton.addEventListener("click", (e) => {
        e.stopPropagation();
        monsterCard.classList.toggle("locked");
        lockButton.textContent = monsterCard.classList.contains("locked") ? "🔒" : "🔓";
        lockButton.title = monsterCard.classList.contains("locked") ? "解锁卡片" : "锁定卡片";

        // 发送锁定状态更新
        const monsterId = monsterCard.dataset.id;
        if (window.socket && window.socket.connected && monsterId) {
            const isLocked = monsterCard.classList.contains("locked");
            console.log(`发送锁定状态更新，ID: ${monsterId}, 锁定: ${isLocked}`);
            window.socket.emit('update-lock-status', {
                sessionId: window.sessionId,
                monsterId: monsterId,
                isLocked: isLocked
            });

            // 更新同步状态
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus("success", "锁定状态已更新");
            }
        }
    });
    const statusButton = monsterCard.querySelector(".status-button");
    statusButton.addEventListener("click", (e) => {
        e.stopPropagation();
        openStatusSelector(monsterCard);
    });
    const upButton = monsterCard.querySelector(".up-btn");
    upButton.addEventListener("click", (e) => {
        e.stopPropagation();
        moveCardUp(monsterCard);
    });
    const downButton = monsterCard.querySelector(".down-btn");
    downButton.addEventListener("click", (e) => {
        e.stopPropagation();
        moveCardDown(monsterCard);
    });
    const currentHpInput = monsterCard.querySelector(".current-hp-input");
    currentHpInput.addEventListener("change", () => {
        let newCurrentHp = parseInt(currentHpInput.value) || 0;
        const maxHp = parseInt(monsterCard.querySelector(".max-hp-input").value) || 1;
        const tempHp = parseInt(monsterCard.querySelector(".temp-hp-input").value) || 0;
        newCurrentHp = Math.max(0, Math.min(maxHp, newCurrentHp));
        currentHpInput.value = newCurrentHp;
        updateHpBar(monsterCard);

        // 发送HP更新
        const monsterId = monsterCard.dataset.id;
        if (window.socket && window.socket.connected && monsterId) {
            console.log(`发送HP更新请求，ID: ${monsterId}, HP: ${newCurrentHp}/${maxHp}, 临时HP: ${tempHp}`);
            window.socket.emit('update-hp', {
                sessionId: window.sessionId,
                monsterId: monsterId,
                currentHp: newCurrentHp,
                maxHp: maxHp,
                tempHp: tempHp
            });

            // 更新同步状态
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus("success", "HP已更新");
            }
        }
    });

    const maxHpInput = monsterCard.querySelector(".max-hp-input");
    maxHpInput.addEventListener("change", () => {
        const newMaxHp = Math.max(1, parseInt(maxHpInput.value) || 1);
        maxHpInput.value = newMaxHp;
        const currentHpInput = monsterCard.querySelector(".current-hp-input");
        let currentHp = parseInt(currentHpInput.value) || 0;
        const tempHp = parseInt(monsterCard.querySelector(".temp-hp-input").value) || 0;
        if (currentHp > newMaxHp) currentHpInput.value = currentHp = newMaxHp;
        updateHpBar(monsterCard);

        // 发送HP更新
        const monsterId = monsterCard.dataset.id;
        if (window.socket && window.socket.connected && monsterId) {
            console.log(`发送HP更新请求，ID: ${monsterId}, HP: ${currentHp}/${newMaxHp}, 临时HP: ${tempHp}`);
            window.socket.emit('update-hp', {
                sessionId: window.sessionId,
                monsterId: monsterId,
                currentHp: currentHp,
                maxHp: newMaxHp,
                tempHp: tempHp
            });

            // 更新同步状态
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus("success", "HP已更新");
            }
        }
    });

    const tempHpInput = monsterCard.querySelector(".temp-hp-input");
    tempHpInput.addEventListener("change", () => {
        let newTempHp = Math.max(0, parseInt(tempHpInput.value) || 0);
        tempHpInput.value = newTempHp;
        const currentHp = parseInt(currentHpInput.value) || 0;
        const maxHp = parseInt(maxHpInput.value) || 1;
        updateHpBar(monsterCard);

        // 发送HP更新
        const monsterId = monsterCard.dataset.id;
        if (window.socket && window.socket.connected && monsterId) {
            console.log(`发送HP更新请求，ID: ${monsterId}, HP: ${currentHp}/${maxHp}, 临时HP: ${newTempHp}`);
            window.socket.emit('update-hp', {
                sessionId: window.sessionId,
                monsterId: monsterId,
                currentHp: currentHp,
                maxHp: maxHp,
                tempHp: newTempHp
            });

            // 更新同步状态
            if (typeof window.updateSyncStatus === 'function') {
                window.updateSyncStatus("success", "HP已更新");
            }
        }
    });
    const damageBtn = monsterCard.querySelector(".damage-btn");
    damageBtn.addEventListener("click", () => applyDamage(monsterCard, true));
    const healBtn = monsterCard.querySelector(".heal-btn");
    healBtn.addEventListener("click", () => applyDamage(monsterCard, false));
    const damageInput = monsterCard.querySelector(".damage-input");
    damageInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") applyDamage(monsterCard, true);
    });
    const monsterName = monsterCard.querySelector(".monster-name");
    monsterName.addEventListener("blur", () => {
        if (typeof saveCallback === 'function') {
            saveCallback();
        }
    });
    monsterName.addEventListener("mousedown", (e) => e.stopPropagation());
    return monsterCard;
}

function updateCardFromData(card, monsterData) {
    if (!card || !monsterData) return;
    if (monsterData.name) card.querySelector('.monster-name').textContent = monsterData.name;
    if (monsterData.currentHp !== undefined) card.querySelector('.current-hp-input').value = monsterData.currentHp;
    if (monsterData.maxHp) card.querySelector('.max-hp-input').value = monsterData.maxHp;
    if (monsterData.tempHp !== undefined) card.querySelector('.temp-hp-input').value = monsterData.tempHp || 0;
    if (monsterData.conditions) {
        card.dataset.conditions = typeof monsterData.conditions === 'string' ? monsterData.conditions : JSON.stringify(monsterData.conditions);
        try {
            const conditionIds = JSON.parse(card.dataset.conditions);
            if (conditionIds?.length > 0) {
                const conditionObjects = conditionIds.map(id => {
                    const predefined = conditions.find(c => c.id === id);
                    return predefined || (id.startsWith('custom-') ? { id, name: id.split('-')[1] || "自定义状态", custom: true } : { id });
                });
                updateConditionTags(card, conditionObjects);
            }
        } catch (e) {
            console.error("解析状态数据出错:", e);
        }
    }
    const lockButton = card.querySelector('.lock-button');
    if (monsterData.isLocked) {
        card.classList.add('locked');
        lockButton.textContent = '🔒';
        lockButton.title = '解锁卡片';
    } else {
        card.classList.remove('locked');
        lockButton.textContent = '🔓';
        lockButton.title = '锁定卡片';
    }
    updateHpBar(card);
}

function createCardFromData(monsterData) {
    if (!monsterData || !monsterData.id) return null;
    const existingCard = document.querySelector(`.monster-card[data-id="${monsterData.id}"]`);
    if (existingCard) {
        updateCardFromData(existingCard, monsterData);
        return existingCard;
    }
    const card = createMonsterCard(monsterData.name, parseInt(monsterData.maxHp) || 100, monsterData.type === 'adventurer');
    card.dataset.id = monsterData.id;
    updateCardFromData(card, monsterData);
    monsterContainer.appendChild(card);
    updateSortButtonStatus();
    return card;
}

function updateHpBar(monsterCard) {
    const currentHp = parseInt(monsterCard.querySelector(".current-hp-input").value) || 0;
    const maxHp = parseInt(monsterCard.querySelector(".max-hp-input").value) || 1;
    const tempHp = parseInt(monsterCard.querySelector(".temp-hp-input").value) || 0;
    const hpBarFill = monsterCard.querySelector(".hp-bar-fill");
    const tempHpBar = monsterCard.querySelector(".temp-hp-bar");
    const hpBarText = monsterCard.querySelector(".hp-bar-text");
    const statusBadge = monsterCard.querySelector(".status-badge");
    const hpPercentage = (currentHp / maxHp) * 100;
    hpBarFill.style.width = `${hpPercentage}%`;
    tempHpBar.style.width = tempHp > 0 ? `${(tempHp / maxHp) * 100}%` : "0";
    hpBarText.textContent = tempHp > 0 ? `${currentHp}/${maxHp} (+${tempHp})` : `${currentHp}/${maxHp}`;
    hpBarFill.style.backgroundColor = hpPercentage > 50 ? "var(--green)" : hpPercentage > 20 ? "var(--yellow)" : "var(--orange)";
    if (currentHp <= 0) {
        statusBadge.textContent = "死亡";
        statusBadge.classList.add("dead");
        monsterCard.style.opacity = "0.7";
    } else {
        statusBadge.textContent = "存活";
        statusBadge.classList.remove("dead");
        monsterCard.style.opacity = "1";
    }
}

function applyDamage(monsterCard, isDamage) {
    const damageInput = monsterCard.querySelector(".damage-input");
    const value = parseInt(damageInput.value) || 0;
    if (value <= 0) return;
    const currentHpInput = monsterCard.querySelector(".current-hp-input");
    const maxHpInput = monsterCard.querySelector(".max-hp-input");
    const tempHpInput = monsterCard.querySelector(".temp-hp-input");
    let currentHp = parseInt(currentHpInput.value) || 0;
    const maxHp = parseInt(maxHpInput.value) || 1;
    let tempHp = parseInt(tempHpInput.value) || 0;
    if (isDamage) {
        if (tempHp > 0) {
            if (tempHp >= value) {
                tempHp -= value;
            } else {
                const remainingDamage = value - tempHp;
                tempHp = 0;
                currentHp = Math.max(0, currentHp - remainingDamage);
            }
        } else {
            currentHp = Math.max(0, currentHp - value);
        }
        tempHpInput.value = tempHp;
        currentHpInput.value = currentHp;
    } else {
        currentHp = Math.min(maxHp, currentHp + value);
        currentHpInput.value = currentHp;
    }
    updateHpBar(monsterCard);
    damageInput.value = "";
    damageInput.focus();

    // 通过WebSocket发送HP更新
    const monsterId = monsterCard.dataset.id;
    if (window.socket && window.socket.connected && monsterId) {
        console.log(`发送HP更新请求，ID: ${monsterId}, HP: ${currentHp}/${maxHp}, 临时HP: ${tempHp}`);
        window.socket.emit('update-hp', {
            sessionId: window.sessionId,
            monsterId: monsterId,
            currentHp: currentHp,
            maxHp: maxHp,
            tempHp: tempHp
        });

        // 更新同步状态
        if (typeof window.updateSyncStatus === 'function') {
            window.updateSyncStatus("success", "HP已更新");
        }
    }
}

function moveCardUp(card) {
    const prevCard = card.previousElementSibling;
    if (prevCard && !prevCard.classList.contains('empty-state')) {
        card.parentNode.insertBefore(card, prevCard);
        updateSortButtonStatus();
        saveCardOrder();
    }
}

function moveCardDown(card) {
    const nextCard = card.nextElementSibling;
    if (nextCard) {
        card.parentNode.insertBefore(nextCard, card);
        updateSortButtonStatus();
        saveCardOrder();
    }
}

function updateSortButtonStatus() {
    const cards = document.querySelectorAll('.monster-card');
    cards.forEach((card, index) => {
        card.querySelector('.up-btn').disabled = index === 0;
        card.querySelector('.down-btn').disabled = index === cards.length - 1;
    });
}

function saveCardOrder() {
    const newOrderIds = Array.from(document.getElementById("monster-container").querySelectorAll('.monster-card')).map(card => card.dataset.id);
    if (window.socket && window.socket.connected) {
        console.log(`发送角色卡顺序更新请求`);
        window.socket.emit('reorder-monsters', { sessionId: window.sessionId, order: newOrderIds });
        // 更新同步状态
        if (typeof window.updateSyncStatus === 'function') {
            window.updateSyncStatus("success", "顺序已更新");
        }
    } else {
        console.warn("无法更新角色卡顺序：Socket未连接");
        if (typeof window.updateSyncStatus === 'function') {
            window.updateSyncStatus("error", "顺序更新失败，请检查网络连接");
        }
    }
    // 不再调用 window.saveToServer
}

function deleteCard(card) {
    const monsterId = card.dataset.id;
    if (window.socket && window.socket.connected) {
        console.log(`发送删除角色卡请求，ID: ${monsterId}`);
        window.socket.emit('delete-monster', { sessionId: window.sessionId, monsterId });
        // 更新同步状态，使用window对象确保可访问
        if (typeof window.updateSyncStatus === 'function') {
            window.updateSyncStatus("success", "删除成功");
        }
    } else {
        console.warn("无法删除角色卡：Socket未连接");
        if (typeof window.updateSyncStatus === 'function') {
            window.updateSyncStatus("error", "删除失败，请检查网络连接");
        }
    }
    if (card.parentNode) card.parentNode.removeChild(card);
    updateSortButtonStatus();
    // 不再调用 window.saveToServer，因为已通过WebSocket发送了删除请求
}

function openStatusSelector(card) {
    currentCardForStatus = card;
    const statusSelector = document.getElementById("status-selector");
    const conditionsGrid = statusSelector.querySelector(".conditions-grid");
    conditionsGrid.innerHTML = "";
    const selectedConditions = [];
    try {
        const conditionIds = JSON.parse(card.dataset.conditions || "[]");
        conditions.forEach(condition => {
            const isSelected = conditionIds.includes(condition.id);
            if (isSelected) selectedConditions.push(condition);
            addConditionToGrid(condition, isSelected);
        });
        const customConditions = conditionIds
            .filter(id => id.startsWith('custom-'))
            .map(id => ({
                id,
                name: id.split('-')[1] || "自定义状态",
                custom: true
            }));
        customConditions.forEach(condition => {
            selectedConditions.push(condition);
            addConditionToGrid(condition, true);
        });
    } catch (e) {
        console.error("解析状态数据出错:", e);
    }
    document.getElementById("status-selector").classList.add("active");
}

function addConditionToGrid(condition, isSelected = false) {
    const conditionsGrid = document.querySelector(".conditions-grid");
    const conditionItem = document.createElement("div");
    conditionItem.className = `condition-item${isSelected ? " selected" : ""}`;
    conditionItem.dataset.id = condition.id;
    conditionItem.dataset.custom = condition.custom ? "true" : "false";

    // 添加状态描述
    const desc = condition.desc || condition.description || '';

    conditionItem.innerHTML = `
        <div class="condition-name">${condition.name}</div>
        ${desc ? `<div class="condition-desc">${desc}</div>` : ''}
        ${condition.custom ? '<button class="delete-condition">×</button>' : ''}
    `;
    conditionItem.addEventListener("click", () => {
        conditionItem.classList.toggle("selected");
    });
    if (condition.custom) {
        conditionItem.querySelector(".delete-condition").addEventListener("click", (e) => {
            e.stopPropagation();
            conditionItem.remove();
        });
    }
    conditionsGrid.appendChild(conditionItem);
}

function applySelectedStatus() {
    if (!currentCardForStatus) return;
    const selectedConditions = Array.from(document.querySelectorAll(".condition-item.selected")).map(item => {
        const conditionId = item.dataset.id;
        const name = item.querySelector(".condition-name").textContent;
        const descEl = item.querySelector(".condition-desc");
        const desc = descEl ? descEl.textContent : '';
        const isCustom = item.dataset.custom === "true";

        // 如果是预定义状态，尝试获取完整信息
        if (!isCustom) {
            const predefined = conditions.find(c => c.id === conditionId);
            if (predefined) {
                return predefined;
            }
        }

        return {
            id: conditionId,
            name: name,
            desc: desc,
            custom: isCustom
        };
    });

    currentCardForStatus.dataset.conditions = JSON.stringify(selectedConditions.map(c => c.id));
    updateConditionTags(currentCardForStatus, selectedConditions);
    document.getElementById("status-selector").classList.remove("active");

    // 发送状态更新
    const monsterId = currentCardForStatus.dataset.id;
    if (window.socket && window.socket.connected && monsterId) {
        const conditions = selectedConditions.map(c => c.id);
        console.log(`发送状态更新请求，ID: ${monsterId}, 状态: ${conditions.join(', ')}`);
        window.socket.emit('update-conditions', {
            sessionId: window.sessionId,
            monsterId: monsterId,
            conditions: conditions
        });

        // 更新同步状态
        if (typeof window.updateSyncStatus === 'function') {
            window.updateSyncStatus("success", "状态已更新");
        }
    }

    currentCardForStatus = null;
    hideConditionTooltip();
}

function updateConditionTags(card, conditionObjects) {
    const tagsContainer = card.querySelector(".tags-container");
    const statusBadge = tagsContainer.querySelector(".status-badge");
    const existingTags = tagsContainer.querySelectorAll(".condition-tag");
    existingTags.forEach(tag => tag.remove());
    conditionObjects.forEach(condition => {
        // 查找完整的状态信息
        let fullCondition = condition;
        if (condition.id && !condition.desc) {
            // 尝试从预定义状态中查找
            const predefined = conditions.find(c => c.id === condition.id);
            if (predefined) {
                fullCondition = predefined;
            }
        }

        const tag = document.createElement("span");
        tag.className = "condition-tag";
        tag.textContent = fullCondition.name || condition.name;
        tag.title = fullCondition.desc || condition.description || '';
        tag.addEventListener("click", (e) => {
            e.stopPropagation();
            const tooltip = document.querySelector('.condition-tooltip');
            if (tooltip) {
                showConditionTooltip(tag, tooltip);
            }
        });
        tagsContainer.appendChild(tag);
    });
    tagsContainer.appendChild(statusBadge);
}

function refreshUIFromData(data) {
    if (!data || !data.monsters) return;
    const currentIds = new Set(Array.from(document.querySelectorAll('.monster-card')).map(card => card.dataset.id));
    const newIds = new Set(Object.keys(data.monsters));
    const toRemove = [...currentIds].filter(id => !newIds.has(id));
    const toAdd = [...newIds].filter(id => !currentIds.has(id) && data.monsters[id]);
    const toUpdate = [...currentIds].filter(id => newIds.has(id) && data.monsters[id]);
    toRemove.forEach(id => {
        const card = document.querySelector(`.monster-card[data-id="${id}"]`);
        if (card) card.remove();
    });
    toAdd.forEach(id => {
        createCardFromData({ id, ...data.monsters[id] });
    });
    toUpdate.forEach(id => {
        const card = document.querySelector(`.monster-card[data-id="${id}"]`);
        if (card) updateCardFromData(card, data.monsters[id]);
    });
    if (data.order && Array.isArray(data.order)) {
        reorderMonsterCards(data.order);
    }
    updateSortButtonStatus();

    // 只有在刷新后没有角色卡片且没有空状态元素时，才显示空状态
    const hasMonsterCards = document.querySelectorAll('.monster-card').length > 0;
    const hasEmptyState = monsterContainer.querySelector('.empty-state');

    if (!hasMonsterCards) {
        if (!hasEmptyState) {
            showEmptyState(monsterContainer);
        }
    } else if (hasEmptyState) {
        // 如果有角色卡片但也有空状态，移除空状态
        hasEmptyState.remove();
    }
}

function removeMonsterById(id) {
    const card = document.querySelector(`.monster-card[data-id="${id}"]`);
    if (card) {
        card.remove();
        updateSortButtonStatus();
    }
}

function reorderMonsterCards(orderIds) {
    const container = document.getElementById("monster-container");
    orderIds.forEach(id => {
        const card = document.querySelector(`.monster-card[data-id="${id}"]`);
        if (card) container.appendChild(card);
    });
}

function showEmptyState(container) {
    // 移除所有现有的空状态元素
    const existingEmptyStates = container.querySelectorAll('.empty-state');
    existingEmptyStates.forEach(el => el.remove());

    // 创建并添加新的空状态元素
    const emptyState = document.createElement("div");
    emptyState.className = "empty-state";
    emptyState.innerHTML = `
        <div class="empty-text">没有角色</div>
        <div class="empty-subtext">点击上方按钮添加角色</div>
    `;
    container.appendChild(emptyState);
}