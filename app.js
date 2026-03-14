// ПОЛНЫЙ КЛАСС ДЛЯ РАБОТЫ С ЗАКАЗАМИ
class OrderManager {
    constructor() {
        this.orders = [];
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.currentView = 'dashboard';
        this.isAdmin = false;
        this.currentUser = null;
        // ЗАМЕНИТЕ ЭТОТ URL НА ВАШ ИЗ GOOGLE APPS SCRIPT
        this.apiUrl = 'https://script.google.com/macros/s/AKfycbz7r0G4uvcDstVbboxeZDtcsaXp8ve8SHCIvUIcXilHVFQY0vk9ltz-6Jtn-qejjb4T/exec';
        this.loading = false;
        this.currentOrderId = null;
        this.checkAuth();
    }

    // ========== РАБОТА С ДАННЫМИ ==========

    async init() {
        await this.loadOrders();
        this.render();
        this.setupEventListeners();
    }

    async loadOrders() {
        this.showLoading();
        try {
            const response = await fetch(`${this.apiUrl}?action=getOrders&t=${Date.now()}`);
            const data = await response.json();
            
            if (data.success) {
                this.orders = data.orders || [];
                this.saveToCache();
                this.hideLoading();
            } else {
                this.loadFromCache();
            }
        } catch (error) {
            console.error('Ошибка загрузки:', error);
            this.loadFromCache();
            this.showNotification('Ошибка соединения, используем кэш', 'warning');
        }
        this.hideLoading();
    }

    saveToCache() {
        localStorage.setItem('xplay_orders_cache', JSON.stringify({
            orders: this.orders,
            timestamp: Date.now()
        }));
    }

    loadFromCache() {
        const cached = localStorage.getItem('xplay_orders_cache');
        if (cached) {
            const data = JSON.parse(cached);
            this.orders = data.orders;
        }
    }

    // ========== ФУНКЦИИ ДЛЯ ОБРАБОТКИ ТЕЛЕФОНА ==========

    cleanPhoneNumber(phone) {
        if (!phone) return '';
        
        // Сохраняем оригинал для отладки
        const original = phone;
        
        // Удаляем все кроме цифр и знака +
        let cleaned = phone.replace(/[^\d+]/g, '');
        
        // Если начинается с 8, заменяем на +7
        if (cleaned.startsWith('8')) {
            cleaned = '+7' + cleaned.substring(1);
        }
        
        // Если есть цифры, но нет +, добавляем +7
        if (cleaned.length >= 10 && !cleaned.startsWith('+')) {
            // Если начинается с 7, добавляем +
            if (cleaned.startsWith('7')) {
                cleaned = '+' + cleaned;
            } 
            // Если начинается с другой цифры, добавляем +7
            else {
                cleaned = '+7' + cleaned;
            }
        }
        
        // Обрезаем до 12 символов (+7 и 10 цифр)
        if (cleaned.length > 12) {
            cleaned = cleaned.substring(0, 12);
        }
        
        console.log('Телефон очищен:', original, '→', cleaned);
        return cleaned;
    }

    formatPhoneNumber(phone) {
        if (!phone) return '';
        
        // Если уже отформатирован, возвращаем как есть
        if (phone.includes('(') || phone.includes('-')) {
            return phone;
        }
        
        // Форматируем +7XXXXXXXXXX в +7 (XXX) XXX-XX-XX
        const cleaned = phone.replace(/\D/g, '');
        
        // Для российских номеров (+7)
        if (cleaned.length === 11 && cleaned.startsWith('7')) {
            return `+7 (${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)}-${cleaned.substring(7, 9)}-${cleaned.substring(9, 11)}`;
        }
        // Для 10-значных номеров (без +7)
        else if (cleaned.length === 10) {
            return `+7 (${cleaned.substring(0, 3)}) ${cleaned.substring(3, 6)}-${cleaned.substring(6, 8)}-${cleaned.substring(8, 10)}`;
        }
        // Для 11-значных с 8
        else if (cleaned.length === 11 && cleaned.startsWith('8')) {
            return `+7 (${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)}-${cleaned.substring(7, 9)}-${cleaned.substring(9, 11)}`;
        }
        
        return phone;
    }

    // ========== РАБОТА С ЗАКАЗАМИ ==========

    async createOrder(orderData) {
        this.showLoading();
        try {
            // Очищаем телефон перед отправкой
            const cleanedPhone = this.cleanPhoneNumber(orderData.phone);
            orderData.phone = cleanedPhone;
            
            console.log('Создание заказа с телефоном:', cleanedPhone);
            
            const formData = new FormData();
            formData.append('action', 'createOrder');
            Object.keys(orderData).forEach(key => {
                formData.append(key, orderData[key]);
            });
            
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                await this.loadOrders();
                this.showNotification('✅ Заказ успешно создан!', 'success');
                return true;
            } else {
                this.showNotification('❌ Ошибка: ' + (data.error || 'Неизвестная ошибка'), 'danger');
                return false;
            }
        } catch (error) {
            console.error('Ошибка создания:', error);
            this.showNotification('❌ Ошибка при создании заказа', 'danger');
            return false;
        } finally {
            this.hideLoading();
        }
    }

    async updateOrder(id, updates) {
        this.showLoading();
        try {
            const formData = new FormData();
            formData.append('action', 'updateOrder');
            formData.append('id', id);
            formData.append('updates', JSON.stringify(updates));
            
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                await this.loadOrders();
                this.showNotification('✅ Заказ обновлен', 'success');
                return true;
            }
        } catch (error) {
            console.error('Ошибка обновления:', error);
            this.showNotification('❌ Ошибка обновления', 'danger');
        } finally {
            this.hideLoading();
        }
        return false;
    }

    async closeOrder(id, finalPrice) {
        return this.updateOrder(id, {
            status: 'Выдан',
            finalPrice: finalPrice,
            completionDate: new Date().toLocaleString('ru-RU', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            })
        });
    }

    async restoreOrder(id) {
        return this.updateOrder(id, {
            status: 'Принят',
            finalPrice: '',
            completionDate: ''
        });
    }

    // ========== ФУНКЦИИ ДЛЯ УДАЛЕНИЯ ==========

    showDeleteConfirmation(id) {
        this.currentOrderId = id;
        const modal = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));
        modal.show();
    }

    async confirmDeleteOrder() {
        console.log('========== НАЧИНАЕМ УДАЛЕНИЕ ==========');
        console.log('1. ID заказа для удаления:', this.currentOrderId);
        console.log('2. URL API:', this.apiUrl);
        
        if (!this.currentOrderId) {
            console.log('❌ Ошибка: ID заказа не найден');
            this.showNotification('Ошибка: ID заказа не найден', 'danger');
            return;
        }
        
        // Скрываем модальное окно подтверждения
        bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal')).hide();
        this.showLoading();
        
        try {
            console.log('3. Отправляем запрос на удаление...');
            
            const formData = new FormData();
            formData.append('action', 'deleteOrder');
            formData.append('id', this.currentOrderId);
            
            console.log('4. FormData создана:', { 
                action: 'deleteOrder', 
                id: this.currentOrderId 
            });
            
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                body: formData
            });
            
            console.log('5. Ответ получен, статус:', response.status);
            
            const data = await response.json();
            console.log('6. Данные ответа:', data);
            
            if (data.success) {
                console.log('✅ Удаление успешно!');
                
                // Обновляем список заказов
                await this.loadOrders();
                
                // Закрываем окно просмотра заказа
                const viewModal = bootstrap.Modal.getInstance(document.getElementById('viewOrderModal'));
                if (viewModal) viewModal.hide();
                
                this.showNotification('✅ Заказ успешно удален', 'success');
                
                // Обновляем текущее представление
                this.render();
            } else {
                console.log('❌ Ошибка от сервера:', data.error);
                this.showNotification('❌ Ошибка при удалении заказа: ' + (data.error || 'Неизвестная ошибка'), 'danger');
            }
        } catch (error) {
            console.log('❌ Критическая ошибка:', error);
            console.log('Детали ошибки:', error.message);
            this.showNotification('❌ Ошибка соединения: ' + error.message, 'danger');
        } finally {
            this.hideLoading();
            this.currentOrderId = null;
            console.log('========== УДАЛЕНИЕ ЗАВЕРШЕНО ==========');
        }
    }

    async deleteOrder(id) {
        console.log('Вызвано deleteOrder с id:', id);
        this.showDeleteConfirmation(id);
    }

    // ========== АВТОРИЗАЦИЯ ==========

    async login(password, remember = false) {
        try {
            const response = await fetch(`${this.apiUrl}?action=login&password=${password}&t=${Date.now()}`);
            const data = await response.json();
            
            if (data.success) {
                this.isAdmin = true;
                this.currentUser = 'admin';
                
                if (remember) {
                    localStorage.setItem('xplay_auth', JSON.stringify({
                        user: 'admin',
                        expires: Date.now() + 30 * 24 * 60 * 60 * 1000
                    }));
                }
                
                this.updateUIForAuth();
                this.showNotification('✅ Вход выполнен успешно', 'success');
                return true;
            } else {
                this.showNotification('❌ Неверный пароль', 'danger');
                return false;
            }
        } catch (error) {
            console.error('Ошибка входа:', error);
            this.showNotification('❌ Ошибка соединения', 'danger');
            return false;
        }
    }

    logout() {
        this.isAdmin = false;
        this.currentUser = null;
        localStorage.removeItem('xplay_auth');
        this.updateUIForAuth();
        this.showDashboard();
        this.showNotification('👋 Выход выполнен', 'info');
    }

    checkAuth() {
        const saved = localStorage.getItem('xplay_auth');
        if (saved) {
            const auth = JSON.parse(saved);
            if (auth.expires > Date.now()) {
                this.isAdmin = true;
                this.currentUser = auth.user;
            }
        }
        this.updateUIForAuth();
    }

    updateUIForAuth() {
        const adminMenu = document.getElementById('adminMenu');
        const authButtons = document.getElementById('authButtons');
        const userMenu = document.getElementById('userMenu');
        const logoutButton = document.getElementById('logoutButton');
        const userName = document.getElementById('userName');
        
        if (adminMenu && authButtons && userMenu && logoutButton) {
            if (this.isAdmin) {
                adminMenu.style.display = 'block';
                authButtons.style.display = 'none';
                userMenu.style.display = 'block';
                logoutButton.style.display = 'block';
                if (userName) userName.innerHTML = '<i class="bi bi-person-badge"></i> Админ';
            } else {
                adminMenu.style.display = 'none';
                authButtons.style.display = 'block';
                userMenu.style.display = 'none';
                logoutButton.style.display = 'none';
            }
        }
    }

    // ========== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ==========

    showLoading() {
        this.loading = true;
    }

    hideLoading() {
        this.loading = false;
    }

    showNotification(message, type = 'info') {
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 end-0 m-3`;
        alertDiv.style.zIndex = '9999';
        alertDiv.style.minWidth = '300px';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        document.body.appendChild(alertDiv);
        
        setTimeout(() => {
            alertDiv.remove();
        }, 5000);
    }

    // ========== ПОИСК И ФИЛЬТРАЦИЯ ==========

    getActiveOrders() {
        return this.orders.filter(o => o.status && o.status !== 'Выдан');
    }

    getCompletedOrders(months = 1) {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);
        
        return this.orders.filter(o => 
            o.status === 'Выдан' && new Date(o.createdat) >= cutoff
        );
    }

    searchOrders(query) {
        query = query.toLowerCase().trim();
        
        // Очищаем запрос для поиска
        const cleanQuery = query.replace(/[^\d+]/g, '');
        
        return this.orders.filter(o => {
            const phone = (o.phone || '').toLowerCase();
            const cleanPhone = phone.replace(/[^\d+]/g, '');
            const customerName = (o.customername || '').toLowerCase();
            const orderNumber = (o.ordernumber || '').toLowerCase();
            
            // Ищем по оригинальному запросу и по очищенному
            return phone.includes(query) || 
                   cleanPhone.includes(cleanQuery) ||
                   customerName.includes(query) || 
                   orderNumber.includes(query);
        });
    }

    getOrderById(id) {
        return this.orders.find(o => o.id === id);
    }

    getOrderByNumber(orderNumber) {
        return this.orders.find(o => o.ordernumber === orderNumber);
    }

    getStatistics() {
        const total = this.orders.length;
        const active = this.getActiveOrders().length;
        const completed = this.orders.filter(o => o.status === 'Выдан').length;
        
        const totalSum = this.orders
            .filter(o => o.status === 'Выдан' && o.finalprice)
            .reduce((sum, o) => sum + (parseInt(o.finalprice) || 0), 0);
        
        const monthly = {};
        this.orders.forEach(o => {
            if (o.createdat) {
                const month = new Date(o.createdat).toLocaleString('ru-RU', { 
                    month: 'long', 
                    year: 'numeric' 
                });
                if (!monthly[month]) {
                    monthly[month] = { count: 0, sum: 0 };
                }
                monthly[month].count++;
                if (o.status === 'Выдан' && o.finalprice) {
                    monthly[month].sum += parseInt(o.finalprice) || 0;
                }
            }
        });
        
        return { total, active, completed, totalSum, monthly };
    }

    // ========== ФУНКЦИИ ПЕЧАТИ ==========

    printOrder(order) {
        const printWindow = window.open('', '_blank');
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Договор №${order.ordernumber}</title>
                <meta charset="utf-8">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    @page { size: A4; margin: 1cm; }
                    body {
                        font-family: 'Times New Roman', Times, serif;
                        font-size: 10pt;
                        line-height: 1.2;
                        color: #000;
                        background: #fff;
                    }
                    .contract { max-width: 100%; margin: 0 auto; }
                    .header {
                        text-align: center;
                        margin-bottom: 10px;
                        border-bottom: 1px solid #000;
                        padding-bottom: 5px;
                    }
                    .header h1 { font-size: 14pt; font-weight: bold; margin: 0; }
                    .header p { font-size: 10pt; margin: 2px 0; }
                    .contract-number {
                        text-align: center;
                        font-size: 12pt;
                        font-weight: bold;
                        margin: 10px 0;
                    }
                    table {
                        width: 100%;
                        border-collapse: collapse;
                        margin: 10px 0;
                        font-size: 9pt;
                    }
                    td {
                        padding: 4px 6px;
                        border: 1px solid #000;
                        vertical-align: top;
                    }
                    td:first-child {
                        font-weight: bold;
                        width: 30%;
                        background: #f0f0f0;
                    }
                    .conditions {
                        margin: 10px 0;
                        font-size: 8pt;
                        line-height: 1.1;
                        text-align: justify;
                    }
                    .conditions h6 {
                        font-size: 9pt;
                        font-weight: bold;
                        margin: 5px 0 2px 0;
                    }
                    .signature {
                        margin-top: 15px;
                        display: flex;
                        justify-content: space-between;
                        font-size: 9pt;
                    }
                    .cut-line {
                        text-align: center;
                        margin: 15px 0 10px 0;
                        color: #666;
                        border-top: 1px dashed #999;
                        padding-top: 5px;
                        font-size: 9pt;
                        font-style: italic;
                    }
                    .copy {
                        text-align: center;
                        font-weight: bold;
                        font-size: 11pt;
                        margin: 15px 0 10px 0;
                        text-transform: uppercase;
                    }
                    @media print {
                        body { margin: 0; padding: 0; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="contract">
                    <div class="header">
                        <h1>Xplay сервис</h1>
                        <p>Тула, Центральный переулок д.18</p>
                        <p>+7(902)904-73-35</p>
                    </div>
                    
                    <div class="contract-number">
                        ОТРЫВНОЙ ТАЛОН (КЛИЕНТУ)<br>
                        Договор № ${order.ordernumber || ''} от ${order.acceptancedate ? order.acceptancedate.split(' ')[0] : ''}
                    </div>
                    
                    <table>
                        <tr><td>Клиент:</td><td>${order.customername || ''}</td></tr>
                        <tr><td>Телефон:</td><td>${this.formatPhoneNumber(order.phone) || ''}</td></tr>
                        <tr><td>Устройство:</td><td>${order.devicetype || ''} ${order.devicemodel || ''}</td></tr>
                        <tr><td>Серийный номер:</td><td>${order.serialnumber || 'Отсутствует'}</td></tr>
                        <tr><td>Неисправность:</td><td>${order.problem || ''}</td></tr>
                        <tr><td>Примерная стоимость:</td><td>${order.estimatedprice || 'Мастер уточнит'} ${order.estimatedprice !== 'Мастер уточнит' && order.estimatedprice !== 'мастер уточнит' ? 'руб.' : ''}</td></tr>
                        <tr><td>Предоплата:</td><td>${order.prepayment === '-' || !order.prepayment ? 'нет' : order.prepayment}</td></tr>
                        <tr><td>Гарантия:</td><td>${order.warranty || '30 дней'}</td></tr>
                        <tr><td>Дата приема:</td><td>${order.acceptancedate || ''}</td></tr>
                        <tr><td>Срок ремонта:</td><td>до ${new Date(Date.now() + 2*24*60*60*1000).toLocaleDateString('ru-RU')}</td></tr>
                    </table>
                    
                    <div class="conditions">
                        <h6>Условия:</h6>
                        1. По настоящему договору Исполнитель обязуется принять, провести диагностику и при наличии технической возможности выполнить ремонт принятого устройства в указанный срок и за указанную стоимость.<br>
                        2. При проведении диагностики и обнаружении скрытых неисправностей срок и стоимость ремонта могут быть изменены при обязательном согласовании с Заказчиком.<br>
                        3. В случае отказа от ремонта заказчик обязуется оплатить стоимость диагностических работ: 300 руб. - аксессуары, 800 руб. - игровые консоли.
                    </div>
                    
                    <div class="signature">
                        <div>Клиент: _________________________</div>
                        <div>Мастер: _________________________</div>
                    </div>
                    
                    <div class="cut-line">- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</div>
                    <div style="text-align: center; font-size: 8pt; font-style: italic; margin-top: -8px;">(отрезать клиенту)</div>
                    
                    <div class="copy">КОПИЯ ДЛЯ СЕРВИСА</div>
                    
                    <div class="contract-number">
                        Договор № ${order.ordernumber || ''} от ${order.acceptancedate ? order.acceptancedate.split(' ')[0] : ''}
                    </div>
                    
                    <table>
                        <tr><td>Клиент:</td><td>${order.customername || ''}</td></tr>
                        <tr><td>Телефон:</td><td>${this.formatPhoneNumber(order.phone) || ''}</td></tr>
                        <tr><td>Устройство:</td><td>${order.devicetype || ''} ${order.devicemodel || ''}</td></tr>
                        <tr><td>S/N:</td><td>${order.serialnumber || 'Отсутствует'}</td></tr>
                        <tr><td>Неисправность:</td><td>${order.problem || ''}</td></tr>
                        <tr><td>Предоплата:</td><td>${order.prepayment === '-' || !order.prepayment ? 'нет' : order.prepayment}</td></tr>
                        <tr><td>Гарантия:</td><td>${order.warranty || '30 дней'}</td></tr>
                        <tr><td>Статус:</td><td>${order.status || 'Принят'}</td></tr>
                        ${order.status === 'Выдан' ? `
                        <tr><td>Итоговая стоимость:</td><td><strong>${order.finalprice || 0} руб.</strong></td></tr>
                        <tr><td>Дата выдачи:</td><td>${order.completiondate || ''}</td></tr>
                        ` : ''}
                    </table>
                    
                    <div class="conditions" style="margin-top: 5px;">
                        <h6>ДЛЯ ЗАМЕТОК:</h6>
                        _________________________________________________________________<br>
                        _________________________________________________________________<br>
                        _________________________________________________________________<br>
                    </div>
                    
                    <div class="signature" style="margin-top: 10px;">
                        <div>Клиент: _________________________</div>
                        <div>Мастер: _________________________</div>
                    </div>
                    
                    <div class="no-print" style="text-align: center; margin-top: 20px;">
                        <button onclick="window.print()" style="padding: 8px 20px; font-size: 14px; cursor: pointer;">🖨️ Печать</button>
                        <button onclick="window.close()" style="padding: 8px 20px; font-size: 14px; cursor: pointer;">✖️ Закрыть</button>
                    </div>
                </div>
                
                <script>
                    setTimeout(() => { window.print(); }, 500);
                </script>
            </body>
            </html>
        `;
        
        printWindow.document.write(html);
        printWindow.document.close();
    }

    // ========== ПРОСМОТР ЗАКАЗА ==========

    async viewOrder(id) {
        const order = this.getOrderById(id);
        if (!order) return;
        
        this.currentOrderId = id;
        
        const modal = document.getElementById('viewOrderModal');
        const title = document.getElementById('viewOrderTitle');
        const content = document.getElementById('viewOrderContent');
        
        title.textContent = `Заказ №${order.ordernumber || 'Без номера'}`;
        
        let html = `
            <div id="printableOrder">
                <div class="text-center mb-4">
                    <h4>Xplay сервис</h4>
                    <p>Тула, Центральный переулок д.18 | +7(902)904-73-35</p>
                    <h5 class="text-primary">Договор № ${order.ordernumber || ''}</h5>
                    <p>от ${order.acceptancedate || ''}</p>
                </div>
                
                <table class="table table-bordered">
                    <tr><th style="width: 40%">Клиент:</th><td>${order.customername || ''}</td></tr>
                    <tr><th>Телефон:</th><td>${this.formatPhoneNumber(order.phone) || ''}</td></tr>
                    <tr><th>Устройство:</th><td>${order.devicetype || ''} ${order.devicemodel || ''}</td></tr>
                    <tr><th>Серийный номер:</th><td>${order.serialnumber || 'Отсутствует'}</td></tr>
                    <tr><th>Неисправность:</th><td>${order.problem || ''}</td></tr>
                    <tr><th>Примерная стоимость:</th><td>${order.estimatedprice || 'Мастер уточнит'} ${order.estimatedprice !== 'Мастер уточнит' ? '₽' : ''}</td></tr>
                    <tr><th>Предоплата:</th><td>${order.prepayment === '-' ? 'нет' : order.prepayment}</td></tr>
                    <tr><th>Гарантия:</th><td>${order.warranty || '30 дней'}</td></tr>
                    <tr><th>Статус:</th><td>
                        <span class="status-badge ${order.status === 'Выдан' ? 'status-completed' : 'status-active'}">
                            ${order.status || 'Новый'}
                        </span>
                    </td></tr>
        `;
        
        if (order.status === 'Выдан') {
            html += `
                <tr><th>Итоговая стоимость:</th><td><strong>${order.finalprice || 0} ₽</strong></td></tr>
                <tr><th>Дата выдачи:</th><td>${order.completiondate || ''}</td></tr>
            `;
        }
        
        html += `
                </table>
                
                <div class="mt-4">
                    <h6>Условия:</h6>
                    <small>
                        1. По настоящему договору Исполнитель обязуется принять, провести диагностику и при наличии технической возможности выполнить ремонт принятого устройства в указанный срок и за указанную стоимость.<br>
                        2. При проведении диагностики и обнаружении скрытых неисправностей срок и стоимость ремонта могут быть изменены при обязательном согласовании с Заказчиком.<br>
                        3. В случае отказа от ремонта заказчик обязуется оплатить стоимость диагностических работ в размере 300 рублей - аксессуары, 800 рублей - игровые консоли.
                    </small>
                </div>
                
                <div class="row mt-4">
                    <div class="col-6">
                        <p>Клиент: _________________________</p>
                    </div>
                    <div class="col-6 text-end">
                        <p>Мастер: _________________________</p>
                    </div>
                </div>
            </div>
        `;
        
        content.innerHTML = html;
        
        const printBtn = document.getElementById('printOrderBtn');
        const closeBtn = document.getElementById('closeOrderBtn');
        const restoreBtn = document.getElementById('restoreOrderBtn');
        const deleteBtn = document.getElementById('deleteOrderBtn');
        
        printBtn.onclick = () => this.printOrder(order);
        
        if (this.isAdmin) {
            if (order.status !== 'Выдан') {
                closeBtn.style.display = 'inline-block';
                closeBtn.onclick = () => this.showCloseOrderForm(order);
                restoreBtn.style.display = 'none';
            } else {
                closeBtn.style.display = 'none';
                restoreBtn.style.display = 'inline-block';
                restoreBtn.onclick = () => this.restoreOrder(order.id);
            }
            deleteBtn.style.display = 'inline-block';
            deleteBtn.onclick = () => this.showDeleteConfirmation(order.id);
        } else {
            closeBtn.style.display = 'none';
            restoreBtn.style.display = 'none';
            deleteBtn.style.display = 'none';
        }
        
        new bootstrap.Modal(modal).show();
    }

    showCloseOrderForm(order) {
        document.getElementById('closeOrderId').value = order.id;
        document.getElementById('closeCustomerName').value = order.customername || '';
        document.getElementById('closePhone').value = this.formatPhoneNumber(order.phone) || '';
        document.getElementById('closeDevice').value = `${order.devicetype || ''} ${order.devicemodel || ''}`;
        document.getElementById('closeProblem').value = order.problem || '';
        document.getElementById('closeEstimatedPrice').value = order.estimatedprice || 'Мастер уточнит';
        document.getElementById('finalPrice').value = '';
        
        new bootstrap.Modal(document.getElementById('closeOrderModal')).show();
    }

    async confirmCloseOrder() {
        const id = document.getElementById('closeOrderId').value;
        const finalPrice = document.getElementById('finalPrice').value;
        
        if (!finalPrice) {
            alert('Введите итоговую стоимость');
            return;
        }
        
        const success = await this.closeOrder(id, finalPrice);
        if (success) {
            bootstrap.Modal.getInstance(document.getElementById('closeOrderModal')).hide();
            bootstrap.Modal.getInstance(document.getElementById('viewOrderModal')).hide();
            this.renderActiveOrders();
        }
    }

    // ========== ОТОБРАЖЕНИЕ ИНТЕРФЕЙСА ==========

    render() {
        switch(this.currentView) {
            case 'dashboard': this.renderDashboard(); break;
            case 'active': this.renderActiveOrders(); break;
            case 'completed': this.renderCompletedOrders(); break;
            case 'search': this.renderSearch(); break;
        }
    }

    renderDashboard() {
        const stats = this.getStatistics();
        const content = document.getElementById('mainContent');
        
        let html = `
            <div class="row mb-4">
                <div class="col-12">
                    <h2><i class="bi bi-speedometer2"></i> Панель управления</h2>
                    <p class="text-muted">Всего заказов: ${stats.total}</p>
                </div>
            </div>
            
            <div class="row mb-4">
                <div class="col-md-3">
                    <div class="card text-center p-3">
                        <h3>${stats.total}</h3>
                        <p class="text-muted">Всего</p>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card text-center p-3">
                        <h3 style="color: #0d6efd;">${stats.active}</h3>
                        <p class="text-muted">Активных</p>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card text-center p-3">
                        <h3 style="color: #198754;">${stats.completed}</h3>
                        <p class="text-muted">Завершенных</p>
                    </div>
                </div>
                <div class="col-md-3">
                    <div class="card text-center p-3">
                        <h3 style="color: #6f42c1;">${stats.totalSum} ₽</h3>
                        <p class="text-muted">Сумма</p>
                    </div>
                </div>
            </div>
            
            <div class="row">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">Последние заказы</div>
                        <div class="card-body">
                            ${this.renderRecentOrders()}
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-header">Статистика по месяцам</div>
                        <div class="card-body">
                            ${this.renderMonthlyStats(stats.monthly)}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        content.innerHTML = html;
    }

    renderRecentOrders() {
        const recent = this.orders.slice(0, 5);
        if (recent.length === 0) {
            return '<p class="text-muted">Нет заказов</p>';
        }
        
        return recent.map(o => `
            <div class="order-item" onclick="orderManager.viewOrder('${o.id}')">
                <div class="d-flex justify-content-between">
                    <div>
                        <strong>${o.ordernumber || 'Без номера'}</strong><br>
                        <small>${o.customername || ''} | ${this.formatPhoneNumber(o.phone) || ''}</small>
                    </div>
                    <span class="status-badge ${o.status === 'Выдан' ? 'status-completed' : 'status-active'}">
                        ${o.status || 'Новый'}
                    </span>
                </div>
            </div>
        `).join('');
    }

    renderMonthlyStats(monthly) {
        const months = Object.entries(monthly).slice(0, 6);
        if (months.length === 0) {
            return '<p class="text-muted">Нет данных</p>';
        }
        
        return months.map(([month, data]) => `
            <div class="d-flex justify-content-between mb-2">
                <span>${month}</span>
                <span>
                    <span class="badge bg-primary">${data.count} заказов</span>
                    <span class="badge bg-success">${data.sum} ₽</span>
                </span>
            </div>
        `).join('');
    }

    renderActiveOrders() {
        const active = this.getActiveOrders();
        const totalPages = Math.ceil(active.length / this.itemsPerPage);
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const paginated = active.slice(start, start + this.itemsPerPage);
        
        let html = `
            <div class="d-flex justify-content-between mb-4">
                <h2><i class="bi bi-list-check"></i> Активные заказы</h2>
                <button class="btn btn-primary" onclick="orderManager.showNewOrderForm()">
                    <i class="bi bi-plus-circle"></i> Новый договор
                </button>
            </div>
            
            <div class="card">
                <div class="card-header d-flex justify-content-between">
                    <span>Всего: ${active.length}</span>
                    <span>Страница ${this.currentPage} из ${totalPages || 1}</span>
                </div>
                <div class="card-body">
                    ${this.renderOrdersList(paginated)}
                    ${this.renderPagination(totalPages)}
                </div>
            </div>
        `;
        
        document.getElementById('mainContent').innerHTML = html;
    }

    renderCompletedOrders() {
        if (!this.isAdmin) {
            this.showNotification('Только для администратора', 'warning');
            return;
        }
        
        const completed = this.getCompletedOrders(1);
        const totalPages = Math.ceil(completed.length / this.itemsPerPage);
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const paginated = completed.slice(start, start + this.itemsPerPage);
        const totalSum = completed.reduce((sum, o) => sum + (parseInt(o.finalprice) || 0), 0);
        
        let html = `
            <div class="d-flex justify-content-between mb-4">
                <h2><i class="bi bi-check-circle"></i> Завершенные заказы</h2>
                <div>
                    <span class="badge bg-success me-2">Всего: ${completed.length}</span>
                    <span class="badge bg-primary">Сумма: ${totalSum} ₽</span>
                </div>
            </div>
            
            <div class="card">
                <div class="card-header d-flex justify-content-between">
                    <span>За последний месяц</span>
                    <span>Страница ${this.currentPage} из ${totalPages || 1}</span>
                </div>
                <div class="card-body">
                    ${this.renderCompletedOrdersList(paginated)}
                    ${this.renderPagination(totalPages)}
                </div>
            </div>
        `;
        
        document.getElementById('mainContent').innerHTML = html;
    }

    renderOrdersList(orders) {
        if (orders.length === 0) {
            return '<p class="text-center py-4">Нет заказов</p>';
        }
        
        return orders.map(o => `
            <div class="order-item" onclick="orderManager.viewOrder('${o.id}')">
                <div class="row">
                    <div class="col-md-8">
                        <strong class="text-primary">${o.ordernumber || 'Без номера'}</strong>
                        <div class="mt-2">
                            <small>
                                <i class="bi bi-person"></i> ${o.customername || ''}<br>
                                <i class="bi bi-telephone"></i> ${this.formatPhoneNumber(o.phone) || ''}<br>
                                <i class="bi bi-controller"></i> ${o.devicetype || ''} ${o.devicemodel || ''}
                            </small>
                        </div>
                        <div class="mt-2">
                            <span class="badge bg-info">${(o.problem || '').substring(0, 50)}${(o.problem || '').length > 50 ? '...' : ''}</span>
                        </div>
                    </div>
                    <div class="col-md-4 text-end">
                        <span class="status-badge status-active d-inline-block mb-2">
                            ${o.status || 'Новый'}
                        </span>
                        <div><small>📅 ${o.acceptancedate || ''}</small></div>
                        ${o.estimatedprice && o.estimatedprice !== 'Мастер уточнит' && o.estimatedprice !== 'мастер уточнит' ? `
                            <div class="mt-2"><small>💰 ${o.estimatedprice} ₽</small></div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderCompletedOrdersList(orders) {
        if (orders.length === 0) {
            return '<p class="text-center py-4">Нет завершенных заказов</p>';
        }
        
        return orders.map(o => `
            <div class="order-item" onclick="orderManager.viewOrder('${o.id}')">
                <div class="row">
                    <div class="col-md-7">
                        <strong class="text-primary">${o.ordernumber || 'Без номера'}</strong>
                        <div class="mt-2">
                            <small>
                                <i class="bi bi-person"></i> ${o.customername || ''}<br>
                                <i class="bi bi-telephone"></i> ${this.formatPhoneNumber(o.phone) || ''}<br>
                                <i class="bi bi-controller"></i> ${o.devicetype || ''} ${o.devicemodel || ''}
                            </small>
                        </div>
                    </div>
                    <div class="col-md-5 text-end">
                        <span class="status-badge status-completed d-inline-block mb-2">${o.status || 'Выдан'}</span>
                        <div><small>📅 Принят: ${o.acceptancedate || ''}</small></div>
                        <div><small>✅ Выдан: ${o.completiondate || ''}</small></div>
                        <div class="mt-2"><strong>💰 ${o.finalprice || 0} ₽</strong></div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderPagination(totalPages) {
        if (totalPages <= 1) return '';
        
        let pages = [];
        for (let i = 1; i <= totalPages; i++) {
            pages.push(`
                <li class="page-item ${i === this.currentPage ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="orderManager.goToPage(${i})">${i}</a>
                </li>
            `);
        }
        
        return `
            <nav class="mt-3">
                <ul class="pagination justify-content-center">
                    <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
                        <a class="page-link" href="#" onclick="orderManager.goToPage(${this.currentPage - 1})">←</a>
                    </li>
                    ${pages.join('')}
                    <li class="page-item ${this.currentPage === totalPages ? 'disabled' : ''}">
                        <a class="page-link" href="#" onclick="orderManager.goToPage(${this.currentPage + 1})">→</a>
                    </li>
                </ul>
            </nav>
        `;
    }

    renderSearch() {
        let html = `
            <div class="row justify-content-center">
                <div class="col-md-8">
                    <div class="card">
                        <div class="card-header">
                            <i class="bi bi-search"></i> Поиск заказов
                        </div>
                        <div class="card-body">
                            <div class="mb-3">
                                <label class="form-label">Введите телефон или номер заказа</label>
                                <div class="input-group">
                                    <input type="text" class="form-control" id="searchQuery" 
                                           placeholder="Напр. +7 (920) 270-19-69 или 20240314-001"
                                           onkeypress="if(event.key==='Enter') orderManager.performSearch()">
                                    <button class="btn btn-primary" onclick="orderManager.performSearch()">
                                        <i class="bi bi-search"></i> Найти
                                    </button>
                                </div>
                            </div>
                            <div id="searchResults"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('mainContent').innerHTML = html;
    }

    performSearch() {
        const query = document.getElementById('searchQuery').value;
        if (!query) return;
        
        const results = this.searchOrders(query);
        const resultsDiv = document.getElementById('searchResults');
        
        if (results.length === 0) {
            resultsDiv.innerHTML = '<div class="alert alert-warning mt-3">Ничего не найдено</div>';
            return;
        }
        
        let html = '<h5 class="mt-4">Результаты поиска:</h5>';
        
        results.forEach(o => {
            html += `
                <div class="order-item" onclick="orderManager.viewOrder('${o.id}')">
                    <div class="d-flex justify-content-between">
                        <div>
                            <strong>${o.ordernumber || 'Без номера'}</strong>
                            <br>
                            <small>${o.customername || ''} | ${this.formatPhoneNumber(o.phone) || ''}</small>
                        </div>
                        <div class="text-end">
                            <span class="status-badge ${o.status === 'Выдан' ? 'status-completed' : 'status-active'}">
                                ${o.status || 'Новый'}
                            </span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        resultsDiv.innerHTML = html;
    }

    showNewOrderForm() {
        document.getElementById('orderModalTitle').textContent = 'Новый договор';
        document.getElementById('orderForm').reset();
        document.getElementById('orderId').value = '';
        new bootstrap.Modal(document.getElementById('orderModal')).show();
    }

    async saveOrder() {
        const form = document.getElementById('orderForm');
        
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        
        // Получаем телефон и очищаем его
        let phone = document.getElementById('phone').value;
        const cleanedPhone = this.cleanPhoneNumber(phone);
        
        console.log('Исходный телефон:', phone);
        console.log('Очищенный телефон:', cleanedPhone);
        
        const orderData = {
            customerName: document.getElementById('customerName').value,
            phone: cleanedPhone, // Используем очищенную версию
            deviceType: document.getElementById('deviceType').value,
            deviceModel: document.getElementById('deviceModel').value,
            serialNumber: document.getElementById('serialNumber').value || 'Отсутствует',
            problem: document.getElementById('problem').value,
            estimatedPrice: document.getElementById('estimatedPrice').value || 'Мастер уточнит',
            warranty: document.getElementById('warranty').value,
            prepayment: document.getElementById('prepayment').value || '-'
        };
        
        console.log('Данные для отправки:', orderData);
        
        const success = await this.createOrder(orderData);
        if (success) {
            bootstrap.Modal.getInstance(document.getElementById('orderModal')).hide();
            this.showActiveOrders();
        }
    }

    // ========== НАВИГАЦИЯ ==========

    showDashboard() {
        this.currentView = 'dashboard';
        this.currentPage = 1;
        this.render();
    }

    showActiveOrders() {
        this.currentView = 'active';
        this.currentPage = 1;
        this.render();
    }

    showCompletedOrders() {
        if (!this.isAdmin) {
            this.showNotification('Только для администратора', 'warning');
            return;
        }
        this.currentView = 'completed';
        this.currentPage = 1;
        this.render();
    }

    showSearch() {
        this.currentView = 'search';
        this.render();
    }

    goToPage(page) {
        this.currentPage = page;
        this.render();
    }

    setupEventListeners() {
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && document.getElementById('searchQuery')) {
                this.performSearch();
            }
        });
    }
}

// ========== ГЛОБАЛЬНЫЙ ЭКЗЕМПЛЯР ==========
const orderManager = new OrderManager();

// ========== ГЛОБАЛЬНЫЕ ФУНКЦИИ ==========

// Навигация
function showDashboard() { orderManager.showDashboard(); }
function showActiveOrders() { orderManager.showActiveOrders(); }
function showCompletedOrders() { orderManager.showCompletedOrders(); }
function showSearch() { orderManager.showSearch(); }
function showNewOrderForm() { orderManager.showNewOrderForm(); }

// Авторизация
function showLogin() { new bootstrap.Modal(document.getElementById('loginModal')).show(); }

async function login() {
    const password = document.getElementById('adminPassword').value;
    const remember = document.getElementById('rememberMe').checked;
    const success = await orderManager.login(password, remember);
    if (success) {
        bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
        orderManager.showDashboard();
    }
}

function logout() { orderManager.logout(); }

// Работа с заказами
async function saveOrder() { await orderManager.saveOrder(); }
async function confirmCloseOrder() { await orderManager.confirmCloseOrder(); }
async function confirmDeleteOrder() { await orderManager.confirmDeleteOrder(); }

// Экспорт
function exportData() { 
    new bootstrap.Modal(document.getElementById('exportModal')).show(); 
}

function exportToJSON() {
    const data = orderManager.orders;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xplay_orders_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    bootstrap.Modal.getInstance(document.getElementById('exportModal')).hide();
    orderManager.showNotification('✅ Данные экспортированы в JSON', 'success');
}

function exportToCSV() {
    const orders = orderManager.orders;
    if (orders.length === 0) {
        orderManager.showNotification('❌ Нет данных для экспорта', 'warning');
        return;
    }
    
    const headers = ['Номер заказа', 'Клиент', 'Телефон', 'Устройство', 'Модель', 
                     'Неисправность', 'Статус', 'Стоимость', 'Итоговая', 'Дата приема', 'Дата выдачи'];
    
    let csv = headers.join(';') + '\n';
    
    orders.forEach(o => {
        const row = [
            o.ordernumber || '',
            o.customername || '',
            o.phone || '',
            o.devicetype || '',
            o.devicemodel || '',
            (o.problem || '').replace(/;/g, ','),
            o.status || '',
            o.estimatedprice || '',
            o.finalprice || '',
            o.acceptancedate || '',
            o.completiondate || ''
        ];
        csv += row.join(';') + '\n';
    });
    
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xplay_orders_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    bootstrap.Modal.getInstance(document.getElementById('exportModal')).hide();
    orderManager.showNotification('✅ Данные экспортированы в CSV', 'success');
}

// ========== ЗАПУСК ==========
document.addEventListener('DOMContentLoaded', async () => {
    await orderManager.init();
    orderManager.showDashboard();
});
