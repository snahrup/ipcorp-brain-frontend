interface InfoBlockProps {
  title: string;
  body?: string;
}

export function InfoBlock({ title, body }: InfoBlockProps) {
  if (!body) return null;
  return (
    <section className="info-block">
      <h3>{title}</h3>
      <p>{body}</p>
    </section>
  );
}
