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

const DailymotionIframePlayer = forwardRef(({ url, playing, onReady, onPlay, onPause, onSeek, onEnded }, ref) => {
  const containerRef = useRef(null);
  const iframeRef = useRef(null);
  const playerReadyRef = useRef(false);
  const lastKnownTimeRef = useRef(0);
  const currentPlayingRef = useRef(playing);
  const commandQueueRef = useRef([]);
  const isMountedRef = useRef(true);

  // Build embed URL with API enabled
  const videoId = getDailymotionId(url);
  const embedUrl = videoId
    ? `https://www.dailymotion.com/embed/video/${videoId}?api=1&autoplay=${playing ? 1 : 0}&mute=0&controls=1`
    : '';

  // Helper: send a command to the iframe
  const sendCommand = (command, value) => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) {
      // Queue command until iframe is ready
      commandQueueRef.current.push({ command, value });
      return;
    }
    const payload = value !== undefined ? { command, value } : { command };
    iframe.contentWindow.postMessage(JSON.stringify(payload), '*');
  };

  // Process queued commands
  const flushQueue = () => {
    const queue = commandQueueRef.current;
    commandQueueRef.current = [];
    queue.forEach(({ command, value }) => {
      sendCommand(command, value);
    });
  };

  // Handle postMessage events from the iframe
  useEffect(() => {
    const handleMessage = (event) => {
      if (!event.origin.includes('dailymotion.com')) return;
      if (!isMountedRef.current) return;

      try {
        const data = JSON.parse(event.data);
        // console.log('[Dailymotion] Event:', data); // Uncomment for debugging

        switch (data.event) {
          case 'apiready':
            playerReadyRef.current = true;
            flushQueue();
            onReady?.();
            break;
          case 'play':
            currentPlayingRef.current = true;
            onPlay?.();
            break;
          case 'pause':
            currentPlayingRef.current = false;
            onPause?.();
            break;
          case 'seek':
            if (data.value !== undefined) {
              lastKnownTimeRef.current = data.value;
            }
            onSeek?.();
            break;
          case 'video_end':
            onEnded?.();
            break;
          case 'timeupdate':
            if (data.value !== undefined) {
              lastKnownTimeRef.current = data.value;
            }
            break;
          default:
            break;
        }
      } catch (e) {
        // Not a JSON message – ignore
      }
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
      isMountedRef.current = false;
    };
  }, [onReady, onPlay, onPause, onSeek, onEnded]);

  // Control playback when `playing` prop changes
  useEffect(() => {
    currentPlayingRef.current = playing;
    if (playerReadyRef.current) {
      if (playing) {
        sendCommand('play');
      } else {
        sendCommand('pause');
      }
    } else {
      // Queue command
      commandQueueRef.current.push({ command: playing ? 'play' : 'pause' });
    }
  }, [playing]);

  // When URL changes (video ID changes), reset and reload the iframe
  useEffect(() => {
    // Reset state
    playerReadyRef.current = false;
    lastKnownTimeRef.current = 0;
    commandQueueRef.current = [];
    // The iframe src will be updated by React because embedUrl changes
  }, [embedUrl]);

  // Expose methods to parent via ref (mimics ReactPlayer's ref)
  useImperativeHandle(ref, () => ({
    getCurrentTime: () => {
      return lastKnownTimeRef.current || 0;
    },
    seekTo: (seconds) => {
      if (playerReadyRef.current) {
        sendCommand('seek', seconds);
      } else {
        commandQueueRef.current.push({ command: 'seek', value: seconds });
      }
    },
    play: () => {
      if (playerReadyRef.current) {
        sendCommand('play');
      } else {
        commandQueueRef.current.push({ command: 'play' });
      }
    },
    pause: () => {
      if (playerReadyRef.current) {
        sendCommand('pause');
      } else {
        commandQueueRef.current.push({ command: 'pause' });
      }
    },
    getInternalPlayer: () => iframeRef.current,
  }), []);

  if (!videoId) {
    return <div style={{ width: '100%', height: '100%', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>Invalid Dailymotion URL</div>;
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <iframe
        ref={iframeRef}
        src={embedUrl}
        style={{ width: '100%', height: '100%', border: 'none' }}
        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        title="Dailymotion Player"
        key={videoId} // Force re-render on video change
      />
    </div>
  );
});

DailymotionIframePlayer.displayName = 'DailymotionIframePlayer';

export default DailymotionIframePlayer;