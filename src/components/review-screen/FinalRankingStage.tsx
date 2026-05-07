export interface FinalRankingStageProps {
  rankings: Array<{
    rank: number;
    projectName: string;
    presentationOrder: number;
    trackName: string;
    score: number;
  }>;
  sessionTitle: string;
  roundLabel: string;
}

const formatRank = (rank: number) => String(rank).padStart(2, "0");

const formatOrder = (order: number) => String(order).padStart(2, "0");

const formatScore = (score: number) => score.toFixed(2);

export function FinalRankingStage({
  rankings,
  sessionTitle,
  roundLabel,
}: FinalRankingStageProps) {
  const validRankings = rankings.filter((ranking) => {
    const valid = Number.isFinite(ranking.score);
    if (!valid) {
      console.warn("FinalRankingStage skipped ranking without a valid score", ranking);
    }
    return valid;
  });
  const champion = validRankings[0] ?? null;
  const podiumRankings = validRankings.slice(1, 3);
  const tableRankings = validRankings.slice(3);

  return (
    <section className="final-ranking-stage">
      <style>{`
        .final-ranking-stage {
          min-height: 560px;
          overflow: hidden;
          border: 1px solid #dbe6f3;
          border-radius: 12px;
          background: #f8fbff;
          padding: 2rem;
        }
        .final-ranking-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 2rem;
          border-bottom: 1px solid #1a3a6e;
          padding-bottom: 1.25rem;
        }
        .final-ranking-kicker {
          margin-bottom: 6px;
          color: #c22832;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.25em;
        }
        .final-ranking-title {
          color: #0f2040;
          font-size: 28px;
          font-weight: 900;
          letter-spacing: 0.02em;
        }
        .final-ranking-meta {
          text-align: right;
        }
        .final-ranking-session {
          color: #475569;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 0.05em;
        }
        .final-ranking-champion {
          display: grid;
          grid-template-columns: 80px minmax(0, 1fr) auto;
          align-items: center;
          gap: 24px;
          margin-bottom: 12px;
          border: 1px solid #cfe0ff;
          border-radius: 8px;
          background: #eef5ff;
          padding: 1.75rem 1.5rem;
        }
        .final-ranking-champion-label {
          margin-bottom: 4px;
          color: #1d5cff;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.3em;
        }
        .final-ranking-champion-rank {
          color: #1d5cff;
          font-size: 56px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
          line-height: 1;
        }
        .final-ranking-champion-name {
          overflow: hidden;
          margin-bottom: 6px;
          color: #0f2040;
          font-size: 20px;
          font-weight: 800;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .final-ranking-champion-info {
          display: flex;
          gap: 16px;
          color: #64748b;
          font-size: 12px;
          font-weight: 700;
        }
        .final-ranking-champion-separator {
          color: #cbd5e1;
        }
        .final-ranking-score-label {
          margin-bottom: 2px;
          color: #64748b;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 0.15em;
        }
        .final-ranking-champion-score {
          color: #1d5cff;
          font-size: 38px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
          line-height: 1;
        }
        .final-ranking-podium {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 12px;
        }
        .final-ranking-podium-card {
          display: grid;
          grid-template-columns: 50px minmax(0, 1fr) auto;
          align-items: center;
          gap: 16px;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #fff;
          padding: 1.25rem;
        }
        .final-ranking-podium-card.accent {
          border-color: rgba(194,40,50,0.34);
        }
        .final-ranking-podium-rank {
          color: #64748b;
          font-size: 36px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
          line-height: 1;
        }
        .final-ranking-podium-card.accent .final-ranking-podium-rank {
          color: #c22832;
        }
        .final-ranking-podium-name {
          overflow: hidden;
          margin-bottom: 2px;
          color: #0f2040;
          font-size: 14px;
          font-weight: 800;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .final-ranking-podium-order {
          color: #94a3b8;
          font-size: 11px;
          font-weight: 700;
        }
        .final-ranking-podium-score {
          color: #0f2040;
          font-size: 22px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }
        .final-ranking-table {
          overflow: hidden;
          border: 0.5px solid #dbe6f3;
          border-radius: 8px;
          background: #fff;
        }
        .final-ranking-table.scrollable {
          max-height: 400px;
          overflow-y: auto;
        }
        .final-ranking-table.scrollable::-webkit-scrollbar {
          width: 10px;
        }
        .final-ranking-table.scrollable::-webkit-scrollbar-track {
          background: #eef4fb;
        }
        .final-ranking-table.scrollable::-webkit-scrollbar-thumb {
          border: 2px solid #eef4fb;
          border-radius: 999px;
          background: #94a3b8;
        }
        .final-ranking-table-header,
        .final-ranking-table-row {
          display: grid;
          grid-template-columns: 60px minmax(0, 1fr) 100px 100px;
          align-items: center;
        }
        .final-ranking-table-header {
          border-bottom: 0.5px solid #dbe6f3;
          background: #eef4fb;
          padding: 12px 1.25rem;
          color: #64748b;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.1em;
        }
        .final-ranking-table-row {
          border-bottom: 0.5px solid #eef4fb;
          padding: 14px 1.25rem;
          color: #0f2040;
          font-size: 14px;
          font-weight: 700;
        }
        .final-ranking-table-row.last {
          border-bottom: 0;
        }
        .final-ranking-table-rank,
        .final-ranking-table-order,
        .final-ranking-table-score {
          font-variant-numeric: tabular-nums;
        }
        .final-ranking-table-rank,
        .final-ranking-table-order {
          color: #94a3b8;
        }
        .final-ranking-table-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .final-ranking-table-order {
          text-align: center;
        }
        .final-ranking-table-score {
          text-align: right;
          font-weight: 900;
        }
      `}</style>

      <div className="final-ranking-header">
        <div>
          <div className="final-ranking-kicker">最终排名</div>
          <div className="final-ranking-title">本轮评审结果</div>
        </div>
        <div className="final-ranking-meta">
          <div className="final-ranking-session">{sessionTitle} · {roundLabel}</div>
        </div>
      </div>

      {champion ? (
        <div className="final-ranking-champion">
          <div>
            <div className="final-ranking-champion-label">第一名</div>
            <div className="final-ranking-champion-rank" style={{ fontVariantNumeric: "tabular-nums" }}>
              {champion.rank}
            </div>
          </div>
          <div className="min-w-0">
            <div className="final-ranking-champion-name">{champion.projectName}</div>
            <div className="final-ranking-champion-info">
              <span style={{ fontVariantNumeric: "tabular-nums" }}>路演顺序 {formatOrder(champion.presentationOrder)}</span>
              <span className="final-ranking-champion-separator">|</span>
              <span>{champion.trackName}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="final-ranking-score-label">最终得分</div>
            <div className="final-ranking-champion-score" style={{ fontVariantNumeric: "tabular-nums" }}>
              {formatScore(champion.score)}
            </div>
          </div>
        </div>
      ) : null}

      {podiumRankings.length > 0 ? (
        <div className="final-ranking-podium">
          {podiumRankings.map((ranking, index) => (
            <div
              className={`final-ranking-podium-card ${index === 1 ? "accent" : ""}`}
              key={`${ranking.rank}-${ranking.projectName}`}
            >
              <div className="final-ranking-podium-rank" style={{ fontVariantNumeric: "tabular-nums" }}>
                {ranking.rank}
              </div>
              <div className="min-w-0">
                <div className="final-ranking-podium-name">{ranking.projectName}</div>
                <div className="final-ranking-podium-order" style={{ fontVariantNumeric: "tabular-nums" }}>
                  路演 {formatOrder(ranking.presentationOrder)}
                </div>
              </div>
              <div className="final-ranking-podium-score" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatScore(ranking.score)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tableRankings.length > 0 ? (
        <div className={`final-ranking-table ${tableRankings.length > 7 ? "scrollable" : ""}`}>
          <div className="final-ranking-table-header">
            <div>名次</div>
            <div>项目名称</div>
            <div className="text-center">路演</div>
            <div className="text-right">得分</div>
          </div>
          {tableRankings.map((ranking, index) => (
            <div
              className={`final-ranking-table-row ${index === tableRankings.length - 1 ? "last" : ""}`}
              key={`${ranking.rank}-${ranking.projectName}`}
            >
              <div className="final-ranking-table-rank" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatRank(ranking.rank)}
              </div>
              <div className="final-ranking-table-name">{ranking.projectName}</div>
              <div className="final-ranking-table-order" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatOrder(ranking.presentationOrder)}
              </div>
              <div className="final-ranking-table-score" style={{ fontVariantNumeric: "tabular-nums" }}>
                {formatScore(ranking.score)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
