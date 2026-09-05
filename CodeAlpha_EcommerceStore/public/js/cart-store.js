const CART_KEY = 'codealpha_cart';

function getCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const items = raw ? JSON.parse(raw) : [];
    return Array.isArray(items) ? items : [];
  } catch (error) {
    console.error('Cart data was corrupted, resetting cart.', error);
    saveCart([]);
    return [];
  }
}

function saveCart(items) {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('Could not save cart to localStorage.', error);
  }
  updateCartCount();
}

function cartCount() {
  return getCart().reduce((sum, item) => sum + item.qty, 0);
}

function findCartItem(cart, id) {
  return cart.find((item) => item.id === id);
}

function addToCart(product) {
  const stock = Number(product.stock) || 0;
  const productId = product.id || product._id;

  if (!productId) {
    return { ok: false, message: 'Could not add this product (missing id).' };
  }

  if (stock <= 0) {
    return { ok: false, message: 'Sorry, this product is out of stock.' };
  }

  const cart = getCart();
  const existing = findCartItem(cart, productId);

  if (existing) {
    if (existing.qty >= stock) {
      return { ok: false, message: `Only ${stock} left in stock.` };
    }
    existing.qty += 1;
  } else {
    cart.push({
      id: productId,
      name: product.name,
      price: Number(product.price),
      image: product.image || '',
      stock: stock,
      qty: 1,
    });
  }

  saveCart(cart);
  return { ok: true, message: `${product.name} added to cart.` };
}

function changeQuantity(id, delta) {
  const cart = getCart();
  const item = findCartItem(cart, id);

  if (!item) return;

  const newQty = item.qty + delta;
  if (newQty < 1 || newQty > item.stock) return;

  item.qty = newQty;
  saveCart(cart);
}

function removeFromCart(id) {
  saveCart(getCart().filter((item) => item.id !== id));
}

function clearCart() {
  saveCart([]);
}

function updateCartCount() {
  const badge = document.getElementById('cart-count');
  if (badge) {
    badge.textContent = cartCount();
  }
}

let toastTimer = null;

function showToast(message, type = 'success') {
  let toast = document.getElementById('toast');

  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `toast toast-${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}
