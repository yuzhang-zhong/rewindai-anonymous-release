import React, { useState, useEffect } from 'react';
import { Input, Button, Space, Popconfirm, Badge, message } from 'antd';
import { PlusOutlined, DeleteOutlined, EditOutlined, CheckOutlined, CommentOutlined } from '@ant-design/icons';
import { Section, BiographyEdit } from '../../../types/biography';
import { AddSectionModal } from '../modals/AddSectionModal';
import { CommentPopup } from '../comments/CommentPopup';
import { CommentsDrawer } from '../comments/CommentsDrawer';
import { formatContent } from '../../../utils/biographyUtils';

interface EditableSectionProps {
  section: Section & { isNew?: boolean };
  level: number;
  edits: BiographyEdit[];
  onTitleChange: (section: Section, newTitle: string) => void;
  onAddSection: (sectionNumber: string, title: string, sectionPrompt: string) => void;
  onDeleteSection: (section: Section) => void;
  onAddComment: (
    section: Section,
    selectedText: string,
    comment: string
  ) => void;
  onContentChange: (section: Section, newContent: string) => void;
}

export const EditableSection: React.FC<EditableSectionProps> = ({
  section,
  level,
  edits,
  onTitleChange,
  onAddSection,
  onDeleteSection,
  onAddComment,
  onContentChange,
}) => {
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [isContentEditing, setIsContentEditing] = useState(false);
  const [titleValue, setTitleValue] = useState(section.title);
  const [contentValue, setContentValue] = useState(section.content);
  const [originalTitle, setOriginalTitle] = useState(section.title);
  const [originalContent, setOriginalContent] = useState(section.content);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [isCommentsDrawerOpen, setIsCommentsDrawerOpen] = useState(false);

  useEffect(() => {
    setTitleValue(section.title);
    setContentValue(section.content);
    setOriginalTitle(section.title);
    setOriginalContent(section.content);
  }, [section.title, section.content]);

  const handleTitleEditClick = () => {
    setIsTitleEditing(true);
    setOriginalTitle(section.title);
  };

  const handleTitleConfirmClick = () => {
    setIsTitleEditing(false);
    if (titleValue !== originalTitle) {
      onTitleChange(section, titleValue);
    }
  };

  const handleContentEditClick = () => {
    setIsContentEditing(true);
    setOriginalContent(section.content);
    message.info('Please keep the [MEM_...] references in the content - they are used for linking but won\'t be displayed', 3);
  };

  const handleContentConfirmClick = () => {
    setIsContentEditing(false);
    if (contentValue !== originalContent) {
      onContentChange(section, contentValue);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitleValue(e.target.value);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContentValue(e.target.value);
  };

  // Extract section number from title (e.g., "1.2 Education" -> "1.2")
  const sectionNumber = section.title.split(' ')[0];
  const showAddButton = level <= 3;  // Only show add button for headings levels

  const handleTextSelection = () => {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) return;

    const range = selection.getRangeAt(0);
    let content = range.commonAncestorContainer;
    
    // If the selection is a text node, get its parent element
    if (content.nodeType === Node.TEXT_NODE) {
      content = content.parentElement!;
    }

    // Check if the selection is within our content div by walking up the tree
    let currentElement = content as HTMLElement;
    while (currentElement && !currentElement.classList.contains('section-content')) {
      currentElement = currentElement.parentElement as HTMLElement;
    }
    
    // If we found the section-content div, process the selection
    if (currentElement) {
      const text = selection.toString().trim();
      if (text) {
        setSelectedText(text);
        setIsCommentModalOpen(true);
      }
    }
  };

  const handleCommentSubmit = (comment: string) => {
    onAddComment(
      section,
      selectedText,
      comment
    );
  };

  // Get comments for this section
  const sectionComments = edits.filter(
    edit => edit.type === 'COMMENT' && edit.sectionId === section.id
  );

  return (
    <>
      <div className={`biography-edit-section ${section.isNew ? 'is-new' : ''}`}>
        <div className="flex items-center gap-2 mb-2">
          <Input
            value={titleValue}
            onChange={handleInputChange}
            disabled={!isTitleEditing}
            className={`
              biography-edit-heading font-bold
              ${!isTitleEditing ? 
                'bg-transparent border-transparent' : ''}
            `}
          />
          <Space>
            <Button
              icon={isTitleEditing ? <CheckOutlined /> : <EditOutlined />}
              onClick={isTitleEditing ? handleTitleConfirmClick : handleTitleEditClick}
              size="small"
              type={isTitleEditing ? "primary" : "default"}
            />
            {showAddButton && (
              <Button
                icon={<PlusOutlined />}
                onClick={() => setIsAddModalOpen(true)}
                size="small"
                disabled={section.isNew}
              />
            )}
            <Popconfirm
              title="Are you sure you want to delete this section?"
              onConfirm={() => onDeleteSection(section)}
              okText="Yes"
              cancelText="No"
            >
              <Button
                icon={<DeleteOutlined />}
                danger
                size="small"
              />
            </Popconfirm>
          </Space>
        </div>
        {section.content && (
          <div className="flex items-start gap-2">
            <Space direction="vertical" size="small" className="flex-shrink-0">
              <Badge count={sectionComments.length} showZero={false}>
                <Button
                  icon={<CommentOutlined />}
                  size="small"
                  onClick={() => setIsCommentsDrawerOpen(true)}
                  title="View comments"
                  disabled={section.isNew}
                />
              </Badge>
              <Button
                icon={isContentEditing ? <CheckOutlined /> : <EditOutlined />}
                onClick={isContentEditing ? 
                  handleContentConfirmClick : handleContentEditClick}
                size="small"
                type={isContentEditing ? "primary" : "default"}
                title={isContentEditing ? "Save content" : "Edit content"}
              />
            </Space>
            {isContentEditing ? (
              <Input.TextArea
                value={contentValue}
                onChange={handleContentChange}
                className="biography-edit-textarea flex-1 mb-4 p-3"
                autoSize={{ minRows: 3 }}
              />
            ) : (
              <div 
                className="biography-edit-content flex-1 mb-4 p-3 section-content"
                onMouseUp={section.isNew ? undefined : handleTextSelection}
              >
                <p className="whitespace-pre-line">
                  {formatContent(section.content)}
                </p>
              </div>
            )}
          </div>
        )}
        {Object.values(section.subsections).map((subsection) => (
          <EditableSection
            key={subsection.id}
            section={subsection}
            level={level + 1}
            edits={edits}
            onTitleChange={onTitleChange}
            onAddSection={onAddSection}
            onDeleteSection={onDeleteSection}
            onAddComment={onAddComment}
            onContentChange={onContentChange}
          />
        ))}
      </div>

      {showAddButton && (
        <AddSectionModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onAdd={onAddSection}
          parentSectionNumber={sectionNumber}
        />
      )}

      <CommentPopup
        isOpen={isCommentModalOpen}
        onClose={() => setIsCommentModalOpen(false)}
        onSubmit={handleCommentSubmit}
        selectedText={selectedText}
      />

      <CommentsDrawer
        isOpen={isCommentsDrawerOpen}
        onClose={() => setIsCommentsDrawerOpen(false)}
        comments={sectionComments}
        sectionTitle={section.title}
      />
    </>
  );
}; 
