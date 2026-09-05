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
  const containerId = `dm-player-${++instanceCounter}`;
  const currentTimeRef = useRef(0);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);

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

  // Create player when script is loaded and container exists
  useEffect(() => {
    if (!scriptLoaded || !containerRef.current || !window.dailymotion) return;

    const videoId = getDailymotionId(url);
    if (!videoId) return;

    // Destroy any previous player
    if (playerRef.current) {
      try { playerRef.current.destroy?.(); } catch {}
      playerRef.current = null;
      setPlayerReady(false);
    }

    // Create player – returns a Promise
    window.dailymotion
      .createPlayer(`#${containerId}`, {
        video: videoId,
        params: {
          autoplay: playing ? 1 : 0,
          controls: 1,
          'api': 1,
          mute: 0,
        },
      })
      .then((player) => {
        playerRef.current = player;
        setPlayerReady(true);

        // --- Listen to events ---
        // Use the event constants if available; fallback to string names
        const events = window.dailymotion.events || {};

        // Ready event
        player.on(events.VIDEO_READY || 'ready', () => {
          onReady?.();
          // If playing is true, ensure playback starts (some browsers block autoplay)
          if (playing) {
            player.play().catch(() => {});
          }
        });

        // Play event
        player.on(events.VIDEO_PLAY || 'play', () => {
          onPlay?.();
        });

        // Pause event
        player.on(events.VIDEO_PAUSE || 'pause', () => {
          onPause?.();
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
          onSeek?.();
        });

        // Ended event
        player.on(events.VIDEO_END || 'ended', () => {
          onEnded?.();
        });

        // If playing is true after creation, call play again (safety)
        if (playing) {
          setTimeout(() => {
            if (playerRef.current) {
              playerRef.current.play().catch(() => {});
            }
          }, 100);
        }
      })
      .catch((err) => {
        console.error('Dailymotion player creation error:', err);
      });

    // Cleanup on unmount or URL change
    return () => {
      if (playerRef.current) {
        try { playerRef.current.destroy?.(); } catch {}
        playerRef.current = null;
        setPlayerReady(false);
      }
    };
  }, [scriptLoaded, url, playing, onReady, onPlay, onPause, onSeek, onEnded]);

  // Control playback when `playing` prop changes after player is ready
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

  const videoId = getDailymotionId(url);
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