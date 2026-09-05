const listEl = document.getElementById('orders-list');
const statusArea = document.getElementById('status-area');
const subtitleEl = document.getElementById('orders-subtitle');

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
    window.location.href = '/login.html?redirect=/my-orders.html';
    return true;
  }
  return false;
}

function formatDate(isoDate) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

function orderCard(order) {
  const itemsHtml = order.orderItems
    .map(
      (item) => `
      <div class="order-item">
        <span class="order-item-name">${escapeHtml(item.name)} &times; ${item.quantity}</span>
        <strong>${formatPrice(item.price * item.quantity)}</strong>
      </div>
    `
    )
    .join('');

  return `
    <article class="order-card">
      <div class="order-head">
        <div>
          <p class="order-id">Order ID: <code>${escapeHtml(order._id || order.id)}</code></p>
          <p class="order-date">${formatDate(order.createdAt)}</p>
        </div>
        <span class="badge badge-category status-${escapeHtml(order.orderStatus)}">${escapeHtml(order.orderStatus)}</span>
      </div>
      <div class="order-items">${itemsHtml}</div>
      <div class="summary-row summary-total">
        <span>Total</span>
        <strong>${formatPrice(order.totalPrice)}</strong>
      </div>
    </article>
  `;
}

async function loadOrders() {
  try {
    const response = await fetchWithAuth('/api/orders/my-orders');
    const result = await response.json().catch(() => ({}));

    if (response.status === 401) {
      logout();
      return;
    }

    if (!response.ok || !result.success) {
      throw new Error(result.message || `Failed to load orders (status ${response.status})`);
    }

    const orders = Array.isArray(result.data) ? result.data : [];

    if (orders.length === 0) {
      subtitleEl.textContent = '';
      statusArea.innerHTML =
        '<div class="status-box"><span class="icon">📦</span>You have no orders yet.<br><a href="/">Start shopping</a> to place your first order.</div>';
      return;
    }

    subtitleEl.textContent = `${orders.length} order${orders.length === 1 ? '' : 's'} placed`;
    listEl.innerHTML = orders.map(orderCard).join('');
  } catch (error) {
    console.error('Failed to load orders:', error);
    statusArea.innerHTML =
      '<div class="status-box status-error"><span class="icon">⚠️</span>Something went wrong while loading your orders.<br>Please make sure the server is running and try again.</div>';
  }
}

if (!requireLogin()) {
  loadOrders();
}
