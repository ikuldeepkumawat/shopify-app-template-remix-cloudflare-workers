import { useEffect, useState, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
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
  IndexTable,
  Modal,
  Box,
  Badge,
} from "@shopify/polaris";
import { ImageIcon, PlusIcon, DeleteIcon, EditIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { shopify } from "../shopify.server";
import db from "../db.server";

// --- TYPES ---
interface Tier {
  quantity: string;
  dealPrice: string;
}

interface PricingRule {
  id: string;
  productId: string;
  productTitle: string;
  tiers: string; // JSON String
  createdAt: string;
}

// --- BACKEND: LOADER (READ DATA) ---
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  const { session } = await shopify(context).authenticate.admin(request);
  const shop = session.shop;

  const prisma = db(context.cloudflare.env.DATABASE_URL);

  // Sirf Current Shop ka data layein
  const rules = await prisma.pricingRule.findMany({
    where: { shop: shop },
    orderBy: { createdAt: "desc" },
  });

  return json({ rules });
};

// --- BACKEND: ACTION (CREATE, UPDATE, DELETE) ---
export const action = async ({ request, context }: ActionFunctionArgs) => {
  try {
    const { session } = await shopify(context).authenticate.admin(request);
    const shop = session.shop;
    const prisma = db(context.cloudflare.env.DATABASE_URL);

    const formData = await request.formData();
    const actionType = formData.get("actionType");

    // 1. DELETE
    if (actionType === "delete") {
      const id = formData.get("id") as string;
      await prisma.pricingRule.delete({ where: { id } });
      return json({ success: true, message: "Rule Deleted Successfully" });
    }

    // Common Data for Create/Update
    const productId = formData.get("productId") as string;
    const productTitle = formData.get("productTitle") as string;
    const tiersString = formData.get("tiers") as string;

    if (!tiersString || !productId) {
      return json({ success: false, errors: [{ message: "Product details missing" }] });
    }

    // 2. CREATE
    if (actionType === "create") {
      await prisma.pricingRule.create({
        data: {
          shop, // Store URL save karna zaroori hai
          productId,
          productTitle,
          tiers: tiersString,
        },
      });
      return json({ success: true, message: "New Rule Created!" });
    }

    // 3. UPDATE
    if (actionType === "update") {
      const id = formData.get("id") as string;
      await prisma.pricingRule.update({
        where: { id },
        data: {
          productId,
          productTitle,
          tiers: tiersString,
        },
      });
      return json({ success: true, message: "Rule Updated Successfully!" });
    }

    return null;
  } catch (error: any) {
    console.error("❌ SERVER ERROR:", error);
    return json({ success: false, errors: [{ message: error.message }] });
  }
};

// --- FRONTEND ---
export default function Index() {
  const { rules } = useLoaderData<{ rules: PricingRule[] }>();
  const actionData = useActionData<typeof action>() as any;
  const navigation = useNavigation();
  const shopifyApp = useAppBridge();
  const submit = useSubmit();
  
  const isLoading = navigation.state === "submitting";

  // --- STATE ---
  const [activeModal, setActiveModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form State
  const [formId, setFormId] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [tiers, setTiers] = useState<Tier[]>([{ quantity: "2", dealPrice: "15" }]);

  // --- HANDLERS ---

  // 1. Open/Close Modal
  const toggleModal = useCallback(() => {
    setActiveModal(!activeModal);
    if (activeModal) {
      // Reset Form on Close
      setTiers([{ quantity: "2", dealPrice: "15" }]);
      setSelectedProduct(null);
      setFormId("");
      setIsEditMode(false);
    }
  }, [activeModal]);

  // 2. Handle Product Selection via ResourcePicker
  const handleSelectProduct = async () => {
    const selected = await shopifyApp.resourcePicker({
      type: "product",
      multiple: false,
      action: "select",
    });

    if (selected) {
      const product = selected[0] as any;
      setSelectedProduct({
        id: product.id,
        title: product.title,
        image: product.images[0]?.originalSrc,
        price: product.variants[0]?.price,
      });
    }
  };

  // 3. Handle Tier Changes
  const updateTier = (index: number, field: keyof Tier, value: string) => {
    const newTiers = [...tiers];
    newTiers[index][field] = value;
    setTiers(newTiers);
  };

  const addTier = () => setTiers([...tiers, { quantity: "", dealPrice: "" }]);
  
  const removeTier = (index: number) => {
    const newTiers = [...tiers];
    newTiers.splice(index, 1);
    setTiers(newTiers);
  };

  // 4. Handle Edit Click
  const handleEdit = (rule: PricingRule) => {
    setFormId(rule.id);
    setSelectedProduct({
        id: rule.productId,
        title: rule.productTitle,
        image: null // Edit me image fetch karna complex hota hai, simple rakha hai
    });
    setTiers(JSON.parse(rule.tiers)); // JSON string ko wapis array banana
    setIsEditMode(true);
    setActiveModal(true);
  };

  // 5. Handle Delete
  const confirmDelete = () => {
    if (!deleteId) return;
    const formData = new FormData();
    formData.append("actionType", "delete");
    formData.append("id", deleteId);
    submit(formData, { method: "POST" });
    setDeleteId(null);
  };

  // 6. Handle Submit (Save/Update)
  const handleSubmit = () => {
    if (!selectedProduct) {
      shopifyApp.toast.show("Please select a product", { isError: true });
      return;
    }

    const formData = new FormData();
    formData.append("actionType", isEditMode ? "update" : "create");
    if (isEditMode) formData.append("id", formId);

    formData.append("productId", selectedProduct.id);
    formData.append("productTitle", selectedProduct.title);
    formData.append("tiers", JSON.stringify(tiers));

    submit(formData, { method: "POST" });
    toggleModal();
  };

  // Notifications
  useEffect(() => {
    if (actionData?.success) {
      shopifyApp.toast.show(actionData.message);
    } else if (actionData?.errors) {
      shopifyApp.toast.show("Operation Failed", { isError: true });
    }
  }, [actionData, shopifyApp]);

  // --- RENDER TABLE ROW ---
  const rowMarkup = rules.map((rule, index) => {
    const parsedTiers = JSON.parse(rule.tiers);
    const summary = parsedTiers.map((t: any) => `Buy ${t.quantity} @ $${t.dealPrice}`).join(", ");

    return (
      <IndexTable.Row id={rule.id} key={rule.id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">{rule.productTitle}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
            <Badge tone="info">{parsedTiers.length} Tiers</Badge>
        </IndexTable.Cell>
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
    <Page
        title="Pricing Rules"
        primaryAction={<Button variant="primary" icon={PlusIcon} onClick={toggleModal}>Add Rule</Button>}
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            {rules.length === 0 ? (
                <div style={{padding: "40px", textAlign: "center"}}>
                    <Text as="p" tone="subdued">No pricing rules found. Create one to get started.</Text>
                </div>
            ) : (
                <IndexTable
                  resourceName={{ singular: 'rule', plural: 'rules' }}
                  itemCount={rules.length}
                  headings={[
                    { title: 'Product' },
                    { title: 'Count' },
                    { title: 'Details' },
                    { title: 'Actions' },
                  ]}
                  selectable={false}
                >
                  {rowMarkup}
                </IndexTable>
            )}
          </Card>
        </Layout.Section>
      </Layout>

      {/* --- CREATE / EDIT MODAL --- */}
      <Modal
        open={activeModal}
        onClose={toggleModal}
        title={isEditMode ? "Edit Pricing Rule" : "Create New Rule"}
        primaryAction={{
            content: isEditMode ? "Update" : "Save",
            onAction: handleSubmit,
            loading: isLoading
        }}
        secondaryActions={[{ content: "Cancel", onAction: toggleModal }]}
      >
        <Modal.Section>
          <BlockStack gap="500">
            
            {/* Step 1: Product Selector */}
            <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Select Product</Text>
                {selectedProduct ? (
                    <InlineStack gap="400" align="start" blockAlign="center">
                        <Thumbnail
                            source={selectedProduct.image || ImageIcon}
                            alt={selectedProduct.title}
                        />
                        <Text as="span" variant="headingSm">{selectedProduct.title}</Text>
                        <Button onClick={handleSelectProduct} variant="plain">Change</Button>
                    </InlineStack>
                ) : (
                    <Button onClick={handleSelectProduct}>Select a Product</Button>
                )}
            </BlockStack>

            {/* Step 2: Tiers Form */}
            {selectedProduct && (
                <BlockStack gap="400">
                    <InlineStack align="space-between">
                        <Text as="h3" variant="headingSm">Pricing Tiers</Text>
                        <Button icon={PlusIcon} onClick={addTier} variant="plain" size="micro">Add Tier</Button>
                    </InlineStack>
                    
                    {tiers.map((tier, index) => (
                        <Box key={index} background="bg-surface-secondary" padding="300" borderRadius="200">
                             <InlineStack gap="300" align="start">
                                <div style={{flex:1}}>
                                    <TextField
                                        label="Qty"
                                        type="number"
                                        value={tier.quantity}
                                        onChange={(v) => updateTier(index, "quantity", v)}
                                        autoComplete="off"
                                        placeholder="2"
                                    />
                                </div>
                                <div style={{flex:1}}>
                                    <TextField
                                        label="Price"
                                        type="number"
                                        value={tier.dealPrice}
                                        onChange={(v) => updateTier(index, "dealPrice", v)}
                                        autoComplete="off"
                                        prefix="$"
                                        placeholder="15"
                                    />
                                </div>
                                <div style={{marginTop: '28px'}}>
                                    <Button icon={DeleteIcon} tone="critical" onClick={() => removeTier(index)} disabled={tiers.length === 1} />
                                </div>
                             </InlineStack>
                        </Box>
                    ))}
                </BlockStack>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* --- DELETE MODAL --- */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Rule?"
        primaryAction={{
            content: "Delete",
            onAction: confirmDelete,
            destructive: true,
            loading: isLoading
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteId(null) }]}
      >
        <Modal.Section>
            <Text as="p">Are you sure you want to remove this pricing rule?</Text>
        </Modal.Section>
      </Modal>

    </Page>
  );
}