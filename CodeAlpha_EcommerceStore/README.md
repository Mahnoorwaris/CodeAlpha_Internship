# CodeAlpha Ecommerce Store

A full-stack e-commerce web application built for the **CodeAlpha Full Stack Development Internship — Task 1: Simple E-commerce Store**.

Users can browse products, view product details, manage a shopping cart, register/login, place orders through a secure checkout, and review their own order history.

---

## Features

### Storefront
- **Product Listings** — all products rendered dynamically from the database with image, price, category, stock badge, and description
- **Product Details Page** — full product view (`/product.html?id=<id>`) with Add to Cart
- **Shopping Cart** — add / increase / decrease / remove items, clear cart, per-item subtotals, live total, stock limits enforced client-side, persisted in `localStorage` across refreshes
- **Live Cart Badge** — total item quantity shown on every page, updates instantly
- **Checkout** — shipping form (Full Name, Phone, Address, City) with validation, order summary, loading state, duplicate-submit protection, and an order confirmation screen with the Order ID
- **My Orders** — authenticated users see only their own orders (ID, date, items, quantities, status, total)

### Authentication & Backend
- **User Registration & Login/Logout** — bcrypt password hashing, JWT (Bearer token) sessions stored in `localStorage`
- **Protected Routes** — order APIs require a valid JWT; users can only read their own orders (403 otherwise)
- **Secure Order Processing** — server recalculates prices from the database (client-sent prices are ignored), validates quantities against real-time stock, decrements stock atomically, and rolls back partial stock changes if an order fails
- **REST API** — products CRUD, auth, and orders built with Express.js and Mongoose

---

## Technologies Used

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript (ES6+) |
| Backend | Node.js, Express.js |
| Database | MongoDB (Atlas) + Mongoose ODM |
| Authentication | JSON Web Tokens (jsonwebtoken), bcryptjs |
| Environment | dotenv |
| Dev Tooling | nodemon |

---

## Project Structure

```
CodeAlpha_EcommerceStore/
├── server.js                 # Express app entry point
├── seedProducts.js           # Optional: seeds sample products (insert-missing-only)
├── config/
│   └── db.js                 # MongoDB connection
├── models/
│   ├── Product.js            # Product schema
│   ├── User.js               # User schema (+ password hashing)
│   └── Order.js              # Order schema
├── controllers/
│   ├── productController.js  # Product CRUD logic
│   ├── authController.js     # Register / login / me logic
│   └── orderController.js    # Order creation & retrieval logic
├── routes/
│   ├── productRoutes.js      # /api/products
│   ├── authRoutes.js         # /api/auth
│   └── orderRoutes.js        # /api/orders (protected)
├── middleware/
│   └── authMiddleware.js     # JWT "protect" middleware
├── public/                   # Static frontend
│   ├── index.html            # Product listings
│   ├── product.html          # Product details
│   ├── cart.html             # Shopping cart
│   ├── checkout.html         # Checkout + confirmation
│   ├── my-orders.html        # Order history
│   ├── login.html / register.html
│   ├── css/style.css
│   ├── js/                   # Page scripts + shared cart-store.js / auth.js
│   └── images/
├── .env.example              # Template for environment variables
└── package.json
```

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or later
- A [MongoDB Atlas](https://www.mongodb.com/atlas) account (free tier works) — or a local MongoDB instance

### 1. Clone the repository

```bash
git clone https://github.com/<your-username>/CodeAlpha_EcommerceStore.git
cd CodeAlpha_EcommerceStore
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create your environment file

Copy the provided template and fill in your own values:

```bash
cp .env.example .env      # Windows: copy .env.example .env
```

Open `.env` and set:

```env
PORT=5000
MONGO_URI=mongodb+srv://<db_username>:<db_password>@<cluster-hostname>/<database-name>?retryWrites=true&w=majority
JWT_SECRET=replace_with_a_long_random_secret_at_least_32_chars
JWT_EXPIRES_IN=7d
```

> **Where do I find these values?**
> In MongoDB Atlas: **Cluster → Connect → Drivers** shows your connection string.
> Replace `<db_username>`, `<db_password>` (URL-encoded), and add a database name.
> Generate a strong `JWT_SECRET` with any long random string (e.g., 32+ characters).
>
> `.env` is listed in `.gitignore` and will **never** be committed.

### 4. (Optional) Seed sample products

```bash
node seedProducts.js
```

This inserts 8 sample products **only if they are missing**, so it is safe to run multiple times. You can also create products yourself:

```bash
curl -X POST http://localhost:5000/api/products -H "Content-Type: application/json" ^
  -d "{\"name\":\"Headphones\",\"price\":59.99,\"description\":\"Over-ear wireless headphones\",\"category\":\"Electronics\",\"stock\":10,\"image\":\"https://...\"}"
```

### 5. Run the app

```bash
npm start          # production start
# or
npm run dev        # nodemon auto-restart during development
```

Visit **http://localhost:5000**

---

## API Endpoints

| Method | Endpoint | Access | Description |
|---|---|---|---|
| GET | `/api/products` | Public | List all products |
| POST | `/api/products` | Public | Create a product |
| GET | `/api/products/:id` | Public | Get one product |
| PUT | `/api/products/:id` | Public | Update a product |
| DELETE | `/api/products/:id` | Public | Delete a product |
| POST | `/api/auth/register` | Public | Create account, returns JWT |
| POST | `/api/auth/login` | Public | Log in, returns JWT |
| GET | `/api/auth/me` | Private | Current user profile |
| POST | `/api/orders` | Private | Place an order |
| GET | `/api/orders/my-orders` | Private | Logged-in user's orders |
| GET | `/api/orders/:id` | Private | One order (owner only) |
| GET | `/api/health` | Public | Server + DB health check |

Private endpoints require header: `Authorization: Bearer <token>`

---

## Security Notes

- Passwords are hashed with bcrypt (never stored or returned in plain text)
- JWTs expire after `JWT_EXPIRES_IN`; secrets are loaded from environment variables only
- Order prices and totals are always computed server-side from database values
- Stock is validated and decremented atomically; failed orders roll back partial changes
- Users can never access another user's orders

---

## Author

Built as part of the [CodeAlpha](https://codealpha.in) Full Stack Development internship program.
