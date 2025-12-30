import { type ActionFunctionArgs } from "@remix-run/cloudflare";
import { shopify } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { topic, shop, admin, payload } = await shopify(context).authenticate.webhook(request);

  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Payload se data nikalo
  const contract = payload;
  const customerId = contract.customer_id; // Ya customer object se id
  const status = contract.status;
  const nextBillingDate = contract.next_billing_date;

  console.log(`New Subscription for shop: ${shop} topic: ${topic} contract ID: ${contract.id}`);

  // Neon DB mein save karo
  await db(context.cloudflare.env.DATABASE_URL).subscriptionContract.create({
    data: {
      shopifyContractId: `gid://shopify/SubscriptionContract/${contract.id}`,
      customerId: String(customerId),
      status: status,
      nextBillingDate: new Date(nextBillingDate),
      shop: shop
    }
  });

  return new Response("OK"); // Shopify ko 200 OK bhejna zaroori hai
};