const itemsBox = document.getElementById('cart-items');
const summaryBox = document.getElementById('cart-summary');
const layoutBox = document.getElementById('cart-layout');
const statusArea = document.getElementById('status-area');
const subtitleEl = document.getElementById('cart-subtitle');
const totalEl = document.getElementById('cart-total');

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

function clearStatus() {
  statusArea.innerHTML = '';
}

function showEmptyState() {
  layoutBox.style.display = 'none';
  subtitleEl.textContent = '';
  statusArea.innerHTML =
    '<div class="status-box"><span class="icon">🛒</span>Your cart is empty.<br><a href="/">Browse products</a> and add something you like.</div>';
}

function cartItemRow(item) {
  const name = escapeHtml(item.name);
  const subtotal = formatPrice(item.price * item.qty);
  const imageHtml = item.image
    ? `<img src="${escapeHtml(item.image)}" alt="${name}"
         onerror="this.onerror=null;this.src='/images/no-image.svg'" />`
    : '<img src="/images/no-image.svg" alt="No image available" />';

  return `
    <article class="cart-item" data-id="${escapeHtml(item.id)}">
      <a href="/product.html?id=${encodeURIComponent(item.id)}" class="cart-item-image">${imageHtml}</a>
      <div class="cart-item-info">
        <h3><a href="/product.html?id=${encodeURIComponent(item.id)}">${name}</a></h3>
        <p class="cart-item-price">${formatPrice(item.price)} each</p>
        <p class="cart-item-subtotal">Subtotal: <strong>${subtotal}</strong></p>
      </div>
      <div class="cart-item-actions">
        <div class="qty-controls">
          <button class="qty-btn" data-action="decrease" aria-label="Decrease quantity"
            ${item.qty <= 1 ? 'disabled' : ''}>&minus;</button>
          <span class="qty-value">${item.qty}</span>
          <button class="qty-btn" data-action="increase" aria-label="Increase quantity"
            ${item.qty >= item.stock ? `disabled title="Only ${item.stock} in stock"` : ''}>+</button>
        </div>
        ${item.qty >= item.stock ? `<p class="stock-note">Only ${item.stock} in stock</p>` : ''}
        <button class="remove-btn" data-action="remove">Remove</button>
      </div>
    </article>
  `;
}

function renderCart() {
  const cart = getCart();

  updateCartCount();

  if (cart.length === 0) {
    showEmptyState();
    return;
  }

  clearStatus();
  layoutBox.style.display = '';
  subtitleEl.textContent = `${cart.length} item${cart.length === 1 ? '' : 's'} in your cart`;

  itemsBox.innerHTML = cart.map(cartItemRow).join('');

  const total = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  totalEl.textContent = formatPrice(total);
}

function handleItemClick(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const row = button.closest('.cart-item');
  const id = row.getAttribute('data-id');
  const action = button.getAttribute('data-action');

  if (action === 'increase') changeQuantity(id, 1);
  if (action === 'decrease') changeQuantity(id, -1);
  if (action === 'remove') removeFromCart(id);

  renderCart();
}

function syncStockWithServer() {
  const cart = getCart();
  if (cart.length === 0) return;

  fetch('/api/products')
    .then((response) => {
      if (!response.ok) throw new Error(`Status ${response.status}`);
      return response.json();
    })
    .then((result) => {
      const products = Array.isArray(result.data) ? result.data : [];
      let changed = false;
      let removedNames = [];

      const synced = [];
      for (const item of cart) {
        const product = products.find((p) => p.id === item.id || p._id === item.id);

        if (!product || Number(product.stock) <= 0) {
          removedNames.push(item.name);
          changed = true;
          continue;
        }

        if (product.stock !== item.stock && Number(product.stock) < item.qty) {
          item.qty = Number(product.stock);
          changed = true;
        }
        item.stock = Number(product.stock);
        synced.push(item);
      }

      if (changed) {
        saveCart(synced);
        let note = 'Some items were updated because stock changed.';
        if (removedNames.length > 0) {
          note = `Removed from cart (no longer available): ${removedNames.join(', ')}.`;
        }
        showToast(note, 'error');
      }

      renderCart();
    })
    .catch((error) => {
      console.error('Could not sync stock with server:', error);
      renderCart();
    });
}

itemsBox.addEventListener('click', handleItemClick);

document.getElementById('checkout-btn').addEventListener('click', () => {
  if (getCart().length === 0) {
    showToast('Your cart is empty.', 'error');
    return;
  }
  if (!getToken()) {
    window.location.href = '/login.html?redirect=/checkout.html';
    return;
  }
  window.location.href = '/checkout.html';
});

document.getElementById('clear-cart-btn').addEventListener('click', () => {
  if (getCart().length === 0) return;
  if (confirm('Are you sure you want to remove all items from your cart?')) {
    clearCart();
    renderCart();
    showToast('Cart cleared.');
  }
});

updateCartCount();
renderCart();
syncStockWithServer();
