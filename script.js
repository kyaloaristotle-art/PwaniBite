// Escape user/API-provided strings before inserting into HTML
function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

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

    // Floating WhatsApp contact button (all pages)
    addWhatsAppButton();

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
            const deliveryLocation = document.getElementById('delivery-location').value.trim();
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

            // Validate the campus meeting point
            if (deliveryLocation.length < 3) {
                showError('delivery-location', 'delivery-location-help');
                return;
            } else {
                clearError('delivery-location', 'delivery-location-help');
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
                    const orderCartCanteen = getCartCanteen();
                    const orderPayload = {
                        delivery_location: deliveryLocation,
                        delivery_time: time,
                        special_instructions: message,
                        canteen_id: orderCartCanteen ? orderCartCanteen.canteen_id : null,
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
                deliveryLocation: deliveryLocation,
                cart: [...cart],
                total: orderTotal,
                time: time,
                message: message,
                paymentMethod: paymentMethod,
                canteenName: (getCartCanteen() || {}).canteen_name || null
            };

            if (submitBtn) {
                submitBtn.textContent = originalBtnText;
                submitBtn.disabled = false;
            }

            // Cart and form are only cleared once the order is actually confirmed
            // (see showOrderConfirmation) so an abandoned M-Pesa prompt keeps the cart.
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
        const contactSubject = document.getElementById('subject');
        const requestedSubject = new URLSearchParams(window.location.search).get('subject');
        if (contactSubject && requestedSubject && requestedSubject.toLowerCase().includes('password')) {
            contactSubject.value = 'Password reset help';
        }

        contactForm.addEventListener('submit', async function(e) {
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

            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn ? submitBtn.textContent : 'Send Message';
            if (submitBtn) {
                submitBtn.textContent = 'Sending...';
                submitBtn.disabled = true;
            }

            try {
                if (typeof submitContact === 'function') {
                    await submitContact({ name, email, phone, subject, message });
                    alert('Message sent successfully! We will get back to you soon.');
                    contactForm.reset();
                } else {
                    alert('Messaging is temporarily unavailable. Please try again later.');
                }
            } catch (err) {
                alert('Your message could not be sent: ' + (err.message || 'Please try again.'));
            } finally {
                if (submitBtn) {
                    submitBtn.textContent = originalBtnText;
                    submitBtn.disabled = false;
                }
            }
        });
    }

    // Feedback Form Validation
    const feedbackForm = document.querySelector('.feedback-section form');
    if (feedbackForm) {
        feedbackForm.addEventListener('submit', async function(e) {
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

            // Resolve the order number to a real order_id owned by this user.
            // The API requires a valid order_id; guessing one corrupts feedback data.
            const orderLookup = orderNumber.trim();
            if (!orderLookup) {
                alert('Please enter the order number for the order you are reviewing.');
                return;
            }

            if (typeof isAuthenticated !== 'function' || !isAuthenticated() || typeof getMyOrders !== 'function' || typeof submitFeedback !== 'function') {
                alert('Please log in to submit feedback for your order.');
                window.location.href = 'login.html?returnTo=feedback.html';
                return;
            }

            const submitBtn = feedbackForm.querySelector('button[type="submit"]');
            const originalBtnText = submitBtn ? submitBtn.textContent : 'Submit Feedback';
            if (submitBtn) {
                submitBtn.textContent = 'Submitting...';
                submitBtn.disabled = true;
            }

            try {
                const ordersRes = await getMyOrders();
                const orders = Array.isArray(ordersRes) ? ordersRes : (ordersRes && ordersRes.orders ? ordersRes.orders : []);
                const match = orders.find(o =>
                    String(o.order_number || '').trim().toLowerCase() === orderLookup.toLowerCase()
                );

                if (!match) {
                    alert('We could not find an order with that number on your account. Please check it and try again.');
                    return;
                }

                await submitFeedback({
                    order_id: match.order_id,
                    food_rating: parseInt(foodRating.value),
                    delivery_rating: parseInt(deliveryRating.value),
                    overall_rating: parseInt(overall),
                    recommend: recommend.value === 'yes',
                    comments: comments
                });

                alert('Thank you for your feedback! We appreciate your opinion.');
                feedbackForm.reset();
            } catch (err) {
                alert('Feedback could not be submitted: ' + (err.message || 'Please try again.'));
            } finally {
                if (submitBtn) {
                    submitBtn.textContent = originalBtnText;
                    submitBtn.disabled = false;
                }
            }
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

    // Expose validation helpers for page-level scripts (e.g. register.html)
    window.showError = showError;
    window.clearError = clearError;

    // M-Pesa Checkout Flow Handler
    async function handleMpesaCheckoutFlow(orderData) {
        const total = orderData.total || orderData.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const phone = orderData.mpesaPhone || orderData.phone;

        // Create M-Pesa Modal
        const mpesaModal = document.createElement('div');
        mpesaModal.className = 'order-confirmation-modal';
        mpesaModal.innerHTML = `
            <div class="modal-content" style="max-width: 480px; text-align: center;">
                <div class="modal-header" style="background: #063b2f; color: white; border-top-left-radius: 8px; border-top-right-radius: 8px;">
                    <h2 style="color: white; margin: 0; font-size: 20px;">📱 Lipa na M-Pesa Online</h2>
                </div>
                <div class="modal-body" style="padding: 25px 20px;">
                    <div style="font-size: 42px; margin-bottom: 10px;" class="pulsing-phone">📲</div>
                    <h3 style="color: #063b2f; margin: 0 0 10px 0;">KSh ${total}</h3>
                    <p style="color: #555; margin-bottom: 15px;">STK PIN Prompt sent to <strong>${escapeHtml(phone)}</strong></p>

                    <div id="mpesa-status-box" style="background: #f5f7f6; border: 1px solid #bbf7d0; border-radius: 6px; padding: 12px; margin-bottom: 20px; font-size: 14px; color: #02271f;">
                        <span id="mpesa-status-text">⏳ Waiting for you to enter your M-Pesa PIN on your phone...</span>
                    </div>

                    <p style="font-size: 13px; color: #666; margin-bottom: 20px;">
                        Check your Safaricom mobile screen. Enter your secret PIN to authorize the transaction.
                    </p>

                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button class="btn" id="confirm-mpesa-btn" style="background: #063b2f; border-color: #063b2f;">
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
            fallbackCashBtn.addEventListener('click', async () => {
                // Record a pending Cash payment server-side so the order
                // reflects the chosen payment method.
                if (orderData.orderId && typeof createPayment === 'function') {
                    try {
                        await createPayment({ order_id: orderData.orderId });
                    } catch (payErr) {
                        // 409 means a payment record already exists — safe to continue.
                        console.warn('Cash payment record note:', payErr.message);
                    }
                }
                cleanup();
                orderData.paymentMethod = 'Cash on Delivery';
                orderData.paymentStatus = 'Pending (Cash on Delivery)';
                showOrderConfirmation(orderData);
            });
        }
    }

    // Order Confirmation Modal
    function showOrderConfirmation(orderData) {
        // Order is confirmed — now safe to clear the cart and reset the form
        clearCart();
        const orderFormEl = document.querySelector('.order-section form');
        if (orderFormEl) orderFormEl.reset();

        // Use backend order number or fallback
        const orderNumber = orderData.orderNumber || ('PB' + String(Math.floor(Math.random() * 1000)).padStart(3, '0'));

        // Calculate total
        const total = orderData.total || orderData.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const paymentMethod = orderData.paymentMethod || 'Cash';
        const paymentStatus = orderData.paymentStatus || (paymentMethod === 'Cash' || paymentMethod === 'Cash on Delivery' ? 'Cash on Delivery' : 'Paid');

        // Generate items list
        let itemsHtml = '';
        orderData.cart.forEach(item => {
            itemsHtml += `<p>• ${escapeHtml(item.name)} x${item.quantity} - KSh ${item.price * item.quantity}</p>`;
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
                        <h3>${escapeHtml(orderNumber)}</h3>
                    </div>
                    <div class="order-details">
                        <p><strong>Name:</strong> ${escapeHtml(orderData.name)}</p>
                        <p><strong>Phone:</strong> ${escapeHtml(orderData.phone)}</p>
                        <p><strong>Items:</strong></p>
                        ${itemsHtml}
                        <p><strong>Total:</strong> KSh ${total}</p>
                        <p><strong>Payment:</strong> <span style="background: #e6f4ea; color: #065f46; padding: 2px 8px; border-radius: 4px; font-weight: bold;">${escapeHtml(paymentStatus)}</span></p>
                        ${orderData.canteenName ? `<p><strong>Canteen:</strong> ${escapeHtml(orderData.canteenName)}</p>` : ''}
                        ${orderData.transactionId ? `<p><strong>M-Pesa Ref:</strong> ${escapeHtml(orderData.transactionId)}</p>` : ''}
                        <p><strong>Delivery Location:</strong> ${escapeHtml(orderData.deliveryLocation)}</p>
                        <p><strong>Delivery Time:</strong> ${escapeHtml(orderData.time)}</p>
                        ${orderData.message ? `<p><strong>Special Instructions:</strong> ${escapeHtml(orderData.message)}</p>` : ''}
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
    }
});

// Floating WhatsApp contact button — injected on every page.
// Demo number: 0112296406 -> +254 112 296406
function addWhatsAppButton() {
    if (document.getElementById('whatsapp-float')) return;

    const link = document.createElement('a');
    link.id = 'whatsapp-float';
    link.href = 'https://wa.me/254112296406?text=' + encodeURIComponent('Hello PwaniBite! I have a question.');
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', 'Contact us on WhatsApp');
    link.title = 'Questions or inquiries? Chat with us on WhatsApp';
    link.innerHTML = `
        <svg viewBox="0 0 32 32" width="34" height="34" fill="currentColor" aria-hidden="true">
            <path d="M16.04 2.67C8.5 2.67 2.4 8.77 2.4 16.31c0 2.42.63 4.79 1.82 6.87L2.4 29.33l6.31-1.65a13.6 13.6 0 0 0 7.33 2.15h.01c7.53 0 13.64-6.1 13.64-13.64S23.57 2.67 16.04 2.67zm0 24.96a11.3 11.3 0 0 1-5.76-1.58l-.41-.24-3.74.98 1-3.65-.27-.42a11.28 11.28 0 0 1-1.73-6.05c0-6.24 5.08-11.32 11.33-11.32 3.02 0 5.86 1.18 8 3.32a11.26 11.26 0 0 1 3.32 8c-.01 6.25-5.09 11.33-11.34 11.33zm6.2-8.47c-.34-.17-2-1-2.31-1.11-.31-.11-.54-.17-.77.17-.23.34-.88 1.11-1.08 1.34-.2.23-.4.26-.74.09-.34-.17-1.43-.53-2.73-1.69-.99-.89-1.68-1.99-1.88-2.33-.2-.34-.02-.52.15-.69.16-.16.34-.4.51-.6.17-.2.23-.34.34-.57.11-.23.06-.43-.03-.6-.09-.17-.77-1.87-1.06-2.56-.28-.67-.56-.58-.77-.59l-.66-.01c-.23 0-.6.09-.92.43-.31.34-1.2 1.18-1.2 2.87s1.23 3.33 1.4 3.56c.17.23 2.42 3.7 5.86 5.19.82.35 1.46.56 1.96.72.82.26 1.57.22 2.16.14.66-.1 2-.82 2.28-1.61.28-.79.28-1.47.2-1.61-.09-.14-.31-.23-.65-.4z"/>
        </svg>
        <span class="wa-label">Chat with us</span>
    `;
    document.body.appendChild(link);
}
window.addWhatsAppButton = addWhatsAppButton;

// Shopping Cart Functions
// One order can only come from a single canteen. Cart items carry
// canteen_id/canteen_name so the UI can enforce that before checkout.
function getCartCanteen() {
    const cart = JSON.parse(localStorage.getItem('pwaniBiteCart')) || [];
    const tagged = cart.find(item => item.canteen_id != null);
    const source = tagged || cart[0];
    if (!source) return null;
    return {
        canteen_id: source.canteen_id != null ? source.canteen_id : null,
        canteen_name: source.canteen_name || null
    };
}
window.getCartCanteen = getCartCanteen;

function addToCart(name, price, foodId, canteen) {
    let cart = JSON.parse(localStorage.getItem('pwaniBiteCart')) || [];

    const newCanteenId = canteen && canteen.canteen_id != null ? canteen.canteen_id : null;
    const newCanteenName = canteen && canteen.name ? canteen.name : null;
    const cartCanteen = getCartCanteen();
    if (cart.length > 0 && cartCanteen && cartCanteen.canteen_id != null &&
        newCanteenId != null && cartCanteen.canteen_id !== newCanteenId) {
        alert(`Your cart already has items from ${cartCanteen.canteen_name || 'another canteen'}. One order can only come from a single canteen — clear the cart or remove those items first.`);
        return false;
    }

    const existingItem = cart.find(item => item.name === name);

    if (existingItem) {
        existingItem.quantity += 1;
        if (foodId && !existingItem.food_id) {
            existingItem.food_id = foodId;
        }
        if (newCanteenId != null && existingItem.canteen_id == null) {
            existingItem.canteen_id = newCanteenId;
            existingItem.canteen_name = newCanteenName;
        }
    } else {
        cart.push({
            name: name,
            price: price,
            quantity: 1,
            food_id: foodId || null,
            canteen_id: newCanteenId,
            canteen_name: newCanteenName
        });
    }

    localStorage.setItem('pwaniBiteCart', JSON.stringify(cart));
    updateCartCount();

    // Show notification
    showNotification(`${name} added to cart!`);
    return true;
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
    const cartCanteen = getCartCanteen();
    if (cartCanteen && cartCanteen.canteen_name) {
        html += `<div class="cart-canteen-note">🍽 Ordering from <strong>${escapeHtml(cartCanteen.canteen_name)}</strong> — one order per canteen.</div>`;
    }
    cart.forEach((item, index) => {
        html += `
            <div class="cart-item">
                <div class="cart-item-info">
                    <h4>${escapeHtml(item.name)}</h4>
                    <p>KSh ${item.price} each</p>
                </div>
                <div class="cart-item-controls">
                    <button class="quantity-btn" onclick="cartUpdateQty(${index}, -1)">-</button>
                    <span class="quantity">${item.quantity}</span>
                    <button class="quantity-btn" onclick="cartUpdateQty(${index}, 1)">+</button>
                    <button class="remove-btn" onclick="cartRemoveItem(${index})">Remove</button>
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

// Index-based cart helpers used by displayCart's inline handlers.
// Indices are numeric, so they are safe to interpolate into onclick attributes
// regardless of the characters in the item name.
function cartUpdateQty(index, change) {
    const cart = JSON.parse(localStorage.getItem('pwaniBiteCart')) || [];
    const item = cart[index];
    if (!item) return;
    updateQuantity(item.name, change);
}

function cartRemoveItem(index) {
    const cart = JSON.parse(localStorage.getItem('pwaniBiteCart')) || [];
    const item = cart[index];
    if (!item) return;
    removeFromCart(item.name);
}

window.cartUpdateQty = cartUpdateQty;
window.cartRemoveItem = cartRemoveItem;

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

    // Menu card buttons: add the item to the cart, then follow the link
    // (e.g. "Order Now" navigates to order.html). Dynamic menu buttons render
    // after this runs and bind their own listeners in menu.html.
    const menuButtons = document.querySelectorAll('.menu-btn');
    menuButtons.forEach(btn => {
        btn.addEventListener('click', function(e) {
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
        const userLink = document.createElement('li');
        userLink.className = 'auth-link profile-menu';
        userLink.innerHTML = `
            <a href="profile.html" class="user-info">
                <span>👤</span>
                <span>${escapeHtml(String(currentUser.name || '').split(' ')[0])}</span>
            </a>
            <button type="button" class="profile-menu-trigger" aria-expanded="false" aria-controls="profile-menu-panel">
                <span class="profile-menu-caret" aria-hidden="true">▾</span>
            </button>
            <div class="profile-menu-panel" id="profile-menu-panel" role="menu" hidden>
                <a href="profile.html" role="menuitem">My Profile</a>
                <a href="orders.html" role="menuitem">My Orders</a>
                ${currentUser.role === 'admin' ? '<a href="admin.html" role="menuitem">Admin Access</a>' : ''}
                ${currentUser.role === 'canteen_manager' ? '<a href="canteen-manager.html" role="menuitem">Canteen Management</a>' : ''}
                <button type="button" role="menuitem" class="profile-menu-logout" onclick="handleLogout()">Log Out</button>
            </div>
        `;
        navLinks.appendChild(userLink);

        const trigger = userLink.querySelector('.profile-menu-trigger');
        const panel = userLink.querySelector('.profile-menu-panel');
        const closeProfileMenu = () => {
            panel.hidden = true;
            trigger.setAttribute('aria-expanded', 'false');
        };
        trigger.addEventListener('click', () => {
            const isOpen = trigger.getAttribute('aria-expanded') === 'true';
            panel.hidden = isOpen;
            trigger.setAttribute('aria-expanded', String(!isOpen));
        });
        userLink.querySelectorAll('.profile-menu-panel a').forEach(link => link.addEventListener('click', closeProfileMenu));
        document.addEventListener('click', event => {
            if (!userLink.contains(event.target)) closeProfileMenu();
        });
        userLink.addEventListener('keydown', event => {
            if (event.key === 'Escape') {
                closeProfileMenu();
                trigger.focus();
            }
        });
    } else {
        // User is not logged in - show login/register
        const loginLink = document.createElement('li');
        loginLink.className = 'auth-link';
        loginLink.innerHTML = `
            <a href="login.html">Log In</a>
        `;

        const registerLink = document.createElement('li');
        registerLink.className = 'auth-link';
        registerLink.innerHTML = `
            <a href="register.html">Sign Up</a>
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
    sessionStorage.removeItem('pwaniBiteCurrentUser');
    sessionStorage.removeItem('pwaniBiteToken');
    
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
    const cartCanteen = getCartCanteen();

    if (cartCanteen && cartCanteen.canteen_name) {
        html += `<div class="order-summary-item"><span>Canteen:</span><span>${escapeHtml(cartCanteen.canteen_name)}</span></div>`;
    }

    cart.forEach((item, index) => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        html += `
            <div class="order-summary-item">
                <span>${escapeHtml(item.name)} x${item.quantity}</span>
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
