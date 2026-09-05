import { useRef, useState, useCallback, useEffect } from 'react';
import Draggable from 'react-draggable';
import { Maximize02Icon, Minimize02Icon, Video01Icon } from '@hugeicons/core-free-icons';
import Icon from './Icon';

// The old widget was locked at 320x288 with no way to resize it — that's why
// only one face fit on screen at a time. This one opens much bigger and can
// be dragged from any corner to whatever size actually fits your friends.
const MIN_WIDTH = 300;
const MIN_HEIGHT = 240;
const DEFAULT_SIZE = { width: 480, height: 400 };

export default function CallWidget({ roomName, displayName, isFullscreen }) {
  const nodeRef = useRef(null);
  const resizeRef = useRef(null);

  // "Popped out" = floating, draggable, resizable window, independent of
  // browser fullscreen. Fullscreen always floats too, since there's no
  // docked layout visible to sit in while the video is fullscreen.
  const [poppedOut, setPoppedOut] = useState(false);
  const floating = isFullscreen || poppedOut;

  const [size, setSize] = useState(DEFAULT_SIZE);
  const [dragPos, setDragPos] = useState({ x: 24, y: 24 });

  const handleResizeStart = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const point = e.touches ? e.touches[0] : e;
    resizeRef.current = {
      startX: point.clientX,
      startY: point.clientY,
      startWidth: size.width,
      startHeight: size.height,
    };

    const onMove = (moveEvent) => {
      const movePoint = moveEvent.touches ? moveEvent.touches[0] : moveEvent;
      const { startX, startY, startWidth, startHeight } = resizeRef.current;
      setSize({
        width: Math.max(MIN_WIDTH, startWidth + (movePoint.clientX - startX)),
        height: Math.max(MIN_HEIGHT, startHeight + (movePoint.clientY - startY)),
      });
    };
    const onEnd = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onEnd);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }, [size]);

  // Clean up any stray listeners if the widget unmounts mid-drag.
  useEffect(() => () => {
    if (resizeRef.current) {
      resizeRef.current = null;
    }
  }, []);

  // Joining with a real name (instead of anonymously) is what stops
  // everyone from showing up as identical blank "Guest" tiles.
  const joinUrl = `https://p2p.mirotalk.com/join?room=${encodeURIComponent(`WatchParty-${roomName}`)}&name=${encodeURIComponent(displayName || 'Guest')}&audio=1&video=1&screen=0&notify=0`;

  if (!floating) {
    return (
      <div className="w-full md:w-80 h-64 md:h-full bg-white dark:bg-gray-900 flex flex-col border-t md:border-t-0 md:border-l border-gray-200 dark:border-gray-800 shrink-0">
        <div className="flex items-center justify-between px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-[11px] font-bold text-gray-500 dark:text-gray-400">
          <span className="flex items-center gap-1.5">
            <Icon icon={Video01Icon} size={13} />
            Video call
          </span>
          <button
            onClick={() => setPoppedOut(true)}
            className="flex items-center gap-1 hover:text-gray-900 dark:hover:text-white p-1 rounded"
            title="Pop out into a floating, resizable window"
          >
            <Icon icon={Maximize02Icon} size={13} />
          </button>
        </div>
        <iframe
          src={joinUrl}
          allow="camera; microphone; fullscreen; speaker; display-capture"
          className="w-full flex-1 border-none"
          title="Video Call"
        />
      </div>
    );
  }

  return (
    <Draggable
      nodeRef={nodeRef}
      handle=".call-drag-handle"
      bounds="parent"
      position={dragPos}
      onDrag={(e, data) => setDragPos({ x: data.x, y: data.y })}
    >
      <div
        ref={nodeRef}
        className="absolute z-40 rounded-xl overflow-hidden shadow-2xl border border-white/20 bg-gray-900 flex flex-col"
        style={{ width: size.width, height: size.height }}
      >
        <div className="call-drag-handle flex items-center justify-between bg-gray-800 text-[10px] px-2.5 py-2 text-gray-300 font-bold tracking-widest cursor-move hover:bg-gray-700 select-none border-b border-gray-700">
          <span className="flex items-center gap-1.5">
            <Icon icon={Video01Icon} size={12} />
            DRAG TO MOVE
          </span>
          {!isFullscreen && (
            <button
              onClick={() => setPoppedOut(false)}
              className="flex items-center gap-1 hover:text-white p-0.5 rounded"
              title="Dock back into the page"
            >
              <Icon icon={Minimize02Icon} size={13} />
            </button>
          )}
        </div>
        <iframe
          src={joinUrl}
          allow="camera; microphone; fullscreen; speaker; display-capture"
          className="w-full flex-1 border-none"
          title="Video Call"
        />
        <div
          onMouseDown={handleResizeStart}
          onTouchStart={handleResizeStart}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize"
          style={{ background: 'linear-gradient(135deg, transparent 50%, rgba(255,255,255,0.4) 50%)' }}
          title="Drag to resize"
        />
      </div>
    </Draggable>
  );
}
