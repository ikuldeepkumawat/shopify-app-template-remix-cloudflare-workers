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

interface Tier { quantity: string; price: string; }
interface DiscountRule { id: string; productId: string; productTitle: string; productImage: string | null; tiers: string; }

// --- LOADER ---
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { session } = await shopify(context).authenticate.admin(request);
  const rules = await db(context.cloudflare.env.DATABASE_URL).volumeDiscount.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: 'desc' }
  });
  return json({ rules });
};

// --- UPDATED ACTION FUNCTION ---
export const action = async ({ request, context }: ActionFunctionArgs) => {
  const { admin, session } = await shopify(context).authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");
  const shop = session.shop;

  try {
    // 1. DATABASE SAVE (Create/Update/Delete logic wahi purana rahega)
    if (actionType === "delete") {
      const id = formData.get("id") as string;
      await db(context.cloudflare.env.DATABASE_URL).volumeDiscount.delete({ where: { id } });
    } 
    else {
      // Create/Update Logic...
      const productId = formData.get("productId") as string;
      const productTitle = formData.get("productTitle") as string;
      const productImage = formData.get("productImage") as string;
      const tiersString = formData.get("tiers") as string;

      if (actionType === "create") {
         const existing = await db(context.cloudflare.env.DATABASE_URL).volumeDiscount.findFirst({ where: { shop, productId } });
         if (existing) return json({ success: false, message: "Rule exists. Please Edit." });

         await db(context.cloudflare.env.DATABASE_URL).volumeDiscount.create({
           data: { shop, productId, productTitle, productImage, tiers: tiersString }
         });
      }
      if (actionType === "update") {
         const id = formData.get("id") as string;
         await db(context.cloudflare.env.DATABASE_URL).volumeDiscount.update({ where: { id }, data: { tiers: tiersString } });
      }
    }

    // 2. METAFIELD SYNC (FIXED LOGIC) 🛠️
    
    // Step A: Pehle Shop ki GID (ID) nikalo
    const shopResponse = await admin.graphql(`{ shop { id } }`);
    const shopJson = await shopResponse.json();
    const shopId = shopJson.data.shop.id; // e.g., "gid://shopify/Shop/123456"

    // Step B: DB se data nikalo
    const allRules = await db(context.cloudflare.env.DATABASE_URL).volumeDiscount.findMany({ where: { shop } });
    const metafieldData = allRules.map(rule => ({
      productId: rule.productId,
      tiers: JSON.parse(rule.tiers)
    }));

    console.log("Saving Metafield Data:", JSON.stringify(metafieldData)); // Logs check karna terminal me

    // Step C: Metafield Save karo
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
              ownerId: shopId, // <--- CORRECT ID YAHAN JAYEGI
              value: JSON.stringify(metafieldData)
            }
          ]
        }
      }
    );

    const responseJson = await response.json();
    console.log("Shopify Response:", JSON.stringify(responseJson)); // Error hoga to yahan dikhega

    if (responseJson.data?.metafieldsSet?.userErrors?.length > 0) {
      throw new Error(responseJson.data.metafieldsSet.userErrors[0].message);
    }

    return json({ success: true, message: "Synced to Shopify successfully!" });

  } catch (error: any) {
    console.error("Action Error:", error);
    return json({ success: false, message: error.message });
  }
};
// Helper to get Shop ID (Required for Metafields)
async function getShopId(admin: any) {
  const response = await admin.graphql(`{ shop { id } }`);
  const data = await response.json();
  return data.data.shop.id.split("/").pop();
}

// --- FRONTEND (Same as before) ---
export default function VolumeDiscountPage() {
    // ... (Pichle code ka pura Frontend yahan same rahega) ...
    // Code lamba na ho isliye Frontend repeat nahi kar raha hu, 
    // bas Action update kar lo upar wala.
    
    // Lekin Frontend me wahi puraana code rahega jo maine pichle reply me diya tha.
    // Sirf 'action' function replace karna hai.

    // Agar pura code chahiye to batao, main paste kar dunga dobara.
    const { rules } = useLoaderData<{ rules: DiscountRule[] }>();
    const actionData = useActionData<typeof action>() as any;
    const nav = useNavigation();
    const shopifyApp = useAppBridge();
    const submit = useSubmit();
    const isLoading = nav.state === "submitting";
  
    // State Management
    const [activeModal, setActiveModal] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
  
    // Form Data
    const [formId, setFormId] = useState("");
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    
    // Dynamic Tiers State (Array of Objects)
    const [tiers, setTiers] = useState<Tier[]>([{ quantity: "", price: "" }]);
  
    // --- HANDLERS ---
  
    const toggleModal = useCallback(() => {
      setActiveModal(!activeModal);
      if (activeModal) {
        // Reset Form on Close
        setTiers([{ quantity: "", price: "" }]);
        setSelectedProduct(null);
        setFormId("");
        setIsEditMode(false);
      }
    }, [activeModal]);
  
    // Product Selector
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
  
    // Tier Management (Add/Remove/Update)
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
  
    // Click on EDIT Button
    const handleEdit = (rule: DiscountRule) => {
      setFormId(rule.id);
      setSelectedProduct({
        id: rule.productId,
        title: rule.productTitle,
        image: rule.productImage
      });
      // Database se string aayi, usko wapis JSON array banaya
      setTiers(JSON.parse(rule.tiers));
      setIsEditMode(true);
      setActiveModal(true);
    };
  
    // Submit Form
    const handleSave = () => {
      if (!selectedProduct) return shopifyApp.toast.show("Select a product", { isError: true });
  
      // Simple Validation: Check empty fields
      const isValid = tiers.every(t => t.quantity && t.price);
      if(!isValid) return shopifyApp.toast.show("Fill all tier fields", { isError: true });
  
      const formData = new FormData();
      formData.append("actionType", isEditMode ? "update" : "create");
      if (isEditMode) formData.append("id", formId);
  
      formData.append("productId", selectedProduct.id);
      formData.append("productTitle", selectedProduct.title);
      formData.append("productImage", selectedProduct.image || "");
      // JSON ko string banakar bhej rahe hain
      formData.append("tiers", JSON.stringify(tiers));
  
      submit(formData, { method: "POST" });
      toggleModal();
    };
  
    // Delete Confirmation
    const confirmDelete = () => {
      if(!deleteId) return;
      const formData = new FormData();
      formData.append("actionType", "delete");
      formData.append("id", deleteId);
      submit(formData, { method: "POST" });
      setDeleteId(null);
    };
  
    // Notifications
    useEffect(() => {
      if (actionData?.success) shopifyApp.toast.show(actionData.message);
      else if (actionData?.success === false) shopifyApp.toast.show(actionData.message, { isError: true });
    }, [actionData, shopifyApp]);
  
    // Table Row Markup
    const rowMarkup = rules.map((rule, index) => {
      const parsedTiers: Tier[] = JSON.parse(rule.tiers);
      
      // Summary Text (e.g., "Buy 2 @ $10, Buy 5 @ $8")
      const summary = parsedTiers.map(t => `Qty ${t.quantity}: $${t.price}`).join(" | ");
  
      return (
        <IndexTable.Row id={rule.id} key={rule.id} position={index}>
          <IndexTable.Cell>
              <InlineStack gap="200" blockAlign="center">
                  <Thumbnail source={rule.productImage || ""} alt={rule.productTitle} size="small" />
                  <Text variant="bodyMd" fontWeight="bold" as="span">{rule.productTitle}</Text>
              </InlineStack>
          </IndexTable.Cell>
          <IndexTable.Cell><Badge tone="info">{`${parsedTiers.length} Rules`}</Badge></IndexTable.Cell>
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
                   <Text as="p" tone="subdued">No volume discounts found.</Text>
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
  
        {/* --- MODAL FOR CREATE / EDIT --- */}
        <Modal
          open={activeModal}
          onClose={toggleModal}
          title={isEditMode ? "Edit Volume Discount" : "Create New Discount"}
          primaryAction={{ content: isEditMode ? "Update" : "Save", onAction: handleSave, loading: isLoading }}
          secondaryActions={[{ content: "Cancel", onAction: toggleModal }]}
        >
          <Modal.Section>
            <BlockStack gap="500">
              
              {/* Step 1: Product Selection */}
              <Card>
                  <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">Selected Product</Text>
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
  
              {/* Step 2: Dynamic Tiers Table */}
              {selectedProduct && (
                  <BlockStack gap="300">
                      <InlineStack align="space-between">
                          <Text as="h3" variant="headingSm">Pricing Rules</Text>
                          <Button size="micro" icon={PlusIcon} onClick={addTierRow}>Add Row</Button>
                      </InlineStack>
                      
                      {tiers.map((tier, index) => (
                          <InlineStack key={index} gap="300" blockAlign="end">
                              <div style={{flex: 1}}>
                                  <TextField 
                                      label={index === 0 ? "Min Quantity" : ""} 
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
                      
                      <Banner tone="info">
                          Example: Buy {tiers[0].quantity || "X"} items for ${tiers[0].price || "Y"} each.
                      </Banner>
                  </BlockStack>
              )}
  
            </BlockStack>
          </Modal.Section>
        </Modal>
  
        {/* --- DELETE CONFIRMATION --- */}
        <Modal
          open={!!deleteId}
          onClose={() => setDeleteId(null)}
          title="Delete Rule?"
          primaryAction={{ content: "Delete", onAction: confirmDelete, destructive: true, loading: isLoading }}
          secondaryActions={[{ content: "Cancel", onAction: () => setDeleteId(null) }]}
        >
          <Modal.Section>
              <Text as="p">Are you sure? This will remove volume pricing for this product.</Text>
          </Modal.Section>
        </Modal>
  
      </Page>
    );
  }