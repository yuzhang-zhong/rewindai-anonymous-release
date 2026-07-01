import React from 'react';
import { Alert, Button, Modal, Space, Typography } from 'antd';
import { apiClient } from '../../utils/api';
import type { AppLanguage } from '../../utils/language';

type ProviderName = 'openai' | 'google' | 'deepseek';

type ModelSettingsModalProps = {
  open: boolean;
  language: AppLanguage;
  status: ModelSettingsStatus;
  onCancel: () => void;
  onConfigured: (status: ModelSettingsStatus) => void;
};

export type ModelSettingsStatus = {
  configured: boolean;
  provider: ProviderName | null;
  model_name: string | null;
};

const copy = {
  en: {
    title: 'System model settings',
    description:
      'RewindAI now uses a system-managed OpenAI model for interviews. You do not need to paste or manage an API key.',
    managed: 'The API key is stored only on the backend runtime and is never shipped to the browser.',
    connected: 'System model connected',
    connectedDescription: 'Interviews will use this backend-managed model.',
    refresh: 'Refresh status',
    close: 'Close',
    unavailable: 'The system model is not configured yet. Please ask the demo host to set the backend key.',
  },
  zh: {
    title: '系统模型设置',
    description:
      'RewindAI 现在使用系统托管的 OpenAI 模型进行访谈。用户不需要输入或管理 API Key。',
    managed: 'API Key 只保存在后端运行环境中，不会打包到浏览器，也不会在界面显示。',
    connected: '系统模型已连接',
    connectedDescription: '访谈会使用这个后端托管模型。',
    refresh: '刷新状态',
    close: '关闭',
    unavailable: '系统模型还没有配置好，请让 demo host 在后端设置 API Key。',
  },
};

const ModelSettingsModal: React.FC<ModelSettingsModalProps> = ({
  open,
  language,
  status,
  onCancel,
  onConfigured,
}) => {
  const t = copy[language];

  const refreshStatus = async () => {
    try {
      const status = await apiClient('MODEL_SETTINGS', {
        method: 'GET',
      });
      onConfigured(status);
    } catch (error) {
      onConfigured({ configured: false, provider: null, model_name: null });
    }
  };

  return (
    <Modal
      open={open}
      title={t.title}
      onCancel={onCancel}
      footer={null}
      destroyOnClose
      className="model-settings-modal"
    >
      <Space direction="vertical" size="middle" className="w-full">
        <Typography.Paragraph className="m-0 text-slate-600">
          {t.description}
        </Typography.Paragraph>
        <Alert type="success" showIcon message={t.managed} />
        {status.configured ? (
          <Alert
            type="success"
            showIcon
            message={t.connected}
            description={`${status.provider || 'openai'} / ${status.model_name || 'gpt-4o'} - ${t.connectedDescription}`}
          />
        ) : (
          <Alert type="info" showIcon message={t.unavailable} />
        )}
        <Space className="w-full" direction="vertical">
          <Button block onClick={refreshStatus}>
            {t.refresh}
          </Button>
          <Button type="primary" block onClick={onCancel} className="model-settings-save">
            {t.close}
          </Button>
        </Space>
      </Space>
    </Modal>
  );
};

export default ModelSettingsModal;
