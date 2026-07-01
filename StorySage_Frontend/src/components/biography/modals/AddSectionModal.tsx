import React from 'react';
import { Modal, Form, Input, InputNumber, Space, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

interface AddSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (sectionNumber: string, title: string, sectionPrompt: string) => void;
  parentSectionNumber?: string;  // undefined for top-level sections
}

export const AddSectionModal: React.FC<AddSectionModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  parentSectionNumber
}) => {
  const [form] = Form.useForm();

  const handleSubmit = () => {
    form.validateFields().then(values => {
      const { sectionNumber, title, sectionPrompt } = values;
      const fullSectionNumber = parentSectionNumber 
        ? `${parentSectionNumber}.${sectionNumber}`
        : `${sectionNumber}`;
      
      onAdd(fullSectionNumber, title, sectionPrompt);
      form.resetFields();
      onClose();
    });
  };

  return (
    <Modal
      title={`Add New Subsection Under Section ${parentSectionNumber}`}
      open={isOpen}
      onOk={handleSubmit}
      onCancel={onClose}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
      >
        <Form.Item label="Section Number" required>
          <Space>
            {parentSectionNumber && (
              <>
                <Input
                  value={parentSectionNumber}
                  disabled
                  style={{ width: '80px' }}
                />
                <span>.</span>
              </>
            )}
            <Form.Item
              name="sectionNumber"
              noStyle
              rules={[
                { required: true, message: 'Please input section number' },
                { type: 'number', max: 19, message: 'Number should be less than 20' }
              ]}
            >
              <InputNumber
                min={1}
                max={19}
                style={{ width: '60px' }}
              />
            </Form.Item>
            <Tooltip title="Section number should be between 1 and 19">
              <QuestionCircleOutlined />
            </Tooltip>
          </Space>
        </Form.Item>

        <Form.Item
          name="title"
          label="Section Title"
          rules={[{ required: true, message: 'Please input section title' }]}
        >
          <Input placeholder="Enter section title" />
        </Form.Item>

        <Form.Item
          name="sectionPrompt"
          label="Content Suggestions for AI"
          rules={[{ required: true, message: 'Please provide content suggestions' }]}
        >
          <Input.TextArea
            rows={4}
            placeholder="Provide suggestions for the AI to generate content"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}; 