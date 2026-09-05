import { useRef } from 'react';
import Draggable from 'react-draggable';
import { IdeaIcon, Cancel01Icon } from '@hugeicons/core-free-icons';
import Icon from './Icon';

// Interpolates a light color from cool white towards warm amber as warmth
// increases, and from dim to fully opaque as brightness increases.
function computeLightColor(brightness, warmth) {
  const r = 255;
  const g = Math.round(255 - warmth * 0.35);
  const b = Math.round(255 - warmth * 0.9);
  const alpha = 0.35 + (brightness / 100) * 0.65;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const SIZES = { sm: 200, md: 300, lg: 420 };

export default function CamLight({ visible, onClose, brightness, setBrightness, warmth, setWarmth, size, setSize }) {
  const nodeRef = useRef(null);
  if (!visible) return null;

  const width = SIZES[size] ?? SIZES.md;
  const color = computeLightColor(brightness, warmth);

  return (
    <Draggable nodeRef={nodeRef} handle=".camlight-handle" bounds="parent" defaultPosition={{ x: 24, y: 24 }}>
      <div
        ref={nodeRef}
        className="absolute z-50 rounded-2xl shadow-2xl overflow-hidden border border-white/30 flex flex-col"
        style={{ width, height: width * 0.75 }}
      >
        <div className="camlight-handle flex items-center justify-between px-3 py-1.5 bg-black/70 text-[11px] font-bold tracking-wide text-white cursor-move select-none">
          <span className="flex items-center gap-1.5">
            <Icon icon={IdeaIcon} size={13} />
            Cam light — drag near your webcam
          </span>
          <button onClick={onClose} className="hover:text-red-400 p-0.5 rounded">
            <Icon icon={Cancel01Icon} size={14} />
          </button>
        </div>

        <div className="flex-1" style={{ backgroundColor: color }} />

        <div className="bg-black/85 px-3 py-2 flex flex-col gap-2">
          <label className="text-[10px] text-gray-300 flex items-center gap-2">
            Brightness
            <input
              type="range" min="20" max="100" value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="flex-1 accent-yellow-400"
            />
          </label>
          <label className="text-[10px] text-gray-300 flex items-center gap-2">
            Warmth
            <input
              type="range" min="0" max="100" value={warmth}
              onChange={(e) => setWarmth(Number(e.target.value))}
              className="flex-1 accent-orange-400"
            />
          </label>
          <div className="flex gap-1 justify-center">
            {Object.keys(SIZES).map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                className={`text-[10px] px-2 py-1 rounded font-bold ${
                  size === s ? 'bg-yellow-400 text-black' : 'bg-gray-700 text-gray-300'
                }`}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Draggable>
  );
}
