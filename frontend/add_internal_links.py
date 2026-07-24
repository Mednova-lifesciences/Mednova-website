from pathlib import Path
import re

patterns = [
    re.compile(r"training-consulting\.html"),
    re.compile(r"MedNova-NAFDAC-QPPV-Compliance-Checklist\.pdf"),
    re.compile(r"resources/glossary/adverse-drug-reaction\.html"),
    re.compile(r"resources/glossary/good-pharmacovigilance-practice\.html"),
    re.compile(r"resources/glossary/risk-management-plan\.html"),
]

snippet = (
    "\n<section><div class=\"wrap\"><div class=\"callout\">"
    "<strong>Practical next step:</strong> For teams that want to turn this guidance into action, "
    "MedNova offers <a href=\"/training-consulting.html\">training and consulting</a> and a downloadable "
    "<a href=\"/public/downloads/MedNova-NAFDAC-QPPV-Compliance-Checklist.pdf\">checklist PDF</a> "
    "that help connect regulatory readiness, safety, and documentation practices.</div></div></section>\n"
)

files = [
    "medical-writing.html",
    "qppv-nigeria.html",
    "regulatory-intelligence.html",
    "resources/clinical-development-explained.html",
    "resources/clinical-development-readiness.html",
    "resources/clinical-trial-documentation.html",
    "resources/nafdac-market-entry-compliance.html",
    "resources/pv-readiness-guide.html",
    "resources/registration-preparation-guide.html",
    "resources/regulatory-affairs-primer.html",
    "resources/regulatory-change-briefs.html",
    "resources/site-readiness-essentials.html",
    "resources/nafdac-product-registration-guide.html",
    "resources/glossary/aggregate-reporting.html",
    "resources/glossary/clinical-trial.html",
    "resources/glossary/good-clinical-practice.html",
    "resources/glossary/icsr.html",
    "resources/glossary/literature-monitoring.html",
    "resources/glossary/medical-information.html",
    "resources/glossary/medical-writing.html",
    "resources/glossary/nafdac-registration.html",
    "resources/glossary/nafdac.html",
    "resources/glossary/pbrer.html",
    "resources/glossary/pharmacovigilance.html",
    "resources/glossary/post-marketing-surveillance.html",
    "resources/glossary/psur.html",
    "resources/glossary/qppv.html",
    "resources/glossary/regulatory-affairs.html",
    "resources/glossary/regulatory-intelligence.html",
    "resources/glossary/signal-detection.html",
    "services/clinical-development.html",
    "services/nafdac-product-registration.html",
    "services/pharmacovigilance.html",
    "services/regulatory-affairs.html",
    "services/regulatory-intelligence.html",
    "src/pages/capability-statement.html",
    "src/pages/cro.html",
    "src/pages/index.html",
    "src/pages/regulatory.html",
]

modified = []
errors = []
for rel in files:
    path = Path(rel)
    if not path.exists():
        errors.append(f"MISSING: {path}")
        continue
    txt = path.read_text(encoding="utf-8")
    if snippet.strip() in txt:
        continue
    if any(p.search(txt) for p in patterns):
        continue
    if "</main>" in txt:
        path.write_text(txt.replace("</main>", snippet + "</main>", 1), encoding="utf-8")
        modified.append(str(path))
        continue
    if "<footer" in txt:
        path.write_text(txt.replace("<footer", snippet + "<footer", 1), encoding="utf-8")
        modified.append(str(path))
        continue
    if "</body>" in txt:
        path.write_text(txt.replace("</body>", snippet + "</body>", 1), encoding="utf-8")
        modified.append(str(path))
        continue
    errors.append(f"NO_INSERT_POINT: {path}")

print(f"modified {len(modified)}")
for item in modified:
    print(item)
if errors:
    print(f"errors {len(errors)}")
    for item in errors:
        print(item)
