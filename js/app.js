// 全局函数和变量声明
window.saveToServer = function(immediate) {
    console.log("全局saveToServer被调用，但尚未初始化");
};
window.socket = null;
window.sessionId = null;
window.confirmDialog = null;

document.addEventListener("DOMContentLoaded", () => {
    const API_BASE_URL = 'https://dnd-database.zeabur.app/api/v1';
    const BATTLE_API_URL = `${API_BASE_URL}/battles`;
    const DICE_API_URL = `${API_BASE_URL}/dice`;
    const SOCKET_URL = 'https://dnd-database.zeabur.app';
    let sessionId = new URLSearchParams(window.location.search).get('session');
    if (!sessionId) {
        const randomPart = Math.random().toString(36).substring(2, 12);
        const timestampPart = Date.now().toString(36);
        sessionId = randomPart + timestampPart;
        window.history.pushState({}, '', `?session=${sessionId}`);
    }
    window.sessionId = sessionId;
    console.log("当前会话ID:", sessionId);
    let playerName = localStorage.getItem('playerName');
    if (!playerName) {
        playerName = prompt("请输入你的名字(用于显示骰子结果)", "玩家" + Math.floor(Math.random() * 1000));
        if (playerName) {
            localStorage.setItem('playerName', playerName);
        } else {
            playerName = "匿名玩家" + Math.floor(Math.random() * 1000);
            localStorage.setItem('playerName', playerName);
        }
    }
    const sessionInfoDiv = document.createElement("div");
    sessionInfoDiv.id = "session-info";
    sessionInfoDiv.innerHTML = `
        会话ID: <span id="session-id">${sessionId}</span>
        <button id="copy-session-link">复制链接</button>
    `;
    const title = document.querySelector('h1');
    title.parentNode.insertBefore(sessionInfoDiv, title.nextSibling);
    let socket = null;
    let isConnected = false;
    let isLoadingData = false;
    let lastSaveTime = 0;
    let pendingSaveTimer = null;
    let confirmDialog;
    const monsterContainer = document.getElementById("monster-container");
    const addMonsterBtn = document.getElementById("add-monster-btn");
    const addAdventurerBtn = document.getElementById("add-adventurer-btn");
    const resetAllBtn = document.getElementById("reset-all-btn");
    const manualSyncBtn = document.getElementById("manual-sync-btn");
    const diceBtn = document.getElementById("dice-btn");
    const defaultHpInput = document.getElementById("default-hp");
    const monsterNamePrefix = document.getElementById("monster-name-prefix");
    const adventurerNamePrefix = document.getElementById("adventurer-name-prefix");
    const statusSelector = document.getElementById("status-selector");
    const closeStatusBtn = statusSelector.querySelector(".close-status");
    const cancelStatusBtn = statusSelector.querySelector(".cancel-status");
    const applyStatusBtn = statusSelector.querySelector(".apply-status");
    const customStatusName = document.getElementById("custom-status-name");
    const customStatusDesc = document.getElementById("custom-status-desc");
    const addCustomStatusBtn = document.getElementById("add-custom-status");
    const conditionTooltip = createConditionTooltip();
    confirmDialog = setupConfirmDialog();
    window.confirmDialog = confirmDialog;
    function initSocketConnection() {
        socket = io(SOCKET_URL);
        window.socket = socket;
        isConnected = false;
        socket.on('connect', () => {
            console.log('已连接到服务器');
            isConnected = true;
            updateSyncStatus("success", "已连接");
            setButtonsEnabled(true);
            socket.emit('join-session', sessionId);
            socket.emit('join-dice-session', { sessionId: sessionId, playerName: playerName });
        });
        socket.on('disconnect', () => {
            console.log('与服务器断开连接');
            isConnected = false;
            updateSyncStatus("error", "未连接");
            setButtonsEnabled(false);
            showConnectionError(initializeApp);
        });
        socket.on('monster-updated', (monsterData) => {
            if (!isLoadingData && monsterData) {
                console.log("收到怪物更新:", monsterData.id);
                createCardFromData(monsterData);
            }
        });
        socket.on('session-updated', (data) => {
            if (!isLoadingData && data) {
                console.log("收到会话更新");
                refreshUIFromData(data);
            }
        });
        socket.on('delete-monster', (data) => {
            if (data && data.monsterId) {
                console.log("收到怪物删除通知:", data.monsterId);
                removeMonsterById(data.monsterId);
            }
        });
        socket.on('monsters-reordered', (data) => {
            if (!isLoadingData && data && data.order) {
                console.log("收到卡片顺序更新");
                reorderMonsterCards(data.order);
            }
        });
        socket.on('dice-state-updated', (diceState) => {
            if (!isLoadingData && !localUpdateInProgress) {
                console.log("收到骰子状态更新:", diceState);
                updateDiceUIFromData(diceState);
            }
        });
        socket.on('dice-rolled', (rollData) => {
            if (!isLoadingData) {
                console.log("收到骰子投掷结果:", rollData);
                addRollToHistory(rollData);
                displayRollHistory(playerName);
                // 当收到其他客户端的骰子投掷结果时，也保存到本地数据库
                // 但不要立即发送socket事件，避免无限循环
                if (rollData && rollData.playerName !== playerName) {
                    const saveTimer = setTimeout(() => {
                        fetch(`${DICE_API_URL}/sessions/${sessionId}`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                diceState: getCurrentDiceState(), 
                                playerName: playerName,
                                rollHistory: rollHistoryData 
                            })
                        }).then(response => response.json())
                          .then(result => {
                              console.log("更新骰子历史记录成功:", result.success);
                          }).catch(error => {
                              console.error("更新骰子历史记录失败:", error);
                          });
                    }, 300);
                }
            }
        });
        socket.on('roll-history-sync', (historyData) => {
            console.log("收到历史骰子记录:", historyData);
            rollHistoryData = historyData;
            displayRollHistory(playerName);
        });
        socket.on('reset-dice', () => {
            resetAllDice(false);
        });
    }
    function initializeApp() {
        console.log("初始化应用...");
        if (window.location.protocol !== 'https:' && !window.location.hostname.includes('localhost')) {
            console.warn('警告: 应用未在HTTPS下运行，这可能导致安全问题');
        }
        
        // 确保全局函数和变量正确赋值
        window.saveToServer = saveToServer;
        window.confirmDialog = confirmDialog;
        
        setButtonsEnabled(false);
        showLoadingState("正在连接到服务器...");
        updateSyncStatus("connecting", "正在连接");
        initSocketConnection();
        loadFromServer(true);
        loadDiceFromServer();
        setupCopySessionLink();
        setupDiceEvents(socket, sessionId, playerName, saveDiceToServer);
        setupEventListeners();
        
        // 初始化战场
        initBattlefield();
        
        // 设置HP变化监听器
        monsterContainer.addEventListener("input", (e) => {
            const input = e.target;
            if (input.classList.contains("current-hp-input") || input.classList.contains("max-hp-input") || input.classList.contains("temp-hp-input")) {
                const card = input.closest(".monster-card");
                if (card) {
                    updateHpBar(card);
                    
                    // 同步到战场棋子
                    const pieceId = card.dataset.id;
                    const currentHp = card.querySelector(".current-hp-input").value;
                    const maxHp = card.querySelector(".max-hp-input").value;
                    if (window.updatePieceHp) {
                        window.updatePieceHp(pieceId, currentHp, maxHp);
                    }
                    
                    saveToServer();
                }
            }
            
            // 监听名称变更
            if (input.classList.contains("monster-name")) {
                const card = input.closest(".monster-card");
                if (card) {
                    // 同步到战场棋子名称
                    const pieceId = card.dataset.id;
                    const name = input.textContent;
                    if (window.updatePieceName) {
                        window.updatePieceName(pieceId, name);
                    }
                    
                    saveToServer();
                }
            }
        });
        
        // 添加对名称blur事件的监听，确保在编辑结束时同步
        monsterContainer.addEventListener("blur", (e) => {
            const target = e.target;
            if (target.classList.contains("monster-name")) {
                saveToServer(true); // 立即保存，确保同步
            }
        }, true); // 使用捕获阶段
    }
    function loadFromServer(isInitialLoad = false) {
        if (isLoadingData) return;
        isLoadingData = true;
        if (isInitialLoad) {
            showLoadingState("正在加载战斗数据...");
            updateSyncStatus("syncing", "正在加载数据");
        }
        console.log("正在加载会话数据...");
        fetch(`${BATTLE_API_URL}/sessions/${sessionId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP错误! 状态: ${response.status}`);
                }
                return response.json();
            })
            .then(result => {
                if (result.success && result.data) {
                    console.log("加载到数据:", result.data);
                    refreshUIFromData(result.data);
                } else {
                    console.log("没有找到会话数据或数据为空");
                    const hasMonsterCards = monsterContainer.querySelectorAll('.monster-card').length > 0;
                    const hasEmptyState = monsterContainer.querySelector('.empty-state');
                    if (!hasMonsterCards && !hasEmptyState) {
                        showEmptyState(monsterContainer);
                    }
                }
                isLoadingData = false;
                hideLoadingState();
                updateSyncStatus("success", "数据已加载");
            })
            .catch(error => {
                console.error("加载数据出错:", error);
                isLoadingData = false;
                hideLoadingState();
                updateSyncStatus("error", "加载失败");
                if (isInitialLoad) showLoadingError(error, loadFromServer);
            });
    }
    function loadDiceFromServer() {
        console.log("正在加载骰子会话数据...");
        fetch(`${DICE_API_URL}/sessions/${sessionId}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP错误! 状态: ${response.status}`);
                }
                return response.json();
            })
            .then(result => {
                if (result.success && result.data) {
                    console.log("加载到骰子数据:", result.data);
                    if (result.data.diceState) {
                        updateDiceUIFromData(result.data.diceState);
                    }
                    if (result.data.rollHistory && result.data.rollHistory.length > 0) {
                        rollHistoryData = result.data.rollHistory;
                        displayRollHistory(playerName);
                    }
                } else {
                    console.log("没有找到骰子会话数据或数据为空");
                    // 只有在真的没有数据时才初始化并保存
                    saveDiceToServer();
                }
            })
            .catch(error => {
                console.error("加载骰子数据出错:", error);
            });
    }
    function saveToServer(immediate = false) {
        if (isLoadingData || !isConnected) return;
        if (pendingSaveTimer) {
            clearTimeout(pendingSaveTimer);
            pendingSaveTimer = null;
        }
        if (!immediate) {
            pendingSaveTimer = setTimeout(() => saveToServer(true), 300);
            return;
        }
        updateSyncStatus("syncing", "正在保存会话数据...");
        console.log("正在保存会话数据...");
        const monstersMap = {};
        document.querySelectorAll('.monster-card').forEach(card => {
            const monsterId = card.dataset.id;
            const monsterData = {
                id: monsterId,
                type: card.dataset.type,
                name: card.querySelector('.monster-name').textContent,
                currentHp: card.querySelector('.current-hp-input').value,
                maxHp: card.querySelector('.max-hp-input').value,
                tempHp: card.querySelector('.temp-hp-input').value || 0,
                conditions: card.dataset.conditions || '[]',
                isLocked: card.classList.contains('locked')
            };
            monstersMap[monsterId] = monsterData;
            if (socket && socket.connected) {
                socket.emit('update-monster', { sessionId: sessionId, monster: monsterData });
            }
        });
        if (socket && socket.connected) {
            const sessionData = { monsters: monstersMap };
            socket.emit('session-update', { sessionId: sessionId, data: sessionData });
        }
        const saveTime = Date.now();
        lastSaveTime = saveTime;
        fetch(`${BATTLE_API_URL}/sessions/${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ monsters: monstersMap })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP错误! 状态: ${response.status}`);
                }
                return response.json();
            })
            .then(result => {
                if (saveTime === lastSaveTime) {
                    if (result.success) {
                        console.log("数据保存成功");
                        updateSyncStatus("success", "已保存");
                    } else {
                        console.error("保存失败:", result.error);
                        updateSyncStatus("error", "保存失败");
                    }
                }
            })
            .catch(error => {
                console.error("保存数据出错:", error);
                updateSyncStatus("error", "保存失败");
                showSaveError(error, saveToServer);
            });
    }
    function saveDiceToServer(immediate = false) {
        if (isLoadingData || !isConnected) return;
        if (pendingSaveTimer) {
            clearTimeout(pendingSaveTimer);
            pendingSaveTimer = null;
        }
        if (!immediate) {
            pendingSaveTimer = setTimeout(() => saveDiceToServer(true), 300);
            return;
        }
        updateSyncStatus("syncing", "正在保存骰子数据...");
        console.log("正在保存骰子会话数据...");
        const diceState = getCurrentDiceState();
        localUpdateInProgress = true;
        setTimeout(() => {
            localUpdateInProgress = false;
        }, 500);
        if (socket && socket.connected) {
            socket.emit('update-dice-state', { sessionId: sessionId, playerName: playerName, diceState: diceState });
        }
        const saveTime = Date.now();
        lastSaveTime = saveTime;
        fetch(`${DICE_API_URL}/sessions/${sessionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                diceState: diceState, 
                playerName: playerName,
                rollHistory: rollHistoryData 
            })
        })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP错误! 状态: ${response.status}`);
                }
                return response.json();
            })
            .then(result => {
                if (saveTime === lastSaveTime) {
                    if (result.success) {
                        console.log("骰子数据保存成功");
                        updateSyncStatus("success", "已保存");
                    } else {
                        console.error("骰子保存失败:", result.error);
                        updateSyncStatus("error", "保存失败");
                    }
                }
            })
            .catch(error => {
                console.error("保存骰子数据出错:", error);
                updateSyncStatus("error", "保存失败");
            });
    }
    function setupEventListeners() {
        addMonsterBtn.addEventListener("click", () => {
            if (!isConnected) return alert("未连接到服务器，请检查网络连接并刷新页面");
            const name = `${monsterNamePrefix.value} ${monsterCounter++}`;
            const maxHp = parseInt(defaultHpInput.value) || 100;
            monsterContainer.appendChild(createMonsterCard(name, maxHp, false, saveToServer));
            updateSortButtonStatus();
            saveToServer();
        });
        addAdventurerBtn.addEventListener("click", () => {
            if (!isConnected) return alert("未连接到服务器，请检查网络连接并刷新页面");
            const name = `${adventurerNamePrefix.value} ${adventurerCounter++}`;
            const maxHp = parseInt(defaultHpInput.value) || 100;
            monsterContainer.appendChild(createMonsterCard(name, maxHp, true, saveToServer));
            updateSortButtonStatus();
            saveToServer();
        });
        resetAllBtn.addEventListener("click", () => {
            if (!isConnected) return alert("未连接到服务器，请检查网络连接并刷新页面");
            if (confirm("确定要移除所有非锁定的怪物和冒险者吗？")) {
                document.querySelectorAll('.monster-card:not(.locked)').forEach(card => card.remove());
                const hasMonsterCards = monsterContainer.querySelectorAll('.monster-card').length > 0;
                const hasEmptyState = monsterContainer.querySelector('.empty-state');
                if (!hasMonsterCards && !hasEmptyState) {
                    showEmptyState(monsterContainer);
                }
                updateSortButtonStatus();
                saveToServer();
            }
        });
        manualSyncBtn.addEventListener("click", () => {
            if (!isConnected) return alert("未连接到服务器，请检查网络连接并刷新页面");
            manualSyncBtn.classList.add("syncing");
            updateSyncStatus("syncing", "手动同步中...");
            saveToServer(true);
            setTimeout(() => {
                loadFromServer();
                loadDiceFromServer();
                setTimeout(() => manualSyncBtn.classList.remove("syncing"), 1000);
            }, 1000);
        });
        
        // 战场按钮事件监听器
        const battlefieldBtn = document.getElementById("battlefield-btn");
        battlefieldBtn.addEventListener("click", () => {
            if (!isConnected) return alert("未连接到服务器，请检查网络连接并刷新页面");
            openBattlefield();
        });
        
        closeStatusBtn.addEventListener("click", () => statusSelector.classList.remove("active"));
        cancelStatusBtn.addEventListener("click", () => statusSelector.classList.remove("active"));
        applyStatusBtn.addEventListener("click", applySelectedStatus);
        statusSelector.addEventListener("click", (e) => {
            if (e.target === statusSelector) statusSelector.classList.remove("active");
        });
        addCustomStatusBtn.addEventListener("click", () => {
            const name = customStatusName.value.trim();
            const desc = customStatusDesc.value.trim();
            if (!name) return alert("请输入状态名称");
            const id = `custom-${Date.now()}-${customConditionCounter++}`;
            addConditionToGrid({ id, name, desc, custom: true });
            customStatusName.value = "";
            customStatusDesc.value = "";
            customStatusName.focus();
        });
        customStatusName.addEventListener("keypress", (e) => {
            if (e.key === "Enter") customStatusDesc.focus();
        });
        customStatusDesc.addEventListener("keypress", (e) => {
            if (e.key === "Enter") addCustomStatusBtn.click();
        });
        window.addEventListener('online', () => {
            console.log('网络已连接');
            if (!isConnected) {
                updateSyncStatus("syncing", "重新连接中...");
                setTimeout(() => initializeApp(), 1000);
            }
        });
        window.addEventListener('offline', () => {
            console.log('网络连接已断开');
            updateSyncStatus("error", "网络已断开");
            isConnected = false;
            setButtonsEnabled(false);
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && isConnected) {
                console.log('页面恢复前台，检查连接状态');
                loadFromServer();
                loadDiceFromServer();
            }
        });
        
        // 阻止菜单滑动问题
        const menuButtons = [
            document.getElementById("dice-btn"),
            document.getElementById("items-btn"),
            document.getElementById("spells-btn"),
            document.getElementById("battlefield-btn")
        ];
        
        menuButtons.forEach(btn => {
            if (btn) {
                btn.addEventListener("click", (e) => {
                    e.preventDefault(); // 阻止默认行为
                    
                    // 保存当前的滚动位置
                    const scrollPosition = window.scrollY;
                    
                    // 延迟触发原有的点击功能，确保默认行为被阻止
                    setTimeout(() => {
                        // 每个按钮都有自己的点击处理，这里只防止滚动
                        if (btn.id === "dice-btn") {
                            document.getElementById("dice-dialog").classList.add("active");
                        } else if (btn.id === "items-btn") {
                            document.getElementById("items-dialog").classList.add("active");
                        } else if (btn.id === "battlefield-btn") {
                            openBattlefield();
                        }
                        
                        // 恢复滚动位置
                        window.scrollTo({
                            top: scrollPosition,
                            behavior: "auto" // 使用即时滚动而非平滑滚动
                        });
                    }, 10);
                });
            }
        });
        
        // 移除原有的点击事件处理（如果修改后的代码冲突）
        // 移除只能在后面添加了新的处理程序后执行
        if (diceBtn) diceBtn.removeEventListener("click", () => {
            diceDialog.classList.add("active");
        });
        
        // 移除战场按钮的原有点击事件
        if (battlefieldBtn) {
            const newBattlefieldBtn = battlefieldBtn.cloneNode(true);
            battlefieldBtn.parentNode.replaceChild(newBattlefieldBtn, battlefieldBtn);
            // 为新按钮重新添加点击事件
            newBattlefieldBtn.addEventListener("click", (e) => {
                e.preventDefault();
                const scrollPosition = window.scrollY;
                setTimeout(() => {
                    openBattlefield();
                    window.scrollTo({
                        top: scrollPosition,
                        behavior: "auto"
                    });
                }, 10);
            });
        }
    }
    function setupAutoSave() {
        let autoSaveInterval;
        if (autoSaveInterval) clearInterval(autoSaveInterval);
        autoSaveInterval = setInterval(() => {
            if (isConnected && !isLoadingData) {
                console.log("执行自动保存...");
                saveToServer();
            }
        }, 30000);
    }
    initializeApp();
    setupAutoSave();
    
    // 将关键变量和函数暴露到全局作用域
    window.saveToServer = saveToServer;
    window.sessionId = sessionId;
    window.confirmDialog = confirmDialog;
});