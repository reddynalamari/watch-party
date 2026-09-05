import { Cancel01Icon, CrownIcon } from '@hugeicons/core-free-icons';
import Icon from './Icon';

export default function ParticipantsList({ isOpen, onClose, participants, myClientId, isHost, onTransferHost }) {
  if (!isOpen) return null;

  return (
    <div className="fixed md:absolute inset-y-0 right-0 w-full sm:w-80 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 shadow-2xl z-40 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <h3 className="font-bold text-gray-900 dark:text-white">Participants ({participants.length})</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-900 dark:hover:text-white p-1 rounded">
          <Icon icon={Cancel01Icon} size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {participants.map((p) => (
          <div key={p.clientId} className="flex items-center justify-between bg-gray-100 dark:bg-gray-800 px-3 py-2 rounded-lg">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                {(p.name || '?').slice(0, 1).toUpperCase()}
              </div>
              <span className="text-sm text-gray-900 dark:text-white truncate">
                {p.name}
                {p.clientId === myClientId && <span className="text-gray-400"> (you)</span>}
              </span>
              {p.isHost && (
                <span className="flex items-center gap-0.5 text-[10px] shrink-0 bg-green-500/15 text-green-600 dark:text-green-400 px-1.5 py-0.5 rounded font-bold">
                  <Icon icon={CrownIcon} size={11} />
                  Host
                </span>
              )}
            </div>
            {isHost && !p.isHost && p.clientId !== myClientId && (
              <button
                onClick={() => onTransferHost(p.clientId)}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline shrink-0 ml-2"
              >
                Make host
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
