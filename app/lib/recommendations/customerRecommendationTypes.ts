export type CustomerPartnerRecommendation = {
  requestItemId: string;
  category: string;
  categoryReason: string;
  partner: {
    name: string;
    partnerCode: string;
    description: string | null;
    logoUrl: string | null;
    redirectPath: string;
  };
};
