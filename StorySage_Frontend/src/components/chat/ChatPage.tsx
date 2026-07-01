import React, { useState, useEffect } from 'react';
import { Button, message, Spin, notification, Popconfirm, Tooltip } from 'antd';
import { SmileOutlined, InfoCircleOutlined } from '@ant-design/icons';
import MessageWindow from './message-window/MessageWindow';
import InterviewWindow from './interview-window/InterviewWindow';
import ChatInput from './ChatInput';
import { Message } from '../../types/message';
import { apiClient } from '../../utils/api';
import { useNavigate, useLocation } from 'react-router-dom';
import TopicSelectionModal from './modals/TopicSelectionModal';
import FeedbackModal from './modals/FeedbackModal';
import { useAuthStore } from '../../stores/authStore';
import { chatCopy, initialInterviewMessages } from '../../constants/chatCopy';
import {
  AppLanguage,
  getStoredLanguage,
  languageChangeEvent,
} from '../../utils/language';
import ModelSettingsModal, {
  ModelSettingsStatus,
} from '../model-settings/ModelSettingsModal';
import { modelSettingsChangeEvent } from '../layout/Header';
import {
  getModelSettingsHeaders,
  getStoredModelSettings,
} from '../../utils/modelSettings';
import {
  loadCachedChatMessages,
  mergeMessages,
  saveCachedChatMessages,
} from '../../utils/localEvidence';

const ChatPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isInterviewMode = location.pathname === '/user_chat';
  const userId = useAuthStore(state => state.userId);
  const studyGroup = useAuthStore(state => state.studyGroup);
  const [language, setLanguage] = useState<AppLanguage>(() => getStoredLanguage());
  const copy = chatCopy[language];

  // Chat messages
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastSubmittedAnswer, setLastSubmittedAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSlowResponse, setIsSlowResponse] = useState(false);
  const [historicalMessagesCount, setHistoricalMessagesCount] = useState(0);
  
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelSettingsStatus>({
    configured: false,
    provider: null,
    model_name: null,
  });

  // End session
  const [isTopicModalVisible, setIsTopicModalVisible] = useState(false);
  const [sessionTopics, setSessionTopics] = useState<string[]>([]);
  const [isEndingSession, setIsEndingSession] = useState(false);
  const [isFeedbackModalVisible, setIsFeedbackModalVisible] = useState(false);
  const [sessionFeedback, setSessionFeedback] = 
    useState<{ rating: number; feedback: string } | null>(null);
  
  // Like and skip actions
  const [isSkipping, setIsSkipping] = useState(false);
  const [likedMessageIds, setLikedMessageIds] = useState<Set<string>>(new Set());

  // Add a new state to track user focus mode
  const [isUserFocused, setIsUserFocused] = useState(false);
  const userTurns = messages.filter(message => (
    message.role === 'User' && message.content.trim().length > 0
  )).length;
  const submittedAnswerAlreadyVisible = Boolean(lastSubmittedAnswer.trim()) && messages.some(message => (
    message.role === 'User' && message.content.trim() === lastSubmittedAnswer.trim()
  ));
  const effectiveUserTurns = userTurns + (
    lastSubmittedAnswer.trim() && !submittedAnswerAlreadyVisible ? 1 : 0
  );
  const requiredInterviewTurns = (
    studyGroup === 'experiment' || studyGroup === 'anonymous'
  ) ? 20 : 1;
  const canFinishInterview = effectiveUserTurns >= requiredInterviewTurns;
  const finishRequirementMessage = canFinishInterview
    ? copy.endSessionConfirm
    : copy.interview.needMoreAnswers(requiredInterviewTurns, effectiveUserTurns);

  const modelSettingsRequiredMessage = language === 'zh'
    ? '系统模型还没有配置好，请让 demo host 设置后端 API Key 后再开始访谈。'
    : 'The system model is not configured yet. Please ask the demo host to set the backend API key before starting the interview.';

  const goToBiographyAfterEnd = () => {
    setIsFeedbackModalVisible(false);
    setIsTopicModalVisible(false);
    setIsLoading(false);
    window.setTimeout(() => {
      navigate('/biography', { replace: true });
      window.setTimeout(() => {
        if (window.location.pathname !== '/biography') {
          window.location.assign('/biography');
        }
      }, 1000);
    }, 0);
  };

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
    setMessages(prev => prev.map(msg => (
      msg.role === 'Interviewer' && initialInterviewMessages.includes(msg.content)
        ? { ...msg, content: copy.initialInterview }
        : msg
    )));
  }, [copy.initialInterview]);

  useEffect(() => {
    if (!isLoading) {
      setIsSlowResponse(false);
      return;
    }

    const slowTimer = window.setTimeout(() => {
      setIsSlowResponse(true);
    }, 10000);

    return () => window.clearTimeout(slowTimer);
  }, [isLoading]);

  useEffect(() => {
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
        if (isInterviewMode && !status.configured) {
          setModelSettingsOpen(true);
        }
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
        if (isInterviewMode) setModelSettingsOpen(true);
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
  }, [isInterviewMode]);

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      if (!userId) return;

      try {
        const cachedMessages = loadCachedChatMessages(userId);
        const data = await apiClient('MESSAGES', {
          method: 'GET',
        });

        const serverMessages = Array.isArray(data.messages) ? data.messages : [];
        const restoredMessages = mergeMessages(cachedMessages, serverMessages);
        setMessages(prev => {
          const next = mergeMessages(prev, restoredMessages);
          setHistoricalMessagesCount(next.length);
          if (next.length > 0) {
            saveCachedChatMessages(userId, next);
          }
          return next;
        });

        // Handle different session statuses
        switch (data.session_status) {
          case 'active':
            notification.success({
              message: language === 'zh' ? '欢迎回来！' : 'Welcome back!',
              description: copy.welcomeBack,
              icon: <SmileOutlined style={{ color: '#108ee9' }} />,
              placement: 'topRight',
              duration: 3,
            });
            break;
          
          case 'inactive': {
            // Only show the starter prompt for brand-new users. Returning users
            // should see their persisted interview history after refresh/login.
            if (restoredMessages.length === 0) {
              const welcomeMessage: Message = {
                id: Date.now().toString(),
                content: copy.initialInterview,
                created_at: new Date().toISOString(),
                role: 'Interviewer'
              };
              setMessages(prev => {
                if (prev.length > 0) return prev;
                setHistoricalMessagesCount(0);
                return [welcomeMessage];
              });
            }
            break;
          }
          
          case 'ending':
            setIsLoading(true);
            notification.info({
              message: language === 'zh' ? '访谈正在整理中' : 'Session ending in progress',
              description: copy.endingInProgress,
              icon: <InfoCircleOutlined style={{ color: '#1890ff' }} />,
              placement: 'topRight',
              duration: 5,
            });
            break;
          
          default:
            console.warn(`${copy.unknownSession}${data.session_status}`);
        }
      } catch (error) {
        const cachedMessages = userId ? loadCachedChatMessages(userId) : [];
        if (cachedMessages.length > 0) {
          setMessages(prev => {
            const next = mergeMessages(prev, cachedMessages);
            setHistoricalMessagesCount(next.length);
            return next;
          });
        } else {
          message.error(copy.errors.messages + (error as Error).message);
        }
      }
    };
    fetchMessages();
  }, [copy.endingInProgress, copy.errors.messages, copy.initialInterview, copy.unknownSession, copy.welcomeBack, isInterviewMode, language, userId]);

  const handleSendMessage = async (content: string) => {
    if (!modelStatus.configured) {
      message.warning(modelSettingsRequiredMessage);
      setModelSettingsOpen(true);
      return;
    }

    try {
      setIsLoading(true);

      // Create a new user message
      const userMessage: Message = {
        id: `local-user-${Date.now()}`,
        content,
        created_at: new Date().toISOString(),
        role: 'User'
      };
      setLastSubmittedAnswer(content);

      // Add the new user message to the current messages
      setMessages(prev => {
        const next = mergeMessages(prev, [userMessage]);
        if (userId) saveCachedChatMessages(userId, next);
        return next;
      });

      // Send the message to the server and get the interviewer response
      const response: Message = await apiClient('MESSAGES', {
        method: 'POST',
        headers: getModelSettingsHeaders(),
        timeoutMs: 75000,
        body: JSON.stringify({
          content,
        }),
      });

      // Set isLoading to false after the message is sent
      setIsLoading(false);

      // Add the server's response to the messages
      setMessages(prev => {
        const next = mergeMessages(prev, [response]);
        if (userId) saveCachedChatMessages(userId, next);
        return next;
      });
    } catch (error) {
      if ((error as Error).message.includes('configure and validate')) {
        setModelStatus({ configured: false, provider: null, model_name: null });
        setModelSettingsOpen(true);
      }
      message.error(copy.errors.send + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrepareEndSession = async () => {
    try {
      setIsEndingSession(true);
      
      const isBaselineUser = useAuthStore.getState().isBaselineUser();

      const response = await apiClient('PREPARE_END_SESSION', {
        method: 'POST',
      });

      if (response.status !== "success") {
        message.error(copy.errors.prepareEnd + response.message);
        return;
      }
      
      // For regular users, show feedback and topic selection modals
      if (!isBaselineUser) {
        setSessionTopics(response.topics);
        setIsFeedbackModalVisible(true);
      } 
      // For baseline users, skip feedback and topic selection
      else {
        message.loading({ 
          content: copy.writingBiography,
          key: 'bioUpdate',
          duration: 0
        });
        
        const response = await apiClient('END_SESSION', {
          method: 'POST',
          body: JSON.stringify({
            selected_topics: [],
            feedback: { rating: 0, feedback: "" },
            transcript: messages,
          }),
        });

        if (response.status === "success") {
          message.success({ 
            content: copy.sessionEnded,
            key: 'bioUpdate',
            duration: 2 
          });
          goToBiographyAfterEnd();
        } else {
          message.error({ 
            content: copy.errors.endSession + response.message,
            key: 'bioUpdate'
          });
        }
      }
    } catch (error) {
      // Check if it's a timeout error for baseline users too
      if (error instanceof Error && 'status' in error && error.status === 408) {
        message.info({ 
          content: copy.biographyGenerating,
          key: 'bioUpdate',
          duration: 5
        });
        navigate('/');
      } else {
        message.error(copy.errors.prepareEnd + (error as Error).message);
      }
    } finally {
      setIsEndingSession(false);
    }
  };

  const handleFeedbackSubmit = async (rating: number, feedback: string) => {
    try {
      // Store feedback for later use
      setSessionFeedback({ rating, feedback });
      
      // Close feedback modal and show topic selection modal
      setIsFeedbackModalVisible(false);
      setIsTopicModalVisible(true);
    } catch (error) {
      message.error(copy.errors.feedback + (error as Error).message);
    }
  };

  const handleTopicSelection = async (selectedTopics: string[]) => {
    try {
      setIsEndingSession(true);
      message.loading({ 
        content: copy.writingBiography,
        key: 'bioUpdate',
        duration: 0
      });

      const response = await apiClient('END_SESSION', {
        method: 'POST',
        body: JSON.stringify({
          selected_topics: selectedTopics,
          feedback: sessionFeedback,
          transcript: messages,
        }),
      });

      if (response.status === "success") {
        message.success({ 
            content: copy.sessionEnded,
            key: 'bioUpdate',
            duration: 2 
        });
        goToBiographyAfterEnd();
      } else {
        message.error({ 
          content: copy.errors.endSession + response.message,
          key: 'bioUpdate'
        });
      }
    } catch (error) {
      // Check if it's a timeout error (status code 408)
      if (error instanceof Error && 'status' in error && error.status === 408) {
        message.info({ 
          content: copy.biographyGenerating,
          key: 'bioUpdate',
          duration: 5
        });
        goToBiographyAfterEnd();
      } else {
        message.error({ 
          content: copy.errors.endSession + (error as Error).message,
          key: 'bioUpdate'
        });
      }
    } finally {
      setIsEndingSession(false);
    }
  };

  const getMostRecentInterviewerMessage = () => {
    return messages.filter(msg => msg.role === 'Interviewer').slice(-1)[0];
  };

  const handleLike = async () => {
    const currentMessage = getMostRecentInterviewerMessage();
    if (!currentMessage || likedMessageIds.has(currentMessage.id)) return;

    try {
      await apiClient('LIKE', {
        method: 'POST',
      });
      message.success(copy.liked);
      setLikedMessageIds(prev => new Set(prev).add(currentMessage.id));
    } catch (error) {
      message.error(copy.errors.like + (error as Error).message);
    }
  };

  const handleSkip = async () => {
    try {
      setIsSkipping(true);
      
      const response: Message = await apiClient('SKIP', {
        method: 'POST',
      });

      // Add the interviewer's response to messages
      setMessages(prev => {
        const next = mergeMessages(prev, [response]);
        if (userId) saveCachedChatMessages(userId, next);
        return next;
      });
    } catch (error) {
      message.error(copy.errors.skip + (error as Error).message);
    } finally {
      setIsSkipping(false);
    }
  };

  return (
    <div className="storysage-chat-page flex h-full min-h-0 flex-col overflow-hidden relative">
      {isLoading && (
        <div className="storysage-chat-loading fixed inset-0 flex items-center justify-center z-50">
          <div className="storysage-chat-loading-card flex flex-col items-center">
            <Spin size="large" />
            <span className="mt-3">
              {isSlowResponse ? copy.slowResponse : copy.loading}
            </span>
          </div>
        </div>
      )}
      
      <div className="storysage-end-session absolute top-4 right-4 z-10">
        <Popconfirm
          title={copy.endSession}
          description={finishRequirementMessage}
          onConfirm={handlePrepareEndSession}
          okText={copy.yes}
          cancelText={copy.no}
          placement="bottomLeft"
          disabled={!canFinishInterview}
        >
          <Tooltip title={finishRequirementMessage}>
            <Button
              danger
              className={`storysage-end-session-button${userTurns >= 6 ? ' is-ready' : ''}`}
              aria-label={copy.endSession}
              icon={<img src="/icon/stop.png" alt="" className="h-4 w-4" />}
              loading={isEndingSession}
              disabled={!canFinishInterview}
              size="large"
            >
              {copy.endSession}
            </Button>
          </Tooltip>
        </Popconfirm>
      </div>

      <FeedbackModal
        isVisible={isFeedbackModalVisible}
        onOk={handleFeedbackSubmit}
        loading={isEndingSession}
        language={language}
      />

      <TopicSelectionModal
        isVisible={isTopicModalVisible}
        topics={sessionTopics}
        onOk={handleTopicSelection}
        loading={isEndingSession}
        language={language}
      />

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
      
      {isInterviewMode ? (
        <InterviewWindow 
          latestMessage={getMostRecentInterviewerMessage()}
          messages={messages}
          onLike={handleLike}
          onSkip={handleSkip}
          isSkipping={isSkipping}
          isLiked={!!getMostRecentInterviewerMessage()?.id && 
            likedMessageIds.has(getMostRecentInterviewerMessage()!.id)}
          isLoading={isLoading}
          isUserFocused={isUserFocused}
          lastSubmittedAnswer={lastSubmittedAnswer}
          canFinishInterview={canFinishInterview}
          requiredTurns={requiredInterviewTurns}
          isEndingSession={isEndingSession}
          onFinishInterview={handlePrepareEndSession}
          language={language}
        />
      ) : (
        <MessageWindow 
          messages={messages} 
          historicalMessagesCount={historicalMessagesCount}
          language={language}
        />
      )}

      <div className="storysage-chat-input-dock relative z-20">
        <ChatInput 
          onSendMessage={handleSendMessage} 
          disabled={isLoading || !modelStatus.configured}
          onInputFocus={() => setIsUserFocused(true)}
          onMessageSent={() => setIsUserFocused(false)}
          language={language}
        />
      </div>
    </div>
  );
};

export default ChatPage;
