import React, { KeyboardEvent, useEffect, useRef, useState } from 'react';
import { Button, Tooltip } from 'antd';
import { chatCopy } from '../../constants/chatCopy';
import type { AppLanguage } from '../../utils/language';

interface ChatInputProps {
  onSendMessage: (content: string) => Promise<void>;
  disabled?: boolean;
  onInputFocus?: () => void;
  onMessageSent?: () => void;
  language: AppLanguage;
}

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled,
  onInputFocus,
  onMessageSent,
  language,
}) => {
  const [message, setMessage] = useState('');
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const copy = chatCopy[language].input;

  const adjustTextAreaHeight = () => {
    const textarea = textAreaRef.current;
    if (!textarea) return;

    textarea.style.height = 'inherit';
    const computed = window.getComputedStyle(textarea);
    const height = parseInt(computed.getPropertyValue('border-top-width'), 10)
      + parseInt(computed.getPropertyValue('padding-top'), 10)
      + textarea.scrollHeight
      + parseInt(computed.getPropertyValue('padding-bottom'), 10)
      + parseInt(computed.getPropertyValue('border-bottom-width'), 10);

    textarea.style.height = `${Math.min(height, 200)}px`;
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed || disabled) return;

    await onSendMessage(trimmed);
    setMessage('');
    onMessageSent?.();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleTextAreaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(event.target.value);
    adjustTextAreaHeight();
    if (onInputFocus && event.target.value.length === 1) onInputFocus();
  };

  useEffect(() => {
    adjustTextAreaHeight();
  }, [message]);

  return (
    <div className="storysage-chat-input min-h-chat-input-min max-h-chat-input-max flex flex-col px-4 py-3">
      <div className="flex-1 relative mx-2">
        <textarea
          ref={textAreaRef}
          value={message}
          onChange={handleTextAreaChange}
          onKeyDown={handleKeyDown}
          onFocus={onInputFocus}
          placeholder={copy.placeholder}
          aria-label={copy.aria}
          className="storysage-chat-textarea w-full min-h-[48px] max-h-[144px] resize-none p-3 overflow-y-auto"
          disabled={disabled}
        />
        <div className="absolute right-3 bottom-4">
          <Tooltip title={copy.sendTooltip} placement="top">
            <Button
              onClick={handleSend}
              disabled={!message.trim() || disabled}
              type="text"
              aria-label={copy.send}
              className="storysage-send-button p-2 rounded-full transition-colors"
              icon={
                <svg
                  viewBox="0 0 24 24"
                  className="w-4 h-4 text-white"
                >
                  <path
                    fill="currentColor"
                    d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"
                  />
                </svg>
              }
            >
              <span className="storysage-send-button-label">{copy.sendLabel}</span>
            </Button>
          </Tooltip>
        </div>
      </div>
      <div className="storysage-chat-input-helper mx-3 mt-2">
        {copy.helper}
      </div>
    </div>
  );
};

export default ChatInput;
