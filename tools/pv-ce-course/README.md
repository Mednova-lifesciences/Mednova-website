# Pharmacovigilance CE course

Live at https://mednovalife.com/pharmacovigilance-ce-course

## How it fits together

| Part | Where |
| --- | --- |
| Course as authored (modules, quizzes, certificate design) | `tools/pv-ce-course/source/Pharmacovigilance_CE_Course.html` |
| Build script (source → site page + answer key) | `tools/pv-ce-course/build.py` |
| Site page (generated, don't edit by hand) | `frontend/pharmacovigilance-ce-course.html` |
| Answer key the server grades against (generated) | `frontend/api/course-key.json` |
| API: sign-in, device codes, grading, certificates, register | `frontend/api/course.js` |
| Routes | `frontend/vercel.json` (`/pharmacovigilance-ce-course`, `/api/course`) |
| Database | Supabase project `mednova-website`, table `public.course_learners` |
| Signatory's scanned signature (optional) | `frontend/public/images/course/signature.png` |

The Vercel project's root directory is `frontend/`, so the root `vercel.json` is not used.

## Changing the course content

1. Replace or edit `source/Pharmacovigilance_CE_Course.html` (for example, a new export of the course).
2. From the repository root run:

   ```
   python tools/pv-ce-course/build.py
   ```

3. Commit **both** generated files: `frontend/pharmacovigilance-ce-course.html` and `frontend/api/course-key.json`.
   If the answer key isn't updated, learners' correct answers to new or changed questions are marked wrong.

The build applies exact find-and-replace steps to the source. If the source has changed so that a step no
longer matches, it stops with `expected 1 match(es), found 0: '…'`. Update that step in `build.py` to match the new
source. Don't remove it.

Changing questions after people have started: learners keep the scores already recorded. Changing the **number** of
modules changes what "all knowledge checks complete" means, so check the register before doing that.

## Signature on certificates

Certificates show the signatory's name in script lettering. To use a real signature, save a scan as a PNG with a
transparent (or white) background at `frontend/public/images/course/signature.png` and deploy. About 1200 × 400 px,
cropped tight to the ink, works well. No rebuild is needed: certificates pick it up the next time they are drawn,
including certificates issued earlier.

## Environment variables (Vercel, Production and Preview)

| Name | Purpose |
| --- | --- |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Database access (server only) |
| `COURSE_ADMIN_KEY` | Unlocks the completion register at `/pharmacovigilance-ce-course#register` |
| `RESEND_API_KEY`, `FROM_EMAIL` | Sign-in codes and certificate emails |
| `COURSE_NOTIFY_EMAIL` | Receives a notification for every certificate issued |

## Certificates

Certificates are issued only by the server, by the `issue_course_certificate` database function, once all knowledge
checks are complete and the final assessment is passed. Number format: `PVCE-<year>-<serial>-<check code>`, for
example `PVCE-2026-00001-K7QM`. The serial comes from the `course_cert_serial_seq` sequence, and the 4-character check
code is random so numbers can't be guessed. The number, printed name (`cert_name`), date (`earned_at`) and score
(`cert_final_score`) never change after issue. To correct a misspelled name on an issued certificate, update
`cert_name` in Supabase.

Lookup for a verification tool: `GET /api/course?action=verify&id=PVCE-2026-00001-K7QM` returns
`{ valid, certId, name, earnedAt, finalScore, course }`. The public page is `/pharmacovigilance-ce-course#verify`.

## Analytics events (Google Analytics G-70L73W3SD6)

`course_sign_in`, `course_device_confirmed`, `course_module_complete` (module_number, score, total),
`course_final_assessment` (score_percent, passed), `course_certificate_issued` (score_percent). No names, emails
or certificate numbers are sent.
