import React, { useState } from 'react';
import { Badge, Button, Dropdown, MenuProps, Segmented, message } from 'antd';
import { ApiOutlined, DownOutlined, HomeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { AppLanguage, getStoredLanguage, setStoredLanguage } from '../../utils/language';
import { apiClient } from '../../utils/api';
import { forgetDemoCredential } from '../../utils/demoCredentialStore';
import { clearLocalEvidenceForUser } from '../../utils/localEvidence';
import ModelSettingsModal, {
  ModelSettingsStatus,
} from '../model-settings/ModelSettingsModal';
import { getStoredModelSettings } from '../../utils/modelSettings';

export const modelSettingsChangeEvent = 'rewindai:model-settings-change';

const Header: React.FC = () => {
  const navigate = useNavigate();
  const { userId, logout } = useAuthStore();
  const [language, setLanguage] = useState<AppLanguage>(() => getStoredLanguage());
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelSettingsStatus>({
    configured: false,
    provider: null,
    model_name: null,
  });

  const copy = language === 'zh'
    ? {
        viewData: '查看数据',
        biography: '我的自传',
        history: '对话历史',
        logout: '退出',
      }
    : {
        viewData: 'View Data',
        biography: 'My Biography',
        history: 'Conversation History',
        logout: 'Logout',
      };

  const items: MenuProps['items'] = [
    {
      key: 'biography',
      label: copy.biography,
    },
    {
      key: 'history',
      label: copy.history,
    }
  ];

  const handleLanguageChange = (value: string | number) => {
    const nextLanguage = value === 'zh' ? 'zh' : 'en';
    setLanguage(nextLanguage);
    setStoredLanguage(nextLanguage);
  };

  React.useEffect(() => {
    if (!userId) return;

    const fetchModelSettings = async () => {
      const stored = getStoredModelSettings();
      if (stored) {
        setModelStatus({
          configured: true,
          provider: stored.provider,
          model_name: stored.model_name,
        });
        return;
      }

      try {
        const status = await apiClient('MODEL_SETTINGS', { method: 'GET' });
        const latestStored = getStoredModelSettings();
        if (latestStored) {
          setModelStatus({
            configured: true,
            provider: latestStored.provider,
            model_name: latestStored.model_name,
          });
          return;
        }
        setModelStatus(status);
      } catch {
        const latestStored = getStoredModelSettings();
        if (latestStored) {
          setModelStatus({
            configured: true,
            provider: latestStored.provider,
            model_name: latestStored.model_name,
          });
          return;
        }
        setModelStatus({ configured: false, provider: null, model_name: null });
      }
    };

    fetchModelSettings();

    const handleSettingsChange = (event: Event) => {
      setModelStatus((event as CustomEvent<ModelSettingsStatus>).detail);
    };
    window.addEventListener(modelSettingsChangeEvent, handleSettingsChange);
    return () => {
      window.removeEventListener(modelSettingsChangeEvent, handleSettingsChange);
    };
  }, [userId]);

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    if (e.key === 'biography') {
      navigate('/biography');
    } else if (e.key === 'history') {
      navigate('/chat');
    } else if (e.key === 'logs') {
      message.info('Check files under /logs/' + userId + '/execution_logs/');
    }
  };

  const handleLogout = () => {
    if (userId) {
      clearLocalEvidenceForUser(userId);
      forgetDemoCredential(userId);
    }
    logout();
    navigate('/login');
  };

  return (
    <>
      <header className="storysage-header h-16 flex items-center justify-between px-4 sm:px-6">
        <div className="storysage-header-left flex items-center gap-3">
          <button
            type="button"
            className="storysage-header-brand bg-transparent p-0"
            onClick={() => navigate('/')}
          >
            RewindAI
          </button>
          <Dropdown menu={{ items, onClick: handleMenuClick }}>
            <Button className="flex items-center gap-2">
              {copy.viewData} <DownOutlined />
            </Button>
          </Dropdown>
        </div>
        <div className="storysage-header-right flex items-center gap-4">
          <Badge dot={!modelStatus.configured} offset={[-2, 4]}>
            <Button
              type={modelStatus.configured ? 'default' : 'primary'}
              icon={<ApiOutlined />}
              onClick={() => setModelSettingsOpen(true)}
              className="storysage-api-settings-button"
            >
              Model
            </Button>
          </Badge>
          <Segmented
            className="storysage-language-toggle"
            size="small"
            value={language}
            onChange={handleLanguageChange}
            options={[
              { label: 'EN', value: 'en' },
              { label: '中', value: 'zh' },
            ]}
          />
          <span className="storysage-header-user">{userId}</span>
          <Button 
            type="default"
            aria-label="Home"
            icon={<HomeOutlined className="text-lg" />}
            onClick={() => navigate('/')}
          />
          <Button onClick={handleLogout}>
            {copy.logout}
          </Button>
        </div>
      </header>
      <ModelSettingsModal
        open={modelSettingsOpen}
        language={language}
        status={modelStatus}
        onCancel={() => setModelSettingsOpen(false)}
        onConfigured={(status) => {
          setModelStatus(status);
          window.dispatchEvent(new CustomEvent(modelSettingsChangeEvent, { detail: status }));
          setModelSettingsOpen(false);
        }}
      />
    </>
  );
};

export default Header; 
