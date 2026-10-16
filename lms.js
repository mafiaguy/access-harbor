import { authClient, authIsConfigured } from './auth-client.js';

async function initializeLearnerSpace() {
const courseUrl = `${document.body.dataset.courseUrl}?v=course-content-5`;
const courseSlug = document.body.dataset.courseSlug || 'security-engineering';
document.body.dataset.authState = authIsConfigured ? 'checking' : 'preview';
if (authIsConfigured) {
  try {
    const session = await authClient.getSession();
    if (!session.data?.user) {
      window.location.replace(`/lms/start.html?course=${encodeURIComponent(courseSlug)}`);
      return;
    }
    document.body.dataset.authState = 'authenticated';
    const accountTag = document.querySelector('.lms-preview-tag');
    accountTag.textContent = `SIGNED IN · ${session.data.user.email}`;
    const disclaimer = document.querySelector('.login-disclaimer');
    disclaimer.innerHTML = '<strong>Signed in.</strong> Your course progress is currently saved in this browser.';
  } catch {
    window.location.replace(`/lms/start.html?course=${encodeURIComponent(courseSlug)}&auth=unavailable`);
    return;
  }
}
const progressKey = courseSlug === 'security-engineering'
  ? 'opentechSecurity101Progress_v1'
  : `opentechCourseProgress:${courseSlug}:v1`;
const navRoot = document.querySelector('#module-navigation');
let course;
let lessons = [];
let currentIndex = 0;
let progress = {};

try {
  progress = JSON.parse(localStorage.getItem(progressKey) || '{}');
} catch {
  localStorage.removeItem(progressKey);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function lessonId(index) {
  return `lesson-${index + 1}`;
}

function isComplete(index) {
  const state = progress[lessonId(index)] || {};
  return Boolean(state.quiz && state.scenario);
}

function completedCount() {
  return lessons.filter((_, index) => isComplete(index)).length;
}

function persist() {
  localStorage.setItem(progressKey, JSON.stringify(progress));
  renderProgress();
  renderCompletion();
}

function renderProgress() {
  const count = completedCount();
  document.querySelector('#lms-progress-label').textContent = `${count} of ${lessons.length} lessons complete`;
  document.querySelector('#lms-progress-percent').textContent = `${Math.round((count / lessons.length) * 100)}%`;
  document.querySelector('#course-progress').value = count;
  document.querySelector('#course-progress').max = lessons.length;
  navRoot.querySelectorAll('[data-lesson]').forEach((button) => {
    const index = Number(button.dataset.lesson);
    button.dataset.complete = String(isComplete(index));
    button.setAttribute('aria-current', index === currentIndex ? 'step' : 'false');
    button.setAttribute('aria-label', `${button.dataset.title}${isComplete(index) ? ', complete' : ''}`);
  });
}

function renderNotes(lesson) {
  const root = document.querySelector('#lesson-notes');
  root.replaceChildren(...lesson.notes.map((paragraph) => el('p', '', paragraph)));
}

function renderResources(lesson) {
  const root = document.querySelector('#lesson-resources');
  const resources = [...(lesson.resources || [])].sort((a, b) => {
    const rank = (item) => item.kind === 'video' ? 0 : item.kind === 'pdf' || /\.pdf(?:$|[?#])/i.test(item.url || '') ? 1 : 2;
    return rank(a) - rank(b);
  });
  root.replaceChildren();
  if (!resources.length) {
    root.append(el('p', 'resources-empty', 'The lesson notes above are the reading for this lesson. More curated sources are being added.'));
    return;
  }
  resources.forEach((resource) => {
    const card = el('article', 'resource-card');
    const isPdf = resource.kind === 'pdf' || /\.pdf(?:$|[?#])/i.test(resource.url || '');
    const kind = isPdf ? 'PDF' : resource.kind === 'video' ? 'VIDEO' : 'READING';
    card.append(el('div', 'resource-kind', `${kind} · ${resource.provider}`));
    card.append(el('h3', '', resource.title));
    card.append(el('p', '', resource.summary));
    let videoEmbed = resource.embed;
    if (!videoEmbed && resource.kind === 'video') {
      const youtubePlaylistId = resource.url?.match(/[?&]list=([\w-]+)/)?.[1];
      const youtubeId = resource.url?.match(/(?:youtube\.com\/(?:watch\?.*v=|embed\/)|youtu\.be\/)([\w-]{11})/)?.[1];
      if (youtubePlaylistId) videoEmbed = `https://www.youtube-nocookie.com/embed/videoseries?list=${youtubePlaylistId}`;
      else if (youtubeId) videoEmbed = `https://www.youtube-nocookie.com/embed/${youtubeId}`;
      const vimeoId = resource.url?.match(/vimeo\.com\/(\d+)/)?.[1];
      if (!videoEmbed && vimeoId) videoEmbed = `https://player.vimeo.com/video/${vimeoId}`;
    }
    if (isPdf) {
      const frame = el('iframe', 'resource-pdf');
      frame.src = resource.embed || resource.url;
      frame.title = `${resource.title} PDF viewer`;
      frame.loading = 'lazy';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      card.append(frame);
      card.append(el('p', 'resource-viewer-help', 'If the document viewer is blank, use the publisher link below to open or download the PDF.'));
    } else if (videoEmbed) {
      const frame = el('iframe', 'resource-video');
      frame.src = videoEmbed;
      frame.title = resource.title;
      frame.loading = 'lazy';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.allow = 'accelerometer; encrypted-media; picture-in-picture; web-share';
      frame.allowFullscreen = true;
      card.append(frame);
    } else if (resource.kind === 'video') {
      card.append(el('p', 'resource-viewer-help', 'This publisher does not provide an embeddable player for this link. Use the publisher link below to watch.'));
    } else {
      const viewer = el('details', 'resource-reading-viewer');
      const summary = el('summary', '', 'Read in this lesson');
      const frame = el('iframe', 'resource-reading-frame');
      frame.src = resource.url;
      frame.title = `${resource.title} reading`;
      frame.loading = 'lazy';
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups');
      viewer.append(summary, frame, el('p', 'resource-viewer-help', 'Some publishers block embedded pages. If the article does not load here, use the publisher link below.'));
      card.append(viewer);
    }
    const link = el('a', 'resource-link', isPdf ? 'Open publisher PDF ↗' : resource.kind === 'video' ? 'Open video resource ↗' : 'Open publisher reading ↗');
    link.href = resource.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${link.textContent}: ${resource.title}`);
    card.append(link);
    root.append(card);
  });
}

function renderVideo(lesson) {
  const panel = document.querySelector('#video-panel');
  const root = document.querySelector('#video-frame-wrap');
  root.replaceChildren();
  panel.hidden = !lesson.video;
  if (!lesson.video) return;
  const frame = el('iframe', 'lesson-video');
  frame.src = lesson.video.embed;
  frame.title = lesson.video.title;
  frame.loading = 'lazy';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allow = 'accelerometer; encrypted-media; picture-in-picture; web-share';
  frame.allowFullscreen = true;
  root.append(frame);
  document.querySelector('#video-attribution').textContent = `${lesson.video.title} · ${lesson.video.provider}`;
}

function markStep(step) {
  const state = progress[lessonId(currentIndex)] || {};
  state[step] = true;
  progress[lessonId(currentIndex)] = state;
  persist();
}

function feedbackNode(className) {
  const feedback = el('p', className);
  feedback.setAttribute('aria-live', 'polite');
  return feedback;
}

function renderQuiz(lesson) {
  const root = document.querySelector('#quiz-content');
  root.replaceChildren();
  const form = el('form', 'quiz-form');
  form.append(el('p', 'quiz-question', lesson.quiz.question));
  const options = el('div', 'quiz-options');
  lesson.quiz.options.forEach((answer, index) => {
    const label = el('label', 'quiz-option');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'lesson-answer';
    input.value = String(index);
    input.required = true;
    label.append(input, el('span', '', answer));
    options.append(label);
  });
  const submit = el('button', 'button button-dark quiz-submit', 'Check my answer');
  submit.type = 'submit';
  const feedback = feedbackNode('quiz-feedback');
  if (progress[lessonId(currentIndex)]?.quiz) {
    feedback.textContent = 'You passed this check already. You can try it again or continue.';
    feedback.dataset.state = 'correct';
  }
  form.append(options, submit, feedback);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const selected = form.querySelector('input:checked');
    if (!selected) return;
    const correct = Number(selected.value) === lesson.quiz.answer;
    feedback.textContent = `${correct ? 'Correct. ' : 'Not quite. '}${lesson.quiz.explanation}`;
    feedback.dataset.state = correct ? 'correct' : 'try-again';
    if (correct) markStep('quiz');
  });
  root.append(form);
}

function renderScenarioPractice(practice, root) {
  root.append(el('p', 'practice-prompt', practice.prompt));
  const form = el('form', 'scenario-form');
  const options = el('div', 'quiz-options');
  practice.options.forEach((answer, index) => {
    const label = el('label', 'quiz-option');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'scenario-answer';
    input.value = String(index);
    input.required = true;
    label.append(input, el('span', '', answer));
    options.append(label);
  });
  const submit = el('button', 'button button-dark practice-submit', 'Try this decision');
  submit.type = 'submit';
  const feedback = feedbackNode('practice-feedback');
  if (progress[lessonId(currentIndex)]?.practice) {
    feedback.textContent = 'You completed this activity already. You can try it again or continue.';
    feedback.dataset.state = 'correct';
  }
  form.append(options, submit, feedback);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const selected = form.querySelector('input:checked');
    if (!selected) return;
    const correct = Number(selected.value) === practice.answer;
    feedback.textContent = `${correct ? 'That’s the safer choice. ' : 'Try again. '}${practice.explanation}`;
    feedback.dataset.state = correct ? 'correct' : 'try-again';
    if (correct) {
      markStep('scenario');
    }
  });
  root.append(form);
}

function renderAccessPractice(practice, root) {
  root.append(el('p', 'practice-prompt', practice.prompt));
  const lab = el('div', 'access-lab');
  lab.append(el('div', 'mock-app-bar', 'SIMULATED APP · NO REQUESTS OR DATA'));
  lab.append(el('h3', 'mock-app-title', 'Project archive'));
  lab.append(el('p', 'mock-app-copy', 'This archive is for administrators. First test the vulnerable role check, then apply the server-side permission check.'));
  const roleLabel = el('label', 'field-label', 'Role the browser claims');
  const role = document.createElement('select');
  role.className = 'practice-select';
  [['learner', 'Learner'], ['admin', 'Admin (change this claim)']].forEach(([value, label]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    role.append(option);
  });
  roleLabel.append(role);
  const checkLabel = el('label', 'server-check');
  const serverCheck = document.createElement('input');
  serverCheck.type = 'checkbox';
  checkLabel.append(serverCheck, el('span', '', 'Apply the fix: check the account’s real permission on the server'));
  const request = el('button', 'button button-dark practice-submit', 'Request archive access');
  request.type = 'button';
  const result = feedbackNode('lab-result');
  if (progress[lessonId(currentIndex)]?.practice) {
    result.textContent = 'You completed this activity already. Try the simulation again, or continue to the next lesson.';
    result.dataset.state = 'correct';
  }
  request.addEventListener('click', () => {
    if (role.value === 'admin' && !serverCheck.checked) {
      result.textContent = 'The vulnerable app granted access. It trusted a role value controlled by the browser. Turn on the server-side check and try again.';
      result.dataset.state = 'try-again';
      return;
    }
    if (serverCheck.checked) {
      result.textContent = 'Access denied as intended. The simulated server used the account’s real learner permission. Activity complete.';
      result.dataset.state = 'correct';
      markStep('scenario');
      return;
    }
    result.textContent = 'Access denied for a learner. Change the browser claim to Admin to expose the flaw, then apply the server-side check.';
    result.dataset.state = 'neutral';
  });
  lab.append(roleLabel, checkLabel, request, result);
  root.append(lab);
}

function renderPractice(lesson) {
  const root = document.querySelector('#practice-content');
  root.replaceChildren();
  root.append(el('p', 'practice-title', lesson.practice.title));
  if (lesson.practice.type === 'access-control') renderAccessPractice(lesson.practice, root);
  else renderScenarioPractice(lesson.practice, root);
}

function renderCompletion() {
  const complete = isComplete(currentIndex);
  const message = document.querySelector('#lesson-complete-message');
  message.hidden = !complete;
  message.textContent = complete ? 'Lesson complete. You can continue whenever you’re ready.' : '';
  const finalLesson = currentIndex === lessons.length - 1;
  const courseComplete = finalLesson && completedCount() === lessons.length;
  const certificatePanel = document.querySelector('#certificate-panel');
  if (certificatePanel) {
    certificatePanel.hidden = completedCount() !== lessons.length;
    if (!certificatePanel.dataset.ready) {
      certificatePanel.innerHTML = `<div class="section-step">OPTIONAL CERTIFICATE</div><h2>Course complete. Want a certificate?</h2><p>Your course learning stays free. A certificate can be purchased after completion, then issued with a unique verification page. Checkout and verified completion are not connected in this preview, so certificates cannot be purchased or issued yet.</p><button class="button button-dark" type="button" disabled aria-describedby="certificate-status">Certificate checkout is being set up</button><p id="certificate-status" class="certificate-status">We’ll enable checkout once your completion is saved to your account and payment is confirmed securely.</p>`;
      certificatePanel.dataset.ready = 'true';
    }
  }
  document.querySelector('#next-lesson').disabled = !complete || finalLesson;
  document.querySelector('#next-lesson').textContent = finalLesson ? (courseComplete ? 'Course complete ✓' : 'Final lesson') : 'Continue to next lesson →';
  document.querySelector('#previous-lesson').disabled = currentIndex === 0;
  document.querySelector('#lesson-next-help').textContent = complete
    ? (finalLesson ? 'You’ve reached the end of the course.' : 'This lesson is done. Continue when you’re ready.')
    : 'To continue, pass the quick check and complete the practice activity.';
  if (currentIndex === lessons.length - 1 && completedCount() === lessons.length) {
        message.textContent = `You completed ${course.title}. You can review any lesson or explore the next course in your learning path.`;
  }
}

function renderLesson(index) {
  currentIndex = Math.max(0, Math.min(index, lessons.length - 1));
  progress.lastOpenedLesson = currentIndex;
  localStorage.setItem(progressKey, JSON.stringify(progress));
  const { unit, lesson } = lessons[currentIndex];
  document.querySelector('#lesson-kicker').textContent = `LESSON ${String(currentIndex + 1).padStart(2, '0')} OF ${lessons.length}`;
  document.querySelector('#lesson-duration').textContent = lesson.duration.toUpperCase();
  document.querySelector('#unit-title').textContent = unit.title.toUpperCase();
  document.querySelector('#lesson-title').textContent = lesson.title;
  document.querySelector('#lesson-summary').textContent = lesson.summary;
  renderNotes(lesson);
  renderResources(lesson);
  renderVideo(lesson);
  renderQuiz(lesson);
  renderPractice(lesson);
  renderProgress();
  renderCompletion();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderNavigation() {
  navRoot.replaceChildren(...course.units.map((unit, unitIndex) => {
    const group = el('section', 'course-map-unit');
    group.append(el('h3', '', unit.title));
    const list = el('ol', 'course-map-lessons');
    unit.lessons.forEach((lesson, lessonIndex) => {
      const index = course.units.slice(0, unitIndex).reduce((sum, item) => sum + item.lessons.length, 0) + lessonIndex;
      const item = el('li');
      const button = el('button', 'course-map-link');
      button.type = 'button';
      button.dataset.lesson = String(index);
      button.dataset.title = lesson.title;
      button.append(el('span', 'course-map-number', String(index + 1).padStart(2, '0')), el('span', 'course-map-title', lesson.title));
      button.addEventListener('click', () => renderLesson(index));
      item.append(button);
      list.append(item);
    });
    group.append(list);
    return group;
  }));
}

document.querySelector('#previous-lesson').addEventListener('click', () => renderLesson(currentIndex - 1));
document.querySelector('#next-lesson').addEventListener('click', () => {
  if (isComplete(currentIndex) && currentIndex < lessons.length - 1) renderLesson(currentIndex + 1);
});

fetch(courseUrl, { cache: 'no-store' })
  .then((response) => {
    if (!response.ok) throw new Error('Course content could not be loaded.');
    return response.json();
  })
  .then((data) => {
    course = data;
    lessons = course.units.flatMap((unit) => unit.lessons.map((lesson) => ({ unit, lesson })));
    document.title = `${course.title} learning space — OpenTech Academy`;
    document.querySelector('#lms-course-title').textContent = course.title;
    document.querySelector('#lms-course-meta').textContent = `${lessons.length} lessons · ${course.estimatedDuration || course.duration || 'self-paced'}`;
    const savedIndex = Math.min(Number(progress.lastOpenedLesson || 0), lessons.length - 1);
    renderNavigation();
    renderLesson(savedIndex);
  })
  .catch(() => {
    document.querySelector('#lesson-summary').textContent = 'The lesson data could not be loaded. Refresh the page to try again.';
  });
}

initializeLearnerSpace();
