const EMOJIS = ['👍', '❤️', '😂', '😮', '👏', '🔥'];

export function FloatingReactions({ reactions }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {reactions.map((r) => (
        <span
          key={r.id}
          className="absolute bottom-16 text-4xl animate-float-up select-none"
          style={{ left: `${r.x}%` }}
        >
          {r.emoji}
        </span>
      ))}
    </div>
  );
}

export function ReactionBar({ onSend }) {
  return (
    <div className="absolute bottom-3 right-3 z-20 flex gap-1 bg-black/50 backdrop-blur px-2 py-1.5 rounded-full">
      {EMOJIS.map((e) => (
        <button
          key={e}
          onClick={() => onSend(e)}
          className="text-lg hover:scale-125 transition-transform active:scale-95"
          aria-label={`Send ${e} reaction`}
        >
          {e}
        </button>
      ))}
    </div>
  );
}
