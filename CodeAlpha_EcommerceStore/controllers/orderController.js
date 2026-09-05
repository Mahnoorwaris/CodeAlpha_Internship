const Order = require('../models/Order');
const Product = require('../models/Product');

function validateShipping(shipping) {
  const errors = [];
  if (!shipping || typeof shipping !== 'object') {
    return ['Shipping information is required'];
  }
  if (!shipping.fullName || !String(shipping.fullName).trim()) errors.push('Full name is required');
  if (!shipping.phone || !String(shipping.phone).trim()) errors.push('Phone is required');
  if (!shipping.address || !String(shipping.address).trim()) errors.push('Address is required');
  if (!shipping.city || !String(shipping.city).trim()) errors.push('City is required');
  return errors;
}

async function buildValidatedItems(rawItems) {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: 'Order must contain at least one item' };
  }

  const productIds = rawItems.map((item) => String(item.product || '')).filter(Boolean);
  const products = await Product.find({ _id: { $in: productIds } });
  const productsById = new Map(products.map((p) => [String(p._id), p]));

  const validated = [];

  for (const raw of rawItems) {
    const quantity = Number(raw.quantity);

    if (!raw.product) {
      return { error: 'Each order item must reference a product' };
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { error: 'Item quantity must be at least 1' };
    }

    const product = productsById.get(String(raw.product));
    if (!product) {
      return { error: `A product in your cart no longer exists. Please refresh your cart.` };
    }
    if (product.stock < quantity) {
      return { error: `Insufficient stock for "${product.name}" (only ${product.stock} left)` };
    }

    validated.push({
      product: product._id,
      name: product.name,
      price: product.price,
      quantity,
      image: product.image,
    });
  }

  return { items: validated };
}

const createOrder = async (req, res) => {
  try {
    const shippingErrors = validateShipping(req.body.shippingInfo);
    if (shippingErrors.length > 0) {
      return res.status(400).json({ success: false, message: shippingErrors.join(', ') });
    }

    const result = await buildValidatedItems(req.body.orderItems);
    if (result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }

    const totalPrice = Number(
      result.items.reduce((sum, item) => sum + item.price * item.quantity, 0).toFixed(2)
    );

    const decremented = [];

    for (const item of result.items) {
      const updated = await Product.findOneAndUpdate(
        { _id: item.product, stock: { $gte: item.quantity } },
        { $inc: { stock: -item.quantity } },
        { new: true }
      );

      if (!updated) {
        for (const done of decremented) {
          await Product.updateOne({ _id: done.product }, { $inc: { stock: done.quantity } });
        }
        return res.status(409).json({
          success: false,
          message: `Insufficient stock for "${item.name}". Order was not created.`,
        });
      }

      decremented.push({ product: item.product, quantity: item.quantity });
    }

    let order;
    try {
      order = await Order.create({
        user: req.user._id,
        orderItems: result.items,
        shippingInfo: {
          fullName: String(req.body.shippingInfo.fullName).trim(),
          phone: String(req.body.shippingInfo.phone).trim(),
          address: String(req.body.shippingInfo.address).trim(),
          city: String(req.body.shippingInfo.city).trim(),
        },
        totalPrice,
        orderStatus: 'processing',
      });
    } catch (dbError) {
      for (const done of decremented) {
        await Product.updateOne({ _id: done.product }, { $inc: { stock: done.quantity } });
      }
      throw dbError;
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order,
    });
  } catch (error) {
    console.error('Create order error:', error.message);
    res.status(500).json({ success: false, message: 'Something went wrong while creating your order' });
  }
};

const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, count: orders.length, data: orders });
  } catch (error) {
    console.error('My orders error:', error.message);
    res.status(500).json({ success: false, message: 'Something went wrong while loading your orders' });
  }
};

const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    if (String(order.user) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this order' });
    }

    res.status(200).json({ success: true, data: order });
  } catch (error) {
    if (error.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid order id' });
    }
    console.error('Get order error:', error.message);
    res.status(500).json({ success: false, message: 'Something went wrong while loading the order' });
  }
};

module.exports = { createOrder, getMyOrders, getOrderById };
