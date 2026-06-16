interface EmptyStateProps {
  message: string;
  hint?: string;
}

export function EmptyState({ message, hint }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-state-content">
        <p>{message}</p>
        {hint && <small className="empty-hint">{hint}</small>}
      </div>
    </div>
  );
}
