require('dotenv').config();
const mongoose = require('mongoose');
const Product = require('./models/Product');

const products = [
  {
    name: 'Smart Watch',
    description:
      'Fitness-focused smart watch with heart-rate monitoring, GPS tracking, and a 7-day battery life on a bright AMOLED display.',
    price: 199.99,
    category: 'Electronics',
    stock: 10,
    image: 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?q=80&w=800&auto=format&fit=crop',
  },
  {
    name: 'Mechanical Keyboard',
    description:
      'Compact 75% mechanical keyboard with tactile switches, per-key RGB backlighting, and a durable aluminium frame. USB-C wired.',
    price: 129.99,
    category: 'Electronics',
    stock: 8,
    image: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?q=80&w=800&auto=format&fit=crop',
  },
  {
    name: 'Bluetooth Speaker',
    description:
      'Portable smart speaker with rich 360-degree sound, voice assistant support, and a compact design that fits anywhere at home.',
    price: 59.99,
    category: 'Electronics',
    stock: 12,
    image: 'https://images.unsplash.com/photo-1589003077984-894e133dabab?q=80&w=800&auto=format&fit=crop',
  },
  {
    name: 'Laptop Backpack',
    description:
      'Water-resistant everyday backpack with a padded 15-inch laptop sleeve, organizer pockets, and a comfortable airflow back panel.',
    price: 79.99,
    category: 'Accessories',
    stock: 9,
    image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=800&auto=format&fit=crop',
  },
  {
    name: 'Wireless Mouse',
    description:
      'Ergonomic wireless mouse with silent clicks, adjustable DPI, and a rechargeable battery that lasts up to 70 days on one charge.',
    price: 29.99,
    category: 'Electronics',
    stock: 20,
    image: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?q=80&w=800&auto=format&fit=crop',
  },
  {
    name: 'Running Shoes',
    description:
      'Lightweight running shoes with responsive cushioning, a breathable mesh upper, and grippy outsole for road and trail runs.',
    price: 99.99,
    category: 'Footwear',
    stock: 7,
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=800&auto=format&fit=crop',
  },
];

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);

  let inserted = 0;
  let skipped = 0;

  for (const product of products) {
    const existing = await Product.findOne({ name: product.name });
    if (existing) {
      skipped += 1;
      console.log(`Skipped (already exists): ${product.name}`);
      continue;
    }
    await Product.create(product);
    inserted += 1;
    console.log(`Inserted: ${product.name}`);
  }

  const total = await Product.countDocuments();
  console.log(`\nDone. Inserted ${inserted}, skipped ${skipped}. Total products in database: ${total}`);

  await mongoose.disconnect();
}

seed().catch((error) => {
  console.error('Seeding failed:', error.message);
  process.exit(1);
});
