import { useEffect, useState } from "react";
import { json } from "@remix-run/node";
import { useActionData, useSubmit, useNavigation } from "@remix-run/react";
import { Page, Layout, Card, BlockStack, TextField, Button, Banner } from "@shopify/polaris";
import { useAppBridge } from "@shopify/app-bridge-react";
import { shopify } from "../shopify.server";

export const action = async ({ params, request, context }: any) => {
  const { functionId } = params;
  const { admin } = await shopify(context).authenticate.admin(request);
  const formData = await request.formData();
  const title = formData.get("title");

  const response = await admin.graphql(
    `#graphql
    mutation discountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
        userErrors { field message }
        automaticAppDiscount { discountId }
      }
    }`,
    { variables: { automaticAppDiscount: { functionId, title, startsAt: new Date() } } }
  );

  const responseJson = await response.json();
  const errors = responseJson.data?.discountAutomaticAppCreate?.userErrors;
  if (errors?.length > 0) return json({ errors });

  return json({ success: true });
};

export default function DiscountNew() {
  const submit = useSubmit();
  const actionData = useActionData<typeof action>() as any;
  const shopifyApp = useAppBridge();
  const nav = useNavigation();
  const [title, setTitle] = useState("Volume Discount");

  useEffect(() => {
    if (actionData?.success) {
      shopifyApp.toast.show("Discount Created!");
      // Redirect back to Shopify Admin
      open("shopify:admin/discounts", "_top"); 
    }
  }, [actionData, shopifyApp]);

  return (
    <Page title="Create Volume Discount">
      <Layout.Section>
        <Card>
          <BlockStack gap="400">
            <TextField label="Title" value={title} onChange={setTitle} autoComplete="off" />
            <Button loading={nav.state === "submitting"} onClick={() => submit({ title }, { method: "post" })} variant="primary">
              Save & Activate
            </Button>
          </BlockStack>
        </Card>
      </Layout.Section>
    </Page>
  );
}