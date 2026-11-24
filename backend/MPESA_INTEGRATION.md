# M-Pesa Payment Integration Guide

This guide explains how to integrate M-Pesa payment functionality into the Pwani Bite system.

## Overview

The M-Pesa integration uses Safaricom's Daraja API to process payments via STK Push (Lipa Na M-Pesa Online). This allows customers to pay for their orders directly from their M-Pesa accounts.

## Prerequisites

1. **M-Pesa Daraja Developer Account**
   - Register at [developer.safaricom.co.ke](https://developer.safaricom.co.ke)
   - Create a new app
   - Get Consumer Key and Consumer Secret

2. **Test Credentials (Sandbox)**
   - Use sandbox environment for testing
   - Test shortcode: 174379
   - Test passkey: provided by Safaricom

3. **Production Credentials**
   - Apply for production credentials from Safaricom
   - Use your business shortcode
   - Use your production passkey

## Configuration

Add the following to your `.env` file:

```env
# M-Pesa Configuration
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_PASSKEY=your_passkey
MPESA_SHORTCODE=174379
MPESA_ENVIRONMENT=sandbox

# Server URL (must be accessible from internet for callbacks)
SERVER_URL=http://localhost:3000
```

### Environment Settings

- **sandbox**: For testing and development
- **production**: For live transactions

## API Endpoints

### 1. Initiate STK Push

Initiate a payment request to the customer's phone.

```http
POST /api/mpesa/stkpush
Authorization: Bearer <token>
Content-Type: application/json

{
  "order_id": 1,
  "phone_number": "0712345678",
  "amount": 200.00
}
```

**Response:**
```json
{
  "message": "STK Push initiated successfully",
  "merchant_request_id": "29334-432432-4324",
  "checkout_request_id": "ws_CO_2901202015432345",
  "customer_message": "Please enter your M-Pesa PIN on your phone to complete the payment",
  "payment_id": 1
}
```

**Phone Number Format:**
- Can be: `0712345678`, `+254712345678`, or `254712345678`
- Will be automatically converted to `254712345678` format

### 2. Callback URL

M-Pesa sends payment results to this endpoint. No authentication required.

```http
POST /api/mpesa/callback
Content-Type: application/json
```

**Callback Body (sent by M-Pesa):**
```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "29334-432432-4324",
      "CheckoutRequestID": "ws_CO_2901202015432345",
      "ResultCode": 0,
      "ResultDesc": "The service request is processed successfully.",
      "CallbackMetadata": {
        "Item": [
          {
            "Name": "Amount",
            "Value": 200.00
          },
          {
            "Name": "MpesaReceiptNumber",
            "Value": "xyz123"
          },
          {
            "Name": "TransactionDate",
            "Value": "20230120154323"
          },
          {
            "Name": "PhoneNumber",
            "Value": "254712345678"
          }
        ]
      }
    }
  }
}
```

**Callback Processing:**
- If `ResultCode` is `0`: Payment successful
  - Updates payment status to "Completed"
  - Updates order status to "Preparing"
- If `ResultCode` is not `0`: Payment failed
  - Updates payment status to "Failed"

### 3. Check Payment Status

Check the status of a payment.

```http
GET /api/mpesa/status/:paymentId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "payment_id": 1,
  "order_id": 1,
  "payment_method": "M-Pesa",
  "amount": 200.00,
  "payment_status": "Completed",
  "transaction_id": "xyz123",
  "payment_date": "2023-01-20T15:43:23.000Z"
}
```

**Payment Status Values:**
- `Pending`: Payment initiated, waiting for customer input
- `Completed`: Payment successful
- `Failed`: Payment failed or cancelled

### 4. Query Transaction

Query the status of a transaction from M-Pesa (manual verification).

```http
POST /api/mpesa/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "checkout_request_id": "ws_CO_2901202015432345"
}
```

## Frontend Integration

### Example: Initiating Payment

```javascript
// After order is created
async function initiatePayment(orderId, phoneNumber, amount) {
    try {
        const result = await initiateMpesaSTKPush(orderId, phoneNumber, amount);

        // Show success message
        alert(result.customer_message);

        // Store checkout request ID for status checking
        localStorage.setItem('pendingPayment', JSON.stringify({
            checkoutRequestId: result.checkout_request_id,
            paymentId: result.payment_id
        }));

        // Poll for payment status
        checkPaymentStatus(result.paymentId);

    } catch (error) {
        console.error('Payment initiation failed:', error);
        alert('Failed to initiate payment. Please try again.');
    }
}

// Check payment status periodically
async function checkPaymentStatus(paymentId) {
    const maxAttempts = 10;
    let attempts = 0;

    const interval = setInterval(async () => {
        attempts++;

        try {
            const status = await checkMpesaPaymentStatus(paymentId);

            if (status.payment_status === 'Completed') {
                clearInterval(interval);
                alert('Payment successful! Your order is being prepared.');
                // Redirect to order history
                window.location.href = 'orders.html';
            } else if (status.payment_status === 'Failed') {
                clearInterval(interval);
                alert('Payment failed. Please try again.');
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                alert('Payment is taking longer than expected. Please check your order history.');
            }
        } catch (error) {
            console.error('Error checking payment status:', error);
        }
    }, 5000); // Check every 5 seconds
}
```

## Testing in Sandbox

### 1. Use Test Credentials

```env
MPESA_CONSUMER_KEY=your_sandbox_consumer_key
MPESA_CONSUMER_SECRET=your_sandbox_consumer_secret
MPESA_PASSKEY=your_sandbox_passkey
MPESA_SHORTCODE=174379
MPESA_ENVIRONMENT=sandbox
```

### 2. Use Test Phone Numbers

- Format: `2547XXXXXXXX` (replace X with any digits)
- Example: `254712345678`

### 3. Simulate Payment

In sandbox mode, you can simulate payment using:
- **M-Pesa App**: Use test credentials in the app
- **DARAJA Sandbox Dashboard**: Some transactions can be simulated

## Production Deployment

### 1. Get Production Credentials

1. Apply for production access from Safaricom
2. Provide business details
3. Get production Consumer Key and Secret
4. Get your business shortcode
5. Get production passkey

### 2. Update Environment Variables

```env
MPESA_CONSUMER_KEY=your_production_consumer_key
MPESA_CONSUMER_SECRET=your_production_consumer_secret
MPESA_PASSKEY=your_production_passkey
MPESA_SHORTCODE=your_business_shortcode
MPESA_ENVIRONMENT=production
```

### 3. Configure Callback URL

The callback URL must be:
- Publicly accessible (not localhost)
- HTTPS enabled
- Correctly configured in Daraja dashboard

Example: `https://yourdomain.com/api/mpesa/callback`

### 4. Test with Small Amounts

Before going live:
- Test with small amounts (KSh 1-10)
- Verify callback is received
- Check payment status updates
- Test refund process if needed

## Security Considerations

1. **Never commit credentials** to version control
2. **Use environment variables** for all sensitive data
3. **Validate amounts** before processing
4. **Log all transactions** for audit trail
5. **Implement retry logic** for failed callbacks
6. **Use HTTPS** in production
7. **Rate limit** payment requests to prevent abuse

## Error Handling

### Common Errors

1. **Invalid Phone Number**
   - Ensure phone number is in correct format
   - Validate before sending to API

2. **Insufficient Funds**
   - Customer has insufficient M-Pesa balance
   - ResultCode will be non-zero

3. **Timeout**
   - Customer didn't enter PIN in time
   - ResultCode: 1032

4. **User Cancelled**
   - Customer cancelled the STK Push
   - ResultCode: 1032

5. **Callback Not Received**
   - Server may be down
   - Network issues
   - Implement retry mechanism

## Transaction Flow

```
1. Customer places order
   ↓
2. Order created in database
   ↓
3. STK Push initiated
   ↓
4. Customer receives prompt on phone
   ↓
5. Customer enters M-Pesa PIN
   ↓
6. M-Pesa processes payment
   ↓
7. Callback sent to server
   ↓
8. Payment status updated
   ↓
9. Order status updated to "Preparing"
   ↓
10. Customer notified of success
```

## Troubleshooting

### Payment not completing

1. Check if phone number is correct
2. Verify customer has sufficient balance
3. Check server logs for callback errors
4. Verify callback URL is accessible
5. Check M-Pesa service status

### Callback not received

1. Check server is running
2. Verify callback URL is correct
3. Check firewall/network settings
4. Implement retry mechanism
5. Use transaction query endpoint

### Invalid credentials

1. Verify Consumer Key and Secret
2. Check credentials match environment (sandbox/production)
3. Regenerate credentials if expired

## Support

For M-Pesa specific issues:
- Daraja API Documentation: https://developer.safaricom.co.ke
- Safaricom Developer Support: developers@safaricom.co.ke

For Pwani Bite system issues:
- Check backend logs
- Review database payment records
- Verify environment configuration
