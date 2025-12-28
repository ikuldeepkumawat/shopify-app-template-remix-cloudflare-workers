
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { shopify } from "../shopify.server";

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  await shopify(context).authenticate.admin(request);

  return null;
};