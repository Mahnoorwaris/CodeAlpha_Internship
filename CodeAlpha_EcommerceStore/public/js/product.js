const statusArea = document.getElementById('status-area');
const detailBox = document.getElementById('product-detail');

function setStatus(html, type = '') {
  detailBox.innerHTML = '';
  statusArea.innerHTML = `<div class="status-box ${type}">${html}</div>`;
}

function clearStatus() {
  statusArea.innerHTML = '';
}

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

function getProductImageHtml(product) {
  const alt = escapeHtml(product.name);

  if (!product.image) {
    return '<img src="/images/no-image.svg" alt="No image available" />';
  }

  return `<img src="${escapeHtml(product.image)}" alt="${alt}"
     onerror="this.onerror=null;this.src='/images/no-image.svg'" />`;
}

function renderProduct(product) {
  const stock = Number(product.stock);
  const inStock = stock > 0;
  const lowStock = inStock && stock <= 5;

  const stockBadge = inStock
    ? `<span class="badge badge-stock">${lowStock ? `Only ${stock} left` : `In stock: ${stock}`}</span>`
    : '<span class="badge badge-out">Out of stock</span>';

  const button = inStock
    ? `<button id="add-to-cart-btn" class="btn btn-primary">Add to Cart</button>`
    : `<button class="btn btn-primary" disabled>Out of Stock</button>`;

  detailBox.innerHTML = `
    <div class="detail-image">${getProductImageHtml(product)}</div>
    <div class="detail-info">
      <h1>${escapeHtml(product.name)}</h1>
      <p class="detail-price">${formatPrice(product.price)}</p>
      <div class="badge-row">
        <span class="badge badge-category">${escapeHtml(product.category)}</span>
        ${stockBadge}
      </div>
      <h2>Description</h2>
      <p class="detail-description">${escapeHtml(product.description)}</p>
      <div class="detail-actions">
        ${button}
      </div>
    </div>
  `;

  const addBtn = document.getElementById('add-to-cart-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const result = addToCart(product);
      showToast(result.message, result.ok ? 'success' : 'error');
    });
  }
}

async function loadProduct() {
  setStatus('<span class="spinner"></span><br>Loading product...');

  const productId = new URLSearchParams(window.location.search).get('id');

  if (!productId) {
    setStatus('<span class="icon">🔍</span>No product selected.<br><a href="/">Browse all products</a>', 'status-error');
    return;
  }

  try {
    const response = await fetch(`/api/products/${productId}`);
    const result = await response.json().catch(() => ({}));

    if (response.status === 404) {
      setStatus('<span class="icon">🔍</span>This product was not found.<br><a href="/">Browse all products</a>');
      return;
    }

    if (!response.ok || !result.success || !result.data) {
      throw new Error(result.message || `Request failed with status ${response.status}`);
    }

    clearStatus();
    renderProduct(result.data);
    document.title = `${result.data.name} | CodeAlpha Store`;
  } catch (error) {
    console.error('Failed to load product:', error);
    setStatus(
      '<span class="icon">⚠️</span>Something went wrong while loading this product.<br>Please make sure the server is running and try again.',
      'status-error'
    );
  }
}

updateCartCount();
loadProduct();
