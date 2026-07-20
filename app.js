/* ============================================================
   BEU HUB — app.js
   All logic is client-side. No login/auth. Attendance, timetable,
   CGPA and chat history live in localStorage on the user's device.
   ============================================================ */

const LS = {
  theme:'beu_theme', attendance:'beu_attendance', cgpa:'beu_cgpa',
  timetable:'beu_timetable', reviews:'beu_reviews', chat:'beu_ai_chat',
  premium:'beu_premium', aiEndpoint:'beu_ai_endpoint',
  professors:'beu_professors', profRatings:'beu_prof_ratings', syllabusProgress:'beu_syllabus_progress',
  questions:'beu_questions', answers:'beu_answers',
  studentName:'beu_student_name', studentBranch:'beu_student_branch', studentSem:'beu_student_sem',
  quizProgress:'beu_quiz_progress', adminMode:'beu_admin_mode',
  lastResource:'beu_last_resource', exams:'beu_exams'
};

/* If you set APP_SHARED_SECRET on your Worker (see worker.js / AI-SETUP.md),
   put the same value here so requests from this app are accepted. This is
   NOT a real secret — anyone can read it via "view source" — it only filters
   out casual bots/scrapers. Real protection is the Worker's origin lock and
   rate limits. Leave blank if you didn't set APP_SHARED_SECRET on the Worker. */
const APP_SHARED_SECRET = '';

/* ---------- Admin Mode (moderation toggle) ----------
   IMPORTANT: this is a client-side convenience toggle, NOT real security —
   anyone can read this passphrase via "view source". It's meant to hide
   delete buttons from casual visitors, not to stop a determined bad actor.
   Whether a delete actually goes through (once Firebase is connected) is
   controlled entirely by your Firestore security rules — see the note in
   firebase-config.js. Change this passphrase before you deploy. */
const ADMIN_PASSPHRASE = 'beuadmin2026';

function isAdminMode(){ return store.get(LS.adminMode, false); }
function initAdminMode(){
  const link = $('#adminModeLink');
  if(!link) return;
  if(isAdminMode()) link.textContent = 'Admin ✓ (click to exit)';
  link.addEventListener('click', (e)=>{
    e.preventDefault();
    if(isAdminMode()){
      store.set(LS.adminMode, false);
      toast('Admin mode off');
      link.textContent = 'Admin';
    } else {
      const entered = prompt('Admin passphrase:');
      if(entered === ADMIN_PASSPHRASE){
        store.set(LS.adminMode, true);
        toast('Admin mode on — delete buttons now show on Q&A and Professors');
        link.textContent = 'Admin ✓ (click to exit)';
      } else if(entered !== null){
        toast('Wrong passphrase');
      }
    }
    renderQuestionList(); renderProfessorList();
  });
}

const $ = (sel, ctx=document) => ctx.querySelector(sel);
const $$ = (sel, ctx=document) => [...ctx.querySelectorAll(sel)];
const store = {
  get(k, fallback){ try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }catch(e){ return fallback; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};

function toast(msg){
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 2200);
}

/* Escape any user-entered text before it goes into innerHTML.
   Attendance subject names, timetable entries, review text, CGPA labels,
   and AI chat messages are all typed by the person using the device —
   without this, someone could type e.g. <img src=x onerror=...> into a
   field and have it execute as real HTML the next time it's rendered. */
function escapeHtml(str){
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ============================== THEME ============================== */
const Theme = {
  init(){
    const saved = store.get(LS.theme, 'system');
    this.apply(saved);
    $$('.theme-toggle').forEach(btn=>btn.addEventListener('click', ()=>this.cycle()));
  },
  apply(mode){
    let effective = mode;
    if(mode === 'system'){
      effective = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', effective);
    document.documentElement.setAttribute('data-theme-pref', mode);
    store.set(LS.theme, mode);
    $$('.theme-icon').forEach(i=> i.textContent = mode==='system' ? '🖥️' : (effective==='dark' ? '🌙' : '☀️'));
  },
  cycle(){
    const order = ['light','dark','system'];
    const cur = store.get(LS.theme,'system');
    const next = order[(order.indexOf(cur)+1)%order.length];
    this.apply(next);
    toast('Theme: ' + next);
  }
};

/* ============================== NAV / DRAWER ============================== */
function initNav(){
  const overlay = $('#drawerOverlay'), drawer = $('#drawer');
  $('#hamburgerBtn').addEventListener('click', ()=>{ overlay.classList.add('open'); drawer.classList.add('open'); });
  overlay.addEventListener('click', ()=>{ overlay.classList.remove('open'); drawer.classList.remove('open'); });
  $$('#drawer a, .bottom-nav a, .nav-links a').forEach(a=>{
    a.addEventListener('click', ()=>{ overlay.classList.remove('open'); drawer.classList.remove('open'); });
  });
}

/* ============================== PANEL (modal) SYSTEM ============================== */
function openPanel(html, title){
  const overlay = $('#panelOverlay');
  $('#panelTitle').textContent = title || '';
  $('#panelBody').innerHTML = html;
  overlay.classList.add('open');
}
function closePanel(){ $('#panelOverlay').classList.remove('open'); }

/* Attempt in-app embed. Most official/government sites (BEU, gov.in, aicte etc.)
   send an X-Frame-Options / CSP header that blocks embedding — the browser blocks
   it silently, no JS error ever fires, so we can't reliably detect success.
   To avoid the "nothing happens" confusion, we show a working button immediately
   instead of waiting on the iframe. */
function openEmbed(url, title){
  const html = `
    <div class="embed-fallback" style="padding:16px 4px 6px; text-align:left;">
      <p class="muted" style="font-size:.85rem;">Many official/government sites block being shown inside other apps for security (BEU's site included). If the preview below stays blank, use this button — it always works:</p>
      <a class="btn btn-primary btn-block mt-8" href="${url}" target="_blank" rel="noopener noreferrer">Open ${title} ↗</a>
    </div>
    <p class="muted mt-16" style="font-size:.78rem;">Trying in-app preview below anyway:</p>
    <iframe class="iframe-embed mt-8" src="${url}" referrerpolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
  `;
  openPanel(html, title);
}

/* ============================== DATA ============================== */
const BRANCHES = ['CSE','IT','ECE','EE','ME','CE','CSE (AI & ML)','CSE (Data Science)'];
const SEMESTERS = [1,2,3,4,5,6,7,8];

const SUBJECTS = {
  1: ['Engineering Mathematics I','Engineering Physics','Basic Electrical Engineering','Programming in C','Engineering Drawing','Communication Skills'],
  2: ['Engineering Mathematics II','Engineering Chemistry','Basic Electronics','Elements of Mechanical Engineering','Environmental Science','Workshop Practice'],
  3: ['Engineering Mathematics III','Data Structures','Digital Electronics','Object Oriented Programming','Electric Circuit Theory'],
  4: ['Discrete Mathematics','Computer Organization','Design & Analysis of Algorithms','Operating Systems','Database Management Systems'],
  5: ['Theory of Computation','Computer Networks','Software Engineering','Microprocessors','Elective I'],
  6: ['Compiler Design','Artificial Intelligence','Web Technology','Elective II','Minor Project'],
  7: ['Machine Learning','Cloud Computing','Cyber Security','Elective III','Major Project I'],
  8: ['Distributed Systems','Elective IV','Major Project II','Industrial Training / Internship']
};
function subjectsFor(sem, branch){
  if(branch && BRANCH_SUBJECTS[branch] && BRANCH_SUBJECTS[branch][sem]) return BRANCH_SUBJECTS[branch][sem];
  return SUBJECTS[sem] || ['Subject A','Subject B','Subject C'];
}

/* Branch-specific overrides — filled in as real subject lists are confirmed.
   CSE Semester 3 below matches the actual BEU 2025 3rd-sem question papers on file. */
const BRANCH_SUBJECTS = {
  CSE: {
    1: ['Basic Electronics Engineering', 'Chemistry', 'Engineering Mathematics I', 'Engineering Physics', 'English', 'IT Workshop', 'Programming for Problem Solving'],
    2: ['Chemistry', 'Engineering Mathematics II', 'Engineering Physics', 'Python Programming', 'Web Design'],
    3: ['Data Structure and Algorithms', 'Digital Electronics', 'Discrete Mathematics and Graph Theory', 'Object Oriented Programming (Java)', 'Operating System'],
    4: ['Computer Organization and Architecture', 'Computer Networks', 'Database Management Systems', 'Design and Analysis of Algorithms', 'Effective Technical Communication', 'Formal Language and Automata Theory']
  },
  ECE: {
    1: ['Basic Electronics Engineering', 'Chemistry', 'Engineering Mathematics I', 'Engineering Physics', 'English', 'IT Workshop', 'Programming for Problem Solving'],
    2: ['Chemistry', 'Engineering Mathematics II', 'Engineering Physics', 'Python Programming', 'Web Design'],
    3: ['Analog Electronic Circuits', 'Data Structure and Algorithms', 'Digital Electronics', 'Electrical Circuit Analysis', 'Electromagnetic Fields', 'Engineering Mathematics III', 'Engineering Mechanics', 'Object Oriented Programming (C++)', 'Technical Writing']
  },
  ME: {
    1: ['Basic Electronics Engineering', 'Chemistry', 'Engineering Mathematics I', 'Engineering Physics', 'English', 'IT Workshop', 'Programming for Problem Solving'],
    2: ['Chemistry', 'Engineering Mathematics II', 'Engineering Physics', 'Python Programming', 'Web Design'],
    3: ['Analog Electronic Circuits', 'Basic Electronics Engineering', 'Digital Electronics', 'Discrete Mathematics and Graph Theory', 'Electrical Circuit Analysis', 'Electromagnetic Fields', 'Engineering Mathematics III', 'Engineering Mechanics']
  },
  CE: {
    1: ['Basic Electronics Engineering', 'Chemistry', 'Engineering Mathematics I', 'Engineering Physics', 'English', 'IT Workshop', 'Programming for Problem Solving'],
    2: ['Chemistry', 'Engineering Mathematics II', 'Engineering Physics', 'Python Programming', 'Web Design'],
    3: ['Computer-Aided Civil Engineering Drawing', 'Introduction to Civil Engineering', 'Surveying and Geomatics']
  },
  IT: {
    1: ['Basic Electronics Engineering', 'Chemistry', 'Engineering Mathematics I', 'Engineering Physics', 'English', 'IT Workshop', 'Programming for Problem Solving'],
    2: ['Chemistry', 'Engineering Mathematics II', 'Engineering Physics', 'Python Programming', 'Web Design']
  },
  EE: {
    1: ['Basic Electronics Engineering', 'Chemistry', 'Engineering Mathematics I', 'Engineering Physics', 'English', 'IT Workshop', 'Programming for Problem Solving'],
    2: ['Chemistry', 'Engineering Mathematics II', 'Engineering Physics', 'Python Programming', 'Web Design']
  },
  'CSE (AI & ML)': {
    1: ['Basic Electronics Engineering', 'Chemistry', 'Engineering Mathematics I', 'Engineering Physics', 'English', 'IT Workshop', 'Programming for Problem Solving'],
    2: ['Chemistry', 'Engineering Mathematics II', 'Engineering Physics', 'Python Programming', 'Web Design']
  },
  'CSE (Data Science)': {
    1: ['Basic Electronics Engineering', 'Chemistry', 'Engineering Mathematics I', 'Engineering Physics', 'English', 'IT Workshop', 'Programming for Problem Solving'],
    2: ['Chemistry', 'Engineering Mathematics II', 'Engineering Physics', 'Python Programming', 'Web Design']
  }
};

/* ============================================================
   ADMIN: ADD YOUR REAL FILE LINKS HERE.
   Each entry key = `${branch}__${sem}__${subjectName}` (must match
   the subject spelling exactly as it appears in SUBJECTS above).
   Value = a direct link to the PDF (Google Drive "share" link,
   your own file host, etc.). Anything not listed here will show
   "Not uploaded yet" on the site automatically — that's expected
   until you fill this in.
   Example:
     pyq: { 'CSE__3__Data Structures': 'https://drive.google.com/file/d/XXXX/view' }
   ============================================================ */
const RESOURCE_FILES = {
  pyq: {
    // CSE — Semester 1 — BEU question papers (2022–2024, multiple years merged per subject)
    'CSE__1__Basic Electronics Engineering': './pyqs/cse-sem1-basic-electronics-engineering.pdf',
    'CSE__1__Chemistry': './pyqs/cse-sem1-chemistry.pdf',
    'CSE__1__Engineering Mathematics I': './pyqs/cse-sem1-engineering-mathematics-i.pdf',
    'CSE__1__Engineering Physics': './pyqs/cse-sem1-engineering-physics.pdf',
    'CSE__1__English': './pyqs/cse-sem1-english.pdf',
    'CSE__1__IT Workshop': './pyqs/cse-sem1-it-workshop.pdf',
    'CSE__1__Programming for Problem Solving': './pyqs/cse-sem1-programming-for-problem-solving.pdf',
    // CSE — Semester 2
    'CSE__2__Chemistry': './pyqs/cse-sem2-chemistry.pdf',
    'CSE__2__Engineering Physics': './pyqs/cse-sem2-engineering-physics.pdf',
    // CSE — Semester 3 — BEU 2025 question papers (uploaded & split by admin)
    'CSE__3__Data Structure and Algorithms': './pyqs/cse-sem3-data-structure-and-algorithms.pdf',
    'CSE__3__Object Oriented Programming (Java)': './pyqs/cse-sem3-object-oriented-programming.pdf',
    'CSE__3__Discrete Mathematics and Graph Theory': './pyqs/cse-sem3-discrete-mathematics-graph-theory.pdf',
    'CSE__3__Operating System': './pyqs/cse-sem3-operating-system.pdf',
    // CSE — Semester 4 — BEU question papers (2014–2025, multiple years merged per subject)
    'CSE__4__Computer Organization and Architecture': './pyqs/cse-sem4-computer-organization-and-architecture.pdf',
    'CSE__4__Design and Analysis of Algorithms': './pyqs/cse-sem4-design-and-analysis-of-algorithms.pdf',
    // Note: source papers for this file are BEU 5th/6th/7th/8th-sem Computer Network
    // exams (codes 151509, 100602, 110715, 103804, 051813, 051513, 106301, 105315) —
    // included here at the admin's request even though none are 4th-sem papers.
    'CSE__4__Computer Networks': './pyqs/cse-sem4-computer-networks.pdf',
    // Note: source papers for this file are BEU 5th-sem Database Management System(s)
    // exams (code 151502 / 105502, 2012–2024) — included here at the admin's request
    // even though none are 4th-sem papers.
    'CSE__4__Database Management Systems': './pyqs/cse-sem4-database-management-systems.pdf',
    // Note: source papers for this file are BEU 5th/6th-sem Formal Language &
    // Automata Theory / Database System exams (code 105503 / 051611 / 105301,
    // 2012–2024) — included here at the admin's request even though none are 4th-sem papers.
    'CSE__4__Formal Language and Automata Theory': './pyqs/cse-sem4-formal-language-and-automata-theory.pdf',
    // ECE — Semester 1 & 2 — same papers as CSE: BEU's 1st-year subjects (Chemistry,
    // Physics, Math, Programming, English, IT Workshop) are common to every branch,
    // so these are the same exam papers, not different ones per branch.
    'ECE__1__Basic Electronics Engineering': './pyqs/cse-sem1-basic-electronics-engineering.pdf',
    'ECE__1__Chemistry': './pyqs/cse-sem1-chemistry.pdf',
    'ECE__1__Engineering Mathematics I': './pyqs/cse-sem1-engineering-mathematics-i.pdf',
    'ECE__1__Engineering Physics': './pyqs/cse-sem1-engineering-physics.pdf',
    'ECE__1__English': './pyqs/cse-sem1-english.pdf',
    'ECE__1__IT Workshop': './pyqs/cse-sem1-it-workshop.pdf',
    'ECE__1__Programming for Problem Solving': './pyqs/cse-sem1-programming-for-problem-solving.pdf',
    'ECE__2__Chemistry': './pyqs/cse-sem2-chemistry.pdf',
    'ECE__2__Engineering Physics': './pyqs/cse-sem2-engineering-physics.pdf',
    // ECE — Semester 3 — BEU 2024 question papers
    'ECE__3__Analog Electronic Circuits': './pyqs/ece-sem3-analog-electronic-circuits.pdf',
    'ECE__3__Data Structure and Algorithms': './pyqs/ece-sem3-data-structure-and-algorithms.pdf',
    'ECE__3__Digital Electronics': './pyqs/ece-sem3-digital-electronics.pdf',
    'ECE__3__Electrical Circuit Analysis': './pyqs/ece-sem3-electrical-circuit-analysis.pdf',
    'ECE__3__Electromagnetic Fields': './pyqs/ece-sem3-electromagnetic-fields.pdf',
    'ECE__3__Engineering Mathematics III': './pyqs/ece-sem3-engineering-mathematics-iii.pdf',
    'ECE__3__Engineering Mechanics': './pyqs/ece-sem3-engineering-mechanics.pdf',
    'ECE__3__Object Oriented Programming (C++)': './pyqs/ece-sem3-object-oriented-programming-cpp.pdf',
    'ECE__3__Technical Writing': './pyqs/ece-sem3-technical-writing.pdf',
    // ME — Semester 3 — BEU question papers (2021–2025, multiple years merged per subject)
    'ME__3__Analog Electronic Circuits': './pyqs/me-sem3-analog-electronic-circuits.pdf',
    'ME__3__Basic Electronics Engineering': './pyqs/me-sem3-basic-electronics-engineering.pdf',
    'ME__3__Digital Electronics': './pyqs/me-sem3-digital-electronics.pdf',
    'ME__3__Discrete Mathematics and Graph Theory': './pyqs/me-sem3-discrete-mathematics-and-graph-theory.pdf',
    'ME__3__Electrical Circuit Analysis': './pyqs/me-sem3-electrical-circuit-analysis.pdf',
    'ME__3__Electromagnetic Fields': './pyqs/me-sem3-electromagnetic-fields.pdf',
    'ME__3__Engineering Mathematics III': './pyqs/me-sem3-engineering-mathematics-iii.pdf',
    'ME__3__Engineering Mechanics': './pyqs/me-sem3-engineering-mechanics.pdf',
    // CE — Semester 3 — BEU 2023 question papers
    'CE__3__Computer-Aided Civil Engineering Drawing': './pyqs/ce-sem3-computer-aided-civil-engineering-drawing.pdf',
    'CE__3__Introduction to Civil Engineering': './pyqs/ce-sem3-introduction-to-civil-engineering.pdf',
    'CE__3__Surveying and Geomatics': './pyqs/ce-sem3-surveying-and-geomatics.pdf'
  },
  syllabus: {
    // CSE — Semester 3 — official BEU syllabus (session 2024-2028)
    'CSE__3__Data Structure and Algorithms': './syllabus/cse-sem3-data-structure-and-algorithms.pdf',
    'CSE__3__Digital Electronics': './syllabus/cse-sem3-digital-electronics.pdf',
    'CSE__3__Discrete Mathematics and Graph Theory': './syllabus/cse-sem3-discrete-mathematics-graph-theory.pdf',
    'CSE__3__Object Oriented Programming (Java)': './syllabus/cse-sem3-object-oriented-programming.pdf',
    'CSE__3__Operating System': './syllabus/cse-sem3-operating-system.pdf',
    // CSE — Semester 4 — official BEU syllabus (session 2024 onwards)
    'CSE__4__Computer Organization and Architecture': './syllabus/cse-sem4-computer-organization-and-architecture.pdf',
    'CSE__4__Formal Language and Automata Theory': './syllabus/cse-sem4-formal-language-and-automata-theory.pdf',
    'CSE__4__Design and Analysis of Algorithms': './syllabus/cse-sem4-design-and-analysis-of-algorithms.pdf',
    'CSE__4__Database Management Systems': './syllabus/cse-sem4-database-management-systems.pdf',
    'CSE__4__Effective Technical Communication': './syllabus/cse-sem4-effective-technical-communication.pdf',
    'CSE__4__Computer Networks': './syllabus/cse-sem4-computer-networks.pdf',
    // Semester 1 & 2 -- official BEU 'Group B' syllabus (session 2024-2025),
    // common first-year subjects, same document for every branch.
    // CSE
    'CSE__1__Basic Electronics Engineering': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE__1__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE__1__Engineering Mathematics I': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE__1__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE__1__English': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE__1__IT Workshop': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE__1__Programming for Problem Solving': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE__2__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE__2__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    // IT
    'IT__1__Basic Electronics Engineering': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'IT__1__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'IT__1__Engineering Mathematics I': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'IT__1__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'IT__1__English': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'IT__1__IT Workshop': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'IT__1__Programming for Problem Solving': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'IT__2__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'IT__2__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    // ECE
    'ECE__1__Basic Electronics Engineering': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ECE__1__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ECE__1__Engineering Mathematics I': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ECE__1__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ECE__1__English': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ECE__1__IT Workshop': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ECE__1__Programming for Problem Solving': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ECE__2__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ECE__2__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    // EE
    'EE__1__Basic Electronics Engineering': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'EE__1__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'EE__1__Engineering Mathematics I': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'EE__1__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'EE__1__English': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'EE__1__IT Workshop': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'EE__1__Programming for Problem Solving': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'EE__2__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'EE__2__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    // ME
    'ME__1__Basic Electronics Engineering': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ME__1__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ME__1__Engineering Mathematics I': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ME__1__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ME__1__English': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ME__1__IT Workshop': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ME__1__Programming for Problem Solving': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ME__2__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'ME__2__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    // CE
    'CE__1__Basic Electronics Engineering': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CE__1__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CE__1__Engineering Mathematics I': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CE__1__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CE__1__English': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CE__1__IT Workshop': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CE__1__Programming for Problem Solving': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CE__2__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CE__2__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    // CSE (AI & ML)
    'CSE (AI & ML)__1__Basic Electronics Engineering': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (AI & ML)__1__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (AI & ML)__1__Engineering Mathematics I': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (AI & ML)__1__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (AI & ML)__1__English': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (AI & ML)__1__IT Workshop': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (AI & ML)__1__Programming for Problem Solving': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (AI & ML)__2__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (AI & ML)__2__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    // CSE (Data Science)
    'CSE (Data Science)__1__Basic Electronics Engineering': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (Data Science)__1__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (Data Science)__1__Engineering Mathematics I': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (Data Science)__1__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (Data Science)__1__English': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (Data Science)__1__IT Workshop': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (Data Science)__1__Programming for Problem Solving': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (Data Science)__2__Chemistry': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
    'CSE (Data Science)__2__Engineering Physics': './syllabus/btech-group-b-sem1-2-syllabus.pdf',
  },
  notes: {
    // Semester 1 & 2 -- common first-year notes, same document for every branch
    'CSE__1__Basic Electronics Engineering': './notes/btech-sem1-basic-electronics-engineering.pdf',
    'CSE__1__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'CSE__1__Engineering Mathematics I': './notes/btech-sem1-engineering-mathematics-i.pdf',
    'CSE__1__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'CSE__1__Programming for Problem Solving': './notes/btech-sem1-programming-for-problem-solving.pdf',
    'CSE__2__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'CSE__2__Engineering Mathematics II': './notes/btech-sem2-engineering-mathematics-ii.pdf',
    'CSE__2__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'CSE__2__Python Programming': './notes/btech-sem2-python-programming.pdf',
    'CSE__2__Web Design': './notes/btech-sem2-web-design.pdf',
    'IT__1__Basic Electronics Engineering': './notes/btech-sem1-basic-electronics-engineering.pdf',
    'IT__1__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'IT__1__Engineering Mathematics I': './notes/btech-sem1-engineering-mathematics-i.pdf',
    'IT__1__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'IT__1__Programming for Problem Solving': './notes/btech-sem1-programming-for-problem-solving.pdf',
    'IT__2__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'IT__2__Engineering Mathematics II': './notes/btech-sem2-engineering-mathematics-ii.pdf',
    'IT__2__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'IT__2__Python Programming': './notes/btech-sem2-python-programming.pdf',
    'IT__2__Web Design': './notes/btech-sem2-web-design.pdf',
    'ECE__1__Basic Electronics Engineering': './notes/btech-sem1-basic-electronics-engineering.pdf',
    'ECE__1__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'ECE__1__Engineering Mathematics I': './notes/btech-sem1-engineering-mathematics-i.pdf',
    'ECE__1__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'ECE__1__Programming for Problem Solving': './notes/btech-sem1-programming-for-problem-solving.pdf',
    'ECE__2__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'ECE__2__Engineering Mathematics II': './notes/btech-sem2-engineering-mathematics-ii.pdf',
    'ECE__2__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'ECE__2__Python Programming': './notes/btech-sem2-python-programming.pdf',
    'ECE__2__Web Design': './notes/btech-sem2-web-design.pdf',
    'EE__1__Basic Electronics Engineering': './notes/btech-sem1-basic-electronics-engineering.pdf',
    'EE__1__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'EE__1__Engineering Mathematics I': './notes/btech-sem1-engineering-mathematics-i.pdf',
    'EE__1__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'EE__1__Programming for Problem Solving': './notes/btech-sem1-programming-for-problem-solving.pdf',
    'EE__2__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'EE__2__Engineering Mathematics II': './notes/btech-sem2-engineering-mathematics-ii.pdf',
    'EE__2__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'EE__2__Python Programming': './notes/btech-sem2-python-programming.pdf',
    'EE__2__Web Design': './notes/btech-sem2-web-design.pdf',
    'ME__1__Basic Electronics Engineering': './notes/btech-sem1-basic-electronics-engineering.pdf',
    'ME__1__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'ME__1__Engineering Mathematics I': './notes/btech-sem1-engineering-mathematics-i.pdf',
    'ME__1__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'ME__1__Programming for Problem Solving': './notes/btech-sem1-programming-for-problem-solving.pdf',
    'ME__2__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'ME__2__Engineering Mathematics II': './notes/btech-sem2-engineering-mathematics-ii.pdf',
    'ME__2__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'ME__2__Python Programming': './notes/btech-sem2-python-programming.pdf',
    'ME__2__Web Design': './notes/btech-sem2-web-design.pdf',
    'CE__1__Basic Electronics Engineering': './notes/btech-sem1-basic-electronics-engineering.pdf',
    'CE__1__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'CE__1__Engineering Mathematics I': './notes/btech-sem1-engineering-mathematics-i.pdf',
    'CE__1__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'CE__1__Programming for Problem Solving': './notes/btech-sem1-programming-for-problem-solving.pdf',
    'CE__2__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'CE__2__Engineering Mathematics II': './notes/btech-sem2-engineering-mathematics-ii.pdf',
    'CE__2__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'CE__2__Python Programming': './notes/btech-sem2-python-programming.pdf',
    'CE__2__Web Design': './notes/btech-sem2-web-design.pdf',
    'CSE (AI & ML)__1__Basic Electronics Engineering': './notes/btech-sem1-basic-electronics-engineering.pdf',
    'CSE (AI & ML)__1__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'CSE (AI & ML)__1__Engineering Mathematics I': './notes/btech-sem1-engineering-mathematics-i.pdf',
    'CSE (AI & ML)__1__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'CSE (AI & ML)__1__Programming for Problem Solving': './notes/btech-sem1-programming-for-problem-solving.pdf',
    'CSE (AI & ML)__2__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'CSE (AI & ML)__2__Engineering Mathematics II': './notes/btech-sem2-engineering-mathematics-ii.pdf',
    'CSE (AI & ML)__2__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'CSE (AI & ML)__2__Python Programming': './notes/btech-sem2-python-programming.pdf',
    'CSE (AI & ML)__2__Web Design': './notes/btech-sem2-web-design.pdf',
    'CSE (Data Science)__1__Basic Electronics Engineering': './notes/btech-sem1-basic-electronics-engineering.pdf',
    'CSE (Data Science)__1__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'CSE (Data Science)__1__Engineering Mathematics I': './notes/btech-sem1-engineering-mathematics-i.pdf',
    'CSE (Data Science)__1__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'CSE (Data Science)__1__Programming for Problem Solving': './notes/btech-sem1-programming-for-problem-solving.pdf',
    'CSE (Data Science)__2__Chemistry': './notes/btech-sem1-2-chemistry.pdf',
    'CSE (Data Science)__2__Engineering Mathematics II': './notes/btech-sem2-engineering-mathematics-ii.pdf',
    'CSE (Data Science)__2__Engineering Physics': './notes/btech-sem1-2-engineering-physics.pdf',
    'CSE (Data Science)__2__Python Programming': './notes/btech-sem2-python-programming.pdf',
    'CSE (Data Science)__2__Web Design': './notes/btech-sem2-web-design.pdf',
    // CSE — Semester 3 — admin-curated notes
    'CSE__3__Data Structure and Algorithms': './notes/cse-sem3-data-structure-and-algorithms.pdf',
    'CSE__3__Digital Electronics': './notes/cse-sem3-digital-electronics.pdf',
    'CSE__3__Discrete Mathematics and Graph Theory': './notes/cse-sem3-discrete-mathematics-graph-theory.pdf',
    'CSE__3__Object Oriented Programming (Java)': './notes/cse-sem3-object-oriented-programming.pdf',
    'CSE__3__Operating System': './notes/cse-sem3-operating-system.pdf',
    // CSE — Semester 4 — admin-curated notes
    'CSE__4__Computer Organization and Architecture': './notes/cse-sem4-computer-organization-and-architecture.pdf',
    'CSE__4__Design and Analysis of Algorithms': './notes/cse-sem4-design-and-analysis-of-algorithms.pdf',
    'CSE__4__Computer Networks': './notes/cse-sem4-computer-networks.pdf',
    'CSE__4__Database Management Systems': './notes/cse-sem4-database-management-systems.pdf',
    'CSE__4__Formal Language and Automata Theory': './notes/cse-sem4-formal-language-and-automata-theory.pdf'
  },
  lab: {
    // Semester 1 -- IT Workshop lab manual, same document for every branch
    'CSE__1__IT Workshop': './lab/btech-sem1-it-workshop-lab-manual.pdf',
    'IT__1__IT Workshop': './lab/btech-sem1-it-workshop-lab-manual.pdf',
    'ECE__1__IT Workshop': './lab/btech-sem1-it-workshop-lab-manual.pdf',
    'EE__1__IT Workshop': './lab/btech-sem1-it-workshop-lab-manual.pdf',
    'ME__1__IT Workshop': './lab/btech-sem1-it-workshop-lab-manual.pdf',
    'CE__1__IT Workshop': './lab/btech-sem1-it-workshop-lab-manual.pdf',
    'CSE (AI & ML)__1__IT Workshop': './lab/btech-sem1-it-workshop-lab-manual.pdf',
    'CSE (Data Science)__1__IT Workshop': './lab/btech-sem1-it-workshop-lab-manual.pdf'
  },
  practical: {},
  books: {}
};
function fileKey(branch, sem, subject){ return `${branch}__${sem}__${subject}`; }

/* 38 government engineering colleges affiliated to BEU. Compiled from the
   official BCECE Board sanctioned-seats document (2019-20) cross-checked
   against current college/BEU notices. Names/spellings may have been
   updated since — if you spot one that's wrong or renamed, it can be
   fixed here. */
const BEU_COLLEGES = [
  'Muzaffarpur Institute of Technology, Muzaffarpur',
  'Bhagalpur College of Engineering, Bhagalpur',
  'Darbhanga College of Engineering, Darbhanga',
  'Gaya College of Engineering, Gaya',
  'Nalanda College of Engineering, Chandi',
  'Motihari College of Engineering, Motihari',
  'Loknayak Jai Prakash Institute of Technology, Chapra',
  'Rashtrakavi Ramdhari Singh Dinkar College of Engineering, Begusarai',
  'Katihar Engineering College, Katihar',
  'Purnea College of Engineering, Purnea',
  'Supaul College of Engineering, Supaul',
  'Sitamarhi Institute of Technology, Sitamarhi',
  'Bakhtiyarpur College of Engineering, Patna',
  'B.P. Mandal College of Engineering, Madhepura',
  'Sershah Engineering College, Sasaram',
  'Saharsa College of Engineering, Saharsa',
  'Government Engineering College, Vaishali',
  'Government Engineering College, Jamui',
  'Government Engineering College, Banka',
  'Government Engineering College, Nawada',
  'Government Engineering College, Kishanganj',
  'Government Engineering College, Araria',
  'Government Engineering College, Munger',
  'Government Engineering College, Sheohar',
  'Government Engineering College, West Champaran',
  'Government Engineering College, Aurangabad',
  'Government Engineering College, Kaimur',
  'Government Engineering College, Gopalganj',
  'Government Engineering College, Madhubani',
  'Government Engineering College, Siwan',
  'Government Engineering College, Jehanabad',
  'Government Engineering College, Arwal',
  'Government Engineering College, Khagaria',
  'Government Engineering College, Buxar',
  'Government Engineering College, Bhojpur',
  'Government Engineering College, Sheikhpura',
  'Government Engineering College, Lakhisarai',
  'Government Engineering College, Samastipur'
];

/* Rate My Professor — rating categories. Professors and ratings are entered
   by students (crowdsourced), never pre-filled, and are stored in
   localStorage on this device only (see LS.professors / LS.profRatings). */
const PROF_RATING_CATEGORIES = [
  {key:'teaching', label:'Teaching Style'},
  {key:'viva', label:'Viva / Exam Behaviour'},
  {key:'behaviour', label:'Approachability & Behaviour'},
  {key:'doubt', label:'Doubt-Clearing'},
  {key:'punctuality', label:'Punctuality'}
];
const PROF_BANNED_WORDS = ['bastard','bitch','slut','whore','chutiya','madarchod','behenchod','bhosdi','randi','harami'];

/* Unit-by-unit topic checklists for the "Mark as Done" syllabus tracker.
   Semester 1 & 2 entries sourced from the official BEU Group-B syllabus PDF
   (syllabus/btech-group-b-sem1-2-syllabus.pdf); Semester 3 & 4 (CSE) entries
   sourced from the syllabus photos, OCR'd with image preprocessing
   (grayscale + upscale + contrast) for much cleaner text extraction.
   All parsed programmatically into individual topics. */
const SYLLABUS_TOPICS = {
  "Data Structure and Algorithms": [
    {
      "unit": "Unit 1: Introduction",
      "topics": [
        "Introduction: Basic Terminologies: Elementary Data Organizations, Data Structure Operations: insertion, deletion, traversal etc",
        "Analysis of an Algorithm",
        "Asymptotic Notations",
        "Time-Space trade off"
      ]
    },
    {
      "unit": "Unit 2: Stacks and Queues",
      "topics": [
        "Stacks and Queues: ADT Stack and its operations: Algorithms and _ their complexity analysis",
        "Applications of Stacks: Expression Conversion and evaluation \u2014 corresponding algorithms and complexity analysis. ADT queue",
        "Types of Queue: Simple Queue, Circular Queue, Priority Queue",
        "Operations on each Type of Queues: Algorithms and their analysis"
      ]
    },
    {
      "unit": "Unit 3: Linked Lists",
      "topics": [
        "Linked Lists: Singly linked lists: Representation in memory, Algorithms of several operations: Traversing, Searching, Insertion into, Deletion from linked list",
        "Linked representation of Stack and Queue",
        "Header nodes",
        "doubly linked list: operations on it and algorithmic analysis",
        "Circular Linked Lists: all operations their algorithms and the complexity analysis"
      ]
    },
    {
      "unit": "Unit 4: Searching, Sorting and Hashing",
      "topics": [
        "Searching",
        "Sorting and Hashing: Linear Search and Binary Search Techniques and their complexity analysis. Objective and properties of different sorting algorithms: Selection Sort",
        "Bubble Sort",
        "Insertion Sort",
        "Quick Sort",
        "Merge Sort",
        "Heap Sort",
        "Performance and Comparison among all the methods",
        "Hashing"
      ]
    },
    {
      "unit": "Unit 5: Trees",
      "topics": [
        "Trees: Basic Tree Terminologies, Different types of Trees: Binary Tree, Threaded Binary Tree, Binary Search Tree, AVL Tree",
        "Tree operations on each of the trees and their algorithms with complexity analysis. Applications of Binary Trees. B Tree",
        "B+ Tree: definitions, algorithms and analysis"
      ]
    },
    {
      "unit": "Unit 6: Graph",
      "topics": [
        "Graph: Basic Terminologies and Representations",
        "Graph search and traversal algorithms and complexity analysis"
      ]
    }
  ],
  "Digital Electronics": [
    {
      "unit": "Unit 1: Fundamentals of Digital Systems and Logic Families",
      "topics": [
        "Fundamentals of Digital Systems and logic families: Digital signals, digital circuits, AND, OR, NOT, NAND, NOR and Exclusive-OR operations",
        "Boolean algebra",
        "examples of IC gates",
        "number systems-binary",
        "signed binary",
        "octal hexadecimal number",
        "binary arithmetic",
        "one\u2019s and two\u2019s complements arithmetic",
        "codes",
        "error detecting and correcting codes",
        "characteristics of digital ICs",
        "digital logic families",
        "TTL",
        "Schottky",
        "TTL and CMOS logic",
        "interfacing CMOS and TTL",
        "Tri-state logic"
      ]
    },
    {
      "unit": "Unit 2: Combinational Digital Circuits",
      "topics": [
        "Combinational Digital Circuits: Standard representation for logic functions K- map representation, simplification of logic functions using K-map, minimization of logical functions. Don\u2019t care conditions, Multiplexer, DeMultiplexer/Decoders, Adders, Subtractors, BCD arithmetic, carry look ahead adder, serial adder, ALU. elementary ALU design, popular MSI chips, digital comparator, parity checker/generator, code conyerters, priority encoders, decoders/drivers for display devices, Q-M method of function realization"
      ]
    },
    {
      "unit": "Unit 3: Sequential circuits and systems",
      "topics": [
        "Sequential circuits and systems: A 1-bit memory, the circuit properties of Bistable latch, the clocked SR flip flop, J- K-T and D types flip flops",
        "applications of flip flops",
        "shift registers",
        "applications of shift registers",
        "serial to parallel converter",
        "parallel to serial converter",
        "ring counter",
        "sequence generator",
        "ripple (Asynchronous) counters",
        "synchronous counters",
        "counters design using flip flops",
        "special counter ICs",
        "asynchronous sequential counters",
        "applications of counters"
      ]
    },
    {
      "unit": "Unit 4: A/D and D/A Converters",
      "topics": [
        "A/D and D/A Converters: Digital to analog converters: weighted resistor/conyerter, R- 2RLadder D/A converter, specifications for D/A converters, examples of D/A converter ICs, sample and hold circuit",
        "analog to digital converters: quantization and encoding",
        "parallel comparator A/D converter",
        "successive approximation A/D converter",
        "counting A/D converter",
        "dual slope A/D converter",
        "A/D converter using Voltage to frequency and yoltage to time conversion",
        "specifications of A/D converters",
        "example of A/D converter ICs"
      ]
    },
    {
      "unit": "Unit 5: Semiconductor memories",
      "topics": [
        "Semiconductor memories: Memory organization and operation",
        "expanding memory size",
        "classification and characteristics of memories",
        "sequential memory",
        "read only memory (ROM)",
        "read and write memory(RAM)",
        "content addressable memory (CAM)",
        "charge de coupled device memory (CCD)",
        "commonly used memory chips",
        "ROM as a PLD"
      ]
    },
    {
      "unit": "Unit 6: Programmable logic devices",
      "topics": [
        "Programmable logic array",
        "Programmable array logic",
        "complex Programmable logic devices (CPLDS)",
        "Field Programmable Gate Array (FPGA)"
      ]
    }
  ],
  "Object Oriented Programming (Java)": [
    {
      "unit": "Unit 1: OOP Concepts and Java Programming:",
      "topics": [
        "Introduction to Java: History of java, Java buzzwords, basics of Java programming, difference between procedural and object-oriented programming paradigm",
        "need for OOPs paradigm",
        "OOPs features",
        "advantages of oops",
        "JDK",
        "JRE and JVM",
        "data types",
        "variables",
        "operators",
        "control structures including selection",
        "looping",
        "java methods",
        "compilation",
        "and execution of simple program"
      ]
    },
    {
      "unit": "Unit 2: Objects, Classes, and Constructors in Java:",
      "topics": [
        "Objects and Classes: Basics of objects and classes in java",
        "declaring objects. new keyword",
        "Defining and calling methods in class. Array of Objects. Constructors",
        "Different types of Constructors",
        "Overloading Methods and Constructors",
        "Method Binding",
        "Overtiding and Exceptions",
        "Passing Object as parameters",
        "returning object",
        "Static members",
        "Concept of Access Modifiers (Public",
        "Private",
        "Protected",
        "Default)",
        "this Keyword",
        "gurbage Collection",
        "finalize() method",
        "Nested and Inner Classes",
        "Exploring string class"
      ]
    },
    {
      "unit": "Unit 3: Inheritance, Interfaces and Packages:",
      "topics": [
        "Inheritance: Inheritance hierarchies, Benefits of Inheritance, super and subclasses",
        "member access rules",
        "super keyword",
        "preventing inheritance: final classes and methods",
        "the object class and its methods",
        "Polymorphism: Dynamic binding, method overriding, abstract classes and methods",
        "Interface: Interfaces vs Abstract classes, defining an interface, implement interfaces, accessing implementations through interface references, extending interface",
        "Packages: Defining, creating and accessing a package",
        "understanding CLASSPATH",
        "importing packages"
      ]
    },
    {
      "unit": "Unit 4: Exception Handling:",
      "topics": [
        "Introduction to error and exception",
        "Error ys Exception",
        "Concepts of Exception Handling",
        "Benefits of exception handling",
        "exception types",
        "exception hierarchy",
        "checked and unchecked exceptions",
        "usage of try",
        "catch",
        "throw",
        "throws and finally",
        "multiple catch clauses",
        "nested try statements",
        "re throwing exceptions",
        "creating own exception sub classes"
      ]
    },
    {
      "unit": "Unit 5: Introduction to Multithreading:",
      "topics": [
        "Differences between multiple processes and multiple threads",
        "thread states",
        "creating threads",
        "interrupting threads",
        "thread priorities",
        "synchronizing threads",
        "inter thread communication"
      ]
    },
    {
      "unit": "Unit 6: Files, Collections Framework and Database Connectivity",
      "topics": [
        "Files",
        "The Collections Framework and Connecting To Database: Files: Streams, byte streams, character stream, text inpuoutput, binary input/output, random access file operations, file management using file class",
        "The Collections Framework Gava.util): Collections overview, Hierarchy of Collection Framework, Collection Interfaces, The Collection classes- Array List, Linked List, Hash Set, Tree Set, Priority Queue, Array Deque: Connecting to Database: Connecting to a database, querying a database and processing the results",
        "updating data with JDBC"
      ]
    }
  ],
  "Operating System": [
    {
      "unit": "Unit 1: Introduction",
      "topics": [
        "Introduction: Concept of Operating Systems, Generations of Operating systems, Types of Operating Systems, OS Services, System Calls, Structure of an OS- Layered, Monolithic, Microkernel Operating Systems, Concept of Virtual Machine. Case study on UNIX and WINDOWS Operating System"
      ]
    },
    {
      "unit": "Unit 2: Processes",
      "topics": [
        "Processes: Definition, Process Relationship, Different states of a Process, Process State transitions, Process Control Block (PCB), Context switching. Thread: Definition, Various states, Benefits of threads, Types of threads, Concept of multithreads Process Scheduling",
        "Foundation and Scheduling objectives",
        "Types of Schedulers",
        "Scheduling criteria: CPU utilization, Throughput, Turnaround Time, Waiting Time, Response Time",
        "Scheduling algorithms: Pre-emptive and Non pre-emptive",
        "FCFS",
        "SJF",
        "RR",
        "Multiprocessor scheduling: Real Time scheduling: RM and EDF"
      ]
    },
    {
      "unit": "Unit 3: Inter-process Communication",
      "topics": [
        "Inter-process Communication: Critical Section, Race Conditions, Mutual Exclusion, Hardware Solution, Strict Alternation, Peterson\u2019s Solution, The Producer-Consumer Problem, Semaphores, Event Counters, Monitors, Message Passing, Shared Memory, Classical IPC Problems: Reader\u2019s & Writer Problem, Dinning Philosopher Problem etc"
      ]
    },
    {
      "unit": "Unit 4: Deadlocks",
      "topics": [
        "Deadlocks: Definition, Necessary and sufficient conditions for Deadlock",
        "Deadlock Prevention",
        "and Deadlock Avoidance: Banker\u2019s algorithm, Deadlock detection and Recovery"
      ]
    },
    {
      "unit": "Unit 5: Memory Management",
      "topics": [
        "Memory Management: Basic concept, Logical and Physical address map",
        "Memory allocation: Contiguous Memory allocation -\u2014 Fixed and variable partition\u2014Internal and External fragmentation and Compaction",
        "Paging and Segmentation: Principle of operation \u2014 Page allocation \u2014 Hardware support for paging, Protection and sharing",
        "Advantages and Disadvantages of paging and segmentation. Virtual Memory: Basics of Virtual Memory \u2014 Hardware and control structures \u2014 Locality of reference",
        "Page fault",
        "Working Set",
        "Dirty page/Dirty bit-Demand paging",
        "Page Replacement algorithms: Optimal, First in First Out (FIFO), Second Chance (SC), Not recently used (NRU) and Least Recently used (LRU)"
      ]
    },
    {
      "unit": "Unit 6: File Management",
      "topics": [
        "File Management: Concept of File, Access methods, File types, File operation, Directory structure, File System structure, Allocation methods (contiguous, linked, indexed), Free- space management (bit vector, linked list, grouping), directory implementation (linear list, hash table), efficiency and performance. Disk Management: Disk structure",
        "Disk scheduling-FCFS",
        "SSTF",
        "SCAN",
        "C- SCAN",
        "Disk reliability",
        "Disk formatting",
        "Boot-block",
        "Bad blocks VO Hardware: I/O devices, Device controllers, Direct memory access, Principles 9 | \u2014\u2014\u2014\u2014\u2014\u2014\u2014 of I/O Software: Goals of Interrupt handlers, Device drivers, Device independent I/O software, Secondary-Storage Structure"
      ]
    }
  ],
  "Discrete Mathematics and Graph Theory": [
    {
      "unit": "Unit 1: Sets, Relation and Function",
      "topics": [
        "Sets",
        "Relation and Function: Operations and Laws of Sets",
        "Cartesian Products",
        "Binary Relation",
        "Partial Ordering Relation",
        "Equivalence Relation",
        "Image of a Set",
        "Sum and Product of Functions",
        "Bijective functions",
        "Inverse and Composite Function",
        "Size of a Set",
        "Finite and infinite Sets",
        "Countable and uncountable Sets",
        "Cantor's diagonal argument and The Power Set theorem",
        "Schroeder-Bernstein theorem"
      ]
    },
    {
      "unit": "Unit 2: Principles of Mathematical Induction",
      "topics": [
        "Principles of Mathematical Induction: The Well-Ordering Principle, Recursive definition, The Division algorithm: Prime Numbers, The Greatest Common Divisor: Euclidean Algorithm, The Fundamental Theorem of Arithmetic. Basic counting techniques-inclusion and exclusion",
        "pigeon-hole principle",
        "permutation and combination"
      ]
    },
    {
      "unit": "Unit 3: Propositional Logic",
      "topics": [
        "Propositional Logic: Syntax, Semantics, Validity and Satisfiability",
        "Basic Connectives and Truth Tables",
        "Logical Equivalence: The Laws of Logic, Logical Implication, Rules of Inference, The use of Quantifiers"
      ]
    },
    {
      "unit": "Unit 4: Proof Techniques",
      "topics": [
        "Proof Techniques: Some Terminology, Proof Methods and Strategies",
        "Forward Proof",
        "Proof by Contradiction",
        "Proof by Contraposition",
        "Proof of Necessity and Sufficiency"
      ]
    },
    {
      "unit": "Unit 5: Algebraic Structures and Morphism",
      "topics": [
        "Algebraic Structures and Morphism: Algebraic Structures with one Binary Operation, Semi Groups, Monoids, Groups, Congruence Relation and Quotient Structures",
        "Free and Cyclic Monoids and Groups",
        "Permutation Groups",
        "Substructures",
        "Normal Subgroups",
        "Algebraic Structures with two Binary Operation",
        "Rings",
        "Integral Domain and Fields. Boolean Algebraand Boolean Ring",
        "Identities of Boolean Algebra",
        "Duality",
        "Representation of Boolean Function",
        "Disjunctive and Conjunctive Normal Form"
      ]
    },
    {
      "unit": "Unit 6: Graphs and Trees",
      "topics": [
        "Graphs and Trees: Graphs and their properties",
        "Degree",
        "Connectivity",
        "Path",
        "Cycle. Sub Graph",
        "Isomorphism",
        "Eulerian and Hamiltonian Walks",
        "Graph Coloring",
        "Coloring maps and Planar Graphs",
        "Coloring Vertices",
        "Coloring Edges",
        "List Coloring",
        "Perfect Graph",
        "definition properties and Example",
        "rooted trees",
        "trees and sorting",
        "weighted trees and prefix codes",
        "Bi-connected component and Articulation Points",
        "Shortest distances"
      ]
    }
  ],
  "Computer Organization and Architecture": [
    {
      "unit": "Unit 1: Functional blocks of a computer",
      "topics": [
        "Functional blocks of a computer: CPU, memory, input-output subsystems, control unit. Instruction set architecture of a CPU-registers, instruction execution cycle, RTL interpretation of instructions, addressing modes, instruction set. Case study \u2014 instruction sets of some common CPUs"
      ]
    },
    {
      "unit": "Unit 2: Data representation",
      "topics": [
        "Data representation: signed number representation, fixed and floating point representations",
        "character representation. Computer arithmetic \u2014 integer addition and subtraction",
        "ripple carry adder",
        "carry look-ahead adder",
        "etc. multiplication \u2014 shift-and-add",
        "Booth multiplier",
        "carry save multiplier",
        "etc. Division restoring and non-restoring techniques",
        "floating point arithmetic"
      ]
    },
    {
      "unit": "Unit 3: x86 Architecture and CPU Control Unit Design",
      "topics": [
        "Introduction to x86 architecture. CPU control unit design: hardwired and micro- programmed design approaches",
        "Case study \u2014 design of a simple hypothetical CPU. Memory system design: semiconductor memory technologies, memory organization"
      ]
    },
    {
      "unit": "Unit 4: Peripheral Devices and I/O",
      "topics": [
        "Peripheral devices and their characteristics: Input-output subsystems, I/O device interface, I/O transfers\u2014program controlled, interrupt driven and DMA",
        "privileged and non- privileged instructions",
        "software interrupts and exceptions. Programs and processes-role of interrupts in process state transitions",
        "I/O device interfaces \u2014 SCII",
        "USB"
      ]
    },
    {
      "unit": "Unit 5: Pipelining",
      "topics": [
        "Pipelining: Basic concepts of pipelining, throughput and speedup",
        "pipeline hazards. Parallel Processors: Introduction to parallel processors, Concurrent access to memory and cache coherency"
      ]
    },
    {
      "unit": "Unit 6: Memory organization",
      "topics": [
        "Memory organization: Memory interleaving, concept of hierarchical memory organization, cache memory, cache size vs. Block size, mapping functions, replacement algorithms, write policies"
      ]
    }
  ],
  "Formal Language and Automata Theory": [
    {
      "unit": "Unit 1: Introduction:",
      "topics": [
        "Alphabet",
        "languages and grammars",
        "productions and derivation",
        "Chomsky hierarchy of languages"
      ]
    },
    {
      "unit": "Unit 2: Regular languages and finite automata",
      "topics": [
        "Regular expressions and languages",
        "deterministic finite automata (DFA) and equivalence with regular expressions",
        "nondeterministic finite automata (NFA) and equivalence with DFA",
        "regular grammars and equivalence with finite automata",
        "properties of regular languages",
        "pumping lemma for regular languages",
        "minimization of finite automata"
      ]
    },
    {
      "unit": "Unit 3: Context-free languages and pushdown automata:",
      "topics": [
        "Context-free grammars (CFG) and Context-free languages (CFL)",
        "Chomsky and Greibach normal forms",
        "nondeterministic pushdown automata (PDA) and equivalence with CFG",
        "parse trees",
        "ambiguity in CFG",
        "pumping lemma for context-free languages",
        "deterministic pushdown automata",
        "closure properties of CFLs"
      ]
    },
    {
      "unit": "Unit 4: Context-sensitive languages:",
      "topics": [
        "Context-sensitive grammars (CSG) and Context-sensitive languages",
        "linear bounded automata and equivalence with CSG"
      ]
    },
    {
      "unit": "Unit 5: Turing machines:",
      "topics": [
        "The basic model for Turing machines (TM)",
        "Turing recognizable (Recursively enumerable) and Turing-decidable (recursive) languages and their closure properties",
        "variants of Turing machines",
        "nondeterministic TMs and equivalence with deterministic TMs",
        "unrestricted grammars and equivalence with Turing machines",
        "TMs as enumerators"
      ]
    },
    {
      "unit": "Unit 6: Undecidability:",
      "topics": [
        "Church-Turing thesis",
        "universal Turing machine",
        "the universal and diagonalization languages",
        "reduction between languages and Rice\u2019s theorem",
        "undecidable problems about languages"
      ]
    }
  ],
  "Design and Analysis of Algorithms": [
    {
      "unit": "Unit 1: Introduction",
      "topics": [
        "Introduction: Characteristics of algorithm. Analysis of algorithm: Asymptotic analysis of complexity bounds \u2014 best, average and worst-case behavior",
        "Performance measurements of Algorithm",
        "Time and space trade-offs",
        "Analysis of recursive algorithms through recurrence relations: Substitution method, Recursion tree method and Masters\u2019 theorem"
      ]
    },
    {
      "unit": "Unit 2: Divide and Conquer Paradigm",
      "topics": [
        "Introduction to Divide and Conquer paradigm: Binary Search, Quick and Merge sorting techniques",
        "linear time selection algorithm",
        "Strassen\u2019s Matrix Multiplication",
        "Karatsuba Algorithm for fast multiplication etc. Introduction to Heap: Min and Max Heap",
        "Build Heap",
        "Heap Sort"
      ]
    },
    {
      "unit": "Unit 3: Greedy Method",
      "topics": [
        "Overview of Brute-Force",
        "GreedyProgramming",
        "Dynamic Programming",
        "Branch- and-Bound and Backtrackingmethodologies. Greedy paradigm examples of exact optimization solution: Minimum Cost Spanning Tree, Knapsack problem, Job Sequencing Problem, Huffman Coding, Single source shortest path problem"
      ]
    },
    {
      "unit": "Unit 4: Dynamic Programming",
      "topics": [
        "Dynamic Programming",
        "difference between dynamic programming and divide and conquer",
        "Applications: Fibonacci Series, Matrix Chain Multiplication, 0-1 Knapsack Problem, Longest Common Subsequence, Travelling Salesman Problem, Rod Cutting, Bin Packing. Heuristics \u2014 characteristics and their application domains"
      ]
    },
    {
      "unit": "Unit 5: Graph and Tree Algorithms",
      "topics": [
        "Graph and Tree Algorithms:Representational issues in graphs, Traversal algorithms: Depth First Search (DFS) and Breadth First Search (BFS)",
        "Shortest path algorithms: Bellman- Ford algorithm, Dijkstra\u2019s algorithm & Analysis of Dijkstra\u2019s algorithm using heaps, Floyd-Warshall\u2019s all pairs shortest path algorithm.Transitive closure, Topological sorting, Network Flow Algorithm, Connected Component"
      ]
    },
    {
      "unit": "Unit 6: Tractable and Intractable Problems",
      "topics": [
        "Tractable and Intractable Problems: Computability of Algorithms, Computability classes \u2014 P, NP, NP-complete and NP-hard. Cook\u2019s theorem",
        "Standard NP-complete problems and Reduction techniques.Approximation algorithms",
        "Randomized algorithms"
      ]
    }
  ],
  "Database Management Systems": [
    {
      "unit": "Unit 1: Database system architecture",
      "topics": [
        "Data Abstraction",
        "Data Independence",
        "Data Definition Language (DDL)",
        "Data Manipulation Language (DML). Data models: Entity-relationship model, network model, relational and object oriented data models",
        "integrity constraints",
        "data manipulation operations"
      ]
    },
    {
      "unit": "Unit 2: Relational query languages:",
      "topics": [
        "Relational algebra",
        "Tuple and domain relational calculus",
        "SQL3",
        "DDL and DML constructs",
        "Open source and Commercial DBMS-MYSQL",
        "ORACLE",
        "DB2",
        "SQL server. Relational database design: Domain and data dependency",
        "Armstrong\u2019s axioms",
        "Normal forms",
        "Dependency preservation",
        "Lossless design. Query processing and optimization: Evaluation of relational algebra expressions, Query equivalence, Join strategies, Query optimization algorithms"
      ]
    },
    {
      "unit": "Unit 3: Storage strategies:",
      "topics": [
        "Indices",
        "B-trees",
        "hashing"
      ]
    },
    {
      "unit": "Unit 4: Transaction processing:",
      "topics": [
        "Concurrency control",
        "ACID property",
        "Serializability of scheduling",
        "Locking and timestamp based schedulers",
        "Multi-version and optimistic Concurrency Control schemes",
        "Database recovery"
      ]
    },
    {
      "unit": "Unit 5: Database Security:",
      "topics": [
        "Authentication",
        "Authorization and access control",
        "DAC",
        "MAC and RBAC models",
        "Intrusion detection",
        "SQL injection"
      ]
    },
    {
      "unit": "Unit 6: Advanced topics:",
      "topics": [
        "Object oriented and object relational databases",
        "Logical databases",
        "Web databases",
        "Distributed databases",
        "Data warehousing and data mining"
      ]
    }
  ],
  "Effective Technical Communication": [
    {
      "unit": "Unit 1: Information Design and Development",
      "topics": [
        "Different kinds of technical documents",
        "Information development life cycle",
        "Organization structures",
        "factors affecting information and document design",
        "Strategies for organization",
        "Information design and writing for print and for online media"
      ]
    },
    {
      "unit": "Unit 2: Technical Writing, Grammar and Editing",
      "topics": [
        "Technical writing process",
        "forms of discourse",
        "Writing drafts and revising",
        "Collaborative writing",
        "creating indexes",
        "technical writing style and language. Basics of grammar",
        "study of advanced grammar",
        "editing strategies to achieve appropriate technical style. Introduction to advanced technical communication",
        "Usability",
        "Human factors",
        "Managing technical communication projects",
        "time estimation",
        "Single sourcing",
        "Localization"
      ]
    },
    {
      "unit": "Unit 3: Self-development and Assessment",
      "topics": [
        "Self assessment",
        "Awareness",
        "Perception and Attitudes",
        "Values and belief",
        "Personal goal setting",
        "career planning",
        "Self-esteem. Managing Time: Personal memory, Rapid reading, taking notes",
        "Complex problem solving",
        "Creativity"
      ]
    },
    {
      "unit": "Unit 4: Communication",
      "topics": [
        "Public speaking",
        "Group discussion",
        "Oral",
        "presentation",
        "Interviews",
        "Graphic presentation",
        "Presentation aids",
        "Personality Development"
      ]
    },
    {
      "unit": "Unit 5: Technical Writing",
      "topics": [
        "Writing reports",
        "project proposals",
        "brochures",
        "newsletters",
        "technical articles",
        "manuals",
        "official notes",
        "business letters",
        "memos",
        "progress reports",
        "minutes of meetings",
        "event report"
      ]
    },
    {
      "unit": "Unit 6: Ethics",
      "topics": [
        "Business ethics",
        "Etiquettes in social and office settings",
        "Email etiquettes",
        "Telephone Etiquettes",
        "Engineering ethics",
        "managing time",
        "Role and responsibility of engineer",
        "Work culture in jobs",
        "Personal memo"
      ]
    }
  ],
  "Computer Networks": [
    {
      "unit": "Unit 1: Overview of Data Communication and Networking",
      "topics": [
        "Overview of Data Communication and Networking: OSI Reference Model, TCP/IP Protocol Suite",
        "Network Architecture and Physical Topology"
      ]
    },
    {
      "unit": "Unit 2: Physical Layer",
      "topics": [
        "Physical Layer: Analog and Digital Signals",
        "Transmission Impairment",
        "Data Rate Limits",
        "Performance Analysis of a Network",
        "Representation and Synchronization of Bits",
        "Analog and Digital Transmission",
        "Multiplexing and Spreading Techniques",
        "Guided Transmission Media",
        "Circuit",
        "Packet and Virtual Circuit Switching"
      ]
    },
    {
      "unit": "Unit 3: Data Link Layer",
      "topics": [
        "Data Link Layer: Framing, Flow and Error Control (Noiseless and Noisy Channels Protocols)",
        "PointToPoint Protocol",
        "Random Access protocols (Pure/slotted ALOHA",
        "CSMA/CD",
        "CSMA/CA)",
        "Controlled Access Protocol (Bit-Map",
        "Polling and Token Passing)",
        "Channelization (TDMA",
        "FDMA",
        "CDMA)",
        "Physical Addressing and Ethernet",
        "Connecting LANs and Virtual LANs"
      ]
    },
    {
      "unit": "Unit 4: Network Layer",
      "topics": [
        "Network Layer: Internet Protocol version 4 and 6",
        "Address Mapping (ARP",
        "RARP",
        "BOOTP and DHCP)",
        "ICMP and IGMP",
        "Routing Algorithms"
      ]
    },
    {
      "unit": "Unit 5: Transport Layer",
      "topics": [
        "Transport Layer: UDP, TCP",
        "Congestion Control and QoS",
        "Client-Server Model and Socket Interface"
      ]
    },
    {
      "unit": "Unit 6: Application Layer",
      "topics": [
        "Application Layer: DNS, Remote Logging, Electronic Mail (SMTP, POP), FTP, Introduction to WWW and HTTP"
      ]
    }
  ],
  "Chemistry": [
    {
      "unit": "Unit 1: Atomic and Molecular Structure",
      "topics": [
        "Electromagnetic ra diations",
        "Dual nature of electron and Heisenberg uncertainty Principle. Photoelectric effect",
        "Planck's theory. Principles for the combination of atomic orbitals to form a molecular diagram of molecular orbitals. Bent's rule",
        "VSEPR theory (typical example) co-ordination numbers and geometries. Isomerism in transition metal compounds. Metal Carbonyls",
        "Synthesis and Structure"
      ]
    },
    {
      "unit": "Unit 2: Spectroscopy",
      "topics": [
        "Principle of rotational and vibrational spectroscopy",
        "selection rule for application in diatomic molecules",
        "elementary idea of electronic spectroscopy",
        "UV-VIS spectroscopy with related to rules and its applications. Basic Principle of nuclear Magnetic resonance spectroscopy with applications"
      ]
    },
    {
      "unit": "Unit 3: Electrochemistry and Fuels",
      "topics": [
        "Nernst equation",
        "EMF and electroche mical cell",
        "the introduction of corrosion",
        "corrosion mechanism",
        "types of corrosion",
        "water line corrosion",
        "stress corrosion",
        "pitting corrosion",
        "Lead acid storage cell",
        "leclanche cell. Calorific value of fuels",
        "proximate and ultimate analysis of coals",
        "fuel cells",
        "Bio fuels"
      ]
    },
    {
      "unit": "Unit 4: Water Chemistry",
      "topics": [
        "Hardness of water",
        "estimation of water hardness by EDTA and Alkalinity method. Removal of the hardness of water-soda lime process",
        "zeolite process",
        "Ion exchange process",
        "Boiler problem",
        "sludge",
        "and s cale formation",
        "priming and foaming",
        "Boiler corrosion",
        "and Caustic embrittlement"
      ]
    },
    {
      "unit": "Unit 5: Polymer and Plastics",
      "topics": [
        "Polymerization techniques (free radical",
        "ionic",
        "and co-ordination mechanism)Preparation properties",
        "and technical application of phenol-formaldehyde resins",
        "elastomers",
        "synthetic rubbers (Buna-S",
        "Buna-N",
        "neoprene). Inorganic polymers",
        "Silicones",
        "adhesives",
        "epoxy resins. the structural difference between thermoplastic and thermosetting Plasti cs",
        "the Importance of commercially important thermoplastics and thermosets",
        "Poly ethylene",
        "Polyvinyl chloride",
        "Polystyrene"
      ]
    },
    {
      "unit": "Unit 6: Organic Reactions and Synthesis of A Drug Molecul",
      "topics": [
        "Introduction to intermediate and reaction involving Substitution",
        "addition",
        "elimination",
        "oxidation-reduction. Diels Elder cyclization and epoxide ring opening reactions",
        "synthesis of commonly used drug molecules like aspirin"
      ]
    }
  ],
  "Engineering Mathematics I": [
    {
      "unit": "Unit 1: Linear Algebra-I",
      "topics": [
        "Elementary Row operations",
        "Gauss-Jordan Method for finding the inverse of Matrix",
        "Complex Matrix: Hermitian, Skew Hermitian and Unitary Matrix",
        "Vector space",
        "Sub Spaces",
        "Linear dependence and Independences of Vectors",
        "Linear Span",
        "Basis",
        "Dimension",
        "Extension of basis of subspace",
        "The rank of a matrix",
        "Row and column space",
        "Solvability of system of linear equations"
      ]
    },
    {
      "unit": "Unit 2: Linear Algebra-II",
      "topics": [
        "Linear Transformations",
        "Kernel and Range of linear transformation",
        "Matrix Representation of a linear transformation",
        "Rank-Nullity Theorem",
        "Eigen Value and Eigen Vectors",
        "Properties of Eigen vectors",
        "Eigen Bases",
        "Orthogonal Tr ansformation",
        "Similarity Transformation",
        "Matrix Diagonalization",
        "Cayley- Hamilton Theorem"
      ]
    },
    {
      "unit": "Unit 3: Calculus for single variable",
      "topics": [
        "Inderminate form",
        "L\u2019Hospital Rule",
        "Rolle\u2019s Theorem",
        "Mean Value Theorem",
        "Expansion of function (single variable)",
        "T aylor and Maclaurin Series",
        "Riemann Integration",
        "Riemann Sum",
        "Improper Integrals",
        "Beta and Gamma function and their properties"
      ]
    },
    {
      "unit": "Unit 4: Multivariable Calculus (Differentiation)",
      "topics": [
        "Function with two or more variable",
        "Limit",
        "continuity and Partial differentiation",
        "Total Differentiation Taylor\u2019s series and Maclaurin\u2019s series for function with two variable",
        "Jacobian",
        "Maxima and Minima",
        "Method of Lagrange\u2019s multiplier"
      ]
    },
    {
      "unit": "Unit 5: Multivariable Calculus (Integration)",
      "topics": [
        "Double Integral",
        "change of order of integration",
        "Triple integral",
        "Change of Variable in a Double and Triple Integrals",
        "Change to polar coordinate",
        "Change to cylindrical coordinate",
        "Change to spherical polar coordinate",
        "Application to area and volume using double and triple integral"
      ]
    },
    {
      "unit": "Unit 6: Vector Calculus",
      "topics": [
        "Scalar and vector fields",
        "Gradient",
        "Directional derivative",
        "Divergence",
        "Curl and their properties",
        "Line integral",
        "Green\u2019s theorem in plane (without proof)",
        "Surface integral",
        "Stoke\u2019s theorem (without proof)",
        "Volume Integral",
        "Gauss-Divergence\u2019 theorem (without proof)"
      ]
    }
  ],
  "Engineering Physics": [
    {
      "unit": "Unit 1: Mechanics \u2014 Frame of Reference & Oscillations",
      "topics": [
        "1. Frame of Reference: Non-Inertial frame of reference, rotating coordinate system, centripetal and Coriolis acceleration and its application in weather system. 2. Oscillations: Harmonic Oscillator",
        "Damped Harmonic motion \u2013 overdamped",
        "critically Damped and lightly damped oscillators",
        "Force Oscillators and Resonance"
      ]
    },
    {
      "unit": "Unit 2: Optics & LASER",
      "topics": [
        "Huygens\u2019s Principle",
        "Superposition of Waves and interference of Light by wave front-splitting and amplitude-splitting",
        "Young\u2019s double slit experiment",
        "Michelson interferometer",
        "Fraunhofer diffraction from single slit and circular aperture",
        "Diffract ion Grating and their resolving power 2. LASER: Einstein\u2019s theory of matter-radiations interaction, Einstein\u2019s Coefficients (A and B)",
        "Amplification by population inversion",
        "Different types of lasers \u2013 Gas Laser",
        "Helium-Neon Laser",
        "Solid State Laser (Ruby",
        "Neodymium)",
        "Semiconductor Laser"
      ]
    },
    {
      "unit": "Unit 3: Quantum Mechanics",
      "topics": [
        "Compton Effect",
        "Photoelectric Effect",
        "Wave Particle duality",
        "de Broglie\u2019s hypothesis",
        "Heisenberg\u2019s Uncertainty Principle",
        "Wave function and wave packets",
        "phase and group velocities",
        "Schrodinger\u2019s Wave Equation",
        "Normalization",
        "Expectation values",
        "Eigenvalue s and Eigenfunction. 2. Applications in One dimensions: Application of Schrodinger Wave Equation for particle in one dimensional box \u2013 its wavefunction and eigenvalue of energy and momentum"
      ]
    },
    {
      "unit": "Unit 4: Vector Calculus & Electrostatics",
      "topics": [
        "Gradient",
        "Divergence and Curl",
        "Line",
        "Surface and Volume integrals",
        "Gauss\u2019s Divergence theorem and Stokes\u2019 theorem in Cartesian Coordinate. 2. Electrostatics: Gauss\u2019s Law and its applications",
        "Divergence and Curl of Electrostatic fields",
        "Electrostat ic Potential",
        "Boundary Conditions",
        "Poisson\u2019s and Laplace\u2019s equations",
        "Dielectrics",
        "Polarization",
        "Bound Charges",
        "Electric displacement",
        "Boundary Conditions in dielectrics"
      ]
    },
    {
      "unit": "Unit 5: Magnetostatics & Electrodynamics",
      "topics": [
        "Lorentz force",
        "Biot-Savart and Ampere\u2019s circuital laws and their applications",
        "Divergence and Curl of Magneto static fields",
        "Magnetic vector potential",
        "Force and torque on a magnetic dipole",
        "Magnetic Materials",
        "Magnetization",
        "Bound currents",
        "Boundary conditions. 2. Electrodynamics and Electromagnetic Waves: Ohm\u2019s law, Motional EMF, Faraday\u2019s Law, Lenz\u2019s law, Self and mutual inductance",
        "Energy stored in magnetic field",
        "Maxwell\u2019s equations in vacuum and nonconducting medium",
        "Continuity Equation",
        "Poynting Theorem",
        "Wave Equations: plain ele ctromagnetic wave in vacuum and their transverse nature and Polarization"
      ]
    },
    {
      "unit": "Unit 6: Solids & Semiconductors",
      "topics": [
        "Free electron theory of metal",
        "fermi level",
        "Bloch\u2019s theorem for particle in a periodic Potential",
        "Kroning-Penney model and origin of energy band. 2. Electronic Materials: Metals, semiconductors and insulators",
        "intrinsic and extrinsic semiconductors",
        "Carrier transport",
        "diffusion and drift",
        "P-N junction"
      ]
    }
  ],
  "Engineering Mathematics II": [
    {
      "unit": "Unit 1: Complex Analysis \u2013 I",
      "topics": [
        "Functions of complex variable",
        "limit",
        "Continuity",
        "Differentiability",
        "Analytic function",
        "Cauchy-Riemann Equations in Cartesian and polar form",
        "harmonic function and harmonic conjugate"
      ]
    },
    {
      "unit": "Unit 2: Complex Analysis \u2013 II",
      "topics": [
        "Line Integral",
        "contour integrals",
        "Cauchy theorem",
        "Cauchy\u2019s Integral formula(without proof)",
        "Taylors series",
        "zero of analytic functions",
        "singularities",
        "Laurent\u2019s series",
        "residue",
        "Cauchy residue theorem(without Proof) and its applications"
      ]
    },
    {
      "unit": "Unit 3: Ordinary Differential Equations",
      "topics": [
        "Linear differential equations of nth Order with constant coefficients",
        "solution of Homogeneous and Non-Homogeneous Equations",
        "Equations with variable coefficients",
        "Cauchy- Euler Equations",
        "Method of Variation of Parameters"
      ]
    },
    {
      "unit": "Unit 4: Sequence and Series",
      "topics": [
        "Introduction of Sequence and Series",
        "Nature of series Tests of convergence of Series: Comparison test, D\u2019Alembert ratio test, Cauchy\u2019s Root test, Raabe\u2019s test, Logarithmic test, Cauchy\u2019s condensation test"
      ]
    },
    {
      "unit": "Unit 5: Laplace Transform",
      "topics": [
        "Laplace Transform",
        "Existence theorem",
        "properties of Laplace Transform",
        "Laplace Transform of Periodic functions",
        "Inverse Laplace Transform",
        "convo lution theorem. Application of Laplace Transform to solve Ordinary differential equations"
      ]
    },
    {
      "unit": "Unit 6: Fourier Series",
      "topics": [
        "Fourier Series",
        "Fourier Series for odd and even functions",
        "Half range sine and cosine series",
        "Parseval\u2019s theorem"
      ]
    }
  ],
  "Programming for Problem Solving": [
    {
      "unit": "Unit 1: Introduction to Programming",
      "topics": [
        "Introduction to components of a computer system (disks",
        "memory",
        "processor",
        "where a program is stored and executed",
        "operating system",
        "compilers etc.). Idea of Algorithm: steps to solve logical and numerical problems. Representation of Algorithm: Flowchart/ Pseudo code with examples. From algorithms to programs",
        "source code",
        "variables (with data types) variables and memory locations",
        "Syntax and Logical Errors in compilation",
        "object and executable code"
      ]
    },
    {
      "unit": "Unit 2: Operators, Conditional Branching and Loops",
      "topics": [
        "Arithmetic expressions/arithmetic operators",
        "relational operators",
        "logical operators",
        "bitwise operators and precedence. Writing and evaluation of conditionals and consequent branching",
        "Iteration and loops"
      ]
    },
    {
      "unit": "Unit 3: Arrays and String",
      "topics": [
        "Array declaration & initialization",
        "bo und checking arrays (1-d",
        "2-d)",
        "character arrays and strings"
      ]
    },
    {
      "unit": "Unit 4: Function, Recursion and Pointers",
      "topics": [
        "Functions (including using built in libraries)",
        "Parameter passing in functions",
        "call by value",
        "passing arrays to functions: Recursion, as a different way of solving problems. Example programs, such as Finding Factorial, Fibonacci series, Ackerman function etc. Idea of pointers, Defining pointers, Use of Pointers in self-referential structures, idea of call by reference"
      ]
    },
    {
      "unit": "Unit 5: User defined Data Types and File handling",
      "topics": [
        "Structure- defining",
        "declaring",
        "initializing",
        "accessing structure members",
        "processing of structure",
        "array of structures",
        "structures within structure",
        "structure and function",
        "type definition",
        "Union \u2014 definition",
        "declaration",
        "accessing union members",
        "initializing union. Introduction",
        "file declaration",
        "opening and closing a file",
        "working with text and binary files",
        "I/O operations on file",
        "error handling",
        "random access to files"
      ]
    },
    {
      "unit": "Unit 6: Basic Algorithms",
      "topics": [
        "Searching",
        "Basic Sorting Algorithms (Bubble",
        "Insertion and Selection)",
        "Finding roots of equations",
        "notion of order of complexity through example programs (no formal definition required)"
      ]
    }
  ],
  "IT Workshop": [
    {
      "unit": "Unit 1: PC HARDWARE(6 lectures):",
      "topics": [
        "Identification of the peripherals of a computer",
        "components in a CPU and its functions. Block diagram of the CPU along with the configuration of each peripheral. Functions of Motherboard. Assembling and Disassembling of PC. Installation of OS. Basic Linux commands"
      ]
    },
    {
      "unit": "Unit 2: INTERNET(4 lectures)",
      "topics": [
        "Web Browsers",
        "Access of websites",
        "Surfing the Web",
        "Search Engines",
        "Customization of web browsers",
        "proxy settings",
        "bookmarks",
        "search toolbars",
        "pop-up blockers. Antivirus types",
        "Protection from various threats"
      ]
    },
    {
      "unit": "Unit 3: MICROSOFT WORD(4 lectures)",
      "topics": [
        "Overview of MS word features. Usage of Hyperlink",
        "Symbols",
        "Spell Check",
        "Track Changes. Table of Content",
        "Newspaper columns",
        "Images from files and clipart",
        "Drawing toolbar and Word Art",
        "Formatting Images",
        "Textboxes",
        "Paragraphs and Mail Merge in word. Using Word to create Project Certificate",
        "Project Abstract",
        "News Letter",
        "Resume"
      ]
    },
    {
      "unit": "Unit 4: LaTeX(6 lectures)",
      "topics": [
        "Word Orientation: Overview of LaTeX and tool word: Importance of LaTeX and MS office or equivalent (FOSS) tool Word as word Processors",
        "Details of the f our tasks and features that would be covered in each",
        "Using LaTeX and word \u2013 Accessing",
        "overview of toolbars",
        "saving files",
        "Using help and resources",
        "rulers",
        "format painter in word. Using LaTeX and Word to create a project certificate. Features to be cov ered:- Formatting Fonts in word, Drop Cap in word, Applying Text effects, Using Character Spacing, Borders and Colors",
        "Inserting Header and Footer",
        "Using Date and Time option in both LaTeX. Creating project abstract Features to be covered: -Formatting Styles, Inserting table, Bullets and Numbering",
        "Changing Text Direction",
        "Cell alignment",
        "Footnote",
        "Hyperlink",
        "Symbols",
        "Spell Check",
        "Track Changes. Creating a Newsletter: Features to be covered: - Table of Content, Newspaper columns, Images from files and clipa rt",
        "Drawing toolbar and Word Art",
        "Formatting Images",
        "Textboxes",
        "Paragraphs and Mail Merge in word"
      ]
    },
    {
      "unit": "Unit 5: MICROSOFT EXCEL( 4 lectures)",
      "topics": [
        "Overview of Excel Features Excel formulae & Functions",
        "conditional formatting",
        "Charts",
        "Hyper linking",
        "Renaming and In serting worksheets",
        "Data Analysis functions. Creating a Scheduler (Features: - Gridlines, Format Cells, Summation, auto fill, Formatting) Calculating GPA (Features: - Cell Referencing, Formulae and functions in excel"
      ]
    },
    {
      "unit": "Unit 6: MICROSOFT POWER POINT( 4 lectures)",
      "topics": [
        "Overview of PowerPoint features",
        "Insertion of images",
        "slide transition",
        "Custom animation",
        "Hyperlinks"
      ]
    }
  ],
  "Python Programming": [
    {
      "unit": "Unit 1: Input and Output",
      "topics": [
        "Identifiers",
        "Keywords",
        "Statements and Expressions",
        "Variables",
        "Operators",
        "Precedence and Associativity",
        "Data Types",
        "Indentation",
        "Comments",
        "Reading Input",
        "Print Output",
        "Type Conversions",
        "The type() Function and Is Operator",
        "Dynamic and Strongly Typed Language"
      ]
    },
    {
      "unit": "Unit 2: Control Flow statements, Function and Loops",
      "topics": [
        "Control Flow Statements",
        "The if Decision Control Flow Statement",
        "The if\u2026else Decision Control Flow Statement",
        "The if\u2026elseif\u2026else Decision Control Statement",
        "Nested if Statement",
        "Built-InFunctions",
        "Commonly Used Modules",
        "Function Definition and Calling the Function",
        "The return Statement and void Function",
        "Scope and Lifetime of Variables",
        "Default Parameters",
        "The while Loop",
        "The for Loop",
        "The continue and break Statements"
      ]
    },
    {
      "unit": "Unit 3: Strings",
      "topics": [
        "Creating and Storing Strings",
        "Basic String Operations",
        "Accessing Characters in String by Index Number",
        "String Slicing and Joining",
        "String Methods",
        "Formatting Strings"
      ]
    },
    {
      "unit": "Unit 4: Lists",
      "topics": [
        "Creating Lists",
        "Basic List Operations",
        "Indexing and Slicing in Lists",
        "Built-In Functions Used on Lists",
        "List Methods",
        "The del Statement"
      ]
    },
    {
      "unit": "Unit 5: Dictionaries, Tuples and Sets",
      "topics": [
        "Creating Dictionary",
        "Accessing and Modifying key value Pairs in Dictionaries",
        "Built-In Functions Used on Dictionaries",
        "Dictionary Methods",
        "The del Statement",
        "Tuples and Sets",
        "Creating Tuples",
        "Basic Tuple Operations",
        "Indexing and Slicing in Tuples",
        "Built-In Functions Used on Tuples",
        "Relation between Tuples and Lists",
        "Relation between Tuples and Dictionaries",
        "Tuple Methods",
        "Using zip() Function",
        "Sets",
        "Set Methods",
        "Traversing of Sets",
        "Frozen set"
      ]
    },
    {
      "unit": "Unit 6: Files",
      "topics": [
        "Types of Files",
        "Creating and Reading Text Data",
        "File Methods to Read and Write Data",
        "Reading and Writing Binary Files",
        "The Pickle Module",
        "Reading and Writing CSV Files",
        "Python os and os.path Modules"
      ]
    }
  ],
  "Web Design": [
    {
      "unit": "Unit 1: Fundamentals of Internet and Web Technologies",
      "topics": [
        "Introduction to Internet",
        "World Wide Web",
        "History of the web",
        "Website",
        "Homepage",
        "Domain Narne",
        "Web B rolvsers and Web server",
        "Web Server Working",
        "Client-Server Architecture",
        "3-Tier Web Architecture",
        "Web hosting",
        "URL",
        "MIME",
        "HTTP protocol",
        "Web Programrners Toolbox"
      ]
    },
    {
      "unit": "Unit 2: Introduction to HTML: Elements and Structure",
      "topics": [
        "HTML elements",
        "History of HTML",
        "Document body",
        "Different tags",
        "sections",
        "text",
        "heading",
        "paragraphs",
        "hyperlink",
        "lists",
        "tables",
        "color coding and images",
        "Div and Span Tags for grouping",
        "character entities",
        "URL Encoding",
        "frames",
        "and frame sets"
      ]
    },
    {
      "unit": "Unit 3: HTML Forms and Multimedia Integration",
      "topics": [
        "Attributes",
        "HTML canvas",
        "embedding audio and video in a webpage",
        "HTML Vs XHTML"
      ]
    },
    {
      "unit": "Unit 4: Introduction to CSS: Styling and Layouts",
      "topics": [
        "syntax and structure",
        "External Style Sheets",
        "Internal Style Sheets",
        "lnline Style",
        "CSS Selectors",
        "div & span tag",
        "CSS Color",
        "CSS Backgrounds",
        "Borders",
        "Margins",
        "Padding. Box Model",
        "Heightiwidth",
        "outline",
        "Text",
        "Font",
        "Tables",
        "CSS Buttons",
        "CSS Display",
        "CSS Float & Clear",
        "CSS Overflow"
      ]
    },
    {
      "unit": "Unit 5: JavaScript Basics: Scripting and Control",
      "topics": [
        "Scripting",
        "w-hat can JavaScript Do",
        "Need of JavaScript",
        "Enhancing HTML Documents with JavaScript",
        "the Build ing Blocks: Data types, variables, Types of Operators, Operator Precedetrce, Type conversion",
        "Conditional statement irr.lavaScript: if else, and else il",
        "Switch statement",
        "Loops in JavaScript: for, while, do/while, break, continue"
      ]
    },
    {
      "unit": "Unit 6: Advanced JavaScript: Objects and Events",
      "topics": [
        "(array",
        "number",
        "string. Boolean)",
        "event handling (e.g",
        "onclick",
        "onsubniit)",
        "error liandling: JavaScript scope",
        "responsive modal forrns",
        "form validation"
      ]
    }
  ],
  "Basic Electronics Engineering": [
    {
      "unit": "Unit 1: Semiconductor diode",
      "topics": [
        "Intrinsic and extrinsic types",
        "energy band in intrinsic and extrinsic Semiconductor",
        "equilibrium carrier concentration Direct and indirect band-gap semiconductor. Ideal diode Construction",
        "p-n junction under open circuit",
        "drift",
        "and diffusion current",
        "buil t in potential",
        "forward bias",
        "and reverse bias condition. Effect of temperature",
        "static and dynamic resistance",
        "breakdown mechanism in diode",
        "Junction capacitance. Zener diode Working",
        "VI characteristics Light emitting Diode",
        "Photodiode",
        "Solar cell"
      ]
    },
    {
      "unit": "Unit 2: Diode Applications",
      "topics": [
        "Half wave rectifiers",
        "Full wave rectifiers & Rectifier with filters",
        "Zener diode application as voltage regulator",
        "Clipping and Clamping circuits",
        "Voltage doubler (includes numerical on rectifier",
        "filter",
        "and Zener regulator)"
      ]
    },
    {
      "unit": "Unit 3: Bipolar Junction Transistor",
      "topics": [
        "BJT introduction: Construction, Symbol, and types (PNP and NPN)",
        "working of BJT",
        "BJT configuration and characteristics",
        "Load line analysis",
        "Operating point",
        "Need for Biasing",
        "different Biasing circuits",
        "Bias stability. BJT as a switch &Amplifier",
        "low frequency small signal model of BJT",
        "CE amplifier with and without feedback"
      ]
    },
    {
      "unit": "Unit 4: Field Effect Transistor",
      "topics": [
        "General characteristics of FET",
        "Comparison between FET & BJT",
        "JFET: Constru ction, Principle of Operation, Shockley equation. Outputand transfer characteristics",
        "Depletion & Enhancement Type MOSFET: Construction, Principle of operation. Output and transfer characteristics"
      ]
    },
    {
      "unit": "Unit 5: Operational Amplifier",
      "topics": [
        "Block diag ram of an Operational amplifier",
        "schematic symbol",
        "characteristics of an ideal and practical operational amplifier",
        "concept of virtual ground",
        "Inverting and non-inverting amplifier",
        "voltage follower",
        "adder",
        "subtractor",
        "integrator and differentiator"
      ]
    },
    {
      "unit": "Unit 6: Fundamental of Digital Electronics",
      "topics": [
        "Introduction to number system: octal, Hexadecimal, Binary numbers, Binary addition using 1\u2019s and 2\u2019s complement method. logic gates",
        "Universal gates",
        "Boolean Algebra",
        "De Morgan\u2019s theorems",
        "Simplification",
        "and realization of Boolean expression using basic gates and NAND gates"
      ]
    }
  ]
};

const GOVT_JOBS = [
  {name:'UPSC', full:'Union Public Service Commission', site:'https://upsc.gov.in', note:'Civil Services, Engineering Services (ESE) & more.'},
  {name:'BPSC', full:'Bihar Public Service Commission', site:'https://bpsc.bih.nic.in', note:'Bihar state civil & technical services.'},
  {name:'SSC', full:'Staff Selection Commission', site:'https://ssc.nic.in', note:'CGL, JE, CHSL and technical posts.'},
  {name:'GATE', full:'Graduate Aptitude Test in Engineering', site:'https://gate.iitb.ac.in', note:'Gateway to PSU jobs & M.Tech admissions.'},
  {name:'DRDO', full:'Defence Research & Development Organisation', site:'https://www.drdo.gov.in', note:'Scientist & technical recruitment.'},
  {name:'ISRO', full:'Indian Space Research Organisation', site:'https://www.isro.gov.in', note:'Scientist/Engineer recruitment via ISRO centres.'},
  {name:'BHEL', full:'Bharat Heavy Electricals Ltd', site:'https://www.bhel.com', note:'Engineer Trainee & apprentice drives.'},
  {name:'NIC', full:'National Informatics Centre', site:'https://www.nic.in', note:'Scientist/Technical roles in IT for govt.'},
  {name:'NIELIT', full:'National Institute of Electronics & IT', site:'https://www.nielit.gov.in', note:'Scientist & technical assistant posts.'},
  {name:'RRB', full:'Railway Recruitment Board', site:'https://www.rrbcdg.gov.in', note:'JE, ALP, technician & group posts.'},
  {name:'Bank Jobs', full:'IBPS / SBI / RBI', site:'https://www.ibps.in', note:'PO, SO (IT) and clerical recruitment.'},
  {name:'Bihar State Govt', full:'BPSC / Bihar Staff Selection', site:'https://onlinebssc.com', note:'State-level technical & non-technical posts.'}
];

const EDU_WEBSITES = [
  {name:'SWAYAM', site:'https://swayam.gov.in', note:'Free online courses with credits.'},
  {name:'NPTEL', site:'https://nptel.ac.in', note:'IIT/IISc video lectures & certification.'},
  {name:'National Scholarship Portal', site:'https://scholarships.gov.in', note:'Apply for central & state scholarships.'},
  {name:'DigiLocker', site:'https://www.digilocker.gov.in', note:'Store verified academic documents.'},
  {name:'AICTE', site:'https://www.aicte-india.org', note:'Technical education regulator & schemes.'},
  {name:'NAD', site:'https://nad.gov.in', note:'National Academic Depository for marksheets.'},
  {name:'ABC ID', site:'https://www.abc.gov.in', note:'Academic Bank of Credits registration.'},
  {name:'e-ShodhSindhu', site:'https://ess.inflibnet.ac.in', note:'Research journals & e-resources.'}
];

const SOCIALS = [
  {name:'YouTube', icon:'▶️', url:'https://youtube.com/'},
  {name:'Instagram', icon:'📸', url:'https://instagram.com/'},
  {name:'LinkedIn', icon:'💼', url:'https://linkedin.com/'},
  {name:'Telegram', icon:'✈️', url:'https://t.me/'},
  {name:'Discord', icon:'🎮', url:'https://discord.com/'},
  {name:'Email', icon:'✉️', url:'mailto:hello@beuhub.example'}
];

/* BEU AI Mentor — daily content channel promo shown on the homepage.
   Update `url` to the real channel link once it's live. */
const BEU_AI_MENTOR = {
  name: 'BEU AI Mentor',
  tagline: 'Daily bite-sized content for BEU students',
  url: 'https://youtube.com/',
  content: [
    {icon:'📢', label:'BEU exam updates'},
    {icon:'🎯', label:'GATE preparation'},
    {icon:'🗄️', label:'DBMS in 60 seconds'},
    {icon:'🧠', label:'TOC tricks'},
    {icon:'🎞️', label:'DAA animations'},
    {icon:'💼', label:'Placement tips'},
    {icon:'🏛️', label:'Government job updates'},
    {icon:'💬', label:'PYQ discussions'}
  ]
};

const STUDENT_HELP = [
  {name:'Hostel Help', icon:'🏠', desc:'Allotment process, mess rules & common FAQs.'},
  {name:'Scholarship Help', icon:'🎓', desc:'Central & Bihar-state scholarship guidance.'},
  {name:'Internship Guide', icon:'💻', desc:'How & where to find engineering internships.'},
  {name:'Placement Guide', icon:'🧑\u200d💼', desc:'Campus placement prep timeline & tips.'},
  {name:'Career Roadmap', icon:'🗺️', desc:'Branch-wise career paths after B.Tech.'},
  {name:'Coding Roadmap', icon:'⌨️', desc:'DSA, web dev & CS fundamentals order of study.'},
  {name:'Interview Preparation', icon:'🎤', desc:'Common technical & HR interview questions.'},
  {name:'Resume Guide', icon:'📄', desc:'What recruiters look for in a fresher resume.'}
];

const BLOGS = [
  {cat:'Placement Tips', title:'How BEU students can crack their first off-campus interview', date:'Jul 2026'},
  {cat:'Coding Articles', title:'DSA roadmap for 2nd year engineering students', date:'Jun 2026'},
  {cat:'AI News', title:'5 AI tools every engineering student should try', date:'Jun 2026'},
  {cat:'Exam Tips', title:'Last-week revision strategy before BEU semester exams', date:'May 2026'},
  {cat:'Technology News', title:'What GATE 2027 aspirants should start now', date:'May 2026'},
  {cat:'Career Blogs', title:'PSU vs private job: what to choose after B.Tech', date:'Apr 2026'}
];

const TOOLS = [
  {id:'img2pdf', name:'Image to PDF', icon:'🖼️', ready:true},
  {id:'pdfmerge', name:'PDF Merge', icon:'📎', ready:true},
  {id:'pdfsplit', name:'Split PDF', icon:'✂️', ready:true},
  {id:'pdfcompress', name:'Compress PDF', icon:'🗜️', ready:false},
  {id:'imgcompress', name:'Image Compressor', icon:'📉', ready:true},
  {id:'imgresize', name:'Image Resizer', icon:'📐', ready:true},
  {id:'bgremove', name:'Background Remover', icon:'🪄', ready:false},
  {id:'qrgen', name:'QR Generator', icon:'🔳', ready:true},
  {id:'qrscan', name:'QR Scanner', icon:'📷', ready:true},
  {id:'tts', name:'Text to Speech', icon:'🔊', ready:true},
  {id:'stt', name:'Speech to Text', icon:'🎙️', ready:true},
  {id:'wordcount', name:'Word Counter', icon:'🔤', ready:true},
  {id:'codefmt', name:'Code Formatter', icon:'{ }', ready:true},
  {id:'jsonfmt', name:'JSON Formatter', icon:'🧾', ready:true},
  {id:'base64', name:'Base64 Encoder', icon:'🔐', ready:true},
  {id:'colorpicker', name:'Color Picker', icon:'🎨', ready:true},
  {id:'unitconv', name:'Unit Converter', icon:'📏', ready:true},
  {id:'sciencecalc', name:'Scientific Calculator', icon:'🧮', ready:true},
  {id:'agecalc', name:'Age Calculator', icon:'🎂', ready:true},
  {id:'percentcalc', name:'Percentage Calculator', icon:'%', ready:true},
  {id:'cgpatool', name:'CGPA Calculator', icon:'🎯', ready:true},
  {id:'resumebuilder', name:'Resume Builder', icon:'📋', ready:true},
  {id:'coverletter', name:'Cover Letter Generator', icon:'✉️', ready:true},
  {id:'invoicegen', name:'Invoice Generator', icon:'🧾', ready:true},
  {id:'certgen', name:'Certificate Generator', icon:'🏆', ready:true}
];

const GAMES = [
  {id:'tictactoe', name:'Tic Tac Toe', icon:'❌', ready:true},
  {id:'memory', name:'Memory Game', icon:'🧠', ready:true},
  {id:'g2048', name:'2048', icon:'🔢', ready:true},
  {id:'reaction', name:'Reaction Test', icon:'⚡', ready:true},
  {id:'typing', name:'Typing Speed Test', icon:'⌨️', ready:true},
  {id:'snake', name:'Snake', icon:'🐍', ready:true},
  {id:'sudoku', name:'Sudoku', icon:'🔲', ready:false},
  {id:'quiz', name:'Quiz Game', icon:'❓', ready:false}
];

/* ============================== RENDER HELPERS ============================== */
function el(html){ const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }

function renderJobs(){
  const wrap = $('#jobsGrid');
  wrap.innerHTML = GOVT_JOBS.map(j=>`
    <div class="card">
      <div class="card-icon">🏛️</div>
      <h3>${j.name}</h3>
      <p>${j.full}</p>
      <p class="muted" style="font-size:.8rem">${j.note}</p>
      <div class="tags">
        <span class="tag">Eligibility</span><span class="tag">Exam Date</span><span class="tag">Deadline</span><span class="tag">Syllabus</span>
      </div>
      <div class="card-link-row">
        <a class="btn btn-ghost btn-sm" href="${j.site}" target="_blank" rel="noopener noreferrer">Official Website ↗</a>
        <button class="btn btn-primary btn-sm" onclick="openJobDetail('${j.name}')">Details</button>
      </div>
    </div>
  `).join('');
}
function openJobDetail(name){
  const j = GOVT_JOBS.find(x=>x.name===name);
  openPanel(`
    <p class="muted" style="margin-bottom:14px">${j.full}</p>
    <table>
      <tr><th>Latest Notification</th><td>Updated by BEU Hub admin team each recruitment cycle.</td></tr>
      <tr><th>Eligibility</th><td>Varies by post — check official notification (link below).</td></tr>
      <tr><th>Exam Date</th><td>As per official calendar.</td></tr>
      <tr><th>Application Deadline</th><td>As per official notification.</td></tr>
      <tr><th>Syllabus</th><td>Available on the official site's exam section.</td></tr>
    </table>
    <div class="mt-16 flex gap-8" style="flex-wrap:wrap">
      <a class="btn btn-primary btn-sm" href="${j.site}" target="_blank" rel="noopener noreferrer">Official Website</a>
      <a class="btn btn-ghost btn-sm" href="${j.site}" target="_blank" rel="noopener noreferrer">Important Links</a>
    </div>
  `, name);
}

function renderMentorSection(){
  $('#mentorName').textContent = BEU_AI_MENTOR.name;
  $('#mentorTagline').textContent = BEU_AI_MENTOR.tagline;
  $('#mentorFollowBtn').href = BEU_AI_MENTOR.url;
  $('#mentorContentGrid').innerHTML = BEU_AI_MENTOR.content.map(c=>`
    <div style="background:rgba(255,255,255,.14); border-radius:12px; padding:12px; text-align:center;">
      <div style="font-size:1.4rem;">${c.icon}</div>
      <p style="color:#fff; font-size:.78rem; font-weight:600; margin-top:6px;">${escapeHtml(c.label)}</p>
    </div>
  `).join('');
}

function renderEdu(){
  $('#eduGrid').innerHTML = EDU_WEBSITES.map(w=>`
    <div class="card">
      <div class="card-icon">🌐</div>
      <h3>${w.name}</h3>
      <p>${w.note}</p>
      <div class="card-link-row">
        <button class="btn btn-ghost btn-sm" onclick="openEmbed('${w.site}','${w.name}')">Open inside app</button>
        <a class="btn btn-primary btn-sm" href="${w.site}" target="_blank" rel="noopener noreferrer">New tab ↗</a>
      </div>
    </div>
  `).join('');
}

function renderSocials(){
  $('#socialGrid').innerHTML = SOCIALS.map(s=>`
    <a class="card" href="${s.url}" target="_blank" rel="noopener noreferrer" style="align-items:center; text-align:center">
      <div class="card-icon" style="margin:0 auto">${s.icon}</div>
      <h3>${s.name}</h3>
    </a>
  `).join('');
}

function renderHelp(){
  $('#helpGrid').innerHTML = STUDENT_HELP.map(h=>`
    <div class="card">
      <div class="card-icon">${h.icon}</div>
      <h3>${h.name}</h3>
      <p>${h.desc}</p>
      <div class="card-link-row"><button class="btn btn-ghost btn-sm" onclick="openHelpDetail('${h.name}')">Read guide</button></div>
    </div>
  `).join('');
}
function openHelpDetail(name){
  const h = STUDENT_HELP.find(x=>x.name===name);
  openPanel(`<p class="muted">${h.desc}</p><p class="mt-16">Full guide content is curated and published by the BEU Hub team. This is a placeholder panel — plug your written guide or a linked article here.</p>`, name);
}

function renderBlogs(){
  $('#blogGrid').innerHTML = BLOGS.map(b=>`
    <div class="card">
      <span class="tag" style="align-self:flex-start">${b.cat}</span>
      <h3>${b.title}</h3>
      <p class="muted" style="font-size:.78rem">${b.date}</p>
      <div class="card-link-row"><button class="btn btn-ghost btn-sm" onclick="openBlogDetail('${b.title.replace(/'/g,"\\'")}')">Read more</button></div>
    </div>
  `).join('');
}
function openBlogDetail(title){
  const b = BLOGS.find(x=>x.title===title);
  openPanel(`<span class="tag">${b.cat}</span><p class="mt-16">${b.date}</p><p class="mt-16 muted">Full article body goes here — this section is managed from the BEU Hub admin panel (static content for now).</p>`, b.title);
}

function renderTools(){
  $('#toolsGrid').innerHTML = TOOLS.map(t=>`
    <button class="tool-card" onclick="${t.ready ? `openTool('${t.id}')` : `toast('${t.name} is coming soon')`}">
      <div class="card-icon">${t.icon}</div>
      <span>${t.name}</span>
      ${t.ready ? '' : '<small class="badge-soon">Soon</small>'}
    </button>
  `).join('');
}
function renderGames(){
  $('#gamesGrid').innerHTML = GAMES.map(g=>`
    <button class="tool-card" onclick="${g.ready ? `openGame('${g.id}')` : `toast('${g.name} is coming soon')`}">
      <div class="card-icon">${g.icon}</div>
      <span>${g.name}</span>
      ${g.ready ? '' : '<small class="badge-soon">Soon</small>'}
    </button>
  `).join('');
}

function fillSelect(sel, arr){ sel.innerHTML = arr.map(v=>`<option value="${v}">${v}</option>`).join(''); }

/* ============================== PYQ / SYLLABUS / NOTES / LAB / PRACTICAL / BOOKS BROWSERS ============================== */
function renderResourceList(container, type, branch, sem, onlySubject){
  const files = RESOURCE_FILES[type] || {};
  let subs = subjectsFor(Number(sem), branch);
  if(onlySubject && onlySubject !== 'All') subs = subs.filter(s=>s===onlySubject);
  container.innerHTML = subs.map(s=>{
    const url = files[fileKey(branch, sem, s)];
    const hasTracker = type === 'syllabus' && SYLLABUS_TOPICS[s];
    return `
    <div class="card" style="flex-direction:row; align-items:center; gap:12px">
      <div class="card-icon">📄</div>
      <div style="flex:1">
        <h3 style="font-size:.92rem">${s}</h3>
        <p style="font-size:.76rem">${branch} • Semester ${sem}</p>
      </div>
      <div class="flex gap-8" style="flex-wrap:wrap; justify-content:flex-end;">
        ${hasTracker ? `<button class="btn btn-ghost btn-sm tracker-open-btn" data-subject="${escapeHtml(s)}">📋 Tracker</button>` : ''}
        ${url
          ? `<a class="btn btn-primary btn-sm ${type==='notes' ? 'notes-view-link' : ''}" data-subject="${escapeHtml(s)}" href="${url}" target="_blank" rel="noopener noreferrer">View</a>`
          : `<span class="tag" style="white-space:nowrap">Not uploaded yet</span>`}
      </div>
    </div>`;
  }).join('');
  $$('.tracker-open-btn', container).forEach(b=> b.addEventListener('click', ()=> openSyllabusTracker(b.dataset.subject)));
  $$('.notes-view-link', container).forEach(a=> a.addEventListener('click', ()=>{
    const key = 'notesRead_' + todayStr() + '_' + a.dataset.subject;
    if(!store.get(key, false)){
      store.set(key, true);
      awardActivity('readNotes', `Read notes: ${a.dataset.subject}`);
    }
    store.set(LS.lastResource, {type, branch, sem, subject: a.dataset.subject});
  }));
}
function buildBrowser(containerId, {branchSel, semSel, subjSel}, type){
  const branch = branchSel.value, sem = semSel.value;
  if(subjSel){
    const prevVal = subjSel.value;
    fillSelect(subjSel, ['All', ...subjectsFor(Number(sem), branch)]);
    if([...subjSel.options].some(o=>o.value===prevVal)) subjSel.value = prevVal;
  }
  renderResourceList(document.getElementById(containerId), type, branch, sem, subjSel ? subjSel.value : null);
}

/* Notes / Lab Manual / Practical Files / Important Books — opened from cards, same branch+sem browser */
function openResourcePanel(type, title, preset){
  const html = `
    <div class="form-row cols-2">
      <div><label>Branch</label><select id="rpBranch"></select></div>
      <div><label>Semester</label><select id="rpSem"></select></div>
    </div>
    <div id="rpList" class="grid mt-16"></div>
    <p class="muted mt-16" style="font-size:.75rem">Content here is added by the BEU Hub admin team. Nothing shown yet for a subject just means it hasn't been uploaded — check back soon.</p>
  `;
  openPanel(html, title);
  const b = $('#rpBranch'), s = $('#rpSem');
  fillSelect(b, BRANCHES); fillSelect(s, SEMESTERS);
  if(preset && preset.branch) b.value = preset.branch;
  if(preset && preset.sem) s.value = preset.sem;
  const run = ()=> renderResourceList($('#rpList'), type, b.value, s.value, preset && preset.subject);
  b.addEventListener('change', run); s.addEventListener('change', run);
  run();
}

/* ============================== SYLLABUS TRACKER ==============================
   Unit-by-unit "mark as done" checklist for subjects where SYLLABUS_TOPICS has
   parsed data. Progress is saved in localStorage per subject (LS.syllabusProgress). */
function trackerTopicId(subject, unitIdx, topicIdx){ return `${subject}__u${unitIdx}__t${topicIdx}`; }
function openSyllabusTracker(subject){
  const units = SYLLABUS_TOPICS[subject];
  if(!units) return;
  const totalTopics = units.reduce((n,u)=> n + u.topics.length, 0);
  const progress = store.get(LS.syllabusProgress, {});
  const doneSet = new Set(progress[subject] || []);

  const bodyHtml = `
    <div class="tracker-progress"><div class="tracker-progress-bar" id="trackerBar" style="width:0%"></div></div>
    <p class="muted" id="trackerCount" style="font-size:.78rem;"></p>
    ${units.map((u, ui)=>`
      <div class="tracker-unit-banner">${escapeHtml(u.unit)}</div>
      ${u.topics.map((t, ti)=>{
        const id = trackerTopicId(subject, ui, ti);
        const isDone = doneSet.has(id);
        return `
        <div class="tracker-topic${isDone?' done':''}" data-id="${id}">
          <p class="tracker-topic-text">${escapeHtml(t)}</p>
          <div class="tracker-actions">
            <button class="tracker-pill ask-ai" data-topic="${escapeHtml(t)}" data-subject="${escapeHtml(subject)}">Ask AI</button>
            <a class="tracker-pill youtube" href="https://www.youtube.com/results?search_query=${encodeURIComponent(t + ' ' + subject)}" target="_blank" rel="noopener noreferrer">YouTube</a>
            <button class="tracker-pill mark-done${isDone?' is-done':''}" data-id="${id}">${isDone?'✓ Done':'Mark as Done'}</button>
          </div>
        </div>`;
      }).join('')}
    `).join('')}
  `;
  openPanel(bodyHtml, subject);

  function updateProgressBar(){
    const prog = store.get(LS.syllabusProgress, {});
    const done = new Set(prog[subject] || []);
    const pct = totalTopics ? Math.round((done.size / totalTopics) * 100) : 0;
    $('#trackerBar').style.width = pct + '%';
    $('#trackerCount').textContent = `${done.size} / ${totalTopics} topics done (${pct}%)`;
  }
  updateProgressBar();

  $$('.mark-done').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      const prog = store.get(LS.syllabusProgress, {});
      const done = new Set(prog[subject] || []);
      const row = btn.closest('.tracker-topic');
      if(done.has(id)){
        done.delete(id);
        btn.textContent = 'Mark as Done';
        btn.classList.remove('is-done');
        row.classList.remove('done');
      } else {
        done.add(id);
        btn.textContent = '✓ Done';
        btn.classList.add('is-done');
        row.classList.add('done');
      }
      prog[subject] = [...done];
      store.set(LS.syllabusProgress, prog);
      updateProgressBar();
    });
  });

  $$('.ask-ai').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      closePanel();
      AIChat.toggle(true);
      const input = $('#aiInput');
      if(input){
        input.value = `Explain this topic for my exam — "${btn.dataset.topic}" (from ${btn.dataset.subject})`;
        AIChat.send();
      }
    });
  });
}


/* ============================== STUDENT DASHBOARD ============================== */
function initDashboard(){
  const nameInput = $('#dashName');
  nameInput.value = store.get(LS.studentName, '');
  nameInput.addEventListener('change', ()=>{
    store.set(LS.studentName, nameInput.value.trim());
    renderDashboard();
  });
  const branchSel = $('#dashBranch'), semSel = $('#dashSem');
  fillSelect(branchSel, BRANCHES); fillSelect(semSel, SEMESTERS);
  branchSel.value = store.get(LS.studentBranch, BRANCHES[0]);
  semSel.value = store.get(LS.studentSem, '1');
  branchSel.addEventListener('change', ()=>{ store.set(LS.studentBranch, branchSel.value); renderDashboard(); });
  semSel.addEventListener('change', ()=>{ store.set(LS.studentSem, semSel.value); renderDashboard(); });
  $('#dashAddExamBtn')?.addEventListener('click', ()=>{
    const name = $('#dashExamName').value.trim();
    const date = $('#dashExamDate').value;
    if(!name || !date){ toast('Enter both exam name and date'); return; }
    const exams = store.get(LS.exams, []);
    exams.push({id:'exam_'+Date.now(), name, date});
    store.set(LS.exams, exams);
    $('#dashExamName').value = ''; $('#dashExamDate').value = '';
    renderDashboard();
    toast('Exam added');
  });
  renderDashboard();
}
function renderDashboard(){
  const name = store.get(LS.studentName, '').trim();
  const welcome = $('#dashWelcome');
  if(welcome) welcome.textContent = name ? `Good day, ${name}! 👋` : 'Welcome! Add your name below 👋';

  const attData = Attendance.data();
  const course = Attendance.course || 'btech';
  const subs = (attData[course] && attData[course].subjects) || [];
  const totalPresent = subs.reduce((a,s)=>a+s.present,0);
  const totalClasses = subs.reduce((a,s)=>a+s.total,0);
  const attPct = totalClasses ? Math.round((totalPresent/totalClasses)*100) : null;

  const cgpaAll = store.get(LS.cgpa, {});
  const entries = Object.values(cgpaAll);
  const totalCred = entries.reduce((a,v)=>a+v.credits,0);
  const totalW = entries.reduce((a,v)=>a+v.credits*v.sgpa,0);
  const cgpa = totalCred ? (totalW/totalCred).toFixed(2) : null;

  const syllabusProg = store.get(LS.syllabusProgress, {});
  let doneCount = 0, totalCount = 0;
  Object.entries(SYLLABUS_TOPICS).forEach(([subject, units])=>{
    totalCount += units.reduce((a,u)=>a+u.topics.length,0);
    doneCount += (syllabusProg[subject] || []).length;
  });
  const syllabusPct = totalCount ? Math.round((doneCount/totalCount)*100) : 0;

  const qp = quizProgress();

  const grid = $('#dashProgressGrid');
  if(grid){
    grid.innerHTML = `
      <div class="card"><div class="card-icon">✅</div><h3>${attPct!==null ? attPct+'%' : '—'}</h3><p>Attendance</p></div>
      <div class="card"><div class="card-icon">🎯</div><h3>${cgpa || '—'}</h3><p>CGPA</p></div>
      <div class="card"><div class="card-icon">📋</div><h3>${syllabusPct}%</h3><p>Syllabus covered</p></div>
      <div class="card"><div class="card-icon">⭐</div><h3>${qp.xp} XP</h3><p>${qp.streak} quiz-day streak</p></div>
    `;
  }

  // ---- Gamification stat bar: streak / coins / XP / level ----
  const p = progress();
  const level = levelFromXP(p.xp);
  const intoLevel = xpIntoLevel(p.xp);
  const gameBar = $('#dashGameBar');
  if(gameBar){
    gameBar.innerHTML = `
      <div class="quiz-stat"><span class="quiz-stat-num">🔥 ${p.loginStreak}</span><span class="quiz-stat-label">Login streak</span></div>
      <div class="quiz-stat"><span class="quiz-stat-num">🪙 ${p.coins}</span><span class="quiz-stat-label">Coins</span></div>
      <div class="quiz-stat"><span class="quiz-stat-num">${p.xp}</span><span class="quiz-stat-label">XP</span></div>
      <div class="quiz-stat"><span class="quiz-stat-num">Lv ${level}</span><span class="quiz-stat-label">${intoLevel}/${LEVEL_XP_STEP} to next</span></div>
    `;
  }

  // ---- Today's Tasks ----
  const today = todayStr();
  const tasks = [
    {label:'Play today\'s Daily Quiz', done: !!p.answeredDates[today], link:'quiz'},
    {label:'Learn today\'s Word of the Day', done: !!p.wordsLearned[today], link:'word-of-day'},
    {label:'Attempt today\'s Aptitude question', done: !!p.aptitudeDates[today], link:'aptitude'},
    {label:'Try today\'s Coding Challenge', done: !!p.codingHistory[today], link:'coding-challenge'},
  ];
  const tasksList = $('#dashTasksList');
  if(tasksList){
    tasksList.innerHTML = tasks.map(t=>`
      <div class="flex justify-between items-center" style="padding:8px 0; border-bottom:1px solid var(--border);">
        <span style="font-size:.85rem;">${t.done ? '✅' : '⬜'} ${escapeHtml(t.label)}</span>
        ${!t.done ? `<a href="#${t.link}" data-page-link="${t.link}" class="btn btn-ghost btn-sm">Go →</a>` : ''}
      </div>
    `).join('');
  }

  // ---- Upcoming Exams ----
  const exams = store.get(LS.exams, []).filter(e=> new Date(e.date) >= new Date(today)).sort((a,b)=> new Date(a.date)-new Date(b.date));
  const examsList = $('#dashExamsList');
  if(examsList){
    examsList.innerHTML = exams.length ? exams.slice(0,5).map(e=>{
      const daysLeft = Math.max(0, daysBetween(today, e.date));
      return `<div class="flex justify-between items-center" style="padding:6px 0;">
        <span style="font-size:.85rem;">${escapeHtml(e.name)}</span>
        <span class="tag">${daysLeft===0 ? 'Today' : daysLeft+' day'+(daysLeft===1?'':'s')}</span>
      </div>`;
    }).join('') : '<p class="muted" style="font-size:.8rem;">No upcoming exams added yet.</p>';
  }

  // ---- Recent Activity ----
  const activityList = $('#dashActivityList');
  if(activityList){
    activityList.innerHTML = p.activityLog.length ? p.activityLog.slice(0,8).map(a=>`
      <div class="flex justify-between items-center" style="padding:6px 0; font-size:.8rem;">
        <span>${escapeHtml(a.label)}</span>
        <span class="muted">+${a.xp} XP</span>
      </div>
    `).join('') : '<p class="muted" style="font-size:.8rem;">No activity yet — play today\'s quiz or read some notes!</p>';
  }

  // ---- Continue Learning ----
  const lastRes = store.get(LS.lastResource, null);
  const continueBtn = $('#dashContinueBtn');
  if(continueBtn){
    if(lastRes){
      continueBtn.style.display = '';
      continueBtn.textContent = `Continue: ${lastRes.subject} →`;
      continueBtn.onclick = ()=> openSubjectResource(lastRes.type, lastRes.branch, lastRes.sem, lastRes.subject);
    } else {
      continueBtn.style.display = 'none';
    }
  }
}

/* ============================== STUDENT PROFILE ============================== */
async function initProfile(){
  renderProfile();
}
async function renderProfile(){
  const el2 = $('#profilePage');
  if(!el2) return;
  const name = store.get(LS.studentName, '').trim();
  const branch = store.get(LS.studentBranch, '');
  const sem = store.get(LS.studentSem, '');
  const qp = quizProgress();

  // Rank: position on the shared leaderboard if a name + backend is set, else "Local only"
  let rank = '—';
  if(name){
    const docId = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60) || 'anonymous';
    const all = (await DB.list('quizLeaderboard', 'beu_quiz_leaderboard_cache')).slice().sort((a,b)=> b.xp - a.xp);
    const pos = all.findIndex(p=> p.id === docId || p.name === name);
    if(pos >= 0) rank = `#${pos+1} of ${all.length}`;
  }

  // "Your contributions" — everything this student has actually submitted
  // through the site's crowdsourced features (there's no file-upload system,
  // so this tracks contributions rather than uploaded files).
  const myProfessors = (await DB.list('professors', LS.professors)).length ? store.get(LS.professors, []).length : 0;
  const myQuestions = store.get(LS.questions, []).length;
  const myAnswers = store.get(LS.answers, []).length;
  const daysPlayed = Object.keys(qp.answeredDates || {}).length;

  const p = progress();
  const level = levelFromXP(p.xp);
  const badges = earnedBadges(p);

  el2.innerHTML = `
    <div class="card text-center">
      <div style="font-size:2.2rem;">🧑‍🎓</div>
      <h2 style="margin:6px 0 2px;">${escapeHtml(name || 'Set your name on the Dashboard')}</h2>
      <p class="muted">${escapeHtml(branch || 'Branch not set')}${sem ? ' · Semester '+escapeHtml(sem) : ''}</p>
      <p class="mt-8" style="font-weight:700; color:var(--primary);">Level ${level}</p>
    </div>
    <div class="grid grid-4 mt-16">
      <div class="card"><div class="card-icon">⭐</div><h3>${p.xp}</h3><p>XP</p></div>
      <div class="card"><div class="card-icon">🪙</div><h3>${p.coins}</h3><p>Coins</p></div>
      <div class="card"><div class="card-icon">🔥</div><h3>${p.loginStreak}</h3><p>Login streak</p></div>
      <div class="card"><div class="card-icon">🏆</div><h3>${rank}</h3><p>Leaderboard rank</p></div>
    </div>
    <h3 class="mt-24" style="font-size:1rem;">Achievement Badges</h3>
    <div class="grid grid-4 mt-16">
      ${BADGE_DEFS.map(b=>{
        const earned = badges.some(x=> x.key === b.key);
        return `<div class="card" style="text-align:center; opacity:${earned?1:.35};">
          <div style="font-size:1.6rem;">${b.icon}</div>
          <p style="font-size:.78rem; font-weight:600; margin-top:6px;">${escapeHtml(b.label)}</p>
          ${earned ? '<p class="muted" style="font-size:.68rem;">Earned ✓</p>' : '<p class="muted" style="font-size:.68rem;">Locked</p>'}
        </div>`;
      }).join('')}
    </div>
    <h3 class="mt-24" style="font-size:1rem;">Your contributions</h3>
    <div class="grid grid-4 mt-16">
      <div class="card"><div class="card-icon">📝</div><h3>${myQuestions}</h3><p>Questions posted</p></div>
      <div class="card"><div class="card-icon">💬</div><h3>${myAnswers}</h3><p>Answers written</p></div>
      <div class="card"><div class="card-icon">👨‍🏫</div><h3>${myProfessors}</h3><p>Professors added</p></div>
      <div class="card"><div class="card-icon">🧠</div><h3>${daysPlayed}</h3><p>Quiz days played</p></div>
    </div>
    <p class="muted mt-16" style="font-size:.78rem;">This device's local activity is always counted here. Leaderboard rank only updates once you've set a name on the Dashboard and played today's quiz.</p>
  `;
}


const Attendance = {
  course: 'btech',
  data(){
    const d = store.get(LS.attendance, {});
    if(!d.btech) d.btech = {subjects:[], cutoff:75};
    if(!d.polytechnic) d.polytechnic = {subjects:[], cutoff:75};
    return d;
  },
  save(d){ store.set(LS.attendance, d); },

  init(){
    this.course = store.get('beu_att_course', 'btech');
    $$('#attCourseToggle .pill').forEach(p=>{
      p.classList.toggle('active', p.dataset.course === this.course);
      p.addEventListener('click', ()=>{
        this.course = p.dataset.course;
        store.set('beu_att_course', this.course);
        $$('#attCourseToggle .pill').forEach(x=> x.classList.toggle('active', x===p));
        this.loadCutoff();
        this.renderList();
      });
    });
    $('#attAddSubjectBtn').addEventListener('click', ()=> this.addSubject());
    $('#attNewSubject').addEventListener('keydown', e=>{ if(e.key==='Enter') this.addSubject(); });
    $('#attCutoff').addEventListener('change', ()=>{
      const d = this.data();
      if(!d[this.course]) d[this.course] = {subjects:[], cutoff:75};
      d[this.course].cutoff = Math.min(100, Math.max(0, Number($('#attCutoff').value) || 75));
      this.save(d);
      this.renderList();
    });
    this.loadCutoff();
    this.renderList();
  },

  loadCutoff(){
    const d = this.data();
    $('#attCutoff').value = d[this.course]?.cutoff ?? 75;
  },

  addSubject(){
    const name = $('#attNewSubject').value.trim();
    if(!name){ toast('Enter a subject name'); return; }
    const d = this.data();
    if(!d[this.course]) d[this.course] = {subjects:[], cutoff:75};
    if(d[this.course].subjects.some(s=> s.name.toLowerCase() === name.toLowerCase())){
      toast('That subject is already on your list'); return;
    }
    d[this.course].subjects.push({ id:'sub_'+Date.now(), name, present:0, total:0, log:[] });
    this.save(d);
    $('#attNewSubject').value = '';
    this.renderList();
    toast('Subject added');
  },

  mark(id, present){
    const d = this.data();
    const sub = d[this.course].subjects.find(s=> s.id===id);
    if(!sub) return;
    sub.total++;
    if(present) sub.present++;
    sub.log.push({date:new Date().toISOString().slice(0,10), present});
    this.save(d);
    this.renderList();
    toast(present ? 'Marked present ✅' : 'Marked absent ❌');
  },

  undo(id){
    const d = this.data();
    const sub = d[this.course].subjects.find(s=> s.id===id);
    if(!sub || !sub.log.length){ toast('Nothing to undo'); return; }
    const last = sub.log.pop();
    sub.total--;
    if(last.present) sub.present--;
    this.save(d);
    this.renderList();
    toast('Last entry undone');
  },

  remove(id){
    const d = this.data();
    d[this.course].subjects = d[this.course].subjects.filter(s=> s.id!==id);
    this.save(d);
    this.renderList();
    toast('Subject removed');
  },

  renderList(){
    const d = this.data();
    const bucket = d[this.course] || {subjects:[], cutoff:75};
    const cutoff = bucket.cutoff ?? 75;
    const subs = bucket.subjects || [];
    const wrap = $('#attSubjectList');
    if(!subs.length){
      wrap.innerHTML = '<p class="muted">No subjects yet — add one above to start tracking.</p>';
      return;
    }
    wrap.innerHTML = subs.map(s=>{
      const pct = s.total ? Math.round((s.present / s.total) * 100) : 0;
      const ok = s.total > 0 && pct >= cutoff;

      let message;
      if(s.total === 0){
        message = "Mark today's class to start tracking.";
      } else if(ok){
        // how many more classes can be skipped and stay at/above cutoff
        let p = s.present, t = s.total, x = 0;
        while(p / (t + x + 1) >= cutoff / 100 && x < 1000) x++;
        message = `You can skip the next ${x} class${x===1?'':'es'} and stay above ${cutoff}%.`;
      } else {
        let p = s.present, t = s.total, x = 0;
        while((p + x) / (t + x) < cutoff / 100 && x < 1000) x++;
        message = `Attend the next ${x} class${x===1?'':'es'} to reach ${cutoff}%.`;
      }

      const color = ok ? 'var(--success)' : (s.total===0 ? 'var(--text-dim)' : 'var(--danger)');
      return `
      <div class="att-subject-card">
        <div class="flex justify-between items-center" style="flex-wrap:wrap; gap:10px;">
          <div>
            <h4>${escapeHtml(s.name)}</h4>
            <p class="muted" style="font-size:.8rem; margin-top:2px;">${s.present} / ${s.total} classes · <b style="color:${color}">${pct}%</b></p>
          </div>
          <div class="flex gap-8" style="flex-wrap:wrap;">
            <button class="btn-att present" onclick="Attendance.mark('${s.id}', true)">✓ Present</button>
            <button class="btn-att absent" onclick="Attendance.mark('${s.id}', false)">✕ Absent</button>
            <button class="btn-att undo" onclick="Attendance.undo('${s.id}')">Undo</button>
            <button class="icon-btn" onclick="Attendance.remove('${s.id}')" title="Delete subject">🗑️</button>
          </div>
        </div>
        <div class="att-progress mt-8"><div class="att-progress-fill" style="width:${pct}%; background:${color}"></div></div>
        <p class="muted mt-8" style="font-size:.78rem">${escapeHtml(message)}</p>
      </div>`;
    }).join('');
  }
};

function initAttendance(){ Attendance.init(); }

/* ============================== CGPA / SGPA ============================== */
function initCGPA(){
  const rowsWrap = $('#cgpaRows');
  function addRow(subject='', credit=4, grade=8){
    const row = el(`
      <div class="form-row cols-3" style="align-items:end; margin-bottom:8px;">
        <div class="field" style="margin:0"><label>Subject</label><input type="text" class="cg-subj" value="${subject}" placeholder="Subject name"></div>
        <div class="field" style="margin:0"><label>Credit</label><input type="number" class="cg-credit" value="${credit}" min="1" max="6"></div>
        <div class="field" style="margin:0"><label>Grade Point (0-10)</label><input type="number" class="cg-grade" value="${grade}" min="0" max="10"></div>
      </div>
    `);
    rowsWrap.appendChild(row);
  }
  $('#cgpaAddRow').addEventListener('click', ()=>addRow());
  for(let i=0;i<5;i++) addRow();

  $('#cgpaCalcBtn').addEventListener('click', ()=>{
    const credits = $$('.cg-credit').map(i=>Number(i.value)||0);
    const grades = $$('.cg-grade').map(i=>Number(i.value)||0);
    let totalCredits=0, weighted=0;
    credits.forEach((c,i)=>{ totalCredits+=c; weighted += c*grades[i]; });
    const sgpa = totalCredits ? (weighted/totalCredits) : 0;
    $('#sgpaResult').textContent = sgpa.toFixed(2);

    // save this semester's SGPA
    const semLabel = $('#cgpaSemLabel').value || `Semester ${Object.keys(store.get(LS.cgpa,{})).length+1}`;
    const all = store.get(LS.cgpa, {});
    all[semLabel] = {sgpa: Number(sgpa.toFixed(2)), credits: totalCredits};
    store.set(LS.cgpa, all);
    renderCgpaHistory();
    toast('SGPA calculated & saved');
  });

  function renderCgpaHistory(){
    const all = store.get(LS.cgpa, {});
    const entries = Object.entries(all);
    $('#cgpaHistory').innerHTML = entries.length ? entries.map(([k,v])=>`<tr><td>${escapeHtml(k)}</td><td>${v.sgpa}</td><td>${v.credits}</td></tr>`).join('') : `<tr><td colspan="3" class="muted">No semesters saved yet.</td></tr>`;
    if(entries.length){
      const totalCred = entries.reduce((a,[,v])=>a+v.credits,0);
      const totalW = entries.reduce((a,[,v])=>a+v.credits*v.sgpa,0);
      $('#cgpaOverall').textContent = (totalW/totalCred).toFixed(2);
    } else { $('#cgpaOverall').textContent = '—'; }
  }
  renderCgpaHistory();
  $('#cgpaClearBtn').addEventListener('click', ()=>{ store.set(LS.cgpa,{}); renderCgpaHistory(); toast('Saved history cleared'); });
}

/* ============================== TIMETABLE ============================== */
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function initTimetable(){
  const tt = store.get(LS.timetable, {});
  const daySel = $('#ttDay');
  fillSelect(daySel, DAYS);
  function renderDay(){
    const day = daySel.value;
    const rows = tt[day] || [];
    $('#ttTableBody').innerHTML = rows.map((r,idx)=>`
      <tr><td>${escapeHtml(r.time)}</td><td>${escapeHtml(r.subject)}</td><td>${escapeHtml(r.faculty)}</td><td>${escapeHtml(r.room)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="removeTTRow('${day}',${idx})">Remove</button></td></tr>
    `).join('') || `<tr><td colspan="5" class="muted">No classes added for ${escapeHtml(day)} yet.</td></tr>`;
  }
  daySel.addEventListener('change', renderDay);
  window.removeTTRow = (day, idx)=>{
    const t = store.get(LS.timetable, {});
    t[day].splice(idx,1); store.set(LS.timetable, t); renderDay();
  };
  $('#ttAddBtn').addEventListener('click', ()=>{
    const time = $('#ttTime').value, subject = $('#ttSubject').value, faculty = $('#ttFaculty').value, room = $('#ttRoom').value;
    if(!time || !subject){ toast('Add a time and subject'); return; }
    const t = store.get(LS.timetable, {});
    const day = daySel.value;
    if(!t[day]) t[day] = [];
    t[day].push({time,subject,faculty,room});
    t[day].sort((a,b)=> a.time.localeCompare(b.time));
    store.set(LS.timetable, t);
    $('#ttTime').value=''; $('#ttSubject').value=''; $('#ttFaculty').value=''; $('#ttRoom').value='';
    renderDay();
    toast('Class added to timetable');
  });
  renderDay();

  $('#ttReminderBtn').addEventListener('click', async ()=>{
    if(!('Notification' in window)){ toast('Notifications not supported on this device'); return; }
    const perm = await Notification.requestPermission();
    if(perm === 'granted'){
      toast('Reminders enabled — keep this tab open for alerts');
      store.set('beu_tt_reminders', true);
    } else { toast('Permission denied'); }
  });
}

/* ============================== REVIEWS ============================== */
function initReviews(){
  let currentRating = 5;
  $$('.star').forEach(star=>{
    star.addEventListener('click', ()=>{
      currentRating = Number(star.dataset.val);
      $$('.star').forEach(s=> s.textContent = Number(s.dataset.val) <= currentRating ? '★' : '☆');
    });
  });
  $('#reviewForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const name = $('#revName').value || 'Anonymous';
    const email = $('#revEmail').value;
    const feedback = $('#revFeedback').value;
    if(!feedback.trim()){ toast('Please write your feedback'); return; }
    const all = store.get(LS.reviews, []);
    all.unshift({name,email,feedback,rating:currentRating,date:new Date().toLocaleDateString()});
    store.set(LS.reviews, all);
    $('#reviewForm').reset();
    renderReviews();
    toast('Thanks! Feedback saved for the admin team 🙌');
  });
  renderReviews();
}
function renderReviews(){
  const all = store.get(LS.reviews, []);
  $('#reviewsList').innerHTML = all.slice(0,6).map(r=>`
    <div class="card">
      <div class="flex justify-between items-center">
        <h3 style="font-size:.9rem">${escapeHtml(r.name)}</h3>
        <span>${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span>
      </div>
      <p>${escapeHtml(r.feedback)}</p>
      <p class="muted" style="font-size:.72rem">${r.date}</p>
    </div>
  `).join('') || '<p class="muted">No reviews yet — be the first to share feedback!</p>';
}

/* ============================== DAILY QUIZ ==============================
   Seed question bank — general CS/engineering fundamentals, factually
   verified. 5 questions rotate in daily (same 5 for everyone on a given day,
   deterministic by date so it doesn't need a backend to stay in sync).
   Add more over time by appending to this array — nothing else needs to change. */
const QUIZ_BANK = [
  {q:"What is the time complexity of binary search on a sorted array of n elements?", options:["O(n)","O(log n)","O(n log n)","O(1)"], answer:1, subject:"Data Structures"},
  {q:"Which data structure uses LIFO (Last In First Out) order?", options:["Queue","Stack","Linked List","Tree"], answer:1, subject:"Data Structures"},
  {q:"In a binary search tree, what is the time complexity of search in the worst case?", options:["O(log n)","O(n)","O(1)","O(n^2)"], answer:1, subject:"Data Structures"},
  {q:"Which traversal of a binary tree visits nodes in sorted order for a BST?", options:["Preorder","Postorder","Inorder","Level order"], answer:2, subject:"Data Structures"},
  {q:"What is the worst-case time complexity of Quick Sort?", options:["O(n log n)","O(n)","O(n^2)","O(log n)"], answer:2, subject:"Data Structures"},
  {q:"Which data structure is used to implement recursion internally?", options:["Queue","Stack","Heap","Graph"], answer:1, subject:"Data Structures"},
  {q:"A complete binary tree with n nodes has a height of approximately:", options:["O(n)","O(log n)","O(n^2)","O(1)"], answer:1, subject:"Data Structures"},
  {q:"Which sorting algorithm has the best average-case time complexity of O(n log n) AND is stable?", options:["Quick Sort","Heap Sort","Merge Sort","Selection Sort"], answer:2, subject:"Data Structures"},

  {q:"In DBMS, which normal form eliminates transitive dependency?", options:["1NF","2NF","3NF","BCNF"], answer:2, subject:"DBMS"},
  {q:"Which SQL clause is used to filter groups after GROUP BY?", options:["WHERE","HAVING","FILTER","ORDER BY"], answer:1, subject:"DBMS"},
  {q:"What does ACID stand for in database transactions (the 'I')?", options:["Integrity","Isolation","Independence","Indexing"], answer:1, subject:"DBMS"},
  {q:"Which key uniquely identifies a row and cannot be NULL?", options:["Foreign Key","Candidate Key","Primary Key","Super Key"], answer:2, subject:"DBMS"},
  {q:"A relation is in 1NF if all attribute values are:", options:["Unique","Atomic","Foreign keys","Indexed"], answer:1, subject:"DBMS"},
  {q:"Which type of SQL JOIN returns rows only when there is a match in both tables?", options:["LEFT JOIN","RIGHT JOIN","INNER JOIN","FULL OUTER JOIN"], answer:2, subject:"DBMS"},
  {q:"In DBMS, a deadlock can be prevented by which technique?", options:["Indexing","Wait-Die scheme","Normalization","Denormalization"], answer:1, subject:"DBMS"},
  {q:"Which of these is NOT one of the ACID properties?", options:["Atomicity","Consistency","Scalability","Durability"], answer:2, subject:"DBMS"},

  {q:"Which OS scheduling algorithm can cause starvation of low-priority processes?", options:["Round Robin","Priority Scheduling","FCFS","SJF (non-preemptive can also, but this is the classic answer)"], answer:1, subject:"Operating System"},
  {q:"What is a deadlock's necessary condition where a resource can only be released voluntarily?", options:["Mutual Exclusion","No Preemption","Hold and Wait","Circular Wait"], answer:1, subject:"Operating System"},
  {q:"Which page replacement algorithm replaces the page that was least recently used?", options:["FIFO","LRU","Optimal","Random"], answer:1, subject:"Operating System"},
  {q:"A process in 'waiting' state is waiting for:", options:["CPU allocation","Some I/O or event to complete","Memory allocation","Termination"], answer:1, subject:"Operating System"},
  {q:"Which of these is a preemptive scheduling algorithm?", options:["FCFS","Round Robin","SJF (non-preemptive)","None of these"], answer:1, subject:"Operating System"},
  {q:"Thrashing in an OS occurs due to:", options:["Too much CPU idle time","Excessive paging activity","Too many I/O devices","High disk space"], answer:1, subject:"Operating System"},
  {q:"A binary semaphore can take which values?", options:["Any integer","0 and 1 only","1 to 10","Negative only"], answer:1, subject:"Operating System"},
  {q:"Which memory management technique suffers from external fragmentation?", options:["Paging","Segmentation","Both equally","Neither"], answer:1, subject:"Operating System"},

  {q:"Which layer of the OSI model is responsible for routing?", options:["Data Link Layer","Network Layer","Transport Layer","Session Layer"], answer:1, subject:"Computer Networks"},
  {q:"Which protocol is connection-oriented and guarantees reliable delivery?", options:["UDP","TCP","IP","ICMP"], answer:1, subject:"Computer Networks"},
  {q:"What is the default port number for HTTP?", options:["21","25","80","443"], answer:2, subject:"Computer Networks"},
  {q:"Which device operates at the Network Layer to connect different networks?", options:["Switch","Hub","Router","Repeater"], answer:2, subject:"Computer Networks"},
  {q:"DNS is primarily used to:", options:["Encrypt data","Translate domain names to IP addresses","Compress packets","Assign MAC addresses"], answer:1, subject:"Computer Networks"},
  {q:"Which of these is a private IP address range?", options:["8.8.8.8","192.168.0.0/16","1.1.1.1","200.1.1.1"], answer:1, subject:"Computer Networks"},
  {q:"In the OSI model, which layer handles encryption and compression?", options:["Presentation Layer","Session Layer","Application Layer","Transport Layer"], answer:0, subject:"Computer Networks"},
  {q:"What does ARP stand for?", options:["Address Routing Protocol","Address Resolution Protocol","Automatic Response Protocol","Application Relay Protocol"], answer:1, subject:"Computer Networks"},

  {q:"How many valence electrons does a trivalent impurity have?", options:["3","4","5","6"], answer:0, subject:"Digital Electronics"},
  {q:"A NAND gate is equivalent to which combination?", options:["AND followed by OR","AND followed by NOT","OR followed by NOT","NOT followed by OR"], answer:1, subject:"Digital Electronics"},
  {q:"How many flip-flops are needed to build a MOD-8 counter?", options:["2","3","4","8"], answer:1, subject:"Digital Electronics"},
  {q:"A full adder circuit adds how many bits at once (including carry-in)?", options:["2 bits","3 bits","4 bits","1 bit"], answer:1, subject:"Digital Electronics"},

  {q:"If a train 100m long travels at 36 km/h, how long does it take to cross a pole?", options:["5 seconds","10 seconds","15 seconds","20 seconds"], answer:1, subject:"Aptitude"},
  {q:"What is the next number in the series: 2, 6, 12, 20, 30, ?", options:["36","40","42","44"], answer:2, subject:"Aptitude"},
  {q:"If the ratio of two numbers is 3:4 and their sum is 63, what is the larger number?", options:["27","36","30","33"], answer:1, subject:"Aptitude"},
  {q:"A can complete a work in 10 days, B in 15 days. Working together, how many days will they take?", options:["5 days","6 days","8 days","12 days"], answer:1, subject:"Aptitude"}
];

/* ============================== DAILY APTITUDE ============================== */
const APTITUDE_BANK = [
  {q:"A sum of money doubles itself in 8 years at simple interest. What is the rate of interest?", options:["10%","12.5%","15%","8%"], answer:1, topic:"Quant"},
  {q:"The average of 5 consecutive numbers is 30. What is the largest number?", options:["30","31","32","33"], answer:2, topic:"Quant"},
  {q:"A shopkeeper marks an item 40% above cost price and gives a 10% discount. What is his profit percentage?", options:["24%","26%","30%","36%"], answer:2, topic:"Quant"},
  {q:"If 20 men can build a wall in 15 days, how many days will 25 men take?", options:["10 days","12 days","14 days","18 days"], answer:1, topic:"Quant"},
  {q:"What is the compound interest on ₹10,000 for 2 years at 10% per annum?", options:["₹2,000","₹2,100","₹2,200","₹2,500"], answer:1, topic:"Quant"},

  {q:"Look at this series: 7, 10, 8, 11, 9, 12, ? What number comes next?", options:["9","10","12","13"], answer:1, topic:"Reasoning"},
  {q:"Pointing to a photograph, a man says, 'She is the daughter of my grandfather's only son.' How is the woman related to the man?", options:["Mother","Sister","Aunt","Wife"], answer:1, topic:"Reasoning"},
  {q:"In a certain code, 'COMPUTER' is written as 'RFUVQNPC'. How is 'MEDICINE' written in that code?", options:["EOJDJEFM","NFEJDJOE","MFEJDJOE","NFEJDJNE"], answer:1, topic:"Reasoning"},
  {q:"If South-East becomes North, North-East becomes West, then what will West become?", options:["North-East","North-West","South-East","South"], answer:2, topic:"Reasoning"},
  {q:"Find the odd one out: Triangle, Square, Circle, Cube", options:["Triangle","Square","Circle","Cube"], answer:3, topic:"Reasoning"},

  {q:"Choose the correctly spelled word.", options:["Recieve","Receive","Receeve","Receve"], answer:1, topic:"English"},
  {q:"Choose the synonym of 'Ephemeral'.", options:["Permanent","Short-lived","Ancient","Colorful"], answer:1, topic:"English"},
  {q:"Choose the antonym of 'Benevolent'.", options:["Kind","Generous","Malevolent","Charitable"], answer:2, topic:"English"},
  {q:"Fill in the blank: She has been working here ___ 2019.", options:["for","since","from","at"], answer:1, topic:"English"},
  {q:"Identify the correctly punctuated sentence.", options:["Its a beautiful day.","It's a beautiful day.","Its' a beautiful day.","It is a beautiful, day."], answer:1, topic:"English"},

  {q:"A company's revenue grew from ₹50 lakh to ₹65 lakh in one year. What was the percentage growth?", options:["25%","28%","30%","32%"], answer:2, topic:"Data Interpretation"},
  {q:"If a pie chart shows 90° for a category out of 360° total, what percentage does it represent?", options:["20%","25%","30%","35%"], answer:1, topic:"Data Interpretation"},
  {q:"A bar chart shows sales of 120, 150, 90, 180 units over 4 months. What is the average monthly sale?", options:["130","135","140","145"], answer:2, topic:"Data Interpretation"},

  {q:"All roses are flowers. Some flowers fade quickly. Which conclusion is valid?", options:["All roses fade quickly","Some flowers are roses","No valid conclusion follows","All flowers are roses"], answer:2, topic:"Logical Reasoning"},
  {q:"If all Bloops are Razzies and all Razzies are Lazzies, are all Bloops definitely Lazzies?", options:["Yes","No","Cannot be determined","Only some Bloops"], answer:0, topic:"Logical Reasoning"},
];
const APTITUDE_DAILY_COUNT = 1;
function todaysAptitudeQuestion(){
  const date = todayStr();
  const shuffled = seededShuffle(APTITUDE_BANK, dateSeed(date + '_apt'));
  return shuffled[0];
}

/* ============================== WORD OF THE DAY ============================== */
const WORD_BANK = [
  {word:"Ubiquitous", pronunciation:"yoo-BIK-wi-tuhs", meaning:"Present, appearing, or found everywhere.", hindiMeaning:"सर्वव्यापी", example:"Smartphones have become ubiquitous in modern life.", synonyms:["Omnipresent","Widespread","Pervasive"], interviewUsage:"\"In today's ubiquitous digital landscape, cybersecurity has become a top priority.\""},
  {word:"Meticulous", pronunciation:"mi-TIK-yuh-luhs", meaning:"Showing great attention to detail; very careful and precise.", hindiMeaning:"बारीकी से काम करने वाला", example:"She is meticulous about checking her code before submission.", synonyms:["Thorough","Precise","Careful"], interviewUsage:"\"I'm meticulous about testing edge cases before deploying any feature.\""},
  {word:"Resilient", pronunciation:"ri-ZIL-yuhnt", meaning:"Able to withstand or recover quickly from difficult conditions.", hindiMeaning:"लचीला / दृढ़", example:"A resilient system continues to function even after a server fails.", synonyms:["Tough","Adaptable","Hardy"], interviewUsage:"\"I stay resilient under pressure, especially during tight project deadlines.\""},
  {word:"Pragmatic", pronunciation:"prag-MAT-ik", meaning:"Dealing with things sensibly and realistically.", hindiMeaning:"व्यावहारिक", example:"We need a pragmatic approach to solve this scaling issue.", synonyms:["Practical","Realistic","Sensible"], interviewUsage:"\"My approach to problem-solving is pragmatic — I focus on what actually works.\""},
  {word:"Ambiguous", pronunciation:"am-BIG-yoo-uhs", meaning:"Open to more than one interpretation; not clear or decided.", hindiMeaning:"अस्पष्ट / द्विअर्थी", example:"The requirements were ambiguous, so we asked the client for clarification.", synonyms:["Unclear","Vague","Uncertain"], interviewUsage:"\"When requirements are ambiguous, I always clarify with stakeholders first.\""},
  {word:"Redundant", pronunciation:"ri-DUHN-duhnt", meaning:"Not or no longer needed; superfluous. In engineering, a backup component.", hindiMeaning:"अनावश्यक / फालतू", example:"We added a redundant server to prevent downtime if one fails.", synonyms:["Superfluous","Unnecessary","Excess"], interviewUsage:"\"We built redundant systems so a single point of failure won't crash the app.\""},
  {word:"Scalable", pronunciation:"SKAY-luh-buhl", meaning:"Able to be changed in size or scale, especially expanded to handle growth.", hindiMeaning:"मापनीय / विस्तार योग्य", example:"We chose a scalable cloud architecture to handle future user growth.", synonyms:["Expandable","Flexible","Adaptable"], interviewUsage:"\"I designed the backend to be scalable so it can handle 10x more traffic.\""},
  {word:"Diligent", pronunciation:"DIL-i-juhnt", meaning:"Showing careful and persistent effort in work or duties.", hindiMeaning:"मेहनती / परिश्रमी", example:"He was diligent in reviewing every line of the pull request.", synonyms:["Hardworking","Industrious","Conscientious"], interviewUsage:"\"I'm a diligent worker who double-checks every deliverable before submission.\""},
  {word:"Consensus", pronunciation:"kuhn-SEN-suhs", meaning:"General agreement among a group of people.", hindiMeaning:"सर्वसम्मति", example:"The team reached a consensus on which framework to use.", synonyms:["Agreement","Accord","Unanimity"], interviewUsage:"\"I try to build consensus before making major technical decisions.\""},
  {word:"Feasible", pronunciation:"FEE-zuh-buhl", meaning:"Possible to do easily or conveniently; achievable.", hindiMeaning:"व्यवहार्य / संभव", example:"Is it feasible to complete this feature within one sprint?", synonyms:["Achievable","Possible","Viable"], interviewUsage:"\"I first check if a solution is technically feasible before committing to a timeline.\""},
];
function todaysWord(){
  const date = todayStr();
  const shuffled = seededShuffle(WORD_BANK, dateSeed(date + '_word'));
  return shuffled[0];
}

/* ============================== DAILY CODING CHALLENGE ==============================
   Each problem is self-contained (no stdin needed) — the program should just
   print the exact expected output. Runs on the free public Piston API
   (https://github.com/engineer-man/piston) via emkc.org, so it works without
   you needing to host any code-execution backend yourself. Since it's a free
   third-party service, it can occasionally be slow/rate-limited — that's a
   real tradeoff of not running your own judge infrastructure. */
const CODING_BANK = [
  {
    title:"Sum of Two Numbers", difficulty:"Easy",
    description:"Write a program that prints the sum of 5 and 7.",
    expected:"12",
    starter:{
      python:"# Print the sum of 5 and 7\nprint(5 + 7)",
      c:"#include <stdio.h>\nint main(){\n    printf(\"%d\", 5 + 7);\n    return 0;\n}",
      cpp:"#include <iostream>\nusing namespace std;\nint main(){\n    cout << 5 + 7;\n    return 0;\n}",
      java:"public class Main {\n    public static void main(String[] args) {\n        System.out.print(5 + 7);\n    }\n}"
    },
    editorial:"Just add the two numbers and print the result — the simplest possible program, useful for checking your setup works."
  },
  {
    title:"Factorial of 5", difficulty:"Easy",
    description:"Write a program that computes and prints the factorial of 5 (5! = 5×4×3×2×1).",
    expected:"120",
    starter:{
      python:"n = 5\nfact = 1\nfor i in range(1, n+1):\n    fact *= i\nprint(fact)",
      c:"#include <stdio.h>\nint main(){\n    int n = 5, fact = 1;\n    for(int i=1;i<=n;i++) fact *= i;\n    printf(\"%d\", fact);\n    return 0;\n}",
      cpp:"#include <iostream>\nusing namespace std;\nint main(){\n    int n = 5, fact = 1;\n    for(int i=1;i<=n;i++) fact *= i;\n    cout << fact;\n    return 0;\n}",
      java:"public class Main {\n    public static void main(String[] args) {\n        int n = 5, fact = 1;\n        for(int i=1;i<=n;i++) fact *= i;\n        System.out.print(fact);\n    }\n}"
    },
    editorial:"Multiply numbers from 1 to n in a loop. 5! = 5×4×3×2×1 = 120."
  },
  {
    title:"Check Prime", difficulty:"Easy",
    description:"Write a program that checks if 29 is prime, and prints \"Yes\" if it is prime or \"No\" if it isn't.",
    expected:"Yes",
    starter:{
      python:"n = 29\nis_prime = n > 1\nfor i in range(2, int(n**0.5)+1):\n    if n % i == 0:\n        is_prime = False\n        break\nprint(\"Yes\" if is_prime else \"No\")",
      c:"#include <stdio.h>\n#include <math.h>\nint main(){\n    int n = 29, isPrime = n > 1;\n    for(int i=2;i<=sqrt(n);i++){\n        if(n % i == 0){ isPrime = 0; break; }\n    }\n    printf(isPrime ? \"Yes\" : \"No\");\n    return 0;\n}",
      cpp:"#include <iostream>\n#include <cmath>\nusing namespace std;\nint main(){\n    int n = 29; bool isPrime = n > 1;\n    for(int i=2;i<=sqrt(n);i++){\n        if(n % i == 0){ isPrime = false; break; }\n    }\n    cout << (isPrime ? \"Yes\" : \"No\");\n    return 0;\n}",
      java:"public class Main {\n    public static void main(String[] args) {\n        int n = 29; boolean isPrime = n > 1;\n        for(int i=2;i<=Math.sqrt(n);i++){\n            if(n % i == 0){ isPrime = false; break; }\n        }\n        System.out.print(isPrime ? \"Yes\" : \"No\");\n    }\n}"
    },
    editorial:"Check divisibility only up to √n — if nothing divides evenly, it's prime. 29 has no divisors other than 1 and itself, so it's prime."
  },
  {
    title:"Reverse a String", difficulty:"Easy",
    description:"Write a program that prints the reverse of the string \"hello\".",
    expected:"olleh",
    starter:{
      python:"s = \"hello\"\nprint(s[::-1])",
      c:"#include <stdio.h>\n#include <string.h>\nint main(){\n    char s[] = \"hello\";\n    int len = strlen(s);\n    for(int i=len-1;i>=0;i--) printf(\"%c\", s[i]);\n    return 0;\n}",
      cpp:"#include <iostream>\n#include <algorithm>\nusing namespace std;\nint main(){\n    string s = \"hello\";\n    reverse(s.begin(), s.end());\n    cout << s;\n    return 0;\n}",
      java:"public class Main {\n    public static void main(String[] args) {\n        String s = \"hello\";\n        System.out.print(new StringBuilder(s).reverse().toString());\n    }\n}"
    },
    editorial:"Most languages have a built-in way to reverse a sequence — Python slicing [::-1], C++ std::reverse, or Java's StringBuilder.reverse()."
  },
  {
    title:"Fibonacci Sequence", difficulty:"Medium",
    description:"Write a program that prints the first 10 Fibonacci numbers, space-separated, starting from 0 and 1 (e.g. \"0 1 1 2 ...\").",
    expected:"0 1 1 2 3 5 8 13 21 34",
    starter:{
      python:"a, b = 0, 1\nresult = []\nfor _ in range(10):\n    result.append(str(a))\n    a, b = b, a + b\nprint(\" \".join(result))",
      c:"#include <stdio.h>\nint main(){\n    long a=0, b=1, t;\n    for(int i=0;i<10;i++){\n        printf(\"%ld\", a);\n        if(i<9) printf(\" \");\n        t = a + b; a = b; b = t;\n    }\n    return 0;\n}",
      cpp:"#include <iostream>\nusing namespace std;\nint main(){\n    long a=0, b=1, t;\n    for(int i=0;i<10;i++){\n        cout << a;\n        if(i<9) cout << \" \";\n        t = a + b; a = b; b = t;\n    }\n    return 0;\n}",
      java:"public class Main {\n    public static void main(String[] args) {\n        long a=0, b=1, t;\n        for(int i=0;i<10;i++){\n            System.out.print(a);\n            if(i<9) System.out.print(\" \");\n            t = a + b; a = b; b = t;\n        }\n    }\n}"
    },
    editorial:"Keep two running variables (a, b) and repeatedly compute the next term as their sum — classic O(n) Fibonacci without recursion."
  },
  {
    title:"GCD of Two Numbers", difficulty:"Medium",
    description:"Write a program that prints the GCD (greatest common divisor) of 48 and 18.",
    expected:"6",
    starter:{
      python:"a, b = 48, 18\nwhile b:\n    a, b = b, a % b\nprint(a)",
      c:"#include <stdio.h>\nint main(){\n    int a = 48, b = 18, t;\n    while(b){ t = b; b = a % b; a = t; }\n    printf(\"%d\", a);\n    return 0;\n}",
      cpp:"#include <iostream>\nusing namespace std;\nint main(){\n    int a = 48, b = 18, t;\n    while(b){ t = b; b = a % b; a = t; }\n    cout << a;\n    return 0;\n}",
      java:"public class Main {\n    public static void main(String[] args) {\n        int a = 48, b = 18, t;\n        while(b != 0){ t = b; b = a % b; a = t; }\n        System.out.print(a);\n    }\n}"
    },
    editorial:"This is the Euclidean algorithm: repeatedly replace (a,b) with (b, a mod b) until b becomes 0. GCD(48,18)=6."
  },
  {
    title:"Palindrome Check", difficulty:"Medium",
    description:"Write a program that checks if \"madam\" is a palindrome and prints \"Yes\" or \"No\".",
    expected:"Yes",
    starter:{
      python:"s = \"madam\"\nprint(\"Yes\" if s == s[::-1] else \"No\")",
      c:"#include <stdio.h>\n#include <string.h>\nint main(){\n    char s[] = \"madam\";\n    int len = strlen(s), isPal = 1;\n    for(int i=0;i<len/2;i++){\n        if(s[i] != s[len-1-i]){ isPal = 0; break; }\n    }\n    printf(isPal ? \"Yes\" : \"No\");\n    return 0;\n}",
      cpp:"#include <iostream>\n#include <algorithm>\nusing namespace std;\nint main(){\n    string s = \"madam\", r = s;\n    reverse(r.begin(), r.end());\n    cout << (s == r ? \"Yes\" : \"No\");\n    return 0;\n}",
      java:"public class Main {\n    public static void main(String[] args) {\n        String s = \"madam\";\n        String r = new StringBuilder(s).reverse().toString();\n        System.out.print(s.equals(r) ? \"Yes\" : \"No\");\n    }\n}"
    },
    editorial:"Compare the string to its own reverse — if they match, it reads the same forwards and backwards."
  },
  {
    title:"Binary Search", difficulty:"Hard",
    description:"Given the sorted array [1, 3, 5, 7, 9, 11], write a program that finds the index of 7 using binary search and prints that index (0-based).",
    expected:"3",
    starter:{
      python:"arr = [1, 3, 5, 7, 9, 11]\ntarget = 7\nlo, hi = 0, len(arr)-1\nresult = -1\nwhile lo <= hi:\n    mid = (lo + hi) // 2\n    if arr[mid] == target:\n        result = mid\n        break\n    elif arr[mid] < target:\n        lo = mid + 1\n    else:\n        hi = mid - 1\nprint(result)",
      c:"#include <stdio.h>\nint main(){\n    int arr[] = {1,3,5,7,9,11};\n    int target = 7, lo = 0, hi = 5, result = -1;\n    while(lo <= hi){\n        int mid = (lo + hi) / 2;\n        if(arr[mid] == target){ result = mid; break; }\n        else if(arr[mid] < target) lo = mid + 1;\n        else hi = mid - 1;\n    }\n    printf(\"%d\", result);\n    return 0;\n}",
      cpp:"#include <iostream>\nusing namespace std;\nint main(){\n    int arr[] = {1,3,5,7,9,11};\n    int target = 7, lo = 0, hi = 5, result = -1;\n    while(lo <= hi){\n        int mid = (lo + hi) / 2;\n        if(arr[mid] == target){ result = mid; break; }\n        else if(arr[mid] < target) lo = mid + 1;\n        else hi = mid - 1;\n    }\n    cout << result;\n    return 0;\n}",
      java:"public class Main {\n    public static void main(String[] args) {\n        int[] arr = {1,3,5,7,9,11};\n        int target = 7, lo = 0, hi = 5, result = -1;\n        while(lo <= hi){\n            int mid = (lo + hi) / 2;\n            if(arr[mid] == target){ result = mid; break; }\n            else if(arr[mid] < target) lo = mid + 1;\n            else hi = mid - 1;\n        }\n        System.out.print(result);\n    }\n}"
    },
    editorial:"Binary search halves the search space each step by comparing the middle element to the target. 7 sits at index 3 in [1,3,5,7,9,11]."
  }
];

const PISTON_LANG_MAP = {
  python:{language:'python', aliases:['python3','python']},
  c:{language:'c', aliases:['c']},
  cpp:{language:'cpp', aliases:['c++','cpp']},
  java:{language:'java', aliases:['java']}
};
const PISTON_FILENAME = {python:'main.py', c:'main.c', cpp:'main.cpp', java:'Main.java'};

function todaysCodingProblem(){
  const date = todayStr();
  const shuffled = seededShuffle(CODING_BANK, dateSeed(date + '_code'));
  return shuffled[0];
}

let pistonRuntimesCache = null;
async function getPistonVersion(lang){
  try{
    if(!pistonRuntimesCache){
      const res = await fetch('https://emkc.org/api/v2/piston/runtimes');
      pistonRuntimesCache = await res.json();
    }
    const match = pistonRuntimesCache.find(r=> r.language === PISTON_LANG_MAP[lang].language || (r.aliases||[]).includes(lang));
    return match ? match.version : '*';
  }catch(err){
    console.error('[Piston] Could not fetch runtimes, defaulting to *:', err);
    return '*';
  }
}
async function runCode(lang, code){
  const version = await getPistonVersion(lang);
  const res = await fetch('https://emkc.org/api/v2/piston/execute', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      language: PISTON_LANG_MAP[lang].language,
      version,
      files: [{name: PISTON_FILENAME[lang], content: code}]
    })
  });
  if(!res.ok) throw new Error('Piston API error: ' + res.status);
  return res.json();
}


const QUIZ_DAILY_COUNT = 5;
const QUIZ_XP_PER_CORRECT = 10;
const QUIZ_COINS_PER_CORRECT = 2;
const QUIZ_STREAK_BONUS_XP = 20; // bonus for completing all 5 correctly

function todayStr(){ return new Date().toISOString().slice(0,10); }
function daysBetween(d1, d2){ return Math.round((new Date(d2) - new Date(d1)) / 86400000); }

/* Deterministic "random" pick so every visitor gets the same 5 questions on
   the same calendar day, without needing a shared backend for the question
   selection itself (only the leaderboard needs the shared backend). */
function seededShuffle(arr, seed){
  const a = arr.slice();
  let s = seed;
  const rand = ()=>{ s = (s * 9301 + 49297) % 233280; return s / 233280; };
  for(let i=a.length-1; i>0; i--){
    const j = Math.floor(rand() * (i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function dateSeed(dateStr){
  let h = 0;
  for(let i=0;i<dateStr.length;i++) h = (h*31 + dateStr.charCodeAt(i)) >>> 0;
  return h;
}
function todaysQuizQuestions(){
  const date = todayStr();
  const shuffled = seededShuffle(QUIZ_BANK, dateSeed(date));
  return shuffled.slice(0, QUIZ_DAILY_COUNT);
}

function quizProgress(){
  return store.get(LS.quizProgress, {xp:0, coins:0, streak:0, lastCompletedDate:null, answeredDates:{}});
}
function saveQuizProgress(p){ store.set(LS.quizProgress, p); }

/* ============================== GENERAL PROGRESS SYSTEM ==============================
   XP / coins / login streak / level / badges / recent activity — shared across
   Daily Quiz, Daily Aptitude, Coding Challenge, Notes, AI Study Session, etc.
   Builds on the same LS.quizProgress store so existing quiz streak/XP data
   carries over rather than resetting. */
const XP_TABLE = {
  readNotes: 5, quiz: 20, uploadNotes: 50, dailyLogin: 10,
  codingChallenge: 30, aiStudySession: 15, aptitude: 15, wordOfDay: 5
};
const COIN_TABLE = {
  readNotes: 1, quiz: 2, uploadNotes: 10, dailyLogin: 2,
  codingChallenge: 5, aiStudySession: 3, aptitude: 3, wordOfDay: 1
};
const LEVEL_XP_STEP = 100; // 100 XP per level

function levelFromXP(xp){ return Math.floor(xp / LEVEL_XP_STEP) + 1; }
function xpIntoLevel(xp){ return xp % LEVEL_XP_STEP; }

function progress(){
  const p = quizProgress();
  if(p.loginStreak === undefined) p.loginStreak = 0;
  if(p.longestLoginStreak === undefined) p.longestLoginStreak = 0;
  if(!p.activityLog) p.activityLog = [];
  if(!p.codingHistory) p.codingHistory = {};
  if(!p.aptitudeDates) p.aptitudeDates = {};
  if(!p.wordsLearned) p.wordsLearned = {};
  if(p.lastLoginDate === undefined) p.lastLoginDate = null;
  return p;
}
function saveProgress(p){ saveQuizProgress(p); }

/* Central place every activity awards XP/coins through, so the activity feed
   and totals always stay consistent. `type` must be a key in XP_TABLE. */
function awardActivity(type, label){
  const p = progress();
  const xp = XP_TABLE[type] || 0;
  const coins = COIN_TABLE[type] || 0;
  p.xp += xp;
  p.coins += coins;
  p.activityLog.unshift({type, label, xp, coins, date: new Date().toISOString()});
  p.activityLog = p.activityLog.slice(0, 30);
  saveProgress(p);
  return {xp, coins};
}

/* Called once per page load. Awards Daily Login XP once per calendar day and
   keeps a login streak (kept as its own `loginStreak` field, separate from
   the existing quiz-completion `streak` field so neither system stomps on
   the other). */
function updateLoginStreak(){
  const p = progress();
  const today = todayStr();
  if(p.lastLoginDate === today) return; // already counted today
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
  p.loginStreak = (p.lastLoginDate === yesterday) ? p.loginStreak + 1 : 1;
  p.longestLoginStreak = Math.max(p.longestLoginStreak || 0, p.loginStreak);
  p.lastLoginDate = today;
  saveProgress(p);
  awardActivity('dailyLogin', 'Daily login bonus');
}

const BADGE_DEFS = [
  {key:'streak7', label:'7 Day Streak', icon:'🔥', check: p=> (p.longestLoginStreak||0) >= 7},
  {key:'streak30', label:'30 Day Streak', icon:'🔥', check: p=> (p.longestLoginStreak||0) >= 30},
  {key:'streak100', label:'Century Streak', icon:'💯', check: p=> (p.longestLoginStreak||0) >= 100},
  {key:'quizmaster', label:'Quiz Master', icon:'🧠', check: p=> Object.keys(p.answeredDates||{}).length >= 10},
  {key:'codingexpert', label:'Coding Expert', icon:'💻', check: p=> Object.keys(p.codingHistory||{}).length >= 5},
  {key:'wordsmith', label:'Wordsmith', icon:'📖', check: p=> Object.keys(p.wordsLearned||{}).length >= 10},
  {key:'level5', label:'Level 5 Reached', icon:'⭐', check: p=> levelFromXP(p.xp) >= 5},
  {key:'level10', label:'Level 10 Reached', icon:'🌟', check: p=> levelFromXP(p.xp) >= 10},
];
function earnedBadges(p){ return BADGE_DEFS.filter(b=> b.check(p)); }

function initQuiz(){
  renderQuiz();
  renderQuizStatsBar();
  renderLeaderboard();
  $('#quizLeaderboardRefresh')?.addEventListener('click', renderLeaderboard);
}

function renderQuizStatsBar(){
  const p = quizProgress();
  const bar = $('#quizStatsBar');
  if(!bar) return;
  bar.innerHTML = `
    <div class="quiz-stat"><span class="quiz-stat-num">${p.xp}</span><span class="quiz-stat-label">XP</span></div>
    <div class="quiz-stat"><span class="quiz-stat-num">🪙 ${p.coins}</span><span class="quiz-stat-label">Coins</span></div>
    <div class="quiz-stat"><span class="quiz-stat-num">🔥 ${p.streak}</span><span class="quiz-stat-label">Day streak</span></div>
  `;
}

function renderQuiz(){
  const container = $('#quizContainer');
  if(!container) return;
  const date = todayStr();
  const p = quizProgress();
  const todays = todaysQuizQuestions();
  const already = p.answeredDates[date];

  if(already){
    container.innerHTML = `
      <div class="card" style="text-align:center;">
        <div style="font-size:2rem;">✅</div>
        <h3>Today's quiz done!</h3>
        <p class="muted">You scored ${already.correctCount}/${QUIZ_DAILY_COUNT} today. Come back tomorrow for 5 new questions.</p>
      </div>
      <div class="mt-16">
        ${todays.map((q,i)=>`
          <div class="card mt-8">
            <p style="font-size:.9rem; font-weight:600;">${i+1}. ${escapeHtml(q.q)}</p>
            <p class="muted" style="font-size:.8rem;">Your answer: ${escapeHtml(q.options[already.answers[i]] ?? '—')} ${already.answers[i]===q.answer ? '✅' : '❌ (correct: '+escapeHtml(q.options[q.answer])+')'}</p>
          </div>
        `).join('')}
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <form id="quizForm">
      ${todays.map((q,i)=>`
        <div class="card mt-8">
          <p class="muted" style="font-size:.72rem;">${escapeHtml(q.subject)}</p>
          <p style="font-size:.92rem; font-weight:600;">${i+1}. ${escapeHtml(q.q)}</p>
          ${q.options.map((opt,oi)=>`
            <label style="display:flex; align-items:center; gap:8px; margin-top:8px; font-size:.85rem; cursor:pointer;">
              <input type="radio" name="q${i}" value="${oi}" required> ${escapeHtml(opt)}
            </label>
          `).join('')}
        </div>
      `).join('')}
      <button type="submit" class="btn btn-primary btn-block mt-16">Submit Quiz</button>
    </form>
  `;

  $('#quizForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const answers = todays.map((q,i)=>{
      const picked = container.querySelector(`input[name="q${i}"]:checked`);
      return picked ? Number(picked.value) : -1;
    });
    const correctCount = answers.filter((a,i)=> a === todays[i].answer).length;

    const prog = quizProgress();
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0,10);
    prog.streak = (prog.lastCompletedDate === yesterday) ? prog.streak + 1 : 1;
    prog.lastCompletedDate = date;
    prog.xp += correctCount * QUIZ_XP_PER_CORRECT + (correctCount === QUIZ_DAILY_COUNT ? QUIZ_STREAK_BONUS_XP : 0);
    prog.coins += correctCount * QUIZ_COINS_PER_CORRECT;
    prog.answeredDates[date] = {correctCount, answers};
    saveQuizProgress(prog);

    renderQuiz();
    renderQuizStatsBar();
    updateLeaderboardEntry(prog);
    toast(`${correctCount}/${QUIZ_DAILY_COUNT} correct — +${correctCount * QUIZ_XP_PER_CORRECT} XP, +${correctCount * QUIZ_COINS_PER_CORRECT} coins! 🎉`);
  });
}

async function updateLeaderboardEntry(prog){
  const name = store.get(LS.studentName, '').trim();
  if(!name) return; // no display name set yet (Dashboard) — skip leaderboard sync
  const docId = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 60) || 'anonymous';
  await DB.setDoc('quizLeaderboard', 'beu_quiz_leaderboard_cache', docId, {
    name, xp: prog.xp, coins: prog.coins, streak: prog.streak, date: new Date().toISOString()
  });
  renderLeaderboard();
}

async function renderLeaderboard(){
  const el2 = $('#quizLeaderboard');
  if(!el2) return;
  el2.innerHTML = `<p class="muted" style="font-size:.82rem;">Loading leaderboard…</p>`;
  const all = (await DB.list('quizLeaderboard', 'beu_quiz_leaderboard_cache'))
    .slice().sort((a,b)=> b.xp - a.xp).slice(0, 20);
  if(!all.length){
    el2.innerHTML = `<p class="muted" style="font-size:.82rem;">No scores yet — set your name on the Dashboard and play today's quiz to appear here!</p>`;
    return;
  }
  el2.innerHTML = `
    <table class="table">
      <thead><tr><th>#</th><th>Name</th><th>XP</th><th>🪙</th><th>🔥</th></tr></thead>
      <tbody>
        ${all.map((p,i)=>`<tr><td>${i+1}</td><td>${escapeHtml(p.name)}</td><td>${p.xp}</td><td>${p.coins}</td><td>${p.streak}</td></tr>`).join('')}
      </tbody>
    </table>
  `;
}

/* ============================== DAILY APTITUDE PAGE ============================== */
function initAptitude(){ renderAptitude(); }
function renderAptitude(){
  const container = $('#aptitudeContainer');
  if(!container) return;
  const date = todayStr();
  const p = progress();
  const q = todaysAptitudeQuestion();
  const already = p.aptitudeDates[date];

  if(already){
    const correct = already.answer === q.answer;
    container.innerHTML = `
      <div class="card" style="text-align:center;">
        <div style="font-size:2rem;">${correct ? '✅' : '📖'}</div>
        <h3>Today's aptitude question done!</h3>
        <p class="muted">${correct ? 'Correct! Great job.' : 'Not quite — check the right answer below.'} Come back tomorrow for a new one.</p>
      </div>
      <div class="card mt-16">
        <p class="muted" style="font-size:.72rem;">${escapeHtml(q.topic)}</p>
        <p style="font-weight:600;">${escapeHtml(q.q)}</p>
        <p class="muted mt-8" style="font-size:.85rem;">Your answer: ${escapeHtml(q.options[already.answer] ?? '—')} ${correct ? '✅' : '❌ (correct: '+escapeHtml(q.options[q.answer])+')'}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <form id="aptitudeForm">
      <div class="card">
        <p class="muted" style="font-size:.72rem;">${escapeHtml(q.topic)}</p>
        <p style="font-weight:600; font-size:.95rem;">${escapeHtml(q.q)}</p>
        ${q.options.map((opt,oi)=>`
          <label style="display:flex; align-items:center; gap:8px; margin-top:8px; font-size:.85rem; cursor:pointer;">
            <input type="radio" name="apt" value="${oi}" required> ${escapeHtml(opt)}
          </label>
        `).join('')}
      </div>
      <button type="submit" class="btn btn-primary btn-block mt-16">Submit Answer</button>
    </form>
  `;
  $('#aptitudeForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const picked = container.querySelector('input[name="apt"]:checked');
    const answer = picked ? Number(picked.value) : -1;
    const correct = answer === q.answer;
    const prog = progress();
    prog.aptitudeDates[date] = {answer, topic:q.topic};
    saveProgress(prog);
    awardActivity('aptitude', `Aptitude (${q.topic})`);
    renderAptitude();
    toast(correct ? 'Correct! 🎉' : `Not quite — the right answer was "${q.options[q.answer]}"`);
  });
}

/* ============================== WORD OF THE DAY PAGE ============================== */
function initWordOfDay(){ renderWordOfDay(); }
function renderWordOfDay(){
  const container = $('#wordContainer');
  if(!container) return;
  const date = todayStr();
  const p = progress();
  const w = todaysWord();
  const learned = !!p.wordsLearned[date];

  container.innerHTML = `
    <div class="card">
      <div class="flex justify-between items-center">
        <h2 style="margin:0;">${escapeHtml(w.word)}</h2>
        <button class="icon-btn" id="wordSpeakBtn" title="Hear pronunciation">🔊</button>
      </div>
      <p class="muted" style="font-size:.85rem;">/${escapeHtml(w.pronunciation)}/</p>
      <p class="mt-16"><b>Meaning:</b> ${escapeHtml(w.meaning)}</p>
      <p><b>Hindi:</b> ${escapeHtml(w.hindiMeaning)}</p>
      <p class="mt-8"><b>Example:</b> <i>${escapeHtml(w.example)}</i></p>
      <p class="mt-8"><b>Synonyms:</b> ${w.synonyms.map(escapeHtml).join(', ')}</p>
      <p class="mt-8"><b>Interview usage:</b> ${escapeHtml(w.interviewUsage)}</p>
      ${learned
        ? `<p class="mt-16" style="color:var(--success); font-weight:600;">✅ Learned today!</p>`
        : `<button class="btn btn-primary btn-block mt-16" id="wordLearnedBtn">Mark as Learned (+${XP_TABLE.wordOfDay} XP)</button>`}
    </div>
  `;
  $('#wordSpeakBtn')?.addEventListener('click', ()=>{
    if(!('speechSynthesis' in window)){ toast('Voice playback not supported in this browser'); return; }
    const u = new SpeechSynthesisUtterance(w.word);
    u.lang = 'en-US';
    speechSynthesis.speak(u);
  });
  $('#wordLearnedBtn')?.addEventListener('click', ()=>{
    const prog = progress();
    prog.wordsLearned[date] = w.word;
    saveProgress(prog);
    awardActivity('wordOfDay', `Learned word: ${w.word}`);
    renderWordOfDay();
    toast('Nice! +' + XP_TABLE.wordOfDay + ' XP 🎉');
  });
}

/* ============================== CODING CHALLENGE PAGE ============================== */
function initCodingChallenge(){ renderCodingChallenge(); }
function renderCodingChallenge(){
  const container = $('#codingContainer');
  if(!container) return;
  const date = todayStr();
  const p = progress();
  const problem = todaysCodingProblem();
  const already = p.codingHistory[date];
  const lang = (already && already.lang) || 'python';

  container.innerHTML = `
    <div class="card">
      <div class="flex justify-between items-center">
        <h3 style="margin:0;">${escapeHtml(problem.title)}</h3>
        <span class="tag">${escapeHtml(problem.difficulty)}</span>
      </div>
      <p class="mt-8">${escapeHtml(problem.description)}</p>
    </div>
    <div class="form-row mt-16">
      <label>Language</label>
      <select id="codeLang">
        <option value="python">Python</option>
        <option value="c">C</option>
        <option value="cpp">C++</option>
        <option value="java">Java</option>
      </select>
    </div>
    <textarea id="codeEditor" rows="14" style="width:100%; font-family:var(--font-mono, monospace); font-size:.85rem; margin-top:8px;" spellcheck="false"></textarea>
    <div class="flex gap-8 mt-16">
      <button class="btn btn-primary" id="codeRunBtn">▶ Run &amp; Submit</button>
      ${already ? `<span class="tag" style="align-self:center;">${already.passed ? '✅ Solved today' : '📝 Attempted today'}</span>` : ''}
    </div>
    <div id="codeOutput" class="mt-16"></div>
    ${already ? `<div class="card mt-16"><h3 style="font-size:.9rem;">Editorial</h3><p class="mt-8" style="font-size:.85rem;">${escapeHtml(problem.editorial)}</p></div>` : ''}
  `;

  const langSel = $('#codeLang');
  langSel.value = lang;
  const editor = $('#codeEditor');
  editor.value = (already && already.code) || problem.starter[langSel.value];
  langSel.addEventListener('change', ()=>{
    editor.value = problem.starter[langSel.value];
  });

  $('#codeRunBtn').addEventListener('click', async ()=>{
    const btn = $('#codeRunBtn');
    btn.disabled = true; btn.textContent = 'Running…';
    $('#codeOutput').innerHTML = `<p class="muted">Compiling and running on Piston (public code-execution API)…</p>`;
    try{
      const result = await runCode(langSel.value, editor.value);
      const stdout = (result.run && result.run.stdout) || '';
      const stderr = (result.run && result.run.stderr) || result.compile?.stderr || '';
      const passed = stdout.trim() === problem.expected.trim();

      $('#codeOutput').innerHTML = `
        <div class="card">
          <p style="font-size:.8rem; font-weight:600;">Output:</p>
          <pre style="white-space:pre-wrap; font-size:.82rem; background:var(--surface-2); padding:10px; border-radius:8px;">${escapeHtml(stdout || '(no output)')}</pre>
          ${stderr ? `<p style="font-size:.8rem; font-weight:600; color:var(--danger);" class="mt-8">Errors:</p><pre style="white-space:pre-wrap; font-size:.78rem; background:var(--surface-2); padding:10px; border-radius:8px; color:var(--danger);">${escapeHtml(stderr)}</pre>` : ''}
          <p class="mt-8" style="font-weight:700; color:${passed ? 'var(--success)' : 'var(--danger)'};">${passed ? '✅ Correct! Expected output matched.' : '❌ Not quite — expected: '+escapeHtml(problem.expected)}</p>
        </div>
      `;

      const prog = progress();
      const isFirstSubmitToday = !prog.codingHistory[date];
      prog.codingHistory[date] = {lang: langSel.value, code: editor.value, passed, title: problem.title};
      saveProgress(prog);
      if(isFirstSubmitToday) awardActivity('codingChallenge', `Coding: ${problem.title}`);
      renderCodingChallenge();
    }catch(err){
      console.error(err);
      $('#codeOutput').innerHTML = `<p style="color:var(--danger);">Couldn't reach the code execution service (Piston API) — check your internet connection and try again. If this keeps happening, the free public API may be temporarily down.</p>`;
    }finally{
      btn.disabled = false; btn.textContent = '▶ Run & Submit';
    }
  });
}

/* ============================== NOTIFICATION CENTER ==============================
   In-app reminders only — there's no push-notification backend (Web Push
   needs a server to trigger it), so this shows a computed list of "things
   you might want to do today" whenever you open the site, rather than
   alerting you outside the tab. */
function computeNotifications(){
  const p = progress();
  const today = todayStr();
  const notifs = [];
  if(!p.answeredDates[today]) notifs.push({icon:'🧠', text:"Today's Daily Quiz is waiting", link:'quiz'});
  if(!p.wordsLearned[today]) notifs.push({icon:'📖', text:"Learn today's Word of the Day", link:'word-of-day'});
  if(!p.aptitudeDates[today]) notifs.push({icon:'🔢', text:"Try today's Aptitude question", link:'aptitude'});
  if(!p.codingHistory[today]) notifs.push({icon:'💻', text:"Solve today's Coding Challenge", link:'coding-challenge'});
  const exams = store.get(LS.exams, []).filter(e=> new Date(e.date) >= new Date(today));
  exams.forEach(e=>{
    const daysLeft = daysBetween(today, e.date);
    if(daysLeft <= 3) notifs.push({icon:'📅', text:`${e.name} is in ${daysLeft===0?'today':daysLeft+' day'+(daysLeft===1?'':'s')}!`, link:'dashboard'});
  });
  return notifs;
}
function initNotifications(){
  const btn = $('#notifBellBtn');
  if(!btn) return;
  const refreshDot = ()=>{
    const notifs = computeNotifications();
    $('#notifDot').style.display = notifs.length ? 'block' : 'none';
  };
  refreshDot();
  btn.addEventListener('click', ()=>{
    const notifs = computeNotifications();
    const html = notifs.length
      ? notifs.map(n=>`
          <a href="#${n.link}" data-page-link="${n.link}" class="card mt-8" style="display:flex; align-items:center; gap:10px; text-decoration:none;" onclick="closePanel()">
            <span style="font-size:1.3rem;">${n.icon}</span>
            <span style="font-size:.85rem; color:var(--text);">${escapeHtml(n.text)}</span>
          </a>
        `).join('')
      : '<p class="muted">You\'re all caught up! 🎉</p>';
    openPanel(html, 'Notifications');
  });
}

/* ============================== DISCUSSION FORUM ==============================
   Lightweight text-only forum (no image uploads — this site has no file
   storage backend). Posts, likes and comments are shared via Firestore once
   configured (see firebase-config.js), otherwise local-only like everything
   else on this site without a backend. */
function initForum(){
  $('#forumNewPostBtn').addEventListener('click', openNewPostForm);
  $('#forumSearch').addEventListener('input', renderForum);
  renderForum();
}
async function renderForum(){
  const search = ($('#forumSearch').value || '').trim().toLowerCase();
  let posts = await DB.list('forumPosts', 'beu_forum_posts');
  if(search) posts = posts.filter(p=> p.text.toLowerCase().includes(search) || (p.subject||'').toLowerCase().includes(search));
  const el2 = $('#forumList');
  if(!posts.length){
    el2.innerHTML = `<p class="muted">No posts yet — start the conversation!</p>`;
    return;
  }
  el2.innerHTML = posts.map(post=>`
    <div class="card mt-8">
      <p class="muted" style="font-size:.72rem;">${post.anonymous ? 'Anonymous' : escapeHtml(post.author||'Student')}${post.subject ? ' · '+escapeHtml(post.subject) : ''} · ${new Date(post.date).toLocaleDateString()}</p>
      <p class="mt-8" style="font-size:.9rem;">${escapeHtml(post.text)}</p>
      <div class="flex gap-8 mt-8">
        <button class="btn btn-ghost btn-sm forum-like-btn" data-id="${post.id}">👍 ${post.likes||0}</button>
        <button class="btn btn-ghost btn-sm forum-comment-btn" data-id="${post.id}">💬 Comments</button>
        <button class="btn btn-ghost btn-sm" onclick="navigator.share ? navigator.share({title:'BEU Hub Discussion', text:${JSON.stringify(post.text)}}) : (navigator.clipboard.writeText(${JSON.stringify(post.text)}), toast('Copied to clipboard'))">↗ Share</button>
        ${isAdminMode() ? `<button class="btn btn-ghost btn-sm admin-delete-post" data-id="${post.id}" style="color:var(--danger);">🗑️</button>` : ''}
      </div>
    </div>
  `).join('');
  $$('.forum-like-btn').forEach(b=> b.addEventListener('click', async ()=>{
    const posts2 = await DB.list('forumPosts', 'beu_forum_posts');
    const post = posts2.find(p=> p.id === b.dataset.id);
    if(!post) return;
    await DB.setDoc('forumPosts', 'beu_forum_posts', post.id, {...post, likes:(post.likes||0)+1});
    renderForum();
  }));
  $$('.forum-comment-btn').forEach(b=> b.addEventListener('click', ()=> openForumPostDetail(b.dataset.id)));
  $$('.admin-delete-post').forEach(b=> b.addEventListener('click', async ()=>{
    if(!confirm('Delete this post?')) return;
    await DB.remove('forumPosts', 'beu_forum_posts', b.dataset.id);
    toast('Post deleted');
    renderForum();
  }));
}
function openNewPostForm(){
  const html = `
    <form id="newPostForm">
      <div class="form-row">
        <label>Subject tag (optional)</label>
        <input type="text" id="npSubject" placeholder="e.g. Data Structures">
      </div>
      <div class="form-row mt-8">
        <label>What's on your mind?</label>
        <textarea id="npText" rows="4" required placeholder="Ask a doubt, share a resource, start a discussion..."></textarea>
      </div>
      <label style="display:flex; align-items:center; gap:8px; margin-top:8px; font-size:.85rem;">
        <input type="checkbox" id="npAnonymous"> Post anonymously
      </label>
      <p class="muted mt-8" style="font-size:.76rem;">Be respectful — no personal attacks, harassment or defamatory content.</p>
      <button type="submit" class="btn btn-primary btn-block mt-16">Post</button>
    </form>
  `;
  openPanel(html, 'New Discussion');
  $('#newPostForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const text = $('#npText').value.trim();
    if(!text){ toast('Write something first'); return; }
    if(containsBannedContent(text)){ toast('Please keep it respectful'); return; }
    await DB.add('forumPosts', 'beu_forum_posts', {
      text, subject: $('#npSubject').value.trim(),
      anonymous: $('#npAnonymous').checked,
      author: store.get(LS.studentName, '').trim() || 'Student',
      likes: 0, date: new Date().toISOString()
    });
    closePanel();
    renderForum();
    toast('Posted!');
  });
}
async function openForumPostDetail(postId){
  const posts = await DB.list('forumPosts', 'beu_forum_posts');
  const post = posts.find(p=> p.id === postId);
  if(!post) return;
  const comments = (await DB.list('forumComments', 'beu_forum_comments')).filter(c=> c.postId === postId);
  const html = `
    <p style="font-size:.9rem;">${escapeHtml(post.text)}</p>
    <h3 class="mt-16" style="font-size:.9rem;">Add a comment</h3>
    <form id="forumCommentForm">
      <textarea id="fcText" rows="2" required placeholder="Write a comment..."></textarea>
      <button type="submit" class="btn btn-primary btn-sm mt-8">Comment</button>
    </form>
    <h3 class="mt-24" style="font-size:.9rem;">Comments (${comments.length})</h3>
    ${comments.length ? comments.map(c=>`<div class="card mt-8" style="padding:10px;"><p style="font-size:.85rem;">${escapeHtml(c.text)}</p></div>`).join('') : '<p class="muted mt-8">No comments yet.</p>'}
  `;
  openPanel(html, 'Discussion');
  $('#forumCommentForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const text = $('#fcText').value.trim();
    if(!text){ return; }
    if(containsBannedContent(text)){ toast('Please keep it respectful'); return; }
    await DB.add('forumComments', 'beu_forum_comments', {postId, text, date:new Date().toISOString()});
    openForumPostDetail(postId);
  });
}


function initStudyPlanner(){
  const branchSel = $('#spBranch'), semSel = $('#spSem');
  if(!branchSel) return;
  fillSelect(branchSel, BRANCHES); fillSelect(semSel, SEMESTERS);
  branchSel.value = store.get(LS.studentBranch, BRANCHES[0]);
  semSel.value = store.get(LS.studentSem, '1');
  const refreshSubjects = ()=>{
    const subjSel = $('#spSubjects');
    subjSel.innerHTML = subjectsFor(Number(semSel.value), branchSel.value)
      .map(s=> `<label style="display:flex; align-items:center; gap:6px; font-size:.82rem; margin-top:6px;"><input type="checkbox" value="${escapeHtml(s)}"> ${escapeHtml(s)}</label>`).join('');
  };
  branchSel.addEventListener('change', refreshSubjects);
  semSel.addEventListener('change', refreshSubjects);
  refreshSubjects();

  $('#spGenerateBtn').addEventListener('click', async ()=>{
    const subjects = $$('#spSubjects input:checked').map(c=> c.value);
    const examDate = $('#spExamDate').value;
    const hours = $('#spHours').value || '2';
    if(!subjects.length){ toast('Select at least one subject'); return; }
    if(!examDate){ toast('Pick an exam date'); return; }

    const daysLeft = Math.max(1, daysBetween(todayStr(), examDate));
    const prompt = `I'm a ${branchSel.value} student in Semester ${semSel.value}. My exam is in ${daysLeft} days (on ${examDate}). I need to prepare these subjects: ${subjects.join(', ')}. I can study about ${hours} hours per day.

Create a study plan with these three parts, clearly labeled with headers:
1. DAILY PLAN — what to study each day for the next 7 days
2. WEEKLY PLAN — how to divide the remaining time across all ${subjects.length} subjects until the exam
3. REVISION PLAN — a revision strategy for the final 3 days before the exam

Keep it practical and concise, using short bullet points, not long paragraphs.`;

    const out = $('#spOutput');
    out.innerHTML = `<p class="muted">Generating your plan…</p>`;
    try{
      const plan = await AIChat.getReply(prompt, []);
      out.innerHTML = `<div class="card mt-16" style="white-space:pre-wrap; font-size:.88rem; line-height:1.6;">${escapeHtml(plan)}</div>`;
      awardActivity('aiStudySession', 'Generated an AI study plan');
      toast('Study plan ready! +' + XP_TABLE.aiStudySession + ' XP');
    }catch(err){
      out.innerHTML = `<p style="color:var(--danger);">Could not generate a plan — make sure the AI backend is connected (⚙️ in the AI chat).</p>`;
    }
  });
}

/* ============================== DB (shared backend abstraction) ==============================
   Used by Rate My Professor + Q&A Board. Transparently uses Firestore when
   firebase-config.js has real keys filled in (shared across all students);
   otherwise falls back to localStorage (this device only), so the site
   always works even before a backend is set up. */
const DB = {
  async list(collectionName, localKey){
    if(firebaseReady){
      try{
        const snap = await firestoreDB.collection(collectionName).orderBy('date', 'desc').get();
        return snap.docs.map(d=> ({id: d.id, ...d.data()}));
      }catch(err){
        console.error(`[DB] Firestore read failed for ${collectionName}, falling back to local data:`, err);
        return store.get(localKey, []).slice().reverse();
      }
    }
    return store.get(localKey, []).slice().reverse();
  },
  async add(collectionName, localKey, obj){
    if(firebaseReady){
      try{
        const ref = await firestoreDB.collection(collectionName).add(obj);
        return {id: ref.id, ...obj};
      }catch(err){
        console.error(`[DB] Firestore write failed for ${collectionName}, saving locally instead:`, err);
      }
    }
    const items = store.get(localKey, []);
    const item = {id: 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2,7), ...obj};
    items.push(item);
    store.set(localKey, items);
    return item;
  },
  /* Upsert by an explicit document id — used for the quiz leaderboard, where
     each player's row should update in place rather than growing a new row
     every time they play (there's no login system, so "player identity" is
     just their chosen display name from the Dashboard). */
  async setDoc(collectionName, localKey, docId, obj){
    if(firebaseReady){
      try{
        await firestoreDB.collection(collectionName).doc(docId).set(obj, {merge:true});
        return {id: docId, ...obj};
      }catch(err){
        console.error(`[DB] Firestore upsert failed for ${collectionName}/${docId}, saving locally instead:`, err);
      }
    }
    const items = store.get(localKey, []);
    const idx = items.findIndex(i=> i.id === docId);
    if(idx >= 0) items[idx] = {...items[idx], ...obj, id:docId};
    else items.push({id:docId, ...obj});
    store.set(localKey, items);
    return {id:docId, ...obj};
  },
  /* Used by the lightweight Admin Mode (moderation) toggle. NOTE: Admin Mode
     is a client-side convenience toggle only — it is NOT a security boundary.
     If Firebase is connected, whether a delete actually succeeds depends
     entirely on your Firestore security rules. The rules recommended in
     firebase-config.js block all deletes by default (safest option for a
     site with no real login system); loosening them lets *anyone* delete
     *anything*, not just people who've flipped this toggle on their own
     device. See firebase-config.js for the tradeoffs and the proper fix
     (Firebase Auth + admin-only rules) if you want real moderation later. */
  async remove(collectionName, localKey, id){
    if(firebaseReady){
      try{
        await firestoreDB.collection(collectionName).doc(id).delete();
        return true;
      }catch(err){
        console.error(`[DB] Firestore delete failed for ${collectionName}/${id}:`, err);
        toast('Could not delete — your Firestore rules may be blocking it (see firebase-config.js)');
        return false;
      }
    }
    const items = store.get(localKey, []);
    store.set(localKey, items.filter(i=> i.id !== id));
    return true;
  }
};

/* ============================== RATE MY PROFESSOR ==============================
   Professors and ratings are 100% crowdsourced — students add professors and
   rate them themselves; nothing is pre-filled. Saved to Firestore (shared
   across every student) once firebase-config.js is set up — see that file.
   Until then, everything here runs on localStorage on this device only. */
async function profAverages(profId){
  const ratings = (await DB.list('profRatings', LS.profRatings)).filter(r => r.profId === profId);
  const out = {count: ratings.length};
  let overallSum = 0, overallN = 0;
  PROF_RATING_CATEGORIES.forEach(c=>{
    const vals = ratings.map(r=> r[c.key]).filter(v=> typeof v === 'number');
    const avg = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0;
    out[c.key] = avg;
    overallSum += vals.reduce((a,b)=>a+b,0);
    overallN += vals.length;
  });
  out.overall = overallN ? overallSum/overallN : 0;
  return out;
}
function containsBannedContent(text){
  const lower = (text||'').toLowerCase();
  return PROF_BANNED_WORDS.some(w => lower.includes(w));
}
function initProfessors(){
  const note = $('#profBackendNote');
  if(note && firebaseReady) note.textContent = '📌 Professors and ratings here are added entirely by students — nothing is pre-filled. Rate the teaching experience, not the person: no personal attacks, harassment or defamatory comments. Ratings are shared live across every student.';
  const collegeSel = $('#profCollege');
  collegeSel.innerHTML = '<option value="">All colleges</option>' + BEU_COLLEGES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  const deptSel = $('#profDept');
  deptSel.innerHTML = '<option value="">All departments</option>' + BRANCHES.map(b=>`<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
  [collegeSel, deptSel].forEach(el=> el.addEventListener('change', renderProfessorList));
  $('#profSearch').addEventListener('input', renderProfessorList);
  $('#addProfBtn').addEventListener('click', openAddProfessorForm);
  renderProfessorList();
}
async function renderProfessorList(){
  const college = $('#profCollege').value;
  const dept = $('#profDept').value;
  const search = ($('#profSearch').value || '').trim().toLowerCase();
  let all = await DB.list('professors', LS.professors);
  if(college) all = all.filter(p=> p.college === college);
  if(dept) all = all.filter(p=> p.dept === dept);
  if(search) all = all.filter(p=> p.name.toLowerCase().includes(search));

  const filtered = !!(college || dept || search);
  $('#profCount').textContent = `${all.length} professor${all.length===1?'':'s'}${filtered ? ' matching your filters' : ' added so far'}`;

  if(!all.length){
    $('#profList').innerHTML = `<div class="card" style="grid-column:1/-1; text-align:center;">
      <p class="muted">No professors here yet. Be the first to add one!</p>
      <button class="btn btn-primary btn-sm mt-8" id="profEmptyAddBtn">+ Add a Professor</button>
    </div>`;
    $('#profEmptyAddBtn').addEventListener('click', openAddProfessorForm);
    return;
  }

  const rows = await Promise.all(all.map(async p=>{
    const avg = await profAverages(p.id);
    const stars = avg.count ? '★'.repeat(Math.round(avg.overall)) + '☆'.repeat(5-Math.round(avg.overall)) : '☆☆☆☆☆';
    return `
      <div class="card">
        <h3 style="font-size:1rem;">${escapeHtml(p.name)}</h3>
        <p class="muted" style="font-size:.78rem;">${escapeHtml(p.dept)} · ${escapeHtml(p.college)}</p>
        <p style="font-size:1.05rem; color:var(--accent);">${stars} <span class="muted" style="font-size:.78rem;">${avg.count ? avg.overall.toFixed(1)+'/5 · '+avg.count+' rating'+(avg.count===1?'':'s') : 'No ratings yet'}</span></p>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm prof-detail-btn" data-id="${p.id}">Rate & view reviews</button>
          ${isAdminMode() ? `<button class="btn btn-ghost btn-sm admin-delete-prof" data-id="${p.id}" style="color:var(--danger);">🗑️ Delete</button>` : ''}
        </div>
      </div>
    `;
  }));
  $('#profList').innerHTML = rows.join('');
  $$('.prof-detail-btn').forEach(b=> b.addEventListener('click', ()=> openProfessorDetail(b.dataset.id)));
  $$('.admin-delete-prof').forEach(b=> b.addEventListener('click', async ()=>{
    if(!confirm('Delete this professor and all their ratings?')) return;
    await DB.remove('professors', LS.professors, b.dataset.id);
    const allRatings = await DB.list('profRatings', LS.profRatings);
    await Promise.all(allRatings.filter(r=> r.profId === b.dataset.id).map(r=> DB.remove('profRatings', LS.profRatings, r.id)));
    toast('Professor deleted');
    renderProfessorList();
  }));
}
function openAddProfessorForm(){
  const html = `
    <form id="addProfForm">
      <div class="form-row">
        <label>College</label>
        <select id="apCollege" required>${BEU_COLLEGES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}</select>
      </div>
      <div class="form-row mt-8">
        <label>Department</label>
        <select id="apDept" required>${BRANCHES.map(b=>`<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('')}</select>
      </div>
      <div class="form-row mt-8">
        <label>Professor's name</label>
        <input type="text" id="apName" required placeholder="e.g. Dr. R. K. Sharma">
      </div>
      <p class="muted mt-8" style="font-size:.76rem;">Only add real faculty you've actually been taught by. Fake or joke entries will be removed.</p>
      <button type="submit" class="btn btn-primary btn-block mt-16">Add Professor</button>
    </form>
  `;
  openPanel(html, 'Add a Professor');
  $('#addProfForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = $('#apName').value.trim();
    const college = $('#apCollege').value;
    const dept = $('#apDept').value;
    if(!name){ toast("Enter the professor's name"); return; }
    if(containsBannedContent(name)){ toast('Please keep names respectful'); return; }
    const all = await DB.list('professors', LS.professors);
    const exists = all.some(p=> p.name.toLowerCase()===name.toLowerCase() && p.college===college && p.dept===dept);
    if(exists){ toast('This professor is already listed — search for them instead'); return; }
    await DB.add('professors', LS.professors, {name, college, dept, date: new Date().toISOString()});
    closePanel();
    renderProfessorList();
    toast('Professor added — you can rate them now');
  });
}
async function openProfessorDetail(profId){
  const all = await DB.list('professors', LS.professors);
  const p = all.find(x=> x.id === profId);
  if(!p) return;
  const avg = await profAverages(profId);
  const ratings = (await DB.list('profRatings', LS.profRatings)).filter(r=> r.profId === profId);

  const catRows = PROF_RATING_CATEGORIES.map(c=>{
    const val = avg[c.key] || 0;
    return `<div class="flex justify-between items-center" style="font-size:.82rem; margin-bottom:6px;">
      <span>${c.label}</span>
      <span>${'★'.repeat(Math.round(val))}${'☆'.repeat(5-Math.round(val))} ${val ? val.toFixed(1) : '—'}</span>
    </div>`;
  }).join('');

  const catInputs = PROF_RATING_CATEGORIES.map(c=>`
    <div class="mt-8">
      <label style="font-size:.82rem;">${c.label}</label>
      <div class="star-row" data-cat="${c.key}">
        ${[1,2,3,4,5].map(n=>`<span class="star" data-val="${n}">☆</span>`).join('')}
      </div>
    </div>
  `).join('');

  const reviewsHtml = ratings.length ? ratings.slice(0,8).map(r=>`
    <div class="card mt-8" style="padding:12px;">
      <p style="font-size:.85rem;">${escapeHtml(r.comment || '(No written comment)')}</p>
      <p class="muted" style="font-size:.7rem;">${new Date(r.date).toLocaleDateString()}</p>
    </div>
  `).join('') : '<p class="muted mt-8">No written reviews yet.</p>';

  const html = `
    <p class="muted" style="font-size:.8rem;">${escapeHtml(p.dept)} · ${escapeHtml(p.college)}</p>
    <div class="card mt-8" style="padding:14px;">${catRows || '<p class="muted">No ratings yet — be the first!</p>'}</div>
    <h3 class="mt-16" style="font-size:.95rem;">Rate this professor</h3>
    <form id="rateProfForm">
      ${catInputs}
      <div class="mt-8">
        <label style="font-size:.82rem;">Comment (optional)</label>
        <textarea id="rpComment" rows="3" placeholder="Describe the teaching experience — keep it respectful and specific."></textarea>
      </div>
      <p class="muted mt-8" style="font-size:.74rem;">Rate the teaching experience, not the person. No personal attacks, harassment or defamatory content — these will be removed.</p>
      <button type="submit" class="btn btn-primary btn-block mt-16">Submit Rating</button>
    </form>
    <h3 style="font-size:.95rem; margin-top:24px;">Reviews</h3>
    ${reviewsHtml}
  `;
  openPanel(html, p.name);

  const selected = {};
  $$('.star-row').forEach(row=>{
    const cat = row.dataset.cat;
    selected[cat] = 0;
    $$('.star', row).forEach(star=>{
      star.addEventListener('click', ()=>{
        selected[cat] = Number(star.dataset.val);
        $$('.star', row).forEach(s=> s.textContent = Number(s.dataset.val) <= selected[cat] ? '★' : '☆');
      });
    });
  });

  $('#rateProfForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const missing = PROF_RATING_CATEGORIES.filter(c=> !selected[c.key]);
    if(missing.length){ toast('Please rate: ' + missing.map(c=>c.label).join(', ')); return; }
    const comment = $('#rpComment').value.trim();
    if(comment && containsBannedContent(comment)){ toast('Please keep your review respectful'); return; }
    const entry = {profId, date:new Date().toISOString(), comment};
    PROF_RATING_CATEGORIES.forEach(c=> entry[c.key] = selected[c.key]);
    await DB.add('profRatings', LS.profRatings, entry);
    closePanel();
    renderProfessorList();
    toast('Thanks for rating! 🙌');
  });
}

/* ============================== QUESTION & ANSWER BOARD ==============================
   Admin (or anyone, since this static site has no login system) posts a question
   tagged by branch/semester/subject; students answer it below. Saved to Firestore
   (shared across every student) once firebase-config.js is set up — see that file.
   Until then, everything here runs on localStorage on this device only. */
function initQA(){
  const note = $('#qaBackendNote');
  if(note && firebaseReady) note.textContent = '📌 Questions and answers here are shared live across every student.';
  const branchSel = $('#qaBranch'), semSel = $('#qaSem');
  fillSelect(branchSel, BRANCHES); fillSelect(semSel, SEMESTERS);
  const subjSel = $('#qaSubject');
  const refreshSubjects = ()=>{
    fillSelect(subjSel, ['All', ...subjectsFor(Number(semSel.value), branchSel.value)]);
  };
  branchSel.addEventListener('change', ()=>{ refreshSubjects(); renderQuestionList(); });
  semSel.addEventListener('change', ()=>{ refreshSubjects(); renderQuestionList(); });
  subjSel.addEventListener('change', renderQuestionList);
  refreshSubjects();
  $('#askQuestionBtn').addEventListener('click', openAskQuestionForm);
  renderQuestionList();
}
async function renderQuestionList(){
  const branch = $('#qaBranch').value, sem = $('#qaSem').value, subject = $('#qaSubject').value;
  let all = await DB.list('questions', LS.questions);
  if(branch) all = all.filter(q=> q.branch === branch);
  if(sem) all = all.filter(q=> q.sem === sem);
  if(subject && subject !== 'All') all = all.filter(q=> q.subject === subject);

  $('#qaCount').textContent = `${all.length} question${all.length===1?'':'s'}`;

  if(!all.length){
    $('#qaList').innerHTML = `<div class="card" style="grid-column:1/-1; text-align:center;">
      <p class="muted">No questions here yet.</p>
      <button class="btn btn-primary btn-sm mt-8" id="qaEmptyAskBtn">+ Post a Question</button>
    </div>`;
    $('#qaEmptyAskBtn').addEventListener('click', openAskQuestionForm);
    return;
  }

  const allAnswers = await DB.list('answers', LS.answers);
  $('#qaList').innerHTML = all.map(q=>{
    const count = allAnswers.filter(a=> a.questionId === q.id).length;
    return `
      <div class="card">
        <p class="muted" style="font-size:.74rem;">${escapeHtml(q.subject)} · ${escapeHtml(q.branch)} · Sem ${escapeHtml(q.sem)}</p>
        <h3 style="font-size:.95rem;">${escapeHtml(q.text)}</h3>
        <p class="muted" style="font-size:.78rem;">${count} answer${count===1?'':'s'}</p>
        <div class="flex gap-8">
          <button class="btn btn-ghost btn-sm qa-detail-btn" data-id="${q.id}">View &amp; Answer</button>
          ${isAdminMode() ? `<button class="btn btn-ghost btn-sm admin-delete-q" data-id="${q.id}" style="color:var(--danger);">🗑️ Delete</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
  $$('.qa-detail-btn').forEach(b=> b.addEventListener('click', ()=> openQuestionDetail(b.dataset.id)));
  $$('.admin-delete-q').forEach(b=> b.addEventListener('click', async ()=>{
    if(!confirm('Delete this question and all its answers?')) return;
    await DB.remove('questions', LS.questions, b.dataset.id);
    const allA = await DB.list('answers', LS.answers);
    await Promise.all(allA.filter(a=> a.questionId === b.dataset.id).map(a=> DB.remove('answers', LS.answers, a.id)));
    toast('Question deleted');
    renderQuestionList();
  }));
}
function openAskQuestionForm(){
  const html = `
    <form id="askQForm">
      <div class="form-row cols-2">
        <div><label>Branch</label><select id="aqBranch">${BRANCHES.map(b=>`<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('')}</select></div>
        <div><label>Semester</label><select id="aqSem">${SEMESTERS.map(s=>`<option value="${s}">${s}</option>`).join('')}</select></div>
      </div>
      <div class="form-row mt-8">
        <label>Subject</label>
        <select id="aqSubject"></select>
      </div>
      <div class="form-row mt-8">
        <label>Question</label>
        <textarea id="aqText" rows="3" required placeholder="Type the question for students to answer..."></textarea>
      </div>
      <p class="muted mt-8" style="font-size:.76rem;">Keep questions academic and exam/interview relevant.</p>
      <button type="submit" class="btn btn-primary btn-block mt-16">Post Question</button>
    </form>
  `;
  openPanel(html, 'Post a Question');
  const branchSel = $('#aqBranch'), semSel = $('#aqSem'), subjSel = $('#aqSubject');
  const refresh = ()=> fillSelect(subjSel, subjectsFor(Number(semSel.value), branchSel.value));
  branchSel.addEventListener('change', refresh); semSel.addEventListener('change', refresh);
  refresh();

  $('#askQForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const text = $('#aqText').value.trim();
    if(!text){ toast('Enter a question'); return; }
    if(containsBannedContent(text)){ toast('Please keep the question respectful'); return; }
    await DB.add('questions', LS.questions, {
      branch: branchSel.value, sem: semSel.value, subject: subjSel.value,
      text, date: new Date().toISOString()
    });
    closePanel();
    renderQuestionList();
    toast('Question posted');
  });
}
async function openQuestionDetail(qId){
  const q = (await DB.list('questions', LS.questions)).find(x=> x.id === qId);
  if(!q) return;
  const answers = (await DB.list('answers', LS.answers)).filter(a=> a.questionId === qId);

  const answersHtml = answers.length ? answers.map(a=>`
    <div class="card mt-8" style="padding:12px;">
      <p style="font-size:.85rem;">${escapeHtml(a.text)}</p>
      <div class="flex justify-between items-center">
        <p class="muted" style="font-size:.7rem;">${new Date(a.date).toLocaleDateString()}</p>
        ${isAdminMode() ? `<button class="btn btn-ghost btn-sm admin-delete-answer" data-id="${a.id}" style="color:var(--danger); font-size:.7rem; padding:4px 8px;">🗑️</button>` : ''}
      </div>
    </div>
  `).join('') : '<p class="muted mt-8">No answers yet — be the first!</p>';

  const html = `
    <p class="muted" style="font-size:.8rem;">${escapeHtml(q.subject)} · ${escapeHtml(q.branch)} · Sem ${escapeHtml(q.sem)}</p>
    <div class="card mt-8" style="padding:14px;"><p style="font-size:.95rem;">${escapeHtml(q.text)}</p></div>
    <h3 class="mt-16" style="font-size:.95rem;">Your answer</h3>
    <form id="answerForm">
      <textarea id="ansText" rows="4" required placeholder="Write your answer..."></textarea>
      <button type="submit" class="btn btn-primary btn-block mt-16">Submit Answer</button>
    </form>
    <h3 class="mt-24" style="font-size:.95rem;">Answers (${answers.length})</h3>
    ${answersHtml}
  `;
  openPanel(html, 'Question');

  $$('.admin-delete-answer').forEach(b=> b.addEventListener('click', async ()=>{
    if(!confirm('Delete this answer?')) return;
    await DB.remove('answers', LS.answers, b.dataset.id);
    toast('Answer deleted');
    openQuestionDetail(qId);
    renderQuestionList();
  }));

  $('#answerForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const text = $('#ansText').value.trim();
    if(!text){ toast('Write an answer first'); return; }
    if(containsBannedContent(text)){ toast('Please keep your answer respectful'); return; }
    await DB.add('answers', LS.answers, {questionId:qId, text, date:new Date().toISOString()});
    openQuestionDetail(qId);
    renderQuestionList();
    toast('Answer submitted 🙌');
  });
}

/* ============================== AI CHAT ============================== */
const AIChat = {
  history(){ return store.get(LS.chat, []); },
  save(h){ store.set(LS.chat, h); },
  init(){
    $('#aiFab').addEventListener('click', ()=> this.toggle(true));
    $('#aiCloseBtn').addEventListener('click', ()=> this.toggle(false));
    $('#aiSendBtn').addEventListener('click', ()=> this.send());
    $('#aiSettingsBtn').addEventListener('click', ()=> this.openSettings());
    $('#aiInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); this.send(); } });
    $$('.ai-quick button').forEach(b=> b.addEventListener('click', ()=>{ $('#aiInput').value = b.dataset.prompt; this.send(); }));
    $('#aiVoiceBtn').addEventListener('click', ()=> this.voiceInput());
    $('#aiClearBtn').addEventListener('click', ()=>{ this.save([]); this.render(); });
    this.lang = '';
    $$('.ai-lang-btn').forEach(b=> b.addEventListener('click', ()=>{
      this.lang = b.dataset.lang;
      $$('.ai-lang-btn').forEach(x=> x.classList.toggle('active', x===b));
    }));
    this.pendingImage = null;
    $('#aiImageBtn').addEventListener('click', ()=> $('#aiImageInput').click());
    $('#aiImageInput').addEventListener('change', (e)=> this.handleImageSelect(e));
    $('#aiImageRemoveBtn').addEventListener('click', ()=> this.clearPendingImage());
    this.render();
    this.updateStatusDot();
  },
  handleImageSelect(e){
    const file = e.target.files[0];
    if(!file) return;
    const MAX_BYTES = 4 * 1024 * 1024;
    if(file.size > MAX_BYTES){ toast('Image too large — please pick one under 4MB'); e.target.value=''; return; }
    const reader = new FileReader();
    reader.onload = ()=>{
      const dataUrl = reader.result;
      this.pendingImage = { mediaType: file.type, data: dataUrl.split(',')[1], dataUrl };
      $('#aiImagePreviewImg').src = dataUrl;
      $('#aiImagePreview').style.display = 'flex';
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  },
  clearPendingImage(){
    this.pendingImage = null;
    $('#aiImagePreview').style.display = 'none';
    $('#aiImageInput').value = '';
  },
  toggle(open){
    $('#aiChatWindow').classList.toggle('open', open);
    const currentPage = document.querySelector('.page-section.active');
    const onHome = currentPage && currentPage.id === 'home';
    $('#aiFab').style.display = (open || onHome) ? 'none' : 'flex';
    if(open && !store.get(LS.aiEndpoint,'')) this.render();
  },
  updateStatusDot(){
    const dot = $('#aiStatusDot');
    if(!dot) return;
    const connected = !!store.get(LS.aiEndpoint,'');
    dot.style.background = connected ? 'var(--success)' : 'var(--text-dim)';
    dot.title = connected ? 'Connected to AI backend' : 'Not connected — tap ⚙️ to set it up';
  },
  openSettings(){
    const current = store.get(LS.aiEndpoint, '');
    const html = `
      <p class="muted" style="font-size:.85rem;">GenZ AI Tutor needs a small backend to reach an AI model — browsers block direct calls to AI providers for security. Deploy the free Cloudflare Worker below (5 minutes, no server needed), then paste its URL here.</p>
      <div class="field mt-16"><label>Backend URL</label><input type="text" id="settingsEndpoint" placeholder="https://your-worker.workers.dev" value="${current}"></div>
      <div class="flex gap-8">
        <button class="btn btn-primary btn-sm" id="settingsSaveBtn">Save</button>
        <button class="btn btn-ghost btn-sm" id="settingsTestBtn">Test connection</button>
        ${current ? '<button class="btn btn-ghost btn-sm" id="settingsRemoveBtn">Disconnect</button>' : ''}
      </div>
      <p id="settingsResult" class="muted mt-8" style="font-size:.8rem;"></p>
      <p class="muted mt-16" style="font-size:.78rem;">Setup guide: search the project files for <b>worker.js</b> and <b>AI-SETUP.md</b> — deploy instructions are in there.</p>
    `;
    openPanel(html, 'AI Backend Settings');
    $('#settingsSaveBtn').addEventListener('click', ()=>{
      const val = $('#settingsEndpoint').value.trim();
      store.set(LS.aiEndpoint, val);
      this.updateStatusDot();
      toast(val ? 'Saved — AI Tutor is connected' : 'Endpoint cleared');
      closePanel();
    });
    $('#settingsTestBtn').addEventListener('click', async ()=>{
      const val = $('#settingsEndpoint').value.trim();
      const out = $('#settingsResult');
      if(!val){ out.textContent = 'Enter a URL first.'; return; }
      out.textContent = 'Testing…';
      try{
        const res = await fetch(val, { method:'POST', headers:{'Content-Type':'application/json', ...(APP_SHARED_SECRET ? {'X-App-Secret': APP_SHARED_SECRET} : {})}, body: JSON.stringify({prompt:'Say hi in one short sentence.', history:[]}) });
        const data = await res.json();
        out.textContent = res.ok ? ('✅ Working! Reply: ' + (data.reply||'').slice(0,120)) : ('❌ Error: ' + (data.reply || res.status));
      }catch(e){
        out.textContent = '❌ Could not reach that URL: ' + e.message;
      }
    });
    if(current){
      const rm = $('#settingsRemoveBtn');
      if(rm) rm.addEventListener('click', ()=>{ store.set(LS.aiEndpoint, ''); this.updateStatusDot(); toast('Disconnected'); closePanel(); });
    }
  },
  render(){
    const body = $('#aiChatBody');
    const h = this.history();
    const connected = !!store.get(LS.aiEndpoint,'');
    body.innerHTML = h.map((m,i)=>`
      <div class="msg ${m.role}">
        ${m.image ? `<img src="${m.image}" style="max-width:160px; border-radius:10px; display:block; margin-bottom:${m.text?'6px':'0'};" alt="Attached question">` : ''}
        ${escapeHtml(m.text)}
        ${m.role==='ai' ? `<div class="msg-actions">
          <button onclick="AIChat.copy(${i})">Copy</button>
          <button onclick="AIChat.share(${i})">Share</button>
          <button onclick="AIChat.downloadPDF(${i})">Download PDF</button>
        </div>` : ''}
      </div>
    `).join('') || `<div class="msg ai">Hey! I'm GenZ AI Tutor 👋 Ask me to explain a topic, make notes/MCQs, debug code, or plan a roadmap. You can also upload a photo of a question, or switch replies to Hindi with the toggle above.${connected ? '' : ' <br><br>⚠️ Not connected to an AI backend yet — tap ⚙️ above to set one up (takes 5 min, free).'}</div>`;
    body.scrollTop = body.scrollHeight;
  },
  copy(i){ navigator.clipboard.writeText(this.history()[i].text); toast('Copied'); },
  share(i){
    const text = this.history()[i].text;
    if(navigator.share){ navigator.share({text}); } else { navigator.clipboard.writeText(text); toast('Copied to share'); }
  },
  downloadPDF(i){
    const text = this.history()[i].text;
    if(window.jspdf){
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const lines = doc.splitTextToSize(text, 180);
      doc.text(lines, 10, 15);
      doc.save('genz-ai-answer.pdf');
    } else { toast('PDF library still loading, try again in a moment'); }
  },
  voiceInput(){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){ toast('Voice input not supported in this browser'); return; }
    const rec = new SR();
    rec.lang = 'en-IN'; rec.onresult = (e)=>{ $('#aiInput').value = e.results[0][0].transcript; };
    rec.onerror = ()=> toast('Could not hear you, try again');
    rec.start();
    toast('Listening…');
  },
  async send(){
    const input = $('#aiInput');
    const text = input.value.trim();
    const image = this.pendingImage;
    if(!text && !image) return;
    const h = this.history();
    h.push({role:'user', text, image: image ? image.dataUrl : null});
    this.save(h); this.render();
    input.value='';
    this.clearPendingImage();

    // typing indicator
    const body = $('#aiChatBody');
    const typing = document.createElement('div');
    typing.className = 'msg ai'; typing.id = 'aiTyping'; typing.textContent = 'Thinking…';
    body.appendChild(typing); body.scrollTop = body.scrollHeight;

    const reply = await this.getReply(text || 'Please help me with what is shown in this image.', h.slice(0,-1), image);
    document.getElementById('aiTyping')?.remove();

    const h2 = this.history();
    h2.push({role:'ai', text:reply});
    this.save(h2); this.render();
  },
  async getReply(prompt, historyBeforeThis, image){
    const endpoint = store.get(LS.aiEndpoint, '');
    if(!endpoint){
      return `I'm not connected to an AI backend yet. Tap the ⚙️ icon above to set one up — it's free and takes about 5 minutes (deploy the included Cloudflare Worker, paste its URL in). Once connected I can explain topics, write notes, generate MCQs, debug code, summarize PDFs, read a photo of a question, and build roadmaps — in English or Hindi.`;
    }
    try{
      const payload = { prompt, history: historyBeforeThis.slice(-10) };
      if(this.lang) payload.lang = this.lang;
      if(image) payload.image = { mediaType: image.mediaType, data: image.data };
      const res = await fetch(endpoint, {
        method:'POST',
        headers:{'Content-Type':'application/json', ...(APP_SHARED_SECRET ? {'X-App-Secret': APP_SHARED_SECRET} : {})},
        body: JSON.stringify(payload)
      });
      if(!res.ok){
        const errData = await res.json().catch(()=>({}));
        return `Backend error (${res.status}): ${errData.reply || 'check your Worker logs / API key.'}`;
      }
      const data = await res.json();
      return data.reply || 'Hmm, no reply came back from the server.';
    }catch(e){
      return `Could not reach the AI backend. Check the URL in ⚙️ Settings and your internet connection. (${e.message})`;
    }
  }
};

/* ============================== TOOLS ============================== */
function openTool(id){
  const renderers = {
    wordcount: ()=>`
      <textarea id="t-input" rows="8" placeholder="Paste or type text…" style="width:100%"></textarea>
      <div class="stat-grid mt-16">
        <div class="stat-box"><div class="num" id="t-words">0</div><div class="lbl">Words</div></div>
        <div class="stat-box"><div class="num" id="t-chars">0</div><div class="lbl">Characters</div></div>
        <div class="stat-box"><div class="num" id="t-sent">0</div><div class="lbl">Sentences</div></div>
        <div class="stat-box"><div class="num" id="t-read">0</div><div class="lbl">Min read</div></div>
      </div>`,
    jsonfmt: ()=>`
      <label>Paste JSON</label><textarea id="t-input" rows="6" style="width:100%"></textarea>
      <div class="mt-8"><button class="btn btn-primary btn-sm" id="t-run">Format</button> <button class="btn btn-ghost btn-sm" id="t-min">Minify</button></div>
      <pre id="t-out" class="mt-16" style="white-space:pre-wrap; font-family:var(--font-mono); font-size:.78rem; background:var(--surface-2); padding:12px; border-radius:10px; max-height:260px; overflow:auto"></pre>`,
    base64: ()=>`
      <label>Text</label><textarea id="t-input" rows="4" style="width:100%"></textarea>
      <div class="mt-8 flex gap-8"><button class="btn btn-primary btn-sm" id="t-enc">Encode</button><button class="btn btn-ghost btn-sm" id="t-dec">Decode</button></div>
      <label class="mt-16">Result</label><textarea id="t-out" rows="4" style="width:100%" readonly></textarea>`,
    colorpicker: ()=>`
      <input type="color" id="t-color" value="#5b5bf7" style="width:100%; height:60px; border:none; border-radius:12px">
      <div class="stat-grid mt-16">
        <div class="stat-box"><div class="num" id="t-hex" style="font-size:1rem">#5B5BF7</div><div class="lbl">HEX</div></div>
        <div class="stat-box"><div class="num" id="t-rgb" style="font-size:.85rem">91,91,247</div><div class="lbl">RGB</div></div>
      </div>`,
    unitconv: ()=>`
      <div class="form-row cols-3">
        <div><label>Value</label><input type="number" id="t-val" value="1"></div>
        <div><label>From</label><select id="t-from"></select></div>
        <div><label>To</label><select id="t-to"></select></div>
      </div>
      <div class="mt-16 stat-box"><div class="num" id="t-out">—</div><div class="lbl">Result</div></div>`,
    sciencecalc: ()=>`
      <input type="text" id="t-expr" placeholder="e.g. sin(30)+sqrt(16)*2" style="font-family:var(--font-mono)">
      <div class="mt-8"><button class="btn btn-primary btn-sm" id="t-eq">= Evaluate</button></div>
      <div class="mt-16 stat-box"><div class="num" id="t-out">—</div><div class="lbl">Result</div></div>
      <p class="muted mt-8" style="font-size:.75rem">Supports + − × ÷ ^ sin cos tan sqrt log pi</p>`,
    agecalc: ()=>`
      <label>Date of birth</label><input type="date" id="t-dob">
      <div class="mt-16 stat-grid">
        <div class="stat-box"><div class="num" id="t-y">0</div><div class="lbl">Years</div></div>
        <div class="stat-box"><div class="num" id="t-m">0</div><div class="lbl">Months</div></div>
        <div class="stat-box"><div class="num" id="t-d">0</div><div class="lbl">Days</div></div>
      </div>`,
    percentcalc: ()=>`
      <div class="form-row cols-2">
        <div><label>Obtained marks</label><input type="number" id="t-obt" value="0"></div>
        <div><label>Total marks</label><input type="number" id="t-tot" value="100"></div>
      </div>
      <div class="mt-16 stat-box"><div class="num" id="t-out">0%</div><div class="lbl">Percentage</div></div>`,
    cgpatool: ()=>`<p class="muted">Use the full SGPA / CGPA Calculator in the BEU section — it saves your semester history automatically.</p><button class="btn btn-primary btn-sm mt-16" onclick="closePanel(); showPage('cgpa')">Go to calculator</button>`,
    qrgen: ()=>`
      <label>Text or URL</label><input type="text" id="t-input" placeholder="https://...">
      <div class="mt-8"><button class="btn btn-primary btn-sm" id="t-run">Generate</button></div>
      <div id="t-qr" class="mt-16 text-center"></div>`,
    qrscan: ()=>`
      <input type="file" id="t-file" accept="image/*" capture="environment">
      <div id="t-out" class="mt-16"></div>
      <p class="muted mt-8" style="font-size:.75rem">Upload/capture a photo containing a QR code.</p>`,
    tts: ()=>`
      <textarea id="t-input" rows="4" placeholder="Type text to hear it spoken…" style="width:100%"></textarea>
      <div class="mt-8"><button class="btn btn-primary btn-sm" id="t-run">🔊 Speak</button> <button class="btn btn-ghost btn-sm" id="t-stop">Stop</button></div>`,
    stt: ()=>`
      <div class="mt-8"><button class="btn btn-primary btn-sm" id="t-run">🎙️ Start listening</button></div>
      <textarea id="t-out" rows="4" class="mt-16" style="width:100%" placeholder="Transcript appears here…"></textarea>`,
    codefmt: ()=>`
      <label>Paste code</label><textarea id="t-input" rows="8" style="width:100%; font-family:var(--font-mono)"></textarea>
      <div class="mt-8"><button class="btn btn-primary btn-sm" id="t-run">Auto-indent</button></div>
      <pre id="t-out" class="mt-16" style="white-space:pre-wrap; font-family:var(--font-mono); font-size:.78rem; background:var(--surface-2); padding:12px; border-radius:10px; max-height:260px; overflow:auto"></pre>`,
    imgcompress: ()=>`
      <input type="file" id="t-file" accept="image/*">
      <div class="field mt-16"><label>Quality: <span id="t-qval">70</span>%</label><input type="range" id="t-quality" min="10" max="95" value="70"></div>
      <canvas id="t-canvas" style="display:none"></canvas>
      <div id="t-out" class="mt-16"></div>`,
    imgresize: ()=>`
      <input type="file" id="t-file" accept="image/*">
      <div class="form-row cols-2 mt-16"><div><label>Width (px)</label><input type="number" id="t-w" value="800"></div><div><label>Height (px)</label><input type="number" id="t-h" value="600"></div></div>
      <div class="mt-8"><button class="btn btn-primary btn-sm" id="t-run">Resize</button></div>
      <canvas id="t-canvas" style="display:none"></canvas>
      <div id="t-out" class="mt-16"></div>`,
    img2pdf: ()=>`
      <input type="file" id="t-file" accept="image/*" multiple>
      <div class="mt-8"><button class="btn btn-primary btn-sm" id="t-run">Convert to PDF</button></div>
      <div id="t-out" class="mt-16 muted"></div>`,
    pdfmerge: ()=>`
      <input type="file" id="t-file" accept="application/pdf" multiple>
      <div class="mt-8"><button class="btn btn-primary btn-sm" id="t-run">Merge PDFs</button></div>
      <div id="t-out" class="mt-16 muted"></div>`,
    pdfsplit: ()=>`
      <input type="file" id="t-file" accept="application/pdf">
      <div class="field mt-16"><label>Page number to extract</label><input type="number" id="t-page" value="1" min="1"></div>
      <div class="mt-8"><button class="btn btn-primary btn-sm" id="t-run">Extract Page</button></div>
      <div id="t-out" class="mt-16 muted"></div>`,
    resumebuilder: ()=>toolFormPDF('Resume', ['Full Name','Email','Phone','Education','Skills','Experience']),
    coverletter: ()=>toolFormPDF('Cover Letter', ['Your Name','Company Name','Position','Why you fit (short)']),
    invoicegen: ()=>toolFormPDF('Invoice', ['Bill To','Item / Service','Amount','Due Date']),
    certgen: ()=>toolFormPDF('Certificate', ['Recipient Name','Course / Event','Issued By','Date'])
  };
  const render = renderers[id];
  if(!render){ toast('Tool coming soon'); return; }
  openPanel(render(), TOOLS.find(t=>t.id===id).name);
  wireTool(id);
}

function toolFormPDF(title, fields){
  return `
    ${fields.map(f=>`<div class="field"><label>${f}</label>${f.toLowerCase().includes('experience')||f.toLowerCase().includes('skills')||f.toLowerCase().includes('why')?`<textarea rows="3" class="t-field" data-label="${f}"></textarea>`:`<input type="text" class="t-field" data-label="${f}">`}</div>`).join('')}
    <button class="btn btn-primary btn-sm" id="t-run">Generate ${title} PDF</button>
    <p class="muted mt-8" style="font-size:.75rem">Downloads a simple formatted PDF you can edit further.</p>
  `;
}

function wireTool(id){
  const panel = $('#panelBody');
  const q = s => panel.querySelector(s);

  if(id==='wordcount'){
    q('#t-input').addEventListener('input', e=>{
      const v = e.target.value;
      q('#t-words').textContent = (v.trim().match(/\S+/g)||[]).length;
      q('#t-chars').textContent = v.length;
      q('#t-sent').textContent = (v.match(/[.!?]+/g)||[]).length;
      q('#t-read').textContent = Math.max(1, Math.round((v.trim().split(/\s+/).length||0)/200));
    });
  }
  if(id==='jsonfmt'){
    q('#t-run').addEventListener('click', ()=>{ try{ q('#t-out').textContent = JSON.stringify(JSON.parse(q('#t-input').value), null, 2); }catch(e){ q('#t-out').textContent='Invalid JSON: '+e.message; } });
    q('#t-min').addEventListener('click', ()=>{ try{ q('#t-out').textContent = JSON.stringify(JSON.parse(q('#t-input').value)); }catch(e){ q('#t-out').textContent='Invalid JSON: '+e.message; } });
  }
  if(id==='base64'){
    q('#t-enc').addEventListener('click', ()=>{ try{ q('#t-out').value = btoa(unescape(encodeURIComponent(q('#t-input').value))); }catch(e){ q('#t-out').value='Error'; } });
    q('#t-dec').addEventListener('click', ()=>{ try{ q('#t-out').value = decodeURIComponent(escape(atob(q('#t-input').value))); }catch(e){ q('#t-out').value='Invalid Base64'; } });
  }
  if(id==='colorpicker'){
    const upd = ()=>{ const v=q('#t-color').value; q('#t-hex').textContent=v.toUpperCase(); const r=parseInt(v.substr(1,2),16),g=parseInt(v.substr(3,2),16),b=parseInt(v.substr(5,2),16); q('#t-rgb').textContent=`${r},${g},${b}`; };
    q('#t-color').addEventListener('input', upd); upd();
  }
  if(id==='unitconv'){
    const units = {km:1000,m:1,cm:.01,mile:1609.34,ft:.3048,kg:1000,g:1,lb:453.592};
    fillSelect(q('#t-from'), Object.keys(units)); fillSelect(q('#t-to'), Object.keys(units));
    const calc = ()=>{ const v=Number(q('#t-val').value)||0; const f=units[q('#t-from').value], t=units[q('#t-to').value]; q('#t-out').textContent = ((v*f)/t).toFixed(4); };
    ['t-val','t-from','t-to'].forEach(i=> q('#'+i).addEventListener('input', calc));
    calc();
  }
  if(id==='sciencecalc'){
    q('#t-eq').addEventListener('click', ()=>{
      try{
        let expr = q('#t-expr').value.replace(/\^/g,'**').replace(/sin/g,'Math.sin').replace(/cos/g,'Math.cos').replace(/tan/g,'Math.tan').replace(/sqrt/g,'Math.sqrt').replace(/log/g,'Math.log10').replace(/pi/g,'Math.PI').replace(/×/g,'*').replace(/÷/g,'/');
        // eslint-disable-next-line no-new-func
        const result = Function('"use strict";return ('+expr+')')();
        q('#t-out').textContent = result;
      }catch(e){ q('#t-out').textContent = 'Error'; }
    });
  }
  if(id==='agecalc'){
    q('#t-dob').addEventListener('change', ()=>{
      const dob = new Date(q('#t-dob').value); if(isNaN(dob)) return;
      const now = new Date();
      let y = now.getFullYear()-dob.getFullYear(), m = now.getMonth()-dob.getMonth(), d = now.getDate()-dob.getDate();
      if(d<0){ m--; d += new Date(now.getFullYear(), now.getMonth(), 0).getDate(); }
      if(m<0){ y--; m+=12; }
      q('#t-y').textContent=y; q('#t-m').textContent=m; q('#t-d').textContent=d;
    });
  }
  if(id==='percentcalc'){
    const calc = ()=>{ const o=Number(q('#t-obt').value)||0, t=Number(q('#t-tot').value)||1; q('#t-out').textContent = ((o/t)*100).toFixed(2)+'%'; };
    q('#t-obt').addEventListener('input', calc); q('#t-tot').addEventListener('input', calc); calc();
  }
  if(id==='qrgen'){
    q('#t-run').addEventListener('click', ()=>{
      const val = q('#t-input').value.trim(); if(!val) return;
      q('#t-qr').innerHTML = '';
      if(window.QRCode){ new QRCode(q('#t-qr'), {text:val, width:200, height:200}); }
      else { q('#t-qr').innerHTML = '<p class="muted">QR library still loading — try again in a second.</p>'; }
    });
  }
  if(id==='qrscan'){
    q('#t-file').addEventListener('change', (e)=>{
      const file = e.target.files[0]; if(!file) return;
      const img = new Image();
      img.onload = ()=>{
        const canvas = document.createElement('canvas'); canvas.width=img.width; canvas.height=img.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0);
        const data = ctx.getImageData(0,0,canvas.width,canvas.height);
        if(window.jsQR){
          const code = jsQR(data.data, canvas.width, canvas.height);
          q('#t-out').innerHTML = code ? `<b>Result:</b> ${code.data}` : 'No QR code found in image.';
        } else { q('#t-out').textContent = 'Scanner library still loading — try again.'; }
      };
      img.src = URL.createObjectURL(file);
    });
  }
  if(id==='tts'){
    q('#t-run').addEventListener('click', ()=>{
      const u = new SpeechSynthesisUtterance(q('#t-input').value);
      speechSynthesis.speak(u);
    });
    q('#t-stop').addEventListener('click', ()=> speechSynthesis.cancel());
  }
  if(id==='stt'){
    q('#t-run').addEventListener('click', ()=>{
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if(!SR){ toast('Not supported in this browser'); return; }
      const rec = new SR(); rec.lang='en-IN';
      rec.onresult = (e)=>{ q('#t-out').value += e.results[0][0].transcript + ' '; };
      rec.start();
    });
  }
  if(id==='codefmt'){
    q('#t-run').addEventListener('click', ()=>{
      const lines = q('#t-input').value.split('\n');
      let depth = 0; const out = [];
      lines.forEach(line=>{
        const trimmed = line.trim();
        if(trimmed.startsWith('}') || trimmed.startsWith(')')) depth = Math.max(0, depth-1);
        out.push('  '.repeat(depth) + trimmed);
        if(trimmed.endsWith('{') || trimmed.endsWith('(')) depth++;
      });
      q('#t-out').textContent = out.join('\n');
    });
  }
  if(id==='imgcompress'){
    q('#t-quality').addEventListener('input', e=> q('#t-qval').textContent = e.target.value);
    q('#t-file').addEventListener('change', (e)=>{
      const file = e.target.files[0]; if(!file) return;
      const img = new Image();
      img.onload = ()=>{
        const canvas = q('#t-canvas'); canvas.width = img.width; canvas.height = img.height;
        canvas.getContext('2d').drawImage(img,0,0);
        const quality = Number(q('#t-quality').value)/100;
        canvas.toBlob(blob=>{
          const url = URL.createObjectURL(blob);
          q('#t-out').innerHTML = `<p>New size: ${(blob.size/1024).toFixed(1)} KB (was ${(file.size/1024).toFixed(1)} KB)</p><a class="btn btn-primary btn-sm mt-8" download="compressed.jpg" href="${url}">Download</a>`;
        }, 'image/jpeg', quality);
      };
      img.src = URL.createObjectURL(file);
    });
  }
  if(id==='imgresize'){
    q('#t-run').addEventListener('click', ()=>{
      const file = q('#t-file').files[0]; if(!file){ toast('Choose an image first'); return; }
      const img = new Image();
      img.onload = ()=>{
        const canvas = q('#t-canvas'); canvas.width = Number(q('#t-w').value); canvas.height = Number(q('#t-h').value);
        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        canvas.toBlob(blob=>{
          const url = URL.createObjectURL(blob);
          q('#t-out').innerHTML = `<a class="btn btn-primary btn-sm" download="resized.png" href="${url}">Download resized image</a>`;
        });
      };
      img.src = URL.createObjectURL(file);
    });
  }
  if(id==='img2pdf'){
    q('#t-run').addEventListener('click', async ()=>{
      const files = q('#t-file').files;
      if(!files.length){ toast('Choose image(s) first'); return; }
      if(!window.jspdf){ toast('PDF library still loading'); return; }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      for(let i=0;i<files.length;i++){
        const dataUrl = await new Promise(res=>{ const r = new FileReader(); r.onload=()=>res(r.result); r.readAsDataURL(files[i]); });
        const img = await new Promise(res=>{ const im = new Image(); im.onload=()=>res(im); im.src=dataUrl; });
        if(i>0) doc.addPage();
        const w = doc.internal.pageSize.getWidth(), h = (img.height/img.width)*w;
        doc.addImage(dataUrl, 'JPEG', 0, 0, w, h);
      }
      doc.save('images.pdf');
      q('#t-out').textContent = 'Done — PDF downloaded.';
    });
  }
  if(id==='pdfmerge'){
    q('#t-run').addEventListener('click', async ()=>{
      const files = q('#t-file').files;
      if(files.length<2){ toast('Choose 2+ PDFs'); return; }
      if(!window.PDFLib){ toast('PDF library still loading'); return; }
      const { PDFDocument } = PDFLib;
      const merged = await PDFDocument.create();
      for(const f of files){
        const bytes = await f.arrayBuffer();
        const src = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(src, src.getPageIndices());
        pages.forEach(p=>merged.addPage(p));
      }
      const bytes = await merged.save();
      const url = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'}));
      q('#t-out').innerHTML = `<a class="btn btn-primary btn-sm" download="merged.pdf" href="${url}">Download merged PDF</a>`;
    });
  }
  if(id==='pdfsplit'){
    q('#t-run').addEventListener('click', async ()=>{
      const file = q('#t-file').files[0]; if(!file){ toast('Choose a PDF'); return; }
      if(!window.PDFLib){ toast('PDF library still loading'); return; }
      const { PDFDocument } = PDFLib;
      const bytes = await file.arrayBuffer();
      const src = await PDFDocument.load(bytes);
      const out = await PDFDocument.create();
      const pageIdx = Number(q('#t-page').value)-1;
      const [page] = await out.copyPages(src, [pageIdx]);
      out.addPage(page);
      const newBytes = await out.save();
      const url = URL.createObjectURL(new Blob([newBytes], {type:'application/pdf'}));
      q('#t-out').innerHTML = `<a class="btn btn-primary btn-sm" download="page.pdf" href="${url}">Download extracted page</a>`;
    });
  }
  if(['resumebuilder','coverletter','invoicegen','certgen'].includes(id)){
    q('#t-run').addEventListener('click', ()=>{
      if(!window.jspdf){ toast('PDF library still loading'); return; }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      let y = 20;
      doc.setFontSize(16); doc.text(TOOLS.find(t=>t.id===id).name, 10, y); y+=10;
      doc.setFontSize(11);
      panel.querySelectorAll('.t-field').forEach(f=>{
        const label = f.dataset.label, val = f.value || '—';
        const lines = doc.splitTextToSize(`${label}: ${val}`, 180);
        doc.text(lines, 10, y); y += lines.length*7 + 3;
        if(y>270){ doc.addPage(); y=20; }
      });
      doc.save(id+'.pdf');
    });
  }
}

/* ============================== GAMES ============================== */
function openGame(id){
  const renderers = {
    tictactoe: ()=>`<div class="game-board-3" id="ttt"></div><div class="text-center mt-16"><button class="btn btn-ghost btn-sm" id="ttt-reset">Reset</button></div>`,
    memory: ()=>`<div class="mem-grid" id="mem"></div><p class="text-center mt-8 muted" id="mem-status">Find all pairs!</p>`,
    g2048: ()=>`<div class="g2048-grid" id="g2048"></div><p class="muted text-center mt-8">Use arrow keys (desktop) or swipe.</p><p class="text-center"><b id="g2048-score">Score: 0</b></p>`,
    reaction: ()=>`<div id="reaction-box" style="height:200px;border-radius:14px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-weight:600;cursor:pointer">Click to start</div><p class="text-center mt-16" id="reaction-result"></p>`,
    typing: ()=>`<p id="typing-text" style="font-family:var(--font-mono); background:var(--surface-2); padding:12px; border-radius:10px;">The quick brown fox jumps over the lazy dog while BEU students prepare for exams.</p><textarea id="typing-input" rows="3" style="width:100%" class="mt-16" placeholder="Start typing here…"></textarea><p class="mt-8" id="typing-result"></p>`,
    snake: ()=>`
      <div class="text-center mb-8"><b id="snake-score">Score: 0</b></div>
      <div class="snake-wrap"><canvas id="snake-canvas" width="280" height="280"></canvas></div>
      <div class="snake-controls">
        <button class="snake-btn" data-dir="u" style="grid-area:u">▲</button>
        <button class="snake-btn" data-dir="l" style="grid-area:l">◀</button>
        <button class="snake-btn" data-dir="r" style="grid-area:r">▶</button>
        <button class="snake-btn" data-dir="d" style="grid-area:d">▼</button>
      </div>
      <div class="text-center mt-16"><button class="btn btn-ghost btn-sm" id="snake-restart">Restart</button></div>
      <p class="muted text-center mt-8">Use arrow keys or the buttons. Eat the food, avoid the walls and yourself.</p>
    `
  };
  const render = renderers[id];
  if(!render){ toast('Coming soon'); return; }
  openPanel(render(), GAMES.find(g=>g.id===id).name);
  wireGame(id);
}
function wireGame(id){
  const panel = $('#panelBody'); const q = s=>panel.querySelector(s);

  if(id==='tictactoe'){
    let board = Array(9).fill(''); let turn = 'X';
    function draw(){
      q('#ttt').innerHTML = board.map((v,i)=>`<div class="game-cell" data-i="${i}">${v}</div>`).join('');
      $$('.game-cell', panel).forEach(c=> c.addEventListener('click', ()=>{
        const i = Number(c.dataset.i);
        if(board[i] || checkWin()) return;
        board[i]=turn; turn = turn==='X'?'O':'X'; draw();
        const w = checkWin(); if(w) toast(w+' wins!'); else if(board.every(x=>x)) toast("It's a draw!");
      }));
    }
    function checkWin(){
      const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      for(const l of lines){ const [a,b,c]=l; if(board[a]&&board[a]===board[b]&&board[a]===board[c]) return board[a]; }
      return null;
    }
    q('#ttt-reset').addEventListener('click', ()=>{ board=Array(9).fill(''); turn='X'; draw(); });
    draw();
  }
  if(id==='memory'){
    const icons = ['🍎','🍎','🚀','🚀','⭐','⭐','🎯','🎯','📘','📘','🎮','🎮','🔥','🔥','💡','💡'];
    const shuffled = icons.sort(()=>Math.random()-.5);
    let flipped = [], matched = [];
    function draw(){
      q('#mem').innerHTML = shuffled.map((v,i)=>`<div class="mem-cell" data-i="${i}">${matched.includes(i)||flipped.includes(i) ? v : '?'}</div>`).join('');
      $$('.mem-cell', panel).forEach(c=> c.addEventListener('click', ()=>{
        const i = Number(c.dataset.i);
        if(flipped.includes(i) || matched.includes(i) || flipped.length===2) return;
        flipped.push(i); draw();
        if(flipped.length===2){
          setTimeout(()=>{
            if(shuffled[flipped[0]]===shuffled[flipped[1]]){ matched.push(...flipped); }
            flipped = []; draw();
            if(matched.length===shuffled.length) q('#mem-status').textContent = '🎉 You matched them all!';
          }, 600);
        }
      }));
    }
    draw();
  }
  if(id==='g2048'){
    let grid = Array(16).fill(0); grid[0]=2; grid[5]=2; let score=0;
    function draw(){
      q('#g2048').innerHTML = grid.map(v=>`<div class="g2048-cell">${v||''}</div>`).join('');
      q('#g2048-score').textContent = 'Score: '+score;
    }
    function move(dir){
      // simple line-based merge; dir: 'l','r','u','d'
      const g = [...grid];
      const getLine = (i,dir)=>{ const idx=[]; for(let k=0;k<4;k++){ if(dir==='l'||dir==='r') idx.push(i*4+k); else idx.push(k*4+i);} return dir==='r'||dir==='d' ? idx.reverse() : idx; };
      let moved=false;
      for(let i=0;i<4;i++){
        const idx = getLine(i,dir);
        let vals = idx.map(x=>g[x]).filter(x=>x);
        for(let k=0;k<vals.length-1;k++){ if(vals[k]===vals[k+1]){ vals[k]*=2; score+=vals[k]; vals.splice(k+1,1); } }
        while(vals.length<4) vals.push(0);
        idx.forEach((x,k)=>{ if(g[x]!==vals[k]) moved=true; g[x]=vals[k]; });
      }
      if(moved){
        grid = g;
        const empty = grid.map((v,i)=>v?-1:i).filter(i=>i>=0);
        if(empty.length){ grid[empty[Math.floor(Math.random()*empty.length)]] = Math.random()<.9?2:4; }
      }
      draw();
    }
    document.addEventListener('keydown', function handler(e){
      if(!panel.contains(q('#g2048'))){ document.removeEventListener('keydown',handler); return; }
      if(e.key==='ArrowLeft') move('l'); if(e.key==='ArrowRight') move('r');
      if(e.key==='ArrowUp') move('u'); if(e.key==='ArrowDown') move('d');
    });
    let touchX,touchY;
    q('#g2048').addEventListener('touchstart', e=>{ touchX=e.touches[0].clientX; touchY=e.touches[0].clientY; });
    q('#g2048').addEventListener('touchend', e=>{
      const dx = e.changedTouches[0].clientX-touchX, dy = e.changedTouches[0].clientY-touchY;
      if(Math.abs(dx)>Math.abs(dy)){ move(dx>0?'r':'l'); } else { move(dy>0?'d':'u'); }
    });
    draw();
  }
  if(id==='reaction'){
    const box = q('#reaction-box'); let start=0, waiting=false;
    box.addEventListener('click', ()=>{
      if(!waiting){
        box.textContent = 'Wait for green…'; box.style.background='var(--surface-2)'; waiting=true;
        const delay = 1000+Math.random()*3000;
        setTimeout(()=>{ box.style.background='var(--success)'; box.textContent='Click now!'; start=Date.now(); waiting='go'; }, delay);
      } else if(waiting==='go'){
        const t = Date.now()-start;
        q('#reaction-result').textContent = `Your reaction time: ${t} ms`;
        box.textContent='Click to try again'; box.style.background='var(--surface-2)'; waiting=false;
      } else {
        q('#reaction-result').textContent = 'Too soon! Wait for green.';
        box.textContent='Click to start'; waiting=false;
      }
    });
  }
  if(id==='typing'){
    const target = q('#typing-text').textContent;
    let startTime=null;
    q('#typing-input').addEventListener('input', (e)=>{
      if(!startTime) startTime = Date.now();
      const val = e.target.value;
      if(val.length >= target.length){
        const mins = (Date.now()-startTime)/60000;
        const words = target.split(' ').length;
        const wpm = Math.round(words/mins);
        let correct=0; for(let i=0;i<target.length;i++) if(val[i]===target[i]) correct++;
        const acc = Math.round((correct/target.length)*100);
        q('#typing-result').innerHTML = `<b>${wpm} WPM</b> · ${acc}% accuracy`;
      }
    });
  }
  if(id==='snake'){
    const canvas = q('#snake-canvas'); const ctx = canvas.getContext('2d');
    const cell = 20, cols = 14, rows = 14;
    const css = getComputedStyle(document.documentElement);
    const colBg = (css.getPropertyValue('--surface-2')||'#eee').trim() || '#eee';
    const colSnake = (css.getPropertyValue('--primary')||'#1d9e75').trim() || '#1d9e75';
    const colFood = (css.getPropertyValue('--danger')||'#e24b4a').trim() || '#e24b4a';
    let snake, dir, nextDir, food, score, alive, timer;

    function rndFood(){
      let p;
      do{ p = {x:Math.floor(Math.random()*cols), y:Math.floor(Math.random()*rows)}; }
      while(snake.some(s=>s.x===p.x && s.y===p.y));
      return p;
    }
    function draw(){
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = colBg;
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = colFood;
      ctx.fillRect(food.x*cell+2, food.y*cell+2, cell-4, cell-4);
      snake.forEach((s,i)=>{
        ctx.globalAlpha = i===0 ? 1 : 0.85;
        ctx.fillStyle = colSnake;
        ctx.fillRect(s.x*cell+1, s.y*cell+1, cell-2, cell-2);
      });
      ctx.globalAlpha = 1;
      if(!alive){
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('Game over', canvas.width/2, canvas.height/2-8);
        ctx.font = '13px sans-serif';
        ctx.fillText('Tap restart to play again', canvas.width/2, canvas.height/2+14);
      }
    }
    function tick(){
      if(!document.body.contains(canvas)){ clearInterval(timer); return; }
      if(!alive) return;
      dir = nextDir;
      const head = {...snake[0]};
      if(dir==='l') head.x--; if(dir==='r') head.x++; if(dir==='u') head.y--; if(dir==='d') head.y++;
      if(head.x<0 || head.x>=cols || head.y<0 || head.y>=rows || snake.some(s=>s.x===head.x && s.y===head.y)){
        alive = false; draw(); toast('Game over! Score: '+score); return;
      }
      snake.unshift(head);
      if(head.x===food.x && head.y===food.y){
        score += 10; q('#snake-score').textContent = 'Score: '+score; food = rndFood();
      } else {
        snake.pop();
      }
      draw();
    }
    function setDir(d){
      const opp = {l:'r', r:'l', u:'d', d:'u'};
      if(opp[d]===dir) return;
      nextDir = d;
    }
    function reset(){
      snake = [{x:6,y:7},{x:5,y:7},{x:4,y:7}];
      dir = 'r'; nextDir = 'r'; score = 0; alive = true;
      food = rndFood();
      q('#snake-score').textContent = 'Score: 0';
      draw();
      clearInterval(timer);
      timer = setInterval(tick, 160);
    }
    document.addEventListener('keydown', function handler(e){
      if(!document.body.contains(canvas)){ document.removeEventListener('keydown', handler); return; }
      if(e.key==='ArrowLeft') setDir('l'); if(e.key==='ArrowRight') setDir('r');
      if(e.key==='ArrowUp') setDir('u'); if(e.key==='ArrowDown') setDir('d');
      if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();
    });
    $$('.snake-btn', panel).forEach(b=> b.addEventListener('click', ()=> setDir(b.dataset.dir)));
    q('#snake-restart').addEventListener('click', reset);
    reset();
  }
}

/* ============================== SEARCH ============================== */
/* Used by Smart Search results to deep-link into the right resource UI:
   pyq/syllabus live as inline browsers on the Resources page; notes/lab/
   practical/books open via the popup panel (openResourcePanel). */
function openSubjectResource(type, branch, sem, subject){
  if(type === 'pyq' || type === 'syllabus'){
    showPage('resources');
    requestAnimationFrame(()=>{
      const b = document.getElementById(type+'Branch'), s = document.getElementById(type+'Sem'), sub = document.getElementById(type+'Subject');
      if(!b) return;
      b.value = branch; s.value = sem;
      buildBrowser(type+'Results', {branchSel:b, semSel:s, subjSel:sub}, type);
      if(sub){ fillSelect(sub, ['All', ...subjectsFor(Number(sem), branch)]); if([...sub.options].some(o=>o.value===subject)) sub.value = subject; }
      buildBrowser(type+'Results', {branchSel:b, semSel:s, subjSel:sub}, type);
      document.getElementById(type+'Branch').closest('.card')?.scrollIntoView({behavior:'smooth', block:'start'});
    });
  } else {
    const titles = {notes:'Notes', lab:'Lab Manual', practical:'Practical Files', books:'Important Books'};
    openResourcePanel(type, titles[type] || type, {branch, sem, subject});
  }
}

function buildSearchIndex(){
  const idx = [];
  TOOLS.forEach(t=> idx.push({label:t.name, type:'Tool', action:()=>openTool(t.id)}));
  GAMES.forEach(g=> idx.push({label:g.name, type:'Game', action:()=>openGame(g.id)}));
  GOVT_JOBS.forEach(j=> idx.push({label:j.name, type:'Govt Job', action:()=>{ showPage('jobs'); openJobDetail(j.name); }}));
  EDU_WEBSITES.forEach(w=> idx.push({label:w.name, type:'Website', action:()=>openEmbed(w.site, w.name)}));
  BLOGS.forEach(b=> idx.push({label:b.title, type:'Blog', action:()=>openBlogDetail(b.title)}));
  STUDENT_HELP.forEach(h=> idx.push({label:h.name, type:'Student Help', action:()=>openHelpDetail(h.name)}));

  // Notes / PYQs / Syllabus — every branch__sem__subject entry that has a file
  const resourceTypeLabels = {pyq:'PYQ', notes:'Notes', syllabus:'Syllabus', lab:'Lab Manual', practical:'Practical', books:'Book'};
  Object.entries(RESOURCE_FILES).forEach(([type, files])=>{
    Object.keys(files).forEach(key=>{
      const [branch, sem, subject] = key.split('__');
      idx.push({
        label: `${subject} (${branch}, Sem ${sem})`,
        type: resourceTypeLabels[type] || type,
        action: ()=> openSubjectResource(type, branch, sem, subject)
      });
    });
  });

  // Q&A Board questions
  DB.list('questions', LS.questions).then(qs=>{
    qs.forEach(q=> idx.push({label:q.text, type:'Question', action:()=> { showPage('qa'); openQuestionDetail(q.id); }}));
  }).catch(()=>{});

  return idx;
}
function initSearch(){
  const index = buildSearchIndex();
  $$('.global-search').forEach(input=>{
    const results = input.parentElement.querySelector('.search-results') || (()=>{
      const d = document.createElement('div'); d.className='search-results';
      d.style.cssText='position:absolute; margin-top:6px; background:var(--surface); border:1px solid var(--border); border-radius:12px; box-shadow:var(--shadow-lg); width:100%; max-height:260px; overflow-y:auto; z-index:60; display:none;';
      input.closest('div').style.position='relative';
      input.closest('div').appendChild(d);
      return d;
    })();
    input.addEventListener('input', ()=>{
      const v = input.value.trim().toLowerCase();
      if(!v){ results.style.display='none'; return; }
      const matches = index.filter(i=> i.label.toLowerCase().includes(v)).slice(0,8);
      results.innerHTML = matches.map((m,i)=>`<div data-i="${i}" style="padding:10px 14px; border-bottom:1px solid var(--border); cursor:pointer; font-size:.85rem; display:flex; justify-content:space-between;"><span>${m.label}</span><span class="tag">${m.type}</span></div>`).join('') || '<div style="padding:10px 14px" class="muted">No matches</div>';
      results.style.display='block';
      [...results.children].forEach((el,i)=> el.addEventListener('click', ()=>{ matches[i].action(); results.style.display='none'; input.value=''; }));
    });
    document.addEventListener('click', (e)=>{ if(!input.parentElement.contains(e.target)) results.style.display='none'; });
  });
}

/* ============================== PWA INSTALL ============================== */
let deferredPrompt;
function initPWA(){
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault(); deferredPrompt = e;
    $$('.install-btn').forEach(b=> b.style.display='inline-flex');
  });
  $$('.install-btn').forEach(b=> b.addEventListener('click', async ()=>{
    if(!deferredPrompt){ toast('App already installed or not supported here'); return; }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }));
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').catch(()=>{});
  }
}

/* ============================== PAGE ROUTER ==============================
   Every major section (Home, BEU, Resources, Jobs, Edu, Connect, Help, Tools,
   Games, Blog, Reviews, About, Donate, Premium, Privacy, Disclaimer) is its
   own "page" — a .page-section that's shown/hidden via a class, so only one
   is visible at a time (like separate pages, but with no server round-trip).

   showPage(id) also accepts an id that isn't a page itself but lives *inside*
   one (e.g. 'cgpa', 'attendance', 'resources-notes') — it finds the parent
   .page-section, opens that, then smooth-scrolls to the specific element.
   ============================================================ */
function initRouter(){
  $$('[data-page-link]').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      showPage(a.dataset.pageLink);
    });
  });
  // Back/forward browser buttons and manually-edited/shared URLs with a hash.
  window.addEventListener('hashchange', ()=>{
    const id = location.hash.replace('#','') || 'home';
    showPage(id, {pushHash:false});
  });
}

function updateActiveNav(pageId){
  $$('.nav-links a[data-page-link], .drawer a[data-page-link], .bottom-nav a[data-page-link]').forEach(a=>{
    a.classList.toggle('active', a.dataset.pageLink === pageId);
  });
}

function showPage(id, opts={}){
  const { pushHash = true } = opts;
  if(!id) id = 'home';

  let targetPageId = id;
  let subEl = null;

  // If `id` isn't itself a page, see if it's an element living inside one
  // (e.g. hero's "Upload Notes Info" links to 'resources-notes', or a tool
  // button jumps straight to 'cgpa' inside the BEU page).
  if(!document.getElementById(id) || !document.getElementById(id).classList.contains('page-section')){
    const el = document.getElementById(id);
    if(el){
      subEl = el;
      const parentPage = el.closest('.page-section');
      if(parentPage) targetPageId = parentPage.id;
    }
  }

  const target = document.getElementById(targetPageId);
  if(!target || !target.classList.contains('page-section')) return;

  $$('.page-section').forEach(p=> p.classList.remove('active'));
  target.classList.add('active');
  updateActiveNav(targetPageId);
  updateAiFabVisibility(targetPageId);
  refreshPageOnEntry(targetPageId);

  if(pushHash && location.hash.replace('#','') !== id){
    history.pushState(null, '', '#'+id);
  }

  if(subEl && subEl !== target){
    requestAnimationFrame(()=> subEl.scrollIntoView({behavior:'smooth', block:'start'}));
  } else {
    window.scrollTo({top:0, behavior:'smooth'});
  }
}

/* Some pages show data that can go stale if it's only rendered once at load
   (e.g. Profile depends on the name set on the Dashboard, which could have
   changed since). Re-render those specific pages every time you navigate in. */
function refreshPageOnEntry(pageId){
  if(pageId === 'dashboard') renderDashboard();
  if(pageId === 'quiz'){ renderQuiz(); renderQuizStatsBar(); renderLeaderboard(); }
  if(pageId === 'profile') renderProfile();
  if(pageId === 'aptitude') renderAptitude();
  if(pageId === 'word-of-day') renderWordOfDay();
  if(pageId === 'coding-challenge') renderCodingChallenge();
}

/* The floating AI button is hidden on the homepage — the hero already has
   its own "AI Doubts Solver" button and orbit icon, so the fixed FAB there
   was redundant clutter. It still shows on every other page. */
function updateAiFabVisibility(pageId){
  const fab = document.getElementById('aiFab');
  if(!fab) return;
  fab.style.display = (pageId === 'home') ? 'none' : '';
}

/* Runs once on load: opens whichever page the URL hash points to (so a
   shared/bookmarked link like beuhub.example/#jobs opens straight into that
   page), otherwise defaults to Home. */
function initialRoute(){
  const id = location.hash.replace('#','');
  if(id) showPage(id, {pushHash:false});
  else { updateActiveNav('home'); updateAiFabVisibility('home'); }
}

/* ============================== INIT ============================== */
document.addEventListener('DOMContentLoaded', ()=>{
  Theme.init();
  initNav();
  initRouter();
  initialRoute();
  renderJobs(); renderEdu(); renderSocials(); renderHelp(); renderBlogs(); renderTools(); renderGames(); renderMentorSection();
  initAttendance(); initCGPA(); initTimetable(); initReviews(); initProfessors(); initQA(); initDashboard(); initQuiz(); initProfile(); initAdminMode();
  updateLoginStreak();
  initAptitude(); initWordOfDay();
  initCodingChallenge();
  initStudyPlanner();
  initForum();
  initNotifications();
  AIChat.init();
  initSearch();
  initPWA();

  // PYQ / Syllabus browsers
  ['pyq','syllabus'].forEach(prefix=>{
    const b = document.getElementById(prefix+'Branch'), s = document.getElementById(prefix+'Sem'), sub = document.getElementById(prefix+'Subject');
    if(!b) return;
    fillSelect(b, BRANCHES); fillSelect(s, SEMESTERS);
    const run = ()=> buildBrowser(prefix+'Results', {branchSel:b, semSel:s, subjSel:sub}, prefix);
    b.addEventListener('change', run); s.addEventListener('change', run);
    run();
  });

  // Notes / Lab Manual / Practical Files / Important Books cards
  $$('#resources-notes [data-resource-open]').forEach(card=>{
    card.addEventListener('click', ()=> openResourcePanel(card.dataset.resourceOpen, card.dataset.resourceTitle));
  });

  // Premium demo toggle
  const premBtn = document.getElementById('premiumToggleBtn');
  if(premBtn){
    const setLabel = ()=>{ const p = store.get(LS.premium,false); premBtn.textContent = p ? 'Premium active — remove (demo)' : 'Simulate Premium (demo)'; document.body.classList.toggle('is-premium', p); };
    premBtn.addEventListener('click', ()=>{ store.set(LS.premium, !store.get(LS.premium,false)); setLabel(); toast(store.get(LS.premium,false)?'Premium demo enabled — ads hidden':'Premium demo disabled'); });
    setLabel();
  }

  // close panel handlers
  $('#panelOverlay').addEventListener('click', (e)=>{ if(e.target.id==='panelOverlay') closePanel(); });
  $('#panelCloseBtn').addEventListener('click', closePanel);

  // year in footer
  const y = document.getElementById('yearNow'); if(y) y.textContent = new Date().getFullYear();

  // hero AI button opens the chat
  const heroAI = document.getElementById('heroAIBtn');
  if(heroAI) heroAI.addEventListener('click', ()=> AIChat.toggle(true));

  // quick links AI button (same action as hero AI button)
  const qlinkAI = document.getElementById('qlinkAIBtn');
  if(qlinkAI) qlinkAI.addEventListener('click', ()=> AIChat.toggle(true));
});
