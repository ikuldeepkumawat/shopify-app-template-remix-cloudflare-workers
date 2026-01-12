import { useState, useCallback, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Button,
  BlockStack,
  TextField,
  IndexTable,
  Modal,
  Text,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import { EditIcon, DeleteIcon, PlusIcon } from "@shopify/polaris-icons";
import { useAppBridge } from "@shopify/app-bridge-react";
import { shopify } from "../shopify.server";
import { db } from "../db.server";

// --- TYPES (TypeScript Error Fix) ---
interface PricingItem {
  id: string;
  itemName: string;
  price: number;
  quantity: number;
  createdAt: string;
}

// --- 1. BACKEND: FETCH DATA ---
export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  await shopify(context).authenticate.admin(request);

  // Database se data fetch
  const items = await db.(context.cloudflare.env.DATABASE_URL).pricingInventory.findMany({
    orderBy: { createdAt: 'desc' }
  });

  return json({ items });
};

// --- 2. BACKEND: SAVE / EDIT / DELETE ---
export const action = async ({ request, context }: ActionFunctionArgs) => {
  await shopify(context).authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("actionType");

  try {
    // --- CREATE ---
    if (actionType === "create") {
      const itemName = formData.get("itemName") as string;
      const price = parseFloat(formData.get("price") as string);
      const quantity = parseInt(formData.get("quantity") as string);
      
      if(!itemName) return json({ status: "fail", message: "Item Name zaroori hai" });

      await db.(context.cloudflare.env.DATABASE_URL).pricingInventory.create({
        data: { itemName, price, quantity }
      });
      return json({ status: "success", message: "Item Save Ho Gaya!" });
    }

    // --- UPDATE ---
    if (actionType === "update") {
      const id = formData.get("id") as string;
      const itemName = formData.get("itemName") as string;
      const price = parseFloat(formData.get("price") as string);
      const quantity = parseInt(formData.get("quantity") as string);

      await db.(context.cloudflare.env.DATABASE_URL).pricingInventory.update({
        where: { id },
        data: { itemName, price, quantity }
      });
      return json({ status: "success", message: "Item Update Ho Gaya!" });
    }

    // --- DELETE ---
    if (actionType === "delete") {
      const id = formData.get("id") as string;
      await db.(context.cloudflare.env.DATABASE_URL).pricingInventory.delete({ where: { id } });
      return json({ status: "success", message: "Item Delete Ho Gaya." });
    }

    return null;

  } catch (error) {
    console.error(error);
    return json({ status: "fail", message: "Database Error" });
  }
};

// --- 3. FRONTEND UI ---
export default function InventoryPage() {
  // Use explicit type for loader data
  const { items } = useLoaderData<{ items: PricingItem[] }>();
  const actionData = useActionData<typeof action>();
  const shopifyApp = useAppBridge();
  const submit = useSubmit();
  const nav = useNavigation();

  const isLoading = nav.state === "submitting";

  // State Management
  const [activeModal, setActiveModal] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  
  // FIX: Delete Confirmation State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Form Fields
  const [formId, setFormId] = useState("");
  const [itemName, setItemName] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");

  // Modal Toggle
  const toggleModal = useCallback(() => {
    setActiveModal(!activeModal);
    if (activeModal) {
      setItemName("");
      setPrice("");
      setQuantity("");
      setFormId("");
      setIsEditMode(false);
    }
  }, [activeModal]);

  // Handle Edit Click
  const handleEdit = (item: PricingItem) => {
    setFormId(item.id);
    setItemName(item.itemName);
    setPrice(item.price.toString());
    setQuantity(item.quantity.toString());
    
    setIsEditMode(true);
    setActiveModal(true);
  };

  // Handle Delete Button Click (Sets ID only)
  const handleDeleteClick = (id: string) => {
    setDeleteId(id); 
  };

  // Actual Delete Logic (Server Request)
  const confirmDelete = () => {
    if (!deleteId) return;
    
    const formData = new FormData();
    formData.append("actionType", "delete");
    formData.append("id", deleteId);
    submit(formData, { method: "POST" });
    
    setDeleteId(null); // Close Modal
  };

  // Save/Update Logic
  const handleSave = () => {
    const formData = new FormData();
    formData.append("actionType", isEditMode ? "update" : "create");
    if (isEditMode) formData.append("id", formId);
    
    formData.append("itemName", itemName);
    formData.append("price", price);
    formData.append("quantity", quantity);

    submit(formData, { method: "POST" });
    toggleModal();
  };

  // Toast Notifications
  useEffect(() => {
    if (actionData?.status === "success") {
      shopifyApp.toast.show(actionData.message);
    }
  }, [actionData, shopifyApp]);

  // Table Rows (Fixed Type Error)
  const rowMarkup = items.map(
    (item: PricingItem, index: number) => (
      <IndexTable.Row id={item.id} key={item.id} position={index}>
        <IndexTable.Cell>
          <Text variant="bodyMd" fontWeight="bold" as="span">{item.itemName}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>₹{item.price}</IndexTable.Cell>
        <IndexTable.Cell>{item.quantity}</IndexTable.Cell>
        <IndexTable.Cell>
           <Badge tone="success">{`₹${(item.price * item.quantity).toFixed(2)}`}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
           <InlineStack gap="200">
              <Button icon={EditIcon} onClick={() => handleEdit(item)} size="micro" />
              <Button icon={DeleteIcon} tone="critical" onClick={() => handleDeleteClick(item.id)} size="micro" />
           </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    ),
  );

  return (
    <Page
      title="Stock & Pricing"
      primaryAction={
        <Button variant="primary" icon={PlusIcon} onClick={toggleModal}>
          Add Stock
        </Button>
      }
    >
      <Layout>
        <Layout.Section>
          <Card padding="0">
            {items.length === 0 ? (
               <div style={{padding: "40px", textAlign: "center"}}>
                 <Text as="p" tone="subdued">Abhi koi data nahi hai. 'Add Stock' par click karein.</Text>
               </div>
            ) : (
              <IndexTable
                resourceName={{ singular: 'item', plural: 'items' }}
                itemCount={items.length}
                headings={[
                  { title: 'Item Name' },
                  { title: 'Price' },
                  { title: 'Quantity' },
                  { title: 'Total' },
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

      {/* --- ADD / EDIT MODAL --- */}
      <Modal
        open={activeModal}
        onClose={toggleModal}
        title={isEditMode ? "Edit Item" : "Add New Stock"}
        primaryAction={{
          content: isEditMode ? "Update" : "Save",
          onAction: handleSave,
          loading: isLoading
        }}
        secondaryActions={[{ content: 'Cancel', onAction: toggleModal }]}
      >
        <Modal.Section>
          <BlockStack gap="400">
            <TextField
              label="Item Name"
              value={itemName}
              onChange={(v) => setItemName(v)}
              autoComplete="off"
              placeholder="e.g. Red T-Shirt"
              autoFocus
            />
            <InlineStack gap="400" align="start">
              <div style={{flex: 1}}>
                <TextField
                  label="Price"
                  type="number"
                  value={price}
                  onChange={(v) => setPrice(v)}
                  autoComplete="off"
                  prefix="₹"
                  placeholder="0.00"
                />
              </div>
              <div style={{flex: 1}}>
                <TextField
                  label="Quantity"
                  type="number"
                  value={quantity}
                  onChange={(v) => setQuantity(v)}
                  autoComplete="off"
                  placeholder="0"
                />
              </div>
            </InlineStack>
          </BlockStack>
        </Modal.Section>
      </Modal>

      {/* --- DELETE CONFIRM MODAL --- */}
      <Modal
        open={!!deleteId}
        onClose={() => setDeleteId(null)}
        title="Delete Item?"
        primaryAction={{
            content: "Delete",
            onAction: confirmDelete,
            destructive: true,
            loading: isLoading
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setDeleteId(null) }]}
      >
        <Modal.Section>
            <Text as="p">
                Kya aap sure hain ki is item ko delete karna chahte hain?
            </Text>
        </Modal.Section>
      </Modal>

    </Page>
  );
}