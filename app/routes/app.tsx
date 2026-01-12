import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

import { shopify } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

// 1. Type import sahi karein (Remix Cloudflare use kar rahe hain toh)
import { json } from "@remix-run/cloudflare"; 
// Agar upar wala error de, toh purana import hi rehne dein, bas logic badlein.

export const loader = async ({ request, context }: LoaderFunctionArgs) => {
  await shopify(context).authenticate.admin(request);

  // CHANGE HERE: Cloudflare par variables 'context.env' mein hote hain
  // Hamein check karna hai ki env kahan available hai
  // @ts-ignore - TypeScript kabhi kabhi env property nahi pehchanta
  const apiKey = context?.env?.SHOPIFY_API_KEY || context?.cloudflare?.env?.SHOPIFY_API_KEY || process.env.SHOPIFY_API_KEY;

  return json({ apiKey: apiKey || "" });
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/inventory">Inventory</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
