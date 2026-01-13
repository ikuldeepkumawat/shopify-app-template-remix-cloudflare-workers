import { useEffect, useState } from "react";
import { json } from "@remix-run/node";
import type { ActionFunctionArgs } from "@remix-run/node";
import {
  Form,
  useActionData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  TextField,
  Button,
  Banner,
} from "@shopify/polaris";

// 1. App Bridge import karein (Frontend ke liye)
import { useAppBridge } from "@shopify/app-bridge-react";

// 2. Server wala shopify import karein (Backend ke liye)
import { shopify } from "../shopify.server";

// --- BACKEND ACTION ---
export const action = async ({ params, request, context }: ActionFunctionArgs) => {
  const { functionId } = params;
  
  // Yahan server wala 'shopify' use hoga authentication ke liye
  const { admin } = await shopify(context).authenticate.admin(request);
  const formData = await request.formData();
  const title = formData.get("title");

  const baseDiscount = {
    functionId,
    title,
    startsAt: new Date(),
  };

  const response = await admin.graphql(
    `#graphql
    mutation discountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
        userErrors {
          field
          message
        }
        automaticAppDiscount {
          discountId
          title
          startsAt
        }
      }
    }`,
    {
      variables: {
        automaticAppDiscount: {
          ...baseDiscount,
        },
      },
    }
  );

  const responseJson = await response.json();
  const errors = responseJson.data?.discountAutomaticAppCreate?.userErrors;

  if (errors && errors.length > 0) {
      return json({ errors });
  }

  return json({ success: true });
};

// --- FRONTEND UI ---
export default function DiscountNew() {
  const submit = useSubmit();
  const actionData = useActionData<typeof action>() as any; 
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  // 3. App Bridge Hook Initialize karein
  const shopifyApp = useAppBridge();

  const [title, setTitle] = useState("Volume Discount");

  const handleSave = () => {
    const formData = new FormData();
    formData.append("title", title);
    submit(formData, { method: "post" });
  };

  useEffect(() => {
      if (actionData?.success) {
          // 4. Yahan 'shopifyApp' (Frontend wala) use karein
          shopifyApp.toast.show("Discount Activated!");
      }
  }, [actionData, shopifyApp]);

  return (
    <Page title="Activate Volume Discount">
      <Layout>
        <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Banner tone="info">
                   Bas Title set karein aur Save dabayein. Baaki rules aapki App se control honge.
                </Banner>
                
                <TextField
                  label="Discount Title"
                  value={title}
                  onChange={(newValue) => setTitle(newValue)}
                  autoComplete="off"
                  helpText="Ye naam customer ko Cart mein dikhega."
                />

                {actionData?.errors && (
                  <Banner tone="critical">
                    <p>{actionData.errors[0].message}</p>
                  </Banner>
                )}

                <div style={{textAlign: "right"}}>
                    <Button 
                      variant="primary" 
                      loading={isLoading}
                      onClick={handleSave}
                    >
                        Save & Activate
                    </Button>
                </div>
              </BlockStack>
            </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}