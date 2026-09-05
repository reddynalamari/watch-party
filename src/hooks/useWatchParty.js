import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { parseMediaUrl, getClientId } from '../lib/utils';

const DEFAULT_VIDEO = 'https://www.youtube.com/watch?v=LXb3EKWsInQ';
const DRIFT_THRESHOLD = 0.5; // seconds – seek only when drift exceeds this

export function useWatchParty(roomName, displayName, initialIsHost) {
  // ----- Collaborative state refs -----
  const clockRef = useRef(0);
  const lastAppliedKeyRef = useRef('');
  const remoteCommandIdRef = useRef(null);
  const pendingStateRef = useRef(null);
  const hasReceivedInitialStateRef = useRef(false);
  const heartbeatIntervalRef = useRef(null);
  const isHeartbeatCorrectionRef = useRef(false);

  // ----- Room state (React state) -----
  const [currentVideo, setCurrentVideo] = useState(DEFAULT_VIDEO);
  const [playlist, setPlaylist] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING');

  const playerRef = useRef(null);
  const channelRef = useRef(null);
  const myClientId = useRef(getClientId());
  const joinedAtRef = useRef(Date.now());

  // Refs for latest state (for callbacks)
  const currentVideoRef = useRef(currentVideo);
  const playlistRef = useRef(playlist);
  const playingRef = useRef(playing);
  const isReadyRef = useRef(isReady);
  const displayNameRef = useRef(displayName);

  useEffect(() => { currentVideoRef.current = currentVideo; }, [currentVideo]);
  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { isReadyRef.current = isReady; }, [isReady]);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);

  // ----- Helper -----
  const getPlayerTime = useCallback(() => {
    const player = playerRef.current;
    if (!player || typeof player.getCurrentTime !== 'function') return 0;
    const time = player.getCurrentTime();
    return Number.isFinite(time) ? time : 0;
  }, []);

  // ----- Generate deterministic ordering key for a command -----
  const getCommandKey = (command) => {
    const clockStr = String(command.clock).padStart(12, '0');
    const sender = command.senderId || 'system';
    const cmdId = command.commandId || crypto.randomUUID();
    return `${clockStr}-${sender}-${cmdId}`;
  };

  // ----- Broadcast a command (any participant) -----
  const broadcastCommand = useCallback((action, payload = {}) => {
    const channel = channelRef.current;
    if (!channel) return;

    clockRef.current += 1;
    const command = {
      commandId: crypto.randomUUID(),
      senderId: myClientId.current,
      action,
      clock: clockRef.current,
      sentAt: Date.now(),
      ...payload,
    };

    lastAppliedKeyRef.current = getCommandKey(command);

    channel.send({
      type: 'broadcast',
      event: 'player_command',
      payload: command,
    });
  }, []);

  // ----- Apply incoming command (with ordering) -----
  const applyCommand = useCallback((command) => {
    const player = playerRef.current;
    if (!command) return;

    if (command.senderId === myClientId.current) return;

    if (command.clock > clockRef.current) {
      clockRef.current = command.clock + 1;
    } else {
      clockRef.current += 1;
    }

    const incomingKey = getCommandKey(command);
    if (incomingKey <= lastAppliedKeyRef.current) return;
    lastAppliedKeyRef.current = incomingKey;

    const isPlayerAction = ['play', 'pause', 'seek', 'change_video'].includes(command.action);
    if (isPlayerAction) {
      remoteCommandIdRef.current = command.commandId;
      setTimeout(() => {
        if (remoteCommandIdRef.current === command.commandId) {
          remoteCommandIdRef.current = null;
        }
      }, 1000);
    }

    switch (command.action) {
      case 'play':
        setPlaying(true);
        if (typeof command.time === 'number' && player && isReadyRef.current) {
          const networkDelay = command.sentAt ? Math.max(0, (Date.now() - command.sentAt) / 1000) : 0;
          const targetTime = command.time + networkDelay;
          const drift = Math.abs(player.getCurrentTime() - targetTime);
          if (drift > DRIFT_THRESHOLD) player.seekTo(targetTime, 'seconds');
        }
        break;

      case 'pause':
        setPlaying(false);
        if (typeof command.time === 'number' && player && isReadyRef.current) {
          const networkDelay = command.sentAt ? Math.max(0, (Date.now() - command.sentAt) / 1000) : 0;
          const targetTime = command.time + networkDelay;
          const drift = Math.abs(player.getCurrentTime() - targetTime);
          if (drift > DRIFT_THRESHOLD) player.seekTo(targetTime, 'seconds');
        }
        break;

      case 'seek':
        if (typeof command.time === 'number' && player && isReadyRef.current) {
          const networkDelay = command.sentAt ? Math.max(0, (Date.now() - command.sentAt) / 1000) : 0;
          const targetTime = command.time + networkDelay;
          player.seekTo(targetTime, 'seconds');
        }
        break;

      case 'change_video': {
        const newUrl = command.currentVideo;
        if (newUrl && newUrl !== currentVideoRef.current) {
          currentVideoRef.current = newUrl;
          setCurrentVideo(newUrl);
          isReadyRef.current = false;
          setIsReady(false);
          pendingStateRef.current = null;
        }
        const networkDelay = command.sentAt ? Math.max(0, (Date.now() - command.sentAt) / 1000) : 0;
        const targetTime = typeof command.time === 'number'
          ? command.time + (command.playing ? networkDelay : 0)
          : null;
        pendingStateRef.current = {
          time: targetTime,
          playing: command.playing !== false,
        };
        if (!player || !isReadyRef.current) {
          setPlaying(pendingStateRef.current.playing);
        } else {
          const { time, playing: shouldPlay } = pendingStateRef.current;
          if (typeof time === 'number') player.seekTo(time, 'seconds');
          setPlaying(shouldPlay);
          pendingStateRef.current = null;
        }
        break;
      }

      case 'add_item': {
        const item = command.item;
        if (item) {
          const next = [...playlistRef.current, item];
          playlistRef.current = next;
          setPlaylist(next);
        }
        break;
      }

      case 'remove_item': {
        const id = command.itemId;
        if (id) {
          const next = playlistRef.current.filter((q) => q.id !== id);
          playlistRef.current = next;
          setPlaylist(next);
        }
        break;
      }

      case 'move_item': {
        const { id, direction } = command;
        const queue = [...playlistRef.current];
        const idx = queue.findIndex((q) => q.id === id);
        const swapIdx = idx + direction;
        if (idx >= 0 && swapIdx >= 0 && swapIdx < queue.length) {
          [queue[idx], queue[swapIdx]] = [queue[swapIdx], queue[idx]];
          playlistRef.current = queue;
          setPlaylist(queue);
        }
        break;
      }

      case 'set_state': {
        if (Array.isArray(command.playlist)) {
          playlistRef.current = command.playlist;
          setPlaylist(command.playlist);
        }

        const isNewVideo = command.currentVideo && command.currentVideo !== currentVideoRef.current;
        if (isNewVideo) {
          currentVideoRef.current = command.currentVideo;
          setCurrentVideo(command.currentVideo);
          isReadyRef.current = false;
          setIsReady(false);
          const networkDelay = command.sentAt ? Math.max(0, (Date.now() - command.sentAt) / 1000) : 0;
          pendingStateRef.current = {
            time: typeof command.time === 'number'
              ? command.time + (command.playing ? networkDelay : 0)
              : 0,
            playing: !!command.playing,
          };
          break;
        }

        if (typeof command.playing === 'boolean') {
          setPlaying(command.playing);
        }
        if (typeof command.time === 'number' && player && isReadyRef.current) {
          const networkDelay = command.sentAt ? Math.max(0, (Date.now() - command.sentAt) / 1000) : 0;
          const targetTime = command.time + (command.playing ? networkDelay : 0);
          const drift = Math.abs(player.getCurrentTime() - targetTime);
          if (drift > DRIFT_THRESHOLD) player.seekTo(targetTime, 'seconds');
        }
        break;
      }

      default:
        break;
    }
  }, []);

  // ----- Apply pending state when player becomes ready (for video changes) -----
  useEffect(() => {
    if (!isReady || !pendingStateRef.current) return;
    const { time, playing: shouldPlay } = pendingStateRef.current;
    const player = playerRef.current;
    if (!player) return;
    if (typeof time === 'number') player.seekTo(time, 'seconds');
    setPlaying(shouldPlay);
    pendingStateRef.current = null;
  }, [isReady]);

  // ----- Heartbeat (broadcast current position) -----
  const broadcastHeartbeat = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !isReadyRef.current || !playingRef.current) return;

    channel.send({
      type: 'broadcast',
      event: 'player_heartbeat',
      payload: {
        senderId: myClientId.current,
        currentVideo: currentVideoRef.current,
        playing: true,
        time: getPlayerTime(),
        sentAt: Date.now(),
      },
    });
  }, [getPlayerTime]);

  // ----- Start/stop heartbeat interval -----
  useEffect(() => {
    if (playing && isReady) {
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = setInterval(broadcastHeartbeat, 1000);
    } else {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    }
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
  }, [playing, isReady, broadcastHeartbeat]);

  // ----- Request sync (new participant) -----
  const requestSync = useCallback(() => {
    const channel = channelRef.current;
    if (!channel) return;
    channel.send({
      type: 'broadcast',
      event: 'sync_request',
      payload: { clientId: myClientId.current, requestedAt: Date.now() },
    });
  }, []);

  // ----- Main room effect -----
  useEffect(() => {
    if (!roomName) return undefined;

    setCurrentVideo(DEFAULT_VIDEO);
    setPlaylist([]);
    setPlaying(false);
    setIsReady(false);
    setChatMessages([]);
    setReactions([]);
    setParticipants([]);
    setConnectionStatus('CONNECTING');
    joinedAtRef.current = Date.now();
    pendingStateRef.current = null;
    remoteCommandIdRef.current = null;
    clockRef.current = 0;
    lastAppliedKeyRef.current = '';
    hasReceivedInitialStateRef.current = false;
    isHeartbeatCorrectionRef.current = false;
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    const channel = supabase.channel(`room_${roomName}`, {
      config: { broadcast: { self: false }, presence: { key: myClientId.current } },
    });
    channelRef.current = channel;

    // ---- Command listener ----
    channel.on('broadcast', { event: 'player_command' }, ({ payload }) => {
      applyCommand(payload);
    });

    // ---- Heartbeat listener (drift correction) ----
    channel.on('broadcast', { event: 'player_heartbeat' }, ({ payload }) => {
      if (payload.senderId === myClientId.current) return;
      const player = playerRef.current;
      if (!player || !isReadyRef.current) return;

      // Latency compensation
      const networkDelay = payload.sentAt ? Math.max(0, (Date.now() - payload.sentAt) / 1000) : 0;
      const targetTime = payload.time + networkDelay;
      const currentTime = player.getCurrentTime();
      const drift = Math.abs(currentTime - targetTime);

      if (drift > DRIFT_THRESHOLD) {
        // Seek silently – do not broadcast a seek command
        isHeartbeatCorrectionRef.current = true;
        player.seekTo(targetTime, 'seconds');
        // The seek will trigger onSeek; we'll handle it below.
      }
    });

    // ---- Sync request: respond with current state ----
    channel.on('broadcast', { event: 'sync_request' }, ({ payload }) => {
      const requester = payload?.clientId;
      if (requester === myClientId.current) return;
      const ch = channelRef.current;
      if (!ch) return;
      const stateCommand = {
        commandId: crypto.randomUUID(),
        senderId: myClientId.current,
        action: 'set_state',
        clock: clockRef.current,
        sentAt: Date.now(),
        currentVideo: currentVideoRef.current,
        playlist: playlistRef.current,
        playing: playingRef.current,
        time: getPlayerTime(),
        targetClientId: requester,
      };
      ch.send({
        type: 'broadcast',
        event: 'full_state',
        payload: stateCommand,
      });
    });

    // ---- Full state (receiver) ----
    channel.on('broadcast', { event: 'full_state' }, ({ payload }) => {
      if (payload.targetClientId && payload.targetClientId !== myClientId.current) return;
      if (payload.action !== 'set_state') payload.action = 'set_state';
      if (payload.clock > clockRef.current) {
        clockRef.current = payload.clock + 1;
      }
      applyCommand(payload);
      hasReceivedInitialStateRef.current = true;
    });

    // ---- Chat & reactions ----
    channel.on('broadcast', { event: 'chat' }, ({ payload }) => {
      if (payload.clientId === myClientId.current) return;
      setChatMessages((prev) => [...prev, payload]);
    });

    channel.on('broadcast', { event: 'reaction' }, ({ payload }) => {
      setReactions((prev) => [...prev, payload]);
      setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== payload.id)), 2500);
    });

    // ---- Presence ----
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const list = Object.entries(state).map(([clientId, metas]) => ({
        clientId,
        ...metas[0],
      }));
      list.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
      setParticipants(list);
    });

    // ---- Subscribe ----
    channel.subscribe((status) => {
      setConnectionStatus(status);
      if (status === 'SUBSCRIBED') {
        channel.track({
          name: displayNameRef.current,
          joinedAt: joinedAtRef.current,
        });
        setTimeout(() => {
          if (!hasReceivedInitialStateRef.current) {
            requestSync();
          }
        }, 300);
      }
    });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  // ----- Player actions (local) -----
  const playNow = useCallback((rawUrl) => {
    const url = parseMediaUrl(rawUrl);
    currentVideoRef.current = url;
    setCurrentVideo(url);
    setPlaying(true);
    setIsReady(false);
    isReadyRef.current = false;
    pendingStateRef.current = null;
    broadcastCommand('change_video', { currentVideo: url, time: 0, playing: true });
  }, [broadcastCommand]);

  const addToQueue = useCallback((rawUrl) => {
    const url = parseMediaUrl(rawUrl);
    const item = { id: crypto.randomUUID(), url };
    broadcastCommand('add_item', { item });
  }, [broadcastCommand]);

  const playFromQueue = useCallback((id) => {
    const queue = playlistRef.current;
    const item = queue.find((q) => q.id === id);
    if (!item) return;
    const rest = queue.filter((q) => q.id !== id);
    playlistRef.current = rest;
    setPlaylist(rest);
    setCurrentVideo(item.url);
    setPlaying(true);
    setIsReady(false);
    isReadyRef.current = false;
    pendingStateRef.current = null;
    broadcastCommand('change_video', { currentVideo: item.url, playlist: rest, time: 0, playing: true });
  }, [broadcastCommand]);

  const removeFromQueue = useCallback((id) => {
    broadcastCommand('remove_item', { itemId: id });
  }, [broadcastCommand]);

  const moveQueueItem = useCallback((id, direction) => {
    broadcastCommand('move_item', { id, direction });
  }, [broadcastCommand]);

  // ----- Player event callbacks (local) -----
  const handleEnded = useCallback(() => {
    if (remoteCommandIdRef.current) return;
    const queue = playlistRef.current;
    if (queue.length === 0) {
      setPlaying(false);
      broadcastCommand('pause', { time: getPlayerTime(), playing: false });
      return;
    }
    const [next, ...rest] = queue;
    playlistRef.current = rest;
    setPlaylist(rest);
    setCurrentVideo(next.url);
    setPlaying(true);
    setIsReady(false);
    isReadyRef.current = false;
    pendingStateRef.current = null;
    broadcastCommand('change_video', { currentVideo: next.url, playlist: rest, time: 0, playing: true });
  }, [broadcastCommand, getPlayerTime]);

  const handlePlay = useCallback(() => {
    setPlaying(true);
    if (remoteCommandIdRef.current) {
      remoteCommandIdRef.current = null;
      return;
    }
    broadcastCommand('play', { time: getPlayerTime(), playing: true });
  }, [broadcastCommand, getPlayerTime]);

  const handlePause = useCallback(() => {
    setPlaying(false);
    if (remoteCommandIdRef.current) {
      remoteCommandIdRef.current = null;
      return;
    }
    broadcastCommand('pause', { time: getPlayerTime(), playing: false });
  }, [broadcastCommand, getPlayerTime]);

  const handleSeek = useCallback(() => {
    // If this seek was triggered by a heartbeat correction, do not broadcast.
    if (isHeartbeatCorrectionRef.current) {
      isHeartbeatCorrectionRef.current = false;
      return;
    }
    if (remoteCommandIdRef.current) {
      remoteCommandIdRef.current = null;
      return;
    }
    broadcastCommand('seek', { time: getPlayerTime(), playing: playingRef.current });
  }, [broadcastCommand, getPlayerTime]);

  const resyncNow = useCallback(() => {
    requestSync();
  }, [requestSync]);

  // ----- Chat & reactions -----
  const sendChatMessage = useCallback((text) => {
    if (!text.trim() || !channelRef.current) return;
    const msg = {
      id: crypto.randomUUID(),
      clientId: myClientId.current,
      sender: displayNameRef.current,
      text: text.trim(),
      ts: Date.now(),
    };
    setChatMessages((prev) => [...prev, msg]);
    channelRef.current.send({ type: 'broadcast', event: 'chat', payload: msg });
  }, []);

  const sendReaction = useCallback((emoji) => {
    if (!channelRef.current) return;
    const r = { id: crypto.randomUUID(), emoji, x: Math.random() * 80 + 10 };
    setReactions((prev) => [...prev, r]);
    setTimeout(() => setReactions((prev) => prev.filter((x) => x.id !== r.id)), 2500);
    channelRef.current.send({ type: 'broadcast', event: 'reaction', payload: r });
  }, []);

  // ----- Return -----
  return {
    currentVideo,
    playlist,
    playing,
    isReady,
    chatMessages,
    reactions,
    participants,
    connectionStatus,
    playerRef,
    myClientId: myClientId.current,
    actions: {
      playNow,
      addToQueue,
      playFromQueue,
      removeFromQueue,
      moveQueueItem,
      handlePlay,
      handlePause,
      handleSeek,
      handleEnded,
      resyncNow,
      sendChatMessage,
      sendReaction,
      setIsReady,
    },
  };
}