export function QueryPager(props: {
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  onPage: (page: number) => void;
  onPageSize: (pageSize: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(props.total / (props.pageSize || 20)));
  if (props.total <= 0) {
    return null;
  }
  return (
    <div className="pager">
      <label>
        每页
        <select
          value={String(props.pageSize)}
          onChange={(event) => props.onPageSize(Number(event.target.value))}
        >
          <option value="20">20</option>
          <option value="100">100</option>
        </select>
      </label>
      <button
        type="button"
        className="secondary"
        disabled={props.loading || props.page <= 1}
        onClick={() => props.onPage(Math.max(1, props.page - 1))}
      >
        上一页
      </button>
      <span>
        第 {props.page} / {pageCount} 页，共 {props.total} 条
      </span>
      <button
        type="button"
        className="secondary"
        disabled={props.loading || props.page >= pageCount}
        onClick={() => props.onPage(props.page + 1)}
      >
        下一页
      </button>
    </div>
  );
}

export function formatAdminTime(value: string | null): string {
  if (!value) {
    return '无';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false, timeZone: 'Asia/Shanghai' });
}
