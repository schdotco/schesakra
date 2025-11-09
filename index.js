// Create Payment Intent untuk suatu Order
app.post('/api/create-payment-intent', authenticate, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "orderId required" });
    }

    const orderRef = admin.firestore().collection('orders').doc(orderId);
    const snap = await orderRef.get();

    if (!snap.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = snap.data();

    // Hanya owner / admin yang boleh
    if (order.ownerUid !== req.user.uid && !req.isAdmin) {
      return res.status(403).json({ error: "Not allowed" });
    }

    // Pastikan nilai pakai field yang benar (kamu pilih satu)
    const total = order.total ?? order.grand ?? 0;
    const amount = Math.round(total * 100); // Stripe pakai sen

    if (amount <= 0) {
      return res.status(400).json({ error: "Invalid order total amount" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "idr",
      metadata: { orderId }
    });

    await orderRef.update({
      paymentIntentId: paymentIntent.id,
      status: "payment_pending",
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ clientSecret: paymentIntent.client_secret });

  } catch (e) {
    console.error("Payment Intent Error:", e);
    return res.status(500).json({ error: e.message });
  }
});
