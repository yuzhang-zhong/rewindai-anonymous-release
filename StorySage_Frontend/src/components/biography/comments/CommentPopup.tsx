import React from 'react';
import { Modal, Form, Input, Button } from 'antd';

interface CommentPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (comment: string) => void;
  selectedText: string;
}

export const CommentPopup: React.FC<CommentPopupProps> = ({
  isOpen,
  onClose,
  onSubmit,
  selectedText,
}) => {
  const [form] = Form.useForm();

  const handleSubmit = () => {
    form.validateFields().then(values => {
      onSubmit(values.comment);
      form.resetFields();
      onClose();
    });
  };

  return (
    <Modal
      title="Add Comment"
      open={isOpen}
      onCancel={onClose}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Cancel
        </Button>,
        <Button key="submit" type="primary" onClick={handleSubmit}>
          Add Comment
        </Button>,
      ]}
    >
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded">
        <p className="text-gray-600 dark:text-gray-300">{selectedText}</p>
      </div>
      <Form form={form} layout="vertical">
        <Form.Item
          name="comment"
          label="Your Comment"
          rules={[{ required: true, message: 'Please enter your comment' }]}
        >
          <Input.TextArea rows={4} placeholder="Enter your comment here" />
        </Form.Item>
      </Form>
    </Modal>
  );
}; 