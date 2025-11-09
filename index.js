// Create Payment Intent untuk order tertentu
app.post('/api/create-payment-intent', authenticate, async (req, res) => {
  try {
    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "orderId required" });
    }

    // Ambil order dari Firestore
    const orderRef = db.collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();

    if (!orderSnap.exists) {
      return res.status(404).json({ error: "Order not found" });
    }

    const order = orderSnap.data();

    // Hanya pemilik order atau admin yang boleh bayar
    if (order.ownerUid !== req.user.uid && !req.isAdmin) {
      return res.status(403).json({ error: "Not authorized" });
    }

    // Hitung total order (pastikan ini valid & integer untuk Stripe)
    const amount = Math.round(order.total * 100); // Stripe pakai sen
    if (amount <= 0) {
      return res.status(400).json({ error: "Invalid total amount" });
    }

    // Buat PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: "idr",
      metadata: { orderId }
    });

    // Simpan status ke Firestore
    await orderRef.update({
      status: "payment_pending",
      paymentIntentId: paymentIntent.id,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({
      clientSecret: paymentIntent.client_secret
    });

  } catch (err) {
    console.error("Payment Intent Error:", err);
    return res.status(500).json({ error: err.message });
  }
});
