export interface SectionWatchToggleProps {
  sectionKey: string;
  isWatching: boolean;
  onToggleWatch: (sectionKey: string) => void;
  disabled?: boolean;
}

export function SectionWatchToggle({
  sectionKey,
  isWatching,
  onToggleWatch,
  disabled = false,
}: SectionWatchToggleProps) {
  return (
    <button
      type="button"
      className={`btn btn-watch ${isWatching ? "watching" : "not-watching"}`}
      aria-pressed={isWatching}
      aria-label={`${isWatching ? "Unwatch" : "Watch"} seat availability for ${sectionKey}`}
      onClick={() => onToggleWatch(sectionKey)}
      disabled={disabled}
      data-testid={`watch-toggle-${sectionKey}`}
    >
      <span className="watch-icon" aria-hidden="true">
        {isWatching ? "★" : "☆"}
      </span>
      <span className="watch-label">{isWatching ? "Watching Seats" : "Watch Seats"}</span>
    </button>
  );
}
