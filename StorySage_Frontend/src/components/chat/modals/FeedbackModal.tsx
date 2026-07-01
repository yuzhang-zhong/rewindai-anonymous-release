import React from 'react';
import { Modal, Rate, Input, Form } from 'antd';
import { FrownOutlined, MehOutlined, SmileOutlined } from '@ant-design/icons';
import { chatCopy } from '../../../constants/chatCopy';
import type { AppLanguage } from '../../../utils/language';

const { TextArea } = Input;

interface FeedbackModalProps {
  isVisible: boolean;
  onOk: (rating: number, feedback: string) => void;
  loading?: boolean;
  language: AppLanguage;
}

const customIcons: { [key: number]: React.ReactNode } = {
  1: <FrownOutlined />,
  2: <FrownOutlined />,
  3: <MehOutlined />,
  4: <SmileOutlined />,
  5: <SmileOutlined />,
};

const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isVisible,
  onOk,
  loading,
  language
}) => {
  const [form] = Form.useForm();
  const copy = chatCopy[language].feedback;

  const handleOk = async () => {
    const values = await form.validateFields();
    onOk(values.rating, values.feedback);
    form.resetFields();
  };

  return (
    <Modal
      title={copy.title}
      open={isVisible}
      onOk={handleOk}
      okText={copy.continue}
      cancelButtonProps={{ style: { display: 'none' } }}
      closable={false}
      maskClosable={false}
      confirmLoading={loading}
    >
      <div className="flex flex-col items-center mb-6">
        <img 
          src="/stickers/thank.png" 
          alt={copy.thankAlt}
          className="w-32 h-32 mb-4"
        />
        <p className="text-gray-600 text-center">
          {copy.description}
        </p>
      </div>

      <Form form={form} layout="vertical">
        <Form.Item
          name="rating"
          label={copy.ratingLabel}
          rules={[{ required: false, message: copy.ratingRequired }]}
        >
          <Rate 
            character={({ index = 0 }) => customIcons[index + 1]}
            className="text-2xl"
          />
        </Form.Item>
        <Form.Item
          name="feedback"
          label={copy.feedbackLabel}
          rules={[{ required: false, message: copy.feedbackRequired }]}
        >
          <TextArea
            rows={4}
            placeholder={copy.placeholder}
            className="mt-2"
          />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default FeedbackModal; 
