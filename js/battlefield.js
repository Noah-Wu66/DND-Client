// 战场功能实现
let battlefield = null;
let battlefieldContainer = null;
let battlefieldGrid = null;
let battlefieldPieces = {};
let battlefieldScale = 1.0;
let isDragging = false;
let draggedPiece = null;
let dragStartX = 0;
let dragStartY = 0;
let backgroundImage = null;
let gridSize = 50; // 默认格子大小
let touchStartX = 0;
let touchStartY = 0;
let lastTouchDistance = 0;
let isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
let pieceSize = 40; // 默认棋子大小
let isGridVisible = true; // 默认显示方格
let battlefieldState = {}; // 存储战场状态

// 初始化战场
function initBattlefield() {
    battlefield = document.getElementById('battlefield-dialog');
    battlefieldContainer = document.getElementById('battlefield-container');
    battlefieldGrid = document.getElementById('battlefield-grid');
    
    // 设置事件监听器
    setupBattlefieldEventListeners();
    
    // 初始化Socket.io事件
    setupBattlefieldSocketEvents();
    
    // 从服务器加载战场状态
    loadBattlefieldStateFromServer();
}

// 设置战场事件监听器
function setupBattlefieldEventListeners() {
    const closeBattlefieldBtn = document.querySelector('.close-battlefield');
    const uploadBackgroundBtn = document.getElementById('upload-background');
    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const resetZoomBtn = document.getElementById('reset-zoom');
    const toggleGridBtn = document.getElementById('toggle-grid');
    const decreasePieceSizeBtn = document.getElementById('decrease-piece-size');
    const increasePieceSizeBtn = document.getElementById('increase-piece-size');
    const pieceSizeValue = document.getElementById('piece-size-value');
    
    // 关闭战场对话框
    closeBattlefieldBtn.addEventListener('click', () => {
        battlefield.classList.remove('active');
        // 不再需要在这里保存状态，状态应实时通过 WebSocket 同步
        // saveBattlefieldStateToServer();
    });
    
    // 上传背景图片
    uploadBackgroundBtn.addEventListener('change', handleBackgroundUpload);
    
    // 缩放控制
    zoomInBtn.addEventListener('click', () => {
        updateBattlefieldScale(battlefieldScale + 0.1, true);
    });
    
    zoomOutBtn.addEventListener('click', () => {
        updateBattlefieldScale(battlefieldScale - 0.1, true);
    });
    
    resetZoomBtn.addEventListener('click', () => {
        updateBattlefieldScale(1.0, true);
    });
    
    // 显示/隐藏方格
    toggleGridBtn.addEventListener('click', () => {
        isGridVisible = !isGridVisible;
        updateGridVisibility(isGridVisible, true);
        toggleGridBtn.textContent = isGridVisible ? '隐藏方格' : '显示方格';
        toggleGridBtn.classList.toggle('active', !isGridVisible);
    });
    
    // 调整棋子大小
    decreasePieceSizeBtn.addEventListener('click', () => {
        updatePieceSize(pieceSize - 5, true);
    });
    
    increasePieceSizeBtn.addEventListener('click', () => {
        updatePieceSize(pieceSize + 5, true);
    });
    
    // 鼠标滚轮缩放
    battlefieldContainer.addEventListener('wheel', handleMouseWheel);
    
    // 触摸事件处理
    if (isTouchDevice) {
        battlefieldContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
        battlefieldContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
        battlefieldContainer.addEventListener('touchend', handleTouchEnd);
    }
    
    // 鼠标拖动事件
    battlefieldGrid.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    
    // 移除 beforeunload 中的保存调用
    window.removeEventListener('beforeunload', saveBattlefieldStateToServer); // 移除旧监听器
    /*
    window.addEventListener('beforeunload', () => {
        // 不再需要在这里保存
        // saveBattlefieldStateToServer();
    });
    */
}

// 设置Socket.io事件
function setupBattlefieldSocketEvents() {
    if (!window.socket) return;
    
    // 监听棋子移动事件
    window.socket.on('piece-moved', (data) => {
        if (data && data.pieceId && data.x !== undefined && data.y !== undefined) {
            updatePiecePosition(data.pieceId, data.x, data.y, false);
        }
    });
    
    // 监听背景图片更新事件
    window.socket.on('background-updated', (data) => {
        if (data && data.imageUrl) {
            updateBackgroundImage(data.imageUrl, false);
        }
    });
    
    // 监听分块图片传输完成事件
    window.socket.on('background-transfer-complete', (data) => {
        if (data && data.imageUrl) {
            console.log('接收到完整的背景图片');
            updateBackgroundImage(data.imageUrl, false);
        }
    });
    
    // 监听缩放更新事件
    window.socket.on('scale-updated', (data) => {
        if (data && data.scale !== undefined) {
            updateBattlefieldScale(data.scale, false);
        }
    });
    
    // 监听方格显示/隐藏事件
    window.socket.on('grid-visibility-updated', (data) => {
        if (data && data.isVisible !== undefined) {
            updateGridVisibility(data.isVisible, false);
            const toggleGridBtn = document.getElementById('toggle-grid');
            toggleGridBtn.textContent = data.isVisible ? '隐藏方格' : '显示方格';
            toggleGridBtn.classList.toggle('active', !data.isVisible);
        }
    });
    
    // 监听棋子大小更新事件
    window.socket.on('piece-size-updated', (data) => {
        if (data && data.size !== undefined) {
            updatePieceSize(data.size, false);
        }
    });
    
    // 监听战场状态更新事件
    window.socket.on('battlefield-state-updated', (data) => {
        if (data && data.state) {
            loadBattlefieldState(data.state);
        }
    });
}

// 打开战场对话框
function openBattlefield() {
    battlefield.classList.add('active');
    refreshBattlefield();
}

// 刷新战场
function refreshBattlefield() {
    // 清空当前棋子
    battlefieldGrid.innerHTML = '';
    battlefieldPieces = {};
    
    // 获取所有冒险者和怪物卡片
    const monsterCards = document.querySelectorAll('.monster-card');
    
    // 为每个卡片创建对应的棋子
    monsterCards.forEach((card, index) => {
        const isAdventurer = card.dataset.type === 'adventurer';
        const name = card.querySelector('.monster-name').textContent;
        const id = card.dataset.id;
        const currentHp = card.querySelector('.current-hp-input').value;
        const maxHp = card.querySelector('.max-hp-input').value;
        
        // 创建棋子
        createBattlefieldPiece(id, name, isAdventurer, currentHp, maxHp, index);
    });
    
    // 检查battlefieldState是否为空，如果为空则尝试从服务器加载
    if (Object.keys(battlefieldState).length === 0) {
        loadBattlefieldStateFromServer();
        // 延迟一点时间等待加载完成
        setTimeout(() => {
            applyBattlefieldState();
        }, 500);
    } else {
        // 应用已有的战场状态
        applyBattlefieldState();
    }
}

// 创建战场棋子
function createBattlefieldPiece(id, name, isAdventurer, currentHp, maxHp, index) {
    const piece = document.createElement('div');
    piece.className = 'battlefield-piece';
    piece.dataset.id = id;
    piece.dataset.type = isAdventurer ? 'adventurer' : 'monster';
    
    // 设置棋子颜色
    const color = isAdventurer ? 
        `hsl(${(index * 60) % 360}, 70%, 60%)` : 
        `hsl(${(index * 40 + 180) % 360}, 70%, 40%)`;
    
    piece.style.backgroundColor = color;
    
    // 设置棋子内容
    piece.innerHTML = `
        <div class="piece-name">${name}</div>
        <div class="piece-hp">${currentHp}/${maxHp}</div>
    `;
    
    // 从保存的状态中获取位置，如果没有则使用默认位置
    let x = (index % 10) * gridSize + 50;
    let y = Math.floor(index / 10) * gridSize + 50;
    
    // 如果有保存的位置，使用保存的位置
    if (battlefieldState.pieces && battlefieldState.pieces[id]) {
        x = battlefieldState.pieces[id].x || x;
        y = battlefieldState.pieces[id].y || y;
    }
    
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;
    
    // 设置棋子大小
    piece.style.width = `${pieceSize}px`;
    piece.style.height = `${pieceSize}px`;
    
    // 存储棋子信息
    battlefieldPieces[id] = {
        element: piece,
        x: x,
        y: y,
        name: name,
        isAdventurer: isAdventurer,
        currentHp: currentHp,
        maxHp: maxHp
    };
    
    // 添加到战场
    battlefieldGrid.appendChild(piece);
}

// 更新棋子位置
function updatePiecePosition(pieceId, x, y, emitEvent = true) {
    const piece = battlefieldPieces[pieceId];
    if (!piece) return;
    
    // 更新位置
    piece.x = x;
    piece.y = y;
    piece.element.style.left = `${x}px`;
    piece.element.style.top = `${y}px`;
    
    // 更新战场状态
    if (!battlefieldState.pieces) battlefieldState.pieces = {};
    battlefieldState.pieces[pieceId] = battlefieldState.pieces[pieceId] || {};
    battlefieldState.pieces[pieceId].x = x;
    battlefieldState.pieces[pieceId].y = y;
    
    // 发送事件到服务器
    if (emitEvent && window.socket && window.socket.connected) {
         console.log(`Emitting move-piece for ${pieceId} to x:${x}, y:${y}`);
        window.socket.emit('move-piece', {
            sessionId: window.sessionId,
            pieceId: pieceId,
            x: x,
            y: y
        });
         // 不再需要在这里调用 saveBattlefieldStateToServer
        // debounce(saveBattlefieldStateToServer, 1000)();
    }
}

// 更新战场缩放
function updateBattlefieldScale(scale, emitEvent = true) {
    scale = Math.max(0.5, Math.min(3.0, scale));
    if (battlefieldScale === scale) return; // 如果没有变化则不执行

    battlefieldScale = scale;
    battlefieldGrid.style.transform = `scale(${scale})`;

    // 更新本地战场状态
    battlefieldState.scale = scale;

    // 发送事件到服务器
    if (emitEvent && window.socket && window.socket.connected) {
         console.log(`Emitting update-scale: ${scale}`);
        window.socket.emit('update-scale', {
            sessionId: window.sessionId,
            scale: scale
        });
         // 不再需要在这里调用 saveBattlefieldStateToServer
        // debounce(saveBattlefieldStateToServer, 1000)();
    }
}

// 更新方格显示/隐藏
function updateGridVisibility(isVisible, emitEvent = true) {
    if (isGridVisible === isVisible) return; // 如果没有变化则不执行

    isGridVisible = isVisible;
    
    // 应用方格显示/隐藏
    if (isVisible) {
        battlefieldGrid.classList.remove('hide-grid');
    } else {
        battlefieldGrid.classList.add('hide-grid');
    }
    
    // 更新战场状态
    battlefieldState.isGridVisible = isVisible;
    
    // 发送事件到服务器
    if (emitEvent && window.socket && window.socket.connected) {
         console.log(`Emitting update-grid-visibility: ${isVisible}`);
        window.socket.emit('update-grid-visibility', {
            sessionId: window.sessionId,
            isVisible: isVisible
        });
         // 不再需要在这里调用 saveBattlefieldStateToServer
        // debounce(saveBattlefieldStateToServer, 1000)();
    }
}

// 更新棋子大小
function updatePieceSize(size, emitEvent = true) {
    size = Math.max(20, Math.min(80, size));
     if (pieceSize === size) return; // 如果没有变化则不执行

    pieceSize = size;
    
    // 更新显示的大小值
    const pieceSizeValue = document.getElementById('piece-size-value');
    if (pieceSizeValue) {
        pieceSizeValue.textContent = `${size}px`;
    }
    
    // 应用棋子大小
    Object.values(battlefieldPieces).forEach(piece => {
        piece.element.style.width = `${size}px`;
        piece.element.style.height = `${size}px`;
    });
    
    // 更新战场状态
    battlefieldState.pieceSize = size;
    
    // 发送事件到服务器
    if (emitEvent && window.socket && window.socket.connected) {
         console.log(`Emitting update-piece-size: ${size}`);
        window.socket.emit('update-piece-size', {
            sessionId: window.sessionId,
            size: size
        });
         // 不再需要在这里调用 saveBattlefieldStateToServer
        // debounce(saveBattlefieldStateToServer, 1000)();
    }
}

// 处理背景图片上传
function handleBackgroundUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 检查文件大小
    if (file.size > 5 * 1024 * 1024) { // 如果大于5MB
        compressImage(file, (compressedImageUrl) => {
            updateBackgroundImage(compressedImageUrl, true);
        });
    } else {
        const reader = new FileReader();
        reader.onload = function(e) {
            updateBackgroundImage(e.target.result, true);
        };
        reader.readAsDataURL(file);
    }
}

// 压缩图片
function compressImage(file, callback) {
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            // 计算新的尺寸，保持宽高比
            let maxWidth = 1920;
            let maxHeight = 1080;
            let width = img.width;
            let height = img.height;
            
            if (width > maxWidth || height > maxHeight) {
                if (width / height > maxWidth / maxHeight) {
                    height = height * (maxWidth / width);
                    width = maxWidth;
                } else {
                    width = width * (maxHeight / height);
                    height = maxHeight;
                }
            }
            
            // 创建canvas并绘制压缩后的图片
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            
            // 转换为dataURL，使用较低的质量
            const compressedImageUrl = canvas.toDataURL('image/jpeg', 0.7);
            
            console.log(`原始图片大小: ${Math.round(e.target.result.length / 1024)}KB, 压缩后: ${Math.round(compressedImageUrl.length / 1024)}KB`);
            
            callback(compressedImageUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

// 更新背景图片
function updateBackgroundImage(imageUrl, emitEvent = true) {
    // 检查图片大小
    if (imageUrl && imageUrl.length > 5 * 1024 * 1024) { // 如果大于5MB
        alert('图片太大，请选择小于5MB的图片');
        return;
    }

    // 压缩图片
    const img = new Image();
    img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // 计算压缩后的尺寸
        let width = img.width;
        let height = img.height;
        const maxDimension = 1920; // 最大尺寸限制
        
        if (width > maxDimension || height > maxDimension) {
            if (width > height) {
                height = Math.round((height * maxDimension) / width);
                width = maxDimension;
            } else {
                width = Math.round((width * maxDimension) / height);
                height = maxDimension;
            }
        }
        
        canvas.width = width;
        canvas.height = height;
        
        // 绘制压缩后的图片
        ctx.drawImage(img, 0, 0, width, height);
        
        // 转换为base64，使用较低的质量
        const compressedImageUrl = canvas.toDataURL('image/jpeg', 0.7);
        
        // 检查是否真的需要更新 (避免重复发送相同背景)
        if (backgroundImage === compressedImageUrl) {
             console.log("Background image is the same, skipping update.");
             return;
        }

        backgroundImage = compressedImageUrl;
        battlefieldGrid.style.backgroundImage = `url(${compressedImageUrl})`;
        
        // 更新战场状态
        battlefieldState.backgroundImage = compressedImageUrl;
        
        // 发送事件到服务器
        if (emitEvent && window.socket && window.socket.connected) {
            if (compressedImageUrl.length > 1024 * 1024) {
                console.log(`Compressed image large (${Math.round(compressedImageUrl.length / 1024)}KB), sending in chunks`);
                sendLargeImageInChunks(compressedImageUrl, window.sessionId);
            } else {
                 console.log(`Emitting update-background`);
                window.socket.emit('update-background', {
                    sessionId: window.sessionId,
                    imageUrl: compressedImageUrl
                });
            }
             // 不再需要在这里调用 saveBattlefieldStateToServer
            // debounce(saveBattlefieldStateToServer, 1000)();
        }
    };
    // 错误处理：如果图片加载失败
    img.onerror = function() {
        console.error("Error loading image for background update.");
        alert("无法加载背景图片，请检查图片文件或URL。");
    };
    img.src = imageUrl; // 确保在设置 onload 和 onerror 之后设置 src
}

// 分块发送大型图片
function sendLargeImageInChunks(imageUrl, sessionId, chunkSize = 512 * 1024) {
    const totalChunks = Math.ceil(imageUrl.length / chunkSize);
    const imageId = Date.now().toString(); // 生成唯一ID
    
    console.log(`开始分块发送图片，总共 ${totalChunks} 块`);
    
    // 发送开始传输消息
    window.socket.emit('background-transfer-start', {
        sessionId: sessionId,
        imageId: imageId,
        totalChunks: totalChunks
    });
    
    // 分块发送
    for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, imageUrl.length);
        const chunk = imageUrl.substring(start, end);
        
        // 使用setTimeout避免一次性发送所有块
        setTimeout(() => {
            window.socket.emit('background-transfer-chunk', {
                sessionId: sessionId,
                imageId: imageId,
                chunkIndex: i,
                chunk: chunk,
                isLastChunk: i === totalChunks - 1
            });
            console.log(`已发送图片块 ${i + 1}/${totalChunks}`);
        }, i * 100); // 每100毫秒发送一块
    }
}

// 处理鼠标按下事件
function handleMouseDown(event) {
    const target = event.target.closest('.battlefield-piece');
    if (!target) return;
    
    isDragging = true;
    draggedPiece = target;
    
    // 记录起始位置 - 修复拖动位置不准确的问题
    const rect = battlefieldGrid.getBoundingClientRect();
    const pieceRect = draggedPiece.getBoundingClientRect();
    
    // 计算鼠标在棋子上的相对位置，考虑缩放因素
    dragStartX = (event.clientX - pieceRect.left) / battlefieldScale;
    dragStartY = (event.clientY - pieceRect.top) / battlefieldScale;
    
    // 添加拖动样式
    draggedPiece.classList.add('dragging');
    
    event.preventDefault();
}

// 处理鼠标移动事件
function handleMouseMove(event) {
    if (!isDragging || !draggedPiece) return;
    
    // 计算新位置 - 修复拖动位置不准确的问题
    const rect = battlefieldGrid.getBoundingClientRect();
    
    // 计算鼠标相对于战场容器的位置，考虑缩放因素
    const x = (event.clientX - rect.left) / battlefieldScale - dragStartX;
    const y = (event.clientY - rect.top) / battlefieldScale - dragStartY;
    
    // 更新位置
    const pieceId = draggedPiece.dataset.id;
    updatePiecePosition(pieceId, x, y, false); // 拖动过程中不发送事件
    
    event.preventDefault();
}

// 处理鼠标释放事件
function handleMouseUp(event) {
    if (!isDragging || !draggedPiece) return;
    
    // 移除拖动样式
    draggedPiece.classList.remove('dragging');
    
    // 发送最终位置
    const pieceId = draggedPiece.dataset.id;
    const piece = battlefieldPieces[pieceId];
    if (piece) {
        updatePiecePosition(pieceId, piece.x, piece.y, true);
    }
    
    // 重置状态
    isDragging = false;
    draggedPiece = null;
}

// 处理鼠标滚轮事件
function handleMouseWheel(event) {
    event.preventDefault();
    
    // 根据滚轮方向调整缩放
    const delta = event.deltaY > 0 ? -0.1 : 0.1;
    updateBattlefieldScale(battlefieldScale + delta, true);
}

// 处理触摸开始事件
function handleTouchStart(event) {
    if (event.touches.length === 1) {
        // 单指触摸 - 准备移动棋子
        const touch = event.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const pieceElement = target.closest('.battlefield-piece');
        
        if (pieceElement) {
            isDragging = true;
            draggedPiece = pieceElement;
            
            // 修复触摸拖动位置不准确的问题
            const rect = battlefieldGrid.getBoundingClientRect();
            const pieceRect = pieceElement.getBoundingClientRect();
            
            // 计算触摸点在棋子上的相对位置，考虑缩放因素
            dragStartX = (touch.clientX - pieceRect.left) / battlefieldScale;
            dragStartY = (touch.clientY - pieceRect.top) / battlefieldScale;
            
            draggedPiece.classList.add('dragging');
        }
        
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
    } else if (event.touches.length === 2) {
        // 双指触摸 - 准备缩放
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
    }
    
    event.preventDefault();
}

// 处理触摸移动事件
function handleTouchMove(event) {
    event.preventDefault();
    
    if (event.touches.length === 1 && isDragging && draggedPiece) {
        // 单指移动 - 移动棋子
        const touch = event.touches[0];
        
        // 修复触摸拖动位置不准确的问题
        const rect = battlefieldGrid.getBoundingClientRect();
        
        // 计算触摸点相对于战场容器的位置，考虑缩放因素
        const x = (touch.clientX - rect.left) / battlefieldScale - dragStartX;
        const y = (touch.clientY - rect.top) / battlefieldScale - dragStartY;
        
        const pieceId = draggedPiece.dataset.id;
        updatePiecePosition(pieceId, x, y, false);
    } else if (event.touches.length === 2) {
        // 双指移动 - 缩放
        const dx = event.touches[0].clientX - event.touches[1].clientX;
        const dy = event.touches[0].clientY - event.touches[1].clientY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        const scaleFactor = distance / lastTouchDistance;
        if (scaleFactor && !isNaN(scaleFactor)) {
            updateBattlefieldScale(battlefieldScale * scaleFactor, false);
            lastTouchDistance = distance;
        }
    }
}

// 处理触摸结束事件
function handleTouchEnd(event) {
    if (isDragging && draggedPiece) {
        // 结束棋子移动
        draggedPiece.classList.remove('dragging');
        
        const pieceId = draggedPiece.dataset.id;
        const piece = battlefieldPieces[pieceId];
        if (piece) {
            updatePiecePosition(pieceId, piece.x, piece.y, true);
        }
        
        isDragging = false;
        draggedPiece = null;
    }
    
    lastTouchDistance = 0;
}

// 更新棋子血量
function updatePieceHp(pieceId, currentHp, maxHp) {
    const piece = battlefieldPieces[pieceId];
    if (piece) {
        piece.currentHp = currentHp;
        piece.maxHp = maxHp;
        const pieceEl = document.querySelector(`.battlefield-piece[data-id="${pieceId}"]`);
        if (pieceEl) {
            pieceEl.querySelector('.piece-hp').textContent = `${currentHp}/${maxHp}`;
        }
    }
}

// 更新棋子名称
function updatePieceName(pieceId, name) {
    const piece = battlefieldPieces[pieceId];
    if (piece) {
        piece.name = name;
        const pieceEl = document.querySelector(`.battlefield-piece[data-id="${pieceId}"]`);
        if (pieceEl) {
            pieceEl.querySelector('.piece-name').textContent = name;
        }
    }
}

// 应用战场状态
function applyBattlefieldState() {
    if (Object.keys(battlefieldState).length === 0) return;
    
    // 应用背景图片
    if (battlefieldState.backgroundImage) {
        updateBackgroundImage(battlefieldState.backgroundImage, false);
    }
    
    // 应用方格显示/隐藏状态
    if (battlefieldState.isGridVisible !== undefined) {
        updateGridVisibility(battlefieldState.isGridVisible, false);
        const toggleGridBtn = document.getElementById('toggle-grid');
        if (toggleGridBtn) {
            toggleGridBtn.textContent = battlefieldState.isGridVisible ? '隐藏方格' : '显示方格';
            toggleGridBtn.classList.toggle('active', !battlefieldState.isGridVisible);
        }
    }
    
    // 应用棋子大小
    if (battlefieldState.pieceSize) {
        updatePieceSize(battlefieldState.pieceSize, false);
    }
    
    // 应用棋子位置
    if (battlefieldState.pieces) {
        Object.keys(battlefieldState.pieces).forEach(pieceId => {
            const pieceData = battlefieldState.pieces[pieceId];
            if (battlefieldPieces[pieceId] && pieceData.x !== undefined && pieceData.y !== undefined) {
                updatePiecePosition(pieceId, pieceData.x, pieceData.y, false);
            }
        });
    }
}

// 从服务器加载战场状态
function loadBattlefieldStateFromServer() {
    if (!window.socket || !window.sessionId) return;

    // 请求最新的战场状态 (保持不变)
    console.log("Requesting latest battlefield state via WebSocket...");
    window.socket.emit('request-latest-battlefield-state', { // 使用新的事件名
        sessionId: window.sessionId
    });
}

// 加载战场状态
function loadBattlefieldState(state) {
    if (!state || Object.keys(state).length === 0) {
         console.log("Received empty or invalid battlefield state.");
         return;
    }
    console.log("Applying received battlefield state:", state);
    battlefieldState = state; // 更新本地存储的状态副本

    // 应用背景图片
    if (state.backgroundImage && state.backgroundImage !== backgroundImage) { // 只有不同时才更新
        updateBackgroundImage(state.backgroundImage, false); // false: 不再发回给服务器
    }

    // 应用方格显示/隐藏状态
    if (state.isGridVisible !== undefined && state.isGridVisible !== isGridVisible) {
        updateGridVisibility(state.isGridVisible, false); // false: 不再发回给服务器
        const toggleGridBtn = document.getElementById('toggle-grid');
        if (toggleGridBtn) {
            toggleGridBtn.textContent = state.isGridVisible ? '隐藏方格' : '显示方格';
            toggleGridBtn.classList.toggle('active', !state.isGridVisible);
        }
    }

     // 应用缩放状态
     if (state.scale !== undefined && state.scale !== battlefieldScale) {
        updateBattlefieldScale(state.scale, false); // false: 不再发回给服务器
     }

    // 应用棋子大小
    if (state.pieceSize && state.pieceSize !== pieceSize) {
        updatePieceSize(state.pieceSize, false); // false: 不再发回给服务器
    }

    // 应用棋子位置
    if (state.pieces) {
        Object.keys(state.pieces).forEach(pieceId => {
            const pieceData = state.pieces[pieceId];
            const localPiece = battlefieldPieces[pieceId];
            if (localPiece && pieceData.x !== undefined && pieceData.y !== undefined) {
                 // 检查位置是否有显著变化，避免微小差异导致的重绘
                 if (Math.abs(localPiece.x - pieceData.x) > 0.1 || Math.abs(localPiece.y - pieceData.y) > 0.1) {
                    updatePiecePosition(pieceId, pieceData.x, pieceData.y, false); // false: 不再发回给服务器
                 }
            } else if (!localPiece && pieceData.name) {
                 // 如果本地没有这个棋子，但服务器状态里有，可能需要重新创建或刷新
                 console.warn(`State includes piece ${pieceId} (${pieceData.name}) not found locally. Consider refreshing.`);
                 // refreshBattlefield(); // 或者更智能地添加单个棋子
            }
        });
         // 检查本地有但服务器状态没有的棋子 (可能已被删除)
         Object.keys(battlefieldPieces).forEach(localPieceId => {
             if (!state.pieces || !state.pieces[localPieceId]) {
                 console.warn(`Local piece ${localPieceId} not in received state. Removing from battlefield.`);
                 const pieceElement = document.querySelector(`.battlefield-piece[data-id="${localPieceId}"]`);
                 if (pieceElement) pieceElement.remove();
                 delete battlefieldPieces[localPieceId];
             }
         });
    } else {
         // 如果服务器状态没有 pieces，清空本地棋子？取决于业务逻辑
         console.warn("Received battlefield state has no pieces information.");
         // Object.keys(battlefieldPieces).forEach(localPieceId => { ... }); // 清空本地
    }
}

// 防抖函数，避免频繁调用
function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this;
        const args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            func.apply(context, args);
        }, wait);
    };
}

// 保存战场状态到服务器
function saveBattlefieldStateToServer() {
    if (!window.socket || !window.sessionId) return;
    
    console.log("保存战场状态到服务器...");
    window.socket.emit('update-battlefield-state', {
        sessionId: window.sessionId,
        state: battlefieldState
    });
}

// 导出函数
window.openBattlefield = openBattlefield;
window.initBattlefield = initBattlefield;
window.updatePieceHp = updatePieceHp;
window.updatePieceName = updatePieceName; 
