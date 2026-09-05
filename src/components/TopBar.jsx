import { useState, useEffect, useRef } from 'react';
import {
  Link04Icon,
  UserMultiple03Icon,
  Message01Icon,
  IdeaIcon,
  RefreshIcon,
  Sun03Icon,
  Moon02Icon,
  Maximize02Icon,
  Minimize02Icon,
  PlayIcon,
  Add01Icon,
  AlertCircleIcon,
  CheckmarkCircle02Icon,
} from '@hugeicons/core-free-icons';
import Icon from './Icon';
import { useOEmbed } from '../hooks/useOEmbed';

const STATUS_LABEL = {
  CONNECTING: { text: 'Connecting…', color: 'bg-yellow-400' },
  SUBSCRIBED: { text: 'Connected', color: 'bg-green-500' },
  CHANNEL_ERROR: { text: 'Connection error', color: 'bg-red-500' },
  TIMED_OUT: { text: 'Reconnecting…', color: 'bg-yellow-500' },
  CLOSED: { text: 'Disconnected', color: 'bg-gray-400' },
};

const DEGRADED = new Set(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']);

const pill = 'flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors';
const pillIdle = `${pill} bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200`;

export default function TopBar({
  roomName,
  connectionStatus,
  participantCount,
  onToggleParticipants,
  onToggleChat,
  chatUnread,
  theme,
  onToggleTheme,
  isFullscreen,
  onToggleFullscreen,
  onInvite,
  camLightOn,
  onToggleCamLight,
  urlInput,
  setUrlInput,
  onPlayNow,
  onAddToQueue,
  currentVideo,
  onResync,
}) {
  const nowPlaying = useOEmbed(currentVideo);
  const status = STATUS_LABEL[connectionStatus] || STATUS_LABEL.CLOSED;

  const [inviteState, setInviteState] = useState('idle');
  const resetTimer = useRef(null);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleInvite = async () => {
    const ok = await onInvite();
    setInviteState(ok ? 'copied' : 'failed');
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setInviteState('idle'), 2500);
  };

  return (
    <div className="flex flex-col gap-2 mb-3 shrink-0">
      <div className="flex flex-wrap gap-2 items-center bg-white dark:bg-gray-900 p-2 rounded-lg border border-gray-200 dark:border-gray-800">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 px-2">
          <span className={`w-2 h-2 rounded-full ${status.color}`} />
          {status.text}
        </span>

        <span className="font-bold text-blue-600 dark:text-blue-400 bg-blue-500/10 px-3 py-1.5 rounded-lg text-sm">
          Room: {roomName}
        </span>

        <button
          onClick={handleInvite}
          className={
            inviteState === 'copied'
              ? `${pill} bg-green-500/15 text-green-600 dark:text-green-400`
              : inviteState === 'failed'
              ? `${pill} bg-red-500/15 text-red-600 dark:text-red-400`
              : pillIdle
          }
          title="Copy an invite link for this room"
        >
          <Icon icon={inviteState === 'copied' ? CheckmarkCircle02Icon : Link04Icon} size={14} />
          {inviteState === 'copied' ? 'Copied!' : inviteState === 'failed' ? "Couldn't copy" : 'Invite'}
        </button>

        <button onClick={onToggleParticipants} className={pillIdle}>
          <Icon icon={UserMultiple03Icon} size={14} /> {participantCount}
        </button>

        <button onClick={onToggleChat} className={`relative ${pillIdle}`}>
          <Icon icon={Message01Icon} size={14} /> Chat
          {chatUnread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
              {chatUnread}
            </span>
          )}
        </button>

        <button
          onClick={onToggleCamLight}
          className={camLightOn ? `${pill} bg-yellow-400 text-black` : pillIdle}
          title="Toggle a bright draggable panel to light up your face for the camera"
        >
          <Icon icon={IdeaIcon} size={14} /> Cam Light
        </button>

        <button onClick={onResync} className={pillIdle} title="Snap back to the current shared playback position">
          <Icon icon={RefreshIcon} size={14} /> Resync
        </button>

        <div className="flex-1" />

        <button onClick={onToggleTheme} className={pillIdle}>
          <Icon icon={theme === 'dark' ? Sun03Icon : Moon02Icon} size={14} />
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>

        <button onClick={onToggleFullscreen} className={`${pill} bg-blue-600 hover:bg-blue-500 text-white`}>
          <Icon icon={isFullscreen ? Minimize02Icon : Maximize02Icon} size={14} />
          {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
        </button>
      </div>

      {DEGRADED.has(connectionStatus) && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-400 text-xs px-3 py-2 rounded-lg">
          <Icon icon={AlertCircleIcon} size={15} className="shrink-0 mt-0.5" />
          <span>
            Real-time connection isn't working, so participants, chat, and sync may not update for anyone in the
            room. This is almost always a missing/incorrect Supabase key in <code>.env</code>, or Brave Shields
            blocking the websocket on <code>localhost</code> — try disabling Shields for this site, or double-check
            <code> VITE_SUPABASE_URL</code> / <code>VITE_SUPABASE_ANON_KEY</code>.
          </span>
        </div>
      )}

      {/* URL input & controls – now visible to everyone */}
      <div className="flex flex-wrap gap-2 items-center bg-white dark:bg-gray-900 p-2 rounded-lg border border-gray-200 dark:border-gray-800">
        <input
          type="text"
          placeholder="Paste a YouTube, Dailymotion, Vimeo, or Google Drive URL…"
          className="flex-1 min-w-[220px] p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onPlayNow(); }}
        />
        <button onClick={onPlayNow} className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold text-sm">
          <Icon icon={PlayIcon} size={14} /> Play Now
        </button>
        <button onClick={onAddToQueue} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-bold text-sm">
          <Icon icon={Add01Icon} size={14} /> Add to Queue
        </button>
      </div>

      {nowPlaying?.title && (
        <div className="px-1 text-xs text-gray-500 dark:text-gray-400 truncate">
          Now playing: <span className="font-semibold text-gray-700 dark:text-gray-200">{nowPlaying.title}</span>
          {nowPlaying.author ? ` — ${nowPlaying.author}` : ''}
        </div>
      )}
    </div>
  );
}