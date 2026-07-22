import LegalFooter from "@/components/LegalFooter";
import ShopKasseClient from "./ShopKasseClient";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <>
      <ShopKasseClient />
      <LegalFooter />
    </>
  );
}
