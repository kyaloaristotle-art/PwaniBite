// In-memory Rate Limiter Middleware
// Tracks requests per IP within a sliding window to protect against brute-force attacks

const requestBuckets = new Map();

/**
 * Creates a rate limiting middleware
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default 15 mins)
 * @param {number} options.max - Max number of connections during windowMs (default 100)
 * @param {string} options.message - Custom message when limit reached
 */
function rateLimiter(options = {}) {
    const windowMs = options.windowMs || 15 * 60 * 1000;
    const max = options.max || 100;
    const message = options.message || 'Too many requests, please try again later.';

    // Clean up expired buckets periodically
    setInterval(() => {
        const now = Date.now();
        for (const [key, data] of requestBuckets.entries()) {
            if (now > data.resetTime) {
                requestBuckets.delete(key);
            }
        }
    }, windowMs);

    return (req, res, next) => {
        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const key = `${ip}:${req.baseUrl || req.path}`;
        const now = Date.now();

        let clientRecord = requestBuckets.get(key);

        if (!clientRecord || now > clientRecord.resetTime) {
            clientRecord = {
                count: 1,
                resetTime: now + windowMs
            };
            requestBuckets.set(key, clientRecord);
        } else {
            clientRecord.count++;
        }

        const remaining = Math.max(0, max - clientRecord.count);
        const retryAfter = Math.ceil((clientRecord.resetTime - now) / 1000);

        res.setHeader('X-RateLimit-Limit', max);
        res.setHeader('X-RateLimit-Remaining', remaining);
        res.setHeader('X-RateLimit-Reset', Math.ceil(clientRecord.resetTime / 1000));

        if (clientRecord.count > max) {
            res.setHeader('Retry-After', retryAfter);
            return res.status(429).json({
                error: 'Rate limit exceeded',
                message: message,
                retry_after_seconds: retryAfter
            });
        }

        next();
    };
}

module.exports = rateLimiter;
