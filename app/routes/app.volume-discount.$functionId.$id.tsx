import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Text, Button, Banner } from "@shopify/polaris";
import { shopify } from "../shopify.server";

// LOADER: Ye Shopify se discount ka data layega
export const loader = async ({ params, request, context }: any) => {
  const { id } = params;
  const { admin } = await shopify(context).authenticate.admin(request);

  const response = await admin.graphql(
    `#graphql
    query getDiscount($id: ID!) {
      discountNode(id: $id) {
        id
        discount {
          ... on DiscountAutomaticApp { title status }
        }
      }
    }`,
    { variables: { id: `gid://shopify/DiscountNode/${id}` } }
  );

  const responseJson = await response.json();
  const discount = responseJson.data?.discountNode?.discount;
  
  // Agar discount nahi mila toh null return karo
  return json({ discount: discount || null });
};

export default function DiscountDetails() {
  const { discount } = useLoaderData<typeof loader>();

  if (!discount) {
    return (
      <Page title="Not Found">
        <Banner tone="critical">Discount data load nahi ho paya.</Banner>
      </Page>
    );
  }

  return (
    <Page title={discount.title}>
      <Layout.Section>
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Status: {discount.status}</Text>
            <Banner tone="info">Pricing rules edit karne ke liye neeche button dabayein.</Banner>
            <Button variant="primary" onClick={() => open("shopify:admin/apps/cloudflare-workers-app", "_top")}>
              Manage Rules in App
            </Button>
          </BlockStack>
        </Card>
      </Layout.Section>
    </Page>
  );
}