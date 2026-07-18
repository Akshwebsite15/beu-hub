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
  questions:'beu_questions', answers:'beu_answers'
};

/* If you set APP_SHARED_SECRET on your Worker (see worker.js / AI-SETUP.md),
   put the same value here so requests from this app are accepted. This is
   NOT a real secret — anyone can read it via "view source" — it only filters
   out casual bots/scrapers. Real protection is the Worker's origin lock and
   rate limits. Leave blank if you didn't set APP_SHARED_SECRET on the Worker. */
const APP_SHARED_SECRET = '';

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
   Sourced directly from the official BEU Group-B Sem 1 & 2 syllabus PDF
   already in this project (syllabus/btech-group-b-sem1-2-syllabus.pdf),
   parsed programmatically into individual topics. Covers the 9 subjects
   common to every branch in Semester 1 & 2. Semester 3/4 aren't included
   yet — the only source available for those was compressed phone photos
   whose text quality wasn't reliable enough to parse accurately; re-upload
   clearer photos or a PDF and this can be extended the same way. */
const SYLLABUS_TOPICS = {
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
          ? `<a class="btn btn-primary btn-sm" href="${url}" target="_blank" rel="noopener noreferrer">View</a>`
          : `<span class="tag" style="white-space:nowrap">Not uploaded yet</span>`}
      </div>
    </div>`;
  }).join('');
  $$('.tracker-open-btn', container).forEach(b=> b.addEventListener('click', ()=> openSyllabusTracker(b.dataset.subject)));
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
function openResourcePanel(type, title){
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
  const run = ()=> renderResourceList($('#rpList'), type, b.value, s.value);
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

/* ============================== RATE MY PROFESSOR ==============================
   Professors and ratings are 100% crowdsourced — students add professors and
   rate them themselves; nothing is pre-filled. Everything below is stored in
   localStorage on this device only (LS.professors / LS.profRatings). To make
   ratings visible across every student's device, this would need to be wired
   up to a shared backend (e.g. Firebase/Supabase) instead of localStorage. */
function profAverages(profId){
  const ratings = store.get(LS.profRatings, []).filter(r => r.profId === profId);
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
  const collegeSel = $('#profCollege');
  collegeSel.innerHTML = '<option value="">All colleges</option>' + BEU_COLLEGES.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  const deptSel = $('#profDept');
  deptSel.innerHTML = '<option value="">All departments</option>' + BRANCHES.map(b=>`<option value="${escapeHtml(b)}">${escapeHtml(b)}</option>`).join('');
  [collegeSel, deptSel].forEach(el=> el.addEventListener('change', renderProfessorList));
  $('#profSearch').addEventListener('input', renderProfessorList);
  $('#addProfBtn').addEventListener('click', openAddProfessorForm);
  renderProfessorList();
}
function renderProfessorList(){
  const college = $('#profCollege').value;
  const dept = $('#profDept').value;
  const search = ($('#profSearch').value || '').trim().toLowerCase();
  let all = store.get(LS.professors, []);
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

  $('#profList').innerHTML = all.map(p=>{
    const avg = profAverages(p.id);
    const stars = avg.count ? '★'.repeat(Math.round(avg.overall)) + '☆'.repeat(5-Math.round(avg.overall)) : '☆☆☆☆☆';
    return `
      <div class="card">
        <h3 style="font-size:1rem;">${escapeHtml(p.name)}</h3>
        <p class="muted" style="font-size:.78rem;">${escapeHtml(p.dept)} · ${escapeHtml(p.college)}</p>
        <p style="font-size:1.05rem; color:var(--accent);">${stars} <span class="muted" style="font-size:.78rem;">${avg.count ? avg.overall.toFixed(1)+'/5 · '+avg.count+' rating'+(avg.count===1?'':'s') : 'No ratings yet'}</span></p>
        <button class="btn btn-ghost btn-sm prof-detail-btn" data-id="${p.id}">Rate & view reviews</button>
      </div>
    `;
  }).join('');
  $$('.prof-detail-btn').forEach(b=> b.addEventListener('click', ()=> openProfessorDetail(b.dataset.id)));
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
  $('#addProfForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const name = $('#apName').value.trim();
    const college = $('#apCollege').value;
    const dept = $('#apDept').value;
    if(!name){ toast("Enter the professor's name"); return; }
    if(containsBannedContent(name)){ toast('Please keep names respectful'); return; }
    const all = store.get(LS.professors, []);
    const exists = all.some(p=> p.name.toLowerCase()===name.toLowerCase() && p.college===college && p.dept===dept);
    if(exists){ toast('This professor is already listed — search for them instead'); return; }
    const id = 'p_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
    all.unshift({id, name, college, dept, addedAt:new Date().toISOString()});
    store.set(LS.professors, all);
    closePanel();
    renderProfessorList();
    toast('Professor added — you can rate them now');
  });
}
function openProfessorDetail(profId){
  const all = store.get(LS.professors, []);
  const p = all.find(x=> x.id === profId);
  if(!p) return;
  const avg = profAverages(profId);
  const ratings = store.get(LS.profRatings, []).filter(r=> r.profId === profId).slice().reverse();

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

  $('#rateProfForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const missing = PROF_RATING_CATEGORIES.filter(c=> !selected[c.key]);
    if(missing.length){ toast('Please rate: ' + missing.map(c=>c.label).join(', ')); return; }
    const comment = $('#rpComment').value.trim();
    if(comment && containsBannedContent(comment)){ toast('Please keep your review respectful'); return; }
    const entry = {profId, date:new Date().toISOString(), comment};
    PROF_RATING_CATEGORIES.forEach(c=> entry[c.key] = selected[c.key]);
    const allRatings = store.get(LS.profRatings, []);
    allRatings.push(entry);
    store.set(LS.profRatings, allRatings);
    closePanel();
    renderProfessorList();
    toast('Thanks for rating! 🙌');
  });
}

/* ============================== QUESTION & ANSWER BOARD ==============================
   Admin (or anyone, since this static site has no login system) posts a question
   tagged by branch/semester/subject; students answer it below. Everything is stored
   in localStorage on this device only (LS.questions / LS.answers) — for answers to be
   visible across every student's device this needs a shared backend instead. */
function initQA(){
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
function renderQuestionList(){
  const branch = $('#qaBranch').value, sem = $('#qaSem').value, subject = $('#qaSubject').value;
  let all = store.get(LS.questions, []).slice().reverse();
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

  const allAnswers = store.get(LS.answers, []);
  $('#qaList').innerHTML = all.map(q=>{
    const count = allAnswers.filter(a=> a.questionId === q.id).length;
    return `
      <div class="card">
        <p class="muted" style="font-size:.74rem;">${escapeHtml(q.subject)} · ${escapeHtml(q.branch)} · Sem ${escapeHtml(q.sem)}</p>
        <h3 style="font-size:.95rem;">${escapeHtml(q.text)}</h3>
        <p class="muted" style="font-size:.78rem;">${count} answer${count===1?'':'s'}</p>
        <button class="btn btn-ghost btn-sm qa-detail-btn" data-id="${q.id}">View &amp; Answer</button>
      </div>
    `;
  }).join('');
  $$('.qa-detail-btn').forEach(b=> b.addEventListener('click', ()=> openQuestionDetail(b.dataset.id)));
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

  $('#askQForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const text = $('#aqText').value.trim();
    if(!text){ toast('Enter a question'); return; }
    if(containsBannedContent(text)){ toast('Please keep the question respectful'); return; }
    const q = {
      id: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      branch: branchSel.value, sem: semSel.value, subject: subjSel.value,
      text, date: new Date().toISOString()
    };
    const all = store.get(LS.questions, []);
    all.push(q);
    store.set(LS.questions, all);
    closePanel();
    renderQuestionList();
    toast('Question posted');
  });
}
function openQuestionDetail(qId){
  const q = store.get(LS.questions, []).find(x=> x.id === qId);
  if(!q) return;
  const answers = store.get(LS.answers, []).filter(a=> a.questionId === qId).slice().reverse();

  const answersHtml = answers.length ? answers.map(a=>`
    <div class="card mt-8" style="padding:12px;">
      <p style="font-size:.85rem;">${escapeHtml(a.text)}</p>
      <p class="muted" style="font-size:.7rem;">${new Date(a.date).toLocaleDateString()}</p>
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

  $('#answerForm').addEventListener('submit', (e)=>{
    e.preventDefault();
    const text = $('#ansText').value.trim();
    if(!text){ toast('Write an answer first'); return; }
    if(containsBannedContent(text)){ toast('Please keep your answer respectful'); return; }
    const all = store.get(LS.answers, []);
    all.push({id:'a_'+Date.now(), questionId:qId, text, date:new Date().toISOString()});
    store.set(LS.answers, all);
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
    this.render();
    this.updateStatusDot();
  },
  toggle(open){
    $('#aiChatWindow').classList.toggle('open', open);
    $('#aiFab').style.display = open ? 'none' : 'flex';
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
      <div class="msg ${m.role}">${escapeHtml(m.text)}
        ${m.role==='ai' ? `<div class="msg-actions">
          <button onclick="AIChat.copy(${i})">Copy</button>
          <button onclick="AIChat.share(${i})">Share</button>
          <button onclick="AIChat.downloadPDF(${i})">Download PDF</button>
        </div>` : ''}
      </div>
    `).join('') || `<div class="msg ai">Hey! I'm GenZ AI Tutor 👋 Ask me to explain a topic, make notes/MCQs, debug code, or plan a roadmap. Hinglish is fine too!${connected ? '' : ' <br><br>⚠️ Not connected to an AI backend yet — tap ⚙️ above to set one up (takes 5 min, free).'}</div>`;
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
    if(!text) return;
    const h = this.history();
    h.push({role:'user', text});
    this.save(h); this.render();
    input.value='';

    // typing indicator
    const body = $('#aiChatBody');
    const typing = document.createElement('div');
    typing.className = 'msg ai'; typing.id = 'aiTyping'; typing.textContent = 'Thinking…';
    body.appendChild(typing); body.scrollTop = body.scrollHeight;

    const reply = await this.getReply(text, h.slice(0,-1));
    document.getElementById('aiTyping')?.remove();

    const h2 = this.history();
    h2.push({role:'ai', text:reply});
    this.save(h2); this.render();
  },
  async getReply(prompt, historyBeforeThis){
    const endpoint = store.get(LS.aiEndpoint, '');
    if(!endpoint){
      return `I'm not connected to an AI backend yet. Tap the ⚙️ icon above to set one up — it's free and takes about 5 minutes (deploy the included Cloudflare Worker, paste its URL in). Once connected I can explain topics, write notes, generate MCQs, debug code, summarize PDFs and build roadmaps — in English or Hinglish.`;
    }
    try{
      const res = await fetch(endpoint, {
        method:'POST',
        headers:{'Content-Type':'application/json', ...(APP_SHARED_SECRET ? {'X-App-Secret': APP_SHARED_SECRET} : {})},
        body: JSON.stringify({ prompt, history: historyBeforeThis.slice(-10) })
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
function buildSearchIndex(){
  const idx = [];
  TOOLS.forEach(t=> idx.push({label:t.name, type:'Tool', action:()=>openTool(t.id)}));
  GAMES.forEach(g=> idx.push({label:g.name, type:'Game', action:()=>openGame(g.id)}));
  GOVT_JOBS.forEach(j=> idx.push({label:j.name, type:'Govt Job', action:()=>{ showPage('jobs'); openJobDetail(j.name); }}));
  EDU_WEBSITES.forEach(w=> idx.push({label:w.name, type:'Website', action:()=>openEmbed(w.site, w.name)}));
  BLOGS.forEach(b=> idx.push({label:b.title, type:'Blog', action:()=>openBlogDetail(b.title)}));
  STUDENT_HELP.forEach(h=> idx.push({label:h.name, type:'Student Help', action:()=>openHelpDetail(h.name)}));
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

  if(pushHash && location.hash.replace('#','') !== id){
    history.pushState(null, '', '#'+id);
  }

  if(subEl && subEl !== target){
    requestAnimationFrame(()=> subEl.scrollIntoView({behavior:'smooth', block:'start'}));
  } else {
    window.scrollTo({top:0, behavior:'smooth'});
  }
}

/* Runs once on load: opens whichever page the URL hash points to (so a
   shared/bookmarked link like beuhub.example/#jobs opens straight into that
   page), otherwise defaults to Home. */
function initialRoute(){
  const id = location.hash.replace('#','');
  if(id) showPage(id, {pushHash:false});
  else updateActiveNav('home');
}

/* ============================== INIT ============================== */
document.addEventListener('DOMContentLoaded', ()=>{
  Theme.init();
  initNav();
  initRouter();
  initialRoute();
  renderJobs(); renderEdu(); renderSocials(); renderHelp(); renderBlogs(); renderTools(); renderGames(); renderMentorSection();
  initAttendance(); initCGPA(); initTimetable(); initReviews(); initProfessors(); initQA();
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
