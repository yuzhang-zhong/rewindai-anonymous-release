import React from 'react';
import { Message } from '../../../types/message';

interface ChatMessageProps {
  message: Message;
  isMostRecent?: boolean;
}

const ChatMessage: React.FC<ChatMessageProps> = ({ message, isMostRecent = false }) => {
  const isUser = message.role === 'User';

  return (
    <div className={`storysage-chat-row flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`storysage-chat-bubble px-4 py-2 max-w-[80%] ${
          isUser 
            ? 'storysage-chat-bubble-user' 
            : 'storysage-chat-bubble-ai'
        } ${isMostRecent && !isUser ? 
          'storysage-chat-bubble-latest font-semibold text-lg' : ''}`}
      >
        {message.content}
      </div>
    </div>
  );
};

export default ChatMessage;
