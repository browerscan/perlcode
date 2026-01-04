// Static imports for Vite/Astro build compatibility
import questionsData from "../generated/questions.json";
import categoriesData from "../generated/categories.json";
import metaData from "../generated/meta.json";

export interface GeneratedQuestion {
  slug: string;
  title: string;
  question: string;
  answer_html: string;
  category: string;
  tags: string[];
  difficulty: "beginner" | "intermediate" | "advanced" | string;
  created_at: string;
  published_at: string | null;
  is_verified: boolean;
  is_indexable?: boolean;
  code_snippet: string | null;
  code_stdout: string | null;
  code_stderr: string | null;
  code_runtime_ms: number | null;
  perl_version: string | null;
}

export interface GeneratedCategory {
  name: string;
  slug: string;
  total: number;
  verified: number;
  indexable: number;
}

export interface GeneratedMeta {
  generated_at: string;
  total_questions: number;
  verified_questions: number;
  indexable_questions: number;
}

export async function loadQuestions(): Promise<GeneratedQuestion[]> {
  return questionsData as GeneratedQuestion[];
}

export async function loadCategories(): Promise<GeneratedCategory[]> {
  return categoriesData as GeneratedCategory[];
}

export async function loadMeta(): Promise<GeneratedMeta | null> {
  return metaData as GeneratedMeta;
}

export function isIndexableQuestion(q: GeneratedQuestion): boolean {
  return Boolean(q.is_verified && q.published_at);
}

// Normalize category names for display
const categoryDisplayNames: Record<string, string> = {
  'general': 'General',
  'file-io': 'File I/O',
  'regex': 'Regular Expressions',
  'data-structures': 'Data Structures',
  'one-liners': 'One-Liners',
  'text-processing': 'Text Processing',
  'system-admin': 'System Administration',
  'cpan': 'CPAN Modules',
  'oop': 'Object-Oriented Perl',
  'dbi': 'Database (DBI)',
  'control-flow': 'Control Flow',
  'variables': 'Variables & Scalars',
  'networking': 'Networking',
  'http': 'HTTP & Web',
  'subroutines': 'Subroutines',
  'testing': 'Testing',
  'serialization': 'Serialization (JSON/YAML)',
  'debugging': 'Debugging',
  'basics': 'Perl Basics',
  'devops': 'DevOps',
  'sysadmin': 'System Admin',
  'advanced': 'Advanced Topics',
  'data': 'Data Processing',
};

export function formatCategoryName(slug: string): string {
  if (categoryDisplayNames[slug]) {
    return categoryDisplayNames[slug];
  }
  // Clean up ugly names like "Programming Languages > Perl"
  const cleaned = slug
    .replace(/[>\\/]/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
  // Title case
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}
