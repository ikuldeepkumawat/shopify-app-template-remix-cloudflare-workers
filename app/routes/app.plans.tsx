import { json, type ActionFunctionArgs } from "@remix-run/cloudflare";
import { useActionData, useNavigation, Form } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, Button, Text, Banner } from "@shopify/polaris";
import { shopify } from "../shopify.server";

// ------------------------
// BACKEND: Action Function (Sahi Wala)
// ------------------------
export const action = async ({ request, context }: ActionFunctionArgs) => {
  // 1. Sahi Authentication Call
  const { admin } = await shopify(context).authenticate.admin(request);

  // 2. Mutation Define
  const CREATE_PLAN_MUTATION = `
    mutation sellingPlanGroupCreate($input: SellingPlanGroupInput!) {
      sellingPlanGroupCreate(input: $input) {
        sellingPlanGroup { id }
        userErrors { field message }
      }
    }
  `;

  // 3. Mutation Run
  const response = await admin.graphql(CREATE_PLAN_MUTATION, {
    variables: {
      input: {
        name: "Monthly Subscription",
        merchantCode: "monthly-sub-v1",
        options: ["Delivery every month"],
        position: 1,
        sellingPlansToCreate: [
          {
            name: "Monthly Delivery (Save 10%)",
            options: ["Month(s)"],
            position: 1,
            billingPolicy: { recurring: { interval: "MONTHLY", intervalCount: 1 } },
            deliveryPolicy: { recurring: { interval: "MONTHLY", intervalCount: 1 } },
            pricingPolicies: [
              { fixed: { adjustmentType: "PERCENTAGE", adjustmentValue: { percentage: 10.0 } } }
            ]
          }
        ]
      }
    }
  });

  const responseJson = await response.json();
  return json({ result: responseJson.data });
};

// ------------------------
// FRONTEND: UI Component (Same rahega)
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
              <Text as="h2" variant="headingMd">Create Standard Plan</Text>
              <p>Click the button below to create a "Monthly Subscription" selling plan.</p>
              
              {/* Messages */}
              {actionData?.result?.sellingPlanGroupCreate?.sellingPlanGroup?.id && (
                <Banner tone="success">Success! Plan Created.</Banner>
              )}
              {actionData?.result?.sellingPlanGroupCreate?.userErrors?.length > 0 && (
                <Banner tone="critical">Error: {actionData.result.sellingPlanGroupCreate.userErrors[0].message}</Banner>
              )}

              <Form method="post">
                <Button submit loading={isLoading} variant="primary">Create Monthly Plan</Button>
              </Form>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}