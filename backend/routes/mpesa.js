const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authenticateToken, requireCustomer } = require('../middleware/auth');
const rateLimiter = require('../middleware/rateLimiter');
const db = require('../config/database');
require('dotenv').config();

// Rate limiter for M-Pesa STK Push (10 requests per 10 minutes)
const mpesaLimiter = rateLimiter({
    windowMs: 10 * 60 * 1000,
    max: 10,
    message: 'Too many M-Pesa requests. Please wait a few minutes before trying again.'
});

// M-Pesa Daraja API credentials
const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const MPESA_PASSKEY = process.env.MPESA_PASSKEY;
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE;
const MPESA_ENVIRONMENT = process.env.MPESA_ENVIRONMENT || 'sandbox';

// M-Pesa API URLs
const MPESA_AUTH_URL = MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
    : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';

const MPESA_STK_PUSH_URL = MPESA_ENVIRONMENT === 'production'
    ? 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
    : 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest';

// Generate M-Pesa access token
async function getMpesaAccessToken() {
    try {
        const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');

        const response = await axios.get(MPESA_AUTH_URL, {
            headers: {
                'Authorization': `Basic ${auth}`
            }
        });

        return response.data.access_token;
    } catch (error) {
        console.error('Error getting M-Pesa access token:', error.message);
        throw new Error('Failed to get M-Pesa access token');
    }
}

// Lipa Na M-Pesa Online (STK Push)
router.post('/stkpush', mpesaLimiter, authenticateToken, requireCustomer, async (req, res) => {
    try {
        const { order_id, phone_number, amount } = req.body;

        // Safely validate and format phone number (format: 254XXXXXXXXX)
        const rawPhone = String(phone_number || '').trim();
        const formattedPhone = rawPhone.startsWith('0')
            ? '254' + rawPhone.substring(1)
            : rawPhone.startsWith('+254')
            ? rawPhone.substring(1)
            : rawPhone;

        if (!formattedPhone.match(/^254[0-9]{9}$/)) {
            return res.status(400).json({
                error: 'Invalid phone number',
                message: 'Phone number must be in format 254XXXXXXXXX'
            });
        }

        // Get order details
        const [orders] = await db.promisePool.query(
            'SELECT * FROM orders WHERE order_id = ? AND user_id = ?',
            [order_id, req.user.userId]
        );

        if (orders.length === 0) {
            return res.status(404).json({
                error: 'Order not found'
            });
        }

        const order = orders[0];

        // Verify amount matches order total
        if (parseFloat(amount) !== parseFloat(order.total_amount)) {
            return res.status(400).json({
                error: 'Amount mismatch',
                message: 'Payment amount does not match order total'
            });
        }

        // Get M-Pesa access token
        const accessToken = await getMpesaAccessToken();

        // Generate timestamp
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 14);

        // Generate password
        const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');

        // STK Push request payload
        const stkPushPayload = {
            'BusinessShortCode': MPESA_SHORTCODE,
            'Password': password,
            'Timestamp': timestamp,
            'TransactionType': 'CustomerPayBillOnline',
            'Amount': amount,
            'PartyA': formattedPhone,
            'PartyB': MPESA_SHORTCODE,
            'PhoneNumber': formattedPhone,
            'CallBackURL': `${process.env.SERVER_URL}/api/mpesa/callback`,
            'AccountReference': `PB${order.order_number}`,
            'TransactionDesc': `Payment for order ${order.order_number}`
        };

        // Send STK Push request
        const response = await axios.post(MPESA_STK_PUSH_URL, stkPushPayload, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        // Create pending payment record
        const [paymentResult] = await db.promisePool.query(
            'INSERT INTO payments (order_id, payment_method, amount, payment_status, transaction_id) VALUES (?, ?, ?, ?, ?)',
            [order_id, 'M-Pesa', amount, 'Pending', response.data.MerchantRequestID]
        );

        res.json({
            message: 'STK Push initiated successfully',
            merchant_request_id: response.data.MerchantRequestID,
            checkout_request_id: response.data.CheckoutRequestID,
            customer_message: 'Please enter your M-Pesa PIN on your phone to complete the payment',
            payment_id: paymentResult.insertId
        });

    } catch (error) {
        console.error('STK Push error:', error.message);
        res.status(500).json({
            error: 'Failed to initiate STK Push',
            message: error.message
        });
    }
});

// M-Pesa Callback URL (no authentication required - called by M-Pesa)
router.post('/callback', async (req, res) => {
    try {
        const { Body } = req.body;
        const { stkCallback } = Body;

        const merchantRequestID = stkCallback.MerchantRequestID;
        const checkoutRequestID = stkCallback.CheckoutRequestID;
        const resultCode = stkCallback.ResultCode;
        const resultDesc = stkCallback.ResultDesc;

        // Find payment by transaction ID
        const [payments] = await db.promisePool.query(
            'SELECT * FROM payments WHERE transaction_id = ?',
            [merchantRequestID]
        );

        if (payments.length === 0) {
            return res.status(404).json({
                error: 'Payment not found'
            });
        }

        const payment = payments[0];

        if (resultCode === 0) {
            // Payment successful
            const metadata = stkCallback.CallbackMetadata.Item;
            const mpesaReceipt = metadata.find(item => item.Name === 'MpesaReceiptNumber')?.Value;
            const transactionDate = metadata.find(item => item.Name === 'TransactionDate')?.Value;
            const phoneNumber = metadata.find(item => item.Name === 'PhoneNumber')?.Value;

            // Update payment status
            await db.promisePool.query(
                'UPDATE payments SET payment_status = ?, transaction_id = ? WHERE payment_id = ?',
                ['Completed', mpesaReceipt, payment.payment_id]
            );

            // Update order status to Preparing
            await db.promisePool.query(
                'UPDATE orders SET order_status = ? WHERE order_id = ?',
                ['Preparing', payment.order_id]
            );

            console.log(`Payment completed: ${mpesaReceipt} for order ${payment.order_id}`);

        } else {
            // Payment failed
            await db.promisePool.query(
                'UPDATE payments SET payment_status = ? WHERE payment_id = ?',
                ['Failed', payment.payment_id]
            );

            console.log(`Payment failed: ${resultDesc} for order ${payment.order_id}`);
        }

        // Send response to M-Pesa
        res.json({
            ResultCode: 0,
            ResultDesc: 'Callback received successfully'
        });

    } catch (error) {
        console.error('Callback error:', error.message);
        res.status(500).json({
            ResultCode: 1,
            ResultDesc: 'Error processing callback'
        });
    }
});

// Check payment status
router.get('/status/:paymentId', authenticateToken, async (req, res) => {
    try {
        const [payments] = await db.promisePool.query(
            'SELECT * FROM payments WHERE payment_id = ?',
            [req.params.paymentId]
        );

        if (payments.length === 0) {
            return res.status(404).json({
                error: 'Payment not found'
            });
        }

        const payment = payments[0];

        const [orders] = await db.promisePool.query(
            'SELECT user_id FROM orders WHERE order_id = ?',
            [payment.order_id]
        );
        if (!orders.length || (req.user.role !== 'admin' && orders[0].user_id !== req.user.userId)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You are not authorized to view this payment'
            });
        }

        res.json({
            payment_id: payment.payment_id,
            order_id: payment.order_id,
            payment_method: payment.payment_method,
            amount: payment.amount,
            payment_status: payment.payment_status,
            transaction_id: payment.transaction_id,
            payment_date: payment.payment_date
        });

    } catch (error) {
        console.error('Check payment status error:', error);
        res.status(500).json({
            error: 'Failed to check payment status',
            message: error.message
        });
    }
});

// Query transaction status (optional - for manual verification)
router.post('/query', authenticateToken, async (req, res) => {
    try {
        const { checkout_request_id } = req.body;

        const accessToken = await getMpesaAccessToken();

        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').substring(0, 14);
        const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');

        const queryPayload = {
            'BusinessShortCode': MPESA_SHORTCODE,
            'Password': password,
            'Timestamp': timestamp,
            'CheckoutRequestID': checkout_request_id
        };

        const queryUrl = MPESA_ENVIRONMENT === 'production'
            ? 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query'
            : 'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query';

        const response = await axios.post(queryUrl, queryPayload, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        res.json(response.data);

    } catch (error) {
        console.error('Query transaction error:', error.message);
        res.status(500).json({
            error: 'Failed to query transaction',
            message: error.message
        });
    }
});

module.exports = router;
