export interface Note {
  id: string;
  title: string;
  content: string;
  folder: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalFile {
  id: string;
  name: string;
  systemPath: string;
  size: string;
  type: 'pdf' | 'image' | 'video' | 'audio' | 'markdown' | 'code' | 'other';
  addedAt: string;
  previewUrl?: string; // Standard url for dummy or loaded data
  previewContent?: string; // Textual content for mock files
}

export interface SearchMatch {
  noteId: string;
  title: string;
  lineText: string;
  lineNumber: number;
}
