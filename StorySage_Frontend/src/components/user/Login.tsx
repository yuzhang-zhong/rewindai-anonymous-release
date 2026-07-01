import React from 'react';
import { Form, Input, Button, Card, message, Segmented } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
// eslint-disable-next-line
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { apiClient, ApiError } from '../../utils/api';
import { getMatchingDemoCredential, rememberDemoCredential } from '../../utils/demoCredentialStore';
import type { StudyGroup } from '../../stores/authStore';
import {
  AppLanguage,
  getStoredLanguage,
  setStoredLanguage,
} from '../../utils/language';

interface LoginForm {
  userId: string;
  password: string;
}

const Login: React.FC = () => {
  const login = useAuthStore(state => state.login);
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [language, setLanguage] = React.useState<AppLanguage>(() => getStoredLanguage());
  const copy = language === 'zh'
    ? {
        sideTitle: '从对话里继续生长你的自传。',
        sideText: '一个清新的绿色工作台，用访谈、自传、关系图谱和校园决策模拟连接你的经验。',
        kicker: '私人故事花园',
        title: '欢迎回来。',
        subtitle: '继续你的自传、图谱与决策模拟流程。',
        userIdPlaceholder: '用户 ID',
        passwordPlaceholder: '密码',
        login: '登录',
        noAccount: '还没有账号？',
        register: '立即注册',
        success: (userId: string) => `登录成功：${userId}`,
        restored: '已在此浏览器恢复 demo 账号。',
        failed: '登录失败：',
        needUserId: '请输入用户 ID。',
        userIdRule: '用户 ID 只能包含小写字母和数字。',
        needPassword: '请输入密码。',
      }
    : {
        sideTitle: 'Grow a living autobiography from conversation.',
        sideText: 'A calm green workspace for interviews, biographies, relationship graphs, and decision simulations grounded in your own words.',
        kicker: 'Private story garden',
        title: 'Welcome back.',
        subtitle: 'Continue your autobiography, graph, and decision simulation workflow.',
        userIdPlaceholder: 'User ID',
        passwordPlaceholder: 'Password',
        login: 'Log in',
        noAccount: "Don't have an account?",
        register: 'Register now',
        success: (userId: string) => 'Login successful with userId: ' + userId,
        restored: 'Restored this demo account on this browser.',
        failed: 'Login failed: ',
        needUserId: 'Please input your user ID!',
        userIdRule: 'User ID can only contain lowercase letters and numbers!',
        needPassword: 'Please input your password!',
      };

  const onFinish = async (values: LoginForm) => {
    const normalizedUserId = values.userId.toLowerCase();
    try {
      const data = await apiClient('LOGIN', {
        method: 'POST',
        requireAuth: false,
        body: JSON.stringify({
          user_id: normalizedUserId,
          password: values.password,
        }),
      });

      const studyGroup = (data.study_group ?? 'experiment') as StudyGroup;
      await rememberDemoCredential(normalizedUserId, values.password, data.access_token, studyGroup);
      login(normalizedUserId, data.access_token, studyGroup);
      message.success(copy.success(normalizedUserId));
      navigate('/');
    } catch (error) {
      if (error instanceof ApiError && [400, 401, 403].includes(error.status)) {
        const localCredential = await getMatchingDemoCredential(normalizedUserId, values.password);
        if (localCredential) {
          try {
            const recreated = await apiClient('REGISTER', {
              method: 'POST',
              requireAuth: false,
              body: JSON.stringify({
                user_id: normalizedUserId,
                password: values.password,
                study_group: localCredential.studyGroup,
              }),
            });
            const studyGroup = (recreated.study_group ?? localCredential.studyGroup) as StudyGroup;
            await rememberDemoCredential(normalizedUserId, values.password, recreated.access_token, studyGroup);
            login(normalizedUserId, recreated.access_token, studyGroup);
          } catch {
            login(normalizedUserId, localCredential.token, localCredential.studyGroup);
          }
          message.success(copy.restored);
          navigate('/');
          return;
        }
      }
      message.error(copy.failed + (error as Error).message);
    }
  };

  const validateUserId = (_: unknown, value: string) => {
    if (!value) {
      return Promise.reject(copy.needUserId);
    }
    if (!/^[a-z0-9]+$/.test(value)) {
      return Promise.reject(copy.userIdRule);
    }
    return Promise.resolve();
  };

  const handleLanguageChange = (value: string | number) => {
    const nextLanguage = value === 'zh' ? 'zh' : 'en';
    setLanguage(nextLanguage);
    setStoredLanguage(nextLanguage);
  };

  return (
    <div className="storysage-auth-page min-h-screen px-4 py-8">
      <Segmented
        className="storysage-auth-language storysage-language-toggle"
        size="small"
        value={language}
        onChange={handleLanguageChange}
        options={[
          { label: 'EN', value: 'en' },
          { label: '中', value: 'zh' },
        ]}
      />
      <div className="storysage-auth-orb storysage-auth-orb-a" />
      <div className="storysage-auth-orb storysage-auth-orb-b" />
      <div className="storysage-auth-shell">
        <div className="storysage-auth-copy">
          <span className="storysage-auth-brand">RewindAI</span>
          <h1>{copy.sideTitle}</h1>
          <p>{copy.sideText}</p>
          <div className="storysage-auth-garden-panel" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>

        <Card className="storysage-auth-card w-full max-w-md">
          <div className="text-left mb-8 pl-4">
            <span className="storysage-kicker">{copy.kicker}</span>
            <h1 className="storysage-display-title mb-4">{copy.title}</h1>
            <p className="storysage-auth-subtitle mb-0">
              {copy.subtitle}
            </p>
          </div>
          
          <Form
            form={form}
            name="login"
            onFinish={onFinish}
            layout="vertical"
            requiredMark={false}
          >
            <Form.Item
              name="userId"
              rules={[
                { validator: validateUserId }
              ]}
              validateTrigger="onChange"
              normalize={(value: string | undefined) => value?.toLowerCase() ?? value}
            >
              <Input 
                prefix={<UserOutlined />} 
                placeholder={copy.userIdPlaceholder}
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: copy.needPassword }]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder={copy.passwordPlaceholder}
                size="large"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                aria-label={copy.login}
                className="storysage-auth-primary w-full"
                size="large"
              >
                {copy.login}
              </Button>
            </Form.Item>
            
            <div className="text-center">
              <span className="text-[#6e8174]">{copy.noAccount} </span>
              <Link to="/register" className="storysage-auth-link">
                {copy.register}
              </Link>
            </div>
          </Form>
        </Card>
      </div>
    </div>
  );
};

export default Login;
