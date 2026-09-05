import { useState, useEffect, useRef, useCallback } from 'react';
import ReactPlayerImport from 'react-player';

const ReactPlayer = ReactPlayerImport?.default ?? ReactPlayerImport;
import { useWatchParty } from './hooks/useWatchParty';
import { generateRoomCode } from './lib/utils';
import JoinScreen from './components/JoinScreen';
import TopBar from './components/TopBar';
import Playlist from './components/Playlist';
import ChatPanel from './components/ChatPanel';
import ParticipantsList from './components/ParticipantsList';
import CallWidget from './components/CallWidget';
import CamLight from './components/CamLight';
import { FloatingReactions, ReactionBar } from './components/Reactions';

export default function App() {
  // ---- Theme (persisted; affects the whole UI) ----
  const [theme, setTheme] = useState(() => localStorage.getItem('wp_theme') || 'dark');
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('wp_theme', theme);
  }, [theme]);

  // ---- Join state ----
  const [inRoom, setInRoom] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [wantsToHost, setWantsToHost] = useState(false);
  const initialRoomCode = useRef(new URLSearchParams(window.location.search).get('room') || '').current;

  const handleJoin = useCallback((code, name, hostFlag) => {
    const finalRoom = code || generateRoomCode();
    setRoomName(finalRoom);
    setDisplayName(name);
    setWantsToHost(hostFlag);
    setInRoom(true);

    const url = new URL(window.location.href);
    url.searchParams.set('room', finalRoom);
    window.history.replaceState({}, '', url);
  }, []);

  const wp = useWatchParty(inRoom ? roomName : null, displayName, wantsToHost);

  // ---- UI state ----
  const [urlInput, setUrlInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [camLightOn, setCamLightOn] = useState(false);
  const [camBrightness, setCamBrightness] = useState(85);
  const [camWarmth, setCamWarmth] = useState(25);
  const [camSize, setCamSize] = useState('md');

  const containerRef = useRef(null);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement && containerRef.current) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else if (document.fullscreenElement) {
      document.exitFullscreen();
    }
  }, []);

  // Track unread chat messages while the panel is closed
  const prevMsgCount = useRef(0);
  useEffect(() => {
    if (!chatOpen && wp.chatMessages.length > prevMsgCount.current) {
      setChatUnread((u) => u + (wp.chatMessages.length - prevMsgCount.current));
    }
    prevMsgCount.current = wp.chatMessages.length;
  }, [wp.chatMessages, chatOpen]);

  useEffect(() => {
    if (chatOpen) setChatUnread(0);
  }, [chatOpen]);

  // Keyboard shortcuts: Space to play/pause (host only), F for fullscreen
  useEffect(() => {
    const onKeyDown = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space' && wp.isHost) {
        e.preventDefault();
        wp.playing ? wp.actions.handlePause() : wp.actions.handlePlay();
      }
      if (e.key.toLowerCase() === 'f') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [wp.isHost, wp.playing, wp.actions.handlePlay, wp.actions.handlePause, toggleFullscreen]);

  // Three-tier fallback so "Invite" always does *something* useful instead of
  // silently failing: native share sheet on mobile, then the Clipboard API,
  // then a legacy execCommand copy for browsers/contexts that block it.
  // Returns true/false so the button can show real "Copied!" / failure state.
  const handleInvite = useCallback(async () => {
    const url = window.location.href;

    if (navigator.share && window.matchMedia('(max-width: 768px)').matches) {
      try {
        await navigator.share({ title: 'Join my Watch Party', url });
        return true;
      } catch {
        // User cancelled the share sheet, or it's unsupported — fall through.
      }
    }

    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        return true;
      } catch {
        // Clipboard permission denied (common on non-HTTPS/localhost) — fall through.
      }
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }, []);

  const handlePlayNow = useCallback(() => {
    if (!urlInput.trim()) return;
    wp.actions.playNow(urlInput.trim());
    setUrlInput('');
  }, [urlInput, wp.actions]);

  const handleAddToQueue = useCallback(() => {
    if (!urlInput.trim()) return;
    wp.actions.addToQueue(urlInput.trim());
    setUrlInput('');
  }, [urlInput, wp.actions]);

  if (!inRoom) {
    return <JoinScreen initialRoomCode={initialRoomCode} onJoin={handleJoin} />;
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col md:flex-row h-screen w-full bg-gray-50 dark:bg-black text-gray-900 dark:text-white overflow-hidden font-sans relative"
    >
      {/* MAIN COLUMN: controls, player, queue */}
      <div className="flex-1 flex flex-col p-3 sm:p-4 overflow-hidden min-w-0">
        <TopBar
          roomName={roomName}
          isHost={wp.isHost}
          connectionStatus={wp.connectionStatus}
          participantCount={wp.participants.length}
          onToggleParticipants={() => setParticipantsOpen((o) => !o)}
          onToggleChat={() => setChatOpen((o) => !o)}
          chatUnread={chatUnread}
          theme={theme}
          onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          isFullscreen={isFullscreen}
          onToggleFullscreen={toggleFullscreen}
          onInvite={handleInvite}
          camLightOn={camLightOn}
          onToggleCamLight={() => setCamLightOn((v) => !v)}
          urlInput={urlInput}
          setUrlInput={setUrlInput}
          onPlayNow={handlePlayNow}
          onAddToQueue={handleAddToQueue}
          currentVideo={wp.currentVideo}
          isViewer={!wp.isHost}
          onResync={wp.actions.resyncNow}
        />

        <div className="flex-1 relative mb-3 min-h-[200px]">
          <div className="absolute inset-0 bg-black rounded-xl overflow-hidden shadow-2xl">
            <ReactPlayer
              ref={wp.playerRef}
              url={wp.currentVideo}
              playing={wp.playing}
              controls
              config={{
                youtube: {
                  playerVars: {
                    fs: 0,
                    origin: window.location.origin,
                    enablejsapi: 1,
                    rel: 0,
                  },
                },
              }}
              width="100%"
              height="100%"
              progressInterval={2000}
              onReady={() => wp.actions.setIsReady(true)}
              onPlay={wp.actions.handlePlay}
              onPause={wp.actions.handlePause}
              onSeek={wp.actions.handleSeek}
              onProgress={wp.actions.handleProgress}
              onEnded={wp.actions.handleEnded}
            />
            <FloatingReactions reactions={wp.reactions} />
            <ReactionBar onSend={wp.actions.sendReaction} />
          </div>
        </div>

        <Playlist
          playlist={wp.playlist}
          isHost={wp.isHost}
          currentVideo={wp.currentVideo}
          onPlayItem={wp.actions.playFromQueue}
          onRemoveItem={wp.actions.removeFromQueue}
          onMoveItem={wp.actions.moveQueueItem}
        />
      </div>

      <CallWidget roomName={roomName} displayName={displayName} isFullscreen={isFullscreen} />

      <CamLight
        visible={camLightOn}
        onClose={() => setCamLightOn(false)}
        brightness={camBrightness}
        setBrightness={setCamBrightness}
        warmth={camWarmth}
        setWarmth={setCamWarmth}
        size={camSize}
        setSize={setCamSize}
      />

      <ChatPanel
        isOpen={chatOpen}
        onClose={() => setChatOpen(false)}
        messages={wp.chatMessages}
        onSend={wp.actions.sendChatMessage}
        myClientId={wp.myClientId}
      />

      <ParticipantsList
        isOpen={participantsOpen}
        onClose={() => setParticipantsOpen(false)}
        participants={wp.participants}
        myClientId={wp.myClientId}
        isHost={wp.isHost}
        onTransferHost={wp.actions.transferHost}
      />
    </div>
  );
}
