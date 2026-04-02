// Конфигурация
let devices = [];
let currentDevice = null;
let mouseMode = false;
let longPressTimer = null;

// DOM элементы
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const deviceNameSpan = document.getElementById('deviceName');
const devicesContainer = document.getElementById('devicesContainer');
const devicesList = document.getElementById('devicesList');
const scanBtn = document.getElementById('scanBtn');
const keyboardBtn = document.getElementById('keyboardBtn');
const mouseBtn = document.getElementById('mouseBtn');
const settingsBtn = document.getElementById('settingsBtn');
const addTvModal = document.getElementById('addTvModal');
const settingsModal = document.getElementById('settingsModal');
const mouseOverlay = document.getElementById('mouseOverlay');
const mousePad = document.getElementById('mousePad');

// Загрузка сохраненных данных
function loadData() {
    const savedDevices = localStorage.getItem('tv_devices');
    if (savedDevices) {
        devices = JSON.parse(savedDevices);
    }
    
    const lastDeviceIp = localStorage.getItem('last_device_ip');
    if (lastDeviceIp && devices.length > 0) {
        currentDevice = devices.find(d => d.ip === lastDeviceIp) || devices[0];
    } else if (devices.length > 0) {
        currentDevice = devices[0];
    }
    
    // Загрузка настроек
    const vibration = localStorage.getItem('vibration') === 'true';
    const sound = localStorage.getItem('sound') === 'true';
    const autoConnect = localStorage.getItem('autoConnect') === 'true';
    
    document.getElementById('vibrationToggle').checked = vibration;
    document.getElementById('soundToggle').checked = sound;
    document.getElementById('autoConnectToggle').checked = autoConnect;
    
    updateUI();
    renderDevicesList();
}

// Сохранение данных
function saveData() {
    localStorage.setItem('tv_devices', JSON.stringify(devices));
    if (currentDevice) {
        localStorage.setItem('last_device_ip', currentDevice.ip);
    }
}

// Обновление UI
function updateUI() {
    if (currentDevice) {
        deviceNameSpan.textContent = currentDevice.name;
        if (localStorage.getItem('connected') === 'true') {
            statusIndicator.classList.add('connected');
            statusText.textContent = 'Подключено';
        } else {
            statusIndicator.classList.remove('connected');
            statusText.textContent = 'Проверка...';
        }
    } else {
        deviceNameSpan.textContent = '';
        statusIndicator.classList.remove('connected');
        statusText.textContent = 'Не подключено';
    }
}

// Рендер списка устройств
function renderDevicesList() {
    if (devices.length === 0) {
        devicesList.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Нет устройств<br>Нажмите "Поиск" или добавьте вручную</div>';
        return;
    }
    
    devicesList.innerHTML = devices.map(device => `
        <div class="device-item ${currentDevice && currentDevice.ip === device.ip ? 'active' : ''}" data-ip="${device.ip}">
            <div>
                <div class="device-name-display">${escapeHtml(device.name)}</div>
                <div class="device-ip">${device.ip}</div>
            </div>
            <button class="delete-device" data-ip="${device.ip}" style="background: none; border: none; color: #CF6679; font-size: 20px; cursor: pointer;">🗑️</button>
        </div>
    `).join('');
    
    // Добавляем обработчики
    document.querySelectorAll('.device-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (!e.target.classList.contains('delete-device')) {
                const ip = el.dataset.ip;
                const device = devices.find(d => d.ip === ip);
                if (device) selectDevice(device);
            }
        });
    });
    
    document.querySelectorAll('.delete-device').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const ip = btn.dataset.ip;
            deleteDevice(ip);
        });
    });
}

// Выбор устройства
function selectDevice(device) {
    currentDevice = device;
    saveData();
    renderDevicesList();
    updateUI();
    testConnection(device.ip);
    devicesContainer.style.display = 'none';
}

// Удаление устройства
function deleteDevice(ip) {
    devices = devices.filter(d => d.ip !== ip);
    if (currentDevice && currentDevice.ip === ip) {
        currentDevice = devices.length > 0 ? devices[0] : null;
    }
    saveData();
    renderDevicesList();
    updateUI();
}

// Тест подключения
async function testConnection(ip) {
    const ports = [55000, 8001, 8002, 8080];
    let connected = false;
    
    for (let port of ports) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1500);
            await fetch(`http://${ip}:${port}`, { 
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            connected = true;
            break;
        } catch(e) {}
    }
    
    localStorage.setItem('connected', connected);
    updateUI();
    
    if (connected) {
        showToast('Подключено к ' + currentDevice.name, 'success');
    }
}

// Отправка команды
async function sendCommand(command) {
    if (!currentDevice) {
        showToast('Сначала выберите телевизор', 'error');
        return;
    }
    
    // Вибрация
    if (document.getElementById('vibrationToggle').checked && navigator.vibrate) {
        navigator.vibrate(50);
    }
    
    // Звук
    if (document.getElementById('soundToggle').checked) {
        const audio = new Audio('data:audio/wav;base64,U3RlYWx0aCBzb3VuZA==');
        audio.play().catch(() => {});
    }
    
    // Преобразование команд
    const commandMap = {
        'POWER': 'KEY_POWER', 'VOLUME_UP': 'KEY_VOLUMEUP', 'VOLUME_DOWN': 'KEY_VOLUMEDOWN',
        'MUTE': 'KEY_MUTE', 'CHANNEL_UP': 'KEY_CHANNELUP', 'CHANNEL_DOWN': 'KEY_CHANNELDOWN',
        'MENU': 'KEY_MENU', 'SOURCE': 'KEY_SOURCE', 'HOME': 'KEY_HOME',
        'BACK': 'KEY_BACK', 'EXIT': 'KEY_EXIT', 'ENTER': 'KEY_ENTER',
        'UP': 'KEY_UP', 'DOWN': 'KEY_DOWN', 'LEFT': 'KEY_LEFT', 'RIGHT': 'KEY_RIGHT',
        'PLAY': 'KEY_PLAY', 'PAUSE': 'KEY_PAUSE', 'STOP': 'KEY_STOP'
    };
    
    let tvCommand = command;
    if (command.startsWith('NUM_')) {
        tvCommand = 'KEY_' + command.substring(4);
    } else if (commandMap[command]) {
        tvCommand = commandMap[command];
    }
    
    // Отправка на разные порты
    const ports = [55000, 8001, 8002, 8080];
    let sent = false;
    
    for (let port of ports) {
        try {
            await fetch(`http://${currentDevice.ip}:${port}/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: tvCommand, value: 'click' }),
                mode: 'no-cors'
            });
            sent = true;
            break;
        } catch(e) {}
    }
    
    if (!sent) {
        for (let port of ports) {
            try {
                await fetch(`http://${currentDevice.ip}:${port}/key?code=${tvCommand}`, {
                    mode: 'no-cors'
                });
                break;
            } catch(e) {}
        }
    }
}

// Поиск устройств
async function scanDevices() {
    showToast('Поиск устройств...', 'info');
    
    // Получение локального IP через WebRTC
    const localIp = await getLocalIP();
    if (!localIp) {
        const subnet = prompt('Введите первые три октета вашей сети (например, 192.168.1):', '192.168.1');
        if (subnet) await scanSubnet(subnet);
        return;
    }
    
    const subnet = localIp.substring(0, localIp.lastIndexOf('.'));
    await scanSubnet(subnet);
}

// Получение локального IP
function getLocalIP() {
    return new Promise((resolve) => {
        const pc = new RTCPeerConnection({ iceServers: [] });
        pc.createDataChannel('');
        pc.createOffer().then(offer => pc.setLocalDescription(offer));
        pc.onicecandidate = (ice) => {
            if (!ice || !ice.candidate) return;
            const ip = ice.candidate.candidate.match(/([0-9]{1,3}\.){3}[0-9]{1,3}/);
            if (ip) {
                resolve(ip[0]);
                pc.close();
            }
        };
        setTimeout(() => resolve(null), 3000);
    });
}

// Сканирование подсети
async function scanSubnet(subnet) {
    const foundDevices = [];
    const promises = [];
    
    showToast('Сканирование сети...', 'info');
    devicesContainer.style.display = 'block';
    devicesList.innerHTML = '<div style="padding: 20px; text-align: center;">🔍 Сканирование...<br>Это может занять до минуты</div>';
    
    for (let i = 1; i <= 254; i++) {
        const ip = `${subnet}.${i}`;
        promises.push(checkDevice(ip, foundDevices));
        if (i % 20 === 0) {
            await new Promise(r => setTimeout(r, 50));
        }
    }
    
    await Promise.all(promises);
    
    if (foundDevices.length === 0) {
        devicesList.innerHTML = '<div style="padding: 20px; text-align: center;">❌ Устройства не найдены<br>Проверьте, что ТВ в той же сети</div>';
    } else {
        renderDevicesList();
    }
    
    showToast(`Найдено ${foundDevices.length} устройств`, 'success');
}

// Проверка устройства
async function checkDevice(ip, foundDevices) {
    const ports = [55000, 8001, 8002, 8080];
    for (let port of ports) {
        try {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 500);
            await fetch(`http://${ip}:${port}`, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
            
            if (!foundDevices.find(d => d.ip === ip)) {
                const device = {
                    name: `TV (${ip})`,
                    ip: ip,
                    model: 'Auto',
                    dateAdded: Date.now()
                };
                devices.push(device);
                foundDevices.push(device);
                saveData();
                renderDevicesList();
            }
            break;
        } catch(e) {}
    }
}

// Добавление устройства вручную
function addDeviceManually(ip, name) {
    if (!ip) return;
    if (!name) name = `TV (${ip})`;
    
    const existing = devices.find(d => d.ip === ip);
    if (!existing) {
        devices.push({ name, ip, model: 'Manual', dateAdded: Date.now() });
        saveData();
        renderDevicesList();
    }
    selectDevice(devices.find(d => d.ip === ip));
}

// Отправка текста
async function sendText(text) {
    if (!currentDevice) {
        showToast('Сначала выберите телевизор', 'error');
        return;
    }
    
    const ports = [55000, 8001, 8002];
    for (let port of ports) {
        try {
            await fetch(`http://${currentDevice.ip}:${port}/text`, {
                method: 'POST',
                body: JSON.stringify({ text: text }),
                mode: 'no-cors'
            });
            showToast('Отправлено: ' + text, 'success');
            break;
        } catch(e) {}
    }
}

// Показать уведомление
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: ${type === 'error' ? '#CF6679' : '#333'};
        color: white;
        padding: 12px 24px;
        border-radius: 30px;
        font-size: 14px;
        z-index: 3000;
        animation: slideUp 0.3s ease;
        white-space: nowrap;
        max-width: 90%;
        white-space: normal;
        text-align: center;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
}

// Экранирование HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Режим мыши
function enableMouseMode() {
    mouseOverlay.style.display = 'flex';
    let lastX = 0, lastY = 0;
    let tapCount = 0;
    let tapTimeout;
    
    const handleTouchMove = (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const x = touch.clientX;
        const y = touch.clientY;
        
        if (lastX && lastY && currentDevice) {
            const dx = x - lastX;
            const dy = y - lastY;
            sendMouseMove(dx, dy);
        }
        lastX = x;
        lastY = y;
    };
    
    const handleTouchStart = (e) => {
        e.preventDefault();
        tapCount++;
        if (tapTimeout) clearTimeout(tapTimeout);
        
        tapTimeout = setTimeout(() => {
            if (tapCount === 1) {
                sendMouseClick('left');
            } else if (tapCount === 2) {
                sendMouseClick('right');
            }
            tapCount = 0;
        }, 300);
    };
    
    mousePad.addEventListener('touchmove', handleTouchMove);
    mousePad.addEventListener('touchstart', handleTouchStart);
    
    document.getElementById('exitMouseBtn').onclick = () => {
        mousePad.removeEventListener('touchmove', handleTouchMove);
        mousePad.removeEventListener('touchstart', handleTouchStart);
        mouseOverlay.style.display = 'none';
    };
}

function sendMouseMove(dx, dy) {
    if (!currentDevice) return;
    const ports = [55000, 8001];
    for (let port of ports) {
        fetch(`http://${currentDevice.ip}:${port}/mouse/move?dx=${dx}&dy=${dy}`, { mode: 'no-cors' })
            .catch(() => {});
    }
}

function sendMouseClick(button) {
    if (!currentDevice) return;
    const ports = [55000, 8001];
    for (let port of ports) {
        fetch(`http://${currentDevice.ip}:${port}/mouse/click?button=${button}`, { mode: 'no-cors' })
            .catch(() => {});
    }
}

// Обработчики событий
document.querySelectorAll('[data-command]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const command = btn.dataset.command;
        sendCommand(command);
    });
});

scanBtn.onclick = () => scanDevices();
keyboardBtn.onclick = () => {
    const text = prompt('Введите текст для отправки на телевизор:');
    if (text) sendText(text);
};
mouseBtn.onclick = () => enableMouseMode();
settingsBtn.onclick = () => settingsModal.style.display = 'flex';

// Модальные окна
document.getElementById('confirmAddBtn').onclick = () => {
    const ip = document.getElementById('tvIp').value.trim();
    const name = document.getElementById('tvNameInput').value.trim();
    if (ip) {
        addDeviceManually(ip, name);
        addTvModal.style.display = 'none';
        document.getElementById('tvIp').value = '';
        document.getElementById('tvNameInput').value = '';
    } else {
        showToast('Введите IP адрес', 'error');
    }
};

document.getElementById('cancelModalBtn').onclick = () => {
    addTvModal.style.display = 'none';
};

document.getElementById('closeSettingsBtn').onclick = () => {
    const vibration = document.getElementById('vibrationToggle').checked;
    const sound = document.getElementById('soundToggle').checked;
    const autoConnect = document.getElementById('autoConnectToggle').checked;
    localStorage.setItem('vibration', vibration);
    localStorage.setItem('sound', sound);
    localStorage.setItem('autoConnect', autoConnect);
    settingsModal.style.display = 'none';
};

// Клик вне модального окна
window.onclick = (e) => {
    if (e.target === addTvModal) addTvModal.style.display = 'none';
    if (e.target === settingsModal) settingsModal.style.display = 'none';
};

// Инициализация
loadData();

// Автоподключение
if (localStorage.getItem('autoConnect') === 'true' && currentDevice) {
    setTimeout(() => testConnection(currentDevice.ip), 1000);
}
