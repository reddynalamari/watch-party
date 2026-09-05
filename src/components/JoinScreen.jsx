import { useState } from 'react';
import { ClapperboardIcon } from '@hugeicons/core-free-icons';
import Icon from './Icon';

export default function JoinScreen({ initialRoomCode, onJoin }) {
  const [roomCode, setRoomCode] = useState(initialRoomCode || '');
  const [name, setName] = useState(() => localStorage.getItem('wp_name') || '');

  const submit = (e) => {
    e.preventDefault();
    const finalName = name.trim() || 'Guest';
    localStorage.setItem('wp_name', finalName);
    onJoin(roomCode.trim().toUpperCase(), finalName);
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-white font-sans px-4">
      <form className="p-8 sm:p-10 bg-white dark:bg-gray-900 rounded-2xl shadow-xl text-center w-full max-w-sm border border-gray-200 dark:border-gray-800">
        <div className="flex justify-center mb-3 text-blue-600 dark:text-blue-400">
          <Icon icon={ClapperboardIcon} size={40} strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-bold mb-1">Watch Party</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6 text-sm">
          Sync any video, video-call, and chat together — free, up to 10 people.
        </p>
        <input
          type="text"
          placeholder="Your name"
          className="p-3 rounded-lg mb-3 w-full outline-none font-medium text-center border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-blue-500 transition-colors"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          type="text"
          placeholder="Room code — leave blank for a new room"
          className="p-3 rounded-lg mb-6 w-full outline-none font-bold text-center border-2 border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 focus:border-blue-500 transition-colors uppercase"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
        />
        <button
          onClick={submit}
          className="w-full bg-blue-600 px-4 py-3 rounded-lg font-bold text-white hover:bg-blue-500 transition"
        >
          Join Room
        </button>
        {initialRoomCode && (
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-4">
            You followed an invite link for room <span className="font-bold">{initialRoomCode}</span>.
          </p>
        )}
      </form>
    </div>
  );
}