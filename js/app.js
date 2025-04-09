// 全局函数和变量声明
window.saveToServer = function(immediate) {
    console.log("全局saveToServer被调用，但尚未初始化");
};
window.socket = null;
window.sessionId = null;
window.confirmDialog = null;

// Helper function for debouncing
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

document.addEventListener("DOMContentLoaded", () => {
    const API_BASE_URL = 'https://dnd-server.zeabur.app/api/v1';
    const BATTLE_API_URL = `${API_BASE_URL}/battles`;
    const DICE_API_URL = `${API_BASE_URL}/dice`;
    const SOCKET_URL = 'https://dnd-server.zeabur.app';
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

    // --- 添加 createMonsterData 函数定义 ---
    function createMonsterData(name, maxHp, isAdventurer) {
        // 创建临时ID，服务器端需要这个ID
        const tempId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
        
        // 创建基础数据对象，服务器端需要id字段
        return {
            id: tempId,
            name: name,
            maxHp: parseInt(maxHp) || 100,
            currentHp: parseInt(maxHp) || 100, // 默认满血
            tempHp: 0,
            isAdventurer: !!isAdventurer,
            conditions: [],
            initiative: null
        };
    }
    // --- 结束添加 ---

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
            
            // 移动到这里：确保WebSocket连接成功后再加载数据
            loadFromServer(true);
            loadDiceFromServer();
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
                if (window.updatePieceHp && monsterData.hasOwnProperty('currentHp') && monsterData.hasOwnProperty('maxHp')) {
                    window.updatePieceHp(monsterData.id, monsterData.currentHp, monsterData.maxHp);
                }
                if (window.updatePieceName && monsterData.hasOwnProperty('name')) {
                    window.updatePieceName(monsterData.id, monsterData.name);
                }
            }
        });
        socket.on('session-updated', (data) => {
            if (!isLoadingData && data) {
                console.log("收到会话更新");
                refreshUIFromData(data);
                if (data.monsters && window.updatePieceHp && window.updatePieceName) {
                     Object.values(data.monsters).forEach(monsterData => {
                         if (monsterData.hasOwnProperty('currentHp') && monsterData.hasOwnProperty('maxHp')) {
                             window.updatePieceHp(monsterData.id, monsterData.currentHp, monsterData.maxHp);
                         }
                         if (monsterData.hasOwnProperty('name')) {
                             window.updatePieceName(monsterData.id, monsterData.name);
                         }
                     });
                }
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
            if (!isLoadingData) {
                console.log("收到骰子状态更新:", diceState);
                updateDiceUIFromData(diceState);
            }
        });
        socket.on('dice-rolled', (rollData) => {
            if (!isLoadingData) {
                console.log("收到骰子投掷结果:", rollData);
                const progressBarContainer = document.querySelector(".progress-bar-container");
                if (progressBarContainer) {
                    progressBarContainer.style.display = "none";
                }
                addRollToHistory(playerName);
                displayRollHistory(playerName);
                document.getElementById("dice-result")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }
        });
        socket.on('roll-history-sync', (historyData) => {
            console.log("收到历史骰子记录:", historyData);
            rollHistoryData = historyData;
            displayRollHistory(playerName);
        });
        socket.on('reset-dice', () => {
            console.log("收到骰子重置确认");
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
        setupCopySessionLink();
        setupDiceEvents(socket, sessionId, playerName, saveDiceToServer);
        setupEventListeners();
        
        // 初始化战场
        initBattlefield();
        
        // Debounced functions for sending updates via WebSocket
        const debouncedSendHpUpdate = debounce((monsterId, currentHp, maxHp, tempHp) => {
            if (socket && socket.connected) {
                 console.log(`Debounced: Emitting update-hp for ${monsterId}`);
                 socket.emit('update-hp', { sessionId, monsterId, currentHp, maxHp, tempHp });
            }
        }, 500); // 500ms debounce for HP changes

        const debouncedSendNameUpdate = debounce((monsterId, name) => {
            if (socket && socket.connected) {
                console.log(`Debounced: Emitting update-name for ${monsterId}`);
                socket.emit('update-name', { sessionId, monsterId, name });
            }
        }, 500); // 500ms debounce for name changes

        // Add new listeners inside initializeApp or preferably delegated from monsterContainer
        monsterContainer.addEventListener("input", (e) => {
            const target = e.target;
            const card = target.closest(".monster-card");
            if (!card) return;
            const monsterId = card.dataset.id;

            // Handle HP input changes
            if (target.classList.contains("current-hp-input") || target.classList.contains("max-hp-input") || target.classList.contains("temp-hp-input")) {
                // Update local HP bar immediately for responsiveness
                updateHpBar(card);
                
                // Get all HP values from the card
                const currentHp = card.querySelector(".current-hp-input").value;
                const maxHp = card.querySelector(".max-hp-input").value;
                const tempHp = card.querySelector(".temp-hp-input").value || 0;

                // Send debounced update via WebSocket
                debouncedSendHpUpdate(monsterId, currentHp, maxHp, tempHp);
            }
            
            // Handle Name input changes (using input event + debounce)
            if (target.classList.contains("monster-name")) {
                const name = target.textContent;
                 // Send debounced update via WebSocket
                 debouncedSendNameUpdate(monsterId, name);
            }
        });
    }
    function loadFromServer(isInitialLoad = false) {
        if (isLoadingData) return;
        // isLoadingData = true; // WebSocket 连接成功后由服务器推送，不再需要手动加载状态
        if (isInitialLoad) {
            // 保持 Loading 状态，直到 WebSocket 连接并收到初始数据
            // showLoadingState("正在加载战斗数据...");
            // updateSyncStatus("syncing", "正在加载数据");
        }
        console.log("请求最新战斗状态 (通过 WebSocket)...");
        if (socket && socket.connected) {
            socket.emit('request-latest-state', { sessionId: window.sessionId });
        } else {
            console.warn("loadFromServer 调用时 WebSocket 未连接");
            // WebSocket 连接成功后会自动请求
        }
        
        /* 注释掉 fetch 调用，改用 WebSocket
        console.log("正在加载会话数据...");
        fetch(`${BATTLE_API_URL}/sessions/${sessionId}`, {
            // mode: 'no-cors' // no-cors 会导致无法读取响应内容，且此处应使用 WebSocket
        })
            .then(response => {
                if (!response.ok) {
                    // 404 或其他错误
                     console.error(`加载数据HTTP错误! 状态: ${response.status}`);
                    throw new Error(`HTTP错误! 状态: ${response.status}`);
                }
                 // 检查 content-type 是否为 application/json
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    return response.json();
                } else {
                    console.error("收到的响应不是 JSON 格式");
                    throw new Error("响应格式错误");
                }
            })
            .then(result => {
                console.log("从服务器加载的数据:", result);
                if (result && result.data) {
                     hideLoadingState();
                    refreshUIFromData(result.data);
                    updateSyncStatus("success", "数据已加载");
                } else {
                    console.log("未找到会话数据，或数据为空");
                    hideLoadingState();
                    showEmptyState(monsterContainer);
                    updateSyncStatus("success", "就绪 (新会话)");
                }
            })
            .catch(error => {
                 console.error("加载数据出错:", error);
                 updateSyncStatus("error", "加载失败");
                 // 显示错误信息，但不阻塞UI
                 // hideLoadingState(); 
                 showConnectionError(initializeApp); // 或者显示一个更通用的错误提示
            })
            .finally(() => {
                 isLoadingData = false;
            });
         */
    }
    function loadDiceFromServer() {
         // isLoadingData = true; // 由 WebSocket 处理
         console.log("请求最新骰子状态 (通过 WebSocket)...");
         if (socket && socket.connected) {
             socket.emit('request-latest-dice-state', { sessionId: window.sessionId });
             socket.emit('request-latest-roll-history', { sessionId: window.sessionId }); // 同时请求历史记录
         } else {
             console.warn("loadDiceFromServer 调用时 WebSocket 未连接");
         }

        /* 注释掉 fetch 调用，改用 WebSocket
        fetch(`${DICE_API_URL}/sessions/${sessionId}`)
            .then(response => {
                if (!response.ok) {
                     console.error(`加载骰子数据HTTP错误! 状态: ${response.status}`);
                    throw new Error(`HTTP错误! 状态: ${response.status}`);
                }
                const contentType = response.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    return response.json();
                } else {
                    console.error("收到的骰子响应不是 JSON 格式");
                    throw new Error("响应格式错误");
                }
            })
            .then(result => {
                if (result && result.data) {
                    console.log("骰子数据加载:", result.data);
                    updateDiceUIFromData(result.data.diceState);
                    rollHistoryData = result.data.rollHistory || [];
                    displayRollHistory(playerName);
                } else {
                    console.log("未找到骰子会话数据");
                     resetAllDice(false); // 如果服务器没数据，重置本地UI
                     rollHistoryData = [];
                     displayRollHistory(playerName);
                }
            })
            .catch(error => {
                 console.error("加载骰子数据出错:", error);
                 // 不阻塞UI，允许用户继续使用骰子
            });
         */
    }
    function saveToServer(immediate = false) {
        console.log("saveToServer called, but HTTP POST is disabled. State sync relies on WebSocket.");
        // 如果需要，可以在这里触发一次WebSocket同步请求，但这取决于服务器设计
        // 例如: if (socket && socket.connected) socket.emit('request-state-save', { sessionId });
        // 但更推荐的方式是服务器根据收到的增量更新自动保存
    }
    function saveDiceToServer(immediate = false) {
        updateSyncStatus("syncing", "正在同步骰子状态 (WebSocket)...");
        console.log("正在同步骰子状态 (WebSocket)... (saveDiceToServer)");
        const diceState = getCurrentDiceState();
        if (socket && socket.connected && diceState) {
            socket.emit('update-dice-state', { sessionId: sessionId, playerName: playerName, diceState: diceState });
             console.log("Emitted update-dice-state via WebSocket.");
             updateSyncStatus("success", "骰子状态已同步");
        } else {
             console.warn("无法通过 WebSocket 同步骰子状态: Socket未连接或骰子状态无效");
             updateSyncStatus("error", "骰子同步失败");
        }
    }
    function setupEventListeners() {
        addMonsterBtn.addEventListener("click", () => {
            if (!isConnected) return alert("未连接到服务器，请检查网络连接并刷新页面");
            const name = `${monsterNamePrefix.value} ${monsterCounter++}`;
            const maxHp = parseInt(defaultHpInput.value) || 100;
            // 创建怪物数据对象，但不立即添加到 DOM
            const monsterData = createMonsterData(name, maxHp, false); 
            if (monsterData) {
                 // 发送 add-monster 事件到服务器
                 if (socket && socket.connected) {
                     console.log("Emitting add-monster:", monsterData);
                     socket.emit('add-monster', { sessionId: window.sessionId, monster: monsterData });
                 }
                 // 服务器广播 monster-updated 后，客户端会创建卡片
                 // monsterContainer.appendChild(createMonsterCard(name, maxHp, false)); // 不再直接添加
                 // updateSortButtonStatus(); // 状态更新后由相应事件处理
            }
        });

        addAdventurerBtn.addEventListener("click", () => {
            if (!isConnected) return alert("未连接到服务器，请检查网络连接并刷新页面");
            const name = `${adventurerNamePrefix.value} ${adventurerCounter++}`;
            const maxHp = parseInt(defaultHpInput.value) || 100;
             // 创建冒险者数据对象
             const adventurerData = createMonsterData(name, maxHp, true);
             if (adventurerData) {
                  // 发送 add-monster 事件到服务器
                 if (socket && socket.connected) {
                     console.log("Emitting add-monster (adventurer):", adventurerData);
                     socket.emit('add-monster', { sessionId: window.sessionId, monster: adventurerData });
                 }
                  // 服务器广播 monster-updated 后，客户端会创建卡片
                 // monsterContainer.appendChild(createMonsterCard(name, maxHp, true)); // 不再直接添加
                 // updateSortButtonStatus(); // 状态更新后由相应事件处理
             }
        });
        resetAllBtn.addEventListener("click", () => {
            if (!isConnected) return alert("未连接到服务器，请检查网络连接并刷新页面");
            confirmDialog.show("确定要移除所有非锁定的怪物和冒险者吗？", () => {
                 console.log("用户确认重置");
                 const idsToRemove = [];
                 document.querySelectorAll('.monster-card:not(.locked)').forEach(card => {
                     idsToRemove.push(card.dataset.id);
                     card.remove();
                 });

                 const hasMonsterCards = monsterContainer.querySelectorAll('.monster-card').length > 0;
                 const hasEmptyState = monsterContainer.querySelector('.empty-state');
                 if (!hasMonsterCards && !hasEmptyState) {
                     showEmptyState(monsterContainer);
                 }
                 updateSortButtonStatus();

                 if (socket && socket.connected && idsToRemove.length > 0) {
                     console.log("Emitting batch-delete-monsters with IDs:", idsToRemove);
                     socket.emit('batch-delete-monsters', { sessionId: window.sessionId, monsterIds: idsToRemove });
                 }
             });
        });
        manualSyncBtn.addEventListener("click", () => {
            if (!isConnected) return alert("未连接到服务器，请检查网络连接并刷新页面");
            manualSyncBtn.classList.add("syncing");
            updateSyncStatus("syncing", "正在请求最新状态...");

            if (socket && socket.connected) {
                console.log("Emitting request-latest-state");
                socket.emit('request-latest-state', { sessionId: window.sessionId });
                socket.emit('request-latest-dice-state', { sessionId: window.sessionId });
                socket.emit('request-latest-battlefield-state', { sessionId: window.sessionId });
            }

            setTimeout(() => {
                manualSyncBtn.classList.remove("syncing");
                 updateSyncStatus("success", "同步请求已发送");
            }, 1500);
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
    }
    initializeApp();
});