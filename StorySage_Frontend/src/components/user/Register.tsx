import React from 'react';
import { Form, Input, Button, Card, message, Radio, Spin, Segmented } from 'antd';
import { UserOutlined, LockOutlined, CheckCircleOutlined, NumberOutlined } from '@ant-design/icons';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient } from '../../utils/api';
import { ApiError } from '../../utils/api';
import { useAuthStore } from '../../stores/authStore';
import type { StudyGroup } from '../../stores/authStore';
import { rememberDemoCredential } from '../../utils/demoCredentialStore';
import {
  AppLanguage,
  getStoredLanguage,
  setStoredLanguage,
} from '../../utils/language';

interface RegisterForm {
  userId: string;
  password: string;
  confirmPassword: string;
  studyGroup: StudyGroup;
}

const Register: React.FC = () => {
  const navigate = useNavigate();
  const login = useAuthStore(state => state.login);
  const [form] = Form.useForm();
  const [language, setLanguage] = React.useState<AppLanguage>(() => getStoredLanguage());
  const [isRegistering, setIsRegistering] = React.useState(false);
  const [isOpeningCockpit, setIsOpeningCockpit] = React.useState(false);
  const selectedStudyGroup = Form.useWatch('studyGroup', form);
  const copy = language === 'zh'
    ? {
        sideTitle: '从记忆开始，让模型慢慢生长。',
        sideText: '一个清新的私人空间，用自然访谈生成自传、关系图谱与校园决策模拟记录。',
        kicker: '创建私人档案',
        title: '创建你的空间。',
        subtitle: '第 0 步是选择老师分配的组别。这个账号会同时连接 RewindAI 和 simulation-test 记录。',
        groupHeading: '第 0 步 · 必选分组',
        groupFallback: '请先选择老师分配给你的 Group 1、Group 2、Group 3 或 Anonymous Group。',
        selected: '已选择',
        required: '必选',
        groupRequired: '创建账号前请先选择研究分组。',
        userIdPlaceholder: '用户 ID',
        passwordPlaceholder: '密码',
        confirmPasswordPlaceholder: '确认密码',
        register: '创建账号',
        opening: '正在进入你的控制台...',
        openingDetail: '正在进入你的 RewindAI 控制台，请稍等。',
        haveAccount: '已经有账号？',
        login: '登录',
        success: '注册成功！',
        failed: '注册失败，请重试。',
        needUserId: '请输入用户 ID。',
        userIdRule: '用户 ID 只能包含小写字母和数字。',
        needPassword: '请输入密码。',
        passwordLength: '密码至少需要 6 个字符。',
        needConfirm: '请确认密码。',
        passwordMismatch: '两次输入的密码不一致。',
      }
    : {
        sideTitle: 'Begin with memory. Let the model grow later.',
        sideText: 'Create a private space for natural interview sessions, editable biography drafts, and the graph-backed simulation layer.',
        kicker: 'Start a private archive',
        title: 'Create your space.',
        subtitle: 'Step 0 is choosing your assigned group. This keeps your RewindAI and simulation-test records connected.',
        groupHeading: 'Step 0 · Group input / 必选分组',
        groupFallback: 'Choose your assigned group first. 请先选择老师分配给你的 Group 1、Group 2、Group 3 或 Anonymous Group。',
        selected: 'selected',
        required: 'required',
        groupRequired: 'Please choose your study group before creating the account.',
        userIdPlaceholder: 'User ID',
        passwordPlaceholder: 'Password',
        confirmPasswordPlaceholder: 'Confirm Password',
        register: 'Register',
        opening: 'Opening your cockpit...',
        openingDetail: '正在进入你的 RewindAI 控制台，请稍等。',
        haveAccount: 'Already have an account?',
        login: 'Log in',
        success: 'Registration successful!',
        failed: 'Registration failed. Please try again.',
        needUserId: 'Please input your user ID!',
        userIdRule: 'User ID can only contain lowercase letters and numbers!',
        needPassword: 'Please input your password!',
        passwordLength: 'Password must be at least 6 characters!',
        needConfirm: 'Please confirm your password!',
        passwordMismatch: 'The two passwords do not match!',
      };
  const groupOptions: Array<{
    value: StudyGroup;
    label: string;
  }> = [
    {
      value: 'blank',
      label: 'Group 1',
    },
    {
      value: 'contrast',
      label: 'Group 2',
    },
    {
      value: 'experiment',
      label: 'Group 3',
    },
    {
      value: 'anonymous',
      label: 'Anonymous Group',
    },
  ];

  const onFinish = async (values: RegisterForm) => {
    try {
      setIsRegistering(true);
      const response = await apiClient('REGISTER', {
        method: 'POST',
        requireAuth: false,
        timeoutMs: 45000,
        body: JSON.stringify({
          user_id: values.userId.toLowerCase(),
          password: values.password,
          study_group: values.studyGroup,
        }),
      });

      // Log the user in with the received token
      const normalizedUserId = values.userId.toLowerCase();
      const studyGroup = response.study_group ?? values.studyGroup;
      await rememberDemoCredential(normalizedUserId, values.password, response.access_token, studyGroup);
      login(normalizedUserId, response.access_token, studyGroup);
      setIsOpeningCockpit(true);
      message.success(copy.success);
      navigate('/', { replace: true });
    } catch (error) {
      setIsRegistering(false);
      setIsOpeningCockpit(false);
      console.error('Registration error:', error);
      if (error instanceof ApiError) {
        message.error(error.message);
      } else {
        message.error(copy.failed);
      }
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
      <div className="storysage-auth-shell storysage-register-shell">
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

        <Card className="storysage-auth-card storysage-register-card w-full max-w-2xl">
          <div className="text-left mb-6 pl-4">
            <span className="storysage-kicker">{copy.kicker}</span>
            <h1 className="storysage-display-title mb-4">{copy.title}</h1>
            <p className="storysage-auth-subtitle mb-0">
              {copy.subtitle}
            </p>
          </div>

          <Form
            form={form}
            name="register"
            onFinish={onFinish}
            layout="vertical"
            requiredMark={false}
          >
            {isOpeningCockpit ? (
              <div className="storysage-register-opening" role="status" aria-live="polite">
                <Spin size="large" />
                <strong>{copy.opening}</strong>
                <span>{copy.openingDetail}</span>
              </div>
            ) : (
              <>
            <div
              className={`storysage-group-block${selectedStudyGroup ? ' storysage-group-block-selected' : ''}`}
              aria-label="Choose study group"
            >
              <div className="storysage-group-block-header">
                <div>
                  <span><NumberOutlined /> {copy.groupHeading}</span>
                  <p>
                    {copy.groupFallback}
                  </p>
                </div>
                <small>{selectedStudyGroup ? copy.selected : copy.required}</small>
              </div>
              <Form.Item
                name="studyGroup"
                rules={[
                  {
                    required: true,
                    message: copy.groupRequired,
                  },
                ]}
              >
                <Radio.Group
                  className="storysage-group-picker"
                  aria-label="Study group"
                >
                  {groupOptions.map(option => (
                    <Radio.Button key={option.value} value={option.value}>
                      <span className="storysage-group-option-top">
                        {selectedStudyGroup === option.value ? <CheckCircleOutlined /> : null}
                        {option.label}
                      </span>
                    </Radio.Button>
                  ))}
                </Radio.Group>
              </Form.Item>
            </div>

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

            {/* <Form.Item
              name="email"
              rules={[
                { required: true, message: 'Please input your email!' },
                { type: 'email', message: 'Please enter a valid email!' }
              ]}
            >
              <Input 
                prefix={<MailOutlined />} 
                placeholder="Email"
                size="large"
              />
            </Form.Item> */}

            <Form.Item
              name="password"
              rules={[
                { required: true, message: copy.needPassword },
                { min: 6, message: copy.passwordLength }
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder={copy.passwordPlaceholder}
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: copy.needConfirm },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error(copy.passwordMismatch));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder={copy.confirmPasswordPlaceholder}
                size="large"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                aria-label={copy.register}
                className="storysage-auth-primary w-full"
                size="large"
                loading={isRegistering}
                disabled={isRegistering}
              >
                {copy.register}
              </Button>
            </Form.Item>

            <div className="text-center">
              <span className="text-[#6e8174]">{copy.haveAccount} </span>
              <Link to="/login" className="storysage-auth-link">
                {copy.login}
              </Link>
            </div>
              </>
            )}
          </Form>
        </Card>
      </div>
    </div>
  );
};

export default Register;
