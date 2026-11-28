document.addEventListener('DOMContentLoaded', initializeProfilePage);

let profileAddressBeingEdited = null;
let profileUser = null;

function profileEscape(value) {
    return typeof escapeHtml === 'function' ? escapeHtml(value == null ? '' : value) : String(value == null ? '' : value);
}

function showProfileMessage(message, isError = false) {
    const element = document.getElementById('profile-message');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-error', isError);
    element.hidden = false;
    window.clearTimeout(showProfileMessage.timer);
    showProfileMessage.timer = window.setTimeout(() => { element.hidden = true; }, 5000);
}

function setProfileUser(user) {
    profileUser = user;
    const displayName = user.name || 'PwaniBite customer';
    const initials = displayName.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    document.getElementById('profile-display-name').textContent = displayName;
    document.getElementById('profile-display-email').textContent = user.email || '';
    document.getElementById('account-name').textContent = displayName;
    document.getElementById('account-email').textContent = user.email || '';
    document.getElementById('account-phone').textContent = user.phone || 'Not added';
    document.getElementById('profile-full-name').value = user.name || '';
    document.getElementById('profile-email').value = user.email || '';
    document.getElementById('profile-phone').value = user.phone || '';
    document.getElementById('profile-avatar-placeholder').textContent = initials || 'PB';

    const avatar = document.getElementById('profile-avatar');
    if (user.avatar_url) {
        avatar.src = user.avatar_url;
        avatar.hidden = false;
        document.getElementById('profile-avatar-placeholder').hidden = true;
        avatar.onerror = () => {
            avatar.hidden = true;
            document.getElementById('profile-avatar-placeholder').hidden = false;
        };
    } else {
        avatar.hidden = true;
        document.getElementById('profile-avatar-placeholder').hidden = false;
    }

    const hasPassword = Boolean(user.has_password);
    document.getElementById('current-password-group').hidden = !hasPassword;
    document.getElementById('current-password').required = hasPassword;
    document.getElementById('password-form-title').textContent = hasPassword ? 'Change Password' : 'Set a Password';
    document.getElementById('password-form-hint').textContent = hasPassword
        ? 'Enter your current password and choose a new one.'
        : 'You signed in with Google. Set a password if you want to use email and password too.';
}

async function initializeProfilePage() {
    if (typeof isAuthenticated !== 'function' || !isAuthenticated()) {
        window.location.href = 'login.html?returnTo=profile.html';
        return;
    }

    try {
        const response = await getCurrentUser();
        profileUser = response.user;
        setProfileUser(profileUser);
    } catch (error) {
        window.location.href = 'login.html?returnTo=profile.html';
        return;
    }

    const editForm = document.getElementById('profile-edit-form');
    const openEditForm = () => {
        editForm.hidden = false;
        document.getElementById('profile-full-name').focus();
    };
    document.getElementById('edit-profile-button').addEventListener('click', openEditForm);
    document.getElementById('update-details-button').addEventListener('click', openEditForm);
    document.getElementById('cancel-profile-edit').addEventListener('click', () => {
        editForm.hidden = true;
        setProfileUser(profileUser);
    });

    editForm.addEventListener('submit', async event => {
        event.preventDefault();
        const submit = editForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        try {
            const response = await updateProfile({
                name: document.getElementById('profile-full-name').value.trim(),
                phone: document.getElementById('profile-phone').value.trim()
            });
            profileUser = { ...profileUser, ...response.user };
            setProfileUser(profileUser);
            editForm.hidden = true;
            showProfileMessage('Your details have been updated.');
        } catch (error) {
            showProfileMessage(error.message || 'Could not update your details.', true);
        } finally {
            submit.disabled = false;
        }
    });

    document.getElementById('profile-avatar-file').addEventListener('change', async event => {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            showProfileMessage('Choose an image no larger than 5 MB.', true);
            event.target.value = '';
            return;
        }
        try {
            const response = await uploadProfileAvatar(file);
            profileUser.avatar_url = response.avatar_url;
            setProfileUser(profileUser);
            showProfileMessage('Your profile picture has been updated.');
        } catch (error) {
            showProfileMessage(error.message || 'Could not upload that picture.', true);
        } finally {
            event.target.value = '';
        }
    });

    await Promise.all([loadProfileOrders(), loadProfileFavorites(), loadFavoriteFoodOptions(), loadProfileAddresses()]);

    document.getElementById('favorite-form').addEventListener('submit', async event => {
        event.preventDefault();
        const foodId = document.getElementById('favorite-food-select').value;
        if (!foodId) return;
        try {
            await addMyFavorite(foodId);
            await loadProfileFavorites();
            showProfileMessage('Food saved to your favorites.');
        } catch (error) {
            showProfileMessage(error.message || 'Could not save that favorite.', true);
        }
    });

    const addressForm = document.getElementById('address-form');
    addressForm.addEventListener('submit', async event => {
        event.preventDefault();
        const fields = new FormData(addressForm);
        const address = {
            label: fields.get('label'),
            delivery_location: fields.get('delivery_location'),
            hostel: fields.get('hostel'),
            block: fields.get('block'),
            room: fields.get('room'),
            is_default: document.getElementById('address-default').checked
        };
        try {
            await saveMyAddress(address, profileAddressBeingEdited);
            resetAddressForm();
            await loadProfileAddresses();
            showProfileMessage('Address saved.');
        } catch (error) {
            showProfileMessage(error.message || 'Could not save that address.', true);
        }
    });

    document.getElementById('cancel-address-edit').addEventListener('click', resetAddressForm);
    document.getElementById('profile-addresses').addEventListener('click', async event => {
        const button = event.target.closest('button[data-address-action]');
        if (!button) return;
        const addressId = Number(button.dataset.addressId);
        const address = button.dataset.address ? JSON.parse(button.dataset.address) : null;
        if (button.dataset.addressAction === 'edit' && address) {
            profileAddressBeingEdited = addressId;
            document.getElementById('address-form-title').textContent = 'Edit address';
            document.getElementById('address-label').value = address.label || '';
            document.getElementById('address-location').value = address.delivery_location || '';
            document.getElementById('address-hostel').value = address.hostel || '';
            document.getElementById('address-block').value = address.block || '';
            document.getElementById('address-room').value = address.room || '';
            document.getElementById('address-default').checked = Boolean(address.is_default);
            document.getElementById('save-address-button').textContent = 'Update Address';
            document.getElementById('cancel-address-edit').hidden = false;
            document.getElementById('address-label').focus();
        } else if (button.dataset.addressAction === 'delete' && window.confirm('Remove this saved address?')) {
            try {
                await deleteMyAddress(addressId);
                await loadProfileAddresses();
                showProfileMessage('Address removed.');
            } catch (error) {
                showProfileMessage(error.message || 'Could not remove that address.', true);
            }
        }
    });

    document.getElementById('profile-favorites').addEventListener('click', async event => {
        const button = event.target.closest('button[data-remove-favorite]');
        if (!button) return;
        try {
            await removeMyFavorite(button.dataset.removeFavorite);
            await loadProfileFavorites();
            showProfileMessage('Favorite removed.');
        } catch (error) {
            showProfileMessage(error.message || 'Could not remove that favorite.', true);
        }
    });

    document.getElementById('password-form').addEventListener('submit', async event => {
        event.preventDefault();
        const form = event.currentTarget;
        const currentPassword = document.getElementById('current-password').value;
        const newPassword = document.getElementById('new-password').value;
        const confirmPassword = document.getElementById('confirm-new-password').value;
        if (newPassword !== confirmPassword) {
            showProfileMessage('The new passwords do not match.', true);
            return;
        }
        try {
            await changePassword({ current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword });
            form.reset();
            showProfileMessage('Password updated successfully.');
            if (profileUser) {
                profileUser.has_password = true;
                setProfileUser(profileUser);
            }
        } catch (error) {
            showProfileMessage(error.message || 'Could not update your password.', true);
        }
    });
}

async function loadProfileOrders() {
    const list = document.getElementById('profile-orders');
    try {
        const response = await getMyOrders();
        const orders = response.orders || [];
        if (!orders.length) {
            list.innerHTML = '<p class="profile-muted">You have not placed any orders yet. <a href="menu.html">Browse the menu</a>.</p>';
            return;
        }
        list.innerHTML = orders.slice(0, 5).map(order => {
            const date = order.order_date ? new Date(order.order_date).toLocaleDateString() : 'Date unavailable';
            const items = (order.items || []).map(item => `${profileEscape(item.food_name)} × ${item.quantity}`).join(', ');
            return `<article class="profile-order-row"><div><strong>Order ${profileEscape(order.order_number || order.order_id)}</strong><p>${profileEscape(date)} · ${items}</p></div><div class="profile-order-meta"><span class="order-status-pill">${profileEscape(order.order_status)}</span><strong>KSh ${Number(order.total_amount || 0).toLocaleString()}</strong></div></article>`;
        }).join('');
    } catch (error) {
        list.innerHTML = `<p class="profile-muted">${profileEscape(error.message || 'Order history is unavailable right now.')}</p>`;
    }
}

async function loadProfileFavorites() {
    const list = document.getElementById('profile-favorites');
    try {
        const response = await getMyFavorites();
        const favorites = response.favorites || [];
        if (!favorites.length) {
            list.innerHTML = '<p class="profile-muted">Your saved foods will show up here.</p>';
            return;
        }
        list.innerHTML = favorites.map(favorite => {
            const food = favorite.food;
            const image = food.image ? `<img src="${profileEscape(food.image)}" alt="" loading="lazy">` : '<span class="favorite-food-placeholder" aria-hidden="true">🍽</span>';
            return `<article class="favorite-food-row">${image}<div class="favorite-food-details"><h3>${profileEscape(food.food_name)}</h3><p>${profileEscape(food.category)} · KSh ${Number(food.price || 0).toLocaleString()}</p></div><button type="button" class="text-button danger-text" data-remove-favorite="${favorite.food_id}">Remove</button></article>`;
        }).join('');
    } catch (error) {
        list.innerHTML = `<p class="profile-muted">${profileEscape(error.message || 'Favorites are unavailable right now.')}</p>`;
    }
}

async function loadFavoriteFoodOptions() {
    const select = document.getElementById('favorite-food-select');
    try {
        const response = await getFood();
        const foods = response.food || [];
        select.innerHTML = '<option value="">Choose a food to save</option>' + foods.map(food =>
            `<option value="${food.food_id}">${profileEscape(food.food_name)} — KSh ${Number(food.price || 0).toLocaleString()}</option>`
        ).join('');
    } catch (error) {
        select.innerHTML = '<option value="">Menu is unavailable</option>';
    }
}

async function loadProfileAddresses() {
    const list = document.getElementById('profile-addresses');
    try {
        const response = await getMyAddresses();
        const addresses = response.addresses || [];
        if (!addresses.length) {
            list.innerHTML = '<p class="profile-muted">No saved addresses yet. Add a campus delivery point above.</p>';
            return;
        }
        list.innerHTML = addresses.map(address => {
            const details = [address.delivery_location, address.hostel, address.block, address.room].filter(Boolean).map(profileEscape).join(' · ');
            const encoded = encodeURIComponent(JSON.stringify(address));
            return `<article class="profile-address-row"><div><div class="address-title-line"><h3>${profileEscape(address.label)}</h3>${address.is_default ? '<span class="default-badge">Default</span>' : ''}</div><p>${details}</p></div><div class="profile-row-actions"><button type="button" class="text-button" data-address-action="edit" data-address-id="${address.address_id}" data-address="${encoded}">Edit</button><button type="button" class="text-button danger-text" data-address-action="delete" data-address-id="${address.address_id}">Remove</button></div></article>`;
        }).join('');
        list.querySelectorAll('[data-address]').forEach(button => {
            try { button.dataset.address = decodeURIComponent(button.dataset.address); } catch (error) { button.dataset.address = ''; }
        });
    } catch (error) {
        list.innerHTML = `<p class="profile-muted">${profileEscape(error.message || 'Addresses are unavailable right now.')}</p>`;
    }
}

function resetAddressForm() {
    profileAddressBeingEdited = null;
    document.getElementById('address-form').reset();
    document.getElementById('address-form-title').textContent = 'Add an address';
    document.getElementById('save-address-button').textContent = 'Save Address';
    document.getElementById('cancel-address-edit').hidden = true;
}
