export interface Section {
  id: string;
  title: string;
  content: string;
  created_at: string;
  last_edit: string;
  subsections: Record<string, Section>;
  isNew?: boolean;
}

export interface Biography {
  id: string;
  title: string;
  content: string;
  created_at: string;
  last_edit: string;
  subsections: Record<string, Section>;
}

export interface BiographyEdit {
  type: 'RENAME' | 'DELETE' | 'CONTENT_CHANGE' | 'COMMENT' | 'ADD';
  sectionId: string;
  title: string;
  data?: {
    newTitle?: string;
    sectionPrompt?: string;
    newContent?: string;
    newPath?: string;
    comment?: {
      text: string;
      comment: string;
    };
  };
  timestamp: number;
} 