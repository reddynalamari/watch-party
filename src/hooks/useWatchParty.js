import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { parseMediaUrl, getClientId } from '../lib/utils';

const DEFAULT_VIDEO = 'https://www.youtube.com/watch?v=LXb3EKWsInQ';

export function useWatchParty(roomName, displayName, initialIsHost) {
  const [isHost, setIsHost] = useState(!!initialIsHost);
  const [currentVideo, setCurrentVideo] = useState(DEFAULT_VIDEO);
  const [playlist, setPlaylist] = useState([]);
  const [playing, setPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [reactions, setReactions] = useState([]);
  const [participants, setParticipants] = useState([]);
  // Starts as CONNECTING (not CLOSED) so the UI doesn't flash a false
  // "Disconnected" banner during the first normal second of joining.
  const [connectionStatus, setConnectionStatus] = useState('CONNECTING');

  const playerRef = useRef(null);
  const channelRef = useRef(null);
  const myClientId = useRef(getClientId());
  const joinedAtRef = useRef(Date.now());
  const lastHostStateRef = useRef(null);

  // Refs mirror the latest state so long-lived realtime callbacks (registered
  // once per room join) never read stale values from an old render's closure.
  const isHostRef = useRef(isHost);
  const currentVideoRef = useRef(currentVideo);
  const playlistRef = useRef(playlist);
  const playingRef = useRef(playing);
  const isReadyRef = useRef(isReady);
  const displayNameRef = useRef(displayName);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { currentVideoRef.current = currentVideo; }, [currentVideo]);
  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { isReadyRef.current = isReady; }, [isReady]);
  useEffect(() => { displayNameRef.current = displayName; }, [displayName]);

  const sendState = useCallback((overrides = {}) => {
    const channel = channelRef.current;
    if (!channel || !isHostRef.current) return;
    channel.send({
      type: 'broadcast',
      event: 'sync',
      payload: {
        currentVideo: currentVideoRef.current,
        playlist: playlistRef.current,
        playing: playingRef.current,
        time: playerRef.current ? playerRef.current.getCurrentTime() : 0,
        ...overrides,
      },
    });
  }, []);

  // ---- Join / leave the room's realtime channel ----
  useEffect(() => {
    if (!roomName) return undefined;

    setCurrentVideo(DEFAULT_VIDEO);
    setPlaylist([]);
    setPlaying(false);
    setIsReady(false);
    setChatMessages([]);
    setReactions([]);
    setParticipants([]);
    setIsHost(!!initialIsHost);
    setConnectionStatus('CONNECTING');
    joinedAtRef.current = Date.now();

    const channel = supabase.channel(`room_${roomName}`, {
      config: {
        broadcast: { self: false },
        presence: { key: myClientId.current },
      },
    });
    channelRef.current = channel;

    channel.on('broadcast', { event: 'sync' }, ({ payload }) => {
      if (isHostRef.current) return;
      lastHostStateRef.current = payload;

      if (payload.currentVideo && payload.currentVideo !== currentVideoRef.current) {
        setCurrentVideo(payload.currentVideo);
        setIsReady(false);
      }
      if (payload.playlist) setPlaylist(payload.playlist);
      setPlaying(!!payload.playing);

      const player = playerRef.current;
      if (player && isReadyRef.current && typeof payload.time === 'number') {
        const drift = Math.abs(player.getCurrentTime() - payload.time);
        if (drift > 2) player.seekTo(payload.time, 'seconds');
      }
    });

    channel.on('broadcast', { event: 'chat' }, ({ payload }) => {
      if (payload.clientId === myClientId.current) return;
      setChatMessages((prev) => [...prev, payload]);
    });

    channel.on('broadcast', { event: 'reaction' }, ({ payload }) => {
      setReactions((prev) => [...prev, payload]);
      setTimeout(() => setReactions((prev) => prev.filter((r) => r.id !== payload.id)), 2500);
    });

    channel.on('broadcast', { event: 'transfer_host' }, ({ payload }) => {
      if (payload.targetClientId === myClientId.current) {
        setIsHost(true);
        channel.track({ name: displayNameRef.current, isHost: true, joinedAt: joinedAtRef.current });
      } else if (isHostRef.current) {
        setIsHost(false);
        channel.track({ name: displayNameRef.current, isHost: false, joinedAt: joinedAtRef.current });
      }
    });

    // A newly-joined viewer immediately gets the current state instead of
    // waiting up to ~2s for the next heartbeat.
    channel.on('presence', { event: 'join' }, () => {
      if (isHostRef.current) sendState({});
    });

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const list = Object.entries(state).map(([clientId, metas]) => ({ clientId, ...metas[0] }));
      list.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
      setParticipants(list);

      // Automatic host failover: if the room has no one currently claiming to
      // be host (e.g. the host's tab closed), the earliest-joined remaining
      // participant silently takes over. Every client computes this the same
      // deterministic way, so there's no risk of two hosts appearing at once.
      const hostStillPresent = list.some((p) => p.isHost);
      if (!hostStillPresent && list.length > 0 && list[0].clientId === myClientId.current) {
        setIsHost(true);
        channel.track({ name: displayNameRef.current, isHost: true, joinedAt: joinedAtRef.current });
      }
    });

    channel.subscribe((status) => {
      setConnectionStatus(status);
      if (status === 'SUBSCRIBED') {
        channel.track({
          name: displayNameRef.current,
          isHost: isHostRef.current,
          joinedAt: joinedAtRef.current,
        });
      }
    });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  // ---- Host actions ----
  const playNow = useCallback((rawUrl) => {
    const url = parseMediaUrl(rawUrl);
    setCurrentVideo(url);
    setPlaying(true);
    setIsReady(false);
    sendState({ currentVideo: url, playing: true, time: 0 });
  }, [sendState]);

  const addToQueue = useCallback((rawUrl) => {
    const url = parseMediaUrl(rawUrl);
    const item = { id: crypto.randomUUID(), url };
    const next = [...playlistRef.current, item];
    setPlaylist(next);
    sendState({ playlist: next });
  }, [sendState]);

  const playFromQueue = useCallback((id) => {
    const queue = playlistRef.current;
    const item = queue.find((q) => q.id === id);
    if (!item) return;
    const rest = queue.filter((q) => q.id !== id);
    setCurrentVideo(item.url);
    setPlaylist(rest);
    setPlaying(true);
    setIsReady(false);
    sendState({ currentVideo: item.url, playlist: rest, playing: true, time: 0 });
  }, [sendState]);

  const removeFromQueue = useCallback((id) => {
    const next = playlistRef.current.filter((q) => q.id !== id);
    setPlaylist(next);
    sendState({ playlist: next });
  }, [sendState]);

  const moveQueueItem = useCallback((id, dir) => {
    const queue = [...playlistRef.current];
    const idx = queue.findIndex((q) => q.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= queue.length) return;
    [queue[idx], queue[swapIdx]] = [queue[swapIdx], queue[idx]];
    setPlaylist(queue);
    sendState({ playlist: queue });
  }, [sendState]);

  const handleEnded = useCallback(() => {
    if (!isHostRef.current) return;
    const queue = playlistRef.current;
    if (queue.length === 0) {
      setPlaying(false);
      sendState({ playing: false });
      return;
    }
    const [next, ...rest] = queue;
    setCurrentVideo(next.url);
    setPlaylist(rest);
    setPlaying(true);
    setIsReady(false);
    sendState({ currentVideo: next.url, playlist: rest, playing: true, time: 0 });
  }, [sendState]);

  const handlePlay = useCallback(() => {
    setPlaying(true);
    if (isHostRef.current) sendState({ playing: true });
  }, [sendState]);

  const handlePause = useCallback(() => {
    setPlaying(false);
    if (isHostRef.current) sendState({ playing: false });
  }, [sendState]);

  const handleSeek = useCallback(() => {
    if (isHostRef.current) sendState({});
  }, [sendState]);

  const handleProgress = useCallback(() => {
    if (isHostRef.current && isReadyRef.current) sendState({});
  }, [sendState]);

  // ---- Viewer action ----
  const resyncNow = useCallback(() => {
    const payload = lastHostStateRef.current;
    const player = playerRef.current;
    if (!payload || !player) return;
    if (typeof payload.time === 'number') player.seekTo(payload.time, 'seconds');
    setPlaying(!!payload.playing);
  }, []);

  // ---- Chat & reactions (anyone) ----
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

  // ---- Host handoff (anyone the host picks) ----
  const transferHost = useCallback((targetClientId) => {
    if (!isHostRef.current || !channelRef.current) return;
    channelRef.current.send({ type: 'broadcast', event: 'transfer_host', payload: { targetClientId } });
    setIsHost(false);
    channelRef.current.track({ name: displayNameRef.current, isHost: false, joinedAt: joinedAtRef.current });
  }, []);

  return {
    isHost,
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
      handleProgress,
      handleEnded,
      resyncNow,
      sendChatMessage,
      sendReaction,
      transferHost,
      setIsReady,
    },
  };
}
