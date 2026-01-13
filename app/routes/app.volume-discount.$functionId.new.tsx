import { useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  Text,
  Button,
  Banner,
} from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { shopify } from "../shopify.server";

// --- LOADER ---
export const loader = async ({ params, request, context }: any) => {
  const { id } = params;
  const { admin } = await shopify(context).authenticate.admin(request);

  // Shopify se Discount ki details fetch karein
  const response = await admin.graphql(
    `#graphql
    query getDiscount($id: ID!) {
      discountNode(id: $id) {
        id
        discount {
          ... on DiscountAutomaticApp {
            title
            status
            startsAt
          }
        }
      }
    }`,
    {
      variables: {
        id: `gid://shopify/DiscountNode/${id}`,
      },
    }
  );

  const responseJson = await response.json();
  const discount = responseJson.data?.discountNode?.discount;

  if (!discount) return json({ discount: null });

  return json({ discount });
};

// --- FRONTEND ---
export default function DiscountDetails() {
  const { discount } = useLoaderData<typeof loader>();
  const shopifyApp = useAppBridge();

  if (!discount) {
    return (
      <Page title="Discount Not Found">
        <Banner tone="critical">Discount data load nahi ho paya.</Banner>
      </Page>
    );
  }

  return (
    <Page title={discount.title}>
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Volume Discount Active Hai ✅</Text>
              
              <Banner tone="success">
                Ye discount abhi <strong>{discount.status}</strong> hai.
              </Banner>

              <Text as="p">
                Rules aur Pricing ko manage karne ke liye neeche button dabayein.
              </Text>

              {/* Ye button aapke Main App Page par le jayega jahan Rules edit hote hain */}
              <Button 
                variant="primary" 
                onClick={() => open("shopify:admin/apps/volume-discount", "_top")}
              >
                Manage Pricing Rules
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}