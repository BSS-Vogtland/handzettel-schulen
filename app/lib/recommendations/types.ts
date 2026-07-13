export type RecommendationCommissionType = "percentage" | "fixed";
export type RecommendationPatternType = "term" | "phrase";
export type RecommendationMatchField =
  | "raw_text"
  | "normalized_name"
  | "category"
  | "product_type"
  | "notes";

export type RecommendationNumeric = number | string;

export interface RecommendationPartner {
  id: string;
  project_key: string;
  partner_code: string;
  name: string;
  slug: string;
  description: string | null;
  target_url: string;
  logo_url: string | null;
  active: boolean;
  attribution_days: number;
  commission_type: RecommendationCommissionType | null;
  commission_value: RecommendationNumeric | null;
  currency: string;
  disclosure_text: string | null;
  internal_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecommendationPartnerCategory {
  id: string;
  project_key: string;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface RecommendationPartnerCategoryLink {
  id: string;
  project_key: string;
  partner_id: string;
  category_id: string;
  priority: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RecommendationRule {
  id: string;
  project_key: string;
  category_id: string;
  name: string;
  pattern_type: RecommendationPatternType;
  terms: string[];
  excluded_terms: string[];
  match_fields: RecommendationMatchField[];
  priority: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateRecommendationPartnerInput {
  projectKey?: string;
  partnerCode?: string;
  name: string;
  slug: string;
  description?: string | null;
  targetUrl: string;
  logoUrl?: string | null;
  active?: boolean;
  attributionDays?: number;
  commissionType?: RecommendationCommissionType | null;
  commissionValue?: RecommendationNumeric | null;
  currency?: string;
  disclosureText?: string | null;
  internalNote?: string | null;
}

export type UpdateRecommendationPartnerInput = Partial<
  Omit<CreateRecommendationPartnerInput, "partnerCode">
>;

export interface CreateRecommendationPartnerCategoryInput {
  projectKey?: string;
  name: string;
  slug: string;
  description?: string | null;
  active?: boolean;
  sortOrder?: number;
}

export type UpdateRecommendationPartnerCategoryInput =
  Partial<CreateRecommendationPartnerCategoryInput>;

export type CreateRecommendationCategoryInput =
  CreateRecommendationPartnerCategoryInput;
export type UpdateRecommendationCategoryInput =
  UpdateRecommendationPartnerCategoryInput;

export interface CreateRecommendationPartnerCategoryLinkInput {
  projectKey?: string;
  partnerId: string;
  categoryId: string;
  priority?: number;
  active?: boolean;
}

export type UpdateRecommendationPartnerCategoryLinkInput = Partial<
  Pick<CreateRecommendationPartnerCategoryLinkInput, "priority" | "active">
>;

export interface CreateRecommendationRuleInput {
  projectKey?: string;
  categoryId: string;
  name: string;
  patternType: RecommendationPatternType;
  terms: string[];
  excludedTerms?: string[];
  matchFields?: RecommendationMatchField[];
  priority?: number;
  active?: boolean;
}

export type UpdateRecommendationRuleInput = Partial<CreateRecommendationRuleInput>;
