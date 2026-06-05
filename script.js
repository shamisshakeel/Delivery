// Initial Menu Setup
const defaultStructuredItems = [
    { name: "Chicken Biryani", category: "Rice", weight: 0 },
    { name: "Beef Biryani", category: "Rice", weight: 0 },
    { name: "Beef Pulao", category: "Rice", weight: 0 },
    { name: "Sada Biryani", category: "Rice", weight: 0 },
    { name: "Chicken Qorma", category: "Curry", weight: 0 },
    { name: "Beef karahi", category: "Curry", weight: 0 },
    { name: "Naan", category: "Bread", weight: 0 },
    { name: "Chapati", category: "Bread", weight: 0 }
];

// Load Local Storage Data
let customItems = JSON.parse(localStorage.getItem('categorizedMenu')) || defaultStructuredItems;
let currentActiveCategory = "All";

let currentCart = {};
let currentDayLog = JSON.parse(localStorage.getItem('currentDayLog')) || [];
let currentRefundLog = JSON.parse(localStorage.getItem('currentRefundLog')) || [];
let allTimeHistory = JSON.parse(localStorage.getItem('allTimeHistory')) || [];
let knownCustomers = JSON.parse(localStorage.getItem('knownCustomers')) || [];
let shiftStartTime = localStorage.getItem('shiftStartTime') || null;

// Token Tracker
let nextGlobalTokenId = parseInt(localStorage.getItem('nextGlobalTokenId')) || 1001;

// Modals State Trackers
let activeVoidTargetIndex = null;
let activeCallback = null;
let requiredPinType = 'refund'; 
let activeCustomerSearchQuery = "";

// Date Formatting
function getFormattedSystemDate(dateObj = new Date()) {
    const day = dateObj.getDate();
    const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    return `${day} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
}

function normalizeToSystemDate(rawDateString) {
    if (!rawDateString) return getFormattedSystemDate();
    let workingString = rawDateString.split('(')[0].trim();
    let parsedDate = new Date(workingString);
    return isNaN(parsedDate.getTime()) ? rawDateString : getFormattedSystemDate(parsedDate);
}

// Navigation Tabs
function switchView(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    const targetedTabBtn = document.getElementById('btn-' + tabId);
    if(targetedTabBtn) targetedTabBtn.classList.add('active');
    if (tabId === 'history-tab' || tabId === 'logs-tab') renderLogs();
}

// Security PIN Modal
function openPinModal(title, type, successCallback) {
    document.getElementById('modal-title-text').innerText = title;
    document.getElementById('modal-pin-input').value = '';
    requiredPinType = type;
    activeCallback = successCallback;
    document.getElementById('secure-pin-modal').style.display = 'flex';
    document.getElementById('modal-pin-input').focus();
}

function closePinModal() {
    document.getElementById('secure-pin-modal').style.display = 'none';
    activeCallback = null;
}

function submitPinModal() {
    let enteredPin = document.getElementById('modal-pin-input').value.trim();
    let targetPin = (requiredPinType === 'refund') ? '1414' : '787898';
    if (enteredPin === targetPin) {
        document.getElementById('secure-pin-modal').style.display = 'none';
        if (activeCallback) activeCallback();
        activeCallback = null;
    } else {
        alert("Incorrect PIN.");
        document.getElementById('modal-pin-input').value = '';
    }
}

function attemptOpenCustomers() {
    openPinModal("Enter Admin PIN", "admin", function() {
        switchView('customers-tab');
        renderCustomerManagement();
        populateMergeDropdowns();
    });
}

// POS Void System
function openPosVoidModal() {
    document.getElementById('void-token-number-input').value = '';
    document.getElementById('pos-void-input-modal').style.display = 'flex';
    document.getElementById('void-token-number-input').focus();
}

function closePosVoidModal() {
    document.getElementById('pos-void-input-modal').style.display = 'none';
}

function submitPosVoidLookup() {
    let lookupId = parseInt(document.getElementById('void-token-number-input').value.trim());
    if (isNaN(lookupId)) {
        alert("Please enter a valid token number.");
        return;
    }
    
    let logIdx = currentDayLog.findIndex(log => log.tokenId === lookupId);
    if (logIdx === -1) {
        alert(`Token #${lookupId} not found in today's active logs.`);
        return;
    }
    
    activeVoidTargetIndex = logIdx;
    let targetedRecord = currentDayLog[logIdx];
    
    closePosVoidModal();
    
    let container = document.getElementById('void-confirmation-details-box');
    container.innerHTML = `
        <div class="confirm-row"><span>Token Number:</span><strong class="pill-token">#${targetedRecord.tokenId}</strong></div>
        <div class="confirm-row"><span>Time:</span><strong>${targetedRecord.time}</strong></div>
        <div class="confirm-row"><span>Customer:</span><strong>${targetedRecord.customer}</strong></div>
        <div class="confirm-row"><span>Item:</span><strong style="color:var(--primary);">${targetedRecord.item}</strong></div>
        <div class="confirm-row"><span>Quantity:</span><strong style="font-size:16px; color:var(--danger);">x${targetedRecord.qty}</strong></div>
    `;
    
    document.getElementById('pos-void-confirm-modal').style.display = 'flex';
}

function closePosVoidConfirmModal() {
    document.getElementById('pos-void-confirm-modal').style.display = 'none';
    activeVoidTargetIndex = null;
}

function executeConfirmedPosVoid() {
    if (activeVoidTargetIndex === null) return;
    
    openPinModal("Enter Manager PIN to Void", "refund", function() {
        let now = new Date();
        let refundTime = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        let matchedTargetItem = currentDayLog[activeVoidTargetIndex];
        
        let voidRecordObject = {
            tokenId: matchedTargetItem.tokenId,
            time: refundTime,
            item: matchedTargetItem.item,
            qty: matchedTargetItem.qty,
            customer: matchedTargetItem.customer || "Walk-In"
        };
        
        currentRefundLog.push(voidRecordObject);
        localStorage.setItem('currentRefundLog', JSON.stringify(currentRefundLog));
        
        currentDayLog.splice(activeVoidTargetIndex, 1);
        localStorage.setItem('currentDayLog', JSON.stringify(currentDayLog));
        
        closePosVoidConfirmModal();
        updateLiveBreakdown();
        renderLogs();
        
        alert(`Success. Token #${voidRecordObject.tokenId} voided.`);
    });
}

// Token Printing
function printTokens() {
    if (Object.keys(currentCart).length === 0) return;
    openCustomerModal();
}

function executeTokenPrinting(customerName) {
    const printArea = document.getElementById('print-area');
    printArea.innerHTML = ''; 
    let now = new Date();
    let timeStr = now.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    let dateStr = getFormattedSystemDate(now);

    if (!shiftStartTime) {
        shiftStartTime = timeStr;
        localStorage.setItem('shiftStartTime', shiftStartTime);
    }

    for (let item in currentCart) {
        let qty = currentCart[item];
        let currentAssignedTokenId = nextGlobalTokenId++;
        
        currentDayLog.push({ 
            tokenId: currentAssignedTokenId, 
            time: timeStr, 
            item: item, 
            qty: qty, 
            customer: customerName 
        });
        
        let token = document.createElement('div');
        token.className = 'pos-token';
        token.innerHTML = `
            <div class="brand-main">AHMED HANIF RAJPUT</div>
            <div style="font-size: 16px; font-weight: 900; text-align: center; background: #000; color: #fff; padding: 4px 0; margin: 4px 0;">TOKEN NO: #${currentAssignedTokenId}</div>
            <div class="pos-divider"></div>
            <div class="item-container">
                <div class="pos-item">${item}</div>
                <div class="pos-qty">QTY: [ ${qty} ]</div>
            </div>
            <div class="pos-divider"></div>
            <div class="meta-line">DATE: ${dateStr} &nbsp;&nbsp;&nbsp;&nbsp; TIME: ${timeStr}</div>
            <div style="font-size:12px; font-weight:900; margin-top:4px; text-transform:uppercase;">NAME: ${customerName}</div>
        `;
        printArea.appendChild(token);
    }
    
    localStorage.setItem('currentDayLog', JSON.stringify(currentDayLog));
    localStorage.setItem('nextGlobalTokenId', nextGlobalTokenId.toString());
    
    setTimeout(() => { 
        window.print(); 
        currentCart = {}; 
        renderCart(); 
        updateLiveBreakdown(); 
    }, 50);
}

// POS Desktop Interface
function renderCategoryFilters() {
    const container = document.getElementById('category-filter-container');
    container.innerHTML = '';
    let categories = ["All", "Rice", "Curry", "Bread", "Others"];
    categories.forEach(cat => {
        let btn = document.createElement('button');
        btn.className = `category-filter-btn ${currentActiveCategory === cat ? 'active' : ''}`;
        btn.innerText = cat;
        btn.onclick = () => {
            currentActiveCategory = cat;
            renderCategoryFilters();
            renderMenu();
        };
        container.appendChild(btn);
    });
}

function getItemCategory(itemName) {
    let found = customItems.find(i => i.name.toLowerCase() === itemName.toLowerCase());
    return found ? found.category : "Others";
}

function getItemWeight(itemName) {
    let found = customItems.find(i => i.name.toLowerCase() === itemName.toLowerCase());
    return found && found.weight ? parseFloat(found.weight) : 0;
}

// Search Matching
function getLevenshteinDistance(a, b) {
    if (a.length === 0) return b.length; if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) { matrix[i] = [i]; }
    for (let j = 0; j <= a.length; j++) { matrix[0][j] = j; }
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
            else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
        }
    }
    return matrix[b.length][a.length];
}

function findClosestCustomerName(inputName) {
    let cleanInput = inputName.trim().toLowerCase();
    let bestMatch = null; let lowestDistance = Infinity;
    for (let known of knownCustomers) {
        let cleanKnown = known.toLowerCase();
        let distance = getLevenshteinDistance(cleanInput, cleanKnown);
        let threshold = cleanInput.length <= 4 ? 1 : 2; 
        if (distance <= threshold && distance < lowestDistance) { lowestDistance = distance; bestMatch = known; }
    }
    return bestMatch;
}

function renderMenu() {
    const grid = document.getElementById('items-grid');
    grid.innerHTML = '';
    customItems.forEach((itemObj) => {
        if (currentActiveCategory !== "All" && itemObj.category !== currentActiveCategory) return;
        let card = document.createElement('div');
        card.className = 'menu-card';
        card.innerText = itemObj.name;
        card.onclick = () => { addToCart(itemObj.name); };
        grid.appendChild(card);
    });
}

function renderCart() {
    const container = document.getElementById('cart-container');
    container.innerHTML = '';
    if (Object.keys(currentCart).length === 0) {
        container.innerHTML = '<p style="color:#94a3b8; text-align:center; padding-top:45px; margin:0; font-size: 13px;">Queue Array Buffer Empty</p>';
        return;
    }
    for (let item in currentCart) {
        let div = document.createElement('div');
        div.className = 'cart-row';
        div.innerHTML = `
            <span style="font-weight: 600;">${item}</span>
            <div class="qty-controls">
                <button class="qty-btn" onclick="changeQty('${item}', -1)">-</button>
                <span style="font-weight:700; width:24px; text-align:center;">${currentCart[item]}</span>
                <button class="qty-btn" onclick="changeQty('${item}', 1)">+</button>
            </div>
        `;
        container.appendChild(div);
    }
}

function addToCart(item) { currentCart[item] = (currentCart[item] || 0) + 1; renderCart(); }
function changeQty(item, amount) { 
    currentCart[item] += amount; 
    if (currentCart[item] <= 0) delete currentCart[item]; 
    renderCart();
}

function updateLiveBreakdown() {
    const container = document.getElementById('live-total-container');
    if (currentDayLog.length === 0 && currentRefundLog.length === 0) {
        container.innerHTML = '<p style="color:#94a3b8; text-align:center; margin:0; font-size:13px;">No items sold yet.</p>';
        return;
    }
    let grossCount = 0; let refundCount = 0; let itemTotals = {};

    currentDayLog.forEach(log => { grossCount += log.qty; itemTotals[log.item] = (itemTotals[log.item] || 0) + log.qty; });
    currentRefundLog.forEach(log => { refundCount += log.qty; });

    let rangeStr = shiftStartTime ? ` (Opened: ${shiftStartTime})` : '';
    let html = `
        <div style="font-size:13px; margin-bottom:12px; color:var(--text-muted);">
            <div style="font-size:11px; font-weight:700; color:var(--primary); margin-bottom:6px;">${rangeStr}</div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                <span>Total Items (Before Void):</span><span style="font-weight:600; color:var(--text-main);">${grossCount + refundCount} Units</span>
            </div>
            <div style="display:flex; justify-content:space-between; margin-bottom:4px; color:var(--danger);">
                <span>Voided Items:</span><span style="font-weight:600;">-${refundCount} Units</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-weight:800; border-top:1px solid var(--border); padding-top:6px; font-size:14px; color:var(--accent);">
                <span>Net Sold Items:</span><span>${grossCount} Units</span>
            </div>
        </div>
        <div style="font-weight:700; font-size:11px; text-transform:uppercase; color:var(--text-muted); margin-bottom:6px; border-bottom:1px solid var(--border); padding-bottom:4px;">Item Breakdown</div>
        <table style="width:100%; font-size:13px; color:var(--text-main); border-collapse:collapse;">
    `;

    let categoryOrder = ["Rice", "Curry", "Bread", "Others"];
    categoryOrder.forEach(cat => {
        let catHeaderAdded = false;
        for (let item in itemTotals) {
            if (getItemCategory(item) === cat) {
                if (!catHeaderAdded) {
                    html += `<tr><td colspan="2" style="font-size:11px; font-weight:800; color:var(--primary); padding:6px 0 2px 0; text-transform:uppercase;">${cat}</td></tr>`;
                    catHeaderAdded = true;
                }
                let calcWeightKg = ((itemTotals[item] * getItemWeight(item)) / 1000).toFixed(2);
                html += `<tr>
                    <td style="padding:2px 0 2px 8px; font-weight:500;">${item}</td>
                    <td style="text-align:right; font-weight:700; color:var(--text-main);">x${itemTotals[item]} <span style="font-size:11px; color:var(--text-muted); font-weight:normal;">(${calcWeightKg} KG)</span></td>
                </tr>`;
            }
        }
    });
    html += `</table>`;
    container.innerHTML = html;
}

// LOGS SYSTEM
function renderLogs() {
    const logBody = document.getElementById('live-log');
    logBody.innerHTML = '';
    if(currentDayLog.length === 0){ 
        logBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:20px; font-size:13px;">No items.</td></tr>`; 
    }
    
    for(let i = currentDayLog.length - 1; i >= 0; i--) {
        let log = currentDayLog[i];
        let row = `<tr>
            <td><span class="pill-token">#${log.tokenId || 'N/A'}</span></td>
            <td style="color:var(--text-muted); font-weight:500;">${log.time}</td>
            <td style="font-weight:700; color:var(--primary);">${log.customer || 'Walk-In'}</td>
            <td style="font-weight:600; color:var(--text-main);">${log.item}</td>
            <td style="font-weight:700;">x${log.qty}</td>
        </tr>`;
        logBody.insertAdjacentHTML('beforeend', row);
    }

    const refundBody = document.getElementById('refund-log');
    refundBody.innerHTML = '';
    if(currentRefundLog.length === 0) { 
        refundBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding:20px; font-size:13px;">No voided items.</td></tr>`; 
    }
    
    for(let j = currentRefundLog.length - 1; j >= 0; j--) {
        let rLog = currentRefundLog[j];
        let row = `<tr>
            <td><span class="pill-void">#${rLog.tokenId || 'N/A'}</span></td>
            <td style="color:var(--danger); font-weight:500;">${rLog.time}</td>
            <td style="font-weight:700; color:var(--text-muted); text-decoration:line-through;">${rLog.customer || 'Walk-In'}</td>
            <td style="font-weight:600; color:var(--text-muted); text-decoration: line-through;">${rLog.item}</td>
            <td style="font-weight:700; color:var(--danger);">x${rLog.qty}</td>
        </tr>`;
        refundBody.insertAdjacentHTML('beforeend', row);
    }

    updateLiveBreakdown();
    renderVaultLedgerCards();
}

function renderVaultLedgerCards() {
    const histContainer = document.getElementById('history-container');
    histContainer.innerHTML = '';
    if(allTimeHistory.length === 0) { 
        histContainer.innerHTML = '<p style="color:#94a3b8; text-align:center; font-size:14px; padding-top:20px; width:100%;">History is empty.</p>'; 
    }
    
    allTimeHistory.forEach((day, index) => {
        let normalizedDateLabel = normalizeToSystemDate(day.date);
        let rangeSuffix = (day.startTime && day.endTime) ? ` (${day.startTime} to ${day.endTime})` : '';

        let html = `<div class="history-card" style="background:#fff; border:1px solid var(--border); padding:16px; border-radius:var(--radius); box-shadow:var(--shadow); position:relative; margin-bottom:16px;">
            <button style="position:absolute; top:12px; right:12px; background:none; border:none; color:var(--danger); font-size:18px; font-weight:900; cursor:pointer;" onclick="deleteHistoryItem(${index})">×</button>
            <div class="history-header" style="margin-bottom:8px;">
                <span style="font-size:14px; font-weight:700;">Date: <strong>${normalizedDateLabel}</strong></span><br>
                <span style="color:var(--primary); font-size:11px;">Timeline: <strong>${rangeSuffix || 'N/A'}</strong></span>
            </div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; font-size:11px; color:var(--text-muted);">
                <span>Gross: ${day.grossItems || day.totalItems} | Voided: ${day.refundedItems || 0}</span>
                <span style="color:var(--accent); font-weight:bold;">Net: ${day.totalItems}</span>
            </div>
            <table style="width:100%; font-size:13px; color:#475569;">`;
        
        let categoryOrder = ["Rice", "Curry", "Bread", "Others"];
        categoryOrder.forEach(cat => {
            let catHeaderAdded = false;
            for(let itm in day.summary) {
                if(getItemCategory(itm) === cat) {
                    if(!catHeaderAdded) {
                        html += `<tr><td colspan="2" style="font-size:11px; font-weight:700; color:var(--primary); padding-top:6px; text-transform:uppercase;">${cat}</td></tr>`;
                        catHeaderAdded = true;
                    }
                    let histItemWeight = ((day.summary[itm] * getItemWeight(itm)) / 1000).toFixed(2);
                    html += `<tr><td style="padding:2px 0 2px 6px;">${itm}</td><td style="text-align:right; font-weight:600; color:var(--text-main);">x${day.summary[itm]} <span style="font-size:11px; font-weight:normal; color:var(--text-muted);">(${histItemWeight} KG)</span></td></tr>`;
                }
            }
        });
        html += `</table>`;
        histContainer.insertAdjacentHTML('afterbegin', html);
    });
}

// User Configuration Panels
function populateCustomerDatalist() {
    const dataList = document.getElementById('customer-memory-list');
    if(!dataList) return; dataList.innerHTML = '';
    knownCustomers.sort().forEach(name => {
        let option = document.createElement('option'); option.value = name; dataList.appendChild(option);
    });
}

function populateMergeDropdowns() {
    let srcSelect = document.getElementById('merge-source-select');
    let tgtSelect = document.getElementById('merge-target-select');
    if(!srcSelect || !tgtSelect) return;
    srcSelect.innerHTML = '<option value="">-- Merge From --</option>';
    tgtSelect.innerHTML = '<option value="">-- Merge To --</option>';
    let sortedCustomers = [...knownCustomers].sort();
    sortedCustomers.forEach(cust => {
        srcSelect.innerHTML += `<option value="${cust}">${cust}</option>`;
        tgtSelect.innerHTML += `<option value="${cust}">${cust}</option>`;
    });
}

function renderCustomerManagement() {
    const listDiv = document.getElementById('customer-management-list');
    if(!listDiv) return; listDiv.innerHTML = '';
    let filteredCustomers = knownCustomers.filter(cust => cust.toLowerCase().includes(activeCustomerSearchQuery));
    if (filteredCustomers.length === 0) {
        listDiv.innerHTML = '<p style="color:var(--text-muted); padding: 12px 0;">No matching names found.</p>'; return;
    }
    let table = `<table class="styled-table"><thead><tr><th>Customer Name</th><th style="text-align:right; width:90px;">Action</th></tr></thead><tbody>`;
    filteredCustomers.forEach((cust) => {
        let actualIndex = knownCustomers.indexOf(cust);
        table += `<tr><td style="font-weight:600;">${cust}</td><td style="text-align:right;"><button class="btn-danger-outline" style="padding:4px 8px; font-size:11px;" onclick="deleteCustomer(${actualIndex})">Delete</button></td></tr>`;
    });
    table += `</tbody></table>`; listDiv.innerHTML = table;
}

function executeCustomerMerge() {
    let source = document.getElementById('merge-source-select').value;
    let target = document.getElementById('merge-target-select').value;
    if(!source || !target || source === target) return alert("Select distinct source/target profiles.");
    if(!confirm(`Merge "${source}" into "${target}"?`)) return;
    currentDayLog.forEach(log => { if(log.customer === source) log.customer = target; });
    currentRefundLog.forEach(log => { if(log.customer === source) log.customer = target; });
    let srcIdx = knownCustomers.indexOf(source); if(srcIdx > -1) knownCustomers.splice(srcIdx, 1);
    localStorage.setItem('currentDayLog', JSON.stringify(currentDayLog));
    localStorage.setItem('currentRefundLog', JSON.stringify(currentRefundLog));
    localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
    populateCustomerDatalist(); populateMergeDropdowns(); renderCustomerManagement(); renderLogs();
}

function addCustomerManually() {
    let input = document.getElementById('new-manual-customer');
    let name = input.value.trim().replace(/\b\w/g, char => char.toUpperCase());
    if (!name) return;
    if (!knownCustomers.includes(name)) {
        knownCustomers.push(name); localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
        populateCustomerDatalist(); populateMergeDropdowns(); renderCustomerManagement(); input.value = '';
    }
}

function deleteCustomer(index) {
    if (confirm(`Delete this customer?`)) {
        knownCustomers.splice(index, 1); localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
        populateCustomerDatalist(); populateMergeDropdowns(); renderCustomerManagement();
    }
}

function handleCustomerSearchFilter() {
    activeCustomerSearchQuery = document.getElementById('customer-search-input').value.trim().toLowerCase();
    renderCustomerManagement();
}

function openCustomerModal() {
    document.getElementById('cust-modal-name-input').value = '';
    document.getElementById('customer-name-modal').style.display = 'flex';
    document.getElementById('cust-modal-name-input').focus();
}
function closeCustomerModal() { document.getElementById('customer-name-modal').style.display = 'none'; }

function submitCustomerModal() {
    let rawName = document.getElementById('cust-modal-name-input').value.trim();
    if (rawName === "") return alert("Please enter a name.");
    let finalName = ""; let matchedName = findClosestCustomerName(rawName);
    if (matchedName) finalName = matchedName;
    else {
        finalName = rawName.replace(/\b\w/g, char => char.toUpperCase());
        knownCustomers.push(finalName); localStorage.setItem('knownCustomers', JSON.stringify(knownCustomers));
        populateCustomerDatalist();
    }
    closeCustomerModal(); executeTokenPrinting(finalName);
}

function deleteHistoryItem(index) {
    if (!confirm("Permanently delete this history record?")) return;
    openPinModal("Enter Admin PIN", "admin", function() {
        allTimeHistory.splice(index, 1); localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));
        renderLogs();
    });
}

function clearAllHistory() {
    if (!confirm("Clear ALL history? This cannot be undone.")) return;
    openPinModal("Enter Admin PIN", "admin", function() {
        allTimeHistory = []; localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));
        renderLogs();
    });
}

function attemptStartNewDay() {
    openPinModal("Enter Admin PIN", "admin", function() {
        currentDayLog = []; currentRefundLog = []; shiftStartTime = null;
        localStorage.removeItem('currentDayLog'); localStorage.removeItem('currentRefundLog'); localStorage.removeItem('shiftStartTime');
        currentCart = {}; renderCart(); renderLogs(); switchView('pos-tab');
        alert("New Shift Started.");
    });
}

function endDay() {
    if (currentDayLog.length === 0 && currentRefundLog.length === 0) return alert("Nothing to save.");
    if (!confirm("End current shift and save to vault?")) return;
    openPinModal("Enter Admin PIN", "admin", function() {
        let netItems = 0; let grossItemsCount = 0; let summary = {};
        currentDayLog.forEach(log => { 
            netItems += log.qty; grossItemsCount += log.qty;
            summary[log.item] = (summary[log.item] || 0) + log.qty; 
        });
        let shiftClosingTime = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        let shiftOpeningTime = shiftStartTime || shiftClosingTime;
        
        allTimeHistory.push({ 
            date: getFormattedSystemDate(), startTime: shiftOpeningTime, endTime: shiftClosingTime,
            totalItems: netItems, grossItems: grossItemsCount, refundedItems: currentRefundLog.length, summary: summary
        });
        localStorage.setItem('allTimeHistory', JSON.stringify(allTimeHistory));
        
        currentDayLog = []; currentRefundLog = []; shiftStartTime = null;
        localStorage.removeItem('currentDayLog'); localStorage.removeItem('currentRefundLog'); localStorage.removeItem('shiftStartTime');
        renderLogs(); switchView('history-tab');
    });
}

// Global Event Listeners
document.getElementById('modal-pin-input').addEventListener('keypress', function(e) { if (e.key === 'Enter') submitPinModal(); });
document.getElementById('cust-modal-name-input').addEventListener('keypress', function(e) { if (e.key === 'Enter') submitCustomerModal(); });
document.getElementById('void-token-number-input').addEventListener('keypress', function(e) { if (e.key === 'Enter') submitPosVoidLookup(); });

// Application Boot
renderCategoryFilters();
renderMenu();
renderLogs();
populateCustomerDatalist();
