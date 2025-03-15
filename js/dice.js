let rollHistoryData = [];
let localUpdateInProgress = false;
let globalSocket = null;
let globalSessionId = null;
let globalPlayerName = null;
let globalSaveDiceToServer = null;

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getCurrentDiceState() {
    const state = {
        dice: {},
        advantage: document.getElementById('global-advantage').checked,
        disadvantage: document.getElementById('global-disadvantage').checked
    };
    document.querySelectorAll('.dice-card').forEach(card => {
        const diceType = card.dataset.dice;
        const quantity = parseInt(card.querySelector('.current-quantity').textContent);
        state.dice[diceType] = quantity;
    });
    return state;
}

function updateDiceUIFromData(diceState) {
    if (!diceState) return;
    if (diceState.dice) {
        document.querySelectorAll('.dice-card').forEach(card => {
            const diceType = card.dataset.dice;
            if (diceState.dice[diceType] !== undefined) {
                card.querySelector('.current-quantity').textContent = diceState.dice[diceType];
            }
        });
    }
    if (diceState.advantage !== undefined) {
        document.getElementById('global-advantage').checked = diceState.advantage;
    }
    if (diceState.disadvantage !== undefined) {
        document.getElementById('global-disadvantage').checked = diceState.disadvantage;
    }
}

function addRollToHistory(rollData) {
    if (rollHistoryData.length >= 20) {
        rollHistoryData.shift();
    }
    rollHistoryData.push(rollData);
}

function displayRollHistory(currentPlayerName) {
    const resultDiv = document.getElementById("dice-result");
    resultDiv.innerHTML = "";
    if (rollHistoryData.length === 0) {
        resultDiv.innerHTML = "<p style='text-align:center;color:#999;'>暂无骰子记录</p>";
        return;
    }
    rollHistoryData.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
    rollHistoryData.forEach(rollData => {
        const rollContainer = document.createElement("div");
        rollContainer.className = "roll-container";
        const playerInfo = document.createElement("div");
        playerInfo.className = "player-info";
        const isLocal = rollData.playerName === currentPlayerName;
        playerInfo.textContent = `${rollData.playerName || "未知玩家"} ${isLocal ? "(你)" : ""}`;
        rollContainer.appendChild(playerInfo);
        const rollContent = document.createElement("div");
        rollContent.className = "roll-content";
        rollContent.innerHTML = buildRollHtml(rollData.rolls || {});
        rollContainer.appendChild(rollContent);
        if (rollData.timestamp) {
            const timestamp = document.createElement("div");
            timestamp.className = "roll-timestamp";
            timestamp.textContent = new Date(rollData.timestamp).toLocaleString();
            rollContainer.appendChild(timestamp);
        }
        resultDiv.appendChild(rollContainer);
    });
    resultDiv.scrollTop = resultDiv.scrollHeight;
}

function buildRollHtml(rolls) {
    let resultHtml = "";
    let grandTotal = 0;
    for (const diceType in rolls) {
        if (rolls.hasOwnProperty(diceType)) {
            const quantity = rolls[diceType].quantity;
            if (quantity === 0) continue;
            resultHtml += `<h3>${diceType.toUpperCase()} ×${quantity}</h3><ul>`;
            const subtotal = rolls[diceType].subtotal;
            rolls[diceType].rolls.forEach(roll => {
                if (typeof roll === "object") {
                    const prefix = roll.isAdvantage ? "优势" : "劣势";
                    resultHtml += `<li>${prefix} (${roll.roll1}, ${roll.roll2}) --> ${roll.finalRoll}</li>`;
                } else {
                    resultHtml += `<li>${roll}</li>`;
                }
            });
            resultHtml += `</ul><div><strong>小计: ${subtotal}</strong></div><hr>`;
            grandTotal += subtotal;
        }
    }
    if (grandTotal > 0) {
        resultHtml += `<div class="total-sum">总计: ${grandTotal}</div>`;
    }
    return resultHtml;
}

function resetAllDice(emitEvent = true) {
    document.querySelectorAll(".current-quantity").forEach((span) => {
        span.textContent = "0";
    });
    document.getElementById('global-advantage').checked = false;
    document.getElementById('global-disadvantage').checked = false;
    document.getElementById("dice-result").innerHTML = "";
    document.querySelector(".progress-bar-container").style.display = "none";
    rollHistoryData = [];
    displayRollHistory(globalPlayerName);
    
    if (emitEvent) {
        if (globalSocket && globalSocket.connected) {
            globalSocket.emit('reset-dice', { sessionId: globalSessionId, playerName: globalPlayerName });
        }
        if (typeof globalSaveDiceToServer === 'function') {
            globalSaveDiceToServer(true);
        }
    }
}

function setupDiceEvents(socket, sessionId, playerName, saveDiceToServer) {
    globalSocket = socket;
    globalSessionId = sessionId;
    globalPlayerName = playerName;
    globalSaveDiceToServer = saveDiceToServer;
    
    const diceBtn = document.getElementById("dice-btn");
    const diceDialog = document.getElementById("dice-dialog");
    const closeDiceBtn = document.querySelector(".close-dice");
    const rollButton = document.getElementById("roll-button");
    const diceResetButton = document.getElementById("dice-reset-button");
    const globalAdvantage = document.getElementById("global-advantage");
    const globalDisadvantage = document.getElementById("global-disadvantage");
    const progressBarContainer = document.querySelector(".progress-bar-container");
    const progressBar = document.querySelector(".progress-bar");
    diceBtn.addEventListener("click", () => {
        diceDialog.classList.add("active");
    });
    closeDiceBtn.addEventListener("click", () => {
        diceDialog.classList.remove("active");
    });
    document.querySelectorAll(".quantity-controls").forEach((controls) => {
        const display = controls.querySelector(".current-quantity");
        const plusBtn = controls.querySelector(".plus");
        const minusBtn = controls.querySelector(".minus");
        const plus5Btn = controls.querySelector(".plus5");
        const minus5Btn = controls.querySelector(".minus5");
        function updateQuantity(change) {
            const newValue = Math.max(0, Math.min(99, parseInt(display.textContent) + change));
            display.textContent = newValue;
            saveDiceToServer();
        }
        plusBtn.addEventListener("click", () => updateQuantity(1));
        minusBtn.addEventListener("click", () => updateQuantity(-1));
        plus5Btn.addEventListener("click", () => updateQuantity(5));
        minus5Btn.addEventListener("click", () => updateQuantity(-5));
    });
    globalAdvantage.addEventListener("change", () => {
        if (globalAdvantage.checked) {
            globalDisadvantage.checked = false;
        }
        saveDiceToServer();
    });
    globalDisadvantage.addEventListener("change", () => {
        if (globalDisadvantage.checked) {
            globalAdvantage.checked = false;
        }
        saveDiceToServer();
    });
    rollButton.addEventListener("click", () => {
        progressBar.style.width = "0%";
        progressBarContainer.style.display = "block";
        progressBarContainer.scrollIntoView({ behavior: "smooth" });
        let allRolls = {};
        const isAdvantage = globalAdvantage.checked;
        const isDisadvantage = globalDisadvantage.checked;
        document.querySelectorAll(".dice-card").forEach((card) => {
            const diceType = card.dataset.dice;
            const quantity = +card.querySelector(".current-quantity").textContent;
            if (quantity === 0) return;
            const sides = parseInt(diceType.substring(1));
            allRolls[diceType] = { quantity: quantity, rolls: [], subtotal: 0 };
            for (let i = 0; i < quantity; i++) {
                if (isAdvantage || isDisadvantage) {
                    const roll1 = getRandomInt(1, sides);
                    const roll2 = getRandomInt(1, sides);
                    const finalRoll = isAdvantage ? Math.max(roll1, roll2) : Math.min(roll1, roll2);
                    allRolls[diceType].rolls.push({ roll1, roll2, finalRoll, isAdvantage });
                    allRolls[diceType].subtotal += finalRoll;
                } else {
                    const roll = getRandomInt(1, sides);
                    allRolls[diceType].rolls.push(roll);
                    allRolls[diceType].subtotal += roll;
                }
            }
        });
        const duration = 1000;
        const startTime = performance.now();
        function animate() {
            const now = performance.now();
            const progress = Math.min((now - startTime) / duration, 1);
            progressBar.style.width = (progress * 100) + "%";
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                progressBarContainer.style.display = "none";
                const rollData = {
                    playerName: playerName,
                    timestamp: new Date().toISOString(),
                    rolls: allRolls
                };
                addRollToHistory(rollData);
                displayRollHistory(playerName);
                if (socket && socket.connected) {
                    socket.emit('roll-dice', { sessionId: sessionId, rollData: rollData });
                }
                if (typeof globalSaveDiceToServer === 'function') {
                    globalSaveDiceToServer(true);
                }
                document.getElementById("dice-result").scrollIntoView({ behavior: "smooth" });
            }
        }
        requestAnimationFrame(animate);
    });
    diceResetButton.addEventListener("click", () => {
        resetAllDice(true);
    });
    diceDialog.addEventListener("click", (e) => {
        if (e.target === diceDialog) {
            diceDialog.classList.remove("active");
        }
    });
}