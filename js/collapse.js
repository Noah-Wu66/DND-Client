// 处理折叠功能
document.addEventListener('DOMContentLoaded', function() {
    // 物品查询的折叠功能
    const itemsCollapseBtn = document.getElementById('collapse-filters-btn');
    const itemsFiltersContainer = document.getElementById('filters-container');
    
    if (itemsCollapseBtn && itemsFiltersContainer) {
        itemsCollapseBtn.addEventListener('click', function() {
            itemsCollapseBtn.classList.toggle('collapsed');
            itemsFiltersContainer.classList.toggle('collapsed');
            
            // 调整详情内容的高度
            const resultsContainer = document.getElementById('item-results');
            if (itemsFiltersContainer.classList.contains('collapsed')) {
                resultsContainer.style.maxHeight = '80vh';
            } else {
                resultsContainer.style.maxHeight = ''; // 重置为默认值
            }
        });
    }
    
    // 为法术查询添加折叠功能 - 使用MutationObserver监听DOM变化
    const spellsBtn = document.getElementById('spells-btn');
    if (spellsBtn) {
        // 创建一个MutationObserver实例来监听body的子元素变化
        const observer = new MutationObserver(function(mutations) {
            for (let mutation of mutations) {
                if (mutation.addedNodes.length) {
                    // 检查是否添加了法术模态框
                    for (let node of mutation.addedNodes) {
                        if (node.nodeType === 1) { // 元素节点
                            const spellsModal = node.querySelector('.spells-modal');
                            if (spellsModal) {
                                // 找到法术模态框中的筛选区域
                                const filtersContainer = spellsModal.querySelector('.filters');
                                if (filtersContainer && !spellsModal.querySelector('.collapse-button')) {
                                    console.log('找到法术查询对话框，添加折叠按钮');
                                    
                                    // 创建折叠按钮
                                    const collapseBtn = document.createElement('button');
                                    collapseBtn.className = 'collapse-button';
                                    collapseBtn.innerHTML = '筛选与查找 <span class="arrow">▼</span>';
                                    
                                    // 将筛选器包装在可折叠容器内
                                    const collapsibleDiv = document.createElement('div');
                                    collapsibleDiv.className = 'collapsible';
                                    
                                    // 重组DOM
                                    const parent = filtersContainer.parentNode;
                                    parent.insertBefore(collapseBtn, filtersContainer);
                                    
                                    // 移除筛选器
                                    parent.removeChild(filtersContainer);
                                    
                                    // 添加到可折叠容器
                                    collapsibleDiv.appendChild(filtersContainer);
                                    parent.insertBefore(collapsibleDiv, collapseBtn.nextSibling);
                                    
                                    // 添加折叠功能
                                    collapseBtn.addEventListener('click', function() {
                                        collapseBtn.classList.toggle('collapsed');
                                        collapsibleDiv.classList.toggle('collapsed');
                                        
                                        // 调整详情内容的高度
                                        const resultsContainer = spellsModal.querySelector('.results');
                                        if (collapsibleDiv.classList.contains('collapsed')) {
                                            resultsContainer.style.maxHeight = '80vh';
                                        } else {
                                            resultsContainer.style.maxHeight = ''; // 重置为默认值
                                        }
                                    });
                                }
                            }
                        }
                    }
                }
            }
        });
        
        // 配置观察选项
        const config = { childList: true, subtree: true };
        
        // 开始观察body元素的变化
        observer.observe(document.body, config);
    }
}); 