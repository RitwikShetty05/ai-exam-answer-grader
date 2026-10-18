import numpy as np
import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

blue = "#2a78d6"
orange = "#eb6834"
aqua = "#1baf7a"
gray = "#898781"
light_gray = "#c3c2b7"
pale_blue = "#cde2fb"
dark_ink = "#0b0b0b"
secondary_ink = "#52514e"
grid_colour = "#e1e0d9"
good_green = "#0ca30c"
warning_yellow = "#fab219"
critical_red = "#d03b3b"


def rounded_texts(values, digits=2):
    texts = []
    for value in values:
        texts.append(str(round(value, digits)))
    return texts


def style(figure, title, height=420):
    figure.update_layout(
        title={"text": title, "x": 0, "xanchor": "left", "font": {"size": 16, "color": dark_ink}},
        height=height,
        template="simple_white",
        plot_bgcolor="white",
        paper_bgcolor="white",
        font={"color": dark_ink, "size": 13},
        margin={"l": 10, "r": 20, "t": 70, "b": 10},
        legend={"orientation": "h", "yanchor": "top", "y": -0.2, "x": 0},
        hoverlabel={"bgcolor": "white", "font_size": 13},
    )
    figure.update_xaxes(showgrid=True, gridcolor=grid_colour, linecolor=light_gray, zeroline=False)
    figure.update_yaxes(showgrid=True, gridcolor=grid_colour, linecolor=light_gray, zeroline=False)
    return figure


def score_waterfall(scores):
    labels = ["Rubric<br>points", "Wrong<br>statements", "+ LLM's<br>own score", "Teachers'<br>scale", "+ similarity<br>model", "Final<br>mark"]
    full_names = ["Rubric points confirmed", "Wrong-statement penalty", "Average with the LLM's own score", "Calibration to the teachers' scale", "Average with the similarity model", "Final mark (out of 5)"]
    values = [
        scores["rubric_before_penalty"],
        scores["rubric"] - scores["rubric_before_penalty"],
        scores["llm_rubric_average"] - scores["rubric"],
        scores["llm_calibrated"] - scores["llm_rubric_average"],
        scores["final"] - scores["llm_calibrated"],
        scores["final"],
    ]
    texts = []
    for position in range(len(values)):
        if position == 0 or position == len(values) - 1:
            texts.append(str(round(values[position], 2)))
        elif values[position] >= 0:
            texts.append("+" + str(round(values[position], 2)))
        else:
            texts.append("−" + str(round(abs(values[position]), 2)))
    figure = go.Figure(go.Waterfall(
        measure=["absolute", "relative", "relative", "relative", "relative", "total"],
        x=labels,
        y=values,
        text=texts,
        textposition="outside",
        increasing={"marker": {"color": blue}},
        decreasing={"marker": {"color": critical_red}},
        totals={"marker": {"color": blue}},
        connector={"line": {"color": light_gray}},
        customdata=full_names,
        hovertemplate="%{customdata}<br>%{text}<extra></extra>",
    ))
    figure.update_yaxes(range=[0, 5.6], title="Marks out of 5")
    figure.update_xaxes(tickangle=0)
    return style(figure, "How this mark was calculated", height=380)


def confidence_check(reliability_rows, confidence):
    figure = go.Figure()
    figure.add_trace(go.Scatter(x=[0, 1], y=[0, 1], mode="lines", line={"color": gray, "dash": "dot", "width": 1}, name="Perfectly honest confidence", hoverinfo="skip"))
    x_values = []
    y_values = []
    hover_texts = []
    for row in reliability_rows:
        x_values.append(row["Average confidence"])
        y_values.append(row["Really within ±1 (%)"] / 100)
        hover_texts.append("Confidence " + row["Confidence"] + "<br>" + str(row["Really within ±1 (%)"]) + "% within ±1 mark<br>" + str(row["Share of answers (%)"]) + "% of answers")
    figure.add_trace(go.Scatter(x=x_values, y=y_values, mode="lines+markers", line={"color": blue, "width": 2}, marker={"size": 10, "line": {"color": "white", "width": 2}}, name="Evaluation results", hovertext=hover_texts, hoverinfo="text"))
    figure.add_vline(x=confidence, line={"color": orange, "width": 2})
    figure.add_annotation(x=confidence, y=0.05, text="this answer: " + str(round(confidence * 100)) + "%", showarrow=False, xanchor="right", font={"color": orange})
    figure.update_xaxes(range=[0, 1], title="Confidence given")
    figure.update_yaxes(range=[0, 1], title="Really within ±1 mark")
    return style(figure, "Is this confidence trustworthy?", height=380)


def reliability_text(reliability_rows, confidence):
    edges = [0, 0.5, 0.7, 0.85, 1.01]
    for position in range(len(reliability_rows)):
        if edges[position] <= confidence < edges[position + 1]:
            row = reliability_rows[position]
            return "In the evaluation, answers given confidence " + row["Confidence"] + " were really within ±1 mark of the teachers " + str(row["Really within ±1 (%)"]) + "% of the time."
    return ""


def corridor(human_marks, model_marks, hover_texts, title, note=None, height=480):
    human_marks = np.array(human_marks, dtype=float)
    model_marks = np.array(model_marks, dtype=float)
    inside = np.abs(human_marks - model_marks) <= 1
    random_generator = np.random.RandomState(0)
    jitter = random_generator.uniform(-0.06, 0.06, len(human_marks))
    hover_texts = np.array(hover_texts)
    figure = go.Figure()
    figure.add_trace(go.Scatter(x=[0, 5, 5, 0, 0], y=[-1, 4, 6, 1, -1], fill="toself", fillcolor=pale_blue, line={"width": 0}, name="±1 mark corridor", hoverinfo="skip"))
    figure.add_trace(go.Scatter(x=[0, 5], y=[0, 5], mode="lines", line={"color": gray, "width": 1}, name="Perfect agreement", hoverinfo="skip"))
    figure.add_trace(go.Scatter(x=human_marks[inside] + jitter[inside], y=model_marks[inside], mode="markers", marker={"color": blue, "size": 9, "line": {"color": "white", "width": 1}}, name="Within ±1 mark", hovertext=hover_texts[inside], hoverinfo="text"))
    figure.add_trace(go.Scatter(x=human_marks[~inside] + jitter[~inside], y=model_marks[~inside], mode="markers", marker={"color": orange, "size": 9, "line": {"color": "white", "width": 1}}, name="More than 1 mark away", hovertext=hover_texts[~inside], hoverinfo="text"))
    figure.update_xaxes(range=[-0.2, 5.2], title="Human mark (out of 5)")
    figure.update_yaxes(range=[-0.2, 5.2], title="Grader's mark (out of 5)")
    if note is not None:
        figure.add_annotation(x=0, y=-0.32, xref="paper", yref="paper", text=note, showarrow=False, xanchor="left", font={"size": 11, "color": secondary_ink})
        figure.update_layout(margin={"b": 60})
    return style(figure, title, height=height)


def first_reason_category(result):
    if len(result["review_reasons"]) == 0:
        return "Marked automatically"
    reason = result["review_reasons"][0]
    if reason.startswith("Low OCR"):
        return "Low OCR confidence"
    if "instruction-like" in reason:
        return "Instruction-like text"
    if reason.startswith("Low confidence"):
        return "Low confidence"
    if "differ by" in reason:
        return "LLM and rubric disagree"
    return "LLM not available"


def batch_routing(results):
    counts = {}
    for result in results:
        category = first_reason_category(result)
        counts[category] = counts.get(category, 0) + 1
    categories = []
    if "Marked automatically" in counts:
        categories.append("Marked automatically")
    for category in counts:
        if category != "Marked automatically":
            categories.append(category)
    colours = []
    values = []
    for category in categories:
        values.append(counts[category])
        if category == "Marked automatically":
            colours.append(blue)
        else:
            colours.append(warning_yellow)
    figure = go.Figure(go.Bar(x=values, y=categories, orientation="h", marker={"color": colours}, text=values, textposition="outside", hovertemplate="%{y}: %{x} answers<extra></extra>"))
    figure.update_yaxes(autorange="reversed", showgrid=False)
    figure.update_xaxes(title="Number of answers")
    return style(figure, "Where the answers went", height=320)


def batch_concepts(results):
    rows = {}
    for result in results:
        label = str(result["question"])
        if label not in rows:
            rows[label] = {"present": 0, "partial": 0, "missing": 0}
        for concept in result["concepts"]:
            if concept["status"] in rows[label]:
                rows[label][concept["status"]] = rows[label][concept["status"]] + 1
    labels = sorted(rows.keys())
    figure = go.Figure()
    for status, colour, name in [("present", good_green, "✓ present"), ("partial", warning_yellow, "~ partial"), ("missing", critical_red, "✗ missing")]:
        values = []
        for label in labels:
            values.append(rows[label][status])
        figure.add_trace(go.Bar(y=labels, x=values, orientation="h", name=name, marker={"color": colour, "line": {"color": "white", "width": 2}}, hovertemplate="%{y} - " + name + ": %{x}<extra></extra>"))
    figure.update_layout(barmode="stack")
    figure.update_yaxes(autorange="reversed", showgrid=False)
    figure.update_xaxes(title="Rubric concepts (all students)")
    figure = style(figure, "Rubric concepts per question", height=320)
    figure.update_layout(legend_traceorder="normal")
    return figure


def benchmark(rows):
    figure = make_subplots(rows=1, cols=2, shared_yaxes=True, subplot_titles=("Mean absolute error (marks)", "Root mean squared error (marks)"), horizontal_spacing=0.04)
    names = []
    colours = []
    for row in rows:
        names.append(row["method"])
        if row["method"].startswith("B5 v2"):
            colours.append(blue)
        else:
            colours.append(light_gray)
    for column, (metric, label) in enumerate([("mae", "MAE"), ("rmse", "RMSE")]):
        values = []
        errors = []
        texts = []
        for row in rows:
            values.append(row[metric])
            errors.append(row[metric + "_sd"])
            texts.append(str(round(row[metric], 3)))
        figure.add_trace(go.Bar(x=values, y=names, orientation="h", marker={"color": colours}, error_x={"type": "data", "array": errors, "color": secondary_ink, "thickness": 1}, text=texts, textposition="outside", showlegend=False, hovertemplate="%{y}<br>" + label + " %{x:.3f}<extra></extra>"), row=1, col=column + 1)
    figure.update_yaxes(autorange="reversed", showgrid=False)
    figure.update_xaxes(title="lower is better")
    return style(figure, "All models compared (mean ± SD over 5 folds)", height=430)


def quality(rows, band_order):
    colours = [light_gray, blue, orange, aqua]
    figure = go.Figure()
    for index, row in enumerate(rows):
        values = []
        for band in band_order:
            values.append(row[band])
        figure.add_trace(go.Bar(x=["Weak (< 2.5)", "Partial (2.5–3.9)", "Strong (≥ 4)"], y=values, name=row["method"], marker={"color": colours[index]}, text=rounded_texts(values), textposition="outside", hovertemplate=row["method"] + "<br>%{x}: MAE %{y:.3f}<extra></extra>"))
    figure.update_layout(barmode="group", bargap=0.25, bargroupgap=0.08)
    figure.update_yaxes(title="Mean absolute error (marks)")
    return style(figure, "Error by answer quality", height=430)


def human_ai_box(chart_data, human_ai):
    repeats = np.maximum(np.round(chart_data["weight"]).astype(int), 1)
    expanded = chart_data.loc[chart_data.index.repeat(repeats)]
    groups = [
        ("Teacher 2 vs teacher 1", np.abs(expanded["grader_1"] - expanded["grader_2"]), gray),
        ("Final grader vs teacher 1", np.abs(expanded["pred_B5_v2"] - expanded["grader_1"]), blue),
        ("Final grader vs teacher 2", np.abs(expanded["pred_B5_v2"] - expanded["grader_2"]), blue),
        ("Final grader vs average label", np.abs(expanded["pred_B5_v2"] - expanded["human_score"]), blue),
    ]
    figure = go.Figure()
    for label, values, colour in groups:
        figure.add_trace(go.Box(y=values, name=label, marker={"color": colour}, boxpoints=False, showlegend=False))
        figure.add_trace(go.Scatter(x=[label], y=[human_ai[label]], mode="markers+text", marker={"symbol": "diamond", "size": 12, "color": colour, "line": {"color": "white", "width": 1}}, text=["average " + str(round(human_ai[label], 2))], textposition="middle right", showlegend=False, hovertemplate=label + "<br>average difference %{y:.3f}<extra></extra>"))
    figure.update_yaxes(title="Difference in marks (out of 5)")
    return style(figure, "How far apart are two teachers, and the grader from each teacher?", height=430)


def reliability(rows):
    figure = go.Figure()
    figure.add_trace(go.Scatter(x=[0, 1], y=[0, 1], mode="lines", line={"color": gray, "dash": "dot", "width": 1}, name="Perfectly honest confidence", hoverinfo="skip"))
    x_values = []
    y_values = []
    texts = []
    hover_texts = []
    for row in rows:
        x_values.append(row["Average confidence"])
        y_values.append(row["Really within ±1 (%)"] / 100)
        texts.append(str(row["Really within ±1 (%)"]) + "%")
        hover_texts.append("Confidence " + row["Confidence"] + "<br>" + str(row["Really within ±1 (%)"]) + "% within ±1 mark<br>" + str(row["Share of answers (%)"]) + "% of answers")
    figure.add_trace(go.Scatter(x=x_values, y=y_values, mode="lines+markers+text", text=texts, textposition="top left", line={"color": blue, "width": 2}, marker={"size": 10, "line": {"color": "white", "width": 2}}, name="Our confidence score", hovertext=hover_texts, hoverinfo="text"))
    figure.update_xaxes(range=[0, 1], title="Average confidence given by the grader")
    figure.update_yaxes(range=[0, 1], title="Share really within ±1 mark")
    return style(figure, "Confidence vs reality: 0.85 and above is right 87% of the time", height=430)


def routing_sankey(routing_shares, large_errors_caught):
    labels = ["All answers (100%)", "Low confidence (< 0.60)", "LLM and rubric differ by 2+", "Instruction-like text", "No rule triggered", "Teacher review queue", "Marked automatically"]
    colours = [secondary_ink, orange, aqua, warning_yellow, blue, warning_yellow, blue]
    sources = [0, 0, 0, 1, 2, 4]
    targets = [1, 2, 4, 5, 5, 6]
    values = [routing_shares["Low confidence (< 0.60)"], routing_shares["LLM and rubric differ by 2+"], routing_shares["Auto-graded"], routing_shares["Low confidence (< 0.60)"], routing_shares["LLM and rubric differ by 2+"], routing_shares["Auto-graded"]]
    if routing_shares["Instruction-like text"] > 0:
        sources = sources + [0, 3]
        targets = targets + [3, 5]
        values = values + [routing_shares["Instruction-like text"], routing_shares["Instruction-like text"]]
    link_colours = []
    for target in targets:
        if target == 6 or target == 4:
            link_colours.append("rgba(42, 120, 214, 0.25)")
        else:
            link_colours.append("rgba(250, 178, 25, 0.35)")
    figure = go.Figure(go.Sankey(
        node={"label": labels, "color": colours, "pad": 18, "thickness": 16, "line": {"color": "white", "width": 1}},
        link={"source": sources, "target": targets, "value": values, "color": link_colours, "hovertemplate": "%{value:.1f}% of answers<extra></extra>"},
        valueformat=".1f",
        valuesuffix="%",
    ))
    figure.update_layout(font={"size": 13, "color": dark_ink})
    return style(figure, "Review routing: " + str(round(100 - routing_shares["Auto-graded"], 1)) + "% go to a teacher and they hold " + str(round(large_errors_caught, 1)) + "% of the large errors", height=420)


def robustness_changes(perturbations, injections):
    rows = []
    for row in perturbations:
        rows.append((row["Test"], row["B3 fine-tuned"], row["B2 LLM raw"], row["B5 ensemble"]))
    for row in injections:
        rows.append(("Injection: " + row["Test"], row["B3 fine-tuned"], row["B2 LLM raw"], row["B5 ensemble"]))
    labels = []
    for row in rows:
        labels.append(row[0])
    figure = go.Figure()
    for index, (name, colour) in enumerate([("B3 similarity model", blue), ("LLM raw score", orange), ("B5 (Week 5 version)", aqua)]):
        values = []
        for row in rows:
            values.append(row[index + 1])
        figure.add_trace(go.Bar(y=labels, x=values, orientation="h", name=name, marker={"color": colour}, hovertemplate=name + "<br>%{y}: %{x:+.2f} marks<extra></extra>"))
    figure.update_layout(barmode="group")
    figure.add_vline(x=0, line={"color": secondary_ink, "width": 1})
    figure.update_yaxes(autorange="reversed", showgrid=False)
    figure.update_xaxes(title="Average change in marks (out of 5)")
    return style(figure, "Changed answers: how much the mark moves", height=520)


def robustness_fake(sanity):
    labels = []
    for row in sanity:
        labels.append(row["Test"] + " (should get " + str(row["Should get"]) + ")")
    figure = go.Figure()
    for name, column, colour in [("B3 similarity model", "B3 fine-tuned", blue), ("LLM raw score", "B2 LLM raw", orange), ("B5 (Week 5 version)", "B5 ensemble", aqua)]:
        values = []
        for row in sanity:
            values.append(row[column])
        figure.add_trace(go.Bar(y=labels, x=values, orientation="h", name=name, marker={"color": colour}, text=rounded_texts(values), textposition="outside", hovertemplate=name + "<br>%{y}: %{x:.2f}<extra></extra>"))
    figure.update_layout(barmode="group")
    figure.update_yaxes(autorange="reversed", showgrid=False)
    figure.update_xaxes(range=[0, 5.8], title="Average mark (out of 5)")
    return style(figure, "Fake answers: what each model gives them", height=520)


def calibration(calibration_points, week5_line):
    grid = np.linspace(0, 5, 201)
    isotonic_line = np.interp(grid, calibration_points["input_points"], calibration_points["output_points"])
    straight_line = np.clip(week5_line["intercept"] + (week5_line["llm_weight"] + week5_line["rubric_weight"]) * grid, 0, 5)
    figure = go.Figure()
    figure.add_trace(go.Scatter(x=[0, 5], y=[0, 5], mode="lines", line={"color": gray, "dash": "dot", "width": 1}, name="No change", hoverinfo="skip"))
    figure.add_trace(go.Scatter(x=grid, y=straight_line, mode="lines", line={"color": orange, "width": 2}, name="Week 5: straight line", hovertemplate="raw %{x:.2f} -> %{y:.2f}<extra></extra>"))
    figure.add_trace(go.Scatter(x=grid, y=isotonic_line, mode="lines", line={"color": blue, "width": 2}, name="Week 6: isotonic steps", hovertemplate="raw %{x:.2f} -> %{y:.2f}<extra></extra>"))
    figure.add_annotation(x=0.05, y=isotonic_line[0], text="floor ≈ " + str(round(isotonic_line[0], 1)), showarrow=True, ax=60, ay=40, font={"color": dark_ink})
    figure.update_xaxes(range=[0, 5], title="Raw LLM score (average of LLM and rubric scores)")
    figure.update_yaxes(range=[0, 5.2], title="Calibrated mark (out of 5)")
    return style(figure, "Calibration: turning the strict LLM's score into the teachers' scale", height=430)


def topics_treemap(topics):
    labels = ["All 79 questions"]
    parents = [""]
    values = [0]
    hover_texts = [""]
    total = 0
    for topic, questions in topics.items():
        labels.append(topic)
        parents.append("All 79 questions")
        values.append(len(questions))
        total = total + len(questions)
        shown = []
        for question in questions[:8]:
            if len(question) > 70:
                shown.append(question[:70] + "…")
            else:
                shown.append(question)
        hover_texts.append("<br>".join(shown))
    values[0] = total
    figure = go.Figure(go.Treemap(
        labels=labels,
        parents=parents,
        values=values,
        branchvalues="total",
        hovertext=hover_texts,
        hovertemplate="<b>%{label}</b>: %{value} questions<br>%{hovertext}<extra></extra>",
        texttemplate="<b>%{label}</b><br>%{value} questions",
        marker={"colors": values, "colorscale": [[0, "#3987e5"], [1, "#104281"]], "line": {"color": "white", "width": 2}},
        textfont={"color": "white", "size": 14},
        root={"color": "white"},
    ))
    return style(figure, "What the questions are about (hover a topic to see its questions)", height=460)


def percent_texts(values):
    texts = []
    for value in values:
        texts.append(str(round(value)) + "%")
    return texts


def concepts_by_topic(chart_data):
    rows = []
    for topic, part in chart_data.groupby("topic"):
        present = (part["concepts_present"] * part["weight"]).sum()
        partial = (part["concepts_partial"] * part["weight"]).sum()
        missing = (part["concepts_missing"] * part["weight"]).sum()
        total = present + partial + missing
        rows.append({"topic": topic, "present": present / total * 100, "partial": partial / total * 100, "missing": missing / total * 100})
    table = pd.DataFrame(rows).sort_values("missing", ascending=False)
    figure = go.Figure()
    for status, colour, name in [("present", good_green, "✓ present"), ("partial", warning_yellow, "~ partial"), ("missing", critical_red, "✗ missing")]:
        figure.add_trace(go.Bar(y=table["topic"], x=table[status], orientation="h", name=name, marker={"color": colour, "line": {"color": "white", "width": 2}}, text=percent_texts(table[status]), textposition="inside", insidetextanchor="middle", hovertemplate="%{y} - " + name + ": %{x:.1f}%<extra></extra>"))
    figure.update_layout(barmode="stack")
    figure.update_yaxes(autorange="reversed", showgrid=False)
    figure.update_xaxes(range=[0, 100], title="Share of rubric concepts (%)")
    figure = style(figure, "Which rubric points students miss, by topic", height=460)
    figure.update_layout(legend_traceorder="normal")
    return figure


def failure_bars(example):
    scores = example["scores_out_of_5"]
    bars = [("Similarity model (B3)", scores["similarity_model"], blue), ("LLM's own score", scores["llm"], orange), ("Rubric score", scores["rubric"], orange), ("LLM after calibration", scores["llm_calibrated"], aqua), ("Final = average", scores["final"], dark_ink)]
    labels = []
    values = []
    colours = []
    for label, value, colour in bars:
        labels.append(label)
        values.append(value)
        colours.append(colour)
    figure = go.Figure(go.Bar(y=labels, x=values, orientation="h", marker={"color": colours}, text=rounded_texts(values), textposition="outside", hovertemplate="%{y}: %{x:.2f}<extra></extra>"))
    figure.add_vline(x=example["human_mark"], line={"color": critical_red, "width": 2})
    figure.add_annotation(x=example["human_mark"], y=1.08, yref="paper", text="teachers: " + str(example["human_mark"]), showarrow=False, font={"color": critical_red})
    figure.update_yaxes(autorange="reversed", showgrid=False)
    figure.update_xaxes(range=[0, 5.3], title="Marks out of 5")
    return style(figure, "Where the 3.0 comes from", height=360)
