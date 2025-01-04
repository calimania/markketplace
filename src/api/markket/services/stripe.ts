// const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_SECRET_TEST_KEY = process.env.STRIPE_SECRET_TEST_KEY;

// const stripe = require('stripe')(STRIPE_SECRET_KEY);
const stripeTest = require('stripe')(STRIPE_SECRET_TEST_KEY);

/**
 *  Create a payment link with price ids, or create new prices for the custom amounts
 * @param prices
 * @returns
 */
export const createPaymentLinkWithPriceIds = async (prices: { id: string, quantity: number }[]) => {
  console.log({ prices });

  const line_items = [];

  const custom_price: any = prices.find((price: any) => price.product);
  const set_price: any = prices.find((price: any) => price.price);

  if (custom_price?.product) {
    const new_price = await stripeTest.prices.create({
      currency: 'usd',
      unit_amount: (custom_price?.unit_amount * 100) || 0,
      product: custom_price?.product,
    });

    console.log({ new_price });

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

  console.log({ line_items });

  const paymentLink = await stripeTest.paymentLinks.create({
    // @TODO: maximum 20 items
    line_items: line_items.splice(0, 20) || [],
    after_completion: {
      type: 'redirect',
      redirect: {
        url: 'https://markket.place/receipt?session_id={CHECKOUT_SESSION_ID}',
      },
    },
    // on_behalf_of: 'connected_acct_id',
    // transfer_data: {
    //   destination: 'connected_acct_id',
    // },
  });

  return paymentLink;
};
