export function PlaceholderPage(props: { title: string; note: string; frame: string }) {
  return (
    <section className="page">
      <h1>{props.title}</h1>
      <div className="card-panel placeholder-card">
        <p>{props.note}</p>
        <p className="hint">对照帧 {props.frame}。这一页没有示例数据，也不能提交。</p>
      </div>
    </section>
  );
}
