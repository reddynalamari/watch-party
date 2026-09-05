import { useState, useRef, useEffect } from 'react';
import { Cancel01Icon, SentIcon, Message01Icon } from '@hugeicons/core-free-icons';
import Icon from './Icon';

export default function ChatPanel({ isOpen, onClose, messages, onSend, myClientId }) {
  const [text, setText] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
  };

  return (
    <div className="fixed md:absolute inset-y-0 right-0 w-full sm:w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-2xl z-40 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <h3 className="font-bold text-gray-900 dark:text-white">Chat</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-900 dark:hover:text-white p-1 rounded">
          <Icon icon={Cancel01Icon} size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-600 text-sm text-center mt-8">
            <Icon icon={Message01Icon} size={22} />
            No messages yet. Say hi.
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="text-sm leading-snug">
            <span className="font-bold text-blue-600 dark:text-blue-400">
              {m.clientId === myClientId ? 'You' : m.sender}:{' '}
            </span>
            <span className="text-gray-800 dark:text-gray-200 break-words">{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={submit} className="p-3 border-t border-gray-200 dark:border-gray-800 flex gap-2 shrink-0">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button type="submit" className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-bold">
          <Icon icon={SentIcon} size={15} /> Send
        </button>
      </form>
    </div>
  );
}
