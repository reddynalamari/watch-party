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

// Calls a Dailymotion player method (play/pause/seek) defensively:
// - no-ops if the player has already been destroyed / replaced
// - tolerates methods that don't return a Promise (destroyed players can
//   return undefined instead of a Promise, which previously crashed on
//   `.catch()`)
const safeCall = (player, playerRef, methodName, ...args) => {
  if (!player || playerRef.current !== player) return;
  try {
    const result = player[methodName]?.(...args);
    result?.catch?.(() => {});
  } catch {
    // Ignore - player may have been torn down between the check and the call.
  }
};

// Resolve every plausible event name for a given logical event, so we're
// resilient to differences between SDK versions / the `dailymotion.events`
// constants object. Registering a handler under an event name the SDK
// doesn't recognize just produces a harmless "Unknown event" warning in the
// console (the handler is simply never invoked for that name) — it does not
// break anything, whereas guessing wrong with a single hardcoded fallback
// meant the handler never fired at all.
const resolveEventNames = (events, constantKeys, literalFallbacks) => {
  const names = [
    ...constantKeys.map((key) => events?.[key]).filter(Boolean),
    ...literalFallbacks,
  ];
  return [...new Set(names)];
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
      .createPlayer(containerId, {
        video: videoId,
        params: {
          autoplay: playingRef.current ? 1 : 0,
          controls: 1,
          'api': 1,
          mute: 0,
        },
      })
      .then((player) => {
        // The effect was cleaned up (video changed / component unmounted)
        // before player creation resolved. Destroy this orphaned instance
        // immediately and don't wire up any listeners for it.
        if (cancelled) {
          try { player.destroy?.(); } catch {}
          return;
        }
        playerRef.current = player;
        setPlayerReady(true);

        const events = window.dailymotion.events || {};

        const readyEvents = resolveEventNames(
          events,
          ['APIREADY', 'PLAYBACK_READY', 'VIDEO_READY', 'READY'],
          ['apiready', 'playback_ready', 'ready']
        );
        const playEvents = resolveEventNames(events, ['VIDEO_PLAY', 'PLAY'], ['play']);
        const pauseEvents = resolveEventNames(events, ['VIDEO_PAUSE', 'PAUSE'], ['pause']);
        const timeUpdateEvents = resolveEventNames(
          events,
          ['VIDEO_TIMECHANGE', 'TIME_UPDATE', 'VIDEO_TIMEUPDATE'],
          ['timeupdate']
        );
        // Prefer the "seek finished" event; some SDK versions split seeking
        // into a start/end pair (seeking / seeked) rather than one 'seek'.
        const seekEvents = resolveEventNames(
          events,
          ['SEEK_END', 'VIDEO_SEEK', 'SEEK'],
          ['seeked', 'seek']
        );
        const endedEvents = resolveEventNames(events, ['VIDEO_END', 'END'], ['video_end', 'ended', 'end']);

        // Ready event
        readyEvents.forEach((name) => {
          player.on(name, () => {
            onReadyRef.current?.();
            // If playing is true, ensure playback starts (some browsers
            // block autoplay). Guard against calling into a player that has
            // since been destroyed/replaced (e.g. the video changed again
            // before this fired).
            if (playingRef.current) {
              safeCall(player, playerRef, 'play');
            }
          });
        });

        // Play event
        playEvents.forEach((name) => {
          player.on(name, () => {
            onPlayRef.current?.();
          });
        });

        // Pause event
        pauseEvents.forEach((name) => {
          player.on(name, () => {
            onPauseRef.current?.();
          });
        });

        // Time update – track current time
        timeUpdateEvents.forEach((name) => {
          player.on(name, (state) => {
            if (state?.videoTime !== undefined) {
              currentTimeRef.current = state.videoTime;
            }
          });
        });

        // Seek event – triggered when user seeks
        seekEvents.forEach((name) => {
          player.on(name, (state) => {
            if (state?.videoTime !== undefined) {
              currentTimeRef.current = state.videoTime;
            }
            onSeekRef.current?.();
          });
        });

        // Ended event
        endedEvents.forEach((name) => {
          player.on(name, () => {
            onEndedRef.current?.();
          });
        });

        // If playing is true after creation, call play again (safety),
        // guarded against a player that's already been replaced by then.
        if (playingRef.current) {
          setTimeout(() => {
            safeCall(player, playerRef, 'play');
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
      safeCall(player, playerRef, 'play');
    } else {
      safeCall(player, playerRef, 'pause');
    }
  }, [playing, playerReady]);

  // Expose methods to parent (same as ReactPlayer)
  useImperativeHandle(ref, () => ({
    getCurrentTime: () => currentTimeRef.current || 0,
    seekTo: (seconds) => {
      safeCall(playerRef.current, playerRef, 'seek', seconds);
    },
    play: () => {
      safeCall(playerRef.current, playerRef, 'play');
    },
    pause: () => {
      safeCall(playerRef.current, playerRef, 'pause');
    },
    getInternalPlayer: () => playerRef.current,
  }), []);

  if (!videoId) {
    return (
      <div style={{ width: '100%', height: '100%', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
        Invalid Dailymotion URL
      </div>
    );
  }

  return (
    <>
      {/*
        The Dailymotion SDK sizes the iframe it creates (and any wrapper div
        around it) in pixels based on the container's dimensions at the
        moment createPlayer() resolves. If this container is laid out with
        flexible/percentage sizing (as it is here — it lives inside a flex
        column whose height depends on window size, chat panel, etc.), the
        SDK's snapshot size can drift from the container's actual rendered
        size on resize or if layout hadn't fully settled at creation time.
        The parent wrapper (in App.jsx) uses `overflow: hidden`, so any
        mismatch silently clips part of the player — typically the bottom
        control bar, which is exactly the "trimmed" symptom.

        Forcing every descendant to absolutely fill this container via CSS
        (rather than trusting the SDK's own inline pixel sizing) makes it
        physically impossible for the iframe to be taller or shorter than
        the box we actually have, regardless of when/how it was measured.
      */}
      <style>{`
        #${containerId} { position: relative; overflow: hidden; }
        #${containerId} > * {
          position: absolute !important;
          inset: 0 !important;
          top: 0 !important;
          left: 0 !important;
          width: 100% !important;
          height: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        #${containerId} iframe {
          border: none !important;
          width: 100% !important;
          height: 100% !important;
        }
      `}</style>
      <div
        id={containerId}
        ref={containerRef}
        style={{ width: '100%', height: '100%', backgroundColor: '#000' }}
      />
    </>
  );
});

DailymotionPlayer.displayName = 'DailymotionPlayer';
export default DailymotionPlayer;