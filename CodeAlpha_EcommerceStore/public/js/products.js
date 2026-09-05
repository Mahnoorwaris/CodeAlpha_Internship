const API_URL = '/api/products';
const grid = document.getElementById('product-grid');
const statusArea = document.getElementById('status-area');
const countEl = document.getElementById('product-count');

function setStatus(html, type = '') {
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

function productCard(product) {
  const productId = product.id || product._id;
  const name = escapeHtml(product.name);
  const category = escapeHtml(product.category);
  const description = escapeHtml(product.description);
  const price = formatPrice(product.price);
  const stock = Number(product.stock);
  const inStock = stock > 0;
  const detailUrl = `/product.html?id=${encodeURIComponent(productId)}`;

  const imageHtml = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="${name}" loading="lazy"
         onerror="this.onerror=null;this.src='/images/no-image.svg'" />`
    : `<img src="/images/no-image.svg" alt="No image available" />`;

  const addButton = inStock
    ? `<button class="btn btn-primary btn-block" data-add-id="${escapeHtml(productId)}">Add to Cart</button>`
    : `<button class="btn btn-primary btn-block" disabled>Out of Stock</button>`;

  return `
    <article class="card">
      <a href="${detailUrl}" class="card-image">${imageHtml}</a>
      <div class="card-body">
        <div class="card-top">
          <h3 class="card-name"><a href="${detailUrl}">${name}</a></h3>
          <span class="card-price">${price}</span>
        </div>
        <div class="badge-row">
          <span class="badge badge-category">${category}</span>
          <span class="badge ${inStock ? 'badge-stock' : 'badge-out'}">
            ${inStock ? `In stock: ${stock}` : 'Out of stock'}
          </span>
        </div>
        <p class="card-description">${description}</p>
        <div class="card-actions">
          ${addButton}
        </div>
      </div>
    </article>
  `;
}

const productsById = {};

grid.addEventListener('click', (event) => {
  const button = event.target.closest('[data-add-id]');
  if (!button) return;

  const product = productsById[button.getAttribute('data-add-id')];
  if (!product) return;

  const result = addToCart(
    Object.assign({}, product, { id: button.getAttribute('data-add-id') })
  );
  showToast(result.message, result.ok ? 'success' : 'error');
});

async function loadProducts() {
  setStatus('<span class="spinner"></span><br>Loading products...');

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const result = await response.json();
    const products = Array.isArray(result.data) ? result.data : [];

    clearStatus();

    if (products.length === 0) {
      countEl.textContent = '';
      setStatus(
        '<span class="icon">🛍️</span>No products available yet.<br>Add some via <strong>POST /api/products</strong> to see them here.'
      );
      return;
    }

    countEl.textContent = `${products.length} product${products.length === 1 ? '' : 's'} found`;

    for (const product of products) {
      productsById[product.id || product._id] = product;
    }

    grid.innerHTML = products.map(productCard).join('');
  } catch (error) {
    console.error('Failed to load products:', error);
    setStatus(
      '<span class="icon">⚠️</span>Something went wrong while loading products.<br>Please make sure the server is running and try again.',
      'status-error'
    );
  }
}

updateCartCount();
loadProducts();
