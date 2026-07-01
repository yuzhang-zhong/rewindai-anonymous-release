import React from 'react';
import { Drawer, Timeline, Typography } from 'antd';
import { BiographyEdit } from '../../../types/biography';
import { CommentOutlined } from '@ant-design/icons';

const { Text, Paragraph } = Typography;

interface CommentsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  comments: BiographyEdit[];
  sectionTitle: string;
}

export const CommentsDrawer: React.FC<CommentsDrawerProps> = ({
  isOpen,
  onClose,
  comments,
  sectionTitle,
}) => {
  return (
    <Drawer
      title={
        <div className="flex items-center gap-2">
          <CommentOutlined />
          <span>Comments for section: {sectionTitle}</span>
        </div>
      }
      placement="right"
      onClose={onClose}
      open={isOpen}
      width={400}
    >
      {comments.length === 0 ? (
        <Text type="secondary">
          😮 No comments yet. 
          <br />
          📝 To add a comment, select any text in the biography and make a comment.
        </Text>
      ) : (
        <Timeline
          items={comments.map(edit => ({
            children: (
              <div key={edit.timestamp} className="space-y-2">
                <div className="text-gray-400 text-sm">
                  {new Date(edit.timestamp).toLocaleString()}
                </div>
                <div className="bg-gray-50 dark:bg-gray-800 p-2 rounded">
                  <Text type="secondary">Selected text:</Text>
                  <Paragraph className="text-sm mt-1">
                    "{edit.data?.comment?.text}"
                  </Paragraph>
                </div>
                <div className="bg-blue-50 dark:bg-blue-900/20 p-2 rounded">
                  <Text type="secondary">Comment:</Text>
                  <Paragraph className="text-sm mt-1">
                    {edit.data?.comment?.comment}
                  </Paragraph>
                </div>
              </div>
            ),
          }))}
        />
      )}
    </Drawer>
  );
}; 