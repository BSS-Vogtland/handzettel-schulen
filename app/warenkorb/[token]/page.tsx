import LegalFooter from "@/components/LegalFooter";
import PreparedCustomerCartClient from "./PreparedCustomerCartClient";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    token: string;
  }>;
};

export default async function PreparedCustomerCartPage({
  params,
}: PageProps) {
  const { token } = await params;

  return (
    <>
      <PreparedCustomerCartClient token={token} />
      <LegalFooter />
    </>
  );
}