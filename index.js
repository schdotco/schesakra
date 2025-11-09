// server/index.js
import express from "express";
import cors from "cors";
import admin from "firebase-admin";
import Stripe from "stripe";
import dotenv from "dotenv";
import bodyParser from "body-parser";

dotenv.config();

// --------------------------------------
// 1. FIREBASE ADMIN
// --------------------------------------
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

const db = admin.firestore();

// --------------------------------------
// 2. STRIPE (pakai SECRET KEY dari .env)
// --------------------------------------
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// --------------------------------------
// 3. EXPRESS APP
// --------------------------------------
const app = express();

// Untuk semua request biasa → JSON
app.use(express.json());

// Untuk webhook Stripe → perlu RAW body
app.use("/webhook", bodyParser.raw({ type: "application/json" }));

app.use(cors());

// --------------------------------------
// 4. AUTH MIDDLEWARE (CEK USER + ROLE ADMIN)
// --------------------------------------
async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.split("Bearer ")[1];
    if (!token) return res.status(401).json({ error: "Missing auth token" });

    const decoded = await admin.auth().verifyIdToken(token);
    req.user = { uid: decoded.uid };

    // cek role admin (collection: admins/{uid})
    const adminSnap = await db.collection("admins").doc(decoded.uid).get();
    req.isAdmin = adminSnap.exists;

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// --------------------------------------
// 5. CREATE PAYMENT INTENT
// --------------------------------------
app.post("/api/create-payment-intent", authenticate, async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: "orderId required" });

    const ref = db.collection("orders").doc(orderId);
    const snap = await ref.get();

    if (!snap.exists) return res.status(404).json({ error: "Order not found" });

    const order = snap.data();

    // hanya pemilik / admin
    if (order.ownerUid !== req.user.uid && !req.isAdmin) {
      return res.status(403).json({ error: "Not allowed" });
    }

    // total → dalam sen (Stripe)
    const amount = Math.round(order.grand * 100);
    if (amount <= 0) return res.status(400).json({ error: "Invalid amount" });

    const intent = await stripe.paymentIntents.create({
      amount,
      currency: "idr",
      metadata: { orderId },
    });

    await ref.update({
      paymentIntentId: intent.id,
      status: "payment_pending",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return res.json({ clientSecret: intent.client_secret });

  } catch (err) {
    console.error("Payment Intent Error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// --------------------------------------
// 6. STRIPE WEBHOOK → AUTO UPDATE STATUS
// --------------------------------------
app.post("/webhook", async (req, res) => {
  let event;
  const signature = req.headers["stripe-signature"];

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send("Webhook signature failed: " + err.message);
  }

  // Event: pembayaran sukses
  if (event.type === "payment_intent.succeeded") {
    const intent = event.data.object;
    const orderId = intent.metadata.orderId;

    await db.collection("orders").doc(orderId).update({
      status: "paid",
      paidAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`✅ Order #${orderId} sudah dibayar`);
  }

  res.json({ received: true });
});

// --------------------------------------
// 7. RUN SERVER
// --------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("✅ PAYMENT SERVER RUNNING at http://localhost:" + PORT);
});
