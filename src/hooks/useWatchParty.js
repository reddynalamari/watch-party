import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { parseMediaUrl, getClientId } from '../lib/utils';

const DEFAULT_VIDEO = 'https://www.youtube.com/watch?v=LXb3EKWsInQ';

export function useWatchParty(roomName, displayName, initialIsHost) {
  // ----- Protocol refs -----
  const syncSeqRef = useRef(0);
  const lastReceivedSeqRef = useRef(0);
  const remoteActionRef = useRef(null);
  const pendingStateRef = useRef(null);
  const hasReceivedFullStateRef = useRef(false);

  // ----- State (isHost will be overridden by presence) -----
  const [isHost, setIsHost] = useState(false); // start as viewer, presence will decide
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

  // Refs
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

  // ----- Helper -----
  const getPlayerTime = useCallback(() => {
    const player = playerRef.current;
    if (!player || typeof player.getCurrentTime !== 'function') return 0;
    const time = player.getCurrentTime();
    return Number.isFinite(time) ? time : 0;
  }, []);

  // ----- Broadcast (only if host) -----
  const broadcastPlayerControl = useCallback((action, timeOverride, extra = {}) => {
    const channel = channelRef.current;
    if (!channel || !isHostRef.current) return;
    const time = typeof timeOverride === 'number' ? timeOverride : getPlayerTime();
    const seq = ++syncSeqRef.current;
    channel.send({
      type: 'broadcast',
      event: 'player_control',
      payload: {
        action,
        time,
        playing: action === 'play' || action === 'change_video',
        currentVideo: currentVideoRef.current,
        seq,
        sentAt: Date.now(),
        ...extra,
      },
    });
  }, [getPlayerTime]);

  const broadcastPlayerState = useCallback(() => {
    const channel = channelRef.current;
    if (!channel || !isHostRef.current || !isReadyRef.current) return;
    channel.send({
      type: 'broadcast',
      event: 'player_heartbeat',
      payload: {
        currentVideo: currentVideoRef.current,
        playing: playingRef.current,
        time: getPlayerTime(),
        sentAt: Date.now(),
      },
    });
  }, [getPlayerTime]);

  // ----- Apply remote state (viewer only) -----
  const applyRemoteState = useCallback((payload) => {
    const player = playerRef.current;
    if (!payload) return;

    if (payload.seq !== undefined && typeof payload.seq === 'number') {
      if (payload.seq < lastReceivedSeqRef.current) return;
      lastReceivedSeqRef.current = payload.seq;
    }

    const isNewVideo = payload.currentVideo && payload.currentVideo !== currentVideoRef.current;
    const isChangeVideo = payload.action === 'change_video';

    if (isNewVideo || isChangeVideo) {
      if (isNewVideo) {
        currentVideoRef.current = payload.currentVideo;
        setCurrentVideo(payload.currentVideo);
        isReadyRef.current = false;
        setIsReady(false);
        pendingStateRef.current = null;
      }

      const networkDelay = typeof payload.sentAt === 'number'
        ? Math.max(0, (Date.now() - payload.sentAt) / 1000)
        : 0;
      const targetTime = typeof payload.time === 'number'
        ? payload.time + (payload.playing ? networkDelay : 0)
        : null;
      pendingStateRef.current = {
        time: targetTime,
        playing: payload.playing !== false,
      };

      if (!player || !isReadyRef.current) {
        setPlaying(pendingStateRef.current.playing);
        return;
      }

      if (!isNewVideo && player) {
        const { time, playing: shouldPlay } = pendingStateRef.current;
        remoteActionRef.current = 'change_video';
        if (typeof time === 'number') player.seekTo(time, 'seconds');
        setPlaying(shouldPlay);
        pendingStateRef.current = null;
        setTimeout(() => { remoteActionRef.current = null; }, 1000);
        return;
      }
      return;
    }

    if (Array.isArray(payload.playlist)) {
      playlistRef.current = payload.playlist;
      setPlaylist(payload.playlist);
    }

    if (!player || !isReadyRef.current) {
      const networkDelay = typeof payload.sentAt === 'number'
        ? Math.max(0, (Date.now() - payload.sentAt) / 1000)
        : 0;
      pendingStateRef.current = {
        time: typeof payload.time === 'number'
          ? payload.time + (payload.playing ? networkDelay : 0)
          : null,
        playing: !!payload.playing,
      };
      setPlaying(!!payload.playing);
      return;
    }

    const networkDelay = typeof payload.sentAt === 'number'
      ? Math.max(0, (Date.now() - payload.sentAt) / 1000)
      : 0;
    const targetTime = typeof payload.time === 'number'
      ? payload.time + (payload.playing ? networkDelay : 0)
      : null;

    if (payload.action) {
      remoteActionRef.current = payload.action;
      setTimeout(() => {
        if (remoteActionRef.current === payload.action) remoteActionRef.current = null;
      }, 1000);
    }

    if (typeof targetTime === 'number' && typeof player.getCurrentTime === 'function') {
      const currentTime = player.getCurrentTime();
      const drift = Math.abs(currentTime - targetTime);
      if (drift > 0.35) player.seekTo(targetTime, 'seconds');
    }

    let nextPlaying = !!payload.playing;
    if (payload.action === 'pause') nextPlaying = false;
    else if (payload.action === 'play') nextPlaying = true;
    setPlaying(nextPlaying);
  }, []);

  // ----- Request sync (viewer) -----
  const requestSync = useCallback((attempt = 1) => {
    const channel = channelRef.current;
    if (!channel || isHostRef.current) return;
    if (hasReceivedFullStateRef.current) return;
    channel.send({
      type: 'broadcast',
      event: 'sync_request',
      payload: { clientId: myClientId.current },
    });
    if (attempt < 3) {
      const delays = [300, 1000, 2500];
      setTimeout(() => requestSync(attempt + 1), delays[attempt - 1] || 2500);
    }
  }, []);

  // ----- Apply pending state when ready -----
  useEffect(() => {
    if (!isReady || !pendingStateRef.current) return;
    const { time, playing: shouldPlay } = pendingStateRef.current;
    const player = playerRef.current;
    if (!player) return;
    remoteActionRef.current = 'change_video';
    setTimeout(() => { remoteActionRef.current = null; }, 1000);
    if (typeof time === 'number') player.seekTo(time, 'seconds');
    setPlaying(shouldPlay);
    pendingStateRef.current = null;
  }, [isReady]);

  // ----- Main room effect -----
  useEffect(() => {
    if (!roomName) return undefined;

    // Reset state
    setCurrentVideo(DEFAULT_VIDEO);
    setPlaylist([]);
    setPlaying(false);
    setIsReady(false);
    setChatMessages([]);
    setReactions([]);
    setParticipants([]);
    setIsHost(false); // start as viewer; presence will decide
    setConnectionStatus('CONNECTING');
    joinedAtRef.current = Date.now();
    pendingStateRef.current = null;
    remoteActionRef.current = null;
    syncSeqRef.current = 0;
    lastReceivedSeqRef.current = 0;
    hasReceivedFullStateRef.current = false;

    const channel = supabase.channel(`room_${roomName}`, {
      config: { broadcast: { self: false }, presence: { key: myClientId.current } },
    });
    channelRef.current = channel;

    // ----- Listeners (unchanged) -----
    channel.on('broadcast', { event: 'player_control' }, ({ payload }) => {
      if (isHostRef.current) return;
      applyRemoteState(payload);
    });

    channel.on('broadcast', { event: 'player_heartbeat' }, ({ payload }) => {
      if (isHostRef.current) return;
      applyRemoteState(payload);
    });

    channel.on('broadcast', { event: 'sync_request' }, ({ payload }) => {
      if (!isHostRef.current) return;
      const requester = payload?.clientId;
      const ch = channelRef.current;
      if (!ch) return;
      ch.send({
        type: 'broadcast',
        event: 'full_state',
        payload: {
          currentVideo: currentVideoRef.current,
          playlist: playlistRef.current,
          playing: playingRef.current,
          time: getPlayerTime(),
          sentAt: Date.now(),
          seq: syncSeqRef.current,
          targetClientId: requester,
        },
      });
    });

    channel.on('broadcast', { event: 'full_state' }, ({ payload }) => {
      if (isHostRef.current) return;
      if (payload.targetClientId && payload.targetClientId !== myClientId.current) return;
      hasReceivedFullStateRef.current = true;
      applyRemoteState(payload);
    });

    channel.on('broadcast', { event: 'queue_update' }, ({ payload }) => {
      if (isHostRef.current) return;
      if (!Array.isArray(payload?.playlist)) return;
      playlistRef.current = payload.playlist;
      setPlaylist(payload.playlist);
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
      // Explicit transfer – we accept it and update our own isHost
      if (payload.targetClientId === myClientId.current) {
        setIsHost(true);
        channel.track({ name: displayNameRef.current, isHost: true, joinedAt: joinedAtRef.current });
        // Broadcast full state after becoming host
        setTimeout(() => {
          if (isHostRef.current) {
            const ch = channelRef.current;
            if (ch) {
              ch.send({
                type: 'broadcast',
                event: 'full_state',
                payload: {
                  currentVideo: currentVideoRef.current,
                  playlist: playlistRef.current,
                  playing: playingRef.current,
                  time: getPlayerTime(),
                  sentAt: Date.now(),
                  seq: syncSeqRef.current,
                },
              });
            }
          }
        }, 200);
      } else if (isHostRef.current) {
        // We are the current host and we transferred away
        setIsHost(false);
        channel.track({ name: displayNameRef.current, isHost: false, joinedAt: joinedAtRef.current });
      }
    });

    // ----- Presence: host election and failover -----
    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const list = Object.entries(state).map(([clientId, metas]) => ({
        clientId,
        ...metas[0],
      }));

      // Deterministic ordering: earliest joinedAt wins; if two participants
      // somehow share the exact same timestamp, break the tie on clientId so
      // every client computes the same ordering.
      const byJoinOrder = (a, b) => {
        const timeDiff = (a.joinedAt || 0) - (b.joinedAt || 0);
        if (timeDiff !== 0) return timeDiff;
        return String(a.clientId).localeCompare(String(b.clientId));
      };

      list.sort(byJoinOrder);
      setParticipants(list);

      // ----- Canonical host election -----
      // 1. Find all who claim to be host
      const hosts = list.filter((p) => p.isHost === true);

      let electedHostId = null;
      if (hosts.length === 1) {
        // Exactly one host – keep it
        electedHostId = hosts[0].clientId;
      } else if (hosts.length > 1) {
        // Conflict: multiple hosts – elect the one with the earliest joinedAt
        hosts.sort(byJoinOrder);
        electedHostId = hosts[0].clientId;
        // Demote all other hosts
        for (const h of hosts.slice(1)) {
          // We only need to demote if that client is the current one (we can't force others)
          // But we'll update our own state and track accordingly.
        }
      } else {
        // No host – elect the earliest participant overall
        if (list.length > 0) {
          electedHostId = list[0].clientId;
        }
      }

      // Now determine if *this* client is the elected host
      const amIHost = (electedHostId === myClientId.current);

      const hostChanged = isHostRef.current !== amIHost;

      if (hostChanged) {
        // Update the ref immediately (synchronously), so the check below —
        // and any other code running later in this same tick — sees the new
        // host status right away instead of waiting for the isHost -> isHostRef
        // useEffect to run on the next render.
        isHostRef.current = amIHost;
        setIsHost(amIHost);
        // Update our presence metadata to reflect the correct host status
        channel.track({
          name: displayNameRef.current,
          isHost: amIHost,
          joinedAt: joinedAtRef.current,
        });
      }

      // If we were demoted from host, we might need to request a sync
      if (!amIHost && !hasReceivedFullStateRef.current) {
        // Request full state from the new host
        requestSync(1);
      }

      // If we *just* became host, broadcast the authoritative state to others.
      if (amIHost && hostChanged) {
        setTimeout(() => {
          const ch = channelRef.current;
          if (ch && isHostRef.current) {
            ch.send({
              type: 'broadcast',
              event: 'full_state',
              payload: {
                currentVideo: currentVideoRef.current,
                playlist: playlistRef.current,
                playing: playingRef.current,
                time: getPlayerTime(),
                sentAt: Date.now(),
                seq: syncSeqRef.current,
              },
            });
          }
        }, 200);
      }
    });

    // ----- Subscribe -----
    channel.subscribe((status) => {
      setConnectionStatus(status);
      if (status === 'SUBSCRIBED') {
        // Track our presence – initial host status is false, will be corrected by presence sync
        channel.track({
          name: displayNameRef.current,
          isHost: false, // start as viewer, presence will decide
          joinedAt: joinedAtRef.current,
        });
        // If we really wanted to be host (initialIsHost), presence sync will promote us if we are earliest
        // Otherwise, we'll be a viewer.
        // Request sync if we are not host after election
        // The presence sync will fire shortly after subscription, so we can rely on that.
      }
    });

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName]);

  // ----- Heartbeat (host only) -----
  useEffect(() => {
    if (!isHost) return undefined;
    const interval = setInterval(() => {
      if (playingRef.current && isReadyRef.current) broadcastPlayerState();
    }, 1000);
    return () => clearInterval(interval);
  }, [isHost, broadcastPlayerState]);

  // ----- Host actions (unchanged) -----
  const playNow = useCallback((rawUrl) => {
    const url = parseMediaUrl(rawUrl);
    currentVideoRef.current = url;
    playingRef.current = true;
    setCurrentVideo(url);
    setPlaying(true);
    setIsReady(false);
    isReadyRef.current = false;
    pendingStateRef.current = null;
    broadcastPlayerControl('change_video', 0, { currentVideo: url });
  }, [broadcastPlayerControl]);

  const addToQueue = useCallback((rawUrl) => {
    const url = parseMediaUrl(rawUrl);
    const item = { id: crypto.randomUUID(), url };
    const next = [...playlistRef.current, item];
    setPlaylist(next);
    playlistRef.current = next;
    const channel = channelRef.current;
    if (channel && isHostRef.current) {
      channel.send({ type: 'broadcast', event: 'queue_update', payload: { playlist: next } });
    }
  }, []);

  const playFromQueue = useCallback((id) => {
    const queue = playlistRef.current;
    const item = queue.find((q) => q.id === id);
    if (!item) return;
    const rest = queue.filter((q) => q.id !== id);
    currentVideoRef.current = item.url;
    playlistRef.current = rest;
    setCurrentVideo(item.url);
    setPlaylist(rest);
    setPlaying(true);
    setIsReady(false);
    isReadyRef.current = false;
    pendingStateRef.current = null;
    broadcastPlayerControl('change_video', 0, { currentVideo: item.url, playlist: rest });
  }, [broadcastPlayerControl]);

  const removeFromQueue = useCallback((id) => {
    const next = playlistRef.current.filter((q) => q.id !== id);
    setPlaylist(next);
    playlistRef.current = next;
    const channel = channelRef.current;
    if (channel && isHostRef.current) {
      channel.send({ type: 'broadcast', event: 'queue_update', payload: { playlist: next } });
    }
  }, []);

  const moveQueueItem = useCallback((id, dir) => {
    const queue = [...playlistRef.current];
    const idx = queue.findIndex((q) => q.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= queue.length) return;
    [queue[idx], queue[swapIdx]] = [queue[swapIdx], queue[idx]];
    setPlaylist(queue);
    playlistRef.current = queue;
    const channel = channelRef.current;
    if (channel && isHostRef.current) {
      channel.send({ type: 'broadcast', event: 'queue_update', payload: { playlist: queue } });
    }
  }, []);

  const handleEnded = useCallback(() => {
    if (!isHostRef.current) return;
    if (remoteActionRef.current === 'change_video') return;
    const queue = playlistRef.current;
    if (queue.length === 0) {
      setPlaying(false);
      broadcastPlayerControl('pause', getPlayerTime());
      return;
    }
    const [next, ...rest] = queue;
    currentVideoRef.current = next.url;
    playlistRef.current = rest;
    setCurrentVideo(next.url);
    setPlaylist(rest);
    setPlaying(true);
    setIsReady(false);
    isReadyRef.current = false;
    pendingStateRef.current = null;
    broadcastPlayerControl('change_video', 0, { currentVideo: next.url, playlist: rest });
  }, [broadcastPlayerControl, getPlayerTime]);

  const handlePlay = useCallback(() => {
    setPlaying(true);
    if (!isHostRef.current) return;
    if (remoteActionRef.current === 'play') {
      remoteActionRef.current = null;
      return;
    }
    broadcastPlayerControl('play');
  }, [broadcastPlayerControl]);

  const handlePause = useCallback(() => {
    setPlaying(false);
    if (!isHostRef.current) return;
    if (remoteActionRef.current === 'pause') {
      remoteActionRef.current = null;
      return;
    }
    broadcastPlayerControl('pause');
  }, [broadcastPlayerControl]);

  const handleSeek = useCallback(() => {
    if (!isHostRef.current) return;
    if (remoteActionRef.current === 'seek' || remoteActionRef.current === 'change_video') {
      remoteActionRef.current = null;
      return;
    }
    broadcastPlayerControl('seek');
  }, [broadcastPlayerControl]);

  const resyncNow = useCallback(() => {
    if (!isHostRef.current) {
      requestSync(1);
    } else {
      const channel = channelRef.current;
      if (channel) {
        channel.send({
          type: 'broadcast',
          event: 'full_state',
          payload: {
            currentVideo: currentVideoRef.current,
            playlist: playlistRef.current,
            playing: playingRef.current,
            time: getPlayerTime(),
            sentAt: Date.now(),
            seq: syncSeqRef.current,
          },
        });
      }
    }
  }, [requestSync, getPlayerTime]);

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

  const transferHost = useCallback((targetClientId) => {
    if (!isHostRef.current || !channelRef.current) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'transfer_host',
      payload: { targetClientId },
    });
    setIsHost(false);
    channelRef.current.track({
      name: displayNameRef.current,
      isHost: false,
      joinedAt: joinedAtRef.current,
    });
  }, []);

  // ----- Return -----
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
      handleEnded,
      resyncNow,
      sendChatMessage,
      sendReaction,
      transferHost,
      setIsReady,
    },
  };
}