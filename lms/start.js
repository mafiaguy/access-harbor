import { authClient, authIsConfigured } from '../auth-client.js';

const availableCourses = new Set([
  'security-engineering',
  'computer-systems-foundations',
  'cloud-engineering',
  'site-reliability-engineering',
  'devops-deployment',
]);

const courseSlug = new URLSearchParams(window.location.search).get('course');
const title = document.querySelector('#start-course-title');
const description = document.querySelector('#start-course-description');
const label = document.querySelector('#start-course-label');
const back = document.querySelector('#start-course-back');
const signInForm = document.querySelector('#sign-in-form');
const signUpForm = document.querySelector('#sign-up-form');
const authMessage = document.querySelector('#auth-message');
const setupMessage = document.querySelector('#auth-setup-message');
const signInModeButton = document.querySelector('#show-sign-in');
const signUpModeButton = document.querySelector('#show-sign-up');

function setAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.dataset.state = isError ? 'error' : 'success';
}

function setAuthMode(mode) {
  const signUp = mode === 'sign-up';
  signInForm.hidden = signUp;
  signUpForm.hidden = !signUp;
  signInModeButton.classList.toggle('is-active', !signUp);
  signUpModeButton.classList.toggle('is-active', signUp);
  signInModeButton.setAttribute('aria-pressed', String(!signUp));
  signUpModeButton.setAttribute('aria-pressed', String(signUp));
  setAuthMessage('');
}

function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function authErrorMessage(error) {
  return error?.message || 'Sign-in could not be completed. Check your details and try again.';
}

async function redirectIfSignedIn(coursePath) {
  if (!authIsConfigured) {
    setupMessage.innerHTML = '<strong>Sign-in setup is incomplete.</strong> The course preview is not a real account login.';
    setAuthMessage('Authentication is not configured for this site yet.', true);
    signInForm.querySelector('button[type="submit"]').disabled = true;
    signUpForm.querySelector('button[type="submit"]').disabled = true;
    return;
  }
  try {
    const session = await authClient.getSession();
    if (session.data?.user) window.location.replace(coursePath);
  } catch {
    setAuthMessage('Could not reach the sign-in service. Please try again shortly.', true);
  }
}

signInModeButton.addEventListener('click', () => setAuthMode('sign-in'));
signUpModeButton.addEventListener('click', () => setAuthMode('sign-up'));

signInForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!signInForm.reportValidity()) return;
  const submit = signInForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  setAuthMessage('Signing in…');
  try {
    const result = await authClient.signIn.email(formValues(signInForm));
    if (result.error) throw result.error;
    window.location.assign(`/lms/${courseSlug}/`);
  } catch (error) {
    setAuthMessage(authErrorMessage(error), true);
    submit.disabled = false;
  }
});

signUpForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!signUpForm.reportValidity()) return;
  const submit = signUpForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  setAuthMessage('Creating your account…');
  try {
    const result = await authClient.signUp.email(formValues(signUpForm));
    if (result.error) throw result.error;
    window.location.assign(`/lms/${courseSlug}/`);
  } catch (error) {
    setAuthMessage(authErrorMessage(error), true);
    submit.disabled = false;
  }
});

async function loadStartPage() {
  if (!availableCourses.has(courseSlug)) {
    title.textContent = 'Choose a course to continue.';
    description.textContent = 'Browse the course catalog and select the learning path you want to start.';
    signInForm.hidden = true;
    signUpForm.hidden = true;
    signInModeButton.hidden = true;
    signUpModeButton.hidden = true;
    back.href = '/#courses';
    return;
  }

  const coursePath = `/courses/${courseSlug}/`;
  back.href = coursePath;
  try {
    const response = await fetch(`/courses/${courseSlug}/course.json`);
    if (!response.ok) throw new Error('Course details are unavailable.');
    const course = await response.json();
    const lessonCount = course.units.reduce((total, unit) => total + unit.lessons.length, 0);
    label.textContent = `${course.title} · COURSE PREVIEW`;
    title.textContent = `Start ${course.title}.`;
    description.textContent = `${lessonCount} guided lessons with curated videos, readings, PDFs, and practice. Your progress stays in this browser.`;
    await redirectIfSignedIn(`/lms/${courseSlug}/`);
  } catch (error) {
    console.error('Could not initialize the course sign-in page.', error);
    title.textContent = 'This course could not be opened.';
    description.textContent = 'Return to the course page and try again.';
    setAuthMessage('The course details could not be loaded. Please return to the course page and try again.', true);
    signInForm.hidden = true;
    signUpForm.hidden = true;
    signInModeButton.hidden = true;
    signUpModeButton.hidden = true;
    back.href = coursePath;
  }
}

loadStartPage();
