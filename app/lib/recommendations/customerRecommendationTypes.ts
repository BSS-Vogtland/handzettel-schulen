export type CustomerPartnerRecommendation = {
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
