import os
import json
import requests
import pandas as pd
import streamlit as st
import charts

FOLDER = os.path.dirname(os.path.abspath(__file__))

st.set_page_config(page_title="AI Exam Answer Grader", layout="wide")

try:
    for secret_name in st.secrets:
        os.environ[secret_name] = str(st.secrets[secret_name])
except Exception:
    pass

GRADER_MODE = os.environ.get("GRADER_MODE", "api")

with open(os.path.join(FOLDER, "demo exam.json")) as file:
    demo_exam = json.load(file)


@st.cache_data
def load_evaluation():
    with open(os.path.join(FOLDER, "results", "week 6 chart summary.json")) as file:
        summary = json.load(file)
    data = pd.read_csv(os.path.join(FOLDER, "results", "week 6 chart data.csv"))
    return summary, data


evaluation_summary, evaluation_data = load_evaluation()


@st.cache_resource
def load_grader():
    import grader
    return grader


st.sidebar.title("AI Exam Answer Grader")
st.sidebar.caption("SNLP Course Project 2026 — Group 2")
if GRADER_MODE == "module":
    api_address = "http://localhost:8000"
    grader = load_grader()
else:
    api_address = st.sidebar.text_input("Grading API address", "http://localhost:8000")


def run_in_page(path, body):
    if path == "/health":
        return {"status": "ok", "similarity_model_loaded": True, "llm_available": grader.llm_is_available(), "llm_model": grader.LLM_MODEL, "llm_provider": grader.LLM_PROVIDER}
    if path == "/generate-rubric":
        concepts, source = grader.make_rubric(body["question_text"], body["reference_answer"])
        return {"rubric": concepts, "rubric_source": source}
    if path == "/evaluate-answer":
        return grader.evaluate_answer(body["question_text"], body["reference_answer"], body["student_answer"], maximum_marks=body["maximum_marks"], rubric=body.get("rubric"), question_id=body.get("question_id"), student_id=body.get("student_id"), ocr_confidence=body.get("ocr_confidence"))
    results = []
    needing_review = 0
    for record in body["answers"]:
        result = grader.evaluate_group1_record(record, body["answer_key"])
        if result["needs_human_review"]:
            needing_review = needing_review + 1
        results.append(result)
    return {"results": results, "answers_graded": len(results), "answers_needing_review": needing_review}


def call_api(path, body=None):
    if GRADER_MODE == "module":
        try:
            return run_in_page(path, body)
        except (ValueError, RuntimeError) as error:
            st.error(str(error))
            st.stop()
    try:
        if body is None:
            reply = requests.get(api_address + path, timeout=10)
        else:
            reply = requests.post(api_address + path, json=body, timeout=900)
    except requests.exceptions.ConnectionError:
        st.error("Cannot reach the grading API at " + api_address + ". Start it in a terminal inside the Week 6 folder with: uvicorn api:app --port 8000")
        st.stop()
    if reply.status_code != 200:
        st.error("The API returned an error (" + str(reply.status_code) + "): " + reply.text)
        st.stop()
    return reply.json()


if GRADER_MODE == "module":
    health = run_in_page("/health", None)
    st.sidebar.success("Grader loaded in this page (online mode)")
    if health["llm_available"]:
        st.sidebar.success("LLM grader available (" + health["llm_model"] + ")")
    else:
        st.sidebar.warning("LLM grader not available: scores will come from the similarity model only.")
else:
    try:
        health = requests.get(api_address + "/health", timeout=5).json()
        st.sidebar.success("API connected")
        if health["llm_available"]:
            st.sidebar.success("LLM grader running (" + health["llm_model"] + ")")
        else:
            st.sidebar.warning("LLM grader not running: scores will come from the similarity model only.")
    except Exception:
        health = None
        st.sidebar.error("API not reachable. Start it with: uvicorn api:app --port 8000")

st.sidebar.markdown("---")
st.sidebar.write("Marks are **recommendations**. A teacher makes the final decision, especially for answers marked for review.")
if GRADER_MODE == "module" and grader.LLM_PROVIDER != "ollama":
    st.sidebar.warning("**Online demo:** answer text is sent to a hosted LLM service (" + grader.LLM_MODEL + "). Use only the sample answers or made-up text, never real student answers. The private version runs entirely on the teacher's own computer.")
else:
    st.sidebar.write("Everything runs on this computer; no answer text is sent to an external AI service.")


status_labels = {"present": "✅ present", "partial": "🟡 partial", "missing": "❌ missing"}


def show_result(result, human_mark=None, key_prefix="single"):
    columns = st.columns(4)
    columns[0].metric("Recommended score", str(result["score"]) + " / " + str(result["maximum_score"]))
    columns[1].metric("Confidence", str(round(result["confidence"] * 100)) + "%")
    columns[1].progress(float(result["confidence"]))
    if result["needs_human_review"]:
        columns[2].metric("Review needed", "Yes")
    else:
        columns[2].metric("Review needed", "No")
    if human_mark is not None:
        columns[3].metric("Human mark", str(human_mark) + " / " + str(result["maximum_score"]))
    if result["needs_human_review"]:
        for reason in result["review_reasons"]:
            st.warning("⚠️ " + reason)
    elif result["grading_mode"] == "blank_answer":
        st.info("ℹ️ Blank answer: scored 0 without calling the models.")
    else:
        st.success("✅ No teacher review needed: the similarity model and the LLM agree.")
    st.markdown("**Feedback**")
    st.info(result["feedback"])
    if len(result["concepts"]) > 0:
        concept_rows = []
        for concept in result["concepts"]:
            concept_rows.append({"Rubric concept": concept["concept"], "Status": status_labels.get(concept["status"], concept["status"]), "Student's words (evidence)": concept["evidence"]})
        st.markdown("**Rubric check** (rubric source: " + str(result["rubric_source"]) + ")")
        st.dataframe(pd.DataFrame(concept_rows), hide_index=True)
    if len(result["wrong_statements"]) > 0:
        st.markdown("**Statements the LLM judged to be wrong**")
        for statement in result["wrong_statements"]:
            st.error("❌ " + statement)
    if result["grading_mode"] == "full" and "rubric_before_penalty" in result["scores_out_of_5"]:
        st.markdown("**📈 Behind this mark**")
        chart_columns = st.columns(2)
        with chart_columns[0]:
            st.plotly_chart(charts.score_waterfall(result["scores_out_of_5"]), theme=None, key=key_prefix + " waterfall")
            st.caption("Each bar is one real step of the calculation on a 0–5 scale. The final mark is then scaled to the maximum marks and rounded to 0.5. The similarity model alone gave " + str(result["scores_out_of_5"]["similarity_model"]) + " out of 5.")
        with chart_columns[1]:
            st.plotly_chart(charts.confidence_check(evaluation_summary["reliability"], result["confidence"]), theme=None, key=key_prefix + " confidence")
            st.caption(charts.reliability_text(evaluation_summary["reliability"], result["confidence"]))
    with st.expander("Score details (0–5 scale) and raw JSON response"):
        st.write("Grading mode: " + result["grading_mode"] + " | time: " + str(result["seconds"]) + " seconds")
        st.json(result)


def load_example():
    for example in demo_exam["single_examples"]:
        if example["title"] == st.session_state["example_title"]:
            st.session_state["question_text"] = example["question_text"]
            st.session_state["reference_answer"] = example["reference_answer"]
            st.session_state["student_answer"] = example["student_answer"]
            st.session_state["maximum_marks"] = float(example["maximum_marks"])
            st.session_state["rubric_text"] = ""
            st.session_state["human_mark"] = example["human_mark"]
            st.session_state["single_result"] = None


def suggest_rubric():
    body = {"question_text": st.session_state["question_text"], "reference_answer": st.session_state["reference_answer"]}
    st.session_state["rubric_error"] = None
    try:
        if GRADER_MODE == "module":
            rubric_reply = run_in_page("/generate-rubric", body)
        else:
            reply = requests.post(api_address + "/generate-rubric", json=body, timeout=300)
            if reply.status_code != 200:
                st.session_state["rubric_error"] = "The API returned an error (" + str(reply.status_code) + "): " + reply.text
                return
            rubric_reply = reply.json()
        st.session_state["rubric_text"] = "\n".join(rubric_reply["rubric"])
    except Exception as error:
        st.session_state["rubric_error"] = "Could not suggest a rubric: " + str(error)


if "question_text" not in st.session_state:
    st.session_state["example_title"] = demo_exam["single_examples"][0]["title"]
    load_example()

st.title(":blue[📝 AI Exam Answer Grader]")
st.caption("Recommends a mark, feedback and a confidence score by checking a student's answer against the reference answer and a marking rubric. A teacher makes the final decision.")

single_tab, batch_tab, results_tab, api_tab = st.tabs(["✏️ Grade one answer", "📄 Grade answer sheets (Group 1 format)", "📊 Evaluation results", "🔌 Use the API"])

with single_tab:
    st.subheader("Grade one answer")
    example_titles = []
    for example in demo_exam["single_examples"]:
        example_titles.append(example["title"])
    st.selectbox("Load an example from the Mohler dataset", example_titles, key="example_title", on_change=load_example)

    left, right = st.columns(2)
    with left:
        st.text_input("Question label", "Q1", key="question_id")
        st.text_area("Question", key="question_text", height=80)
        st.text_area("Reference answer", key="reference_answer", height=110)
        st.number_input("Maximum marks", min_value=1.0, max_value=100.0, step=1.0, key="maximum_marks")
    with right:
        st.text_area("Marking rubric (optional, one key concept per line)", key="rubric_text", height=110)
        st.button("Suggest a rubric from the reference answer", on_click=suggest_rubric)
        if st.session_state.get("rubric_error"):
            st.error(st.session_state["rubric_error"])
        st.text_area("Student answer", key="student_answer", height=110)
        from_ocr = st.checkbox("This answer comes from OCR (Group 1)")
        ocr_confidence = None
        if from_ocr:
            ocr_confidence = st.slider("OCR confidence", 0.0, 1.0, 0.9, 0.01)

    if st.button("Grade answer", type="primary"):
        rubric = []
        for line in st.session_state["rubric_text"].split("\n"):
            if line.strip() != "":
                rubric.append(line.strip())
        if len(rubric) == 0:
            rubric = None
        request_body = {
            "question_id": st.session_state["question_id"],
            "question_text": st.session_state["question_text"],
            "reference_answer": st.session_state["reference_answer"],
            "student_answer": st.session_state["student_answer"],
            "maximum_marks": st.session_state["maximum_marks"],
            "rubric": rubric,
            "ocr_confidence": ocr_confidence,
        }
        with st.spinner("Grading... (the LLM step takes about 10 seconds)"):
            st.session_state["single_result"] = call_api("/evaluate-answer", request_body)

    if st.session_state.get("single_result") is not None:
        human_mark = st.session_state.get("human_mark")
        if human_mark is not None:
            human_mark = round(human_mark / 5 * st.session_state["maximum_marks"], 2)
        show_result(st.session_state["single_result"], human_mark, "single")

def batch_overview(batch_result, human_marks):
    st.markdown("**📊 Batch overview**")
    corridor_human = []
    corridor_model = []
    corridor_hover = []
    for result in batch_result["results"]:
        key = str(result["student_id"]) + " " + str(result["question"])
        if human_marks.get(key) is not None:
            corridor_human.append(human_marks[key] / result["maximum_score"] * 5)
            corridor_model.append(result["score"] / result["maximum_score"] * 5)
            corridor_hover.append(key + "<br>human " + str(human_marks[key]) + " / " + str(result["maximum_score"]) + "<br>grader " + str(result["score"]) + " / " + str(result["maximum_score"]))
    overview_columns = st.columns(2)
    with overview_columns[0]:
        if len(corridor_human) > 0:
            st.plotly_chart(charts.corridor(corridor_human, corridor_model, corridor_hover, "Grader vs human marks (scaled to 5)", height=420), theme=None, key="batch corridor")
            st.caption("Dots inside the blue band are within ±1 mark (on a 5-mark scale) of the human mark.")
        else:
            st.info("No human marks in this file, so the agreement chart is not shown.")
    with overview_columns[1]:
        st.plotly_chart(charts.batch_routing(batch_result["results"]), theme=None, key="batch routing")
        st.caption("Answers marked automatically, and the reason each other answer was sent to the teacher.")
    st.plotly_chart(charts.batch_concepts(batch_result["results"]), theme=None, key="batch concepts")
    st.caption("How many rubric points were present, partly present or missing across all students, per question: a quick view of class-wide gaps.")


def batch_section(exam):
    with st.expander("Answer key"):
        key_rows = []
        for label, item in exam["answer_key"].items():
            key_rows.append({"Question": label, "Question text": item["question_text"], "Reference answer": item["reference_answer"], "Maximum marks": item["maximum_marks"]})
        st.dataframe(pd.DataFrame(key_rows), hide_index=True)
    st.dataframe(pd.DataFrame(exam["answers"]), hide_index=True)

    if st.button("Grade all answers", type="primary"):
        with st.spinner("Grading " + str(len(exam["answers"])) + " answers (about 10 seconds each)..."):
            st.session_state["batch_result"] = call_api("/evaluate-batch", {"answer_key": exam["answer_key"], "answers": exam["answers"]})

    batch_result = st.session_state.get("batch_result")
    if batch_result is None:
        return
    st.write(str(batch_result["answers_graded"]) + " answers graded, " + str(batch_result["answers_needing_review"]) + " marked for teacher review.")
    human_marks = exam.get("human_marks", {})
    result_rows = []
    for result in batch_result["results"]:
        if result["needs_human_review"]:
            status = "⚠️ Review"
        else:
            status = "✅ OK"
        result_rows.append({
            "Status": status,
            "Student": result["student_id"],
            "Question": result["question"],
            "Recommended": result["score"],
            "Out of": result["maximum_score"],
            "Confidence": result["confidence"],
            "Needs review": result["needs_human_review"],
            "Human mark (dataset)": human_marks.get(str(result["student_id"]) + " " + str(result["question"])),
            "Teacher's final mark": result["score"],
            "Teacher comment": "",
        })
    st.markdown("**Teacher review** — edit the final mark and comment; only the last two columns can be changed.")
    reviewed = st.data_editor(
        pd.DataFrame(result_rows),
        hide_index=True,
        disabled=["Status", "Student", "Question", "Recommended", "Out of", "Confidence", "Needs review", "Human mark (dataset)"],
        column_config={"Confidence": st.column_config.ProgressColumn("Confidence", min_value=0.0, max_value=1.0, format="%.2f")},
    )
    st.download_button("Download the reviewed marks (CSV)", reviewed.to_csv(index=False), file_name="reviewed marks.csv", mime="text/csv")

    batch_overview(batch_result, human_marks)

    detail_labels = []
    for result in batch_result["results"]:
        detail_labels.append(str(result["student_id"]) + " — " + str(result["question"]))
    chosen = st.selectbox("Show the full feedback for", detail_labels)
    chosen_result = batch_result["results"][detail_labels.index(chosen)]
    show_result(chosen_result, human_marks.get(str(chosen_result["student_id"]) + " " + str(chosen_result["question"])), "batch")


with batch_tab:
    st.subheader("Grade answer sheets in Group 1's digitizer format")
    st.write("Each answer is a record with student_id, question, answer_text, page and confidence (the output format of Group 1's Handwritten Exam Digitizer). An answer key gives the question, reference answer and maximum marks for each question label.")
    source = st.radio("Answers to grade", ["Sample exam built from the Mohler dataset", "Upload a JSON file"], horizontal=True)
    if source == "Upload a JSON file":
        uploaded = st.file_uploader("JSON file with 'answer_key' and 'answers' (same layout as demo exam.json)", type="json")
        if uploaded is not None:
            batch_section(json.load(uploaded))
    else:
        st.caption(demo_exam["description"])
        batch_section(demo_exam)


def show_evaluation_results():
    st.subheader("How well does the grader work?")
    st.caption("All results come from the Week 5 & 6 evaluation: 450 Mohler answers to questions the models had never seen, weighted so they represent all 2,254 answers. These are measured results, not demo examples.")
    final_mae = None
    for row in evaluation_summary["benchmark"]:
        if row["method"].startswith("B5 v2"):
            final_mae = row["mae"]
    tiles = st.columns(4)
    tiles[0].metric("Average error (out of 5)", str(round(final_mae, 2)) + " marks")
    tiles[1].metric("Within ±1 mark of the teachers", str(round(evaluation_summary["within_one_weighted"])) + "%")
    tiles[2].metric("Sent to a teacher", str(round(evaluation_summary["review_share"], 1)) + "%", "catches " + str(round(evaluation_summary["large_errors_caught"])) + "% of large errors", delta_color="off")
    tiles[3].metric("Two teachers differ by", str(round(evaluation_summary["human_ai"]["Teacher 2 vs teacher 1"], 2)) + " marks")

    st.markdown("### 1. How accurate is it?")
    st.plotly_chart(charts.benchmark(evaluation_summary["benchmark"]), theme=None, key="results benchmark")
    st.caption("Lower is better. The two LLM-based models have the lowest errors: B2 v2 has the lowest MAE (0.553) and the final grader B5 v2 the lowest RMSE (0.766), so it makes fewer big mistakes. The difference between them is small.")
    corridor_hover = []
    for i, row in evaluation_data.iterrows():
        corridor_hover.append(str(row["question"])[:60] + "<br>human " + str(row["human_score"]) + " | grader " + str(round(row["pred_B5_v2"], 2)))
    note = "450 sampled answers; weak answers are over-represented, so " + str(round(evaluation_summary["within_one_sample"])) + "% of these dots are inside the band. " + str(round(evaluation_summary["within_one_weighted"], 1)) + "% is the weighted estimate for all answers."
    st.plotly_chart(charts.corridor(evaluation_data["human_score"], evaluation_data["pred_B5_v2"], corridor_hover, str(round(evaluation_summary["within_one_weighted"])) + "% of answers fall within ±1 mark of the teachers", note=note, height=540), theme=None, key="results corridor")

    st.markdown("### 2. Where does it struggle?")
    st.plotly_chart(charts.quality(evaluation_summary["quality"], evaluation_summary["band_order"]), theme=None, key="results quality")
    st.caption("Similarity models struggle on weak answers (B3: 1.50 marks off) because a wrong answer can use the right words. The LLM, which checks correctness, is best there (1.02); the final grader is best on strong answers.")
    st.plotly_chart(charts.human_ai_box(evaluation_data, evaluation_summary["human_ai"]), theme=None, key="results human ai")
    st.caption("Two teachers differ by 0.72 marks on average. The final grader is 0.60 marks from teacher 2 and 0.82 from teacher 1, the stricter one. It was trained on the average of both teachers, which favours it, so this does not prove it is as good as a teacher.")

    st.markdown("### 3. Can we trust it?")
    st.plotly_chart(charts.reliability(evaluation_summary["reliability"]), theme=None, key="results reliability")
    st.caption("If the confidence were perfect, every point would sit on the dotted line. High confidence is honest; the small low-confidence group (4.5% of answers) is right only 27% of the time, which is why those answers go to a teacher.")
    st.plotly_chart(charts.routing_sankey(evaluation_summary["routing_shares"], evaluation_summary["large_errors_caught"]), theme=None, key="results routing")
    st.caption("Answers meeting several rules are counted under the first. No real Mohler answer contained instruction-like text, so that rule sends 0% here. In the robustness tests, the review rules sent all 10 injections that raised the LLM's mark to a teacher (a rule designed after seeing those tests).")
    robustness_columns = st.columns(2)
    with robustness_columns[0]:
        st.plotly_chart(charts.robustness_changes(evaluation_summary["robustness_perturbations"], evaluation_summary["robustness_injection"]), theme=None, key="results robustness changes")
        st.caption("Spelling mistakes and padding cost LLM marks; cutting an answer to 3 words lowers every model, as it should.")
    with robustness_columns[1]:
        st.plotly_chart(charts.robustness_fake(evaluation_summary["robustness_sanity"]), theme=None, key="results robustness fake")
        st.caption("A list of keywords fools the similarity model (4.81 out of 5); the LLM gives it much less (2.91), but still 4.5 to 4 of the 11 lists.")

    st.markdown("### 4. Under the hood")
    st.plotly_chart(charts.calibration(evaluation_summary["calibration_isotonic"], evaluation_summary["calibration_week5_line"]), theme=None, key="results calibration")
    st.caption("The LLM marks much more strictly than the Mohler teachers, so its score is mapped to their scale. Both mappings start near 2.8, because answers the LLM scores 0 averaged about 2.8 from the teachers.")
    failure = evaluation_summary["examples"]["Wrong answer on the right topic (known failure)"]
    st.markdown("**Known failure (handout Part G): a wrong answer on the right topic**")
    failure_columns = st.columns([1, 1.2])
    with failure_columns[0]:
        st.write("**Question:** " + failure["question_text"])
        st.write("**Student:** \"" + failure["student_answer"] + "\"")
        st.error("Teachers gave " + str(failure["human_mark"]) + " / 5. The grader gave " + str(failure["score"]) + " / 5 with " + str(round(failure["confidence"] * 100)) + "% confidence and no review flag.")
        st.write("**Why:** the LLM is right (\"first in last out\" describes a stack) and gives 0, but the similarity model sees the reference's words and gives " + str(round(failure["scores_out_of_5"]["similarity_model"], 1)) + ", and calibration turns the LLM's 0 into " + str(round(failure["scores_out_of_5"]["llm_calibrated"], 1)) + ". The two scores agree, so confidence stays high.")
    with failure_columns[1]:
        st.plotly_chart(charts.failure_bars(failure), theme=None, key="results failure")

    st.markdown("### 5. The data")
    data_columns = st.columns([1.3, 1])
    with data_columns[0]:
        st.plotly_chart(charts.topics_treemap(evaluation_summary["topics"]), theme=None, key="results topics")
    with data_columns[1]:
        st.image(os.path.join(FOLDER, "results", "charts", "word cloud.png"), caption="Most frequent words in the questions and reference answers", width="stretch")
    st.plotly_chart(charts.concepts_by_topic(evaluation_data), theme=None, key="results concepts")
    st.caption("For each evaluated answer, the LLM's check of every rubric point, grouped by topic (weighted). Topics are assigned by keywords in the question.")


with results_tab:
    show_evaluation_results()


with api_tab:
    st.subheader("Use the grader from another application")
    if GRADER_MODE == "module":
        st.info("This online page runs the grading module (grader.py) directly. To use the grader from another program, run the web API on your own computer from the project folder with: uvicorn api:app --port 8000. Interactive documentation is then at http://localhost:8000/docs.")
    else:
        st.write("The grader is a web API. Any program that can send JSON over HTTP can use it. Interactive documentation with every field explained: " + api_address + "/docs")
    st.markdown("""
| Endpoint | What it does |
|---|---|
| `GET /health` | Checks that the service and the LLM are ready |
| `POST /generate-rubric` | Makes a rubric from a reference answer for a teacher to check |
| `POST /evaluate-answer` | Grades one answer: score, feedback, confidence, review flags |
| `POST /evaluate-batch` | Grades a list of answers in Group 1's digitizer format |
""")
    example_request = {
        "question_id": st.session_state.get("question_id", "Q1"),
        "question_text": st.session_state["question_text"],
        "reference_answer": st.session_state["reference_answer"],
        "student_answer": st.session_state["student_answer"],
        "maximum_marks": st.session_state["maximum_marks"],
    }
    st.markdown("**Example request** (the answer currently on the 'Grade one answer' page)")
    st.code(json.dumps(example_request, indent=2), language="json")
    st.markdown("**Python**")
    st.code('import requests\n\nreply = requests.post("' + api_address + '/evaluate-answer", json=request_body)\nresult = reply.json()\nprint(result["score"], result["maximum_score"], result["confidence"], result["needs_human_review"])', language="python")
    st.markdown("**Command line**")
    st.code("curl -X POST " + api_address + "/evaluate-answer -H 'Content-Type: application/json' -d @request.json", language="bash")
