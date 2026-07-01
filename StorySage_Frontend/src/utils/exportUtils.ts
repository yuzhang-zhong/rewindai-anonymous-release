import jsPDF from 'jspdf';
import { Biography, Section } from '../types/biography';
import { formatContent } from './biographyUtils';

const formatSectionForMarkdownExport = (section: Section, level: number = 1): string => {
  let content = `${'#'.repeat(level)} ${section.title}\n\n`;
  
  if (section.content) {
    content += `${formatContent(section.content)}\n\n`;
  }

  Object.values(section.subsections).forEach(subsection => {
    content += formatSectionForMarkdownExport(subsection, level + 1);
  });

  return content;
};

export const exportToPDF = (biography: Biography) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  // PDF configuration
  const config = {
    margin: 20,
    lineHeight: 7,
    get maxWidth() {
      return doc.internal.pageSize.width - (this.margin * 2);
    },
    get maxY() {
      return doc.internal.pageSize.height - this.margin;
    }
  };

  // Content types and formatting
  interface ContentItem {
    text: string;
    fontSize: number;
    isTitle: boolean;
    level: number;
  }

  const formatConfig = {
    title: { fontSize: 20, spacing: 10 },
    content: { fontSize: 12, spacing: 5 },
    getSectionFontSize: (level: number) => Math.max(16 - (level * 2), 12)
  };

  // Collect content
  const contents: ContentItem[] = [
    // Main title
    { text: biography.title, fontSize: formatConfig.title.fontSize, isTitle: true, level: 1 }
  ];

  // Main content
  if (biography.content) {
    contents.push({
      text: formatContent(biography.content),
      fontSize: formatConfig.content.fontSize,
      isTitle: false,
      level: 1
    });
  }

  // Collect sections recursively
  const collectSection = (section: Section, level: number) => {
    contents.push({
      text: section.title,
      fontSize: formatConfig.getSectionFontSize(level),
      isTitle: true,
      level
    });

    if (section.content) {
      contents.push({
        text: formatContent(section.content),
        fontSize: formatConfig.content.fontSize,
        isTitle: false,
        level
      });
    }

    Object.values(section.subsections).forEach(subsection => {
      collectSection(subsection, level + 1);
    });
  };

  Object.values(biography.subsections).forEach(section => {
    collectSection(section, 2);
  });

  // Render content
  const renderContent = () => {
    let y = config.margin;

    contents.forEach((item) => {
      doc.setFontSize(item.fontSize);
      doc.setFont('times', item.isTitle ? 'bold' : 'normal');

      const lines = doc.splitTextToSize(item.text, config.maxWidth);
      const spacing = item.isTitle ? 
        formatConfig.title.spacing : 
        formatConfig.content.spacing;

      lines.forEach((line: string, index: number) => {
        if (y > config.maxY) {
          doc.addPage();
          y = config.margin;
        }

        doc.text(line, config.margin, y);
        y += config.lineHeight;

        if (index === lines.length - 1) {
          y += spacing;
        }
      });
    });
  };

  // Generate and save PDF
  renderContent();
  const filename = `${biography.title.toLowerCase().replace(/\s+/g, '_')}.pdf`;
  doc.save(filename);
};

export const exportToMarkdown = (biography: Biography) => {
  let content = `# ${biography.title}\n\n`;
  
  if (biography.content) {
    content += `${formatContent(biography.content)}\n\n`;
  }

  Object.values(biography.subsections).forEach(section => {
    content += formatSectionForMarkdownExport(section, 2);
  });

  // Create and download the file
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${biography.title.toLowerCase().replace(/\s+/g, '-')}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}; 