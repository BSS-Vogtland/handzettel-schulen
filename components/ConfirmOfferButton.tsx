"use client";

import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";

type ConfirmOfferButtonProps = {
  offerToken?: string | null;
  token?: string | null;
  buttonLabel?: string | null;
  disabled?: boolean | null;
  isDisabled?: boolean | null;
  className?: string | null;

  pickupLocationLabel?: string | null;
  pickupAddressSnapshot?: string | null;
  pickupMapsUrlSnapshot?: string | null;
};

export default function ConfirmOfferButton(props: ConfirmOfferButtonProps) {
  const router = useRouter();

  const offerToken = String(props.offerToken || props.token || "").trim();
  const isDisabled = Boolean(props.disabled || props.isDisabled || !offerToken);

  const buttonClassName =
    props.className ||
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[#B5282D] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <button
      type="button"
      onClick={() => {
        if (!offerToken) return;
        router.push(`/angebot/${encodeURIComponent(offerToken)}/checkout`);
      }}
      disabled={isDisabled}
      className={buttonClassName}
    >
      <PackageCheck className="h-4 w-4" />
      {props.buttonLabel || "Paketwunsch bestätigen"}
    </button>
  );
}
