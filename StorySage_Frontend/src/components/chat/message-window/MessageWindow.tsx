import React, { useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import { Message } from '../../../types/message';
import type { AppLanguage } from '../../../utils/language';
import { chatCopy } from '../../../constants/chatCopy';

interface MessageWindowProps {
  messages: Message[];
  historicalMessagesCount: number;
  language: AppLanguage;
}

const MessageWindow: React.FC<MessageWindowProps> = ({ messages, historicalMessagesCount, language }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const copy = chatCopy[language];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <div className="storysage-message-window flex-grow overflow-y-auto p-4">
      {/* Show historical messages */}
      {messages.slice(0, historicalMessagesCount).map((message) => (
        <ChatMessage
          key={message.id}
          message={message}
          isMostRecent={false}
        />
      ))}

      {/* Show separator if there are historical messages */}
      {historicalMessagesCount > 0 && (
        <div className="storysage-history-separator flex items-center my-4">
          <div className="flex-grow"></div>
          <span className="px-4 text-sm">
            {copy.historySeparator}
          </span>
          <div className="flex-grow"></div>
        </div>
      )}

      {/* Show new messages */}
      {messages.slice(historicalMessagesCount).map((message, index, newMessages) => (
        <ChatMessage
          key={message.id}
          message={message}
          isMostRecent={index === newMessages.length - 1 &&
            message.role === 'Interviewer'}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageWindow; 
