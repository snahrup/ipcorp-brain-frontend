interface MetaPillProps {
  label: string;
  value: string;
}

export function MetaPill({ label, value }: MetaPillProps) {
  return (
    <span className="meta-pill">
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}
