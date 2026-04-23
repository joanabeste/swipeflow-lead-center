export interface Industry {
  id: string;
  label: string;
  display_order: number;
  is_active: boolean;
  greeting_template: string;
  headline_template: string;
  intro_template: string;
  outro_template: string | null;
  loom_url: string | null;
  calendly_url: string | null;
}

export interface CaseStudy {
  id: string;
  industry_id: string | null;
  title: string;
  subtitle: string | null;
  description: string | null;
  link_url: string | null;
  image_url: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface LandingPage {
  id: string;
  slug: string;
  lead_id: string | null;
  contact_id: string | null;
  industry_id: string | null;
  greeting: string;
  headline: string;
  intro_text: string;
  loom_url: string | null;
  outro_text: string | null;
  case_study_ids: string[];
  calendly_url: string | null;
  primary_color: string | null;
  logo_url: string | null;
  view_count: number;
  last_viewed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  deleted_at: string | null;
}

export interface LandingPageWithRelations extends LandingPage {
  case_studies: CaseStudy[];
  company_name: string | null;
  contact_name: string | null;
}
