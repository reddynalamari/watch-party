import { ArrowUp01Icon, ArrowDown01Icon, Delete02Icon, PlayIcon } from '@hugeicons/core-free-icons';
import Icon from './Icon';
import { useOEmbed } from '../hooks/useOEmbed';

function QueueItem({ item, isHost, isCurrent, onPlay, onRemove, onMoveUp, onMoveDown }) {
  const meta = useOEmbed(item.url);
  return (
    <div
      className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
        isCurrent
          ? 'bg-blue-500/10 border border-blue-500/40'
          : 'bg-gray-100 dark:bg-gray-800 border border-transparent'
      }`}
    >
      {meta?.thumbnail ? (
        <img src={meta.thumbnail} alt="" className="w-10 h-7 object-cover rounded shrink-0" />
      ) : (
        <div className="w-10 h-7 rounded bg-gray-300 dark:bg-gray-700 shrink-0" />
      )}
      <span className="flex-1 truncate text-gray-800 dark:text-gray-200">{meta?.title || item.url}</span>
      {isHost && (
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={onMoveUp} className="text-gray-400 hover:text-gray-900 dark:hover:text-white p-1 rounded" title="Move up">
            <Icon icon={ArrowUp01Icon} size={14} />
          </button>
          <button onClick={onMoveDown} className="text-gray-400 hover:text-gray-900 dark:hover:text-white p-1 rounded" title="Move down">
            <Icon icon={ArrowDown01Icon} size={14} />
          </button>
          <button onClick={onPlay} className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-bold text-xs px-2">
            <Icon icon={PlayIcon} size={13} /> Play
          </button>
          <button onClick={onRemove} className="text-red-500 p-1 rounded" title="Remove">
            <Icon icon={Delete02Icon} size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function Playlist({ playlist, isHost, currentVideo, onPlayItem, onRemoveItem, onMoveItem }) {
  return (
    <div className="h-36 bg-white dark:bg-gray-900 rounded-xl p-3 border border-gray-200 dark:border-gray-800 overflow-y-auto shrink-0">
      <h3 className="font-semibold text-gray-500 dark:text-gray-400 text-xs mb-2">
        Up next ({playlist.length})
      </h3>
      {playlist.length === 0 ? (
        <p className="text-gray-400 dark:text-gray-600 text-sm">Queue is empty. Add a video above.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {playlist.map((item) => (
            <QueueItem
              key={item.id}
              item={item}
              isHost={isHost}
              isCurrent={item.url === currentVideo}
              onPlay={() => onPlayItem(item.id)}
              onRemove={() => onRemoveItem(item.id)}
              onMoveUp={() => onMoveItem(item.id, -1)}
              onMoveDown={() => onMoveItem(item.id, 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
