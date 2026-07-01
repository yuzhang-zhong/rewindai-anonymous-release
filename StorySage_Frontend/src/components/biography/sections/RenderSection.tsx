import React from 'react';
import { Typography } from 'antd';
import { Section } from '../../../types/biography';
import { formatContent } from '../../../utils/biographyUtils';

const { Title, Paragraph } = Typography;

interface RenderSectionProps {
  section: Section;
  level: number;
}

export const RenderSection: React.FC<RenderSectionProps> = ({ section, level }) => {
  const titleLevel = Math.min(Math.max(level, 1), 5) as 1 | 2 | 3 | 4 | 5;
  
  return (
    <div className={`biography-section biography-section-level-${titleLevel}`}>
      <Title level={titleLevel} className="biography-section-title">
        {section.title}
      </Title>
      {section.content && (
        <Paragraph className="biography-section-content whitespace-pre-line">
          {formatContent(section.content)}
        </Paragraph>
      )}
      {Object.values(section.subsections).map((subsection) => (
        <RenderSection
          key={subsection.id}
          section={subsection}
          level={level + 1}
        />
      ))}
    </div>
  );
}; 
