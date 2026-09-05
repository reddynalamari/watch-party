import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';

// Extract video ID from any Dailymotion URL
const getDailymotionId = (url) => {
  if (!url) return null;
  const patterns = [
    /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
    /dai\.ly\/([a-zA-Z0-9]+)/,
    /dailymotion\.com\/embed\/video\/([a-zA-Z0-9]+)/,
    /dailymotion\.com\/player\.html\?video=([a-zA-Z0-9]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

const SCRIPT_ID = 'dm-player-lib';
const SCRIPT_SRC = 'https://geo.dailymotion.com/libs/player.js';

let instanceCounter = 0;

const DailymotionPlayer = forwardRef(({ url, playing, onReady, onPlay, onPause, onSeek, onEnded }, ref) => {
  const containerRef = useRef(null);
  const playerRef = useRef(null);        // will store the player instance after creation
  // Stable per-instance container id (was previously recomputed on every
  // render, which could desync the id attribute from the selector used to
  // create the player).
  const containerIdRef = useRef(`dm-player-${++instanceCounter}`);
  const containerId = containerIdRef.current;
  const currentTimeRef = useRef(0);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);

  const videoId = getDailymotionId(url);

  // Keep the latest callbacks/playing value in refs so the player-creation
  // effect below never needs them in its dependency array. Parent
  // components frequently pass new inline function references on every
  // render (e.g. `onReady={() => ...}`), and previously those were direct
  // effect dependencies — causing the player to be destroyed and recreated
  // (losing playback position) on almost every re-render, which is what
  // was causing the sync issues.
  const onReadyRef = useRef(onReady);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);
  const onSeekRef = useRef(onSeek);
  const onEndedRef = useRef(onEnded);
  const playingRef = useRef(playing);
  onReadyRef.current = onReady;
  onPlayRef.current = onPlay;
  onPauseRef.current = onPause;
  onSeekRef.current = onSeek;
  onEndedRef.current = onEnded;
  playingRef.current = playing;

  // Load the library script once
  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) {
      setScriptLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => console.error('Failed to load Dailymotion library');
    document.body.appendChild(script);
  }, []);

  // Create player when script is loaded and container exists.
  // IMPORTANT: this only depends on `scriptLoaded` and `videoId` now, so it
  // recreates the player only when the actual video changes (or the script
  // finishes loading) — not on every play/pause toggle or every re-render
  // of the parent component.
  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !window.dailymotion) return;
    if (!videoId) return;

    let cancelled = false;

    // Destroy any previous player
    if (playerRef.current) {
      try { playerRef.current.destroy?.(); } catch {}
      playerRef.current = null;
      setPlayerReady(false);
    }
    currentTimeRef.current = 0;

    // Create player – returns a Promise
    window.dailymotion
      .createPlayer(`#${containerId}`, {
        video: videoId,
        params: {
          autoplay: playingRef.current ? 1 : 0,
          controls: 1,
          'api': 1,
          mute: 0,
        },
      })
      .then((player) => {
        if (cancelled) {
          try { player.destroy?.(); } catch {}
          return;
        }
        playerRef.current = player;
        setPlayerReady(true);

        // --- Listen to events ---
        // Use the event constants if available; fallback to string names
        const events = window.dailymotion.events || {};

        // Ready event
        player.on(events.VIDEO_READY || 'ready', () => {
          onReadyRef.current?.();
          // If playing is true, ensure playback starts (some browsers block autoplay)
          if (playingRef.current) {
            player.play().catch(() => {});
          }
        });

        // Play event
        player.on(events.VIDEO_PLAY || 'play', () => {
          onPlayRef.current?.();
        });

        // Pause event
        player.on(events.VIDEO_PAUSE || 'pause', () => {
          onPauseRef.current?.();
        });

        // Time update – track current time
        player.on(events.VIDEO_TIMEUPDATE || 'timeupdate', (state) => {
          if (state?.videoTime !== undefined) {
            currentTimeRef.current = state.videoTime;
          }
        });

        // Seek event – triggered when user seeks
        player.on(events.VIDEO_SEEK || 'seek', (state) => {
          if (state?.videoTime !== undefined) {
            currentTimeRef.current = state.videoTime;
          }
          onSeekRef.current?.();
        });

        // Ended event
        player.on(events.VIDEO_END || 'ended', () => {
          onEndedRef.current?.();
        });

        // If playing is true after creation, call play again (safety)
        if (playingRef.current) {
          setTimeout(() => {
            if (playerRef.current === player) {
              player.play().catch(() => {});
            }
          }, 100);
        }
      })
      .catch((err) => {
        console.error('Dailymotion player creation error:', err);
      });

    // Cleanup on unmount or video change
    return () => {
      cancelled = true;
      if (playerRef.current) {
        try { playerRef.current.destroy?.(); } catch {}
        playerRef.current = null;
        setPlayerReady(false);
      }
    };
  }, [scriptLoaded, videoId, containerId]);

  // Control playback when `playing` prop changes after player is ready.
  // This is the ONLY place a play/pause toggle should affect the player —
  // it must never recreate the player instance.
  useEffect(() => {
    if (!playerReady || !playerRef.current) return;
    const player = playerRef.current;
    if (playing) {
      player.play().catch(() => {});
    } else {
      player.pause().catch(() => {});
    }
  }, [playing, playerReady]);

  // Expose methods to parent (same as ReactPlayer)
  useImperativeHandle(ref, () => ({
    getCurrentTime: () => currentTimeRef.current || 0,
    seekTo: (seconds) => {
      if (playerReady && playerRef.current) {
        playerRef.current.seek(seconds).catch(() => {});
      }
    },
    play: () => {
      if (playerReady && playerRef.current) {
        playerRef.current.play().catch(() => {});
      }
    },
    pause: () => {
      if (playerReady && playerRef.current) {
        playerRef.current.pause().catch(() => {});
      }
    },
    getInternalPlayer: () => playerRef.current,
  }), [playerReady]);

  if (!videoId) {
    return (
      <div style={{ width: '100%', height: '100%', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        Invalid Dailymotion URL
      </div>
    );
  }

  return (
    <div
      id={containerId}
      ref={containerRef}
      style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
    />
  );
});

DailymotionPlayer.displayName = 'DailymotionPlayer';
export default DailymotionPlayer;