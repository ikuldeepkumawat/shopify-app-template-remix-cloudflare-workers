import { json, type ActionFunctionArgs } from "@remix-run/cloudflare";
import { useActionData, useNavigation, Form } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Button, Text, Banner } from "@shopify/polaris";
import { shopify } from "../shopify.server";

// ------------------------
// BACKEND: Yeh tab chalega jab button dabega
// ------------------------
export const action = async ({ request, context }: ActionFunctionArgs) => {
  // 1. Admin authenticate karein
  const { admin } = await shopify(context).authenticate.admin(request);

  // 2. Mutation Define karein
  const CREATE_PLAN_MUTATION = `
    mutation sellingPlanGroupCreate($input: SellingPlanGroupInput!) {
      sellingPlanGroupCreate(input: $input) {
        sellingPlanGroup {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  // 3. Mutation Run karein
  const response = await admin.graphql(CREATE_PLAN_MUTATION, {
    variables: {
      input: {
        name: "Monthly Subscription",
        merchantCode: "monthly-sub-v1", // Unique code
        options: ["Delivery every month"],
        position: 1,
        sellingPlansToCreate: [
          {
            name: "Monthly Delivery (Save 10%)",
            options: ["Month(s)"],
            position: 1,
            billingPolicy: {
              recurring: { interval: "MONTHLY", intervalCount: 1 }
            },
            deliveryPolicy: {
              recurring: { interval: "MONTHLY", intervalCount: 1 }
            },
            pricingPolicies: [
              {
                fixed: { adjustmentType: "PERCENTAGE", adjustmentValue: { percentage: 10.0 } }
              }
            ]
          }
        ]
      }
    }
  });

  const responseJson = await response.json();
  
  // 4. Result wapis frontend ko bhejein
  return json({ result: responseJson.data });
};

// ------------------------
// FRONTEND: Jo User ko dikhega
// ------------------------
export default function Plans() {
  const actionData = useActionData<typeof action>();
  const nav = useNavigation();
  const isLoading = nav.state === "submitting";

  return (
    <Page title="Subscription Plans">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Create Standard Plan
              </Text>
              <p>
                Click the button below to create a "Monthly Subscription" selling plan 
                in your Shopify store.
              </p>

              {/* Success Message */}
              {actionData?.result?.sellingPlanGroupCreate?.sellingPlanGroup?.id && (
                <Banner tone="success">
                  Success! Plan Created with ID: {actionData.result.sellingPlanGroupCreate.sellingPlanGroup.id}
                </Banner>
              )}

              {/* Error Message */}
              {actionData && actionData.result?.sellingPlanGroupCreate?.userErrors?.length > 0 && (
                <Banner tone="critical">
                  Error: {actionData.result.sellingPlanGroupCreate.userErrors[0].message}
                </Banner>
              )}

              {/* Button Form */}
              <Form method="post">
                <Button submit loading={isLoading} variant="primary">
                  Create Monthly Plan
                </Button>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}