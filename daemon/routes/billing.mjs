import { asyncHandler, AppError } from '../lib/route-utils.mjs';
import { prepare } from '../db/connection.mjs';
import { authMiddleware } from '../lib/auth.mjs';

const PRICE_IDS = {
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY || '',
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || '',
    yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY || '',
  },
};

const TIER_FEATURES = {
  free: {
    title: 'Free',
    requestsPerMin: 30,
    providerTokensPerDay: 100000,
    maxProjects: 1,
    maxAgents: 3,
    agentTimeout: 60000,
    fileWatch: true,
    price: 0,
  },
  pro: {
    title: 'Pro',
    requestsPerMin: 300,
    providerTokensPerDay: 1000000,
    maxProjects: 10,
    maxAgents: 50,
    agentTimeout: 300000,
    fileWatch: true,
    price: 29,
  },
  enterprise: {
    title: 'Enterprise',
    requestsPerMin: 1000,
    providerTokensPerDay: 5000000,
    maxProjects: -1,
    maxAgents: -1,
    agentTimeout: 900000,
    fileWatch: true,
    price: 99,
  },
};

export async function registerBillingRoutes(app) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  let stripe = null;

  if (stripeKey) {
    try {
      const mod = await import('stripe');
      stripe = mod.default(stripeKey);
    } catch {
      // stripe package not installed
    }
  }

  // Config endpoint (no auth required)
  app.get('/api/v1/billing/config', (req, res) => {
    res.json({
      configured: Boolean(stripe),
      tiers: TIER_FEATURES,
    });
  });

  // Get user subscription
  app.get(
    '/api/v1/billing/subscription',
    authMiddleware(true),
    asyncHandler(async (req, res) => {
      const user = prepare('SELECT id, email, tier, stripe_customer_id FROM users WHERE id = ?').get(req.user.id);
      if (!user) throw new AppError('User not found', 404);
      res.json({
        tier: user.tier,
        features: TIER_FEATURES[user.tier] || TIER_FEATURES.free,
        stripeCustomerId: user.stripe_customer_id || null,
        stripeConfigured: Boolean(stripe),
      });
    }),
  );

  // Upgrade endpoint (works with or without Stripe)
  app.post(
    '/api/v1/billing/upgrade',
    authMiddleware(true),
    asyncHandler(async (req, res) => {
      const { tier = 'pro' } = req.body;
      if (!TIER_FEATURES[tier]) throw new AppError(`Invalid tier: ${tier}`, 400);

      const user = prepare('SELECT id, email, name, stripe_customer_id FROM users WHERE id = ?').get(req.user.id);
      if (!user) throw new AppError('User not found', 404);

      if (stripe) {
        // With Stripe: create checkout session
        const priceId = PRICE_IDS[tier]?.monthly;
        if (!priceId) throw new AppError(`No price configured for ${tier}`, 400);

        let customerId = user.stripe_customer_id;
        if (!customerId) {
          const customer = await stripe.customers.create({
            email: user.email,
            name: user.name || undefined,
            metadata: { userId: user.id },
          });
          customerId = customer.id;
          prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, user.id);
        }

        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          mode: 'subscription',
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: req.body.successUrl || `${req.headers.origin}/?billing=success`,
          cancel_url: req.body.cancelUrl || `${req.headers.origin}/?billing=cancel`,
          metadata: { userId: user.id, tier },
        });

        res.json({ url: session.url, sessionId: session.id });
      } else {
        // Without Stripe: direct upgrade
        prepare('UPDATE users SET tier = ? WHERE id = ?').run(tier, user.id);
        const updated = prepare('SELECT id, email, tier FROM users WHERE id = ?').get(user.id);
        res.json({
          success: true,
          message: `Tier upgraded to ${tier}`,
          user: updated,
          features: TIER_FEATURES[tier],
        });
      }
    }),
  );

  // Create billing portal session (Stripe only)
  app.post(
    '/api/v1/billing/portal',
    authMiddleware(true),
    asyncHandler(async (req, res) => {
      if (!stripe) throw new AppError('Stripe not configured. Use /api/v1/billing/upgrade directly.', 400);

      const user = prepare('SELECT stripe_customer_id FROM users WHERE id = ?').get(req.user.id);
      if (!user?.stripe_customer_id) throw new AppError('No billing customer found. Upgrade first.', 404);

      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: req.body.returnUrl || `${req.headers.origin}/settings`,
      });

      res.json({ url: session.url });
    }),
  );

  // Stripe webhook
  app.post(
    '/api/v1/billing/webhook',
    asyncHandler(async (req, res) => {
      if (!stripe) {
        return res.json({ received: true, note: 'Stripe not configured' });
      }

      const sig = req.headers['stripe-signature'];
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!sig || !webhookSecret) {
        return res.json({ received: true, note: 'Webhook signature verification skipped' });
      }

      // Get raw body for signature verification
      const rawBody = req.rawBody || '';
      let event;
      try {
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
      } catch (err) {
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
      }

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object;
          const userId = session.metadata?.userId;
          const tier = session.metadata?.tier || 'pro';
          if (userId) {
            prepare('UPDATE users SET tier = ?, stripe_customer_id = COALESCE(stripe_customer_id, ?) WHERE id = ?').run(
              tier,
              session.customer,
              userId,
            );
          }
          break;
        }
        case 'customer.subscription.updated':
        case 'customer.subscription.deleted': {
          const subscription = event.data.object;
          const customerId = subscription.customer;
          if (subscription.status !== 'active' && subscription.status !== 'trialing') {
            prepare('UPDATE users SET tier = ? WHERE stripe_customer_id = ?').run('free', customerId);
          }
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object;
          prepare('UPDATE users SET tier = ? WHERE stripe_customer_id = ?').run('free', invoice.customer);
          break;
        }
      }

      res.json({ received: true });
    }),
  );
}
