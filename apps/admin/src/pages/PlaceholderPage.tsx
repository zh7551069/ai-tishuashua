export function PlaceholderPage(props: { title: string; moduleName: string; description: string }) {
  return (
    <section className="panel">
      <span className="tag">脚手架占位</span>
      <h1>{props.title}</h1>
      <p className="muted">{props.description}</p>
      <p className="muted">对应模块：{props.moduleName}</p>
    </section>
  );
}
