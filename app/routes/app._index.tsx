import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useNavigation, useActionData, useSubmit } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  TextField,
  Banner,
  Thumbnail,
  InlineStack,
  Divider,
  Box,
  List
} from "@shopify/polaris";
import { ImageIcon, PlusIcon, DeleteIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { shopify } from "../shopify.server";

// --- BACKEND (SERVER SIDE) ---
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  await shopify(context).authenticate.admin(request);
  return null;
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  // 1. Safe Mode: Try-Catch Block to prevent crashes
  try {
    const { admin } = await shopify(context).authenticate.admin(request);
    const formData = await request.formData();

    const productId = formData.get("productId") as string;
    const productTitle = formData.get("productTitle") as string;
    const tiersString = formData.get("tiers") as string;

    // Validation
    if (!tiersString || !productId) {
      throw new Error("Missing product or tiers data");
    }

    const tiers = JSON.parse(tiersString);

    // 2. Loop through tiers and create discounts
    const results = await Promise.all(tiers.map(async (tier: any) => {
      // Ensure calculation format (2 decimals)
      const discountAmount = parseFloat(tier.discountAmount).toFixed(2);
      
      const response = await admin.graphql(
        `#graphql
        mutation discountAutomaticBasicCreate($automaticBasicDiscount: DiscountAutomaticBasicInput!) {
          discountAutomaticBasicCreate(automaticBasicDiscount: $automaticBasicDiscount) {
            automaticDiscountNode {
              id
              automaticDiscount {
                 ... on DiscountAutomaticBasic {
                   title
                 }
              }
            }
            userErrors {
              field
              message
            }
          }
        }`,
        {
          variables: {
            automaticBasicDiscount: {
              title: `${productTitle} - Buy ${tier.quantity} for ${tier.dealPrice}`, 
              startsAt: new Date().toISOString(),
              minimumRequirement: {
                quantity: {
                  greaterThanOrEqualToQuantity: tier.quantity.toString()
                }
              },
              customerGets: {
                value: {
                  discountAmount: {
                    amount: discountAmount, 
                    appliesOnEachItem: false 
                  }
                },
                items: {
                  products: {
                    productsToAdd: [productId]
                  }
                }
              }
            },
          },
        },
      );

      const responseJson = await response.json();
      
      // Check for internal GraphQL errors
      const userErrors = responseJson.data?.discountAutomaticBasicCreate?.userErrors;
      if (userErrors && userErrors.length > 0) {
         console.error("Shopify API Error:", userErrors);
         throw new Error(userErrors[0].message);
      }
      
      return responseJson;
    }));

    return { success: true };

  } catch (error: any) {
    console.error("❌ SERVER ERROR:", error);
    // Return error to frontend instead of crashing
    return { 
      success: false, 
      errors: [{ message: error.message || "Something went wrong on the server." }] 
    };
  }
};

// --- FRONTEND (CLIENT SIDE) ---
export default function Index() {
  const navigation = useNavigation();
  const shopifyApp = useAppBridge();
  const actionData = useActionData<typeof action>() as any; // Type casting for ease
  const submit = useSubmit();
  const isLoading = navigation.state === "submitting" || navigation.state === "loading";

  // State for Product
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [originalUnitPrice, setOriginalUnitPrice] = useState(0);

  // State for Tiers
  const [tiers, setTiers] = useState([
    { quantity: "2", dealPrice: "15" }
  ]);

  // Product Picker Open
  const handleSelectProduct = async () => {
    const selected = await shopifyApp.resourcePicker({
      type: 'product',
      multiple: false,
      action: "select"
    });

    if (selected) {
      // FIX 1: 'as any' added to solve TypeScript error
      const product = selected[0] as any;

      setSelectedProduct(product);

      // Extract price safely
      const price = parseFloat(product.variants[0].price);
      setOriginalUnitPrice(price);
    }
  };

  // Tier Methods
  const addTier = () => {
    setTiers([...tiers, { quantity: "", dealPrice: "" }]);
  };

  const removeTier = (index: number) => {
    const newTiers = [...tiers];
    newTiers.splice(index, 1);
    setTiers(newTiers);
  };

  const updateTier = (index: number, field: string, value: string) => {
    const newTiers = [...tiers];
    // @ts-ignore
    newTiers[index][field] = value;
    setTiers(newTiers);
  };

  // Submit Handler
  const handleSubmit = () => {
    if (!selectedProduct) return;

    // Frontend Calculation Logic
    const preparedTiers = tiers.map(tier => {
      const qty = parseFloat(tier.quantity);
      const deal = parseFloat(tier.dealPrice);
      const totalOriginal = originalUnitPrice * qty;
      const discount = (totalOriginal - deal).toFixed(2);
      
      return {
        quantity: tier.quantity,
        dealPrice: tier.dealPrice,
        discountAmount: discount
      };
    });

    const formData = new FormData();
    formData.append("productId", selectedProduct.id);
    formData.append("productTitle", selectedProduct.title);
    formData.append("tiers", JSON.stringify(preparedTiers));

    submit(formData, { method: "POST" });
  };

  useEffect(() => {
    if (actionData?.success) {
      shopifyApp.toast.show("All Pricing Tiers Created Successfully!");
      setTiers([{ quantity: "2", dealPrice: "15" }]); // Reset form
      setSelectedProduct(null);
    } else if (actionData?.errors) {
       shopifyApp.toast.show("Error creating discounts", { isError: true });
    }
  }, [actionData, shopifyApp]);

  return (
    <Page>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <Text as="h2" variant="headingMd">Create Multi-Tier Pricing Deals</Text>
                
                {/* Error Banner */}
                {actionData?.errors && (
                  <Banner tone="critical" title="Error">
                    <List>
                      {actionData.errors.map((err: any, i: number) => (
                        <List.Item key={i}>{err.message}</List.Item>
                      ))}
                    </List>
                  </Banner>
                )}

                {/* 1. PRODUCT SELECTION */}
                <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Step 1: Select Product</Text>
                    {selectedProduct ? (
                        <InlineStack gap="400" align="start" blockAlign="center">
                            <Thumbnail
                                source={selectedProduct.images[0]?.originalSrc || ImageIcon}
                                alt={selectedProduct.title}
                            />
                            <BlockStack gap="100">
                                <Text as="span" variant="headingSm">{selectedProduct.title}</Text>
                                <Text as="span" tone="critical" fontWeight="bold">
                                  Original Price: {originalUnitPrice} per item
                                </Text>
                            </BlockStack>
                            <Button onClick={handleSelectProduct} variant="plain">Change</Button>
                        </InlineStack>
                    ) : (
                        <Button onClick={handleSelectProduct}>Select a Product</Button>
                    )}
                </BlockStack>

                <Divider />

                {/* 2. TIERS CONFIGURATION */}
                {selectedProduct && (
                  <BlockStack gap="400">
                    <InlineStack align="space-between">
                       <Text as="h3" variant="headingSm">Step 2: Set Pricing Tiers</Text>
                       <Button icon={PlusIcon} onClick={addTier} variant="plain">Add Tier</Button>
                    </InlineStack>
                    
                    {tiers.map((tier, index) => {
                      // Live Calculation for Display
                      const qty = parseFloat(tier.quantity) || 0;
                      const deal = parseFloat(tier.dealPrice) || 0;
                      const originalTotal = originalUnitPrice * qty;
                      const saving = originalTotal - deal;
                      
                      return (
                        <Box 
                          key={index} 
                          background="bg-surface-secondary" 
                          padding="400" 
                          borderRadius="200"
                        >
                          <BlockStack gap="300">
                            <InlineStack gap="400" align="start">
                              <div style={{width: "120px"}}>
                                <TextField
                                  label="Quantity"
                                  type="number"
                                  value={tier.quantity}
                                  onChange={(v) => updateTier(index, "quantity", v)}
                                  autoComplete="off"
                                  placeholder="e.g. 2"
                                />
                              </div>
                              <div style={{width: "150px"}}>
                                <TextField
                                  label="Total Deal Price"
                                  type="number"
                                  value={tier.dealPrice}
                                  onChange={(v) => updateTier(index, "dealPrice", v)}
                                  autoComplete="off"
                                  prefix="$"
                                  placeholder="e.g. 15"
                                />
                              </div>
                              <div style={{marginTop: '28px'}}>
                                <Button 
                                  icon={DeleteIcon} 
                                  tone="critical" 
                                  onClick={() => removeTier(index)} 
                                  disabled={tiers.length === 1}
                                />
                              </div>
                            </InlineStack>
                            
                            {/* Live Calculation info text */}
                            {qty > 0 && deal > 0 && (
                              <Text as="p" variant="bodySm" tone="subdued">
                                Logic: Buy {qty} items (Normally {originalTotal}) for <b>{deal}</b>. 
                                <span style={{color: "green", fontWeight: "bold"}}> System will discount {saving.toFixed(2)}.</span>
                              </Text>
                            )}
                          </BlockStack>
                        </Box>
                      )
                    })}

                    <Button loading={isLoading} onClick={handleSubmit} variant="primary">
                        Create All Deals
                    </Button>
                  </BlockStack>
                )}

              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}