// scripts/send-test-email.js
'use strict';

const fs = require('fs');
const path = require('path');
const { computeOrderDates } = require('../api/_dates');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_KV_REST_API_URL
  || 'https://daring-mastodon-201457.upstash.io';
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN
  || 'gQAAAAAAAxLxAAIgcDEyZWZlMmI3NmNlNzg0MDBjOGMwMDYwMWNjNDQzYjU1YQ';
const VISIONSPY_KEY = process.env.VISIONSPY_API_KEY
  || 'vs_live_5623f17b36bdf353ba179aa6ed606e1935c6aa4ac4b1aea5';
const VISIONSPY_SENDER_ID = process.env.VISIONSPY_SENDER_ID
  || 'd86d0b35-3472-4aac-af74-4bd52308ea07';

async function kv_set(key, value) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['SET', key, JSON.stringify(value)]),
  });
  if (!res.ok) throw new Error('Redis SET failed: ' + res.status);
  return true;
}

async function sendEmail() {
  const targetEmail = 'nacireiazidenacire@gmail.com';
  const customerName = 'Nacire';
  
  // Generate Takealot order ID
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const orderId = `T${randomSuffix}`;
  
  const now = new Date();
  const receivedAt = now.toISOString();
  const dates = computeOrderDates(receivedAt);
  
  // Read template
  const templatePath = path.join(__dirname, '..', 'email.index');
  const template = fs.readFileSync(templatePath, 'utf8');
  
  const orderDateShort = dates.order_date_formatted;
  const deliveryDateShort = dates.delivery_date_formatted;
  const deliveryDateLong = dates.delivery_date_long;
  
  const html = template
    .replace(/\{\{customer_name\}\}/g, customerName)
    .replace(/\{\{order_number\}\}/g, orderId)
    .replace(/\{\{order_date\}\}/g, orderDateShort)
    .replace(/\{\{delivery_date\}\}/g, deliveryDateShort)
    .replace(/\{\{delivery_date_long\}\}/g, deliveryDateLong)
    .replace(/\{\{variant\}\}/g, 'Black');

  const trackUrl = `https://tekaealotpromodef.vercel.app/track.html?order=${orderId}`;

  const text = [
    `TAKEALOT PAYMENT CONFIRMATION`,
    `Order Number: ${orderId}`,
    `Estimated Delivery Date: ${deliveryDateLong}`,
    ``,
    `Hi ${customerName},`,
    ``,
    `Thank you, we've received your payment for order ${orderId}.`,
    `Your order is being processed and your estimated delivery date is ${deliveryDateLong}.`,
    `Once your order is ready to be delivered, you will receive an SMS notification confirming your scheduled delivery date.`,
    ``,
    `MANAGE YOUR ORDER:`,
    `${trackUrl}`,
    ``,
    `ORDER DETAILS:`,
    `- Order Date: ${orderDateShort}`,
    `- Estimated Delivery Date: ${deliveryDateLong}`,
    `- Delivery Method: Courier`,
    ``,
    `ITEMS IN THIS ORDER:`,
    `- 1x Defy 50cm DSS554 Compact Stove with 4 Solid Plates & Electric Oven - R 999.00`,
    ``,
    `PAYMENT SUMMARY:`,
    `- Subtotal: R 999.00`,
    `- Shipping: Free`,
    `- Total Paid: R 999.00`,
    ``,
    `TRACK YOUR ORDER:`,
    `${trackUrl}`,
    ``,
    `Need help? Find answers at https://tekaealotpromodef.vercel.app`,
    ``,
    `Regards,`,
    `The Takealot Team`,
  ].join('\n');

  console.log(`Sending email to ${targetEmail} for order ${orderId}...`);
  console.log(`Subject: Order Confirmation #${orderId}`);

  const res = await fetch('https://visionspyads.com/api/public/v1/email/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VISIONSPY_KEY.trim()}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Takealot-Order-Notification/1.0',
    },
    body: JSON.stringify({
      sender_id: VISIONSPY_SENDER_ID,
      to: targetEmail,
      subject: `Order Confirmation #${orderId}`,
      html,
      text,
    }),
  });

  const data = await res.json().catch(() => null);
  console.log('VisionSpy HTTP status:', res.status);
  console.log('VisionSpy response:', JSON.stringify(data, null, 2));

  if (!res.ok || (data && (data.ok === false || data.success === false))) {
    throw new Error('Email failed to send');
  }

  // Also record in Upstash Redis so the customer can track the order
  const orderRecord = {
    order_id: orderId,
    customer_name: customerName,
    customer_email: targetEmail,
    customer_phone: '+27 82 000 0000',
    product_id: 'dm-hk586ln7iy',
    product_name: 'Defy 50cm DSS554 Compact Stove with 4 Solid Plates & Electric Oven',
    product_price: 999,
    currency: 'ZAR',
    product_image: 'https://tekaealotpromodef.vercel.app/images/defy-dss554-01.png',
    received_date: receivedAt,
    delivery_date: dates.delivery_date,
    order_date_upper: dates.order_date_upper,
    order_date_formatted: dates.order_date_formatted,
    delivery_date_formatted: dates.delivery_date_formatted,
    delivery_date_long: dates.delivery_date_long,
    delivery_date_iso: dates.delivery_date_iso,
    tracking_url: trackUrl,
    status: 'PROCESSING',
    status_history: [
      { status: 'RECEIVED', timestamp: receivedAt },
      { status: 'PAID', timestamp: receivedAt },
      { status: 'PROCESSING', timestamp: receivedAt },
    ],
    email_status: 'SENT',
    email_sent_at: new Date().toISOString(),
    email_message_id: (data && (data.id || data.message_id || data.messageId)) || null,
    created_at: receivedAt,
    updated_at: receivedAt,
  };

  await kv_set(`order:${orderId}`, orderRecord);
  console.log(`Order ${orderId} saved in Upstash Redis successfully!`);
  console.log(`Tracking URL: ${trackUrl}`);
}

sendEmail().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
