import { BiographyEdit, Section } from '../types/biography';

/**
 * Formats content by hiding memo ID references (e.g., [MEM_123456_ABC])
 */
export const formatContent = (content: string): string => {
  if (!content) return '';
  return content.replace(/\[MEM_[^\]]+\]/g, '');
};


export const addOrUpdateEdit = (prevEdits: BiographyEdit[], newEdit: BiographyEdit): BiographyEdit[] => {
  // For comments, we don't filter out previous edits
  if (newEdit.type === 'COMMENT') {
    return [...prevEdits, newEdit];
  }
  
  // For other edit types, filter out previous edits of the same type for the same section
  const filteredEdits = prevEdits.filter(edit => 
    !(edit.type === newEdit.type && edit.sectionId === newEdit.sectionId)
  );
  
  return [...filteredEdits, newEdit];
};

export const sortSectionsByNumber = (sections: Record<string, Section>): Record<string, Section> => {
  return Object.fromEntries(
    Object.entries(sections)
      .sort(([, a], [, b]) => {
        const aNum = a.title.split(' ')[0].split('.').map(Number);
        const bNum = b.title.split(' ')[0].split('.').map(Number);
        
        // Compare each level of the section numbers
        for (let i = 0; i < Math.max(aNum.length, bNum.length); i++) {
          const aVal = aNum[i] || 0;
          const bVal = bNum[i] || 0;
          if (aVal !== bVal) return aVal - bVal;
        }
        return 0;
      })
  );
};

interface ParentSectionResult {
  parent: Section | null;
  path: string;
}

export const findParentSection = (
  sections: Record<string, Section>, 
  sectionNumber: string
): ParentSectionResult => {
  const parts = sectionNumber.split('.');
  parts.pop(); // Remove the last part since we want the parent
  
  if (parts.length === 0) {
    return { parent: null, path: '' };
  }

  const currentPath: string[] = [];
  let parent: Section | null = null;

  const findSectionByNumber = (
    sections: Record<string, Section>, 
    remainingParts: string[]
  ): Section | null => {
    if (remainingParts.length === 0) return null;
    
    const targetNumber = remainingParts.join('.');
    
    for (const [key, section] of Object.entries(sections)) {
      const [sectionNumber] = key.split(' ');
      if (sectionNumber === targetNumber) {
        currentPath.push(key);
        return section;
      }
      
      if (targetNumber.startsWith(sectionNumber + '.')) {
        currentPath.push(key);
        const found = findSectionByNumber(section.subsections, remainingParts);
        if (found) return found;
        currentPath.pop();
      }
    }
    return null;
  };

  parent = findSectionByNumber(sections, parts);
  return { parent, path: currentPath.join('/') };
};

export const isValidSubsectionNumber = (parentNumber: string, childNumber: string): boolean => {
  const parentParts = parentNumber.split('.');
  const childParts = childNumber.split('.');

  // Child should have exactly one more part than parent
  if (childParts.length !== parentParts.length + 1) {
    return false;
  }

  // All parts of child number should match parent except the last one
  for (let i = 0; i < parentParts.length; i++) {
    if (parentParts[i] !== childParts[i]) {
      return false;
    }
  }

  // Last part of child should be a number
  return !isNaN(Number(childParts[childParts.length - 1]));
};

export const isValidPathFormat = (sectionNumber: string): boolean => {
  if (!sectionNumber) {
    return true; // Empty path is valid (root)
  }

  const parts = sectionNumber.split('.');
  
  // Check maximum depth
  if (parts.length > 3) {
    return false;
  }
    
  // Validate first level requires single number prefix
  if (!parts[0] || !(/^\d+$/.test(parts[0]))) {
    return false;
  }
    
  // Validate second and third levels
  for (let i = 1; i < parts.length; i++) {
    const parentNumber = parts.slice(0, i).join('.');
    const currentNumber = parts.slice(0, i + 1).join('.');
    if (!isValidSubsectionNumber(parentNumber, currentNumber)) {
      return false;
    }
  }
    
  return true;
};

// Helper function to find a section and its parent
export const findSectionAndParent = (
  sections: Record<string, Section>, 
  id: string
): { section: Section; parent: Record<string, Section> } | null => {
  // Check direct children
  for (const [, section] of Object.entries(sections)) {
    if (section.id === id) {
      return { section, parent: sections };
    }
    
    // Check subsections
    const found = findSectionAndParent(section.subsections, id);
    if (found) {
      return found;
    }
  }
  return null;
};