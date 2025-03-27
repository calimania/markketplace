import Stripe from "stripe";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_SECRET_TEST_KEY = process.env.STRIPE_SECRET_TEST_KEY;

const stripe = new Stripe(STRIPE_SECRET_KEY);
const stripeTest = new Stripe(STRIPE_SECRET_TEST_KEY);

type PaymentLinkOptions = {
  prices: { id: string; quantity: number, product?: string | number }[];
  include_shipping: boolean;
  stripe_test: boolean;
  store_id?: string;
  redirect_to_url?: string;
};

export const getAccount = async (store_id: string) => {
  if (!store_id) {
    return null;
  }
  const store = await strapi.db.query('api::store.store').findOne({
    where: {
      documentId: store_id,
    },
  });

  const connected_account_id = store?.STRIPE_CUSTOMER_ID;
  if (!connected_account_id) {
    return null;
  }

  let account;
  try {
    account = await stripe.accounts.retrieve(connected_account_id);
  } catch (error) {
    console.error('Error retrieving account:', error, { a: account, b: account?.raw });
    if (error?.raw?.message.includes('testmode')) {
      account = await stripeTest.accounts.retrieve(connected_account_id);
      account.test_mode = true;
    }
  }

  return account;
};

/**
 *  Create a payment link with price ids, or create new prices for the custom amounts
 * @param prices
 * @returns
 */
export const createPaymentLinkWithPriceIds = async ({ prices, include_shipping, stripe_test, store_id, redirect_to_url }: PaymentLinkOptions) => {
  const line_items = [];
  const custom_price: any = prices.find((price: any) => price.product);
  const set_price: any = prices.find((price: any) => price.price);

  const client = stripe_test ? stripeTest : stripe;

  let connected_account_id, store;
  if (store_id) {
    store = await strapi.db.query('api::store.store').findOne({
      where: {
        documentId: store_id,
      },
    });

    connected_account_id = store?.STRIPE_CUSTOMER_ID;
  }

  if (custom_price?.product) {
    const new_price = await client.prices.create({
      currency: 'usd',
      unit_amount: (custom_price?.unit_amount * 100) || 0,
      product: custom_price?.product,
    });

    if (new_price?.id) {
      line_items.push({
        price: new_price.id,
        quantity: 1,
      });
    }
  }

  if (set_price?.price) {
    line_items.push({
      price: set_price.price,
      quantity: set_price.quantity || 1,
    });
  }

  if (line_items?.length < 1) {
    return null;
  }

  console.log('create.stripe.payment.link', { line_items: line_items.length });

  const url = `${redirect_to_url || 'https://markket.place/receipt'}?session_id={CHECKOUT_SESSION_ID}`;

  const stripe_options = {
    line_items: line_items.splice(0, 20) || [],
    after_completion: {
      type: 'redirect',
      redirect: {
        url,
      },
    }
  } as {
    line_items: [];
    after_completion: {
      type: string;
      redirect: {
        url: string;
      };
    };
    payment_intent_data?: {
      transfer_data?: {
        destination: string;
      };
    };
    shipping_address_collection?: {
      allowed_countries: string[];
    };
    on_behalf_of?: string;
  };

  if (connected_account_id) {
    stripe_options.payment_intent_data = {
      transfer_data: { destination: connected_account_id },
    };
    stripe_options.on_behalf_of = connected_account_id;
  }

  console.log('create.stripe.payment.link', { connected_account_id, store });

  if (include_shipping) {
    stripe_options.shipping_address_collection = {
      allowed_countries: ['US'],
    };
  }

  const paymentLink = await client.paymentLinks.create(stripe_options as Stripe.PaymentLinkCreateParams);

  return paymentLink;
};


export const getSessionById = async (session_id: string, stripe_test) => {
  if (!session_id) {
    return null;
  }

  const client = stripe_test ? stripeTest : stripe;

  const session = await client.checkout.sessions.retrieve(
    session_id,
  );

  return session;
};
