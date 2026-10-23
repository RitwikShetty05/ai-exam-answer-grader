import { Benchmark, CalibrationLines, ConfidenceCurve, HorizontalCounts, OcrNoiseChart, QualityBars, colours } from "../components/charts.jsx"
import { Metric } from "../components/ui.jsx"

function SimpleTable({ rows, columns }) {
  if (!rows || rows.length === 0) {
    return <div className="empty">Not available yet.</div>
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, position) => (
            <tr key={position}>{columns.map((column) => <td key={column}>{String(row[column] === undefined ? "" : row[column])}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Evaluation({ evaluation }) {
  if (!evaluation || !evaluation.summary) {
    return <div className="empty">The evaluation files were not found.</div>
  }
  const summary = evaluation.summary
  const week7 = evaluation.week7 || {}
  let finalMae = 0
  for (const row of summary.benchmark) {
    if (row.method.startsWith("B5 v2")) {
      finalMae = row.mae
    }
  }
  const routingRows = []
  for (const name of Object.keys(summary.routing_shares)) {
    let colour = colours.warn
    if (name === "Auto-graded") {
      colour = colours.blue
    }
    routingRows.push({ name: name, value: Math.round(summary.routing_shares[name] * 10) / 10, colour: colour })
  }

  return (
    <div>
      <div className="page-head">
        <h1>Evaluation results</h1>
        <p>Measured results, not demo examples. Weeks 5–6: 450 Mohler answers to questions the models had never seen, weighted to represent all 2,254 answers. Week 7: Group 1's real scanned pages and a controlled OCR-noise test.</p>
      </div>

      <div className="grid-4">
        <Metric label="Average error (out of 5)" value={Math.round(finalMae * 100) / 100 + " marks"} note="Mean predictor floor: 0.89" />
        <Metric label="Within ±1 mark of the teachers" value={Math.round(summary.within_one_weighted) + "%"} note="Weighted estimate" />
        <Metric label="Sent to a teacher" value={Math.round(summary.review_share * 10) / 10 + "%"} note={"Catches " + Math.round(summary.large_errors_caught) + "% of large errors"} />
        <Metric label="Two teachers differ by" value={Math.round(summary.human_ai["Teacher 2 vs teacher 1"] * 100) / 100 + " marks"} note="Grader vs each teacher: 0.60 / 0.82" />
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title"><h2>1. How accurate is it?</h2><p>Lower is better; error bars = SD over 5 folds; the final grader is in blue</p></div>
        <div className="grid-2">
          <Benchmark rows={summary.benchmark} metric="mae" title="Mean absolute error (marks)" />
          <Benchmark rows={summary.benchmark} metric="rmse" title="Root mean squared error (marks)" />
        </div>
        <p className="chart-caption">B2 v2 has the lowest MAE (0.553) and the final grader B5 v2 the lowest RMSE (0.766), so it makes fewer large mistakes. The difference between the two is small; the final grader is significantly better than the similarity model alone (gain 0.110 marks, 95% CI 0.048 to 0.175).</p>
      </div>

      <div className="card">
        <div className="card-title"><h2>2. Where does it struggle?</h2><p>MAE by the teachers' mark of the answer</p></div>
        <QualityBars rows={summary.quality} bands={summary.band_order} />
        <p className="chart-caption">Similarity models struggle on weak answers because a wrong answer can use the right words. The LLM, which checks correctness, is best there; the final grader is best on strong answers.</p>
      </div>

      <div className="grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card-title"><h2>3. Can we trust the confidence?</h2></div>
          <ConfidenceCurve reliability={summary.reliability} height={260} />
          <p className="chart-caption">Answers given 0.85 or more were within ±1 mark 87% of the time; below 0.50 only 27%, which is why those answers go to a teacher.</p>
        </div>
        <div className="card">
          <div className="card-title"><h2>Where answers go (%)</h2></div>
          <HorizontalCounts rows={routingRows} valueLabel="% of answers" height={200} />
          <p className="chart-caption">18.8% of answers are sent to a teacher, and they contain 45.7% of the large errors (more than 1.5 marks).</p>
        </div>
      </div>

      <div className="card">
        <div className="card-title"><h2>4. Calibration: from the strict LLM to the teachers' scale</h2></div>
        <CalibrationLines isotonic={summary.calibration_isotonic} week5={summary.calibration_week5_line} />
        <p className="chart-caption">Both mappings start near 2.8, because answers the LLM scores 0 averaged about 2.8 from the lenient Mohler teachers. This floor is why a wrong answer on the right topic can still get about 3 out of 5.</p>
      </div>

      <div className="card">
        <div className="card-title"><h2>5. Week 7: Group 1's handwritten pages</h2><p>Group 1's digitizer on their two real answer sheets</p></div>
        <div className="chart-title">OCR quality against Group 1's hand-typed text</div>
        <SimpleTable rows={week7.ocr_quality} columns={["page", "handwriting", "true student ID", "CER", "WER", "OCR confidence"]} />
        <div className="chart-title" style={{ marginTop: 16 }}>Our marks for the same page: true text vs OCR text</div>
        <SimpleTable rows={week7.group1_grades} columns={["page", "graded text", "mark (out of 10)", "similarity model", "LLM", "rubric", "points present / partial", "confidence", "flagged"]} />
        <p className="chart-caption">Group 1's pages have no teacher marks, so this shows how much OCR changes our mark, not whether the mark is right. Only page 1 of each answer sheet exists, so each page covers only part of the answer.</p>
      </div>

      <div className="card">
        <div className="card-title"><h2>6. Week 7: how much do OCR errors change the marks?</h2><p>95 Mohler answers with teacher marks, with OCR-style errors added at Group 1's real error rates</p></div>
        {week7.ocr_noise ? (
          <div className="grid-2">
            <div>
              <OcrNoiseChart rows={week7.ocr_noise} />
            </div>
            <div>
              <SimpleTable rows={week7.ocr_noise} columns={["condition", "measured CER", "MAE vs teachers", "mark change vs clean", "flagged for review (%)"]} />
              <div className="chart-title" style={{ marginTop: 12 }}>Is the difference real? (bootstrap over questions)</div>
              <SimpleTable rows={week7.ocr_bootstrap} columns={["comparison", "MAE gain", "95% CI", "verdict"]} />
            </div>
          </div>
        ) : <div className="empty">The Week 7 OCR-noise experiment has not finished yet.</div>}
      </div>

      <div className="card">
        <div className="card-title"><h2>7. Robustness tests (Week 5)</h2></div>
        <div className="chart-title">Fake answers: average mark out of 5</div>
        <SimpleTable rows={summary.robustness_sanity} columns={["Test", "Should get", "B3 fine-tuned", "B2 LLM raw", "B2 calibrated", "B5 ensemble"]} />
        <div className="chart-title" style={{ marginTop: 14 }}>Prompt injection added to weak answers</div>
        <SimpleTable rows={summary.robustness_injection} columns={["Test", "B3 fine-tuned", "B2 LLM raw", "B2 LLM raw: rose by 1 mark or more", "Flagged by pattern check"]} />
      </div>
    </div>
  )
}
