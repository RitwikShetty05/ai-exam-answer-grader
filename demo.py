import os
import json
import requests
import pandas as pd
import streamlit as st

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


def show_result(result, human_mark=None):
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


if "question_text" not in st.session_state:
    st.session_state["example_title"] = demo_exam["single_examples"][0]["title"]
    load_example()

st.title(":blue[📝 AI Exam Answer Grader]")
st.caption("Recommends a mark, feedback and a confidence score by checking a student's answer against the reference answer and a marking rubric. A teacher makes the final decision.")

single_tab, batch_tab, api_tab = st.tabs(["✏️ Grade one answer", "📄 Grade answer sheets (Group 1 format)", "🔌 Use the API"])

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
        if st.button("Suggest a rubric from the reference answer"):
            rubric_reply = call_api("/generate-rubric", {"question_text": st.session_state["question_text"], "reference_answer": st.session_state["reference_answer"]})
            st.session_state["rubric_text"] = "\n".join(rubric_reply["rubric"])
            st.rerun()
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
        show_result(st.session_state["single_result"], human_mark)

with batch_tab:
    st.subheader("Grade answer sheets in Group 1's digitizer format")
    st.write("Each answer is a record with student_id, question, answer_text, page and confidence (the output format of Group 1's Handwritten Exam Digitizer). An answer key gives the question, reference answer and maximum marks for each question label.")
    source = st.radio("Answers to grade", ["Sample exam built from the Mohler dataset", "Upload a JSON file"], horizontal=True)
    exam = demo_exam
    if source == "Upload a JSON file":
        uploaded = st.file_uploader("JSON file with 'answer_key' and 'answers' (same layout as demo exam.json)", type="json")
        if uploaded is None:
            st.stop()
        exam = json.load(uploaded)
    else:
        st.caption(demo_exam["description"])

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
    if batch_result is not None:
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

        detail_labels = []
        for result in batch_result["results"]:
            detail_labels.append(str(result["student_id"]) + " — " + str(result["question"]))
        chosen = st.selectbox("Show the full feedback for", detail_labels)
        chosen_result = batch_result["results"][detail_labels.index(chosen)]
        show_result(chosen_result, human_marks.get(str(chosen_result["student_id"]) + " " + str(chosen_result["question"])))

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
