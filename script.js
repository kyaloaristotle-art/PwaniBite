// Mobile Hamburger Menu
document.addEventListener('DOMContentLoaded', function() {
    // Add hamburger menu button to main navbar
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        const hamburger = document.createElement('button');
        hamburger.className = 'hamburger';
        hamburger.innerHTML = '<span></span><span></span><span></span>';
        hamburger.setAttribute('aria-label', 'Toggle navigation menu');

        // Insert hamburger after logo
        const logo = navbar.querySelector('.logo');
        if (logo) {
            logo.insertAdjacentElement('afterend', hamburger);
        }

        // Toggle menu on click
        hamburger.addEventListener('click', function() {
            const navLinks = navbar.querySelector('.nav-links');
            if (navLinks) {
                navLinks.classList.toggle('active');
                hamburger.classList.toggle('active');
            }
        });

        // Close menu when clicking a link
        const navLinks = navbar.querySelectorAll('.nav-links a');
        navLinks.forEach(link => {
            link.addEventListener('click', function() {
                const navList = navbar.querySelector('.nav-links');
                if (navList) {
                    navList.classList.remove('active');
                    hamburger.classList.remove('active');
                }
            });
        });
    }

    // Add hamburger menu button to admin navbar
    const adminNavbar = document.querySelector('.admin-navbar');
    if (adminNavbar) {
        const adminHamburger = document.createElement('button');
        adminHamburger.className = 'admin-hamburger';
        adminHamburger.innerHTML = '<span></span><span></span><span></span>';
        adminHamburger.setAttribute('aria-label', 'Toggle admin navigation menu');

        // Insert hamburger after admin logo
        const adminLogo = adminNavbar.querySelector('.admin-logo');
        if (adminLogo) {
            adminLogo.insertAdjacentElement('afterend', adminHamburger);
        }

        // Toggle menu on click
        adminHamburger.addEventListener('click', function() {
            const sidebar = document.querySelector('.sidebar');
            if (sidebar) {
                sidebar.classList.toggle('active');
                adminHamburger.classList.toggle('active');
            }
        });
    }

    // Shopping Cart Functionality
    initializeCart();

    // Authentication UI
    updateAuthUI();

    // Order Summary on Order Page
    displayOrderSummary();

    // Form Validation
    // Order Form Validation
    const orderForm = document.querySelector('.order-section form');
    if (orderForm) {
        orderForm.addEventListener('submit', async function(e) {
            e.preventDefault();

            const name = document.getElementById('name').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const hostel = document.getElementById('hostel').value;
            const block = document.getElementById('block').value;
            const room = document.getElementById('room').value.trim();
            const time = document.getElementById('time').value;

            // Validate name
            if (name.length < 2) {
                showError('name', 'name-help');
                return;
            } else {
                clearError('name', 'name-help');
            }

            // Validate phone number (Kenyan format)
            const phoneRegex = /^(07|01)[0-9]{8}$/;
            if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
                showError('phone', 'phone-help');
                return;
            } else {
                clearError('phone', 'phone-help');
            }

            // Validate hostel selection
            if (!hostel) {
                showError('hostel', 'hostel-help');
                return;
            } else {
                clearError('hostel', 'hostel-help');
            }

            // Validate block selection
            if (!block) {
                showError('block', 'block-help');
                return;
            } else {
                clearError('block', 'block-help');
            }

            // Validate room number
            if (room.length < 2) {
                showError('room', 'room-help');
                return;
            } else {
                clearError('room', 'room-help');
            }

            // Validate cart has items
            const cart = JSON.parse(localStorage.getItem('pwaniBiteCart')) || [];
            if (cart.length === 0) {
                alert('Your cart is empty. Please add items before placing an order.');
                return;
            }

            if (typeof isAuthenticated !== 'function' || !isAuthenticated()) {
                window.location.href = 'login.html?returnTo=order.html';
                return;
            }

            // Validate delivery time
            if (!time) {
                showError('time', 'time-help');
                return;
            } else {
                clearError('time', 'time-help');
            }

            // Payment method and phone
            const paymentMethodElem = orderForm.querySelector('input[name="payment-method"]:checked');
            const paymentMethod = paymentMethodElem ? paymentMethodElem.value : 'M-Pesa';
            const mpesaPhoneElem = document.getElementById('mpesa-phone');
            const mpesaPhone = mpesaPhoneElem && mpesaPhoneElem.value.trim() ? mpesaPhoneElem.value.trim() : phone;

            if (paymentMethod === 'M-Pesa') {
                if (!mpesaPhone || !mpesaPhone.match(/^(07|01|254|\+254)[0-9]{8,9}$/)) {
                    showError('mpesa-phone', 'mpesa-phone-help');
                    return;
                } else {
                    clearError('mpesa-phone', 'mpesa-phone-help');
                }
            }

            const message = document.getElementById('message') ? document.getElementById('message').value.trim() : '';

            const submitBtn = orderForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn ? submitBtn.textContent : 'Place Order';
            if (submitBtn) {
                submitBtn.textContent = paymentMethod === 'M-Pesa' ? 'Initiating M-Pesa...' : 'Placing Order...';
                submitBtn.disabled = true;
            }

            let orderNumber = 'PB' + Date.now().toString().slice(-6) + Math.floor(10 + Math.random() * 90);
            let orderId = null;
            let orderTotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

            // Persist authenticated orders before showing a confirmation. If the API
            // is unavailable, keep the cart intact so the customer can retry.
            if (typeof isAuthenticated === 'function' && isAuthenticated()) {
                if (typeof createOrder !== 'function') {
                    if (submitBtn) {
                        submitBtn.textContent = originalBtnText;
                        submitBtn.disabled = false;
                    }
                    alert('Ordering is temporarily unavailable. Please try again.');
                    return;
                }
                try {
                    const orderPayload = {
                        delivery_location: `${hostel}, ${block}, Room ${room}`,
                        hostel: hostel,
                        block: block,
                        room: room,
                        delivery_time: time,
                        special_instructions: message,
                        items: cart.map(item => ({
                            food_name: item.name,
                            food_id: item.food_id || null,
                            quantity: item.quantity,
                            price: item.price
                        }))
                    };

                    const response = await createOrder(orderPayload);
                    if (response && response.order_number) {
                        orderNumber = response.order_number;
                        orderId = response.order_id;
                        if (response.total_amount) {
                            orderTotal = parseFloat(response.total_amount);
                        }
                    }
                } catch (apiErr) {
                    console.error('Backend API order creation failed:', apiErr.message);
                    if (submitBtn) {
                        submitBtn.textContent = originalBtnText;
                        submitBtn.disabled = false;
                    }
                    alert('Your order could not be submitted. Your cart is still saved; please try again.');
                    return;
                }
            }

            const orderDetailsObj = {
                orderId: orderId,
                orderNumber: orderNumber,
                name: name,
                phone: phone,
                mpesaPhone: mpesaPhone,
                hostel: hostel,
                block: block,
                room: room,
                cart: [...cart],
                total: orderTotal,
                time: time,
                message: message,
                paymentMethod: paymentMethod
            };

            // Reset form and cart
            clearCart();
            orderForm.reset();

            if (submitBtn) {
                submitBtn.textContent = originalBtnText;
                submitBtn.disabled = false;
            }

            if (paymentMethod === 'M-Pesa') {
                handleMpesaCheckoutFlow(orderDetailsObj);
            } else {
                showOrderConfirmation(orderDetailsObj);
            }
        });
    }

    // Contact Form Validation
    const contactForm = document.querySelector('.contact-form form');
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();

            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const phone = document.getElementById('phone').value.trim();
            const subject = document.getElementById('subject').value.trim();
            const message = document.getElementById('message').value.trim();

            // Validate name
            if (name.length < 2) {
                showError('name', 'contact-name-help');
                return;
            } else {
                clearError('name', 'contact-name-help');
            }

            // Validate email
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showError('email', 'contact-email-help');
                return;
            } else {
                clearError('email', 'contact-email-help');
            }

            // Validate phone if provided
            if (phone) {
                const phoneRegex = /^(07|01)[0-9]{8}$/;
                if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
                    showError('phone', 'contact-phone-help');
                    return;
                } else {
                    clearError('phone', 'contact-phone-help');
                }
            }

            // Validate subject
            if (subject.length < 3) {
                showError('subject', 'contact-subject-help');
                return;
            } else {
                clearError('subject', 'contact-subject-help');
            }

            // Validate message
            if (message.length < 10) {
                showError('message', 'contact-message-help');
                return;
            } else {
                clearError('message', 'contact-message-help');
            }

            // If all validations pass, show success message
            alert('Message sent successfully! We will get back to you soon.');
            contactForm.reset();
        });
    }

    // Feedback Form Validation
    const feedbackForm = document.querySelector('.feedback-section form');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', function(e) {
            e.preventDefault();

            const name = document.getElementById('name').value.trim();
            const orderNumber = document.getElementById('order-number').value.trim();
            const foodRating = document.querySelector('input[name="food-rating"]:checked');
            const deliveryRating = document.querySelector('input[name="delivery-rating"]:checked');
            const overall = document.getElementById('overall').value;
            const comments = document.getElementById('comments').value.trim();
            const recommend = document.querySelector('input[name="recommend"]:checked');

            // Validate name
            if (name.length < 2) {
                showError('name', 'feedback-name-help');
                return;
            } else {
                clearError('name', 'feedback-name-help');
            }

            // Validate food rating
            if (!foodRating) {
                const foodGroup = document.querySelector('.rating-group');
                if (foodGroup) foodGroup.classList.add('error');
                const foodHelp = document.getElementById('food-rating-help');
                if (foodHelp) foodHelp.style.display = 'block';
                return;
            } else {
                const foodGroup = document.querySelector('.rating-group');
                if (foodGroup) foodGroup.classList.remove('error');
                const foodHelp = document.getElementById('food-rating-help');
                if (foodHelp) foodHelp.style.display = 'none';
            }

            // Validate delivery rating
            if (!deliveryRating) {
                const deliveryGroup = document.querySelectorAll('.rating-group')[1];
                if (deliveryGroup) deliveryGroup.classList.add('error');
                const deliveryHelp = document.getElementById('delivery-rating-help');
                if (deliveryHelp) deliveryHelp.style.display = 'block';
                return;
            } else {
                const deliveryGroup = document.querySelectorAll('.rating-group')[1];
                if (deliveryGroup) deliveryGroup.classList.remove('error');
                const deliveryHelp = document.getElementById('delivery-rating-help');
                if (deliveryHelp) deliveryHelp.style.display = 'none';
            }

            // Validate overall rating
            if (!overall) {
                showError('overall', 'overall-help');
                return;
            } else {
                clearError('overall', 'overall-help');
            }

            // Validate comments
            if (comments.length < 10) {
                showError('comments', 'comments-help');
                return;
            } else {
                clearError('comments', 'comments-help');
            }

            // Validate recommendation
            if (!recommend) {
                const recommendGroup = document.querySelector('.recommend-group');
                if (recommendGroup) recommendGroup.classList.add('error');
                const recommendHelp = document.getElementById('recommend-help');
                if (recommendHelp) recommendHelp.style.display = 'block';
                return;
            } else {
                const recommendGroup = document.querySelector('.recommend-group');
                if (recommendGroup) recommendGroup.classList.remove('error');
                const recommendHelp = document.getElementById('recommend-help');
                if (recommendHelp) recommendHelp.style.display = 'none';
            }

            // If all validations pass, submit feedback
            const feedbackPayload = {
                order_id: parseInt(orderNumber.replace(/[^0-9]/g, '')) || 1,
                food_rating: parseInt(foodRating.value),
                delivery_rating: parseInt(deliveryRating.value),
                overall_rating: parseInt(overall),
                recommend: recommend.value === 'yes',
                comments: comments
            };

            if (typeof isAuthenticated === 'function' && isAuthenticated() && typeof submitFeedback === 'function') {
                submitFeedback(feedbackPayload).catch(err => console.warn('Feedback API note:', err.message));
            }

            alert('Thank you for your feedback! We appreciate your opinion.');
            feedbackForm.reset();
        });
    }

    // Helper functions for form validation
    function showError(inputId, helpId) {
        const input = document.getElementById(inputId);
        const help = document.getElementById(helpId);
        if (input) input.classList.add('error');
        if (help) help.style.display = 'block';
    }

    function clearError(inputId, helpId) {
        const input = document.getElementById(inputId);
        const help = document.getElementById(helpId);
        if (input) input.classList.remove('error');
        if (help) help.style.display = 'none';
    }

    // M-Pesa Checkout Flow Handler
    async function handleMpesaCheckoutFlow(orderData) {
        const total = orderData.total || orderData.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const phone = orderData.mpesaPhone || orderData.phone;

        // Create M-Pesa Modal
        const mpesaModal = document.createElement('div');
        mpesaModal.className = 'order-confirmation-modal';
        mpesaModal.innerHTML = `
            <div class="modal-content" style="max-width: 480px; text-align: center;">
                <div class="modal-header" style="background: #008751; color: white; border-top-left-radius: 8px; border-top-right-radius: 8px;">
                    <h2 style="color: white; margin: 0; font-size: 20px;">📱 Lipa na M-Pesa Online</h2>
                </div>
                <div class="modal-body" style="padding: 25px 20px;">
                    <div style="font-size: 42px; margin-bottom: 10px;" class="pulsing-phone">📲</div>
                    <h3 style="color: #063b2f; margin: 0 0 10px 0;">KSh ${total}</h3>
                    <p style="color: #555; margin-bottom: 15px;">STK PIN Prompt sent to <strong>${phone}</strong></p>

                    <div id="mpesa-status-box" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; margin-bottom: 20px; font-size: 14px; color: #166534;">
                        <span id="mpesa-status-text">⏳ Waiting for you to enter your M-Pesa PIN on your phone...</span>
                    </div>

                    <p style="font-size: 13px; color: #666; margin-bottom: 20px;">
                        Check your Safaricom mobile screen. Enter your secret PIN to authorize the transaction.
                    </p>

                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button class="btn" id="confirm-mpesa-btn" style="background: #008751; border-color: #008751;">
                            ✓ I have entered my PIN
                        </button>
                        <button class="btn secondary-btn" id="fallback-cash-btn">
                            Pay with Cash on Delivery instead
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(mpesaModal);

        let pollInterval = null;
        let paymentId = null;

        // Clean up helper
        const cleanup = () => {
            if (pollInterval) clearInterval(pollInterval);
            mpesaModal.remove();
        };

        // If orderId is present and backend is connected, initiate real STK Push
        if (orderData.orderId && typeof initiateMpesaSTKPush === 'function') {
            try {
                const res = await initiateMpesaSTKPush(orderData.orderId, phone, total);
                if (res && res.payment_id) {
                    paymentId = res.payment_id;

                    // Poll status every 3 seconds for 30 seconds
                    let attempts = 0;
                    pollInterval = setInterval(async () => {
                        attempts++;
                        if (attempts > 12) {
                            clearInterval(pollInterval);
                            return;
                        }

                        try {
                            if (typeof checkMpesaPaymentStatus === 'function') {
                                const statusRes = await checkMpesaPaymentStatus(paymentId);
                                if (statusRes && statusRes.payment_status === 'Completed') {
                                    clearInterval(pollInterval);
                                    cleanup();
                                    orderData.paymentStatus = 'Paid (M-Pesa)';
                                    orderData.transactionId = statusRes.transaction_id || ('MP' + Date.now().toString().slice(-8));
                                    showOrderConfirmation(orderData);
                                }
                            }
                        } catch (pollErr) {
                            console.warn('Payment check poll:', pollErr.message);
                        }
                    }, 3000);
                }
            } catch (err) {
                console.warn('STK Push initiation notice:', err.message);
                const statusBox = mpesaModal.querySelector('#mpesa-status-box');
                const statusText = mpesaModal.querySelector('#mpesa-status-text');
                if (statusBox && statusText) {
                    statusBox.style.background = '#fffbeb';
                    statusBox.style.borderColor = '#fef3c7';
                    statusBox.style.color = '#92400e';
                    statusText.textContent = '💡 ' + (err.message || 'Sandbox simulated payment: Click confirm when ready');
                }
            }
        }

        // Action buttons
        const confirmBtn = mpesaModal.querySelector('#confirm-mpesa-btn');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
                if (orderData.orderId) {
                    const statusText = mpesaModal.querySelector('#mpesa-status-text');
                    if (statusText) {
                        statusText.textContent = 'Payment status is confirmed by Safaricom. Please complete the prompt on your phone and wait for confirmation.';
                    }
                    return;
                }
                cleanup();
                orderData.paymentStatus = 'Paid (M-Pesa)';
                orderData.transactionId = 'MP' + Date.now().toString().slice(-8);
                showOrderConfirmation(orderData);
            });
        }

        const fallbackCashBtn = mpesaModal.querySelector('#fallback-cash-btn');
        if (fallbackCashBtn) {
            fallbackCashBtn.addEventListener('click', () => {
                cleanup();
                orderData.paymentMethod = 'Cash on Delivery';
                orderData.paymentStatus = 'Pending (Cash at Hostel)';
                showOrderConfirmation(orderData);
            });
        }
    }

    // Order Confirmation Modal
    function showOrderConfirmation(orderData) {
        // Use backend order number or fallback
        const orderNumber = orderData.orderNumber || ('PB' + String(Math.floor(Math.random() * 1000)).padStart(3, '0'));

        // Calculate total
        const total = orderData.total || orderData.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const paymentMethod = orderData.paymentMethod || 'Cash';
        const paymentStatus = orderData.paymentStatus || (paymentMethod === 'Cash' || paymentMethod === 'Cash on Delivery' ? 'Cash on Delivery' : 'Paid');

        // Generate items list
        let itemsHtml = '';
        orderData.cart.forEach(item => {
            itemsHtml += `<p>• ${item.name} x${item.quantity} - KSh ${item.price * item.quantity}</p>`;
        });

        // Create modal
        const modal = document.createElement('div');
        modal.className = 'order-confirmation-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Order Confirmed! 🎉</h2>
                    <button class="close-modal" aria-label="Close modal">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="order-number">
                        <p>Order Number:</p>
                        <h3>${orderNumber}</h3>
                    </div>
                    <div class="order-details">
                        <p><strong>Name:</strong> ${orderData.name}</p>
                        <p><strong>Phone:</strong> ${orderData.phone}</p>
                        <p><strong>Items:</strong></p>
                        ${itemsHtml}
                        <p><strong>Total:</strong> KSh ${total}</p>
                        <p><strong>Payment:</strong> <span style="background: #e6f4ea; color: #137333; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${paymentStatus}</span></p>
                        ${orderData.transactionId ? `<p><strong>M-Pesa Ref:</strong> ${orderData.transactionId}</p>` : ''}
                        <p><strong>Delivery Location:</strong> ${orderData.hostel}, ${orderData.block}, Room ${orderData.room}</p>
                        <p><strong>Delivery Time:</strong> ${orderData.time}</p>
                        ${orderData.message ? `<p><strong>Special Instructions:</strong> ${orderData.message}</p>` : ''}
                    </div>
                    <div class="delivery-estimate">
                        <p>⏱️ Estimated delivery time: 30-45 minutes</p>
                    </div>
                </div>
                <div class="modal-footer" style="display: flex; gap: 10px; justify-content: flex-end;">
                    <a href="orders.html" class="btn" style="text-decoration: none;">Track in My Orders</a>
                    <button class="btn secondary-btn close-modal-btn">Done</button>
                </div>
            </div>
        `;

        // Add modal to page
        document.body.appendChild(modal);

        // Close modal functionality
        const closeButtons = modal.querySelectorAll('.close-modal, .close-modal-btn');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                modal.remove();
            });
        });

        // Close on backdrop click
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Close on Escape key
        document.addEventListener('keydown', function escHandler(e) {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escHandler);
            }
        });

        // Save order to localStorage for order history
        saveOrderToHistory({
            orderNumber: orderNumber,
            name: orderData.name,
            phone: orderData.phone,
            cart: orderData.cart,
            total: total,
            hostel: orderData.hostel,
            block: orderData.block,
            room: orderData.room,
            time: orderData.time,
            message: orderData.message,
            paymentMethod: paymentMethod,
            paymentStatus: paymentStatus,
            status: 'Pending',
            createdAt: new Date().toISOString()
        });
    }

    function saveOrderToHistory(order) {
        const orders = JSON.parse(localStorage.getItem('pwaniBiteOrders')) || [];
        orders.push(order);
        localStorage.setItem('pwaniBiteOrders', JSON.stringify(orders));
    }
});

// Shopping Cart Functions
function addToCart(name, price) {
    let cart = JSON.parse(localStorage.getItem('pwaniBiteCart')) || [];

    const existingItem = cart.find(item => item.name === name);

    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            name: name,
            price: price,
            quantity: 1
        });
    }

    localStorage.setItem('pwaniBiteCart', JSON.stringify(cart));
    updateCartCount();

    // Show notification
    showNotification(`${name} added to cart!`);
}

function removeFromCart(name) {
    let cart = JSON.parse(localStorage.getItem('pwaniBiteCart')) || [];
    cart = cart.filter(item => item.name !== name);
    localStorage.setItem('pwaniBiteCart', JSON.stringify(cart));
    updateCartCount();

    if (document.querySelector('.cart-items')) {
        displayCart();
    }
}

function updateQuantity(name, change) {
    let cart = JSON.parse(localStorage.getItem('pwaniBiteCart')) || [];
    const item = cart.find(item => item.name === name);

    if (item) {
        item.quantity += change;
        if (item.quantity <= 0) {
            removeFromCart(name);
            return;
        }
    }

    localStorage.setItem('pwaniBiteCart', JSON.stringify(cart));
    updateCartCount();

    if (document.querySelector('.cart-items')) {
        displayCart();
    }
}

function updateCartCount() {
    const cart = JSON.parse(localStorage.getItem('pwaniBiteCart')) || [];
    const totalCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    const cartCountElements = document.querySelectorAll('.cart-count');
    cartCountElements.forEach(element => {
        element.textContent = totalCount;
    });
}

function getCartTotal() {
    const cart = JSON.parse(localStorage.getItem('pwaniBiteCart')) || [];
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}

function displayCart() {
    const cart = JSON.parse(localStorage.getItem('pwaniBiteCart')) || [];
    const cartItemsContainer = document.querySelector('.cart-items');
    const cartTotalElement = document.querySelector('.cart-total');

    if (!cartItemsContainer) return;

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = '<p class="empty-cart">Your cart is empty</p>';
        if (cartTotalElement) {
            cartTotalElement.textContent = 'KSh 0';
        }
        if (typeof updateFinalTotal === 'function') {
            updateFinalTotal();
        }
        return;
    }

    let html = '';
    cart.forEach(item => {
        html += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <h4>${item.name}</h4>
                    <p>KSh ${item.price} each</p>
                </div>
                <div class="cart-item-controls">
                    <button class="quantity-btn" onclick="updateQuantity('${item.name}', -1)">-</button>
                    <span class="quantity">${item.quantity}</span>
                    <button class="quantity-btn" onclick="updateQuantity('${item.name}', 1)">+</button>
                    <button class="remove-btn" onclick="removeFromCart('${item.name}')">Remove</button>
                </div>
                <div class="cart-item-total">
                    <p>KSh ${item.price * item.quantity}</p>
                </div>
            </div>
        `;
    });

    cartItemsContainer.innerHTML = html;

    if (cartTotalElement) {
        cartTotalElement.textContent = 'KSh ' + getCartTotal();
    }

    if (typeof updateFinalTotal === 'function') {
        updateFinalTotal();
    }
}

function clearCart() {
    localStorage.removeItem('pwaniBiteCart');
    updateCartCount();
    if (document.querySelector('.cart-items')) {
        displayCart();
    }
    if (typeof updateFinalTotal === 'function') {
        updateFinalTotal();
    }
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 2000);
}

function initializeCart() {
    // Update cart count on page load
    updateCartCount();

    // Add to cart buttons on menu page
    const menuButtons = document.querySelectorAll('.menu-btn');
    menuButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const menuCard = this.closest('.menu-card');
            if (!menuCard) return;

            const foodName = menuCard.querySelector('h2') ? menuCard.querySelector('h2').textContent.trim() : 'Meal';
            const foodPriceEl = menuCard.querySelector('h3');
            let price = 50;

            if (foodPriceEl) {
                const rawPrice = foodPriceEl.textContent;
                // Match first numeric price (e.g., from "KSh 20 / KSh 30" -> 20, "KSh 100" -> 100)
                const priceMatch = rawPrice.match(/\d+(\.\d+)?/);
                if (priceMatch) {
                    price = parseFloat(priceMatch[0]);
                }
            }

            addToCart(foodName, price);
        });
    });
}

// Make cart functions globally accessible for inline onclick handlers
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.updateQuantity = updateQuantity;
window.clearCart = clearCart;
window.handleLogout = handleLogout;
window.showUserInfo = showUserInfo;

// Authentication Functions
function updateAuthUI() {
    const currentUser = (typeof getCurrentUserFromStorage === 'function')
        ? getCurrentUserFromStorage()
        : JSON.parse(localStorage.getItem('pwaniBiteCurrentUser') || '{}');
    const navLinks = document.querySelector('.nav-links');

    if (!navLinks) return;

    // Remove existing auth links if any
    const existingAuthLinks = navLinks.querySelectorAll('.auth-link');
    existingAuthLinks.forEach(link => link.remove());

    if (currentUser && currentUser.user_id) {
        // User is logged in - show orders, user info, and logout
        const ordersLink = document.createElement('li');
        ordersLink.className = 'auth-link';
        ordersLink.innerHTML = `
            <a href="orders.html">My Orders</a>
        `;

        const userLink = document.createElement('li');
        userLink.className = 'auth-link';
        userLink.innerHTML = `
            <a href="#" class="user-info" onclick="showUserInfo()">
                <span>👤</span>
                <span>${currentUser.name.split(' ')[0]}</span>
            </a>
        `;

        const logoutLink = document.createElement('li');
        logoutLink.className = 'auth-link';
        logoutLink.innerHTML = `
            <a href="#" onclick="handleLogout()">Logout</a>
        `;

        navLinks.appendChild(ordersLink);
        navLinks.appendChild(userLink);
        navLinks.appendChild(logoutLink);

        // Add admin link if user is admin
        if (currentUser.role === 'admin') {
            const adminLink = document.createElement('li');
            adminLink.className = 'auth-link';
            adminLink.innerHTML = `
                <a href="admin.html">Admin</a>
            `;
            navLinks.appendChild(adminLink);
        }
    } else {
        // User is not logged in - show login/register
        const loginLink = document.createElement('li');
        loginLink.className = 'auth-link';
        loginLink.innerHTML = `
            <a href="login.html">Login</a>
        `;

        const registerLink = document.createElement('li');
        registerLink.className = 'auth-link';
        registerLink.innerHTML = `
            <a href="register.html">Register</a>
        `;

        navLinks.appendChild(loginLink);
        navLinks.appendChild(registerLink);
    }
}

function handleLogout() {
    // Call API logout to clear token
    try {
        if (typeof logout === 'function') {
            logout();
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
    
    // Clear local storage
    localStorage.removeItem('pwaniBiteCurrentUser');
    localStorage.removeItem('pwaniBiteToken');
    
    alert('You have been logged out successfully.');
    window.location.href = 'index.html';
}

function showUserInfo() {
    const currentUser = (typeof getCurrentUserFromStorage === 'function')
        ? getCurrentUserFromStorage()
        : JSON.parse(localStorage.getItem('pwaniBiteCurrentUser') || '{}');
    if (currentUser) {
        alert(`User: ${currentUser.name}\nEmail: ${currentUser.email}\nPhone: ${currentUser.phone}\nHostel: ${currentUser.hostel || 'Not specified'}`);
    }
}

// Order Summary Display
function displayOrderSummary() {
    const orderSummaryElement = document.getElementById('order-summary');
    if (!orderSummaryElement) return;

    const cart = JSON.parse(localStorage.getItem('pwaniBiteCart')) || [];

    if (cart.length === 0) {
        orderSummaryElement.innerHTML = '<p id="cart-message">Your cart is empty. <a href="menu.html">Add items from menu</a></p>';
        return;
    }

    let html = '';
    let total = 0;

    cart.forEach(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        html += `
            <div class="order-summary-item">
                <span>${item.name} x${item.quantity}</span>
                <span>KSh ${itemTotal}</span>
            </div>
        `;
    });

    html += `
        <div class="order-summary-total">
            <span>Total:</span>
            <span>KSh ${total}</span>
        </div>
    `;

    orderSummaryElement.innerHTML = html;
}
