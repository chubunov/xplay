class OrderManager {
    constructor() {
        this.orders = [];
        this.currentPage = 1;
        this.isAdmin = false;
        // ЭТУ СТРОКУ ЗАМЕНИМ ПОТОМ!
        this.apiUrl = 'https://script.google.com/macros/s/AKfycbwm4WcDisdhM_q2JO6eTddt-olO8y8H_7eR573SGsLSQBTX9aFOTqgXlWl8s4oG-Sme/exec';
    }

    async loadOrders() {
        try {
            const response = await fetch(this.apiUrl + '?action=getOrders');
            const data = await response.json();
            if (data.success) this.orders = data.orders;
        } catch (e) {
            console.log('Ошибка загрузки');
        }
    }

    async createOrder(data) {
        const formData = new FormData();
        formData.append('action', 'createOrder');
        Object.keys(data).forEach(k => formData.append(k, data[k]));
        
        await fetch(this.apiUrl, { method: 'POST', body: formData });
        await this.loadOrders();
        alert('Заказ создан!');
    }

    async login(password) {
        const res = await fetch(this.apiUrl + '?action=login&password=' + password);
        const data = await res.json();
        this.isAdmin = data.success;
        return data.success;
    }

    showDashboard() {
        document.getElementById('mainContent').innerHTML = '<h2>Главная</h2><p>Загрузка...</p>';
    }

    showActiveOrders() {
        let html = '<h2>Активные заказы</h2>';
        this.orders.filter(o => o.status !== 'Выдан').forEach(o => {
            html += `<div class="order-item">${o.ordernumber} - ${o.customername}</div>`;
        });
        document.getElementById('mainContent').innerHTML = html;
    }

    showNewOrderForm() {
        new bootstrap.Modal(document.getElementById('orderModal')).show();
    }

    showSearch() {
        document.getElementById('mainContent').innerHTML = `
            <h2>Поиск</h2>
            <input type="text" id="searchInput" class="form-control" placeholder="Телефон или номер">
            <button class="btn btn-primary mt-2" onclick="orderManager.search()">Найти</button>
            <div id="searchResults"></div>
        `;
    }

    search() {
        const query = document.getElementById('searchInput').value;
        const results = this.orders.filter(o => 
            (o.phone && o.phone.includes(query)) || 
            (o.ordernumber && o.ordernumber.includes(query))
        );
        
        let html = '<h3 class="mt-3">Результаты:</h3>';
        results.forEach(o => {
            html += `<div class="order-item">${o.ordernumber} - ${o.customername}</div>`;
        });
        document.getElementById('searchResults').innerHTML = html;
    }
}

const orderManager = new OrderManager();

function showDashboard() { orderManager.showDashboard(); }
function showActiveOrders() { orderManager.showActiveOrders(); }
function showNewOrderForm() { orderManager.showNewOrderForm(); }
function showSearch() { orderManager.showSearch(); }
function showLogin() { new bootstrap.Modal(document.getElementById('loginModal')).show(); }

async function login() {
    const pwd = document.getElementById('adminPassword').value;
    const success = await orderManager.login(pwd);
    if (success) {
        bootstrap.Modal.getInstance(document.getElementById('loginModal')).hide();
        alert('Вход выполнен');
    } else {
        alert('Неверный пароль');
    }
}

async function saveOrder() {
    const data = {
        customerName: document.getElementById('customerName').value,
        phone: document.getElementById('phone').value,
        deviceType: document.getElementById('deviceType').value,
        deviceModel: document.getElementById('deviceModel').value,
        serialNumber: document.getElementById('serialNumber').value,
        problem: document.getElementById('problem').value,
        estimatedPrice: document.getElementById('estimatedPrice').value,
        warranty: document.getElementById('warranty').value,
        prepayment: document.getElementById('prepayment').value
    };
    
    await orderManager.createOrder(data);
    bootstrap.Modal.getInstance(document.getElementById('orderModal')).hide();
    showActiveOrders();
}

// Запуск
document.addEventListener('DOMContentLoaded', async () => {
    await orderManager.loadOrders();
    orderManager.showDashboard();
});