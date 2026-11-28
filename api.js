// API Client for Pwani Bite Frontend
// Handles all communication with the backend API

// Configure PWANI_BITE_API_URL when the API is hosted separately. Django's
// development server serves both the site and API from the same origin.
const useLocalApi = ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '8000';
const API_BASE_URL = window.PWANI_BITE_API_URL ||
    (useLocalApi ? 'http://localhost:8000/api' : `${window.location.origin}/api`);

// Store JWT token
let token = localStorage.getItem('pwaniBiteToken') || sessionStorage.getItem('pwaniBiteToken') || null;

function storeAuthSession(authToken, user, rememberMe = true) {
    localStorage.removeItem('pwaniBiteToken');
    localStorage.removeItem('pwaniBiteCurrentUser');
    sessionStorage.removeItem('pwaniBiteToken');
    sessionStorage.removeItem('pwaniBiteCurrentUser');

    const storage = rememberMe ? localStorage : sessionStorage;
    token = authToken;
    storage.setItem('pwaniBiteToken', authToken);
    storage.setItem('pwaniBiteCurrentUser', JSON.stringify(user));
}

// Helper function to get headers
function getHeaders() {
    const headers = {
        'Content-Type': 'application/json'
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
}

// Helper function to handle API responses
async function handleResponse(response) {
    let data = null;
    try {
        data = await response.json();
    } catch (e) {
        data = null;
    }

    if (!response.ok) {
        let message = 'An error occurred';
        if (data && typeof data === 'object') {
            if (typeof data.error === 'string') {
                message = data.error;
            } else if (typeof data.detail === 'string') {
                message = data.detail;
            } else if (typeof data.message === 'string') {
                message = data.message;
            } else {
                // DRF-style field errors: { field: ["msg", ...] }
                for (const key of Object.keys(data)) {
                    const value = data[key];
                    if (Array.isArray(value) && value.length && typeof value[0] === 'string') {
                        message = value.join(' ');
                        break;
                    }
                }
            }
        } else {
            message = `Request failed (HTTP ${response.status})`;
        }
        throw new Error(message);
    }

    return data === null ? {} : data;
}

// ============ AUTHENTICATION ============

// Register new user
async function register(userData) {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(userData)
    });

    const data = await handleResponse(response);

    // Store token if registration successful
    if (data.token) {
        storeAuthSession(data.token, data.user, true);
    }

    return data;
}

// Login user
async function login(identifier, password, rememberMe = true) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ identifier, email: identifier, password })
    });

    const data = await handleResponse(response);

    // Store token if login successful
    if (data.token) {
        storeAuthSession(data.token, data.user, rememberMe);
    }

    return data;
}

async function getGoogleAuthConfig() {
    const response = await fetch(`${API_BASE_URL}/auth/google/config`, {
        method: 'GET',
        headers: getHeaders()
    });
    return await handleResponse(response);
}

async function googleSignIn(credential, nonce, rememberMe = true) {
    const response = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ credential, nonce })
    });
    const data = await handleResponse(response);
    if (data.token) storeAuthSession(data.token, data.user, rememberMe);
    return data;
}

async function updateProfile(profileData) {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'PATCH',
        headers: getHeaders(),
        body: JSON.stringify(profileData)
    });
    const data = await handleResponse(response);
    if (data.user) {
        const storage = localStorage.getItem('pwaniBiteToken') ? localStorage : sessionStorage;
        storage.setItem('pwaniBiteCurrentUser', JSON.stringify(data.user));
    }
    return data;
}

async function uploadProfileAvatar(file) {
    const formData = new FormData();
    formData.append('image', file);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API_BASE_URL}/profile/avatar`, {
        method: 'POST', headers, body: formData
    });
    return await handleResponse(response);
}

async function changePassword(passwordData) {
    const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify(passwordData)
    });
    return await handleResponse(response);
}

async function getMyFavorites() {
    const response = await fetch(`${API_BASE_URL}/profile/favorites`, { method: 'GET', headers: getHeaders() });
    return await handleResponse(response);
}

async function addMyFavorite(foodId) {
    const response = await fetch(`${API_BASE_URL}/profile/favorites`, {
        method: 'POST', headers: getHeaders(), body: JSON.stringify({ food_id: foodId })
    });
    return await handleResponse(response);
}

async function removeMyFavorite(foodId) {
    const response = await fetch(`${API_BASE_URL}/profile/favorites/${foodId}`, { method: 'DELETE', headers: getHeaders() });
    return await handleResponse(response);
}

async function getMyAddresses() {
    const response = await fetch(`${API_BASE_URL}/profile/addresses`, { method: 'GET', headers: getHeaders() });
    return await handleResponse(response);
}

async function saveMyAddress(address, addressId = null) {
    const response = await fetch(`${API_BASE_URL}/profile/addresses${addressId ? `/${addressId}` : ''}`, {
        method: addressId ? 'PATCH' : 'POST', headers: getHeaders(), body: JSON.stringify(address)
    });
    return await handleResponse(response);
}

async function deleteMyAddress(addressId) {
    const response = await fetch(`${API_BASE_URL}/profile/addresses/${addressId}`, { method: 'DELETE', headers: getHeaders() });
    return await handleResponse(response);
}

// Logout user
function logout() {
    token = null;
    localStorage.removeItem('pwaniBiteToken');
    localStorage.removeItem('pwaniBiteCurrentUser');
    sessionStorage.removeItem('pwaniBiteToken');
    sessionStorage.removeItem('pwaniBiteCurrentUser');
}

// Get current user
async function getCurrentUser() {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// ============ CANTEENS ============

// Get canteens (public gets active only; admins get all)
async function getCanteens() {
    const response = await fetch(`${API_BASE_URL}/canteens`, {
        method: 'GET',
        headers: getHeaders()
    });
    return await handleResponse(response);
}

// Create canteen (admin only)
async function createCanteen(canteenData) {
    const response = await fetch(`${API_BASE_URL}/canteens`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(canteenData)
    });
    return await handleResponse(response);
}

// Update canteen (admin only)
async function updateCanteen(id, canteenData) {
    const response = await fetch(`${API_BASE_URL}/canteens/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(canteenData)
    });
    return await handleResponse(response);
}

// Delete canteen (admin only)
async function deleteCanteen(id) {
    const response = await fetch(`${API_BASE_URL}/canteens/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
    });
    return await handleResponse(response);
}

// ============ FOOD ============

// Get all food items
async function getFood(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${API_BASE_URL}/food?${queryString}` : `${API_BASE_URL}/food`;

    const response = await fetch(url, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get food by ID
async function getFoodById(id) {
    const response = await fetch(`${API_BASE_URL}/food/${id}`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Add food item (admin only)
async function addFood(foodData) {
    const response = await fetch(`${API_BASE_URL}/food`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(foodData)
    });

    return await handleResponse(response);
}

async function uploadFoodImage(file) {
    const formData = new FormData();
    formData.append('image', file);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const response = await fetch(`${API_BASE_URL}/food/upload-image`, {
        method: 'POST', headers, body: formData
    });
    return await handleResponse(response);
}

// Update food item (admin only)
async function updateFood(id, foodData) {
    const response = await fetch(`${API_BASE_URL}/food/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(foodData)
    });

    return await handleResponse(response);
}

// Delete food item (admin only)
async function deleteFood(id) {
    const response = await fetch(`${API_BASE_URL}/food/${id}`, {
        method: 'DELETE',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get food categories
async function getFoodCategories() {
    const response = await fetch(`${API_BASE_URL}/food/categories/list`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// ============ ORDERS ============

// Get all orders (admin only)
async function getOrders(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${API_BASE_URL}/orders?${queryString}` : `${API_BASE_URL}/orders`;

    const response = await fetch(url, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get current user's orders
async function getMyOrders() {
    const response = await fetch(`${API_BASE_URL}/orders/my-orders`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get order by ID
async function getOrderById(id) {
    const response = await fetch(`${API_BASE_URL}/orders/${id}`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Create new order
async function createOrder(orderData) {
    const response = await fetch(`${API_BASE_URL}/orders`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(orderData)
    });

    return await handleResponse(response);
}

// Update order status (admin only)
async function updateOrderStatus(id, status) {
    const response = await fetch(`${API_BASE_URL}/orders/${id}/status`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ order_status: status })
    });

    return await handleResponse(response);
}

// Cancel order (customer only)
async function cancelOrder(id) {
    const response = await fetch(`${API_BASE_URL}/orders/${id}/cancel`, {
        method: 'PUT',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// ============ PAYMENTS ============

// Get all payments (admin only)
async function getPayments(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${API_BASE_URL}/payments?${queryString}` : `${API_BASE_URL}/payments`;

    const response = await fetch(url, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get payment by order ID
async function getPaymentByOrderId(orderId) {
    const response = await fetch(`${API_BASE_URL}/payments/order/${orderId}`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Create payment
async function createPayment(paymentData) {
    const response = await fetch(`${API_BASE_URL}/payments`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(paymentData)
    });

    return await handleResponse(response);
}

// Update payment status (admin only)
async function updatePaymentStatus(id, status) {
    const response = await fetch(`${API_BASE_URL}/payments/${id}/status`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ payment_status: status })
    });

    return await handleResponse(response);
}

// ============ DELIVERY ============

// Get all deliveries (admin only)
async function getDeliveries(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${API_BASE_URL}/delivery?${queryString}` : `${API_BASE_URL}/delivery`;

    const response = await fetch(url, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get delivery by order ID
async function getDeliveryByOrderId(orderId) {
    const response = await fetch(`${API_BASE_URL}/delivery/order/${orderId}`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get assigned deliveries (delivery person only)
async function getMyDeliveries() {
    const response = await fetch(`${API_BASE_URL}/delivery/my-deliveries`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Assign delivery person (admin only)
async function assignDelivery(orderId, deliveryPersonId) {
    const response = await fetch(`${API_BASE_URL}/delivery/assign`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
            order_id: orderId,
            delivery_person_id: deliveryPersonId
        })
    });

    return await handleResponse(response);
}

// Update delivery status
async function updateDeliveryStatus(id, status) {
    const response = await fetch(`${API_BASE_URL}/delivery/${id}/status`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ delivery_status: status })
    });

    return await handleResponse(response);
}

// Add delivery notes
async function addDeliveryNotes(id, notes) {
    const response = await fetch(`${API_BASE_URL}/delivery/${id}/notes`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({ notes })
    });

    return await handleResponse(response);
}

// ============ FEEDBACK ============

// Get all feedback (admin only)
async function getFeedback() {
    const response = await fetch(`${API_BASE_URL}/feedback`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get feedback by order ID
async function getFeedbackByOrderId(orderId) {
    const response = await fetch(`${API_BASE_URL}/feedback/order/${orderId}`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get current user's feedback
async function getMyFeedback() {
    const response = await fetch(`${API_BASE_URL}/feedback/my-feedback`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Submit feedback
async function submitFeedback(feedbackData) {
    const response = await fetch(`${API_BASE_URL}/feedback`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(feedbackData)
    });

    return await handleResponse(response);
}

// Get average ratings (admin only)
async function getAverageRatings() {
    const response = await fetch(`${API_BASE_URL}/feedback/stats/average`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// ============ REPORTS (Admin Only) ============

// Get sales report
async function getSalesReport(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${API_BASE_URL}/reports/sales?${queryString}` : `${API_BASE_URL}/reports/sales`;

    const response = await fetch(url, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get popular items
async function getPopularItems(limit = 10) {
    const response = await fetch(`${API_BASE_URL}/reports/popular-items?limit=${limit}`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get customer report
async function getCustomerReport() {
    const response = await fetch(`${API_BASE_URL}/reports/customers`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get delivery performance
async function getDeliveryPerformance() {
    const response = await fetch(`${API_BASE_URL}/reports/delivery-performance`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get dashboard statistics
async function getDashboardStats() {
    const response = await fetch(`${API_BASE_URL}/reports/dashboard`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get revenue by category
async function getRevenueByCategory(params = {}) {
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${API_BASE_URL}/reports/revenue-by-category?${queryString}` : `${API_BASE_URL}/reports/revenue-by-category`;

    const response = await fetch(url, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Get hourly orders
async function getHourlyOrders(date = null) {
    const queryString = date ? `?date=${date}` : '';
    const response = await fetch(`${API_BASE_URL}/reports/hourly-orders${queryString}`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// ============ CONTACT ============

// Submit a contact message (public endpoint)
async function submitContact(contactData) {
    const response = await fetch(`${API_BASE_URL}/contact`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(contactData)
    });

    return await handleResponse(response);
}

// ============ USERS (Admin Only) ============

// Get all users (admin only)
async function getUsers() {
    const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Update a user (admin only)
async function updateUser(id, userData) {
    const response = await fetch(`${API_BASE_URL}/users/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(userData)
    });

    return await handleResponse(response);
}

// ============ UTILITY FUNCTIONS ============

// Check if user is authenticated
function isAuthenticated() {
    return token !== null;
}

// Check if user is admin
function isAdmin() {
    const user = getCurrentUserFromStorage();
    return user.role === 'admin';
}

function isCanteenManager() {
    const user = getCurrentUserFromStorage();
    return user.role === 'canteen_manager';
}

// Check if user is customer
function isCustomer() {
    const user = getCurrentUserFromStorage();
    return user.role === 'customer';
}

// Check if user is delivery personnel
function isDelivery() {
    const user = getCurrentUserFromStorage();
    return user.role === 'delivery';
}

// Get current user from localStorage
function getCurrentUserFromStorage() {
    return JSON.parse(localStorage.getItem('pwaniBiteCurrentUser') || sessionStorage.getItem('pwaniBiteCurrentUser') || '{}');
}

// Only allow the known same-site checkout return destination after auth.
function getPostAuthRedirect() {
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    return ['order.html', 'feedback.html'].includes(returnTo) ? returnTo : 'index.html';
}

// ============ M-PESA PAYMENT ============

// Initiate STK Push (Lipa Na M-Pesa Online)
async function initiateMpesaSTKPush(orderId, phoneNumber, amount) {
    const response = await fetch(`${API_BASE_URL}/mpesa/stkpush`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
            order_id: orderId,
            phone_number: phoneNumber,
            amount: amount
        })
    });

    return await handleResponse(response);
}

// Check payment status
async function checkMpesaPaymentStatus(paymentId) {
    const response = await fetch(`${API_BASE_URL}/mpesa/status/${paymentId}`, {
        method: 'GET',
        headers: getHeaders()
    });

    return await handleResponse(response);
}

// Query M-Pesa transaction
async function queryMpesaTransaction(checkoutRequestId) {
    const response = await fetch(`${API_BASE_URL}/mpesa/query`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
            checkout_request_id: checkoutRequestId
        })
    });

    return await handleResponse(response);
}

// Export all functions for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        register,
        login,
        getGoogleAuthConfig,
        googleSignIn,
        updateProfile,
        uploadProfileAvatar,
        changePassword,
        getMyFavorites,
        addMyFavorite,
        removeMyFavorite,
        getMyAddresses,
        saveMyAddress,
        deleteMyAddress,
        logout,
        getCurrentUser,
        getFood,
        getFoodById,
        addFood,
        updateFood,
        deleteFood,
        getFoodCategories,
        getOrders,
        getMyOrders,
        getOrderById,
        createOrder,
        updateOrderStatus,
        cancelOrder,
        getPayments,
        getPaymentByOrderId,
        createPayment,
        updatePaymentStatus,
        getDeliveries,
        getDeliveryByOrderId,
        getMyDeliveries,
        assignDelivery,
        updateDeliveryStatus,
        addDeliveryNotes,
        getFeedback,
        getFeedbackByOrderId,
        getMyFeedback,
        submitFeedback,
        getAverageRatings,
        getSalesReport,
        getPopularItems,
        getCustomerReport,
        getDeliveryPerformance,
        getDashboardStats,
        getRevenueByCategory,
        getHourlyOrders,
        initiateMpesaSTKPush,
        checkMpesaPaymentStatus,
        queryMpesaTransaction,
        submitContact,
        getUsers,
        updateUser,
        isAuthenticated,
        isAdmin,
        isCanteenManager,
        isCustomer,
        isDelivery,
        getCurrentUserFromStorage
    };
}
