import React, { useMemo } from 'react';
import { Message } from '../../../types/message';
import { motion } from 'framer-motion';
import { Button, Popconfirm, Space, Tooltip } from 'antd';
import { LikeOutlined, DislikeOutlined } from '@ant-design/icons';
import { useAuthStore } from '../../../stores/authStore';
import { chatCopy, initialInterviewMessages } from '../../../constants/chatCopy';
import type { AppLanguage } from '../../../utils/language';

interface InterviewWindowProps {
  latestMessage?: Message;
  messages: Message[];
  onLike: () => void;
  onSkip: () => void;
  isSkipping?: boolean;
  isLiked?: boolean;
  isLoading?: boolean;
  isUserFocused?: boolean;
  lastSubmittedAnswer?: string;
  canFinishInterview: boolean;
  requiredTurns: number;
  isEndingSession?: boolean;
  onFinishInterview: () => void;
  language: AppLanguage;
}

const InterviewWindow: React.FC<InterviewWindowProps> = ({ 
  latestMessage, 
  messages,
  onLike,
  onSkip,
  isSkipping,
  isLiked,
  isLoading,
  isUserFocused,
  lastSubmittedAnswer,
  canFinishInterview,
  requiredTurns,
  isEndingSession,
  onFinishInterview,
  language
}) => {
  const isBaselineUser = useAuthStore(state => state.isBaselineUser);
  const copy = chatCopy[language];
  const submittedAnswer = lastSubmittedAnswer?.trim() || '';
  const persistedUserTurns = messages.filter(message => (
    message.role === 'User' && message.content.trim().length > 0
  )).length;
  const submittedAnswerAlreadyVisible = Boolean(submittedAnswer) && messages.some(message => (
    message.role === 'User' && message.content.trim() === submittedAnswer
  ));
  const userTurns = persistedUserTurns + (submittedAnswer && !submittedAnswerAlreadyVisible ? 1 : 0);
  const targetTurns = requiredTurns;
  const topicSignals = Math.min(3, userTurns > 0 ? Math.max(1, Math.ceil(userTurns / 2)) : 0);
  const progressPercent = Math.min(100, Math.round((Math.min(userTurns, targetTurns) / targetTurns) * 100));
  const progressLabel = userTurns >= targetTurns
    ? copy.interview.progressReady
    : userTurns >= 3
      ? copy.interview.progressProbing
      : userTurns > 0
        ? copy.interview.progressWarming
        : copy.interview.progressStarting;
  const progressStage = userTurns >= targetTurns ? 3 : userTurns >= 3 ? 2 : 1;
  const finishHint = canFinishInterview
    ? copy.interview.finishReadyHint
    : copy.interview.needMoreAnswers(requiredTurns, userTurns);
  
  // Determine who is speaking based on the latest message
  const isBotSpeaking = useMemo(() => {
    if (isLoading || isUserFocused) return false;
    
    if (!latestMessage) return true;
    return latestMessage.role === 'Interviewer';
  }, [latestMessage, isLoading, isUserFocused]);
  
  // Simplify animation control
  const shouldAnimate = !isUserFocused;
  
  // Replace the separate animation objects with a single one
  const speakingAnimation = {
    speaking: {
      scale: shouldAnimate ? [1, 1.2, 1] : 1,
      y: shouldAnimate ? [0, -3, 0] : 0,
      transition: {
        duration: 1.5,
        repeat: shouldAnimate ? Infinity : 0,
      }
    },
    idle: {
      scale: 1,
      transition: {
        duration: 1
      }
    }
  };

  return (
    <div className="storysage-interview-window flex min-h-0 flex-1 flex-col items-center overflow-y-auto p-4">
      <div className="storysage-interview-shell max-w-4xl w-full flex flex-col items-center">
        <div className="storysage-interview-kicker">{copy.interview.kicker}</div>
        <h1 className="storysage-interview-title">{copy.interview.title}</h1>
        <p className="storysage-interview-subtitle">
          {copy.interview.subtitle}
        </p>
        <section className="storysage-interview-progress w-full" aria-label={copy.interview.progressTitle}>
          <div className="storysage-interview-progress-header">
            <div>
              <span>{copy.interview.progressTitle}</span>
              <strong>{progressLabel}</strong>
            </div>
            <div className="storysage-interview-progress-badges">
              <b>{copy.interview.answers}: {userTurns}</b>
              <b>{copy.interview.scenes}: {topicSignals}/3</b>
              <em>{copy.interview.progressStage(progressStage, 3)}</em>
            </div>
          </div>
          <div className="storysage-interview-progress-track">
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="storysage-interview-progress-cta">
            <p>{copy.interview.progressSubtitle(userTurns, topicSignals)}</p>
            <Popconfirm
              title={copy.endSession}
              description={finishHint}
              onConfirm={onFinishInterview}
              okText={copy.yes}
              cancelText={copy.no}
              placement="bottomRight"
              disabled={!canFinishInterview}
            >
              <Tooltip title={finishHint}>
                <Button
                  type="primary"
                  className="storysage-interview-progress-finish"
                  loading={isEndingSession}
                  disabled={!canFinishInterview}
                >
                  {copy.endSession}
                </Button>
              </Tooltip>
            </Popconfirm>
          </div>
        </section>
        <div className="storysage-character-stage flex justify-between w-full relative">
          <div className="storysage-character-card relative">
            <motion.img 
              src={isBotSpeaking ? "/stickers/interviewer_bot.png" : "/stickers/interviewer_bot_thinking.png"}
              alt={copy.interview.aiAlt}
              className="storysage-character-image h-48 w-auto"
              animate={isBotSpeaking ? "speaking" : "idle"}
              variants={speakingAnimation}
            />
          </div>
          
          <div className="storysage-character-card relative">
            <motion.img 
              src={!isBotSpeaking ? "/stickers/user.png" : "/stickers/user_thinking.png"}
              alt={copy.interview.userAlt}
              className="storysage-character-image h-48 w-auto"
              animate={!isBotSpeaking ? "speaking" : "idle"}
              variants={speakingAnimation}
            />
          </div>
        </div>
        
        <div className="storysage-interview-card w-full p-6 relative">
          {latestMessage ? (
            <>
              <div className="storysage-interview-message text-lg">
                {latestMessage.content}
              </div>

              {/* Only show buttons if it's not a initial welcome message 
              and not a baseline user */}
              {!initialInterviewMessages.includes(latestMessage.content) &&
               !isBaselineUser() && (
                <Space className="storysage-question-actions absolute -bottom-3 right-4">
                  <Tooltip 
                    title={copy.interview.likeTooltip}
                    placement="top"
                  >
                    <Button 
                      icon={<LikeOutlined />} 
                      onClick={onLike}
                      shape="circle"
                      disabled={isLiked}
                      aria-label={copy.interview.likeQuestion}
                      className={isLiked ? 'storysage-liked-question' : ''}
                    />
                  </Tooltip>
                  
                  <Tooltip
                    title={copy.interview.skipTooltip}
                    placement="top"
                  >
                    <Button 
                      icon={<DislikeOutlined />} 
                      onClick={onSkip}
                      loading={isSkipping}
                      shape="circle"
                      aria-label={copy.interview.skipQuestion}
                    />
                  </Tooltip>
                </Space>
              )}
            </>
          ) : (
            <div className="storysage-interview-message text-lg text-center">
              {copy.initialInterview}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default InterviewWindow;
