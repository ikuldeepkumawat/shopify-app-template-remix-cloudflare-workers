import { useEffect, useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page, Layout, Card, Button, BlockStack, TextField, IndexTable, Modal,
  Text, InlineStack, Thumbnail, Badge, Banner
} from "@shopify/polaris";
import { PlusIcon, DeleteIcon, EditIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { shopify } from "../shopify.server";
import db from "../db.server";

// --- TYPES ---
interface Tier { quantity: string; price: string; }
interface DiscountRule { id: string; productId: string; productTitle: string; productImage: string | null; tiers: string; }

// --- LOADER (Read Data for UI) ---
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { session } = await shopify(context).authenticate.admin(request);
  
  // Note: Ensure your db.server.ts handles Cloudflare Env if needed
  // If you use db(context.env), change 'db' to that function call here.
  const rules = await db(context.cloudflare.env.DATABASE_URL).volumeDiscount.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });
  
  return json({ rules });
};

// --- ACTION (Create / Update / Delete Logic) ---
export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await shopify(context).authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  const shop = session.shop;

  try {
    // 1. GATHER INPUTS
    const productId = formData.get("productId") as string;
    const tiersString = formData.get("tiers") as string;
    
    // Fetch Shop ID (Required for Metafield Owner)
    const shopResponse = await admin.graphql(`{ shop { id } }`);
    const shopJson = await shopResponse.json();
    const shopId = shopJson.data.shop.id;

    // 2. DATABASE OPERATIONS (For UI Sync)
    // Cloudflare DB might reset, but this keeps the UI responsive
    if (actionType === "delete") {
      const id = formData.get("id") as string;
      try { 
        await db(context.cloudflare.env.DATABASE_URL).volumeDiscount.delete({ where: { id } }); 
      } catch(e) {
        console.log("DB Delete skipped or failed", e);
      }
    } 
    else {
      const productTitle = formData.get("productTitle") as string;
      const productImage = formData.get("productImage") as string;

      if (actionType === "create") {
         const existing = await db(context.cloudflare.env.DATABASE_URL).volumeDiscount.findFirst({ where: { shop, productId } });
         if (!existing) {
            await db(context.cloudflare.env.DATABASE_URL).volumeDiscount.create({
              data: { shop, productId, productTitle, productImage, tiers: tiersString }
            });
         }
      }
      if (actionType === "update") {
         const id = formData.get("id") as string;
         await db(context.cloudflare.env.DATABASE_URL).volumeDiscount.update({ where: { id }, data: { tiers: tiersString } });
      }
    }

    // 3. METAFIELD SYNC (THE MAIN LOGIC) 🛠️
    
    // Step A: Fetch EXISTING Data from Shopify (Read)
    const metaResponse = await admin.graphql(
      `query {
        shop {
          metafield(namespace: "volume_app", key: "config") {
            value
          }
        }
      }`
    );
    const metaJson = await metaResponse.json();
    
    let existingRules: any[] = [];
    try {
        const rawValue = metaJson.data.shop.metafield?.value;
        if (rawValue) existingRules = JSON.parse(rawValue);
    } catch (e) {
        existingRules = [];
    }

    // Step B: Update the List in Memory (Merge/Filter)
    if (actionType === "delete") {
        // Frontend must send productId for this to work correctly
        if (productId) {
             existingRules = existingRules.filter((r: any) => r.productId !== productId);
        }
    } 
    else {
        // Create or Update
        const newRule = {
            productId: productId,
            tiers: JSON.parse(tiersString)
        };

        const index = existingRules.findIndex((r: any) => r.productId === productId);

        if (index > -1) {
            existingRules[index] = newRule; // Replace existing
        } else {
            existingRules.push(newRule);    // Add new
        }
    }

    console.log("Saving Merged Rules to Shopify:", JSON.stringify(existingRules));

    // Step C: Save consolidated list back to Shopify (Write)
    const response = await admin.graphql(
      `#graphql
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
          metafields { key value }
        }
      }`,
      {
        variables: {
          metafields: [
            {
              namespace: "volume_app",
              key: "config",
              type: "json",
              ownerId: shopId,
              value: JSON.stringify(existingRules)
            }
          ]
        }
      }
    );

    const responseJson = await response.json();
    if (responseJson.data?.metafieldsSet?.userErrors?.length > 0) {
      throw new Error(responseJson.data.metafieldsSet.userErrors[0].message);
    }

    return json({ success: true, message: "Rule saved & synced successfully!" });

  } catch (error: any) {
    console.error("Action Error:", error);
    return json({ success: false, message: error.message });
  }
};

// --- FRONTEND COMPONENT ---
export default function VolumeDiscountPage() {
  const { rules } = useLoaderData<{ rules: DiscountRule[] }>();
  const actionData = useActionData<typeof action>() as any;
  const nav = useNavigation();
  const shopifyApp = useAppBridge();
  const submit = useSubmit();
  const isLoading = nav.state === "submitting";

  // Local State
  const [activeModal, setActiveModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form State
  const [formId, setFormId] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [tiers, setTiers] = useState<Tier[]>([{ quantity: "", price: "" }]);

  // Handlers
  const toggleModal = useCallback(() => {
    setActiveModal(!activeModal);
    if (activeModal) {
      // Reset logic
      setTiers([{ quantity: "", price: "" }]);
      setSelectedProduct(null);
      setFormId("");
      setIsEditMode(false);
    }
  }, [activeModal]);

  const handleSelectProduct = async () => {
    const selected = await shopifyApp.resourcePicker({ type: "product", multiple: false, action: "select" });
    if (selected) {
      const product = selected[0] as any;
      setSelectedProduct({
        id: product.id,
        title: product.title,
        image: product.images[0]?.originalSrc,
      });
    }
  };

  const addTierRow = () => setTiers([...tiers, { quantity: "", price: "" }]);
  
  const removeTierRow = (index: number) => {
    const newTiers = [...tiers];
    newTiers.splice(index, 1);
    setTiers(newTiers);
  };

  const handleTierChange = (index: number, field: keyof Tier, value: string) => {
    const newTiers = [...tiers];
    newTiers[index][field] = value;
    setTiers(newTiers);
  };

  const handleEdit = (rule: DiscountRule) => {
    setFormId(rule.id);
    setSelectedProduct({
      id: rule.productId,
      title: rule.productTitle,
      image: rule.productImage
    });
    try {
        setTiers(JSON.parse(rule.tiers));
    } catch(e) {
        setTiers([{ quantity: "", price: "" }]);
    }
    setIsEditMode(true);
    setActiveModal(true);
  };

  const handleSave = () => {
    if (!selectedProduct) return shopifyApp.toast.show("Select a product", { isError: true });

    const isValid = tiers.every(t => t.quantity && t.price);
    if(!isValid) return shopifyApp.toast.show("Fill all tier fields", { isError: true });

    const formData = new FormData();
    formData.append("actionType", isEditMode ? "update" : "create");
    if (isEditMode) formData.append("id", formId);

    formData.append("productId", selectedProduct.id);
    formData.append("productTitle", selectedProduct.title);
    formData.append("productImage", selectedProduct.image || "");
    formData.append("tiers", JSON.stringify(tiers));

    submit(formData, { method: "POST" });
    toggleModal();
  };

  // --- DELETE LOGIC (UPDATED) ---
  const confirmDelete = () => {
    if(!deleteId) return;

    // Find the rule object to get productId
    const ruleToDelete = rules.find(r => r.id === deleteId);
    
    const formData = new FormData();
    formData.append("actionType", "delete");
    formData.append("id", deleteId);
    
    // IMPORTANT: Send Product ID so we can remove it from Metafields too
    if (ruleToDelete) {
        formData.append("productId", ruleToDelete.productId);
    }

    submit(formData, { method: "POST" });
    setDeleteId(null);
  };

  // Toast Notifications
  useEffect(() => {
    if (actionData?.success) shopifyApp.toast.show(actionData.message);
    else if (actionData?.success === false) shopifyApp.toast.show(actionData.message, { isError: true });
  }, [actionData, shopifyApp]);

  // UI Markup
  const rowMarkup = rules.map((rule, index) => {
    let parsedTiers: Tier[] = [];
    try { parsedTiers = JSON.parse(rule.tiers); } catch(e) {}
    
    const summary = parsedTiers.map(t => `Qty ${t.quantity}: $${t.price}`).join(" | ");

    return (
      <IndexTable.Row id={rule.id} key={rule.id} position={index}>
        <IndexTable.Cell>
            <InlineStack gap="200" blockAlign="center">
                <Thumbnail source={rule.productImage || ""} alt={rule.productTitle} size="small" />
                <Text variant="bodyMd" fontWeight="bold" as="span">{rule.productTitle}</Text>
            </InlineStack>
        </IndexTable.Cell>
        <IndexTable.Cell><Badge tone="info">{`${parsedTiers.length} Tiers`}</Badge></IndexTable.Cell>
        <IndexTable.Cell>{summary}</IndexTable.Cell>
        <IndexTable.Cell>
            <InlineStack gap="200">
               <Button icon={EditIcon} onClick={() => handleEdit(rule)} size="micro" />
               <Button icon={DeleteIcon} tone="critical" onClick={() => setDeleteId(rule.id)} size="micro" />
            </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page title="Volume Discounts" primaryAction={<Button variant="primary" icon={PlusIcon} onClick={toggleModal}>Create Rule</Button>}>
      <Layout>
        <Layout.Section>
          <Card padding="0">
            {rules.length === 0 ? (
               <div style={{padding: "50px", textAlign: "center"}}>
                 <Text as="p" tone="subdued">No discounts yet. Create one!</Text>
               </div>
            ) : (
              <IndexTable 
                resourceName={{ singular: 'rule', plural: 'rules' }}
                itemCount={rules.length}
                headings={[{ title: 'Product' }, { title: 'Tiers' }, { title: 'Details' }, { title: 'Actions' }]}
                selectable={false}
              >
                {rowMarkup}
              </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      <Modal
        open={activeModal}
        onClose={toggleModal}
        title={isEditMode ? "Edit Discount" : "New Discount"}
        primaryAction={{ content: "Save", onAction: handleSave, loading: isLoading }}
        secondaryActions={[{ content: "Cancel", onAction: toggleModal }]}
      >
        <Modal.Section>
          <BlockStack gap="500">
            <Card>
                <BlockStack gap="200">
                    <Text as="h3" variant="headingSm">Product</Text>
                    {selectedProduct ? (
                        <InlineStack gap="400" blockAlign="center">
                            <Thumbnail source={selectedProduct.image} alt={selectedProduct.title} />
                            <Text as="span" fontWeight="bold">{selectedProduct.title}</Text>
                            {!isEditMode && <Button variant="plain" onClick={handleSelectProduct}>Change</Button>}
                        </InlineStack>
                    ) : (
                        <Button onClick={handleSelectProduct}>Select Product</Button>
                    )}
                </BlockStack>
            </Card>

            {selectedProduct && (
                <BlockStack gap="300">
                    <InlineStack align="space-between">
                        <Text as="h3" variant="headingSm">Tiers</Text>
                        <Button size="micro" icon={PlusIcon} onClick={addTierRow}>Add Tier</Button>
                    </InlineStack>
                    
                    {tiers.map((tier, index) => (
                        <InlineStack key={index} gap="300" blockAlign="end">
                            <div style={{flex: 1}}>
                                <TextField 
                                    label={index === 0 ? "Min Qty" : ""} 
                                    type="number" 
                                    value={tier.quantity} 
                                    onChange={(v) => handleTierChange(index, "quantity", v)} 
                                    autoComplete="off" 
                                    placeholder="e.g. 5"
                                />
                            </div>
                            <div style={{flex: 1}}>
                                <TextField 
                                    label={index === 0 ? "Unit Price" : ""} 
                                    type="number" 
                                    value={tier.price} 
                                    onChange={(v) => handleTierChange(index, "price", v)} 
                                    autoComplete="off" 
                                    prefix="$" 
                                    placeholder="e.g. 10.00"
                                />
                            </div>
                            <div style={{marginBottom: "2px"}}>
                                <Button icon={DeleteIcon} tone="critical" onClick={() => removeTierRow(index)} disabled={tiers.length === 1} />
                            </div>
                        </InlineStack>
                    ))}
                </BlockStack>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Rule?"
        primaryAction={{ content: "Delete", onAction: confirmDelete, destructive: true, loading: isLoading }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteId(null) }]}
      >
        <Modal.Section>
            <Text as="p">Are you sure you want to delete this rule?</Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}