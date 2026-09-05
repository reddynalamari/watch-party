import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

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
  const playerRef = useRef(null);
  const scriptLoadedRef = useRef(false);
  const containerId = `dm-player-${++instanceCounter}`;
  const currentPlayingRef = useRef(playing);
  const currentTimeRef = useRef(0);

  // Load the Dailymotion library script
  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) {
      scriptLoadedRef.current = true;
      initPlayer();
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      scriptLoadedRef.current = true;
      initPlayer();
    };
    script.onerror = () => console.error('Failed to load Dailymotion library');
    document.body.appendChild(script);
  }, []);

  // Initialize or re-initialize player
  const initPlayer = () => {
    const videoId = getDailymotionId(url);
    if (!videoId || !containerRef.current || !window.dailymotion) return;

    // Destroy existing player
    if (playerRef.current) {
      try { playerRef.current.destroy?.(); } catch {}
      playerRef.current = null;
    }

    // Create new player – pass the container ID as a string with '#'
    try {
      const player = window.dailymotion.createPlayer(`#${containerId}`, {
        video: videoId,
        autoplay: currentPlayingRef.current ? 1 : 0,
        controls: 1,
        'api': 1,
        mute: 0,
      });

      playerRef.current = player;

      // Bind events – Dailymotion uses .on()
      if (typeof player.on === 'function') {
        player.on('ready', () => {
          onReady?.();
          // If playing, ensure we start
          if (currentPlayingRef.current) player.play();
        });
        player.on('play', () => { currentPlayingRef.current = true; onPlay?.(); });
        player.on('pause', () => { currentPlayingRef.current = false; onPause?.(); });
        player.on('seek', (data) => {
          if (data && data.time) currentTimeRef.current = data.time;
          onSeek?.();
        });
        player.on('timeupdate', (data) => {
          if (data && data.time) currentTimeRef.current = data.time;
        });
        player.on('ended', () => onEnded?.());
      } else {
        // Fallback for older versions – use addEventListener
        player.addEventListener('ready', () => {
          onReady?.();
          if (currentPlayingRef.current) player.play();
        });
        player.addEventListener('play', () => { currentPlayingRef.current = true; onPlay?.(); });
        player.addEventListener('pause', () => { currentPlayingRef.current = false; onPause?.(); });
        player.addEventListener('seek', (data) => {
          if (data && data.time) currentTimeRef.current = data.time;
          onSeek?.();
        });
        player.addEventListener('timeupdate', (data) => {
          if (data && data.time) currentTimeRef.current = data.time;
        });
        player.addEventListener('ended', () => onEnded?.());
      }
    } catch (err) {
      console.error('Dailymotion player init error:', err);
    }
  };

  // Re-init when URL changes (video ID changes)
  useEffect(() => {
    if (scriptLoadedRef.current && window.dailymotion) {
      initPlayer();
    }
  }, [url]);

  // Control playback when `playing` prop changes
  useEffect(() => {
    currentPlayingRef.current = playing;
    const player = playerRef.current;
    if (!player) return;
    try {
      if (playing) player.play();
      else player.pause();
    } catch (err) {
      // ignore
    }
  }, [playing]);

  // Expose methods to parent (same as ReactPlayer)
  useImperativeHandle(ref, () => ({
    getCurrentTime: () => currentTimeRef.current || 0,
    seekTo: (seconds) => {
      const player = playerRef.current;
      if (!player) return;
      try { player.seek(seconds); } catch {}
    },
    play: () => {
      const player = playerRef.current;
      if (!player) return;
      try { player.play(); } catch {}
    },
    pause: () => {
      const player = playerRef.current;
      if (!player) return;
      try { player.pause(); } catch {}
    },
    getInternalPlayer: () => playerRef.current,
  }), []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (playerRef.current) {
        try { playerRef.current.destroy?.(); } catch {}
        playerRef.current = null;
      }
    };
  }, []);

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