// КЛАСС ДЛЯ РАБОТЫ С ЗАКАЗАМИ
class OrderManager {
    constructor() {
        this.orders = [];
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.currentView = 'dashboard';
        this.currentUser = null;
        this.isAdmin = false;
        this.isManager = false;
        
        // ЗАМЕНИТЕ НА ВАШ URL ИЗ GOOGLE APPS SCRIPT
        this.apiUrl = 'https://script.google.com/macros/s/AKfycbwuPw3q5yGbvEOi9mpNJToFCLeGEPx8xv3TMy3tT6-8IjHJmVqHYLzkxqTlIQgRxp8cTw/exec';
        
        this.loading = false;
        this.currentOrderId = null;
        
        // Проверяем сохраненную сессию
        this.checkSession();
    }

    // ===== АВТОРИЗАЦИЯ =====

    checkSession() {
        const saved = localStorage.getItem('xplay_session');
        if (saved) {
            try {
                const session = JSON.parse(saved);
                if (session.expires > Date.now()) {
                    this.currentUser = session.user;
                    this.isAdmin = session.user.role === 'admin';
                    this.isManager = session.user.role === 'manager' || session.user.role === 'admin';
                    
                    // Показываем основное приложение
                    document.getElementById('loginPage').style.display = 'none';
                    document.getElementById('appPage').style.display = 'block';
                    
                    // Обновляем UI
                    this.updateUIForUser();
                    
                    // Загружаем данные
                    this.init();
                } else {
                    localStorage.removeItem('xplay_session');
                }
            } catch (e) {
                console.error('Ошибка загрузки сессии:', e);
            }
        }
    }

    async login(username, password, remember = false) {
        this.showLoading();
        try {
            const response = await fetch(`${this.apiUrl}?action=login&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&t=${Date.now()}`);
            const data = await response.json();
            
            if (data.success) {
                this.currentUser = data.user;
                this.isAdmin = data.user.role === 'admin';
                this.isManager = data.user.role === 'manager' || data.user.role === 'admin';
                
                if (remember) {
                    localStorage.setItem('xplay_session', JSON.stringify({
                        user: data.user,
                        expires: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 дней
                    }));
                }
                
                // Скрываем страницу входа, показываем приложение
                document.getElementById('loginPage').style.display = 'none';
                document.getElementById('appPage').style.display = 'block';
                
                // Обновляем UI
                this.updateUIForUser();
                
                // Загружаем данные
                await this.init();
                
                this.showNotification(`Добро пожаловать, ${data.user.name}!`, 'success');
                return true;
            } else {
                this.showNotification(data.error || 'Ошибка входа', 'danger');
                return false;
            }
        } catch (error) {
            console.error('Ошибка входа:', error);
            this.showNotification('Ошибка соединения', 'danger');
            return false;
        } finally {
            this.hideLoading();
        }
    }

    logout() {
        this.currentUser = null;
        this.isAdmin = false;
        this.isManager = false;
        localStorage.removeItem('xplay_session');
        
        document.getElementById('loginPage').style.display = 'flex';
        document.getElementById('appPage').style.display = 'none';
        
        // Очищаем форму входа
        document.getElementById('username').value = '';
        document.getElementById('password').value = '';
        
        this.showNotification('Вы вышли из системы', 'info');
    }

    updateUIForUser() {
        // Обновляем информацию о пользователе
        document.getElementById('userName').textContent = this.currentUser.name;
        document.getElementById('userRole').textContent = this.currentUser.role === 'admin' ? 'Админ' : 'Менеджер';
        
        // Показываем/скрываем элементы в зависимости от прав
        const adminMenu = document.getElementById('adminMenu');
        const newOrderMenu = document.getElementById('newOrderMenu');
        
        if (this.isAdmin) {
            adminMenu.style.display = 'block';
            newOrderMenu.style.display = 'block';
        } else if (this.isManager) {
            adminMenu.style.display = 'none';
            newOrderMenu.style.display = 'block';
        } else {
            adminMenu.style.display = 'none';
            newOrderMenu.style.display = 'none';
        }
    }

    // ===== РАБОТА С ДАННЫМИ =====

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
                this.orders = (data.orders || []).map(order => this.normalizeOrder(order));
                this.saveToCache();
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

    normalizeOrder(order) {
        if (!order) return {};
        
        const normalized = {};
        Object.keys(order).forEach(key => {
            const value = order[key];
            if (value === null || value === undefined) {
                normalized[key] = '';
            } else {
                normalized[key] = String(value);
            }
        });
        return normalized;
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
            try {
                const data = JSON.parse(cached);
                this.orders = (data.orders || []).map(order => this.normalizeOrder(order));
            } catch (e) {
                console.error('Ошибка загрузки из кэша:', e);
                this.orders = [];
            }
        }
    }

    async createOrder(orderData) {
        if (!this.isManager) {
            this.showNotification('Недостаточно прав для создания заказа', 'danger');
            return false;
        }
        
        this.showLoading();
        try {
            const cleanedPhone = this.cleanPhoneNumber(orderData.phone);
            orderData.phone = cleanedPhone;
            
            const formData = new FormData();
            formData.append('action', 'createOrder');
            formData.append('userRole', this.currentUser.role);
            formData.append('username', this.currentUser.username);
            
            Object.keys(orderData).forEach(key => {
                formData.append(key, this.safeString(orderData[key]));
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
                this.showNotification('❌ ' + (data.error || 'Ошибка создания'), 'danger');
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
        if (!this.isAdmin) {
            this.showNotification('Только администратор может обновлять заказы', 'danger');
            return false;
        }
        
        this.showLoading();
        try {
            const formData = new FormData();
            formData.append('action', 'updateOrder');
            formData.append('userRole', this.currentUser.role);
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

    async deleteOrder(id) {
        if (!this.isAdmin) {
            this.showNotification('Только администратор может удалять заказы', 'danger');
            return false;
        }
        
        this.currentOrderId = id;
        new bootstrap.Modal(document.getElementById('deleteConfirmModal')).show();
    }

    async confirmDeleteOrder() {
        if (!this.currentOrderId) return;
        
        bootstrap.Modal.getInstance(document.getElementById('deleteConfirmModal')).hide();
        this.showLoading();
        
        try {
            const formData = new FormData();
            formData.append('action', 'deleteOrder');
            formData.append('userRole', this.currentUser.role);
            formData.append('id', this.currentOrderId);
            
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                await this.loadOrders();
                
                const viewModal = bootstrap.Modal.getInstance(document.getElementById('viewOrderModal'));
                if (viewModal) viewModal.hide();
                
                this.showNotification('✅ Заказ успешно удален', 'success');
                this.render();
            } else {
                this.showNotification('❌ ' + (data.error || 'Ошибка удаления'), 'danger');
            }
        } catch (error) {
            console.error('Ошибка удаления:', error);
            this.showNotification('❌ Ошибка соединения', 'danger');
        } finally {
            this.hideLoading();
            this.currentOrderId = null;
        }
    }

    async closeOrder(id, finalPrice) {
        return this.updateOrder(id, {
            status: 'Выдан',
            finalPrice: finalPrice,
            completionDate: this.formatDate(new Date())
        });
    }

    async restoreOrder(id) {
        return this.updateOrder(id, {
            status: 'Принят',
            finalPrice: '',
            completionDate: ''
        });
    }

    // ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

    safeString(value) {
        if (value === null || value === undefined) return '';
        return String(value);
    }

    cleanPhoneNumber(phone) {
        const phoneStr = this.safeString(phone);
        if (!phoneStr) return '';
        
        let cleaned = phoneStr.replace(/[^\d+]/g, '');
        
        if (cleaned.startsWith('8')) {
            cleaned = '+7' + cleaned.substring(1);
        }
        
        if (cleaned.length >= 10 && !cleaned.startsWith('+')) {
            if (cleaned.startsWith('7')) {
                cleaned = '+' + cleaned;
            } else {
                cleaned = '+7' + cleaned;
            }
        }
        
        if (cleaned.length > 12) {
            cleaned = cleaned.substring(0, 12);
        }
        
        return cleaned;
    }

    formatPhoneNumber(phone) {
        const phoneStr = this.safeString(phone);
        if (!phoneStr) return '';
        
        if (phoneStr.includes('(') || phoneStr.includes('-')) {
            return phoneStr;
        }
        
        const cleaned = phoneStr.replace(/\D/g, '');
        
        if (cleaned.length === 11 && cleaned.startsWith('7')) {
            return `+7 (${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)}-${cleaned.substring(7, 9)}-${cleaned.substring(9, 11)}`;
        } else if (cleaned.length === 10) {
            return `+7 (${cleaned.substring(0, 3)}) ${cleaned.substring(3, 6)}-${cleaned.substring(6, 8)}-${cleaned.substring(8, 10)}`;
        } else if (cleaned.length === 11 && cleaned.startsWith('8')) {
            return `+7 (${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)}-${cleaned.substring(7, 9)}-${cleaned.substring(9, 11)}`;
        }
        
        return phoneStr;
    }

    formatDate(date) {
        if (!date) return '';
        
        if (typeof date === 'string' && date.match(/^\d{2}\.\d{2}\.\d{4}/)) {
            return date;
        }
        
        try {
            const d = new Date(date);
            if (isNaN(d.getTime())) return '';
            
            d.setHours(d.getHours() + 3);
            
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            const hours = String(d.getHours()).padStart(2, '0');
            const minutes = String(d.getMinutes()).padStart(2, '0');
            
            return `${day}.${month}.${year} ${hours}:${minutes}`;
        } catch (e) {
            return '';
        }
    }

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

    // ===== ПОИСК И ФИЛЬТРАЦИЯ =====

    getActiveOrders() {
        return this.orders.filter(o => this.safeString(o.status) !== 'Выдан');
    }

    getCompletedOrders(months = 1) {
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);
        
        return this.orders.filter(o => {
            const status = this.safeString(o.status);
            const created = o.createdat ? new Date(o.createdat) : new Date(0);
            return status === 'Выдан' && created >= cutoff;
        });
    }

    searchOrders(query) {
        const queryStr = this.safeString(query).toLowerCase().trim();
        const cleanQuery = queryStr.replace(/[^\d+]/g, '');
        
        return this.orders.filter(o => {
            const phone = this.safeString(o.phone).toLowerCase();
            const cleanPhone = phone.replace(/[^\d+]/g, '');
            const customerName = this.safeString(o.customername).toLowerCase();
            const orderNumber = this.safeString(o.ordernumber).toLowerCase();
            
            return phone.includes(queryStr) || 
                   cleanPhone.includes(cleanQuery) ||
                   customerName.includes(queryStr) || 
                   orderNumber.includes(queryStr);
        });
    }

    getOrderById(id) {
        return this.orders.find(o => o.id === id);
    }

    getStatistics() {
        const total = this.orders.length;
        const active = this.getActiveOrders().length;
        const completed = this.orders.filter(o => this.safeString(o.status) === 'Выдан').length;
        
        const totalSum = this.orders
            .filter(o => this.safeString(o.status) === 'Выдан' && o.finalprice)
            .reduce((sum, o) => sum + (parseInt(o.finalprice) || 0), 0);
        
        return { total, active, completed, totalSum };
    }

    // ===== ОТОБРАЖЕНИЕ =====

    render() {
        switch(this.currentView) {
            case 'dashboard': this.renderDashboard(); break;
            case 'active': this.renderActiveOrders(); break;
            case 'completed': this.renderCompletedOrders(); break;
            case 'search': this.renderSearch(); break;
            case 'users': this.renderUsers(); break;
        }
    }

    renderDashboard() {
        const stats = this.getStatistics();
        
        let html = `
            <div class="row mb-4">
                <div class="col-12">
                    <h2><i class="bi bi-speedometer2"></i> Панель управления</h2>
                </div>
            </div>
            
            <div class="row mb-4">
                <div class="col-md-3">
                    <div class="card text-center p-3">
                        <h3>${stats.total}</h3>
                        <p class="text-muted">Всего заказов</p>
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
                        <p class="text-muted">Общая сумма</p>
                    </div>
                </div>
            </div>
            
            <div class="row">
                <div class="col-12">
                    <div class="card">
                        <div class="card-header">Последние заказы</div>
                        <div class="card-body">
                            ${this.renderRecentOrders()}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('mainContent').innerHTML = html;
    }

    renderRecentOrders() {
        const recent = this.orders.slice(0, 5);
        if (recent.length === 0) {
            return '<p class="text-muted">Нет заказов</p>';
        }
        
        return recent.map(o => {
            const formattedPhone = this.formatPhoneNumber(o.phone);
            const formattedDate = this.formatDate(o.acceptancedate);
            
            return `
                <div class="order-item" onclick="orderManager.viewOrder('${o.id}')">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <strong>${this.safeString(o.ordernumber) || 'Без номера'}</strong><br>
                            <small>${this.safeString(o.customername)} | ${formattedPhone}</small><br>
                            <small class="text-muted">📅 ${formattedDate}</small>
                        </div>
                        <span class="status-badge ${this.safeString(o.status) === 'Выдан' ? 'status-completed' : 'status-active'}">
                            ${this.safeString(o.status) || 'Новый'}
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderActiveOrders() {
        const active = this.getActiveOrders();
        const totalPages = Math.ceil(active.length / this.itemsPerPage);
        const start = (this.currentPage - 1) * this.itemsPerPage;
        const paginated = active.slice(start, start + this.itemsPerPage);
        
        let html = `
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h2><i class="bi bi-list-check"></i> Активные заказы</h2>
                ${this.isManager ? `
                    <button class="btn btn-primary" onclick="showNewOrderForm()">
                        <i class="bi bi-plus-circle"></i> Новый договор
                    </button>
                ` : ''}
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
        
        let html = `
            <h2 class="mb-4"><i class="bi bi-check-circle"></i> Завершенные заказы</h2>
            
            <div class="card">
                <div class="card-header d-flex justify-content-between">
                    <span>Всего: ${completed.length}</span>
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
        
        return orders.map(o => {
            const formattedPhone = this.formatPhoneNumber(o.phone);
            const problem = this.safeString(o.problem);
            const problemShort = problem.length > 50 ? problem.substring(0, 47) + '...' : problem;
            const formattedDate = this.formatDate(o.acceptancedate);
            
            return `
                <div class="order-item" onclick="orderManager.viewOrder('${o.id}')">
                    <div class="row">
                        <div class="col-md-8">
                            <strong class="text-primary">${this.safeString(o.ordernumber) || 'Без номера'}</strong>
                            <div class="mt-2">
                                <small>
                                    <i class="bi bi-person"></i> ${this.safeString(o.customername)}<br>
                                    <i class="bi bi-telephone"></i> ${formattedPhone}<br>
                                    <i class="bi bi-controller"></i> ${this.safeString(o.devicetype)} ${this.safeString(o.devicemodel)}
                                </small>
                            </div>
                            <div class="mt-2">
                                <span class="badge bg-info">${problemShort}</span>
                            </div>
                        </div>
                        <div class="col-md-4 text-end">
                            <span class="status-badge status-active d-inline-block mb-2">
                                ${this.safeString(o.status) || 'Новый'}
                            </span>
                            <div><small>📅 ${formattedDate}</small></div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    renderCompletedOrdersList(orders) {
        if (orders.length === 0) {
            return '<p class="text-center py-4">Нет завершенных заказов</p>';
        }
        
        return orders.map(o => {
            const formattedPhone = this.formatPhoneNumber(o.phone);
            const formattedAcceptDate = this.formatDate(o.acceptancedate);
            const formattedCompleteDate = this.formatDate(o.completiondate);
            
            return `
                <div class="order-item" onclick="orderManager.viewOrder('${o.id}')">
                    <div class="row">
                        <div class="col-md-7">
                            <strong class="text-primary">${this.safeString(o.ordernumber) || 'Без номера'}</strong>
                            <div class="mt-2">
                                <small>
                                    <i class="bi bi-person"></i> ${this.safeString(o.customername)}<br>
                                    <i class="bi bi-telephone"></i> ${formattedPhone}<br>
                                    <i class="bi bi-controller"></i> ${this.safeString(o.devicetype)} ${this.safeString(o.devicemodel)}
                                </small>
                            </div>
                        </div>
                        <div class="col-md-5 text-end">
                            <span class="status-badge status-completed d-inline-block mb-2">${this.safeString(o.status) || 'Выдан'}</span>
                            <div><small>📅 Принят: ${formattedAcceptDate}</small></div>
                            <div><small>✅ Выдан: ${formattedCompleteDate}</small></div>
                            <div class="mt-2"><strong>💰 ${this.safeString(o.finalprice) || 0} ₽</strong></div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
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
                                           placeholder="Напр. +7 (920) 270-19-69"
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

    renderUsers() {
        if (!this.isAdmin) {
            this.showNotification('Только для администратора', 'warning');
            return;
        }
        
        let html = `
            <h2 class="mb-4"><i class="bi bi-people"></i> Управление пользователями</h2>
            
            <div class="card">
                <div class="card-header">Список пользователей</div>
                <div class="card-body">
                    <table class="table">
                        <thead>
                            <tr>
                                <th>Имя пользователя</th>
                                <th>Роль</th>
                                <th>Имя</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>admin</td>
                                <td><span class="badge bg-danger">Администратор</span></td>
                                <td>Главный администратор</td>
                            </tr>
                            <tr>
                                <td>manager</td>
                                <td><span class="badge bg-primary">Менеджер</span></td>
                                <td>Менеджер</td>
                            </tr>
                        </tbody>
                    </table>
                    <p class="text-muted mt-3">
                        <i class="bi bi-info-circle"></i> Для добавления пользователей редактируйте лист "Users" в Google таблице
                    </p>
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
            const formattedPhone = this.formatPhoneNumber(o.phone);
            const formattedDate = this.formatDate(o.acceptancedate);
            
            html += `
                <div class="order-item" onclick="orderManager.viewOrder('${o.id}')">
                    <div class="d-flex justify-content-between">
                        <div>
                            <strong>${this.safeString(o.ordernumber) || 'Без номера'}</strong>
                            <br>
                            <small>${this.safeString(o.customername)} | ${formattedPhone}</small>
                            <br>
                            <small class="text-muted">📅 ${formattedDate}</small>
                        </div>
                        <span class="status-badge ${this.safeString(o.status) === 'Выдан' ? 'status-completed' : 'status-active'}">
                            ${this.safeString(o.status) || 'Новый'}
                        </span>
                    </div>
                </div>
            `;
        });
        
        resultsDiv.innerHTML = html;
    }

    async viewOrder(id) {
        const order = this.getOrderById(id);
        if (!order) return;
        
        this.currentOrderId = id;
        
        const modal = document.getElementById('viewOrderModal');
        const title = document.getElementById('viewOrderTitle');
        const content = document.getElementById('viewOrderContent');
        
        title.textContent = `Заказ №${this.safeString(order.ordernumber) || 'Без номера'}`;
        
        let html = `
            <div class="text-center mb-4">
                <h4>Xplay сервис</h4>
                <p>Тула, Центральный переулок д.18 | +7(902)904-73-35</p>
                <h5 class="text-primary">Договор № ${this.safeString(order.ordernumber)}</h5>
                <p>от ${this.formatDate(order.acceptancedate)}</p>
            </div>
            
            <table class="table table-bordered">
                <tr><th style="width: 40%">Клиент:</th><td>${this.safeString(order.customername)}</td></tr>
                <tr><th>Телефон:</th><td>${this.formatPhoneNumber(order.phone)}</td></tr>
                <tr><th>Устройство:</th><td>${this.safeString(order.devicetype)} ${this.safeString(order.devicemodel)}</td></tr>
                <tr><th>Серийный номер:</th><td>${this.safeString(order.serialnumber) || 'Отсутствует'}</td></tr>
                <tr><th>Неисправность:</th><td>${this.safeString(order.problem)}</td></tr>
                <tr><th>Примерная стоимость:</th><td>${this.safeString(order.estimatedprice)}</td></tr>
                <tr><th>Предоплата:</th><td>${this.safeString(order.prepayment) === '-' ? 'нет' : this.safeString(order.prepayment)}</td></tr>
                <tr><th>Гарантия:</th><td>${this.safeString(order.warranty) || '30 дней'}</td></tr>
                <tr><th>Статус:</th><td>
                    <span class="status-badge ${this.safeString(order.status) === 'Выдан' ? 'status-completed' : 'status-active'}">
                        ${this.safeString(order.status) || 'Новый'}
                    </span>
                </td></tr>
        `;
        
        if (this.safeString(order.status) === 'Выдан') {
            html += `
                <tr><th>Итоговая стоимость:</th><td><strong>${this.safeString(order.finalprice) || 0} ₽</strong></td></tr>
                <tr><th>Дата выдачи:</th><td>${this.formatDate(order.completiondate)}</td></tr>
            `;
        }
        
        if (order.createdby) {
            html += `<tr><th>Создал:</th><td>${order.createdby}</td></tr>`;
        }
        
        html += `</table>`;
        
        content.innerHTML = html;
        
        const printBtn = document.getElementById('printOrderBtn');
        const closeBtn = document.getElementById('closeOrderBtn');
        const restoreBtn = document.getElementById('restoreOrderBtn');
        const deleteBtn = document.getElementById('deleteOrderBtn');
        
        printBtn.onclick = () => this.printOrder(order);
        
        if (this.isAdmin) {
            if (this.safeString(order.status) !== 'Выдан') {
                closeBtn.style.display = 'inline-block';
                closeBtn.onclick = () => this.showCloseOrderForm(order);
                restoreBtn.style.display = 'none';
            } else {
                closeBtn.style.display = 'none';
                restoreBtn.style.display = 'inline-block';
                restoreBtn.onclick = () => this.restoreOrder(order.id);
            }
            deleteBtn.style.display = 'inline-block';
            deleteBtn.onclick = () => this.deleteOrder(order.id);
        } else if (this.isManager && this.safeString(order.status) === 'Принят') {
            closeBtn.style.display = 'inline-block';
            closeBtn.onclick = () => this.showCloseOrderForm(order);
            restoreBtn.style.display = 'none';
            deleteBtn.style.display = 'none';
        } else {
            closeBtn.style.display = 'none';
            restoreBtn.style.display = 'none';
            deleteBtn.style.display = 'none';
        }
        
        new bootstrap.Modal(modal).show();
    }

    showCloseOrderForm(order) {
        document.getElementById('closeOrderId').value = order.id;
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

    printOrder(order) {
        const printWindow = window.open('', '_blank');
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Договор №${this.safeString(order.ordernumber)}</title>
                <meta charset="utf-8">
                <style>
                    body { font-family: 'Times New Roman', serif; margin: 20px; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .contract-number { text-align: center; font-size: 18px; font-weight: bold; margin: 20px 0; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    td { padding: 8px; border: 1px solid #000; }
                    td:first-child { font-weight: bold; width: 30%; }
                    .signature { margin-top: 40px; display: flex; justify-content: space-between; }
                    .cut-line { text-align: center; margin: 30px 0; border-top: 2px dashed #999; padding-top: 10px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Xplay сервис</h1>
                    <p>Тула, Центральный переулок д.18 | +7(902)904-73-35</p>
                </div>
                
                <div class="contract-number">
                    Договор № ${this.safeString(order.ordernumber)} от ${this.formatDate(order.acceptancedate)}
                </div>
                
                <table>
                    <tr><td>Клиент:</td><td>${this.safeString(order.customername)}</td></tr>
                    <tr><td>Телефон:</td><td>${this.formatPhoneNumber(order.phone)}</td></tr>
                    <tr><td>Устройство:</td><td>${this.safeString(order.devicetype)} ${this.safeString(order.devicemodel)}</td></tr>
                    <tr><td>Неисправность:</td><td>${this.safeString(order.problem)}</td></tr>
                    <tr><td>Примерная стоимость:</td><td>${this.safeString(order.estimatedprice)}</td></tr>
                    <tr><td>Предоплата:</td><td>${this.safeString(order.prepayment) === '-' ? 'нет' : this.safeString(order.prepayment)}</td></tr>
                    <tr><td>Гарантия:</td><td>${this.safeString(order.warranty) || '30 дней'}</td></tr>
                </table>
                
                <div class="signature">
                    <div>Клиент: _________________________</div>
                    <div>Мастер: _________________________</div>
                </div>
            </body>
            </html>
        `;
        
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.print();
    }

    showNewOrderForm() {
        document.getElementById('orderForm').reset();
        new bootstrap.Modal(document.getElementById('orderModal')).show();
    }

    async saveOrder() {
        const form = document.getElementById('orderForm');
        
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        
        const orderData = {
            phone: document.getElementById('phone').value,
            customerName: document.getElementById('customerName').value,
            deviceType: document.getElementById('deviceType').value,
            deviceModel: document.getElementById('deviceModel').value,
            serialNumber: document.getElementById('serialNumber').value || 'Отсутствует',
            problem: document.getElementById('problem').value,
            estimatedPrice: document.getElementById('estimatedPrice').value || 'Мастер уточнит',
            warranty: document.getElementById('warranty').value,
            prepayment: document.getElementById('prepayment').value || '-'
        };
        
        const success = await this.createOrder(orderData);
        if (success) {
            bootstrap.Modal.getInstance(document.getElementById('orderModal')).hide();
            this.showActiveOrders();
        }
    }

    // ===== НАВИГАЦИЯ =====

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
        this.currentView = 'completed';
        this.currentPage = 1;
        this.render();
    }

    showSearch() {
        this.currentView = 'search';
        this.render();
    }

    showUsers() {
        this.currentView = 'users';
        this.render();
    }

    goToPage(page) {
        this.currentPage = page;
        this.render();
    }

    exportData() {
        const dataStr = JSON.stringify(this.orders, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `xplay_orders_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showNotification('Данные экспортированы', 'success');
    }

    setupEventListeners() {
        document.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && document.getElementById('searchQuery')) {
                this.performSearch();
            }
        });
    }
}

// ===== ГЛОБАЛЬНЫЕ ФУНКЦИИ =====
const orderManager = new OrderManager();

async function login() {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const remember = document.getElementById('rememberMe').checked;
    
    if (!username || !password) {
        alert('Введите имя пользователя и пароль');
        return;
    }
    
    await orderManager.login(username, password, remember);
}

function logout() {
    orderManager.logout();
}

function showDashboard() { orderManager.showDashboard(); }
function showActiveOrders() { orderManager.showActiveOrders(); }
function showCompletedOrders() { orderManager.showCompletedOrders(); }
function showSearch() { orderManager.showSearch(); }
function showUsers() { orderManager.showUsers(); }
function showNewOrderForm() { orderManager.showNewOrderForm(); }
function saveOrder() { orderManager.saveOrder(); }
function confirmCloseOrder() { orderManager.confirmCloseOrder(); }
function confirmDeleteOrder() { orderManager.confirmDeleteOrder(); }
function exportData() { orderManager.exportData(); }
