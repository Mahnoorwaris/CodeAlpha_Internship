const layoutBox = document.getElementById('checkout-layout');
const statusArea = document.getElementById('status-area');
const summaryItems = document.getElementById('summary-items');
const totalEl = document.getElementById('checkout-total');
const subtitleEl = document.getElementById('checkout-subtitle');
const form = document.getElementById('checkout-form');
const errorBox = document.getElementById('form-error');
const submitBtn = document.getElementById('place-order-btn');
const confirmation = document.getElementById('order-confirmation');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatPrice(price) {
  const num = Number(price);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : '$0.00';
}

function requireLogin() {
  if (!getToken()) {
    window.location.href = '/login.html?redirect=/checkout.html';
    return true;
  }
  return false;
}

function showEmptyCart() {
  layoutBox.style.display = 'none';
  subtitleEl.textContent = '';
  statusArea.innerHTML =
    '<div class="status-box"><span class="icon">🛒</span>Your cart is empty.<br><a href="/">Browse products</a> to add items before checkout.</div>';
}

function renderSummary() {
  const cart = getCart();

  updateCartCount();

  if (cart.length === 0) {
    showEmptyCart();
    return false;
  }

  subtitleEl.textContent = `${cart.length} item${cart.length === 1 ? '' : 's'} ready for checkout`;

  summaryItems.innerHTML = cart
    .map(
      (item) => `
      <div class="summary-item">
        <span class="summary-item-product">
          <img src="${item.image ? escapeHtml(item.image) : '/images/no-image.svg'}" alt="${escapeHtml(item.name)}"
               onerror="this.onerror=null;this.src='/images/no-image.svg'" />
          ${escapeHtml(item.name)} &times; ${item.qty}
        </span>
        <strong>${formatPrice(item.price * item.qty)}</strong>
      </div>
    `
    )
    .join('');

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  totalEl.textContent = formatPrice(total);

  return true;
}

function showFormError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const cart = getCart();

  if (cart.length === 0) {
    showFormError('Your cart is empty.');
    return;
  }

  const shippingInfo = {
    fullName: form.fullName.value.trim(),
    phone: form.phone.value.trim(),
    address: form.address.value.trim(),
    city: form.city.value.trim(),
  };

  if (!shippingInfo.fullName || !shippingInfo.phone || !shippingInfo.address || !shippingInfo.city) {
    showFormError('Please fill in all shipping fields.');
    return;
  }

  const orderItems = cart.map((item) => ({ product: item.id, quantity: item.qty }));

  submitBtn.disabled = true;
  submitBtn.textContent = 'Placing order...';
  errorBox.hidden = true;

  try {
    const response = await fetchWithAuth('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderItems, shippingInfo }),
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.success || !result.data) {
      throw new Error(result.message || `Order failed (status ${response.status})`);
    }

    clearCart();
    layoutBox.style.display = 'none';
    statusArea.innerHTML = '';
    document.getElementById('confirmation-order-id').textContent = result.data._id;
    confirmation.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    console.error('Checkout failed:', error);
    showFormError(error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Place Order';
  }
});

if (!requireLogin()) {
  const user = getAuthUser();
  if (user && user.name && !form.fullName.value) {
    form.fullName.value = user.name;
  }
  renderSummary();
}
