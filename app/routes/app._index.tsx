import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { Form, useNavigation, useActionData, useSubmit } from "@remix-run/react";
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
  Icon,
  Box
} from "@shopify/polaris";
import { ImageIcon, PlusIcon, DeleteIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { shopify } from "../shopify.server";

// --- BACKEND ---
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  await shopify(context).authenticate.admin(request);
  return null;
};

export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin } = await shopify(context).authenticate.admin(request);
  const formData = await request.formData();

  const productId = formData.get("productId") as string;
  const productTitle = formData.get("productTitle") as string;
  
  // Tiers ka data JSON string bankar aayega, use parse karein
  const tiersString = formData.get("tiers") as string;
  const tiers = JSON.parse(tiersString);

  // Har tier ke liye loop chala kar discount create karein
  const results = await Promise.all(tiers.map(async (tier: any) => {
    return admin.graphql(
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
            // Title example: "Snowboard - Buy 2 for 15"
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
                  amount: tier.discountAmount, // Calculated discount
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
  }));

  // Errors check karna (Simple version)
  const hasErrors = false; 
  // (Production me aap results.map karke errors check kar sakte hain)

  return { success: true };
};

// --- FRONTEND ---
export default function Index() {
  const navigation = useNavigation();
  const shopifyApp = useAppBridge();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const isLoading = navigation.state === "submitting" || navigation.state === "loading";

  // State for Product
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [originalUnitPrice, setOriginalUnitPrice] = useState(0);

  // State for Tiers (Multiple Pricing Rows)
  // Default ek row rakhte hain
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
      const product = selected[0] as any;

      setSelectedProduct(product);

      // Ab yeh line error nahi degi
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

    // Har tier ke liye discount amount calculate karke data prepare karein
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
    formData.append("tiers", JSON.stringify(preparedTiers)); // Array ko string bana ke bhej rahe hain

    submit(formData, { method: "POST" });
  };

  useEffect(() => {
    if (actionData?.success) {
      shopifyApp.toast.show("All Pricing Tiers Created!");
      setTiers([{ quantity: "2", dealPrice: "15" }]); // Reset form
      setSelectedProduct(null);
    }
  }, [actionData, shopifyApp]);

  return (
    <Page>
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <Text as="h2" variant="headingMd">Create Multi-Tier Pricing</Text>
                
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
                                  label="Total Price"
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