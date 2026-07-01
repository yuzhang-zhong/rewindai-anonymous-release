import React, { useState, useEffect } from 'react';
import { Typography, Spin, Button, message, Space, Tooltip, Empty, Modal } from 'antd';
import { EditOutlined, FileMarkdownOutlined, FilePdfOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { Biography, Section, BiographyEdit } from '../../types/biography';
import { RenderSection } from './sections/RenderSection';
import { EditableSection } from './sections/EditableSection';
import { apiClient } from '../../utils/api';
import { EditableBiographyTitle } from './sections/EditableBiographyTitle';
import { exportToPDF, exportToMarkdown } from '../../utils/exportUtils';
import { addOrUpdateEdit, sortSectionsByNumber, findParentSection, isValidPathFormat, findSectionAndParent } from '../../utils/biographyUtils';
import { useAuthStore } from '../../stores/authStore';
import { useNavigate } from 'react-router-dom';
import {
  AppLanguage,
  getStoredLanguage,
  languageChangeEvent,
} from '../../utils/language';
import {
  buildFallbackBiographyFromMessages,
  loadCachedBiographySnapshot,
  loadCachedChatMessages,
  saveCachedBiographySnapshot,
} from '../../utils/localEvidence';

const { Title, Paragraph } = Typography;

type RewriteMode = 'shorter' | 'longer' | 'more_specific';

type RewritePreview = {
  preview_id: string;
  mode: RewriteMode;
  biography: Biography;
  change_summary: string;
};

const normalizeBiography = (data: Partial<Biography>): Biography => ({
  id: data.id || 'biography-root',
  title: data.title || 'My Story',
  content: data.content || '',
  created_at: data.created_at || new Date().toISOString(),
  last_edit: data.last_edit || new Date().toISOString(),
  subsections: data.subsections || {},
});

const countSections = (sections: Record<string, Section>): number => (
  Object.values(sections).reduce(
    (count, section) => count + 1 + countSections(section.subsections),
    0
  )
);

const biographyCopy: Record<AppLanguage, {
  loading: string;
  loadError: string;
  emptyKicker: string;
  emptyTitle: string;
  emptyDescription: string;
  continueInterview: string;
  toolbarTitle: string;
  editingSubtitle: string;
  readingSubtitle: string;
  save: string;
  cancel: string;
  exportPdf: string;
  exportMarkdown: string;
  edit: string;
  shorter: string;
  longer: string;
  moreSpecific: string;
  rewritePreviewTitle: string;
  rewritePreviewSummary: string;
  applyRewrite: string;
  rewriteGenerating: string;
  rewriteApplied: string;
  rewriteFailed: string;
  pdfExported: string;
  pdfFailed: string;
  markdownExported: string;
  markdownFailed: string;
  duplicateSections: (numbers: string) => string;
  biographyUpdated: string;
  updateFailed: string;
  updateFailedDetail: (detail: string) => string;
  invalidEdit: string;
  invalidSectionFormat: string;
  sectionAdded: string;
  commentAdded: string;
  coverKicker: string;
  liveChip: string;
  coverTitle: string;
  coverDescription: string;
  summaryLabel: string;
  noChapters: string;
  chapterSingular: string;
  chapterPlural: string;
  updated: string;
  editingMode: string;
  readingMode: string;
  privateDraft: string;
  personalArchive: string;
}> = {
  en: {
    loading: 'Preparing your story garden...',
    loadError: 'Failed to load biography',
    emptyKicker: 'Autobiography greenhouse',
    emptyTitle: 'Your story page is waiting for its first seed.',
    emptyDescription: 'Continue the interview and RewindAI will turn the conversation into a calm, editable life-story draft.',
    continueInterview: 'Continue interview',
    toolbarTitle: 'RewindAI Autobiography',
    editingSubtitle: 'Editing your living draft',
    readingSubtitle: 'A calm reading space for your life story',
    save: 'Save',
    cancel: 'Cancel',
    exportPdf: 'Export as PDF',
    exportMarkdown: 'Export as Markdown',
    edit: 'Edit',
    shorter: 'Shorter',
    longer: 'Longer',
    moreSpecific: 'More specific',
    rewritePreviewTitle: 'AI rewrite preview',
    rewritePreviewSummary: 'Review the generated version before applying it to your biography.',
    applyRewrite: 'Apply preview',
    rewriteGenerating: 'Generating rewrite preview...',
    rewriteApplied: 'Rewrite applied',
    rewriteFailed: 'Failed to rewrite biography',
    pdfExported: 'PDF exported successfully',
    pdfFailed: 'Failed to export PDF',
    markdownExported: 'Markdown exported successfully',
    markdownFailed: 'Failed to export Markdown',
    duplicateSections: numbers => `Sections with numbers ${numbers} already exist. Please use different numbers.`,
    biographyUpdated: 'Biography updated successfully',
    updateFailed: 'Failed to update biography',
    updateFailedDetail: detail => `Failed to update biography: ${detail}`,
    invalidEdit: 'Failed to update biography: Invalid edit operation',
    invalidSectionFormat: 'Invalid section format. Please use a number or dot-separated numbers (1 or 1.2) followed by a SPACE and your title',
    sectionAdded: 'Section added successfully!',
    commentAdded: 'Comment added successfully',
    coverKicker: 'Autobiography greenhouse',
    liveChip: 'Private living draft',
    coverTitle: 'Your life story, gathered like a quiet garden.',
    coverDescription: 'Read slowly, refine gently, and let RewindAI preserve the moments that reveal how you decide, care, remember, and change.',
    summaryLabel: 'Biography summary',
    noChapters: 'No chapters',
    chapterSingular: 'chapter',
    chapterPlural: 'chapters',
    updated: 'Updated',
    editingMode: 'Editing mode',
    readingMode: 'Reading mode',
    privateDraft: 'Private draft',
    personalArchive: 'Personal archive',
  },
  zh: {
    loading: '正在准备你的故事花园...',
    loadError: '加载自传失败',
    emptyKicker: '自传温室',
    emptyTitle: '你的故事页面正在等待第一颗种子。',
    emptyDescription: '继续访谈后，RewindAI 会把对话整理成一份安静、可编辑的人生故事草稿。',
    continueInterview: '继续访谈',
    toolbarTitle: 'RewindAI 自传',
    editingSubtitle: '正在编辑你的动态草稿',
    readingSubtitle: '一个安静阅读人生故事的空间',
    save: '保存',
    cancel: '取消',
    exportPdf: '导出 PDF',
    exportMarkdown: '导出 Markdown',
    edit: '编辑',
    shorter: '变短',
    longer: '变长',
    moreSpecific: '更具体',
    rewritePreviewTitle: 'AI 改写预览',
    rewritePreviewSummary: '请先检查生成版本，确认后才会覆盖当前自传。',
    applyRewrite: '应用预览',
    rewriteGenerating: '正在生成改写预览...',
    rewriteApplied: '改写已应用',
    rewriteFailed: '改写自传失败',
    pdfExported: 'PDF 已成功导出',
    pdfFailed: 'PDF 导出失败',
    markdownExported: 'Markdown 已成功导出',
    markdownFailed: 'Markdown 导出失败',
    duplicateSections: numbers => `编号 ${numbers} 的章节已存在，请使用不同编号。`,
    biographyUpdated: '自传已更新',
    updateFailed: '更新自传失败',
    updateFailedDetail: detail => `更新自传失败：${detail}`,
    invalidEdit: '更新自传失败：编辑操作无效',
    invalidSectionFormat: '章节格式无效。请使用数字或点分数字编号（如 1 或 1.2），后接一个空格和标题。',
    sectionAdded: '章节已添加！',
    commentAdded: '评论已添加',
    coverKicker: '自传温室',
    liveChip: '私密动态草稿',
    coverTitle: '你的人生故事，像一座安静花园般被收集。',
    coverDescription: '慢慢阅读，轻轻修订，让 RewindAI 保存那些展现你如何决定、关心、记忆和改变的时刻。',
    summaryLabel: '自传摘要',
    noChapters: '暂无章节',
    chapterSingular: '个章节',
    chapterPlural: '个章节',
    updated: '更新于',
    editingMode: '编辑模式',
    readingMode: '阅读模式',
    privateDraft: '私密草稿',
    personalArchive: '个人档案',
  },
};

const BiographyPage: React.FC = () => {
  const isBaselineUser = useAuthStore(state => state.isBaselineUser);
  const navigate = useNavigate();
  const [language, setLanguage] = useState<AppLanguage>(() => getStoredLanguage());
  const copy = biographyCopy[language];
  const userId = useAuthStore(state => state.userId);
  const [biography, setBiography] = useState<Biography | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editedBiography, setEditedBiography] = useState<Biography | null>(null);
  const [edits, setEdits] = useState<BiographyEdit[]>([]);
  const [saving, setSaving] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState<RewriteMode | null>(null);
  const [rewriteApplying, setRewriteApplying] = useState(false);
  const [rewritePreview, setRewritePreview] = useState<RewritePreview | null>(null);

  useEffect(() => {
    const handleLanguageChange = (event: Event) => {
      setLanguage((event as CustomEvent<AppLanguage>).detail || getStoredLanguage());
    };
    const handleStorage = () => setLanguage(getStoredLanguage());

    window.addEventListener(languageChangeEvent, handleLanguageChange);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(languageChangeEvent, handleLanguageChange);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    const fetchBiography = async () => {
      try {
        setLoading(true);
        const data = await apiClient('BIOGRAPHY_LATEST', {
          method: 'GET',
        });
        const normalized = normalizeBiography(data);
        setBiography(normalized);
        if (userId) {
          saveCachedBiographySnapshot(userId, normalized);
        }
      } catch (error) {
        if (error instanceof Error && 'status' in error && error.status === 404) {
          const localBiography = userId
            ? loadCachedBiographySnapshot(userId)
              || buildFallbackBiographyFromMessages(userId, loadCachedChatMessages(userId))
            : null;
          setBiography(localBiography);
          if (userId && localBiography) {
            saveCachedBiographySnapshot(userId, localBiography);
          }
        } else {
          setError(error instanceof Error ? error.message : copy.loadError);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchBiography();
  }, [copy.loadError, userId]);

  const handleExportPDF = () => {
    if (!biography) return;
    try {
      exportToPDF(biography);
      message.success(copy.pdfExported);
    } catch (error) {
      console.error('Error generating PDF:', error);
      message.error(copy.pdfFailed);
    }
  };

  const handleExportMarkdown = () => {
    if (!biography) return;
    try {
      exportToMarkdown(biography);
      message.success(copy.markdownExported);
    } catch (error) {
      console.error('Error generating Markdown:', error);
      message.error(copy.markdownFailed);
    }
  };

  const handleEdit = () => {
    setEditMode(true);
    setEditedBiography(JSON.parse(JSON.stringify(biography))); // Deep clone
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      // Validate new sections
      const addEdits = edits.filter(edit => edit.type === 'ADD');
      if (addEdits.length > 0 && biography) {
        // Helper function to collect all section titles
        const collectSectionTitles = (sections: Record<string, Section>): string[] => {
          return Object.values(sections).reduce((titles: string[], section) => {
            // Get section number and text separately
            const [sectionNumber] = section.title.split(' ');
            titles.push(sectionNumber);
            
            // Recursively collect subsection titles
            return [...titles, ...collectSectionTitles(section.subsections)];
          }, []);
        };

        // Get all existing section numbers from the original biography
        const existingSectionNumbers = collectSectionTitles(biography.subsections);

        // Check for duplicates
        const duplicates = addEdits.filter(edit => {
          const [newSectionNumber] = edit.title.split(' ');
          return existingSectionNumbers.includes(newSectionNumber);
        });

        if (duplicates.length > 0) {
          const duplicateNumbers = duplicates.map(d => d.title.split(' ')[0]).join(', ');
          message.error(copy.duplicateSections(duplicateNumbers));
          return;
        }
      }

      // Send edits to backend
      const updatedBiography = await apiClient('BIOGRAPHY_EDIT', {
        method: 'POST',
        body: JSON.stringify(edits)
      });

      // Update local state with the response from server
      const normalized = normalizeBiography(updatedBiography);
      setBiography(normalized);
      if (userId) {
        saveCachedBiographySnapshot(userId, normalized);
      }
      setEditMode(false);
      setEdits([]);
      message.success(copy.biographyUpdated);
    } catch (error) {
      console.error('Error updating biography:', error);
      
      // Show more specific error messages based on the response
      if (error instanceof Error) {
        if ('status' in error && error.status === 400) {
          // Try to parse the error detail from the response
          try {
            const detail = JSON.parse(error.message).detail;
            message.error(copy.updateFailedDetail(detail));
            return;
          } catch {
            // If can't parse detail, fall back to generic message
            message.error(copy.invalidEdit);
            return;
          }
        }
      }
      
      // Generic error message as fallback
      message.error(copy.updateFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditMode(false);
    setEditedBiography(null);
    setEdits([]);
  };

  const handleRewritePreview = async (mode: RewriteMode) => {
    if (!biography || rewriteLoading) return;
    try {
      setRewriteLoading(mode);
      message.loading({ content: copy.rewriteGenerating, key: 'biography-rewrite' });
      const response = await apiClient('BIOGRAPHY_REWRITE', {
        method: 'POST',
        timeoutMs: 60000,
        body: JSON.stringify({ mode, scope: 'full' }),
      });
      const normalized = normalizeBiography(response.biography);
      setRewritePreview({
        preview_id: response.preview_id,
        mode,
        biography: normalized,
        change_summary: response.change_summary || '',
      });
      message.destroy('biography-rewrite');
    } catch (error) {
      message.destroy('biography-rewrite');
      message.error(error instanceof Error ? error.message : copy.rewriteFailed);
    } finally {
      setRewriteLoading(null);
    }
  };

  const handleApplyRewritePreview = async () => {
    if (!rewritePreview) return;
    try {
      setRewriteApplying(true);
      const response = await apiClient('BIOGRAPHY_REWRITE_APPLY', {
        method: 'POST',
        timeoutMs: 30000,
        body: JSON.stringify({ preview_id: rewritePreview.preview_id }),
      });
      const normalized = normalizeBiography(response);
      setBiography(normalized);
      if (userId) {
        saveCachedBiographySnapshot(userId, normalized);
      }
      setRewritePreview(null);
      message.success(copy.rewriteApplied);
    } catch (error) {
      message.error(error instanceof Error ? error.message : copy.rewriteFailed);
    } finally {
      setRewriteApplying(false);
    }
  };

  const handleBiographyTitleChange = (
    sectionId: string, 
    oldTitle: string, 
    newTitle: string
  ) => {
    if (!editedBiography) return;
    
    setEditedBiography({
      ...editedBiography,
      title: newTitle
    });

    setEdits(prev => addOrUpdateEdit(prev, {
      type: 'RENAME',
      sectionId,
      title: oldTitle,
      data: { newTitle },
      timestamp: Date.now()
    }));
  };

  const handleSectionTitleChange = (section: Section, newTitle: string) => {
    if (!editedBiography) return;
    
    // Validate the new section number format
    const newSectionNumber = newTitle.split(' ')[0];
    if (!isValidPathFormat(newSectionNumber)) {
      message.error(copy.invalidSectionFormat);
      return;
    }

    // Find the section and its parent
    const result = findSectionAndParent(editedBiography.subsections, section.id);
    if (!result) {
      return;
    }

    // Update the key in parent's sections
    const { parent } = result;
    const updatedParent = { ...parent };
    delete updatedParent[section.title]; 
    updatedParent[newTitle] = {
      ...section,
      title: newTitle
    };

    // Sort the parent's sections
    const sortedParent = sortSectionsByNumber(updatedParent);
    const updateParentSections = (sections: Record<string, Section>): 
    Record<string, Section> => {
      const newSections = { ...sections };
      
      for (const [key, section] of Object.entries(sections)) {
        if (section.subsections === parent) {
          // Found the parent, update its subsections
          newSections[key] = {
            ...section,
            subsections: sortedParent
          };
          return newSections;
        }
        
        // Recursively update subsections
        newSections[key] = {
          ...section,
          subsections: updateParentSections(section.subsections)
        };
      }
      
      return newSections;
    };

    // If it's a top-level section, update directly
    if (parent === editedBiography.subsections) {
      setEditedBiography({
        ...editedBiography,
        subsections: sortedParent
      });
    } 
    // Otherwise, update the parent's subsections recursively
    else {
      setEditedBiography({
        ...editedBiography,
        subsections: updateParentSections(editedBiography.subsections)
      });
    }

    // Update the edits
    if (section.isNew) {
      // For new sections, update the title in the ADD edit
      setEdits(prev => {
        const newEdits = [...prev];
        const addEditIndex = newEdits.findIndex(
          edit => edit.type === 'ADD' && edit.sectionId === section.id
        );
        
        if (addEditIndex !== -1) {
          const oldPath = newEdits[addEditIndex].data?.newPath || newTitle;
          // Split the path and replace the last segment with new title
          const pathParts = oldPath.split('/');
          pathParts[pathParts.length - 1] = newTitle;
          const newPath = pathParts.join('/');

          newEdits[addEditIndex] = {
            ...newEdits[addEditIndex],
            title: newTitle,
            data: {
              ...newEdits[addEditIndex].data,
              newPath
            }
          };
        }
        return newEdits;
      });
    } else {
      // For existing sections, create a RENAME edit
      setEdits(prev => addOrUpdateEdit(prev, {
        type: 'RENAME',
        sectionId: section.id,
        title: section.title,
        data: { newTitle },
        timestamp: Date.now()
      }));
    }
  };

  const handleAddSection = (
    sectionNumber: string, title: string, sectionPrompt: string
  ) => {
    if (!editedBiography) return;

    const fullTitle = `${sectionNumber} ${title}`;
    const newSection: Section = {
      id: `section-${Date.now()}`,
      title: fullTitle,
      content: sectionPrompt,
      subsections: {},
      created_at: new Date().toISOString(),
      last_edit: new Date().toISOString(),
      isNew: true
    };

    const { parent: parentSection, path: parentPath } = findParentSection(
      editedBiography.subsections, 
      sectionNumber
    );
    const parentTitle = parentSection ? parentSection.title : "";
    
    // Calculate new path
    const newPath = parentPath ? `${parentPath}/${fullTitle}` : fullTitle;

    if (!parentTitle) {
      // Add as top-level section
      setEditedBiography({
        ...editedBiography,
        subsections: sortSectionsByNumber({
          ...editedBiography.subsections,
          [fullTitle]: newSection,
        }),
      });
    } else {
      // Add to parent section
      const updateSubsections = (sections: Record<string, Section>): 
      Record<string, Section> => {
        const newSections = { ...sections };
        
        // Check if current level contains the parent section
        if (parentTitle in newSections) {
          newSections[parentTitle] = {
            ...newSections[parentTitle],
            subsections: sortSectionsByNumber({
              ...newSections[parentTitle].subsections,
              [fullTitle]: newSection,
            }),
          };
          return newSections;
        }

        // If not found, recursively check subsections
        for (const key in newSections) {
          newSections[key] = {
            ...newSections[key],
            subsections: updateSubsections(newSections[key].subsections)
          };
        }
        
        return newSections;
      };

      setEditedBiography({
        ...editedBiography,
        subsections: updateSubsections(editedBiography.subsections),
      });
    }

    setEdits(prev => addOrUpdateEdit(prev, {
      type: 'ADD',
      sectionId: newSection.id,
      title: fullTitle,
      data: { 
        sectionPrompt,
        newPath
      },
      timestamp: Date.now()
    }));

    message.success(copy.sectionAdded);
  };

  const handleDeleteSection = (section: Section) => {
    if (!editedBiography) return;

    const deleteSection = (sections: Record<string, Section>, targetId: string): 
    Record<string, Section> => {
      const newSections = { ...sections };
      
      for (const [key, section] of Object.entries(newSections)) {
        if (section.id === targetId) {
          delete newSections[key];
          return newSections;
        }
        
        section.subsections = deleteSection(section.subsections, targetId);
      }
      
      return newSections;
    };

    const updatedSubsections = deleteSection(editedBiography.subsections, section.id);

    setEditedBiography({
      ...editedBiography,
      subsections: updatedSubsections
    });

    if (section.isNew) {
      // For new sections, remove the ADD edit
      setEdits(prev => prev.filter(edit => 
        !(edit.type === 'ADD' && edit.sectionId === section.id)
      ));
    } else {
      // For existing sections, create a DELETE edit
      setEdits(prev => addOrUpdateEdit(prev, {
        type: 'DELETE',
        sectionId: section.id,
        title: section.title,
        timestamp: Date.now()
      }));
    }
  };

  const handleAddComment = (
    section: Section,
    selectedText: string,
    comment: string
  ) => {
    setEdits(prev => addOrUpdateEdit(prev, {
      type: 'COMMENT',
      sectionId: section.id,
      title: section.title,
      data: {
        comment: {
          text: selectedText,
          comment
        }
      },
      timestamp: Date.now()
    }));

    message.success(copy.commentAdded);
  };

  const handleContentChange = (section: Section, newContent: string) => {
    if (!editedBiography) return;

    const updateSectionContent = (sections: Record<string, Section>, id: string): 
    Record<string, Section> => {
      const newSections = { ...sections };
      
      for (const key in newSections) {
        if (newSections[key].id === id) {
          newSections[key] = {
            ...newSections[key],
            content: newContent
          };
          return newSections;
        }
        newSections[key] = {
          ...newSections[key],
          subsections: updateSectionContent(newSections[key].subsections, id)
        };
      }
      
      return newSections;
    };

    setEditedBiography({
      ...editedBiography,
      subsections: updateSectionContent(editedBiography.subsections, section.id)
    });

    if (section.isNew) {
      // For new sections, update the sectionPrompt in the ADD edit
      setEdits(prev => {
        const newEdits = [...prev];
        const addEditIndex = newEdits.findIndex(
          edit => edit.type === 'ADD' && edit.sectionId === section.id
        );
        
        if (addEditIndex !== -1) {
          newEdits[addEditIndex] = {
            ...newEdits[addEditIndex],
            data: {
              ...newEdits[addEditIndex].data,
              sectionPrompt: newContent
            }
          };
        }
        return newEdits;
      });
    } else {
      // For existing sections, create a CONTENT_CHANGE edit
      setEdits(prev => addOrUpdateEdit(prev, {
        type: 'CONTENT_CHANGE',
        sectionId: section.id,
        title: section.title,
        data: { newContent },
        timestamp: Date.now()
      }));
    }
  };

  if (loading) {
    return (
      <div className="biography-page flex items-center justify-center">
        <div className="biography-status-card">
          <Spin size="large" />
          <span>{copy.loading}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="biography-page flex items-center justify-center">
        <div className="biography-status-card biography-status-error">
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!biography) {
    return (
      <div className="biography-page h-full overflow-auto">
        <div className="biography-orb biography-orb-a" />
        <div className="biography-orb biography-orb-b" />
        <div className="biography-orb biography-orb-c" />
        <div className="biography-leaf-grid" />
        <div className="biography-background-grove" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="biography-shell mx-auto flex min-h-full max-w-5xl items-center px-4 py-10 sm:px-6">
          <div className="biography-empty-card">
            <div className="biography-empty-bloom" aria-hidden="true" />
            <span className="storysage-kicker">{copy.emptyKicker}</span>
            <h2>{copy.emptyTitle}</h2>
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={
                <span className="biography-muted">
                  {copy.emptyDescription}
                </span>
              }
            />
            <Button
              type="primary"
              className="storysage-auth-primary mt-5"
              onClick={() => navigate('/user_chat')}
            >
              {copy.continueInterview}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const sectionCount = countSections(biography.subsections);
  const lastEditedDate = new Date(biography.last_edit).toLocaleDateString(
    language === 'zh' ? 'zh-CN' : undefined,
    { month: 'short', day: 'numeric', year: 'numeric' }
  );

  return (
    <div className="biography-page h-full overflow-auto">
      <div className="biography-orb biography-orb-a" />
      <div className="biography-orb biography-orb-b" />
      <div className="biography-orb biography-orb-c" />
      <div className="biography-leaf-grid" />
      <div className="biography-background-grove" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {/* Toolbar */}
      <div className="biography-toolbar sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="biography-toolbar-copy">
            <span>{copy.toolbarTitle}</span>
            <small>{editMode ? copy.editingSubtitle : copy.readingSubtitle}</small>
          </div>
          <Space>
            {editMode ? (
              <>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  onClick={handleSave}
                  loading={saving}
                  className="biography-action-primary flex items-center justify-center"
                >
                  {copy.save}
                </Button>
                <Button
                  icon={<CloseOutlined />}
                  onClick={handleCancel}
                  className="biography-action-secondary flex items-center justify-center"
                >
                  {copy.cancel}
                </Button>
              </>
            ) : (
              <>
                <Tooltip title={copy.shorter}>
                  <Button
                    size="small"
                    loading={rewriteLoading === 'shorter'}
                    onClick={() => handleRewritePreview('shorter')}
                    className="biography-action-secondary"
                  >
                    {copy.shorter}
                  </Button>
                </Tooltip>
                <Tooltip title={copy.longer}>
                  <Button
                    size="small"
                    loading={rewriteLoading === 'longer'}
                    onClick={() => handleRewritePreview('longer')}
                    className="biography-action-secondary"
                  >
                    {copy.longer}
                  </Button>
                </Tooltip>
                <Tooltip title={copy.moreSpecific}>
                  <Button
                    size="small"
                    loading={rewriteLoading === 'more_specific'}
                    onClick={() => handleRewritePreview('more_specific')}
                    className="biography-action-secondary"
                  >
                    {copy.moreSpecific}
                  </Button>
                </Tooltip>
                <Tooltip title={copy.exportPdf}>
                  <Button
                    shape="circle"
                    variant="dashed"
                    icon={<FilePdfOutlined />}
                    onClick={handleExportPDF}
                    className="biography-icon-button flex items-center justify-center"
                  />
                </Tooltip>
                <Tooltip title={copy.exportMarkdown}>
                  <Button
                    shape="circle"
                    variant="dashed"
                    icon={<FileMarkdownOutlined />}
                    onClick={handleExportMarkdown}
                    className="biography-icon-button flex items-center justify-center"
                  />
                </Tooltip>
                {!isBaselineUser() && (
                  <Tooltip title={copy.edit}>
                    <Button
                      shape="circle"
                      variant="dashed"
                      icon={<EditOutlined />}
                      onClick={handleEdit}
                      className="biography-icon-button flex items-center justify-center"
                    />
                  </Tooltip>
                )}
              </>
            )}
          </Space>
        </div>
      </div>

      {/* Content */}
      <div className="biography-shell max-w-5xl mx-auto py-10 px-4 sm:px-6">
        <div className="biography-cover-note">
          <div className="biography-cover-row">
            <span className="storysage-kicker">{copy.coverKicker}</span>
            <span className="biography-live-chip">{copy.liveChip}</span>
          </div>
          <h2>{copy.coverTitle}</h2>
          <p>{copy.coverDescription}</p>
          <div className="biography-cover-stats" aria-label={copy.summaryLabel}>
            <span>
              {sectionCount
                ? `${sectionCount} ${sectionCount === 1 ? copy.chapterSingular : copy.chapterPlural}`
                : copy.noChapters}
            </span>
            <span>{copy.updated} {lastEditedDate}</span>
            <span>{editMode ? copy.editingMode : copy.readingMode}</span>
          </div>
        </div>
        <div className="biography-paper">
        <div className="biography-paper-leaf" aria-hidden="true" />
        <div className="biography-paper-tab">{copy.privateDraft}</div>
        {editMode ? (
          <>
            <EditableBiographyTitle
              id={editedBiography!.id}
              title={editedBiography!.title}
              onTitleChange={handleBiographyTitleChange}
              onAddSection={handleAddSection}
            />
            {Object.values(editedBiography!.subsections).map((section) => (
              <EditableSection
                key={section.id}
                section={section}
                level={2}
                edits={edits}
                onTitleChange={handleSectionTitleChange}
                onAddSection={handleAddSection}
                onDeleteSection={handleDeleteSection}
                onAddComment={handleAddComment}
                onContentChange={handleContentChange}
              />
            ))}
          </>
        ) : (
          <>
            <div className="biography-kicker">{copy.personalArchive}</div>
            <Title className="biography-main-title text-center mb-8">
              {biography!.title}
            </Title>
            {biography!.content && (
              <Paragraph className="biography-prologue whitespace-pre-line mb-8">
                {biography!.content}
              </Paragraph>
            )}
            {Object.values(biography!.subsections).map((section) => (
              <RenderSection key={section.id} section={section} level={2} />
            ))}
          </>
        )}
        </div>
      </div>
      <Modal
        title={copy.rewritePreviewTitle}
        open={Boolean(rewritePreview)}
        onCancel={() => setRewritePreview(null)}
        onOk={handleApplyRewritePreview}
        okText={copy.applyRewrite}
        cancelText={copy.cancel}
        confirmLoading={rewriteApplying}
        width={860}
      >
        {rewritePreview && (
          <div className="biography-rewrite-preview">
            <Paragraph className="text-[#5f7167]">
              {copy.rewritePreviewSummary}
            </Paragraph>
            {rewritePreview.change_summary && (
              <Paragraph strong>
                {rewritePreview.change_summary}
              </Paragraph>
            )}
            <Title level={3}>{rewritePreview.biography.title}</Title>
            {rewritePreview.biography.content && (
              <Paragraph className="whitespace-pre-line">
                {rewritePreview.biography.content}
              </Paragraph>
            )}
            {Object.values(rewritePreview.biography.subsections).map(section => (
              <div key={section.id} className="biography-rewrite-section">
                <Title level={4}>{section.title}</Title>
                <Paragraph className="whitespace-pre-line">{section.content}</Paragraph>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BiographyPage;
