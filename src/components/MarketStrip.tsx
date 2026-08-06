interface Props {
  jobsTotal: number
  autumnOpen: number
  appliedTotal: number
}

/** 行情条：页面头的等宽聚合读数，作为"量化终端"的签名元素 */
export default function MarketStrip({ jobsTotal, autumnOpen, appliedTotal }: Props) {
  return (
    <div className="market-strip">
      <span className="ticker-dot" aria-hidden="true" />
      <span className="ticker-num">{jobsTotal}</span> 个岗位
      <span className="ticker-sep" aria-hidden="true">
        ·
      </span>
      <span className="ticker-num pos">{autumnOpen}</span> 秋招开启
      <span className="ticker-sep" aria-hidden="true">
        ·
      </span>
      <span className="ticker-num info">{appliedTotal}</span> 申请中
    </div>
  )
}
